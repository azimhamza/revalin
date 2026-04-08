import { hasLoopsConfig, sendTransactionalEmail } from '@/lib/email/loops';

const DEFAULT_WELCOME_DISCOUNT_TRANSACTIONAL_ID = 'cmnny5qyb07uw0iygc80j82d2';
const DEFAULT_WELCOME_DISCOUNT_RECIPIENT = 'operations@revalin.ca';

function getWelcomeDiscountRecipient() {
  return process.env.WELCOME_DISCOUNT_EMAIL_TO?.trim() || DEFAULT_WELCOME_DISCOUNT_RECIPIENT;
}

export async function sendWelcomeDiscountIssuedEmail(discountCode: string) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping welcome discount notification: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_WELCOME_DISCOUNT_ISSUED?.trim() ||
    DEFAULT_WELCOME_DISCOUNT_TRANSACTIONAL_ID;

  if (!transactionalId) {
    console.warn(
      'Skipping welcome discount notification: LOOPS_TRANSACTIONAL_WELCOME_DISCOUNT_ISSUED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: getWelcomeDiscountRecipient(),
    transactionalId,
    dataVariables: {
      discount_code: discountCode,
    },
  });
}
