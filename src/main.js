// ── Entry point ───────────────────────────────────────────────────────────────
// Imports all extracted modules and exposes them as window globals so the
// remaining inline scripts in index.html can still reference them unchanged.

import { _sbClientReady } from './config.js';
import { CloudSync, initCloudSync } from './cloudSync.js';
import { esc, clampNum, toast } from './utils.js';
import {
  getUsers, saveUsers, getCurrentUser, setCurrentUser, clearCurrentUser,
  getRemembered, saveRemembered, clearRemembered,
  registerUser, loginUser, logoutUser,
  sendPasswordReset, setNewPassword,
  restoreSession, onPasswordRecovery,
} from './auth.js';

// ── Expose on window for inline scripts ──────────────────────────────────────
window._sbClientReady  = _sbClientReady;
window.CloudSync       = CloudSync;

// Auth helpers
window.getUsers        = getUsers;
window.saveUsers       = saveUsers;
window.getCurrentUser  = getCurrentUser;
window.setCurrentUser  = setCurrentUser;
window.clearCurrentUser = clearCurrentUser;
window.getRemembered   = getRemembered;
window.saveRemembered  = saveRemembered;
window.clearRemembered = clearRemembered;

// Auth actions
window.registerUser      = registerUser;
window.loginUser         = loginUser;
window.logoutUser        = logoutUser;
window.sendPasswordReset = sendPasswordReset;
window.setNewPassword    = setNewPassword;
window.restoreSession    = restoreSession;
window.onPasswordRecovery = onPasswordRecovery;

// _esc is used directly in buildFoodItem and other inline functions
window._esc = esc;

// ── Init CloudSync once DOM is ready ─────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCloudSync);
} else {
  initCloudSync();
}

// ── Wait for Supabase config then patch SUPABASE_URL/KEY globals ─────────────
// Legacy inline scripts reference these vars directly.
_sbClientReady.then(() => {
  // globals are set inside config.js — nothing extra needed here
});
