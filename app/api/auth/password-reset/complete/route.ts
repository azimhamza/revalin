import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { auth } from '@/lib/auth';

const completeSchema = z.object({
  token: z.string().trim().min(1, 'Reset session expired. Request a new code.'),
  newPassword: z.string().min(1, 'Enter a new password.'),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/auth/password-reset/complete',
  rateLimit: 'auth',
  bodySchema: completeSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    try {
      await auth.api.resetPassword({
        body: {
          token: body.token,
          newPassword: body.newPassword,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'statusCode' in error &&
        typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ) {
        throw error;
      }

      throw apiError.badRequest(
        error instanceof Error ? error.message : 'Unable to reset password.',
      );
    }

    return {
      data: {
        completed: true,
      },
    };
  },
});
