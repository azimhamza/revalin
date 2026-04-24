import { unstable_cache } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { affiliates, promoters, user } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/db/encryption";
import { RESERVED_SLUGS } from "@/lib/checkout/affiliate-constants";
import { shouldPromoteToAffiliateRole } from "@/lib/checkout/affiliate-role";
import { getBaselineCommissionRate } from "@/lib/checkout/commission-tier-service";
import {
  CRYPTO_PAYOUT_METHOD,
  normalizeCryptoWallet,
  resolveEncryptedSecretUpdate,
  sanitizeAccountNumber,
  sanitizeRoutingNumber,
  type AchAccountType,
  type PayoutMethod,
} from "@/lib/checkout/payout-methods";
import {
  normalizeAffiliateSocialProfiles,
  type AffiliateSocialProfile,
} from "@/lib/checkout/affiliate-social-profiles";

export type AffiliateRecord = {
  id: string;
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  payoutMethod: PayoutMethod;
  achAccountHolderName: string | null;
  achBankName: string | null;
  achAccountType: AchAccountType | null;
  achRoutingNumberLast4: string | null;
  achAccountNumberLast4: string | null;
  socialProfiles: AffiliateSocialProfile[];
  swellCouponId: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: Date;
  updatedAt: Date;
};

export type AffiliateAttributionRecord = {
  code: string;
  discountCode: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
};

export type AffiliateRoleOrphanUser = {
  userId: string;
  name: string;
  email: string;
  createdAt: Date;
};

export type AffiliateUserSetupResult = {
  affiliate: AffiliateRecord;
  created: boolean;
  linked: boolean;
  roleUpdated: boolean;
};

export type ApprovedAffiliateSyncResult = {
  affiliateCode?: string;
  hasApprovedAffiliate: boolean;
  linked: boolean;
  roleUpdated: boolean;
  role: string | null;
};

export type AffiliateSetupPreview =
  | {
      kind: "existing";
      affiliateId: string;
    }
  | {
      kind: "draft";
      userId: string;
      name: string;
      email: string;
      role: string | null;
      affiliateCode: string;
    };

export type AffiliatePayoutSettingsUpdateInput = {
  payoutMethod: PayoutMethod;
  walletAddress?: string | null;
  achAccountHolderName?: string | null;
  achBankName?: string | null;
  achAccountType?: AchAccountType | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
};

function decryptRow(row: typeof affiliates.$inferSelect): AffiliateRecord {
  const walletAddress = decrypt({
    ciphertext: row.encryptedWalletAddress,
    iv: row.walletIv,
    tag: row.walletTag,
  });

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    walletAddress,
    payoutMethod: row.payoutMethod,
    achAccountHolderName: row.achAccountHolderName,
    achBankName: row.achBankName,
    achAccountType: row.achAccountType,
    achRoutingNumberLast4: row.achRoutingNumberLast4,
    achAccountNumberLast4: row.achAccountNumberLast4,
    socialProfiles: normalizeAffiliateSocialProfiles(row.socialProfiles || []),
    swellCouponId: row.swellCouponId,
    discountCode: row.discountCode,
    discountPercent: row.discountPercent,
    commissionRate: row.commissionRate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function normalizeAffiliateCode(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function assertAffiliateCodeAvailable(args: {
  code: string;
  excludeAffiliateId?: string | null;
}) {
  const normalizedCode = normalizeAffiliateCode(args.code);

  if (normalizedCode.length < 3) {
    throw new Error(
      "Partner codes must be at least 3 characters after cleanup.",
    );
  }

  if (RESERVED_SLUGS.has(normalizedCode)) {
    throw new Error("That partner code is reserved by an existing route.");
  }

  const rows = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(
      args.excludeAffiliateId
        ? and(
            eq(affiliates.code, normalizedCode),
            ne(affiliates.id, args.excludeAffiliateId),
          )
        : eq(affiliates.code, normalizedCode),
    )
    .limit(1);

  if (rows[0]) {
    throw new Error(
      "That partner code is already assigned to another affiliate.",
    );
  }

  const promoterRows = await db
    .select({ id: promoters.id })
    .from(promoters)
    .where(eq(promoters.code, normalizedCode))
    .limit(1);

  if (promoterRows[0]) {
    throw new Error(
      "That partner code is already assigned to another promoter.",
    );
  }

  return normalizedCode;
}

export async function generateAffiliateCode(args: {
  name?: string | null;
  email?: string | null;
}) {
  const baseCandidate =
    normalizeAffiliateCode(args.name || "") ||
    normalizeAffiliateCode(args.email?.split("@")[0] || "") ||
    "partner";
  const base = baseCandidate.length >= 3 ? baseCandidate : "partner";

  for (let index = 0; index < 100; index += 1) {
    const nextCandidate = index === 0 ? base : `${base}-${index + 1}`;

    try {
      return await assertAffiliateCodeAvailable({ code: nextCandidate });
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

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return assertAffiliateCodeAvailable({ code: `partner-${randomSuffix}` });
}

export async function getApprovedAffiliateByCode(
  code: string,
): Promise<AffiliateRecord | null> {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.code, code.toLowerCase()))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "approved") return null;

  return decryptRow(row);
}

const getAffiliateAttributionByCodeCached = unstable_cache(
  async (normalizedCode: string): Promise<AffiliateAttributionRecord | null> => {
    const rows = await db
      .select({
        code: affiliates.code,
        discountCode: affiliates.discountCode,
        status: affiliates.status,
      })
      .from(affiliates)
      .where(eq(affiliates.code, normalizedCode))
      .limit(1);

    return rows[0] ?? null;
  },
  ["affiliate-attribution-by-code"],
  { revalidate: 300 },
);

export async function getAffiliateAttributionByCode(
  code: string,
): Promise<AffiliateAttributionRecord | null> {
  const normalizedCode = code.toLowerCase().trim();
  if (!normalizedCode) return null;
  return getAffiliateAttributionByCodeCached(normalizedCode);
}

export async function getAffiliateByCode(
  code: string,
): Promise<AffiliateRecord | null> {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.code, code.toLowerCase()))
    .limit(1);

  return rows[0] ? decryptRow(rows[0]) : null;
}

export async function getAffiliateByEmail(
  email: string,
): Promise<AffiliateRecord | null> {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.email, email.toLowerCase()))
    .limit(1);

  return rows[0] ? decryptRow(rows[0]) : null;
}

export async function getAffiliateByUserIdentity(args: {
  userId?: string | null;
  email?: string | null;
}): Promise<AffiliateRecord | null> {
  if (args.userId) {
    const userRows = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.userId, args.userId))
      .limit(1);

    if (userRows[0]) {
      return decryptRow(userRows[0]);
    }
  }

  if (args.email) {
    return getAffiliateByEmail(args.email);
  }

  return null;
}

export async function syncApprovedAffiliateForUser(args: {
  userId: string;
  email: string;
  currentRole?: string | null;
}): Promise<ApprovedAffiliateSyncResult> {
  const normalizedEmail = args.email.trim().toLowerCase();
  const currentRole = args.currentRole ?? null;

  if (!normalizedEmail) {
    return {
      hasApprovedAffiliate: false,
      linked: false,
      roleUpdated: false,
      role: currentRole,
    };
  }

  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.email, normalizedEmail))
    .limit(1);

  const affiliate = rows[0];
  if (!affiliate || affiliate.status !== "approved") {
    return {
      hasApprovedAffiliate: false,
      linked: false,
      roleUpdated: false,
      role: currentRole,
    };
  }

  if (affiliate.userId && affiliate.userId !== args.userId) {
    return {
      affiliateCode: affiliate.code,
      hasApprovedAffiliate: true,
      linked: false,
      roleUpdated: false,
      role: currentRole,
    };
  }

  let linked = false;
  if (!affiliate.userId) {
    await db
      .update(affiliates)
      .set({ userId: args.userId, updatedAt: new Date() })
      .where(eq(affiliates.id, affiliate.id));
    linked = true;
  }

  let roleUpdated = false;
  let role = currentRole;
  if (shouldPromoteToAffiliateRole(currentRole)) {
    await db
      .update(user)
      .set({ role: "affiliate", updatedAt: new Date() })
      .where(eq(user.id, args.userId));
    roleUpdated = true;
    role = "affiliate";
  }

  return {
    affiliateCode: affiliate.code,
    hasApprovedAffiliate: true,
    linked,
    roleUpdated,
    role,
  };
}

export async function getAffiliateSetupPreviewForUser(args: {
  userId: string;
}): Promise<AffiliateSetupPreview> {
  const userRows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, args.userId))
    .limit(1);

  const currentUser = userRows[0];
  if (!currentUser) {
    throw new Error("User not found.");
  }

  const existingAffiliate = await getAffiliateByUserIdentity({
    userId: currentUser.id,
    email: currentUser.email,
  });

  if (existingAffiliate) {
    return {
      kind: "existing",
      affiliateId: existingAffiliate.id,
    };
  }

  return {
    kind: "draft",
    userId: currentUser.id,
    name: currentUser.name?.trim() || "Growth Partner Applicant",
    email: currentUser.email.toLowerCase(),
    role: currentUser.role ?? null,
    affiliateCode: await generateAffiliateCode({
      name: currentUser.name,
      email: currentUser.email,
    }),
  };
}

export async function listAffiliateRoleOrphans(
  limit = 50,
): Promise<AffiliateRoleOrphanUser[]> {
  const affiliateUsers = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.role, "affiliate"))
    .orderBy(desc(user.createdAt))
    .limit(limit);

  if (affiliateUsers.length === 0) {
    return [];
  }

  const affiliateRows = await db
    .select({
      userId: affiliates.userId,
      email: affiliates.email,
    })
    .from(affiliates);

  const linkedUserIds = new Set(
    affiliateRows
      .map((row) => row.userId)
      .filter((value): value is string => Boolean(value)),
  );
  const linkedEmails = new Set(
    affiliateRows.map((row) => row.email.toLowerCase()),
  );

  return affiliateUsers.filter(
    (entry) =>
      !linkedUserIds.has(entry.userId) &&
      !linkedEmails.has(entry.email.toLowerCase()),
  );
}

export async function repairAffiliateRoleOrphan(args: { userId: string }) {
  return ensureAffiliateRecordForUser({
    userId: args.userId,
    requireAffiliateRole: true,
  });
}

export async function ensureAffiliateSetupForUser(args: {
  userId: string;
  affiliateCode?: string;
}) {
  return ensureAffiliateRecordForUser({
    userId: args.userId,
    affiliateCode: args.affiliateCode,
    syncApprovedRole: true,
  });
}

async function ensureAffiliateRecordForUser(args: {
  userId: string;
  affiliateCode?: string;
  requireAffiliateRole?: boolean;
  syncApprovedRole?: boolean;
}): Promise<AffiliateUserSetupResult> {
  const userRows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, args.userId))
    .limit(1);

  const currentUser = userRows[0];
  if (!currentUser) {
    throw new Error("User not found.");
  }

  if (args.requireAffiliateRole && currentUser.role !== "affiliate") {
    throw new Error("This user is not currently marked as a Growth Partner.");
  }

  const existingByUserId = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.userId, args.userId))
    .limit(1);

  if (existingByUserId[0]) {
    const affiliate = decryptRow(existingByUserId[0]);
    const roleUpdated =
      args.syncApprovedRole &&
      affiliate.status === "approved" &&
      currentUser.role !== "affiliate"
        ? await syncApprovedAffiliateRole({
            userId: args.userId,
            currentRole: currentUser.role,
          })
        : false;

    return {
      affiliate,
      created: false,
      linked: false,
      roleUpdated,
    };
  }

  const normalizedEmail = currentUser.email.toLowerCase();
  const existingByEmail = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.email, normalizedEmail))
    .limit(1);

  if (existingByEmail[0]) {
    if (
      existingByEmail[0].userId &&
      existingByEmail[0].userId !== args.userId
    ) {
      throw new Error(
        "A Growth Partner record with this email is already linked to another user.",
      );
    }

    const linkedAffiliate =
      existingByEmail[0].userId === args.userId
        ? existingByEmail[0]
        : (
            await db
              .update(affiliates)
              .set({ userId: args.userId, updatedAt: new Date() })
              .where(eq(affiliates.id, existingByEmail[0].id))
              .returning()
          )[0];

    const affiliate = decryptRow(linkedAffiliate!);
    const roleUpdated =
      args.syncApprovedRole &&
      affiliate.status === "approved" &&
      currentUser.role !== "affiliate"
        ? await syncApprovedAffiliateRole({
            userId: args.userId,
            currentRole: currentUser.role,
          })
        : false;

    return {
      affiliate,
      created: false,
      linked: existingByEmail[0].userId !== args.userId,
      roleUpdated,
    };
  }

  const affiliate = await createAffiliate({
    code: args.affiliateCode,
    name: currentUser.name?.trim() || "Growth Partner Applicant",
    email: normalizedEmail,
    walletAddress: "",
    socialProfiles: [],
    userId: args.userId,
  });

  return {
    affiliate,
    created: true,
    linked: true,
    roleUpdated: false,
  };
}

async function syncApprovedAffiliateRole(args: {
  userId: string;
  currentRole: string | null;
}) {
  if (!shouldPromoteToAffiliateRole(args.currentRole)) {
    return false;
  }

  await db
    .update(user)
    .set({ role: "affiliate", updatedAt: new Date() })
    .where(eq(user.id, args.userId));

  return true;
}

export async function createAffiliate(args: {
  code?: string;
  name: string;
  email: string;
  walletAddress?: string;
  socialProfiles?: AffiliateSocialProfile[];
  userId?: string | null;
}): Promise<AffiliateRecord> {
  const normalizedCode = args.code
    ? await assertAffiliateCodeAvailable({ code: args.code })
    : await generateAffiliateCode({ name: args.name, email: args.email });
  const encrypted = encrypt(args.walletAddress?.trim() || "");
  const commissionRate = await getBaselineCommissionRate().catch(() => "0.15");

  const [row] = await db
    .insert(affiliates)
    .values({
      code: normalizedCode,
      name: args.name,
      email: args.email.toLowerCase(),
      userId: args.userId ?? null,
      encryptedWalletAddress: encrypted.ciphertext,
      walletIv: encrypted.iv,
      walletTag: encrypted.tag,
      socialProfiles: normalizeAffiliateSocialProfiles(
        args.socialProfiles || [],
      ),
      commissionRate,
      status: "pending",
    })
    .returning();

  return decryptRow(row!);
}

export async function updateAffiliatePayoutSettings(
  args: { affiliateId: string } & AffiliatePayoutSettingsUpdateInput,
) {
  const [current] = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, args.affiliateId))
    .limit(1);

  if (!current) {
    throw new Error("Affiliate not found.");
  }

  const updates: Record<string, unknown> = {
    payoutMethod: args.payoutMethod,
    updatedAt: new Date(),
  };

  if (args.payoutMethod === CRYPTO_PAYOUT_METHOD) {
    const walletAddress = normalizeCryptoWallet(args.walletAddress);
    if (!walletAddress) {
      throw new Error("A valid Polygon wallet address is required for crypto payouts.");
    }

    const encrypted = encrypt(walletAddress);
    updates.encryptedWalletAddress = encrypted.ciphertext;
    updates.walletIv = encrypted.iv;
    updates.walletTag = encrypted.tag;
  } else {
    const achAccountHolderName = args.achAccountHolderName?.trim() || "";
    const achBankName = args.achBankName?.trim() || "";

    if (!achAccountHolderName) {
      throw new Error("Account holder name is required for ACH payouts.");
    }

    if (!achBankName) {
      throw new Error("Bank name is required for ACH payouts.");
    }

    if (!args.achAccountType) {
      throw new Error("Account type is required for ACH payouts.");
    }

    const routingNumber = resolveEncryptedSecretUpdate({
      submittedValue: args.routingNumber,
      current: {
        ciphertext: current.encryptedAchRoutingNumber,
        iv: current.achRoutingNumberIv,
        tag: current.achRoutingNumberTag,
        last4: current.achRoutingNumberLast4,
      },
      sanitize: sanitizeRoutingNumber,
      label: "Routing number",
      minLength: 9,
      maxLength: 9,
    });
    const accountNumber = resolveEncryptedSecretUpdate({
      submittedValue: args.accountNumber,
      current: {
        ciphertext: current.encryptedAchAccountNumber,
        iv: current.achAccountNumberIv,
        tag: current.achAccountNumberTag,
        last4: current.achAccountNumberLast4,
      },
      sanitize: sanitizeAccountNumber,
      label: "Account number",
      minLength: 4,
      maxLength: 17,
    });

    updates.achAccountHolderName = achAccountHolderName;
    updates.achBankName = achBankName;
    updates.achAccountType = args.achAccountType;
    updates.encryptedAchRoutingNumber = routingNumber.ciphertext;
    updates.achRoutingNumberIv = routingNumber.iv;
    updates.achRoutingNumberTag = routingNumber.tag;
    updates.achRoutingNumberLast4 = routingNumber.last4;
    updates.encryptedAchAccountNumber = accountNumber.ciphertext;
    updates.achAccountNumberIv = accountNumber.iv;
    updates.achAccountNumberTag = accountNumber.tag;
    updates.achAccountNumberLast4 = accountNumber.last4;
  }

  const [updated] = await db
    .update(affiliates)
    .set(updates)
    .where(eq(affiliates.id, args.affiliateId))
    .returning();

  return decryptRow(updated ?? current);
}

export async function getApprovedAffiliateByDiscountCode(
  discountCode: string,
): Promise<AffiliateRecord | null> {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.discountCode, discountCode.toUpperCase()))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "approved") return null;

  return decryptRow(row);
}
