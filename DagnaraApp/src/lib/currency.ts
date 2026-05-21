// ── Country → currency map ─────────────────────────────────────────────────
// Single source of truth for country-aware money formatting. Used by Programs
// (Quit Smoking / Quit Drinking money saved) and the Preferences country picker.
//
// `position: 'before'` → "$1,234.56"      (USD, GBP, …)
// `position: 'after'`  → "1 234,56 kr"    (SEK, EUR, …)

export interface CountryInfo {
  code: string;     // ISO 3166-1 alpha-2
  name: string;
  flag: string;     // emoji flag — purely decorative
  currency: string; // ISO 4217
  symbol: string;
  locale: string;
  position: 'before' | 'after';
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'US', name: 'United States',   flag: '🇺🇸', currency: 'USD', symbol: '$',   locale: 'en-US', position: 'before' },
  { code: 'SE', name: 'Sweden',           flag: '🇸🇪', currency: 'SEK', symbol: 'kr',  locale: 'sv-SE', position: 'after'  },
  { code: 'GB', name: 'United Kingdom',   flag: '🇬🇧', currency: 'GBP', symbol: '£',   locale: 'en-GB', position: 'before' },
  { code: 'DE', name: 'Germany',          flag: '🇩🇪', currency: 'EUR', symbol: '€',   locale: 'de-DE', position: 'after'  },
  { code: 'FR', name: 'France',           flag: '🇫🇷', currency: 'EUR', symbol: '€',   locale: 'fr-FR', position: 'after'  },
  { code: 'ES', name: 'Spain',            flag: '🇪🇸', currency: 'EUR', symbol: '€',   locale: 'es-ES', position: 'after'  },
  { code: 'IT', name: 'Italy',            flag: '🇮🇹', currency: 'EUR', symbol: '€',   locale: 'it-IT', position: 'after'  },
  { code: 'NL', name: 'Netherlands',      flag: '🇳🇱', currency: 'EUR', symbol: '€',   locale: 'nl-NL', position: 'before' },
  { code: 'NO', name: 'Norway',           flag: '🇳🇴', currency: 'NOK', symbol: 'kr',  locale: 'nb-NO', position: 'after'  },
  { code: 'DK', name: 'Denmark',          flag: '🇩🇰', currency: 'DKK', symbol: 'kr',  locale: 'da-DK', position: 'after'  },
  { code: 'FI', name: 'Finland',          flag: '🇫🇮', currency: 'EUR', symbol: '€',   locale: 'fi-FI', position: 'after'  },
  { code: 'CH', name: 'Switzerland',      flag: '🇨🇭', currency: 'CHF', symbol: 'CHF', locale: 'de-CH', position: 'before' },
  { code: 'PL', name: 'Poland',           flag: '🇵🇱', currency: 'PLN', symbol: 'zł',  locale: 'pl-PL', position: 'after'  },
  { code: 'CZ', name: 'Czech Republic',   flag: '🇨🇿', currency: 'CZK', symbol: 'Kč',  locale: 'cs-CZ', position: 'after'  },
  { code: 'CA', name: 'Canada',           flag: '🇨🇦', currency: 'CAD', symbol: 'C$',  locale: 'en-CA', position: 'before' },
  { code: 'AU', name: 'Australia',        flag: '🇦🇺', currency: 'AUD', symbol: 'A$',  locale: 'en-AU', position: 'before' },
  { code: 'NZ', name: 'New Zealand',      flag: '🇳🇿', currency: 'NZD', symbol: 'NZ$', locale: 'en-NZ', position: 'before' },
  { code: 'JP', name: 'Japan',            flag: '🇯🇵', currency: 'JPY', symbol: '¥',   locale: 'ja-JP', position: 'before' },
  { code: 'IN', name: 'India',            flag: '🇮🇳', currency: 'INR', symbol: '₹',   locale: 'en-IN', position: 'before' },
  { code: 'BR', name: 'Brazil',           flag: '🇧🇷', currency: 'BRL', symbol: 'R$',  locale: 'pt-BR', position: 'before' },
  { code: 'MX', name: 'Mexico',           flag: '🇲🇽', currency: 'MXN', symbol: '$',   locale: 'es-MX', position: 'before' },
  { code: 'AR', name: 'Argentina',        flag: '🇦🇷', currency: 'ARS', symbol: '$',   locale: 'es-AR', position: 'before' },
  { code: 'ZA', name: 'South Africa',     flag: '🇿🇦', currency: 'ZAR', symbol: 'R',   locale: 'en-ZA', position: 'before' },
  { code: 'AE', name: 'UAE',              flag: '🇦🇪', currency: 'AED', symbol: 'د.إ', locale: 'ar-AE', position: 'before' },
  { code: 'SA', name: 'Saudi Arabia',     flag: '🇸🇦', currency: 'SAR', symbol: '﷼',   locale: 'ar-SA', position: 'before' },
  { code: 'TR', name: 'Turkey',           flag: '🇹🇷', currency: 'TRY', symbol: '₺',   locale: 'tr-TR', position: 'before' },
  { code: 'RU', name: 'Russia',           flag: '🇷🇺', currency: 'RUB', symbol: '₽',   locale: 'ru-RU', position: 'after'  },
  { code: 'UA', name: 'Ukraine',          flag: '🇺🇦', currency: 'UAH', symbol: '₴',   locale: 'uk-UA', position: 'after'  },
  { code: 'GE', name: 'Georgia',          flag: '🇬🇪', currency: 'GEL', symbol: '₾',   locale: 'ka-GE', position: 'after'  },
  { code: 'KR', name: 'South Korea',      flag: '🇰🇷', currency: 'KRW', symbol: '₩',   locale: 'ko-KR', position: 'before' },
  { code: 'CN', name: 'China',            flag: '🇨🇳', currency: 'CNY', symbol: '¥',   locale: 'zh-CN', position: 'before' },
  { code: 'HK', name: 'Hong Kong',        flag: '🇭🇰', currency: 'HKD', symbol: 'HK$', locale: 'en-HK', position: 'before' },
  { code: 'SG', name: 'Singapore',        flag: '🇸🇬', currency: 'SGD', symbol: 'S$',  locale: 'en-SG', position: 'before' },
  { code: 'TH', name: 'Thailand',         flag: '🇹🇭', currency: 'THB', symbol: '฿',   locale: 'th-TH', position: 'before' },
  { code: 'ID', name: 'Indonesia',        flag: '🇮🇩', currency: 'IDR', symbol: 'Rp',  locale: 'id-ID', position: 'before' },
  { code: 'PH', name: 'Philippines',      flag: '🇵🇭', currency: 'PHP', symbol: '₱',   locale: 'en-PH', position: 'before' },
  { code: 'IE', name: 'Ireland',          flag: '🇮🇪', currency: 'EUR', symbol: '€',   locale: 'en-IE', position: 'before' },
  { code: 'PT', name: 'Portugal',         flag: '🇵🇹', currency: 'EUR', symbol: '€',   locale: 'pt-PT', position: 'after'  },
  { code: 'GR', name: 'Greece',           flag: '🇬🇷', currency: 'EUR', symbol: '€',   locale: 'el-GR', position: 'after'  },
  { code: 'AT', name: 'Austria',          flag: '🇦🇹', currency: 'EUR', symbol: '€',   locale: 'de-AT', position: 'after'  },
  { code: 'BE', name: 'Belgium',          flag: '🇧🇪', currency: 'EUR', symbol: '€',   locale: 'nl-BE', position: 'before' },
];

const DEFAULT = COUNTRIES[0]!; // US

// ── Exchange rates ────────────────────────────────────────────────────────
// USD-based static snapshot (1 USD = X local units). All persisted money in
// the app is stored as USD — this table converts to/from the user's display
// currency. Rates rounded for stability; refresh periodically.
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.93,
  GBP: 0.79,
  SEK: 10.50,
  NOK: 10.80,
  DKK: 6.95,
  CHF: 0.88,
  PLN: 4.00,
  CZK: 22.50,
  CAD: 1.36,
  AUD: 1.52,
  NZD: 1.65,
  JPY: 150.0,
  INR: 83.5,
  BRL: 5.00,
  MXN: 17.0,
  ARS: 850.0,
  ZAR: 18.5,
  AED: 3.67,
  SAR: 3.75,
  TRY: 32.0,
  RUB: 92.0,
  UAH: 38.0,
  GEL: 2.70,
  KRW: 1320.0,
  CNY: 7.20,
  HKD: 7.82,
  SGD: 1.34,
  THB: 35.0,
  IDR: 15500.0,
  PHP: 56.0,
};

// Currencies that conventionally display zero fraction digits.
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'IDR']);

function rate(currency: string): number {
  return EXCHANGE_RATES[currency] ?? 1.0;
}

export function getCountry(code: string | null | undefined): CountryInfo {
  if (!code) return DEFAULT;
  return COUNTRIES.find(c => c.code === code) ?? DEFAULT;
}

export function currencySymbol(country: string | null | undefined): string {
  return getCountry(country).symbol;
}

// Default fraction digits the currency typically uses (2 for most, 0 for JPY/KRW/IDR).
export function minorUnits(country: string | null | undefined): number {
  return ZERO_DECIMAL_CURRENCIES.has(getCountry(country).currency) ? 0 : 2;
}

// Convert a USD amount to the user's selected currency.
export function usdToLocal(amountUsd: number, country: string | null | undefined): number {
  return amountUsd * rate(getCountry(country).currency);
}

// Convert a local-currency amount back to USD (e.g. from a form input).
export function localToUsd(amountLocal: number, country: string | null | undefined): number {
  return amountLocal / rate(getCountry(country).currency);
}

// Format an amount that's *already in the local currency* for the given country.
// decimals defaults to the currency's conventional precision (2 normally, 0 for JPY/KRW/IDR);
// pass an explicit number to override (e.g. 0 for tile-style "no cents" big numbers).
export function formatMoney(amount: number, country: string | null | undefined, decimals?: number): string {
  const c = getCountry(country);
  const places = decimals ?? minorUnits(country);
  const num = amount.toLocaleString(c.locale, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
  return c.position === 'before' ? `${c.symbol}${num}` : `${num} ${c.symbol}`;
}

// Format a USD amount in the user's local currency (converts via EXCHANGE_RATES first).
// Use this anywhere persisted money (always USD) is rendered to the user.
export function formatMoneyFromUsd(amountUsd: number, country: string | null | undefined, decimals?: number): string {
  return formatMoney(usdToLocal(amountUsd, country), country, decimals);
}
