import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import type { CheckoutOrderPayment, CheckoutOrderProcessing, CheckoutOrderRecord } from '@/lib/checkout/types';
import { isReusableCheckoutOrder } from '@/lib/checkout/order-recovery';

type StoredCheckoutOrderPayment = CheckoutOrderPayment & {
  __processing?: CheckoutOrderProcessing;
};

function serializeCheckoutOrderPayment(order: CheckoutOrderRecord): StoredCheckoutOrderPayment {
  const payment = {
    ...order.payment,
  } as StoredCheckoutOrderPayment;

  if (order.processing) {
    payment.__processing = order.processing;
  } else {
    delete payment.__processing;
  }

  return payment;
}

function deserializeCheckoutOrderPayment(
  payment: StoredCheckoutOrderPayment | CheckoutOrderPayment
): {
  payment: CheckoutOrderPayment;
  processing?: CheckoutOrderProcessing;
} {
  const storedPayment = { ...(payment as StoredCheckoutOrderPayment) };
  const processing = storedPayment.__processing;
  delete storedPayment.__processing;

  return {
    payment: storedPayment as CheckoutOrderPayment,
    processing,
  };
}

function recordToRow(order: CheckoutOrderRecord) {
  const normalizedEmail =
    typeof order.shippingAddress.email === 'string'
      ? order.shippingAddress.email.trim().toLowerCase()
      : null;

  return {
    orderId: order.orderId,
    accessKey: order.accessKey,
    cartId: order.cartId,
    userId: order.userId ?? null,
    email: normalizedEmail,
    paymentStatus: order.payment.status?.toLowerCase() || null,
    currencyCode: order.currencyCode,
    shippingAddress: order.shippingAddress,
    shippingService: order.shippingService ?? null,
    lines: order.lines,
    totals: order.totals,
    payment: serializeCheckoutOrderPayment(order),
    swell: order.swell,
    shipengine: order.shipengine ?? null,
    affiliate: order.affiliate ?? null,
    promoter: order.promoter ?? null,
    ipnEvents: order.ipnEvents ?? null,
    latestError: order.latestError ?? null,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  };
}

function rowToRecord(row: typeof checkoutOrders.$inferSelect): CheckoutOrderRecord {
  const { payment, processing } = deserializeCheckoutOrderPayment(
    row.payment as StoredCheckoutOrderPayment
  );

  return {
    orderId: row.orderId,
    accessKey: row.accessKey,
    cartId: row.cartId || '',
    userId: row.userId ?? null,
    currencyCode: row.currencyCode,
    shippingAddress: row.shippingAddress as CheckoutOrderRecord['shippingAddress'],
    shippingService: (row.shippingService as CheckoutOrderRecord['shippingService']) ?? undefined,
    lines: row.lines as CheckoutOrderRecord['lines'],
    totals: row.totals as CheckoutOrderRecord['totals'],
    payment,
    swell: row.swell as CheckoutOrderRecord['swell'],
    shipengine: (row.shipengine as CheckoutOrderRecord['shipengine']) ?? undefined,
    affiliate: (row.affiliate as CheckoutOrderRecord['affiliate']) ?? undefined,
    promoter: (row.promoter as CheckoutOrderRecord['promoter']) ?? undefined,
    processing,
    ipnEvents: (row.ipnEvents as CheckoutOrderRecord['ipnEvents']) ?? undefined,
    latestError: row.latestError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function stripOrderForEquality(order: CheckoutOrderRecord) {
  return JSON.stringify({
    orderId: order.orderId,
    accessKey: order.accessKey,
    cartId: order.cartId,
    userId: order.userId ?? null,
    currencyCode: order.currencyCode,
    shippingAddress: order.shippingAddress,
    shippingService: order.shippingService ?? null,
    lines: order.lines,
    totals: order.totals,
    payment: serializeCheckoutOrderPayment(order),
    swell: order.swell,
    shipengine: order.shipengine ?? null,
    affiliate: order.affiliate ?? null,
    promoter: order.promoter ?? null,
    processing: order.processing ?? null,
    ipnEvents: order.ipnEvents ?? null,
    latestError: order.latestError ?? null,
    createdAt: order.createdAt,
  });
}

export async function getCheckoutOrder(orderId: string): Promise<CheckoutOrderRecord | null> {
  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.orderId, orderId))
    .limit(1);

  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function saveCheckoutOrder(order: CheckoutOrderRecord): Promise<CheckoutOrderRecord> {
  const row = recordToRow(order);

  const [result] = await db
    .insert(checkoutOrders)
    .values(row)
    .onConflictDoUpdate({
      target: checkoutOrders.orderId,
      set: {
        accessKey: row.accessKey,
        cartId: row.cartId,
        userId: row.userId,
        email: row.email,
        paymentStatus: row.paymentStatus,
        currencyCode: row.currencyCode,
        shippingAddress: row.shippingAddress,
        shippingService: row.shippingService,
        lines: row.lines,
        totals: row.totals,
        payment: row.payment,
        swell: row.swell,
        shipengine: row.shipengine,
        affiliate: row.affiliate,
        promoter: row.promoter,
        ipnEvents: row.ipnEvents,
        latestError: row.latestError,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rowToRecord(result!);
}

const MAX_OPTIMISTIC_RETRIES = 3;

export async function updateCheckoutOrder(
  orderId: string,
  updater: (current: CheckoutOrderRecord) => CheckoutOrderRecord
): Promise<CheckoutOrderRecord | null> {
  for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt++) {
    const current = await getCheckoutOrder(orderId);
    if (!current) return null;

    const next = updater(current);
    if (stripOrderForEquality(current) === stripOrderForEquality(next)) {
      return current;
    }

    const now = new Date();
    next.updatedAt = now.toISOString();
    const row = recordToRow(next);

    // Optimistic lock: only update if updatedAt hasn't changed since we read
    const rows = await db
      .update(checkoutOrders)
      .set({
        accessKey: row.accessKey,
        cartId: row.cartId,
        userId: row.userId,
        email: row.email,
        paymentStatus: row.paymentStatus,
        currencyCode: row.currencyCode,
        shippingAddress: row.shippingAddress,
        shippingService: row.shippingService,
        lines: row.lines,
        totals: row.totals,
        payment: row.payment,
        swell: row.swell,
        shipengine: row.shipengine,
        affiliate: row.affiliate,
        promoter: row.promoter,
        ipnEvents: row.ipnEvents,
        latestError: row.latestError,
        updatedAt: now,
      })
      .where(
        and(
          eq(checkoutOrders.orderId, orderId),
          eq(checkoutOrders.updatedAt, new Date(current.updatedAt))
        )
      )
      .returning();

    if (rows.length > 0) {
      return rowToRecord(rows[0]!);
    }

    // Row was modified concurrently — retry with fresh data
    console.warn(`[updateCheckoutOrder] Optimistic lock conflict for ${orderId}, retrying (${attempt + 1}/${MAX_OPTIMISTIC_RETRIES})`);
  }

  // All retries exhausted — fall back to a forced save to avoid data loss
  console.error(`[updateCheckoutOrder] Optimistic lock retries exhausted for ${orderId}, performing forced update`);
  const current = await getCheckoutOrder(orderId);
  if (!current) return null;

  const next = updater(current);
  next.updatedAt = new Date().toISOString();
  return saveCheckoutOrder(next);
}

export async function findCheckoutOrderByCartId(cartId: string): Promise<CheckoutOrderRecord | null> {
  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.cartId, cartId))
    .orderBy(desc(checkoutOrders.updatedAt));

  const reusableOrder = rows
    .map(rowToRecord)
    .find(order => isReusableCheckoutOrder(order));

  return reusableOrder || null;
}

export async function findCheckoutOrderByPaymentId(paymentId: string): Promise<CheckoutOrderRecord | null> {
  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(sql`${checkoutOrders.payment}->>'paymentId' = ${paymentId}`)
    .limit(1);

  return rows[0] ? rowToRecord(rows[0]) : null;
}
