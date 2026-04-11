import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { affiliatePayouts } from "@/lib/db/schema";
import { decrypt } from "@/lib/db/encryption";
import {
  createAffiliateEarningFromOrder,
  getAffiliateEarningById,
  getAffiliateEarningByOrderId,
  getAffiliateEarningsForAffiliate,
  getAllAffiliateEarnings,
  type AffiliateEarningRecord,
} from "@/lib/checkout/affiliate-earnings-service";
import { createPromoterEarningFromOrder } from "@/lib/checkout/promoter-earnings-service";
import {
  getCommissionMonthKey,
  getPayoutApprovalPreview,
  syncAffiliateCommissionMonth,
} from "@/lib/checkout/commission-service";

export type PayoutRecord = AffiliateEarningRecord;

export type PayoutWithWallet = PayoutRecord & {
  walletAddress: string;
};

export async function createPayoutFromOrder(orderId: string, provider: string) {
  const [affiliate, promoter] = await Promise.all([
    createAffiliateEarningFromOrder(orderId, provider),
    createPromoterEarningFromOrder(orderId, provider),
  ]);

  return {
    affiliate,
    promoter,
  };
}

export async function getPayoutByOrderId(orderId: string) {
  return getAffiliateEarningByOrderId(orderId);
}

export async function getPayoutById(payoutId: string) {
  return getAffiliateEarningById(payoutId);
}

export async function getAllPayouts(statusFilter?: string): Promise<PayoutWithWallet[]> {
  const rows = await getAllAffiliateEarnings();

  return rows
    .filter((row) => !statusFilter || row.earning.status === statusFilter)
    .map((row) => ({
      ...row.earning,
      walletAddress:
        row.encryptedWalletAddress && row.walletIv && row.walletTag
          ? decrypt({
              ciphertext: row.encryptedWalletAddress,
              iv: row.walletIv,
              tag: row.walletTag,
            })
          : "",
    }));
}

export async function getPayoutsForAffiliate(affiliateId: string) {
  return getAffiliateEarningsForAffiliate(affiliateId);
}

export async function approvePayout(payoutId: string): Promise<void> {
  const payout = await getPayoutById(payoutId);
  if (!payout) {
    throw new Error("Payout not found.");
  }

  const monthKey = payout.commissionMonthKey || getCommissionMonthKey(payout.createdAt);
  await syncAffiliateCommissionMonth({
    affiliateId: payout.affiliateId,
    monthKey,
    eventType: "recalculated",
    notes: `Approval review for affiliate earning ${payout.orderId}.`,
    recordEvent: true,
  });

  await db
    .update(affiliatePayouts)
    .set({
      status: "approved",
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, payoutId));
}

export async function rejectPayout(payoutId: string, notes?: string): Promise<void> {
  const payout = await getPayoutById(payoutId);
  if (!payout) {
    throw new Error("Payout not found.");
  }

  await db
    .update(affiliatePayouts)
    .set({
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, payoutId));

  const monthKey = payout.commissionMonthKey || getCommissionMonthKey(payout.createdAt);
  await syncAffiliateCommissionMonth({
    affiliateId: payout.affiliateId,
    monthKey,
    eventType: "recalculated",
    notes: notes || `Rejected affiliate earning ${payout.orderId}.`,
    recordEvent: true,
  });
}

export async function markPayoutPaid(payoutId: string, txHash: string): Promise<void> {
  const payout = await getPayoutById(payoutId);
  if (!payout) {
    throw new Error("Payout not found.");
  }

  await db
    .update(affiliatePayouts)
    .set({
      status: "paid",
      txHash,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, payoutId));
}

export async function getRecentAffiliateEarningsWithOrders(affiliateId: string) {
  return db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt))
    .limit(20);
}

export { getPayoutApprovalPreview };
