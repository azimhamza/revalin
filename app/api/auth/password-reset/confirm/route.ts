import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import {
  PASSWORD_RESET_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  createPasswordResetToken,
  deleteAuthCode,
  findValidAuthCode,
  normalizeAuthEmail,
} from '@/lib/auth-code-verification';

const confirmSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').transform(normalizeAuthEmail),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code we sent you.'),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/auth/password-reset/confirm',
  rateLimit: 'auth',
  bodySchema: confirmSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    const identifier = buildAuthCodeIdentifier(PASSWORD_RESET_CODE_PURPOSE, body.email);
    const match = await findValidAuthCode(identifier, body.code);

    if (!match) {
      throw apiError.badRequest('Invalid or expired code.');
    }

    const matchedUsers = await db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${body.email}`)
      .limit(1);

    const matchedUser = matchedUsers[0];

    if (!matchedUser) {
      await deleteAuthCode(identifier);
      throw apiError.badRequest('Invalid or expired code.');
    }

    const resetToken = await createPasswordResetToken(matchedUser.id);
    await deleteAuthCode(identifier);

    return {
      data: {
        confirmed: true,
        resetToken,
      },
    };
  },
});
