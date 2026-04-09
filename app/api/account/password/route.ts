import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { account } from '@/lib/db/schema';

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1, 'Enter a new password.'),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/account/password',
  access: 'session',
  bodySchema: passwordSchema,
  cacheControl: 'no-store',
  handler: async ({ request, session, body }) => {
    const credentialAccounts = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, session.user.id), eq(account.providerId, 'credential')),
      )
      .limit(1);

    const hasPassword = credentialAccounts.length > 0;

    if (hasPassword && !body.currentPassword) {
      throw apiError.badRequest('Enter your current password.');
    }

    try {
      if (hasPassword) {
        await auth.api.changePassword({
          headers: request.headers,
          body: {
            currentPassword: body.currentPassword!,
            newPassword: body.newPassword,
          },
        });
      } else {
        await auth.api.setPassword({
          headers: request.headers,
          body: {
            newPassword: body.newPassword,
          },
        });
      }
    } catch (error) {
      const status = getAuthErrorStatus(error, 400);
      const message = getAuthErrorMessage(error, 'Unable to update password.');

      if (status === 401) {
        throw apiError.unauthenticated(message);
      }
      if (status === 403) {
        throw apiError.forbidden(message);
      }
      throw apiError.badRequest(message);
    }

    return {
      data: {
        hasPassword: true,
        updated: true,
      },
    };
  },
});

function getAuthErrorStatus(error: unknown, fallback: number) {
  if (typeof error === 'object' && error && 'statusCode' in error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number') {
      return status;
    }
  }

  return fallback;
}

function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}
