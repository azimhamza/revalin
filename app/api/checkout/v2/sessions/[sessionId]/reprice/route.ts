import { z } from 'zod';
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
  updateCheckoutSession,
} from '@/lib/checkout/session-store';

const paramsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/checkout/v2/sessions/:sessionId/reprice',
  rateLimit: 'checkout',
  paramsSchema,
  bodySchema: checkoutSessionMutationSchema,
  cacheControl: 'no-store',
  handler: async ({ params, body }) => {
    const hydrated = await updateCheckoutSession({
      sessionId: params.sessionId,
      sessionKey: body.sessionKey,
      expectedVersion: body.version,
      changes: {
        ...buildSessionChanges(body),
        selectedShippingServiceId: body.selectedShippingServiceId,
      },
    });

    const session = await requireCheckoutSession({
      sessionId: hydrated.sessionId,
      sessionKey: hydrated.sessionKey,
    });
    assertSessionReadyForQuote(session);

    const quote = await buildCheckoutQuote({
      cartId: session.cartId,
      cartSnapshot: session.cartSnapshot,
      shippingAddress: session.shippingAddress,
      discountCode: session.discountCode,
      paymentMethod: session.paymentMethod,
      selectedShippingServiceId:
        body.selectedShippingServiceId || session.selectedShippingServiceId,
    });
    const persisted = await saveCheckoutQuoteState({
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      pricingSnapshot: quote as Record<string, unknown>,
      providerQuoteCache: quote as Record<string, unknown>,
      selectedShippingServiceId:
        body.selectedShippingServiceId ||
        (quote as { selectedServiceId?: string }).selectedServiceId ||
        null,
    });

    return {
      data: {
        session: toCheckoutSessionState(persisted),
        quote,
      },
    };
  },
});
