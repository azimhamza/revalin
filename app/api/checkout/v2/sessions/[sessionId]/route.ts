import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getSessionRole, optionalSession } from '@/lib/api/auth';
import { requireCheckoutSession, updateCheckoutSession } from '@/lib/checkout/session-store';
import { buildSessionChanges, toCheckoutSessionState } from '@/lib/checkout/session-api';
import {
  checkoutSessionAccessSchema,
  checkoutSessionMutationSchema,
} from '@/lib/checkout/session-api-schemas';

const paramsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

export const GET = createApiRoute({
  route: '/api/checkout/v2/sessions/:sessionId',
  rateLimit: 'checkout',
  paramsSchema,
  querySchema: checkoutSessionAccessSchema,
  cacheControl: 'no-store',
  handler: async ({ params, query }) => {
    const session = await requireCheckoutSession({
      sessionId: params.sessionId,
      sessionKey: query.sessionKey,
    });

    return {
      data: toCheckoutSessionState(session),
    };
  },
});

export const PATCH = createApiRoute({
  route: '/api/checkout/v2/sessions/:sessionId',
  rateLimit: 'checkout',
  paramsSchema,
  bodySchema: checkoutSessionMutationSchema,
  cacheControl: 'no-store',
  handler: async ({ params, body }) => {
    if (body.adminShippingDisabled) {
      const authSession = await optionalSession();
      if (getSessionRole(authSession) !== 'admin') {
        throw apiError.forbidden();
      }
    }

    const session = await updateCheckoutSession({
      sessionId: params.sessionId,
      sessionKey: body.sessionKey,
      expectedVersion: body.version,
      changes: {
        ...buildSessionChanges(body),
        selectedShippingServiceId: body.selectedShippingServiceId,
      },
    });

    return {
      data: toCheckoutSessionState(session),
    };
  },
});
