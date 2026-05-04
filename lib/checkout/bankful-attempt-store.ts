import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankfulPaymentAttempts } from '@/lib/db/schema';
import type {
  CheckoutOrderLine,
  CheckoutOrderRecord,
  CheckoutOrderTotals,
  CheckoutShippingAddress,
  CheckoutShippingService,
} from '@/lib/checkout/types';

export type BankfulAttemptStatus =
  | 'created'
  | 'capture_pending'
  | 'capture_unknown'
  | 'paid'
  | 'pending'
  | 'declined'
  | 'failed'
  | 'paid_order_creation_failed'
  | 'order_created';

export type BankfulAttemptBankfulSnapshot = {
  requestAction?: string | null;
  statusName?: string | null;
  value?: string | null;
  requestId?: string | null;
  recordId?: string | null;
  orderId?: string | null;
  xtlOrderId?: string | null;
  currency?: string | null;
  timestamp?: string | null;
  apiAdvice?: string | null;
  serviceAdvice?: string | null;
  processorAdvice?: string | null;
  errorMessage?: string | null;
};

export type BankfulAttemptSwellSnapshot = {
  accountId?: string | null;
  cartId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  paymentId?: string | null;
};

export type BankfulPaymentAttemptRecord = {
  attemptId: string;
  checkoutSessionId: string;
  checkoutSessionVersion: number;
  cartId?: string | null;
  orderId?: string | null;
  email?: string | null;
  status: BankfulAttemptStatus;
  amount: string;
  currencyCode: string;
  customer: Record<string, unknown>;
  shippingAddress: CheckoutShippingAddress;
  shippingService?: CheckoutShippingService | null;
  lines: CheckoutOrderLine[];
  totals: CheckoutOrderTotals;
  swell?: BankfulAttemptSwellSnapshot | null;
  bankful?: BankfulAttemptBankfulSnapshot | null;
  latestError?: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToAttempt(
  row: typeof bankfulPaymentAttempts.$inferSelect,
): BankfulPaymentAttemptRecord {
  return {
    attemptId: row.attemptId,
    checkoutSessionId: row.checkoutSessionId,
    checkoutSessionVersion: row.checkoutSessionVersion,
    cartId: row.cartId,
    orderId: row.orderId,
    email: row.email,
    status: row.status as BankfulAttemptStatus,
    amount: row.amount,
    currencyCode: row.currencyCode,
    customer: row.customer as Record<string, unknown>,
    shippingAddress: row.shippingAddress as CheckoutShippingAddress,
    shippingService: (row.shippingService as CheckoutShippingService | null) ?? null,
    lines: row.lines as CheckoutOrderLine[],
    totals: row.totals as CheckoutOrderTotals,
    swell: (row.swell as BankfulAttemptSwellSnapshot | null) ?? null,
    bankful: (row.bankful as BankfulAttemptBankfulSnapshot | null) ?? null,
    latestError: row.latestError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createBankfulPaymentAttempt(args: {
  attemptId: string;
  checkoutSessionId: string;
  checkoutSessionVersion: number;
  cartId?: string | null;
  email?: string | null;
  amount: string;
  currencyCode: string;
  customer: Record<string, unknown>;
  shippingAddress: CheckoutShippingAddress;
  shippingService?: CheckoutShippingService | null;
  lines: CheckoutOrderLine[];
  totals: CheckoutOrderTotals;
  swell?: BankfulAttemptSwellSnapshot | null;
}) {
  const now = new Date();
  const values = {
    attemptId: args.attemptId,
    checkoutSessionId: args.checkoutSessionId,
    checkoutSessionVersion: args.checkoutSessionVersion,
    cartId: args.cartId ?? null,
    email: args.email?.trim().toLowerCase() || null,
    status: 'created',
    amount: args.amount,
    currencyCode: args.currencyCode,
    customer: args.customer,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService ?? null,
    lines: args.lines,
    totals: args.totals,
    swell: args.swell ?? null,
    bankful: null,
    latestError: null,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof bankfulPaymentAttempts.$inferInsert;

  const [created] = await db
    .insert(bankfulPaymentAttempts)
    .values(values)
    .onConflictDoNothing({
      target: [
        bankfulPaymentAttempts.checkoutSessionId,
        bankfulPaymentAttempts.checkoutSessionVersion,
      ],
    })
    .returning();

  if (created) {
    return rowToAttempt(created);
  }

  const existing = await findBankfulPaymentAttemptBySessionVersion({
    checkoutSessionId: args.checkoutSessionId,
    checkoutSessionVersion: args.checkoutSessionVersion,
  });

  if (!existing) {
    throw new Error('Unable to create Bankful payment attempt.');
  }

  return existing;
}

export async function findBankfulPaymentAttemptBySessionVersion(args: {
  checkoutSessionId: string;
  checkoutSessionVersion: number;
}) {
  const rows = await db
    .select()
    .from(bankfulPaymentAttempts)
    .where(
      and(
        eq(bankfulPaymentAttempts.checkoutSessionId, args.checkoutSessionId),
        eq(
          bankfulPaymentAttempts.checkoutSessionVersion,
          args.checkoutSessionVersion,
        ),
      ),
    )
    .limit(1);

  return rows[0] ? rowToAttempt(rows[0]) : null;
}

export async function getBankfulPaymentAttempt(attemptId: string) {
  const rows = await db
    .select()
    .from(bankfulPaymentAttempts)
    .where(eq(bankfulPaymentAttempts.attemptId, attemptId))
    .limit(1);

  return rows[0] ? rowToAttempt(rows[0]) : null;
}

export async function updateBankfulPaymentAttempt(
  attemptId: string,
  changes: {
    status?: BankfulAttemptStatus;
    orderId?: string | null;
    swell?: BankfulAttemptSwellSnapshot | null;
    bankful?: BankfulAttemptBankfulSnapshot | null;
    latestError?: string | null;
  },
) {
  const [updated] = await db
    .update(bankfulPaymentAttempts)
    .set({
      ...changes,
      updatedAt: new Date(),
    })
    .where(eq(bankfulPaymentAttempts.attemptId, attemptId))
    .returning();

  return updated ? rowToAttempt(updated) : null;
}

export async function claimBankfulPaymentAttemptCapture(attemptId: string) {
  const [updated] = await db
    .update(bankfulPaymentAttempts)
    .set({
      status: 'capture_pending',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankfulPaymentAttempts.attemptId, attemptId),
        eq(bankfulPaymentAttempts.status, 'created'),
      ),
    )
    .returning();

  return updated ? rowToAttempt(updated) : null;
}

export async function listReviewableBankfulAttempts(args: {
  limit?: number;
} = {}) {
  const rows = await db
    .select()
    .from(bankfulPaymentAttempts)
    .where(
      sql`${bankfulPaymentAttempts.status} in ('paid', 'pending', 'capture_pending', 'capture_unknown', 'paid_order_creation_failed')`,
    )
    .orderBy(desc(bankfulPaymentAttempts.updatedAt))
    .limit(args.limit ?? 100);

  return rows.map(rowToAttempt);
}

export function buildBankfulAttemptFromOrder(order: CheckoutOrderRecord) {
  return {
    attemptId: order.payment.provider === 'bankful'
      ? order.payment.attemptId
      : order.orderId,
    checkoutSessionId: '',
    checkoutSessionVersion: 0,
    cartId: order.cartId,
    orderId: order.orderId,
    email: order.shippingAddress.email,
    status: order.payment.status as BankfulAttemptStatus,
    amount: order.totals.totalAmount.amount,
    currencyCode: order.currencyCode,
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
    bankful: order.payment.provider === 'bankful'
      ? {
          requestAction: order.payment.requestAction,
          statusName: order.payment.bankfulStatus,
          value: order.payment.transactionValue,
          requestId: order.payment.transactionRequestId,
          recordId: order.payment.transactionRecordId,
          orderId: order.payment.transactionOrderId,
          xtlOrderId: order.payment.xtlOrderId,
          currency: order.payment.transactionCurrency,
          timestamp: order.payment.bankfulTimestamp,
          apiAdvice: order.payment.apiAdvice,
          serviceAdvice: order.payment.serviceAdvice,
          processorAdvice: order.payment.processorAdvice,
          errorMessage: order.payment.errorMessage,
        }
      : null,
    latestError: order.latestError,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  } satisfies BankfulPaymentAttemptRecord;
}
