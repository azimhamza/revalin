import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createApiRoute } from '@/lib/api/route';
import {
  assertSessionReadyForQuote,
  buildSessionChanges,
  toCheckoutSessionState,
} from '@/lib/checkout/session-api';
import { checkoutSessionMutationSchema } from '@/lib/checkout/session-api-schemas';
import { buildCheckoutQuote } from '@/lib/checkout/quote-service';
import {
  requireCheckoutSession,
  saveCheckoutQuoteState,
  type CheckoutSessionRecord,
  updateCheckoutSession,
} from '@/lib/checkout/session-store';

const paramsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

type CheckoutRepriceData = {
  session: ReturnType<typeof toCheckoutSessionState>;
  quote: Awaited<ReturnType<typeof buildCheckoutQuote>> | null;
  stale: boolean;
};

function isDraftOutOfDateError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.code === 'conflict' &&
    error.details &&
    typeof error.details === 'object' &&
    (error.details as { code?: unknown }).code === 'draft_out_of_date'
  );
}

function isInvalidDiscountError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.code === 'bad_request' &&
    /discount code is invalid|invalid discount code|expired/i.test(error.message)
  );
}

async function clearInvalidDiscountFromSession(session: CheckoutSessionRecord) {
  try {
    await updateCheckoutSession({
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      expectedVersion: session.version,
      changes: {
        discountCode: null,
        selectedShippingServiceId: null,
        pricingSnapshot: null,
        providerQuoteCache: null,
        quoteExpiresAt: null,
        status: 'draft',
      },
    });
  } catch (error) {
    console.warn('Unable to clear invalid checkout discount from session.', {
      sessionId: session.sessionId,
      error,
    });
  }
}

function buildStaleRepriceResponse(session: CheckoutSessionRecord): {
  data: CheckoutRepriceData;
} {
  return {
    data: {
      session: toCheckoutSessionState(session),
      quote: null,
      stale: true,
    } satisfies CheckoutRepriceData,
  };
}

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/checkout/v2/sessions/:sessionId/reprice',
  rateLimit: 'checkout',
  paramsSchema,
  bodySchema: checkoutSessionMutationSchema,
  cacheControl: 'no-store',
  handler: async ({ params, body }) => {
    let hydrated: CheckoutSessionRecord;

    try {
      hydrated = await updateCheckoutSession({
        sessionId: params.sessionId,
        sessionKey: body.sessionKey,
        expectedVersion: body.version,
        changes: {
          ...buildSessionChanges(body),
          selectedShippingServiceId: body.selectedShippingServiceId,
        },
      });
    } catch (error) {
      if (!isDraftOutOfDateError(error)) {
        throw error;
      }

      const current = await requireCheckoutSession({
        sessionId: params.sessionId,
        sessionKey: body.sessionKey,
      });

      return buildStaleRepriceResponse(current);
    }

    const session = await requireCheckoutSession({
      sessionId: hydrated.sessionId,
      sessionKey: hydrated.sessionKey,
    });
    assertSessionReadyForQuote(session);

    let quote: Awaited<ReturnType<typeof buildCheckoutQuote>>;
    try {
      quote = await buildCheckoutQuote({
        cartId: session.cartId,
        cartSnapshot: session.cartSnapshot,
        shippingAddress: session.shippingAddress,
        discountCode: session.discountCode,
        paymentMethod: session.paymentMethod,
        selectedShippingServiceId:
          body.selectedShippingServiceId || session.selectedShippingServiceId,
        shipmentProtection: session.shipmentProtection,
      });
    } catch (error) {
      if (session.discountCode && isInvalidDiscountError(error)) {
        await clearInvalidDiscountFromSession(session);
      }

      throw error;
    }
    let persisted: CheckoutSessionRecord;

    try {
      persisted = await saveCheckoutQuoteState({
        sessionId: session.sessionId,
        sessionKey: session.sessionKey,
        expectedVersion: session.version,
        pricingSnapshot: quote as Record<string, unknown>,
        providerQuoteCache: quote as Record<string, unknown>,
        selectedShippingServiceId:
          body.selectedShippingServiceId ||
          (quote as { selectedServiceId?: string }).selectedServiceId ||
          null,
      });
    } catch (error) {
      if (!isDraftOutOfDateError(error)) {
        throw error;
      }

      const current = await requireCheckoutSession({
        sessionId: session.sessionId,
        sessionKey: session.sessionKey,
      });

      return buildStaleRepriceResponse(current);
    }

    return {
      data: {
        session: toCheckoutSessionState(persisted),
        quote,
        stale: false,
      } satisfies CheckoutRepriceData,
    };
  },
});
