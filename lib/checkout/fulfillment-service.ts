import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { getCheckoutOrder, updateCheckoutOrder } from './order-store';
import { retryFailedLabelPurchase } from './payment-lifecycle';
import { purchaseShipEngineLabel } from './shipengine';
import { sendOrderShippedEmail, sendShippingLabelEmail } from '@/lib/email/order-emails';
import {
  createSwellShipment,
  getSwellOrder,
} from './swell-order-management';
import type { CheckoutOrderRecord, CheckoutShippingAddress, FulfillmentStatus } from './types';

type FulfillmentOrderRow = typeof checkoutOrders.$inferSelect;

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

export type FulfillmentOrderListItem = {
  orderId: string;
  orderNumber: string;
  email: string | null;
  customerName: string;
  fulfillmentStatus: FulfillmentStatus | null;
  paymentStatus: string | null;
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  totalAmount: string;
  itemCount: number;
  carrier: string | null;
  service: string | null;
  trackingCode: string | null;
  labelUrl: string | null;
  publicTrackingUrl: string | null;
  labelPurchasedAt: string | null;
  handedToCarrierAt: string | null;
  packedAt: string | null;
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

function rowToListItem(row: FulfillmentOrderRow): FulfillmentOrderListItem {
  const shipengine = row.shipengine as CheckoutOrderRecord['shipengine'];
  const shippingAddress = row.shippingAddress as CheckoutOrderRecord['shippingAddress'];
  const shippingService = row.shippingService as CheckoutOrderRecord['shippingService'];
  const totals = row.totals as CheckoutOrderRecord['totals'];
  const swell = row.swell as CheckoutOrderRecord['swell'];
  const lines = row.lines as CheckoutOrderRecord['lines'];

  return {
    orderId: row.orderId,
    orderNumber: swell?.orderNumber || row.orderId,
    email: row.email,
    customerName: `${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''}`.trim(),
    fulfillmentStatus: resolveFulfillmentStatus(row),
    paymentStatus: row.paymentStatus,
    shippingAddress,
    currencyCode: row.currencyCode,
    totalAmount: totals?.totalAmount?.amount || '0',
    itemCount: lines?.reduce((sum: number, l: { quantity: number }) => sum + l.quantity, 0) || 0,
    carrier: shipengine?.carrier || shippingService?.carrier || null,
    service: shipengine?.service || shippingService?.name || null,
    trackingCode: shipengine?.trackingCode || null,
    labelUrl: shipengine?.labelUrl || null,
    publicTrackingUrl: shipengine?.publicTrackingUrl || null,
    labelPurchasedAt: shipengine?.labelPurchasedAt || null,
    handedToCarrierAt: shipengine?.handedToCarrierAt || null,
    packedAt: shipengine?.packedAt || null,
    labelError: shipengine?.labelError || null,
    supportsLabelPurchase: shippingService?.source === 'shipengine',
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

  return {
    data: rows.map(rowToListItem),
    page,
    pageSize,
    total: totalResult[0]?.count || 0,
  };
}

export async function markOrderPacked(orderId: string) {
  const order = await getCheckoutOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }

  if (order.fulfillmentStatus !== 'label_ready') {
    throw new Error(
      `Order ${orderId} cannot be marked as packed (current status: ${order.fulfillmentStatus}).`,
    );
  }

  return updateCheckoutOrder(orderId, (current) => ({
    ...current,
    fulfillmentStatus: 'packed',
    shipengine: {
      ...current.shipengine,
      packedAt: new Date().toISOString(),
    },
  }));
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

  if (!order.shipengine?.trackingCode || !order.shipengine?.labelUrl) {
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
      tracking_code: order.shipengine.trackingCode,
      carrier_name: order.shipengine.carrier,
      service_name: order.shipengine.service,
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

  const labelUrl = order.shipengine?.labelUrl;
  if (!labelUrl) {
    throw new Error(`Order ${orderId} has no shipping label.`);
  }

  await sendShippingLabelEmail({
    order,
    labelUrl,
    labelResult: {
      carrier: order.shipengine?.carrier,
      service: order.shipengine?.service,
      trackingCode: order.shipengine?.trackingCode,
      publicTrackingUrl: order.shipengine?.publicTrackingUrl,
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

export async function updateShippingAddressAndPurchaseLabel(args: {
  orderId: string;
  shippingAddress: CheckoutShippingAddress;
}) {
  const order = await getCheckoutOrder(args.orderId);
  if (!order) {
    throw new Error(`Order ${args.orderId} not found.`);
  }

  if (!isSuccessfulFulfillmentPaymentStatus(order.payment.status)) {
    throw new Error(`Order ${args.orderId} has not been paid yet.`);
  }

  if (order.shipengine?.labelUrl) {
    throw new Error(`Order ${args.orderId} already has a shipping label.`);
  }

  if (!order.shippingService) {
    throw new Error(
      'Manual review required: the order is missing the selected shipping service.',
    );
  }

  if (order.shippingService.source !== 'shipengine') {
    throw new Error(
      'Manual review required: the selected checkout shipping service was not sourced from ShipEngine.',
    );
  }
  const selectedShippingService = {
    ...order.shippingService,
    shipengineRateId: undefined,
  };

  const addressUpdatedOrder = await updateCheckoutOrder(args.orderId, (current) => ({
    ...current,
    shippingAddress: args.shippingAddress,
    fulfillmentStatus: current.fulfillmentStatus ?? 'pending',
    shipengine: {
      ...current.shipengine,
      labelError: undefined,
    },
  }));

  if (!addressUpdatedOrder) {
    throw new Error(`Failed to update order ${args.orderId}.`);
  }

  const itemCount = addressUpdatedOrder.lines.reduce(
    (total, line) => total + line.quantity,
    0,
  );
  const customsValueAmount = addressUpdatedOrder.lines.reduce(
    (total, line) => total + Number(line.lineTotal.amount || 0),
    0,
  );

  try {
    const labelResult = await purchaseShipEngineLabel({
      shippingAddress: addressUpdatedOrder.shippingAddress,
      itemCount,
      customsValueAmount,
      customsCurrencyCode: addressUpdatedOrder.currencyCode,
      selectedShippingService,
      orderCreatedAt: addressUpdatedOrder.createdAt,
    });

    if (!labelResult.labelUrl) {
      throw new Error('ShipEngine purchased the rate but did not return a label URL.');
    }

    const updatedOrder = await updateCheckoutOrder(args.orderId, (current) => ({
      ...current,
      fulfillmentStatus: 'label_ready',
      shipengine: {
        ...current.shipengine,
        trackingCode: labelResult.trackingCode || undefined,
        labelUrl: labelResult.labelUrl || undefined,
        carrier: labelResult.carrier || undefined,
        service: labelResult.service || undefined,
        publicTrackingUrl: labelResult.publicTrackingUrl || undefined,
        labelPurchasedAt: new Date().toISOString(),
        labelError: undefined,
      },
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
            carrier: updatedOrder.shipengine.carrier,
            service: updatedOrder.shipengine.service,
            trackingCode: updatedOrder.shipengine.trackingCode,
            publicTrackingUrl: updatedOrder.shipengine.publicTrackingUrl,
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
      shipengine: {
        ...current.shipengine,
        labelError: message,
      },
    }));

    throw new Error(message);
  }
}
