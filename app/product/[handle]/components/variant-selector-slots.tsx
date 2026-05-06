'use client';

import { VariantOptionSelector, VariantOptionSelectorComponent } from '@/components/products/variant-selector';
import { Product } from '@/lib/swell/types';
import { useProductAvailabilityProduct } from './product-availability-context';

export function VariantSelectorSlots({ product, fallback = false }: { product: Product; fallback?: boolean }) {
  const { product: availabilityProduct, loadAvailability } = useProductAvailabilityProduct(product);
  const { options } = availabilityProduct;

  const hasNoOptionsOrJustOneOption = !options.length || (options.length === 1 && options[0]?.values.length === 1);

  if (hasNoOptionsOrJustOneOption) {
    return null;
  }

  if (fallback) {
    return (
      <div className="flex flex-col gap-4">
        {options.map(option => (
          <VariantOptionSelectorComponent
            key={option.id}
            option={option}
            product={availabilityProduct}
            variant="card"
            selectedValue=""
            isTargetingProduct
            selectedOptions={{}}
            showHighDemandTooltip
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      onPointerEnter={() => void loadAvailability()}
      onFocusCapture={() => void loadAvailability()}
      onTouchStart={() => void loadAvailability()}
    >
      {options.map(option => (
        <VariantOptionSelector key={option.id} option={option} product={availabilityProduct} variant="card" />
      ))}
    </div>
  );
}
