import { NextResponse } from 'next/server';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { getWalletByOrderId, markWalletPaid } from '@/lib/checkout/wallet-service';
import { syncShieldClimbOrderToSwell } from '@/lib/checkout/swell-payment-sync';
import { sendOrderConfirmationEmail } from '@/lib/email/order-emails';
import { isShieldClimbPayment } from '@/lib/checkout/types';
import { createPayoutFromOrder } from '@/lib/checkout/payout-service';
import { markWelcomeDiscountUsed } from '@/lib/email/welcome-discount';

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Our callback URL has ?orderId=... and ShieldClimb appends its own params including `number`
  const orderId = url.searchParams.get('orderId') || url.searchParams.get('number');
  const valueCoin = url.searchParams.get('value_coin');
  const txidIn = url.searchParams.get('txid_in');
  const txidOut = url.searchParams.get('txid_out');
  const addressIn = url.searchParams.get('address_in');
  const coin = url.searchParams.get('coin');

  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId.' }, { status: 400 });
  }

  try {
    const order = await getCheckoutOrder(orderId);

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!isShieldClimbPayment(order.payment)) {
      return NextResponse.json({ error: 'Order is not a ShieldClimb payment.' }, { status: 400 });
    }

    const wallet = await getWalletByOrderId(orderId);

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found for order.' }, { status: 404 });
    }

    // Anti-spoofing: address_in from callback MUST match our stored polygon_address_in
    if (!addressIn || !wallet.shieldclimbPolygonAddressIn || addressIn !== wallet.shieldclimbPolygonAddressIn) {
      console.error(
        `ShieldClimb callback address mismatch for ${orderId}: got ${addressIn || '(missing)'}, expected ${wallet.shieldclimbPolygonAddressIn || '(not set)'}`
      );
      return NextResponse.json({ error: 'Address verification failed.' }, { status: 403 });
    }

    // Mark wallet as paid
    await markWalletPaid(wallet.id, {
      valueCoinReceived: valueCoin ?? undefined,
      txidIn: txidIn ?? undefined,
      txidOut: txidOut ?? undefined,
    });

    // Update order payment status
    const updatedOrder = await updateCheckoutOrder(orderId, current => ({
      ...current,
      payment: {
        ...current.payment,
        status: 'paid',
        valueCoinReceived: valueCoin,
        txidIn,
        txidOut,
        updatedAt: new Date().toISOString(),
      },
    }));

    if (updatedOrder) {
      markWelcomeDiscountUsed({
        email: updatedOrder.shippingAddress.email,
        discountCode: updatedOrder.totals.discountCode,
      }).catch(err =>
        console.error('Welcome discount usage update failed:', err)
      );
    }

    // Create affiliate payout record (non-blocking)
    createPayoutFromOrder(orderId, 'shieldclimb').catch(err =>
      console.error('Affiliate payout creation failed:', err)
    );

    // Fire background tasks (non-blocking)
    const refreshedOrder = await getCheckoutOrder(orderId);

    if (refreshedOrder) {
      syncShieldClimbOrderToSwell(refreshedOrder).catch(err =>
        console.error('ShieldClimb Swell sync failed:', err)
      );

      sendOrderConfirmationEmail(refreshedOrder).catch(err =>
        console.error('Order confirmation email failed:', err)
      );
    }

    // Return 200 for ShieldClimb's bot (the frontend detects payment via polling)
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('ShieldClimb callback error:', error);
    return NextResponse.json({ error: 'Internal error processing callback.' }, { status: 500 });
  }
}
