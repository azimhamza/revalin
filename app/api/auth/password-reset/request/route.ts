import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { sendTransactionalEmail } from '@/lib/email/loops';
import {
  AUTH_CODE_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  createAuthCode,
  deleteAuthCode,
  hasRecentAuthCodeRequest,
  normalizeAuthEmail,
} from '@/lib/auth-code-verification';

const GENERIC_MESSAGE = 'If an account exists for that email, we sent a 6-digit code.';

const requestSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').transform(normalizeAuthEmail),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/auth/password-reset/request',
  rateLimit: 'auth',
  bodySchema: requestSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    const transactionalId =
      process.env.LOOPS_TRANSACTIONAL_PASSWORD_RESET?.trim() ||
      process.env.LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION?.trim();

    if (!transactionalId) {
      throw apiError.providerUnavailable(
        'Password reset email is not configured.',
        { provider: 'loops' },
        false,
      );
    }

    const identifier = buildAuthCodeIdentifier(PASSWORD_RESET_CODE_PURPOSE, body.email);

    if (await hasRecentAuthCodeRequest(identifier)) {
      throw apiError.rateLimited(
        `Please wait ${AUTH_CODE_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
      );
    }

    const matchedUsers = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(sql`lower(${user.email}) = ${body.email}`)
      .limit(1);

    const matchedUser = matchedUsers[0];

    if (!matchedUser) {
      return {
        data: {
          sent: true,
          message: GENERIC_MESSAGE,
        },
      };
    }

    const code = await createAuthCode(identifier);

    try {
      await sendTransactionalEmail({
        email: matchedUser.email,
        transactionalId,
        dataVariables: {
          name: matchedUser.name?.trim() || 'there',
          code,
        },
      });
    } catch (error) {
      await deleteAuthCode(identifier, code);
      console.error('Failed to send password reset code:', error);
      throw apiError.providerUnavailable('Failed to send password reset code.', {
        provider: 'loops',
      });
    }

    return {
      data: {
        sent: true,
        message: GENERIC_MESSAGE,
      },
    };
  },
});
