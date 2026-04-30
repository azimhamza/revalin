import type { CheckoutOrderRecord } from './types.ts';

export type CheckoutPaymentMethod = 'card' | 'crypto' | 'interac';
export type CheckoutTelemetryProvider = 'shieldclimb' | 'nowpayments' | 'interac';

export type CheckoutTelemetryContext = {
  orderId: string;
  userId?: string | null;
  currencyCode: string;
  orderTotal: string;
  itemCount: number;
  paymentProvider: CheckoutTelemetryProvider;
  paymentMethod: CheckoutPaymentMethod;
  affiliateCode?: string | null;
  affiliateSource?: string | null;
};

export function getCheckoutItemCount(order: CheckoutOrderRecord) {
  return order.lines.reduce((total, line) => total + line.quantity, 0);
}

export function getCheckoutPaymentMethod(
  provider: CheckoutTelemetryProvider
): CheckoutPaymentMethod {
  if (provider === 'shieldclimb') return 'card';
  if (provider === 'interac') return 'interac';
  return 'crypto';
}

export function buildOpenPanelAuthProperties(userId?: string | null) {
  const properties: Record<string, string> = {
    auth_state: userId ? 'authenticated' : 'anonymous',
  };

  if (userId) {
    properties.profileId = userId;
    properties.user_id = userId;
  }

  return properties;
}

export function buildCheckoutPaymentInitiatedEventProperties(
  args: CheckoutTelemetryContext
) {
  const properties: Record<string, string | number | boolean> = {
    orderId: args.orderId,
    paymentProvider: args.paymentProvider,
    paymentMethod: args.paymentMethod,
    orderTotal: args.orderTotal,
    currencyCode: args.currencyCode,
    itemCount: args.itemCount,
  };

  if (args.affiliateCode) {
    properties.affiliateCode = args.affiliateCode;
  }

  if (args.affiliateSource) {
    properties.affiliateSource = args.affiliateSource;
  }

  return properties;
}

export function buildPaymentCompletedEventProperties(
  order: CheckoutOrderRecord
) {
  return {
    orderId: order.orderId,
    orderTotal: order.totals.totalAmount.amount,
    currencyCode: order.currencyCode,
  };
}

export function buildCheckoutPaymentInitiatedTrackingProperties(
  args: CheckoutTelemetryContext
) {
  const properties: Record<string, string | number | boolean> = {
    ...buildOpenPanelAuthProperties(args.userId),
    orderId: args.orderId,
    orderTotal: args.orderTotal,
    currencyCode: args.currencyCode,
    paymentProvider: args.paymentProvider,
    paymentMethod: args.paymentMethod,
    itemCount: args.itemCount,
  };

  if (args.affiliateCode) {
    properties.affiliate_code = args.affiliateCode;
  }

  if (args.affiliateSource) {
    properties.affiliate_source = args.affiliateSource;
  }

  return properties;
}

export function buildPurchaseTrackingProperties(order: CheckoutOrderRecord) {
  const properties: Record<string, string | number | boolean> = {
    ...buildOpenPanelAuthProperties(order.userId),
    orderId: order.orderId,
    orderTotal: order.totals.totalAmount.amount,
    currencyCode: order.currencyCode,
    paymentMethod: getCheckoutPaymentMethod(order.payment.provider),
    itemCount: getCheckoutItemCount(order),
  };

  if (order.affiliate?.code) {
    properties.affiliate_code = order.affiliate.code;
  }

  if (order.affiliate?.source) {
    properties.affiliate_source = order.affiliate.source;
  }

  return properties;
}
