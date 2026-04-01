import { headers } from 'next/headers';

const DEFAULT_BUILTIN_COUNTRY_CURRENCY_MAP: Record<string, string> = {
  CA: 'CAD',
  US: 'USD',
};

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

  return (
    ENV_COUNTRY_CURRENCY_MAP[normalizedCountry]
    || DEFAULT_BUILTIN_COUNTRY_CURRENCY_MAP[normalizedCountry]
    || DEFAULT_STORE_CURRENCY
  );
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
