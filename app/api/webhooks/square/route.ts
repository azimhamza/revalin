import { NextResponse } from 'next/server';

import {
  findCheckoutOrderBySquarePayment,
  updateCheckoutOrder,
} from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import {
  expectedSquareAmountCents,
  getSquareWebhookNotificationUrl,
  mapSquarePaymentStatus,
  squarePaymentAmountCents,
  squarePaymentCurrency,
  verifySquareWebhookSignature,
  type SquarePayment,
} from '@/lib/checkout/square';
import { isSquarePayment } from '@/lib/checkout/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function getSquarePaymentFromPayload(payload: Record<string, unknown>) {
  const data = asRecord(payload.data);
  const object = asRecord(data.object);
  const payment = asRecord(object.payment);
  return Object.keys(payment).length > 0 ? (payment as SquarePayment) : null;
}

function buildSquareAuditEvent(args: {
  signature: string | null;
  valid: boolean;
  payload: Record<string, unknown>;
}) {
  return {
    receivedAt: new Date().toISOString(),
    signature: args.signature || undefined,
    valid: args.valid,
    payload: args.payload,
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');
  const notificationUrl = getSquareWebhookNotificationUrl(request.url);
  const isValid = verifySquareWebhookSignature({
    rawBody,
    signatureHeader: signature,
    notificationUrl,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const eventType = typeof payload.type === 'string' ? payload.type : '';
  if (!eventType.startsWith('payment.')) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payment = getSquarePaymentFromPayload(payload);
  if (!payment) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const matchedOrder = await findCheckoutOrderBySquarePayment({
    paymentId: payment.id,
    squareOrderId: payment.order_id,
  });

  if (!matchedOrder || !isSquarePayment(matchedOrder.payment)) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const auditEvent = buildSquareAuditEvent({
    signature,
    valid: true,
    payload,
  });
  const targetStatus = mapSquarePaymentStatus(payment.status);
  const paymentAmountCents = squarePaymentAmountCents(payment);
  const paymentCurrency = squarePaymentCurrency(payment);
  const expectedAmountCents = expectedSquareAmountCents(
    matchedOrder.payment.expectedAmount ||
      matchedOrder.payment.attemptAmount ||
      matchedOrder.totals.totalAmount.amount,
  );
  const expectedCurrency = matchedOrder.payment.expectedCurrency.trim().toUpperCase();
  const squareOrderMatches =
    !payment.order_id || payment.order_id === matchedOrder.payment.squareOrderId;
  const amountMatches =
    targetStatus !== 'paid' ||
    (paymentAmountCents === expectedAmountCents && paymentCurrency === expectedCurrency);

  if (!squareOrderMatches || !amountMatches) {
    const mismatchReason = !squareOrderMatches
      ? 'Square webhook order id did not match the checkout order.'
      : `Square payment amount mismatch: expected ${expectedAmountCents} ${expectedCurrency}, received ${paymentAmountCents ?? 'unknown'} ${paymentCurrency || 'unknown'}.`;

    await updateCheckoutOrder(matchedOrder.orderId, current => {
      if (!isSquarePayment(current.payment)) return current;
      return {
        ...current,
        payment: {
          ...current.payment,
          status: 'review_required',
          paymentId: payment.id ?? current.payment.paymentId ?? null,
          squareStatus: payment.status ?? current.payment.squareStatus ?? null,
          amountMoney: payment.amount_money ?? current.payment.amountMoney ?? null,
          totalMoney: payment.total_money ?? current.payment.totalMoney ?? null,
          receiptUrl: payment.receipt_url ?? current.payment.receiptUrl ?? null,
          updatedAt: payment.updated_at || new Date().toISOString(),
        },
        latestError: mismatchReason,
        ipnEvents: [...(current.ipnEvents || []), auditEvent],
      };
    });

    return NextResponse.json({ ok: true, reviewRequired: true });
  }

  const result = await applyVerifiedPaymentStatus({
    orderId: matchedOrder.orderId,
    provider: 'square',
    targetStatus,
    source: 'square_webhook',
    ipnEvent: auditEvent,
    paymentUpdater: (current) => {
      if (!isSquarePayment(current.payment)) {
        return current.payment;
      }

      return {
        ...current.payment,
        status: targetStatus,
        paymentId: payment.id ?? current.payment.paymentId ?? null,
        squareStatus: payment.status ?? current.payment.squareStatus ?? null,
        locationId: payment.location_id ?? current.payment.locationId ?? null,
        receiptUrl: payment.receipt_url ?? current.payment.receiptUrl ?? null,
        buyerEmail: payment.buyer_email_address ?? current.payment.buyerEmail ?? null,
        amountMoney: payment.amount_money ?? current.payment.amountMoney ?? null,
        totalMoney: payment.total_money ?? current.payment.totalMoney ?? null,
        paidAt:
          targetStatus === 'paid'
            ? payment.updated_at || new Date().toISOString()
            : current.payment.paidAt ?? null,
        updatedAt: payment.updated_at || new Date().toISOString(),
      };
    },
  });

  return NextResponse.json({
    ok: true,
    orderId: result.order?.orderId ?? matchedOrder.orderId,
    status: result.order?.payment.status ?? targetStatus,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
  });
}
