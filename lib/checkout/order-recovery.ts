import { isTerminalPaymentStatus } from './constants.ts';
import type { CheckoutOrderRecord } from './types.ts';
import { isBankfulPayment, isInteracPayment, isNowPaymentsPayment, isShieldClimbPayment } from './types.ts';

function hasNonEmptyValue(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isReusableCheckoutOrder(order: CheckoutOrderRecord) {
  if (isTerminalPaymentStatus(order.payment.status)) {
    return false;
  }

  if (typeof order.payment.supersededByOrderId === 'string' && order.payment.supersededByOrderId.trim()) {
    return false;
  }

  if (isNowPaymentsPayment(order.payment)) {
    return hasNonEmptyValue(order.payment.paymentId);
  }

  if (isShieldClimbPayment(order.payment)) {
    return (
      order.payment.status.trim().toLowerCase() !== 'initializing' &&
      order.payment.walletId !== 'pending' &&
      hasNonEmptyValue(order.payment.ipnToken) &&
      hasNonEmptyValue(order.payment.redirectUrl)
    );
  }

  if (isInteracPayment(order.payment)) {
    return hasNonEmptyValue(order.payment.messageCode);
  }

  if (isBankfulPayment(order.payment)) {
    return hasNonEmptyValue(order.payment.attemptId) && hasNonEmptyValue(order.payment.redirectUrl);
  }

  return false;
}

export function markCheckoutOrderSetupFailed(
  order: CheckoutOrderRecord,
  reason: string,
  failedAt = new Date().toISOString()
): CheckoutOrderRecord {
  if (isTerminalPaymentStatus(order.payment.status)) {
    return order;
  }

  if (isInteracPayment(order.payment)) {
    return {
      ...order,
      payment: {
        ...order.payment,
        status: 'review_required' as const,
        updatedAt: failedAt,
      },
      latestError: reason,
      updatedAt: failedAt,
    };
  }

  return {
    ...order,
    payment: {
      ...order.payment,
      status: 'failed',
      updatedAt: failedAt,
    },
    latestError: reason,
    updatedAt: failedAt,
  };
}
