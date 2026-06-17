import { isTerminalPaymentStatus } from '@/lib/checkout/constants';
import {
  findStaleHostedCheckoutOrders,
  updateCheckoutOrder,
} from '@/lib/checkout/order-store';
import { cancelSwellOrder } from '@/lib/checkout/swell-order-management';
import type { BankfulPaymentData, CheckoutOrderRecord, ShieldClimbPaymentData } from '@/lib/checkout/types';
import { isBankfulPayment, isShieldClimbPayment } from '@/lib/checkout/types';

export type StaleCheckoutCancellationError = {
  orderId: string;
  message: string;
};

export type StaleCheckoutCancellationResult = {
  scanned: number;
  cancelled: number;
  skipped: number;
  errors: StaleCheckoutCancellationError[];
  orderIds: string[];
};

type StaleCheckoutCancellationDependencies = {
  findCandidates: typeof findStaleHostedCheckoutOrders;
  cancelSwellOrder: typeof cancelSwellOrder;
  updateCheckoutOrder: typeof updateCheckoutOrder;
  now: () => Date;
};

type CancelStaleCheckoutOptions = {
  cancelAfterMinutes?: number;
  limit?: number;
  orderIds?: string[];
  dependencies?: Partial<StaleCheckoutCancellationDependencies>;
};

export const DEFAULT_STALE_CHECKOUT_CANCEL_AFTER_MINUTES = 60;
const DEFAULT_STALE_CHECKOUT_SCAN_LIMIT = 100;

const defaultDependencies: StaleCheckoutCancellationDependencies = {
  findCandidates: findStaleHostedCheckoutOrders,
  cancelSwellOrder,
  updateCheckoutOrder,
  now: () => new Date(),
};

function hasNonEmptyString(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function resolveStaleCheckoutCancelAfterMinutes() {
  const raw = process.env.STALE_CHECKOUT_CANCEL_AFTER_MINUTES?.trim();
  if (!raw) return DEFAULT_STALE_CHECKOUT_CANCEL_AFTER_MINUTES;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_STALE_CHECKOUT_CANCEL_AFTER_MINUTES;
}

export function buildStaleCheckoutCancellationReason(minutes: number) {
  return `Cancelled after payment was not completed within ${minutes} minutes.`;
}

export function hasShieldClimbPaymentEvidence(payment: ShieldClimbPaymentData) {
  return (
    hasNonEmptyString(payment.callbackVerifiedAt) ||
    hasNonEmptyString(payment.txidIn) ||
    hasNonEmptyString(payment.txidOut) ||
    hasNonEmptyString(payment.swellPaymentId) ||
    hasNonEmptyString(payment.valueCoinReceived)
  );
}

export function hasBankfulPaymentEvidence(payment: BankfulPaymentData) {
  return (
    hasNonEmptyString(payment.transactionRecordId) ||
    hasNonEmptyString(payment.transactionOrderId) ||
    hasNonEmptyString(payment.transactionRequestId) ||
    hasNonEmptyString(payment.swellPaymentId) ||
    hasNonEmptyString(payment.bankfulStatus)
  );
}

export function isStaleShieldClimbCheckoutEligible(
  order: CheckoutOrderRecord,
  args: {
    now: Date;
    cancelAfterMinutes: number;
  },
) {
  if (!isShieldClimbPayment(order.payment) && !isBankfulPayment(order.payment)) return false;
  if (isTerminalPaymentStatus(order.payment.status)) return false;
  if (isShieldClimbPayment(order.payment) && hasShieldClimbPaymentEvidence(order.payment)) return false;
  if (isBankfulPayment(order.payment) && hasBankfulPaymentEvidence(order.payment)) return false;

  const createdAtMs = Date.parse(order.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;

  const ageMs = args.now.getTime() - createdAtMs;
  return ageMs >= args.cancelAfterMinutes * 60 * 1000;
}

export async function cancelStaleShieldClimbCheckouts(
  options: CancelStaleCheckoutOptions = {},
): Promise<StaleCheckoutCancellationResult> {
  const cancelAfterMinutes =
    options.cancelAfterMinutes ?? resolveStaleCheckoutCancelAfterMinutes();
  const deps = {
    ...defaultDependencies,
    ...(options.dependencies || {}),
  };
  const now = deps.now();
  const cutoff = new Date(now.getTime() - cancelAfterMinutes * 60 * 1000);
  const reason = buildStaleCheckoutCancellationReason(cancelAfterMinutes);

  const candidates = await deps.findCandidates({
    cutoff,
    limit: options.limit ?? DEFAULT_STALE_CHECKOUT_SCAN_LIMIT,
  });
  const orderIdFilter = options.orderIds
    ? new Set(options.orderIds.map((orderId) => orderId.trim()).filter(Boolean))
    : null;
  const targetOrders = orderIdFilter
    ? candidates.filter((order) => orderIdFilter.has(order.orderId))
    : candidates;

  const result: StaleCheckoutCancellationResult = {
    scanned: targetOrders.length,
    cancelled: 0,
    skipped: 0,
    errors: [],
    orderIds: [],
  };

  for (const order of targetOrders) {
    if (!isStaleShieldClimbCheckoutEligible(order, { now, cancelAfterMinutes })) {
      result.skipped += 1;
      continue;
    }

    try {
      await deps.cancelSwellOrder(order.swell.orderId, reason);

      const updated = await deps.updateCheckoutOrder(order.orderId, (current) => {
        if (!isStaleShieldClimbCheckoutEligible(current, { now, cancelAfterMinutes })) {
          return current;
        }

        return {
          ...current,
          payment: {
            ...current.payment,
            status: 'cancelled',
            updatedAt: now.toISOString(),
          },
          fulfillmentStatus: current.fulfillmentStatus ?? null,
          latestError: reason,
        };
      });

      if (updated?.payment.status === 'cancelled' && updated.latestError === reason) {
        result.cancelled += 1;
        result.orderIds.push(order.orderId);
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.errors.push({
        orderId: order.orderId,
        message: errorMessage(error),
      });
    }
  }

  return result;
}
