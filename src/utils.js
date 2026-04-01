// ── DOM / string utilities ──────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS when inserting
 * untrusted strings (e.g. food names from APIs) into innerHTML.
 */
export function esc(s) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(s == null ? '' : String(s)));
  return div.innerHTML;
}

/**
 * Clamp a numeric input value between min and max, rounded to 1 dp.
 * Returns 0 if the value is not a finite number.
 */
export function clampNum(value, min, max) {
  const n = parseFloat(value);
  if (!isFinite(n)) return 0;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

/**
 * Show a brief toast notification.
 * Falls back gracefully if showToast is not yet defined.
 */
export function toast(msg, duration) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, duration);
  } else {
    console.info('[toast]', msg);
  }
}
