import { createApiRoute } from '@/lib/api/route';
import { getSessionRole } from '@/lib/api/auth';
import { reconcilePostAuthUser } from '@/lib/auth/post-auth';

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/auth/reconcile',
  access: 'session',
  cacheControl: 'no-store',
  handler: async ({ session }) => {
    const reconciliation = await reconcilePostAuthUser({
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      role: getSessionRole(session),
    });

    return {
      data: {
        role: reconciliation.role ?? null,
        canAccessAffiliateDashboard: reconciliation.canAccessAffiliateDashboard,
        linkedOrdersCount: reconciliation.linkedOrdersCount,
        affiliateCode: reconciliation.affiliateCode,
        roleUpdated: reconciliation.roleUpdated,
      },
    };
  },
});
