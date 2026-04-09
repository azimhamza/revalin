import { createApiRoute } from '@/lib/api/route';
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
