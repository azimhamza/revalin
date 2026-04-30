import { createApiRoute } from '@/lib/api/route';
import { cancelStaleShieldClimbCheckouts } from '@/lib/checkout/stale-checkout-cancellation';

export const POST = createApiRoute({
  route: 'admin/checkout/stale-orders/cancel',
  access: 'admin',
  handler: async () => {
    const result = await cancelStaleShieldClimbCheckouts();

    return {
      data: result,
    };
  },
});
