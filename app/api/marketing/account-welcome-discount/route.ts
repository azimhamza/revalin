import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { hasLoopsConfig } from '@/lib/email/loops';
import { issueWelcomeDiscount } from '@/lib/email/welcome-discount-service';

function splitName(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) {
    return { firstName: undefined, lastName: undefined };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.length ? rest.join(' ') : undefined,
  };
}

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/marketing/account-welcome-discount',
  access: 'fresh-session',
  rateLimit: 'marketing',
  cacheControl: 'no-store',
  handler: async ({ session }) => {
    const email = session.user.email?.trim();
    if (!email) {
      throw apiError.badRequest('Missing user email.');
    }

    if (!hasLoopsConfig()) {
      throw apiError.providerUnavailable('Email service not configured.', {
        provider: 'loops',
      }, false);
    }

    const { firstName, lastName } = splitName(session.user.name);
    const discount = await issueWelcomeDiscount({
      email,
      firstName,
      lastName,
      source: 'account_signup',
      eventName: 'account_welcome',
      lookupErrorLogPrefix: 'ACCOUNT-WELCOME-DISCOUNT',
      resendExisting: true,
    });

    return {
      data: {
        discountIssued: discount.issued,
        alreadyIssued: discount.alreadyIssued,
      },
      status: discount.alreadyIssued ? 200 : 201,
    };
  },
});
