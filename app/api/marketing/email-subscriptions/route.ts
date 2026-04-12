import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { hasLoopsConfig } from '@/lib/email/loops';
import { issueWelcomeDiscount } from '@/lib/email/welcome-discount-service';

const subscribeSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  source: z.enum(['footer', 'popup']).default('footer'),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/marketing/email-subscriptions',
  rateLimit: 'marketing',
  bodySchema: subscribeSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    if (!hasLoopsConfig()) {
      throw apiError.providerUnavailable('Email service not configured.', {
        provider: 'loops',
      }, false);
    }

    const newsletterListId = process.env.LOOPS_MAILING_LIST_NEWSLETTER?.trim();
    const discount = await issueWelcomeDiscount({
      email: body.email,
      source: body.source,
      mailingLists: newsletterListId ? { [newsletterListId]: true } : undefined,
      eventName: 'subscriber_welcome',
      lookupErrorLogPrefix: 'EMAIL-SUBSCRIBE',
    });

    return {
      data: {
        subscribed: true,
        alreadySubscribed: discount.alreadyIssued,
      },
      status: discount.alreadyIssued ? 200 : 201,
    };
  },
});
