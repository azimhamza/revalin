import { NextResponse } from 'next/server';

import {
  bankfulRecordFromFormText,
  verifyBankfulHostedSignature,
} from '@/lib/checkout/bankful';
import { applyBankfulHostedPaymentResult } from '@/lib/checkout/bankful-hosted-verification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function signatureFromRecord(record: Record<string, string>) {
  return record.SIGNATURE || record.signature || undefined;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const record = bankfulRecordFromFormText(rawBody);

  if (!verifyBankfulHostedSignature(record)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const result = await applyBankfulHostedPaymentResult({
    record,
    source: 'bankful_callback',
    ipnEvent: {
      receivedAt: new Date().toISOString(),
      signature: signatureFromRecord(record),
      valid: true,
      payload: record,
    },
  });

  return NextResponse.json({
    ok: true,
    matched: result.matched,
    orderId: result.order?.orderId ?? null,
    status: result.order?.payment.status ?? result.targetStatus,
    reviewRequired: result.reviewRequired,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(
      process.env.BANKFUL_HOSTED_SECRET || process.env.BANKFUL_SECRET_KEY,
    ),
  });
}
