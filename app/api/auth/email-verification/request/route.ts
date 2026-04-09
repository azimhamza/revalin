import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { sendTransactionalEmail } from '@/lib/email/loops';
import {
  AUTH_CODE_RESEND_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  createAuthCode,
  deleteAuthCode,
  hasRecentAuthCodeRequest,
} from '@/lib/auth-code-verification';

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/auth/email-verification/request',
  access: 'session',
  rateLimit: 'auth',
  cacheControl: 'no-store',
  handler: async ({ session }) => {
    const email = session.user.email?.trim();
    const name = session.user.name?.trim();
    if (!email) {
      throw apiError.badRequest('Missing user email.');
    }

    const identifier = buildAuthCodeIdentifier(EMAIL_VERIFICATION_CODE_PURPOSE, email);
    const transactionalId = process.env.LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION?.trim();

    if (!transactionalId) {
      throw apiError.providerUnavailable('Email verification is not configured.', {
        provider: 'loops',
      }, false);
    }

    if (await hasRecentAuthCodeRequest(identifier)) {
      throw apiError.rateLimited(
        `Please wait ${AUTH_CODE_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
      );
    }

    const code = await createAuthCode(identifier);

    try {
      await sendTransactionalEmail({
        email,
        transactionalId,
        dataVariables: {
          name: name || 'there',
          code,
        },
      });
    } catch (error) {
      await deleteAuthCode(identifier, code);
      console.error('Failed to send verification email:', error);
      throw apiError.providerUnavailable('Failed to send verification email.', {
        provider: 'loops',
      });
    }

    return {
      data: {
        sent: true,
      },
    };
  },
});
