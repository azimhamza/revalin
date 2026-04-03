import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliatePayouts, affiliates, checkoutOrders } from '@/lib/db/schema';
import { decrypt } from '@/lib/db/encryption';
import type { CheckoutOrderAffiliate } from '@/lib/checkout/types';
import {
  getCommissionMonthKey,
  getPayoutApprovalPreview,
  hydrateOrderAffiliateCommissionMonth,
  syncAffiliateCommissionMonth,
} from '@/lib/checkout/commission-service';

export type PayoutRecord = typeof affiliatePayouts.$inferSelect;

export type PayoutWithWallet = PayoutRecord & {
  walletAddress: string;
};

export async function createPayoutFromOrder(
  orderId: string,
  provider: string
): Promise<PayoutRecord | null> {
  // Idempotency: skip if payout already exists for this order
  const existing = await getPayoutByOrderId(orderId);
  if (existing) return existing;

  // Fetch order to get affiliate data
  const [order] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.orderId, orderId))
    .limit(1);

  if (!order) return null;

  const affiliate = order.affiliate as CheckoutOrderAffiliate | null;
  if (!affiliate) return null;

  const orderTotal = (order.totals as any)?.totalAmount?.amount;
  if (!orderTotal) return null;
  const commissionMonthKey = getCommissionMonthKey(new Date());
  const initialCommissionRate =
    affiliate.commissionRateAtPurchase || affiliate.commissionRate;

  const commissionAmount = (Number(orderTotal) * Number(initialCommissionRate)).toFixed(2);
  const currencyCode = order.currencyCode || 'USD';

  await db
    .insert(affiliatePayouts)
    .values({
      orderId,
      affiliateId: affiliate.id,
      affiliateCode: affiliate.code,
      orderTotal,
      commissionMonthKey,
      commissionTierKey: null,
      commissionTierLabel: affiliate.commissionTierAtPurchase || null,
      commissionRate: initialCommissionRate,
      commissionAmount,
      currencyCode,
      paymentProvider: provider,
    })
    .returning();

  const { summary } = await syncAffiliateCommissionMonth({
    affiliateId: affiliate.id,
    monthKey: commissionMonthKey,
    eventType: 'recalculated',
    notes: `Payout created from order ${orderId}.`,
    recordEvent: true,
  });

  await hydrateOrderAffiliateCommissionMonth({
    orderId,
    affiliateId: affiliate.id,
    monthKey: summary.monthKey,
    effectiveRate: summary.effectiveRate,
    tierLabel: summary.hasOverride
      ? `${summary.tierLabel} override`
      : summary.tierLabel,
  });

  return getPayoutByOrderId(orderId);
}

export async function getPayoutByOrderId(orderId: string): Promise<PayoutRecord | null> {
  const [row] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.orderId, orderId))
    .limit(1);

  return row ?? null;
}

export async function getPayoutById(payoutId: string): Promise<PayoutRecord | null> {
  const [row] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.id, payoutId))
    .limit(1);

  return row ?? null;
}

export async function getAllPayouts(
  statusFilter?: string
): Promise<PayoutWithWallet[]> {
  const rows = await db
    .select({
      payout: affiliatePayouts,
      encryptedWalletAddress: affiliates.encryptedWalletAddress,
      walletIv: affiliates.walletIv,
      walletTag: affiliates.walletTag,
    })
    .from(affiliatePayouts)
    .leftJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
    .orderBy(desc(affiliatePayouts.createdAt))
    .limit(500);

  const result = rows
    .filter((row) => !statusFilter || row.payout.status === statusFilter)
    .map((row) => ({
      ...row.payout,
      walletAddress: row.encryptedWalletAddress
        ? decrypt({
            ciphertext: row.encryptedWalletAddress,
            iv: row.walletIv!,
            tag: row.walletTag!,
          })
        : '',
    }));

  return result;
}

export async function getPayoutsForAffiliate(
  affiliateId: string
): Promise<PayoutRecord[]> {
  return db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayouts.createdAt))
    .limit(500);
}

export async function approvePayout(payoutId: string): Promise<void> {
  const payout = await getPayoutById(payoutId);
  if (!payout) {
    throw new Error('Payout not found.');
  }

  const monthKey = payout.commissionMonthKey || getCommissionMonthKey(payout.createdAt);
  await syncAffiliateCommissionMonth({
    affiliateId: payout.affiliateId,
    monthKey,
    eventType: 'recalculated',
    notes: `Approval review for payout ${payout.orderId}.`,
    recordEvent: true,
  });

  await db
    .update(affiliatePayouts)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, payoutId));
}

export async function rejectPayout(payoutId: string, notes?: string): Promise<void> {
  const payout = await getPayoutById(payoutId);
  if (!payout) {
    throw new Error('Payout not found.');
  }

  await db
    .update(affiliatePayouts)
    .set({
      status: 'rejected',
      rejectedAt: new Date(),
      adminNotes: notes || null,
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, payoutId));

  const monthKey = payout.commissionMonthKey || getCommissionMonthKey(payout.createdAt);
  await syncAffiliateCommissionMonth({
    affiliateId: payout.affiliateId,
    monthKey,
    eventType: 'recalculated',
    notes: notes || `Rejected payout ${payout.orderId}.`,
    recordEvent: true,
  });
}

export async function markPayoutPaid(payoutId: string, txHash: string): Promise<void> {
  const payout = await getPayoutById(payoutId);
  if (!payout) {
    throw new Error('Payout not found.');
  }

  const monthKey = payout.commissionMonthKey || getCommissionMonthKey(payout.createdAt);
  await syncAffiliateCommissionMonth({
    affiliateId: payout.affiliateId,
    monthKey,
    eventType: 'recalculated',
    notes: `Settlement review for payout ${payout.orderId}.`,
    recordEvent: true,
  });

  await db
    .update(affiliatePayouts)
    .set({
      status: 'paid',
      paidAt: new Date(),
      txHash,
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, payoutId));
}

export { getPayoutApprovalPreview };
