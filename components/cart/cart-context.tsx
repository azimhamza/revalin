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
import { getProductFulfillmentEstimate } from '@/lib/inventory';
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
          if (nextQuantity <= 0) return null;

          const baseUnitPrice = item.merchandise.product.priceRange.minVariantPrice.amount;
          const effectiveUnitPrice = resolveUnitPrice(baseUnitPrice, nextQuantity, item.bulkPriceTiers);
          const newTotalAmount = calculateItemCost(nextQuantity, effectiveUnitPrice);
          const selectedVariant =
            item.merchandise.product.variants.find(variant => variant.id === item.merchandise.id) || null;
          const fulfillmentEstimate = getProductFulfillmentEstimate(
            item.merchandise.product,
            selectedVariant,
            nextQuantity
          );

          return {
            ...item,
            quantity: nextQuantity,
            fulfillmentEstimate,
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
      const targetQuantity = previousQuantity + quantity;
      const tiers = variant.bulkPriceTiers?.length ? variant.bulkPriceTiers : product.bulkPriceTiers;
      const fulfillmentEstimate = getProductFulfillmentEstimate(product, variant, targetQuantity);

      if (targetQuantity <= 0) {
        return currentCart;
      }

      const updatedLines = existingItem
        ? currentCart.lines.map(item => {
            if (item.merchandise.id !== variant.id) return item;

            const effectiveUnitPrice = resolveUnitPrice(variant.price.amount, targetQuantity, item.bulkPriceTiers);
            const newTotalAmount = calculateItemCost(targetQuantity, effectiveUnitPrice);

            return {
              ...item,
              quantity: targetQuantity,
              fulfillmentEstimate,
              merchandise: {
                ...item.merchandise,
                availableQuantity: null,
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
              quantity: targetQuantity,
              bulkPriceTiers: tiers,
              fulfillmentEstimate,
              cost: {
                totalAmount: {
                  amount: calculateItemCost(
                    targetQuantity,
                    resolveUnitPrice(variant.price.amount, targetQuantity, tiers)
                  ),
                  currencyCode: variant.price.currencyCode,
                },
              },
              merchandise: {
                id: variant.id,
                title: variant.title,
                availableQuantity: null,
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
