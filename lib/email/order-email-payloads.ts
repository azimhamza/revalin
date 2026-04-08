import type { CheckoutOrderRecord } from "../checkout/types.ts";

function formatCurrency(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function formatRegionName(regionCode: string) {
  const normalized = regionCode.trim().toUpperCase();
  if (!normalized) return "";

  try {
    const formatter = new Intl.DisplayNames(["en"], { type: "region" });
    return formatter.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

function buildOrderProductName(line: CheckoutOrderRecord["lines"][number]) {
  const variantTitle = line.variantTitle.trim();
  if (!variantTitle || variantTitle.toLowerCase() === "default" || variantTitle === line.productTitle) {
    return line.productTitle;
  }

  return `${line.productTitle} - ${variantTitle}`;
}

function buildOrderItems(order: CheckoutOrderRecord) {
  return order.lines.map((line) => ({
    product_name: buildOrderProductName(line),
    sku_number: line.skuNumber || "",
    quantity: line.quantity,
    unit_price: formatCurrency(line.unitPrice.amount, order.currencyCode),
    subtotal: formatCurrency(line.lineTotal.amount, order.currencyCode),
  })) satisfies Array<Record<string, string | number>>;
}

function formatEmailDate(value?: string | null) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function estimateDeliveryDate(shippedAt?: string | null, estimatedDays?: number | null) {
  if (!shippedAt || estimatedDays === null || estimatedDays === undefined) {
    return "";
  }

  const parsed = new Date(shippedAt);
  if (Number.isNaN(parsed.getTime())) return "";

  parsed.setUTCDate(parsed.getUTCDate() + Math.max(0, Math.ceil(estimatedDays)));
  return parsed.toISOString().slice(0, 10);
}

export function buildOrderConfirmationDataVariables(order: CheckoutOrderRecord) {
  const shippingAmount = order.totals.shippingAmount
    ? formatCurrency(order.totals.shippingAmount.amount, order.currencyCode)
    : "Free";
  const taxAmount = order.totals.taxAmount
    ? formatCurrency(order.totals.taxAmount.amount, order.currencyCode)
    : "$0.00";
  const discountAmount =
    order.totals.discountAmount && Number(order.totals.discountAmount.amount) > 0
      ? `-${formatCurrency(order.totals.discountAmount.amount, order.currencyCode)}`
      : "$0.00";

  const vars: Record<string, string | number | Array<Record<string, string | number>>> = {
    items: buildOrderItems(order),
    subtotal: formatCurrency(order.totals.subtotalAmount.amount, order.currencyCode),
    shipping: shippingAmount,
    shipping_total: shippingAmount,
    tax: taxAmount,
    discount: discountAmount,
    total_paid: formatCurrency(order.totals.totalAmount.amount, order.currencyCode),
    customer_name: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim(),
    street_address: [order.shippingAddress.address1, order.shippingAddress.address2].filter(Boolean).join(", "),
    city: order.shippingAddress.city,
    state: order.shippingAddress.province,
    postal_code: order.shippingAddress.postalCode,
    country: formatRegionName(order.shippingAddress.country),
    order_number: order.swell.orderNumber || order.orderId,
  };

  return vars;
}

export function buildOrderShippedDataVariables(order: CheckoutOrderRecord) {
  const shippingAmount = order.totals.shippingAmount
    ? formatCurrency(order.totals.shippingAmount.amount, order.currencyCode)
    : "Free";
  const taxAmount = order.totals.taxAmount
    ? formatCurrency(order.totals.taxAmount.amount, order.currencyCode)
    : "$0.00";
  const discountAmount =
    order.totals.discountAmount && Number(order.totals.discountAmount.amount) > 0
      ? `-${formatCurrency(order.totals.discountAmount.amount, order.currencyCode)}`
      : "$0.00";
  const shippedAt = formatEmailDate(order.shipengine?.labelPurchasedAt);
  const deliveryDate = estimateDeliveryDate(order.shipengine?.labelPurchasedAt, order.shippingService?.estimatedDays);

  const vars: Record<string, string | number | Array<Record<string, string | number>>> = {
    order_number: order.swell.orderNumber || order.orderId,
    shipping: [
      {
        carrier: order.shipengine?.carrier || order.shippingService?.carrier || "",
        tracking_number: order.shipengine?.trackingCode || "",
        shipped_at: shippedAt,
        delivery_date: deliveryDate,
      },
    ],
    tracking_link: order.shipengine?.publicTrackingUrl || "",
    items: buildOrderItems(order),
    subtotal: formatCurrency(order.totals.subtotalAmount.amount, order.currencyCode),
    shipping_total: shippingAmount,
    tax: taxAmount,
    discount: discountAmount,
    total_paid: formatCurrency(order.totals.totalAmount.amount, order.currencyCode),
    customer_name: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim(),
    street_address: [order.shippingAddress.address1, order.shippingAddress.address2].filter(Boolean).join(", "),
    city: order.shippingAddress.city,
    state: order.shippingAddress.province,
    postal_code: order.shippingAddress.postalCode,
    country: formatRegionName(order.shippingAddress.country),
  };

  return vars;
}
