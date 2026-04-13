import {
  getCurrentPayoutFridayDate,
  type WeeklyPayoutPeriod,
} from "@/lib/checkout/payout-periods";
import {
  getWeeklyPayoutBatchPeriodOverview,
  listPayNowPayoutBatches,
} from "@/lib/checkout/weekly-payout-service";
import {
  getPromoterWeeklyPayoutBatchPeriodOverview,
  listPromoterPayNowPayoutBatches,
} from "@/lib/checkout/promoter-weekly-payout-service";

import { PayoutManagement } from "./payout-management";

export const metadata = {
  title: "Weekly Payout Management | Revalin Admin",
};

type PayoutsPageProps = {
  searchParams?: Promise<{
    periodDate?: string | string[] | undefined;
  }>;
};

function serializePeriod(period: WeeklyPayoutPeriod) {
  return {
    ...period,
    start: period.start.toISOString(),
    end: period.end.toISOString(),
  };
}

export default async function PayoutsPage({ searchParams }: PayoutsPageProps) {
  const params = (await searchParams) || {};
  const requestedPeriodDate = Array.isArray(params.periodDate)
    ? params.periodDate[0]
    : params.periodDate;
  const periodDate = requestedPeriodDate || getCurrentPayoutFridayDate();
  const [
    { period, batches },
    promoterOverview,
    payNowBatches,
    promoterPayNowBatches,
  ] = await Promise.all([
    getWeeklyPayoutBatchPeriodOverview(periodDate),
    getPromoterWeeklyPayoutBatchPeriodOverview(periodDate),
    listPayNowPayoutBatches({ limit: 100 }),
    listPromoterPayNowPayoutBatches({ limit: 100 }),
  ]);

  const serialized = batches.map((batch) => ({
    ...batch,
    partnerType: "affiliate" as const,
    partnerId: batch.affiliateId,
    partnerCode: batch.affiliateCode,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    approvedAt: batch.approvedAt?.toISOString() ?? null,
    paidAt: batch.paidAt?.toISOString() ?? null,
    rejectedAt: batch.rejectedAt?.toISOString() ?? null,
  }));
  const serializedPayNow = payNowBatches.map((batch) => ({
    ...batch,
    partnerType: "affiliate" as const,
    partnerId: batch.affiliateId,
    partnerCode: batch.affiliateCode,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    approvedAt: batch.approvedAt?.toISOString() ?? null,
    paidAt: batch.paidAt?.toISOString() ?? null,
    rejectedAt: batch.rejectedAt?.toISOString() ?? null,
  }));
  const serializedPromoter = promoterOverview.batches.map((batch) => ({
    ...batch,
    partnerType: "promoter" as const,
    partnerId: batch.promoterId,
    partnerCode: batch.promoterName || batch.promoterEmail || "Promoter",
    affiliateId: batch.promoterId,
    affiliateCode: "Promoter",
    currentTierKey: null,
    currentTierLabel: null,
    nextTierKey: null,
    nextTierLabel: null,
    amountToNextTier: null,
    effectiveRate: null,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    approvedAt: batch.approvedAt?.toISOString() ?? null,
    paidAt: batch.paidAt?.toISOString() ?? null,
    rejectedAt: batch.rejectedAt?.toISOString() ?? null,
  }));
  const serializedPromoterPayNow = promoterPayNowBatches.map((batch) => ({
    ...batch,
    partnerType: "promoter" as const,
    partnerId: batch.promoterId,
    partnerCode: batch.promoterName || batch.promoterEmail || "Promoter",
    affiliateId: batch.promoterId,
    affiliateCode: "Promoter",
    currentTierKey: null,
    currentTierLabel: null,
    nextTierKey: null,
    nextTierLabel: null,
    amountToNextTier: null,
    effectiveRate: null,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    approvedAt: batch.approvedAt?.toISOString() ?? null,
    paidAt: batch.paidAt?.toISOString() ?? null,
    rejectedAt: batch.rejectedAt?.toISOString() ?? null,
  }));

  return (
    <PayoutManagement
      periodDate={periodDate}
      period={serializePeriod(period)}
      batches={[
        ...serialized,
        ...serializedPromoter,
        ...serializedPayNow,
        ...serializedPromoterPayNow,
      ]}
    />
  );
}
