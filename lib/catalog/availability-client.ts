'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { getApiData, readJsonSafely } from '@/lib/api/client';
import type {
  CatalogAvailabilityProduct,
  CatalogAvailabilityProductInput,
} from '@/lib/catalog/availability-types';
import type { Product } from '@/lib/swell/types';

const AVAILABILITY_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedAvailability = {
  expiresAt: number;
  value: CatalogAvailabilityProduct;
};

const availabilityCache = new Map<string, CachedAvailability>();
const availabilityRequests = new Map<string, Promise<CatalogAvailabilityProduct | null>>();

function normalizeHandle(handle: string) {
  return handle.trim().toLowerCase();
}

function getCacheKey(product: Pick<Product, 'handle'>) {
  return normalizeHandle(product.handle);
}

function getCachedAvailability(product: Pick<Product, 'handle'>) {
  const key = getCacheKey(product);
  const cached = availabilityCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    availabilityCache.delete(key);
    return null;
  }

  return cached.value;
}

function buildAvailabilityInput(product: Product): CatalogAvailabilityProductInput {
  return {
    handle: product.handle,
    productId: product.id,
    variants: product.variants.map(variant => ({
      id: variant.id,
      sku: variant.sku,
    })),
  };
}

function applyAvailability(product: Product, availability: CatalogAvailabilityProduct): Product {
  const availabilityByVariantId = new Map(
    availability.variants.map(variant => [variant.id, variant]),
  );
  const availabilityBySku = new Map(
    availability.variants
      .filter(variant => variant.sku)
      .map(variant => [normalizeHandle(variant.sku || ''), variant]),
  );

  return {
    ...product,
    availableToShipNow: availability.availableToShipNow,
    isHighDemand: availability.isHighDemand,
    shippingLeadTimeLabel: availability.shippingLeadTimeLabel,
    internalInventoryMatched: availability.internalInventoryMatched,
    variants: product.variants.map(variant => {
      const variantAvailability =
        availabilityByVariantId.get(variant.id) ||
        (variant.sku ? availabilityBySku.get(normalizeHandle(variant.sku)) : undefined);

      if (!variantAvailability) {
        return variant;
      }

      return {
        ...variant,
        availableToShipNow: variantAvailability.availableToShipNow,
        isHighDemand: variantAvailability.isHighDemand,
        shippingLeadTimeLabel: variantAvailability.shippingLeadTimeLabel,
        internalInventoryMatched: variantAvailability.internalInventoryMatched,
      };
    }),
  };
}

async function fetchProductAvailability(product: Product) {
  const key = getCacheKey(product);
  const cached = getCachedAvailability(product);
  if (cached) {
    return cached;
  }

  const existingRequest = availabilityRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const response = await fetch('/api/catalog/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: [buildAvailabilityInput(product)],
      }),
    });
    const payload = await readJsonSafely(response);
    if (!response.ok) {
      return null;
    }

    const data = getApiData<{ products: CatalogAvailabilityProduct[] }>(payload);
    const availability = data?.products?.[0] || null;
    if (availability) {
      availabilityCache.set(key, {
        expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
        value: availability,
      });
    }

    return availability;
  })()
    .catch(() => null)
    .finally(() => {
      availabilityRequests.delete(key);
    });

  availabilityRequests.set(key, request);
  return request;
}

export function useLazyProductAvailability(product: Product) {
  const [availability, setAvailability] = useState<CatalogAvailabilityProduct | null>(() =>
    getCachedAvailability(product),
  );
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const cacheKey = getCacheKey(product);

  useEffect(() => {
    setAvailability(getCachedAvailability(product));
    setIsLoadingAvailability(false);
  }, [cacheKey, product]);

  const loadAvailability = useCallback(async () => {
    const cached = getCachedAvailability(product);
    if (cached) {
      setAvailability(cached);
      return applyAvailability(product, cached);
    }

    setIsLoadingAvailability(true);
    try {
      const nextAvailability = await fetchProductAvailability(product);
      if (nextAvailability) {
        setAvailability(nextAvailability);
        return applyAvailability(product, nextAvailability);
      }
    } finally {
      setIsLoadingAvailability(false);
    }

    return product;
  }, [cacheKey, product]);

  const availabilityProduct = useMemo(
    () => (availability ? applyAvailability(product, availability) : product),
    [availability, product],
  );

  return {
    product: availabilityProduct,
    isLoadingAvailability,
    loadAvailability,
  };
}
