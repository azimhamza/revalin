import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { getCheckoutOrder, updateCheckoutOrder } from './order-store';
import { sendOrderShippedEmail, sendShippingLabelEmail } from '@/lib/email/order-emails';
import {
  createSwellShipment,
  getSwellOrder,
} from './swell-order-management';
import type { CheckoutOrderRecord, FulfillmentStatus } from './types';

type FulfillmentOrderRow = typeof checkoutOrders.$inferSelect;

export type FulfillmentOrderListItem = {
  orderId: string;
  orderNumber: string;
  email: string | null;
  customerName: string;
  fulfillmentStatus: FulfillmentStatus | null;
  paymentStatus: string | null;
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
  createdAt: string;
  updatedAt: string;
};

function rowToListItem(row: FulfillmentOrderRow): FulfillmentOrderListItem {
  const shipengine = row.shipengine as CheckoutOrderRecord['shipengine'];
  const shippingAddress = row.shippingAddress as CheckoutOrderRecord['shippingAddress'];
  const totals = row.totals as CheckoutOrderRecord['totals'];
  const swell = row.swell as CheckoutOrderRecord['swell'];
  const lines = row.lines as CheckoutOrderRecord['lines'];

  return {
    orderId: row.orderId,
    orderNumber: swell?.orderNumber || row.orderId,
    email: row.email,
    customerName: `${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''}`.trim(),
    fulfillmentStatus: (row.fulfillmentStatus as FulfillmentStatus) ?? null,
    paymentStatus: row.paymentStatus,
    currencyCode: row.currencyCode,
    totalAmount: totals?.totalAmount?.amount || '0',
    itemCount: lines?.reduce((sum: number, l: { quantity: number }) => sum + l.quantity, 0) || 0,
    carrier: shipengine?.carrier || null,
    service: shipengine?.service || null,
    trackingCode: shipengine?.trackingCode || null,
    labelUrl: shipengine?.labelUrl || null,
    publicTrackingUrl: shipengine?.publicTrackingUrl || null,
    labelPurchasedAt: shipengine?.labelPurchasedAt || null,
    handedToCarrierAt: shipengine?.handedToCarrierAt || null,
    packedAt: shipengine?.packedAt || null,
    labelError: shipengine?.labelError || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

  if (args.status && args.status !== 'all') {
    conditions.push(eq(checkoutOrders.fulfillmentStatus, args.status));
  } else if (!args.status || args.status === 'all') {
    // Only show orders that have entered the fulfillment pipeline
    conditions.push(
      inArray(checkoutOrders.fulfillmentStatus, [
        'label_ready',
        'packed',
        'handed_to_carrier',
        'error',
      ]),
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
