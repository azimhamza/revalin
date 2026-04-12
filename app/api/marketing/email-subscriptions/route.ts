import crypto from 'node:crypto';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { createSwellCoupon } from '@/lib/checkout/swell-order-management';
import {
  createOrUpdateContact,
  findLoopsContact,
  hasLoopsConfig,
  sendLoopsEvent,
} from '@/lib/email/loops';
import { buildWelcomeDiscountContactProperties } from '@/lib/email/welcome-discount';
import { sendWelcomeDiscountSubscriberEmail } from '@/lib/email/welcome-discount-emails';

const subscribeSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  source: z.enum(['footer', 'popup']).default('footer'),
});

const DISCOUNT_PERCENT = 10;
const DISCOUNT_WINDOW_HOURS = 72;

function createDiscountCode() {
  return `W10${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
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

    // Each email can only claim the welcome discount once. Look the contact
    // up in Loops before doing any work — if they already exist, short-circuit
    // and tell the UI so it can render the "already subscribed" state without
    // issuing a fresh coupon or firing another discount email.
    try {
      const existing = await findLoopsContact({ email: body.email });
      if (existing) {
        return {
          data: {
            subscribed: true,
            alreadySubscribed: true,
          },
          status: 200,
        };
      }
    } catch (lookupError) {
      // Don't block a legitimate new subscriber on a transient Loops outage —
      // log and fall through to the create flow, which will still dedupe via
      // the 409 → updateContact fallback downstream.
      console.error('[EMAIL-SUBSCRIBE] findLoopsContact failed, proceeding as new subscriber:', lookupError);
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

    // Deliver the 10% off code directly to the subscriber via a Loops
    // transactional template. This is the source of truth for the customer
    // email — the `sendLoopsEvent` call below is kept for any downstream
    // analytics / secondary Loops automations, but we no longer rely on it
    // for the actual discount delivery.
    await sendWelcomeDiscountSubscriberEmail({
      email: body.email,
      discountCode,
      discountPercent: DISCOUNT_PERCENT,
      discountExpiresAt: expiresAt,
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

    return {
      data: {
        subscribed: true,
        alreadySubscribed: false,
      },
      status: 201,
    };
  },
});
