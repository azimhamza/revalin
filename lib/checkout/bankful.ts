import crypto, { timingSafeEqual } from 'node:crypto';

import { apiError } from '@/lib/api/errors';
import { providerFetch } from '@/lib/api/provider-client';

export type BankfulTransactionStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | string;

export type BankfulTransactionResponse = {
  requestAction?: string | null;
  statusName: BankfulTransactionStatus;
  value?: string | null;
  requestId?: string | null;
  recordId?: string | null;
  orderId?: string | null;
  xtlOrderId?: string | null;
  currency?: string | null;
  timestamp?: string | null;
  apiAdvice?: string | null;
  serviceAdvice?: string | null;
  processorAdvice?: string | null;
  errorMessage?: string | null;
  raw: Record<string, string>;
};

export type BankfulCardInput = {
  number: string;
  cvv: string;
  expiryMonth: string;
  expiryYear: string;
  cardholderName?: string;
  billingAddress?: BankfulBillingAddressInput;
};

export type BankfulBillingAddressInput = {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
};

export type BankfulSaleInput = {
  amount: string;
  currency: string;
  xtlOrderId: string;
  card: BankfulCardInput;
  customer: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  billingAddress: BankfulBillingAddressInput;
};

export type BankfulHostedPaymentInput = {
  amount: string;
  currency: string;
  xtlOrderId: string;
  customer: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  billingAddress: BankfulBillingAddressInput;
  shippingAddress?: BankfulBillingAddressInput & {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  urls: {
    cancel: string;
    complete: string;
    failed: string;
    pending: string;
    callback: string;
  };
};

export type BankfulHostedPaymentResponse = {
  redirectUrl: string;
  raw: Record<string, string>;
};

const DEFAULT_BANKFUL_BASE_URL = 'https://api.paybybankful.com';

function getBankfulBaseUrl() {
  const configured =
    process.env.BANKFUL_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BANKFUL_URL?.trim() ||
    DEFAULT_BANKFUL_BASE_URL;

  return configured.replace(/\/$/, '');
}

function getBankfulUsername() {
  const username = process.env.BANKFUL_API_KEY?.trim();
  if (!username) {
    throw apiError.providerUnavailable(
      'Bankful credentials are not configured.',
      { provider: 'bankful', missing: 'BANKFUL_API_KEY' },
      false,
    );
  }

  return username;
}

function getBankfulCredentials() {
  const username = getBankfulUsername();
  const password = process.env.BANKFUL_SECRET_KEY?.trim();

  if (!password) {
    throw apiError.providerUnavailable(
      'Bankful credentials are not configured.',
      { provider: 'bankful', missing: 'BANKFUL_SECRET_KEY' },
      false,
    );
  }

  return { username, password };
}

function getBankfulHostedSecret() {
  const secret =
    process.env.BANKFUL_HOSTED_SECRET?.trim() ||
    process.env.BANKFUL_SECRET_KEY?.trim();

  if (!secret) {
    throw apiError.providerUnavailable(
      'Bankful hosted checkout signing secret is not configured.',
      { provider: 'bankful', missing: 'BANKFUL_HOSTED_SECRET' },
      false,
    );
  }

  return secret;
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeExpiryMonth(value: string) {
  const digits = normalizeDigits(value).slice(0, 2);
  return digits.padStart(2, '0');
}

function normalizeExpiryYear(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length === 2) return `20${digits}`;
  return digits.slice(0, 4);
}

function normalizeAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw apiError.badRequest('Invalid Bankful transaction amount.');
  }

  return parsed.toFixed(2);
}

function nonEmpty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatBankfulStreetAddress(address: BankfulBillingAddressInput) {
  return [address.address1, address.address2]
    .map((value) => nonEmpty(value))
    .filter(Boolean)
    .join(', ');
}

function responseRecordFromJson(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === 'object') {
      result[key] = JSON.stringify(rawValue);
    } else {
      result[key] = String(rawValue);
    }
  }
  return result;
}

function responseRecordFromText(text: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    return responseRecordFromJson(JSON.parse(trimmed));
  } catch {
    // Bankful direct transaction examples are field maps, but tolerate form-style
    // responses so diagnostics keep working if the content type is wrong.
  }

  const params = new URLSearchParams(trimmed);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });

  if (Object.keys(result).length > 0) {
    return result;
  }

  return { ERROR_MESSAGE: trimmed };
}

async function parseBankfulResponse(response: Response) {
  const text = await response.text();
  return responseRecordFromText(text);
}

export function bankfulRecordFromSearchParams(params: URLSearchParams) {
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function bankfulRecordFromFormText(text: string) {
  return bankfulRecordFromSearchParams(new URLSearchParams(text));
}

function field(record: Record<string, string>, key: string) {
  return nonEmpty(record[key]) ?? null;
}

export function parseBankfulTransactionResponse(
  record: Record<string, string>,
): BankfulTransactionResponse {
  const statusName =
    field(record, 'TRANS_STATUS_NAME') ||
    field(record, 'status') ||
    field(record, 'STATUS') ||
    (field(record, 'errorMessage') || field(record, 'ERROR_MESSAGE') ? 'DECLINED' : '');

  return {
    requestAction: field(record, 'REQUEST_ACTION'),
    statusName: statusName.toUpperCase(),
    value: field(record, 'TRANS_VALUE'),
    requestId: field(record, 'TRANS_REQUEST_ID'),
    recordId: field(record, 'TRANS_RECORD_ID'),
    orderId: field(record, 'TRANS_ORDER_ID'),
    xtlOrderId: field(record, 'XTL_ORDER_ID'),
    currency: field(record, 'TRANS_CUR'),
    timestamp: field(record, 'TIMESTAMP'),
    apiAdvice: field(record, 'API_ADVICE'),
    serviceAdvice: field(record, 'SERVICE_ADVICE'),
    processorAdvice: field(record, 'PROCESSOR_ADVICE'),
    errorMessage: field(record, 'ERROR_MESSAGE') || field(record, 'errorMessage'),
    raw: record,
  };
}

export function mapBankfulStatus(status?: string | null) {
  const normalized = status?.trim().toUpperCase();
  if (normalized === 'APPROVED') return 'paid';
  if (normalized === 'PENDING') return 'pending';
  if (normalized === 'DECLINED') return 'declined';
  return 'failed';
}

export function bankfulResponseSnapshot(response: BankfulTransactionResponse) {
  return {
    requestAction: response.requestAction ?? null,
    statusName: response.statusName,
    value: response.value ?? null,
    requestId: response.requestId ?? null,
    recordId: response.recordId ?? null,
    orderId: response.orderId ?? null,
    xtlOrderId: response.xtlOrderId ?? null,
    currency: response.currency ?? null,
    timestamp: response.timestamp ?? null,
    apiAdvice: response.apiAdvice ?? null,
    serviceAdvice: response.serviceAdvice ?? null,
    processorAdvice: response.processorAdvice ?? null,
    errorMessage: response.errorMessage ?? null,
  };
}

export function createBankfulHostedSignature(
  payload: Record<string, string | number | null | undefined>,
  secret = getBankfulHostedSecret(),
) {
  const message = Object.entries(payload)
    .filter(([key, value]) => (
      key.toLowerCase() !== 'signature' &&
      value !== undefined &&
      value !== null &&
      String(value) !== ''
    ))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${String(value)}`)
    .join('');

  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function getBankfulSignature(record: Record<string, string>) {
  return field(record, 'SIGNATURE') || field(record, 'signature');
}

export function verifyBankfulHostedSignature(
  record: Record<string, string>,
  secret = getBankfulHostedSecret(),
) {
  const signature = getBankfulSignature(record);
  if (!signature) return false;

  const expected = createBankfulHostedSignature(record, secret);
  const actualBuffer = Buffer.from(signature.trim().toLowerCase(), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length || actualBuffer.length === 0) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function bankfulHostedErrorMessage(record: Record<string, string>) {
  return (
    field(record, 'errorMessage') ||
    field(record, 'ERROR_MESSAGE') ||
    field(record, 'PROCESSOR_ADVICE') ||
    field(record, 'SERVICE_ADVICE') ||
    field(record, 'API_ADVICE')
  );
}

export async function createBankfulHostedPayment(
  input: BankfulHostedPaymentInput,
): Promise<BankfulHostedPaymentResponse> {
  const username = getBankfulUsername();
  const bodyFields: Record<string, string | undefined> = {
    req_username: username,
    transaction_type: 'CAPTURE',
    amount: normalizeAmount(input.amount),
    request_currency: input.currency.trim().toUpperCase(),
    xtl_order_id: input.xtlOrderId,
    cust_fname: nonEmpty(input.customer.firstName),
    cust_lname: nonEmpty(input.customer.lastName),
    cust_email: nonEmpty(input.customer.email),
    cust_phone: nonEmpty(input.customer.phone)?.replace(/[^\d+]/g, ''),
    bill_addr: nonEmpty(formatBankfulStreetAddress(input.billingAddress)),
    bill_addr_2: nonEmpty(input.billingAddress.address2),
    bill_addr_city: nonEmpty(input.billingAddress.city),
    bill_addr_state: nonEmpty(input.billingAddress.province),
    bill_addr_zip: nonEmpty(input.billingAddress.postalCode),
    bill_addr_country: nonEmpty(input.billingAddress.country),
    ship_fname: nonEmpty(input.shippingAddress?.firstName),
    ship_lname: nonEmpty(input.shippingAddress?.lastName),
    ship_email: nonEmpty(input.shippingAddress?.email),
    ship_phone: nonEmpty(input.shippingAddress?.phone)?.replace(/[^\d+]/g, ''),
    ship_addr: input.shippingAddress
      ? nonEmpty(formatBankfulStreetAddress(input.shippingAddress))
      : undefined,
    ship_addr_2: nonEmpty(input.shippingAddress?.address2),
    ship_addr_city: nonEmpty(input.shippingAddress?.city),
    ship_addr_state: nonEmpty(input.shippingAddress?.province),
    ship_addr_zip: nonEmpty(input.shippingAddress?.postalCode),
    ship_addr_country: nonEmpty(input.shippingAddress?.country),
    url_cancel: input.urls.cancel,
    url_complete: input.urls.complete,
    url_failed: input.urls.failed,
    url_pending: input.urls.pending,
    url_callback: input.urls.callback,
    cart_name: 'Hosted-Page',
    return_redirect_url: 'Y',
  };

  const signature = createBankfulHostedSignature(bodyFields);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(bodyFields)) {
    if (value) body.set(key, value);
  }
  body.set('signature', signature);

  const response = await providerFetch(
    `${getBankfulBaseUrl()}/front-calls/go-in/hosted-page-pay`,
    {
      provider: 'bankful',
      operation: 'hosted-payment',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      cache: 'no-store',
      retryable: false,
      timeoutMs: 15_000,
    },
  );

  const record = await parseBankfulResponse(response);
  const redirectUrl = field(record, 'redirect_url') || field(record, 'REDIRECT_URL');
  const errorMessage = bankfulHostedErrorMessage(record);
  const hostedStatus = field(record, 'status') || field(record, 'STATUS');

  if (!response.ok || !redirectUrl || hostedStatus?.toLowerCase() === 'error') {
    throw apiError.providerUnavailable(
      errorMessage || `Bankful hosted checkout failed with status ${response.status}.`,
      {
        provider: 'bankful',
        status: response.status,
        response: record,
      },
      response.status >= 500,
    );
  }

  return {
    redirectUrl,
    raw: record,
  };
}

export async function createBankfulSale(
  input: BankfulSaleInput,
): Promise<BankfulTransactionResponse> {
  const credentials = getBankfulCredentials();
  const cardNumber = normalizeDigits(input.card.number);
  const cvv = normalizeDigits(input.card.cvv);
  const expiryMonth = normalizeExpiryMonth(input.card.expiryMonth);
  const expiryYear = normalizeExpiryYear(input.card.expiryYear);

  if (cardNumber.length < 12 || cvv.length < 3 || !expiryMonth || expiryYear.length !== 4) {
    throw apiError.badRequest('Enter valid card details.');
  }

  const body = new URLSearchParams();
  body.set('req_username', credentials.username);
  body.set('req_password', credentials.password);
  body.set('transaction_type', 'CAPTURE');
  body.set('pmt_numb', cardNumber);
  body.set('pmt_key', cvv);
  body.set('pmt_expiry', `${expiryMonth}/${expiryYear}`);
  body.set('amount', normalizeAmount(input.amount));
  body.set('request_currency', input.currency.trim().toUpperCase());
  body.set('xtl_order_id', input.xtlOrderId);

  const optionalFields: Record<string, string | undefined> = {
    cust_fname: nonEmpty(input.customer.firstName),
    cust_lname: nonEmpty(input.customer.lastName),
    cust_email: nonEmpty(input.customer.email),
    cust_phone: nonEmpty(input.customer.phone)?.replace(/[^\d+]/g, ''),
    bill_addr: nonEmpty(formatBankfulStreetAddress(input.billingAddress)),
    bill_addr_city: nonEmpty(input.billingAddress.city),
    bill_addr_state: nonEmpty(input.billingAddress.province),
    bill_addr_zip: nonEmpty(input.billingAddress.postalCode),
    bill_addr_country: nonEmpty(input.billingAddress.country),
  };

  for (const [key, value] of Object.entries(optionalFields)) {
    if (value) body.set(key, value);
  }

  const response = await providerFetch(
    `${getBankfulBaseUrl()}/api/transaction/api`,
    {
      provider: 'bankful',
      operation: 'capture',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      cache: 'no-store',
      retryable: false,
      timeoutMs: 15_000,
    },
  );

  const record = await parseBankfulResponse(response);
  const parsed = parseBankfulTransactionResponse(record);

  if (!response.ok) {
    throw apiError.providerUnavailable(
      parsed.errorMessage || `Bankful capture failed with status ${response.status}.`,
      {
        provider: 'bankful',
        status: response.status,
        response: bankfulResponseSnapshot(parsed),
      },
      false,
    );
  }

  return parsed;
}

export async function getBankfulTransactionStatus(
  transactionRecordId: string,
): Promise<BankfulTransactionResponse> {
  const credentials = getBankfulCredentials();
  const body = new URLSearchParams();
  body.set('req_username', credentials.username);
  body.set('req_password', credentials.password);

  const response = await providerFetch(
    `${getBankfulBaseUrl()}/api/transaction-report/transaction-status/${encodeURIComponent(transactionRecordId)}`,
    {
      provider: 'bankful',
      operation: 'transaction-status',
      method: 'POST',
      headers: {
        // Bankful documents this as application/json, but the official code
        // examples send a form-style body with this header.
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
      },
      body,
      cache: 'no-store',
      retryable: true,
      timeoutMs: 10_000,
    },
  );

  const record = await parseBankfulResponse(response);
  const nested = record.data ? responseRecordFromText(record.data) : record;
  const parsed = parseBankfulTransactionResponse(nested);

  if (!response.ok) {
    throw apiError.providerUnavailable(
      parsed.errorMessage || `Bankful status lookup failed with status ${response.status}.`,
      {
        provider: 'bankful',
        status: response.status,
        response: bankfulResponseSnapshot(parsed),
      },
    );
  }

  return parsed;
}
