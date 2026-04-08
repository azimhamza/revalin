'use server';

import { TAGS } from '@/lib/constants';
import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import {
  createCart as createSwellCart,
  addCartLines,
  updateCartLines,
  removeCartLines,
  getCart as getSwellCart,
} from '@/lib/swell/swell';
import type { Cart, CartItem, SwellCart, SwellCartLine } from '@/lib/swell/types';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import { resolveUnitPrice } from '@/lib/swell/utils';

export type PersistedCartLineInput = {
  merchandiseId: string;
  quantity: number;
};

// Local adapter utilities to return FE Cart (avoid cyclic deps)
function adaptCartLine(swellLine: SwellCartLine): CartItem {
  const merchandise = swellLine.merchandise;
  const product = merchandise.product;
  const unitPrice = resolveUnitPrice(merchandise.price.amount, swellLine.quantity, swellLine.bulkPriceTiers);

  return {
    id: swellLine.id,
    quantity: swellLine.quantity,
    bulkPriceTiers: swellLine.bulkPriceTiers,
    cost: {
      totalAmount: {
        amount: (parseFloat(unitPrice) * swellLine.quantity).toString(),
        currencyCode: merchandise.price.currencyCode,
      },
    },
    merchandise: {
      id: merchandise.id,
      title: merchandise.title,
      sku: merchandise.sku,
      availableQuantity: merchandise.availableQuantity ?? null,
      selectedOptions: merchandise.selectedOptions || [],
      product: {
        id: product.title,
        title: product.title,
        handle: product.handle,
        categoryId: undefined,
        description: '',
        descriptionHtml: '',
        featuredImage: product.images?.edges?.[0]?.node
          ? {
              ...product.images.edges[0].node,
              altText: product.images.edges[0].node.altText || product.title,
              height: 600,
              width: 600,
              thumbhash: product.images.edges[0].node.thumbhash || undefined,
            }
          : { url: '', altText: '', height: 0, width: 0 },
        currencyCode: merchandise.price.currencyCode,
        stockStatus: product.stockStatus,
        stockLevel: product.stockLevel,
        priceRange: {
          minVariantPrice: merchandise.price,
          maxVariantPrice: merchandise.price,
        },
        compareAtPrice: product.compareAtPrice,
        seo: { title: product.title, description: '' },
        options: [],
        tags: [],
        variants: [],
        images:
          product.images?.edges?.map((edge: any) => ({
            ...edge.node,
            altText: edge.node.altText || product.title,
            height: 600,
            width: 600,
          })) || [],
        availableForSale: product.availableForSale !== false,
      },
    },
  } satisfies CartItem;
}

function adaptCart(swellCart: SwellCart | null): Cart | null {
  if (!swellCart) return null;

  const lines = swellCart.lines?.edges?.map((edge: any) => adaptCartLine(edge.node)) || [];

  return {
    id: swellCart.id,
    checkoutUrl: swellCart.checkoutUrl,
    cost: {
      subtotalAmount: swellCart.cost.subtotalAmount,
      totalAmount: swellCart.cost.totalAmount,
      totalTaxAmount: swellCart.cost.totalTaxAmount,
    },
    totalQuantity: lines.reduce((sum: number, line: CartItem) => sum + line.quantity, 0),
    lines,
  } satisfies Cart;
}

async function getOrCreateCartId(): Promise<string> {
  let cartId = (await cookies()).get('cartId')?.value;
  if (!cartId) {
    const currencyCode = await resolveRequestCurrencyCode();
    const newCart = await createSwellCart(currencyCode);
    cartId = newCart.id;
    (await cookies()).set('cartId', cartId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return cartId;
}

async function setCartCookie(cartId: string) {
  (await cookies()).set('cartId', cartId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function rebuildCartFromSnapshot(
  lines: PersistedCartLineInput[],
  currencyCode: string
): Promise<SwellCart | null> {
  const normalizedLines = lines
    .map(line => ({
      merchandiseId: line.merchandiseId,
      quantity: Math.max(1, Number(line.quantity) || 1),
    }))
    .filter(line => Boolean(line.merchandiseId));

  if (normalizedLines.length === 0) {
    return null;
  }

  const newCart = await createSwellCart(currencyCode);
  await setCartCookie(newCart.id);
  await addCartLines(newCart.id, normalizedLines, currencyCode);
  return getSwellCart(newCart.id, currencyCode);
}

async function resolveCartForMutation(
  currencyCode: string,
  cartSnapshotLines: PersistedCartLineInput[] = []
): Promise<SwellCart> {
  const cookieStore = await cookies();
  const cartId = cookieStore.get('cartId')?.value;

  if (cartId) {
    const existingCart = await getSwellCart(cartId, currencyCode);
    if (existingCart) {
      return existingCart;
    }
  }

  const restoredCart = await rebuildCartFromSnapshot(cartSnapshotLines, currencyCode);
  if (restoredCart) {
    return restoredCart;
  }

  const newCart = await createSwellCart(currencyCode);
  await setCartCookie(newCart.id);
  return newCart;
}

// Add item server action: returns adapted Cart
export async function addItem(
  variantId: string | undefined,
  quantity = 1,
  cartSnapshotLines: PersistedCartLineInput[] = []
): Promise<Cart | null> {
  if (!variantId) return null;
  try {
    const currencyCode = await resolveRequestCurrencyCode();
    const activeCart = await resolveCartForMutation(currencyCode, cartSnapshotLines);
    await addCartLines(activeCart.id, [{ merchandiseId: variantId, quantity }], currencyCode);
    const fresh = await getSwellCart(activeCart.id, currencyCode);
    revalidateTag(TAGS.cart);
    return adaptCart(fresh);
  } catch (error) {
    console.error('Error adding item to cart:', error);
    return null;
  }
}

// Update item server action (quantity 0 removes): returns adapted Cart
export async function updateItem({
  lineId,
  merchandiseId,
  quantity,
  cartSnapshotLines = [],
}: {
  lineId: string;
  merchandiseId: string;
  quantity: number;
  cartSnapshotLines?: PersistedCartLineInput[];
}): Promise<Cart | null> {
  try {
    const currencyCode = await resolveRequestCurrencyCode();
    const activeCart = await resolveCartForMutation(currencyCode, cartSnapshotLines);
    const resolvedLineId =
      activeCart.lines?.edges?.find(edge => edge.node.merchandise.id === merchandiseId)?.node.id || lineId;

    if (quantity === 0) {
      if (resolvedLineId) {
        await removeCartLines(activeCart.id, [resolvedLineId], currencyCode);
      }
    } else {
      if (resolvedLineId) {
        await updateCartLines(activeCart.id, [{ id: resolvedLineId, quantity }], currencyCode);
      } else {
        await addCartLines(activeCart.id, [{ merchandiseId, quantity }], currencyCode);
      }
    }

    const fresh = await getSwellCart(activeCart.id, currencyCode);
    revalidateTag(TAGS.cart);
    return adaptCart(fresh);
  } catch (error) {
    console.error('Error updating item:', error);
    return null;
  }
}

export async function createCartAndSetCookie() {
  try {
    const currencyCode = await resolveRequestCurrencyCode();
    const existingCartId = (await cookies()).get('cartId')?.value;

    if (existingCartId) {
      const existingCart = await getSwellCart(existingCartId, currencyCode);
      if (existingCart) {
        return existingCart;
      }
    }

    const newCart = await createSwellCart(currencyCode);
    await setCartCookie(newCart.id);

    return newCart;
  } catch (error) {
    console.error('Error creating cart:', error);
    return null;
  }
}

export async function getCart(): Promise<Cart | null> {
  try {
    const currencyCode = await resolveRequestCurrencyCode();
    const cartId = (await cookies()).get('cartId')?.value;

    if (!cartId) {
      return null;
    }
    const fresh = await getSwellCart(cartId, currencyCode);
    return adaptCart(fresh);
  } catch (error) {
    console.error('Error fetching cart:', error);
    return null;
  }
}

export async function restoreCart(lines: PersistedCartLineInput[]): Promise<Cart | null> {
  try {
    const currencyCode = await resolveRequestCurrencyCode();
    const fresh = await rebuildCartFromSnapshot(lines, currencyCode);
    if (!fresh) {
      return null;
    }
    revalidateTag(TAGS.cart);
    return adaptCart(fresh);
  } catch (error) {
    console.error('Error restoring cart:', error);
    return null;
  }
}
