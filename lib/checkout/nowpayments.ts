import { createHmac, timingSafeEqual } from 'crypto';
import { NOWPAYMENTS_BASE_URL } from '@/lib/checkout/constants';

type NowPaymentsRequestInit = RequestInit & {
  searchParams?: Record<string, string | number | boolean | undefined>;
};

export type NowPaymentsEstimateResponse = {
  currency_from: string;
  amount_from: number;
  currency_to: string;
  estimated_amount: number;
};

export type NowPaymentsMinAmountResponse = {
  currency_from: string;
  currency_to?: string;
  min_amount: number;
  fiat_equivalent?: number;
};

export type NowPaymentsPaymentResponse = {
  payment_id: number | string;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id?: string;
  order_description?: string;
  ipn_callback_url?: string;
  created_at: string;
  updated_at: string;
  purchase_id?: string;
  amount_received?: number | null;
  payin_extra_id?: string | null;
  network?: string | null;
  network_precision?: number | null;
  time_limit?: number | null;
  expiration_estimate_date?: string | null;
  valid_until?: string | null;
  redirectData?: {
    redirect_url?: string;
  };
};

export type CreateNowPaymentsPaymentInput = {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  ipn_callback_url?: string;
  order_id: string;
  order_description: string;
  is_fixed_rate: boolean;
  is_fee_paid_by_user: boolean;
};

function getNowPaymentsApiKey() {
  const apiKey = process.env.NOWPAYMENTS_API_KEY || process.env.NOW_PRIVATE_KEY;

  if (!apiKey) {
    throw new Error('Missing NOWPAYMENTS_API_KEY or NOW_PRIVATE_KEY.');
  }

  return apiKey;
}

function buildUrl(pathname: string, searchParams?: Record<string, string | number | boolean | undefined>) {
  const normalizedPath = pathname.replace(/^\//, '');
  const url = new URL(normalizedPath, NOWPAYMENTS_BASE_URL);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function nowPaymentsRequest<T>(pathname: string, init: NowPaymentsRequestInit = {}) {
  const { searchParams, headers, ...rest } = init;

  const response = await fetch(buildUrl(pathname, searchParams), {
    ...rest,
    cache: 'no-store',
    headers: {
      'x-api-key': getNowPaymentsApiKey(),
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `NOWPayments request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function getNowPaymentsEstimate(args: {
  amount: number;
  currencyFrom: string;
  currencyTo: string;
}) {
  return nowPaymentsRequest<NowPaymentsEstimateResponse>('/estimate', {
    method: 'GET',
    searchParams: {
      amount: args.amount,
      currency_from: args.currencyFrom,
      currency_to: args.currencyTo,
    },
  });
}

export async function getNowPaymentsMinimumAmount(args: {
  currencyFrom: string;
  fiatEquivalent?: string;
  isFixedRate?: boolean;
  isFeePaidByUser?: boolean;
}) {
  return nowPaymentsRequest<NowPaymentsMinAmountResponse>('/min-amount', {
    method: 'GET',
    searchParams: {
      currency_from: args.currencyFrom,
      fiat_equivalent: args.fiatEquivalent,
      is_fixed_rate: args.isFixedRate ?? false,
      is_fee_paid_by_user: args.isFeePaidByUser ?? false,
    },
  });
}

export async function createNowPaymentsPayment(input: CreateNowPaymentsPaymentInput) {
  return nowPaymentsRequest<NowPaymentsPaymentResponse>('/payment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getNowPaymentsPayment(paymentId: string) {
  return nowPaymentsRequest<NowPaymentsPaymentResponse>(`/payment/${paymentId}`, {
    method: 'GET',
  });
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObject((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function getNowPaymentsIpnSecret() {
  return process.env.NOWPAYMENTS_IPN_SECRET || process.env.NOW_PUBLIC_KEY;
}

export function verifyNowPaymentsSignature(payload: Record<string, unknown>, signature?: string | null) {
  const secret = getNowPaymentsIpnSecret();

  if (!secret || !signature) {
    return false;
  }

  const digest = createHmac('sha512', secret).update(JSON.stringify(sortObject(payload))).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}
