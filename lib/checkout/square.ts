import crypto, { timingSafeEqual } from 'node:crypto';

import { apiError } from '@/lib/api/errors';
import { providerFetch } from '@/lib/api/provider-client';
import type {
  CheckoutOrderLine,
  CheckoutShippingAddress,
  CheckoutShippingService,
} from '@/lib/checkout/types';

const SQUARE_PRODUCTION_BASE_URL = 'https://connect.squareup.com';
const SQUARE_SANDBOX_BASE_URL = 'https://connect.squareupsandbox.com';
const SQUARE_API_VERSION = '2026-01-22';
const SQUARE_RESEARCH_MATERIAL_NAMES = [
  'Laboratory Research Material Kit',
  'Laboratory Analytical Material Kit',
  'Laboratory Reference Material Kit',
  'Laboratory Study Material Kit',
  'Laboratory Evaluation Material Kit',
  'Laboratory Research Support Kit',
  'Laboratory Material Assessment Kit',
  'Laboratory Research Material Set',
] as const;
const SQUARE_RECONSTITUTION_NAME = 'Laboratory Reconstitution Solution';
const SQUARE_RESEARCH_DISCLAIMER = 'Research and analytical use only';
const SQUARE_METADATA_VALUE_MAX_LENGTH = 255;
const SQUARE_PAYMENT_NOTE_MAX_LENGTH = 500;
const SQUARE_DESCRIPTION_MAX_LENGTH = 4096;

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

type SquarePaymentLinkTotals = {
  discountAmount?: string | number | null;
  taxAmount?: string | number | null;
  shippingAmount?: string | number | null;
  landedCostAmount?: string | number | null;
  shipmentProtectionAmount?: string | number | null;
  totalAmount?: string | number | null;
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

function toOptionalSquareCents(amount?: string | number | null) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0.009) {
    return null;
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

function compactText(value?: string | null) {
  return value?.trim().replace(/\s+/g, ' ') || '';
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function optionalObject<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function metadataValue(value?: string | number | null) {
  const text = compactText(String(value ?? ''));
  return text ? truncate(text, SQUARE_METADATA_VALUE_MAX_LENGTH) : undefined;
}

function addMetadata(
  metadata: Record<string, string>,
  key: string,
  value?: string | number | null,
) {
  const normalized = metadataValue(value);
  if (normalized && Object.keys(metadata).length < 10) {
    metadata[key] = normalized;
  }
}

function safeSquarePhoneNumber(phone?: string | null) {
  const normalized = compactText(phone).replace(/[^\d+]/g, '');
  return normalized.length >= 7 && normalized.length <= 17 ? normalized : undefined;
}

function squareAddress(address: CheckoutShippingAddress) {
  return optionalObject({
    address_line_1: compactText(address.address1),
    address_line_2: compactText(address.address2),
    locality: compactText(address.city),
    administrative_district_level_1: compactText(address.province),
    postal_code: compactText(address.postalCode),
    country: compactText(address.country).toUpperCase(),
    first_name: compactText(address.firstName),
    last_name: compactText(address.lastName),
  });
}

function formatCustomerName(address: CheckoutShippingAddress) {
  return compactText(`${address.firstName} ${address.lastName}`);
}

function formatShippingAddress(address: CheckoutShippingAddress) {
  return [
    formatCustomerName(address),
    compactText(address.address1),
    compactText(address.address2),
    compactText(address.city),
    compactText(address.province),
    compactText(address.postalCode),
    compactText(address.country).toUpperCase(),
  ]
    .filter(Boolean)
    .join(', ');
}

function squareLineItemName(line: CheckoutOrderLine) {
  const searchable = [
    line.productTitle,
    line.variantTitle,
    line.productHandle,
    line.skuNumber,
  ]
    .map(compactText)
    .join(' ')
    .toLowerCase();

  if (/\b(bac|bacteriostatic|reconstitution|reconstituting|water|solution)\b/.test(searchable)) {
    return SQUARE_RECONSTITUTION_NAME;
  }

  const stableKey = compactText(line.merchandiseId || line.productHandle || line.id || searchable);
  const labelIndex = [...stableKey].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  ) % SQUARE_RESEARCH_MATERIAL_NAMES.length;

  return SQUARE_RESEARCH_MATERIAL_NAMES[labelIndex] || SQUARE_RESEARCH_MATERIAL_NAMES[0];
}

function buildSquareLineItemMetadata(itemClass: string) {
  const metadata: Record<string, string> = {};
  addMetadata(metadata, 'item_class', itemClass);
  addMetadata(metadata, 'research_use', SQUARE_RESEARCH_DISCLAIMER);
  return metadata;
}

function buildSquareOrderLineItems(lines: CheckoutOrderLine[], currencyCode: string) {
  return lines.map((line) => {
    const name = squareLineItemName(line);

    return {
      name,
      quantity: String(line.quantity),
      item_type: 'ITEM',
      note: SQUARE_RESEARCH_DISCLAIMER,
      base_price_money: {
        amount: toSquareCents(line.unitPrice.amount),
        currency: currencyCode,
      },
      metadata: buildSquareLineItemMetadata(name),
    };
  });
}

function buildAdjustmentLineItem(args: {
  name: string;
  note?: string;
  amount?: string | number | null;
  currencyCode: string;
  metadata?: Record<string, string>;
}) {
  const amount = toOptionalSquareCents(args.amount);
  if (!amount) {
    return null;
  }

  return {
    name: args.name,
    quantity: '1',
    item_type: 'ITEM',
    ...(args.note ? { note: args.note } : {}),
    base_price_money: {
      amount,
      currency: args.currencyCode,
    },
    ...(args.metadata ? { metadata: args.metadata } : {}),
  };
}

function buildSquareAdjustmentLineItems(args: {
  totals?: SquarePaymentLinkTotals;
  shippingService?: CheckoutShippingService | null;
  currencyCode: string;
}) {
  const carrier = compactText(args.shippingService?.carrier);
  const service = compactText(args.shippingService?.name || args.shippingService?.serviceCode);
  const fulfillmentNote = compactText(
    [
      carrier || service ? `Fulfillment: ${[carrier, service].filter(Boolean).join(' ')}` : '',
      'Tracking pending until label creation',
      SQUARE_RESEARCH_DISCLAIMER,
    ].filter(Boolean).join('. '),
  );

  return [
    buildAdjustmentLineItem({
      name: 'Fulfillment and shipping',
      note: fulfillmentNote,
      amount: args.totals?.shippingAmount,
      currencyCode: args.currencyCode,
      metadata: optionalObject({
        fulfillment_status: 'pending',
        carrier: metadataValue(carrier),
        service: metadataValue(service),
        tracking_status: 'pending',
      }) as Record<string, string>,
    }),
    buildAdjustmentLineItem({
      name: 'Shipment protection',
      note: 'Fulfillment record support. Tracking pending until label creation.',
      amount: args.totals?.shipmentProtectionAmount,
      currencyCode: args.currencyCode,
    }),
    buildAdjustmentLineItem({
      name: 'Import duties and fees',
      note: 'Landed-cost estimate for fulfillment record.',
      amount: args.totals?.landedCostAmount,
      currencyCode: args.currencyCode,
    }),
    buildAdjustmentLineItem({
      name: 'Estimated tax',
      note: 'Tax amount captured at checkout finalization.',
      amount: args.totals?.taxAmount,
      currencyCode: args.currencyCode,
    }),
  ].filter((lineItem): lineItem is NonNullable<typeof lineItem> => Boolean(lineItem));
}

function buildSquareDiscounts(args: {
  totals?: SquarePaymentLinkTotals;
  amountPaidToDate?: string | number | null;
  currencyCode: string;
  discountCode?: string | null;
}) {
  const discounts = [];
  const discountAmount = toOptionalSquareCents(args.totals?.discountAmount);
  if (discountAmount) {
    discounts.push({
      name: 'Order adjustment',
      type: 'FIXED_AMOUNT',
      scope: 'ORDER',
      amount_money: {
        amount: discountAmount,
        currency: args.currencyCode,
      },
      metadata: optionalObject({
        discount_code: metadataValue(args.discountCode),
      }),
    });
  }

  const paidToDate = toOptionalSquareCents(args.amountPaidToDate);
  if (paidToDate) {
    discounts.push({
      name: 'Prior payment credit',
      type: 'FIXED_AMOUNT',
      scope: 'ORDER',
      amount_money: {
        amount: paidToDate,
        currency: args.currencyCode,
      },
      metadata: {
        carryover_credit: 'true',
      },
    });
  }

  return discounts;
}

function lineItemTotalCents(lineItem: {
  quantity: string;
  base_price_money: { amount: number };
}) {
  const quantity = Number(lineItem.quantity);
  return Number.isFinite(quantity) ? lineItem.base_price_money.amount * quantity : 0;
}

function discountTotalCents(discount: { amount_money?: { amount?: number } }) {
  const amount = discount.amount_money?.amount;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
}

function buildSquareOrderPricing(args: {
  lines: CheckoutOrderLine[];
  totals?: SquarePaymentLinkTotals;
  shippingService?: CheckoutShippingService | null;
  currencyCode: string;
  expectedAmount: string | number;
  amountPaidToDate?: string | number | null;
  discountCode?: string | null;
}) {
  const lineItems = [
    ...buildSquareOrderLineItems(args.lines, args.currencyCode),
    ...buildSquareAdjustmentLineItems({
      totals: args.totals,
      shippingService: args.shippingService,
      currencyCode: args.currencyCode,
    }),
  ];
  const discounts = buildSquareDiscounts({
    totals: args.totals,
    amountPaidToDate: args.amountPaidToDate,
    currencyCode: args.currencyCode,
    discountCode: args.discountCode,
  });

  const expectedAmount = toSquareCents(args.expectedAmount);
  const calculatedAmount =
    lineItems.reduce((sum, lineItem) => sum + lineItemTotalCents(lineItem), 0) -
    discounts.reduce((sum, discount) => sum + discountTotalCents(discount), 0);
  const delta = expectedAmount - calculatedAmount;

  if (delta > 0) {
    lineItems.push({
      name: 'Order balance adjustment',
      quantity: '1',
      item_type: 'ITEM',
      note: 'Reconciles hosted link amount to finalized checkout total.',
      base_price_money: {
        amount: delta,
        currency: args.currencyCode,
      },
      metadata: {
        amount_reconciliation: 'true',
      },
    });
  } else if (delta < 0) {
    discounts.push({
      name: 'Order balance adjustment',
      type: 'FIXED_AMOUNT',
      scope: 'ORDER',
      amount_money: {
        amount: Math.abs(delta),
        currency: args.currencyCode,
      },
      metadata: {
        amount_reconciliation: 'true',
      },
    });
  }

  return {
    lineItems,
    discounts,
  };
}

function buildItemSummary(lines: CheckoutOrderLine[]) {
  const counts = lines.reduce<Record<string, number>>((acc, line) => {
    const name = squareLineItemName(line);
    acc[name] = (acc[name] || 0) + line.quantity;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, quantity]) => `${name} x${quantity}`)
    .join('; ');
}

function buildFulfillmentSummary(shippingService?: CheckoutShippingService | null) {
  const carrier = compactText(shippingService?.carrier);
  const service = compactText(shippingService?.name || shippingService?.serviceCode);
  const carrierText = [carrier, service].filter(Boolean).join(' ');
  return carrierText
    ? `${carrierText}; tracking pending until label creation`
    : 'tracking pending until label creation';
}

function buildSquareOrderMetadata(args: {
  orderReference: string;
  lines: CheckoutOrderLine[];
  shippingService?: CheckoutShippingService | null;
  swellOrderId?: string | null;
  swellOrderNumber?: string | null;
}) {
  const metadata: Record<string, string> = {};
  addMetadata(metadata, 'checkout_reference', args.orderReference);
  addMetadata(metadata, 'payment_status', 'pending');
  addMetadata(metadata, 'fulfillment_status', 'pending');
  addMetadata(metadata, 'fulfillment_carrier', args.shippingService?.carrier);
  addMetadata(metadata, 'fulfillment_service', args.shippingService?.name);
  addMetadata(metadata, 'tracking_status', 'pending');
  addMetadata(metadata, 'research_use', SQUARE_RESEARCH_DISCLAIMER);
  addMetadata(metadata, 'item_summary', buildItemSummary(args.lines));
  addMetadata(metadata, 'swell_order_id', args.swellOrderId);
  addMetadata(metadata, 'swell_order_number', args.swellOrderNumber);
  return metadata;
}

function buildSquareDescription(args: {
  orderReference: string;
  lines: CheckoutOrderLine[];
  shippingAddress?: CheckoutShippingAddress | null;
  shippingService?: CheckoutShippingService | null;
}) {
  const customerName = args.shippingAddress ? formatCustomerName(args.shippingAddress) : '';
  const customerEmail = compactText(args.shippingAddress?.email);
  const customer = [customerName, customerEmail ? `<${customerEmail}>` : '']
    .filter(Boolean)
    .join(' ');

  return truncate(
    [
      `Order reference: ${args.orderReference}`,
      'Payment status: pending',
      `Items: ${buildItemSummary(args.lines)}`,
      customer ? `Customer: ${customer}` : '',
      args.shippingAddress ? `Shipping address: ${formatShippingAddress(args.shippingAddress)}` : '',
      `Fulfillment record: ${buildFulfillmentSummary(args.shippingService)}`,
      SQUARE_RESEARCH_DISCLAIMER,
    ]
      .filter(Boolean)
      .join('\n'),
    SQUARE_DESCRIPTION_MAX_LENGTH,
  );
}

function buildSquarePaymentNote(args: {
  orderReference: string;
  lines: CheckoutOrderLine[];
  shippingService?: CheckoutShippingService | null;
}) {
  return truncate(
    [
      `Order ${args.orderReference}`,
      'Payment status: pending',
      `Items: ${buildItemSummary(args.lines)}`,
      `Fulfillment: ${buildFulfillmentSummary(args.shippingService)}`,
      SQUARE_RESEARCH_DISCLAIMER,
    ].join(' | '),
    SQUARE_PAYMENT_NOTE_MAX_LENGTH,
  );
}

export async function createSquarePaymentLink(args: {
  idempotencyKey: string;
  amount: string | number;
  currencyCode: string;
  orderReference: string;
  lines?: CheckoutOrderLine[];
  totals?: SquarePaymentLinkTotals;
  shippingAddress?: CheckoutShippingAddress | null;
  shippingService?: CheckoutShippingService | null;
  discountCode?: string | null;
  amountPaidToDate?: string | number | null;
  swellOrderId?: string | null;
  swellOrderNumber?: string | null;
  customerEmail?: string | null;
  redirectUrl?: string | null;
}) {
  const currencyCode = args.currencyCode.trim().toUpperCase();
  if (currencyCode !== 'CAD') {
    throw apiError.badRequest('Square fallback payments must be charged in CAD.', {
      receivedCurrency: currencyCode,
    });
  }

  const lines = args.lines?.length ? args.lines : null;
  const buyerEmail = compactText(args.shippingAddress?.email || args.customerEmail);
  const buyerPhoneNumber = safeSquarePhoneNumber(args.shippingAddress?.phone);
  const buyerAddress = args.shippingAddress ? squareAddress(args.shippingAddress) : null;
  const squareOrderPricing = lines
    ? buildSquareOrderPricing({
        lines,
        totals: args.totals,
        shippingService: args.shippingService,
        currencyCode,
        expectedAmount: args.amount,
        amountPaidToDate: args.amountPaidToDate,
        discountCode: args.discountCode,
      })
    : null;
  const prePopulatedData = optionalObject({
    buyer_email: buyerEmail,
    buyer_phone_number: buyerPhoneNumber,
    buyer_address: buyerAddress && Object.keys(buyerAddress).length ? buyerAddress : undefined,
  });
  const checkoutOptions = {
    allow_tipping: false,
    ask_for_shipping_address: Boolean(args.shippingAddress),
    ...(args.redirectUrl ? { redirect_url: args.redirectUrl } : {}),
  };

  const body = {
    idempotency_key: args.idempotencyKey,
    description: lines
      ? buildSquareDescription({
          orderReference: args.orderReference,
          lines,
          shippingAddress: args.shippingAddress,
          shippingService: args.shippingService,
        })
      : `Order ${args.orderReference}`,
    payment_note: lines
      ? buildSquarePaymentNote({
          orderReference: args.orderReference,
          lines,
          shippingService: args.shippingService,
        })
      : `Order ${args.orderReference}`,
    ...(lines
      ? {
          order: {
            location_id: getSquareLocationId(),
            reference_id: args.orderReference,
            line_items: squareOrderPricing ? squareOrderPricing.lineItems : [],
            ...(squareOrderPricing && squareOrderPricing.discounts.length
              ? { discounts: squareOrderPricing.discounts }
              : {}),
            metadata: buildSquareOrderMetadata({
              orderReference: args.orderReference,
              lines,
              shippingService: args.shippingService,
              swellOrderId: args.swellOrderId,
              swellOrderNumber: args.swellOrderNumber,
            }),
          },
        }
      : {
          quick_pay: {
            name: SQUARE_RESEARCH_MATERIAL_NAMES[0],
            price_money: {
              amount: toSquareCents(args.amount),
              currency: currencyCode,
            },
            location_id: getSquareLocationId(),
          },
        }),
    checkout_options: checkoutOptions,
    ...(Object.keys(prePopulatedData).length
      ? { pre_populated_data: prePopulatedData }
      : {}),
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
