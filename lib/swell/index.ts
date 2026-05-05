import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from 'next/cache';
import { TAGS } from '@/lib/constants';
import { FALLBACK_COLLECTIONS } from './constants';
import {
  getCollections as getSwellCollections,
  getProducts as getSwellProducts,
  getCollectionProducts as getSwellCollectionProducts,
  getProduct as getSwellProduct,
  createCart,
  addCartLines,
  updateCartLines,
  removeCartLines,
} from './swell';
import { thumbhashToDataURL } from './utils';
import { DEFAULT_STORE_CURRENCY, normalizeCurrencyCode } from './currency';
import type {
  SwellProduct,
  SwellCollection,
  Product,
  Collection,
  Cart,
  ProductOption,
  ProductVariant,
  Money,
  ProductCollectionSortKey,
  ProductSortKey,
} from './types';

// Utility function to extract the first sentence from a description
function getFirstSentence(text: string): string {
  if (!text) return '';

  const cleaned = text.trim();
  const match = cleaned.match(/^[^.!?]*[.!?]/);

  if (match) {
    return match[0].trim();
  }

  if (cleaned.length > 100) {
    return cleaned.substring(0, 100).trim() + '...';
  }

  return cleaned;
}

function normalizeHandle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper functions for consistent data transformation

function transformSwellMoney(money: { amount: string; currencyCode: string } | undefined): Money {
  return {
    amount: money?.amount || '0',
    currencyCode: normalizeCurrencyCode(money?.currencyCode, DEFAULT_STORE_CURRENCY),
  };
}

function transformSwellOptions(
  options: Array<{ id?: string; name: string; values: string[] }>
): ProductOption[] {
  return options.map(option => ({
    id: option.id || option.name.toLowerCase().replace(/\s+/g, '-'),
    name: option.name,
    values: option.values.map(value => ({
      id: value.toLowerCase().replace(/\s+/g, '-'),
      name: value,
    })),
  }));
}

function transformSwellVariants(variants: { edges: Array<{ node: any }> } | undefined): ProductVariant[] {
  const edges = variants?.edges;
  if (!Array.isArray(edges)) return [];

  return edges.map(edge => {
    const price = transformSwellMoney(edge.node.price);
    const compareAtPrice = edge.node.compareAtPrice ? transformSwellMoney(edge.node.compareAtPrice) : undefined;

    return {
      id: edge.node.id,
      title: edge.node.title || '',
      sku: edge.node.sku || undefined,
      availableForSale: edge.node.availableForSale !== false,
      stockStatus: edge.node.stockStatus,
      stockLevel: edge.node.stockLevel,
      price,
      compareAtPrice:
        compareAtPrice && Number(compareAtPrice.amount) > Number(price.amount) ? compareAtPrice : undefined,
      selectedOptions: edge.node.selectedOptions || [],
      bulkPriceTiers: Array.isArray(edge.node.bulkPriceTiers) ? edge.node.bulkPriceTiers : undefined,
    };
  });
}

// Main adapter functions
function adaptSwellCollection(swellCollection: SwellCollection): Collection {
  return {
    ...swellCollection,
    seo: {
      title: swellCollection.title,
      description: swellCollection.description || '',
    },
    parentCategoryTree: [],
    updatedAt: new Date().toISOString(),
    path: `/shop/${swellCollection.handle}`,
  };
}

function getFallbackCollections(): Collection[] {
  return FALLBACK_COLLECTIONS.map(collection => adaptSwellCollection(collection));
}

function adaptSwellProduct(swellProduct: SwellProduct): Product {
  const firstImage = swellProduct.images?.edges?.[0]?.node;
  const description = getFirstSentence(swellProduct.description || '');

  return {
    ...swellProduct,
    description,
    categoryId: swellProduct.category?.id,
    tags: [],
    availableForSale: swellProduct.availableForSale !== false,
    stockStatus: swellProduct.stockStatus,
    stockLevel: swellProduct.stockLevel,
    currencyCode: normalizeCurrencyCode(swellProduct.priceRange?.minVariantPrice?.currencyCode, DEFAULT_STORE_CURRENCY),
    featuredImage: firstImage
      ? {
          ...firstImage,
          altText: firstImage.altText || swellProduct.title || '',
          height: 600,
          width: 600,
          thumbhash: firstImage.thumbhash ? thumbhashToDataURL(firstImage.thumbhash) : undefined,
        }
      : { url: '', altText: '', height: 0, width: 0 },
    seo: {
      title: swellProduct.title || '',
      description,
    },
    priceRange: {
      minVariantPrice: transformSwellMoney(swellProduct.priceRange?.minVariantPrice),
      maxVariantPrice: transformSwellMoney(swellProduct.priceRange?.minVariantPrice),
    },
    compareAtPrice:
      swellProduct.compareAtPriceRange?.minVariantPrice &&
      parseFloat(swellProduct.compareAtPriceRange.minVariantPrice.amount) >
        parseFloat(swellProduct.priceRange?.minVariantPrice?.amount || '0')
        ? transformSwellMoney(swellProduct.compareAtPriceRange.minVariantPrice)
        : undefined,
    images:
      swellProduct.images?.edges?.map(edge => ({
        ...edge.node,
        altText: edge.node.altText || swellProduct.title || '',
        height: 600,
        width: 600,
        thumbhash: edge.node.thumbhash ? thumbhashToDataURL(edge.node.thumbhash) : undefined,
      })) || [],
    options: transformSwellOptions(swellProduct.options || []),
    variants: transformSwellVariants(swellProduct.variants),
    bulkPriceTiers: swellProduct.bulkPriceTiers,
  };
}

// Cart adapting happens in server actions to avoid cyclic deps

// -----------------------------------------------------------------------------
// Public API
//
// Caching strategy:
//
// Each catalog read has TWO layers of cache: an inner Next.js fetch cache
// (`next: { revalidate, tags }` in swellFetch) and an outer `'use cache'`
// wrapper. The outer wrapper memoizes the *transformed* product/collection
// shape so we don't pay the adapter cost on every request.
//
// IMPORTANT — never throw inside a `'use cache'` body. Throwing inside a
// cached function is processed by React's Server Component error boundary
// FIRST and produces noisy "An error occurred in the Server Components
// render" output during `next build`, even when the outer wrapper catches
// the error. The build still succeeds, but the log becomes unreadable.
//
// Instead:
//   1. Cached functions return whatever Swell returned (empty arrays / null
//      are OK to memoize briefly).
//   2. The outer wrapper detects empty / null results and substitutes the
//      static fallback for the current request.
//   3. The cache self-heals after `cacheLife('minutes')` expires, OR
//      immediately when the Swell webhook calls
//      `revalidateTag(TAGS.collections|products|...)`.
//
// Genuine exceptions (network errors, auth failures, etc.) still propagate
// out of the cached function — Next.js does not memoize thrown errors — and
// the outer try/catch handles them with the same fallback path.
// -----------------------------------------------------------------------------

async function getCollectionsCached(): Promise<Collection[]> {
  'use cache';
  cacheTag(TAGS.collections);
  cacheLife('minutes');

  const swellCollections = await getSwellCollections();
  return swellCollections.map(adaptSwellCollection);
}

export async function getCollections(): Promise<Collection[]> {
  try {
    const collections = await getCollectionsCached();
    if (collections.length === 0) {
      // Cache may transiently hold an empty result (e.g. Swell rate-limited
      // during build). Substitute the static fallback for this request; the
      // cache will refresh on its own when cacheLife expires or when the
      // Swell webhook busts TAGS.collections.
      return getFallbackCollections();
    }
    return collections;
  } catch (error) {
    console.warn(
      'getCollections: falling back to static category navigation.',
      (error as Error)?.message || error
    );
    return getFallbackCollections();
  }
}

async function getCollectionCached(handle: string): Promise<Collection | null> {
  'use cache';
  cacheTag(TAGS.collections);
  cacheLife('minutes');

  const collections = await getSwellCollections();
  if (collections.length === 0) {
    return null;
  }

  const normalizedQuery = normalizeHandle(handle);
  const collection = collections.find(
    (collection: SwellCollection) =>
      normalizeHandle(collection.handle) === normalizedQuery ||
      normalizeHandle(collection.id) === normalizedQuery
  );
  return collection ? adaptSwellCollection(collection) : null;
}

function findFallbackCollection(handle: string): Collection | null {
  const normalizedQuery = normalizeHandle(handle);
  const fallback = FALLBACK_COLLECTIONS.find(
    (collection: SwellCollection) =>
      normalizeHandle(collection.handle) === normalizedQuery ||
      normalizeHandle(collection.id) === normalizedQuery
  );
  return fallback ? adaptSwellCollection(fallback) : null;
}

export async function getCollection(handle: string): Promise<Collection | null> {
  try {
    const collection = await getCollectionCached(handle);
    if (!collection) {
      // Either Swell returned empty collections, or the handle didn't match
      // anything in the (briefly cached) Swell response. Try the static
      // fallback list before giving up.
      return findFallbackCollection(handle);
    }
    return collection;
  } catch (error) {
    console.warn(
      `getCollection(${handle}): falling back to static collections.`,
      (error as Error)?.message || error
    );
    return findFallbackCollection(handle);
  }
}

async function getProductCached(handle: string, currencyCode?: string): Promise<Product | null> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('minutes');

  // No try/catch — let throws propagate so failures don't poison the cache.
  const swellProduct = await getSwellProduct(handle, currencyCode);
  return swellProduct ? adaptSwellProduct(swellProduct) : null;
}

export async function getProduct(handle: string, currencyCode?: string): Promise<Product | null> {
  try {
    return await getProductCached(handle, currencyCode);
  } catch (error) {
    console.error(`getProduct(${handle}): error fetching product:`, error);
    return null;
  }
}

export async function getLiveProduct(handle: string, currencyCode?: string): Promise<Product | null> {
  try {
    const swellProduct = await getSwellProduct(handle, currencyCode, {
      cache: 'no-store',
    });
    return swellProduct ? adaptSwellProduct(swellProduct) : null;
  } catch (error) {
    console.error(`getLiveProduct(${handle}): error fetching product:`, error);
    return null;
  }
}

async function getProductsCached(params: {
  limit?: number;
  sortKey?: ProductSortKey;
  reverse?: boolean;
  query?: string;
  currencyCode?: string;
}): Promise<Product[]> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('minutes');

  const swellProducts = await getSwellProducts(params);
  // An empty result for a query/filter is a legitimate response (e.g. a search
  // with no matches). Only THROWS poison-proof the cache here; empty arrays
  // are fine to cache.
  return swellProducts.map(adaptSwellProduct);
}

export async function getProducts(params: {
  limit?: number;
  sortKey?: ProductSortKey;
  reverse?: boolean;
  query?: string;
  currencyCode?: string;
  live?: boolean;
}): Promise<Product[]> {
  try {
    const { live, ...swellParams } = params;
    if (live) {
      const swellProducts = await getSwellProducts({
        ...swellParams,
        cache: 'no-store',
      });
      return swellProducts.map(adaptSwellProduct);
    }

    return await getProductsCached(swellParams);
  } catch (error) {
    console.error('getProducts: error fetching products:', error);
    return [];
  }
}

async function getCollectionProductsCached(params: {
  collection: string;
  limit?: number;
  sortKey?: ProductCollectionSortKey;
  reverse?: boolean;
  query?: string;
  currencyCode?: string;
}): Promise<Product[]> {
  'use cache';
  cacheTag(TAGS.collectionProducts);
  cacheLife('minutes');

  const swellProducts = await getSwellCollectionProducts(params);
  return swellProducts.map(adaptSwellProduct);
}

export async function getCollectionProducts(params: {
  collection: string;
  limit?: number;
  sortKey?: ProductCollectionSortKey;
  reverse?: boolean;
  query?: string;
  currencyCode?: string;
  live?: boolean;
}): Promise<Product[]> {
  try {
    const { live, ...swellParams } = params;
    if (live) {
      const swellProducts = await getSwellCollectionProducts({
        ...swellParams,
        cache: 'no-store',
      });
      return swellProducts.map(adaptSwellProduct);
    }

    return await getCollectionProductsCached(swellParams);
  } catch (error) {
    console.error(
      `getCollectionProducts(${params.collection}): error fetching collection products:`,
      error
    );
    return [];
  }
}

async function getRelatedProductsCached(
  product: Product,
  limit: number,
  currencyCode?: string
): Promise<Product[]> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('minutes');

  let candidates: Product[] = [];

  if (product.categoryId) {
    const categoryProducts = await getCollectionProductsCached({
      collection: product.categoryId,
      limit: limit + 1,
      currencyCode,
    });
    candidates = categoryProducts.filter(p => p.id !== product.id);
  }

  if (candidates.length < limit) {
    const allProducts = await getProductsCached({
      limit: limit + 1 + candidates.length,
      currencyCode,
    });
    const existingIds = new Set([product.id, ...candidates.map(p => p.id)]);
    const extras = allProducts.filter(p => !existingIds.has(p.id));
    candidates = [...candidates, ...extras];
  }

  return candidates.slice(0, limit);
}

export async function getRelatedProducts(
  product: Product,
  limit = 4,
  currencyCode?: string,
  options: { live?: boolean } = {}
): Promise<Product[]> {
  try {
    if (options.live) {
      let candidates: Product[] = [];

      if (product.categoryId) {
        const categoryProducts = await getCollectionProducts({
          collection: product.categoryId,
          limit: limit + 1,
          currencyCode,
          live: true,
        });
        candidates = categoryProducts.filter(p => p.id !== product.id);
      }

      if (candidates.length < limit) {
        const allProducts = await getProducts({
          limit: limit + 1 + candidates.length,
          currencyCode,
          live: true,
        });
        const existingIds = new Set([product.id, ...candidates.map(p => p.id)]);
        const extras = allProducts.filter(p => !existingIds.has(p.id));
        candidates = [...candidates, ...extras];
      }

      return candidates.slice(0, limit);
    }

    return await getRelatedProductsCached(product, limit, currencyCode);
  } catch (error) {
    console.error(`getRelatedProducts(${product.handle}): error fetching related products:`, error);
    return [];
  }
}

export async function getCart(): Promise<Cart | null> {
  try {
    const { getCart: getCartAction } = await import('@/components/cart/actions');
    return await getCartAction();
  } catch (error) {
    console.error('Error fetching cart:', error);
    return null;
  }
}

// Re-export cart mutation functions (typed in swell.ts)
export { createCart, addCartLines, updateCartLines, removeCartLines };
