import { apiError } from '../api/errors.ts';
import type { z } from 'zod';
import { checkoutCartSnapshotSchema } from './session-api-schemas.ts';
import type { CheckoutSessionRecord } from './session-store.ts';
import type { CheckoutShippingAddress } from './types.ts';

type CheckoutSessionCartSnapshot = z.infer<typeof checkoutCartSnapshotSchema>;

export type QuoteReadyCheckoutSession = CheckoutSessionRecord & {
  cartSnapshot: CheckoutSessionCartSnapshot;
  shippingAddress: CheckoutShippingAddress;
};

export type FinalizeReadyCheckoutSession = QuoteReadyCheckoutSession & {
  selectedShippingServiceId: string;
  paymentMethod: 'card' | 'crypto';
  paymentCurrency: string;
};

export function toCheckoutSessionState(session: CheckoutSessionRecord) {
  return {
    sessionId: session.sessionId,
    sessionKey: session.sessionKey,
    version: session.version,
    state: {
      status: session.status,
      email: session.email,
      cartId: session.cartId,
      cartSnapshot: session.cartSnapshot,
      shippingAddress: session.shippingAddress,
      selectedShippingServiceId: session.selectedShippingServiceId,
      paymentMethod: session.paymentMethod,
      paymentCurrency: session.paymentCurrency,
      sourceWalletAddress: session.sourceWalletAddress,
      discountCode: session.discountCode,
      pricingSnapshot: session.pricingSnapshot,
      providerQuoteCache: session.providerQuoteCache,
      quoteExpiresAt: session.quoteExpiresAt,
      expiresAt: session.expiresAt,
      finalizedOrderId: session.finalizedOrderId,
    },
  };
}

export function buildSessionChanges(body: {
  cartId?: string;
  cartSnapshot?: Record<string, unknown>;
  shippingAddress?: CheckoutShippingAddress;
  selectedShippingServiceId?: string;
  paymentMethod?: 'card' | 'crypto';
  paymentCurrency?: string;
  sourceWalletAddress?: string;
  discountCode?: string;
}) {
  return {
    cartId: body.cartId,
    cartSnapshot: body.cartSnapshot,
    shippingAddress: body.shippingAddress,
    selectedShippingServiceId: body.selectedShippingServiceId,
    paymentMethod: body.paymentMethod,
    paymentCurrency: body.paymentCurrency?.trim() || null,
    sourceWalletAddress: body.sourceWalletAddress?.trim() || null,
    discountCode: body.discountCode?.trim().toUpperCase() || null,
    email: body.shippingAddress?.email?.trim() || undefined,
  };
}

export function assertSessionReadyForQuote(
  session: CheckoutSessionRecord,
): asserts session is QuoteReadyCheckoutSession {
  if (!session.cartSnapshot || !session.shippingAddress) {
    throw apiError.badRequest('Complete the shipping form before requesting rates.');
  }

  checkoutCartSnapshotSchema.parse(session.cartSnapshot);
}

export function assertSessionReadyForFinalize(
  session: CheckoutSessionRecord,
): asserts session is FinalizeReadyCheckoutSession {
  assertSessionReadyForQuote(session);

  if (!session.selectedShippingServiceId) {
    throw apiError.badRequest('Select a shipping method before creating the payment.');
  }
  if (!session.paymentMethod) {
    throw apiError.badRequest('Select a payment method before creating the payment.');
  }
  if (!session.paymentCurrency) {
    throw apiError.badRequest('Select a payment currency before creating the payment.');
  }
}
