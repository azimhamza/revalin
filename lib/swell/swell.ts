import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from 'next/cache';

import {
  BulkPriceTier,
  ProductCollectionSortKey,
  ProductSortKey,
  SwellApiCategory,
  SwellApiImage,
  SwellApiListResponse,
  SwellApiProduct,
  SwellApiVariant,
  SwellCart as AppCart,
  SwellCollection as AppCollection,
  SwellProduct as AppProduct,
} from './types';

import { DEFAULT_PAGE_SIZE, DEFAULT_SORT_KEY } from './constants';
import { DEFAULT_STORE_CURRENCY, normalizeCurrencyCode } from './currency';
import { resolveUnitPrice } from './utils';
import { TAGS } from '@/lib/constants';

// Inner-fetch tags. Mirrors the tags used by `'use cache'` wrappers in
// `lib/swell/index.ts` so that `revalidateTag(...)` busts both layers in one
// call (e.g. from a Swell webhook).
const SWELL_FETCH_TAGS = [TAGS.products, TAGS.collections, TAGS.collectionProducts];

const rawSwellStoreUrl =
  process.env.NEXT_PUBLIC_SWELL_STORE_URL ||
  process.env.SWELL_STORE_URL ||
  process.env.NEXT_PUBLIC_SWELL_STORE_DOMAIN ||
  process.env.SWELL_STORE_DOMAIN ||
  '';
const rawSwellApiUrl = process.env.NEXT_PUBLIC_SWELL_API_URL || process.env.SWELL_API_URL || '';

const rawSwellStoreId = process.env.NEXT_PUBLIC_SWELL_STORE_ID || process.env.SWELL_STORE_ID || '';
const SWELL_PUBLIC_KEY = (process.env.NEXT_PUBLIC_SWELL_PUBLIC_KEY || process.env.SWELL_PUBLIC_KEY || '').trim();
const SWELL_SECRET_KEY = (process.env.SWELL_SECRET_KEY || '').trim();
const HAS_PUBLIC_KEY = Boolean(SWELL_PUBLIC_KEY);
const HAS_SECRET_KEY = Boolean(SWELL_SECRET_KEY);

function normalizeSwellBaseUrl(storeUrl: string, storeId: string): string {
  const candidate = storeUrl?.trim() || (storeId?.trim() ? `https://${storeId.trim()}.swell.store` : '');
  if (!candidate) return '';

  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const parsed = new URL(withProtocol);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '').replace(/\/api$/i, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
}

const SWELL_BASE_URL = normalizeSwellBaseUrl(rawSwellStoreUrl, rawSwellStoreId);

function normalizeExplicitApiBase(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

const EXPLICIT_SWELL_API_BASE = normalizeExplicitApiBase(rawSwellApiUrl);
const SWELL_API_BASES = dedupe([
  EXPLICIT_SWELL_API_BASE,
  SWELL_BASE_URL ? `${SWELL_BASE_URL}/api` : '',
]);
const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_SWELL_CHECKOUT_URL || process.env.SWELL_CHECKOUT_URL || SWELL_BASE_URL || '/checkout';
const DEFAULT_CURRENCY = DEFAULT_STORE_CURRENCY;
const PRODUCT_EXPAND_FIELDS = HAS_SECRET_KEY ? 'variants,categories,category,stock' : 'category';
const CATEGORY_KEYWORD_FALLBACKS: Record<string, string[]> = {
  'metabolic-peptides': ['metabolic', 'glp-3', 'cagrilintide', 'aod', 'mots', 'tesamorelin', 'nad'],
  'somatotropic-peptides': ['somatotropic', 'growth hormone', 'ghrh', 'ghrp', 'ipamorelin', 'cjc', 'sermorelin', 'igf'],
  'regenerative-peptides': ['regenerative', 'tissue repair', 'bpc', 'tb-500', 'tb500', 'ghk', 'epithalon', 'wolverine', 'glow', 'klow'],
  'endocrine-peptides': ['endocrine', 'kisspeptin', 'hormone'],
  'melanocortin-compounds': ['melanocortin', 'mt-2', 'mt2'],
  'reconstitution-supplies': ['reconstitution', 'bacteriostatic', 'sterile water', 'bac water'],
};
const CATEGORY_KEYWORD_STOPWORDS = new Set(['peptide', 'peptides', 'compound', 'compounds', 'supply', 'supplies']);

type QueryValue = string | number | boolean | null | undefined | QueryValue[] | { [key: string]: QueryValue };

type CartLineState = {
  id: string;
  variantId: string;
  quantity: number;
  bulkPriceTiers?: import('./types').BulkPriceTier[];
  merchandise: {
    id: string;
    title: string;
    sku?: string;
    price: {
      amount: string;
      currencyCode: string;
    };
    availableQuantity?: number | null;
    selectedOptions: Array<{ name: string; value: string }>;
    product: {
      title: string;
      handle: string;
      availableForSale?: boolean;
      stockStatus?: string;
      stockLevel?: number;
      compareAtPrice?: {
        amount: string;
        currencyCode: string;
      };
      images: {
        edges: Array<{
          node: {
            url: string;
            altText: string;
            thumbhash?: string;
          };
        }>;
      };
    };
  };
};

type CartState = {
  id: string;
  lines: CartLineState[];
};

const cartStore = new Map<string, CartState>();
const PRODUCT_LOOKUP_TTL_MS = 30_000;
const productByVariantCache = new Map<
  string,
  {
    expiresAt: number;
    value: Promise<AppProduct | null>;
  }
>();

function assertSwellConfig() {
  if (!SWELL_BASE_URL && SWELL_API_BASES.length === 0) {
    throw new Error(
      'Missing Swell store URL. Set SWELL_STORE_ID, NEXT_PUBLIC_SWELL_STORE_URL, or SWELL_API_URL.'
    );
  }

  if (!HAS_PUBLIC_KEY && !HAS_SECRET_KEY) {
    throw new Error('Missing Swell API key. Set SWELL_PUBLIC_KEY (required for storefront) or SWELL_SECRET_KEY.');
  }
}

function appendQueryParam(searchParams: URLSearchParams, key: string, value: QueryValue): void {
  if (value === undefined || value === null || value === '') return;

  if (Array.isArray(value)) {
    value.forEach(item => appendQueryParam(searchParams, `${key}[]`, item));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      appendQueryParam(searchParams, `${key}[${nestedKey}]`, nestedValue);
    });
    return;
  }

  searchParams.append(key, String(value));
}

function applyParamsToUrl(url: URL, params?: { [key: string]: QueryValue }) {
  if (!params) return;
  Object.entries(params).forEach(([key, value]) => appendQueryParam(url.searchParams, key, value));
}

function buildApiUrls(path: string, params?: { [key: string]: QueryValue }) {
  assertSwellConfig();
  return SWELL_API_BASES.map(base => {
    const url = new URL(`${base}${path}`);
    applyParamsToUrl(url, params);
    return url.toString();
  });
}

function buildAuthHeaders(apiUrl: string): HeadersInit[] {
  const headers: HeadersInit[] = [];
  const isGlobalApiHost = /^https:\/\/api\.swell\.store\b/i.test(apiUrl);

  const pushUnique = (next: HeadersInit) => {
    const signature = JSON.stringify(next);
    if (!headers.some(existing => JSON.stringify(existing) === signature)) {
      headers.push(next);
    }
  };

  const pushAuthVariants = (key: string, extras?: Record<string, string>) => {
    const base = {
      'Content-Type': 'application/json',
      ...(extras || {}),
    };

    pushUnique({
      ...base,
      Authorization: key,
    });

    pushUnique({
      ...base,
      Authorization: `Bearer ${key}`,
    });
  };

  if (!isGlobalApiHost) {
    if (SWELL_PUBLIC_KEY) {
      pushAuthVariants(SWELL_PUBLIC_KEY);
    } else if (SWELL_SECRET_KEY) {
      // Last-resort fallback when only secret key exists.
      pushAuthVariants(SWELL_SECRET_KEY);
    }
    return headers;
  }

  if (rawSwellStoreId && SWELL_SECRET_KEY) {
    pushAuthVariants(SWELL_SECRET_KEY, { 'Swell-Store-Id': rawSwellStoreId });
    const secretBasicAuth = Buffer.from(`${rawSwellStoreId}:${SWELL_SECRET_KEY}`, 'utf8').toString('base64');
    pushUnique({
      Authorization: `Basic ${secretBasicAuth}`,
      'Content-Type': 'application/json',
    });
  }

  if (rawSwellStoreId && SWELL_PUBLIC_KEY) {
    pushAuthVariants(SWELL_PUBLIC_KEY, { 'Swell-Store-Id': rawSwellStoreId });
  }

  return headers;
}

// Currency-aware cached fetch helper.
//
// Why this exists: Swell selects the response currency via the X-Currency
// HTTP header (see swell-js src/api.js). But Next.js's built-in `fetch` cache
// keys entries on URL + method + body and explicitly ignores request headers.
// That means when we rely on `next: { revalidate }`, the first request
// (typically USD at build) gets cached and every subsequent CAD/GBP/EUR
// request returns the stale USD payload even though the X-Currency header is
// different. We also can't use `?currency=` as a URL-level cache key because
// Swell treats it as a real filter (and returns 0 results), and any other
// unknown query param is rejected the same way.
//
// Solution: wrap the fetch in a `'use cache'` helper whose cache key is
// derived from its explicit arguments (`requestUrl`, `headers`, `currencyCode`).
// `'use cache'` hashes arguments into the cache key, so each currency ends up
// with its own entry. `currencyCode` is intentionally passed as a dedicated
// argument (even though the merged headers already carry X-Currency) so that
// the cache key is obviously per-currency at the call site. Returns the
// serialized response shape so the caller can parse/inspect it.
async function fetchSwellResponseCached(
  requestUrl: string,
  headers: Record<string, string>,
  currencyCode: string
): Promise<{ ok: boolean; status: number; body: string }> {
  'use cache';
  cacheLife('minutes');
  cacheTag(...SWELL_FETCH_TAGS);

  void currencyCode; // participates in the cache key via 'use cache' arg hashing
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  const body = (await response.text()).trim();
  return { ok: response.ok, status: response.status, body };
}

async function swellFetch<T>(
  path: string,
  params?: { [key: string]: QueryValue },
  options: { allowExpandFallback?: boolean; currencyCode?: string } = {}
): Promise<T> {
  const { allowExpandFallback = true, currencyCode } = options;
  const normalizedCurrency = normalizeCurrencyCode(currencyCode, DEFAULT_CURRENCY);
  const requestUrls = buildApiUrls(path, params);
  const errors: string[] = [];

  for (const requestUrl of requestUrls) {
    const authHeaders = buildAuthHeaders(requestUrl);
    for (const headers of authHeaders) {
      // Swell selects the response currency via the X-Currency request header
      // (matches swell-js src/api.js). Sending it here makes prices come back
      // converted via the rate table the merchant configured in Swell admin
      // (store.currencies). Cart and checkout calls that don't pass
      // currencyCode default to the store's base currency, so transactions
      // stay in USD even when display is localized.
      const mergedHeaders = {
        ...(headers as Record<string, string>),
        'X-Currency': normalizedCurrency,
      };

      const { ok, status, body } = await fetchSwellResponseCached(
        requestUrl,
        mergedHeaders,
        normalizedCurrency
      );

      if (ok) {
        return JSON.parse(body) as T;
      }

      if (allowExpandFallback && params?.expand && (status === 400 || status === 403)) {
        let parsedErrorCode = '';
        try {
          const parsed = JSON.parse(body);
          parsedErrorCode = parsed?.error?.code || '';
        } catch {
          parsedErrorCode = '';
        }

        if (parsedErrorCode === 'permission_error') {
          const { expand, ...fallbackParams } = params;
          try {
            return await swellFetch<T>(path, fallbackParams, {
              allowExpandFallback: false,
              currencyCode: normalizedCurrency,
            });
          } catch (fallbackError) {
            errors.push(
              `expand fallback failed for ${path}: ${(fallbackError as Error)?.message || 'unknown error'}`
            );
          }
        }
      }

      errors.push(`${status} ${requestUrl} -> ${body || '(empty body)'}`);
    }
  }

  throw new Error(`Swell API request failed for ${path}. Attempts: ${errors.join(' | ')}`);
}

function cleanHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toAmountString(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '0';

  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return '0';

  return parsed.toFixed(2);
}

function buildCompareAtPrice(
  currentAmount: number | string | undefined,
  compareAmount: number | string | undefined,
  currencyCode: string
) {
  const current = Number(currentAmount ?? 0);
  const compare = Number(compareAmount ?? 0);

  if (!Number.isFinite(current) || !Number.isFinite(compare) || compare <= current) {
    return undefined;
  }

  return {
    amount: toAmountString(compare),
    currencyCode,
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return Math.floor(parsed);
}

function extractPriceAmount(value: unknown): number | null {
  const queue: unknown[] = [value];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    const directNumber = toFiniteNumber(current);
    if (directNumber !== null) return directNumber;

    if (!current) continue;

    if (Array.isArray(current)) {
      current.forEach(item => queue.push(item));
      continue;
    }

    const record = toRecord(current);
    if (!record || seen.has(record)) continue;
    seen.add(record);

    const directCandidate =
      record.amount ??
      record.price ??
      record.value ??
      record.sale_price ??
      record.unit_price ??
      record.discounted_price ??
      record.original_price;

    const candidateNumber = toFiniteNumber(directCandidate);
    if (candidateNumber !== null) return candidateNumber;

    Object.values(record).forEach(nested => queue.push(nested));
  }

  return null;
}

function parseBulkPriceTier(rule: unknown, fallbackCurrencyCode: string): BulkPriceTier | null {
  const record = toRecord(rule);
  if (!record) return null;

  const minQuantity =
    toPositiveInteger(record.quantity_min) ??
    toPositiveInteger(record.quantityMin) ??
    toPositiveInteger(record.min_quantity) ??
    toPositiveInteger(record.minQuantity) ??
    toPositiveInteger(record.qty_min) ??
    toPositiveInteger(record.min_qty) ??
    toPositiveInteger(record.minimum_quantity) ??
    toPositiveInteger(record.minimumQuantity) ??
    toPositiveInteger(record.quantity) ??
    toPositiveInteger(record.qty) ??
    toPositiveInteger(record.from) ??
    toPositiveInteger(record.min);

  if (!minQuantity || minQuantity < 2) return null;

  const maxQuantityCandidate =
    toPositiveInteger(record.quantity_max) ??
    toPositiveInteger(record.quantityMax) ??
    toPositiveInteger(record.max_quantity) ??
    toPositiveInteger(record.maxQuantity) ??
    toPositiveInteger(record.qty_max) ??
    toPositiveInteger(record.max_qty) ??
    toPositiveInteger(record.maximum_quantity) ??
    toPositiveInteger(record.maximumQuantity) ??
    toPositiveInteger(record.to) ??
    toPositiveInteger(record.max);

  const maxQuantity = maxQuantityCandidate && maxQuantityCandidate >= minQuantity ? maxQuantityCandidate : undefined;

  const amount =
    extractPriceAmount(record.price) ??
    extractPriceAmount(record.amount) ??
    extractPriceAmount(record.value) ??
    extractPriceAmount(record.sale_price) ??
    extractPriceAmount(record.salePrice) ??
    extractPriceAmount(record.unit_price) ??
    extractPriceAmount(record.unitPrice);

  if (amount === null) return null;

  const currencyCandidate =
    (typeof record.currencyCode === 'string' && record.currencyCode) ||
    (typeof record.currency_code === 'string' && record.currency_code) ||
    (typeof record.currency === 'string' && record.currency) ||
    fallbackCurrencyCode;

  return {
    minQuantity,
    maxQuantity,
    price: {
      amount: toAmountString(amount),
      currencyCode: String(currencyCandidate || fallbackCurrencyCode || DEFAULT_CURRENCY).toUpperCase(),
    },
  };
}

function extractBulkPriceTiers(
  source: unknown,
  fallbackCurrencyCode: string,
  options: { ignoreKeys?: string[] } = {}
): BulkPriceTier[] {
  if (!source) return [];

  const queue: unknown[] = [source];
  const seen = new Set<object>();
  const candidates: unknown[] = [];
  const ignoredKeys = new Set((options.ignoreKeys || []).map(key => key.toLowerCase()));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      current.forEach(item => queue.push(item));
      continue;
    }

    const record = toRecord(current);
    if (!record || seen.has(record)) continue;
    seen.add(record);

    const rules =
      record.price_rules ??
      record.priceRules ??
      record.pricing_rules ??
      record.pricingRules ??
      record.price_breaks ??
      record.priceBreaks ??
      record.quantity_pricing ??
      record.quantityPricing ??
      record.tiers ??
      record.prices;

    if (Array.isArray(rules)) {
      candidates.push(...rules);
    } else if (rules) {
      queue.push(rules);
    }

    Object.entries(record).forEach(([key, value]) => {
      if (ignoredKeys.has(key.toLowerCase())) return;
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    });
  }

  const parsed = candidates
    .map(candidate => parseBulkPriceTier(candidate, fallbackCurrencyCode))
    .filter((tier): tier is BulkPriceTier => Boolean(tier));

  const deduped = new Map<string, BulkPriceTier>();
  parsed.forEach(tier => {
    const key = `${tier.minQuantity}|${tier.maxQuantity ?? ''}|${tier.price.amount}|${tier.price.currencyCode}`;
    if (!deduped.has(key)) {
      deduped.set(key, tier);
    }
  });

  return Array.from(deduped.values()).sort(
    (left, right) => left.minQuantity - right.minQuantity || Number(left.price.amount) - Number(right.price.amount)
  );
}

function getImageUrl(image?: SwellApiImage): string {
  const direct = image?.file?.url || image?.url || '';
  if (!direct) return '';
  if (/^https?:\/\//i.test(direct)) return direct;
  if (direct.startsWith('//')) return `https:${direct}`;
  if (direct.startsWith('/')) return `${SWELL_BASE_URL}${direct}`;
  return direct;
}

function getImageAltText(image: SwellApiImage | undefined, fallback = ''): string {
  const explicitAlt = image?.alt || image?.caption || image?.name;
  if (explicitAlt) return explicitAlt;

  const imageUrl = getImageUrl(image);
  if (!imageUrl) return fallback;

  try {
    const pathname = new URL(imageUrl).pathname;
    const filename = decodeURIComponent(pathname.split('/').pop() || '');
    const withoutExtension = filename.replace(/\.[^.]+$/, '');
    if (withoutExtension) return withoutExtension;
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeHandle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeSearchText(value: string): string {
  return normalizeSearchToken(value);
}

function getCategoryKeywordFallbackTerms(categoryHandle?: string, categoryTitle?: string): string[] {
  const normalizedHandle = normalizeHandle(categoryHandle || '');
  const fromMap = normalizedHandle ? CATEGORY_KEYWORD_FALLBACKS[normalizedHandle] || [] : [];

  const fromHandle = (categoryHandle || '')
    .split('-')
    .map(token => token.trim().toLowerCase())
    .filter(token => token && !CATEGORY_KEYWORD_STOPWORDS.has(token));

  const fromTitle = normalizeSearchText(categoryTitle || '')
    .split(' ')
    .map(token => token.trim().toLowerCase())
    .filter(token => token && !CATEGORY_KEYWORD_STOPWORDS.has(token));

  return Array.from(new Set([...fromMap, ...fromHandle, ...fromTitle].map(term => normalizeSearchToken(term)).filter(Boolean)));
}

function unwrapResults<T>(input: SwellApiListResponse<T> | T[] | null | undefined): T[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.results)) return input.results;
  return [];
}

function toCategoryRef(category: SwellApiCategory | string | undefined): SwellApiCategory | null {
  if (!category) return null;
  if (typeof category === 'string') {
    return {
      id: category,
      slug: category,
    };
  }
  return category;
}

function getProductCategories(product: SwellApiProduct): SwellApiCategory[] {
  const explicit = unwrapResults(product.categories);
  const fromCategories = explicit
    .map(category => toCategoryRef(category as SwellApiCategory | string))
    .filter((category): category is SwellApiCategory => Boolean(category));

  const fromCategory = toCategoryRef(product.category);
  const fromCategoryId = product.category_id ? ({ id: product.category_id } as SwellApiCategory) : null;

  const deduped = new Map<string, SwellApiCategory>();
  [...fromCategories, fromCategory, fromCategoryId]
    .filter((category): category is SwellApiCategory => Boolean(category))
    .forEach(category => {
      const key = String(category.id || category.slug || category.name || '');
      if (key && !deduped.has(key)) {
        deduped.set(key, category);
      }
    });

  return Array.from(deduped.values());
}

function categoryMatchesHandle(category: SwellApiCategory | string | undefined, normalizedHandle: string): boolean {
  if (!category || !normalizedHandle) return false;

  if (typeof category === 'string') {
    return normalizeHandle(category) === normalizedHandle;
  }

  const candidates = [category.slug, category.name, category.id]
    .map(value => normalizeHandle(String(value || '')))
    .filter(Boolean);

  return candidates.includes(normalizedHandle);
}

function productMatchesCategory(
  product: SwellApiProduct,
  normalizedCategoryMatches: string[],
  categoryId?: string
): boolean {
  const categories = getProductCategories(product);
  if (categories.length === 0) return false;

  if (categoryId) {
    const normalizedCategoryId = normalizeHandle(categoryId);
    const hasMatchingId = categories.some(category => {
      const currentId = String(category.id || '');
      return currentId === categoryId || normalizeHandle(currentId) === normalizedCategoryId;
    });

    if (hasMatchingId) return true;
  }

  const matchTerms = normalizedCategoryMatches.filter(Boolean);
  if (matchTerms.length === 0) return false;

  return categories.some(category => matchTerms.some(matchTerm => categoryMatchesHandle(category, matchTerm)));
}

function getCategorySlugValue(category: SwellApiCategory | string | undefined): string {
  if (!category) return '';
  if (typeof category === 'string') return normalizeHandle(category);
  return normalizeHandle(String(category.slug || category.name || category.id || ''));
}

function getCategoryHandleValue(category: SwellApiCategory | string | undefined): string {
  return getCategorySlugValue(category);
}

function mapSwellCategory(category: SwellApiCategory): AppCollection {
  const id = String(category.id || category.slug || category.name || '');
  const handle = getCategoryHandleValue(category);

  return {
    id,
    title: category.name || 'Untitled',
    handle: handle || id,
    description: category.description || '',
  };
}

function isPurchasableFromStockStatus(stockStatus?: string, stockPurchasable?: boolean): boolean {
  if (stockPurchasable) return true;
  if (!stockStatus) return true;
  return ['in_stock', 'available', 'backorder', 'preorder'].includes(stockStatus);
}

function buildVariantId(productId: string, variantId?: string) {
  const safeProductId = encodeURIComponent(productId);
  if (!variantId) return `swell:product:${safeProductId}`;
  return `swell:product:${safeProductId}:variant:${encodeURIComponent(variantId)}`;
}

function extractIdsFromVariantId(variantId: string): { productId: string; variantId?: string } | null {
  const match = variantId.match(/^swell:product:([^:]+)(?::variant:(.+))?$/);
  if (!match) return null;

  const productId = decodeURIComponent(match[1]);
  const parsedVariantId = match[2] ? decodeURIComponent(match[2]) : undefined;

  if (!productId) return null;

  return {
    productId,
    variantId: parsedVariantId,
  };
}

function mapSwellProduct(product: SwellApiProduct, fallbackCurrencyCode = DEFAULT_CURRENCY): AppProduct {
  const productId = String(product.id || product.slug || product.name || Math.random().toString(36).slice(2));
  const currencyCode = normalizeCurrencyCode(product.currency || fallbackCurrencyCode, DEFAULT_CURRENCY);
  const productBulkPriceTiers = extractBulkPriceTiers(product, currencyCode, { ignoreKeys: ['variants'] });

  const basePrice = product.sale ? product.sale_price ?? product.price : product.price;
  const comparePrice = product.orig_price ?? product.price;

  const productOptionValueLookup = new Map<string, { name: string; value: string }>();
  (product.options || []).forEach(option => {
    const optionName = option.name || 'Option';
    (option.values || []).forEach(value => {
      const id = String(value.id || value.value || value.name || value.label || '');
      const label = value.value || value.name || value.label || '';
      if (!id || !label) return;
      if (!productOptionValueLookup.has(id)) {
        productOptionValueLookup.set(id, {
          name: optionName,
          value: label,
        });
      }
    });
  });

  const getVariantSelectedOptions = (variant: SwellApiVariant) => {
    const fromOptionValues = (variant.option_values || [])
      .map(optionValue => {
        const optionName = optionValue.option?.name || '';
        const optionLabel = optionValue.value || optionValue.name || optionValue.label || '';

        if (!optionName || !optionLabel) return null;
        return {
          name: optionName,
          value: optionLabel,
        };
      })
      .filter((option): option is { name: string; value: string } => Boolean(option));

    const fromOptionsObject = Object.entries(variant.options || {})
      .map(([name, value]) => {
        if (!name || !value) return null;
        return { name, value };
      })
      .filter((option): option is { name: string; value: string } => Boolean(option));

    const fromOptionValueIds = (variant.option_value_ids || [])
      .map(optionValueId => productOptionValueLookup.get(String(optionValueId)))
      .filter((option): option is { name: string; value: string } => Boolean(option));

    return [...fromOptionValues, ...fromOptionsObject, ...fromOptionValueIds]
      .filter((option, index, self) => self.findIndex(item => item.name.toLowerCase() === option.name.toLowerCase()) === index)
      .filter((option): option is { name: string; value: string } => Boolean(option));
  };

  const apiVariants = unwrapResults(product.variants).filter(variant => (variant.active ?? true) !== false);
  const normalizedVariants = apiVariants.map(variant => {
    const selectedOptions = getVariantSelectedOptions(variant);
    const variantCurrencyCode = normalizeCurrencyCode(variant.currency || currencyCode, currencyCode);
    const variantBulkPriceTiers = extractBulkPriceTiers(variant, variantCurrencyCode);
    const variantCurrentPrice = variant.sale ? variant.sale_price ?? variant.price : variant.price ?? basePrice;
    const variantCompareAtPrice = buildCompareAtPrice(
      variantCurrentPrice,
      variant.orig_price ?? variant.price,
      variantCurrencyCode
    );

    return {
      id: buildVariantId(productId, String(variant.id || variant.sku || variant.name || 'default')),
      title: variant.name || variant.sku || 'Default',
      sku: variant.sku || undefined,
      price: {
        amount: toAmountString(variantCurrentPrice),
        currencyCode: variantCurrencyCode,
      },
      compareAtPrice: variantCompareAtPrice,
      availableForSale: isPurchasableFromStockStatus(variant.stock_status, variant.stock_purchasable),
      stockStatus: variant.stock_status,
      stockLevel: variant.stock_level,
      selectedOptions,
      images: variant.images || [],
      bulkPriceTiers: variantBulkPriceTiers.length > 0 ? variantBulkPriceTiers : undefined,
    };
  });

  const imageCandidates = [product.image, ...(product.images || [])].filter(Boolean) as SwellApiImage[];
  const productImageNodes = imageCandidates
    .map(image => ({
      node: {
        url: getImageUrl(image),
        altText: getImageAltText(image, product.name || ''),
        thumbhash: undefined,
        selectedOptions: undefined,
      },
    }))
    .filter(image => Boolean(image.node.url));

  const variantImageNodes = normalizedVariants.flatMap(variant =>
    (variant.images || [])
      .map(image => ({
        node: {
          url: getImageUrl(image),
          altText: getImageAltText(image, `${product.name || 'Product'} ${variant.title}`),
          thumbhash: undefined,
          selectedOptions: variant.selectedOptions.map(option => ({
            name: option.name.toLowerCase(),
            value: option.value.toLowerCase(),
          })),
        },
      }))
      .filter(image => Boolean(image.node.url))
  );

  const imageNodes = [...productImageNodes, ...variantImageNodes].filter((image, index, self) => {
    const signature = `${image.node.url}|${(image.node.selectedOptions || [])
      .map((option: { name: string; value: string }) => `${option.name}:${option.value}`)
      .join(',')}`;
    return (
      self.findIndex(candidate => {
        const candidateSignature = `${candidate.node.url}|${(candidate.node.selectedOptions || [])
          .map((option: { name: string; value: string }) => `${option.name}:${option.value}`)
          .join(',')}`;
        return candidateSignature === signature;
      }) === index
    );
  });

  const categories = getProductCategories(product);
  const firstCategory = categories[0];

  const rawVariants = normalizedVariants.map(variant => ({
    node: {
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      availableForSale: variant.availableForSale,
      stockStatus: variant.stockStatus,
      stockLevel: variant.stockLevel,
      selectedOptions: variant.selectedOptions,
      bulkPriceTiers: variant.bulkPriceTiers,
    },
  }));

  const normalizedOptions = (product.options || [])
    .filter(option => option.variant !== false)
    .map(option => ({
      id: String(option.id || option.name || ''),
      name: option.name || 'Option',
      values: (option.values || [])
        .map(value => value.value || value.name || value.label || '')
        .filter((value): value is string => Boolean(value)),
    }))
    .filter(option => option.values.length > 0);

  const variantPrices = rawVariants
    .map(variant => Number(variant.node.price.amount))
    .filter(price => Number.isFinite(price));
  const minVariantAmount = variantPrices.length > 0 ? Math.min(...variantPrices) : Number(basePrice || 0);
  const lowestPricedVariant = rawVariants.find(variant => Number(variant.node.price.amount) === minVariantAmount);
  const productCompareAtPrice =
    lowestPricedVariant?.node.compareAtPrice ||
    buildCompareAtPrice(minVariantAmount, comparePrice, currencyCode);

  return {
    id: `swell://product/${productId}`,
    title: product.name || 'Untitled',
    description: cleanHtml(product.description || product.content || ''),
    descriptionHtml: product.description || product.content || '',
    handle: product.slug || productId,
    productType: product.type || firstCategory?.name || 'standard',
    availableForSale: isPurchasableFromStockStatus(product.stock_status, product.stock_purchasable),
    stockStatus: product.stock_status,
    stockLevel: product.stock_level,
    purchaseCount: product.purchase_count ?? 0,
    category: firstCategory
      ? {
          id: String(firstCategory.id || firstCategory.slug || firstCategory.name || ''),
          name: firstCategory.name || 'Category',
          handle: getCategoryHandleValue(firstCategory),
        }
      : undefined,
    options: normalizedOptions,
    images: {
      edges: imageNodes,
    },
    bulkPriceTiers: productBulkPriceTiers.length > 0 ? productBulkPriceTiers : undefined,
    priceRange: {
      minVariantPrice: {
        amount: toAmountString(minVariantAmount),
        currencyCode,
      },
    },
    compareAtPriceRange: {
      minVariantPrice: {
        amount: productCompareAtPrice?.amount || toAmountString(minVariantAmount),
        currencyCode: productCompareAtPrice?.currencyCode || currencyCode,
      },
    },
    variants: {
      edges:
        rawVariants.length > 0
          ? rawVariants
          : [
              {
                node: {
                  id: buildVariantId(productId),
                  title: 'Default',
                  sku: undefined,
                  price: {
                    amount: toAmountString(basePrice),
                    currencyCode,
                  },
                  compareAtPrice: buildCompareAtPrice(basePrice, comparePrice, currencyCode),
                  availableForSale: isPurchasableFromStockStatus(product.stock_status, product.stock_purchasable),
                  stockStatus: product.stock_status,
                  stockLevel: product.stock_level,
                  selectedOptions: [],
                  bulkPriceTiers: productBulkPriceTiers.length > 0 ? productBulkPriceTiers : undefined,
                },
              },
            ],
    },
  };
}

function sortProducts(
  products: SwellApiProduct[],
  sortKey: ProductSortKey | ProductCollectionSortKey,
  reverse: boolean
): SwellApiProduct[] {
  const sorted = [...products];

  const getComparableValue = (product: SwellApiProduct): string | number => {
    switch (sortKey) {
      case 'PRICE':
        return Number(product.sale_price ?? product.price ?? 0);
      case 'TITLE':
        return (product.name || '').toLowerCase();
      case 'CREATED':
      case 'CREATED_AT':
        return new Date(product.date_created || 0).getTime();
      default:
        return 0;
    }
  };

  sorted.sort((a, b) => {
    const left = getComparableValue(a);
    const right = getComparableValue(b);

    if (typeof left === 'string' && typeof right === 'string') {
      return left.localeCompare(right);
    }

    return Number(left) - Number(right);
  });

  return reverse ? sorted.reverse() : sorted;
}

function productMatchesQuery(product: SwellApiProduct, query?: string): boolean {
  if (!query) return true;

  const needle = query.toLowerCase();
  const haystack = `${product.name || ''} ${product.slug || ''} ${cleanHtml(product.description || product.content || '')}`.toLowerCase();
  return haystack.includes(needle);
}

function productMatchesCategoryKeywords(product: SwellApiProduct, terms: string[]): boolean {
  if (terms.length === 0) return false;

  const haystack = normalizeSearchText(
    [
      product.name || '',
      product.slug || '',
      product.type || '',
      cleanHtml(product.description || product.content || ''),
      ...(product.tags || []),
    ].join(' ')
  );

  return terms.some(term => haystack.includes(term));
}

async function getSwellCategories(): Promise<AppCollection[]> {
  const limit = 100;
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  const categories: SwellApiCategory[] = [];

  while (categories.length < total) {
    const categoriesResponse = await swellFetch<SwellApiListResponse<SwellApiCategory>>('/categories', {
      limit,
      page,
    });

    const batch = unwrapResults(categoriesResponse);
    const reportedCount = Number(categoriesResponse.count || 0);
    if (Number.isFinite(reportedCount) && reportedCount > 0) {
      total = reportedCount;
    }

    categories.push(...batch);

    if (batch.length < limit) break;
    page += 1;

    if (page > 50) break;
  }

  const seen = new Set<string>();
  const uniqueCategories = categories.filter(category => {
    const key = String(category.id || category.slug || category.name || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueCategories.map(mapSwellCategory);
}

async function resolveCategoryByHandle(handle: string): Promise<AppCollection | null> {
  const normalizedHandle = normalizeHandle(handle);
  const categories = await getSwellCategories();
  return categories.find(category => normalizeHandle(category.handle) === normalizedHandle) || null;
}

function hasVariantOptions(product: SwellApiProduct): boolean {
  return (product.options || []).some(option => option.variant !== false && (option.values || []).length > 0);
}

function hasResolvedVariants(product: SwellApiProduct): boolean {
  return unwrapResults(product.variants).length > 0;
}

async function hydrateProductForVariants(
  product: SwellApiProduct,
  currencyCode?: string
): Promise<SwellApiProduct> {
  if (!product.id) return product;
  if (!hasVariantOptions(product) || hasResolvedVariants(product)) return product;

  try {
    const hydrated = await swellFetch<SwellApiProduct>(
      `/products/${encodeURIComponent(String(product.id))}`,
      {
        expand: PRODUCT_EXPAND_FIELDS,
      },
      { currencyCode }
    );
    return hydrated || product;
  } catch (error) {
    console.error(`Failed to hydrate variant data for product ${product.id}:`, error);
    return product;
  }
}

async function getSwellProducts(params: {
  first?: number;
  limit?: number;
  sortKey?: ProductSortKey | ProductCollectionSortKey;
  reverse?: boolean;
  query?: string;
  categoryHandle?: string;
  currencyCode?: string;
}): Promise<AppProduct[]> {
  const {
    first = DEFAULT_PAGE_SIZE,
    limit,
    sortKey = DEFAULT_SORT_KEY,
    reverse = false,
    query,
    categoryHandle,
    currencyCode,
  } = params;

  const pageSize = Math.max(limit || first, DEFAULT_PAGE_SIZE);
  const normalizedCategoryHandle = categoryHandle ? normalizeHandle(categoryHandle) : undefined;
  const category = normalizedCategoryHandle ? await resolveCategoryByHandle(normalizedCategoryHandle) : null;
  const categoryId = category?.id;
  const normalizedCategoryMatches = Array.from(
    new Set(
      [normalizedCategoryHandle, normalizeHandle(category?.title || ''), normalizeHandle(category?.handle || '')].filter(
        Boolean
      )
    )
  ) as string[];
  const categoryFilter = categoryId || normalizedCategoryHandle;
  const wantsLargePage = Boolean(categoryHandle || query);
  const targetCount = Math.max(pageSize, wantsLargePage ? 100 : pageSize);
  const perPage = Math.min(targetCount, 100);
  const collectedProducts: SwellApiProduct[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (collectedProducts.length < targetCount && collectedProducts.length < total) {
    const productsResponse = await swellFetch<SwellApiListResponse<SwellApiProduct>>(
      '/products',
      {
        limit: perPage,
        page,
        expand: PRODUCT_EXPAND_FIELDS,
        category: categoryFilter,
        search: query,
      },
      { currencyCode }
    );

    const batch = unwrapResults(productsResponse);
    const reportedCount = Number(productsResponse.count || 0);
    if (Number.isFinite(reportedCount) && reportedCount > 0) {
      total = reportedCount;
    }

    collectedProducts.push(...batch);

    if (batch.length < perPage) break;
    page += 1;

    if (page > 50) break;
  }

  const allProducts = collectedProducts.filter(product => (product.active ?? true) !== false);

  let filtered = allProducts.filter(product => productMatchesQuery(product, query));

  // Fallback: if API category filtering returns an empty list, resolve category membership locally.
  // This handles stores where `category` query param matching differs across environments.
  if (normalizedCategoryHandle && filtered.length === 0) {
    const fallbackCollectedProducts: SwellApiProduct[] = [];
    let fallbackPage = 1;
    let fallbackTotal = Number.POSITIVE_INFINITY;

    while (
      fallbackCollectedProducts.length < targetCount &&
      fallbackCollectedProducts.length < fallbackTotal
    ) {
      const fallbackResponse = await swellFetch<SwellApiListResponse<SwellApiProduct>>(
        '/products',
        {
          limit: perPage,
          page: fallbackPage,
          expand: PRODUCT_EXPAND_FIELDS,
          search: query,
        },
        { currencyCode }
      );

      const fallbackBatch = unwrapResults(fallbackResponse);
      const fallbackReportedCount = Number(fallbackResponse.count || 0);
      if (Number.isFinite(fallbackReportedCount) && fallbackReportedCount > 0) {
        fallbackTotal = fallbackReportedCount;
      }

      fallbackCollectedProducts.push(...fallbackBatch);

      if (fallbackBatch.length < perPage) break;
      fallbackPage += 1;

      if (fallbackPage > 50) break;
    }

    const fallbackActiveProducts = fallbackCollectedProducts.filter(product => (product.active ?? true) !== false);
    const locallyMatchedProducts = fallbackActiveProducts.filter(product =>
      productMatchesCategory(product, normalizedCategoryMatches, categoryId)
    );
    filtered = locallyMatchedProducts.filter(product => productMatchesQuery(product, query));

    // Final fallback: when category relations are unavailable in storefront API, classify by category keywords.
    if (filtered.length === 0) {
      const keywordTerms = getCategoryKeywordFallbackTerms(categoryHandle, category?.title);
      filtered = fallbackActiveProducts
        .filter(product => productMatchesCategoryKeywords(product, keywordTerms))
        .filter(product => productMatchesQuery(product, query));
    }
  }

  const sorted = sortProducts(filtered, sortKey, reverse);
  const pageProducts = sorted.slice(0, pageSize);

  const hydratedProducts = await Promise.all(pageProducts.map(product => hydrateProductForVariants(product, currencyCode)));
  return hydratedProducts.map(product => mapSwellProduct(product, currencyCode));
}

async function getProductByVariantId(variantId: string, currencyCode?: string): Promise<AppProduct | null> {
  const parsed = extractIdsFromVariantId(variantId);
  if (!parsed) return null;

  const normalizedCurrency = normalizeCurrencyCode(currencyCode, DEFAULT_CURRENCY);
  const cacheKey = `${variantId}::${normalizedCurrency}`;
  const now = Date.now();
  const cached = productByVariantCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const lookupPromise = (async () => {
    try {
      const product = await swellFetch<SwellApiProduct>(
        `/products/${encodeURIComponent(parsed.productId)}`,
        {
          expand: PRODUCT_EXPAND_FIELDS,
        },
        { currencyCode: normalizedCurrency }
      );

      return mapSwellProduct(product, normalizedCurrency);
    } catch (error) {
      console.error('Unable to resolve Swell product for cart variant:', error);
      return null;
    }
  })();

  productByVariantCache.set(cacheKey, {
    expiresAt: now + PRODUCT_LOOKUP_TTL_MS,
    value: lookupPromise,
  });

  try {
    const product = await lookupPromise;
    if (product === null) {
      productByVariantCache.delete(cacheKey);
    }
    return product;
  } catch {
    productByVariantCache.delete(cacheKey);
    return null;
  }
}

function toSwellCart(state: CartState, fallbackCurrencyCode?: string): AppCart {
  const currencyCode = state.lines[0]?.merchandise.price.currencyCode || normalizeCurrencyCode(fallbackCurrencyCode, DEFAULT_CURRENCY);
  const subtotal = state.lines
    .reduce((sum, line) => {
      const unitPrice = resolveUnitPrice(line.merchandise.price.amount, line.quantity, line.bulkPriceTiers);
      return sum + Number(unitPrice) * line.quantity;
    }, 0)
    .toFixed(2);

  return {
    id: state.id,
    lines: {
      edges: state.lines.map(line => ({
        node: {
          id: line.id,
          quantity: line.quantity,
          bulkPriceTiers: line.bulkPriceTiers,
          merchandise: line.merchandise,
        },
      })),
    },
    cost: {
      totalAmount: {
        amount: subtotal,
        currencyCode,
      },
      subtotalAmount: {
        amount: subtotal,
        currencyCode,
      },
      totalTaxAmount: {
        amount: '0',
        currencyCode,
      },
    },
    checkoutUrl: CHECKOUT_URL,
  };
}

function buildLineId(cartId: string, variantId: string) {
  return `${cartId}:${variantId}`;
}

function resolveCartAvailableQuantity(
  product: AppProduct,
  variant?: AppProduct['variants']['edges'][number]['node'] | null
): number | null {
  if (typeof variant?.stockLevel === 'number') {
    return variant.stockLevel;
  }

  if (!variant || product.variants.edges.length <= 1) {
    return typeof product.stockLevel === 'number' ? product.stockLevel : null;
  }

  return null;
}

// Get all products
export async function getProducts({
  first = DEFAULT_PAGE_SIZE,
  limit,
  sortKey = DEFAULT_SORT_KEY,
  reverse = false,
  query: searchQuery,
  currencyCode,
}: {
  first?: number;
  limit?: number;
  sortKey?: ProductSortKey;
  reverse?: boolean;
  query?: string;
  currencyCode?: string;
}): Promise<AppProduct[]> {
  return getSwellProducts({
    first,
    limit,
    sortKey,
    reverse,
    query: searchQuery,
    currencyCode,
  });
}

// Get single product by handle
export async function getProduct(handle: string, currencyCode?: string): Promise<AppProduct | null> {
  const normalizedHandle = normalizeHandle(handle);
  const matchingProducts = await swellFetch<SwellApiListResponse<SwellApiProduct>>(
    '/products',
    {
      where: { slug: normalizedHandle },
      limit: 1,
      page: 1,
      expand: PRODUCT_EXPAND_FIELDS,
    },
    { currencyCode }
  );

  const matchedProduct = unwrapResults(matchingProducts).find(
    item => normalizeHandle(item.slug || '') === normalizedHandle
  );
  if (matchedProduct && (matchedProduct.active ?? true) !== false) {
    const hydratedProduct = await hydrateProductForVariants(matchedProduct, currencyCode);
    return mapSwellProduct(hydratedProduct, currencyCode);
  }

  const products = await swellFetch<SwellApiListResponse<SwellApiProduct>>(
    '/products',
    {
      search: normalizedHandle,
      limit: 100,
      page: 1,
      expand: PRODUCT_EXPAND_FIELDS,
    },
    { currencyCode }
  );

  const fallback = unwrapResults(products).find(item => normalizeHandle(item.slug || '') === normalizedHandle);
  if (fallback && (fallback.active ?? true) !== false) {
    const hydratedFallback = await hydrateProductForVariants(fallback, currencyCode);
    return mapSwellProduct(hydratedFallback, currencyCode);
  }

  return null;
}

// Get collections
export async function getCollections(first?: number): Promise<AppCollection[]> {
  const categories = await getSwellCategories();
  if (typeof first === 'number') {
    return categories.slice(0, first);
  }
  return categories;
}

// Get products from a specific collection
export async function getCollectionProducts({
  collection,
  limit = DEFAULT_PAGE_SIZE,
  sortKey = DEFAULT_SORT_KEY,
  query: searchQuery,
  reverse = false,
  currencyCode,
}: {
  collection: string;
  limit?: number;
  sortKey?: ProductCollectionSortKey;
  query?: string;
  reverse?: boolean;
  currencyCode?: string;
}): Promise<AppProduct[]> {
  return getSwellProducts({
    limit,
    sortKey,
    reverse,
    query: searchQuery,
    categoryHandle: collection,
    currencyCode,
  });
}

// Create cart (headless in-memory cart state)
export async function createCart(currencyCode?: string): Promise<AppCart> {
  const cartId = `swell-cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const state: CartState = { id: cartId, lines: [] };
  cartStore.set(cartId, state);
  return toSwellCart(state, currencyCode);
}

// Add items to cart
export async function addCartLines(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>,
  currencyCode?: string
): Promise<AppCart> {
  let state = cartStore.get(cartId);
  if (!state) {
    state = { id: cartId, lines: [] };
    cartStore.set(cartId, state);
  }

  for (const line of lines) {
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const existing = state.lines.find(item => item.variantId === line.merchandiseId);
    const product = await getProductByVariantId(line.merchandiseId, currencyCode);
    if (!product) continue;
    const selectedVariant =
      product.variants.edges.find(edge => edge.node.id === line.merchandiseId)?.node || product.variants.edges[0]?.node;
    const availableQuantity = resolveCartAvailableQuantity(product, selectedVariant);
    const maxQuantity = availableQuantity === null ? null : Math.max(existing?.quantity || 0, availableQuantity);
    const clampedQuantity = maxQuantity === null ? quantity : Math.max(0, Math.min(quantity, maxQuantity));

    if (existing) {
      existing.quantity = maxQuantity === null ? existing.quantity + quantity : Math.min(existing.quantity + quantity, maxQuantity);
      existing.merchandise.availableQuantity = availableQuantity;
      existing.merchandise.product.availableForSale = selectedVariant?.availableForSale ?? product.availableForSale;
      existing.merchandise.product.stockStatus = selectedVariant?.stockStatus ?? product.stockStatus;
      existing.merchandise.product.stockLevel = selectedVariant?.stockLevel ?? product.stockLevel;
      existing.merchandise.product.compareAtPrice =
        selectedVariant?.compareAtPrice ?? product.compareAtPriceRange?.minVariantPrice;
      continue;
    }

    const firstImage = product.images.edges[0]?.node;

    const variantTiers = selectedVariant?.bulkPriceTiers;
    const lineTiers = variantTiers?.length ? variantTiers : product.bulkPriceTiers || undefined;

    if (clampedQuantity <= 0) {
      continue;
    }

    state.lines.push({
      id: buildLineId(cartId, line.merchandiseId),
      variantId: line.merchandiseId,
      quantity: clampedQuantity,
      bulkPriceTiers: lineTiers,
      merchandise: {
        id: line.merchandiseId,
        title: selectedVariant?.title || product.title,
        sku: selectedVariant?.sku || undefined,
        price: selectedVariant?.price || {
          amount: product.priceRange.minVariantPrice.amount,
          currencyCode: product.priceRange.minVariantPrice.currencyCode,
        },
        availableQuantity,
        selectedOptions: selectedVariant?.selectedOptions || [],
        product: {
          title: product.title,
          handle: product.handle,
          availableForSale: selectedVariant?.availableForSale ?? product.availableForSale,
          stockStatus: selectedVariant?.stockStatus ?? product.stockStatus,
          stockLevel: selectedVariant?.stockLevel ?? product.stockLevel,
          compareAtPrice: selectedVariant?.compareAtPrice ?? product.compareAtPriceRange?.minVariantPrice,
          images: {
            edges: firstImage
              ? [
                  {
                    node: {
                      url: firstImage.url,
                      altText: firstImage.altText,
                      thumbhash: firstImage.thumbhash,
                    },
                  },
                ]
              : [],
          },
        },
      },
    });
  }

  return toSwellCart(state, currencyCode);
}

// Update items in cart
export async function updateCartLines(
  cartId: string,
  lines: Array<{ id: string; quantity: number }>,
  currencyCode?: string
): Promise<AppCart> {
  const state = cartStore.get(cartId) || { id: cartId, lines: [] };
  cartStore.set(cartId, state);

  for (const incoming of lines) {
    const index = state.lines.findIndex(line => line.id === incoming.id);
    if (index === -1) continue;

    if (incoming.quantity <= 0) {
      state.lines.splice(index, 1);
    } else {
      const line = state.lines[index];
      const product = await getProductByVariantId(line.variantId, currencyCode);
      const selectedVariant =
        product?.variants.edges.find(edge => edge.node.id === line.variantId)?.node || product?.variants.edges[0]?.node;
      const availableQuantity = product
        ? resolveCartAvailableQuantity(product, selectedVariant)
        : line.merchandise.availableQuantity ?? null;
      const maxQuantity = availableQuantity === null ? null : Math.max(line.quantity, availableQuantity);

      line.quantity = maxQuantity === null ? incoming.quantity : Math.min(incoming.quantity, maxQuantity);
      line.merchandise.availableQuantity = availableQuantity;

      if (product) {
        line.merchandise.product.availableForSale = selectedVariant?.availableForSale ?? product.availableForSale;
        line.merchandise.product.stockStatus = selectedVariant?.stockStatus ?? product.stockStatus;
        line.merchandise.product.stockLevel = selectedVariant?.stockLevel ?? product.stockLevel;
        line.merchandise.product.compareAtPrice =
          selectedVariant?.compareAtPrice ?? product.compareAtPriceRange?.minVariantPrice;
      }
    }
  }

  return toSwellCart(state, currencyCode);
}

// Remove items from cart
export async function removeCartLines(cartId: string, lineIds: string[], currencyCode?: string): Promise<AppCart> {
  const state = cartStore.get(cartId) || { id: cartId, lines: [] };
  cartStore.set(cartId, state);

  state.lines = state.lines.filter(line => !lineIds.includes(line.id));

  return toSwellCart(state, currencyCode);
}

// Get cart
export async function getCart(cartId: string, currencyCode?: string): Promise<AppCart | null> {
  const state = cartStore.get(cartId);
  if (!state) return null;
  return toSwellCart(state, currencyCode);
}
