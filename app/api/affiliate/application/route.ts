import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import {
  createAffiliate,
  getAffiliateByUserIdentity,
} from '@/lib/checkout/affiliate-service';
import { PROMOTER_REFERRAL_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';
import { recordPromoterApplicationFromReferralCode } from '@/lib/checkout/promoter-service';
import {
  MAX_AFFILIATE_SOCIAL_PROFILES,
  buildProfileUrl,
  SOCIAL_PLATFORMS,
} from '@/lib/checkout/affiliate-social-profiles';
import { sendAffiliateApplicationReceivedEmail } from '@/lib/email/affiliate-emails';

const validPlatformValues = SOCIAL_PLATFORMS.map((p) => p.value) as [string, ...string[]];

const socialProfileSchema = z
  .object({
    platform: z.enum(validPlatformValues),
    username: z.string().trim().min(1, 'Enter your username or profile URL.'),
  })
  .transform((profile) => ({
    platform: profile.platform,
    url: buildProfileUrl(profile.platform, profile.username),
  }))
  .pipe(
    z.object({
      platform: z.string(),
      url: z.string().url('Enter a valid username or profile URL.'),
    }),
  );

const affiliateApplicationSchema = z.object({
  socialProfiles: z
    .array(socialProfileSchema)
    .min(1, 'Add at least one social profile.')
    .max(
      MAX_AFFILIATE_SOCIAL_PROFILES,
      `Add up to ${MAX_AFFILIATE_SOCIAL_PROFILES} social profiles.`,
    ),
  promoterReferralCode: z.string().trim().optional(),
});

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;

  const rawValue = match.slice(name.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

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
  handler: async ({ request, session, body }) => {
    if (!session.user.email) {
      throw apiError.unauthenticated('Sign in to request Growth Partner access.');
    }

    const existingByIdentity = await getAffiliateByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });
    const promoterReferralCode =
      body.promoterReferralCode ||
      getCookieValue(request, PROMOTER_REFERRAL_COOKIE_NAME);

    async function recordPromoterApplication(affiliate: {
      id: string;
      socialProfiles: typeof body.socialProfiles;
    }) {
      if (!promoterReferralCode) return;

      try {
        await recordPromoterApplicationFromReferralCode({
          referralCode: promoterReferralCode,
          affiliateId: affiliate.id,
          applicantName: session.user.name,
          applicantEmail: session.user.email.toLowerCase(),
          socialProfiles: affiliate.socialProfiles,
        });
      } catch (error) {
        console.error('[PROMOTER-APPLICATION-REFERRAL]', error);
      }
    }

    if (existingByIdentity) {
      if (
        existingByIdentity.status !== 'approved' &&
        existingByIdentity.status !== 'rejected'
      ) {
        await recordPromoterApplication({
          id: existingByIdentity.id,
          socialProfiles: existingByIdentity.socialProfiles,
        });

        return {
          data: {
            application: {
              id: existingByIdentity.id,
              email: existingByIdentity.email,
              status: existingByIdentity.status,
            },
          },
        };
      }

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

    await recordPromoterApplication({
      id: affiliate.id,
      socialProfiles: body.socialProfiles,
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
