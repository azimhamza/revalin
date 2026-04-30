import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const INCIDENT_ORDERS = [
  {
    orderId: 'RVL-MOHS4FKH-N2XP5G',
    expectedSwellOrderId: '69efe58ac5505e0012293d8a',
    swellOrderNumber: '100041',
    targetLocalStatus: 'cancelled',
  },
  {
    orderId: 'RVL-MOGCO9ET-LZUONK',
    expectedSwellOrderId: '69ee93fb4424e700121e5767',
    swellOrderNumber: '100040',
    targetLocalStatus: 'cancelled',
  },
  {
    orderId: 'RVL-MOFZ9HKG-YTZMGG',
    expectedSwellOrderId: '69ee3bfe974bbb00127a5c2d',
    swellOrderNumber: '100039',
    targetLocalStatus: 'preserve',
  },
] as const;

type IncidentOrder = (typeof INCIDENT_ORDERS)[number];

type CheckoutOrderRow = {
  order_id: string;
  payment_status: string | null;
  payment: {
    provider?: string;
    status?: string;
    txidIn?: string | null;
    txidOut?: string | null;
    callbackVerifiedAt?: string | null;
    swellPaymentId?: string | null;
  };
  swell: {
    orderId?: string;
    orderNumber?: string;
  };
};

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

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function hasPaymentEvidence(row: CheckoutOrderRow) {
  const payment = row.payment || {};
  return Boolean(
    payment.callbackVerifiedAt ||
      payment.txidIn ||
      payment.txidOut ||
      payment.swellPaymentId,
  );
}

async function cancelSwellOrder(args: {
  storeId: string;
  secretKey: string;
  orderId: string;
  reason: string;
  dryRun: boolean;
}) {
  if (args.dryRun) {
    return { dryRun: true };
  }

  const auth = Buffer.from(`${args.storeId}:${args.secretKey}`, 'utf8').toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Swell-Store-Id': args.storeId,
  };
  const currentResponse = await fetch(`https://api.swell.store/orders/${args.orderId}`, {
    headers,
    cache: 'no-store',
  });
  const current = await currentResponse.json();
  if (!currentResponse.ok) {
    throw new Error(
      `Swell order lookup failed for ${args.orderId}: ${currentResponse.status} ${JSON.stringify(current)}`,
    );
  }

  const items = (current.items || [])
    .map((item: { id?: string; quantity_cancelable?: number }) => ({
      id: item.id,
      quantity_canceled: Number(item.quantity_cancelable ?? 0),
      cancel_reason: args.reason,
    }))
    .filter((item: { id?: string; quantity_canceled: number }) => item.id && item.quantity_canceled > 0);

  const response = await fetch(`https://api.swell.store/orders/${args.orderId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ...(items.length > 0 ? { items } : {}),
      $notify: false,
      canceled: true,
      cancel_reason: args.reason,
      coupon_code: null,
      coupon_id: null,
      discounts: [],
      discount_total: 0,
      item_discount: 0,
      shipping: {
        ...(current.shipping || {}),
        price: 0,
      },
      shipment_total: 0,
      metadata: {
        cancel_reason: args.reason,
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Swell cancellation failed for ${args.orderId}: ${response.status} ${body}`);
  }

  return JSON.parse(body || '{}') as unknown;
}

async function updateLocalOrder(args: {
  sql: postgres.Sql;
  incident: IncidentOrder;
  reason: string;
  dryRun: boolean;
}) {
  if (args.dryRun || args.incident.targetLocalStatus === 'preserve') {
    return;
  }

  await args.sql.unsafe(
    `
      update checkout_orders
      set
        payment_status = $2,
        payment = jsonb_set(
          jsonb_set(payment, '{status}', to_jsonb($5::text), true),
          '{updatedAt}', to_jsonb($3::text), true
        ),
        fulfillment_status = null,
        latest_error = $4,
        updated_at = now()
      where order_id = $1
    `,
    [
      args.incident.orderId,
      args.incident.targetLocalStatus,
      new Date().toISOString(),
      args.reason,
      args.incident.targetLocalStatus,
    ],
  );
}

async function main() {
  loadEnvFile('.env.local');

  const dryRun = !process.argv.includes('--yes');
  const databaseUrl = requireEnv('DATABASE_URL');
  const storeId = requireEnv('SWELL_STORE_ID');
  const secretKey = requireEnv('SWELL_SECRET_KEY');
  const reason = 'Cancelled after payment was not completed within 60 minutes.';
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    prepare: false,
  });

  try {
    const results = [];

    for (const incident of INCIDENT_ORDERS) {
      try {
        const rows = await sql<CheckoutOrderRow[]>`
          select order_id, payment_status, payment, swell
          from checkout_orders
          where order_id = ${incident.orderId}
          limit 1
        `;
        const row = rows[0];

        if (!row) {
          results.push({ orderId: incident.orderId, status: 'missing_local_order' });
          continue;
        }

        if (row.swell?.orderId !== incident.expectedSwellOrderId) {
          results.push({
            orderId: incident.orderId,
            status: 'swell_order_mismatch',
            expected: incident.expectedSwellOrderId,
            actual: row.swell?.orderId,
          });
          continue;
        }

        if (hasPaymentEvidence(row)) {
          results.push({ orderId: incident.orderId, status: 'skipped_payment_evidence' });
          continue;
        }

        await cancelSwellOrder({
          storeId,
          secretKey,
          orderId: incident.expectedSwellOrderId,
          reason,
          dryRun,
        });
        await updateLocalOrder({ sql, incident, reason, dryRun });

        results.push({
          orderId: incident.orderId,
          swellOrderNumber: incident.swellOrderNumber,
          status: dryRun ? 'dry_run' : 'cancelled',
          localStatus:
            incident.targetLocalStatus === 'preserve'
              ? row.payment_status
              : incident.targetLocalStatus,
        });
      } catch (error) {
        results.push({
          orderId: incident.orderId,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(JSON.stringify({ dryRun, results }, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
