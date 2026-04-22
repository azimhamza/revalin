import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

import { formatAmount, parseAmount, parseRate } from '../lib/checkout/affiliate-math.ts';
import { buildWeeklyPayoutPeriod } from '../lib/checkout/payout-periods.ts';

type CheckoutAffiliateSnapshot = {
  id: string;
  code: string;
  commissionRate: string;
  commissionRateAtPurchase?: string;
  commissionMonthKey?: string | null;
  commissionTierAtPurchase?: string | null;
};

type CheckoutPromoterSnapshot = {
  id: string;
  inviteId: string;
  affiliateId: string;
  affiliateCode: string;
  commissionRate: string;
};

type CheckoutPaymentSnapshot = {
  provider?: string;
  updatedAt?: string;
};

type OrderTotals = {
  totalAmount?: {
    amount?: string;
    currencyCode?: string;
  };
};

type OrderRow = {
  order_id: string;
  currency_code: string;
  totals: OrderTotals | string;
  affiliate: CheckoutAffiliateSnapshot | null | string;
  promoter: CheckoutPromoterSnapshot | null | string;
  payment: CheckoutPaymentSnapshot | string;
};

function parseJsonValue<T>(value: T | string | null): T | null {
  if (value === null) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getCommissionMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function resolveEarnedAt(payment: CheckoutPaymentSnapshot | null) {
  if (payment?.updatedAt && !Number.isNaN(Date.parse(payment.updatedAt))) {
    return new Date(payment.updatedAt);
  }

  return new Date();
}

function getNormalizedOrderTotal(args: {
  currencyCode: string;
  totals: OrderTotals | null;
}) {
  const currencyCode = args.currencyCode.trim().toUpperCase();
  const amount = parseAmount(args.totals?.totalAmount?.amount);

  if (currencyCode !== 'USD') {
    throw new Error(`Unsupported currency for backfill: ${currencyCode}`);
  }

  return formatAmount(amount);
}

function getPaymentProvider(payment: CheckoutPaymentSnapshot | null) {
  const provider = payment?.provider?.trim();
  return provider || 'backfill';
}

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL.');
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const rows = await sql.unsafe<OrderRow[]>(`
      select
        order_id,
        currency_code,
        totals,
        affiliate,
        promoter,
        payment
      from checkout_orders
      where lower(payment_status) in ('paid', 'finished')
      order by updated_at desc
    `);

    const results: Array<{
      orderId: string;
      affiliateInserted: boolean;
      promoterInserted: boolean;
      skipped?: string;
    }> = [];

    for (const row of rows) {
      const affiliate = parseJsonValue<CheckoutAffiliateSnapshot>(row.affiliate);
      const promoter = parseJsonValue<CheckoutPromoterSnapshot>(row.promoter);
      const payment = parseJsonValue<CheckoutPaymentSnapshot>(row.payment);
      const totals = parseJsonValue<OrderTotals>(row.totals);

      try {
        const normalizedOrderTotal = getNormalizedOrderTotal({
          currencyCode: row.currency_code,
          totals,
        });
        const orderTotal = formatAmount(parseAmount(totals?.totalAmount?.amount));
        const earnedAt = resolveEarnedAt(payment);
        const period = buildWeeklyPayoutPeriod(earnedAt);

        let affiliateInserted = false;
        let promoterInserted = false;

        if (affiliate?.id) {
          const commissionRate =
            affiliate.commissionRateAtPurchase || affiliate.commissionRate;
          const normalizedCommissionAmount = formatAmount(
            parseAmount(normalizedOrderTotal) * parseRate(commissionRate),
          );

          const inserted = await sql<Array<{ id: string }>>`
            insert into affiliate_payouts (
              order_id,
              affiliate_id,
              affiliate_code,
              order_total,
              commission_month_key,
              commission_tier_key,
              commission_tier_label,
              commission_rate,
              commission_amount,
              normalized_order_total,
              normalized_commission_amount,
              payout_currency_code,
              currency_code,
              payment_provider,
              earned_at,
              payout_period_start,
              payout_period_end,
              payout_period_timezone
            )
            values (
              ${row.order_id},
              ${affiliate.id},
              ${affiliate.code},
              ${orderTotal},
              ${affiliate.commissionMonthKey || getCommissionMonthKey(earnedAt)},
              null,
              ${affiliate.commissionTierAtPurchase ?? null},
              ${commissionRate},
              ${normalizedCommissionAmount},
              ${normalizedOrderTotal},
              ${normalizedCommissionAmount},
              'USD',
              ${row.currency_code},
              ${getPaymentProvider(payment)},
              ${earnedAt.toISOString()},
              ${period.start.toISOString()},
              ${period.end.toISOString()},
              ${period.timezone}
            )
            on conflict (order_id) do nothing
            returning id
          `;

          affiliateInserted = inserted.length > 0;
        }

        if (promoter?.id) {
          const normalizedCommissionAmount = formatAmount(
            parseAmount(normalizedOrderTotal) * parseRate(promoter.commissionRate),
          );

          const inserted = await sql<Array<{ id: string }>>`
            insert into promoter_payouts (
              order_id,
              promoter_id,
              promoter_invite_id,
              affiliate_id,
              affiliate_code,
              order_total,
              commission_month_key,
              commission_rate,
              commission_amount,
              normalized_order_total,
              normalized_commission_amount,
              payout_currency_code,
              currency_code,
              payment_provider,
              earned_at,
              payout_period_start,
              payout_period_end,
              payout_period_timezone
            )
            values (
              ${row.order_id},
              ${promoter.id},
              ${promoter.inviteId},
              ${promoter.affiliateId},
              ${promoter.affiliateCode},
              ${orderTotal},
              ${getCommissionMonthKey(earnedAt)},
              ${promoter.commissionRate},
              ${normalizedCommissionAmount},
              ${normalizedOrderTotal},
              ${normalizedCommissionAmount},
              'USD',
              ${row.currency_code},
              ${getPaymentProvider(payment)},
              ${earnedAt.toISOString()},
              ${period.start.toISOString()},
              ${period.end.toISOString()},
              ${period.timezone}
            )
            on conflict (order_id) do nothing
            returning id
          `;

          promoterInserted = inserted.length > 0;
        }

        results.push({
          orderId: row.order_id,
          affiliateInserted,
          promoterInserted,
        });
      } catch (error) {
        results.push({
          orderId: row.order_id,
          affiliateInserted: false,
          promoterInserted: false,
          skipped: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const insertedAffiliateCount = results.filter((row) => row.affiliateInserted).length;
    const insertedPromoterCount = results.filter((row) => row.promoterInserted).length;

    console.log(
      JSON.stringify(
        {
          insertedAffiliateCount,
          insertedPromoterCount,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
