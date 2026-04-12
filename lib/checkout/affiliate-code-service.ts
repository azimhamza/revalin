import crypto from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  affiliateDiscountChanges,
  affiliatePayouts,
  affiliates,
  user,
} from "@/lib/db/schema";
import {
  sendAffiliateApprovalEmail,
  sendAffiliateRemovalEmail,
  sendAffiliateReinstatementEmail,
} from "@/lib/email/affiliate-emails";
import {
  deleteSwellCoupon,
  createSwellAffiliateCoupon,
  createSwellCouponCode,
  findSwellCouponCodeByCode,
  listSwellCouponCodes,
  setSwellCouponActive,
  updateSwellAffiliateCoupon,
  updateSwellCouponCode,
} from "@/lib/checkout/swell-order-management";
import { normalizeSwellCouponCode } from "@/lib/checkout/swell-coupon-payloads";
import { shouldPromoteToAffiliateRole } from "@/lib/checkout/affiliate-role";
import {
  assertAffiliateCodeAvailable,
  createAffiliate,
  getAffiliateByUserIdentity,
} from "@/lib/checkout/affiliate-service";
import {
  getCommissionMonthKey,
  normalizeCommissionRateInput,
  syncAffiliateCommissionMonth,
  updateAffiliateBaselineCommission,
} from "@/lib/checkout/commission-service";

type AffiliateRow = typeof affiliates.$inferSelect;

export type AffiliateCodeAssignment = {
  affiliateId: string;
  affiliateCode: string;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: AffiliateRow["status"];
  swellCouponId: string | null;
  referralLink: string;
  checkoutLink: string | null;
  emailSent: boolean;
};

export const DEFAULT_AFFILIATE_DISCOUNT_PERCENT = "10";
export const DEFAULT_AFFILIATE_COMMISSION_RATE = "0.10";

export type AffiliateAvailabilityCheck = {
  affiliateCode: {
    value: string;
    available: boolean;
    message: string;
  };
  discountCode: {
    value: string;
    available: boolean;
    message: string;
  };
};

export type AffiliateDiscountBulkResult = {
  affiliateId: string;
  affiliateCode: string;
  discountCode: string | null;
  oldDiscountPercent: string | null;
  newDiscountPercent: string;
  eligible: boolean;
  updated: boolean;
  error: string | null;
};

export type AffiliateDiscountBulkSummary = {
  mode: "selected" | "filtered";
  totalTargeted: number;
  eligibleCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  dryRun: boolean;
  results: AffiliateDiscountBulkResult[];
};

function getSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (!explicit) return "https://revalin.ca";
  return explicit.replace(/\/$/, "");
}

function buildLinks(affiliateCode: string, discountCode: string | null) {
  const siteUrl = getSiteUrl();

  return {
    referralLink: `${siteUrl}/${affiliateCode}`,
    checkoutLink: discountCode
      ? `${siteUrl}/checkout?discount=${encodeURIComponent(discountCode)}`
      : null,
  };
}

function normalizeDiscountCode(value: string) {
  const normalized = normalizeSwellCouponCode(value);
  if (!normalized) {
    throw new Error("A Swell discount code is required.");
  }

  return normalized;
}

function normalizeDiscountPercent(value: string) {
  const parsed = Number(value.trim());

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error("Discount percent must be a number between 0 and 100.");
  }

  const rounded = Number(parsed.toFixed(2));
  return {
    numeric: rounded,
    stored: `${rounded}`,
  };
}

async function assertDiscountCodeAvailable(args: {
  affiliateId?: string | null;
  discountCode: string;
  existingSwellCouponId?: string | null;
}) {
  const normalizedDiscountCode = normalizeDiscountCode(args.discountCode);
  const existingLocalDiscountCode = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(
      args.affiliateId
        ? and(
            eq(affiliates.discountCode, normalizedDiscountCode),
            ne(affiliates.id, args.affiliateId),
          )
        : eq(affiliates.discountCode, normalizedDiscountCode),
    )
    .limit(1);

  if (existingLocalDiscountCode.length > 0) {
    throw new Error(
      "That Swell discount code is already assigned to another affiliate.",
    );
  }

  const existingSwellCode = await findSwellCouponCodeByCode(
    normalizedDiscountCode,
  );

  if (
    existingSwellCode?.parent_id &&
    existingSwellCode.parent_id !== args.existingSwellCouponId
  ) {
    throw new Error("That Swell discount code is already in use.");
  }

  return normalizedDiscountCode;
}

function buildCouponName(row: Pick<AffiliateRow, "name" | "code">) {
  return `Growth Partner - ${row.name || row.code}`;
}

function buildCouponDescription(row: Pick<AffiliateRow, "email" | "code">) {
  return `Affiliate discount for ${row.email} (${row.code})`;
}

function isMissingSwellCouponError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return /(\[404\]|\[410\]|not found)/i.test(error.message);
}

export async function deleteSwellCouponIfPresent(couponId: string | null) {
  if (!couponId) return;

  try {
    await deleteSwellCoupon(couponId);
  } catch (error) {
    if (isMissingSwellCouponError(error)) {
      return;
    }

    throw error;
  }
}

async function getAffiliateRow(affiliateId: string) {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error("Affiliate not found.");
  }

  return row;
}

async function recordDiscountChange(args: {
  affiliateId: string;
  affiliateCode: string;
  swellCouponId: string | null;
  discountCode: string | null;
  oldDiscountPercent: string | null;
  newDiscountPercent: string | null;
  reason?: string | null;
  changedByUserId?: string | null;
  changeScope?: string;
  batchId?: string | null;
}) {
  const noActualChange = args.oldDiscountPercent === args.newDiscountPercent;

  if (noActualChange) {
    return;
  }

  await db.insert(affiliateDiscountChanges).values({
    affiliateId: args.affiliateId,
    affiliateCode: args.affiliateCode,
    swellCouponId: args.swellCouponId,
    discountCode: args.discountCode,
    oldDiscountPercent: args.oldDiscountPercent,
    newDiscountPercent: args.newDiscountPercent,
    reason: args.reason ?? null,
    changedByUserId: args.changedByUserId ?? null,
    changeScope: args.changeScope ?? "single",
    batchId: args.batchId ?? null,
  });
}

export async function listAffiliateDiscountChangesForAffiliate(
  affiliateId: string,
  limit = 10,
) {
  return db
    .select()
    .from(affiliateDiscountChanges)
    .where(eq(affiliateDiscountChanges.affiliateId, affiliateId))
    .orderBy(desc(affiliateDiscountChanges.createdAt))
    .limit(limit);
}

export async function checkAffiliateAssignmentAvailability(args: {
  affiliateId: string;
  affiliateCode: string;
  discountCode: string;
}): Promise<AffiliateAvailabilityCheck> {
  const row = await getAffiliateRow(args.affiliateId);
  const affiliateCode = args.affiliateCode.trim();
  const discountCode = args.discountCode.trim();

  let affiliateCodeMessage = "Partner code is available.";
  let affiliateCodeAvailable = true;
  let normalizedAffiliateCode = "";

  try {
    normalizedAffiliateCode = await assertAffiliateCodeAvailable({
      code: affiliateCode,
      excludeAffiliateId: args.affiliateId,
    });
  } catch (error) {
    affiliateCodeAvailable = false;
    affiliateCodeMessage =
      error instanceof Error ? error.message : "Partner code is not available.";
    normalizedAffiliateCode = affiliateCode;
  }

  let discountCodeMessage = "Swell discount code is available.";
  let discountCodeAvailable = true;
  let normalizedDiscountCode = discountCode;

  try {
    normalizedDiscountCode = await assertDiscountCodeAvailable({
      affiliateId: args.affiliateId,
      discountCode,
      existingSwellCouponId: row.swellCouponId,
    });
  } catch (error) {
    discountCodeAvailable = false;
    discountCodeMessage =
      error instanceof Error
        ? error.message
        : "Swell discount code is not available.";
  }

  return {
    affiliateCode: {
      value: normalizedAffiliateCode,
      available: affiliateCodeAvailable,
      message: affiliateCodeMessage,
    },
    discountCode: {
      value: normalizedDiscountCode,
      available: discountCodeAvailable,
      message: discountCodeMessage,
    },
  };
}

export async function checkNewAffiliateAssignmentAvailability(args: {
  affiliateCode: string;
  discountCode: string;
}): Promise<AffiliateAvailabilityCheck> {
  const affiliateCode = args.affiliateCode.trim();
  const discountCode = args.discountCode.trim();

  let affiliateCodeMessage = "Partner code is available.";
  let affiliateCodeAvailable = true;
  let normalizedAffiliateCode = "";

  try {
    normalizedAffiliateCode = await assertAffiliateCodeAvailable({
      code: affiliateCode,
    });
  } catch (error) {
    affiliateCodeAvailable = false;
    affiliateCodeMessage =
      error instanceof Error ? error.message : "Partner code is not available.";
    normalizedAffiliateCode = affiliateCode;
  }

  let discountCodeMessage = "Swell discount code is available.";
  let discountCodeAvailable = true;
  let normalizedDiscountCode = discountCode;

  try {
    normalizedDiscountCode = await assertDiscountCodeAvailable({
      discountCode,
      existingSwellCouponId: null,
    });
  } catch (error) {
    discountCodeAvailable = false;
    discountCodeMessage =
      error instanceof Error
        ? error.message
        : "Swell discount code is not available.";
  }

  return {
    affiliateCode: {
      value: normalizedAffiliateCode,
      available: affiliateCodeAvailable,
      message: affiliateCodeMessage,
    },
    discountCode: {
      value: normalizedDiscountCode,
      available: discountCodeAvailable,
      message: discountCodeMessage,
    },
  };
}

export async function getAffiliateCodeAssignment(
  affiliateId: string,
): Promise<AffiliateCodeAssignment> {
  const row = await getAffiliateRow(affiliateId);
  const links = buildLinks(row.code, row.discountCode);

  return {
    affiliateId: row.id,
    affiliateCode: row.code,
    discountCode: row.discountCode,
    discountPercent: row.discountPercent,
    commissionRate: row.commissionRate,
    status: row.status,
    swellCouponId: row.swellCouponId,
    referralLink: links.referralLink,
    checkoutLink: links.checkoutLink,
    emailSent: false,
  };
}

export async function saveAffiliateCodeAssignment(args: {
  affiliateId: string;
  affiliateCode: string;
  discountCode: string;
  discountPercent?: string;
  commissionRate?: string;
  approve?: boolean;
  sendEmail?: boolean;
  changedByUserId?: string | null;
  changeReason?: string | null;
  reinstatementReason?: string | null;
  changeScope?: "single" | "selected_bulk" | "filtered_bulk";
  batchId?: string | null;
}): Promise<AffiliateCodeAssignment> {
  const row = await getAffiliateRow(args.affiliateId);
  const isReinstatementFlow =
    args.approve && (row.status === "suspended" || row.status === "rejected");
  const normalizedAffiliateCode = await assertAffiliateCodeAvailable({
    code: args.affiliateCode,
    excludeAffiliateId: row.id,
  });
  const normalizedDiscountCode = await assertDiscountCodeAvailable({
    affiliateId: row.id,
    discountCode: args.discountCode,
    existingSwellCouponId: row.swellCouponId,
  });
  const normalizedDiscountPercent = normalizeDiscountPercent(
    args.discountPercent?.trim() ||
      row.discountPercent ||
      DEFAULT_AFFILIATE_DISCOUNT_PERCENT,
  );
  const nextCommissionRate = args.commissionRate
    ? normalizeCommissionRateInput(args.commissionRate).stored
    : row.commissionRate || DEFAULT_AFFILIATE_COMMISSION_RATE;

  let swellCouponId = row.swellCouponId;
  const couponContext = { ...row, code: normalizedAffiliateCode };

  if (!swellCouponId) {
    const coupon = await createSwellAffiliateCoupon({
      code: normalizedDiscountCode,
      name: buildCouponName(couponContext),
      description: buildCouponDescription(couponContext),
      percentOff: normalizedDiscountPercent.numeric,
      active: true,
    });

    swellCouponId = coupon.id;
  } else {
    const existingSwellCode = await findSwellCouponCodeByCode(
      normalizedDiscountCode,
    );
    const currentCodeRows = await listSwellCouponCodes({
      parentId: swellCouponId,
      limit: 10,
    });
    const currentCode = currentCodeRows[0] || null;
    const currentCodeValue = currentCode?.code?.trim().toUpperCase() || "";

    if (currentCode && currentCodeValue !== normalizedDiscountCode) {
      await updateSwellCouponCode(currentCode.id, normalizedDiscountCode);
    } else if (!currentCode && !existingSwellCode) {
      await createSwellCouponCode(swellCouponId, normalizedDiscountCode);
    }

    await updateSwellAffiliateCoupon({
      couponId: swellCouponId,
      name: buildCouponName(couponContext),
      description: buildCouponDescription(couponContext),
      percentOff: normalizedDiscountPercent.numeric,
      active: true,
    });
  }

  const nextStatus: AffiliateRow["status"] = args.approve
    ? "approved"
    : row.status;

  await db
    .update(affiliates)
    .set({
      code: normalizedAffiliateCode,
      discountCode: normalizedDiscountCode,
      discountPercent: normalizedDiscountPercent.stored,
      swellCouponId,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(affiliates.id, row.id));

  if (row.userId && nextStatus === "approved") {
    const linkedUserRows = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, row.userId))
      .limit(1);

    if (shouldPromoteToAffiliateRole(linkedUserRows[0]?.role)) {
      await db
        .update(user)
        .set({ role: "affiliate", updatedAt: new Date() })
        .where(eq(user.id, row.userId));
    }
  }

  if (row.commissionRate !== nextCommissionRate) {
    await updateAffiliateBaselineCommission({
      affiliateId: row.id,
      commissionRate: nextCommissionRate,
      actorUserId: args.changedByUserId ?? null,
      notes:
        args.changeReason?.trim() ||
        "Growth Partner baseline commission updated from assignment flow.",
    });
  } else {
    await syncAffiliateCommissionMonth({
      affiliateId: row.id,
      monthKey: getCommissionMonthKey(),
      actorUserId: args.changedByUserId ?? null,
      eventType: "recalculated",
      notes: args.changeReason ?? null,
      recordEvent: false,
    });
  }

  await recordDiscountChange({
    affiliateId: row.id,
    affiliateCode: normalizedAffiliateCode,
    swellCouponId,
    discountCode: normalizedDiscountCode,
    oldDiscountPercent: row.discountPercent,
    newDiscountPercent: normalizedDiscountPercent.stored,
    reason: args.changeReason ?? null,
    changedByUserId: args.changedByUserId ?? null,
    changeScope: args.changeScope ?? "single",
    batchId: args.batchId ?? null,
  });

  let emailSent = false;
  if (args.sendEmail) {
    const emailResponse = isReinstatementFlow
      ? await sendAffiliateReinstatementEmail({
          affiliateName: row.name,
          affiliateEmail: row.email,
          affiliateCode: normalizedAffiliateCode,
          reinstatementReason: args.reinstatementReason ?? args.changeReason,
        })
      : await sendAffiliateApprovalEmail({
          affiliateName: row.name,
          affiliateEmail: row.email,
          affiliateCode: normalizedAffiliateCode,
          discountCode: normalizedDiscountCode,
          discountPercent: normalizedDiscountPercent.stored,
        });
    emailSent = Boolean(emailResponse);
  }

  const links = buildLinks(normalizedAffiliateCode, normalizedDiscountCode);

  return {
    affiliateId: row.id,
    affiliateCode: normalizedAffiliateCode,
    discountCode: normalizedDiscountCode,
    discountPercent: normalizedDiscountPercent.stored,
    commissionRate: nextCommissionRate,
    status: nextStatus,
    swellCouponId,
    referralLink: links.referralLink,
    checkoutLink: links.checkoutLink,
    emailSent,
  };
}

export async function createAffiliateCodeAssignmentForUser(args: {
  userId: string;
  affiliateCode: string;
  discountCode: string;
  discountPercent?: string;
  commissionRate?: string;
  sendEmail?: boolean;
  changedByUserId?: string | null;
  changeReason?: string | null;
  reinstatementReason?: string | null;
}) {
  const userRows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, args.userId))
    .limit(1);

  const currentUser = userRows[0];
  if (!currentUser) {
    throw new Error("User not found.");
  }

  let affiliate = await getAffiliateByUserIdentity({
    userId: currentUser.id,
    email: currentUser.email,
  });

  if (!affiliate) {
    affiliate = await createAffiliate({
      code: args.affiliateCode,
      name: currentUser.name?.trim() || "Growth Partner Applicant",
      email: currentUser.email.toLowerCase(),
      walletAddress: "",
      socialProfiles: [],
      userId: currentUser.id,
    });
  }

  return saveAffiliateCodeAssignment({
    affiliateId: affiliate.id,
    affiliateCode: args.affiliateCode,
    discountCode: args.discountCode,
    discountPercent: args.discountPercent,
    commissionRate: args.commissionRate,
    approve: true,
    sendEmail: args.sendEmail,
    changedByUserId: args.changedByUserId ?? null,
    changeReason: args.changeReason ?? null,
    reinstatementReason: args.reinstatementReason ?? null,
  });
}

export async function setAffiliateCodeAssignmentActive(args: {
  affiliateId: string;
  active: boolean;
  status: AffiliateRow["status"];
  changedByUserId?: string | null;
  changeReason?: string | null;
  suspensionReason?: string | null;
}) {
  const row = await getAffiliateRow(args.affiliateId);

  if (row.swellCouponId) {
    await setSwellCouponActive(row.swellCouponId, args.active);
  }

  await db
    .update(affiliates)
    .set({
      status: args.status,
      updatedAt: new Date(),
    })
    .where(eq(affiliates.id, row.id));

  if (row.userId && args.status !== "approved") {
    await db
      .update(user)
      .set({ role: "customer", updatedAt: new Date() })
      .where(and(eq(user.id, row.userId), eq(user.role, "affiliate")));
  }

  await syncAffiliateCommissionMonth({
    affiliateId: row.id,
    monthKey: getCommissionMonthKey(),
    actorUserId: args.changedByUserId ?? null,
    eventType: "recalculated",
    notes: args.changeReason ?? null,
    recordEvent: false,
  });

  if (args.status === "suspended") {
    await sendAffiliateRemovalEmail({
      affiliateName: row.name,
      affiliateEmail: row.email,
      removalReason: args.changeReason,
      suspensionReason: args.suspensionReason ?? args.changeReason,
    });
  }

  return getAffiliateCodeAssignment(row.id);
}

export async function removeAffiliateCodeAssignment(args: {
  affiliateId: string;
  changedByUserId?: string | null;
  changeReason?: string | null;
}) {
  const row = await getAffiliateRow(args.affiliateId);

  await deleteSwellCouponIfPresent(row.swellCouponId);

  await db
    .update(affiliates)
    .set({
      discountCode: null,
      discountPercent: null,
      swellCouponId: null,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(eq(affiliates.id, row.id));

  if (row.userId) {
    await db
      .update(user)
      .set({ role: "customer", updatedAt: new Date() })
      .where(and(eq(user.id, row.userId), eq(user.role, "affiliate")));
  }

  await recordDiscountChange({
    affiliateId: row.id,
    affiliateCode: row.code,
    swellCouponId: null,
    discountCode: null,
    oldDiscountPercent: row.discountPercent,
    newDiscountPercent: null,
    reason: args.changeReason ?? "Growth Partner assignment removed.",
    changedByUserId: args.changedByUserId ?? null,
    changeScope: "single",
  });

  return getAffiliateCodeAssignment(row.id);
}

export async function bulkUpdateAffiliateDiscountPercent(args: {
  affiliateIds: string[];
  discountPercent: string;
  mode: "selected" | "filtered";
  changedByUserId?: string | null;
  changeReason?: string | null;
  dryRun?: boolean;
}) {
  if (args.affiliateIds.length === 0) {
    return {
      mode: args.mode,
      totalTargeted: 0,
      eligibleCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      dryRun: Boolean(args.dryRun),
      results: [],
    } satisfies AffiliateDiscountBulkSummary;
  }

  const normalizedDiscountPercent = normalizeDiscountPercent(
    args.discountPercent,
  );
  const rows = await db
    .select()
    .from(affiliates)
    .where(inArray(affiliates.id, args.affiliateIds));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const batchId = crypto.randomUUID();
  const results: AffiliateDiscountBulkResult[] = [];

  for (const affiliateId of args.affiliateIds) {
    const row = rowsById.get(affiliateId);

    if (!row) {
      results.push({
        affiliateId,
        affiliateCode: "",
        discountCode: null,
        oldDiscountPercent: null,
        newDiscountPercent: normalizedDiscountPercent.stored,
        eligible: false,
        updated: false,
        error: "Affiliate not found.",
      });
      continue;
    }

    const eligible =
      row.status === "approved" &&
      Boolean(row.discountCode) &&
      Boolean(row.swellCouponId);

    if (!eligible) {
      results.push({
        affiliateId: row.id,
        affiliateCode: row.code,
        discountCode: row.discountCode,
        oldDiscountPercent: row.discountPercent,
        newDiscountPercent: normalizedDiscountPercent.stored,
        eligible: false,
        updated: false,
        error:
          "Only approved affiliates with an active Swell coupon can be bulk updated.",
      });
      continue;
    }

    if (row.discountPercent === normalizedDiscountPercent.stored) {
      results.push({
        affiliateId: row.id,
        affiliateCode: row.code,
        discountCode: row.discountCode,
        oldDiscountPercent: row.discountPercent,
        newDiscountPercent: normalizedDiscountPercent.stored,
        eligible: true,
        updated: false,
        error: null,
      });
      continue;
    }

    if (args.dryRun) {
      results.push({
        affiliateId: row.id,
        affiliateCode: row.code,
        discountCode: row.discountCode,
        oldDiscountPercent: row.discountPercent,
        newDiscountPercent: normalizedDiscountPercent.stored,
        eligible: true,
        updated: false,
        error: null,
      });
      continue;
    }

    try {
      await updateSwellAffiliateCoupon({
        couponId: row.swellCouponId!,
        name: buildCouponName(row),
        description: buildCouponDescription(row),
        percentOff: normalizedDiscountPercent.numeric,
        active: row.status === "approved",
      });

      await db
        .update(affiliates)
        .set({
          discountPercent: normalizedDiscountPercent.stored,
          updatedAt: new Date(),
        })
        .where(eq(affiliates.id, row.id));

      await recordDiscountChange({
        affiliateId: row.id,
        affiliateCode: row.code,
        swellCouponId: row.swellCouponId,
        discountCode: row.discountCode,
        oldDiscountPercent: row.discountPercent,
        newDiscountPercent: normalizedDiscountPercent.stored,
        reason: args.changeReason ?? "Growth Partner bulk discount update.",
        changedByUserId: args.changedByUserId ?? null,
        changeScope:
          args.mode === "selected" ? "selected_bulk" : "filtered_bulk",
        batchId,
      });

      results.push({
        affiliateId: row.id,
        affiliateCode: row.code,
        discountCode: row.discountCode,
        oldDiscountPercent: row.discountPercent,
        newDiscountPercent: normalizedDiscountPercent.stored,
        eligible: true,
        updated: true,
        error: null,
      });
    } catch (error) {
      results.push({
        affiliateId: row.id,
        affiliateCode: row.code,
        discountCode: row.discountCode,
        oldDiscountPercent: row.discountPercent,
        newDiscountPercent: normalizedDiscountPercent.stored,
        eligible: true,
        updated: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update the Swell coupon.",
      });
    }
  }

  const eligibleCount = results.filter((result) => result.eligible).length;
  const updatedCount = results.filter((result) => result.updated).length;
  const failedCount = results.filter(
    (result) => result.eligible && !result.updated && Boolean(result.error),
  ).length;
  const skippedCount = results.length - updatedCount - failedCount;

  return {
    mode: args.mode,
    totalTargeted: args.affiliateIds.length,
    eligibleCount,
    updatedCount,
    skippedCount,
    failedCount,
    dryRun: Boolean(args.dryRun),
    results,
  } satisfies AffiliateDiscountBulkSummary;
}

export async function deleteAffiliateRecord(args: {
  affiliateId: string;
  removalReason?: string | null;
}) {
  const row = await getAffiliateRow(args.affiliateId);
  const payoutRows = await db
    .select({ id: affiliatePayouts.id })
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, row.id))
    .limit(1);

  if (payoutRows[0]) {
    throw new Error(
      "This Growth Partner has payout history and cannot be permanently deleted. Remove the assignment or suspend the account instead.",
    );
  }

  await sendAffiliateRemovalEmail({
    affiliateName: row.name,
    affiliateEmail: row.email,
    removalReason:
      args.removalReason?.trim() || "Your Growth Partner record was removed.",
  });

  await deleteSwellCouponIfPresent(row.swellCouponId);

  await db.transaction(async (tx) => {
    if (row.userId) {
      await tx
        .update(user)
        .set({ role: "customer", updatedAt: new Date() })
        .where(and(eq(user.id, row.userId), eq(user.role, "affiliate")));
    }

    await tx.delete(affiliates).where(eq(affiliates.id, row.id));
  });

  return {
    affiliateId: row.id,
    deleted: true,
  };
}
