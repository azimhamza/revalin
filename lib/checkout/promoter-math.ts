import {
  formatAmount,
  normalizeCommissionRateInput,
  parseAmount,
  parseRate,
} from "./affiliate-math.ts";

export const DEFAULT_PROMOTER_COMMISSION_RATE = "0.025";

export function normalizePromoterCommissionRateInput(
  value: string | number | null | undefined,
) {
  return normalizeCommissionRateInput(
    value ?? DEFAULT_PROMOTER_COMMISSION_RATE,
  );
}

export function calculatePromoterCommissionAmount(args: {
  normalizedOrderTotal: string | number;
  commissionRate: string | number;
}) {
  return formatAmount(
    parseAmount(args.normalizedOrderTotal) * parseRate(args.commissionRate),
  );
}
