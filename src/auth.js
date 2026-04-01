// ── Authentication — Supabase Auth ─────────────────────────────────────────
// Extracted from dagnara.html. Uses the shared Supabase client from config.js.
// All password handling is delegated to Supabase Auth (bcrypt, session JWTs).

import { _sbClientReady } from './config.js';

// ── Storage helpers ──────────────────────────────────────────────────────────
export function getUsers()      { try { const u = localStorage.getItem('dagnara_users'); return u ? JSON.parse(u) : []; } catch (e) { return []; } }
export function saveUsers(a)    { try { localStorage.setItem('dagnara_users', JSON.stringify(a)); } catch (e) {} }
export function getRemembered()        { try { const r = localStorage.getItem('dagnara_remembered'); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
export function saveRemembered(email)  { try { localStorage.setItem('dagnara_remembered', JSON.stringify({ email })); } catch (e) {} }
export function clearRemembered()      { try { localStorage.removeItem('dagnara_remembered'); } catch (e) {} }
export function getCurrentUser()        { try { return localStorage.getItem('dagnara_current_user'); } catch (e) { return null; } }
export function setCurrentUser(email)   { try { localStorage.setItem('dagnara_current_user', email); } catch (e) {} }
export function clearCurrentUser()      { try { localStorage.removeItem('dagnara_current_user'); } catch (e) {} }

// ── Registration ─────────────────────────────────────────────────────────────
export async function registerUser({ email, password, profile }) {
  const sb = await _sbClientReady;
  if (!sb) throw new Error('Cannot connect to server. Try again.');

  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw error;

  // Push profile to Supabase — this is the source of truth
  try {
    await sb.from('dagnara_profiles').upsert(
      { email, profile_data: profile, updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    );
  } catch (e) { console.warn('[Auth] profile push:', e); }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function loginUser({ email, password, remember }) {
  const sb = await _sbClientReady;
  if (!sb) throw new Error('Cannot connect to server.');

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Incorrect email or password.');

  const users = getUsers();
  let userIdx = users.findIndex(u => u.email === email);

  if (userIdx < 0) {
    // No local record — pull profile from cloud
    try {
      const { data } = await sb.from('dagnara_profiles').select('profile_data').eq('email', email).maybeSingle();
      const cloudProfile = (data && data.profile_data) || {};
      users.push({ email, profile: cloudProfile, addedAt: new Date().toISOString() });
      saveUsers(users);
      userIdx = users.length - 1;
    } catch (e) { console.warn('[Auth] profile pull:', e); }
  }

  setCurrentUser(email);
  if (remember) saveRemembered(email);
  else clearRemembered();

  return users[userIdx] || { email, profile: {} };
}

// ── Logout ────────────────────────────────────────────────────────────────────
export async function logoutUser() {
  clearCurrentUser();
  clearRemembered();
  const sb = await _sbClientReady;
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) {}
  }
}

// ── Password reset ────────────────────────────────────────────────────────────
export async function sendPasswordReset(email) {
  const sb = await _sbClientReady;
  if (!sb) throw new Error('Cannot connect. Try again.');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function setNewPassword(password) {
  const sb = await _sbClientReady;
  if (!sb) throw new Error('Cannot connect.');
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

// ── Session restore on page load ──────────────────────────────────────────────
export async function restoreSession() {
  // Check if Supabase has a valid session (e.g. after password-reset redirect)
  const sb = await _sbClientReady;
  if (!sb) return null;

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user?.email) {
    setCurrentUser(session.user.email);
    return session.user.email;
  }
  return null;
}

// ── Listen for password-recovery redirect ────────────────────────────────────
export function onPasswordRecovery(callback) {
  _sbClientReady.then(sb => {
    if (!sb) return;
    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') callback();
    });
  });
}
