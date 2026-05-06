import crypto, { timingSafeEqual } from 'node:crypto';

import { apiError } from '@/lib/api/errors';
import { providerFetch } from '@/lib/api/provider-client';

const SQUARE_PRODUCTION_BASE_URL = 'https://connect.squareup.com';
const SQUARE_SANDBOX_BASE_URL = 'https://connect.squareupsandbox.com';
const SQUARE_API_VERSION = '2026-01-22';

export type SquareMoney = {
  amount?: number;
  currency?: string;
};

export type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  location_id?: string;
  amount_money?: SquareMoney;
  total_money?: SquareMoney;
  approved_money?: SquareMoney;
  receipt_url?: string;
  buyer_email_address?: string;
  note?: string;
  reference_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type SquareOrder = {
  id?: string;
  location_id?: string;
  state?: string;
  total_money?: SquareMoney;
  net_amount_due_money?: SquareMoney;
  tenders?: Array<{
    id?: string;
    payment_id?: string;
    type?: string;
    amount_money?: SquareMoney;
    created_at?: string;
  }>;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
};

export type SquarePaymentLinkResponse = {
  id: string;
  orderId: string;
  url: string;
  longUrl?: string;
  createdAt?: string;
};

type SquareApiError = {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
};

function getSquareEnvironment() {
  const configured = process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase();
  return configured === 'sandbox' ? 'sandbox' : 'production';
}

function getSquareBaseUrl() {
  return getSquareEnvironment() === 'sandbox'
    ? SQUARE_SANDBOX_BASE_URL
    : SQUARE_PRODUCTION_BASE_URL;
}

function getSquareAccessToken() {
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw apiError.providerUnavailable(
      'Square fallback checkout is not configured.',
      { provider: 'square', missing: 'SQUARE_ACCESS_TOKEN' },
      false,
    );
  }
  return token;
}

export function getSquareLocationId() {
  const locationId = process.env.SQUARE_LOCATION_ID?.trim();
  if (!locationId) {
    throw apiError.providerUnavailable(
      'Square fallback checkout is not configured.',
      { provider: 'square', missing: 'SQUARE_LOCATION_ID' },
      false,
    );
  }
  return locationId;
}

function squareHeaders() {
  return {
    Authorization: `Bearer ${getSquareAccessToken()}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_API_VERSION,
  };
}

function toSquareCents(amount: string | number) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw apiError.badRequest('Square payment amount must be greater than zero.');
  }

  return Math.round((parsed + Number.EPSILON) * 100);
}

function squareErrorMessage(errors: SquareApiError[] | undefined, fallback: string) {
  const details = errors
    ?.map((error) => error.detail || error.code)
    .filter(Boolean);

  return details?.length ? `${fallback}: ${details.join('; ')}` : fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function requireString(value: unknown, label: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw apiError.providerUnavailable(
    `Square payment link response is missing ${label}.`,
    { provider: 'square', label },
    false,
  );
}

export async function createSquarePaymentLink(args: {
  idempotencyKey: string;
  amount: string | number;
  currencyCode: string;
  orderReference: string;
  customerEmail?: string | null;
  redirectUrl?: string | null;
}) {
  const currencyCode = args.currencyCode.trim().toUpperCase();
  if (currencyCode !== 'CAD') {
    throw apiError.badRequest('Square fallback payments must be charged in CAD.', {
      receivedCurrency: currencyCode,
    });
  }

  const body = {
    idempotency_key: args.idempotencyKey,
    description: `Order ${args.orderReference}`,
    payment_note: `Order ${args.orderReference}`,
    quick_pay: {
      name: 'Order Payment',
      price_money: {
        amount: toSquareCents(args.amount),
        currency: currencyCode,
      },
      location_id: getSquareLocationId(),
    },
    checkout_options: {
      allow_tipping: false,
      ask_for_shipping_address: false,
      ...(args.redirectUrl ? { redirect_url: args.redirectUrl } : {}),
    },
    pre_populated_data: {
      ...(args.customerEmail ? { buyer_email: args.customerEmail } : {}),
    },
  };

  const response = await providerFetch(
    new URL('/v2/online-checkout/payment-links', getSquareBaseUrl()).toString(),
    {
      provider: 'square',
      operation: 'create_payment_link',
      route: '/v2/online-checkout/payment-links',
      method: 'POST',
      headers: squareHeaders(),
      body: JSON.stringify(body),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiError.providerUnavailable(
      squareErrorMessage(
        (asRecord(payload).errors as SquareApiError[] | undefined),
        'Square payment link creation failed',
      ),
      { provider: 'square', status: response.status, response: payload },
      response.status >= 500,
    );
  }

  const paymentLink = asRecord(asRecord(payload).payment_link);
  return {
    id: requireString(paymentLink.id, 'payment_link.id'),
    orderId: requireString(paymentLink.order_id, 'payment_link.order_id'),
    url: requireString(paymentLink.url || paymentLink.long_url, 'payment_link.url'),
    longUrl: typeof paymentLink.long_url === 'string' ? paymentLink.long_url : undefined,
    createdAt: typeof paymentLink.created_at === 'string' ? paymentLink.created_at : undefined,
  } satisfies SquarePaymentLinkResponse;
}

export async function deleteSquarePaymentLink(paymentLinkId: string) {
  const normalized = paymentLinkId.trim();
  if (!normalized) {
    return null;
  }

  const response = await providerFetch(
    new URL(
      `/v2/online-checkout/payment-links/${encodeURIComponent(normalized)}`,
      getSquareBaseUrl(),
    ).toString(),
    {
      provider: 'square',
      operation: 'delete_payment_link',
      route: '/v2/online-checkout/payment-links/:id',
      method: 'DELETE',
      headers: squareHeaders(),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok && response.status !== 404) {
    throw apiError.providerUnavailable(
      squareErrorMessage(
        (asRecord(payload).errors as SquareApiError[] | undefined),
        'Square payment link deletion failed',
      ),
      { provider: 'square', status: response.status, response: payload },
      response.status >= 500,
    );
  }

  return payload;
}

export async function getSquarePayment(paymentId: string) {
  const response = await providerFetch(
    new URL(`/v2/payments/${encodeURIComponent(paymentId)}`, getSquareBaseUrl()).toString(),
    {
      provider: 'square',
      operation: 'get_payment',
      route: '/v2/payments/:id',
      method: 'GET',
      headers: squareHeaders(),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiError.providerUnavailable(
      squareErrorMessage(
        (asRecord(payload).errors as SquareApiError[] | undefined),
        'Square payment status lookup failed',
      ),
      { provider: 'square', status: response.status, response: payload },
      response.status >= 500,
    );
  }

  const payment = asRecord(asRecord(payload).payment);
  return payment as SquarePayment;
}

export async function getSquareOrder(orderId: string) {
  const response = await providerFetch(
    new URL(`/v2/orders/${encodeURIComponent(orderId)}`, getSquareBaseUrl()).toString(),
    {
      provider: 'square',
      operation: 'get_order',
      route: '/v2/orders/:orderId',
      method: 'GET',
      headers: squareHeaders(),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiError.providerUnavailable(
      squareErrorMessage(
        (asRecord(payload).errors as SquareApiError[] | undefined),
        'Square order lookup failed',
      ),
      { provider: 'square', status: response.status, response: payload },
      response.status >= 500,
    );
  }

  const order = asRecord(asRecord(payload).order);
  return order as SquareOrder;
}

export function squareOrderPaymentId(order: SquareOrder) {
  const paymentId = order.tenders
    ?.map(tender => tender.payment_id?.trim())
    .find(Boolean);

  return paymentId || null;
}

export function mapSquarePaymentStatus(status?: string | null) {
  const normalized = status?.trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'paid';
  if (normalized === 'CANCELED') return 'cancelled';
  if (normalized === 'FAILED') return 'failed';
  if (normalized === 'APPROVED' || normalized === 'PENDING') return 'pending';
  return normalized ? normalized.toLowerCase() : 'pending';
}

export function squarePaymentAmountCents(payment: SquarePayment) {
  const amount =
    payment.total_money?.amount ??
    payment.amount_money?.amount ??
    payment.approved_money?.amount;

  return typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
}

export function squarePaymentCurrency(payment: SquarePayment) {
  return (
    payment.total_money?.currency ||
    payment.amount_money?.currency ||
    payment.approved_money?.currency ||
    ''
  ).trim().toUpperCase();
}

export function expectedSquareAmountCents(amount: string | number) {
  return toSquareCents(amount);
}

export function getSquareWebhookNotificationUrl(requestUrl: string) {
  return process.env.SQUARE_WEBHOOK_NOTIFICATION_URL?.trim() || requestUrl;
}

export function verifySquareWebhookSignature(args: {
  rawBody: string;
  signatureHeader?: string | null;
  notificationUrl: string;
}) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  const signature = args.signatureHeader?.trim();
  if (!signatureKey || !signature) {
    return false;
  }

  const computed = crypto
    .createHmac('sha256', signatureKey)
    .update(`${args.notificationUrl}${args.rawBody}`)
    .digest('base64');

  const actualBuffer = Buffer.from(signature, 'base64');
  const expectedBuffer = Buffer.from(computed, 'base64');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
