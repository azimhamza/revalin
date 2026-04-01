import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/db/encryption";

export type AffiliateRecord = {
  id: string;
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  swellCouponId: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: Date;
  updatedAt: Date;
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
    swellCouponId: row.swellCouponId,
    discountCode: row.discountCode,
    discountPercent: row.discountPercent,
    commissionRate: row.commissionRate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

export async function createAffiliate(args: {
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  userId?: string | null;
}): Promise<AffiliateRecord> {
  const encrypted = encrypt(args.walletAddress);

  const [row] = await db
    .insert(affiliates)
    .values({
      code: args.code.toLowerCase(),
      name: args.name,
      email: args.email.toLowerCase(),
      userId: args.userId ?? null,
      encryptedWalletAddress: encrypted.ciphertext,
      walletIv: encrypted.iv,
      walletTag: encrypted.tag,
      status: "pending",
    })
    .returning();

  return decryptRow(row!);
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
