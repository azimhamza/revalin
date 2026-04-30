import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { approveInteracReview, updateInteracReviewStatus } from '@/lib/checkout/interac';

const paramsSchema = z.object({
  reviewId: z.string().trim().min(1),
});

const bodySchema = z.object({
  action: z.enum(['approve', 'ignore', 'refund', 'reopen']),
  notes: z.string().trim().max(2000).optional(),
});

export const dynamic = 'force-dynamic';

type ReviewActionResponse =
  | { order: Awaited<ReturnType<typeof approveInteracReview>> }
  | Awaited<ReturnType<typeof updateInteracReviewStatus>>;

export const POST = createApiRoute<
  'admin',
  typeof bodySchema,
  undefined,
  typeof paramsSchema,
  ReviewActionResponse
>({
  route: '/api/admin/interac/reviews/:reviewId',
  access: 'admin',
  paramsSchema,
  bodySchema,
  cacheControl: 'no-store',
  handler: async ({ params, body, session }) => {
    if (body.action === 'approve') {
      return {
        data: {
          order: await approveInteracReview({
            reviewId: params.reviewId,
            adminUserId: session.user.id,
            notes: body.notes,
          }),
        },
      };
    }

    const status =
      body.action === 'refund'
        ? 'refunded'
        : body.action === 'reopen'
          ? 'open'
          : 'ignored';

    return {
      data: await updateInteracReviewStatus({
        reviewId: params.reviewId,
        status,
        adminUserId: session.user.id,
        notes: body.notes,
      }),
    };
  },
});
