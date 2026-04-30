import { createApiRoute } from '@/lib/api/route';
import { processGmailInteracPubSub } from '@/lib/checkout/interac';

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/webhooks/gmail/interac',
  cacheControl: 'no-store',
  handler: async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const result = await processGmailInteracPubSub(body);
    return { data: result };
  },
});
