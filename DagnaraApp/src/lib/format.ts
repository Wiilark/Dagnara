// ── Universal number formatting ───────────────────────────────────────────
// Forces en-US conventions across the entire app: comma thousands separator,
// period decimal separator. Example: 2495.31 → "2,495.31", 12345 → "12,345".
//
// Anything user-visible that displays a number should go through `fmt()`. SVG
// path coordinates and internal rounding (form input strings, FP-drift fixes)
// must NOT use this — they need machine-readable numerics.

/**
 * Format a number with comma thousands separators and a fixed decimal count.
 * @param n         the value to format
 * @param decimals  digits after the decimal point (default 0 — integers)
 *
 * Returns "0" for non-finite input so callers never have to guard NaN/Infinity.
 */
export function fmt(n: number, decimals: number = 0): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Same as `fmt()` but trims trailing zeros — shows up to `maxDecimals`.
 * Use for values that are conditionally whole (e.g. "1 cup" vs "1.5 cups").
 */
export function fmtFlex(n: number, maxDecimals: number = 2): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}
