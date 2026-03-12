'use client';

import { useQueryState, parseAsArrayOf, parseAsString } from 'nuqs';
import { Product } from '@/lib/swell/types';

const CATALOG_SIZES = ['1 mg', '5 mg', '10 mg', '50 mg', '70 mg', '80 mg', '100 mg', '500 mg', '10 ml'];

const SIZE_OPTION_KEYS = ['size', 'strength', 'dose', 'volume', 'amount'];
const SIZE_REGEX = /\b\d+(?:\.\d+)?\s?(?:mg|ml)\b/gi;

function normalizeSize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function extractSizesFromText(text: string): string[] {
  const matches = text.match(SIZE_REGEX) || [];
  return matches.map(match => match.toLowerCase().replace(/\s+/g, ' ').trim());
}

export function useAvailableSizes(products: Product[]) {
  const [sizeFilters, setSizeFilters] = useQueryState('fsize', parseAsArrayOf(parseAsString).withDefault([]));

  const catalogSizeSet = new Set(CATALOG_SIZES.map(normalizeSize));
  const detectedSizes = new Set<string>();

  products.forEach(product => {
    product.options.forEach(option => {
      const key = option.name.toLowerCase();
      if (!SIZE_OPTION_KEYS.some(match => key.includes(match))) return;

      option.values.forEach(value => {
        const optionValue = typeof value === 'string' ? value : value.name;
        if (!optionValue) return;
        const normalized = normalizeSize(optionValue);
        if (catalogSizeSet.has(normalized)) {
          detectedSizes.add(normalized);
        }
      });
    });

    extractSizesFromText(`${product.title} ${product.description}`).forEach(size => {
      const normalized = normalizeSize(size);
      if (catalogSizeSet.has(normalized)) {
        detectedSizes.add(normalized);
      }
    });
  });

  const availableSizes = CATALOG_SIZES.filter(size => {
    if (products.length === 0) return true;
    return detectedSizes.size === 0 || detectedSizes.has(normalizeSize(size));
  });

  const selectedSizes = availableSizes.filter(size => sizeFilters.includes(size));

  const toggleSize = (size: string) => {
    setSizeFilters(sizeFilters.includes(size) ? sizeFilters.filter(value => value !== size) : [...sizeFilters, size]);
  };

  return {
    availableSizes,
    selectedSizes,
    toggleSize,
    activeSizeFilters: sizeFilters,
  };
}
