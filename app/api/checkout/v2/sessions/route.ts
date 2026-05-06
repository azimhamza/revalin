import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getSessionRole, optionalSession } from '@/lib/api/auth';
import { createCheckoutSession } from '@/lib/checkout/session-store';
import { buildSessionChanges, toCheckoutSessionState } from '@/lib/checkout/session-api';
import { checkoutSessionCreateSchema } from '@/lib/checkout/session-api-schemas';

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/checkout/v2/sessions',
  rateLimit: 'checkout',
  bodySchema: checkoutSessionCreateSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    if (body.adminShippingDisabled) {
      const authSession = await optionalSession();
      if (getSessionRole(authSession) !== 'admin') {
        throw apiError.forbidden();
      }
    }

    const session = await createCheckoutSession({
      ...buildSessionChanges(body),
      status: 'draft',
    });

    return {
      data: toCheckoutSessionState(session),
      status: 201,
    };
  },
});
