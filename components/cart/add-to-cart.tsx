'use client';

import { PlusCircleIcon } from 'lucide-react';
import { Product, ProductVariant } from '@/lib/swell/types';
import { useMemo, useTransition } from 'react';
import { useOptionalCart } from './cart-context';
import { Button, ButtonProps } from '../ui/button';
import { cn } from '@/lib/utils';
import { useSelectedVariant } from '@/components/products/variant-selector';
import { useParams, useSearchParams } from 'next/navigation';
import { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader } from '../ui/loader';
import { getSwellProductId } from '@/lib/swell/utils';

interface AddToCartProps extends ButtonProps {
  product: Product;
  iconOnly?: boolean;
  icon?: ReactNode;
  contentClassName?: string;
  unselectedStyle?: CSSProperties;
}

interface AddToCartButtonProps extends ButtonProps {
  product: Product;
  selectedVariant?: ProductVariant | null;
  iconOnly?: boolean;
  icon?: ReactNode;
  className?: string;
  contentClassName?: string;
  unselectedStyle?: CSSProperties;
}

const getBaseProductVariant = (product: Product): ProductVariant => {
  return {
    id: product.id,
    title: product.title,
    availableForSale: product.availableForSale,
    stockStatus: product.stockStatus,
    stockLevel: product.stockLevel,
    internalOnHand: product.internalOnHand,
    internalAllocated: product.internalAllocated,
    availableToShipNow: product.availableToShipNow,
    isHighDemand: product.isHighDemand,
    shippingLeadTimeLabel: product.shippingLeadTimeLabel,
    internalInventoryMatched: product.internalInventoryMatched,
    selectedOptions: [],
    price: product.priceRange.minVariantPrice,
    compareAtPrice: product.compareAtPrice,
  };
};

export function AddToCartButton({
  product,
  selectedVariant,
  className,
  contentClassName,
  iconOnly = false,
  icon = <PlusCircleIcon />,
  unselectedStyle,
  style,
  ...buttonProps
}: AddToCartButtonProps) {
  const cartContext = useOptionalCart();
  const [isLoading, startTransition] = useTransition();

  // Resolve variant locally only for variantless products (purely synchronous)
  const resolvedVariant = useMemo(() => {
    if (selectedVariant) return selectedVariant;
    if (product.variants.length === 0) return getBaseProductVariant(product);
    if (product.variants.length === 1) return product.variants[0];
    return undefined;
  }, [selectedVariant, product]);
  const cartVariant = resolvedVariant;

  const getButtonText = () => {
    if (!cartContext) return 'Loading...';
    if (!cartVariant) return 'Select one';
    return 'Add To Cart';
  };

  const isDisabled = !cartContext || !cartVariant || isLoading;
  const isSelectOneState = !cartVariant;
  const buttonStyle = isSelectOneState && unselectedStyle ? unselectedStyle : style;
  const { onPointerEnter, onFocus, onTouchStart, ...restButtonProps } = buttonProps;

  const handleWarmCart = () => {
    if (!cartContext) {
      return;
    }

    if (!cartVariant) {
      return;
    }

    cartContext.warmCart();
  };

  const getLoaderSize = () => {
    const buttonSize = buttonProps.size;
    if (buttonSize === 'sm' || buttonSize === 'icon-sm' || buttonSize === 'icon') return 'sm';
    if (buttonSize === 'icon-lg') return 'default';
    if (buttonSize === 'lg') return 'lg';
    return 'default';
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();

        if (cartContext && cartVariant) {
          startTransition(async () => {
            cartContext.addItem(cartVariant, product, 1);
            try {
              const refMatch = document.cookie.match(/(?:^|;\s*)revalin_ref=([^;]+)/);
              window.op?.track('product_added_to_cart', {
                productHandle: product.handle,
                productTitle: product.title,
                variantTitle: cartVariant.title,
                requestedVariantTitle: resolvedVariant?.title || null,
                quantity: 1,
                price: cartVariant.price?.amount || product.priceRange.minVariantPrice.amount,
                affiliate_code: refMatch?.[1] ? decodeURIComponent(refMatch[1]) : null,
              });
            } catch {}
          });
        }
      }}
      className={className}
    >
      <Button
        type="submit"
        aria-label={!cartVariant ? 'Select one' : 'Add to cart'}
        disabled={isDisabled}
        onPointerEnter={event => {
          onPointerEnter?.(event);
          handleWarmCart();
        }}
        onFocus={event => {
          onFocus?.(event);
          handleWarmCart();
        }}
        onTouchStart={event => {
          onTouchStart?.(event);
          handleWarmCart();
        }}
        className={cn(
          iconOnly ? undefined : 'flex relative justify-between items-center w-full',
          isSelectOneState && 'max-md:pl-3 max-md:pr-2',
          className
        )}
        style={buttonStyle || { backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
        {...restButtonProps}
      >
        <AnimatePresence initial={false} mode="wait">
          {iconOnly ? (
            <motion.div
              key={isLoading ? 'loading' : 'icon'}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="flex justify-center items-center"
            >
              {isLoading ? <Loader size={getLoaderSize()} kind="spinner" className="text-[#0B2E2F]" /> : <span className="inline-block">{icon}</span>}
            </motion.div>
          ) : (
            <motion.div
              key={isLoading ? 'loading' : getButtonText()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex justify-center items-center w-full"
            >
              {isLoading ? (
                <Loader size={getLoaderSize()} kind="spinner" className="text-[#0B2E2F]" />
              ) : (
                <div className={cn('flex justify-between items-center w-full gap-2', contentClassName)}>
                  <span className="min-w-0 truncate">{getButtonText()}</span>
                  <span className="shrink-0">{icon}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </form>
  );
}

export function AddToCart({
  product,
  className,
  contentClassName,
  iconOnly = false,
  icon = <PlusCircleIcon />,
  unselectedStyle,
  ...buttonProps
}: AddToCartProps) {
  const { variants } = product;
  const selectedVariant = useSelectedVariant(product);
  const pathname = useParams<{ handle?: string }>();
  const searchParams = useSearchParams();

  const hasNoVariants = variants.length === 0;
  const defaultVariantId = variants.length === 1 ? variants[0]?.id : undefined;
  const selectedVariantId = selectedVariant?.id || defaultVariantId;
  const isTargetingProduct =
    pathname.handle === product.handle || searchParams.get('pid') === getSwellProductId(product.id);

  const resolvedVariant = useMemo(() => {
    if (hasNoVariants) return getBaseProductVariant(product);
    if (!isTargetingProduct && !defaultVariantId) return undefined;
    return variants.find(variant => variant.id === selectedVariantId);
  }, [hasNoVariants, product, isTargetingProduct, defaultVariantId, variants, selectedVariantId]);

  return (
    <AddToCartButton
      product={product}
      selectedVariant={resolvedVariant}
      className={className}
      contentClassName={contentClassName}
      iconOnly={iconOnly}
      icon={icon}
      unselectedStyle={unselectedStyle}
      {...buttonProps}
    />
  );
}
