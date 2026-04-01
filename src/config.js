import { createClient } from '@supabase/supabase-js';

// ── Shared Supabase client ──────────────────────────────────────────────────
// Fetches credentials from the proxy server so nothing is hardcoded in HTML.
// All auth + data calls share this one instance so the SDK manages JWT refresh,
// session persistence, and RLS automatically.

export let _sbClient = null;

export const _sbClientReady = fetch('/api/config')
  .then(r => r.json())
  .then(cfg => {
    window.SUPABASE_URL = cfg.supabaseUrl || '';
    window.SUPABASE_KEY = cfg.supabaseKey || '';
    _sbClient = createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
      auth: {
        persistSession: true,
        storageKey: 'dagnara_sb_session',
        detectSessionInUrl: true,
      },
    });
    // Expose on window for legacy inline scripts that reference _sbClient
    window._sbClient = _sbClient;
    return _sbClient;
  })
  .catch(e => {
    console.warn('[Config]', e);
    return null;
  });
