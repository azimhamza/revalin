import { ProductCollectionSortKey, ProductSortKey, ShopifyCart, ShopifyCollection, ShopifyProduct } from './types';

import { DEFAULT_PAGE_SIZE, DEFAULT_SORT_KEY } from './constants';

const rawWooBaseUrl =
  process.env.NEXT_PUBLIC_WOOCOMMERCE_STORE_URL ||
  process.env.WOOCOMMERCE_STORE_URL ||
  process.env.NEXT_PUBLIC_WOOCOMMERCE_SITE_URL ||
  '';

const WOOCOMMERCE_BASE_URL = rawWooBaseUrl.replace(/\/$/, '');
const STORE_API_BASE = `${WOOCOMMERCE_BASE_URL}/wp-json/wc/store/v1`;
const CHECKOUT_URL = process.env.NEXT_PUBLIC_WOOCOMMERCE_CHECKOUT_URL || `${WOOCOMMERCE_BASE_URL}/checkout`;
const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_STORE_CURRENCY || 'USD';

const SMOOTH_COLLECTION: ShopifyCollection = {
  id: 'smooth-virtual-collection',
  title: 'Smooth',
  handle: 'smooth',
  description: 'Curated smooth peptide category.',
};

type WooStoreImage = {
  src?: string;
  alt?: string;
  name?: string;
};

type WooStoreCategory = {
  id: number;
  name: string;
  slug: string;
  description?: string;
};

type WooStorePrices = {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_code?: string;
  currency_minor_unit?: number;
};

type WooStoreProduct = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  images?: WooStoreImage[];
  categories?: WooStoreCategory[];
  prices?: WooStorePrices;
};

type WooStoreCategoryResponse = {
  id: number;
  name: string;
  slug: string;
  description?: string;
};

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

function assertWooBaseUrl() {
  if (!WOOCOMMERCE_BASE_URL) {
    throw new Error('Missing WooCommerce base URL. Set NEXT_PUBLIC_WOOCOMMERCE_STORE_URL.');
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  assertWooBaseUrl();
  const url = new URL(`${STORE_API_BASE}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

async function wooFetch<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const response = await fetch(buildUrl(path, params), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WooCommerce API HTTP error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

function cleanHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatWooPrice(amount?: string, minorUnit = 2): string {
  if (!amount) return '0';
  if (amount.includes('.')) return amount;

  const parsed = Number(amount);
  if (Number.isNaN(parsed)) return '0';

  const divisor = 10 ** minorUnit;
  return (parsed / divisor).toFixed(minorUnit);
}

function mapSortKeyToWoo(sortKey: ProductSortKey | ProductCollectionSortKey): string {
  switch (sortKey) {
    case 'PRICE':
      return 'price';
    case 'TITLE':
      return 'title';
    case 'CREATED_AT':
    case 'CREATED':
      return 'date';
    case 'BEST_SELLING':
      return 'popularity';
    default:
      return 'menu_order';
  }
}

function mapWooCategory(category: WooStoreCategoryResponse): ShopifyCollection {
  return {
    id: `woo-category-${category.id}`,
    title: category.name,
    handle: category.slug,
    description: category.description || '',
  };
}

function buildVariantId(productId: number) {
  return `woo:product:${productId}`;
}

function extractWooProductId(variantId: string): number | null {
  const match = variantId.match(/^woo:product:(\d+)$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
}

function mapWooProduct(product: WooStoreProduct): ShopifyProduct {
  const prices = product.prices || {};
  const currencyCode = prices.currency_code || DEFAULT_CURRENCY;
  const minorUnit = prices.currency_minor_unit ?? 2;

  const finalPrice = formatWooPrice(prices.price, minorUnit);
  const regularPrice = formatWooPrice(prices.regular_price || prices.price, minorUnit);

  const firstCategory = product.categories?.[0];
  const imageNodes = (product.images || [])
    .filter(image => !!image.src)
    .map(image => ({
      node: {
        url: image.src || '',
        altText: image.alt || image.name || product.name,
        thumbhash: undefined,
      },
    }));

  const descriptionHtml = product.description || product.short_description || '';

  return {
    id: `woo://product/${product.id}`,
    title: product.name,
    description: cleanHtml(product.short_description || descriptionHtml),
    descriptionHtml,
    handle: product.slug,
    productType: firstCategory?.name || 'Peptide',
    category: firstCategory
      ? {
          id: String(firstCategory.id),
          name: firstCategory.name,
        }
      : undefined,
    options: [],
    images: {
      edges: imageNodes,
    },
    priceRange: {
      minVariantPrice: {
        amount: finalPrice,
        currencyCode,
      },
    },
    compareAtPriceRange: {
      minVariantPrice: {
        amount: regularPrice,
        currencyCode,
      },
    },
    variants: {
      edges: [
        {
          node: {
            id: buildVariantId(product.id),
            title: 'Default',
            price: {
              amount: finalPrice,
              currencyCode,
            },
            availableForSale: true,
            selectedOptions: [],
          },
        },
      ],
    },
  };
}

async function getWooCategories(): Promise<ShopifyCollection[]> {
  const categories = await wooFetch<WooStoreCategoryResponse[]>('/products/categories', {
    per_page: 100,
  });

  const mapped = categories.map(mapWooCategory);
  const hasSmooth = mapped.some(collection => collection.handle === SMOOTH_COLLECTION.handle);

  return hasSmooth ? mapped : [...mapped, SMOOTH_COLLECTION];
}

async function getWooProducts(params: {
  first?: number;
  limit?: number;
  sortKey?: ProductSortKey | ProductCollectionSortKey;
  reverse?: boolean;
  query?: string;
  categoryId?: number;
}): Promise<ShopifyProduct[]> {
  const {
    first = DEFAULT_PAGE_SIZE,
    limit,
    sortKey = DEFAULT_SORT_KEY,
    reverse = false,
    query,
    categoryId,
  } = params;

  const perPage = limit || first;
  const orderby = mapSortKeyToWoo(sortKey);

  const products = await wooFetch<WooStoreProduct[]>('/products', {
    per_page: perPage,
    orderby,
    order: reverse ? 'desc' : 'asc',
    search: query,
    category: categoryId,
  });

  return products.map(mapWooProduct);
}

async function getProductByVariantId(variantId: string): Promise<ShopifyProduct | null> {
  const wooProductId = extractWooProductId(variantId);
  if (!wooProductId) return null;

  try {
    const product = await wooFetch<WooStoreProduct>(`/products/${wooProductId}`);
    return mapWooProduct(product);
  } catch (error) {
    console.error('Unable to resolve Woo product for cart variant:', error);
    return null;
  }
}

function createEmptyShopifyCart(cartId: string): ShopifyCart {
  return {
    id: cartId,
    lines: {
      edges: [],
    },
    cost: {
      totalAmount: {
        amount: '0',
        currencyCode: DEFAULT_CURRENCY,
      },
      subtotalAmount: {
        amount: '0',
        currencyCode: DEFAULT_CURRENCY,
      },
      totalTaxAmount: {
        amount: '0',
        currencyCode: DEFAULT_CURRENCY,
      },
    },
    checkoutUrl: CHECKOUT_URL,
  };
}

function toShopifyCart(state: CartState): ShopifyCart {
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
}): Promise<ShopifyProduct[]> {
  return getWooProducts({
    first,
    limit,
    sortKey,
    reverse,
    query: searchQuery,
  });
}

// Get single product by handle
export async function getProduct(handle: string): Promise<ShopifyProduct | null> {
  const products = await wooFetch<WooStoreProduct[]>('/products', {
    slug: handle,
    per_page: 1,
  });

  const product = products[0];
  return product ? mapWooProduct(product) : null;
}

// Get collections
export async function getCollections(first = 10): Promise<ShopifyCollection[]> {
  const categories = await getWooCategories();
  return categories.slice(0, first);
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
}): Promise<ShopifyProduct[]> {
  const categories = await getWooCategories();

  if (collection === 'smooth') {
    const categoryMatch = categories.find(category => category.handle === 'smooth');

    if (categoryMatch && categoryMatch.id.startsWith('woo-category-')) {
      const categoryId = Number(categoryMatch.id.replace('woo-category-', ''));
      if (!Number.isNaN(categoryId)) {
        return getWooProducts({
          limit,
          sortKey,
          reverse,
          query: searchQuery,
          categoryId,
        });
      }
    }

    const allProducts = await getWooProducts({
      limit: Math.max(limit, 100),
      sortKey,
      reverse,
      query: searchQuery,
    });

    return allProducts.filter(product => {
      const haystack = `${product.title} ${product.handle} ${product.description}`.toLowerCase();
      return haystack.includes('smooth');
    });
  }

  const matchedCategory = categories.find(category => category.handle === collection);
  if (!matchedCategory) return [];

  const categoryId = Number(matchedCategory.id.replace('woo-category-', ''));
  if (Number.isNaN(categoryId)) return [];

  return getWooProducts({
    limit,
    sortKey,
    reverse,
    query: searchQuery,
    categoryId,
  });
}

// Create cart (headless in-memory cart state)
export async function createCart(): Promise<ShopifyCart> {
  const cartId = `woo-cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const state: CartState = { id: cartId, lines: [] };
  cartStore.set(cartId, state);
  return toShopifyCart(state);
}

// Add items to cart
export async function addCartLines(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>
): Promise<ShopifyCart> {
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

    const firstVariant = product.variants.edges[0]?.node;
    const firstImage = product.images.edges[0]?.node;

    state.lines.push({
      id: buildLineId(cartId, line.merchandiseId),
      variantId: line.merchandiseId,
      quantity,
      merchandise: {
        id: line.merchandiseId,
        title: firstVariant?.title || product.title,
        price: firstVariant?.price || {
          amount: product.priceRange.minVariantPrice.amount,
          currencyCode: product.priceRange.minVariantPrice.currencyCode,
        },
        selectedOptions: firstVariant?.selectedOptions || [],
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

  return toShopifyCart(state);
}

// Update items in cart
export async function updateCartLines(
  cartId: string,
  lines: Array<{ id: string; quantity: number }>
): Promise<ShopifyCart> {
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

  return toShopifyCart(state);
}

// Remove items from cart
export async function removeCartLines(cartId: string, lineIds: string[]): Promise<ShopifyCart> {
  const state = cartStore.get(cartId) || { id: cartId, lines: [] };
  cartStore.set(cartId, state);

  state.lines = state.lines.filter(line => !lineIds.includes(line.id));

  return toShopifyCart(state);
}

// Get cart
export async function getCart(cartId: string): Promise<ShopifyCart | null> {
  const state = cartStore.get(cartId);
  if (!state) return null;
  return toShopifyCart(state);
}
