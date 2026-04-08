import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import { checkShieldClimbPaymentStatus } from '@/lib/checkout/shieldclimb';
import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { isShieldClimbPayment } from '@/lib/checkout/types';
import { getWalletByOrderId } from '@/lib/checkout/wallet-service';

type ShieldClimbCallbackData = {
  addressIn?: string | null;
  coin?: string | null;
  txidIn?: string | null;
  txidOut?: string | null;
  valueCoin?: string | null;
};

export type VerifyShieldClimbPaymentResult =
  | {
      status: 'not_found';
      order: null;
      transitioned: false;
    }
  | {
      status: 'wrong_provider' | 'inactive' | 'unpaid' | 'already_paid';
      order: CheckoutOrderRecord;
      transitioned: false;
    }
  | {
      status: 'paid';
      order: CheckoutOrderRecord;
      transitioned: boolean;
    };

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
    order.payment.status !== 'paid'
  ) {
    return { status: 'inactive', order, transitioned: false };
  }

  const providerStatus = await checkShieldClimbPaymentStatus(order.payment.ipnToken);
  if (providerStatus.status !== 'paid') {
    return order.payment.status === 'paid'
      ? { status: 'already_paid', order, transitioned: false }
      : { status: 'unpaid', order, transitioned: false };
  }

  const wallet = await getWalletByOrderId(order.orderId);
  if (!wallet) {
    throw new Error('Wallet not found for ShieldClimb order.');
  }

  if (
    args.callbackData?.addressIn &&
    wallet.shieldclimbPolygonAddressIn &&
    args.callbackData.addressIn !== wallet.shieldclimbPolygonAddressIn
  ) {
    console.warn('ShieldClimb callback address mismatch after provider verification.', {
      orderId: order.orderId,
      callbackAddress: args.callbackData.addressIn,
      storedAddress: wallet.shieldclimbPolygonAddressIn,
      coin: args.callbackData.coin ?? null,
    });
  }

  const result = await applyVerifiedPaymentStatus({
    orderId: order.orderId,
    provider: 'shieldclimb',
    targetStatus: 'paid',
    source: args.callbackData ? 'shieldclimb_callback' : 'shieldclimb_poll',
    paymentUpdater: current => {
      if (!isShieldClimbPayment(current.payment)) {
        return current.payment;
      }

      return {
        ...current.payment,
        status: 'paid',
        valueCoinReceived:
          providerStatus.value_coin ??
          args.callbackData?.valueCoin ??
          current.payment.valueCoinReceived ??
          null,
        txidIn: args.callbackData?.txidIn ?? current.payment.txidIn ?? null,
        txidOut:
          providerStatus.txid_out ??
          args.callbackData?.txidOut ??
          current.payment.txidOut ??
          null,
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
