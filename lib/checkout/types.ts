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

export type CheckoutLandedCost = {
  provider: 'zonos';
  id?: string;
  amount: Money;
  dutiesAmount?: Money;
  importTaxAmount?: Money;
  feesAmount?: Money;
  calculationMethod?: string;
  tariffRate?: string;
  serviceLevelCode?: string;
};

export type CheckoutOrderTotals = {
  subtotalAmount: Money;
  discountAmount?: Money;
  discountCode?: string;
  discounts?: CheckoutAppliedDiscount[];
  taxAmount?: Money;
  landedCostAmount?: Money;
  landedCost?: CheckoutLandedCost;
  totalAmount: Money;
  shippingAmount?: Money;
  shippingThresholdAmount: Money;
  shippingStatus: 'free' | 'quoted' | 'pending_quote';
};

export type CheckoutShippingService = {
  id: string;
  name: string;
  quoteCategory?: 'cheapest' | 'best_value' | 'fastest';
  source?: 'shipengine' | 'shippo' | 'swell';
  carrier?: string;
  carrierCode?: string;
  serviceCode?: string;
  shipengineRateId?: string;
  shippoRateId?: string;
  shippoShipmentId?: string;
  shippoCarrierAccountId?: string;
  carrierPreferenceRank?: number;
  estimatedDays?: number | null;
  price: Money;
  originalPrice?: Money;
  taxAmount?: Money;
  landedCostAmount?: Money;
  landedCost?: CheckoutLandedCost;
  pickup?: boolean;
};

export type NowPaymentsPaymentData = {
  provider: 'nowpayments';
  paymentMethod?: 'crypto';
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
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  supersededByOrderId?: string;
};

export type ShieldClimbPaymentData = {
  provider: 'shieldclimb';
  paymentMethod?: 'card_debit';
  walletId: string;
  addressIn: string;
  polygonAddressIn: string;
  ipnToken: string;
  callbackUrl?: string;
  callbackToken?: string;
  status: string;
  redirectUrl: string;
  expectedValueCoin?: string;
  paymentCurrency?: string;
  coinReceived?: string | null;
  callbackVerifiedAt?: string;
  swellPaymentId?: string;
  valueCoinReceived?: string | null;
  txidIn?: string | null;
  txidOut?: string | null;
  createdAt?: string;
  updatedAt?: string;
  amountPaidToDate?: string;
  cumulativePaidAmount?: string;
  remainingBalanceAmount?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  supersededByOrderId?: string;
};

export type BankfulPaymentData = {
  provider: 'bankful';
  paymentMethod?: 'card_debit';
  attemptId: string;
  status: 'paid' | 'pending' | 'declined' | 'failed' | 'capture_unknown' | string;
  bankfulStatus?: string | null;
  requestAction?: string | null;
  transactionValue?: string | null;
  transactionRequestId?: string | null;
  transactionRecordId?: string | null;
  transactionOrderId?: string | null;
  xtlOrderId?: string | null;
  transactionCurrency?: string | null;
  bankfulTimestamp?: string | null;
  apiAdvice?: string | null;
  serviceAdvice?: string | null;
  processorAdvice?: string | null;
  errorMessage?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  capturedAt?: string | null;
  swellPaymentId?: string;
  createdAt?: string;
  updatedAt?: string;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  supersededByOrderId?: string;
};

export type InteracPaymentData = {
  provider: 'interac';
  paymentMethod?: 'interac';
  status:
    | 'awaiting_transfer'
    | 'submitted'
    | 'under_review'
    | 'partially_paid'
    | 'paid'
    | 'expired'
    | 'review_required'
    | 'replaced'
    | 'cancelled';
  recipientEmail: string;
  messageCode: string;
  cadAmount: string;
  expectedSenderEmail: string;
  expectedSenderName: string;
  securityQuestion?: string | null;
  securityAnswer?: string | null;
  expiresAt: string;
  submittedAt?: string;
  screenshotUrls?: string[];
  swellPaymentId?: string;
  swellPaymentSyncToken?: string | null;
  swellPaymentSyncStartedAt?: string | null;
  confirmedAt?: string;
  receivedAmount?: string;
  senderName?: string | null;
  replyToEmail?: string | null;
  bankReference?: string | null;
  gmailMessageId?: string | null;
  senderMismatch?: boolean;
  createdAt?: string;
  updatedAt?: string;
  amountPaidToDate?: string;
  cumulativePaidAmount?: string;
  remainingBalanceAmount?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  supersededByOrderId?: string;
};

export type CheckoutOrderPayment =
  | NowPaymentsPaymentData
  | ShieldClimbPaymentData
  | BankfulPaymentData
  | InteracPaymentData;

export type CheckoutPaymentCarryoverPublicData = {
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  supersededByOrderId?: string;
  supersededByAccessKey?: string;
  cumulativePaidAmount?: string;
  remainingBalanceAmount?: string;
};

export type NowPaymentsPublicPaymentData =
  NowPaymentsPaymentData & CheckoutPaymentCarryoverPublicData;

export type ShieldClimbPublicPaymentData = {
  provider: 'shieldclimb';
  status: string;
  redirectUrl: string;
  expectedValueCoin?: string;
  swellPaymentId?: string;
  valueCoinReceived?: string | null;
  txidIn?: string | null;
  txidOut?: string | null;
  createdAt?: string;
  updatedAt?: string;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  supersededByOrderId?: string;
  supersededByAccessKey?: string;
  cumulativePaidAmount?: string;
  remainingBalanceAmount?: string;
};

export type BankfulPublicPaymentData =
  BankfulPaymentData & CheckoutPaymentCarryoverPublicData;

export type CheckoutOrderPublicPayment =
  | NowPaymentsPublicPaymentData
  | ShieldClimbPublicPaymentData
  | BankfulPublicPaymentData
  | (InteracPaymentData & CheckoutPaymentCarryoverPublicData);

export function isShieldClimbPayment(payment: CheckoutOrderPayment): payment is ShieldClimbPaymentData {
  return payment.provider === 'shieldclimb';
}

export function isNowPaymentsPayment(payment: CheckoutOrderPayment): payment is NowPaymentsPaymentData {
  return payment.provider === 'nowpayments';
}

export function isInteracPayment(payment: CheckoutOrderPayment): payment is InteracPaymentData {
  return payment.provider === 'interac';
}

export function isBankfulPayment(payment: CheckoutOrderPayment): payment is BankfulPaymentData {
  return payment.provider === 'bankful';
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
  handedToCarrierAt?: string;
  packedAt?: string;
  shippedEmailSentAt?: string;
  swellShipmentId?: string;
  markedShippedByUserId?: string;
};

export type CheckoutOrderFulfillment = {
  provider?: 'shippo' | 'shipengine' | 'manual';
  trackingCode?: string;
  labelUrl?: string;
  carrier?: string;
  service?: string;
  publicTrackingUrl?: string;
  labelPurchasedAt?: string;
  labelError?: string;
  handedToCarrierAt?: string;
  packedAt?: string;
  shippedEmailSentAt?: string;
  swellShipmentId?: string;
  markedShippedByUserId?: string;
  shippoTransactionId?: string;
  shippoRateId?: string;
  shippoShipmentId?: string;
  shippoCarrierAccountId?: string;
  commercialInvoiceUrl?: string;
  customs?: Record<string, unknown>;
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

export type FulfillmentStatus = 'pending' | 'label_ready' | 'packed' | 'handed_to_carrier' | 'error';

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
  fulfillment?: CheckoutOrderFulfillment;
  affiliate?: CheckoutOrderAffiliate | null;
  promoter?: CheckoutOrderPromoter | null;
  processing?: CheckoutOrderProcessing;
  fulfillmentStatus?: FulfillmentStatus | null;
  latestError?: string | null;
  ipnEvents?: CheckoutIpnEvent[];
};

export type CheckoutOrderPublic = Omit<CheckoutOrderRecord, 'accessKey' | 'payment' | 'processing' | 'userId'> & {
  payment: CheckoutOrderPublicPayment;
  fulfillmentStatus?: FulfillmentStatus | null;
};

function toPublicCheckoutPayment(
  payment: CheckoutOrderPayment,
  carryover?: CheckoutPaymentCarryoverPublicData,
): CheckoutOrderPublicPayment {
  if (isBankfulPayment(payment)) {
    return {
      ...payment,
      ...carryover,
    };
  }

  if (!isShieldClimbPayment(payment)) {
    return {
      ...payment,
      ...carryover,
    };
  }

  return {
    provider: payment.provider,
    status: payment.status,
    redirectUrl: payment.redirectUrl,
    expectedValueCoin: payment.expectedValueCoin,
    swellPaymentId: payment.swellPaymentId,
    valueCoinReceived: payment.valueCoinReceived,
    txidIn: payment.txidIn,
    txidOut: payment.txidOut,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    amountPaidToDate: payment.amountPaidToDate,
    attemptAmount: payment.attemptAmount,
    carryoverRootOrderId: payment.carryoverRootOrderId,
    supersededByOrderId: payment.supersededByOrderId,
    supersededByAccessKey: carryover?.supersededByAccessKey,
    cumulativePaidAmount: carryover?.cumulativePaidAmount,
    remainingBalanceAmount: carryover?.remainingBalanceAmount,
  };
}

export function toPublicCheckoutOrder(
  order: CheckoutOrderRecord,
  extras?: { payment?: CheckoutPaymentCarryoverPublicData },
): CheckoutOrderPublic {
  const {
    accessKey: _accessKey,
    userId: _userId,
    processing: _processing,
    payment,
    ...publicOrder
  } = order;
  return {
    ...publicOrder,
    payment: toPublicCheckoutPayment(payment, extras?.payment),
  };
}
