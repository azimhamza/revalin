import crypto from 'node:crypto';
import { ApiError, apiError } from '@/lib/api/errors';
import { optionalSession } from '@/lib/api/auth';
import {
  getApprovedAffiliateByCode,
  getApprovedAffiliateByDiscountCode,
} from '@/lib/checkout/affiliate-service';
import { getSuccessfulPromoterForAffiliate } from '@/lib/checkout/promoter-service';
import {
  buildAdminDisabledCheckoutShippingService,
  buildAdminDisabledRatedService,
} from '@/lib/checkout/admin-shipping';
import {
  getFreeShippingThresholdForCurrency,
  isTerminalPaymentStatus,
} from '@/lib/checkout/constants';
import { isShippoConfigured } from '@/lib/checkout/shippo';
import {
  getAffiliateCommissionSnapshot,
  getCommissionMonthKey,
} from '@/lib/checkout/commission-service';
import {
  buildInitialCheckoutOrderProcessing,
  runSuccessfulOrderProcessing,
} from '@/lib/checkout/payment-lifecycle';
import {
  bankfulResponseSnapshot,
  createBankfulSale,
  mapBankfulStatus,
  type BankfulCardInput,
  type BankfulTransactionResponse,
} from '@/lib/checkout/bankful';
import {
  claimBankfulPaymentAttemptCapture,
  createBankfulPaymentAttempt,
  findRecentSafeBankfulFallbackAttempt,
  updateBankfulPaymentAttempt,
} from '@/lib/checkout/bankful-attempt-store';
import {
  createNowPaymentsPayment,
  getNowPaymentsEstimate,
  getNowPaymentsMinimumAmount,
} from '@/lib/checkout/nowpayments';
import {
  createSquarePaymentLink,
  deleteSquarePaymentLink,
  type SquarePaymentLinkResponse,
} from '@/lib/checkout/square';
import {
  buildCarryoverComparableFromFinalizeInput,
  buildCarryoverContext,
  buildCheckoutCarryoverPublicData,
  isSameCarryoverCheckoutOrder,
  isSupersededCheckoutOrder,
} from '@/lib/checkout/carryover';
import {
  saveCheckoutOrder,
  findCheckoutOrderByCartId,
  findCheckoutOrdersByCartId,
  findOpenCheckoutOrdersByEmail,
  updateCheckoutOrder,
} from '@/lib/checkout/order-store';
import { markCheckoutOrderSetupFailed } from '@/lib/checkout/order-recovery';
import {
  buildCheckoutPricingMetadata,
  calculateCheckoutPricing,
} from '@/lib/checkout/pricing';
import {
  createInteracMessageCode,
  findInteracOrderByMessageCode,
  getInteracExpiresAt,
  getInteracRecipientEmail,
} from '@/lib/checkout/interac';
import {
  getCardProcessingUnavailableMessage,
  isCardProcessingEnabled,
  isCardSquareFallbackEnabled,
} from '@/lib/checkout/payment-method-rules';
import {
  createWalletForOrder,
  buildShieldClimbPaymentUrl,
  convertToUsd,
} from '@/lib/checkout/shieldclimb';
import {
  applyCustomerShippingMarkup,
  applyFreeShipping,
  applyShipmentProtectionToServices,
  findCheckoutShippingService,
  getCartSnapshotItemCount,
  getCartSnapshotSubtotal,
  getShipEngineCheckoutServices,
  mapSwellRatedServices,
  toCustomerFacingCheckoutServices,
  type CheckoutRatedService,
} from '@/lib/checkout/shipping-rates';
import { quoteZonosLandedCost } from '@/lib/checkout/zonos';
import {
  cancelSwellOrder,
  convertSwellCartToOrder,
  createSwellCheckoutCart,
  deleteSwellCheckoutCart,
  findSwellCouponCodeByCode,
  getSwellCoupon,
  getSwellManualPaymentMethod,
  toSwellAddress,
  updateSwellCheckoutCart,
  updateSwellOrder,
  upsertSwellGuestAccount,
} from '@/lib/checkout/swell-order-management';
import {
  sendCheckoutPaymentInitiatedEvent,
  trackCheckoutPaymentInitiated,
} from '@/lib/checkout/telemetry';
import type {
  CheckoutOrderAffiliate,
  CheckoutLandedCost,
  CheckoutOrderLine,
  CheckoutOrderPromoter,
  CheckoutOrderPublic,
  CheckoutOrderRecord,
  CheckoutShippingAddress,
  CheckoutShippingService,
  InteracPaymentData,
  BankfulPaymentData,
  NowPaymentsPaymentData,
  ShieldClimbPaymentData,
  SquarePaymentData,
} from '@/lib/checkout/types';
import {
  isInteracPayment,
  isNowPaymentsPayment,
  isShieldClimbPayment,
  isSquarePayment,
  toPublicCheckoutOrder,
} from '@/lib/checkout/types';

type FinalizeCheckoutInput = {
  sessionId: string;
  sessionVersion: number;
  cartId?: string | null;
  cartSnapshot: {
    currencyCode: string;
    lines: Array<{
      id: string;
      merchandiseId: string;
      productHandle: string;
      productTitle: string;
      variantTitle: string;
      skuNumber?: string;
      imageUrl: string;
      selectedOptions: Array<{ name: string; value: string }>;
      quantity: number;
      unitPrice: { amount: string; currencyCode: string };
      lineTotal: { amount: string; currencyCode: string };
      fulfillmentEstimate?: {
        label: string;
        availableToShipNow: number;
        isHighDemand: boolean;
      };
    }>;
  };
  shippingAddress: CheckoutShippingAddress;
  paymentMethod: 'card' | 'crypto' | 'interac' | 'square';
  paymentCurrency?: string | null;
  card?: BankfulCardInput | null;
  sourceWalletAddress?: string | null;
  interacSenderEmail?: string | null;
  interacSenderName?: string | null;
  interacSecurityQuestion?: string | null;
  interacSecurityAnswer?: string | null;
  selectedShippingServiceId: string;
  shipmentProtection?: boolean;
  adminShippingDisabled?: boolean;
  discountCode?: string | null;
  requestUrl: URL;
  affiliateCode?: string | null;
};

export type FinalizeCheckoutDependencies = {
  nowDate: () => Date;
  nowIso: () => string;
  createOrderId: () => string;
  createAccessKey: () => string;
  createShieldClimbCallbackToken: () => string;
  createInteracMessageCode: () => string;
  findInteracOrderByMessageCode: typeof findInteracOrderByMessageCode;
  optionalSession: typeof optionalSession;
  getApprovedAffiliateByDiscountCode: typeof getApprovedAffiliateByDiscountCode;
  getApprovedAffiliateByCode: typeof getApprovedAffiliateByCode;
  getAffiliateCommissionSnapshot: typeof getAffiliateCommissionSnapshot;
  getCommissionMonthKey: typeof getCommissionMonthKey;
  getSuccessfulPromoterForAffiliate: typeof getSuccessfulPromoterForAffiliate;
  findCheckoutOrderByCartId: typeof findCheckoutOrderByCartId;
  findCheckoutOrdersByCartId: typeof findCheckoutOrdersByCartId;
  findOpenCheckoutOrdersByEmail: typeof findOpenCheckoutOrdersByEmail;
  saveCheckoutOrder: typeof saveCheckoutOrder;
  updateCheckoutOrder: typeof updateCheckoutOrder;
  upsertSwellGuestAccount: typeof upsertSwellGuestAccount;
  createSwellCheckoutCart: typeof createSwellCheckoutCart;
  getShipEngineCheckoutServices: typeof getShipEngineCheckoutServices;
  getSwellManualPaymentMethod: typeof getSwellManualPaymentMethod;
  updateSwellCheckoutCart: typeof updateSwellCheckoutCart;
  convertSwellCartToOrder: typeof convertSwellCartToOrder;
  updateSwellOrder: typeof updateSwellOrder;
  cancelSwellOrder: typeof cancelSwellOrder;
  deleteSwellCheckoutCart: typeof deleteSwellCheckoutCart;
  createWalletForOrder: typeof createWalletForOrder;
  convertToUsd: typeof convertToUsd;
  buildShieldClimbPaymentUrl: typeof buildShieldClimbPaymentUrl;
  getNowPaymentsEstimate: typeof getNowPaymentsEstimate;
  getNowPaymentsMinimumAmount: typeof getNowPaymentsMinimumAmount;
  createNowPaymentsPayment: typeof createNowPaymentsPayment;
  createSquarePaymentLink: typeof createSquarePaymentLink;
  createBankfulPaymentAttempt: typeof createBankfulPaymentAttempt;
  findRecentSafeBankfulFallbackAttempt: typeof findRecentSafeBankfulFallbackAttempt;
  claimBankfulPaymentAttemptCapture: typeof claimBankfulPaymentAttemptCapture;
  updateBankfulPaymentAttempt: typeof updateBankfulPaymentAttempt;
  createBankfulSale: typeof createBankfulSale;
  runSuccessfulOrderProcessing: typeof runSuccessfulOrderProcessing;
  sendCheckoutPaymentInitiatedEvent: typeof sendCheckoutPaymentInitiatedEvent;
  trackCheckoutPaymentInitiated: typeof trackCheckoutPaymentInitiated;
};

function createOrderId() {
  return `RVL-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function createAccessKey() {
  return crypto.randomUUID() + crypto.randomBytes(8).toString('hex');
}

function createShieldClimbCallbackToken() {
  return crypto.randomUUID() + crypto.randomBytes(8).toString('hex');
}

function createShieldClimbSessionId(ipnToken: string) {
  return `shieldclimb:${ipnToken}`;
}

function getHostedPaymentRedirectUrl(payment: CheckoutOrderRecord['payment']) {
  if (isShieldClimbPayment(payment)) return payment.redirectUrl;
  if (isSquarePayment(payment)) return payment.checkoutUrl;
  return null;
}

function createBankfulAttemptId(sessionId: string, version: number) {
  const digest = crypto
    .createHash('sha256')
    .update(`${sessionId}:${version}`)
    .digest('hex')
    .slice(0, 18)
    .toUpperCase();

  return `BF${digest}`;
}

const BANKFUL_SAFE_FAILURE_DEDUPE_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeComparableValue(value?: string | null) {
  return (value || '').trim();
}

function normalizeComparableEmail(value?: string | null) {
  return normalizeComparableValue(value).toLowerCase();
}

function normalizeComparableCountry(value?: string | null) {
  return normalizeComparableValue(value).toUpperCase();
}

function normalizeComparableDiscountCode(value?: string | null) {
  return normalizeComparableValue(value).toUpperCase();
}

async function getSwellCouponDiscountRate(code?: string | null) {
  if (!code) {
    return undefined;
  }

  try {
    const couponCode = await findSwellCouponCodeByCode(code);
    if (!couponCode?.parent_id) {
      return undefined;
    }

    const coupon = await getSwellCoupon(couponCode.parent_id);
    if (coupon.active === false) {
      return undefined;
    }

    const percentageDiscount = (coupon.discounts || []).find(discount =>
      discount.value_type === 'percent' &&
      Number.isFinite(Number(discount.value_percent)) &&
      Number(discount.value_percent) > 0
    );
    const percentValue = Number(percentageDiscount?.value_percent);

    return Number.isFinite(percentValue) && percentValue > 0
      ? percentValue / 100
      : undefined;
  } catch (error) {
    console.warn('Unable to resolve Swell coupon percentage for checkout finalize pricing.', {
      code,
      error,
    });
    return undefined;
  }
}

function buildComparableCartLinesSignature(
  lines: Array<{
    merchandiseId: string;
    quantity: number;
  }>,
) {
  return JSON.stringify(
    [...lines]
      .map((line) => ({
        merchandiseId: normalizeComparableValue(line.merchandiseId),
        quantity: line.quantity,
      }))
      .sort((left, right) => {
        const byMerchandise = left.merchandiseId.localeCompare(
          right.merchandiseId,
        );
        if (byMerchandise !== 0) {
          return byMerchandise;
        }

        return left.quantity - right.quantity;
      }),
  );
}

function buildComparableShippingAddressSignature(address: CheckoutShippingAddress) {
  return JSON.stringify({
    firstName: normalizeComparableValue(address.firstName),
    lastName: normalizeComparableValue(address.lastName),
    email: normalizeComparableEmail(address.email),
    phone: normalizeComparableValue(address.phone),
    address1: normalizeComparableValue(address.address1),
    address2: normalizeComparableValue(address.address2),
    city: normalizeComparableValue(address.city),
    province: normalizeComparableValue(address.province),
    postalCode: normalizeComparableValue(address.postalCode),
    country: normalizeComparableCountry(address.country),
  });
}

function doesExistingOrderMatchCheckoutAttempt(args: {
  existingOrder: CheckoutOrderRecord;
  input: FinalizeCheckoutInput;
}) {
  if (args.existingOrder.payment.status === 'partially_paid') {
    return false;
  }

  if (isSupersededCheckoutOrder(args.existingOrder)) {
    return false;
  }

  const orderPaymentMethod =
    args.existingOrder.payment.provider === 'shieldclimb' ||
    args.existingOrder.payment.provider === 'bankful'
      ? 'card'
      : args.existingOrder.payment.provider === 'interac'
        ? 'interac'
        : args.existingOrder.payment.provider === 'square'
          ? 'square'
          : 'crypto';

  if (orderPaymentMethod !== args.input.paymentMethod) {
    return false;
  }

  if (
    args.input.paymentMethod === 'card' &&
    args.existingOrder.payment.provider !== 'bankful'
  ) {
    return false;
  }

  if (
    args.input.paymentMethod === 'square' &&
    !isSquarePayment(args.existingOrder.payment)
  ) {
    return false;
  }

  if (
    buildComparableCartLinesSignature(
      args.existingOrder.lines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
    ) !==
    buildComparableCartLinesSignature(
      args.input.cartSnapshot.lines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
    )
  ) {
    return false;
  }

  if (
    buildComparableShippingAddressSignature(args.existingOrder.shippingAddress) !==
    buildComparableShippingAddressSignature(args.input.shippingAddress)
  ) {
    return false;
  }

  if (
    normalizeComparableValue(args.existingOrder.shippingService?.id) !==
    normalizeComparableValue(args.input.selectedShippingServiceId)
  ) {
    return false;
  }

  if (
    Boolean(args.existingOrder.totals.shipmentProtection) !==
    (args.input.shipmentProtection === true)
  ) {
    return false;
  }

  if (
    normalizeComparableDiscountCode(args.existingOrder.totals.discountCode) !==
    normalizeComparableDiscountCode(args.input.discountCode)
  ) {
    return false;
  }

  if (args.input.paymentMethod === 'crypto') {
    if (args.existingOrder.payment.provider !== 'nowpayments') {
      return false;
    }

    if (
      normalizeComparableValue(args.existingOrder.payment.paymentCurrency).toLowerCase() !==
      normalizeComparableValue(args.input.paymentCurrency).toLowerCase()
    ) {
      return false;
    }

    if (
      normalizeComparableValue(args.existingOrder.payment.sourceWalletAddress) !==
      normalizeComparableValue(args.input.sourceWalletAddress)
    ) {
      return false;
    }
  }

  if (args.input.paymentMethod === 'interac') {
    if (!isInteracPayment(args.existingOrder.payment)) {
      return false;
    }

    if (
      normalizeComparableEmail(args.existingOrder.payment.expectedSenderEmail) !==
      normalizeComparableEmail(args.input.interacSenderEmail)
    ) {
      return false;
    }

    if (
      normalizeComparableValue(args.existingOrder.payment.expectedSenderName) !==
      normalizeComparableValue(args.input.interacSenderName)
    ) {
      return false;
    }

    if (
      normalizeComparableValue(args.existingOrder.payment.securityQuestion) !==
      normalizeComparableValue(args.input.interacSecurityQuestion)
    ) {
      return false;
    }

    if (
      normalizeComparableValue(args.existingOrder.payment.securityAnswer) !==
      normalizeComparableValue(args.input.interacSecurityAnswer)
    ) {
      return false;
    }
  }

  return true;
}

function toPublicCheckoutOrderWithCarryover(
  order: CheckoutOrderRecord,
  relatedOrders: CheckoutOrderRecord[],
) {
  const supersededByOrderId = order.payment.supersededByOrderId?.trim();
  const supersededByOrder = supersededByOrderId
    ? relatedOrders.find(
        (candidate) =>
          candidate.orderId === supersededByOrderId &&
          isSameCarryoverCheckoutOrder(order, candidate),
      )
    : null;

  return toPublicCheckoutOrder(order, {
    payment: buildCheckoutCarryoverPublicData({
      order,
      relatedOrders,
      supersededByAccessKey: supersededByOrder?.accessKey ?? null,
    }),
  });
}

async function supersedeCarryoverChainOrders(args: {
  checkoutOrder: CheckoutOrderRecord;
  chainOrders: CheckoutOrderRecord[];
  dependencies: Pick<
    FinalizeCheckoutDependencies,
    'cancelSwellOrder' | 'updateCheckoutOrder'
  >;
}) {
  if (args.chainOrders.length === 0) {
    return;
  }

  const supersededAt = new Date().toISOString();
  const reason = `Superseded by newer checkout order ${args.checkoutOrder.orderId}.`;

  await Promise.all(
    args.chainOrders.map(async (chainOrder) => {
      if (chainOrder.orderId === args.checkoutOrder.orderId) {
        return;
      }

      await args.dependencies
        .cancelSwellOrder(chainOrder.swell.orderId, reason)
        .catch((error) => {
          console.error('Unable to cancel superseded carryover Swell order:', error);
        });

      if (isSquarePayment(chainOrder.payment)) {
        await deleteSquarePaymentLink(chainOrder.payment.paymentLinkId).catch((error) => {
          console.error('Unable to delete superseded Square payment link:', error);
        });
      }

      await args.dependencies
        .updateCheckoutOrder(chainOrder.orderId, (current) => {
          if (isTerminalPaymentStatus(current.payment.status)) {
            return current;
          }

          if (isInteracPayment(current.payment)) {
            return {
              ...current,
              payment: {
                ...current.payment,
                status: 'replaced',
                supersededByOrderId: args.checkoutOrder.orderId,
                updatedAt: supersededAt,
              },
              latestError: reason,
            };
          }

          const normalizedStatus = current.payment.status.trim().toLowerCase();
          const keepHistoricalPartial = normalizedStatus === 'partially_paid';

          return {
            ...current,
            payment: {
              ...current.payment,
              status: keepHistoricalPartial ? current.payment.status : 'replaced',
              supersededByOrderId: args.checkoutOrder.orderId,
              ...(isSquarePayment(current.payment) && !keepHistoricalPartial
                ? { deletedAt: new Date().toISOString(), deletionError: null }
                : {}),
              updatedAt: supersededAt,
            },
            latestError: keepHistoricalPartial ? current.latestError : reason,
          };
        })
        .catch((error) => {
          console.error('Unable to mark carryover checkout order superseded:', error);
        });
    }),
  );
}

async function replaceSupersededOpenOrders(args: {
  checkoutOrder: CheckoutOrderRecord;
  customerEmail: string;
  excludedOrderIds?: Set<string>;
  dependencies: Pick<
    FinalizeCheckoutDependencies,
    'findOpenCheckoutOrdersByEmail' | 'cancelSwellOrder' | 'updateCheckoutOrder'
  >;
}) {
  const openOrders = await args.dependencies.findOpenCheckoutOrdersByEmail({
    email: args.customerEmail,
    excludeOrderId: args.checkoutOrder.orderId,
    provider: args.checkoutOrder.payment.provider,
  });

  if (openOrders.length === 0) {
    return;
  }

  const replacedAt = new Date().toISOString();
  const reason = `Superseded by newer checkout order ${args.checkoutOrder.orderId}.`;

  await Promise.all(
    openOrders.map(async (openOrder) => {
      if (args.excludedOrderIds?.has(openOrder.orderId)) {
        return;
      }

      await args.dependencies
        .cancelSwellOrder(openOrder.swell.orderId, reason)
        .catch((error) => {
          console.error('Unable to cancel superseded Swell order:', error);
        });

      if (isSquarePayment(openOrder.payment)) {
        await deleteSquarePaymentLink(openOrder.payment.paymentLinkId).catch((error) => {
          console.error('Unable to delete superseded Square payment link:', error);
        });
      }

      await args.dependencies
        .updateCheckoutOrder(openOrder.orderId, (current) => {
          if (isTerminalPaymentStatus(current.payment.status)) {
            return current;
          }

          if (isInteracPayment(current.payment)) {
            return {
              ...current,
              payment: {
                ...current.payment,
                status: 'replaced',
                supersededByOrderId: args.checkoutOrder.orderId,
                updatedAt: replacedAt,
              },
              latestError: reason,
            };
          }

          return {
            ...current,
            payment: {
              ...current.payment,
              status: 'replaced',
              supersededByOrderId: args.checkoutOrder.orderId,
              ...(isSquarePayment(current.payment)
                ? { deletedAt: new Date().toISOString(), deletionError: null }
                : {}),
              updatedAt: replacedAt,
            },
            latestError: reason,
          };
        })
        .catch((error) => {
          console.error('Unable to mark superseded checkout order replaced:', error);
        });
    }),
  );
}

function buildOrderDescription(lines: CheckoutOrderLine[]) {
  const summary = lines
    .map((line) => `${line.productTitle} x${line.quantity}`)
    .join(', ')
    .slice(0, 180);

  return summary || 'Revalin research order';
}

function shouldEnableIpnCallback(requestUrl: URL) {
  return (
    !['localhost', '127.0.0.1'].includes(requestUrl.hostname) &&
    !requestUrl.hostname.endsWith('.local')
  );
}

function getPublicCallbackOrigin(requestUrl: URL) {
  const explicit =
    process.env.SHIELDCLIMB_CALLBACK_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim();

  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, '')}`;
  }

  if (
    ['localhost', '127.0.0.1'].includes(requestUrl.hostname) ||
    requestUrl.hostname.endsWith('.local')
  ) {
    return null;
  }

  return requestUrl.origin;
}

function mapShippingService(
  service: CheckoutRatedService,
  currencyCode: string,
): CheckoutShippingService {
  return {
    id: service.id,
    name: service.name,
    quoteCategory: service.quoteCategory,
    source: service.source,
    carrier: service.carrier,
    carrierCode: service.carrierCode?.trim() || undefined,
    serviceCode: service.serviceCode?.trim() || undefined,
    shipengineRateId: service.shipengineRateId?.trim() || undefined,
    shippoRateId: service.shippoRateId?.trim() || undefined,
    shippoShipmentId: service.shippoShipmentId?.trim() || undefined,
    shippoCarrierAccountId: service.shippoCarrierAccountId?.trim() || undefined,
    carrierPreferenceRank: service.carrierPreferenceRank,
    estimatedDays: service.estimatedDays,
    estimatedDeliveryDate: service.estimatedDeliveryDate,
    pickup: service.pickup,
    price: {
      amount: Number(service.price.amount || 0).toFixed(2),
      currencyCode,
    },
    originalPrice: service.originalPrice
      ? {
          amount: Number(service.originalPrice.amount || 0).toFixed(2),
          currencyCode: service.originalPrice.currencyCode || currencyCode,
        }
      : undefined,
    taxAmount: service.taxAmount
      ? {
          amount: Number(service.taxAmount.amount || 0).toFixed(2),
          currencyCode: service.taxAmount.currencyCode || currencyCode,
        }
      : undefined,
    landedCostAmount: service.landedCostAmount
      ? {
          amount: Number(service.landedCostAmount.amount || 0).toFixed(2),
          currencyCode: service.landedCostAmount.currencyCode || currencyCode,
        }
      : undefined,
    landedCost: service.landedCost,
    shippoIncludedInsurancePrice: service.shippoIncludedInsurancePrice
      ? {
          amount: Number(service.shippoIncludedInsurancePrice.amount || 0).toFixed(2),
          currencyCode: service.shippoIncludedInsurancePrice.currencyCode || currencyCode,
        }
      : undefined,
    availableShipmentProtection: service.availableShipmentProtection,
    shipmentProtection: service.shipmentProtection,
  };
}

function buildLandedCostTotalFields(args: {
  orderLandedCostTotal?: number;
  currencyCode: string;
  landedCost?: CheckoutLandedCost | null;
}) {
  const orderLandedCostTotal = Number(args.orderLandedCostTotal || 0);
  if (!Number.isFinite(orderLandedCostTotal) || orderLandedCostTotal <= 0.009) {
    return {};
  }

  return {
    landedCostAmount: {
      amount: orderLandedCostTotal.toFixed(2),
      currencyCode: args.currencyCode,
    },
    landedCost: args.landedCost || undefined,
  };
}

function buildShipmentProtectionTotalFields(shippingService: CheckoutShippingService) {
  const protection = shippingService.shipmentProtection;
  const protectionAmount = Number(protection?.totalAmount.amount || 0);

  if (!protection || !Number.isFinite(protectionAmount) || protectionAmount <= 0.009) {
    return {};
  }

  return {
    shipmentProtectionAmount: {
      amount: protectionAmount.toFixed(2),
      currencyCode:
        protection.totalAmount.currencyCode ||
        shippingService.price.currencyCode ||
        shippingService.shippoIncludedInsurancePrice?.currencyCode ||
        'USD',
    },
    shipmentProtection: protection,
  };
}

function applyAdminDisabledShippingToOrder(
  order: CheckoutOrderRecord,
): CheckoutOrderRecord {
  const {
    landedCost: _landedCost,
    landedCostAmount: _landedCostAmount,
    shipmentProtection: _shipmentProtection,
    shipmentProtectionAmount: _shipmentProtectionAmount,
    ...totals
  } = order.totals;

  return {
    ...order,
    shippingService: buildAdminDisabledCheckoutShippingService(order.currencyCode),
    totals: {
      ...totals,
      shippingAmount: {
        amount: '0.00',
        currencyCode: order.currencyCode,
      },
      shippingStatus: 'disabled',
    },
    fulfillmentStatus: 'not_required',
    fulfillment: {
      ...(order.fulfillment || {}),
      provider: 'manual',
      service: 'Shipping disabled',
      labelError: undefined,
    },
    shipengine: order.shipengine
      ? {
          ...order.shipengine,
          labelError: undefined,
        }
      : undefined,
  };
}

function maybeApplyAdminDisabledShipping(
  order: CheckoutOrderRecord,
  adminShippingDisabled?: boolean,
) {
  return adminShippingDisabled ? applyAdminDisabledShippingToOrder(order) : order;
}

function resolveOrderShipmentTotal(args: {
  selectedService: CheckoutRatedService;
  swellShipmentTotal?: unknown;
}) {
  const selectedShipmentTotal = Number(args.selectedService.price.amount || 0);
  if (Number.isFinite(selectedShipmentTotal) && selectedShipmentTotal <= 0.009) {
    return 0;
  }

  const swellShipmentTotal = Number(args.swellShipmentTotal);
  if (Number.isFinite(swellShipmentTotal) && swellShipmentTotal > 0.009) {
    return swellShipmentTotal;
  }

  return Number.isFinite(selectedShipmentTotal) ? selectedShipmentTotal : 0;
}

function toStorefrontCartSnapshot(
  cartSnapshot: FinalizeCheckoutInput['cartSnapshot'] | undefined,
) {
  if (!cartSnapshot) {
    return undefined;
  }

  return {
    currencyCode: cartSnapshot.currencyCode,
    lines: cartSnapshot.lines.map((line) => ({
      merchandiseId: line.merchandiseId,
      productHandle: line.productHandle,
      quantity: line.quantity,
    })),
  };
}

function buildAffiliateData(args: {
  resolvedAffiliate: Awaited<
    ReturnType<typeof getApprovedAffiliateByDiscountCode>
  >;
  affiliateSource: 'url' | 'discount_code' | null;
  commissionSnapshot: Awaited<
    ReturnType<typeof getAffiliateCommissionSnapshot>
  > | null;
  fallbackCommissionMonthKey: string;
}) {
  if (!args.resolvedAffiliate) {
    return null;
  }

  return {
    id: args.resolvedAffiliate.id,
    code: args.resolvedAffiliate.code,
    commissionRate:
      args.commissionSnapshot?.effectiveRate ||
      args.resolvedAffiliate.commissionRate,
    commissionRateAtPurchase:
      args.commissionSnapshot?.effectiveRate ||
      args.resolvedAffiliate.commissionRate,
    commissionTierAtPurchase: args.commissionSnapshot
      ? args.commissionSnapshot.hasOverride
        ? `${args.commissionSnapshot.tierLabel} override`
        : args.commissionSnapshot.tierLabel
      : null,
    commissionMonthKey:
      args.commissionSnapshot?.monthKey ?? args.fallbackCommissionMonthKey,
    discountCode: args.resolvedAffiliate.discountCode,
    discountPercentAtPurchase: args.resolvedAffiliate.discountPercent,
    source: args.affiliateSource,
  } satisfies CheckoutOrderAffiliate;
}

function buildPromoterData(args: {
  promoterAttribution: Awaited<
    ReturnType<typeof getSuccessfulPromoterForAffiliate>
  >;
  affiliateData: CheckoutOrderAffiliate | null;
}) {
  if (!args.promoterAttribution || !args.affiliateData) {
    return null;
  }

  return {
    id: args.promoterAttribution.id,
    inviteId: args.promoterAttribution.inviteId,
    affiliateId: args.promoterAttribution.affiliateId,
    affiliateCode: args.affiliateData.code,
    commissionRate: args.promoterAttribution.commissionRate,
    source: 'promoter_invite',
  } satisfies CheckoutOrderPromoter;
}

function splitCardholderName(cardholderName?: string | null) {
  const trimmed = cardholderName?.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { firstName: undefined, lastName: undefined };
  }

  const parts = trimmed.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: undefined };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function buildNowPaymentsOrderRecord(args: {
  orderId: string;
  accessKey: string;
  cartId: string;
  userId?: string | null;
  swellAccountId: string;
  swellCartId: string;
  swellOrderId: string;
  swellOrderNumber?: string;
  currencyCode: string;
  lines: CheckoutOrderLine[];
  shippingAddress: CheckoutShippingAddress;
  shippingService: CheckoutShippingService;
  orderSubtotal: number;
  orderDiscountTotal: number;
  discountCode?: string;
  discounts?: CheckoutOrderRecord['totals']['discounts'];
  orderTaxTotal: number;
  orderGrandTotal: number;
  orderShipmentTotal: number;
  orderLandedCostTotal?: number;
  landedCost?: CheckoutLandedCost | null;
  paymentCurrency: string;
  sourceWalletAddress?: string | null;
  payment: Awaited<ReturnType<typeof createNowPaymentsPayment>>;
  ipnCallbackEnabled: boolean;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: NowPaymentsPaymentData = {
    provider: 'nowpayments',
    paymentMethod: 'crypto',
    paymentId: String(args.payment.payment_id),
    purchaseId: args.payment.purchase_id,
    status: args.payment.payment_status,
    paymentCurrency: args.paymentCurrency,
    payAddress: args.payment.pay_address,
    sourceWalletAddress: args.sourceWalletAddress || null,
    payAmount: String(args.payment.pay_amount),
    amountReceived:
      args.payment.amount_received === undefined ||
      args.payment.amount_received === null
        ? null
        : String(args.payment.amount_received),
    payinExtraId: args.payment.payin_extra_id ?? null,
    network: args.payment.network ?? null,
    networkPrecision: args.payment.network_precision ?? null,
    timeLimit: args.payment.time_limit ?? null,
    expirationEstimateDate: args.payment.expiration_estimate_date ?? null,
    validUntil: args.payment.valid_until ?? null,
    createdAt: args.payment.created_at,
    updatedAt: args.payment.updated_at,
    ipnCallbackEnabled: args.ipnCallbackEnabled,
    amountPaidToDate: args.amountPaidToDate,
    attemptAmount: args.attemptAmount,
    carryoverRootOrderId: args.carryoverRootOrderId,
  };

  return {
    orderId: args.orderId,
    accessKey: args.accessKey,
    cartId: args.cartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: {
        amount: args.orderSubtotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountAmount: {
        amount: args.orderDiscountTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: {
        amount: args.orderTaxTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      ...buildLandedCostTotalFields({
        orderLandedCostTotal: args.orderLandedCostTotal,
        currencyCode: args.currencyCode,
        landedCost: args.landedCost,
      }),
      ...buildShipmentProtectionTotalFields(args.shippingService),
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: getFreeShippingThresholdForCurrency(args.currencyCode).toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingStatus,
    },
    payment: paymentData,
    swell: {
      accountId: args.swellAccountId,
      cartId: args.swellCartId,
      orderId: args.swellOrderId,
      orderNumber: args.swellOrderNumber,
    },
    processing: buildInitialCheckoutOrderProcessing(),
    latestError: null,
  };
}

function buildShieldClimbOrderRecord(args: {
  orderId: string;
  accessKey: string;
  cartId: string;
  userId?: string | null;
  swellAccountId: string;
  swellCartId: string;
  swellOrderId: string;
  swellOrderNumber?: string;
  currencyCode: string;
  lines: CheckoutOrderLine[];
  shippingAddress: CheckoutShippingAddress;
  shippingService: CheckoutShippingService;
  orderSubtotal: number;
  orderDiscountTotal: number;
  discountCode?: string;
  discounts?: CheckoutOrderRecord['totals']['discounts'];
  orderTaxTotal: number;
  orderGrandTotal: number;
  orderShipmentTotal: number;
  orderLandedCostTotal?: number;
  landedCost?: CheckoutLandedCost | null;
  walletId: string;
  addressIn: string;
  polygonAddressIn: string;
  ipnToken: string;
  callbackUrl?: string;
  callbackToken?: string;
  redirectUrl: string;
  expectedValueCoin?: string;
  paymentCurrency?: string;
  paymentStatus?: string;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: ShieldClimbPaymentData = {
    provider: 'shieldclimb',
    paymentMethod: 'card_debit',
    walletId: args.walletId,
    addressIn: args.addressIn,
    polygonAddressIn: args.polygonAddressIn,
    ipnToken: args.ipnToken,
    callbackUrl: args.callbackUrl,
    callbackToken: args.callbackToken,
    status: args.paymentStatus || 'unpaid',
    redirectUrl: args.redirectUrl,
    expectedValueCoin: args.expectedValueCoin,
    paymentCurrency: args.paymentCurrency,
    createdAt: now,
    updatedAt: now,
    amountPaidToDate: args.amountPaidToDate,
    attemptAmount: args.attemptAmount,
    carryoverRootOrderId: args.carryoverRootOrderId,
  };

  return {
    orderId: args.orderId,
    accessKey: args.accessKey,
    cartId: args.cartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: {
        amount: args.orderSubtotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountAmount: {
        amount: args.orderDiscountTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: {
        amount: args.orderTaxTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      ...buildLandedCostTotalFields({
        orderLandedCostTotal: args.orderLandedCostTotal,
        currencyCode: args.currencyCode,
        landedCost: args.landedCost,
      }),
      ...buildShipmentProtectionTotalFields(args.shippingService),
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: getFreeShippingThresholdForCurrency(args.currencyCode).toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingStatus,
    },
    payment: paymentData,
    swell: {
      accountId: args.swellAccountId,
      cartId: args.swellCartId,
      orderId: args.swellOrderId,
      orderNumber: args.swellOrderNumber,
    },
    processing: buildInitialCheckoutOrderProcessing(),
    latestError: null,
  };
}

function buildBankfulOrderRecord(args: {
  orderId: string;
  accessKey: string;
  cartId: string;
  userId?: string | null;
  swellAccountId: string;
  swellCartId: string;
  swellOrderId: string;
  swellOrderNumber?: string;
  currencyCode: string;
  lines: CheckoutOrderLine[];
  shippingAddress: CheckoutShippingAddress;
  shippingService: CheckoutShippingService;
  orderSubtotal: number;
  orderDiscountTotal: number;
  discountCode?: string;
  discounts?: CheckoutOrderRecord['totals']['discounts'];
  orderTaxTotal: number;
  orderGrandTotal: number;
  orderShipmentTotal: number;
  orderLandedCostTotal?: number;
  landedCost?: CheckoutLandedCost | null;
  attemptId: string;
  bankful: BankfulTransactionResponse;
  cardLast4?: string | null;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';
  const paymentData: BankfulPaymentData = {
    provider: 'bankful',
    paymentMethod: 'card_debit',
    attemptId: args.attemptId,
    status: mapBankfulStatus(args.bankful.statusName),
    bankfulStatus: args.bankful.statusName,
    requestAction: args.bankful.requestAction,
    transactionValue: args.bankful.value,
    transactionRequestId: args.bankful.requestId,
    transactionRecordId: args.bankful.recordId,
    transactionOrderId: args.bankful.orderId,
    xtlOrderId: args.bankful.xtlOrderId,
    transactionCurrency: args.bankful.currency,
    bankfulTimestamp: args.bankful.timestamp,
    apiAdvice: args.bankful.apiAdvice,
    serviceAdvice: args.bankful.serviceAdvice,
    processorAdvice: args.bankful.processorAdvice,
    errorMessage: args.bankful.errorMessage,
    cardLast4: args.cardLast4 ?? null,
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    amountPaidToDate: args.amountPaidToDate,
    attemptAmount: args.attemptAmount,
    carryoverRootOrderId: args.carryoverRootOrderId,
  };

  return {
    orderId: args.orderId,
    accessKey: args.accessKey,
    cartId: args.cartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: {
        amount: args.orderSubtotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountAmount: {
        amount: args.orderDiscountTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: {
        amount: args.orderTaxTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      ...buildLandedCostTotalFields({
        orderLandedCostTotal: args.orderLandedCostTotal,
        currencyCode: args.currencyCode,
        landedCost: args.landedCost,
      }),
      ...buildShipmentProtectionTotalFields(args.shippingService),
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: getFreeShippingThresholdForCurrency(args.currencyCode).toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingStatus,
    },
    payment: paymentData,
    swell: {
      accountId: args.swellAccountId,
      cartId: args.swellCartId,
      orderId: args.swellOrderId,
      orderNumber: args.swellOrderNumber,
    },
    processing: buildInitialCheckoutOrderProcessing(),
    latestError: null,
  };
}

function buildSquareOrderRecord(args: {
  orderId: string;
  accessKey: string;
  cartId: string;
  userId?: string | null;
  swellAccountId: string;
  swellCartId: string;
  swellOrderId: string;
  swellOrderNumber?: string;
  currencyCode: string;
  lines: CheckoutOrderLine[];
  shippingAddress: CheckoutShippingAddress;
  shippingService: CheckoutShippingService;
  orderSubtotal: number;
  orderDiscountTotal: number;
  discountCode?: string;
  discounts?: CheckoutOrderRecord['totals']['discounts'];
  orderTaxTotal: number;
  orderGrandTotal: number;
  orderShipmentTotal: number;
  orderLandedCostTotal?: number;
  landedCost?: CheckoutLandedCost | null;
  paymentLink: SquarePaymentLinkResponse;
  locationId?: string | null;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: SquarePaymentData = {
    provider: 'square',
    paymentMethod: 'card_debit',
    status: 'pending',
    paymentLinkId: args.paymentLink.id,
    squareOrderId: args.paymentLink.orderId,
    checkoutUrl: args.paymentLink.url,
    longUrl: args.paymentLink.longUrl ?? null,
    locationId: args.locationId ?? null,
    expectedAmount: args.attemptAmount || args.orderGrandTotal.toFixed(2),
    expectedCurrency: args.currencyCode,
    squareStatus: null,
    paymentId: null,
    receiptUrl: null,
    createdAt: args.paymentLink.createdAt || now,
    updatedAt: now,
    amountPaidToDate: args.amountPaidToDate,
    attemptAmount: args.attemptAmount,
    carryoverRootOrderId: args.carryoverRootOrderId,
  };

  return {
    orderId: args.orderId,
    accessKey: args.accessKey,
    cartId: args.cartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: {
        amount: args.orderSubtotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountAmount: {
        amount: args.orderDiscountTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: {
        amount: args.orderTaxTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      ...buildLandedCostTotalFields({
        orderLandedCostTotal: args.orderLandedCostTotal,
        currencyCode: args.currencyCode,
        landedCost: args.landedCost,
      }),
      ...buildShipmentProtectionTotalFields(args.shippingService),
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: getFreeShippingThresholdForCurrency(args.currencyCode).toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingStatus,
    },
    payment: paymentData,
    swell: {
      accountId: args.swellAccountId,
      cartId: args.swellCartId,
      orderId: args.swellOrderId,
      orderNumber: args.swellOrderNumber,
    },
    processing: buildInitialCheckoutOrderProcessing(),
    latestError: null,
  };
}

function buildInteracOrderRecord(args: {
  orderId: string;
  accessKey: string;
  cartId: string;
  userId?: string | null;
  swellAccountId: string;
  swellCartId: string;
  swellOrderId: string;
  swellOrderNumber?: string;
  currencyCode: string;
  lines: CheckoutOrderLine[];
  shippingAddress: CheckoutShippingAddress;
  shippingService: CheckoutShippingService;
  orderSubtotal: number;
  orderDiscountTotal: number;
  discountCode?: string;
  discounts?: CheckoutOrderRecord['totals']['discounts'];
  orderTaxTotal: number;
  orderGrandTotal: number;
  orderShipmentTotal: number;
  orderLandedCostTotal?: number;
  landedCost?: CheckoutLandedCost | null;
  recipientEmail: string;
  messageCode: string;
  cadAmount: string;
  expectedSenderEmail: string;
  expectedSenderName: string;
  securityQuestion?: string | null;
  securityAnswer?: string | null;
  expiresAt: string;
  amountPaidToDate?: string;
  attemptAmount?: string;
  carryoverRootOrderId?: string;
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: InteracPaymentData = {
    provider: 'interac',
    paymentMethod: 'interac',
    status: 'awaiting_transfer',
    recipientEmail: args.recipientEmail,
    messageCode: args.messageCode,
    cadAmount: args.cadAmount,
    expectedSenderEmail: args.expectedSenderEmail,
    expectedSenderName: args.expectedSenderName,
    securityQuestion: args.securityQuestion ?? null,
    securityAnswer: args.securityAnswer ?? null,
    expiresAt: args.expiresAt,
    screenshotUrls: [],
    createdAt: now,
    updatedAt: now,
    amountPaidToDate: args.amountPaidToDate,
    attemptAmount: args.attemptAmount,
    carryoverRootOrderId: args.carryoverRootOrderId,
  };

  return {
    orderId: args.orderId,
    accessKey: args.accessKey,
    cartId: args.cartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: {
        amount: args.orderSubtotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountAmount: {
        amount: args.orderDiscountTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: {
        amount: args.orderTaxTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      ...buildLandedCostTotalFields({
        orderLandedCostTotal: args.orderLandedCostTotal,
        currencyCode: args.currencyCode,
        landedCost: args.landedCost,
      }),
      ...buildShipmentProtectionTotalFields(args.shippingService),
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: getFreeShippingThresholdForCurrency(args.currencyCode).toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingStatus,
    },
    payment: paymentData,
    swell: {
      accountId: args.swellAccountId,
      cartId: args.swellCartId,
      orderId: args.swellOrderId,
      orderNumber: args.swellOrderNumber,
    },
    processing: buildInitialCheckoutOrderProcessing(),
    latestError: null,
  };
}

async function createUniqueInteracMessageCode(
  dependencies: Pick<
    FinalizeCheckoutDependencies,
    'createInteracMessageCode' | 'findInteracOrderByMessageCode'
  >,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const messageCode = dependencies.createInteracMessageCode();
    const existingOrder = await dependencies.findInteracOrderByMessageCode(messageCode);
    if (!existingOrder) {
      return messageCode;
    }
  }

  throw apiError.internal('Unable to generate a unique Interac message code.');
}

function normalizeFinalizeError(error: unknown) {
  if (
    error instanceof Error &&
    /coupon|discount|promotion/i.test(error.message)
  ) {
    return apiError.badRequest('That discount code is invalid or has expired.');
  }

  return error;
}

function isSquareFallbackEligible() {
  return isCardProcessingEnabled() && isCardSquareFallbackEnabled();
}

function buildSquareFallbackDetails(args: {
  code: string;
  reason: string;
  attemptId?: string;
  bankfulStatus?: string;
  originalError?: unknown;
  eligible?: boolean;
}) {
  return {
    code: args.code,
    provider: 'bankful',
    reason: args.reason,
    ...(args.attemptId ? { attemptId: args.attemptId } : {}),
    ...(args.bankfulStatus ? { bankfulStatus: args.bankfulStatus } : {}),
    squareFallbackEligible: args.eligible === false ? false : isSquareFallbackEligible(),
    fallbackPaymentMethod: 'square',
    ...(args.originalError ? { originalError: args.originalError } : {}),
  };
}

function getApiErrorDetails(error: unknown) {
  return error instanceof ApiError &&
    error.details &&
    typeof error.details === 'object'
    ? (error.details as Record<string, unknown>)
    : null;
}

function isSafeBankfulPreCaptureFailure(error: unknown) {
  if (!(error instanceof ApiError)) {
    return false;
  }

  const details = getApiErrorDetails(error);
  if (details?.provider !== 'bankful') {
    return false;
  }

  if (error.code !== 'provider_unavailable') {
    return false;
  }

  if (typeof details.missing === 'string') {
    return true;
  }

  return details.status === 401 || details.status === 403;
}

function createBankfulSafeFallbackError(args: {
  message: string;
  code: string;
  reason: string;
  attemptId: string;
  bankfulStatus?: string;
  originalError?: unknown;
}) {
  return apiError.providerUnavailable(
    args.message,
    buildSquareFallbackDetails({
      code: args.code,
      reason: args.reason,
      attemptId: args.attemptId,
      bankfulStatus: args.bankfulStatus,
      originalError: args.originalError,
    }),
    false,
  );
}

export function createFinalizeCheckoutSession(
  dependencies: FinalizeCheckoutDependencies,
) {
  return async function finalizeCheckoutSessionWithDependencies(
    args: FinalizeCheckoutInput,
  ): Promise<{
    accessKey: string;
    order: CheckoutOrderPublic;
    redirectUrl?: string | null;
  }> {
    const requestUrl = args.requestUrl;
    const fallbackCartId =
      args.cartId?.trim() || `checkout-session:${args.sessionId}`;
    let swellOrderId: string | undefined;
    let checkoutOrderId: string | undefined;
    let temporaryCartId: string | undefined;
    let squarePaymentLinkId: string | undefined;

    try {
      if (
        (args.paymentMethod === 'card' || args.paymentMethod === 'square') &&
        !isCardProcessingEnabled()
      ) {
        throw apiError.badRequest(getCardProcessingUnavailableMessage(), {
          code: 'card_processing_disabled',
          squareFallbackEligible: false,
        });
      }

      if (args.paymentMethod === 'square' && !isCardSquareFallbackEnabled()) {
        throw apiError.badRequest('Hosted card checkout is not available right now.', {
          code: 'square_fallback_disabled',
          squareFallbackEligible: false,
        });
      }

      const affiliateRefCode = args.affiliateCode?.trim() || null;

      async function resolveCheckoutAttribution(discountCode?: string | null) {
        let resolvedAffiliate: Awaited<
          ReturnType<typeof getApprovedAffiliateByDiscountCode>
        > = null;
        let affiliateSource: 'url' | 'discount_code' | null = null;

        const appliedDiscountCode = discountCode?.trim();
        if (appliedDiscountCode) {
          resolvedAffiliate =
            await dependencies.getApprovedAffiliateByDiscountCode(
              appliedDiscountCode,
            );
          if (resolvedAffiliate) {
            affiliateSource = affiliateRefCode ? 'url' : 'discount_code';
          }
        }
        if (!resolvedAffiliate && affiliateRefCode) {
          resolvedAffiliate =
            await dependencies.getApprovedAffiliateByCode(affiliateRefCode);
          if (resolvedAffiliate) {
            affiliateSource = 'url';
          }
        }

        const commissionSnapshot = resolvedAffiliate
          ? await dependencies
              .getAffiliateCommissionSnapshot({
                affiliateId: resolvedAffiliate.id,
              })
              .catch((commissionError) => {
                console.error(
                  'Unable to load affiliate commission snapshot during checkout finalize; falling back to affiliate base rate.',
                  {
                    affiliateId: resolvedAffiliate?.id,
                    error:
                      commissionError instanceof Error
                        ? commissionError.message
                        : commissionError,
                  },
                );
                return null;
              })
          : null;
        const affiliateData = buildAffiliateData({
          resolvedAffiliate,
          affiliateSource,
          commissionSnapshot,
          fallbackCommissionMonthKey: dependencies.getCommissionMonthKey(
            dependencies.nowDate(),
          ),
        });
        const promoterAttribution = affiliateData
          ? await dependencies.getSuccessfulPromoterForAffiliate(affiliateData.id)
          : null;
        const promoterData = buildPromoterData({
          promoterAttribution,
          affiliateData,
        });

        return {
          resolvedAffiliate,
          affiliateSource,
          commissionSnapshot,
          affiliateData,
          promoterData,
        };
      }

      let checkoutAttribution = await resolveCheckoutAttribution(args.discountCode);

      const cartOrders = await dependencies.findCheckoutOrdersByCartId(
        fallbackCartId,
      );
      const carryoverComparable = buildCarryoverComparableFromFinalizeInput({
        currencyCode: args.cartSnapshot.currencyCode,
        cartLines: args.cartSnapshot.lines.map((line) => ({
          merchandiseId: line.merchandiseId,
          quantity: line.quantity,
        })),
        shippingAddress: args.shippingAddress,
        shippingServiceId: args.selectedShippingServiceId,
        shipmentProtection: args.shipmentProtection === true,
        discountCode: args.discountCode,
      });
      const existingOrder = cartOrders.find((order) =>
        doesExistingOrderMatchCheckoutAttempt({
          existingOrder: order,
          input: args,
        }),
      );

      if (existingOrder) {
        return {
          accessKey: existingOrder.accessKey,
          order: toPublicCheckoutOrderWithCarryover(existingOrder, cartOrders),
          redirectUrl: getHostedPaymentRedirectUrl(existingOrder.payment),
        };
      }

      const lines = args.cartSnapshot.lines.map((line) => ({
        ...line,
        skuNumber: line.skuNumber || undefined,
      })) satisfies CheckoutOrderLine[];
      const currencyCode = args.cartSnapshot.currencyCode;
      const checkoutCurrencyCode =
        args.paymentMethod === 'interac' || args.paymentMethod === 'square'
          ? 'CAD'
          : currencyCode;
      const subtotalAmount = getCartSnapshotSubtotal(args.cartSnapshot);
      const itemCount = getCartSnapshotItemCount(args.cartSnapshot);
      const paymentCurrency = (args.paymentCurrency || '').toLowerCase();
      const ipnCallbackEnabled = shouldEnableIpnCallback(requestUrl);
      const manualMethod = dependencies.getSwellManualPaymentMethod(
        args.paymentMethod,
      );
      const swellShipping = toSwellAddress({
        ...args.shippingAddress,
        email: args.shippingAddress.email,
        phone: args.shippingAddress.phone,
      });
      const swellBilling = {
        ...swellShipping,
        method: manualMethod,
      };

      const account = await dependencies.upsertSwellGuestAccount({
        email: args.shippingAddress.email,
        firstName: args.shippingAddress.firstName,
        lastName: args.shippingAddress.lastName,
        phone: args.shippingAddress.phone,
        shipping: swellShipping,
        billing: swellBilling,
      });

      const swellCart = await dependencies.createSwellCheckoutCart({
        accountId: account.id,
        storefrontCartId: args.cartId ?? undefined,
        storefrontCartSnapshot: toStorefrontCartSnapshot(args.cartSnapshot),
        currencyCode: checkoutCurrencyCode,
        shipping: swellShipping,
        billing: swellBilling,
        comments: args.shippingAddress.notes,
        couponCode: args.discountCode ?? undefined,
      });
      temporaryCartId = swellCart.id;
      const checkoutSubtotalAmount = Number.isFinite(Number(swellCart.sub_total))
        ? Number(swellCart.sub_total)
        : subtotalAmount;

      let availableServices: CheckoutRatedService[] = [];
      let liveShippingErrorMessage: string | null = null;

      if (args.adminShippingDisabled) {
        availableServices = [
          buildAdminDisabledRatedService(checkoutCurrencyCode),
        ];
      } else {
        try {
          availableServices = await dependencies.getShipEngineCheckoutServices({
            shippingAddress: args.shippingAddress,
            currencyCode: checkoutCurrencyCode,
            subtotalAmount: checkoutSubtotalAmount,
            itemCount,
            shipmentProtection: args.shipmentProtection,
          });
        } catch (liveShippingError) {
          liveShippingErrorMessage =
            liveShippingError instanceof Error
              ? liveShippingError.message
              : 'Unable to validate the shipping address.';
          console.error(
            'Unable to fetch live shipping rates for payment creation, falling back to Swell:',
            liveShippingError,
          );
        }
      }

      if (availableServices.length === 0 && !isShippoConfigured()) {
        availableServices = applyShipmentProtectionToServices({
          services: mapSwellRatedServices(
            swellCart.shipment_rating?.services || [],
            swellCart.currency || checkoutCurrencyCode,
          ),
          shipmentProtection: args.shipmentProtection,
          subtotalAmount: checkoutSubtotalAmount,
          currencyCode: swellCart.currency || checkoutCurrencyCode,
        });
      }

      if (availableServices.length === 0 && liveShippingErrorMessage) {
        throw apiError.badRequest(liveShippingErrorMessage, {
          code: 'address_validation_failed',
        });
      }

      if (!args.adminShippingDisabled) {
        availableServices = applyFreeShipping(
          applyCustomerShippingMarkup(availableServices),
          checkoutSubtotalAmount,
          checkoutCurrencyCode,
        );
        availableServices = toCustomerFacingCheckoutServices(
          availableServices,
        );
      }

      const selectedService = findCheckoutShippingService(
        availableServices,
        args.selectedShippingServiceId,
      );

      if (!selectedService) {
        throw apiError.badRequest(
          'No valid shipping service was selected. Refresh shipping options and retry.',
          {
            code: 'invalid_shipping_service',
            availableServiceIds: availableServices.map((service) => service.id),
          },
        );
      }

      const ratedCart = await dependencies.updateSwellCheckoutCart(
        swellCart.id,
        {
          shipping: {
            ...swellShipping,
            service:
              selectedService.source === 'swell'
                ? selectedService.id
                : undefined,
            service_name: selectedService.name,
            price: Number(selectedService.price.amount || 0),
          },
          billing: {
            ...swellBilling,
            method: manualMethod,
          },
          coupon_code: args.discountCode ?? undefined,
        },
      );

      if (args.paymentMethod === 'card') {
        if (!args.card) {
          throw apiError.badRequest('Enter your card details before placing the order.');
        }

        const couponDiscountTotal = Number(
          ratedCart.discount_total ?? ratedCart.item_discount ?? 0,
        );
        if (args.discountCode && couponDiscountTotal <= 0) {
          throw apiError.badRequest(
            'That discount code is invalid or has expired.',
          );
        }

        const orderTaxTotal = Number(ratedCart.tax_total || 0);
        const orderShipmentTotal = args.adminShippingDisabled
          ? 0
          : resolveOrderShipmentTotal({
              selectedService,
              swellShipmentTotal: ratedCart.shipment_total,
            });
        const orderCurrencyCode = ratedCart.currency || currencyCode;
        const landedCost = args.adminShippingDisabled
          ? null
          : await quoteZonosLandedCost({
              shippingAddress: args.shippingAddress,
              cartSnapshot: args.cartSnapshot,
              service: {
                ...selectedService,
                price: {
                  amount: orderShipmentTotal.toFixed(2),
                  currencyCode: orderCurrencyCode,
                },
              },
              currencyCode: orderCurrencyCode,
            });
        const orderLandedCostTotal = Number(landedCost?.amount.amount || 0);
        const selectedServiceForOrder = landedCost
          ? {
              ...selectedService,
              landedCostAmount: landedCost.amount,
              landedCost,
            }
          : selectedService;
        const orderSubtotalAmount = Number.isFinite(Number(ratedCart.sub_total))
          ? Number(ratedCart.sub_total)
          : subtotalAmount;
        const appliedDiscountCode = args.discountCode || ratedCart.coupon_code;
        checkoutAttribution = await resolveCheckoutAttribution(appliedDiscountCode);
        const couponDiscountRate = await getSwellCouponDiscountRate(appliedDiscountCode);
        const pricing = calculateCheckoutPricing({
          currencyCode: orderCurrencyCode,
          subtotalAmount: orderSubtotalAmount,
          couponDiscountAmount: couponDiscountTotal,
          couponDiscountRate,
          couponCode: appliedDiscountCode,
          shippingAmount: orderShipmentTotal,
          shipmentProtectionAmount: selectedServiceForOrder.shipmentProtection?.totalAmount.amount,
          taxAmount: orderTaxTotal,
          landedCostAmount: orderLandedCostTotal,
          paymentMethod: args.paymentMethod,
        });
        const orderDiscountTotal = pricing.discountTotalValue;
        const orderTotal = pricing.totalValue;

        if (!orderTotal || orderTotal <= 0 || !Number.isFinite(orderTotal)) {
          throw apiError.badRequest('Order total must be greater than zero.', {
            code: 'invalid_order_total',
          });
        }

        const carryoverContext = buildCarryoverContext({
          orders: cartOrders,
          comparable: carryoverComparable,
          orderTotal,
        });

        if (
          carryoverContext.latestSuccessfulOrder &&
          carryoverContext.creditedAmount + 0.01 >= orderTotal
        ) {
          await dependencies
            .deleteSwellCheckoutCart(ratedCart.id)
            .catch((error) => {
              console.error('Unable to delete duplicate Swell cart after carryover reconciliation:', error);
            });
          temporaryCartId = undefined;

          return {
            accessKey: carryoverContext.latestSuccessfulOrder.accessKey,
            order: toPublicCheckoutOrderWithCarryover(
              carryoverContext.latestSuccessfulOrder,
              cartOrders,
            ),
            redirectUrl: getHostedPaymentRedirectUrl(
              carryoverContext.latestSuccessfulOrder.payment,
            ),
          };
        }

        const amountAlreadyPaid = carryoverContext.creditedAmount;
        const remainderPaymentAmount = amountAlreadyPaid > 0
          ? Math.max(orderTotal - amountAlreadyPaid, 0.01)
          : orderTotal;
        const amountPaidToDate = amountAlreadyPaid > 0
          ? amountAlreadyPaid.toFixed(2)
          : undefined;
        const attemptId = createBankfulAttemptId(args.sessionId, args.sessionVersion);
        const orderId = dependencies.createOrderId();
        const accessKey = dependencies.createAccessKey();
        const carryoverRootOrderId =
          carryoverContext.carryoverRootOrderId || orderId;
        const session = await dependencies.optionalSession();
        const userId = session?.user?.id ?? null;
        const nowIso = dependencies.nowIso();
        const shippingService = mapShippingService(
          selectedServiceForOrder,
          orderCurrencyCode,
        );
        const totals: CheckoutOrderRecord['totals'] = {
          subtotalAmount: {
            amount: orderSubtotalAmount.toFixed(2),
            currencyCode: orderCurrencyCode,
          },
          discountAmount: {
            amount: orderDiscountTotal.toFixed(2),
            currencyCode: orderCurrencyCode,
          },
          discountCode: appliedDiscountCode,
          discounts: pricing.discounts?.length ? pricing.discounts : undefined,
          taxAmount: {
            amount: orderTaxTotal.toFixed(2),
            currencyCode: orderCurrencyCode,
          },
          ...buildLandedCostTotalFields({
            orderLandedCostTotal,
            currencyCode: orderCurrencyCode,
            landedCost,
          }),
          ...buildShipmentProtectionTotalFields(shippingService),
          totalAmount: {
            amount: orderTotal.toFixed(2),
            currencyCode: orderCurrencyCode,
          },
          shippingAmount: {
            amount: orderShipmentTotal.toFixed(2),
            currencyCode: orderCurrencyCode,
          },
          shippingThresholdAmount: {
            amount: getFreeShippingThresholdForCurrency(orderCurrencyCode).toFixed(2),
            currencyCode: orderCurrencyCode,
          },
          shippingStatus: orderShipmentTotal <= 0.009 ? 'free' : 'quoted',
        };

        const previousSafeFailure =
          await dependencies.findRecentSafeBankfulFallbackAttempt({
            email: args.shippingAddress.email,
            amount: remainderPaymentAmount.toFixed(2),
            currencyCode: orderCurrencyCode,
            shippingAddress: args.shippingAddress,
            shippingService,
            lines,
            totals,
            newerThan: new Date(Date.now() - BANKFUL_SAFE_FAILURE_DEDUPE_MS),
          });

        if (previousSafeFailure && isSquareFallbackEligible()) {
          throw createBankfulSafeFallbackError({
            message: 'Bankful already failed for this checkout. Continue with secure hosted card checkout.',
            code: 'bankful_previous_safe_failure',
            reason: 'bankful_previous_safe_failure',
            attemptId: previousSafeFailure.attemptId,
            bankfulStatus: previousSafeFailure.bankful?.statusName ?? previousSafeFailure.status,
            originalError: {
              message: previousSafeFailure.latestError || 'Previous Bankful attempt failed safely before fulfillment.',
              status: previousSafeFailure.status,
            },
          });
        }

        await dependencies.createBankfulPaymentAttempt({
          attemptId,
          checkoutSessionId: args.sessionId,
          checkoutSessionVersion: args.sessionVersion,
          cartId: fallbackCartId,
          email: args.shippingAddress.email,
          amount: remainderPaymentAmount.toFixed(2),
          currencyCode: orderCurrencyCode,
          customer: {
            firstName: args.shippingAddress.firstName,
            lastName: args.shippingAddress.lastName,
            email: args.shippingAddress.email,
            phone: args.shippingAddress.phone,
          },
          shippingAddress: args.shippingAddress,
          shippingService,
          lines,
          totals,
          swell: {
            accountId: account.id,
            cartId: ratedCart.id,
          },
        });

        const claimedAttempt =
          await dependencies.claimBankfulPaymentAttemptCapture(attemptId);
        if (!claimedAttempt) {
          throw apiError.conflict(
            'This card payment is already being processed. Refresh the checkout before trying again.',
            {
              code: 'bankful_attempt_in_progress',
              attemptId,
              squareFallbackEligible: false,
            },
          );
        }

        let bankful: BankfulTransactionResponse;
        try {
          const cardholderName = splitCardholderName(args.card?.cardholderName);
          const bankfulBillingAddress = args.card?.billingAddress ?? args.shippingAddress;
          bankful = await dependencies.createBankfulSale({
            amount: remainderPaymentAmount.toFixed(2),
            currency: orderCurrencyCode,
            xtlOrderId: attemptId,
            card: args.card,
            customer: {
              firstName: cardholderName.firstName,
              lastName: cardholderName.lastName,
              email: args.shippingAddress.email,
              phone: args.shippingAddress.phone,
            },
            billingAddress: {
              address1: bankfulBillingAddress.address1,
              address2: bankfulBillingAddress.address2,
              city: bankfulBillingAddress.city,
              province: bankfulBillingAddress.province,
              postalCode: bankfulBillingAddress.postalCode,
              country: bankfulBillingAddress.country,
            },
          });
        } catch (captureError) {
          if (isSafeBankfulPreCaptureFailure(captureError)) {
            const originalDetails = getApiErrorDetails(captureError);
            const message =
              captureError instanceof Error
                ? captureError.message
                : 'Bankful card processing is unavailable.';

            await dependencies.updateBankfulPaymentAttempt(attemptId, {
              status: 'failed',
              latestError: message,
            });

            throw createBankfulSafeFallbackError({
              message: 'Bankful card processing is unavailable. You can continue with secure hosted card checkout.',
              code: 'bankful_provider_unavailable',
              reason: typeof originalDetails?.missing === 'string'
                ? 'bankful_config_unavailable'
                : 'bankful_authorization_failed',
              attemptId,
              originalError: originalDetails
                ? {
                    code: captureError instanceof ApiError ? captureError.code : undefined,
                    message,
                    details: originalDetails,
                  }
                : undefined,
            });
          }

          await dependencies.updateBankfulPaymentAttempt(attemptId, {
            status: 'capture_unknown',
            latestError:
              captureError instanceof Error
                ? captureError.message
                : 'Bankful capture failed before a trusted response was received.',
          });
          throw captureError;
        }
        const bankfulSnapshot = bankfulResponseSnapshot(bankful);
        const bankfulStatus = mapBankfulStatus(bankful.statusName);

        if (bankfulStatus !== 'paid') {
          await dependencies.updateBankfulPaymentAttempt(attemptId, {
            status:
              bankfulStatus === 'pending'
                ? 'pending'
                : bankfulStatus === 'declined'
                  ? 'declined'
                  : 'failed',
            bankful: bankfulSnapshot,
            latestError:
              bankful.errorMessage ||
              bankful.processorAdvice ||
              bankful.serviceAdvice ||
              bankful.apiAdvice ||
              'Bankful did not approve the card transaction.',
          });

          throw apiError.badRequest(
            bankfulStatus === 'pending'
              ? 'Your card payment is pending review. Contact support with your checkout email if it does not update.'
              : bankful.errorMessage || 'Your card was declined. Use a different card or payment method.',
            buildSquareFallbackDetails({
              code: `bankful_${bankfulStatus}`,
              reason:
                bankfulStatus === 'declined'
                  ? 'bankful_declined'
                  : bankfulStatus === 'failed'
                    ? 'bankful_failed'
                    : 'bankful_pending',
              attemptId,
              bankfulStatus,
              eligible: bankfulStatus === 'declined' || bankfulStatus === 'failed',
            }),
          );
        }

        await dependencies.updateBankfulPaymentAttempt(attemptId, {
          status: 'paid',
          bankful: bankfulSnapshot,
          latestError: null,
        });

        let swellOrder: Awaited<ReturnType<typeof dependencies.convertSwellCartToOrder>> | null = null;
        try {
          swellOrder = await dependencies.convertSwellCartToOrder(ratedCart.id);
          swellOrderId = swellOrder.id;
          temporaryCartId = undefined;

          const cardDigits = args.card.number.replace(/\D/g, '');
          const bankfulOrderRecord = maybeApplyAdminDisabledShipping(
            buildBankfulOrderRecord({
              orderId,
              accessKey,
              cartId: fallbackCartId,
              userId,
              swellAccountId: account.id,
              swellCartId: ratedCart.id,
              swellOrderId: swellOrder.id,
              swellOrderNumber: swellOrder.number,
              currencyCode: orderCurrencyCode,
              lines,
              shippingAddress: args.shippingAddress,
              shippingService,
              orderSubtotal: orderSubtotalAmount,
              orderDiscountTotal,
              discountCode: appliedDiscountCode,
              discounts: pricing.discounts,
              orderTaxTotal,
              orderGrandTotal: orderTotal,
              orderShipmentTotal,
              orderLandedCostTotal,
              landedCost,
              attemptId,
              bankful,
              cardLast4: cardDigits.slice(-4) || null,
              amountPaidToDate,
              attemptAmount: remainderPaymentAmount.toFixed(2),
              carryoverRootOrderId,
              nowIso,
            }),
            args.adminShippingDisabled,
          );

          const checkoutOrder = await dependencies.saveCheckoutOrder({
            ...bankfulOrderRecord,
            affiliate: checkoutAttribution.affiliateData,
            promoter: checkoutAttribution.promoterData,
          });
          checkoutOrderId = checkoutOrder.orderId;
          swellOrderId = undefined;

          await dependencies.updateBankfulPaymentAttempt(attemptId, {
            status: 'order_created',
            orderId: checkoutOrder.orderId,
            swell: {
              accountId: account.id,
              cartId: ratedCart.id,
              orderId: swellOrder.id,
              orderNumber: swellOrder.number,
            },
            latestError: null,
          }).catch((attemptUpdateError) => {
            console.error('Unable to link Bankful attempt to checkout order:', attemptUpdateError);
          });

          await supersedeCarryoverChainOrders({
            checkoutOrder,
            chainOrders: carryoverContext.chainOrders,
            dependencies,
          }).catch((supersedeError) => {
            console.error('Unable to supersede Bankful carryover chain orders:', supersedeError);
          });

          await replaceSupersededOpenOrders({
            checkoutOrder,
            customerEmail: args.shippingAddress.email,
            excludedOrderIds: new Set(
              carryoverContext.chainOrders.map((order) => order.orderId),
            ),
            dependencies,
          }).catch((replaceError) => {
            console.error('Unable to replace open Bankful checkout orders:', replaceError);
          });

          const processedOrder =
            (await dependencies
              .runSuccessfulOrderProcessing(checkoutOrder.orderId)
              .catch((processingError) => {
                console.error('Unable to run Bankful successful order processing:', processingError);
                return null;
              })) ||
            checkoutOrder;

          const publicRelatedOrders =
            await dependencies
              .findCheckoutOrdersByCartId(fallbackCartId)
              .catch((relatedOrdersError) => {
                console.error('Unable to load related Bankful checkout orders:', relatedOrdersError);
                return [processedOrder];
              });

          const initiationTelemetry = {
            orderId,
            userId,
            currencyCode,
            orderTotal: orderTotal.toFixed(2),
            itemCount,
            paymentProvider: 'bankful' as const,
            paymentMethod: 'card' as const,
            affiliateCode: checkoutAttribution.resolvedAffiliate?.code ?? null,
            affiliateSource: checkoutAttribution.affiliateSource,
          };

          dependencies
            .sendCheckoutPaymentInitiatedEvent({
              ...initiationTelemetry,
              customerEmail: args.shippingAddress.email,
            })
            .catch(() => {});
          dependencies
            .trackCheckoutPaymentInitiated(initiationTelemetry)
            .catch(() => {});

          return {
            accessKey,
            order: toPublicCheckoutOrderWithCarryover(
              processedOrder,
              publicRelatedOrders,
            ) satisfies CheckoutOrderPublic,
          };
        } catch (orderCreationError) {
          const message =
            orderCreationError instanceof Error
              ? orderCreationError.message
              : 'Unable to create order after approved Bankful payment.';
          if (!checkoutOrderId) {
            await dependencies.updateBankfulPaymentAttempt(attemptId, {
              status: 'paid_order_creation_failed',
              bankful: bankfulSnapshot,
              swell: swellOrder
                ? {
                    accountId: account.id,
                    cartId: ratedCart.id,
                    orderId: swellOrder.id,
                    orderNumber: swellOrder.number,
                  }
                : undefined,
              latestError: message,
            });
          }
          throw orderCreationError;
        }
      }

      if (args.paymentMethod === 'square') {
        const swellOrder = await dependencies.convertSwellCartToOrder(ratedCart.id);
        swellOrderId = swellOrder.id;
        temporaryCartId = undefined;

        const couponDiscountTotal = Number(
          swellOrder.discount_total ?? swellOrder.item_discount ?? 0,
        );
        if (args.discountCode && couponDiscountTotal <= 0) {
          throw apiError.badRequest(
            'That discount code is invalid or has expired.',
          );
        }
        const orderTaxTotal = Number(swellOrder.tax_total || 0);
        const orderShipmentTotal = args.adminShippingDisabled
          ? 0
          : resolveOrderShipmentTotal({
              selectedService,
              swellShipmentTotal: swellOrder.shipment_total,
            });
        const orderCurrencyCode = swellOrder.currency || checkoutCurrencyCode;
        const landedCost = args.adminShippingDisabled
          ? null
          : await quoteZonosLandedCost({
              shippingAddress: args.shippingAddress,
              cartSnapshot: args.cartSnapshot,
              service: {
                ...selectedService,
                price: {
                  amount: orderShipmentTotal.toFixed(2),
                  currencyCode: orderCurrencyCode,
                },
              },
              currencyCode: orderCurrencyCode,
            });
        const orderLandedCostTotal = Number(landedCost?.amount.amount || 0);
        const selectedServiceForOrder = landedCost
          ? {
              ...selectedService,
              landedCostAmount: landedCost.amount,
              landedCost,
            }
          : selectedService;
        const orderSubtotalAmount = Number.isFinite(Number(swellOrder.sub_total))
          ? Number(swellOrder.sub_total)
          : subtotalAmount;
        const appliedDiscountCode = args.discountCode || swellOrder.coupon_code;
        checkoutAttribution = await resolveCheckoutAttribution(appliedDiscountCode);
        const couponDiscountRate = await getSwellCouponDiscountRate(appliedDiscountCode);
        const pricing = calculateCheckoutPricing({
          currencyCode: orderCurrencyCode,
          subtotalAmount: orderSubtotalAmount,
          couponDiscountAmount: couponDiscountTotal,
          couponDiscountRate,
          couponCode: appliedDiscountCode,
          shippingAmount: orderShipmentTotal,
          shipmentProtectionAmount: selectedServiceForOrder.shipmentProtection?.totalAmount.amount,
          taxAmount: orderTaxTotal,
          landedCostAmount: orderLandedCostTotal,
          paymentMethod: args.paymentMethod,
        });
        const orderDiscountTotal = pricing.discountTotalValue;
        const orderTotal = pricing.totalValue;
        const pricingMetadata = buildCheckoutPricingMetadata({
          currencyCode: orderCurrencyCode,
          subtotalAmount: orderSubtotalAmount,
          shippingAmount: orderShipmentTotal,
          shipmentProtectionAmount: selectedServiceForOrder.shipmentProtection?.totalAmount.amount,
          taxAmount: orderTaxTotal,
          landedCostAmount: orderLandedCostTotal,
          totalAmount: orderTotal,
          discounts: pricing.discounts,
          discountAmount: orderDiscountTotal,
          discountCode: appliedDiscountCode,
          paymentMethod: args.paymentMethod,
        });

        if (!orderTotal || orderTotal <= 0 || !Number.isFinite(orderTotal)) {
          throw apiError.badRequest('Order total must be greater than zero.', {
            code: 'invalid_order_total',
          });
        }

        const carryoverContext = buildCarryoverContext({
          orders: cartOrders,
          comparable: carryoverComparable,
          orderTotal,
        });

        if (
          carryoverContext.latestSuccessfulOrder &&
          carryoverContext.creditedAmount + 0.01 >= orderTotal
        ) {
          await dependencies
            .cancelSwellOrder(
              swellOrder.id,
              `Checkout already satisfied by existing order ${carryoverContext.latestSuccessfulOrder.orderId}.`,
            )
            .catch((error) => {
              console.error('Unable to cancel duplicate Swell order after carryover reconciliation:', error);
            });

          return {
            accessKey: carryoverContext.latestSuccessfulOrder.accessKey,
            order: toPublicCheckoutOrderWithCarryover(
              carryoverContext.latestSuccessfulOrder,
              cartOrders,
            ),
            redirectUrl: getHostedPaymentRedirectUrl(
              carryoverContext.latestSuccessfulOrder.payment,
            ),
          };
        }

        const amountAlreadyPaid = carryoverContext.creditedAmount;
        const remainderPaymentAmount = amountAlreadyPaid > 0
          ? Math.max(orderTotal - amountAlreadyPaid, 0.01)
          : orderTotal;
        const amountPaidToDate = amountAlreadyPaid > 0
          ? amountAlreadyPaid.toFixed(2)
          : undefined;
        const orderId = dependencies.createOrderId();
        const accessKey = dependencies.createAccessKey();
        const carryoverRootOrderId =
          carryoverContext.carryoverRootOrderId || orderId;
        const session = await dependencies.optionalSession();
        const userId = session?.user?.id ?? null;
        const cadCurrency = (orderCurrencyCode || checkoutCurrencyCode).trim().toUpperCase();
        if (cadCurrency !== 'CAD') {
          throw apiError.providerUnavailable(
            'Swell did not return a CAD Square checkout amount.',
            {
              provider: 'swell',
              expectedCurrency: 'CAD',
              receivedCurrency: cadCurrency,
            },
            false,
          );
        }

        const squareRedirectUrl = new URL('/checkout', requestUrl.origin);
        squareRedirectUrl.searchParams.set('order', orderId);
        squareRedirectUrl.searchParams.set('key', accessKey);

        const paymentLink = await dependencies.createSquarePaymentLink({
          idempotencyKey: `square:${orderId}`,
          amount: remainderPaymentAmount.toFixed(2),
          currencyCode: cadCurrency,
          orderReference: orderId,
          customerEmail: args.shippingAddress.email,
          redirectUrl: squareRedirectUrl.toString(),
        });
        squarePaymentLinkId = paymentLink.id;

        await dependencies.updateSwellOrder(swellOrder.id, {
          billing: {
            ...(swellOrder.billing || {}),
            method: manualMethod,
            intent: {
              provider: 'square',
              payment_link_id: paymentLink.id,
              square_order_id: paymentLink.orderId,
              status: 'pending',
            },
          },
          metadata: {
            ...(swellOrder.metadata || {}),
            checkout_reference: orderId,
            coupon_code: appliedDiscountCode || null,
            pricing: pricingMetadata,
            landed_cost: landedCost ?? null,
            ...(args.adminShippingDisabled ? { admin_shipping_disabled: true } : {}),
            square: {
              payment_link_id: paymentLink.id,
              square_order_id: paymentLink.orderId,
              checkout_url: paymentLink.url,
              expected_amount: remainderPaymentAmount.toFixed(2),
              expected_currency: cadCurrency,
              status: 'pending',
            },
            affiliate: checkoutAttribution.resolvedAffiliate &&
              checkoutAttribution.affiliateData
              ? {
                  ...checkoutAttribution.affiliateData,
                  commissionOwed: (
                    orderTotal *
                    Number(
                      checkoutAttribution.commissionSnapshot?.effectiveRate ||
                        checkoutAttribution.resolvedAffiliate.commissionRate,
                    )
                  ).toFixed(2),
                  currencyCode: cadCurrency,
                  paymentProvider: 'square',
                  status: 'pending',
                }
              : null,
            promoter: checkoutAttribution.promoterData
              ? {
                  ...checkoutAttribution.promoterData,
                  commissionOwed: (
                    orderTotal * Number(checkoutAttribution.promoterData.commissionRate)
                  ).toFixed(2),
                  currencyCode: cadCurrency,
                  paymentProvider: 'square',
                  status: 'pending',
                }
              : null,
          },
        });

        const squareOrderRecord = maybeApplyAdminDisabledShipping(
          buildSquareOrderRecord({
            orderId,
            accessKey,
            cartId: fallbackCartId,
            userId,
            swellAccountId: account.id,
            swellCartId: ratedCart.id,
            swellOrderId: swellOrder.id,
            swellOrderNumber: swellOrder.number,
            currencyCode: orderCurrencyCode,
            lines,
            shippingAddress: args.shippingAddress,
            shippingService: mapShippingService(
              selectedServiceForOrder,
              orderCurrencyCode,
            ),
            orderSubtotal: orderSubtotalAmount,
            orderDiscountTotal,
            discountCode: appliedDiscountCode,
            discounts: pricing.discounts,
            orderTaxTotal,
            orderGrandTotal: orderTotal,
            orderShipmentTotal,
            orderLandedCostTotal,
            landedCost,
            paymentLink,
            locationId: null,
            amountPaidToDate,
            attemptAmount: remainderPaymentAmount.toFixed(2),
            carryoverRootOrderId,
            nowIso: dependencies.nowIso(),
          }),
          args.adminShippingDisabled,
        );

        const checkoutOrder = await dependencies.saveCheckoutOrder({
          ...squareOrderRecord,
          affiliate: checkoutAttribution.affiliateData,
          promoter: checkoutAttribution.promoterData,
        });
        checkoutOrderId = checkoutOrder.orderId;
        squarePaymentLinkId = undefined;
        swellOrderId = undefined;

        await supersedeCarryoverChainOrders({
          checkoutOrder,
          chainOrders: carryoverContext.chainOrders,
          dependencies,
        }).catch((supersedeError) => {
          console.error('Unable to supersede Square carryover chain orders:', supersedeError);
        });

        await replaceSupersededOpenOrders({
          checkoutOrder,
          customerEmail: args.shippingAddress.email,
          excludedOrderIds: new Set(
            carryoverContext.chainOrders.map((order) => order.orderId),
          ),
          dependencies,
        }).catch((replaceError) => {
          console.error('Unable to replace open Square checkout orders:', replaceError);
        });

        const publicRelatedOrders =
          await dependencies
            .findCheckoutOrdersByCartId(fallbackCartId)
            .catch((relatedOrdersError) => {
              console.error('Unable to load related Square checkout orders:', relatedOrdersError);
              return [checkoutOrder];
            });

        const initiationTelemetry = {
          orderId,
          userId,
          currencyCode: cadCurrency,
          orderTotal: orderTotal.toFixed(2),
          itemCount,
          paymentProvider: 'square' as const,
          paymentMethod: 'card' as const,
          affiliateCode: checkoutAttribution.resolvedAffiliate?.code ?? null,
          affiliateSource: checkoutAttribution.affiliateSource,
        };

        dependencies
          .sendCheckoutPaymentInitiatedEvent({
            ...initiationTelemetry,
            customerEmail: args.shippingAddress.email,
          })
          .catch(() => {});
        dependencies
          .trackCheckoutPaymentInitiated(initiationTelemetry)
          .catch(() => {});

        return {
          accessKey,
          order: toPublicCheckoutOrderWithCarryover(
            checkoutOrder,
            publicRelatedOrders,
          ) satisfies CheckoutOrderPublic,
          redirectUrl: paymentLink.url,
        };
      }

      const swellOrder = await dependencies.convertSwellCartToOrder(
        ratedCart.id,
      );
      swellOrderId = swellOrder.id;
      temporaryCartId = undefined;

      const couponDiscountTotal = Number(
        swellOrder.discount_total ?? swellOrder.item_discount ?? 0,
      );
      if (args.discountCode && couponDiscountTotal <= 0) {
        throw apiError.badRequest(
          'That discount code is invalid or has expired.',
        );
      }
      const orderTaxTotal = Number(swellOrder.tax_total || 0);
      const orderShipmentTotal = args.adminShippingDisabled
        ? 0
        : resolveOrderShipmentTotal({
            selectedService,
            swellShipmentTotal: swellOrder.shipment_total,
          });
      const orderCurrencyCode = swellOrder.currency || currencyCode;
      const landedCost = args.adminShippingDisabled
        ? null
        : await quoteZonosLandedCost({
            shippingAddress: args.shippingAddress,
            cartSnapshot: args.cartSnapshot,
            service: {
              ...selectedService,
              price: {
                amount: orderShipmentTotal.toFixed(2),
                currencyCode: orderCurrencyCode,
              },
            },
            currencyCode: orderCurrencyCode,
          });
      const orderLandedCostTotal = Number(landedCost?.amount.amount || 0);
      const selectedServiceForOrder = landedCost
        ? {
            ...selectedService,
            landedCostAmount: landedCost.amount,
            landedCost,
          }
        : selectedService;
      const orderSubtotalAmount = Number.isFinite(Number(swellOrder.sub_total))
        ? Number(swellOrder.sub_total)
        : subtotalAmount;
      const appliedDiscountCode = args.discountCode || swellOrder.coupon_code;
      checkoutAttribution = await resolveCheckoutAttribution(appliedDiscountCode);
      const couponDiscountRate = await getSwellCouponDiscountRate(appliedDiscountCode);
      const pricing = calculateCheckoutPricing({
        currencyCode: orderCurrencyCode,
        subtotalAmount: orderSubtotalAmount,
        couponDiscountAmount: couponDiscountTotal,
        couponDiscountRate,
        couponCode: appliedDiscountCode,
        shippingAmount: orderShipmentTotal,
        shipmentProtectionAmount: selectedServiceForOrder.shipmentProtection?.totalAmount.amount,
        taxAmount: orderTaxTotal,
        landedCostAmount: orderLandedCostTotal,
        paymentMethod: args.paymentMethod,
      });
      const orderDiscountTotal = pricing.discountTotalValue;
      const orderTotal = pricing.totalValue;
      const fiatCurrency = orderCurrencyCode.toLowerCase();
      const pricingMetadata = buildCheckoutPricingMetadata({
        currencyCode: orderCurrencyCode,
        subtotalAmount: orderSubtotalAmount,
        shippingAmount: orderShipmentTotal,
        shipmentProtectionAmount: selectedServiceForOrder.shipmentProtection?.totalAmount.amount,
        taxAmount: orderTaxTotal,
        landedCostAmount: orderLandedCostTotal,
        totalAmount: orderTotal,
        discounts: pricing.discounts,
        discountAmount: orderDiscountTotal,
        discountCode: appliedDiscountCode,
        paymentMethod: args.paymentMethod,
      });

      if (!orderTotal || orderTotal <= 0 || !Number.isFinite(orderTotal)) {
        throw apiError.badRequest('Order total must be greater than zero.', {
          code: 'invalid_order_total',
        });
      }

      const carryoverContext = buildCarryoverContext({
        orders: cartOrders,
        comparable: carryoverComparable,
        orderTotal,
      });

      if (
        carryoverContext.latestSuccessfulOrder &&
        carryoverContext.creditedAmount + 0.01 >= orderTotal
      ) {
        await dependencies
          .cancelSwellOrder(
            swellOrder.id,
            `Checkout already satisfied by existing order ${carryoverContext.latestSuccessfulOrder.orderId}.`,
          )
          .catch((error) => {
            console.error('Unable to cancel duplicate Swell order after carryover reconciliation:', error);
          });

        return {
          accessKey: carryoverContext.latestSuccessfulOrder.accessKey,
          order: toPublicCheckoutOrderWithCarryover(
            carryoverContext.latestSuccessfulOrder,
            cartOrders,
          ),
          redirectUrl: getHostedPaymentRedirectUrl(
            carryoverContext.latestSuccessfulOrder.payment,
          ),
        };
      }

      const amountAlreadyPaid = carryoverContext.creditedAmount;
      const remainderPaymentAmount = amountAlreadyPaid > 0
        ? Math.max(orderTotal - amountAlreadyPaid, 0.01)
        : orderTotal;
      const amountPaidToDate = amountAlreadyPaid > 0
        ? amountAlreadyPaid.toFixed(2)
        : undefined;

      const orderId = dependencies.createOrderId();
      const accessKey = dependencies.createAccessKey();
      const carryoverRootOrderId =
        carryoverContext.carryoverRootOrderId || orderId;
      const session = await dependencies.optionalSession();
      const userId = session?.user?.id ?? null;

      if (args.paymentMethod === 'interac') {
        const expectedSenderEmail = args.interacSenderEmail?.trim();
        const expectedSenderName = args.interacSenderName?.trim();
        const securityQuestion = args.interacSecurityQuestion?.trim() || null;
        const securityAnswer = args.interacSecurityAnswer?.trim() || null;
        if (!expectedSenderEmail || !expectedSenderName) {
          throw apiError.badRequest('Enter the Interac sender email and name before creating the payment.');
        }

        const recipientEmail = getInteracRecipientEmail();
        const messageCode = await createUniqueInteracMessageCode(dependencies);
        const cadCurrency = (swellOrder.currency || checkoutCurrencyCode).trim().toUpperCase();
        if (cadCurrency !== 'CAD') {
          throw apiError.providerUnavailable(
            'Swell did not return a CAD Interac checkout amount.',
            {
              provider: 'swell',
              expectedCurrency: 'CAD',
              receivedCurrency: cadCurrency,
            },
            false,
          );
        }

        const cadAmount = remainderPaymentAmount.toFixed(2);
        const expiresAt = getInteracExpiresAt(dependencies.nowDate());

        await dependencies.updateSwellOrder(swellOrder.id, {
          billing: {
            ...(swellOrder.billing || {}),
            method: manualMethod,
            intent: {
              provider: 'interac',
              message_code: messageCode,
              status: 'awaiting_transfer',
            },
          },
          metadata: {
            ...(swellOrder.metadata || {}),
            checkout_reference: orderId,
            coupon_code: appliedDiscountCode || null,
            pricing: pricingMetadata,
            landed_cost: landedCost ?? null,
            ...(args.adminShippingDisabled ? { admin_shipping_disabled: true } : {}),
            interac: {
              message_code: messageCode,
              recipient_email: recipientEmail,
              expected_sender_email: expectedSenderEmail,
              expected_sender_name: expectedSenderName,
              security_question: securityQuestion,
              security_answer: securityAnswer,
              cad_amount: cadAmount,
              expires_at: expiresAt,
              status: 'awaiting_transfer',
            },
            affiliate: checkoutAttribution.resolvedAffiliate &&
              checkoutAttribution.affiliateData
              ? {
                  ...checkoutAttribution.affiliateData,
                  paymentProvider: 'interac',
                  status: 'pending',
                }
              : null,
            promoter: checkoutAttribution.promoterData
              ? {
                  ...checkoutAttribution.promoterData,
                  paymentProvider: 'interac',
                  status: 'pending',
                }
              : null,
          },
        });

        const interacOrderRecord = maybeApplyAdminDisabledShipping(
          buildInteracOrderRecord({
            orderId,
            accessKey,
            cartId: fallbackCartId,
            userId,
            swellAccountId: account.id,
            swellCartId: ratedCart.id,
            swellOrderId: swellOrder.id,
            swellOrderNumber: swellOrder.number,
            currencyCode: orderCurrencyCode,
            lines,
            shippingAddress: args.shippingAddress,
            shippingService: mapShippingService(
              selectedServiceForOrder,
              orderCurrencyCode,
            ),
            orderSubtotal: orderSubtotalAmount,
            orderDiscountTotal,
            discountCode: appliedDiscountCode,
            discounts: pricing.discounts,
            orderTaxTotal,
            orderGrandTotal: orderTotal,
            orderShipmentTotal,
            orderLandedCostTotal,
            landedCost,
            recipientEmail,
            messageCode,
            cadAmount,
            expectedSenderEmail,
            expectedSenderName,
            securityQuestion,
            securityAnswer,
            expiresAt,
            amountPaidToDate,
            attemptAmount: remainderPaymentAmount.toFixed(2),
            carryoverRootOrderId,
            nowIso: dependencies.nowIso(),
          }),
          args.adminShippingDisabled,
        );

        const checkoutOrder = await dependencies.saveCheckoutOrder({
          ...interacOrderRecord,
          affiliate: checkoutAttribution.affiliateData,
          promoter: checkoutAttribution.promoterData,
        });
        checkoutOrderId = checkoutOrder.orderId;

        await supersedeCarryoverChainOrders({
          checkoutOrder,
          chainOrders: carryoverContext.chainOrders,
          dependencies,
        });

        await replaceSupersededOpenOrders({
          checkoutOrder,
          customerEmail: args.shippingAddress.email,
          excludedOrderIds: new Set(
            carryoverContext.chainOrders.map((order) => order.orderId),
          ),
          dependencies,
        });

        const publicRelatedOrders = await dependencies.findCheckoutOrdersByCartId(
          fallbackCartId,
        );

        const initiationTelemetry = {
          orderId,
          userId,
          currencyCode,
          orderTotal: orderTotal.toFixed(2),
          itemCount,
          paymentProvider: 'interac' as const,
          paymentMethod: 'interac' as const,
          affiliateCode: checkoutAttribution.resolvedAffiliate?.code ?? null,
          affiliateSource: checkoutAttribution.affiliateSource,
        };

        dependencies
          .sendCheckoutPaymentInitiatedEvent({
            ...initiationTelemetry,
            customerEmail: args.shippingAddress.email,
          })
          .catch(() => {});
        dependencies
          .trackCheckoutPaymentInitiated(initiationTelemetry)
          .catch(() => {});

        return {
          accessKey,
          order: toPublicCheckoutOrderWithCarryover(
            checkoutOrder,
            publicRelatedOrders,
          ) satisfies CheckoutOrderPublic,
        };
      }

      if (!paymentCurrency) {
        throw apiError.badRequest('Select a payment currency before creating the payment.');
      }

      const [estimate, minimum] = await Promise.all([
        dependencies.getNowPaymentsEstimate({
          amount: remainderPaymentAmount,
          currencyFrom: fiatCurrency,
          currencyTo: paymentCurrency,
        }),
        dependencies.getNowPaymentsMinimumAmount({
          currencyFrom: paymentCurrency,
          fiatEquivalent: fiatCurrency,
          isFixedRate: true,
          isFeePaidByUser: false,
        }),
      ]);

      if (estimate.estimated_amount < minimum.min_amount) {
        throw apiError.badRequest(
          `The order total is below NOWPayments minimum for ${paymentCurrency.toUpperCase()}. Choose another currency or use a different shipping/payment configuration.`,
          {
            code: 'nowpayments_minimum_not_met',
          },
        );
      }

      const payment = await dependencies.createNowPaymentsPayment({
        price_amount: Number(remainderPaymentAmount.toFixed(2)),
        price_currency: fiatCurrency,
        pay_currency: paymentCurrency,
        ipn_callback_url: ipnCallbackEnabled
          ? new URL('/api/webhooks/nowpayments', requestUrl.origin).toString()
          : undefined,
        order_id: orderId,
        order_description: buildOrderDescription(lines),
        is_fixed_rate: true,
        is_fee_paid_by_user: false,
      });

      await dependencies.updateSwellOrder(swellOrder.id, {
        billing: {
          ...(swellOrder.billing || {}),
          method: manualMethod,
          intent: {
            provider: 'nowpayments',
            payment_id: payment.payment_id,
            payment_status: payment.payment_status,
            payment_currency: paymentCurrency,
            source_wallet_address: args.sourceWalletAddress || null,
          },
        },
        metadata: {
          ...(swellOrder.metadata || {}),
          checkout_reference: orderId,
          coupon_code: appliedDiscountCode || null,
          pricing: pricingMetadata,
          landed_cost: landedCost ?? null,
          ...(args.adminShippingDisabled ? { admin_shipping_disabled: true } : {}),
          nowpayments: {
            payment_id: payment.payment_id,
            purchase_id: payment.purchase_id,
            payment_status: payment.payment_status,
            payment_currency: paymentCurrency,
            pay_address: payment.pay_address,
            source_wallet_address: args.sourceWalletAddress || null,
            pay_amount: payment.pay_amount,
          },
          affiliate: checkoutAttribution.resolvedAffiliate &&
            checkoutAttribution.affiliateData
            ? {
                ...checkoutAttribution.affiliateData,
                commissionOwed: (
                  orderTotal *
                  Number(
                    checkoutAttribution.commissionSnapshot?.effectiveRate ||
                      checkoutAttribution.resolvedAffiliate.commissionRate,
                  )
                ).toFixed(2),
                currencyCode: fiatCurrency.toUpperCase(),
                paymentProvider: 'nowpayments',
                status: 'pending',
            }
            : null,
          promoter: checkoutAttribution.promoterData
            ? {
                ...checkoutAttribution.promoterData,
                commissionOwed: (
                  orderTotal * Number(checkoutAttribution.promoterData.commissionRate)
                ).toFixed(2),
                currencyCode: fiatCurrency.toUpperCase(),
                paymentProvider: 'nowpayments',
                status: 'pending',
              }
            : null,
        },
      });

      const npOrderRecord = maybeApplyAdminDisabledShipping(
        buildNowPaymentsOrderRecord({
          orderId,
          accessKey,
          cartId: fallbackCartId,
          userId,
          swellAccountId: account.id,
          swellCartId: ratedCart.id,
          swellOrderId: swellOrder.id,
          swellOrderNumber: swellOrder.number,
          currencyCode: orderCurrencyCode,
          lines,
          shippingAddress: args.shippingAddress,
          shippingService: mapShippingService(
            selectedServiceForOrder,
            orderCurrencyCode,
          ),
          orderSubtotal: orderSubtotalAmount,
          orderDiscountTotal,
          discountCode: appliedDiscountCode,
          discounts: pricing.discounts,
          orderTaxTotal,
          orderGrandTotal: orderTotal,
          orderShipmentTotal,
          orderLandedCostTotal,
          landedCost,
          paymentCurrency,
          sourceWalletAddress: args.sourceWalletAddress,
          payment,
          ipnCallbackEnabled,
          amountPaidToDate,
          attemptAmount: remainderPaymentAmount.toFixed(2),
          carryoverRootOrderId,
          nowIso: dependencies.nowIso(),
        }),
        args.adminShippingDisabled,
      );

      const checkoutOrder = await dependencies.saveCheckoutOrder({
        ...npOrderRecord,
        affiliate: checkoutAttribution.affiliateData,
        promoter: checkoutAttribution.promoterData,
      });
      checkoutOrderId = checkoutOrder.orderId;

      await supersedeCarryoverChainOrders({
        checkoutOrder,
        chainOrders: carryoverContext.chainOrders,
        dependencies,
      });

      await replaceSupersededOpenOrders({
        checkoutOrder,
        customerEmail: args.shippingAddress.email,
        excludedOrderIds: new Set(
          carryoverContext.chainOrders.map((order) => order.orderId),
        ),
        dependencies,
      });

      const publicRelatedOrders = await dependencies.findCheckoutOrdersByCartId(
        fallbackCartId,
      );

      const initiationTelemetry = {
        orderId,
        userId,
        currencyCode,
        orderTotal: orderTotal.toFixed(2),
        itemCount,
        paymentProvider: 'nowpayments' as const,
        paymentMethod: 'crypto' as const,
        affiliateCode: checkoutAttribution.resolvedAffiliate?.code ?? null,
        affiliateSource: checkoutAttribution.affiliateSource,
      };

      dependencies
        .sendCheckoutPaymentInitiatedEvent({
          ...initiationTelemetry,
          customerEmail: args.shippingAddress.email,
        })
        .catch(() => {});
      dependencies
        .trackCheckoutPaymentInitiated(initiationTelemetry)
        .catch(() => {});

      return {
        accessKey,
        order: toPublicCheckoutOrderWithCarryover(
          checkoutOrder,
          publicRelatedOrders,
        ) satisfies CheckoutOrderPublic,
      };
    } catch (caughtError) {
      const error = normalizeFinalizeError(caughtError);
      const reason =
        error instanceof Error ? error.message : 'Unknown payment setup error.';

      if (swellOrderId) {
        await dependencies
          .cancelSwellOrder(swellOrderId, reason)
          .catch((cancelError) => {
            console.error('Unable to cancel failed Swell order:', cancelError);
          });
      } else if (temporaryCartId) {
        await dependencies
          .deleteSwellCheckoutCart(temporaryCartId)
          .catch((cleanupError) => {
            console.error(
              'Unable to delete temporary Swell checkout cart:',
              cleanupError,
            );
          });
      }

      if (squarePaymentLinkId) {
        await deleteSquarePaymentLink(squarePaymentLinkId).catch((deleteError) => {
          console.error('Unable to delete failed Square payment link:', deleteError);
        });
      }

      if (checkoutOrderId) {
        await dependencies
          .updateCheckoutOrder(checkoutOrderId, (current) => {
            if (isTerminalPaymentStatus(current.payment.status)) {
              return current;
            }

            return markCheckoutOrderSetupFailed(current, reason);
          })
          .catch((orderError) => {
            console.error(
              'Unable to mark checkout order setup failed:',
              orderError,
            );
          });
      }

      throw error;
    }
  };
}

export const finalizeCheckoutSession = createFinalizeCheckoutSession({
  nowDate: () => new Date(),
  nowIso: () => new Date().toISOString(),
  createOrderId,
  createAccessKey,
  createShieldClimbCallbackToken,
  createInteracMessageCode,
  findInteracOrderByMessageCode,
  optionalSession,
  getApprovedAffiliateByDiscountCode,
  getApprovedAffiliateByCode,
  getAffiliateCommissionSnapshot,
  getCommissionMonthKey,
  getSuccessfulPromoterForAffiliate,
  findCheckoutOrderByCartId,
  findCheckoutOrdersByCartId,
  findOpenCheckoutOrdersByEmail,
  saveCheckoutOrder,
  updateCheckoutOrder,
  upsertSwellGuestAccount,
  createSwellCheckoutCart,
  getShipEngineCheckoutServices,
  getSwellManualPaymentMethod,
  updateSwellCheckoutCart,
  convertSwellCartToOrder,
  updateSwellOrder,
  cancelSwellOrder,
  deleteSwellCheckoutCart,
  createWalletForOrder,
  convertToUsd,
  buildShieldClimbPaymentUrl,
  getNowPaymentsEstimate,
  getNowPaymentsMinimumAmount,
  createNowPaymentsPayment,
  createSquarePaymentLink,
  createBankfulPaymentAttempt,
  findRecentSafeBankfulFallbackAttempt,
  claimBankfulPaymentAttemptCapture,
  updateBankfulPaymentAttempt,
  createBankfulSale,
  runSuccessfulOrderProcessing,
  sendCheckoutPaymentInitiatedEvent,
  trackCheckoutPaymentInitiated,
});
