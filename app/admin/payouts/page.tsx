import {
  getCurrentPayoutFridayDate,
  type WeeklyPayoutPeriod,
} from "@/lib/checkout/payout-periods";
import { getWeeklyPayoutBatchPeriodOverview } from "@/lib/checkout/weekly-payout-service";

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
  const { period, batches } = await getWeeklyPayoutBatchPeriodOverview(periodDate);

  const serialized = batches.map((batch) => ({
    ...batch,
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
      batches={serialized}
    />
  );
}
