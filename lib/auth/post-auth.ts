import {
  getAccountDestinationForRole,
  getAuthenticatedAppDestination,
} from '@/lib/account-destination';
import {
  getAffiliateByUserIdentity,
  syncApprovedAffiliateForUser,
} from '@/lib/checkout/affiliate-service';
import { linkCurrentResearchConsentToUser } from '@/lib/compliance/research-access-consent';
import { stampUserReferralFromCookie } from '@/lib/checkout/affiliate-user-referral';
import { linkOrdersToUser } from '@/lib/checkout/link-orders-to-user';
import { syncPromoterForUser } from '@/lib/checkout/promoter-service';

type PostAuthUser = {
  email: string;
  emailVerified: boolean;
  id: string;
  role?: string | null;
};

export async function reconcilePostAuthUser(user: PostAuthUser) {
  const [
    linkedOrders,
    affiliateSync,
    referralStamp,
    promoterSync,
    researchConsentLink,
  ] = await Promise.allSettled([
    linkOrdersToUser(user.id, user.email),
    syncApprovedAffiliateForUser({
      userId: user.id,
      email: user.email,
      currentRole: user.role,
    }),
    stampUserReferralFromCookie({
      userId: user.id,
      userEmail: user.email,
    }),
    syncPromoterForUser({
      userId: user.id,
      email: user.email,
    }),
    linkCurrentResearchConsentToUser({
      userId: user.id,
      email: user.email,
    }),
  ]);

  if (referralStamp.status === 'rejected') {
    console.error(
      'Failed to stamp affiliate referral on user row:',
      referralStamp.reason,
    );
  }

  if (researchConsentLink.status === 'rejected') {
    console.error(
      'Failed to link research consent on user row:',
      researchConsentLink.reason,
    );
  }

  if (affiliateSync.status === 'fulfilled') {
    return {
      canAccessAffiliateDashboard:
        affiliateSync.value.hasApprovedAffiliate ||
        affiliateSync.value.role === 'affiliate' ||
        affiliateSync.value.role === 'admin',
      linkedOrdersCount:
        linkedOrders.status === 'fulfilled'
          ? getLinkedOrdersCount(linkedOrders.value)
          : 0,
      affiliateCode: affiliateSync.value.affiliateCode ?? null,
      canAccessPromoterDashboard:
        promoterSync.status === 'fulfilled'
          ? promoterSync.value.hasApprovedPromoter
          : false,
      roleUpdated: affiliateSync.value.roleUpdated,
      role: affiliateSync.value.role,
    };
  }

  return {
    canAccessAffiliateDashboard:
      user.role === 'affiliate' || user.role === 'admin',
    linkedOrdersCount: 0,
    affiliateCode: null,
    canAccessPromoterDashboard:
      promoterSync.status === 'fulfilled'
        ? promoterSync.value.hasApprovedPromoter
        : false,
    roleUpdated: false,
    role: user.role ?? null,
  };
}

export async function getPostAuthAccess(user: PostAuthUser) {
  const affiliate = await getAffiliateByUserIdentity({
    userId: user.id,
    email: user.email,
  });
  const role = user.role ?? null;
  const canAccessAffiliateDashboard =
    role === 'affiliate' ||
    role === 'admin' ||
    affiliate?.status === 'approved';

  return {
    role,
    canAccessAffiliateDashboard,
    affiliateCode: affiliate?.status === 'approved' ? affiliate.code : null,
  };
}

export async function resolvePostAuthDestination(args: {
  callbackUrl?: string | null;
  user: PostAuthUser;
}) {
  const role = args.user.role ?? null;
  const alreadyHasDashboardAccess = role === 'affiliate' || role === 'admin';
  const access = alreadyHasDashboardAccess
    ? null
    : await getPostAuthAccess(args.user);
  const canAccessAffiliateDashboard =
    alreadyHasDashboardAccess || Boolean(access?.canAccessAffiliateDashboard);
  const fallback =
    role === 'admin'
      ? getAccountDestinationForRole('admin')
      : canAccessAffiliateDashboard
        ? '/affiliate/dashboard'
        : getAccountDestinationForRole(role);
  const destination = getAuthenticatedAppDestination({
    path: args.callbackUrl,
    fallback,
    role,
    canAccessAffiliateDashboard,
  });

  if (!args.user.emailVerified) {
    return `/verify-email?callbackUrl=${encodeURIComponent(destination)}`;
  }

  return destination;
}

function getLinkedOrdersCount(result: unknown) {
  if (
    typeof result === 'object' &&
    result !== null &&
    'rowCount' in result &&
    typeof (result as Record<string, unknown>).rowCount === 'number'
  ) {
    return (result as { rowCount: number }).rowCount;
  }

  return 0;
}
