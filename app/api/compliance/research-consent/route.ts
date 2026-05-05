import { z } from 'zod';
import { after } from 'next/server';
import { createApiRoute } from '@/lib/api/route';
import {
  buildResearchConsentCookie,
  createResearchConsentId,
  createResearchConsentToken,
  getClientIp,
  hasResearchConsentForCurrentRequest,
  recordResearchAccessConsent,
} from '@/lib/compliance/research-access-consent';
import { RESEARCH_USE_TERMS_VERSION } from '@/lib/compliance';

const consentSchema = z.object({
  institutionName: z.string().trim().max(256).optional().nullable(),
  institutionIdentifier: z.string().trim().max(128).optional().nullable(),
  researchUseDescription: z.string().trim().max(2_000).optional().nullable(),
  entryPath: z.string().trim().max(512).optional().nullable(),
  referrer: z.string().trim().max(2_000).optional().nullable(),
});

export const dynamic = 'force-dynamic';

export const GET = createApiRoute({
  route: '/api/compliance/research-consent',
  cacheControl: 'no-store',
  handler: async () => {
    const hasConsent = await hasResearchConsentForCurrentRequest();

    return {
      data: {
        hasConsent,
      },
    };
  },
});

export const POST = createApiRoute({
  route: '/api/compliance/research-consent',
  rateLimit: 'public_write',
  bodySchema: consentSchema,
  cacheControl: 'no-store',
  handler: async ({ request, body }) => {
    const acceptedAt = new Date();
    const consentId = createResearchConsentId();
    const consentToken = createResearchConsentToken();

    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent')?.trim() ?? null;

    after(async () => {
      try {
        await recordResearchAccessConsent({
          consentId,
          consentToken,
          acceptedAt,
          institutionName: body.institutionName,
          institutionIdentifier: body.institutionIdentifier,
          researchUseDescription: body.researchUseDescription,
          entryPath: body.entryPath,
          referrer: body.referrer,
          ipAddress,
          userAgent,
        });
      } catch (error) {
        console.error('Failed to record research access consent:', error);
      }
    });

    return new Response(null, {
      status: 202,
      headers: {
        'set-cookie': buildResearchConsentCookie(consentToken),
        'x-revalin-consent-id': consentId,
        'x-revalin-consent-accepted-at': acceptedAt.toISOString(),
        'x-revalin-consent-terms-version': RESEARCH_USE_TERMS_VERSION,
      },
    });
  },
});
