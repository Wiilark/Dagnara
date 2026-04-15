require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();

// ── Stripe client (lazy — only errors when routes are actually called) ─────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// ── Supabase admin client for webhook (service role key bypasses RLS) ──────────
let supabaseAdmin = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Trust proxy — required for correct IP in rate limiters behind load balancers
app.set('trust proxy', 1);

// ── HTTPS enforcement in production ──────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(301, `https://${req.headers.host}${req.url}`);
  });
}

// ── Stripe webhook — MUST be before express.json() ────────────────────────────
// Stripe requires the raw request body to verify the signature.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe-webhook] signature verify failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature invalid' });
  }

  // Merge subscription fields into profile_data without overwriting user data
  async function syncSubscription(customerId, status, subscriptionId, periodEnd) {
    if (!supabaseAdmin) {
      console.warn('[stripe-webhook] SUPABASE_SERVICE_KEY not set — skipping DB update');
      return;
    }
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const email = customer.deleted ? null : customer.email;
      if (!email) return;

      const { data: row } = await supabaseAdmin
        .from('dagnara_profiles')
        .select('profile_data')
        .eq('email', email)
        .maybeSingle();

      await supabaseAdmin
        .from('dagnara_profiles')
        .upsert({
          email,
          profile_data: {
            ...(row?.profile_data ?? {}),
            stripeCustomerId: customerId,
            subscriptionId,
            subscriptionStatus: status,
            subscriptionPeriodEnd: periodEnd,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' });
    } catch (err) {
      console.error('[stripe-webhook] syncSubscription failed:', err.message);
    }
  }

  const obj = event.data.object;
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const end = new Date(obj.current_period_end * 1000).toISOString();
      await syncSubscription(obj.customer, obj.status, obj.id, end);
      break;
    }
    case 'customer.subscription.deleted':
      await syncSubscription(obj.customer, 'canceled', obj.id, null);
      break;
    case 'invoice.payment_failed':
      await syncSubscription(obj.customer, 'past_due', obj.subscription, null);
      break;
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '10mb' })); // base64 images can be large

// ── Rate limiters ─────────────────────────────────────────────────────────────
// NOTE: email-keyed limiters use the body email as a convenience for shared IPs.
// This is intentionally NOT treated as an auth check — it just reduces collateral
// blocking on carrier NAT / office WiFi. Real auth is enforced by Supabase RLS.
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.email ?? req.ip),
  message: { error: { message: 'Too many requests — please wait before analysing another photo.' } }
});

// Separate limiter for text AI estimation — shares the same abuse profile as
// photo analysis but must not share the bucket (they're independent features).
const estimateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.email ?? req.ip),
  message: { error: { message: 'Too many AI requests — please wait a moment.' } }
});

const configLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const stripeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests.' } }
});

// ── SSRF guard — block requests to private / loopback / link-local ranges ─────
function isPrivateUrl(urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return true; }
  const host = parsed.hostname;
  // Reject loopback, private RFC-1918, link-local (AWS metadata), and IPv6 equivalents
  const blocked = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,           // AWS/GCP instance metadata
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^0\.0\.0\.0$/,
    /^localhost$/i,
  ];
  return blocked.some(re => re.test(host));
}

// ── Allowed image MIME types ───────────────────────────────────────────────────
const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// ── Anthropic call helper — enforces a 20s timeout on every API call ──────────
async function callAnthropic(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Config endpoint ───────────────────────────────────────────────────────────
// Returns only the Supabase anon key (public by design) so it's not hardcoded
// in the HTML file. Never expose ANTHROPIC_API_KEY here.
app.get('/api/config', configLimiter, (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    return res.status(503).json({ error: 'Server config not set' });
  }
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY
  });
});

// ── Food photo analysis proxy ────────────────────────────────────────────────
// Anthropic API key stays on the server — never sent to the browser.
app.post('/api/analyze-food', analyzeLimiter, async (req, res) => {
  const { imageData, mediaType } = req.body;

  if (!imageData || !mediaType) {
    return res.status(400).json({ error: { message: 'imageData and mediaType are required' } });
  }
  if (!VALID_IMAGE_TYPES.has(mediaType)) {
    return res.status(400).json({ error: { message: 'Invalid image type. Use JPEG, PNG, GIF, or WebP.' } });
  }
  if (typeof imageData !== 'string' || imageData.length > 15_000_000) {
    return res.status(400).json({ error: { message: 'Image too large. Please use a smaller photo.' } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: { message: 'Food detection not configured on this server' } });
  }

  try {
    const response = await callAnthropic({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      temperature: 0,
      system: [{
        type: 'text',
        text: 'You are a nutrition analysis assistant. Return ONLY valid JSON arrays — no prose, no markdown. Format:\n[{"icon":"emoji","name":"food name","kcal":number,"carbs":number,"protein":number,"fat":number,"unit":"serving description","weight_g":estimated_grams_number,"per100":{"kcal":number,"carbs":number,"protein":number,"fat":number}}]\nEstimate realistic macros and portion weight for visible servings. weight_g is the estimated grams for the visible portion. per100 is per 100g. Return [] if no food.',
        cache_control: { type: 'ephemeral' }
      }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: 'List all food items in this image.' }
        ]
      }]
    });

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: { message: data.error.message ?? 'AI service error' } });
    const text = data?.content?.[0]?.text ?? '';
    let items = [];
    try { const p = JSON.parse(text); items = Array.isArray(p) ? p : []; } catch { items = []; }
    res.json({ items });
  } catch (err) {
    console.error('[analyze-food]', err.message);
    const msg = err.name === 'AbortError' ? 'Request timed out — please try again.' : 'Failed to contact Anthropic API';
    res.status(500).json({ error: { message: msg } });
  }
});


// ── Recipe URL import ─────────────────────────────────────────────────────────
const recipeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.email ?? req.ip) as string,
  message: { error: { message: 'Too many recipe imports — please wait a moment.' } }
});

app.post('/api/import-recipe', recipeLimiter, async (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: { message: 'url is required' } });
  }
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: { message: 'Invalid URL' } }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: { message: 'Only http/https URLs are supported' } });
  }
  if (isPrivateUrl(url)) {
    return res.status(400).json({ error: { message: 'URL not allowed' } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: { message: 'Recipe import not configured on this server' } });
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DagnaraBot/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(t);
    const html = await pageRes.text();

    // Extract structured recipe data first (JSON-LD), fall back to stripped text
    let recipeText = '';
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      recipeText = jsonLdMatch[1].trim().slice(0, 3000);
    } else {
      recipeText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 3000);
    }

    const response = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      temperature: 0,
      system: [{
        type: 'text',
        text: 'You are a nutrition extraction assistant. Return ONLY valid JSON — no prose, no markdown. Format:\n{"name":"recipe name","servings":number,"items":[{"icon":"emoji","name":"ingredient","kcal":number,"carbs":number,"protein":number,"fat":number,"unit":"per serving"}]}\nEstimate realistic macros per serving if not provided.',
        cache_control: { type: 'ephemeral' }
      }],
      messages: [{
        role: 'user',
        content: `Extract this recipe:\n\n${recipeText}`
      }]
    });

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: { message: data.error.message ?? 'AI service error' } });
    const responseText = data?.content?.[0]?.text ?? '';
    let recipe = { name: 'Imported Recipe', servings: 1, items: [] };
    try { const p = JSON.parse(responseText); if (p && typeof p === 'object' && !Array.isArray(p)) recipe = p; } catch {}
    res.json(recipe);
  } catch (err) {
    console.error('[import-recipe]', err.message);
    res.status(500).json({ error: { message: 'Failed to fetch or parse recipe' } });
  }
});

// ── AI text nutrition estimation ─────────────────────────────────────────────
app.post('/api/estimate-nutrition', estimateLimiter, async (req, res) => {
  const { description } = req.body ?? {};
  if (!description || typeof description !== 'string' || description.trim().length < 2) {
    return res.status(400).json({ error: { message: 'description is required' } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: { message: 'AI estimation not configured on this server' } });
  }

  try {
    const response = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 0,
      system: [{
        type: 'text',
        text: 'You are a nutrition estimation assistant. Return ONLY valid JSON arrays — no prose, no markdown. Given a food description in natural language, return estimated nutrition. Format:\n[{"icon":"emoji","name":"food name","kcal":number,"carbs":number,"protein":number,"fat":number,"unit":"serving description"}]\nReturn [] if you cannot estimate. Never explain, just return JSON.',
        cache_control: { type: 'ephemeral' }
      }],
      messages: [{ role: 'user', content: `Estimate nutrition for: ${description.trim().slice(0, 500)}` }]
    });

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: { message: data.error.message ?? 'AI service error' } });
    const text = data?.content?.[0]?.text ?? '';
    let items = [];
    try { const p = JSON.parse(text); items = Array.isArray(p) ? p : []; } catch { items = []; }
    res.json({ items });
  } catch (err) {
    console.error('[estimate-nutrition]', err.message);
    const msg = err.name === 'AbortError' ? 'Request timed out — please try again.' : 'Failed to contact Anthropic API';
    res.status(500).json({ error: { message: msg } });
  }
});

// ── AI meal planner ───────────────────────────────────────────────────────────
const mealPlanLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.email ?? req.ip),
  message: { error: { message: 'Meal plan limit reached — please wait 5 minutes.' } }
});

app.post('/api/meal-plan', mealPlanLimiter, async (req, res) => {
  const { calorieGoal, weightGoal, dietPreference, allergies, days = 7, recentFoods = [] } = req.body ?? {};
  if (!calorieGoal || typeof calorieGoal !== 'number') {
    return res.status(400).json({ error: { message: 'calorieGoal is required' } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: { message: 'Meal planning not configured on this server' } });
  }

  const context = [
    `Calorie goal: ${calorieGoal} kcal/day`,
    weightGoal ? `Weight goal: ${weightGoal}` : null,
    dietPreference ? `Diet preference: ${dietPreference}` : null,
    (Array.isArray(allergies) && allergies.length > 0) ? `Allergies/avoid: ${allergies.join(', ')}` : null,
    (Array.isArray(recentFoods) && recentFoods.length > 0) ? `Foods user has recently logged: ${recentFoods.slice(0, 20).join(', ')}` : null,
  ].filter(Boolean).join('\n');

  try {
    const response = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.7,
      system: [{
        type: 'text',
        text: 'You are a meal planning assistant. Return ONLY valid JSON — no prose, no markdown. Create a meal plan with this structure:\n{"days":[{"day":"Monday","meals":{"breakfast":{"name":"meal name","kcal":number,"icon":"emoji","description":"brief description"},"lunch":{same},"dinner":{same},"snack":{same}},"totalKcal":number}],"tips":["tip1","tip2","tip3"]}\nMake realistic, varied, nutritious meals. Match the calorie goal closely.',
        cache_control: { type: 'ephemeral' }
      }],
      messages: [{ role: 'user', content: `Create a ${days}-day meal plan:\n${context}` }]
    });

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: { message: data.error.message ?? 'AI service error' } });
    const text = data?.content?.[0]?.text ?? '';
    let plan = { days: [], tips: [] };
    try {
      // Strip markdown code fences if present
      const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      const p = JSON.parse(clean);
      if (p && typeof p === 'object' && !Array.isArray(p)) plan = p;
    } catch {}
    res.json(plan);
  } catch (err) {
    console.error('[meal-plan]', err.message);
    const msg = err.name === 'AbortError' ? 'Request timed out — please try again.' : 'Failed to generate meal plan';
    res.status(500).json({ error: { message: msg } });
  }
});

// ── AI Nutrition Coach ────────────────────────────────────────────────────────
const coachLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.email ?? req.ip),
  message: { error: { message: 'Too many messages — please wait a moment.' } }
});

app.post('/api/coach', coachLimiter, async (req, res) => {
  const { messages, context } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages is required' } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: { message: 'AI coach not configured on this server' } });
  }

  const validMessages = messages
    .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
    .slice(-20)
    .map((msg) => ({ role: msg.role, content: String(msg.content).slice(0, 2000) }));

  if (validMessages.length === 0 || validMessages[validMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: { message: 'Last message must be from user' } });
  }

  const systemPrompt = [
    'You are a friendly, knowledgeable personal nutrition coach for the Dagnara health app.',
    'Give concise, practical, science-backed advice. Keep responses under 3 short paragraphs unless a detailed breakdown is explicitly requested.',
    'Focus on nutrition, macros, meal ideas, hydration, and healthy habits. Be encouraging and specific.',
    typeof context === 'string' && context ? `\nUser profile:\n${context.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: validMessages,
    });

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: { message: data.error.message ?? 'AI service error' } });
    const reply = data?.content?.[0]?.text ?? 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (err) {
    console.error('[coach]', err.message);
    const msg = err.name === 'AbortError' ? 'Request timed out — please try again.' : 'Failed to contact Anthropic API';
    res.status(500).json({ error: { message: msg } });
  }
});

// ── Stripe: Create checkout session ──────────────────────────────────────────
app.post('/api/stripe/create-checkout-session', stripeLimiter, async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: { message: 'Stripe not configured on this server' } });
  }

  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: { message: 'email is required' } });
  }

  try {
    // Find or create Stripe customer for this email
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0] ?? await stripe.customers.create({ email });

    const publicUrl = process.env.PUBLIC_URL ?? 'https://9ysummpd.up.railway.app';
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${publicUrl}/premium-success`,
      cancel_url: `${publicUrl}/premium-cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session]', err.message);
    res.status(500).json({ error: { message: 'Failed to create checkout session' } });
  }
});

// ── Stripe: Customer portal (manage / cancel subscription) ───────────────────
app.post('/api/stripe/portal-session', stripeLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: { message: 'Stripe not configured on this server' } });
  }

  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: { message: 'email is required' } });
  }

  try {
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0];
    if (!customer) {
      return res.status(404).json({ error: { message: 'No subscription found for this account' } });
    }

    const publicUrl = process.env.PUBLIC_URL ?? 'https://9ysummpd.up.railway.app';
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${publicUrl}/premium-success`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[portal-session]', err.message);
    res.status(500).json({ error: { message: 'Failed to create portal session' } });
  }
});

// ── Stripe redirect pages ─────────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
app.get('/premium-success', (req, res) => res.sendFile(path.join(publicDir, 'premium-success.html')));
app.get('/premium-cancel',  (req, res) => res.sendFile(path.join(publicDir, 'premium-cancel.html')));

// ── Landing page ──────────────────────────────────────────────────────────────
// Registered AFTER all /api routes so the wildcard does not intercept them.
const landingIndex = path.join(__dirname, 'index.html');
app.get('/', (req, res) => res.sendFile(landingIndex));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[server]', err.message);
  res.status(500).json({ error: { message: 'Internal server error' } });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dagnara running at http://localhost:${PORT}`);
});
