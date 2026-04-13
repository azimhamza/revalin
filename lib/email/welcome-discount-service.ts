import {
  createSwellCoupon,
  deleteSwellCoupon,
} from '@/lib/checkout/swell-order-management';
import {
  createOrUpdateContact,
  findLoopsContact,
  hasLoopsConfig,
  sendLoopsEvent,
} from '@/lib/email/loops';
import {
  WELCOME_DISCOUNT_PERCENT,
  WELCOME_DISCOUNT_WINDOW_HOURS,
  buildWelcomeDiscountContactProperties,
  createWelcomeDiscountCode,
  getWelcomeDiscountContactCode,
  getWelcomeDiscountContactExpiresAt,
} from '@/lib/email/welcome-discount';
import { sendWelcomeDiscountEmail } from '@/lib/email/welcome-discount-emails';

export type WelcomeDiscountSource = 'footer' | 'popup' | 'account_signup';

export type IssueWelcomeDiscountResult = {
  issued: boolean;
  alreadyIssued: boolean;
  discountCode: string | null;
  discountExpiresAt: string | null;
};

export async function issueWelcomeDiscount(args: {
  email: string;
  source: WelcomeDiscountSource;
  firstName?: string;
  lastName?: string;
  mailingLists?: Record<string, boolean>;
  eventName: string;
  lookupErrorLogPrefix: string;
  resendExisting?: boolean;
}) {
  if (!hasLoopsConfig()) {
    throw new Error('Email service not configured.');
  }

  const email = args.email.trim().toLowerCase();
  let existingContact: Record<string, unknown> | null = null;

  try {
    existingContact = await findLoopsContact({ email });
  } catch (lookupError) {
    console.error(
      `[${args.lookupErrorLogPrefix}] findLoopsContact failed, proceeding with welcome discount issue:`,
      lookupError,
    );
  }

  const existingDiscountCode = getWelcomeDiscountContactCode(existingContact);
  if (existingDiscountCode) {
    const existingDiscountExpiresAt =
      getWelcomeDiscountContactExpiresAt(existingContact);

    if (
      args.resendExisting &&
      existingDiscountExpiresAt &&
      Date.parse(existingDiscountExpiresAt) > Date.now()
    ) {
      await sendWelcomeDiscountEmail({
        email,
        discountCode: existingDiscountCode,
        discountPercent: WELCOME_DISCOUNT_PERCENT,
        discountExpiresAt: existingDiscountExpiresAt,
      });

      return {
        issued: false,
        alreadyIssued: true,
        discountCode: existingDiscountCode,
        discountExpiresAt: existingDiscountExpiresAt,
      } satisfies IssueWelcomeDiscountResult;
    }

    return {
      issued: false,
      alreadyIssued: true,
      discountCode: null,
      discountExpiresAt: null,
    } satisfies IssueWelcomeDiscountResult;
  }

  const discountCode = createWelcomeDiscountCode();
  const discountExpiresAt = new Date(
    Date.now() + WELCOME_DISCOUNT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const swellCoupon = await createSwellCoupon({
    code: discountCode,
    name: `Welcome discount - ${email}`,
    percentOff: WELCOME_DISCOUNT_PERCENT,
    expiresAt: discountExpiresAt,
    description: `Auto-issued welcome coupon for ${email}`,
  });

  try {
    await sendWelcomeDiscountEmail({
      email,
      discountCode,
      discountPercent: WELCOME_DISCOUNT_PERCENT,
      discountExpiresAt,
    });
  } catch (error) {
    try {
      await deleteSwellCoupon(swellCoupon.id);
    } catch (cleanupError) {
      console.error(
        `[${args.lookupErrorLogPrefix}] Failed to clean up unsent welcome coupon ${discountCode}:`,
        cleanupError,
      );
    }

    throw error;
  }

  try {
    await createOrUpdateContact({
      email,
      firstName: args.firstName,
      lastName: args.lastName,
      source: args.source,
      mailingLists: args.mailingLists,
      properties: buildWelcomeDiscountContactProperties({
        discountCode,
        discountExpiresAt,
      }),
    });
  } catch (error) {
    console.error(
      `[${args.lookupErrorLogPrefix}] Failed to store welcome discount contact properties after email send:`,
      error,
    );
  }

  try {
    await sendLoopsEvent({
      email,
      eventName: args.eventName,
      eventProperties: {
        discountCode,
        discountPercent: WELCOME_DISCOUNT_PERCENT,
        source: args.source,
      },
    });
  } catch (error) {
    console.error(
      `[${args.lookupErrorLogPrefix}] Failed to send welcome discount Loops event after email send:`,
      error,
    );
  }

  return {
    issued: true,
    alreadyIssued: false,
    discountCode,
    discountExpiresAt,
  } satisfies IssueWelcomeDiscountResult;
}
