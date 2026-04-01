// ── CloudSync — Supabase-backed persistence ─────────────────────────────────
// Extracted from dagnara.html. All Supabase calls go through the shared client
// from config.js so the JWT session (and RLS) is applied automatically.

import { _sbClientReady } from './config.js';

function _userKey(base) {
  try {
    const uid = typeof window.ProfileStore !== 'undefined' ? window.ProfileStore.getUID() : '';
    return uid ? `${base}_${uid}` : base;
  } catch (e) { return base; }
}

let _client  = null;
let _email   = null;
let _profTimer  = null;
const _diaryTimers = {};
let _failCount = 0;
let _failToastTimer = null;

function _ready() { return !!(_client && _email); }

// ── Failure tracking ─────────────────────────────────────────────────────────
function _onFail(label, err) {
  console.warn('[CloudSync]', label, err);
  _failCount++;
  if (_failCount >= 2) {
    clearTimeout(_failToastTimer);
    _failToastTimer = setTimeout(() => {
      if (typeof window.showToast === 'function')
        window.showToast('⚠️ Sync failed — data saved locally. Tap the sync dot to retry.');
      _failCount = 0;
    }, 600);
  }
}
function _onSuccess() { _failCount = 0; }

// ── Retry helper — 3 attempts with exponential backoff ──────────────────────
async function _withRetry(fn) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw lastErr;
}

// ── Status dot ───────────────────────────────────────────────────────────────
function _dot(state) {
  const el = document.getElementById('cloudSyncDot');
  if (!el) return;
  const colours = { syncing: '#f59e0b', synced: '#22c55e', error: '#f43f5e', offline: 'rgba(196,181,255,0.2)' };
  const titles  = {
    syncing: 'Syncing…',
    synced:  'Data synced ✓ (tap to force sync)',
    error:   'Sync error — tap to retry',
    offline: 'Cloud sync offline',
  };
  el.style.background = colours[state] || colours.offline;
  el.style.boxShadow  = state === 'synced' ? '0 0 6px rgba(34,197,94,0.5)' : 'none';
  el.title = titles[state] || titles.offline;
}

// ── Profile push / pull ──────────────────────────────────────────────────────
async function _pushProfile() {
  if (!_ready()) return;
  _dot('syncing');
  try {
    const users = JSON.parse(localStorage.getItem('dagnara_users') || '[]');
    const user  = users.find(u => u.email === _email);
    if (!user) { _dot('error'); return; }
    const safe = Object.assign({}, user.profile || {});
    delete safe.password;
    safe._pushed_at = Date.now();
    user.profile = Object.assign(user.profile || {}, { _pushed_at: safe._pushed_at });
    localStorage.setItem('dagnara_users', JSON.stringify(users));
    await _withRetry(async () => {
      const r = await _client.from('dagnara_profiles')
        .upsert({ email: _email, profile_data: safe, updated_at: new Date().toISOString() }, { onConflict: 'email' });
      if (r.error) throw r.error;
    });
    _dot('synced'); _onSuccess();
  } catch (e) { _dot('error'); _onFail('pushProfile', e); }
}

async function _pullProfile() {
  if (!_ready()) return null;
  try {
    const r = await _client.from('dagnara_profiles').select('profile_data').eq('email', _email).maybeSingle();
    if (r.error) throw r.error;
    return (r.data && r.data.profile_data) || null;
  } catch (e) { console.warn('[CloudSync] pullProfile:', e); return null; }
}

// ── Diary push / pull ────────────────────────────────────────────────────────
async function _pushDiary(date, data) {
  if (!_ready()) return;
  _dot('syncing');
  try {
    await _withRetry(async () => {
      const r = await _client.from('dagnara_diary')
        .upsert({ email: _email, date, entry_data: data, updated_at: new Date().toISOString() }, { onConflict: 'email,date' });
      if (r.error) throw r.error;
    });
    _dot('synced'); _onSuccess();
  } catch (e) { _dot('error'); _onFail('pushDiary', e); }
}

async function _pullDiary() {
  if (!_ready()) return [];
  try {
    const r = await _client.from('dagnara_diary').select('date,entry_data').eq('email', _email);
    if (r.error) throw r.error;
    return r.data || [];
  } catch (e) { console.warn('[CloudSync] pullDiary:', e); return []; }
}

// ── Key/value sync store ──────────────────────────────────────────────────────
const SYNC_KEYS_BASE = [
  'dagnara_pill_meds', 'dagnara_programs',
  'dagnara_quit_smoking', 'dagnara_quit_drinking',
  'dagnara_qs_unlocked', 'dagnara_qd_unlocked',
];
const SYNC_KEYS_USER = ['dagnara_streaks', 'dagnara_achievements'];

function _getSyncKeys() {
  return [...SYNC_KEYS_BASE, ...SYNC_KEYS_USER.map(_userKey)];
}

async function _pushSync(key) {
  if (!_ready()) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const val = JSON.parse(raw);
    await _client.from('dagnara_sync')
      .upsert({ email: _email, key, value: val, updated_at: new Date().toISOString() }, { onConflict: 'email,key' });
  } catch (e) { console.warn('[CloudSync] pushSync:', key, e); }
}

async function _pullAllSync() {
  if (!_ready()) return;
  try {
    const r = await _client.from('dagnara_sync').select('key,value').eq('email', _email);
    if (r.error) throw r.error;
    (r.data || []).forEach(row => {
      if (row.value != null) {
        try { localStorage.setItem(row.key, JSON.stringify(row.value)); } catch (e) {}
      }
    });
  } catch (e) { console.warn('[CloudSync] pullAllSync:', e); }
}

// ── Full sync on login ────────────────────────────────────────────────────────
async function syncOnLogin(email) {
  _email = email;
  if (!_client) _client = await _sbClientReady;
  if (!_client) { _dot('offline'); return; }
  _dot('syncing');
  try {
    const cloudProfile = await _pullProfile();
    if (cloudProfile) {
      const users = JSON.parse(localStorage.getItem('dagnara_users') || '[]');
      const idx   = users.findIndex(u => u.email === email);
      if (idx >= 0) {
        const local   = users[idx].profile || {};
        const cloudTs = parseFloat(cloudProfile._pushed_at || 0);
        const localTs = parseFloat(local._pushed_at || 0);
        if (!local.name || cloudTs > localTs) {
          users[idx].profile = Object.assign({}, local, cloudProfile);
          localStorage.setItem('dagnara_users', JSON.stringify(users));
          if (typeof window.ProfileStore !== 'undefined') {
            window.ProfileStore.startBulkRestore();
            Object.keys(users[idx].profile).forEach(k => {
              try { window.ProfileStore.set(k, String(users[idx].profile[k])); } catch (e) {}
            });
            window.ProfileStore.endBulkRestore();
            if (typeof window.restoreUserProfile === 'function') window.restoreUserProfile();
          }
        }
      }
    }

    const entries = await _pullDiary();
    entries.forEach(entry => {
      if (!entry.entry_data) return;
      const lk = typeof window.diaryKey === 'function' ? window.diaryKey(entry.date) : `diaryStore_${entry.date}`;
      const existing = localStorage.getItem(lk);
      if (!existing) {
        localStorage.setItem(lk, JSON.stringify(entry.entry_data));
      } else {
        try {
          const local = JSON.parse(existing);
          if ((entry.entry_data.eaten || 0) > (local.eaten || 0))
            localStorage.setItem(lk, JSON.stringify(entry.entry_data));
        } catch (e) {}
      }
    });

    await _pullAllSync();
    _dot('synced');
  } catch (e) { _dot('error'); _onFail('syncOnLogin', e); }
}

// ── Full push of all local data ───────────────────────────────────────────────
async function forcePushAll(email) {
  _email = email;
  if (!_client) return;
  _dot('syncing');
  try {
    await _pushProfile();

    const prefix = typeof window.diaryKeyPrefix === 'function'
      ? window.diaryKeyPrefix()
      : `diaryStore_${email}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) await _pushDiary(k.replace(prefix, ''), JSON.parse(raw));
        } catch (e) {}
      }
    }

    for (const key of _getSyncKeys()) await _pushSync(key);

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('dagnara_pill_log_')) await _pushSync(k);
    }

    _dot('synced'); _onSuccess();
    if (typeof window.showToast === 'function') window.showToast('✅ All data synced to cloud!');
  } catch (e) { _dot('error'); _onFail('forcePushAll', e); }
}

// ── Debounced schedulers ──────────────────────────────────────────────────────
function scheduleProfilePush() {
  if (!_ready()) return;
  clearTimeout(_profTimer);
  _profTimer = setTimeout(_pushProfile, 5000);
}

function scheduleDiaryPush(date) {
  if (!_ready()) return;
  clearTimeout(_diaryTimers[date]);
  _diaryTimers[date] = setTimeout(() => {
    const lk = typeof window.diaryKey === 'function' ? window.diaryKey(date) : `diaryStore_${date}`;
    try {
      const raw = localStorage.getItem(lk);
      if (raw) _pushDiary(date, JSON.parse(raw));
    } catch (e) {}
  }, 3000);
}

const _syncTimers = {};
function scheduleSync(key) {
  if (!_ready()) return;
  clearTimeout(_syncTimers[key]);
  _syncTimers[key] = setTimeout(() => _pushSync(key), 3000);
}

// ── Init — called from main.js after DOM is ready ────────────────────────────
export function initCloudSync() {
  _sbClientReady.then(sb => { if (sb) _client = sb; });
  _dot('offline');

  setTimeout(() => {
    const el = document.getElementById('cloudSyncDot');
    if (el && !el._syncBound) {
      el._syncBound = true;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const email = localStorage.getItem('dagnara_current_user');
        if (email) forcePushAll(email);
      });
    }
  }, 1500);
}

// ── Public API ────────────────────────────────────────────────────────────────
export const CloudSync = {
  syncOnLogin,
  scheduleProfilePush,
  scheduleDiaryPush,
  scheduleSync,
  pushAllSync: () => _getSyncKeys().forEach(_pushSync),
  forcePushAll,
};
