'use client';

import { ArrowRight, PlusCircleIcon, Truck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCart } from './cart-context';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../ui/button';
import { Loader } from '../ui/loader';
import { CartItemCard } from './cart-item';
import { formatPrice } from '@/lib/swell/utils';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/checkout/constants';
import { useAuthSession } from '@/components/auth/session-provider';
import { CheckoutAuthPopup } from './checkout-auth-popup';

const CartContainer = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn('px-3 md:px-4', className)}>{children}</div>;
};

function CartShippingProgress() {
  const { cart } = useCart();

  if (!cart) return null;

  const total = Number(cart.cost.totalAmount.amount || 0);
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - total);
  const progress = Math.max(0, Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100));
  const currencyCode = cart.cost.totalAmount.currencyCode;

  return (
    <div className="pb-3">
      <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
            <Truck className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground">
              {remaining > 0 ? (
                <>
                  Add <span className="font-semibold text-[#0B2E2F]">{formatPrice(remaining.toString(), currencyCode)}</span> more for free shipping.
                </>
              ) : (
                <span className="font-semibold text-[#0B2E2F]">Free shipping unlocked.</span>
              )}
            </p>

            <div className="mt-2 h-1.5 rounded-full bg-[#0B2E2F]/8">
              <div
                className="h-full rounded-full bg-[#0B2E2F] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Free shipping over {formatPrice(FREE_SHIPPING_THRESHOLD.toString(), currencyCode)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const CartItems = ({ closeCart }: { closeCart: () => void }) => {
  const { cart } = useCart();

  if (!cart) return <></>;

  const cartSavings = cart.lines.reduce((sum, item) => {
    const effectiveLineTotal = Number(item.cost.totalAmount.amount || 0);
    const baseUnitPrice = Math.max(
      Number(item.merchandise.product.compareAtPrice?.amount || 0),
      Number(item.merchandise.product.priceRange.minVariantPrice.amount || 0)
    );
    const baseLineTotal = baseUnitPrice * item.quantity;
    return sum + Math.max(0, baseLineTotal - effectiveLineTotal);
  }, 0);
  const hasSavings = cartSavings > 0.009;
  const currencyCode = cart.cost.totalAmount.currencyCode;

  return (
    <div className="flex flex-col justify-between h-full overflow-hidden">
      <CartContainer className="flex justify-between text-xs text-muted-foreground">
        <span>Products</span>
        <span>{cart.lines.length} items</span>
      </CartContainer>
      <div className="relative flex-1 min-h-0 py-1 overflow-x-hidden">
        <CartContainer className="overflow-y-auto flex flex-col gap-y-2 h-full scrollbar-hide">
          <AnimatePresence>
            {cart.lines.map(item => (
              <motion.div
                key={item.merchandise.id}
                layout
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <CartItemCard item={item} onCloseCart={closeCart} />
              </motion.div>
            ))}
          </AnimatePresence>
        </CartContainer>
      </div>
      <CartContainer>
        <div className="py-4 text-xs text-foreground/50 shrink-0">
          <div className="flex justify-between items-center pb-1 mb-3 border-b border-muted-foreground/20">
            <p>Taxes</p>
            <p className="text-right">Calculated at checkout</p>
          </div>
          <div className="flex justify-between items-center pt-1 pb-1 mb-3 border-b border-muted-foreground/20">
            <p>Shipping</p>
            <p className="text-right">Calculated at checkout</p>
          </div>
          {hasSavings && (
            <div className="flex justify-between items-center pt-1 pb-1 mb-3 border-b border-muted-foreground/20 text-[#0B2E2F]">
              <p>Savings</p>
              <p className="text-right font-semibold">-{formatPrice(cartSavings.toFixed(2), currencyCode)}</p>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 pb-1 mb-1.5 text-base font-semibold">
            <p>Total</p>
            <p className="text-sm text-right text-foreground">
              {formatPrice(cart.cost.totalAmount.amount, cart.cost.totalAmount.currencyCode)}
            </p>
          </div>
        </div>
        <CartShippingProgress />
        <CheckoutButton closeCart={closeCart} />
      </CartContainer>
    </div>
  );
};

export default function CartModal() {
  const { cart, lastAddedAt } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useBodyScrollLock(isOpen);

  const lastProcessedAddRef = useRef(0);

  useEffect(() => {
    if (!lastAddedAt || lastAddedAt === lastProcessedAddRef.current) return;
    if (!cart || cart.lines.length === 0) return;
    if (pathname === '/checkout') return;
    lastProcessedAddRef.current = lastAddedAt;
    setIsOpen(true);
  }, [lastAddedAt, cart, pathname]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const renderCartContent = () => {
    if (!cart || cart.lines.length === 0) {
      return (
        <CartContainer className="flex w-full">
          <Link
            href="/shop"
            className="p-2 w-full rounded-lg border border-dashed bg-background border-border"
            onClick={closeCart}
          >
            <div className="flex flex-row gap-6">
              <div className="flex overflow-hidden relative justify-center items-center rounded-sm border border-dashed size-20 shrink-0 border-border">
                <PlusCircleIcon className="size-6 text-muted-foreground" />
              </div>
              <div className="flex flex-col flex-1 gap-2 justify-center 2xl:gap-3">
                <span className="text-lg font-semibold 2xl:text-xl">Cart is empty</span>
                <p className="text-sm text-muted-foreground hover:underline">Start shopping to get started</p>
              </div>
            </div>
          </Link>
        </CartContainer>
      );
    }

    return <CartItems closeCart={closeCart} />;
  };

  return (
    <>
      <Button aria-label="Open cart" onClick={openCart} className="uppercase" size={'sm'} style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}>
        <span className="max-md:hidden">cart</span> ({cart?.totalQuantity || 0})
      </Button>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed inset-0 z-50 bg-foreground/30"
              onClick={closeCart}
              aria-hidden="true"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed top-0 bottom-0 right-0 flex w-full md:w-[500px] p-modal-sides z-50"
            >
              <div className="flex flex-col py-3 w-full rounded bg-muted md:py-4">
                <CartContainer className="flex justify-between items-baseline mb-4">
                  <p className="text-2xl font-semibold">Cart</p>
                  <Button size="sm" variant="ghost" aria-label="Close cart" onClick={closeCart}>
                    Close
                  </Button>
                </CartContainer>

                {renderCartContent()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function CheckoutButton({ closeCart }: { closeCart: () => void }) {
  const { cart } = useCart();
  const router = useRouter();
  const { data: session, isPending } = useAuthSession();
  const [isCheckoutAuthOpen, setIsCheckoutAuthOpen] = useState(false);
  const isDisabled = !cart || cart.lines.length === 0;

  return (
    <>
      <Button
        type="button"
        disabled={isDisabled}
        size="lg"
        className="flex relative gap-3 justify-between items-center w-full"
        onClick={() => {
          if (!cart || cart.lines.length === 0 || isPending) {
            return;
          }

          if (session?.user) {
            closeCart();
            router.push('/checkout');
            return;
          }

          setIsCheckoutAuthOpen(true);
        }}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex justify-center items-center w-full"
          >
            <div className="flex justify-between items-center w-full">
              <span>Proceed to Checkout</span>
              <ArrowRight className="size-6" />
            </div>
          </motion.div>
        </AnimatePresence>
      </Button>
      <CheckoutAuthPopup
        open={isCheckoutAuthOpen}
        onOpenChange={setIsCheckoutAuthOpen}
        closeCart={closeCart}
        router={router}
      />
    </>
  );
}
