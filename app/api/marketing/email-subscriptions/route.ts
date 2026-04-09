import crypto from 'node:crypto';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { createSwellCoupon } from '@/lib/checkout/swell-order-management';
import { createOrUpdateContact, hasLoopsConfig, sendLoopsEvent } from '@/lib/email/loops';
import { buildWelcomeDiscountContactProperties } from '@/lib/email/welcome-discount';
import { sendWelcomeDiscountIssuedEmail } from '@/lib/email/welcome-discount-emails';

const subscribeSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  source: z.enum(['footer', 'popup']).default('footer'),
});

const DISCOUNT_PERCENT = 10;
const DISCOUNT_WINDOW_HOURS = 72;

function createDiscountCode() {
  return `WELCOME10-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

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

    const discountCode = createDiscountCode();
    const expiresAt = new Date(
      Date.now() + DISCOUNT_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();

    await createSwellCoupon({
      code: discountCode,
      name: `Welcome discount - ${body.email}`,
      percentOff: DISCOUNT_PERCENT,
      expiresAt,
      description: `Auto-issued welcome coupon for ${body.email}`,
    });

    const newsletterListId = process.env.LOOPS_MAILING_LIST_NEWSLETTER?.trim();
    await createOrUpdateContact({
      email: body.email,
      source: body.source,
      mailingLists: newsletterListId ? { [newsletterListId]: true } : undefined,
      properties: buildWelcomeDiscountContactProperties({
        discountCode,
        discountExpiresAt: expiresAt,
      }),
    });

    await sendLoopsEvent({
      email: body.email,
      eventName: 'subscriber_welcome',
      eventProperties: {
        discountCode,
        discountPercent: DISCOUNT_PERCENT,
        source: body.source,
      },
    });

    try {
      await sendWelcomeDiscountIssuedEmail(discountCode);
    } catch (notificationError) {
      console.error('[EMAIL-SUBSCRIBE] Failed to send welcome discount notification:', notificationError);
    }

    return {
      data: {
        subscribed: true,
      },
      status: 201,
    };
  },
});
