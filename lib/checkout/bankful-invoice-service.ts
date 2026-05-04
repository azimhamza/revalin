import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankfulPaymentAttempts, checkoutOrders } from '@/lib/db/schema';
import {
  buildBankfulAttemptFromOrder,
  type BankfulPaymentAttemptRecord,
} from '@/lib/checkout/bankful-attempt-store';
import type { CheckoutOrderPayment, CheckoutOrderRecord } from '@/lib/checkout/types';

export type AdminBankfulInvoice = BankfulPaymentAttemptRecord & {
  source: 'order' | 'attempt';
  orderNumber?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
};

type ListBankfulInvoicesArgs = {
  page?: number;
  pageSize?: number;
  status?: 'all' | 'paid' | 'pending' | 'failed' | 'review';
};

function rowToOrderRecord(row: typeof checkoutOrders.$inferSelect): CheckoutOrderRecord {
  const storedPayment = { ...(row.payment as CheckoutOrderPayment & { __processing?: unknown }) };
  const processing = storedPayment.__processing as CheckoutOrderRecord['processing'];
  delete storedPayment.__processing;

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
    payment: storedPayment as CheckoutOrderPayment,
    swell: row.swell as CheckoutOrderRecord['swell'],
    shipengine: (row.shipengine as CheckoutOrderRecord['shipengine']) ?? undefined,
    affiliate: (row.affiliate as CheckoutOrderRecord['affiliate']) ?? undefined,
    promoter: (row.promoter as CheckoutOrderRecord['promoter']) ?? undefined,
    processing,
    fulfillmentStatus: (row.fulfillmentStatus as CheckoutOrderRecord['fulfillmentStatus']) ?? null,
    ipnEvents: (row.ipnEvents as CheckoutOrderRecord['ipnEvents']) ?? undefined,
    latestError: row.latestError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function attemptMatchesStatus(
  invoice: AdminBankfulInvoice,
  status: NonNullable<ListBankfulInvoicesArgs['status']>,
) {
  if (status === 'all') return true;
  if (status === 'paid') return invoice.status === 'paid' || invoice.status === 'order_created';
  if (status === 'pending') return invoice.status === 'pending';
  if (status === 'failed') return invoice.status === 'failed' || invoice.status === 'declined';
  return (
    invoice.status === 'paid' ||
    invoice.status === 'pending' ||
    invoice.status === 'capture_pending' ||
    invoice.status === 'capture_unknown' ||
    invoice.status === 'paid_order_creation_failed'
  );
}

export async function listAdminBankfulInvoices(args: ListBankfulInvoicesArgs = {}) {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(Math.max(1, args.pageSize ?? 100), 200);
  const status = args.status ?? 'all';

  const [orderRows, attemptRows] = await Promise.all([
    db
      .select()
      .from(checkoutOrders)
      .where(sql`${checkoutOrders.payment}->>'provider' = 'bankful'`)
      .orderBy(desc(checkoutOrders.updatedAt))
      .limit(300),
    db
      .select()
      .from(bankfulPaymentAttempts)
      .where(sql`${bankfulPaymentAttempts.status} <> 'order_created'`)
      .orderBy(desc(bankfulPaymentAttempts.updatedAt))
      .limit(300),
  ]);

  const orderInvoices: AdminBankfulInvoice[] = orderRows.map((row) => {
    const order = rowToOrderRecord(row);
    const attempt = buildBankfulAttemptFromOrder(order);
    return {
      ...attempt,
      source: 'order',
      orderNumber: order.swell.orderNumber ?? null,
      paymentStatus: row.paymentStatus,
      fulfillmentStatus: row.fulfillmentStatus ?? null,
    };
  });

  const orderAttemptIds = new Set(orderInvoices.map((invoice) => invoice.attemptId));
  const attemptInvoices: AdminBankfulInvoice[] = attemptRows
    .filter((row) => !orderAttemptIds.has(row.attemptId))
    .map((row) => ({
      attemptId: row.attemptId,
      checkoutSessionId: row.checkoutSessionId,
      checkoutSessionVersion: row.checkoutSessionVersion,
      cartId: row.cartId,
      orderId: row.orderId,
      email: row.email,
      status: row.status as AdminBankfulInvoice['status'],
      amount: row.amount,
      currencyCode: row.currencyCode,
      customer: row.customer as AdminBankfulInvoice['customer'],
      shippingAddress: row.shippingAddress as AdminBankfulInvoice['shippingAddress'],
      shippingService: (row.shippingService as AdminBankfulInvoice['shippingService']) ?? null,
      lines: row.lines as AdminBankfulInvoice['lines'],
      totals: row.totals as AdminBankfulInvoice['totals'],
      swell: (row.swell as AdminBankfulInvoice['swell']) ?? null,
      bankful: (row.bankful as AdminBankfulInvoice['bankful']) ?? null,
      latestError: row.latestError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      source: 'attempt',
      orderNumber: null,
      paymentStatus: row.status,
      fulfillmentStatus: null,
    }));

  const combined = [...orderInvoices, ...attemptInvoices]
    .filter((invoice) => attemptMatchesStatus(invoice, status))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const start = (page - 1) * pageSize;

  return {
    data: combined.slice(start, start + pageSize),
    total: combined.length,
    page,
    pageSize,
  };
}

export async function getAdminBankfulInvoiceByAttempt(attemptId: string) {
  const orderRows = await db
    .select()
    .from(checkoutOrders)
    .where(sql`${checkoutOrders.payment}->>'provider' = 'bankful' and ${checkoutOrders.payment}->>'attemptId' = ${attemptId}`)
    .limit(1);

  if (orderRows[0]) {
    const order = rowToOrderRecord(orderRows[0]);
    const attempt = buildBankfulAttemptFromOrder(order);
    return {
      ...attempt,
      source: 'order' as const,
      orderNumber: order.swell.orderNumber ?? null,
      paymentStatus: orderRows[0].paymentStatus,
      fulfillmentStatus: orderRows[0].fulfillmentStatus ?? null,
    };
  }

  const rows = await db
    .select()
    .from(bankfulPaymentAttempts)
    .where(eq(bankfulPaymentAttempts.attemptId, attemptId))
    .limit(1);

  if (!rows[0]) return null;

  const row = rows[0];
  return {
    attemptId: row.attemptId,
    checkoutSessionId: row.checkoutSessionId,
    checkoutSessionVersion: row.checkoutSessionVersion,
    cartId: row.cartId,
    orderId: row.orderId,
    email: row.email,
    status: row.status as AdminBankfulInvoice['status'],
    amount: row.amount,
    currencyCode: row.currencyCode,
    customer: row.customer as AdminBankfulInvoice['customer'],
    shippingAddress: row.shippingAddress as AdminBankfulInvoice['shippingAddress'],
    shippingService: (row.shippingService as AdminBankfulInvoice['shippingService']) ?? null,
    lines: row.lines as AdminBankfulInvoice['lines'],
    totals: row.totals as AdminBankfulInvoice['totals'],
    swell: (row.swell as AdminBankfulInvoice['swell']) ?? null,
    bankful: (row.bankful as AdminBankfulInvoice['bankful']) ?? null,
    latestError: row.latestError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    source: 'attempt' as const,
    orderNumber: null,
    paymentStatus: row.status,
    fulfillmentStatus: null,
  };
}
