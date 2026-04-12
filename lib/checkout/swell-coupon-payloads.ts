export function normalizeSwellCouponCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildSwellCouponCreatePayload(args: {
  code: string;
  name: string;
  percentOff: number;
  expiresAt?: string;
  description?: string;
  active?: boolean;
  limitUses?: number;
  limitAccountUses?: number;
}) {
  return {
    name: args.name,
    description: args.description,
    active: args.active ?? true,
    date_expired: args.expiresAt,
    codes: [{ code: normalizeSwellCouponCode(args.code) }],
    limit_uses: args.limitUses,
    limit_account_uses: args.limitAccountUses,
    discounts: [
      {
        type: "total",
        value_type: "percent",
        value_percent: args.percentOff,
      },
    ],
  };
}
