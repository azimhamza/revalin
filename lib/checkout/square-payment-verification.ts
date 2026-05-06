import { isTerminalPaymentStatus } from '@/lib/checkout/constants';
import {
  findCheckoutOrderBySquarePayment,
  updateCheckoutOrder,
} from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import {
  expectedSquareAmountCents,
  getSquareOrder,
  getSquarePayment,
  mapSquarePaymentStatus,
  squareOrderPaymentId,
  squarePaymentAmountCents,
  squarePaymentCurrency,
  type SquarePayment,
} from '@/lib/checkout/square';
import {
  isSquarePayment,
  type CheckoutIpnEvent,
  type CheckoutOrderRecord,
} from '@/lib/checkout/types';

type SquareVerificationSource = 'square_webhook' | 'square_poll';

const SQUARE_SUCCESS_STATUSES = new Set(['paid', 'finished']);
const SQUARE_INACTIVE_STATUSES = new Set([
  'cancelled',
  'replaced',
  'failed',
  'expired',
  'refunded',
]);

function normalizeStatus(status?: string | null) {
  return status?.trim().toLowerCase() || '';
}

function isSuccessfulSquareStatus(status?: string | null) {
  return SQUARE_SUCCESS_STATUSES.has(normalizeStatus(status));
}

function getExpectedSquareAmountCents(order: CheckoutOrderRecord) {
  if (!isSquarePayment(order.payment)) {
    return null;
  }

  return expectedSquareAmountCents(
    order.payment.expectedAmount ||
      order.payment.attemptAmount ||
      order.totals.totalAmount.amount,
  );
}

async function markSquarePaymentReviewRequired(args: {
  order: CheckoutOrderRecord;
  payment: SquarePayment;
  reason: string;
  ipnEvent?: CheckoutIpnEvent;
}) {
  return updateCheckoutOrder(args.order.orderId, current => {
    if (!isSquarePayment(current.payment)) return current;

    const preserveStatus =
      isTerminalPaymentStatus(current.payment.status) ||
      current.payment.status.toLowerCase() === 'review_required';

    return {
      ...current,
      payment: {
        ...current.payment,
        status: preserveStatus ? current.payment.status : 'review_required',
        paymentId: args.payment.id ?? current.payment.paymentId ?? null,
        squareStatus: args.payment.status ?? current.payment.squareStatus ?? null,
        amountMoney: args.payment.amount_money ?? current.payment.amountMoney ?? null,
        totalMoney: args.payment.total_money ?? current.payment.totalMoney ?? null,
        receiptUrl: args.payment.receipt_url ?? current.payment.receiptUrl ?? null,
        updatedAt: args.payment.updated_at || new Date().toISOString(),
      },
      latestError: args.reason,
      ipnEvents: args.ipnEvent
        ? [...(current.ipnEvents || []), args.ipnEvent]
        : current.ipnEvents,
    };
  });
}

async function appendSquarePaymentAuditEvent(args: {
  order: CheckoutOrderRecord;
  payment: SquarePayment;
  ipnEvent?: CheckoutIpnEvent;
}) {
  if (!args.ipnEvent) {
    return args.order;
  }

  const ipnEvent = args.ipnEvent;

  return updateCheckoutOrder(args.order.orderId, current => {
    if (!isSquarePayment(current.payment)) return current;

    return {
      ...current,
      payment: {
        ...current.payment,
        paymentId: args.payment.id ?? current.payment.paymentId ?? null,
        squareStatus: args.payment.status ?? current.payment.squareStatus ?? null,
        amountMoney: args.payment.amount_money ?? current.payment.amountMoney ?? null,
        totalMoney: args.payment.total_money ?? current.payment.totalMoney ?? null,
        receiptUrl: args.payment.receipt_url ?? current.payment.receiptUrl ?? null,
        updatedAt: args.payment.updated_at || new Date().toISOString(),
      },
      ipnEvents: [...(current.ipnEvents || []), ipnEvent],
    };
  });
}

export async function applySquarePaymentVerification(args: {
  order: CheckoutOrderRecord;
  payment: SquarePayment;
  source: SquareVerificationSource;
  ipnEvent?: CheckoutIpnEvent;
}) {
  if (!isSquarePayment(args.order.payment)) {
    return {
      order: args.order,
      targetStatus: 'ignored',
      reviewRequired: false,
    };
  }

  const targetStatus = mapSquarePaymentStatus(args.payment.status);
  const currentStatus = normalizeStatus(args.order.payment.status);
  const currentPaymentAlreadySuccessful =
    isSuccessfulSquareStatus(currentStatus) ||
    Boolean(args.order.payment.swellPaymentId);

  if (
    currentPaymentAlreadySuccessful &&
    !isSuccessfulSquareStatus(targetStatus)
  ) {
    const auditedOrder = await appendSquarePaymentAuditEvent({
      order: args.order,
      payment: args.payment,
      ipnEvent: args.ipnEvent,
    });

    return {
      order: auditedOrder || args.order,
      targetStatus,
      reviewRequired: false,
    };
  }

  if (
    targetStatus === 'paid' &&
    (
      SQUARE_INACTIVE_STATUSES.has(currentStatus) ||
      Boolean(args.order.payment.deletedAt)
    )
  ) {
    const updatedOrder = await markSquarePaymentReviewRequired({
      order: args.order,
      payment: args.payment,
      reason: 'Square payment completed for a checkout link that was already released, replaced, or cancelled.',
      ipnEvent: args.ipnEvent,
    });

    return {
      order: updatedOrder || args.order,
      targetStatus,
      reviewRequired: true,
    };
  }

  const paymentAmountCents = squarePaymentAmountCents(args.payment);
  const paymentCurrency = squarePaymentCurrency(args.payment);
  const expectedAmountCents = getExpectedSquareAmountCents(args.order);
  const expectedCurrency = args.order.payment.expectedCurrency.trim().toUpperCase();
  const squareOrderMatches =
    !args.payment.order_id || args.payment.order_id === args.order.payment.squareOrderId;
  const amountMatches =
    targetStatus !== 'paid' ||
    (
      paymentAmountCents === expectedAmountCents &&
      paymentCurrency === expectedCurrency
    );

  if (!squareOrderMatches || !amountMatches) {
    const mismatchReason = !squareOrderMatches
      ? 'Square payment order id did not match the checkout order.'
      : `Square payment amount mismatch: expected ${expectedAmountCents} ${expectedCurrency}, received ${paymentAmountCents ?? 'unknown'} ${paymentCurrency || 'unknown'}.`;

    const updatedOrder = await markSquarePaymentReviewRequired({
      order: args.order,
      payment: args.payment,
      reason: mismatchReason,
      ipnEvent: args.ipnEvent,
    });

    return {
      order: updatedOrder || args.order,
      targetStatus,
      reviewRequired: true,
    };
  }

  const result = await applyVerifiedPaymentStatus({
    orderId: args.order.orderId,
    provider: 'square',
    targetStatus,
    source: args.source,
    ipnEvent: args.ipnEvent,
    paymentUpdater: (current) => {
      if (!isSquarePayment(current.payment)) {
        return current.payment;
      }

      return {
        ...current.payment,
        status: targetStatus,
        paymentId: args.payment.id ?? current.payment.paymentId ?? null,
        squareStatus: args.payment.status ?? current.payment.squareStatus ?? null,
        locationId: args.payment.location_id ?? current.payment.locationId ?? null,
        receiptUrl: args.payment.receipt_url ?? current.payment.receiptUrl ?? null,
        buyerEmail: args.payment.buyer_email_address ?? current.payment.buyerEmail ?? null,
        amountMoney: args.payment.amount_money ?? current.payment.amountMoney ?? null,
        totalMoney: args.payment.total_money ?? current.payment.totalMoney ?? null,
        paidAt:
          targetStatus === 'paid'
            ? args.payment.updated_at || new Date().toISOString()
            : current.payment.paidAt ?? null,
        updatedAt: args.payment.updated_at || new Date().toISOString(),
      };
    },
  });

  return {
    order: result.order || args.order,
    targetStatus,
    reviewRequired: false,
  };
}

export async function resolveSquarePaymentForCheckoutOrder(order: CheckoutOrderRecord) {
  if (!isSquarePayment(order.payment)) {
    return null;
  }

  if (order.payment.paymentId) {
    return getSquarePayment(order.payment.paymentId);
  }

  const squareOrder = await getSquareOrder(order.payment.squareOrderId);
  const paymentId = squareOrderPaymentId(squareOrder);
  if (!paymentId) {
    return null;
  }

  return getSquarePayment(paymentId);
}

export async function findSquareCheckoutOrderForPayment(payment: SquarePayment) {
  return findCheckoutOrderBySquarePayment({
    paymentId: payment.id,
    squareOrderId: payment.order_id,
  });
}
