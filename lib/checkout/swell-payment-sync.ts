import crypto from 'node:crypto';
import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { isBankfulPayment, isInteracPayment, isShieldClimbPayment, isSquarePayment } from '@/lib/checkout/types';
import { createSwellOrderPayment, getSwellManualPaymentMethod, getSwellOrder, updateSwellOrder } from '@/lib/checkout/swell-order-management';
import type { NowPaymentsPaymentResponse } from '@/lib/checkout/nowpayments';
import { isNowPaymentsPayment } from '@/lib/checkout/types';
import { updateCheckoutOrder } from '@/lib/checkout/order-store';
import { buildCheckoutPricingMetadata } from '@/lib/checkout/pricing';

const SWELL_PAYMENT_SYNC_CLAIM_MS = 5 * 60 * 1000;

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
  const manualMethod = getSwellManualPaymentMethod('crypto');

  await updateSwellOrder(order.swell.orderId, {
    // Suppress Swell's built-in emails — all emails sent via Loops.
    $notify: false,
    account_id: order.swell.accountId,
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
        landedCostAmount: order.totals.landedCostAmount?.amount,
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

  const manualMethod = getSwellManualPaymentMethod('card');

  await updateSwellOrder(order.swell.orderId, {
    // Suppress Swell's built-in emails — all emails sent via Loops.
    $notify: false,
    account_id: order.swell.accountId,
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
        landedCostAmount: order.totals.landedCostAmount?.amount,
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

export async function syncBankfulOrderToSwell(order: CheckoutOrderRecord) {
  if (!isBankfulPayment(order.payment)) {
    return null;
  }

  const manualMethod = getSwellManualPaymentMethod('card');

  await updateSwellOrder(order.swell.orderId, {
    // Suppress Swell's built-in emails — all emails sent via Loops.
    $notify: false,
    account_id: order.swell.accountId,
    billing: {
      method: manualMethod,
      intent: {
        provider: 'bankful',
        attempt_id: order.payment.attemptId,
        transaction_record_id: order.payment.transactionRecordId,
        transaction_order_id: order.payment.transactionOrderId,
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
        landedCostAmount: order.totals.landedCostAmount?.amount,
        totalAmount: order.totals.totalAmount.amount,
        discounts: order.totals.discounts,
        discountAmount: order.totals.discountAmount?.amount,
        discountCode: order.totals.discountCode,
        paymentMethod: 'card',
      }),
      bankful: {
        attempt_id: order.payment.attemptId,
        request_action: order.payment.requestAction ?? null,
        bankful_status: order.payment.bankfulStatus ?? null,
        transaction_request_id: order.payment.transactionRequestId ?? null,
        transaction_record_id: order.payment.transactionRecordId ?? null,
        transaction_order_id: order.payment.transactionOrderId ?? null,
        xtl_order_id: order.payment.xtlOrderId ?? null,
        transaction_value: order.payment.transactionValue ?? null,
        transaction_currency: order.payment.transactionCurrency ?? null,
        captured_at: order.payment.capturedAt ?? null,
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
      order.payment.transactionRecordId ||
      order.payment.transactionRequestId ||
      order.payment.attemptId,
    authorized: true,
    captured: true,
  });

  await updateCheckoutOrder(order.orderId, current => {
    if (!isBankfulPayment(current.payment)) return current;
    if (current.payment.swellPaymentId) return current;
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

export async function syncSquareOrderToSwell(order: CheckoutOrderRecord) {
  if (!isSquarePayment(order.payment)) {
    return null;
  }

  const manualMethod = getSwellManualPaymentMethod('card');
  const syncToken = crypto.randomUUID();
  const syncStartedAt = new Date().toISOString();

  const claimedOrder = await updateCheckoutOrder(order.orderId, current => {
    if (!isSquarePayment(current.payment)) return current;
    if (current.payment.status !== 'paid') return current;
    if (current.payment.swellPaymentId) return current;

    const existingStartedAt = Date.parse(current.payment.swellPaymentSyncStartedAt || '');
    const hasFreshClaim = Boolean(
      current.payment.swellPaymentSyncToken &&
        Number.isFinite(existingStartedAt) &&
        Date.now() - existingStartedAt < SWELL_PAYMENT_SYNC_CLAIM_MS,
    );
    if (hasFreshClaim) return current;

    return {
      ...current,
      payment: {
        ...current.payment,
        swellPaymentSyncToken: syncToken,
        swellPaymentSyncStartedAt: syncStartedAt,
      },
    };
  });

  if (!claimedOrder || !isSquarePayment(claimedOrder.payment)) {
    return null;
  }
  if (claimedOrder.payment.status !== 'paid' || claimedOrder.payment.swellPaymentId) {
    return null;
  }
  if (claimedOrder.payment.swellPaymentSyncToken !== syncToken) {
    return null;
  }

  try {
    const swellOrder = await getSwellOrder(claimedOrder.swell.orderId);
    const localTotal = Number(claimedOrder.totals.totalAmount.amount);
    const swellGrandTotal = Number(swellOrder.grand_total);
    const localCurrency = claimedOrder.currencyCode.trim().toUpperCase();
    const swellCurrency = (swellOrder.currency || localCurrency).trim().toUpperCase();
    const swellWouldRemainPartiallyPaid =
      Number.isFinite(localTotal) &&
      Number.isFinite(swellGrandTotal) &&
      localTotal + 0.01 < swellGrandTotal;

    if (swellCurrency !== localCurrency || swellWouldRemainPartiallyPaid) {
      const reason =
        swellCurrency !== localCurrency
          ? `Square/Swell currency mismatch: local ${localCurrency}, Swell ${swellCurrency}.`
          : `Square payment is below the final Swell order total: local ${localTotal.toFixed(2)} ${localCurrency}, Swell ${swellGrandTotal.toFixed(2)} ${swellCurrency}.`;

      await updateCheckoutOrder(claimedOrder.orderId, current => {
        if (!isSquarePayment(current.payment)) return current;
        if (current.payment.swellPaymentSyncToken !== syncToken) return current;

        return {
          ...current,
          payment: {
            ...current.payment,
            status: 'review_required',
            swellPaymentSyncToken: null,
            swellPaymentSyncStartedAt: null,
            updatedAt: new Date().toISOString(),
          },
          latestError: reason,
        };
      });

      throw new Error(reason);
    }

    await updateSwellOrder(claimedOrder.swell.orderId, {
      $notify: false,
      account_id: claimedOrder.swell.accountId,
      billing: {
        method: manualMethod,
        intent: {
          provider: 'square',
          payment_link_id: claimedOrder.payment.paymentLinkId,
          square_order_id: claimedOrder.payment.squareOrderId,
          payment_id: claimedOrder.payment.paymentId ?? null,
          status: claimedOrder.payment.status,
        },
      },
      metadata: {
        checkout_reference: claimedOrder.orderId,
        pricing: buildCheckoutPricingMetadata({
          currencyCode: claimedOrder.currencyCode,
          subtotalAmount: claimedOrder.totals.subtotalAmount.amount,
          shippingAmount: claimedOrder.totals.shippingAmount?.amount,
          taxAmount: claimedOrder.totals.taxAmount?.amount,
          landedCostAmount: claimedOrder.totals.landedCostAmount?.amount,
          totalAmount: claimedOrder.totals.totalAmount.amount,
          discounts: claimedOrder.totals.discounts,
          discountAmount: claimedOrder.totals.discountAmount?.amount,
          discountCode: claimedOrder.totals.discountCode,
          paymentMethod: 'card',
        }),
        square: {
          payment_link_id: claimedOrder.payment.paymentLinkId,
          square_order_id: claimedOrder.payment.squareOrderId,
          payment_id: claimedOrder.payment.paymentId ?? null,
          square_status: claimedOrder.payment.squareStatus ?? null,
          expected_amount: claimedOrder.payment.expectedAmount,
          expected_currency: claimedOrder.payment.expectedCurrency,
          receipt_url: claimedOrder.payment.receiptUrl ?? null,
          paid_at: claimedOrder.payment.paidAt ?? null,
        },
      },
    });

    const swellPayment = await createSwellOrderPayment({
      account_id: claimedOrder.swell.accountId,
      order_id: claimedOrder.swell.orderId,
      amount: Number(claimedOrder.totals.totalAmount.amount),
      currency: claimedOrder.currencyCode,
      method: manualMethod,
      transaction_id:
        claimedOrder.payment.paymentId ||
        claimedOrder.payment.squareOrderId ||
        claimedOrder.payment.paymentLinkId,
      authorized: true,
      captured: true,
    });

    await updateCheckoutOrder(claimedOrder.orderId, current => {
      if (!isSquarePayment(current.payment)) return current;
      if (current.payment.swellPaymentId) return current;
      if (current.payment.swellPaymentSyncToken !== syncToken) return current;
      return {
        ...current,
        payment: {
          ...current.payment,
          swellPaymentId: swellPayment.id,
          swellPaymentSyncToken: null,
          swellPaymentSyncStartedAt: null,
        },
      };
    });

    return swellPayment;
  } catch (error) {
    await updateCheckoutOrder(claimedOrder.orderId, current => {
      if (!isSquarePayment(current.payment)) return current;
      if (current.payment.swellPaymentSyncToken !== syncToken) return current;
      return {
        ...current,
        payment: {
          ...current.payment,
          swellPaymentSyncToken: null,
          swellPaymentSyncStartedAt: null,
        },
      };
    }).catch(() => {});

    throw error;
  }
}

export async function syncInteracOrderToSwell(order: CheckoutOrderRecord) {
  if (!isInteracPayment(order.payment)) {
    return null;
  }

  const manualMethod = getSwellManualPaymentMethod('interac');
  const syncToken = crypto.randomUUID();
  const syncStartedAt = new Date().toISOString();

  const claimedOrder = await updateCheckoutOrder(order.orderId, current => {
    if (!isInteracPayment(current.payment)) return current;
    if (current.payment.status !== 'paid') return current;
    if (current.payment.swellPaymentId) return current;

    const existingStartedAt = Date.parse(current.payment.swellPaymentSyncStartedAt || '');
    const hasFreshClaim = Boolean(
      current.payment.swellPaymentSyncToken &&
        Number.isFinite(existingStartedAt) &&
        Date.now() - existingStartedAt < SWELL_PAYMENT_SYNC_CLAIM_MS,
    );
    if (hasFreshClaim) return current;

    return {
      ...current,
      payment: {
        ...current.payment,
        swellPaymentSyncToken: syncToken,
        swellPaymentSyncStartedAt: syncStartedAt,
      },
    };
  });

  if (!claimedOrder || !isInteracPayment(claimedOrder.payment)) {
    return null;
  }
  if (claimedOrder.payment.status !== 'paid' || claimedOrder.payment.swellPaymentId) {
    return null;
  }
  if (claimedOrder.payment.swellPaymentSyncToken !== syncToken) {
    return null;
  }

  try {
    await updateSwellOrder(claimedOrder.swell.orderId, {
      $notify: false,
      account_id: claimedOrder.swell.accountId,
      billing: {
        method: manualMethod,
        intent: {
          provider: 'interac',
          message_code: claimedOrder.payment.messageCode,
          status: claimedOrder.payment.status,
        },
      },
      metadata: {
        checkout_reference: claimedOrder.orderId,
        pricing: buildCheckoutPricingMetadata({
          currencyCode: claimedOrder.currencyCode,
          subtotalAmount: claimedOrder.totals.subtotalAmount.amount,
          shippingAmount: claimedOrder.totals.shippingAmount?.amount,
          taxAmount: claimedOrder.totals.taxAmount?.amount,
          landedCostAmount: claimedOrder.totals.landedCostAmount?.amount,
          totalAmount: claimedOrder.totals.totalAmount.amount,
          discounts: claimedOrder.totals.discounts,
          discountAmount: claimedOrder.totals.discountAmount?.amount,
          discountCode: claimedOrder.totals.discountCode,
          paymentMethod: 'interac',
        }),
        interac: {
          message_code: claimedOrder.payment.messageCode,
          recipient_email: claimedOrder.payment.recipientEmail,
          expected_sender_email: claimedOrder.payment.expectedSenderEmail,
          expected_sender_name: claimedOrder.payment.expectedSenderName,
          security_question: claimedOrder.payment.securityQuestion ?? null,
          security_answer: claimedOrder.payment.securityAnswer ?? null,
          cad_amount: claimedOrder.payment.cadAmount,
          status: claimedOrder.payment.status,
          received_amount: claimedOrder.payment.receivedAmount ?? null,
          sender_name: claimedOrder.payment.senderName ?? null,
          reply_to_email: claimedOrder.payment.replyToEmail ?? null,
          bank_reference: claimedOrder.payment.bankReference ?? null,
          gmail_message_id: claimedOrder.payment.gmailMessageId ?? null,
          sender_mismatch: claimedOrder.payment.senderMismatch ?? false,
          confirmed_at: claimedOrder.payment.confirmedAt ?? null,
        },
      },
    });

    const swellPayment = await createSwellOrderPayment({
      account_id: claimedOrder.swell.accountId,
      order_id: claimedOrder.swell.orderId,
      amount: Number(claimedOrder.totals.totalAmount.amount),
      currency: claimedOrder.currencyCode,
      method: manualMethod,
      transaction_id:
        claimedOrder.payment.bankReference ||
        claimedOrder.payment.gmailMessageId ||
        claimedOrder.payment.messageCode,
      authorized: true,
      captured: true,
    });

    await updateCheckoutOrder(claimedOrder.orderId, current => {
      if (!isInteracPayment(current.payment)) return current;
      if (current.payment.swellPaymentId) return current;
      if (current.payment.swellPaymentSyncToken !== syncToken) return current;
      return {
        ...current,
        payment: {
          ...current.payment,
          swellPaymentId: swellPayment.id,
          swellPaymentSyncToken: null,
          swellPaymentSyncStartedAt: null,
        },
      };
    });

    return swellPayment;
  } catch (error) {
    await updateCheckoutOrder(claimedOrder.orderId, current => {
      if (!isInteracPayment(current.payment)) return current;
      if (current.payment.swellPaymentSyncToken !== syncToken) return current;
      return {
        ...current,
        payment: {
          ...current.payment,
          swellPaymentSyncToken: null,
          swellPaymentSyncStartedAt: null,
        },
      };
    }).catch((clearError) => {
      console.error('Unable to clear Interac Swell payment sync claim:', clearError);
    });
    throw error;
  }
}
