import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ---- AI response shapes (must mirror the server.js JSON schemas) ----

/** Per-100g macro block the AI attaches so the serving editor can rescale. */
export interface NutritionPer100 {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
}

/** One food the AI extracted from a photo, description, or recipe URL. */
export interface AiFoodItem {
  icon: string;
  name: string;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  unit: string;
  weight_g?: number;
  per100?: NutritionPer100;
}

/** /api/analyze-food and /api/estimate-nutrition return a list of foods. */
export interface NutritionResponse {
  items: AiFoodItem[];
}

/** /api/import-recipe returns a named recipe with its component foods. */
export interface RecipeResponse {
  name: string;
  servings: number;
  items: AiFoodItem[];
}

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

  // Get current session token for authentication
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') throw new Error('TIMEOUT');
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

export async function importRecipe(url: string): Promise<RecipeResponse> {
  return postJson<RecipeResponse>('/api/import-recipe', { url });
}

export async function analyzeFood(imageData: string, mediaType: string): Promise<NutritionResponse> {
  if (imageData.length > MAX_IMAGE_BASE64) {
    throw new Error('IMAGE_TOO_LARGE');
  }
  return postJson<NutritionResponse>('/api/analyze-food', { imageData, mediaType }, 45_000);
}

export interface CoachMessage { role: 'user' | 'assistant'; content: string; }

export async function sendCoachMessage(messages: CoachMessage[], context?: string): Promise<string> {
  const data = await postJson<{ reply: string }>('/api/coach', { messages, context });
  return data.reply;
}

export async function estimateNutrition(description: string): Promise<NutritionResponse | null> {
  const clean = description.trim().toLowerCase();
  if (clean.length < 2) return null;

  const CACHE_KEY = `ai_cache_est_${clean}`;
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, expires } = JSON.parse(cached);
      if (Date.now() < expires) return data;
    }
  } catch { /* cache miss */ }

  const data = await postJson<NutritionResponse>('/api/estimate-nutrition', { description });

  if (data) {
    try {
      // Cache results for 7 days
      const expires = Date.now() + 7 * 24 * 3600_000;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, expires }));
    } catch { /* storage full */ }
  }
  
  return data;
}
