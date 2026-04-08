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
// IMPORTANT — cache poisoning safety:
//
// The cached (`'use cache'`) functions below MUST throw on failure rather than
// catch-and-return-a-fallback. If a cached function returns a value (even an
// empty array), `'use cache'` persists it into Vercel's Data Cache for the
// duration of `cacheLife('minutes')`. That means a single transient Swell
// failure during a background revalidate would permanently overwrite the good
// catalog with `[]` and the shop would silently render empty until the next
// successful revalidate (or a manual `revalidateTag(...)`).
//
// Throwing inside `'use cache'` is NOT memoized — the next request retries the
// fetch. So we keep all error handling at the OUTER (non-cached) boundary,
// which is where the fallback values live.
// -----------------------------------------------------------------------------

async function getCollectionsCached(): Promise<Collection[]> {
  'use cache';
  cacheTag(TAGS.collections);
  cacheLife('minutes');

  const swellCollections = await getSwellCollections();
  if (swellCollections.length === 0) {
    // Don't cache emptiness — throw so the outer wrapper falls back AND so the
    // next request re-attempts the Swell fetch instead of being stuck on the
    // static fallback forever.
    throw new Error('Swell returned no collections');
  }
  return swellCollections.map(adaptSwellCollection);
}

export async function getCollections(): Promise<Collection[]> {
  try {
    return await getCollectionsCached();
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
    throw new Error('Swell returned no collections');
  }

  const normalizedQuery = normalizeHandle(handle);
  const collection = collections.find(
    (collection: SwellCollection) =>
      normalizeHandle(collection.handle) === normalizedQuery ||
      normalizeHandle(collection.id) === normalizedQuery
  );
  return collection ? adaptSwellCollection(collection) : null;
}

export async function getCollection(handle: string): Promise<Collection | null> {
  try {
    return await getCollectionCached(handle);
  } catch (error) {
    console.warn(
      `getCollection(${handle}): falling back to static collections.`,
      (error as Error)?.message || error
    );
    const normalizedQuery = normalizeHandle(handle);
    const fallback = FALLBACK_COLLECTIONS.find(
      (collection: SwellCollection) =>
        normalizeHandle(collection.handle) === normalizedQuery ||
        normalizeHandle(collection.id) === normalizedQuery
    );
    return fallback ? adaptSwellCollection(fallback) : null;
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
    const swellProduct = await getSwellProduct(handle, currencyCode);
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
}): Promise<Product[]> {
  try {
    return await getProductsCached(params);
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
}): Promise<Product[]> {
  try {
    return await getCollectionProductsCached(params);
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
  currencyCode?: string
): Promise<Product[]> {
  try {
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
