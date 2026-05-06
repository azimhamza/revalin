'use client';

import { useMemo, useTransition } from 'react';
import { Minus, Plus, PlusCircleIcon } from 'lucide-react';
import { AnimatePresence, motion, LayoutGroup } from 'motion/react';
import { Product } from '@/lib/swell/types';
import { useCart } from '@/components/cart/cart-context';
import { useSelectedVariant } from '@/components/products/variant-selector';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { useParams, useSearchParams } from 'next/navigation';
import { getSwellProductId } from '@/lib/swell/utils';
import { useProductQuantity } from './product-quantity-context';
import { useProductAvailabilityProduct } from './product-availability-context';
import { getInventoryState } from '@/lib/inventory';

export function ProductAddToCart({
  product,
  className,
  style,
}: {
  product: Product;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { product: availabilityProduct, loadAvailability } = useProductAvailabilityProduct(product);
  const { quantity, setQuantity } = useProductQuantity();
  const [isLoading, startTransition] = useTransition();
  const { addItem, warmCart } = useCart();
  const selectedVariant = useSelectedVariant(availabilityProduct);
  const pathname = useParams<{ handle?: string }>();
  const searchParams = useSearchParams();

  const { variants } = availabilityProduct;
  const defaultVariantId = variants.length === 1 ? variants[0]?.id : undefined;
  const selectedVariantId = selectedVariant?.id || defaultVariantId;
  const isTargetingProduct =
    pathname.handle === availabilityProduct.handle || searchParams.get('pid') === getSwellProductId(availabilityProduct.id);

  const resolvedVariant = useMemo(() => {
    if (variants.length === 0) {
      return {
        id: availabilityProduct.id,
        title: availabilityProduct.title,
        availableForSale: availabilityProduct.availableForSale,
        stockStatus: availabilityProduct.stockStatus,
        stockLevel: availabilityProduct.stockLevel,
        internalOnHand: availabilityProduct.internalOnHand,
        internalAllocated: availabilityProduct.internalAllocated,
        availableToShipNow: availabilityProduct.availableToShipNow,
        isHighDemand: availabilityProduct.isHighDemand,
        shippingLeadTimeLabel: availabilityProduct.shippingLeadTimeLabel,
        internalInventoryMatched: availabilityProduct.internalInventoryMatched,
        selectedOptions: [],
        price: availabilityProduct.priceRange.minVariantPrice,
      };
    }
    if (!isTargetingProduct && !defaultVariantId) return undefined;
    return variants.find(v => v.id === selectedVariantId);
  }, [variants, availabilityProduct, isTargetingProduct, defaultVariantId, selectedVariantId]);
  const cartVariant = resolvedVariant;
  const inventory = cartVariant ? getInventoryState(availabilityProduct, cartVariant) : null;
  const isBackorder = inventory?.isBackorder === true;
  const isDisabled = !cartVariant || isBackorder || isLoading;
  const isSelectOneState = !cartVariant;
  const buttonText = isBackorder ? 'Get Notified' : cartVariant ? 'Add To Cart' : 'Select one';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartVariant || isBackorder) return;

    startTransition(async () => {
      await addItem(cartVariant, availabilityProduct, quantity);
      setQuantity(1);
    });
  };

  const handlePaymentIntent = () => {
    void loadAvailability();
    if (!isDisabled) {
      warmCart();
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <LayoutGroup>
        <div className="flex items-stretch gap-2">
          {/* Quantity selector — only visible after variant is selected */}
          <AnimatePresence>
            {cartVariant && (
              <motion.div
                initial={{ width: 0, opacity: 0, scale: 0.8 }}
                animate={{ width: 'auto', opacity: 1, scale: 1 }}
                exit={{ width: 0, opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="overflow-hidden shrink-0"
              >
                <div className="flex items-center h-full rounded-md border border-border bg-popover">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="flex items-center justify-center w-10 h-full transition-opacity hover:opacity-70 disabled:opacity-30"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <AnimatePresence mode="popLayout">
                    <motion.span
                      key={quantity}
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -8, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="w-8 text-center text-sm font-semibold tabular-nums select-none"
                    >
                      {quantity}
                    </motion.span>
                  </AnimatePresence>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQuantity(currentQuantity => currentQuantity + 1)}
                    className="flex items-center justify-center w-10 h-full transition-opacity hover:opacity-70 disabled:opacity-30"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add to cart button */}
          <motion.div layout transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="flex-1">
            <Button
              type="submit"
              disabled={isDisabled}
              onPointerEnter={handlePaymentIntent}
              onFocus={handlePaymentIntent}
              onTouchStart={handlePaymentIntent}
              size="lg"
              className="flex relative justify-between items-center w-full"
              style={isSelectOneState ? undefined : (style || { backgroundColor: '#0B2E2F', color: '#F4F1EA' })}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={isLoading ? 'loading' : buttonText}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex justify-center items-center w-full"
                >
                  {isLoading ? (
                    <Loader size="lg" kind="spinner" className="text-[#0B2E2F]" />
                  ) : (
                    <div className="flex justify-between items-center w-full gap-2">
                      <span className="min-w-0 truncate">{buttonText}</span>
                      <PlusCircleIcon className="shrink-0" />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </Button>
          </motion.div>
        </div>
      </LayoutGroup>
    </form>
  );
}
