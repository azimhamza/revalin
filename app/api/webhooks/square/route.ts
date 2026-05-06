import { NextResponse } from 'next/server';

import {
  applySquarePaymentVerification,
  findSquareCheckoutOrderForPayment,
} from '@/lib/checkout/square-payment-verification';
import {
  getSquareWebhookNotificationUrl,
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

  const matchedOrder = await findSquareCheckoutOrderForPayment(payment);

  if (!matchedOrder || !isSquarePayment(matchedOrder.payment)) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const auditEvent = buildSquareAuditEvent({
    signature,
    valid: true,
    payload,
  });
  const result = await applySquarePaymentVerification({
    order: matchedOrder,
    payment,
    source: 'square_webhook',
    ipnEvent: auditEvent,
  });

  return NextResponse.json({
    ok: true,
    orderId: result.order?.orderId ?? matchedOrder.orderId,
    status: result.order?.payment.status ?? result.targetStatus,
    reviewRequired: result.reviewRequired,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
  });
}
