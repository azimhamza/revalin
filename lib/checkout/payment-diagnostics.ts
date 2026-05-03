import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders, checkoutDrafts } from '@/lib/db/schema';
import {
  getAllOpenPanelEvents,
  getOpenPanelMissingConfig,
  hasOpenPanelCredentials,
  type OpenPanelEventRecord,
} from '@/lib/analytics/openpanel';
import { getNowPaymentsPayment } from '@/lib/checkout/nowpayments';
import { checkShieldClimbPaymentStatus } from '@/lib/checkout/shieldclimb';
import { getSwellOrder } from '@/lib/checkout/swell-order-management';
import {
  isInteracPayment,
  isNowPaymentsPayment,
  isShieldClimbPayment,
  type CheckoutOrderPayment,
  type CheckoutOrderRecord,
} from '@/lib/checkout/types';

type CheckoutOrderRow = typeof checkoutOrders.$inferSelect;
type CheckoutDraftRow = typeof checkoutDrafts.$inferSelect;

export type PaymentDiagnosticSeverity = 'success' | 'warning' | 'danger' | 'neutral';

export type PaymentDiagnosticTimelineItem = {
  label: string;
  status: PaymentDiagnosticSeverity;
  at?: string | null;
  detail: string;
};

export type PaymentDiagnosticResult = {
  query: string;
  verdict: {
    status: PaymentDiagnosticSeverity;
    label: string;
    detail: string;
  };
  order: {
    orderId: string;
    orderNumber: string;
    email: string | null;
    customerName: string;
    createdAt: string;
    updatedAt: string;
    localPaymentStatus: string | null;
    fulfillmentStatus: string | null;
    currencyCode: string;
    totalAmount: string;
    itemCount: number;
    provider: string;
    paymentMethod: string | null;
  } | null;
  payment: Record<string, unknown> | null;
  swell: {
    id: string | null;
    number: string | null;
    status: string | null;
    paid: boolean | null;
    paymentTotal: number | null;
    balance: number | null;
    paymentCount: number;
    payments: Array<{
      id: string | null;
      status: string | null;
      amount: number | null;
      method: string | null;
      gateway: string | null;
      createdAt: string | null;
    }>;
    checked: boolean;
    error: string | null;
  } | null;
  provider: {
    provider: string;
    checked: boolean;
    status: string | null;
    detail: string;
    raw: Record<string, unknown> | null;
    error: string | null;
  } | null;
  drafts: Array<{
    id: string;
    status: string;
    paymentMethod: string | null;
    paymentCurrency: string | null;
    finalizedOrderId: string | null;
    paymentCompleted: string | null;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
  }>;
  analytics: {
    configured: boolean;
    missingConfig: string[];
    events: Array<{
      id: string | null;
      name: string;
      at: string | null;
      properties: Record<string, unknown>;
    }>;
  };
  timeline: PaymentDiagnosticTimelineItem[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value?: string | null) {
  return value?.trim().toLowerCase() || '';
}

function paymentProvider(payment: CheckoutOrderPayment | null) {
  return payment?.provider || 'unknown';
}

function paymentMethod(payment: CheckoutOrderPayment | null) {
  if (!payment) return null;
  if ('paymentMethod' in payment && payment.paymentMethod) return payment.paymentMethod;
  if (isNowPaymentsPayment(payment)) return 'crypto';
  if (isShieldClimbPayment(payment)) return 'card_debit';
  if (isInteracPayment(payment)) return 'interac';
  return null;
}

function orderNumberFromSwell(swell: unknown, fallback: string) {
  const record = asRecord(swell);
  return getString(record.orderNumber) || getString(record.order_number) || fallback;
}

function itemCount(lines: unknown) {
  return Array.isArray(lines)
    ? lines.reduce((sum, line) => sum + Math.max(1, Number(asRecord(line).quantity || 1)), 0)
    : 0;
}

function customerName(shippingAddress: unknown) {
  const address = asRecord(shippingAddress);
  return [address.firstName, address.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

function safePaymentSnapshot(payment: CheckoutOrderPayment | null) {
  if (!payment) return null;

  if (isNowPaymentsPayment(payment)) {
    return {
      provider: payment.provider,
      paymentMethod: payment.paymentMethod ?? 'crypto',
      status: payment.status,
      paymentId: payment.paymentId ?? null,
      purchaseId: payment.purchaseId ?? null,
      paymentCurrency: payment.paymentCurrency,
      network: payment.network ?? null,
      payAmount: payment.payAmount ?? null,
      amountReceived: payment.amountReceived ?? null,
      validUntil: payment.validUntil ?? null,
      expirationEstimateDate: payment.expirationEstimateDate ?? null,
      createdAt: payment.createdAt ?? null,
      updatedAt: payment.updatedAt ?? null,
      attemptAmount: payment.attemptAmount ?? null,
      amountPaidToDate: payment.amountPaidToDate ?? null,
    };
  }

  if (isShieldClimbPayment(payment)) {
    return {
      provider: payment.provider,
      paymentMethod: payment.paymentMethod ?? 'card_debit',
      status: payment.status,
      paymentCurrency: payment.paymentCurrency ?? null,
      expectedValueCoin: payment.expectedValueCoin ?? null,
      valueCoinReceived: payment.valueCoinReceived ?? null,
      coinReceived: payment.coinReceived ?? null,
      txidInPresent: Boolean(payment.txidIn),
      txidOutPresent: Boolean(payment.txidOut),
      callbackVerifiedAt: payment.callbackVerifiedAt ?? null,
      createdAt: payment.createdAt ?? null,
      updatedAt: payment.updatedAt ?? null,
      attemptAmount: payment.attemptAmount ?? null,
      amountPaidToDate: payment.amountPaidToDate ?? null,
    };
  }

  return {
    provider: payment.provider,
    paymentMethod: payment.paymentMethod ?? 'interac',
    status: payment.status,
    cadAmount: payment.cadAmount,
    submittedAt: payment.submittedAt ?? null,
    confirmedAt: payment.confirmedAt ?? null,
    receivedAmount: payment.receivedAmount ?? null,
    senderMismatch: payment.senderMismatch ?? null,
    createdAt: payment.createdAt ?? null,
    updatedAt: payment.updatedAt ?? null,
  };
}

function rowToOrderRecord(row: CheckoutOrderRow): CheckoutOrderRecord {
  const storedPayment = { ...(row.payment as CheckoutOrderPayment & { __processing?: unknown }) };
  const processing = storedPayment.__processing as CheckoutOrderRecord['processing'];
  delete storedPayment.__processing;

  return {
    orderId: row.orderId,
    accessKey: row.accessKey,
    cartId: row.cartId || '',
    userId: row.userId ?? null,
    currencyCode: row.currencyCode,
    shippingAddress: row.shippingAddress as CheckoutOrderRecord['shippingAddress'],
    shippingService: (row.shippingService as CheckoutOrderRecord['shippingService']) ?? undefined,
    lines: row.lines as CheckoutOrderRecord['lines'],
    totals: row.totals as CheckoutOrderRecord['totals'],
    payment: storedPayment as CheckoutOrderPayment,
    swell: row.swell as CheckoutOrderRecord['swell'],
    shipengine: (row.shipengine as CheckoutOrderRecord['shipengine']) ?? undefined,
    affiliate: (row.affiliate as CheckoutOrderRecord['affiliate']) ?? undefined,
    promoter: (row.promoter as CheckoutOrderRecord['promoter']) ?? undefined,
    processing,
    fulfillmentStatus: (row.fulfillmentStatus as CheckoutOrderRecord['fulfillmentStatus']) ?? null,
    ipnEvents: (row.ipnEvents as CheckoutOrderRecord['ipnEvents']) ?? undefined,
    latestError: row.latestError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findOrderRow(query: string) {
  const normalized = query.trim();
  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(sql`
      ${checkoutOrders.orderId} = ${normalized}
      or ${checkoutOrders.swell}->>'orderNumber' = ${normalized}
      or ${checkoutOrders.swell}->>'order_number' = ${normalized}
      or ${checkoutOrders.swell}->>'orderId' = ${normalized}
    `)
    .orderBy(sql`${checkoutOrders.createdAt} desc`)
    .limit(1);

  return rows[0] ?? null;
}

async function findDraftRows(order: CheckoutOrderRecord) {
  return db
    .select()
    .from(checkoutDrafts)
    .where(sql`
      ${checkoutDrafts.finalizedOrderId} = ${order.orderId}
      or ${checkoutDrafts.cartId} = ${order.cartId || '__none__'}
      or ${checkoutDrafts.email} = ${order.shippingAddress.email}
    `)
    .orderBy(sql`${checkoutDrafts.updatedAt} desc`)
    .limit(5);
}

function draftSummary(row: CheckoutDraftRow) {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.paymentMethod ?? null,
    paymentCurrency: row.paymentCurrency ?? null,
    finalizedOrderId: row.finalizedOrderId ?? null,
    paymentCompleted: toIso(row.paymentCompleted),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: toIso(row.expiresAt),
  };
}

async function checkSwell(order: CheckoutOrderRecord): Promise<PaymentDiagnosticResult['swell']> {
  const swellOrderId = order.swell.orderId;
  if (!swellOrderId) {
    return null;
  }

  try {
    const swellOrder = await getSwellOrder(swellOrderId, { expand: 'payments' });
    const swellOrderRecord = asRecord(swellOrder);
    const rawPayments = swellOrderRecord.payments;
    const paymentsContainer = asRecord(rawPayments);
    const paymentRows = Array.isArray(paymentsContainer.results)
      ? paymentsContainer.results
      : Array.isArray(rawPayments)
        ? rawPayments
        : [];

    return {
      id: getString(swellOrder.id),
      number: getString(swellOrder.number),
      status: getString(swellOrderRecord.status),
      paid: typeof swellOrderRecord.paid === 'boolean' ? swellOrderRecord.paid : null,
      paymentTotal: getNumber(swellOrderRecord.payment_total),
      balance: getNumber(swellOrderRecord.balance),
      paymentCount: paymentRows.length,
      payments: paymentRows.map((payment: unknown) => {
        const record = asRecord(payment);
        return {
          id: getString(record.id),
          status: getString(record.status),
          amount: getNumber(record.amount),
          method: getString(record.method),
          gateway: getString(record.gateway),
          createdAt: getString(record.date_created),
        };
      }),
      checked: true,
      error: null,
    };
  } catch (error) {
    return {
      id: swellOrderId,
      number: order.swell.orderNumber ?? null,
      status: null,
      paid: null,
      paymentTotal: null,
      balance: null,
      paymentCount: 0,
      payments: [],
      checked: false,
      error: error instanceof Error ? error.message : 'Unable to check Swell.',
    };
  }
}

async function checkProvider(order: CheckoutOrderRecord): Promise<PaymentDiagnosticResult['provider']> {
  const payment = order.payment;

  if (isNowPaymentsPayment(payment)) {
    if (!payment.paymentId) {
      return {
        provider: payment.provider,
        checked: false,
        status: null,
        detail: 'NOWPayments payment id is missing.',
        raw: null,
        error: 'Missing payment id.',
      };
    }

    try {
      const result = await getNowPaymentsPayment(payment.paymentId);
      return {
        provider: payment.provider,
        checked: true,
        status: result.payment_status,
        detail: `NOWPayments reports ${result.payment_status}.`,
        raw: {
          paymentId: result.payment_id,
          paymentStatus: result.payment_status,
          priceAmount: result.price_amount,
          priceCurrency: result.price_currency,
          payAmount: result.pay_amount,
          payCurrency: result.pay_currency,
          amountReceived: result.amount_received ?? null,
          actuallyPaid: asRecord(result).actually_paid ?? null,
          validUntil: result.valid_until ?? null,
          expirationEstimateDate: result.expiration_estimate_date ?? null,
          createdAt: result.created_at,
          updatedAt: result.updated_at,
          outcomeAmount: asRecord(result).outcome_amount ?? null,
          outcomeCurrency: asRecord(result).outcome_currency ?? null,
        },
        error: null,
      };
    } catch (error) {
      return {
        provider: payment.provider,
        checked: false,
        status: null,
        detail: 'Unable to check NOWPayments.',
        raw: null,
        error: error instanceof Error ? error.message : 'Unable to check NOWPayments.',
      };
    }
  }

  if (isShieldClimbPayment(payment)) {
    try {
      const result = await checkShieldClimbPaymentStatus(payment.ipnToken);
      return {
        provider: payment.provider,
        checked: true,
        status: result.status,
        detail: `ShieldClimb reports ${result.status}.`,
        raw: {
          status: result.status,
          valueCoin: result.value_coin ?? null,
          coin: result.coin ?? null,
          txidOutPresent: Boolean(result.txid_out),
        },
        error: null,
      };
    } catch (error) {
      return {
        provider: payment.provider,
        checked: false,
        status: null,
        detail: 'Unable to check ShieldClimb.',
        raw: null,
        error: error instanceof Error ? error.message : 'Unable to check ShieldClimb.',
      };
    }
  }

  return {
    provider: payment.provider,
    checked: false,
    status: payment.status,
    detail: 'Interac status is reviewed from local email/admin records.',
    raw: null,
    error: null,
  };
}

function eventName(event: OpenPanelEventRecord) {
  return String(event.name || event.event || 'event');
}

function eventAt(event: OpenPanelEventRecord) {
  return (
    getString(event.timestamp) ||
    getString(event.createdAt) ||
    getString(event.created_at) ||
    getString(event.time)
  );
}

function eventProperties(event: OpenPanelEventRecord) {
  return asRecord(event.properties);
}

function eventMatchesOrder(event: OpenPanelEventRecord, order: CheckoutOrderRecord) {
  const properties = eventProperties(event);
  const candidates = [
    properties.orderId,
    properties.order_id,
    properties.checkout_reference,
    properties.swellOrderNumber,
    properties.orderNumber,
    properties.order_number,
  ].map((value) => (typeof value === 'string' ? value.trim() : String(value || '')));

  return candidates.includes(order.orderId) || candidates.includes(order.swell.orderNumber || '');
}

async function getAnalytics(order: CheckoutOrderRecord): Promise<PaymentDiagnosticResult['analytics']> {
  const configured = hasOpenPanelCredentials();
  const missingConfig = getOpenPanelMissingConfig();

  if (!configured) {
    return { configured, missingConfig, events: [] };
  }

  const createdAt = Date.parse(order.createdAt);
  const start = Number.isFinite(createdAt)
    ? new Date(createdAt - 60 * 60 * 1000).toISOString()
    : undefined;
  const end = new Date().toISOString();

  const [initiated, purchases] = await Promise.all([
    getAllOpenPanelEvents({
      event: 'checkout_payment_initiated',
      start,
      end,
      limit: 100,
      maxPages: 2,
    }),
    getAllOpenPanelEvents({
      event: 'purchase',
      start,
      end,
      limit: 100,
      maxPages: 2,
    }),
  ]);

  const events = [...initiated, ...purchases]
    .filter((event) => eventMatchesOrder(event, order))
    .sort((a, b) => String(eventAt(a) || '').localeCompare(String(eventAt(b) || '')))
    .map((event) => ({
      id: getString(event.id),
      name: eventName(event),
      at: eventAt(event),
      properties: eventProperties(event),
    }));

  return { configured, missingConfig, events };
}

function buildVerdict(args: {
  order: CheckoutOrderRecord;
  provider: PaymentDiagnosticResult['provider'];
  swell: PaymentDiagnosticResult['swell'];
}): PaymentDiagnosticResult['verdict'] {
  const localStatus = normalizeStatus(args.order.payment.status);
  const providerStatus = normalizeStatus(args.provider?.status);
  const swellPaid = args.swell?.paid === true || Number(args.swell?.paymentTotal || 0) > 0;
  const payment = args.order.payment;

  if (providerStatus === 'paid' || providerStatus === 'finished' || localStatus === 'paid' || localStatus === 'finished') {
    if (!swellPaid || (localStatus !== 'paid' && localStatus !== 'finished')) {
      return {
        status: 'warning',
        label: 'Provider paid, local sync needs review',
        detail: 'The provider reports success, but Swell/local state is not fully reconciled.',
      };
    }

    return {
      status: 'success',
      label: 'Paid',
      detail: 'Provider, local checkout, and Swell payment state indicate payment completed.',
    };
  }

  if (isNowPaymentsPayment(payment)) {
    const raw = args.provider?.raw ?? {};
    const actuallyPaid = getNumber(raw.actuallyPaid);
    const amountReceived = getNumber(raw.amountReceived);
    const paidAmount = Math.max(actuallyPaid ?? 0, amountReceived ?? 0);

    if (providerStatus === 'expired' && paidAmount <= 0) {
      return {
        status: 'danger',
        label: 'Expired with no crypto sent',
        detail: 'NOWPayments expired the payment and reports zero paid. The customer likely opened checkout and abandoned.',
      };
    }

    if (paidAmount > 0 && providerStatus !== 'finished') {
      return {
        status: 'warning',
        label: 'Crypto amount received but not completed',
        detail: 'NOWPayments shows funds received, but the payment is not successful. This may be underpaid, late, or still reconciling.',
      };
    }

    if (providerStatus && providerStatus !== localStatus) {
      return {
        status: 'warning',
        label: 'Local payment status is stale',
        detail: `NOWPayments reports ${providerStatus}, while the local order is ${localStatus || 'unknown'}.`,
      };
    }
  }

  if (isShieldClimbPayment(payment) && providerStatus === 'unpaid') {
    return {
      status: 'danger',
      label: 'Unpaid hosted checkout',
      detail: 'ShieldClimb reports unpaid and Swell has no payment. The customer likely left before completing card checkout.',
    };
  }

  if (isInteracPayment(payment) && ['awaiting_transfer', 'submitted', 'under_review'].includes(localStatus)) {
    return {
      status: 'warning',
      label: 'Interac awaiting review',
      detail: 'This order depends on Interac email/admin review rather than an external crypto provider check.',
    };
  }

  return {
    status: 'neutral',
    label: localStatus || 'Unknown',
    detail: 'No successful payment evidence found in the available local, provider, or Swell checks.',
  };
}

function buildTimeline(args: {
  order: CheckoutOrderRecord;
  provider: PaymentDiagnosticResult['provider'];
  swell: PaymentDiagnosticResult['swell'];
  analytics: PaymentDiagnosticResult['analytics'];
  drafts: PaymentDiagnosticResult['drafts'];
}): PaymentDiagnosticTimelineItem[] {
  const ipnCount = args.order.ipnEvents?.length ?? 0;
  const providerStatus = normalizeStatus(args.provider?.status);
  const localStatus = normalizeStatus(args.order.payment.status);

  return [
    {
      label: 'Checkout order created',
      status: 'neutral',
      at: args.order.createdAt,
      detail: `${args.order.orderId} was created for ${args.order.totals.totalAmount.amount} ${args.order.currencyCode}.`,
    },
    {
      label: 'Payment initiated telemetry',
      status: args.analytics.events.some((event) => event.name === 'checkout_payment_initiated')
        ? 'success'
        : 'warning',
      at: args.analytics.events.find((event) => event.name === 'checkout_payment_initiated')?.at ?? null,
      detail: args.analytics.configured
        ? args.analytics.events.some((event) => event.name === 'checkout_payment_initiated')
          ? 'OpenPanel has a checkout_payment_initiated event for this order.'
          : 'No matching checkout_payment_initiated event was found in OpenPanel.'
        : `OpenPanel read API is not configured: ${args.analytics.missingConfig.join(', ') || 'missing config'}.`,
    },
    {
      label: 'Provider live check',
      status:
        providerStatus === 'paid' || providerStatus === 'finished'
          ? 'success'
          : providerStatus === 'expired' || providerStatus === 'failed' || providerStatus === 'unpaid'
            ? 'danger'
            : args.provider?.checked
              ? 'warning'
              : 'neutral',
      at: getString(args.provider?.raw?.updatedAt) ?? null,
      detail: args.provider?.detail ?? 'No provider check is available for this payment method.',
    },
    {
      label: 'Local callback/IPN',
      status: ipnCount > 0 ? 'success' : 'warning',
      at: args.order.ipnEvents?.[ipnCount - 1]?.receivedAt ?? null,
      detail: ipnCount > 0
        ? `${ipnCount} provider callback event${ipnCount === 1 ? '' : 's'} recorded locally.`
        : 'No provider callback/IPN event is recorded locally.',
    },
    {
      label: 'Swell payment state',
      status: args.swell?.paid || Number(args.swell?.paymentTotal || 0) > 0 ? 'success' : 'danger',
      at: null,
      detail: args.swell?.checked
        ? `Swell status is ${args.swell.status || 'unknown'} with ${args.swell.paymentCount} payment record${args.swell.paymentCount === 1 ? '' : 's'}.`
        : args.swell?.error || 'Swell was not checked.',
    },
    {
      label: 'Local order state',
      status: localStatus === 'paid' || localStatus === 'finished' ? 'success' : 'warning',
      at: args.order.updatedAt,
      detail: `Local payment status is ${localStatus || 'unknown'}; fulfillment status is ${args.order.fulfillmentStatus || 'not started'}.`,
    },
    {
      label: 'Checkout draft',
      status: args.drafts.some((draft) => draft.paymentCompleted) ? 'success' : 'neutral',
      at: args.drafts[0]?.updatedAt ?? null,
      detail: args.drafts.length
        ? `Latest draft is ${args.drafts[0]?.status}${args.drafts[0]?.paymentCompleted ? ' with payment completed timestamp.' : ' with no payment completed timestamp.'}`
        : 'No related draft was found.',
    },
  ];
}

export async function diagnosePayment(query: string): Promise<PaymentDiagnosticResult> {
  const normalized = query.trim();
  const row = normalized ? await findOrderRow(normalized) : null;

  if (!row) {
    return {
      query,
      verdict: {
        status: 'neutral',
        label: 'Order not found',
        detail: 'No local checkout order matched that internal id, Swell order number, or Swell order id.',
      },
      order: null,
      payment: null,
      swell: null,
      provider: null,
      drafts: [],
      analytics: {
        configured: hasOpenPanelCredentials(),
        missingConfig: getOpenPanelMissingConfig(),
        events: [],
      },
      timeline: [],
    };
  }

  const order = rowToOrderRecord(row);
  const [provider, swell, draftRows, analytics] = await Promise.all([
    checkProvider(order),
    checkSwell(order),
    findDraftRows(order),
    getAnalytics(order),
  ]);
  const drafts = draftRows.map(draftSummary);
  const verdict = buildVerdict({ order, provider, swell });
  const totals = asRecord(order.totals.totalAmount);

  return {
    query,
    verdict,
    order: {
      orderId: order.orderId,
      orderNumber: orderNumberFromSwell(order.swell, order.orderId),
      email: order.shippingAddress.email ?? row.email,
      customerName: customerName(order.shippingAddress),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      localPaymentStatus: order.payment.status,
      fulfillmentStatus: order.fulfillmentStatus ?? null,
      currencyCode: order.currencyCode,
      totalAmount: String(totals.amount ?? order.totals.totalAmount.amount),
      itemCount: itemCount(order.lines),
      provider: paymentProvider(order.payment),
      paymentMethod: paymentMethod(order.payment),
    },
    payment: safePaymentSnapshot(order.payment),
    swell,
    provider,
    drafts,
    analytics,
    timeline: buildTimeline({ order, provider, swell, analytics, drafts }),
  };
}
