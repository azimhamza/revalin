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

// Public API functions
export async function getCollections(): Promise<Collection[]> {
  'use cache';
  cacheTag(TAGS.collections);
  cacheLife('minutes');

  try {
    const swellCollections = await getSwellCollections();
    if (swellCollections.length === 0) {
      console.warn('Swell returned no collections. Falling back to static category navigation.');
      return getFallbackCollections();
    }
    return swellCollections.map(adaptSwellCollection);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return getFallbackCollections();
  }
}

export async function getCollection(handle: string): Promise<Collection | null> {
  'use cache';
  cacheTag(TAGS.collections);
  cacheLife('minutes');

  try {
    const collections = await getSwellCollections();
    const normalizedQuery = normalizeHandle(handle);
    const sourceCollections: readonly SwellCollection[] = collections.length > 0 ? collections : FALLBACK_COLLECTIONS;
    const collection = sourceCollections.find(
      (collection: SwellCollection) =>
        normalizeHandle(collection.handle) === normalizedQuery ||
        normalizeHandle(collection.id) === normalizedQuery
    );
    return collection ? adaptSwellCollection(collection) : null;
  } catch (error) {
    console.error('Error fetching collection:', error);
    return null;
  }
}

export async function getProduct(handle: string, currencyCode?: string): Promise<Product | null> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('minutes');

  return getLiveProduct(handle, currencyCode);
}

export async function getLiveProduct(handle: string, currencyCode?: string): Promise<Product | null> {
  try {
    const swellProduct = await getSwellProduct(handle, currencyCode);
    return swellProduct ? adaptSwellProduct(swellProduct) : null;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

export async function getProducts(params: {
  limit?: number;
  sortKey?: ProductSortKey;
  reverse?: boolean;
  query?: string;
  currencyCode?: string;
}): Promise<Product[]> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('minutes');

  try {
    const swellProducts = await getSwellProducts(params);
    return swellProducts.map(adaptSwellProduct);
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function getCollectionProducts(params: {
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

  try {
    const swellProducts = await getSwellCollectionProducts(params);
    return swellProducts.map(adaptSwellProduct);
  } catch (error) {
    console.error('Error fetching collection products:', error);
    return [];
  }
}

export async function getRelatedProducts(product: Product, limit = 4, currencyCode?: string): Promise<Product[]> {
  'use cache';
  cacheTag(TAGS.products);
  cacheLife('minutes');

  try {
    let candidates: Product[] = [];

    if (product.categoryId) {
      const categoryProducts = await getCollectionProducts({
        collection: product.categoryId,
        limit: limit + 1,
        currencyCode,
      });
      candidates = categoryProducts.filter(p => p.id !== product.id);
    }

    if (candidates.length < limit) {
      const allProducts = await getProducts({ limit: limit + 1 + candidates.length, currencyCode });
      const existingIds = new Set([product.id, ...candidates.map(p => p.id)]);
      const extras = allProducts.filter(p => !existingIds.has(p.id));
      candidates = [...candidates, ...extras];
    }

    return candidates.slice(0, limit);
  } catch (error) {
    console.error('Error fetching related products:', error);
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
