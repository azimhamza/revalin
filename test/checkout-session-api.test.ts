import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../lib/api/errors.ts';
import {
  assertSessionReadyForFinalize,
  buildSessionChanges,
} from '../lib/checkout/session-api.ts';
import type { CheckoutSessionRecord } from '../lib/checkout/session-store.ts';

function buildSession(overrides: Partial<CheckoutSessionRecord> = {}): CheckoutSessionRecord {
  return {
    sessionId: 'session_123',
    sessionKey: 'key_123',
    version: 3,
    status: 'quoted',
    email: 'Ada@example.com',
    normalizedEmail: 'ada@example.com',
    cartId: 'cart_123',
    cartSnapshot: {
      currencyCode: 'USD',
      lines: [
        {
          id: 'line_1',
          merchandiseId: 'variant_1',
          productHandle: 'bpc-157',
          productTitle: 'BPC-157',
          variantTitle: '5mg',
          imageUrl: 'https://example.com/bpc-157.png',
          selectedOptions: [],
          quantity: 1,
          unitPrice: {
            amount: '49.99',
            currencyCode: 'USD',
          },
          lineTotal: {
            amount: '49.99',
            currencyCode: 'USD',
          },
        },
      ],
    },
    shippingAddress: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '5551234567',
      address1: '123 Test St',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5V 1E3',
      country: 'CA',
    },
    selectedShippingServiceId: 'shipengine:ground',
    paymentMethod: 'crypto',
    paymentCurrency: 'usdc',
    sourceWalletAddress: null,
    discountCode: 'WELCOME10',
    pricingSnapshot: null,
    providerQuoteCache: null,
    quoteExpiresAt: null,
    expiresAt: null,
    finalizedOrderId: null,
    finalizedAccessKey: null,
    paymentCompleted: null,
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
    ...overrides,
  };
}

test('buildSessionChanges normalizes email and discount code', () => {
  const changes = buildSessionChanges({
    discountCode: ' welcome10 ',
    shippingAddress: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada@example.com',
      phone: '5551234567',
      address1: '123 Test St',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5V 1E3',
      country: 'CA',
    },
  });

  assert.equal(changes.email, 'Ada@example.com');
  assert.equal(changes.discountCode, 'WELCOME10');
});

test('assertSessionReadyForFinalize rejects missing shipping service', () => {
  assert.throws(
    () =>
      assertSessionReadyForFinalize(
        buildSession({
          selectedShippingServiceId: null,
        }),
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === 'bad_request' &&
      /shipping method/i.test(error.message),
  );
});

test('assertSessionReadyForFinalize accepts a fully hydrated session', () => {
  assert.doesNotThrow(() => assertSessionReadyForFinalize(buildSession()));
});
