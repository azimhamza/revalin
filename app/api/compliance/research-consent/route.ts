import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import {
  buildResearchConsentCookie,
  createResearchConsentToken,
  hasResearchConsentForCurrentRequest,
  recordResearchAccessConsent,
} from '@/lib/compliance/research-access-consent';

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
    const consentToken = createResearchConsentToken();
    const consent = await recordResearchAccessConsent({
      consentToken,
      institutionName: body.institutionName,
      institutionIdentifier: body.institutionIdentifier,
      researchUseDescription: body.researchUseDescription,
      entryPath: body.entryPath,
      referrer: body.referrer,
      request,
    });

    return {
      data: {
        consentId: consent.id,
        acceptedAt: consent.acceptedAt.toISOString(),
        termsVersion: consent.termsVersion,
      },
      status: 201,
      headers: {
        'set-cookie': buildResearchConsentCookie(consentToken),
      },
    };
  },
});
