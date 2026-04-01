require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();

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

app.use(express.json({ limit: '20mb' })); // base64 images can be large

// ── Rate limiters ─────────────────────────────────────────────────────────────
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 photo analyses per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests — please wait before analysing another photo.' } }
});

const configLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 config fetches per minute per IP (page reloads)
  standardHeaders: true,
  legacyHeaders: false
});

const restaurantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// ── Allowed image MIME types ───────────────────────────────────────────────────
const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

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

  // Input validation
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
            { type: 'text', text: 'Identify all food items in this image. Return ONLY a valid JSON array, no other text:\n[{"icon":"emoji","name":"food name","kcal":number,"carbs":number,"protein":number,"fat":number,"unit":"serving description"}]\nEstimate realistic calories for the portion you can see. If no food visible, return [].' }
          ]
        }]
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[analyze-food]', err.message);
    res.status(500).json({ error: { message: 'Failed to contact Anthropic API' } });
  }
});

// ── Restaurant food search (Nutritionix proxy) ────────────────────────────────
// Set NUTRITIONIX_APP_ID and NUTRITIONIX_API_KEY in your .env to enable.
// Free tier: 500 req/day at developer.nutritionix.com
app.get('/api/search-restaurant', restaurantLimiter, async (req, res) => {
  const query = (req.query.q ?? '').toString().trim();
  if (!query) return res.json({ items: [] });

  const appId  = process.env.NUTRITIONIX_APP_ID;
  const apiKey = process.env.NUTRITIONIX_API_KEY;

  if (!appId || !apiKey) {
    return res.status(503).json({ error: 'Restaurant search not configured. Set NUTRITIONIX_APP_ID and NUTRITIONIX_API_KEY.' });
  }

  try {
    const response = await fetch(
      `https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(query)}&branded=true&common=false&branded_type=1`,
      { headers: { 'x-app-id': appId, 'x-app-key': apiKey, 'x-remote-user-id': '0' } }
    );
    if (!response.ok) return res.json({ items: [] });
    const data = await response.json();

    const items = (data.branded ?? []).slice(0, 25).map((item) => ({
      name: item.food_name,
      brand: item.brand_name,
      kcal: Math.round(item.nf_calories ?? 0),
      protein: Math.round(item.nf_protein ?? 0),
      carbs: Math.round(item.nf_total_carbohydrate ?? 0),
      fat: Math.round(item.nf_total_fat ?? 0),
      fiber: Math.round(item.nf_dietary_fiber ?? 0),
      sugar: Math.round(item.nf_sugars ?? 0),
      sodium: Math.round(item.nf_sodium ?? 0),
      serving: item.serving_qty + ' ' + item.serving_unit,
    }));
    res.json({ items });
  } catch (err) {
    console.error('[search-restaurant]', err.message);
    res.json({ items: [] });
  }
});

// ── Static app ────────────────────────────────────────────────────────────────
// Registered AFTER all /api routes so the wildcard does not intercept them.
const fs = require('fs');
const distDir  = path.join(__dirname, 'dist');
const distIndex = path.join(distDir, 'index.html');
const legacyIndex = path.join(__dirname, 'index.html');
const fallbackIndex = path.join(__dirname, 'dagnara.html');

if (fs.existsSync(distIndex)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(distIndex));
} else if (fs.existsSync(legacyIndex)) {
  app.get('/', (req, res) => res.sendFile(legacyIndex));
} else {
  app.get('/', (req, res) => res.sendFile(fallbackIndex));
}

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
