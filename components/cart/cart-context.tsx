'use client';

import { Cart, CartItem, Product, ProductVariant } from '@/lib/swell/types';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import * as CartActions from '@/components/cart/actions';
import { resolveAvailableQuantity } from '@/lib/inventory';
import { resolveUnitPrice } from '@/lib/swell/utils';

export type UpdateType = 'plus' | 'minus' | 'delete';
const FALLBACK_CART_CURRENCY = process.env.NEXT_PUBLIC_STORE_CURRENCY || 'USD';
const CART_STORAGE_KEY = 'revalin_cart_state';

type CartAction =
  | {
      type: 'UPDATE_ITEM';
      payload: { merchandiseId: string; nextQuantity: number };
    }
  | {
      type: 'ADD_ITEM';
      payload: { variant: ProductVariant; product: Product; previousQuantity: number; quantity: number };
    };

type UseCartReturn = {
  isPending: boolean;
  lastAddedAt: number;
  cart: Cart | undefined;
  warmCart: () => void;
  addItem: (variant: ProductVariant, product: Product, quantity?: number) => Promise<void>;
  updateItem: (lineId: string, merchandiseId: string, nextQuantity: number, updateType: UpdateType) => Promise<void>;
};

type CartContextType = UseCartReturn | undefined;

const CartContext = createContext<CartContextType | undefined>(undefined);

function calculateItemCost(quantity: number, price: string): string {
  return (Number(price) * quantity).toString();
}

function getMaxCartItemQuantity(item: CartItem): number | null {
  const availableQuantity = item.merchandise.availableQuantity;
  if (availableQuantity === null || availableQuantity === undefined) {
    return null;
  }

  return Math.max(item.quantity, availableQuantity);
}

function clampCartItemQuantity(item: CartItem, nextQuantity: number): number {
  const maxQuantity = getMaxCartItemQuantity(item);
  if (maxQuantity === null) {
    return nextQuantity;
  }

  return Math.min(nextQuantity, maxQuantity);
}

// removed old updateCartItem helper; logic in reducer now uses nextQuantity directly

// removed createOrUpdateCartItem helper in favor of explicit logic in reducer

function updateCartTotals(lines: CartItem[]): Pick<Cart, 'totalQuantity' | 'cost'> {
  const totalQuantity = lines.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = lines.reduce((sum, item) => sum + Number(item.cost.totalAmount.amount), 0);
  const currencyCode = lines[0]?.cost.totalAmount.currencyCode ?? FALLBACK_CART_CURRENCY;

  return {
    totalQuantity,
    cost: {
      subtotalAmount: { amount: totalAmount.toString(), currencyCode },
      totalAmount: { amount: totalAmount.toString(), currencyCode },
      totalTaxAmount: { amount: '0', currencyCode },
    },
  };
}

function createEmptyCart(): Cart {
  return {
    id: '',
    checkoutUrl: '',
    cost: {
      subtotalAmount: { amount: '0', currencyCode: FALLBACK_CART_CURRENCY },
      totalAmount: { amount: '0', currencyCode: FALLBACK_CART_CURRENCY },
      totalTaxAmount: { amount: '0', currencyCode: FALLBACK_CART_CURRENCY },
    },
    totalQuantity: 0,
    lines: [],
  };
}

function canPersistCart(cart: Cart | undefined): cart is Cart {
  return Boolean(cart);
}

function toPersistedCartSnapshotLines(cart: Cart | undefined): CartActions.PersistedCartLineInput[] {
  return (cart?.lines || []).map(line => ({
    merchandiseId: line.merchandise.id,
    quantity: line.quantity,
  }));
}

function readStoredCart(): Cart | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cartReducer(state: Cart | undefined, action: CartAction): Cart {
  const currentCart = state || createEmptyCart();

  switch (action.type) {
    case 'UPDATE_ITEM': {
      const { merchandiseId, nextQuantity } = action.payload;
      const updatedLines = currentCart.lines
        .map(item => {
          if (item.merchandise.id !== merchandiseId) return item;
          const clampedQuantity = clampCartItemQuantity(item, nextQuantity);
          if (clampedQuantity <= 0) return null;

          const baseUnitPrice = item.merchandise.product.priceRange.minVariantPrice.amount;
          const effectiveUnitPrice = resolveUnitPrice(baseUnitPrice, clampedQuantity, item.bulkPriceTiers);
          const newTotalAmount = calculateItemCost(clampedQuantity, effectiveUnitPrice);

          return {
            ...item,
            quantity: clampedQuantity,
            cost: {
              ...item.cost,
              totalAmount: {
                ...item.cost.totalAmount,
                amount: newTotalAmount,
              },
            },
          } satisfies CartItem;
        })
        .filter(Boolean) as CartItem[];

      if (updatedLines.length === 0) {
        return {
          ...currentCart,
          lines: [],
          totalQuantity: 0,
          cost: {
            ...currentCart.cost,
            totalAmount: { ...currentCart.cost.totalAmount, amount: '0' },
          },
        };
      }

      return {
        ...currentCart,
        ...updateCartTotals(updatedLines),
        lines: updatedLines,
      };
    }
    case 'ADD_ITEM': {
      const { variant, product, previousQuantity, quantity } = action.payload;
      const existingItem = currentCart.lines.find(item => item.merchandise.id === variant.id);
      const availableQuantity = resolveAvailableQuantity(product, variant);
      const targetQuantity = previousQuantity + quantity;
      const clampedTargetQuantity = existingItem
        ? clampCartItemQuantity(existingItem, targetQuantity)
        : availableQuantity === null
          ? targetQuantity
          : Math.min(targetQuantity, availableQuantity);
      const tiers = variant.bulkPriceTiers?.length ? variant.bulkPriceTiers : product.bulkPriceTiers;

      if (clampedTargetQuantity <= 0) {
        return currentCart;
      }

      const updatedLines = existingItem
        ? currentCart.lines.map(item => {
            if (item.merchandise.id !== variant.id) return item;

            const effectiveUnitPrice = resolveUnitPrice(variant.price.amount, clampedTargetQuantity, item.bulkPriceTiers);
            const newTotalAmount = calculateItemCost(clampedTargetQuantity, effectiveUnitPrice);

            return {
              ...item,
              quantity: clampedTargetQuantity,
              merchandise: {
                ...item.merchandise,
                availableQuantity,
              },
              cost: {
                ...item.cost,
                totalAmount: {
                  ...item.cost.totalAmount,
                  amount: newTotalAmount,
                },
              },
            } satisfies CartItem;
          })
        : [
            {
              id: `temp-${Date.now()}`,
              quantity: clampedTargetQuantity,
              bulkPriceTiers: tiers,
              cost: {
                totalAmount: {
                  amount: calculateItemCost(
                    clampedTargetQuantity,
                    resolveUnitPrice(variant.price.amount, clampedTargetQuantity, tiers)
                  ),
                  currencyCode: variant.price.currencyCode,
                },
              },
              merchandise: {
                id: variant.id,
                title: variant.title,
                availableQuantity,
                selectedOptions: variant.selectedOptions,
                product: product,
              },
            } satisfies CartItem,
            ...currentCart.lines,
          ];

      return {
        ...currentCart,
        ...updateCartTotals(updatedLines),
        lines: updatedLines,
      };
    }
    default:
      return currentCart;
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [cart, setCart] = useState<Cart | undefined>(undefined);
  const [lastAddedAt, setLastAddedAt] = useState(0);
  const [optimisticCart, updateOptimisticCart] = useOptimistic<Cart | undefined, CartAction>(cart, cartReducer);
  const mutationVersionRef = useRef(0);
  const cartWarmPromiseRef = useRef<Promise<void> | null>(null);
  const isCartWarmRef = useRef(false);

  useEffect(() => {
    const storedCart = readStoredCart();
    const hydrationVersion = mutationVersionRef.current;
    if (storedCart) {
      setCart(storedCart);
    }

    CartActions.getCart().then(async fetchedCart => {
      if (mutationVersionRef.current !== hydrationVersion) {
        return;
      }

      if (fetchedCart && fetchedCart.lines.length > 0) {
        setCart(fetchedCart);
        return;
      }

      if (storedCart && storedCart.lines.length > 0) {
        const restoredCart = await CartActions.restoreCart(
          storedCart.lines.map(line => ({
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
          }))
        );

        if (mutationVersionRef.current === hydrationVersion) {
          setCart(restoredCart ?? storedCart);
        }
        return;
      }

      if (mutationVersionRef.current === hydrationVersion) {
        setCart(fetchedCart ?? createEmptyCart());
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !canPersistCart(optimisticCart)) return;

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(optimisticCart));
  }, [optimisticCart]);

  useEffect(() => {
    if ((optimisticCart?.id || cart?.id) && !isCartWarmRef.current) {
      isCartWarmRef.current = true;
    }
  }, [cart?.id, optimisticCart?.id]);

  const warmCart = useCallback(() => {
    if (isCartWarmRef.current || cartWarmPromiseRef.current) {
      return;
    }

    if (optimisticCart?.id || cart?.id) {
      isCartWarmRef.current = true;
      return;
    }

    cartWarmPromiseRef.current = CartActions.createCartAndSetCookie()
      .then(warmedCart => {
        if (warmedCart?.id) {
          isCartWarmRef.current = true;
        }
      })
      .catch(() => {
        // Best effort only. The click path still creates the cart if needed.
      })
      .finally(() => {
        cartWarmPromiseRef.current = null;
      });
  }, [cart?.id, optimisticCart?.id]);

  const update = useCallback(
    async (lineId: string, merchandiseId: string, nextQuantity: number) => {
      const mutationVersion = ++mutationVersionRef.current;
      const snapshotLines = toPersistedCartSnapshotLines(optimisticCart || cart);

      startTransition(() => {
        updateOptimisticCart({ type: 'UPDATE_ITEM', payload: { merchandiseId, nextQuantity } });
      });
      const fresh = await CartActions.updateItem({
        lineId,
        merchandiseId,
        quantity: nextQuantity,
        cartSnapshotLines: snapshotLines,
      });
      if (fresh && mutationVersion === mutationVersionRef.current) setCart(fresh);
    },
    [cart, optimisticCart, updateOptimisticCart]
  );

  const add = useCallback(
    async (variant: ProductVariant, product: Product, quantity = 1) => {
      const baseCart = optimisticCart || cart;
      const previousQuantity = baseCart?.lines.find(l => l.merchandise.id === variant.id)?.quantity || 0;
      const snapshotLines = toPersistedCartSnapshotLines(baseCart);
      const mutationVersion = ++mutationVersionRef.current;

      setLastAddedAt(Date.now());
      startTransition(() => {
        updateOptimisticCart({ type: 'ADD_ITEM', payload: { variant, product, previousQuantity, quantity } });
      });
      const fresh = await CartActions.addItem(variant.id, quantity, snapshotLines);
      if (fresh && mutationVersion === mutationVersionRef.current) setCart(fresh);
    },
    [cart, optimisticCart, updateOptimisticCart]
  );

  const value = useMemo<UseCartReturn>(
    () => ({ cart: optimisticCart, warmCart, addItem: add, updateItem: update, isPending, lastAddedAt }),
    [optimisticCart, warmCart, add, update, isPending, lastAddedAt]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): UseCartReturn {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

export function useOptionalCart(): UseCartReturn | undefined {
  return useContext(CartContext);
}
