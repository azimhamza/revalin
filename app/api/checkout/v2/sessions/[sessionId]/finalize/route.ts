import { z } from 'zod';
import { cookies } from 'next/headers';
import { optionalSession } from '@/lib/api/auth';
import { createApiRoute } from '@/lib/api/route';
import { AFFILIATE_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';
import { getStoredUserReferralCode } from '@/lib/checkout/affiliate-user-referral';
import {
  assertSessionReadyForFinalize,
  buildSessionChanges,
  toCheckoutSessionState,
} from '@/lib/checkout/session-api';
import { checkoutSessionMutationSchema } from '@/lib/checkout/session-api-schemas';
import { finalizeCheckoutSession } from '@/lib/checkout/finalize-service';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import {
  getStoredIdempotentResponse,
  requireCheckoutSession,
  storeIdempotentResponse,
  updateCheckoutSession,
} from '@/lib/checkout/session-store';
import type { CheckoutOrderPublic } from '@/lib/checkout/types';
import { toPublicCheckoutOrder } from '@/lib/checkout/types';

const paramsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/checkout/v2/sessions/:sessionId/finalize',
  rateLimit: 'checkout',
  paramsSchema,
  bodySchema: checkoutSessionMutationSchema,
  cacheControl: 'no-store',
  handler: async ({ request, params, body }) => {
    const current = await requireCheckoutSession({
      sessionId: params.sessionId,
      sessionKey: body.sessionKey,
    });

    if (current.finalizedOrderId && current.finalizedAccessKey) {
      const existingOrder = await getCheckoutOrder(current.finalizedOrderId);
      if (existingOrder) {
        return {
          data: {
            session: toCheckoutSessionState(current),
            accessKey: current.finalizedAccessKey,
            order: toPublicCheckoutOrder(existingOrder),
            redirectUrl:
              existingOrder.payment.provider === 'shieldclimb'
                ? existingOrder.payment.redirectUrl
                : null,
          },
        };
      }
    }

    const session = await updateCheckoutSession({
      sessionId: params.sessionId,
      sessionKey: body.sessionKey,
      expectedVersion: body.version,
      changes: {
        ...buildSessionChanges(body),
        selectedShippingServiceId: body.selectedShippingServiceId,
        status: 'finalizing',
      },
    });

    assertSessionReadyForFinalize(session);

    const idempotencyKey = `checkout-finalize:${session.sessionId}:${session.version}`;
    const stored = await getStoredIdempotentResponse<{
      accessKey: string;
      order: Record<string, unknown>;
      redirectUrl?: string | null;
    }>(idempotencyKey);

    if (stored) {
      return {
        data: {
          session: toCheckoutSessionState(session),
          ...stored,
        },
      };
    }

    const cookieAffiliateCode =
      (await cookies()).get(AFFILIATE_COOKIE_NAME)?.value?.trim() || null;

    // Fall back to the affiliate code stamped on the user row during
    // post-auth reconcile. This preserves attribution for shoppers who
    // cleared cookies, switched devices, or returned after the 30-day
    // cookie window — as long as they're signed in when they check out.
    let affiliateCode = cookieAffiliateCode;
    if (!affiliateCode) {
      const authSession = await optionalSession();
      if (authSession?.user?.id) {
        affiliateCode = await getStoredUserReferralCode(authSession.user.id);
      }
    }

    let result: {
      accessKey: string;
      order: CheckoutOrderPublic;
      redirectUrl?: string | null;
    };

    try {
      result = (await finalizeCheckoutSession({
        sessionId: session.sessionId,
        cartId: session.cartId,
        cartSnapshot: session.cartSnapshot,
        shippingAddress: session.shippingAddress,
        paymentMethod: session.paymentMethod,
        paymentCurrency: session.paymentCurrency,
        sourceWalletAddress: session.sourceWalletAddress,
        selectedShippingServiceId: session.selectedShippingServiceId,
        discountCode: session.discountCode,
        requestUrl: new URL(request.url),
        affiliateCode,
      }));
    } catch (error) {
      await updateCheckoutSession({
        sessionId: session.sessionId,
        sessionKey: session.sessionKey,
        expectedVersion: session.version,
        bumpVersion: false,
        changes: {
          status: session.pricingSnapshot ? 'quoted' : 'draft',
        },
      }).catch((updateError) => {
        console.error('Unable to reset checkout session status after finalize failure:', updateError);
      });

      throw error;
    }

    const finalizedSession = await updateCheckoutSession({
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      expectedVersion: session.version,
      bumpVersion: false,
      changes: {
        status: 'finalized',
        finalizedOrderId: result.order.orderId,
        finalizedAccessKey: result.accessKey,
      },
    });

    await storeIdempotentResponse({
      key: idempotencyKey,
      scope: 'checkout-finalize',
      resourceId: result.order.orderId,
      response: {
        accessKey: result.accessKey,
        order: result.order as Record<string, unknown>,
        redirectUrl: result.redirectUrl ?? null,
      },
    });

    return {
      data: {
        session: toCheckoutSessionState(finalizedSession),
        accessKey: result.accessKey,
        order: result.order,
        redirectUrl: result.redirectUrl ?? null,
      },
    };
  },
});
