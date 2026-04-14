import {
  formatAmount,
  normalizeCommissionRateInput,
  parseAmount,
} from "./affiliate-math.ts";

export type CommissionTierConfig = {
  id?: string;
  key: string;
  label: string;
  minRevenue: string;
  maxRevenue: string | null;
  rate: string;
  sortOrder: number;
  active: boolean;
};

export type CommissionTierProgress = {
  currentTier: CommissionTierConfig;
  nextTier: CommissionTierConfig | null;
  amountToNextTier: string | null;
};

export const DEFAULT_COMMISSION_TIER_CONFIG: CommissionTierConfig[] = [
  {
    key: "operator",
    label: "Operator",
    minRevenue: "0.00",
    maxRevenue: "9999.99",
    rate: "0.15",
    sortOrder: 0,
    active: true,
  },
  {
    key: "builder",
    label: "Builder",
    minRevenue: "10000.00",
    maxRevenue: "29999.99",
    rate: "0.15",
    sortOrder: 1,
    active: true,
  },
  {
    key: "scaler",
    label: "Scaler",
    minRevenue: "30000.00",
    maxRevenue: "49999.99",
    rate: "0.20",
    sortOrder: 2,
    active: true,
  },
  {
    key: "partner",
    label: "Partner",
    minRevenue: "50000.00",
    maxRevenue: "74999.99",
    rate: "0.25",
    sortOrder: 3,
    active: true,
  },
  {
    key: "apex",
    label: "Apex",
    minRevenue: "75000.00",
    maxRevenue: "99999.99",
    rate: "0.30",
    sortOrder: 4,
    active: true,
  },
  {
    key: "authority",
    label: "Authority",
    minRevenue: "100000.00",
    maxRevenue: "499999.99",
    rate: "0.35",
    sortOrder: 5,
    active: true,
  },
  {
    key: "partner_equity",
    label: "Partner + Equity",
    minRevenue: "500000.00",
    maxRevenue: null,
    rate: "0.40",
    sortOrder: 6,
    active: true,
  },
];

function amountToCents(value: string | number | null | undefined) {
  return Math.round(parseAmount(value) * 100);
}

function normalizeTierInput(
  tier: CommissionTierConfig,
  index: number,
): CommissionTierConfig {
  const key = tier.key.trim();
  const label = tier.label.trim();

  if (!key) {
    throw new Error(`Tier ${index + 1} is missing a key.`);
  }

  if (!label) {
    throw new Error(`Tier ${index + 1} is missing a label.`);
  }

  const minRevenue = formatAmount(parseAmount(tier.minRevenue));
  const maxRevenue =
    tier.maxRevenue === null || tier.maxRevenue.trim().length === 0
      ? null
      : formatAmount(parseAmount(tier.maxRevenue));
  const rate = normalizeCommissionRateInput(tier.rate).stored;

  return {
    id: tier.id,
    key,
    label,
    minRevenue,
    maxRevenue,
    rate,
    sortOrder: tier.sortOrder,
    active: tier.active,
  };
}

export function validateCommissionTierConfiguration(
  tiers: CommissionTierConfig[],
) {
  if (tiers.length === 0) {
    throw new Error("At least one commission tier is required.");
  }

  const normalized = tiers
    .map(normalizeTierInput)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const activeTiers = normalized.filter((tier) => tier.active);
  if (activeTiers.length === 0) {
    throw new Error("At least one active commission tier is required.");
  }

  const keys = new Set<string>();
  const sortOrders = new Set<number>();

  normalized.forEach((tier, index) => {
    if (keys.has(tier.key)) {
      throw new Error(`Duplicate commission tier key "${tier.key}".`);
    }
    if (sortOrders.has(tier.sortOrder)) {
      throw new Error(
        `Duplicate commission tier sort order "${tier.sortOrder}".`,
      );
    }

    keys.add(tier.key);
    sortOrders.add(tier.sortOrder);

    const minRevenueCents = amountToCents(tier.minRevenue);
    const maxRevenueCents =
      tier.maxRevenue === null ? null : amountToCents(tier.maxRevenue);

    if (minRevenueCents < 0) {
      throw new Error(`Tier "${tier.label}" cannot start below $0.`);
    }

    if (index === 0 && minRevenueCents !== 0) {
      throw new Error("Commission tiers must start at $0.00.");
    }

    if (maxRevenueCents !== null && maxRevenueCents < minRevenueCents) {
      throw new Error(
        `Tier "${tier.label}" cannot end before its minimum revenue.`,
      );
    }

    if (index < normalized.length - 1 && maxRevenueCents === null) {
      throw new Error(
        "Only the last commission tier can have no maximum revenue.",
      );
    }

    if (index === normalized.length - 1 && maxRevenueCents !== null) {
      throw new Error("The last commission tier must extend to infinity.");
    }

    if (index > 0) {
      const previous = normalized[index - 1]!;
      const previousMaxRevenueCents =
        previous.maxRevenue === null
          ? null
          : amountToCents(previous.maxRevenue);

      if (previousMaxRevenueCents === null) {
        throw new Error(
          "No tiers can come after an unbounded commission tier.",
        );
      }

      if (minRevenueCents !== previousMaxRevenueCents + 1) {
        throw new Error(
          `Commission tiers must be continuous. "${tier.label}" should start at ${formatAmount(
            (previousMaxRevenueCents + 1) / 100,
          )}.`,
        );
      }
    }
  });

  return normalized;
}

export function resolveCommissionTierFromConfig(
  revenue: number,
  tiers: CommissionTierConfig[],
) {
  const matchedTier = tiers.find((tier) => {
    const minimum = parseAmount(tier.minRevenue);
    const maximum =
      tier.maxRevenue === null
        ? Number.POSITIVE_INFINITY
        : parseAmount(tier.maxRevenue);

    return revenue >= minimum && revenue <= maximum;
  });

  return matchedTier ?? tiers[0] ?? DEFAULT_COMMISSION_TIER_CONFIG[0]!;
}

export function resolveBaselineCommissionTierFromConfig(
  tiers: CommissionTierConfig[],
) {
  const configuredTiers = tiers.filter((tier) => tier.active);
  const fallbackTiers = DEFAULT_COMMISSION_TIER_CONFIG.filter(
    (tier) => tier.active,
  );
  const sourceTiers =
    configuredTiers.length > 0 ? configuredTiers : fallbackTiers;

  return (
    [...sourceTiers].sort((left, right) => {
      const revenueDelta =
        amountToCents(left.minRevenue) - amountToCents(right.minRevenue);
      return revenueDelta === 0
        ? left.sortOrder - right.sortOrder
        : revenueDelta;
    })[0] ?? DEFAULT_COMMISSION_TIER_CONFIG[0]!
  );
}

export function getBaselineCommissionRateFromConfig(
  tiers: CommissionTierConfig[],
) {
  return resolveBaselineCommissionTierFromConfig(tiers).rate;
}

export function getCommissionTierProgress(args: {
  revenue: number;
  tiers: CommissionTierConfig[];
}) {
  const tiers = args.tiers.filter((tier) => tier.active);
  if (tiers.length === 0) {
    throw new Error("No active commission tiers configured.");
  }

  const currentTier = resolveCommissionTierFromConfig(args.revenue, tiers);
  const currentIndex = tiers.findIndex((tier) => tier.key === currentTier.key);
  const nextTier = currentIndex >= 0 ? (tiers[currentIndex + 1] ?? null) : null;

  return {
    currentTier,
    nextTier,
    amountToNextTier: nextTier
      ? formatAmount(
          Math.max(
            0,
            parseAmount(nextTier.minRevenue) - Math.max(args.revenue, 0),
          ),
        )
      : null,
  } satisfies CommissionTierProgress;
}
