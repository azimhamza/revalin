import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { isShieldClimbPayment } from '@/lib/checkout/types';
import { createSwellOrderPayment, getSwellManualPaymentMethod, updateSwellOrder } from '@/lib/checkout/swell-order-management';
import type { NowPaymentsPaymentResponse } from '@/lib/checkout/nowpayments';
import { purchaseShipEngineLabel, isShipEngineConfigured } from '@/lib/checkout/shipengine';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { sendOrderConfirmationEmail, sendOrderShippedEmail, sendShippingLabelEmail } from '@/lib/email/order-emails';
import { hasLoopsConfig } from '@/lib/email/loops';

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

  // Fire label purchase + email in the background (non-blocking)
  purchaseAndEmailLabel(order).catch(err =>
    console.error('Label auto-purchase failed:', err)
  );

  // Send customer confirmation email (non-blocking)
  sendOrderConfirmationEmail(order).catch(err =>
    console.error('Order confirmation email failed:', err)
  );

  return swellPayment;
}

export async function syncShieldClimbOrderToSwell(order: CheckoutOrderRecord) {
  if (!isShieldClimbPayment(order.payment)) {
    return null;
  }

  const manualMethod = getSwellManualPaymentMethod();

  await updateSwellOrder(order.swell.orderId, {
    billing: {
      method: manualMethod,
      intent: {
        provider: 'shieldclimb',
        wallet_id: order.payment.walletId,
        status: order.payment.status,
      },
    },
    metadata: {
      checkout_reference: order.orderId,
      shieldclimb: {
        wallet_id: order.payment.walletId,
        address_in: order.payment.addressIn,
        polygon_address_in: order.payment.polygonAddressIn,
        ipn_token: order.payment.ipnToken,
        status: order.payment.status,
        value_coin_received: order.payment.valueCoinReceived,
        txid_in: order.payment.txidIn,
        txid_out: order.payment.txidOut,
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

  // Fire label purchase + email in the background (non-blocking)
  purchaseAndEmailLabel(order).catch(err =>
    console.error('Label auto-purchase failed:', err)
  );

  return swellPayment;
}

async function purchaseAndEmailLabel(order: CheckoutOrderRecord) {
  // Guard: skip if label already purchased or ShipEngine not configured
  if (order.shipengine?.labelUrl) return;
  if (!isShipEngineConfigured()) return;

  if (!hasLoopsConfig()) {
    console.warn('Skipping label email: Loops not configured.');
    return;
  }

  const itemCount = order.lines.reduce((total, line) => total + line.quantity, 0);

  let labelResult: Awaited<ReturnType<typeof purchaseShipEngineLabel>>;
  try {
    labelResult = await purchaseShipEngineLabel({
      shippingAddress: order.shippingAddress,
      itemCount,
    });
  } catch (err) {
    await updateCheckoutOrder(order.orderId, current => ({
      ...current,
      shipengine: {
        ...current.shipengine,
        labelError: err instanceof Error ? err.message : 'Label purchase failed',
      },
    }));
    throw err;
  }

  // Update order with tracking info
  await updateCheckoutOrder(order.orderId, current => ({
    ...current,
    shipengine: {
      trackingCode: labelResult.trackingCode || undefined,
      labelUrl: labelResult.labelUrl || undefined,
      carrier: labelResult.carrier || undefined,
      service: labelResult.service || undefined,
      publicTrackingUrl: labelResult.publicTrackingUrl || undefined,
      labelPurchasedAt: new Date().toISOString(),
    },
  }));

  // Re-fetch order to get updated shipengine data for emails
  const updatedOrder = await getCheckoutOrder(order.orderId);
  const orderForEmail = updatedOrder || order;

  // Download label PDF and send via Loops
  if (labelResult.labelUrl) {
    try {
      const pdfResponse = await fetch(labelResult.labelUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download label PDF: ${pdfResponse.status}`);
      }

      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString('base64');

      await sendShippingLabelEmail({
        order: orderForEmail,
        labelPdfBase64: pdfBase64,
        labelResult: {
          carrier: labelResult.carrier || undefined,
          service: labelResult.service || undefined,
          trackingCode: labelResult.trackingCode || undefined,
          publicTrackingUrl: labelResult.publicTrackingUrl || undefined,
        },
      });
    } catch (emailErr) {
      console.error('Failed to email shipping label:', emailErr);
    }
  }

  // Send customer "order shipped" notification
  sendOrderShippedEmail(orderForEmail).catch(err =>
    console.error('Order shipped email failed:', err)
  );
}
