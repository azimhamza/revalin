import type { Money } from '@/lib/swell/types';

export type CheckoutShippingAddress = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  notes?: string;
};

export type CheckoutOrderLine = {
  id: string;
  merchandiseId: string;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  skuNumber?: string;
  imageUrl: string;
  selectedOptions: Array<{ name: string; value: string }>;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type CheckoutAppliedDiscount = {
  kind: 'coupon' | 'crypto' | 'manual';
  label: string;
  amount: Money;
  code?: string;
};

export type CheckoutOrderTotals = {
  subtotalAmount: Money;
  discountAmount?: Money;
  discountCode?: string;
  discounts?: CheckoutAppliedDiscount[];
  taxAmount?: Money;
  totalAmount: Money;
  shippingAmount?: Money;
  shippingThresholdAmount: Money;
  shippingStatus: 'free' | 'quoted' | 'pending_quote';
};

export type CheckoutShippingService = {
  id: string;
  name: string;
  quoteCategory?: 'cheapest' | 'best_value' | 'fastest';
  source?: 'shipengine' | 'swell';
  carrier?: string;
  carrierCode?: string;
  serviceCode?: string;
  shipengineRateId?: string;
  estimatedDays?: number | null;
  price: Money;
  originalPrice?: Money;
  taxAmount?: Money;
  pickup?: boolean;
};

export type NowPaymentsPaymentData = {
  provider: 'nowpayments';
  paymentId?: string;
  purchaseId?: string;
  swellPaymentId?: string;
  status: string;
  paymentCurrency: string;
  payAddress?: string;
  sourceWalletAddress?: string | null;
  payAmount?: string;
  amountReceived?: string | null;
  payinExtraId?: string | null;
  network?: string | null;
  networkPrecision?: number | null;
  timeLimit?: number | null;
  expirationEstimateDate?: string | null;
  validUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
  ipnCallbackEnabled: boolean;
};

export type ShieldClimbPaymentData = {
  provider: 'shieldclimb';
  walletId: string;
  addressIn: string;
  polygonAddressIn: string;
  ipnToken: string;
  callbackToken?: string;
  status: string;
  redirectUrl: string;
  swellPaymentId?: string;
  valueCoinReceived?: string | null;
  txidIn?: string | null;
  txidOut?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CheckoutOrderPayment = NowPaymentsPaymentData | ShieldClimbPaymentData;

export type ShieldClimbPublicPaymentData = {
  provider: 'shieldclimb';
  status: string;
  redirectUrl: string;
  swellPaymentId?: string;
  valueCoinReceived?: string | null;
  txidIn?: string | null;
  txidOut?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CheckoutOrderPublicPayment = NowPaymentsPaymentData | ShieldClimbPublicPaymentData;

export function isShieldClimbPayment(payment: CheckoutOrderPayment): payment is ShieldClimbPaymentData {
  return payment.provider === 'shieldclimb';
}

export function isNowPaymentsPayment(payment: CheckoutOrderPayment): payment is NowPaymentsPaymentData {
  return payment.provider === 'nowpayments';
}

export type CheckoutOrderSwell = {
  accountId: string;
  orderId: string;
  orderNumber?: string;
  cartId?: string;
};

export type CheckoutIpnEvent = {
  receivedAt: string;
  signature?: string;
  valid: boolean;
  payload: Record<string, unknown>;
};

export type CheckoutOrderShipEngine = {
  trackingCode?: string;
  labelUrl?: string;
  carrier?: string;
  service?: string;
  publicTrackingUrl?: string;
  labelPurchasedAt?: string;
  labelError?: string;
};

export type CheckoutProcessingStepStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export type CheckoutProcessingStepState = {
  status: CheckoutProcessingStepStatus;
  startedAt?: string;
  completedAt?: string;
  attempts: number;
  lastError?: string | null;
  claimId?: string | null;
};

export type CheckoutOrderProcessing = {
  swellPayment: CheckoutProcessingStepState;
  paymentCompletedEvent: CheckoutProcessingStepState;
  purchaseTelemetry: CheckoutProcessingStepState;
  welcomeDiscount: CheckoutProcessingStepState;
  affiliatePayout: CheckoutProcessingStepState;
  confirmationEmail: CheckoutProcessingStepState;
  labelPurchase: CheckoutProcessingStepState;
  shippingLabelEmail: CheckoutProcessingStepState;
  shippedEmail: CheckoutProcessingStepState;
};

export type CheckoutOrderAffiliate = {
  id: string;
  code: string;
  commissionRate: string;
  commissionRateAtPurchase?: string;
  commissionTierAtPurchase?: string | null;
  commissionMonthKey?: string | null;
  discountCode?: string | null;
  discountPercentAtPurchase?: string | null;
  source: 'url' | 'discount_code' | null;
};

export type CheckoutOrderPromoter = {
  id: string;
  inviteId: string;
  affiliateId: string;
  affiliateCode: string;
  commissionRate: string;
  source: 'promoter_invite';
};

export type CheckoutOrderRecord = {
  orderId: string;
  accessKey: string;
  cartId: string;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
  currencyCode: string;
  shippingAddress: CheckoutShippingAddress;
  shippingService?: CheckoutShippingService;
  lines: CheckoutOrderLine[];
  totals: CheckoutOrderTotals;
  payment: CheckoutOrderPayment;
  swell: CheckoutOrderSwell;
  shipengine?: CheckoutOrderShipEngine;
  affiliate?: CheckoutOrderAffiliate | null;
  promoter?: CheckoutOrderPromoter | null;
  processing?: CheckoutOrderProcessing;
  latestError?: string | null;
  ipnEvents?: CheckoutIpnEvent[];
};

export type CheckoutOrderPublic = Omit<CheckoutOrderRecord, 'accessKey' | 'payment' | 'processing' | 'userId'> & {
  payment: CheckoutOrderPublicPayment;
};

function toPublicCheckoutPayment(payment: CheckoutOrderPayment): CheckoutOrderPublicPayment {
  if (!isShieldClimbPayment(payment)) {
    return payment;
  }

  return {
    provider: payment.provider,
    status: payment.status,
    redirectUrl: payment.redirectUrl,
    swellPaymentId: payment.swellPaymentId,
    valueCoinReceived: payment.valueCoinReceived,
    txidIn: payment.txidIn,
    txidOut: payment.txidOut,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function toPublicCheckoutOrder(order: CheckoutOrderRecord): CheckoutOrderPublic {
  const {
    accessKey: _accessKey,
    userId: _userId,
    processing: _processing,
    payment,
    ...publicOrder
  } = order;
  return {
    ...publicOrder,
    payment: toPublicCheckoutPayment(payment),
  };
}
