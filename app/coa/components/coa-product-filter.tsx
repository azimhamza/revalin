'use client';

import { cn } from '@/lib/utils';
import { useCOA } from '../providers/coa-provider';

export function COAProductFilter({ className }: { className?: string }) {
  const { uniqueProducts, selectedProduct, setSelectedProduct } = useCOA();

  const hasSelection = selectedProduct !== 'all';

  return (
    <div className={cn('px-3 py-4 rounded-lg bg-muted', className)}>
      <h3 className="mb-4 font-semibold">
        Categories{' '}
        {hasSelection && <span className="text-foreground/50">(1)</span>}
      </h3>
      <ul className="flex flex-col gap-1">
        {uniqueProducts.map((product) => {
          const isSelected = selectedProduct === product;
          return (
            <li key={product}>
              <button
                onClick={() => setSelectedProduct(product)}
                className={cn(
                  'flex w-full text-left transition-all transform cursor-pointer font-sm md:hover:translate-x-1 md:hover:opacity-80',
                  isSelected
                    ? 'font-medium translate-x-1'
                    : hasSelection
                      ? 'opacity-50'
                      : ''
                )}
                aria-pressed={isSelected}
                aria-label={`Filter by category: ${product}`}
              >
                {product}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
