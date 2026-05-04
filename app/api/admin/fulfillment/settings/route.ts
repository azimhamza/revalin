import { createApiRoute } from '@/lib/api/route';
import {
  getShippoFulfillmentSettings,
  saveShippoFulfillmentSettings,
  shippoFulfillmentSettingsSchema,
} from '@/lib/checkout/shippo-fulfillment-settings';
import { getShippoConfigStatus } from '@/lib/checkout/shippo';

export const dynamic = 'force-dynamic';

export const GET = createApiRoute({
  route: '/api/admin/fulfillment/settings',
  access: 'admin',
  cacheControl: 'no-store',
  handler: async () => ({
    data: {
      settings: await getShippoFulfillmentSettings(),
      shippoConfig: getShippoConfigStatus(),
    },
  }),
});

export const PUT = createApiRoute({
  route: '/api/admin/fulfillment/settings',
  access: 'admin',
  bodySchema: shippoFulfillmentSettingsSchema,
  cacheControl: 'no-store',
  handler: async ({ body, session }) => ({
    data: {
      settings: await saveShippoFulfillmentSettings({
        value: body,
        updatedByUserId: session.user.id,
      }),
      shippoConfig: getShippoConfigStatus(),
    },
  }),
});

