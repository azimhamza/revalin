'use client';

import { Product } from '@/lib/swell/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAvailableSizes } from '../hooks/use-available-colors';
import { useSizeFilterCount } from '../hooks/use-filter-count';

interface SizeFilterProps {
  products?: Product[];
  className?: string;
}

export function SizeFilter({ products = [], className }: SizeFilterProps) {
  const { availableSizes, selectedSizes, toggleSize } = useAvailableSizes(products);
  const sizeCount = useSizeFilterCount();

  const isLoading = products.length === 0;
  const atLeastOneSize = availableSizes.length > 0;

  if (!atLeastOneSize && !isLoading) return null;

  return (
    <div className={cn('px-3 py-4 rounded-md bg-muted', className)}>
      <h3 className="mb-4 font-semibold">
        Size {sizeCount > 0 && <span className="text-foreground/50">({sizeCount})</span>}
      </h3>
      {isLoading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-8 w-16 rounded-md bg-foreground/10 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {availableSizes.map(size => {
            const isSelected = selectedSizes.includes(size);
            return (
              <Button key={size} size="sm" variant={isSelected ? 'default' : 'outline'} onClick={() => toggleSize(size)}>
                {size}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Backward-compatible export for existing imports during transition.
export const ColorFilter = SizeFilter;
