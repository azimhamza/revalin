import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { getCheckoutOrder, saveCheckoutOrder, updateCheckoutOrder } from './order-store';
import { retryFailedLabelPurchase } from './payment-lifecycle';
import {
  buildShippoCustomsSnapshot,
  getShippoConfigStatus,
  isShippoConfigured,
  purchaseShippoLabel,
  quoteShippoRates,
  validateShippoCustomsSnapshot,
  type ShippoCustomsOverride,
  type ShippoCustomsSnapshot,
  type ShippoCheckoutRate,
} from './shippo';
import {
  getShipEngineMissingConfig,
  isShipEngineConfigured,
  purchaseShipEngineLabel,
  quoteShipEngineRates,
  type ShipEngineCheckoutRate,
} from './shipengine';
import { getShippoFulfillmentSettings } from './shippo-fulfillment-settings';
import { sendOrderShippedEmail, sendShippingLabelEmail } from '@/lib/email/order-emails';
import {
  createSwellShipment,
  getSwellOrder,
} from './swell-order-management';
import {
  filterShippoRatesForDestination,
  findCheckoutShippingService,
  buildShipmentProtectionQuote,
  getLiveCheckoutShippingServices,
  type CheckoutRatedService,
} from './shipping-rates';
import {
  consumeInventoryForFulfillment,
  getFulfillmentInventoryConsumptionForOrders,
  type FulfillmentInventoryConsumption,
} from '@/lib/inventory-management/service';
import type {
  CheckoutOrderLine,
  CheckoutOrderRecord,
  CheckoutShippingAddress,
  CheckoutShippingService,
  FulfillmentStatus,
} from './types';

type FulfillmentOrderRow = typeof checkoutOrders.$inferSelect;
type LabelProviderConfigStatus = {
  configured: boolean;
  missing: string[];
};

function isSuccessfulFulfillmentPaymentStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  return normalized === 'finished' || normalized === 'paid';
}

function resolveFulfillmentStatus(
  row: Pick<FulfillmentOrderRow, 'fulfillmentStatus' | 'paymentStatus'>
): FulfillmentStatus | null {
  const explicitStatus = (row.fulfillmentStatus as FulfillmentStatus) ?? null;
  if (explicitStatus) {
    return explicitStatus;
  }

  return isSuccessfulFulfillmentPaymentStatus(row.paymentStatus)
    ? 'pending'
    : null;
}

function mergeFulfillmentWithLegacyShipengine(
  fulfillment: CheckoutOrderRecord['fulfillment'] | null,
  shipengine: CheckoutOrderRecord['shipengine'] | null,
) {
  if (!fulfillment) return shipengine || null;
  if (!shipengine) return fulfillment;

  return {
    ...fulfillment,
    trackingCode: fulfillment.trackingCode || shipengine.trackingCode,
    labelUrl: fulfillment.labelUrl || shipengine.labelUrl,
    carrier: fulfillment.carrier || shipengine.carrier,
    service: fulfillment.service || shipengine.service,
    publicTrackingUrl: fulfillment.publicTrackingUrl || shipengine.publicTrackingUrl,
    labelPurchasedAt: fulfillment.labelPurchasedAt || shipengine.labelPurchasedAt,
    labelError: fulfillment.labelError || shipengine.labelError,
    handedToCarrierAt: fulfillment.handedToCarrierAt || shipengine.handedToCarrierAt,
    packedAt: fulfillment.packedAt || shipengine.packedAt,
    shippedEmailSentAt: fulfillment.shippedEmailSentAt || shipengine.shippedEmailSentAt,
    swellShipmentId: fulfillment.swellShipmentId || shipengine.swellShipmentId,
    markedShippedByUserId: fulfillment.markedShippedByUserId || shipengine.markedShippedByUserId,
  };
}

function resolveOrderFulfillment(order: Pick<CheckoutOrderRecord, 'fulfillment' | 'shipengine'>) {
  return mergeFulfillmentWithLegacyShipengine(order.fulfillment, order.shipengine);
}

function mirrorFulfillmentToLegacyShipengine(
  fulfillment: CheckoutOrderRecord['fulfillment'],
): CheckoutOrderRecord['shipengine'] {
  if (!fulfillment) return undefined;

  return {
    trackingCode: fulfillment.trackingCode,
    labelUrl: fulfillment.labelUrl,
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    publicTrackingUrl: fulfillment.publicTrackingUrl,
    labelPurchasedAt: fulfillment.labelPurchasedAt,
    labelError: fulfillment.labelError,
    handedToCarrierAt: fulfillment.handedToCarrierAt,
    packedAt: fulfillment.packedAt,
    shippedEmailSentAt: fulfillment.shippedEmailSentAt,
    swellShipmentId: fulfillment.swellShipmentId,
    markedShippedByUserId: fulfillment.markedShippedByUserId,
  };
}

function getShipEngineConfigStatus(): LabelProviderConfigStatus {
  return {
    configured: isShipEngineConfigured(),
    missing: getShipEngineMissingConfig(),
  };
}

function isLiveLabelPurchaseConfigured() {
  return isShippoConfigured() || isShipEngineConfigured();
}

function getOrderItemCount(order: Pick<CheckoutOrderRecord, 'lines'>) {
  return Math.max(
    1,
    order.lines.reduce((total, line) => total + Math.max(1, Number(line.quantity || 1)), 0),
  );
}

export type FulfillmentOrderListItem = {
  orderId: string;
  orderNumber: string;
  email: string | null;
  customerName: string;
  fulfillmentStatus: FulfillmentStatus | null;
  paymentStatus: string | null;
  payoutMethod: string | null;
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  totalAmount: string;
  itemCount: number;
  carrier: string | null;
  service: string | null;
  fulfillmentProvider: string | null;
  trackingCode: string | null;
  labelUrl: string | null;
  commercialInvoiceUrl: string | null;
  publicTrackingUrl: string | null;
  labelPurchasedAt: string | null;
  handedToCarrierAt: string | null;
  packedAt: string | null;
  inventoryConsumption: FulfillmentInventoryConsumption[];
  labelError: string | null;
  supportsLabelPurchase: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManualFulfillmentOrderInput = {
  orderNumber?: string;
  customerName: string;
  email?: string;
  totalAmount: string;
  currencyCode: string;
  itemCount: number;
  carrier?: string;
  service?: string;
  trackingCode?: string;
  labelUrl?: string;
  publicTrackingUrl?: string;
  fulfillmentStatus: FulfillmentStatus;
  notes?: string;
};

export type ManualSwellFulfillmentInput = {
  swellOrderId: string;
  shippingAddress: CheckoutShippingAddress;
  selectedShippingServiceId: string;
  payoutMethod?: string;
  notes?: string;
};

export type ManualSwellFulfillmentQuote = {
  swellOrderId: string;
  orderNumber: string;
  currencyCode: string;
  totalAmount: string;
  subtotalAmount: string;
  itemCount: number;
  rates: CheckoutRatedService[];
};

export type FulfillmentLabelPreview = {
  orderId: string;
  shippingAddress: CheckoutShippingAddress;
  rates: CheckoutRatedService[];
  selectedShippingServiceId: string;
  customs: ShippoCustomsSnapshot | null;
  shippoConfig: ReturnType<typeof getShippoConfigStatus>;
  shipengineConfig: LabelProviderConfigStatus;
  rateErrors?: Array<{
    provider: 'shippo' | 'shipengine';
    message: string;
  }>;
};

function rowToListItem(row: FulfillmentOrderRow): FulfillmentOrderListItem {
  const shipengine = row.shipengine as CheckoutOrderRecord['shipengine'];
  const fulfillment = (row.fulfillment as CheckoutOrderRecord['fulfillment']) || null;
  const fulfillmentDetails = mergeFulfillmentWithLegacyShipengine(fulfillment, shipengine);
  const shippingAddress = row.shippingAddress as CheckoutOrderRecord['shippingAddress'];
  const shippingService = row.shippingService as CheckoutOrderRecord['shippingService'];
  const totals = row.totals as CheckoutOrderRecord['totals'];
  const swell = row.swell as CheckoutOrderRecord['swell'];
  const lines = row.lines as CheckoutOrderRecord['lines'];
  const payment = row.payment as {
    provider?: string;
    payoutMethod?: string;
    paymentMethod?: string;
  } | null;

  return {
    orderId: row.orderId,
    orderNumber: swell?.orderNumber || row.orderId,
    email: row.email,
    customerName: `${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''}`.trim(),
    fulfillmentStatus: resolveFulfillmentStatus(row),
    paymentStatus: row.paymentStatus,
    payoutMethod: resolvePaymentMethodLabel(payment),
    shippingAddress,
    currencyCode: row.currencyCode,
    totalAmount: totals?.totalAmount?.amount || '0',
    itemCount: lines?.reduce((sum: number, l: { quantity: number }) => sum + l.quantity, 0) || 0,
    carrier: fulfillmentDetails?.carrier || shippingService?.carrier || null,
    service: fulfillmentDetails?.service || shippingService?.name || null,
    fulfillmentProvider: fulfillment?.provider || (shipengine ? 'shipengine' : shippingService?.source || null),
    trackingCode: fulfillmentDetails?.trackingCode || null,
    labelUrl: fulfillmentDetails?.labelUrl || null,
    commercialInvoiceUrl: fulfillment?.commercialInvoiceUrl || null,
    publicTrackingUrl: fulfillmentDetails?.publicTrackingUrl || null,
    labelPurchasedAt: fulfillmentDetails?.labelPurchasedAt || null,
    handedToCarrierAt: fulfillmentDetails?.handedToCarrierAt || null,
    packedAt: fulfillmentDetails?.packedAt || null,
    inventoryConsumption: [],
    labelError: fulfillmentDetails?.labelError || null,
    supportsLabelPurchase: isLiveLabelPurchaseConfigured(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function splitManualCustomerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || 'Manual';
  const lastName = parts.join(' ');

  return {
    firstName,
    lastName,
  };
}

function normalizeManualOrderNumber(value?: string | null) {
  const normalized = value?.trim();
  if (normalized) return normalized;

  return `MAN-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeMoneyString(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Total amount must be a valid non-negative number.');
  }

  return amount.toFixed(2);
}

function normalizeSwellOrderId(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Swell order ID is required.');
  }

  return normalized;
}

function toMoneyAmount(value: unknown, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : fallback.toFixed(2);
}

function getSwellOrderItemCount(order: Awaited<ReturnType<typeof getSwellOrder>>) {
  const count = (order.items || []).reduce(
    (total, item) => total + Math.max(1, Number(item.quantity || 1)),
    0,
  );

  return Math.max(1, count || Number(order.item_quantity || 0) || 1);
}

function resolvePaymentMethodLabel(
  payment: {
    provider?: string;
    payoutMethod?: string;
    paymentMethod?: string;
  } | null,
) {
  const explicitMethod = payment?.payoutMethod || payment?.paymentMethod;
  if (explicitMethod) return explicitMethod;

  if (payment?.provider === 'nowpayments') return 'crypto';
  if (payment?.provider === 'shieldclimb' || payment?.provider === 'bankful' || payment?.provider === 'square') return 'card_debit';
  if (payment?.provider === 'interac') return 'interac';

  return null;
}

async function findCheckoutOrderBySwellOrderId(swellOrderId: string) {
  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(sql`${checkoutOrders.swell}->>'orderId' = ${swellOrderId}`)
    .limit(1);

  return rows[0] ? rowToListItem(rows[0]) : null;
}

function mapRatedServiceToCheckoutService(
  service: CheckoutRatedService,
): CheckoutShippingService {
  return {
    id: service.id,
    name: service.name,
    quoteCategory: service.quoteCategory,
    source: service.source,
    carrier: service.carrier,
    carrierCode: service.carrierCode,
    serviceCode: service.serviceCode,
    shipengineRateId: service.shipengineRateId,
    shippoRateId: service.shippoRateId,
    shippoShipmentId: service.shippoShipmentId,
    shippoCarrierAccountId: service.shippoCarrierAccountId,
    carrierPreferenceRank: service.carrierPreferenceRank,
    estimatedDays: service.estimatedDays,
    pickup: service.pickup,
    price: service.price,
    originalPrice: service.originalPrice,
    taxAmount: service.taxAmount,
    landedCostAmount: service.landedCostAmount,
    landedCost: service.landedCost,
    shippoIncludedInsurancePrice: service.shippoIncludedInsurancePrice,
    availableShipmentProtection: service.availableShipmentProtection,
    shipmentProtection: service.shipmentProtection,
  };
}

function getCarrierPreferenceRank(args: {
  shippingAddress: CheckoutShippingAddress;
  carrier?: string;
  carrierCode?: string;
}) {
  const destinationCountry = args.shippingAddress.country.trim().toUpperCase();
  const carrierIdentity = `${args.carrier || ''} ${args.carrierCode || ''}`.toLowerCase();

  if (destinationCountry === 'US' && /\bups\b|united parcel/.test(carrierIdentity)) {
    return 0;
  }

  if (
    destinationCountry === 'CA' &&
    (/canada\s*post/.test(carrierIdentity) || /\bcapost\b/.test(carrierIdentity))
  ) {
    return 0;
  }

  return undefined;
}

function mapShippoPreviewRate(args: {
  rate: ShippoCheckoutRate;
  shippingAddress: CheckoutShippingAddress;
  shipmentProtection?: CheckoutOrderRecord['totals']['shipmentProtection'];
  subtotalAmount: number;
}): CheckoutRatedService {
  const includedInsurancePrice = Math.max(0, Number(args.rate.includedInsurancePrice || 0));
  const basePrice = Math.max(0, Number(args.rate.price || 0) - includedInsurancePrice);

  return {
    id: args.rate.id,
    name: args.rate.name,
    carrier: args.rate.carrier,
    carrierCode: args.rate.carrierCode,
    serviceCode: args.rate.serviceCode,
    shippoRateId: args.rate.shippoRateId,
    shippoShipmentId: args.rate.shippoShipmentId,
    shippoCarrierAccountId: args.rate.shippoCarrierAccountId,
    carrierPreferenceRank: getCarrierPreferenceRank({
      shippingAddress: args.shippingAddress,
      carrier: args.rate.carrier,
      carrierCode: args.rate.carrierCode,
    }),
    estimatedDays: args.rate.estimatedDays,
    source: 'shippo',
    price: {
      amount: basePrice.toFixed(2),
      currencyCode: args.rate.currencyCode,
    },
    shippoIncludedInsurancePrice:
      includedInsurancePrice > 0
        ? {
            amount: includedInsurancePrice.toFixed(2),
            currencyCode: args.rate.currencyCode,
          }
        : undefined,
    shipmentProtection: args.shipmentProtection
      ? buildShipmentProtectionQuote({
          subtotalAmount: args.subtotalAmount,
          currencyCode: args.rate.currencyCode,
          shippoInsuranceAmount: includedInsurancePrice,
        })
      : undefined,
  };
}

function mapShipEnginePreviewRate(args: {
  rate: ShipEngineCheckoutRate;
  shippingAddress: CheckoutShippingAddress;
}): CheckoutRatedService {
  return {
    id: args.rate.id,
    name: args.rate.name,
    carrier: args.rate.carrier,
    carrierCode: args.rate.carrierCode,
    serviceCode: args.rate.serviceCode,
    shipengineRateId: args.rate.shipengineRateId,
    carrierPreferenceRank: getCarrierPreferenceRank({
      shippingAddress: args.shippingAddress,
      carrier: args.rate.carrier,
      carrierCode: args.rate.carrierCode,
    }),
    estimatedDays: args.rate.estimatedDays,
    source: 'shipengine',
    price: {
      amount: toMoneyAmount(args.rate.price),
      currencyCode: args.rate.currencyCode,
    },
  };
}

function buildOrderShippoInsurance(order: CheckoutOrderRecord) {
  const protection = order.totals.shipmentProtection;
  if (!protection) return null;

  return {
    amount: protection.insuredValueAmount.amount,
    currency: protection.insuredValueAmount.currencyCode,
    content: protection.content,
  };
}

function buildManualSwellOrderLines(args: {
  order: Awaited<ReturnType<typeof getSwellOrder>>;
  currencyCode: string;
  subtotalAmount: number;
}): CheckoutOrderLine[] {
  const items = args.order.items || [];
  const totalQuantity = getSwellOrderItemCount(args.order);

  if (items.length === 0) {
    return [
      {
        id: `${args.order.id}-manual-line`,
        merchandiseId: 'manual-swell-order',
        productHandle: 'manual-swell-order',
        productTitle: 'Manual Swell order',
        variantTitle: `${totalQuantity} item${totalQuantity === 1 ? '' : 's'}`,
        imageUrl: '',
        selectedOptions: [],
        quantity: totalQuantity,
        unitPrice: {
          amount: (args.subtotalAmount / totalQuantity).toFixed(2),
          currencyCode: args.currencyCode,
        },
        lineTotal: {
          amount: args.subtotalAmount.toFixed(2),
          currencyCode: args.currencyCode,
        },
      },
    ];
  }

  return items.map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const estimatedLineTotal =
      totalQuantity > 0 ? (args.subtotalAmount / totalQuantity) * quantity : 0;
    const merchandiseId = [
      'swell:product',
      item.product_id,
      item.variant_id ? `variant:${item.variant_id}` : '',
    ]
      .filter(Boolean)
      .join(':');

    return {
      id: item.id || `${args.order.id}-item-${index + 1}`,
      merchandiseId,
      productHandle: item.product_id || 'manual-swell-order',
      productTitle: item.product_id
        ? `Swell product ${item.product_id}`
        : 'Manual Swell order item',
      variantTitle: item.variant_id ? `Variant ${item.variant_id}` : '',
      skuNumber: undefined,
      imageUrl: '',
      selectedOptions: [],
      quantity,
      unitPrice: {
        amount: (estimatedLineTotal / quantity).toFixed(2),
        currencyCode: args.currencyCode,
      },
      lineTotal: {
        amount: estimatedLineTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
    };
  });
}

async function loadManualSwellFulfillmentQuote(args: {
  swellOrderId: string;
  shippingAddress: CheckoutShippingAddress;
}) {
  const swellOrderId = normalizeSwellOrderId(args.swellOrderId);
  const order = await getSwellOrder(swellOrderId, {
    expand: 'items',
  });

  if (!order?.id) {
    throw new Error(`Swell order ${swellOrderId} was not found.`);
  }

  const currencyCode = (order.currency || 'USD').trim().toUpperCase();
  const subtotalAmount = Number(order.sub_total || 0);
  const totalAmount = Number(order.grand_total || order.sub_total || 0);
  const itemCount = getSwellOrderItemCount(order);
  const rates = await getLiveCheckoutShippingServices({
    shippingAddress: args.shippingAddress,
    currencyCode,
    subtotalAmount,
    itemCount,
  });

  if (rates.length === 0) {
    throw new Error('No live shipping rates were returned for this address.');
  }

  return {
    order,
    quote: {
      swellOrderId: order.id,
      orderNumber: order.number || order.id,
      currencyCode,
      totalAmount: totalAmount.toFixed(2),
      subtotalAmount: subtotalAmount.toFixed(2),
      itemCount,
      rates,
    } satisfies ManualSwellFulfillmentQuote,
  };
}

export async function quoteManualSwellFulfillmentRates(args: {
  swellOrderId: string;
  shippingAddress: CheckoutShippingAddress;
}) {
  const existing = await findCheckoutOrderBySwellOrderId(
    normalizeSwellOrderId(args.swellOrderId),
  );
  if (existing) {
    throw new Error(`Swell order ${args.swellOrderId} is already in fulfillment.`);
  }

  return (await loadManualSwellFulfillmentQuote(args)).quote;
}

export async function createManualSwellFulfillmentOrder(
  input: ManualSwellFulfillmentInput,
) {
  const swellOrderId = normalizeSwellOrderId(input.swellOrderId);
  const existing = await findCheckoutOrderBySwellOrderId(swellOrderId);
  if (existing) {
    throw new Error(`Swell order ${swellOrderId} is already in fulfillment.`);
  }

  const { order: swellOrder, quote } = await loadManualSwellFulfillmentQuote({
    swellOrderId,
    shippingAddress: {
      ...input.shippingAddress,
      notes: input.notes?.trim() || input.shippingAddress.notes,
    },
  });
  const selectedRate = findCheckoutShippingService(
    quote.rates,
    input.selectedShippingServiceId,
  );

  if (!selectedRate) {
    throw new Error('Select a valid live shipping rate before creating fulfillment.');
  }

  if (selectedRate.source !== 'shippo' && selectedRate.source !== 'shipengine') {
    throw new Error('Manual fulfillment labels must use a live carrier rate.');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const currencyCode = quote.currencyCode;
  const subtotalAmount = Number(quote.subtotalAmount || 0);
  const totalAmount = Number(quote.totalAmount || quote.subtotalAmount || 0);
  const shippingAmount = Number(selectedRate.price.amount || 0);
  const orderId = swellOrder.id;
  const shippingService = mapRatedServiceToCheckoutService(selectedRate);

  const record: CheckoutOrderRecord = {
    orderId,
    accessKey: randomUUID(),
    cartId: swellOrder.cart_id || `manual-swell-${orderId}`,
    userId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    currencyCode,
    shippingAddress: input.shippingAddress,
    shippingService,
    lines: buildManualSwellOrderLines({
      order: swellOrder,
      currencyCode,
      subtotalAmount,
    }),
    totals: {
      subtotalAmount: { amount: toMoneyAmount(subtotalAmount), currencyCode },
      totalAmount: { amount: toMoneyAmount(totalAmount), currencyCode },
      shippingAmount: { amount: toMoneyAmount(shippingAmount), currencyCode },
      shippingThresholdAmount: { amount: '0.00', currencyCode },
      shippingStatus: 'quoted',
    },
    payment: {
      provider: 'manual_fulfillment',
      status: 'paid',
      paymentMethod: input.payoutMethod?.trim() || undefined,
      payoutMethod: input.payoutMethod?.trim() || undefined,
      swellOrderId: swellOrder.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as unknown as CheckoutOrderRecord['payment'],
    swell: {
      accountId: swellOrder.account_id || '',
      orderId: swellOrder.id,
      orderNumber: swellOrder.number || swellOrder.id,
      cartId: swellOrder.cart_id,
    },
    shipengine: {
      labelError: undefined,
    },
    fulfillment: {
      provider: selectedRate.source === 'shippo' ? 'shippo' : 'shipengine',
      carrier: selectedRate.carrier,
      service: selectedRate.name,
      shipengineRateId: selectedRate.shipengineRateId,
      shippoRateId: selectedRate.shippoRateId,
      shippoShipmentId: selectedRate.shippoShipmentId,
      shippoCarrierAccountId: selectedRate.shippoCarrierAccountId,
      labelError: undefined,
    },
    affiliate: null,
    promoter: null,
    ipnEvents: [],
    fulfillmentStatus: 'pending',
    latestError: null,
  };

  return saveCheckoutOrder(record);
}

export async function createManualFulfillmentOrder(
  input: ManualFulfillmentOrderInput,
) {
  const orderNumber = normalizeManualOrderNumber(input.orderNumber);
  const orderId = orderNumber.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 64);
  const currencyCode = input.currencyCode.trim().toUpperCase() || 'USD';
  const totalAmount = normalizeMoneyString(input.totalAmount);
  const itemCount = Math.max(1, Math.floor(input.itemCount || 1));
  const customer = splitManualCustomerName(input.customerName);
  const now = new Date();
  const status = input.fulfillmentStatus;
  const carrier = input.carrier?.trim() || undefined;
  const service = input.service?.trim() || undefined;
  const trackingCode = input.trackingCode?.trim() || undefined;
  const labelUrl = input.labelUrl?.trim() || undefined;
  const publicTrackingUrl = input.publicTrackingUrl?.trim() || undefined;

  const existing = await getCheckoutOrder(orderId);
  if (existing) {
    throw new Error(`Order ${orderId} already exists.`);
  }

  const [created] = await db
    .insert(checkoutOrders)
    .values({
      orderId,
      accessKey: randomUUID(),
      cartId: `manual-fulfillment-${orderId.toLowerCase()}`,
      userId: null,
      email: input.email?.trim().toLowerCase() || null,
      paymentStatus: 'paid',
      currencyCode,
      shippingAddress: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: input.email?.trim() || '',
        phone: '',
        address1: input.notes?.trim() || 'Manual fulfillment',
        city: '',
        province: '',
        postalCode: '',
        country: 'US',
        notes: input.notes?.trim() || undefined,
      },
      shippingService:
        carrier || service
          ? {
              id: `manual:${orderId}`,
              name: service || 'Manual service',
              source: 'swell',
              carrier,
              price: {
                amount: '0.00',
                currencyCode,
              },
            }
          : null,
      lines: [
        {
          id: `${orderId}-manual-line`,
          merchandiseId: 'manual-fulfillment',
          productHandle: 'manual-fulfillment',
          productTitle: 'Manual fulfillment',
          variantTitle: `${itemCount} item${itemCount === 1 ? '' : 's'}`,
          skuNumber: undefined,
          imageUrl: '',
          selectedOptions: [],
          quantity: itemCount,
          unitPrice: {
            amount: (Number(totalAmount) / itemCount).toFixed(2),
            currencyCode,
          },
          lineTotal: {
            amount: totalAmount,
            currencyCode,
          },
        },
      ],
      totals: {
        subtotalAmount: { amount: totalAmount, currencyCode },
        totalAmount: { amount: totalAmount, currencyCode },
        shippingAmount: { amount: '0.00', currencyCode },
        shippingThresholdAmount: { amount: '0.00', currencyCode },
        shippingStatus: 'pending_quote',
      },
      payment: {
        provider: 'manual_fulfillment',
        status: 'paid',
        updatedAt: now.toISOString(),
      },
      swell: {
        accountId: '',
        orderId,
        orderNumber,
      },
      shipengine:
        carrier || service || trackingCode || labelUrl || publicTrackingUrl
          ? {
              carrier,
              service,
              trackingCode,
              labelUrl,
              publicTrackingUrl,
              labelPurchasedAt:
                status === 'label_ready' || status === 'packed' || status === 'handed_to_carrier'
                  ? now.toISOString()
                  : undefined,
              packedAt:
                status === 'packed' || status === 'handed_to_carrier'
                  ? now.toISOString()
                  : undefined,
              handedToCarrierAt:
                status === 'handed_to_carrier' ? now.toISOString() : undefined,
            }
          : null,
      fulfillment:
        carrier || service || trackingCode || labelUrl || publicTrackingUrl
          ? {
              provider: 'manual',
              carrier,
              service,
              trackingCode,
              labelUrl,
              publicTrackingUrl,
              labelPurchasedAt:
                status === 'label_ready' || status === 'packed' || status === 'handed_to_carrier'
                  ? now.toISOString()
                  : undefined,
              packedAt:
                status === 'packed' || status === 'handed_to_carrier'
                  ? now.toISOString()
                  : undefined,
              handedToCarrierAt:
                status === 'handed_to_carrier' ? now.toISOString() : undefined,
            }
          : null,
      affiliate: null,
      promoter: null,
      ipnEvents: null,
      fulfillmentStatus: status,
      latestError: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create manual fulfillment order.');
  }

  return rowToListItem(created);
}

export async function listFulfillmentOrders(args: {
  status?: FulfillmentStatus | 'all' | 'pending';
  page?: number;
  pageSize?: number;
}) {
  const page = args.page || 1;
  const pageSize = args.pageSize || 50;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const successfulUnqueuedOrderCondition = and(
    isNull(checkoutOrders.fulfillmentStatus),
    sql`lower(${checkoutOrders.paymentStatus}) in ('finished', 'paid')`
  );

  if (args.status === 'pending') {
    conditions.push(
      or(
        eq(checkoutOrders.fulfillmentStatus, 'pending'),
        successfulUnqueuedOrderCondition
      )
    );
  } else if (args.status && args.status !== 'all') {
    conditions.push(eq(checkoutOrders.fulfillmentStatus, args.status));
  } else if (!args.status || args.status === 'all') {
    // Show all orders that have entered the fulfillment pipeline
    conditions.push(
      or(
        inArray(checkoutOrders.fulfillmentStatus, [
          'pending',
          'label_ready',
          'packed',
          'handed_to_carrier',
          'error',
        ]),
        successfulUnqueuedOrderCondition
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(checkoutOrders)
      .where(whereClause)
      .orderBy(desc(checkoutOrders.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(checkoutOrders)
      .where(whereClause),
  ]);

  const items = rows.map(rowToListItem);
  const consumptionByOrder = await getFulfillmentInventoryConsumptionForOrders(
    items.map((item) => item.orderId),
  );

  return {
    data: items.map((item) => ({
      ...item,
      inventoryConsumption: consumptionByOrder.get(item.orderId) || [],
    })),
    page,
    pageSize,
    total: totalResult[0]?.count || 0,
  };
}

export async function markOrderPacked(args: {
  orderId: string;
  adminUserId?: string | null;
}) {
  const order = await getCheckoutOrder(args.orderId);
  if (!order) {
    throw new Error(`Order ${args.orderId} not found.`);
  }

  if (order.fulfillmentStatus !== 'label_ready') {
    throw new Error(
      `Order ${args.orderId} cannot be marked as packed (current status: ${order.fulfillmentStatus}).`,
    );
  }

  const inventoryResult = await consumeInventoryForFulfillment({
    order,
    adminUserId: args.adminUserId,
  });

  const updatedOrder = await updateCheckoutOrder(args.orderId, (current) => ({
    ...current,
    fulfillmentStatus: 'packed',
    fulfillment: {
      ...(current.fulfillment || current.shipengine),
      packedAt: new Date().toISOString(),
    },
    shipengine: {
      ...current.shipengine,
      packedAt: new Date().toISOString(),
    },
  }));

  if (inventoryResult.warnings.length > 0) {
    console.warn(
      `[fulfillment] Inventory warnings for ${args.orderId}: ${inventoryResult.warnings.join('; ')}`,
    );
  }

  return updatedOrder;
}

export async function markOrderShipped(args: {
  orderId: string;
  adminUserId: string;
}) {
  const order = await getCheckoutOrder(args.orderId);
  if (!order) {
    throw new Error(`Order ${args.orderId} not found.`);
  }

  if (
    order.fulfillmentStatus !== 'label_ready' &&
    order.fulfillmentStatus !== 'packed'
  ) {
    throw new Error(
      `Order ${args.orderId} cannot be marked as shipped (current status: ${order.fulfillmentStatus}).`,
    );
  }

  const fulfillment = resolveOrderFulfillment(order);

  if (!fulfillment?.trackingCode || !fulfillment?.labelUrl) {
    throw new Error(
      `Order ${args.orderId} is missing label or tracking information.`,
    );
  }

  const now = new Date().toISOString();

  // 1. Create Swell shipment
  let swellShipmentId: string | undefined;
  try {
    const swellOrder = await getSwellOrder(order.swell.orderId, {
      expand: 'items',
    });

    const shipmentItems = swellOrder?.items?.map((item) => ({
      order_item_id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
    }));

    const shipment = await createSwellShipment({
      order_id: order.swell.orderId,
      tracking_code: fulfillment.trackingCode,
      carrier_name: fulfillment.carrier,
      service_name: fulfillment.service,
      items: shipmentItems,
    });

    swellShipmentId = shipment?.id;
  } catch (error) {
    console.error(
      `[fulfillment] Failed to create Swell shipment for ${args.orderId}:`,
      error,
    );
    // Don't block the flow — Swell shipment is nice-to-have
  }

  // 2. Update order with shipment info
  const updatedOrder = await updateCheckoutOrder(args.orderId, (current) => ({
    ...current,
    fulfillmentStatus: 'handed_to_carrier',
    fulfillment: {
      ...(current.fulfillment || current.shipengine),
      handedToCarrierAt: now,
      markedShippedByUserId: args.adminUserId,
      swellShipmentId,
    },
    shipengine: {
      ...current.shipengine,
      handedToCarrierAt: now,
      markedShippedByUserId: args.adminUserId,
      swellShipmentId,
    },
  }));

  if (!updatedOrder) {
    throw new Error(`Failed to update order ${args.orderId}.`);
  }

  // 3. Send customer shipped email
  try {
    await sendOrderShippedEmail(updatedOrder);

    await updateCheckoutOrder(args.orderId, (current) => ({
      ...current,
      fulfillment: {
        ...(current.fulfillment || current.shipengine),
        shippedEmailSentAt: new Date().toISOString(),
      },
      shipengine: {
        ...current.shipengine,
        shippedEmailSentAt: new Date().toISOString(),
      },
    }));
  } catch (error) {
    console.error(
      `[fulfillment] Failed to send shipped email for ${args.orderId}:`,
      error,
    );
  }

  return updatedOrder;
}

export async function resendLabelEmail(orderId: string) {
  const order = await getCheckoutOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }

  const fulfillment = resolveOrderFulfillment(order);
  const labelUrl = fulfillment?.labelUrl;
  if (!labelUrl) {
    throw new Error(`Order ${orderId} has no shipping label.`);
  }

  await sendShippingLabelEmail({
    order,
    labelUrl,
    labelResult: {
      carrier: fulfillment?.carrier,
      service: fulfillment?.service,
      trackingCode: fulfillment?.trackingCode,
      publicTrackingUrl: fulfillment?.publicTrackingUrl,
    },
  });
}

export async function resendShippedEmail(orderId: string) {
  const order = await getCheckoutOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }

  if (order.fulfillmentStatus !== 'handed_to_carrier') {
    throw new Error(
      `Order ${orderId} has not been marked as shipped yet.`,
    );
  }

  await sendOrderShippedEmail(order);
}

export async function retryOrderLabelPurchase(orderId: string) {
  const order = await retryFailedLabelPurchase(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }

  return order;
}

function selectPreviewRate(args: {
  rates: CheckoutRatedService[];
  selectedShippingService?: CheckoutShippingService;
}) {
  const selected = args.selectedShippingService;
  if (selected) {
    const exact = args.rates.find(rate => rate.id === selected.id);
    if (exact) return exact;

    const byShippoRate = selected.shippoRateId
      ? args.rates.find(rate => rate.shippoRateId === selected.shippoRateId)
      : null;
    if (byShippoRate) return byShippoRate;

    const byShipEngineRate = selected.shipengineRateId
      ? args.rates.find(rate => rate.shipengineRateId === selected.shipengineRateId)
      : null;
    if (byShipEngineRate) return byShipEngineRate;

    const byCarrierService = args.rates.find(rate =>
      rate.carrier?.trim().toLowerCase() === selected.carrier?.trim().toLowerCase() &&
      (
        rate.serviceCode?.trim().toLowerCase() === selected.serviceCode?.trim().toLowerCase() ||
        rate.name.trim().toLowerCase() === selected.name.trim().toLowerCase()
      )
    );
    if (byCarrierService) return byCarrierService;
  }

  return [...args.rates].sort((left, right) => {
    const leftRank = left.carrierPreferenceRank ?? Number.POSITIVE_INFINITY;
    const rightRank = right.carrierPreferenceRank ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Number(left.price.amount) - Number(right.price.amount);
  })[0] || null;
}

function getProviderErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function getOrderLabelPreview(args: {
  orderId: string;
  shippingAddress?: CheckoutShippingAddress;
  customs?: ShippoCustomsOverride;
}): Promise<FulfillmentLabelPreview> {
  const order = await getCheckoutOrder(args.orderId);
  if (!order) {
    throw new Error(`Order ${args.orderId} not found.`);
  }

  const shippoConfig = getShippoConfigStatus();
  const shipengineConfig = getShipEngineConfigStatus();
  const shippingAddress = args.shippingAddress || order.shippingAddress;
  const itemCount = getOrderItemCount(order);
  const subtotalAmount = Number(order.totals.subtotalAmount.amount || 0);
  const destinationCountry = shippingAddress.country.trim().toUpperCase();
  const isInternational =
    Boolean(destinationCountry && shippoConfig.originCountry) &&
    destinationCountry !== shippoConfig.originCountry;
  const customsSettings = await getShippoFulfillmentSettings();
  const customs = isInternational
    ? buildShippoCustomsSnapshot({
        settings: customsSettings,
        itemCount,
        orderId: order.orderId,
        overrides: args.customs,
        valueMode: args.customs?.valueAmount || args.customs?.unitValueAmount ? 'midpoint' : 'random',
      })
    : null;
  const rates: CheckoutRatedService[] = [];
  const rateErrors: NonNullable<FulfillmentLabelPreview['rateErrors']> = [];

  if (shippoConfig.configured) {
    try {
      if (customs) {
        const missing = validateShippoCustomsSnapshot(customs);
        if (missing.length > 0) {
          throw new Error(`Shippo customs configuration is missing: ${missing.join(', ')}.`);
        }
      }

      const insurance = buildOrderShippoInsurance(order);
      let quote: Awaited<ReturnType<typeof quoteShippoRates>>;

      try {
        quote = await quoteShippoRates({
          shippingAddress,
          itemCount,
          currencyCode: order.currencyCode,
          orderId: order.orderId,
          customsSettings,
          customsSnapshot: customs,
          insurance,
        });
      } catch (error) {
        if (!insurance) {
          throw error;
        }

        console.warn(
          `Shippo insurance quote failed for ${order.orderId}; retrying label preview without Shippo insurance.`,
          error,
        );
        quote = await quoteShippoRates({
          shippingAddress,
          itemCount,
          currencyCode: order.currencyCode,
          orderId: order.orderId,
          customsSettings,
          customsSnapshot: customs,
        });
      }

      const shippoRates = filterShippoRatesForDestination({
        services: quote?.rates || [],
        shippingAddress,
      }).map(rate => mapShippoPreviewRate({
        rate,
        shippingAddress,
        shipmentProtection: order.totals.shipmentProtection,
        subtotalAmount,
      }));

      if (shippoRates.length === 0) {
        throw new Error('Shippo returned no usable rates for this destination.');
      }

      rates.push(...shippoRates);
    } catch (error) {
      const message = getProviderErrorMessage(error, 'Shippo returned no usable rates.');
      rateErrors.push({ provider: 'shippo', message });
      console.warn(`[fulfillment] Shippo label preview failed for ${order.orderId}:`, message);
    }
  }

  if (shipengineConfig.configured) {
    try {
      const shipEngineQuote = await quoteShipEngineRates({
        shippingAddress,
        itemCount,
        currencyCode: order.currencyCode,
        customsValueAmount: subtotalAmount,
      });

      const shipEngineRates = (shipEngineQuote?.rates || []).map(rate => mapShipEnginePreviewRate({
        rate,
        shippingAddress,
      }));

      if (shipEngineRates.length === 0) {
        throw new Error('ShipEngine returned no usable rates for this destination.');
      }

      rates.push(...shipEngineRates);
    } catch (error) {
      const message = getProviderErrorMessage(error, 'ShipEngine returned no usable rates.');
      rateErrors.push({ provider: 'shipengine', message });
      console.warn(`[fulfillment] ShipEngine label preview failed for ${order.orderId}:`, message);
    }
  }

  if (rates.length === 0 && rateErrors.length > 0) {
    throw new Error(
      `No live label rates were returned. ${rateErrors
        .map(error => `${error.provider}: ${error.message}`)
        .join(' ')}`,
    );
  }

  const selectedRate = selectPreviewRate({
    rates,
    selectedShippingService: order.shippingService,
  });

  return {
    orderId: order.orderId,
    shippingAddress,
    rates,
    selectedShippingServiceId: selectedRate?.id || rates[0]?.id || '',
    customs,
    shippoConfig,
    shipengineConfig,
    rateErrors: rateErrors.length > 0 ? rateErrors : undefined,
  };
}

export async function updateShippingAddressAndPurchaseLabel(args: {
  orderId: string;
  shippingAddress: CheckoutShippingAddress;
  selectedShippingServiceId?: string;
  customs?: ShippoCustomsOverride;
}) {
  const order = await getCheckoutOrder(args.orderId);
  if (!order) {
    throw new Error(`Order ${args.orderId} not found.`);
  }

  if (!isSuccessfulFulfillmentPaymentStatus(order.payment.status)) {
    throw new Error(`Order ${args.orderId} has not been paid yet.`);
  }

  const existingFulfillment = resolveOrderFulfillment(order);
  if (existingFulfillment?.labelUrl) {
    throw new Error(`Order ${args.orderId} already has a shipping label.`);
  }

  if (!isLiveLabelPurchaseConfigured()) {
    const shippoMissing = getShippoConfigStatus().missing.join(', ') || 'none';
    const shipEngineMissing = getShipEngineMissingConfig().join(', ') || 'none';

    throw new Error(
      `No label provider is fully configured. Shippo missing: ${shippoMissing}. ShipEngine missing: ${shipEngineMissing}.`,
    );
  }

  const addressUpdatedOrder = await updateCheckoutOrder(args.orderId, (current) => ({
    ...current,
    shippingAddress: args.shippingAddress,
    fulfillmentStatus: current.fulfillmentStatus ?? 'pending',
    fulfillment: {
      ...(current.fulfillment || current.shipengine),
      labelError: undefined,
    },
    shipengine: {
      ...current.shipengine,
      labelError: undefined,
    },
  }));

  if (!addressUpdatedOrder) {
    throw new Error(`Failed to update order ${args.orderId}.`);
  }

  try {
    const preview = await getOrderLabelPreview({
      orderId: args.orderId,
      shippingAddress: addressUpdatedOrder.shippingAddress,
      customs: args.customs,
    });
    const selectedRate =
      findCheckoutShippingService(preview.rates, args.selectedShippingServiceId || preview.selectedShippingServiceId) ||
      preview.rates[0] ||
      null;

    if (!selectedRate) {
      throw new Error('Select a valid live carrier rate before buying the label.');
    }

    const shippingService = mapRatedServiceToCheckoutService(selectedRate);
    let fulfillment: CheckoutOrderRecord['fulfillment'];

    if (selectedRate.source === 'shippo') {
      if (!selectedRate.shippoRateId) {
        throw new Error('Select a valid Shippo rate before buying the label.');
      }

      const labelResult = await purchaseShippoLabel({
        rateId: selectedRate.shippoRateId,
        orderId: addressUpdatedOrder.orderId,
      });

      if (!labelResult.labelUrl) {
        throw new Error('Shippo purchased the rate but did not return a label URL.');
      }

      fulfillment = {
        provider: 'shippo',
        trackingCode: labelResult.trackingCode || undefined,
        labelUrl: labelResult.labelUrl || undefined,
        carrier: labelResult.carrier || selectedRate.carrier,
        service: labelResult.service || selectedRate.name,
        publicTrackingUrl: labelResult.publicTrackingUrl || undefined,
        labelPurchasedAt: new Date().toISOString(),
        labelError: undefined,
        shippoTransactionId: labelResult.shippoTransactionId || undefined,
        shippoRateId: labelResult.shippoRateId || selectedRate.shippoRateId,
        shippoShipmentId: selectedRate.shippoShipmentId,
        shippoCarrierAccountId: labelResult.shippoCarrierAccountId || selectedRate.shippoCarrierAccountId,
        commercialInvoiceUrl: labelResult.commercialInvoiceUrl || undefined,
        customs: preview.customs || undefined,
      };
    } else if (selectedRate.source === 'shipengine') {
      if (!selectedRate.shipengineRateId) {
        throw new Error('Select a valid ShipEngine rate before buying the label.');
      }

      const labelResult = await purchaseShipEngineLabel({
        shippingAddress: addressUpdatedOrder.shippingAddress,
        itemCount: getOrderItemCount(addressUpdatedOrder),
        customsValueAmount: Number(addressUpdatedOrder.totals.subtotalAmount.amount || 0),
        customsCurrencyCode: addressUpdatedOrder.currencyCode,
        selectedShippingService: shippingService,
        orderCreatedAt: addressUpdatedOrder.createdAt,
      });

      if (!labelResult.labelUrl) {
        throw new Error('ShipEngine purchased the rate but did not return a label URL.');
      }

      fulfillment = {
        provider: 'shipengine',
        trackingCode: labelResult.trackingCode || undefined,
        labelUrl: labelResult.labelUrl || undefined,
        carrier: labelResult.carrier || selectedRate.carrier,
        service: labelResult.service || selectedRate.name,
        publicTrackingUrl: labelResult.publicTrackingUrl || undefined,
        labelPurchasedAt: new Date().toISOString(),
        labelError: undefined,
        shipengineRateId: selectedRate.shipengineRateId,
      };
    } else {
      throw new Error('Select a valid Shippo or ShipEngine rate before buying the label.');
    }

    const updatedOrder = await updateCheckoutOrder(args.orderId, (current) => ({
      ...current,
      fulfillmentStatus: 'label_ready',
      shippingService,
      fulfillment,
      shipengine: mirrorFulfillmentToLegacyShipengine(fulfillment),
    }));

    if (!updatedOrder) {
      throw new Error(`Failed to update label details for order ${args.orderId}.`);
    }

    if (updatedOrder.shipengine?.labelUrl) {
      try {
        await sendShippingLabelEmail({
          order: updatedOrder,
          labelUrl: updatedOrder.shipengine.labelUrl,
          labelResult: {
            carrier: fulfillment.carrier,
            service: fulfillment.service,
            trackingCode: fulfillment.trackingCode,
            publicTrackingUrl: fulfillment.publicTrackingUrl,
          },
        });
      } catch (error) {
        console.error(
          `[fulfillment] Failed to send label email for ${args.orderId}:`,
          error,
        );
      }
    }

    return updatedOrder;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown label purchase error';

    await updateCheckoutOrder(args.orderId, (current) => ({
      ...current,
      fulfillmentStatus: 'error',
      fulfillment: {
        ...(current.fulfillment || current.shipengine),
        labelError: message,
      },
      shipengine: {
        ...current.shipengine,
        labelError: message,
      },
    }));

    throw new Error(message);
  }
}
