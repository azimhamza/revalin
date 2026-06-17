import { NextResponse } from 'next/server';

import {
  bankfulRecordFromFormText,
  bankfulRecordFromSearchParams,
  verifyBankfulHostedSignature,
} from '@/lib/checkout/bankful';
import { applyBankfulHostedPaymentResult } from '@/lib/checkout/bankful-hosted-verification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOCAL_RETURN_PARAMS = new Set(['order', 'key', 'result']);

function signatureFromRecord(record: Record<string, string>) {
  return record.SIGNATURE || record.signature || undefined;
}

function providerRecordFromSearchParams(params: URLSearchParams) {
  const providerParams = new URLSearchParams();
  params.forEach((value, key) => {
    if (!LOCAL_RETURN_PARAMS.has(key)) {
      providerParams.append(key, value);
    }
  });
  return bankfulRecordFromSearchParams(providerParams);
}

function redirectToCheckout(request: Request, args: {
  orderId?: string | null;
  accessKey?: string | null;
  error?: string | null;
}) {
  const url = new URL('/checkout', request.url);
  if (args.orderId) url.searchParams.set('order', args.orderId);
  if (args.accessKey) url.searchParams.set('key', args.accessKey);
  if (args.error) url.searchParams.set('payment_status_error', args.error);
  return NextResponse.redirect(url);
}

async function handleBankfulReturn(request: Request, record: Record<string, string>) {
  const requestUrl = new URL(request.url);
  const queryOrderId = requestUrl.searchParams.get('order');
  const queryAccessKey = requestUrl.searchParams.get('key');

  if (!verifyBankfulHostedSignature(record)) {
    return redirectToCheckout(request, {
      orderId: queryOrderId,
      accessKey: queryAccessKey,
      error: 'bankful_signature',
    });
  }

  const result = await applyBankfulHostedPaymentResult({
    record,
    source: 'bankful_return',
    ipnEvent: {
      receivedAt: new Date().toISOString(),
      signature: signatureFromRecord(record),
      valid: true,
      payload: record,
    },
  });

  return redirectToCheckout(request, {
    orderId: result.order?.orderId || queryOrderId,
    accessKey: result.order?.accessKey || queryAccessKey,
    error: result.reviewRequired ? 'bankful_review_required' : null,
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const record = providerRecordFromSearchParams(requestUrl.searchParams);
  return handleBankfulReturn(request, record);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const record = rawBody.trim()
    ? bankfulRecordFromFormText(rawBody)
    : providerRecordFromSearchParams(new URL(request.url).searchParams);

  return handleBankfulReturn(request, record);
}
