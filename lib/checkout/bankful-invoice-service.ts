import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankfulPaymentAttempts, checkoutOrders } from '@/lib/db/schema';
import {
  buildBankfulAttemptFromOrder,
  type BankfulPaymentAttemptRecord,
} from '@/lib/checkout/bankful-attempt-store';
import {
  isBankfulPayment,
  isSquarePayment,
  type CheckoutOrderPayment,
  type CheckoutOrderRecord,
  type SquarePaymentData,
} from '@/lib/checkout/types';

export type AdminSquareInvoiceSnapshot = Pick<
  SquarePaymentData,
  | 'paymentLinkId'
  | 'squareOrderId'
  | 'checkoutUrl'
  | 'longUrl'
  | 'locationId'
  | 'expectedAmount'
  | 'expectedCurrency'
  | 'paymentId'
  | 'squareStatus'
  | 'receiptUrl'
  | 'buyerEmail'
  | 'amountMoney'
  | 'totalMoney'
  | 'createdAt'
  | 'updatedAt'
  | 'paidAt'
  | 'deletedAt'
  | 'deletionError'
  | 'swellPaymentId'
>;

export type AdminPaymentInvoice = Omit<
  BankfulPaymentAttemptRecord,
  'bankful' | 'status'
> & {
  provider: 'bankful' | 'square';
  source: 'order' | 'attempt';
  invoiceId: string;
  status: string;
  orderNumber?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  bankful?: BankfulPaymentAttemptRecord['bankful'] | null;
  square?: AdminSquareInvoiceSnapshot | null;
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
  invoice: AdminPaymentInvoice,
  status: NonNullable<ListBankfulInvoicesArgs['status']>,
) {
  if (status === 'all') return true;
  const normalizedStatus = invoice.status.toLowerCase();

  if (status === 'paid') {
    return ['paid', 'finished', 'order_created'].includes(normalizedStatus);
  }
  if (status === 'pending') return normalizedStatus === 'pending';
  if (status === 'failed') {
    return ['failed', 'declined', 'cancelled', 'expired', 'replaced'].includes(normalizedStatus);
  }
  return (
    normalizedStatus === 'paid' ||
    normalizedStatus === 'pending' ||
    normalizedStatus === 'capture_pending' ||
    normalizedStatus === 'capture_unknown' ||
    normalizedStatus === 'paid_order_creation_failed' ||
    normalizedStatus === 'review_required' ||
    Boolean(invoice.latestError) ||
    Boolean(invoice.square?.deletionError)
  );
}

function buildSquareInvoiceFromOrder(order: CheckoutOrderRecord, row: typeof checkoutOrders.$inferSelect): AdminPaymentInvoice | null {
  if (!isSquarePayment(order.payment)) {
    return null;
  }

  return {
    provider: 'square',
    source: 'order',
    invoiceId: order.orderId,
    attemptId: order.payment.paymentLinkId,
    checkoutSessionId: '',
    checkoutSessionVersion: 0,
    cartId: order.cartId,
    orderId: order.orderId,
    orderNumber: order.swell.orderNumber ?? null,
    email: order.shippingAddress.email,
    status: order.payment.status,
    amount: order.payment.expectedAmount,
    currencyCode: order.payment.expectedCurrency,
    customer: {
      firstName: order.shippingAddress.firstName,
      lastName: order.shippingAddress.lastName,
      email: order.shippingAddress.email,
      phone: order.shippingAddress.phone,
    },
    shippingAddress: order.shippingAddress,
    shippingService: order.shippingService ?? null,
    lines: order.lines,
    totals: order.totals,
    swell: {
      accountId: order.swell.accountId,
      cartId: order.swell.cartId,
      orderId: order.swell.orderId,
      orderNumber: order.swell.orderNumber,
      paymentId: order.payment.swellPaymentId,
    },
    bankful: null,
    square: {
      paymentLinkId: order.payment.paymentLinkId,
      squareOrderId: order.payment.squareOrderId,
      checkoutUrl: order.payment.checkoutUrl,
      longUrl: order.payment.longUrl ?? null,
      locationId: order.payment.locationId ?? null,
      expectedAmount: order.payment.expectedAmount,
      expectedCurrency: order.payment.expectedCurrency,
      paymentId: order.payment.paymentId ?? null,
      squareStatus: order.payment.squareStatus ?? null,
      receiptUrl: order.payment.receiptUrl ?? null,
      buyerEmail: order.payment.buyerEmail ?? null,
      amountMoney: order.payment.amountMoney ?? null,
      totalMoney: order.payment.totalMoney ?? null,
      createdAt: order.payment.createdAt,
      updatedAt: order.payment.updatedAt,
      paidAt: order.payment.paidAt ?? null,
      deletedAt: order.payment.deletedAt ?? null,
      deletionError: order.payment.deletionError ?? null,
      swellPaymentId: order.payment.swellPaymentId,
    },
    latestError: order.latestError || order.payment.deletionError || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paymentStatus: row.paymentStatus,
    fulfillmentStatus: row.fulfillmentStatus ?? null,
  };
}

export async function listAdminBankfulInvoices(args: ListBankfulInvoicesArgs = {}) {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(Math.max(1, args.pageSize ?? 100), 200);
  const status = args.status ?? 'all';

  const [orderRows, attemptRows] = await Promise.all([
    db
      .select()
      .from(checkoutOrders)
      .where(sql`${checkoutOrders.payment}->>'provider' in ('bankful', 'square')`)
      .orderBy(desc(checkoutOrders.updatedAt))
      .limit(300),
    db
      .select()
      .from(bankfulPaymentAttempts)
      .where(sql`${bankfulPaymentAttempts.status} <> 'order_created'`)
      .orderBy(desc(bankfulPaymentAttempts.updatedAt))
      .limit(300),
  ]);

  const orderInvoices: AdminPaymentInvoice[] = orderRows
    .map((row) => {
      const order = rowToOrderRecord(row);
      if (isBankfulPayment(order.payment)) {
        const attempt = buildBankfulAttemptFromOrder(order);
        return {
          ...attempt,
          provider: 'bankful' as const,
          source: 'order' as const,
          invoiceId: order.orderId,
          orderNumber: order.swell.orderNumber ?? null,
          paymentStatus: row.paymentStatus,
          fulfillmentStatus: row.fulfillmentStatus ?? null,
          square: null,
        };
      }

      return buildSquareInvoiceFromOrder(order, row);
    })
    .filter((invoice): invoice is AdminPaymentInvoice => Boolean(invoice));

  const orderAttemptIds = new Set(orderInvoices.map((invoice) => invoice.attemptId));
  const attemptInvoices: AdminPaymentInvoice[] = attemptRows
    .filter((row) => !orderAttemptIds.has(row.attemptId))
    .map((row) => ({
      provider: 'bankful',
      attemptId: row.attemptId,
      invoiceId: row.attemptId,
      checkoutSessionId: row.checkoutSessionId,
      checkoutSessionVersion: row.checkoutSessionVersion,
      cartId: row.cartId,
      orderId: row.orderId,
      email: row.email,
      status: row.status,
      amount: row.amount,
      currencyCode: row.currencyCode,
      customer: row.customer as AdminPaymentInvoice['customer'],
      shippingAddress: row.shippingAddress as AdminPaymentInvoice['shippingAddress'],
      shippingService: (row.shippingService as AdminPaymentInvoice['shippingService']) ?? null,
      lines: row.lines as AdminPaymentInvoice['lines'],
      totals: row.totals as AdminPaymentInvoice['totals'],
      swell: (row.swell as AdminPaymentInvoice['swell']) ?? null,
      bankful: (row.bankful as AdminPaymentInvoice['bankful']) ?? null,
      square: null,
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
      provider: 'bankful' as const,
      source: 'order' as const,
      invoiceId: order.orderId,
      orderNumber: order.swell.orderNumber ?? null,
      paymentStatus: orderRows[0].paymentStatus,
      fulfillmentStatus: orderRows[0].fulfillmentStatus ?? null,
      square: null,
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
    provider: 'bankful' as const,
    attemptId: row.attemptId,
    invoiceId: row.attemptId,
    checkoutSessionId: row.checkoutSessionId,
    checkoutSessionVersion: row.checkoutSessionVersion,
    cartId: row.cartId,
    orderId: row.orderId,
    email: row.email,
    status: row.status,
    amount: row.amount,
    currencyCode: row.currencyCode,
    customer: row.customer as AdminPaymentInvoice['customer'],
    shippingAddress: row.shippingAddress as AdminPaymentInvoice['shippingAddress'],
    shippingService: (row.shippingService as AdminPaymentInvoice['shippingService']) ?? null,
    lines: row.lines as AdminPaymentInvoice['lines'],
    totals: row.totals as AdminPaymentInvoice['totals'],
    swell: (row.swell as AdminPaymentInvoice['swell']) ?? null,
    bankful: (row.bankful as AdminPaymentInvoice['bankful']) ?? null,
    square: null,
    latestError: row.latestError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    source: 'attempt' as const,
    orderNumber: null,
    paymentStatus: row.status,
    fulfillmentStatus: null,
  };
}
