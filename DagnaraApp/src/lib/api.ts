// Points to the deployed Express backend (server.js in the repo root).
// Deploy that server to Railway / Render / Fly.io, then set:
//   EXPO_PUBLIC_API_URL=https://your-deployed-url.com
// in your .env (dev) and EAS secrets (production).
// Until deployed, food photo analysis will show a "not available" message.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

// Default timeout for AI calls — long enough for Claude responses, short enough
// that users don't stare at spinners forever when the backend is hung.
const DEFAULT_TIMEOUT_MS = 35_000;

// Client-side cap on image payload size (base64). Server enforces its own limit,
// but catching early saves bandwidth and gives a clearer error.
const MAX_IMAGE_BASE64 = 12_000_000; // ~9 MB binary

/**
 * fetch with AbortController timeout + safe JSON parsing.
 * Always throws a short, user-friendly Error code:
 *   NETWORK_ERROR  — connection failed or aborted
 *   TIMEOUT        — request exceeded timeoutMs
 *   SERVER_ERROR   — non-2xx response or malformed body
 *   SETUP_REQUIRED — API_BASE not configured
 */
async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  if (!API_BASE) throw new Error('SETUP_REQUIRED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new Error('TIMEOUT');
    throw new Error('NETWORK_ERROR');
  }
  clearTimeout(timer);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? 'SERVER_ERROR');
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('SERVER_ERROR');
  }
}

export async function importRecipe(url: string): Promise<any> {
  return postJson('/api/import-recipe', { url });
}

export async function analyzeFood(imageData: string, mediaType: string): Promise<any> {
  if (imageData.length > MAX_IMAGE_BASE64) {
    throw new Error('IMAGE_TOO_LARGE');
  }
  return postJson('/api/analyze-food', { imageData, mediaType }, 45_000);
}

export async function estimateNutrition(description: string): Promise<any> {
  return postJson('/api/estimate-nutrition', { description });
}

