import { hasLoopsConfig, sendTransactionalEmail } from '@/lib/email/loops';

// Sends the 10% welcome discount code directly through a Loops transactional
// template. This is used for both newsletter captures and account signups.
export async function sendWelcomeDiscountEmail(args: {
  email: string;
  discountCode: string;
  discountPercent: number;
  discountExpiresAt: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping welcome discount email: Loops not configured.');
    return null;
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_WELCOME_DISCOUNT_SUBSCRIBER?.trim();
  if (!transactionalId) {
    // Surface this loudly — previously the subscriber was relying entirely on
    // a Loops dashboard automation for `subscriber_welcome`, which silently
    // drops the email if the automation isn't configured. Requiring a
    // dedicated transactional template removes that failure mode.
    throw new Error(
      'LOOPS_TRANSACTIONAL_WELCOME_DISCOUNT_SUBSCRIBER is not set. Configure the subscriber welcome-discount transactional template in Loops.',
    );
  }

  return sendTransactionalEmail({
    email: args.email,
    transactionalId,
    addToAudience: true,
    dataVariables: {
      discount_code: args.discountCode,
      discount_percent: args.discountPercent,
      discount_expires_at: args.discountExpiresAt,
    },
  });
}

export async function sendWelcomeDiscountSubscriberEmail(args: {
  email: string;
  discountCode: string;
  discountPercent: number;
  discountExpiresAt: string;
}) {
  return sendWelcomeDiscountEmail(args);
}
