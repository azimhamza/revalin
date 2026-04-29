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
import {
  hasOpenPanelTrackingConfig,
  trackOpenPanelServerEvent,
} from '@/lib/analytics/openpanel';

const visitSchema = z.object({
  code: z.string().trim().min(3),
  discountCode: z.string().trim().min(1).nullable().optional(),
  referralPath: z.string().trim().max(512).nullable().optional(),
  referrer: z.string().trim().max(2048).nullable().optional(),
  trafficSource: z.string().trim().max(128).nullable().optional(),
  utmCampaign: z.string().trim().max(512).nullable().optional(),
  utmMedium: z.string().trim().max(128).nullable().optional(),
  utmSource: z.string().trim().max(128).nullable().optional(),
});

function getTrafficSourceFromUserAgent(userAgent: string | null) {
  const normalized = userAgent?.toLowerCase() ?? "";
  if (
    normalized.includes("tiktok") ||
    normalized.includes("musical_ly") ||
    normalized.includes("bytedancewebview") ||
    normalized.includes("aweme")
  ) {
    return "tiktok";
  }

  if (normalized.includes("instagram")) {
    return "instagram";
  }

  if (normalized.includes("fbav") || normalized.includes("fban")) {
    return "facebook";
  }

  return null;
}

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
    const userAgent = request.headers.get('user-agent');
    const detectedTrafficSource =
      body.trafficSource ??
      body.utmSource ??
      getTrafficSourceFromUserAgent(userAgent);

    try {
      await createAffiliateVisit({
        affiliateId: affiliate.id,
        affiliateCode: affiliate.code,
        visitorId,
        referralPath: body.referralPath,
        referrer: body.referrer,
        userAgent,
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

    // Fire-and-forget: track server-side so the event is recorded even when
    // the client-side OpenPanel SDK hasn't initialised yet (first page load).
    if (hasOpenPanelTrackingConfig()) {
      trackOpenPanelServerEvent('affiliate_visit', {
        affiliate_code: affiliate.code,
        discount_code: body.discountCode ?? null,
        referral_path: body.referralPath ?? null,
        referrer: body.referrer ?? null,
        source: detectedTrafficSource,
        utm_campaign: body.utmCampaign ?? null,
        utm_medium: body.utmMedium ?? null,
        utm_source: body.utmSource ?? null,
        device: /mobile|android|iphone|ipad/i.test(
          userAgent ?? '',
        )
          ? 'Mobile'
          : 'Desktop',
      }).catch((err) => {
        console.warn(
          '[affiliate-visits] OpenPanel tracking failed',
          err instanceof Error ? err.message : err,
        );
      });
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
