// Points to the deployed Express backend (server.js in the repo root).
// Deploy that server to Railway / Render / Fly.io, then set:
//   EXPO_PUBLIC_API_URL=https://your-deployed-url.com
// in your .env (dev) and EAS secrets (production).
// Until deployed, food photo analysis will show a "not available" message.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';


export async function importRecipe(url: string): Promise<any> {
  if (!API_BASE) throw new Error('SETUP_REQUIRED');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/import-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? 'SERVER_ERROR');
  }
  return res.json();
}

export async function analyzeFood(imageData: string, mediaType: string): Promise<any> {
  if (!API_BASE) {
    throw new Error('SETUP_REQUIRED');
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze-food`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, mediaType }),
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json();
}
