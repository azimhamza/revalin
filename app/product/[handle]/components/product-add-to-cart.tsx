'use client';

import { useEffect, useMemo, useTransition } from 'react';
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
import { getInventoryState } from '@/lib/inventory';
import { resolveDosageSubstitution } from '@/lib/dosage-substitution';

export function ProductAddToCart({
  product,
  className,
  style,
}: {
  product: Product;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { quantity, setQuantity } = useProductQuantity();
  const [isLoading, startTransition] = useTransition();
  const { addItem, cart, warmCart } = useCart();
  const selectedVariant = useSelectedVariant(product);
  const pathname = useParams<{ handle?: string }>();
  const searchParams = useSearchParams();

  const { variants } = product;
  const defaultVariantId = variants.length === 1 ? variants[0]?.id : undefined;
  const selectedVariantId = selectedVariant?.id || defaultVariantId;
  const isTargetingProduct =
    pathname.handle === product.handle || searchParams.get('pid') === getSwellProductId(product.id);

  const resolvedVariant = useMemo(() => {
    if (variants.length === 0) {
      return {
        id: product.id,
        title: product.title,
        availableForSale: product.availableForSale,
        stockStatus: product.stockStatus,
        stockLevel: product.stockLevel,
        selectedOptions: [],
        price: product.priceRange.minVariantPrice,
      };
    }
    if (!isTargetingProduct && !defaultVariantId) return undefined;
    return variants.find(v => v.id === selectedVariantId);
  }, [variants, product, isTargetingProduct, defaultVariantId, selectedVariantId]);
  const dosageSubstitution = useMemo(
    () => resolveDosageSubstitution(product, resolvedVariant),
    [product, resolvedVariant]
  );
  const cartVariant = dosageSubstitution.cartVariant;
  const quantityMultiplier = dosageSubstitution.quantityMultiplier;
  const inventory = useMemo(() => getInventoryState(product, cartVariant), [product, cartVariant]);
  const existingCartQuantity = useMemo(() => {
    if (!cartVariant) return 0;
    return cart?.lines.find(line => line.merchandise.id === cartVariant.id)?.quantity || 0;
  }, [cart, cartVariant]);
  const remainingAvailableQuantity = useMemo(() => {
    if (inventory.availableQuantity === null) return null;
    return Math.floor(Math.max(0, inventory.availableQuantity - existingCartQuantity) / quantityMultiplier);
  }, [inventory.availableQuantity, existingCartQuantity, quantityMultiplier]);
  const maxSelectableQuantity = remainingAvailableQuantity === null ? null : Math.max(1, remainingAvailableQuantity);
  const hasReachedAvailableLimit = remainingAvailableQuantity !== null && remainingAvailableQuantity <= 0;

  useEffect(() => {
    if (maxSelectableQuantity === null) return;

    setQuantity(currentQuantity => Math.min(currentQuantity, maxSelectableQuantity));
  }, [maxSelectableQuantity, cartVariant?.id, setQuantity]);

  const isDisabled = inventory.isBackorder || hasReachedAvailableLimit || !cartVariant || isLoading;
  const isSelectOneState = !inventory.isBackorder && !cartVariant;

  const buttonText = inventory.isBackorder
    ? 'Get Notified'
    : !cartVariant
      ? 'Select one'
      : hasReachedAvailableLimit
        ? 'Max quantity added'
        : 'Add To Cart';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartVariant || hasReachedAvailableLimit) return;

    startTransition(async () => {
      await addItem(cartVariant, product, quantity * quantityMultiplier);
      setQuantity(1);
    });
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <LayoutGroup>
        <div className="flex items-stretch gap-2">
          {/* Quantity selector — only visible after dosage is selected */}
          <AnimatePresence>
            {cartVariant && !inventory.isBackorder && (
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
                    disabled={maxSelectableQuantity !== null && quantity >= maxSelectableQuantity}
                    onClick={() =>
                      setQuantity(currentQuantity =>
                        maxSelectableQuantity === null
                          ? currentQuantity + 1
                          : Math.min(maxSelectableQuantity, currentQuantity + 1)
                      )
                    }
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
              onPointerEnter={() => {
                if (!isDisabled) {
                  warmCart();
                }
              }}
              onFocus={() => {
                if (!isDisabled) {
                  warmCart();
                }
              }}
              onTouchStart={() => {
                if (!isDisabled) {
                  warmCart();
                }
              }}
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
