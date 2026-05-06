'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useLazyProductAvailability } from '@/lib/catalog/availability-client';
import type { Product } from '@/lib/swell/types';

type ProductAvailabilityContextValue = {
  product: Product;
  isLoadingAvailability: boolean;
  loadAvailability: () => Promise<Product>;
};

const ProductAvailabilityContext = createContext<ProductAvailabilityContextValue | null>(null);

export function ProductAvailabilityProvider({
  product,
  children,
}: {
  product: Product;
  children: ReactNode;
}) {
  const value = useLazyProductAvailability(product);

  return (
    <ProductAvailabilityContext.Provider value={value}>
      {children}
    </ProductAvailabilityContext.Provider>
  );
}

export function useProductAvailabilityProduct(product: Product) {
  const context = useContext(ProductAvailabilityContext);
  if (context && context.product.handle === product.handle) {
    return context;
  }

  return {
    product,
    isLoadingAvailability: false,
    loadAvailability: async () => product,
  };
}
