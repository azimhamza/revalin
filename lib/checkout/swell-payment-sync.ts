import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { isInteracPayment, isShieldClimbPayment } from '@/lib/checkout/types';
import { createSwellOrderPayment, getSwellManualPaymentMethod, updateSwellOrder } from '@/lib/checkout/swell-order-management';
import type { NowPaymentsPaymentResponse } from '@/lib/checkout/nowpayments';
import { isNowPaymentsPayment } from '@/lib/checkout/types';
import { updateCheckoutOrder } from '@/lib/checkout/order-store';
import { buildCheckoutPricingMetadata } from '@/lib/checkout/pricing';

export async function syncCheckoutOrderToSwell(
  order: CheckoutOrderRecord,
  payment: Pick<
    NowPaymentsPaymentResponse,
    | 'payment_id'
    | 'payment_status'
    | 'pay_currency'
    | 'pay_address'
    | 'pay_amount'
    | 'purchase_id'
    | 'created_at'
    | 'updated_at'
    | 'network'
    | 'valid_until'
    | 'expiration_estimate_date'
  >
) {
  const manualMethod = getSwellManualPaymentMethod();

  await updateSwellOrder(order.swell.orderId, {
    // Suppress Swell's built-in emails — all emails sent via Loops.
    $notify: false,
    billing: {
      method: manualMethod,
      intent: {
        provider: 'nowpayments',
        payment_id: payment.payment_id,
        payment_status: payment.payment_status,
        pay_currency: payment.pay_currency,
      },
    },
    metadata: {
      checkout_reference: order.orderId,
      pricing: buildCheckoutPricingMetadata({
        currencyCode: order.currencyCode,
        subtotalAmount: order.totals.subtotalAmount.amount,
        shippingAmount: order.totals.shippingAmount?.amount,
        taxAmount: order.totals.taxAmount?.amount,
        totalAmount: order.totals.totalAmount.amount,
        discounts: order.totals.discounts,
        discountAmount: order.totals.discountAmount?.amount,
        discountCode: order.totals.discountCode,
        paymentMethod: 'crypto',
      }),
      nowpayments: {
        payment_id: payment.payment_id,
        purchase_id: payment.purchase_id,
        payment_status: payment.payment_status,
        payment_currency: payment.pay_currency,
        pay_address: payment.pay_address,
        pay_amount: payment.pay_amount,
        network: payment.network,
        valid_until: payment.valid_until,
        expiration_estimate_date: payment.expiration_estimate_date,
        updated_at: payment.updated_at,
        created_at: payment.created_at,
      },
    },
  });

  if (payment.payment_status !== 'finished') {
    return null;
  }

  // Skip if already synced
  if (!isShieldClimbPayment(order.payment) && order.payment.swellPaymentId) {
    return null;
  }

  const swellPayment = await createSwellOrderPayment({
    account_id: order.swell.accountId,
    order_id: order.swell.orderId,
    amount: Number(order.totals.totalAmount.amount),
    currency: order.currencyCode,
    method: manualMethod,
    transaction_id: String(payment.payment_id),
    authorized: true,
    captured: true,
  });

  await updateCheckoutOrder(order.orderId, current => {
    if (!isNowPaymentsPayment(current.payment)) return current;
    return {
      ...current,
      payment: {
        ...current.payment,
        swellPaymentId: swellPayment.id,
      },
    };
  });

  return swellPayment;
}

export async function syncShieldClimbOrderToSwell(order: CheckoutOrderRecord) {
  if (!isShieldClimbPayment(order.payment)) {
    return null;
  }

  const manualMethod = getSwellManualPaymentMethod();

  await updateSwellOrder(order.swell.orderId, {
    // Suppress Swell's built-in emails — all emails sent via Loops.
    $notify: false,
    billing: {
      method: manualMethod,
      intent: {
        provider: 'shieldclimb',
        session_id: order.payment.walletId,
        ipn_token: order.payment.ipnToken,
        status: order.payment.status,
      },
    },
    metadata: {
      checkout_reference: order.orderId,
      pricing: buildCheckoutPricingMetadata({
        currencyCode: order.currencyCode,
        subtotalAmount: order.totals.subtotalAmount.amount,
        shippingAmount: order.totals.shippingAmount?.amount,
        taxAmount: order.totals.taxAmount?.amount,
        totalAmount: order.totals.totalAmount.amount,
        discounts: order.totals.discounts,
        discountAmount: order.totals.discountAmount?.amount,
        discountCode: order.totals.discountCode,
        paymentMethod: 'card',
      }),
      shieldclimb: {
        session_id: order.payment.walletId,
        ipn_token: order.payment.ipnToken,
        polygon_address_in: order.payment.polygonAddressIn,
        expected_value_coin: order.payment.expectedValueCoin,
        payment_currency: order.payment.paymentCurrency,
        status: order.payment.status,
        value_coin_received: order.payment.valueCoinReceived,
        coin_received: order.payment.coinReceived,
        txid_in: order.payment.txidIn,
        txid_out: order.payment.txidOut,
        callback_verified_at: order.payment.callbackVerifiedAt,
      },
    },
  });

  if (order.payment.status !== 'paid') {
    return null;
  }

  // Skip if already synced
  if (order.payment.swellPaymentId) {
    return null;
  }

  const swellPayment = await createSwellOrderPayment({
    account_id: order.swell.accountId,
    order_id: order.swell.orderId,
    amount: Number(order.totals.totalAmount.amount),
    currency: order.currencyCode,
    method: manualMethod,
    transaction_id: order.payment.ipnToken,
    authorized: true,
    captured: true,
  });

  // Update order with swell payment ID
  await updateCheckoutOrder(order.orderId, current => {
    if (!isShieldClimbPayment(current.payment)) return current;
    return {
      ...current,
      payment: {
        ...current.payment,
        swellPaymentId: swellPayment.id,
      },
    };
  });

  return swellPayment;
}

export async function syncInteracOrderToSwell(order: CheckoutOrderRecord) {
  if (!isInteracPayment(order.payment)) {
    return null;
  }

  const manualMethod = getSwellManualPaymentMethod();

  await updateSwellOrder(order.swell.orderId, {
    $notify: false,
    billing: {
      method: manualMethod,
      intent: {
        provider: 'interac',
        message_code: order.payment.messageCode,
        status: order.payment.status,
      },
    },
    metadata: {
      checkout_reference: order.orderId,
      pricing: buildCheckoutPricingMetadata({
        currencyCode: order.currencyCode,
        subtotalAmount: order.totals.subtotalAmount.amount,
        shippingAmount: order.totals.shippingAmount?.amount,
        taxAmount: order.totals.taxAmount?.amount,
        totalAmount: order.totals.totalAmount.amount,
        discounts: order.totals.discounts,
        discountAmount: order.totals.discountAmount?.amount,
        discountCode: order.totals.discountCode,
        paymentMethod: 'interac',
      }),
      interac: {
        message_code: order.payment.messageCode,
        recipient_email: order.payment.recipientEmail,
        expected_sender_email: order.payment.expectedSenderEmail,
        expected_sender_name: order.payment.expectedSenderName,
        cad_amount: order.payment.cadAmount,
        status: order.payment.status,
        received_amount: order.payment.receivedAmount ?? null,
        sender_name: order.payment.senderName ?? null,
        reply_to_email: order.payment.replyToEmail ?? null,
        bank_reference: order.payment.bankReference ?? null,
        gmail_message_id: order.payment.gmailMessageId ?? null,
        sender_mismatch: order.payment.senderMismatch ?? false,
        confirmed_at: order.payment.confirmedAt ?? null,
      },
    },
  });

  if (order.payment.status !== 'paid') {
    return null;
  }

  if (order.payment.swellPaymentId) {
    return null;
  }

  const swellPayment = await createSwellOrderPayment({
    account_id: order.swell.accountId,
    order_id: order.swell.orderId,
    amount: Number(order.totals.totalAmount.amount),
    currency: order.currencyCode,
    method: manualMethod,
    transaction_id:
      order.payment.bankReference ||
      order.payment.gmailMessageId ||
      order.payment.messageCode,
    authorized: true,
    captured: true,
  });

  await updateCheckoutOrder(order.orderId, current => {
    if (!isInteracPayment(current.payment)) return current;
    return {
      ...current,
      payment: {
        ...current.payment,
        swellPaymentId: swellPayment.id,
      },
    };
  });

  return swellPayment;
}
