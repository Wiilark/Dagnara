import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

// Fail loud in dev, fail quiet (but logged) in production. A misconfigured
// build will silently lose auth and sync otherwise.
if (!SUPABASE_URL || !SUPABASE_KEY) {
   
  console.error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY. ' +
    'Auth and cloud sync will fail. Check your .env and EAS secrets.',
  );
  if (__DEV__) {
    throw new Error('Supabase credentials missing — check .env and restart Expo.');
  }
}

// React Native's fetch can only read the response body once.
// This wrapper buffers the body into a new Response so Supabase
// can read it as many times as it needs without hitting "body already read".
const fetchWithBuffer: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithBuffer,
  },
});
