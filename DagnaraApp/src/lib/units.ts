export type UnitSystem = 'Metric' | 'Imperial (US)' | 'UK' | 'US Customary';

// ── Unit labels ───────────────────────────────────────────────────────────────

export function weightUnit(sys: UnitSystem): string {
  if (sys === 'UK') return 'st';
  return sys === 'Metric' ? 'kg' : 'lb';
}

export function heightUnit(sys: UnitSystem): string {
  return sys === 'Metric' ? 'cm' : "ft'in\"";
}

export function lengthUnit(sys: UnitSystem): string {
  return sys === 'Metric' ? 'cm' : 'in';
}

// ── Display formatting (metric stored value → readable string) ────────────────

export function formatWeight(kg: number, sys: UnitSystem): string {
  if (!kg || isNaN(kg)) return '—';
  if (sys === 'Metric') return `${Math.round(kg * 10) / 10} kg`;
  if (sys === 'UK') {
    const totalLbs = kg * 2.2046;
    let stone = Math.floor(totalLbs / 14);
    let lbs = Math.round(totalLbs % 14);
    if (lbs === 14) { stone += 1; lbs = 0; }
    return lbs > 0 ? `${stone} st ${lbs} lb` : `${stone} st`;
  }
  return `${Math.round(kg * 2.2046 * 10) / 10} lb`;
}

export function formatHeight(cm: number, sys: UnitSystem): string {
  if (!cm || isNaN(cm)) return '—';
  if (sys === 'Metric') return `${Math.round(cm)} cm`;
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn % 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return `${ft}'${inch}"`;
}

export function formatLength(cm: number, sys: UnitSystem): string {
  if (!cm || isNaN(cm)) return '—';
  if (sys === 'Metric') return `${Math.round(cm)} cm`;
  return `${Math.round(cm / 2.54 * 10) / 10} in`;
}

// ── Input population (metric → editable string for TextInput) ─────────────────

export function kgToInput(kg: number, sys: UnitSystem): string {
  if (!kg || kg <= 0) return '';
  if (sys === 'Metric') return String(Math.round(kg * 10) / 10);
  if (sys === 'UK') {
    const totalLbs = kg * 2.2046;
    let stone = Math.floor(totalLbs / 14);
    let lbs = Math.round(totalLbs % 14);
    if (lbs === 14) { stone += 1; lbs = 0; }
    return `${stone} ${lbs}`;
  }
  return String(Math.round(kg * 2.2046 * 10) / 10);
}

export function cmToInput(cm: number, sys: UnitSystem): string {
  if (!cm || cm <= 0) return '';
  if (sys === 'Metric') return String(Math.round(cm));
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn % 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return `${ft}'${inch}"`;
}

export function cmLenToInput(cm: number, sys: UnitSystem): string {
  if (!cm || cm <= 0) return '';
  if (sys === 'Metric') return String(Math.round(cm));
  return String(Math.round(cm / 2.54 * 10) / 10);
}

// ── Input placeholders ────────────────────────────────────────────────────────

export function weightPlaceholder(sys: UnitSystem): string {
  if (sys === 'Metric') return 'e.g. 72';
  if (sys === 'UK') return 'e.g. 11 4';
  return 'e.g. 160';
}

export function heightPlaceholder(sys: UnitSystem): string {
  return sys === 'Metric' ? 'e.g. 175' : "e.g. 5'11\"";
}

// ── Parsing (user input string → kg or cm for storage) ───────────────────────

/** Parse a weight string → kg. Returns null if invalid. */
export function parseWeight(val: string, sys: UnitSystem): number | null {
  const s = val.trim();
  if (!s) return null;
  if (sys === 'UK') {
    // "11 4" or "11st 4lb" = 11 stone 4 lbs
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:st)?\s+(\d+(?:\.\d+)?)/i);
    if (m) return (parseFloat(m[1]) * 14 + parseFloat(m[2])) / 2.2046;
  }
  const n = parseFloat(s);
  if (isNaN(n) || n <= 0) return null;
  return sys === 'Metric' ? n : n / 2.2046;
}

/** Parse a height string → cm. Returns null if invalid. */
export function parseHeight(val: string, sys: UnitSystem): number | null {
  const s = val.trim();
  if (!s) return null;
  if (sys === 'Metric') {
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? null : n;
  }
  // ft'in" — "5'11\"" or "5 11"
  const m = s.match(/^(\d+)['\s]+(\d+)/);
  if (m) return (parseFloat(m[1]) * 12 + parseFloat(m[2])) * 2.54;
  // Single number = treat as total inches
  const n = parseFloat(s);
  return isNaN(n) || n <= 0 ? null : n * 2.54;
}

/** Parse a length measurement (waist/chest/etc) → cm. */
export function parseLength(val: string, sys: UnitSystem): number | null {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  return sys === 'Metric' ? n : n * 2.54;
}
