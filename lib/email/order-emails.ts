import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { hasLoopsConfig, sendTransactionalEmail } from '@/lib/email/loops';
import {
  buildOrderConfirmationDataVariables,
  buildOrderShippedDataVariables,
} from '@/lib/email/order-email-payloads';

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

function formatCurrency(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function getShippingLabelRecipients() {
  const multiRecipientValue = process.env.SHIPPING_LABEL_EMAILS?.trim();
  if (multiRecipientValue) {
    return multiRecipientValue
      .split(',')
      .map(email => email.trim())
      .filter(Boolean);
  }

  const singleRecipient = process.env.SHIPPING_LABEL_EMAIL?.trim();
  return singleRecipient ? [singleRecipient] : [];
}

export function buildOrderStatusUrl(order: CheckoutOrderRecord) {
  return `${getSiteUrl()}/order/${order.orderId}?key=${order.accessKey}`;
}

export function buildOrderDataVariables(order: CheckoutOrderRecord) {
  const vars: Record<string, string | number> = {
    orderNumber: order.swell.orderNumber || order.orderId,
    orderId: order.orderId,
    orderStatusUrl: buildOrderStatusUrl(order),
    customerFirstName: order.shippingAddress.firstName,
    customerLastName: order.shippingAddress.lastName,
    customerEmail: order.shippingAddress.email,
    subtotal: formatCurrency(order.totals.subtotalAmount.amount, order.currencyCode),
    total: formatCurrency(order.totals.totalAmount.amount, order.currencyCode),
    currencyCode: order.currencyCode,
    shippingName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
    shippingAddress1: order.shippingAddress.address1,
    shippingAddress2: order.shippingAddress.address2 || '',
    shippingCity: order.shippingAddress.city,
    shippingProvince: order.shippingAddress.province,
    shippingPostalCode: order.shippingAddress.postalCode,
    shippingCountry: order.shippingAddress.country,
  };

  if (order.totals.discountAmount && Number(order.totals.discountAmount.amount) > 0) {
    vars.discount = `-${formatCurrency(order.totals.discountAmount.amount, order.currencyCode)}`;
    vars.discountCode = order.totals.discountCode || '';
  } else {
    vars.discount = '';
    vars.discountCode = '';
  }

  if (order.totals.shippingAmount) {
    vars.shipping = formatCurrency(order.totals.shippingAmount.amount, order.currencyCode);
  } else {
    vars.shipping = 'Free';
  }

  vars.shipmentProtection = order.totals.shipmentProtectionAmount
    ? formatCurrency(order.totals.shipmentProtectionAmount.amount, order.currencyCode)
    : '$0.00';
  vars.shipment_protection = vars.shipmentProtection;

  if (order.totals.taxAmount) {
    vars.tax = formatCurrency(order.totals.taxAmount.amount, order.currencyCode);
  } else {
    vars.tax = '$0.00';
  }

  if (order.totals.landedCostAmount) {
    vars.duties = formatCurrency(order.totals.landedCostAmount.amount, order.currencyCode);
    vars.landedCost = vars.duties;
  } else {
    vars.duties = '$0.00';
    vars.landedCost = '$0.00';
  }

  if (order.shipengine?.trackingCode) {
    vars.trackingCode = order.shipengine.trackingCode;
    vars.carrier = order.shipengine.carrier || '';
    vars.trackingUrl = order.shipengine.publicTrackingUrl || '';
  } else {
    vars.trackingCode = '';
    vars.carrier = '';
    vars.trackingUrl = '';
  }

  // Up to 5 line items as individual vars for simple template layouts
  const maxItems = Math.min(order.lines.length, 5);
  vars.itemCount = order.lines.length;

  for (let i = 0; i < maxItems; i++) {
    const line = order.lines[i]!;
    const idx = i + 1;
    vars[`item${idx}_title`] = line.productTitle;
    vars[`item${idx}_variant`] = line.variantTitle;
    vars[`item${idx}_image`] = line.imageUrl;
    vars[`item${idx}_quantity`] = line.quantity;
    vars[`item${idx}_price`] = formatCurrency(line.lineTotal.amount, order.currencyCode);
    vars[`item${idx}_unitPrice`] = formatCurrency(line.unitPrice.amount, order.currencyCode);
  }

  // Clear remaining item slots
  for (let i = maxItems + 1; i <= 5; i++) {
    vars[`item${i}_title`] = '';
    vars[`item${i}_variant`] = '';
    vars[`item${i}_image`] = '';
    vars[`item${i}_quantity`] = 0;
    vars[`item${i}_price`] = '';
    vars[`item${i}_unitPrice`] = '';
  }

  return vars;
}

export async function sendOrderConfirmationEmail(order: CheckoutOrderRecord) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping order confirmation email: Loops not configured.');
    return null;
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION?.trim();
  if (!transactionalId) {
    console.warn('Skipping order confirmation email: LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION not set.');
    return null;
  }

  const customerEmail = order.shippingAddress.email?.trim();
  if (!customerEmail) {
    console.warn('Skipping order confirmation email: No customer email on order.');
    return null;
  }

  return sendTransactionalEmail({
    email: customerEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildOrderConfirmationDataVariables(order),
    headers: {
      'Idempotency-Key': `order-confirmation-${order.orderId}`,
    },
  });
}

export async function sendOrderShippedEmail(order: CheckoutOrderRecord) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping order shipped email: Loops not configured.');
    return null;
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_ORDER_SHIPPED?.trim();
  if (!transactionalId) {
    console.warn('Skipping order shipped email: LOOPS_TRANSACTIONAL_ORDER_SHIPPED not set.');
    return null;
  }

  const customerEmail = order.shippingAddress.email?.trim();
  if (!customerEmail) {
    console.warn('Skipping order shipped email: No customer email on order.');
    return null;
  }

  return sendTransactionalEmail({
    email: customerEmail,
    transactionalId,
    dataVariables: buildOrderShippedDataVariables(order),
    headers: {
      'Idempotency-Key': `order-shipped-${order.orderId}-${order.shipengine?.trackingCode || 'pending'}`,
    },
  });
}

export async function sendShippingLabelEmail(args: {
  order: CheckoutOrderRecord;
  labelUrl: string;
  labelResult: {
    carrier?: string;
    service?: string;
    trackingCode?: string;
    publicTrackingUrl?: string;
  };
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping shipping label email: Loops not configured.');
    return null;
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_SHIPPING_LABEL?.trim();
  if (!transactionalId) {
    console.warn('Skipping shipping label email: LOOPS_TRANSACTIONAL_SHIPPING_LABEL not set.');
    return null;
  }

  const labelRecipients = getShippingLabelRecipients();
  if (labelRecipients.length === 0) {
    console.warn('Skipping shipping label email: SHIPPING_LABEL_EMAIL or SHIPPING_LABEL_EMAILS not set.');
    return null;
  }

  const { order, labelResult } = args;
  const address = order.shippingAddress;
  const addressBlock = [
    `${address.firstName} ${address.lastName}`,
    address.address1,
    address.address2,
    `${address.city}, ${address.province} ${address.postalCode}`,
    address.country,
  ]
    .filter(Boolean)
    .join(', ');

  const itemsSummary = order.lines.map(line => `${line.productTitle} x${line.quantity}`).join(', ');

  return Promise.all(
    labelRecipients.map(email =>
      sendTransactionalEmail({
        email,
        transactionalId,
        dataVariables: {
          orderId: order.orderId,
          orderNumber: order.swell.orderNumber || order.orderId,
          carrier: labelResult.carrier || 'N/A',
          service: labelResult.service || 'N/A',
          trackingCode: labelResult.trackingCode || 'N/A',
          trackingUrl: labelResult.publicTrackingUrl || '',
          labelUrl: args.labelUrl,
          addressBlock,
          itemsSummary,
          total: formatCurrency(order.totals.totalAmount.amount, order.currencyCode),
        },
      })
    )
  );
}
