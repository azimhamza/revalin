import crypto from "node:crypto";
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { affiliates, promoterInvites, promoterPayouts, promoters, user } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/db/encryption";
import { normalizeAffiliateCode } from "@/lib/checkout/affiliate-service";
import {
  normalizeAffiliateSocialProfiles,
  type AffiliateSocialProfile,
} from "@/lib/checkout/affiliate-social-profiles";
import { RESERVED_SLUGS } from "@/lib/checkout/affiliate-constants";
import { resolveAutoActivationCommissionRate } from "@/lib/checkout/promoter-referral-logic";
import {
  DEFAULT_PROMOTER_COMMISSION_RATE,
  normalizePromoterCommissionRateInput,
} from "@/lib/checkout/promoter-math";
import {
  sendPromoterGrowthPartnerInviteEmail,
  sendPromoterRemovalEmail,
  sendPromoterReferralLinkUpdatedEmail,
  sendPromoterReinstatementEmail,
} from "@/lib/email/promoter-emails";

export {
  DEFAULT_PROMOTER_COMMISSION_RATE,
  normalizePromoterCommissionRateInput,
} from "@/lib/checkout/promoter-math";

export type PromoterRecord = {
  id: string;
  code: string;
  name: string;
  email: string;
  userId: string | null;
  walletAddress: string;
  socialProfiles: AffiliateSocialProfile[];
  defaultCommissionRate: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: Date;
  updatedAt: Date;
};

export type PromoterInviteRecord = typeof promoterInvites.$inferSelect;

export type PromoterAffiliateCandidate = {
  id: string;
  code: string;
  name: string;
  email: string;
  status: typeof affiliates.$inferSelect["status"];
  userId: string | null;
  userEmail: string | null;
  socialProfiles: AffiliateSocialProfile[];
};

function decryptPromoterRow(row: typeof promoters.$inferSelect): PromoterRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    userId: row.userId,
    walletAddress: decrypt({
      ciphertext: row.encryptedWalletAddress,
      iv: row.walletIv,
      tag: row.walletTag,
    }),
    socialProfiles: normalizeAffiliateSocialProfiles(row.socialProfiles || []),
    defaultCommissionRate: row.defaultCommissionRate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email address is required.");
  }
  return normalized;
}

function getSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  return (explicit || "https://revalin.ca").replace(/\/$/, "");
}

export function buildPromoterReferralLink(code: string) {
  return `${getSiteUrl()}/grow/${encodeURIComponent(code)}`;
}

function buildLegacyPromoterReferralLink(code: string) {
  return `${getSiteUrl()}/promoter/r/${encodeURIComponent(code)}`;
}

export async function assertPromoterCodeAvailable(args: {
  code: string;
  excludePromoterId?: string | null;
  allowAffiliateUserId?: string | null;
  allowAffiliateEmail?: string | null;
}) {
  const normalizedCode = normalizeAffiliateCode(args.code);

  if (normalizedCode.length < 3) {
    throw new Error("Promoter codes must be at least 3 characters after cleanup.");
  }

  if (RESERVED_SLUGS.has(normalizedCode)) {
    throw new Error("That promoter code is reserved by an existing route.");
  }

  const promoterRows = await db
    .select({ id: promoters.id })
    .from(promoters)
    .where(
      args.excludePromoterId
        ? and(
            eq(promoters.code, normalizedCode),
            ne(promoters.id, args.excludePromoterId),
          )
        : eq(promoters.code, normalizedCode),
    )
    .limit(1);

  if (promoterRows[0]) {
    throw new Error("That promoter code is already assigned to another promoter.");
  }

  const [affiliateRow] = await db
    .select({
      id: affiliates.id,
      userId: affiliates.userId,
      email: affiliates.email,
    })
    .from(affiliates)
    .where(eq(affiliates.code, normalizedCode))
    .limit(1);

  if (affiliateRow) {
    let allowAffiliateUserId = args.allowAffiliateUserId ?? null;
    let allowAffiliateEmail = args.allowAffiliateEmail ?? null;

    if (!allowAffiliateUserId && !allowAffiliateEmail && args.excludePromoterId) {
      const [currentPromoter] = await db
        .select({
          userId: promoters.userId,
          email: promoters.email,
        })
        .from(promoters)
        .where(eq(promoters.id, args.excludePromoterId))
        .limit(1);

      allowAffiliateUserId = currentPromoter?.userId ?? null;
      allowAffiliateEmail = currentPromoter?.email ?? null;
    }

    const normalizedAllowedEmail = allowAffiliateEmail?.trim().toLowerCase();
    const affiliateBelongsToPromoter =
      Boolean(
        allowAffiliateUserId &&
          affiliateRow.userId &&
          affiliateRow.userId === allowAffiliateUserId,
      ) ||
      Boolean(
        normalizedAllowedEmail &&
          affiliateRow.email.trim().toLowerCase() === normalizedAllowedEmail,
      );

    if (affiliateBelongsToPromoter) {
      return normalizedCode;
    }

    throw new Error("That promoter code is already assigned to a Growth Partner.");
  }

  return normalizedCode;
}

export async function generatePromoterCode() {
  for (let index = 0; index < 100; index += 1) {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    try {
      return await assertPromoterCodeAvailable({
        code: `promoter-${suffix}`,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /already assigned|reserved by an existing route/i.test(error.message)
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to generate a unique promoter code.");
}

export async function getPromoterById(
  promoterId: string,
): Promise<PromoterRecord | null> {
  const [row] = await db
    .select()
    .from(promoters)
    .where(eq(promoters.id, promoterId))
    .limit(1);

  return row ? decryptPromoterRow(row) : null;
}

export async function getPromoterByUserIdentity(args: {
  userId?: string | null;
  email?: string | null;
}): Promise<PromoterRecord | null> {
  if (args.userId) {
    const [row] = await db
      .select()
      .from(promoters)
      .where(eq(promoters.userId, args.userId))
      .limit(1);

    if (row) return decryptPromoterRow(row);
  }

  if (args.email) {
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail) return null;

    const [row] = await db
      .select()
      .from(promoters)
      .where(eq(promoters.email, normalizedEmail))
      .limit(1);

    return row ? decryptPromoterRow(row) : null;
  }

  return null;
}

export async function createPromoter(args: {
  name: string;
  email: string;
  userId?: string | null;
  code?: string | null;
  defaultCommissionRate?: string | number | null;
  socialProfiles?: AffiliateSocialProfile[];
  status?: typeof promoters.$inferSelect["status"];
}) {
  const normalizedEmail = normalizeEmail(args.email);
  const normalizedCode = args.code
    ? await assertPromoterCodeAvailable({
        code: args.code,
        allowAffiliateUserId: args.userId,
        allowAffiliateEmail: normalizedEmail,
      })
    : await generatePromoterCode();
  const normalizedRate = normalizePromoterCommissionRateInput(
    args.defaultCommissionRate ?? DEFAULT_PROMOTER_COMMISSION_RATE,
  );
  const encrypted = encrypt("");
  const socialProfiles = normalizeAffiliateSocialProfiles(
    args.socialProfiles || [],
  );

  const [row] = await db
    .insert(promoters)
    .values({
      code: normalizedCode,
      name: args.name.trim() || normalizedEmail.split("@")[0] || "Promoter",
      email: normalizedEmail,
      userId: args.userId ?? null,
      defaultCommissionRate: normalizedRate.stored,
      socialProfiles,
      encryptedWalletAddress: encrypted.ciphertext,
      walletIv: encrypted.iv,
      walletTag: encrypted.tag,
      status: args.status ?? "pending",
    })
    .onConflictDoUpdate({
      target: promoters.email,
      set: {
        name: args.name.trim() || normalizedEmail.split("@")[0] || "Promoter",
        userId: args.userId ?? null,
        defaultCommissionRate: normalizedRate.stored,
        socialProfiles,
        status: args.status ?? "pending",
        updatedAt: new Date(),
      },
    })
    .returning();

  return decryptPromoterRow(row!);
}

export async function ensurePromoterForUser(args: {
  userId: string;
  defaultCommissionRate?: string | number | null;
}) {
  const [currentUser] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, args.userId))
    .limit(1);

  if (!currentUser) {
    throw new Error("User not found.");
  }

  const existing = await getPromoterByUserIdentity({
    userId: currentUser.id,
    email: currentUser.email,
  });

  if (existing) {
    if (!existing.userId) {
      await db
        .update(promoters)
        .set({ userId: currentUser.id, updatedAt: new Date() })
        .where(eq(promoters.id, existing.id));
      return getPromoterById(existing.id);
    }
    return existing;
  }

  const [approvedAffiliate] = await db
    .select({ code: affiliates.code })
    .from(affiliates)
    .where(
      and(
        or(
          eq(affiliates.userId, currentUser.id),
          eq(affiliates.email, currentUser.email),
        ),
        eq(affiliates.status, "approved"),
      ),
    )
    .limit(1);

  return createPromoter({
    name: currentUser.name,
    email: currentUser.email,
    userId: currentUser.id,
    code: approvedAffiliate?.code,
    defaultCommissionRate: args.defaultCommissionRate,
    status: "approved",
  });
}

export async function syncPromoterForUser(args: {
  userId: string;
  email: string;
}) {
  const normalizedEmail = args.email.trim().toLowerCase();
  if (!normalizedEmail) return { linked: false, hasApprovedPromoter: false };

  const [row] = await db
    .select()
    .from(promoters)
    .where(eq(promoters.email, normalizedEmail))
    .limit(1);

  if (!row) return { linked: false, hasApprovedPromoter: false };
  if (row.userId && row.userId !== args.userId) {
    return { linked: false, hasApprovedPromoter: row.status === "approved" };
  }

  let linked = false;
  if (!row.userId) {
    await db
      .update(promoters)
      .set({ userId: args.userId, updatedAt: new Date() })
      .where(eq(promoters.id, row.id));
    linked = true;
  }

  return { linked, hasApprovedPromoter: row.status === "approved" };
}

export async function updatePromoterWallet(args: {
  promoterId: string;
  walletAddress: string;
}) {
  const encrypted = encrypt(args.walletAddress.trim());

  await db
    .update(promoters)
    .set({
      encryptedWalletAddress: encrypted.ciphertext,
      walletIv: encrypted.iv,
      walletTag: encrypted.tag,
      updatedAt: new Date(),
    })
    .where(eq(promoters.id, args.promoterId));
}

export async function updatePromoterCodeAndRate(args: {
  promoterId: string;
  code?: string | null;
  defaultCommissionRate?: string | number | null;
}) {
  const [current] = await db
    .select()
    .from(promoters)
    .where(eq(promoters.id, args.promoterId))
    .limit(1);

  if (!current) {
    throw new Error("Promoter not found.");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  let oldCode = current.code;
  let newCode = current.code;

  if (args.code != null && args.code.trim()) {
    const normalizedCode = await assertPromoterCodeAvailable({
      code: args.code,
      excludePromoterId: args.promoterId,
    });
    updates.code = normalizedCode;
    newCode = normalizedCode;
  }

  if (args.defaultCommissionRate != null) {
    const normalizedRate = normalizePromoterCommissionRateInput(
      args.defaultCommissionRate,
    );
    updates.defaultCommissionRate = normalizedRate.stored;
  }

  const [updated] = await db
    .update(promoters)
    .set(updates)
    .where(eq(promoters.id, args.promoterId))
    .returning();

  return {
    promoter: decryptPromoterRow(updated ?? current),
    codeChanged: oldCode !== newCode,
    oldCode,
    newCode,
  };
}

export async function updatePromoterStatus(args: {
  promoterId: string;
  status: typeof promoters.$inferSelect["status"];
  reinstatementReason?: string | null;
  sendReinstatementEmail?: boolean;
  removalReason?: string | null;
  sendRemovalEmail?: boolean;
}) {
  const [current] = await db
    .select()
    .from(promoters)
    .where(eq(promoters.id, args.promoterId))
    .limit(1);

  if (!current) {
    throw new Error("Promoter not found.");
  }

  const isReinstatement =
    args.status === "approved" &&
    (current.status === "suspended" || current.status === "rejected");
  const isRemoval =
    args.status === "suspended" || args.status === "rejected";

  if (
    isReinstatement &&
    args.sendReinstatementEmail !== false &&
    !args.reinstatementReason?.trim()
  ) {
    throw new Error("A reinstatement reason is required.");
  }

  if (
    isRemoval &&
    args.sendRemovalEmail !== false &&
    !args.removalReason?.trim()
  ) {
    throw new Error("A removal reason is required.");
  }

  const [updated] = await db
    .update(promoters)
    .set({
      status: args.status,
      updatedAt: new Date(),
    })
    .where(eq(promoters.id, args.promoterId))
    .returning();

  if (
    updated &&
    isReinstatement &&
    args.sendReinstatementEmail !== false
  ) {
    await sendPromoterReinstatementEmail({
      promoterEmail: updated.email,
      promoterName: updated.name,
      reinstatementReason: args.reinstatementReason,
    });
  }

  if (updated && isRemoval && args.sendRemovalEmail !== false) {
    await sendPromoterRemovalEmail({
      promoterEmail: updated.email,
      promoterName: updated.name,
      removalReason: args.removalReason,
      status: args.status === "suspended" ? "suspended" : "rejected",
    });
  }

  return updated ? decryptPromoterRow(updated) : decryptPromoterRow(current);
}

export async function listPromoters() {
  const rows = await db
    .select()
    .from(promoters)
    .orderBy(desc(promoters.createdAt))
    .limit(200);

  return rows.map(decryptPromoterRow);
}

export async function listPromoterInvites(args?: {
  promoterId?: string;
  limit?: number;
}) {
  const rows = await db
    .select({
      invite: promoterInvites,
      promoterName: promoters.name,
      promoterEmail: promoters.email,
      promoterCode: promoters.code,
      affiliateCode: affiliates.code,
      affiliateName: affiliates.name,
      affiliateEmail: affiliates.email,
      affiliateStatus: affiliates.status,
    })
    .from(promoterInvites)
    .innerJoin(promoters, eq(promoterInvites.promoterId, promoters.id))
    .leftJoin(affiliates, eq(promoterInvites.invitedAffiliateId, affiliates.id))
    .where(
      args?.promoterId
        ? eq(promoterInvites.promoterId, args.promoterId)
        : undefined,
    )
    .orderBy(desc(promoterInvites.createdAt))
    .limit(args?.limit ?? 500);

  return rows;
}

export async function resendPromoterInviteEmail(inviteId: string) {
  const [row] = await db
    .select({
      invite: promoterInvites,
      promoter: promoters,
    })
    .from(promoterInvites)
    .innerJoin(promoters, eq(promoterInvites.promoterId, promoters.id))
    .where(eq(promoterInvites.id, inviteId))
    .limit(1);

  if (!row) {
    throw new Error("Promoter invite not found.");
  }

  try {
    await sendPromoterGrowthPartnerInviteEmail({
      invitedEmail: row.invite.invitedEmail,
      invitedName: row.invite.invitedName,
      promoterName: row.promoter.name,
      signupLink: buildPromoterReferralLink(row.promoter.code),
    });
    const [updated] = await db
      .update(promoterInvites)
      .set({
        inviteEmailSentAt: new Date(),
        inviteEmailError: null,
        updatedAt: new Date(),
      })
      .where(eq(promoterInvites.id, inviteId))
      .returning();
    return updated ?? row.invite;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send invite email.";
    await db
      .update(promoterInvites)
      .set({ inviteEmailError: message, updatedAt: new Date() })
      .where(eq(promoterInvites.id, inviteId));
    throw error;
  }
}

export async function searchAffiliateCandidatesForPromoterInvite(args: {
  inviteId: string;
  q?: string | null;
  limit?: number;
}) {
  const [invite] = await db
    .select()
    .from(promoterInvites)
    .where(eq(promoterInvites.id, args.inviteId))
    .limit(1);

  if (!invite) {
    throw new Error("Promoter invite not found.");
  }

  const searchTerm =
    args.q?.trim() || invite.normalizedInvitedEmail || invite.invitedEmail;
  const needle = `%${searchTerm}%`;

  const rows = await db
    .select({
      affiliate: affiliates,
      userEmail: user.email,
    })
    .from(affiliates)
    .leftJoin(user, eq(affiliates.userId, user.id))
    .where(
      or(
        ilike(affiliates.code, needle),
        ilike(affiliates.name, needle),
        ilike(affiliates.email, needle),
        ilike(user.email, needle),
        sql`${affiliates.socialProfiles}::text ILIKE ${needle}`,
      ),
    )
    .orderBy(desc(affiliates.createdAt))
    .limit(args.limit ?? 20);

  return rows.map(({ affiliate, userEmail }) => ({
    id: affiliate.id,
    code: affiliate.code,
    name: affiliate.name,
    email: affiliate.email,
    status: affiliate.status,
    userId: affiliate.userId,
    userEmail: userEmail ?? null,
    socialProfiles: normalizeAffiliateSocialProfiles(
      affiliate.socialProfiles || [],
    ),
  })) satisfies PromoterAffiliateCandidate[];
}

export async function markPromoterInviteSuccessful(args: {
  inviteId: string;
  affiliateId: string;
  commissionRate: string | number;
  notes?: string | null;
  actorUserId?: string | null;
}) {
  const [invite] = await db
    .select()
    .from(promoterInvites)
    .where(eq(promoterInvites.id, args.inviteId))
    .limit(1);

  if (!invite) {
    throw new Error("Promoter invite not found.");
  }

  if (invite.status === "cancelled") {
    throw new Error("Cancelled promoter invites cannot be marked successful.");
  }

  const [affiliate] = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, args.affiliateId))
    .limit(1);

  if (!affiliate) {
    throw new Error("Growth Partner record not found.");
  }

  if (affiliate.status !== "approved") {
    throw new Error(
      "Approve the Growth Partner before activating promoter commission.",
    );
  }

  const [existingActive] = await db
    .select({ id: promoterInvites.id })
    .from(promoterInvites)
    .where(
      and(
        eq(promoterInvites.invitedAffiliateId, args.affiliateId),
        inArray(promoterInvites.status, ["invited", "applied", "successful"]),
        ne(promoterInvites.id, args.inviteId),
      ),
    )
    .limit(1);

  if (existingActive) {
    throw new Error(
      "This Growth Partner is already mapped to an active promoter invite.",
    );
  }

  const normalizedRate = normalizePromoterCommissionRateInput(args.commissionRate);
  const now = new Date();
  const [updated] = await db
    .update(promoterInvites)
    .set({
      invitedAffiliateId: args.affiliateId,
      commissionRate: normalizedRate.stored,
      status: "successful",
      notes: args.notes?.trim() || invite.notes,
      appliedAt: invite.appliedAt ?? now,
      successfulAt: now,
      successfulByUserId: args.actorUserId ?? null,
      rejectedAt: null,
      cancelledAt: null,
      updatedAt: now,
    })
    .where(eq(promoterInvites.id, args.inviteId))
    .returning();

  return updated ?? invite;
}

export async function autoActivatePromoterInviteForAffiliate(
  affiliateId: string,
) {
  const [appliedInvite] = await db
    .select({
      invite: promoterInvites,
      promoter: promoters,
    })
    .from(promoterInvites)
    .innerJoin(promoters, eq(promoterInvites.promoterId, promoters.id))
    .where(
      and(
        eq(promoterInvites.invitedAffiliateId, affiliateId),
        eq(promoterInvites.status, "applied"),
        eq(promoters.status, "approved"),
      ),
    )
    .orderBy(desc(promoterInvites.createdAt))
    .limit(1);

  if (!appliedInvite) {
    return null;
  }

  const commissionRate = resolveAutoActivationCommissionRate({
    inviteCommissionRate: appliedInvite.invite.commissionRate,
    promoterDefaultCommissionRate: appliedInvite.promoter.defaultCommissionRate,
  });

  const normalizedRate = normalizePromoterCommissionRateInput(commissionRate);
  const now = new Date();
  const [updated] = await db
    .update(promoterInvites)
    .set({
      commissionRate: normalizedRate.stored,
      status: "successful",
      appliedAt: appliedInvite.invite.appliedAt ?? now,
      successfulAt: now,
      rejectedAt: null,
      cancelledAt: null,
      updatedAt: now,
    })
    .where(eq(promoterInvites.id, appliedInvite.invite.id))
    .returning();

  return updated ?? appliedInvite.invite;
}

export async function updatePromoterInviteStatus(args: {
  inviteId: string;
  status: "applied" | "rejected" | "cancelled";
  notes?: string | null;
}) {
  const now = new Date();
  const statusTimestamps =
    args.status === "applied"
      ? { appliedAt: now }
      : args.status === "rejected"
        ? { rejectedAt: now }
        : { cancelledAt: now };
  const [updated] = await db
    .update(promoterInvites)
    .set({
      status: args.status,
      notes: args.notes?.trim() || null,
      ...statusTimestamps,
      updatedAt: now,
    })
    .where(eq(promoterInvites.id, args.inviteId))
    .returning();

  if (!updated) {
    throw new Error("Promoter invite not found.");
  }

  return updated;
}

export type PromoterReferralCodeResolution = {
  promoter: PromoterRecord;
  code: string;
  source: "promoter_code" | "affiliate_code";
};

export async function resolveApprovedPromoterReferralCode(
  rawCode: string | null | undefined,
): Promise<PromoterReferralCodeResolution | null> {
  const normalizedCode = normalizeAffiliateCode(rawCode || "");
  if (!normalizedCode) return null;

  const [promoterCodeMatch] = await db
    .select()
    .from(promoters)
    .where(
      and(eq(promoters.code, normalizedCode), eq(promoters.status, "approved")),
    )
    .limit(1);

  if (promoterCodeMatch) {
    return {
      promoter: decryptPromoterRow(promoterCodeMatch),
      code: normalizedCode,
      source: "promoter_code",
    };
  }

  const [affiliateCodeMatch] = await db
    .select({
      promoter: promoters,
      affiliateCode: affiliates.code,
    })
    .from(affiliates)
    .innerJoin(
      promoters,
      or(
        eq(promoters.userId, affiliates.userId),
        eq(promoters.email, affiliates.email),
      ),
    )
    .where(
      and(
        eq(affiliates.code, normalizedCode),
        eq(affiliates.status, "approved"),
        eq(promoters.status, "approved"),
      ),
    )
    .limit(1);

  if (!affiliateCodeMatch) return null;

  return {
    promoter: decryptPromoterRow(affiliateCodeMatch.promoter),
    code: affiliateCodeMatch.affiliateCode,
    source: "affiliate_code",
  };
}

export async function getApprovedAffiliateCodeForPromoter(
  promoter: PromoterRecord,
) {
  const identity =
    promoter.userId
      ? or(
          eq(affiliates.userId, promoter.userId),
          eq(affiliates.email, promoter.email),
        )
      : eq(affiliates.email, promoter.email);

  const [row] = await db
    .select({ code: affiliates.code })
    .from(affiliates)
    .where(and(identity, eq(affiliates.status, "approved")))
    .limit(1);

  return row?.code ?? null;
}

export async function getPromoterTrackingInfo(promoter: PromoterRecord) {
  const affiliateCode = await getApprovedAffiliateCodeForPromoter(promoter);
  const primaryCode = affiliateCode || promoter.code;

  return {
    promoterCode: promoter.code,
    promoterLink: buildPromoterReferralLink(promoter.code),
    affiliateCode,
    affiliateLink: affiliateCode ? buildPromoterReferralLink(affiliateCode) : null,
    primaryCode,
    primaryLink: buildPromoterReferralLink(primaryCode),
  };
}

export async function sendPromoterReferralLinkUpdateNotification(
  input:
    | string
    | {
        promoterId: string;
        oldCode?: string | null;
        newCode?: string | null;
      },
) {
  const promoterId = typeof input === "string" ? input : input.promoterId;
  const promoter = await getPromoterById(promoterId);
  if (!promoter) {
    throw new Error("Promoter not found.");
  }

  if (promoter.status !== "approved") {
    throw new Error("Only approved promoters can receive link update emails.");
  }

  const trackingInfo = await getPromoterTrackingInfo(promoter);
  const oldCode =
    typeof input === "string"
      ? trackingInfo.primaryCode
      : normalizeAffiliateCode(input.oldCode || "") || trackingInfo.primaryCode;
  const newCode =
    typeof input === "string"
      ? trackingInfo.primaryCode
      : normalizeAffiliateCode(input.newCode || "") || trackingInfo.primaryCode;
  const oldReferralLink = buildLegacyPromoterReferralLink(oldCode);
  const newReferralLink =
    typeof input === "string"
      ? trackingInfo.primaryLink
      : buildPromoterReferralLink(newCode);

  await sendPromoterReferralLinkUpdatedEmail({
    promoterEmail: promoter.email,
    promoterName: promoter.name,
    oldReferralLink,
    newReferralLink,
  });

  return {
    promoter,
    oldReferralLink,
    newReferralLink,
  };
}

export async function recordPromoterApplicationFromReferralCode(args: {
  referralCode?: string | null;
  affiliateId: string;
  applicantName?: string | null;
  applicantEmail: string;
  socialProfiles?: AffiliateSocialProfile[];
}) {
  const resolution = await resolveApprovedPromoterReferralCode(args.referralCode);
  if (!resolution) {
    return { linked: false as const, reason: "invalid-code" as const };
  }

  const normalizedEmail = normalizeEmail(args.applicantEmail);
  if (resolution.promoter.email.toLowerCase() === normalizedEmail) {
    return { linked: false as const, reason: "self-referral" as const };
  }

  const now = new Date();
  const socialProfiles = normalizeAffiliateSocialProfiles(
    args.socialProfiles || [],
  );
  const invitedName = args.applicantName?.trim() || null;
  const activeStatuses = ["invited", "applied", "successful"] as const;
  const [existingByAffiliate] = await db
    .select()
    .from(promoterInvites)
    .where(
      and(
        eq(promoterInvites.invitedAffiliateId, args.affiliateId),
        inArray(promoterInvites.status, activeStatuses),
      ),
    )
    .orderBy(desc(promoterInvites.createdAt))
    .limit(1);

  if (
    existingByAffiliate &&
    existingByAffiliate.promoterId !== resolution.promoter.id
  ) {
    return {
      linked: false as const,
      reason: "already-attributed" as const,
      invite: existingByAffiliate,
      source: resolution.source,
    };
  }

  const [existingByPromoterEmail] = await db
    .select()
    .from(promoterInvites)
    .where(
      and(
        eq(promoterInvites.promoterId, resolution.promoter.id),
        eq(promoterInvites.normalizedInvitedEmail, normalizedEmail),
        inArray(promoterInvites.status, activeStatuses),
      ),
    )
    .orderBy(desc(promoterInvites.createdAt))
    .limit(1);
  const existing = existingByAffiliate ?? existingByPromoterEmail;

  if (existing) {
    const [updated] = await db
      .update(promoterInvites)
      .set({
        invitedAffiliateId: args.affiliateId,
        invitedName: existing.invitedName || invitedName,
        socialProfiles: socialProfiles.length
          ? socialProfiles
          : existing.socialProfiles,
        referralCode: resolution.code,
        status: existing.status === "successful" ? "successful" : "applied",
        appliedAt: existing.appliedAt ?? now,
        rejectedAt: null,
        updatedAt: now,
      })
      .where(eq(promoterInvites.id, existing.id))
      .returning();

    return {
      linked: true as const,
      invite: updated ?? existing,
      source: resolution.source,
    };
  }

  const [invite] = await db
    .insert(promoterInvites)
    .values({
      promoterId: resolution.promoter.id,
      invitedAffiliateId: args.affiliateId,
      invitedName,
      invitedEmail: normalizedEmail,
      normalizedInvitedEmail: normalizedEmail,
      socialProfiles,
      referralCode: resolution.code,
      notes: `Applied through promoter link ${resolution.code}.`,
      status: "applied",
      appliedAt: now,
    })
    .returning();

  return {
    linked: true as const,
    invite,
    source: resolution.source,
  };
}

export async function getSuccessfulPromoterForAffiliate(affiliateId: string) {
  const [row] = await db
    .select({
      invite: promoterInvites,
      promoter: promoters,
    })
    .from(promoterInvites)
    .innerJoin(promoters, eq(promoterInvites.promoterId, promoters.id))
    .where(
      and(
        eq(promoterInvites.invitedAffiliateId, affiliateId),
        eq(promoterInvites.status, "successful"),
        eq(promoters.status, "approved"),
      ),
    )
    .limit(1);

  if (!row || !row.invite.commissionRate) {
    return null;
  }

  return {
    id: row.promoter.id,
    inviteId: row.invite.id,
    affiliateId,
    commissionRate: row.invite.commissionRate,
  };
}

export async function getSuccessfulAffiliateCodesForPromoter(
  promoterId: string,
): Promise<string[]> {
  const rows = await db
    .select({ affiliateCode: affiliates.code })
    .from(promoterInvites)
    .innerJoin(affiliates, eq(promoterInvites.invitedAffiliateId, affiliates.id))
    .where(
      and(
        eq(promoterInvites.promoterId, promoterId),
        eq(promoterInvites.status, "successful"),
        eq(affiliates.status, "approved"),
      ),
    );

  return rows.map((row) => row.affiliateCode);
}

export async function deletePromoterRecord(args: {
  promoterId: string;
}) {
  const promoter = await getPromoterById(args.promoterId);
  if (!promoter) {
    throw new Error("Promoter not found.");
  }

  const [hasPayout] = await db
    .select({ id: promoterPayouts.id })
    .from(promoterPayouts)
    .where(eq(promoterPayouts.promoterId, promoter.id))
    .limit(1);

  if (hasPayout) {
    throw new Error(
      "This promoter has payout history and cannot be permanently deleted. Suspend the account instead.",
    );
  }

  await db.delete(promoters).where(eq(promoters.id, promoter.id));

  return {
    promoterId: promoter.id,
    deleted: true,
  };
}
