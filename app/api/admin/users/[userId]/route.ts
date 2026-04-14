import { z } from "zod";
import { eq, or, inArray } from "drizzle-orm";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import {
  affiliatePayouts,
  affiliates,
  promoterInvites,
  promoterPayouts,
  promoters,
  user,
} from "@/lib/db/schema";
import { deleteSwellCouponIfPresent } from "@/lib/checkout/affiliate-code-service";
import { findSwellCouponCodeByCode } from "@/lib/checkout/swell-order-management";
import { deleteLoopsContact, hasLoopsConfig } from "@/lib/email/loops";

const paramsSchema = z.object({
  userId: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";

type SwellCleanupResult = {
  attempted: number;
  succeeded: number;
  errors: Array<{ couponId: string; message: string }>;
};

type SwellCleanupTarget = {
  couponId: string | null;
  discountCode: string | null;
};

export const DELETE = createApiRoute({
  route: "/api/admin/users/:userId",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params, session }) => {
    // Destructive dev-only action — block in production.
    if (process.env.NODE_ENV === "production") {
      throw apiError.forbidden(
        "User deletion is only available in development.",
      );
    }

    if (params.userId === session.user.id) {
      throw apiError.badRequest("You cannot delete your own account.");
    }

    const [target] = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, params.userId))
      .limit(1);

    if (!target) {
      throw apiError.notFound("User not found.");
    }

    const normalizedEmail = target.email.toLowerCase();

    // Find all affiliate rows that match this user — by userId or by email.
    // Affiliates can be pre-seeded by email before the user row exists, and
    // after a user change the email link may be stale, so we check both.
    const matchingAffiliates = await db
      .select({
        id: affiliates.id,
        swellCouponId: affiliates.swellCouponId,
        discountCode: affiliates.discountCode,
      })
      .from(affiliates)
      .where(
        or(
          eq(affiliates.userId, target.id),
          eq(affiliates.email, normalizedEmail),
        ),
      );

    const affiliateIds = matchingAffiliates.map((row) => row.id);
    const swellCleanupTargets: SwellCleanupTarget[] = [];
    const seenSwellCleanupKeys = new Set<string>();
    for (const row of matchingAffiliates) {
      const couponId = row.swellCouponId?.trim() || null;
      const discountCode = row.discountCode?.trim() || null;

      if (!couponId && !discountCode) continue;

      const key = couponId
        ? `coupon:${couponId}`
        : `code:${discountCode!.toUpperCase()}`;
      if (seenSwellCleanupKeys.has(key)) continue;

      seenSwellCleanupKeys.add(key);
      swellCleanupTargets.push({ couponId, discountCode });
    }

    // Find all promoter rows that match this user — by userId or by email.
    // Promoters follow the same pre-seeded-by-email pattern as Growth Partners.
    const matchingPromoters = await db
      .select({ id: promoters.id })
      .from(promoters)
      .where(
        or(
          eq(promoters.userId, target.id),
          eq(promoters.email, normalizedEmail),
        ),
      );

    const promoterIds = matchingPromoters.map((row) => row.id);

    const dbCleanup = {
      removedAffiliatePayouts: 0,
      removedAffiliates: 0,
      removedPromoterInvites: 0,
      removedPromoterPayouts: 0,
      removedPromoters: 0,
    };

    // Atomic DB cascade: non-cascading payouts → partner records → user.
    // Wrapped in a transaction so a mid-flight failure can't leave orphaned rows.
    await db.transaction(async (tx) => {
      if (promoterIds.length > 0) {
        // promoter_payouts has no ON DELETE cascade on promoter_id, so clear
        // these first or promoter deletion will fail.
        const deletedPromoterPayouts = await tx
          .delete(promoterPayouts)
          .where(inArray(promoterPayouts.promoterId, promoterIds))
          .returning({ id: promoterPayouts.id });
        dbCleanup.removedPromoterPayouts += deletedPromoterPayouts.length;
      }

      if (affiliateIds.length > 0) {
        // promoter_payouts also has no ON DELETE cascade on affiliate_id.
        const deletedPromoterAffiliatePayouts = await tx
          .delete(promoterPayouts)
          .where(inArray(promoterPayouts.affiliateId, affiliateIds))
          .returning({ id: promoterPayouts.id });
        dbCleanup.removedPromoterPayouts +=
          deletedPromoterAffiliatePayouts.length;

        const deletedPromoterInvites = await tx
          .delete(promoterInvites)
          .where(inArray(promoterInvites.invitedAffiliateId, affiliateIds))
          .returning({ id: promoterInvites.id });
        dbCleanup.removedPromoterInvites = deletedPromoterInvites.length;

        // affiliate_payouts has no ON DELETE cascade on affiliate_id, so we
        // have to clear those rows manually before removing the affiliate.
        const deletedAffiliatePayouts = await tx
          .delete(affiliatePayouts)
          .where(inArray(affiliatePayouts.affiliateId, affiliateIds))
          .returning({ id: affiliatePayouts.id });
        dbCleanup.removedAffiliatePayouts = deletedAffiliatePayouts.length;
      }

      if (promoterIds.length > 0) {
        // promoter_invites and promoter_weekly_payouts cascade from promoters.
        const deletedPromoters = await tx
          .delete(promoters)
          .where(inArray(promoters.id, promoterIds))
          .returning({ id: promoters.id });
        dbCleanup.removedPromoters = deletedPromoters.length;
      }

      if (affiliateIds.length > 0) {
        // The remaining affiliate_* children (visits, weekly_payouts,
        // discount changes, commission months, commission events) use ON DELETE cascade
        // and clean up automatically.
        const deletedAffiliates = await tx
          .delete(affiliates)
          .where(inArray(affiliates.id, affiliateIds))
          .returning({ id: affiliates.id });
        dbCleanup.removedAffiliates = deletedAffiliates.length;
      }

      // better-auth session + account rows cascade from user.
      const deleted = await tx
        .delete(user)
        .where(eq(user.id, target.id))
        .returning({ id: user.id });

      if (deleted.length === 0) {
        throw apiError.internal("Failed to delete user.");
      }
    });

    // Best-effort Swell coupon cleanup — mirrors the Loops pattern. We don't
    // want a Swell outage (or missing dev credentials) to block deleting a
    // user locally, so failures are collected and surfaced in the response.
    const swell: SwellCleanupResult = {
      attempted: swellCleanupTargets.length,
      succeeded: 0,
      errors: [],
    };

    for (const target of swellCleanupTargets) {
      const errorLabel = target.couponId || target.discountCode || "unknown";

      try {
        const couponIdsToDelete = new Set<string>();
        if (target.couponId) {
          couponIdsToDelete.add(target.couponId);
        }

        if (target.discountCode) {
          const couponCode = await findSwellCouponCodeByCode(
            target.discountCode,
          );
          if (couponCode?.parent_id) {
            couponIdsToDelete.add(couponCode.parent_id);
          }
        }

        for (const couponId of couponIdsToDelete) {
          await deleteSwellCouponIfPresent(couponId);
        }
        swell.succeeded += 1;
      } catch (error) {
        console.error("Failed to delete Swell coupon:", errorLabel, error);
        swell.errors.push({
          couponId: errorLabel,
          message:
            error instanceof Error ? error.message : "Unknown Swell error.",
        });
      }
    }

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
          notFound: "notFound" in response ? response.notFound : undefined,
        };
      } catch (error) {
        console.error("Failed to delete user from Loops:", error);
        loops = {
          success: false,
          skipped: false,
          error:
            error instanceof Error ? error.message : "Unknown Loops error.",
        };
      }
    }

    return {
      data: {
        deleted: true,
        userId: target.id,
        email: target.email,
        name: target.name,
        removedAffiliates: dbCleanup.removedAffiliates,
        removedAffiliatePayouts: dbCleanup.removedAffiliatePayouts,
        removedPromoterInvites: dbCleanup.removedPromoterInvites,
        removedPromoterPayouts: dbCleanup.removedPromoterPayouts,
        removedPromoters: dbCleanup.removedPromoters,
        swell,
        loops,
      },
    };
  },
});
