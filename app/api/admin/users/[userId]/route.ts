import { z } from 'zod';
import { eq, or, inArray } from 'drizzle-orm';

import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { affiliatePayouts, affiliates, user } from '@/lib/db/schema';
import { deleteSwellCouponIfPresent } from '@/lib/checkout/affiliate-code-service';
import { deleteLoopsContact, hasLoopsConfig } from '@/lib/email/loops';

const paramsSchema = z.object({
  userId: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

type SwellCleanupResult = {
  attempted: number;
  succeeded: number;
  errors: Array<{ couponId: string; message: string }>;
};

export const DELETE = createApiRoute({
  route: '/api/admin/users/:userId',
  access: 'admin',
  paramsSchema,
  cacheControl: 'no-store',
  handler: async ({ params, session }) => {
    // Destructive dev-only action — block in production.
    if (process.env.NODE_ENV === 'production') {
      throw apiError.forbidden('User deletion is only available in development.');
    }

    if (params.userId === session.user.id) {
      throw apiError.badRequest('You cannot delete your own account.');
    }

    const [target] = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, params.userId))
      .limit(1);

    if (!target) {
      throw apiError.notFound('User not found.');
    }

    const normalizedEmail = target.email.toLowerCase();

    // Find all affiliate rows that match this user — by userId or by email.
    // Affiliates can be pre-seeded by email before the user row exists, and
    // after a user change the email link may be stale, so we check both.
    const matchingAffiliates = await db
      .select({ id: affiliates.id, swellCouponId: affiliates.swellCouponId })
      .from(affiliates)
      .where(
        or(
          eq(affiliates.userId, target.id),
          eq(affiliates.email, normalizedEmail),
        ),
      );

    const affiliateIds = matchingAffiliates.map((row) => row.id);
    const swellCouponIds = matchingAffiliates
      .map((row) => row.swellCouponId)
      .filter((id): id is string => Boolean(id));

    // Best-effort Swell coupon cleanup — mirrors the Loops pattern. We don't
    // want a Swell outage (or missing dev credentials) to block deleting a
    // user locally, so failures are collected and surfaced in the response.
    const swell: SwellCleanupResult = {
      attempted: swellCouponIds.length,
      succeeded: 0,
      errors: [],
    };

    for (const couponId of swellCouponIds) {
      try {
        await deleteSwellCouponIfPresent(couponId);
        swell.succeeded += 1;
      } catch (error) {
        console.error('Failed to delete Swell coupon:', couponId, error);
        swell.errors.push({
          couponId,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown Swell error.',
        });
      }
    }

    // Atomic DB cascade: payouts → affiliates → user. Wrapped in a
    // transaction so a mid-flight failure can't leave orphaned rows.
    await db.transaction(async (tx) => {
      if (affiliateIds.length > 0) {
        // affiliate_payouts has no ON DELETE cascade on affiliate_id, so we
        // have to clear those rows manually before removing the affiliate.
        await tx
          .delete(affiliatePayouts)
          .where(inArray(affiliatePayouts.affiliateId, affiliateIds));

        // The remaining affiliate_* children (visits, weekly_payouts,
        // discount_codes, rate_periods, rate_events) use ON DELETE cascade
        // and clean up automatically.
        await tx
          .delete(affiliates)
          .where(inArray(affiliates.id, affiliateIds));
      }

      // better-auth session + account rows cascade from user.
      const deleted = await tx
        .delete(user)
        .where(eq(user.id, target.id))
        .returning({ id: user.id });

      if (deleted.length === 0) {
        throw apiError.internal('Failed to delete user.');
      }
    });

    // Best-effort Loops cleanup — outside the transaction so a provider
    // outage never blocks a successful local deletion.
    let loops: {
      success: boolean;
      skipped: boolean;
      notFound?: boolean;
      error?: string;
    } = {
      success: true,
      skipped: true,
    };

    if (hasLoopsConfig() && target.email) {
      try {
        const response = await deleteLoopsContact({ email: target.email });
        loops = {
          success: Boolean(response.success),
          skipped: response.skipped,
          notFound: 'notFound' in response ? response.notFound : undefined,
        };
      } catch (error) {
        console.error('Failed to delete user from Loops:', error);
        loops = {
          success: false,
          skipped: false,
          error: error instanceof Error ? error.message : 'Unknown Loops error.',
        };
      }
    }

    return {
      data: {
        deleted: true,
        userId: target.id,
        email: target.email,
        name: target.name,
        removedAffiliates: affiliateIds.length,
        swell,
        loops,
      },
    };
  },
});
