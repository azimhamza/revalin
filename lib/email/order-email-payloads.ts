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
    sku_number:
      line.skuNumber?.trim() ||
      line.productHandle?.trim() ||
      line.merchandiseId?.trim() ||
      buildOrderProductName(line),
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

function resolveDeliveryEstimateDays(order: CheckoutOrderRecord) {
  const explicitDays = order.shippingService?.estimatedDays;
  if (Number.isFinite(explicitDays) && explicitDays !== null) {
    return Math.max(0, Math.ceil(Number(explicitDays)));
  }

  const serviceText = [
    order.shippingService?.carrier,
    order.shippingService?.name,
    order.shippingService?.serviceCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rangeMatch = serviceText.match(/\b(\d+)\s*[-–]\s*(\d+)\s*(?:business\s*)?(?:days?|d)\b/);
  if (rangeMatch?.[2]) {
    return Math.max(0, Number(rangeMatch[2]));
  }

  const singleMatch = serviceText.match(/\b(\d+)\s*(?:business\s*)?(?:days?|d)\b/);
  if (singleMatch?.[1]) {
    return Math.max(0, Number(singleMatch[1]));
  }

  const country = order.shippingAddress.country.trim().toUpperCase();
  if (country === "CA") return 3;
  if (country === "US") return 5;
  return 10;
}

function estimateDeliveryDate(shippedAt?: string | null, estimatedDays?: number | null) {
  if (estimatedDays === null || estimatedDays === undefined) {
    return "";
  }

  const parsed = shippedAt ? new Date(shippedAt) : new Date();
  if (Number.isNaN(parsed.getTime())) return "";

  parsed.setUTCDate(parsed.getUTCDate() + Math.max(0, Math.ceil(estimatedDays)));
  return parsed.toISOString().slice(0, 10);
}

function buildCarrierTrackingUrl(args: {
  carrier?: string | null;
  carrierCode?: string | null;
  trackingCode?: string | null;
}) {
  const trackingCode = args.trackingCode?.trim();
  if (!trackingCode) return "";

  const encodedTrackingCode = encodeURIComponent(trackingCode);
  const carrier = `${args.carrier || ""} ${args.carrierCode || ""}`.toLowerCase();

  if (carrier.includes("purolator")) {
    return `https://www.purolator.com/en/shipping/tracker?pins=${encodedTrackingCode}`;
  }

  if (carrier.includes("canada") && carrier.includes("post")) {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodedTrackingCode}`;
  }

  if (carrier.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodedTrackingCode}`;
  }

  if (carrier.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodedTrackingCode}`;
  }

  if (carrier.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodedTrackingCode}`;
  }

  if (carrier.includes("dhl")) {
    return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodedTrackingCode}`;
  }

  return "";
}

export function getOrderTrackingDetails(order: CheckoutOrderRecord) {
  const fulfillment = {
    ...(order.shipengine || {}),
    ...(order.fulfillment || {}),
  };
  const carrier = fulfillment.carrier || order.shippingService?.carrier || "";
  const trackingCode = fulfillment.trackingCode || "";
  const estimatedDeliveryDate =
    fulfillment.estimatedDeliveryDate ||
    order.shippingService?.estimatedDeliveryDate ||
    "";
  const trackingUrl =
    fulfillment.publicTrackingUrl?.trim() ||
    buildCarrierTrackingUrl({
      carrier,
      carrierCode: order.shippingService?.carrierCode,
      trackingCode,
    });
  const shippedAt = fulfillment.handedToCarrierAt || fulfillment.labelPurchasedAt || "";

  return {
    carrier,
    trackingCode,
    trackingUrl,
    shippedAt,
    estimatedDeliveryDate,
  };
}

export function buildOrderConfirmationDataVariables(order: CheckoutOrderRecord) {
  const shippingAmount = order.totals.shippingAmount
    ? formatCurrency(order.totals.shippingAmount.amount, order.currencyCode)
    : "Free";
  const taxAmount = order.totals.taxAmount
    ? formatCurrency(order.totals.taxAmount.amount, order.currencyCode)
    : "$0.00";
  const landedCostAmount = order.totals.landedCostAmount
    ? formatCurrency(order.totals.landedCostAmount.amount, order.currencyCode)
    : "$0.00";
  const shipmentProtectionAmount = order.totals.shipmentProtectionAmount
    ? formatCurrency(order.totals.shipmentProtectionAmount.amount, order.currencyCode)
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
    shipment_protection: shipmentProtectionAmount,
    tax: taxAmount,
    duties: landedCostAmount,
    landed_cost: landedCostAmount,
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
  const landedCostAmount = order.totals.landedCostAmount
    ? formatCurrency(order.totals.landedCostAmount.amount, order.currencyCode)
    : "$0.00";
  const shipmentProtectionAmount = order.totals.shipmentProtectionAmount
    ? formatCurrency(order.totals.shipmentProtectionAmount.amount, order.currencyCode)
    : "$0.00";
  const discountAmount =
    order.totals.discountAmount && Number(order.totals.discountAmount.amount) > 0
      ? `-${formatCurrency(order.totals.discountAmount.amount, order.currencyCode)}`
      : "$0.00";
  const tracking = getOrderTrackingDetails(order);
  const shippedAt = formatEmailDate(tracking.shippedAt);
  const providerDeliveryDate = formatEmailDate(tracking.estimatedDeliveryDate);
  const deliveryDate =
    providerDeliveryDate ||
    estimateDeliveryDate(
      tracking.shippedAt || order.updatedAt || order.createdAt,
      resolveDeliveryEstimateDays(order),
    );

  const vars: Record<string, string | number | Array<Record<string, string | number>>> = {
    order_number: order.swell.orderNumber || order.orderId,
    shipping: [
      {
        carrier: tracking.carrier,
        tracking_number: tracking.trackingCode,
        tracking_url: tracking.trackingUrl,
        shipped_at: shippedAt,
        delivery_date: deliveryDate,
      },
    ],
    delivery_date: deliveryDate,
    tracking_link: tracking.trackingUrl,
    tracking_url: tracking.trackingUrl,
    items: buildOrderItems(order),
    subtotal: formatCurrency(order.totals.subtotalAmount.amount, order.currencyCode),
    shipping_total: shippingAmount,
    shipment_protection: shipmentProtectionAmount,
    tax: taxAmount,
    duties: landedCostAmount,
    landed_cost: landedCostAmount,
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
