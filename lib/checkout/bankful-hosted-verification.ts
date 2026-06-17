import { isTerminalPaymentStatus } from '@/lib/checkout/constants';
import {
  findCheckoutOrderByBankfulPayment,
  updateCheckoutOrder,
} from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import {
  bankfulResponseSnapshot,
  mapBankfulStatus,
  parseBankfulTransactionResponse,
  type BankfulTransactionResponse,
} from '@/lib/checkout/bankful';
import { updateBankfulPaymentAttempt } from '@/lib/checkout/bankful-attempt-store';
import {
  isBankfulPayment,
  type CheckoutIpnEvent,
  type CheckoutOrderRecord,
} from '@/lib/checkout/types';

type BankfulHostedVerificationSource = 'bankful_callback' | 'bankful_return';

const BANKFUL_INACTIVE_STATUSES = new Set([
  'cancelled',
  'replaced',
  'failed',
  'expired',
  'refunded',
]);

function normalizeStatus(status?: string | null) {
  return status?.trim().toLowerCase() || '';
}

function firstField(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return null;
}

function amountCents(value?: string | number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : null;
}

function getExpectedAmountCents(order: CheckoutOrderRecord) {
  if (!isBankfulPayment(order.payment)) return null;
  return amountCents(
    order.payment.expectedAmount ||
      order.payment.attemptAmount ||
      order.totals.totalAmount.amount,
  );
}

function getExpectedCurrency(order: CheckoutOrderRecord) {
  if (!isBankfulPayment(order.payment)) return '';
  return (
    order.payment.expectedCurrency ||
    order.payment.transactionCurrency ||
    order.currencyCode
  ).trim().toUpperCase();
}

function buildBankfulPaymentPatch(args: {
  current: CheckoutOrderRecord;
  payment: BankfulTransactionResponse;
  targetStatus: string;
}) {
  if (!isBankfulPayment(args.current.payment)) {
    return args.current.payment;
  }

  const terminalFailure =
    args.targetStatus === 'declined' ||
    args.targetStatus === 'failed' ||
    args.targetStatus === 'cancelled';
  const paidAt =
    args.targetStatus === 'paid'
      ? args.payment.timestamp || new Date().toISOString()
      : args.current.payment.paidAt ?? null;

  return {
    ...args.current.payment,
    status: args.targetStatus,
    bankfulStatus: args.payment.statusName || args.current.payment.bankfulStatus || null,
    requestAction: args.payment.requestAction ?? args.current.payment.requestAction ?? null,
    transactionValue: args.payment.value ?? args.current.payment.transactionValue ?? null,
    transactionRequestId: args.payment.requestId ?? args.current.payment.transactionRequestId ?? null,
    transactionRecordId: args.payment.recordId ?? args.current.payment.transactionRecordId ?? null,
    transactionOrderId: args.payment.orderId ?? args.current.payment.transactionOrderId ?? null,
    xtlOrderId: args.payment.xtlOrderId ?? args.current.payment.xtlOrderId ?? null,
    transactionCurrency: args.payment.currency ?? args.current.payment.transactionCurrency ?? null,
    bankfulTimestamp: args.payment.timestamp ?? args.current.payment.bankfulTimestamp ?? null,
    apiAdvice: args.payment.apiAdvice ?? args.current.payment.apiAdvice ?? null,
    serviceAdvice: args.payment.serviceAdvice ?? args.current.payment.serviceAdvice ?? null,
    processorAdvice: args.payment.processorAdvice ?? args.current.payment.processorAdvice ?? null,
    errorMessage: args.payment.errorMessage ?? args.current.payment.errorMessage ?? null,
    redirectUrl: terminalFailure ? null : args.current.payment.redirectUrl ?? null,
    paidAt,
    capturedAt: args.targetStatus === 'paid' ? paidAt : args.current.payment.capturedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
}

async function markBankfulPaymentReviewRequired(args: {
  order: CheckoutOrderRecord;
  payment: BankfulTransactionResponse;
  reason: string;
  ipnEvent?: CheckoutIpnEvent;
}) {
  if (!isBankfulPayment(args.order.payment)) {
    return args.order;
  }

  const updated = await updateCheckoutOrder(args.order.orderId, current => {
    if (!isBankfulPayment(current.payment)) return current;
    if (isTerminalPaymentStatus(current.payment.status)) {
      return {
        ...current,
        ipnEvents: args.ipnEvent
          ? [...(current.ipnEvents || []), args.ipnEvent]
        : current.ipnEvents,
      };
    }
    const paymentPatch = buildBankfulPaymentPatch({
      current,
      payment: args.payment,
      targetStatus: 'review_required',
    });
    if (!isBankfulPayment(paymentPatch)) return current;

    return {
      ...current,
      payment: {
        ...paymentPatch,
        status: 'review_required',
        redirectUrl: null,
      },
      latestError: args.reason,
      ipnEvents: args.ipnEvent
        ? [...(current.ipnEvents || []), args.ipnEvent]
        : current.ipnEvents,
    };
  });

  await updateBankfulPaymentAttempt(args.order.payment.attemptId, {
    status: 'review_required',
    bankful: bankfulResponseSnapshot(args.payment),
    latestError: args.reason,
  }).catch((error) => {
    console.error('Unable to mark Bankful attempt review_required:', error);
  });

  return updated || args.order;
}

function bankfulAttemptStatus(status: string) {
  if (status === 'paid') return 'paid';
  if (status === 'pending') return 'pending';
  if (status === 'declined') return 'declined';
  return 'failed';
}

export async function applyBankfulHostedPaymentResult(args: {
  record: Record<string, string>;
  source: BankfulHostedVerificationSource;
  ipnEvent?: CheckoutIpnEvent;
}) {
  const payment = parseBankfulTransactionResponse(args.record);
  const attemptId =
    payment.xtlOrderId ||
    firstField(args.record, ['xtl_order_id', 'XTL_ORDER_ID']);
  const matchedOrder = await findCheckoutOrderByBankfulPayment({
    attemptId,
    transactionRecordId: payment.recordId,
    transactionOrderId: payment.orderId,
  });

  if (!matchedOrder || !isBankfulPayment(matchedOrder.payment)) {
    return {
      matched: false,
      order: matchedOrder,
      targetStatus: 'ignored',
      reviewRequired: false,
    };
  }

  const targetStatus = mapBankfulStatus(payment.statusName);
  const currentStatus = normalizeStatus(matchedOrder.payment.status);
  const currentPaymentAlreadySuccessful =
    currentStatus === 'paid' || currentStatus === 'finished' || Boolean(matchedOrder.payment.swellPaymentId);

  if (
    currentPaymentAlreadySuccessful &&
    targetStatus !== 'paid'
  ) {
    const auditedOrder = await updateCheckoutOrder(matchedOrder.orderId, current => {
      if (!isBankfulPayment(current.payment)) return current;
      return {
        ...current,
        ipnEvents: args.ipnEvent
          ? [...(current.ipnEvents || []), args.ipnEvent]
          : current.ipnEvents,
      };
    });

    return {
      matched: true,
      order: auditedOrder || matchedOrder,
      targetStatus,
      reviewRequired: false,
    };
  }

  if (
    targetStatus === 'paid' &&
    BANKFUL_INACTIVE_STATUSES.has(currentStatus)
  ) {
    const order = await markBankfulPaymentReviewRequired({
      order: matchedOrder,
      payment,
      reason: 'Bankful payment completed for a checkout that was already released, replaced, or cancelled.',
      ipnEvent: args.ipnEvent,
    });

    return {
      matched: true,
      order,
      targetStatus,
      reviewRequired: true,
    };
  }

  const amountMatches =
    !payment.value ||
    amountCents(payment.value) === getExpectedAmountCents(matchedOrder);
  const currencyMatches =
    !payment.currency ||
    payment.currency.trim().toUpperCase() === getExpectedCurrency(matchedOrder);
  const attemptMatches =
    !payment.xtlOrderId ||
    payment.xtlOrderId === matchedOrder.payment.attemptId;

  if (!amountMatches || !currencyMatches || !attemptMatches) {
    const reason = !attemptMatches
      ? 'Bankful hosted response order reference did not match the checkout order.'
      : !amountMatches
        ? `Bankful amount mismatch: expected ${getExpectedAmountCents(matchedOrder)} cents, received ${amountCents(payment.value) ?? 'unknown'} cents.`
        : `Bankful currency mismatch: expected ${getExpectedCurrency(matchedOrder)}, received ${payment.currency || 'unknown'}.`;
    const order = await markBankfulPaymentReviewRequired({
      order: matchedOrder,
      payment,
      reason,
      ipnEvent: args.ipnEvent,
    });

    return {
      matched: true,
      order,
      targetStatus,
      reviewRequired: true,
    };
  }

  const result = await applyVerifiedPaymentStatus({
    orderId: matchedOrder.orderId,
    provider: 'bankful',
    targetStatus,
    source: args.source,
    ipnEvent: args.ipnEvent,
    paymentUpdater: (current) => buildBankfulPaymentPatch({
      current,
      payment,
      targetStatus,
    }),
  });

  await updateBankfulPaymentAttempt(matchedOrder.payment.attemptId, {
    status: bankfulAttemptStatus(targetStatus),
    bankful: bankfulResponseSnapshot(payment),
    latestError: targetStatus === 'paid'
      ? null
      : payment.errorMessage ||
        payment.processorAdvice ||
        payment.serviceAdvice ||
        payment.apiAdvice ||
        null,
  }).catch((error) => {
    console.error('Unable to update Bankful hosted attempt:', error);
  });

  return {
    matched: true,
    order: result.order || matchedOrder,
    targetStatus,
    reviewRequired: false,
  };
}
