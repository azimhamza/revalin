import { z } from 'zod';
import { cookies } from 'next/headers';
import { apiError } from '@/lib/api/errors';
import { getSessionRole, optionalSession } from '@/lib/api/auth';
import { createApiRoute } from '@/lib/api/route';
import { AFFILIATE_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';
import { ADMIN_DISABLED_SHIPPING_SERVICE_ID } from '@/lib/checkout/admin-shipping';
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
import { isBankfulPayment, isShieldClimbPayment, isSquarePayment } from '@/lib/checkout/types';
import { buildPublicCheckoutOrder } from '@/lib/checkout/public-order';
import { linkCurrentResearchConsentToOrder } from '@/lib/compliance/research-access-consent';

const paramsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

function getHostedPaymentRedirectUrl(order: Awaited<ReturnType<typeof getCheckoutOrder>>) {
  if (!order) return null;
  if (isShieldClimbPayment(order.payment)) return order.payment.redirectUrl;
  if (isBankfulPayment(order.payment)) return order.payment.redirectUrl ?? null;
  if (isSquarePayment(order.payment)) return order.payment.checkoutUrl;
  return null;
}

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
    const authSession = await optionalSession();
    const adminShippingDisabled = body.adminShippingDisabled === true;
    if (adminShippingDisabled && getSessionRole(authSession) !== 'admin') {
      throw apiError.forbidden();
    }

    if (current.finalizedOrderId && current.finalizedAccessKey) {
      const existingOrder = await getCheckoutOrder(current.finalizedOrderId);
      if (existingOrder) {
        await linkCurrentResearchConsentToOrder({
          checkoutOrderId: existingOrder.orderId,
          checkoutSessionId: current.sessionId,
          email: existingOrder.shippingAddress.email,
          userId: authSession?.user?.id ?? null,
          request,
        }).catch((error) => {
          console.error('[RESEARCH-CONSENT] Failed to link existing checkout order:', error);
        });

        return {
          data: {
            session: toCheckoutSessionState(current),
            accessKey: current.finalizedAccessKey,
            order: await buildPublicCheckoutOrder(existingOrder),
            redirectUrl: getHostedPaymentRedirectUrl(existingOrder),
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
        selectedShippingServiceId: adminShippingDisabled
          ? ADMIN_DISABLED_SHIPPING_SERVICE_ID
          : body.selectedShippingServiceId,
        shipmentProtection: adminShippingDisabled
          ? false
          : body.shipmentProtection,
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
      const storedOrderId =
        typeof stored.order.orderId === 'string' ? stored.order.orderId : null;
      const storedShippingAddress =
        stored.order.shippingAddress &&
        typeof stored.order.shippingAddress === 'object'
          ? (stored.order.shippingAddress as { email?: unknown })
          : null;
      const storedEmail =
        typeof storedShippingAddress?.email === 'string'
          ? storedShippingAddress.email
          : null;
      if (storedOrderId) {
        await linkCurrentResearchConsentToOrder({
          checkoutOrderId: storedOrderId,
          checkoutSessionId: session.sessionId,
          email: storedEmail,
          userId: authSession?.user?.id ?? null,
          request,
        }).catch((error) => {
          console.error('[RESEARCH-CONSENT] Failed to link stored checkout order:', error);
        });
      }

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
        sessionVersion: session.version,
        cartId: session.cartId,
        cartSnapshot: session.cartSnapshot,
        shippingAddress: session.shippingAddress,
        paymentMethod: session.paymentMethod,
        paymentCurrency: session.paymentCurrency,
        sourceWalletAddress: session.sourceWalletAddress,
        interacSenderEmail: session.interacSenderEmail,
        interacSenderName: session.interacSenderName,
        interacSecurityQuestion: session.interacSecurityQuestion,
        interacSecurityAnswer: session.interacSecurityAnswer,
        selectedShippingServiceId: adminShippingDisabled
          ? ADMIN_DISABLED_SHIPPING_SERVICE_ID
          : session.selectedShippingServiceId,
        shipmentProtection: adminShippingDisabled ? false : session.shipmentProtection,
        adminShippingDisabled,
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

    await linkCurrentResearchConsentToOrder({
      checkoutOrderId: result.order.orderId,
      checkoutSessionId: session.sessionId,
      email: result.order.shippingAddress.email,
      userId: authSession?.user?.id ?? null,
      request,
    }).catch((error) => {
      console.error('[RESEARCH-CONSENT] Failed to link checkout order:', error);
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
