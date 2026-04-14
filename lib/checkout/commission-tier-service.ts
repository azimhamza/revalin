import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { affiliateCommissionTiers } from "@/lib/db/schema";
import {
  formatAmount,
  formatRate,
  parseAmount,
  parseRate,
} from "@/lib/checkout/affiliate-math";
import {
  DEFAULT_COMMISSION_TIER_CONFIG,
  getBaselineCommissionRateFromConfig,
  getCommissionTierProgress,
  resolveBaselineCommissionTierFromConfig,
  resolveCommissionTierFromConfig,
  type CommissionTierConfig,
  type CommissionTierProgress,
  validateCommissionTierConfiguration,
} from "@/lib/checkout/commission-tier-config";

export type CommissionTierRecord = typeof affiliateCommissionTiers.$inferSelect;
export type { CommissionTierConfig, CommissionTierProgress };
export {
  getBaselineCommissionRateFromConfig,
  getCommissionTierProgress,
  resolveBaselineCommissionTierFromConfig,
  resolveCommissionTierFromConfig,
};

function toTierConfig(row: CommissionTierRecord): CommissionTierConfig {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    minRevenue: row.minRevenue,
    maxRevenue: row.maxRevenue,
    rate: row.rate,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

export async function ensureCommissionTierDefaults() {
  const existing = await db
    .select({ id: affiliateCommissionTiers.id })
    .from(affiliateCommissionTiers)
    .limit(1);

  if (existing[0]) {
    return;
  }

  await db.insert(affiliateCommissionTiers).values(
    DEFAULT_COMMISSION_TIER_CONFIG.map((tier) => ({
      key: tier.key,
      label: tier.label,
      minRevenue: tier.minRevenue,
      maxRevenue: tier.maxRevenue,
      rate: tier.rate,
      sortOrder: tier.sortOrder,
      active: tier.active,
    })),
  );
}

export async function listCommissionTierConfig(args?: {
  includeInactive?: boolean;
}) {
  await ensureCommissionTierDefaults();

  const includeInactive = args?.includeInactive ?? true;
  const query = db
    .select()
    .from(affiliateCommissionTiers)
    .orderBy(asc(affiliateCommissionTiers.sortOrder));
  const rows = includeInactive
    ? await query
    : await query.where(eq(affiliateCommissionTiers.active, true));

  return rows.map(toTierConfig);
}

export async function getBaselineCommissionRate() {
  const tiers = await listCommissionTierConfig({ includeInactive: false });
  return getBaselineCommissionRateFromConfig(tiers);
}

export async function saveCommissionTierConfiguration(
  tiers: CommissionTierConfig[],
) {
  const normalized = validateCommissionTierConfiguration(tiers);

  await db.transaction(async (tx) => {
    await tx.delete(affiliateCommissionTiers);
    await tx.insert(affiliateCommissionTiers).values(
      normalized.map((tier) => ({
        key: tier.key,
        label: tier.label,
        minRevenue: formatAmount(parseAmount(tier.minRevenue)),
        maxRevenue:
          tier.maxRevenue === null
            ? null
            : formatAmount(parseAmount(tier.maxRevenue)),
        rate: formatRate(parseRate(tier.rate)),
        sortOrder: tier.sortOrder,
        active: tier.active,
        updatedAt: new Date(),
      })),
    );
  });

  return listCommissionTierConfig({ includeInactive: true });
}
