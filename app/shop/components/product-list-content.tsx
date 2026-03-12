'use client';

import { useEffect, useMemo } from 'react';
import { Product, Collection } from '@/lib/swell/types';
import { ProductCard } from './product-card';
import ResultsControls from './results-controls';
import { useProducts } from '../providers/products-provider';
import { useQueryState, parseAsArrayOf, parseAsString } from 'nuqs';
import { ProductGrid } from './product-grid';
import { Card } from '../../../components/ui/card';

interface ProductListContentProps {
  products: Product[];
  collections: Collection[];
}

const SIZE_OPTION_KEYS = ['size', 'strength', 'dose', 'volume', 'amount'];

function normalizeSize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

// Client-side size filtering function
function filterProductsBySizes(products: Product[], sizes: string[]): Product[] {
  if (!sizes || sizes.length === 0) {
    return products;
  }

  const filteredProducts = products.filter(product => {
    const normalizedSizes = sizes.map(normalizeSize);

    // Check variant selected options first.
    const hasMatchingSize = product.variants?.some((variant: any) => {
      if (!variant.selectedOptions) return false;

      return variant.selectedOptions.some((option: any) => {
        const isSizeOption = SIZE_OPTION_KEYS.some(key => option.name.toLowerCase().includes(key));
        if (!isSizeOption) return false;

        const variantSize = normalizeSize(option.value || '');
        return normalizedSizes.some(size => variantSize === size || variantSize.includes(size) || size.includes(variantSize));
      });
    });

    // Check product-level options.
    if (!hasMatchingSize && product.options) {
      const sizeOption = product.options.find((opt: any) =>
        SIZE_OPTION_KEYS.some(key => opt.name.toLowerCase().includes(key))
      );

      if (sizeOption && sizeOption.values) {
        const optionHasMatch = sizeOption.values.some((value: any) => {
          const sizeValue = typeof value === 'string' ? value : value.name || value.id;
          const optionSize = normalizeSize(sizeValue || '');
          return normalizedSizes.some(size => optionSize === size || optionSize.includes(size) || size.includes(optionSize));
        });

        if (optionHasMatch) return true;
      }
    }

    // Fallback: match size text in title/description.
    const text = normalizeSize(`${product.title} ${product.description}`);
    return normalizedSizes.some(size => text.includes(size));
  });

  return filteredProducts;
}

export function ProductListContent({ products, collections }: ProductListContentProps) {
  const { setProducts, setOriginalProducts } = useProducts();

  // Get current size filters from URL
  const [sizeFilters] = useQueryState('fsize', parseAsArrayOf(parseAsString).withDefault([]));

  // Apply client-side filtering whenever products or size filters change
  const filteredProducts = useMemo(() => {
    if (!sizeFilters || sizeFilters.length === 0) {
      return products;
    }
    return filterProductsBySizes(products, sizeFilters);
  }, [products, sizeFilters]);

  // Set both original and filtered products in the provider whenever they change
  useEffect(() => {
    setOriginalProducts(products);
    setProducts(filteredProducts);
  }, [products, filteredProducts, setProducts, setOriginalProducts]);

  return (
    <>
      <ResultsControls className="max-md:hidden" collections={collections} products={filteredProducts} />

      {filteredProducts.length > 0 ? (
        <ProductGrid>
          {filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ProductGrid>
      ) : (
        <Card className="flex mr-sides flex-1 items-center justify-center">
          <p className="text text-muted-foreground font-medium">No products found</p>
        </Card>
      )}
    </>
  );
}
