import { headers } from 'next/headers';

// Built-in fallback map of ISO country -> ISO currency. Mirrors the currencies
// enabled in Swell (USD base + CAD/EUR/GBP/AED priced). Visitors from these
// countries get their local display currency without any env configuration.
// Other countries fall back to DEFAULT_STORE_CURRENCY. Override per-country
// via STORE_CURRENCY_BY_COUNTRY (e.g. "CA:CAD,US:USD,GB:GBP").
const DEFAULT_BUILTIN_COUNTRY_CURRENCY_MAP: Record<string, string> = {
  CA: 'CAD',
  US: 'USD',
  GB: 'GBP',
  AE: 'AED',
};

// Eurozone members all resolve to EUR. Kept as a Set so the map above stays
// short; checked separately in currencyForCountry().
const EUROZONE_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
]);

function normalizeCode(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function parseCountryCurrencyMap(raw: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;

  raw
    .split(/[,\n;]+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .forEach(entry => {
      const [country, currency] = entry.split(':').map(part => normalizeCode(part));
      if (!country || !currency || country.length !== 2 || currency.length !== 3) return;
      map[country] = currency;
    });

  return map;
}

const ENV_COUNTRY_CURRENCY_MAP = parseCountryCurrencyMap(
  process.env.STORE_CURRENCY_BY_COUNTRY || process.env.NEXT_PUBLIC_STORE_CURRENCY_BY_COUNTRY
);

export const DEFAULT_STORE_CURRENCY = normalizeCode(process.env.NEXT_PUBLIC_STORE_CURRENCY || process.env.STORE_CURRENCY || 'USD');

export function normalizeCurrencyCode(value: string | undefined | null, fallback = DEFAULT_STORE_CURRENCY): string {
  const normalized = normalizeCode(value);
  return normalized.length === 3 ? normalized : fallback;
}

export function currencyForCountry(countryCode: string | undefined | null): string {
  const normalizedCountry = normalizeCode(countryCode);
  if (!normalizedCountry || normalizedCountry.length !== 2) return DEFAULT_STORE_CURRENCY;

  // Env-configured overrides win, then the built-in map, then the Eurozone
  // set, then the store default. Safe to enable IP-based detection now that
  // swellFetch sends X-Currency to Swell (the storefront API converts on the
  // fly via the store.currencies rate table).
  if (ENV_COUNTRY_CURRENCY_MAP[normalizedCountry]) {
    return ENV_COUNTRY_CURRENCY_MAP[normalizedCountry];
  }
  if (DEFAULT_BUILTIN_COUNTRY_CURRENCY_MAP[normalizedCountry]) {
    return DEFAULT_BUILTIN_COUNTRY_CURRENCY_MAP[normalizedCountry];
  }
  if (EUROZONE_COUNTRIES.has(normalizedCountry)) {
    return 'EUR';
  }
  return DEFAULT_STORE_CURRENCY;
}

export async function resolveRequestCurrencyCode(): Promise<string> {
  try {
    const requestHeaders = await headers();

    const explicitCurrency = normalizeCode(
      requestHeaders.get('x-revalin-currency')
      || requestHeaders.get('x-swell-currency')
      || requestHeaders.get('x-currency')
    );

    if (explicitCurrency.length === 3) {
      return explicitCurrency;
    }

    const country =
      requestHeaders.get('x-vercel-ip-country')
      || requestHeaders.get('cf-ipcountry')
      || requestHeaders.get('x-country-code')
      || requestHeaders.get('x-appengine-country');

    return currencyForCountry(country);
  } catch {
    return DEFAULT_STORE_CURRENCY;
  }
}
