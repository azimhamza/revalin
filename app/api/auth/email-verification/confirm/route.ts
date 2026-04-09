import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import {
  EMAIL_VERIFICATION_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  deleteAuthCode,
  findValidAuthCode,
} from '@/lib/auth-code-verification';

const confirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code we sent you.'),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/auth/email-verification/confirm',
  access: 'session',
  rateLimit: 'auth',
  bodySchema: confirmSchema,
  cacheControl: 'no-store',
  handler: async ({ session, body }) => {
    const identifier = buildAuthCodeIdentifier(
      EMAIL_VERIFICATION_CODE_PURPOSE,
      session.user.email,
    );
    const match = await findValidAuthCode(identifier, body.code);

    if (!match) {
      throw apiError.badRequest('Invalid or expired code.');
    }

    await db
      .update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    await deleteAuthCode(identifier);

    return {
      data: {
        verified: true,
      },
    };
  },
});
