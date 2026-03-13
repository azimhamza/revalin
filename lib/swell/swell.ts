import {
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
const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_STORE_CURRENCY || 'USD';
const PRODUCT_EXPAND_FIELDS = HAS_SECRET_KEY ? 'variants,categories,category,stock' : 'category';
const CATEGORY_KEYWORD_FALLBACKS: Record<string, string[]> = {
  'metabolic-peptides': ['metabolic', 'retatrutide', 'cagrilintide', 'aod', 'mots', 'tesamorelin', 'nad'],
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
  merchandise: {
    id: string;
    title: string;
    price: {
      amount: string;
      currencyCode: string;
    };
    selectedOptions: Array<{ name: string; value: string }>;
    product: {
      title: string;
      handle: string;
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

async function swellFetch<T>(
  path: string,
  params?: { [key: string]: QueryValue },
  options: { allowExpandFallback?: boolean } = {}
): Promise<T> {
  const { allowExpandFallback = true } = options;
  const requestUrls = buildApiUrls(path, params);
  const errors: string[] = [];

  for (const requestUrl of requestUrls) {
    const authHeaders = buildAuthHeaders(requestUrl);
    for (const headers of authHeaders) {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers,
        credentials: 'include',
        cache: 'no-store',
      });

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      const body = (await response.text()).trim();

      if (allowExpandFallback && params?.expand && (response.status === 400 || response.status === 403)) {
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
            return await swellFetch<T>(path, fallbackParams, { allowExpandFallback: false });
          } catch (fallbackError) {
            errors.push(
              `expand fallback failed for ${path}: ${(fallbackError as Error)?.message || 'unknown error'}`
            );
          }
        }
      }

      errors.push(`${response.status} ${requestUrl} -> ${body || '(empty body)'}`);
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

function getImageUrl(image?: SwellApiImage): string {
  const direct = image?.file?.url || image?.url || '';
  if (!direct) return '';
  if (/^https?:\/\//i.test(direct)) return direct;
  if (direct.startsWith('//')) return `https:${direct}`;
  if (direct.startsWith('/')) return `${SWELL_BASE_URL}${direct}`;
  return direct;
}

function toImageCacheVersionToken(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed) && parsed > 0) {
    return String(parsed);
  }

  return trimmed;
}

function getImageCacheVersion(product: SwellApiProduct, image?: SwellApiImage): string | undefined {
  const token =
    toImageCacheVersionToken(image?.date_updated) ||
    toImageCacheVersionToken(image?.file?.date_updated) ||
    toImageCacheVersionToken(product.date_updated) ||
    toImageCacheVersionToken(product.date_created);

  return token;
}

function toCachedImageUrl(url: string, version?: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;

  const params = new URLSearchParams({ src: url });
  if (version) {
    params.set('v', version);
  }

  return `/api/image-cache?${params.toString()}`;
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

function mapSwellProduct(product: SwellApiProduct): AppProduct {
  const productId = String(product.id || product.slug || product.name || Math.random().toString(36).slice(2));
  const currencyCode = String(product.currency || DEFAULT_CURRENCY).toUpperCase();

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
    return {
      id: buildVariantId(productId, String(variant.id || variant.sku || variant.name || 'default')),
      title: variant.name || variant.sku || 'Default',
      price: {
        amount: toAmountString(variant.sale ? variant.sale_price ?? variant.price : variant.price ?? basePrice),
        currencyCode: (variant.currency || currencyCode).toUpperCase(),
      },
      availableForSale: isPurchasableFromStockStatus(variant.stock_status, variant.stock_purchasable),
      selectedOptions,
      images: variant.images || [],
    };
  });

  const imageCandidates = [product.image, ...(product.images || [])].filter(Boolean) as SwellApiImage[];
  const productImageNodes = imageCandidates
    .map(image => {
      const sourceUrl = getImageUrl(image);
      const version = getImageCacheVersion(product, image);

      return {
        node: {
          url: toCachedImageUrl(sourceUrl, version),
          altText: getImageAltText(image, product.name || ''),
          thumbhash: undefined,
          selectedOptions: undefined,
        },
      };
    })
    .filter(image => Boolean(image.node.url));

  const variantImageNodes = normalizedVariants.flatMap(variant =>
    (variant.images || [])
      .map(image => {
        const sourceUrl = getImageUrl(image);
        const version = getImageCacheVersion(product, image);

        return {
          node: {
            url: toCachedImageUrl(sourceUrl, version),
            altText: getImageAltText(image, `${product.name || 'Product'} ${variant.title}`),
            thumbhash: undefined,
            selectedOptions: variant.selectedOptions.map(option => ({
              name: option.name.toLowerCase(),
              value: option.value.toLowerCase(),
            })),
          },
        };
      })
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
      price: variant.price,
      availableForSale: variant.availableForSale,
      selectedOptions: variant.selectedOptions,
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
    priceRange: {
      minVariantPrice: {
        amount: toAmountString(minVariantAmount),
        currencyCode,
      },
    },
    compareAtPriceRange: {
      minVariantPrice: {
        amount: toAmountString(comparePrice),
        currencyCode,
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
                  price: {
                    amount: toAmountString(basePrice),
                    currencyCode,
                  },
                  availableForSale: isPurchasableFromStockStatus(product.stock_status, product.stock_purchasable),
                  selectedOptions: [],
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

async function hydrateProductForVariants(product: SwellApiProduct): Promise<SwellApiProduct> {
  if (!product.id) return product;
  if (!hasVariantOptions(product) || hasResolvedVariants(product)) return product;

  try {
    const hydrated = await swellFetch<SwellApiProduct>(`/products/${encodeURIComponent(String(product.id))}`, {
      expand: PRODUCT_EXPAND_FIELDS,
    });
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
}): Promise<AppProduct[]> {
  const {
    first = DEFAULT_PAGE_SIZE,
    limit,
    sortKey = DEFAULT_SORT_KEY,
    reverse = false,
    query,
    categoryHandle,
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
    const productsResponse = await swellFetch<SwellApiListResponse<SwellApiProduct>>('/products', {
      limit: perPage,
      page,
      expand: PRODUCT_EXPAND_FIELDS,
      category: categoryFilter,
      search: query,
    });

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
      const fallbackResponse = await swellFetch<SwellApiListResponse<SwellApiProduct>>('/products', {
        limit: perPage,
        page: fallbackPage,
        expand: PRODUCT_EXPAND_FIELDS,
        search: query,
      });

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
  const hydratedProducts = await Promise.all(pageProducts.map(hydrateProductForVariants));
  return hydratedProducts.map(mapSwellProduct);
}

async function getProductByVariantId(variantId: string): Promise<AppProduct | null> {
  const parsed = extractIdsFromVariantId(variantId);
  if (!parsed) return null;

  try {
    const product = await swellFetch<SwellApiProduct>(`/products/${encodeURIComponent(parsed.productId)}`, {
      expand: PRODUCT_EXPAND_FIELDS,
    });

    return mapSwellProduct(product);
  } catch (error) {
    console.error('Unable to resolve Swell product for cart variant:', error);
    return null;
  }
}

function toSwellCart(state: CartState): AppCart {
  const currencyCode = state.lines[0]?.merchandise.price.currencyCode || DEFAULT_CURRENCY;
  const subtotal = state.lines
    .reduce((sum, line) => sum + Number(line.merchandise.price.amount) * line.quantity, 0)
    .toFixed(2);

  return {
    id: state.id,
    lines: {
      edges: state.lines.map(line => ({
        node: {
          id: line.id,
          quantity: line.quantity,
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

// Get all products
export async function getProducts({
  first = DEFAULT_PAGE_SIZE,
  limit,
  sortKey = DEFAULT_SORT_KEY,
  reverse = false,
  query: searchQuery,
}: {
  first?: number;
  limit?: number;
  sortKey?: ProductSortKey;
  reverse?: boolean;
  query?: string;
}): Promise<AppProduct[]> {
  return getSwellProducts({
    first,
    limit,
    sortKey,
    reverse,
    query: searchQuery,
  });
}

// Get single product by handle
export async function getProduct(handle: string): Promise<AppProduct | null> {
  const normalizedHandle = normalizeHandle(handle);
  const matchingProducts = await swellFetch<SwellApiListResponse<SwellApiProduct>>('/products', {
    where: { slug: normalizedHandle },
    limit: 1,
    page: 1,
    expand: PRODUCT_EXPAND_FIELDS,
  });

  const matchedProduct = unwrapResults(matchingProducts).find(
    item => normalizeHandle(item.slug || '') === normalizedHandle
  );
  if (matchedProduct && (matchedProduct.active ?? true) !== false) {
    const hydratedProduct = await hydrateProductForVariants(matchedProduct);
    return mapSwellProduct(hydratedProduct);
  }

  const products = await swellFetch<SwellApiListResponse<SwellApiProduct>>('/products', {
    search: normalizedHandle,
    limit: 100,
    page: 1,
    expand: PRODUCT_EXPAND_FIELDS,
  });

  const fallback = unwrapResults(products).find(item => normalizeHandle(item.slug || '') === normalizedHandle);
  if (fallback && (fallback.active ?? true) !== false) {
    const hydratedFallback = await hydrateProductForVariants(fallback);
    return mapSwellProduct(hydratedFallback);
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
}: {
  collection: string;
  limit?: number;
  sortKey?: ProductCollectionSortKey;
  query?: string;
  reverse?: boolean;
}): Promise<AppProduct[]> {
  return getSwellProducts({
    limit,
    sortKey,
    reverse,
    query: searchQuery,
    categoryHandle: collection,
  });
}

// Create cart (headless in-memory cart state)
export async function createCart(): Promise<AppCart> {
  const cartId = `swell-cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const state: CartState = { id: cartId, lines: [] };
  cartStore.set(cartId, state);
  return toSwellCart(state);
}

// Add items to cart
export async function addCartLines(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>
): Promise<AppCart> {
  let state = cartStore.get(cartId);
  if (!state) {
    state = { id: cartId, lines: [] };
    cartStore.set(cartId, state);
  }

  for (const line of lines) {
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const existing = state.lines.find(item => item.variantId === line.merchandiseId);

    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    const product = await getProductByVariantId(line.merchandiseId);
    if (!product) continue;

    const selectedVariant =
      product.variants.edges.find(variant => variant.node.id === line.merchandiseId)?.node || product.variants.edges[0]?.node;

    const firstImage = product.images.edges[0]?.node;

    state.lines.push({
      id: buildLineId(cartId, line.merchandiseId),
      variantId: line.merchandiseId,
      quantity,
      merchandise: {
        id: line.merchandiseId,
        title: selectedVariant?.title || product.title,
        price: selectedVariant?.price || {
          amount: product.priceRange.minVariantPrice.amount,
          currencyCode: product.priceRange.minVariantPrice.currencyCode,
        },
        selectedOptions: selectedVariant?.selectedOptions || [],
        product: {
          title: product.title,
          handle: product.handle,
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

  return toSwellCart(state);
}

// Update items in cart
export async function updateCartLines(
  cartId: string,
  lines: Array<{ id: string; quantity: number }>
): Promise<AppCart> {
  const state = cartStore.get(cartId) || { id: cartId, lines: [] };
  cartStore.set(cartId, state);

  for (const incoming of lines) {
    const index = state.lines.findIndex(line => line.id === incoming.id);
    if (index === -1) continue;

    if (incoming.quantity <= 0) {
      state.lines.splice(index, 1);
    } else {
      state.lines[index].quantity = incoming.quantity;
    }
  }

  return toSwellCart(state);
}

// Remove items from cart
export async function removeCartLines(cartId: string, lineIds: string[]): Promise<AppCart> {
  const state = cartStore.get(cartId) || { id: cartId, lines: [] };
  cartStore.set(cartId, state);

  state.lines = state.lines.filter(line => !lineIds.includes(line.id));

  return toSwellCart(state);
}

// Get cart
export async function getCart(cartId: string): Promise<AppCart | null> {
  const state = cartStore.get(cartId);
  if (!state) return null;
  return toSwellCart(state);
}
