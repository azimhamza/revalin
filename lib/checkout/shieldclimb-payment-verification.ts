import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import { checkShieldClimbPaymentStatus } from '@/lib/checkout/shieldclimb';
import type { CheckoutIpnEvent, CheckoutOrderRecord } from '@/lib/checkout/types';
import { isShieldClimbPayment } from '@/lib/checkout/types';

const SHIELDCLIMB_SETTLEMENT_COIN = 'polygon_usdc';
const VALUE_COIN_TOLERANCE = 0.01;
const DEFAULT_SHIELDCLIMB_ABSORBED_FEE_PERCENT = 0.1;

function getShieldClimbAbsorbedFeePercent() {
  const rawValue = process.env.SHIELDCLIMB_ABSORBED_FEE_PERCENT?.trim();
  if (!rawValue) {
    return DEFAULT_SHIELDCLIMB_ABSORBED_FEE_PERCENT;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SHIELDCLIMB_ABSORBED_FEE_PERCENT;
  }

  return Math.min(Math.max(parsed, 0), 0.5);
}

export type ShieldClimbCallbackData = {
  addressIn: string;
  coin: string;
  txidIn: string;
  txidOut: string;
  valueCoin: string;
};

type ShieldClimbManualStatusData = {
  coin?: string;
  txidOut?: string;
  valueCoin?: string;
};

export class ShieldClimbPaymentValidationError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = 'ShieldClimbPaymentValidationError';
    this.reason = reason;
  }
}

export type VerifyShieldClimbPaymentResult =
  | {
      status: 'not_found';
      order: null;
      transitioned: false;
    }
  | {
      status:
        | 'wrong_provider'
        | 'inactive'
        | 'unpaid'
        | 'already_paid'
        | 'invalid_payment';
      order: CheckoutOrderRecord;
      transitioned: false;
    }
  | {
      status: 'paid' | 'partially_paid';
      order: CheckoutOrderRecord;
      transitioned: boolean;
    };

function parseCoinAmount(value?: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type AmountCheckResult =
  | { met: true; expected: number; received: number }
  | { met: false; reason: 'underpaid' | 'invalid_value_coin' | 'no_expected'; expected: number | null; received: number | null };

function checkExpectedAmountReceived(args: {
  expectedValueCoin?: string | null;
  receivedValueCoin: string;
}): AmountCheckResult {
  const expected = parseCoinAmount(args.expectedValueCoin);
  if (expected === null) return { met: true, expected: 0, received: 0 };

  const received = parseCoinAmount(args.receivedValueCoin);
  if (received === null) {
    return { met: false, reason: 'invalid_value_coin', expected, received: null };
  }

  const minimumAcceptedSettlement =
    expected * (1 - getShieldClimbAbsorbedFeePercent());

  if (received + VALUE_COIN_TOLERANCE < minimumAcceptedSettlement) {
    return { met: false, reason: 'underpaid', expected, received };
  }

  return { met: true, expected, received };
}

function assertExpectedAmountReceived(args: {
  expectedValueCoin?: string | null;
  receivedValueCoin: string;
}) {
  const result = checkExpectedAmountReceived(args);
  if (result.met) return;

  if (result.reason === 'invalid_value_coin') {
    throw new ShieldClimbPaymentValidationError(
      'ShieldClimb payment callback has an invalid received amount.',
      'invalid_value_coin',
    );
  }

  if (result.reason === 'underpaid') {
    throw new ShieldClimbPaymentValidationError(
      'ShieldClimb payment callback amount is below the absorbable settlement threshold.',
      'underpaid',
    );
  }
}

function assertCallbackMatchesOrder(
  order: CheckoutOrderRecord,
  callbackData: ShieldClimbCallbackData,
) {
  if (!isShieldClimbPayment(order.payment)) {
    return;
  }

  if (callbackData.addressIn !== order.payment.polygonAddressIn) {
    throw new ShieldClimbPaymentValidationError(
      'ShieldClimb callback address does not match this order.',
      'address_mismatch',
    );
  }

  if (callbackData.coin.trim().toLowerCase() !== SHIELDCLIMB_SETTLEMENT_COIN) {
    throw new ShieldClimbPaymentValidationError(
      'ShieldClimb callback coin is not supported for this order.',
      'unsupported_coin',
    );
  }

  assertExpectedAmountReceived({
    expectedValueCoin: order.payment.expectedValueCoin,
    receivedValueCoin: callbackData.valueCoin,
  });
}

function isManualStatusUsableForPaidOrder(
  order: CheckoutOrderRecord,
  statusData: ShieldClimbManualStatusData,
) {
  if (!isShieldClimbPayment(order.payment)) {
    return false;
  }

  if (!statusData.valueCoin || !statusData.txidOut || !statusData.coin) {
    return false;
  }

  if (statusData.coin.trim().toLowerCase() !== SHIELDCLIMB_SETTLEMENT_COIN) {
    return false;
  }

  try {
    assertExpectedAmountReceived({
      expectedValueCoin: order.payment.expectedValueCoin,
      receivedValueCoin: statusData.valueCoin,
    });
    return true;
  } catch (error) {
    if (error instanceof ShieldClimbPaymentValidationError) {
      console.warn('ShieldClimb paid status failed validation.', {
        orderId: order.orderId,
        reason: error.reason,
      });
      return false;
    }

    throw error;
  }
}

function buildCallbackIpnEvent(args: {
  callbackData: ShieldClimbCallbackData;
  receivedAt: string;
}): CheckoutIpnEvent {
  return {
    receivedAt: args.receivedAt,
    valid: true,
    payload: {
      value_coin: args.callbackData.valueCoin,
      coin: args.callbackData.coin,
      txid_in: args.callbackData.txidIn,
      txid_out: args.callbackData.txidOut,
      address_in: args.callbackData.addressIn,
    },
  };
}

export async function verifyAndFinalizeShieldClimbPayment(args: {
  orderId: string;
  callbackData?: ShieldClimbCallbackData;
}): Promise<VerifyShieldClimbPaymentResult> {
  const order = await getCheckoutOrder(args.orderId);

  if (!order) {
    return { status: 'not_found', order: null, transitioned: false };
  }

  if (!isShieldClimbPayment(order.payment)) {
    return { status: 'wrong_provider', order, transitioned: false };
  }

  if (
    order.payment.status !== 'unpaid' &&
    order.payment.status !== 'paid' &&
    order.payment.status !== 'partially_paid'
  ) {
    return { status: 'inactive', order, transitioned: false };
  }

  const callbackReceivedAt = args.callbackData ? new Date().toISOString() : null;
  if (args.callbackData) {
    try {
      assertCallbackMatchesOrder(order, args.callbackData);
    } catch (validationError) {
      if (
        validationError instanceof ShieldClimbPaymentValidationError &&
        validationError.reason === 'underpaid'
      ) {
        const ipnEvent = buildCallbackIpnEvent({
          callbackData: args.callbackData,
          receivedAt: callbackReceivedAt!,
        });

        const result = await applyVerifiedPaymentStatus({
          orderId: order.orderId,
          provider: 'shieldclimb',
          targetStatus: 'partially_paid',
          source: 'shieldclimb_callback',
          ipnEvent,
          paymentUpdater: current => {
            if (!isShieldClimbPayment(current.payment)) {
              return current.payment;
            }

            return {
              ...current.payment,
              status: 'partially_paid',
              valueCoinReceived: args.callbackData!.valueCoin,
              coinReceived: args.callbackData!.coin,
              txidIn: args.callbackData!.txidIn,
              txidOut: args.callbackData!.txidOut,
              callbackVerifiedAt: callbackReceivedAt!,
              updatedAt: new Date().toISOString(),
            };
          },
        });

        if (!result.order) {
          return { status: 'not_found', order: null, transitioned: false };
        }

        return {
          status: 'partially_paid' as const,
          order: result.order,
          transitioned: result.paymentStateChanged,
        };
      }

      throw validationError;
    }
  }

  if (!args.callbackData) {
    const providerStatus = await checkShieldClimbPaymentStatus(
      order.payment.ipnToken,
    );

    if (providerStatus.status !== 'paid') {
      return order.payment.status === 'paid'
        ? { status: 'already_paid', order, transitioned: false }
        : { status: 'unpaid', order, transitioned: false };
    }

    if (
      !isManualStatusUsableForPaidOrder(order, {
        coin: providerStatus.coin,
        txidOut: providerStatus.txid_out,
        valueCoin: providerStatus.value_coin,
      })
    ) {
      if (
        providerStatus.value_coin &&
        providerStatus.coin?.trim().toLowerCase() === SHIELDCLIMB_SETTLEMENT_COIN
      ) {
        const amountCheck = checkExpectedAmountReceived({
          expectedValueCoin: order.payment.expectedValueCoin,
          receivedValueCoin: providerStatus.value_coin,
        });

        if (!amountCheck.met && amountCheck.reason === 'underpaid') {
          const partialResult = await applyVerifiedPaymentStatus({
            orderId: order.orderId,
            provider: 'shieldclimb',
            targetStatus: 'partially_paid',
            source: 'shieldclimb_poll',
            paymentUpdater: current => {
              if (!isShieldClimbPayment(current.payment)) {
                return current.payment;
              }

              return {
                ...current.payment,
                status: 'partially_paid',
                valueCoinReceived:
                  providerStatus.value_coin ??
                  current.payment.valueCoinReceived ??
                  null,
                coinReceived: providerStatus.coin ?? current.payment.coinReceived ?? null,
                txidOut:
                  providerStatus.txid_out ?? current.payment.txidOut ?? null,
                updatedAt: new Date().toISOString(),
              };
            },
          });

          if (!partialResult.order) {
            return { status: 'not_found', order: null, transitioned: false };
          }

          return {
            status: 'partially_paid' as const,
            order: partialResult.order,
            transitioned: partialResult.paymentStateChanged,
          };
        }
      }

      return { status: 'invalid_payment', order, transitioned: false };
    }

    const result = await applyVerifiedPaymentStatus({
      orderId: order.orderId,
      provider: 'shieldclimb',
      targetStatus: 'paid',
      source: 'shieldclimb_poll',
      paymentUpdater: current => {
        if (!isShieldClimbPayment(current.payment)) {
          return current.payment;
        }

        return {
          ...current.payment,
          status: 'paid',
          valueCoinReceived:
            providerStatus.value_coin ??
            current.payment.valueCoinReceived ??
            null,
          coinReceived: providerStatus.coin ?? current.payment.coinReceived ?? null,
          txidOut:
            providerStatus.txid_out ?? current.payment.txidOut ?? null,
          updatedAt: new Date().toISOString(),
        };
      },
    });

    if (!result.order) {
      return { status: 'not_found', order: null, transitioned: false };
    }

    if (result.wasNoopTerminal || result.order.payment.status !== 'paid') {
      return { status: 'inactive', order: result.order, transitioned: false };
    }

    if (!result.paymentStateChanged) {
      return { status: 'already_paid', order: result.order, transitioned: false };
    }

    return {
      status: 'paid',
      order: result.order,
      transitioned: true,
    };
  }

  const callbackData = args.callbackData;

  const result = await applyVerifiedPaymentStatus({
    orderId: order.orderId,
    provider: 'shieldclimb',
    targetStatus: 'paid',
    source: 'shieldclimb_callback',
    ipnEvent: buildCallbackIpnEvent({
      callbackData,
      receivedAt: callbackReceivedAt!,
    }),
    paymentUpdater: current => {
      if (!isShieldClimbPayment(current.payment)) {
        return current.payment;
      }

      return {
        ...current.payment,
        status: 'paid',
        valueCoinReceived: callbackData.valueCoin,
        coinReceived: callbackData.coin,
        txidIn: callbackData.txidIn,
        txidOut: callbackData.txidOut,
        callbackVerifiedAt: callbackReceivedAt!,
        updatedAt: new Date().toISOString(),
      };
    },
  });

  if (!result.order) {
    return { status: 'not_found', order: null, transitioned: false };
  }

  if (result.wasNoopTerminal || result.order.payment.status !== 'paid') {
    return { status: 'inactive', order: result.order, transitioned: false };
  }

  if (!result.paymentStateChanged) {
    return {
      status: 'already_paid',
      order: result.order,
      transitioned: false,
    };
  }

  return {
    status: 'paid',
    order: result.order,
    transitioned: true,
  };
}
