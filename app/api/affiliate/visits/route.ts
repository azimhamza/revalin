import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getApprovedAffiliateByCode } from '@/lib/checkout/affiliate-service';
import {
  AFFILIATE_VISITOR_COOKIE_MAX_AGE_DAYS,
  AFFILIATE_VISITOR_COOKIE_NAME,
} from '@/lib/checkout/affiliate-constants';
import { createAffiliateVisit } from '@/lib/checkout/affiliate-visit-service';

const visitSchema = z.object({
  code: z.string().trim().min(3),
  discountCode: z.string().trim().min(1).nullable().optional(),
  referralPath: z.string().trim().max(512).nullable().optional(),
  referrer: z.string().trim().max(2048).nullable().optional(),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/affiliate/visits',
  bodySchema: visitSchema,
  rateLimit: 'public_write',
  cacheControl: 'no-store',
  handler: async ({ request, body }) => {
    const affiliate = await getApprovedAffiliateByCode(body.code);
    if (!affiliate) {
      throw apiError.notFound('Affiliate not found.');
    }

    const cookieStore = await cookies();
    const existingVisitorId = cookieStore
      .get(AFFILIATE_VISITOR_COOKIE_NAME)
      ?.value?.trim();
    const visitorId = existingVisitorId || randomUUID();

    try {
      await createAffiliateVisit({
        affiliateId: affiliate.id,
        affiliateCode: affiliate.code,
        visitorId,
        referralPath: body.referralPath,
        referrer: body.referrer,
        userAgent: request.headers.get('user-agent'),
      });
    } catch (error) {
      console.error('[affiliate-visits] write failed', {
        affiliateId: affiliate.id,
        message: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && 'cause' in error
            ? (error as Error & { cause?: unknown }).cause
            : undefined,
      });

      return {
        data: {
          recorded: false,
        },
        headers: !existingVisitorId
          ? {
              'set-cookie': `${AFFILIATE_VISITOR_COOKIE_NAME}=${visitorId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
                AFFILIATE_VISITOR_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
              }${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
            }
          : undefined,
      };
    }

    return {
      data: {
        recorded: true,
      },
      headers: !existingVisitorId
        ? {
            'set-cookie': `${AFFILIATE_VISITOR_COOKIE_NAME}=${visitorId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
              AFFILIATE_VISITOR_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
            }${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
          }
        : undefined,
    };
  },
});
