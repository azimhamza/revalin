import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import {
  createAffiliate,
  getAffiliateByUserIdentity,
} from '@/lib/checkout/affiliate-service';
import {
  MAX_AFFILIATE_SOCIAL_PROFILES,
  normalizeAffiliateSocialUrl,
} from '@/lib/checkout/affiliate-social-profiles';
import { sendAffiliateApplicationReceivedEmail } from '@/lib/email/affiliate-emails';

const socialProfileSchema = z.object({
  platform: z.string().trim().min(2, 'Enter the social platform name.'),
  url: z
    .string()
    .trim()
    .transform((value) => normalizeAffiliateSocialUrl(value))
    .pipe(z.string().url('Enter a valid social profile URL.')),
});

const affiliateApplicationSchema = z.object({
  socialProfiles: z
    .array(socialProfileSchema)
    .min(1, 'Add at least one social profile.')
    .max(
      MAX_AFFILIATE_SOCIAL_PROFILES,
      `Add up to ${MAX_AFFILIATE_SOCIAL_PROFILES} social profiles.`,
    ),
});

export const dynamic = 'force-dynamic';

export const GET = createApiRoute({
  route: '/api/affiliate/application',
  access: 'session',
  cacheControl: 'no-store',
  handler: async ({ session }) => {
    const affiliate = await getAffiliateByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    return {
      data: {
        application: affiliate
          ? {
              id: affiliate.id,
              code: affiliate.code,
              status: affiliate.status,
              email: affiliate.email,
              socialProfiles: affiliate.socialProfiles,
            }
          : null,
      },
    };
  },
});

export const POST = createApiRoute({
  route: '/api/affiliate/application',
  access: 'session',
  bodySchema: affiliateApplicationSchema,
  cacheControl: 'no-store',
  handler: async ({ session, body }) => {
    if (!session.user.email) {
      throw apiError.unauthenticated('Sign in to request Growth Partner access.');
    }

    const existingByIdentity = await getAffiliateByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (existingByIdentity) {
      const statusLabel =
        existingByIdentity.status.charAt(0).toUpperCase() +
        existingByIdentity.status.slice(1);

      throw apiError.conflict(
        existingByIdentity.status === 'rejected'
          ? 'An affiliate application already exists for that email. Contact support to re-open it.'
          : `${statusLabel} affiliate access already exists for that email.`,
      );
    }

    const affiliate = await createAffiliate({
      name: session.user.name?.trim() || 'Growth Partner Applicant',
      email: session.user.email.toLowerCase(),
      walletAddress: '',
      socialProfiles: body.socialProfiles,
      userId: session.user.id,
    });

    try {
      await sendAffiliateApplicationReceivedEmail({
        applicantName: session.user.name,
        applicantEmail: session.user.email.toLowerCase(),
      });
    } catch (error) {
      console.error('[AFFILIATE-APPLICATION-EMAIL]', error);
    }

    return {
      data: {
        application: {
          id: affiliate.id,
          email: affiliate.email,
          status: affiliate.status,
        },
      },
      status: 201,
    };
  },
});
