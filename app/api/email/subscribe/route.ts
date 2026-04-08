import crypto from 'node:crypto';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createSwellCoupon } from '@/lib/checkout/swell-order-management';
import { hasLoopsConfig, createOrUpdateContact, sendLoopsEvent } from '@/lib/email/loops';
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

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = subscribeSchema.parse(rawBody);

    if (!hasLoopsConfig()) {
      return NextResponse.json({ error: 'Email service not configured.' }, { status: 503 });
    }

    // Create a unique coupon
    const discountCode = createDiscountCode();
    const expiresAt = new Date(Date.now() + DISCOUNT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    await createSwellCoupon({
      code: discountCode,
      name: `Welcome discount - ${body.email}`,
      percentOff: DISCOUNT_PERCENT,
      expiresAt,
      description: `Auto-issued welcome coupon for ${body.email}`,
    });

    // Create/update Loops contact
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

    // Fire event to trigger automation
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map(i => i.message).join(' ') },
        { status: 400 }
      );
    }

    console.error('[EMAIL-SUBSCRIBE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
