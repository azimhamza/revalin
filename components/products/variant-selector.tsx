'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { CartProduct, Product, ProductOption, ProductVariant, SelectedOptions } from '@/lib/swell/types';
import { startTransition, useMemo, useState } from 'react';
import { useQueryState, parseAsString } from 'nuqs';
import { useParams, useSearchParams } from 'next/navigation';
import { ColorSwatch } from '@/components/ui/color-picker';
import { Button } from '@/components/ui/button';
import { cn, getColorHex } from '@/lib/utils';
import { getSwellProductId } from '@/lib/swell/utils';

type Combination = {
  id: string;
  availableForSale: boolean;
  [key: string]: string | boolean;
};

const variantOptionSelectorVariants = cva('flex items-start gap-4', {
  variants: {
    variant: {
      card: 'rounded-md bg-popover py-2 px-3 justify-between',
      condensed: 'justify-start',
      shop: 'justify-start gap-2',
    },
  },
  defaultVariants: {
    variant: 'card',
  },
});

function VariantValueButton({
  name,
  optionName,
  isActive,
  isBackordered,
  variant,
  onSelect,
}: {
  name: string;
  optionName: string;
  isActive: boolean;
  isBackordered: boolean;
  variant: 'card' | 'condensed' | 'shop' | null | undefined;
  onSelect: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isCondensed = variant === 'condensed';
  const isLongCondensedLabel = isCondensed && name.length >= 5;

  return (
    <span
      className="relative"
      onMouseEnter={() => isBackordered && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Button
        onClick={onSelect}
        variant={variant === 'shop' ? undefined : isActive ? 'default' : 'outline'}
        size={variant === 'shop' ? 'default' : 'sm'}
        title={`${optionName} ${name}`}
        className={cn(
          variant === 'shop'
            ? `h-11 rounded-full border px-4 text-sm font-medium shadow-none ${
                isActive
                  ? 'border-[#2d6a4f] bg-[#2d6a4f] text-[#f4f1ea] hover:bg-[#2d6a4f]'
                  : isBackordered
                    ? 'border-[#8B7340]/30 bg-white text-[#0B2E2F]/50 hover:bg-[#ece9e2]'
                    : 'border-[#0B2E2F]/10 bg-white text-[#0B2E2F] hover:bg-[#ece9e2]'
              }`
            : isCondensed
              ? 'h-7 min-w-0 rounded-sm px-2 text-sm leading-none shadow-none sm:px-2.5 sm:text-[15px]'
              : 'min-w-[40px]',
          isLongCondensedLabel && 'px-1.5 text-[13px] tracking-[-0.02em] sm:px-2 sm:text-sm',
          isBackordered && !isActive && 'opacity-60'
        )}
      >
        {name}
      </Button>
      {showTooltip && (
        <span className={`absolute bottom-full mb-2 whitespace-nowrap rounded bg-[#0B2E2F] px-2.5 py-1.5 text-[11px] font-medium text-[#F4F1EA] shadow-lg z-[100] pointer-events-none ${variant === 'condensed' ? 'left-0' : 'right-0'}`}>
          Next shipment arriving soon
          <span className={`absolute top-full border-4 border-transparent border-t-[#0B2E2F] ${variant === 'condensed' ? 'left-4' : 'right-4'}`} />
        </span>
      )}
    </span>
  );
}

interface VariantOptionSelectorComponentProps extends VariantProps<typeof variantOptionSelectorVariants> {
  option: ProductOption;
  product: Product;
  selectedValue: string;
  selectedOptions: Record<string, string>;
  isTargetingProduct: boolean;
  hideLabel?: boolean;
  onSelect?: (valueName: string) => void;
}

export function VariantOptionSelectorComponent({
  option,
  variant,
  product,
  selectedValue,
  selectedOptions,
  isTargetingProduct,
  hideLabel = false,
  onSelect,
}: VariantOptionSelectorComponentProps) {
  const { variants, options } = product;
  const optionNameLowerCase = option.name.toLowerCase();

  const combinations: Combination[] = Array.isArray(variants)
    ? variants.map(variant => ({
        id: variant.id,
        availableForSale: variant.availableForSale,
        ...variant.selectedOptions.reduce(
          (accumulator, option) => ({
            ...accumulator,
            [option.name.toLowerCase()]: option.value,
          }),
          {}
        ),
      }))
    : [];

  const isColorOption = optionNameLowerCase === 'color';

  return (
    <dl className={variantOptionSelectorVariants({ variant })}>
      {!hideLabel && <dt className="text-base font-semibold leading-8">{option.name}</dt>}
      <dd className={cn('flex flex-wrap items-center', variant === 'condensed' ? 'gap-1.5' : 'gap-2')}>
        {option.values.map(value => {
          const currentState = selectedOptions;
          const optionParams = {
            ...currentState,
            [optionNameLowerCase]: value.name,
          };

          const filtered = Object.entries(optionParams).filter(([key, value]) =>
            options.find(option => option.name.toLowerCase() === key && option.values.some(val => val.name === value))
          );
          const isAvailableForSale = combinations.find(combination =>
            filtered.every(([key, value]) => combination[key] === value && combination.availableForSale)
          );

          const isActive = isTargetingProduct && selectedValue === value.name;

          if (isColorOption) {
            const color = getColorHex(value.name);
            const name = value.name.split('/');

            return (
              <ColorSwatch
                key={value.id}
                color={
                  Array.isArray(color)
                    ? [
                        { name: name[0], value: color[0] },
                        { name: name[1], value: color[1] },
                      ]
                    : { name: name[0], value: color }
                }
                isSelected={isActive}
                onColorChange={() => onSelect?.(value.name)}
                size={variant === 'shop' ? 'lg' : variant === 'condensed' ? 'sm' : 'md'}
                atLeastOneColorSelected={!!selectedValue}
                className={
                  variant === 'shop'
                    ? isActive
                      ? 'ring-2 ring-[#2d6a4f] opacity-100'
                      : 'ring-1 ring-[#0B2E2F]/10 opacity-100 hover:ring-[#2d6a4f]/40'
                    : undefined
                }
              />
            );
          }

          const isBackordered = !isAvailableForSale;

          return (
            <VariantValueButton
              key={value.id}
              name={value.name}
              optionName={option.name}
              isActive={isActive}
              isBackordered={isBackordered}
              variant={variant}
              onSelect={() => onSelect?.(value.name)}
            />
          );
        })}
      </dd>
    </dl>
  );
}

interface VariantOptionSelectorProps extends VariantProps<typeof variantOptionSelectorVariants> {
  option: ProductOption;
  product: Product;
  hideLabel?: boolean;
}

export function VariantOptionSelector({ option, variant, product, hideLabel = false }: VariantOptionSelectorProps) {
  const pathname = useParams<{ handle?: string }>();
  const optionNameLowerCase = option.name.toLowerCase();

  const [selectedValue, setSelectedValue] = useQueryState(optionNameLowerCase, parseAsString.withDefault(''));
  const [activeProductId, setActiveProductId] = useQueryState('pid', parseAsString.withDefault(''));

  const selectedOptions = useSelectedOptions(product);

  const isProductPage = pathname.handle === product.handle;
  const isTargetingProduct = isProductPage || activeProductId === getSwellProductId(product.id);

  const handleSelect = (valueName: string) => {
    startTransition(() => {
      setSelectedValue(valueName);
      if (!isProductPage) {
        setActiveProductId(getSwellProductId(product.id));
      }
    });
  };

  return (
    <VariantOptionSelectorComponent
      option={option}
      variant={variant}
      product={product}
      selectedValue={selectedValue}
      selectedOptions={selectedOptions}
      isTargetingProduct={isTargetingProduct}
      hideLabel={hideLabel}
      onSelect={handleSelect}
    />
  );
}

export const useSelectedOptions = (product: Product): Record<string, string> => {
  const { options } = product;
  const searchParams = useSearchParams();

  const selectedOptions = useMemo(() => {
    const state: Record<string, string> = {};
    options.forEach(option => {
      const key = option.name.toLowerCase();
      const value = searchParams.get(key);
      if (value) state[key] = value;
    });
    return state;
  }, [options, searchParams]);

  return selectedOptions;
};

export const useSelectedVariant = (product: Product) => {
  const selectedOptions = useSelectedOptions(product);
  const pathname = useParams<{ handle?: string }>();
  const searchParams = useSearchParams();
  const isTargetingProduct =
    pathname.handle === product.handle || searchParams.get('pid') === getSwellProductId(product.id);

  const selectedVariant = useMemo(() => {
    if (!isTargetingProduct) return undefined;
    const { variants } = product;
    return Array.isArray(variants)
      ? variants.find((variant: ProductVariant) =>
          variant.selectedOptions.every(option => option.value === selectedOptions[option.name.toLowerCase()])
        )
      : undefined;
  }, [isTargetingProduct, product, selectedOptions]);

  return selectedVariant;
};

export const useProductImages = (product: Product | CartProduct, selectedOptions?: SelectedOptions) => {
  const images = useMemo(() => {
    return Array.isArray(product.images) ? product.images : [];
  }, [product.images]);

  const optionsObject = useMemo(() => {
    return selectedOptions?.reduce(
      (acc, option) => {
        acc[option.name.toLowerCase()] = option.value.toLowerCase();
        return acc;
      },
      {} as Record<string, string>
    );
  }, [selectedOptions]);

  // Try to match images by alt text with selected variant values
  // This enables products to show different images when variants are selected
  // by matching the image alt text with variant names (e.g., "Red Shirt" shows when Red is selected)
  const variantImagesByAlt = useMemo(() => {
    if (!optionsObject || Object.keys(optionsObject).length === 0) return [];

    const selectedValues = Object.values(optionsObject);

    return images.filter(image => {
      if (!image.altText) return false;

      const altTextLower = image.altText.toLowerCase();

      // Check if any selected variant value is mentioned in the alt text
      return selectedValues.some(value => altTextLower.includes(value.toLowerCase()));
    });
  }, [optionsObject, images]);

  // Original logic for images with selectedOptions metadata
  const variantImages = useMemo(() => {
    if (!optionsObject) return [];

    return images.filter(image => {
      return Object.entries(optionsObject || {}).every(([key, value]) =>
        image.selectedOptions?.some(
          option => option.name.toLowerCase() === key && option.value.toLowerCase() === value
        )
      );
    });
  }, [optionsObject, images]);

  const defaultImages = images.filter(image => !image.selectedOptions);
  const featuredImage = product.featuredImage;

  // Prioritize images with selectedOptions metadata first
  if (variantImages.length > 0) {
    return variantImages;
  }

  // Then try images matched by alt text (for products with 2+ variants)
  if (variantImagesByAlt.length > 0) {
    return variantImagesByAlt;
  }

  // Fall back to default images
  if (defaultImages.length > 0) {
    return defaultImages;
  }

  // Final fallback to featured image
  if (featuredImage) {
    return [featuredImage];
  }

  // Ultimate fallback - return first image or empty array
  return images.length > 0 ? [images[0]] : [];
};
