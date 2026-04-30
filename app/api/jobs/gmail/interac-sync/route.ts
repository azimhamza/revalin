import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { syncGmailInteracMessages } from '@/lib/checkout/interac';

export const dynamic = 'force-dynamic';

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() || '';
  const prefix = 'Bearer ';
  return authorization.startsWith(prefix) ? authorization.slice(prefix.length).trim() : '';
}

function isAuthorized(request: Request, expectedSecret: string) {
  const token = getBearerToken(request);
  if (!token) return false;

  const expected = Buffer.from(expectedSecret);
  const actual = Buffer.from(token);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function handler(request: Request) {
  const requestId = request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return NextResponse.json(
      {
        error: {
          code: 'configuration_error',
          message: 'CRON_SECRET is not configured.',
          retryable: false,
        },
        requestId,
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }

  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Unauthorized.',
          retryable: false,
        },
        requestId,
      },
      { status: 401, headers: { 'x-request-id': requestId } },
    );
  }

  const result = await syncGmailInteracMessages();

  return NextResponse.json(
    { data: result, requestId },
    { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
  );
}

export const GET = handler;
export const POST = handler;
