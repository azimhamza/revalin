import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { decrypt } from "@/lib/db/encryption";
import { AffiliateManagement } from "./affiliate-management";

export const metadata = {
  title: "Growth Partner Management | Revalin Admin",
};

type AffiliateRow = {
  id: string;
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  userId: string | null;
  swellCouponId: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: Date;
};

export default async function AffiliatesPage() {
  const rows = await db
    .select()
    .from(affiliates)
    .orderBy(desc(affiliates.createdAt))
    .limit(200);

  const decryptedRows: AffiliateRow[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    walletAddress: decrypt({
      ciphertext: row.encryptedWalletAddress,
      iv: row.walletIv,
      tag: row.walletTag,
    }),
    userId: row.userId,
    swellCouponId: row.swellCouponId,
    discountCode: row.discountCode,
    discountPercent: row.discountPercent,
    commissionRate: row.commissionRate,
    status: row.status,
    createdAt: row.createdAt,
  }));

  return <AffiliateManagement affiliates={decryptedRows} />;
}
