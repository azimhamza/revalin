import crypto from 'node:crypto';
import { apiError } from '@/lib/api/errors';
import { optionalSession } from '@/lib/api/auth';
import {
  getApprovedAffiliateByCode,
  getApprovedAffiliateByDiscountCode,
} from '@/lib/checkout/affiliate-service';
import { getSuccessfulPromoterForAffiliate } from '@/lib/checkout/promoter-service';
import {
  FREE_SHIPPING_THRESHOLD,
  isTerminalPaymentStatus,
} from '@/lib/checkout/constants';
import {
  getAffiliateCommissionSnapshot,
  getCommissionMonthKey,
} from '@/lib/checkout/commission-service';
import { buildInitialCheckoutOrderProcessing } from '@/lib/checkout/payment-lifecycle';
import {
  createNowPaymentsPayment,
  getNowPaymentsEstimate,
  getNowPaymentsMinimumAmount,
} from '@/lib/checkout/nowpayments';
import {
  saveCheckoutOrder,
  findCheckoutOrderByCartId,
  findOpenCheckoutOrdersByEmail,
  updateCheckoutOrder,
} from '@/lib/checkout/order-store';
import { markCheckoutOrderSetupFailed } from '@/lib/checkout/order-recovery';
import {
  buildCheckoutPricingMetadata,
  calculateCheckoutPricing,
} from '@/lib/checkout/pricing';
import {
  createWalletForOrder,
  buildShieldClimbPaymentUrl,
  convertToUsd,
} from '@/lib/checkout/shieldclimb';
import {
  applyFreeShipping,
  findCheckoutShippingService,
  getCartSnapshotItemCount,
  getCartSnapshotSubtotal,
  getShipEngineCheckoutServices,
  mapSwellRatedServices,
  type CheckoutRatedService,
} from '@/lib/checkout/shipping-rates';
import {
  cancelSwellOrder,
  convertSwellCartToOrder,
  createSwellCheckoutCart,
  deleteSwellCheckoutCart,
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
  CheckoutOrderLine,
  CheckoutOrderPromoter,
  CheckoutOrderPublic,
  CheckoutOrderRecord,
  CheckoutShippingAddress,
  CheckoutShippingService,
  NowPaymentsPaymentData,
  ShieldClimbPaymentData,
} from '@/lib/checkout/types';
import { toPublicCheckoutOrder } from '@/lib/checkout/types';

type FinalizeCheckoutInput = {
  sessionId: string;
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
    }>;
  };
  shippingAddress: CheckoutShippingAddress;
  paymentMethod: 'card' | 'crypto';
  paymentCurrency: string;
  sourceWalletAddress?: string | null;
  selectedShippingServiceId: string;
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
  optionalSession: typeof optionalSession;
  getApprovedAffiliateByDiscountCode: typeof getApprovedAffiliateByDiscountCode;
  getApprovedAffiliateByCode: typeof getApprovedAffiliateByCode;
  getAffiliateCommissionSnapshot: typeof getAffiliateCommissionSnapshot;
  getCommissionMonthKey: typeof getCommissionMonthKey;
  getSuccessfulPromoterForAffiliate: typeof getSuccessfulPromoterForAffiliate;
  findCheckoutOrderByCartId: typeof findCheckoutOrderByCartId;
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
  const orderPaymentMethod =
    args.existingOrder.payment.provider === 'shieldclimb' ? 'card' : 'crypto';

  if (orderPaymentMethod !== args.input.paymentMethod) {
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

  return true;
}

async function replaceSupersededOpenOrders(args: {
  checkoutOrder: CheckoutOrderRecord;
  customerEmail: string;
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
      await args.dependencies
        .cancelSwellOrder(openOrder.swell.orderId, reason)
        .catch((error) => {
          console.error('Unable to cancel superseded Swell order:', error);
        });

      await args.dependencies
        .updateCheckoutOrder(openOrder.orderId, (current) => {
          if (isTerminalPaymentStatus(current.payment.status)) {
            return current;
          }

          return {
            ...current,
            payment: {
              ...current.payment,
              status: 'replaced',
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
    estimatedDays: service.estimatedDays,
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
  };
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
  paymentCurrency: string;
  sourceWalletAddress?: string | null;
  payment: Awaited<ReturnType<typeof createNowPaymentsPayment>>;
  ipnCallbackEnabled: boolean;
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: NowPaymentsPaymentData = {
    provider: 'nowpayments',
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
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: FREE_SHIPPING_THRESHOLD.toFixed(2),
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
  nowIso?: string;
}): CheckoutOrderRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: ShieldClimbPaymentData = {
    provider: 'shieldclimb',
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
      totalAmount: {
        amount: args.orderGrandTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingAmount: {
        amount: args.orderShipmentTotal.toFixed(2),
        currencyCode: args.currencyCode,
      },
      shippingThresholdAmount: {
        amount: FREE_SHIPPING_THRESHOLD.toFixed(2),
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

function normalizeFinalizeError(error: unknown) {
  if (
    error instanceof Error &&
    /coupon|discount|promotion/i.test(error.message)
  ) {
    return apiError.badRequest('That discount code is invalid or has expired.');
  }

  return error;
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

    try {
      const affiliateRefCode = args.affiliateCode?.trim() || null;
      let resolvedAffiliate: Awaited<
        ReturnType<typeof getApprovedAffiliateByDiscountCode>
      > = null;
      let affiliateSource: 'url' | 'discount_code' | null = null;

      if (args.discountCode) {
        resolvedAffiliate =
          await dependencies.getApprovedAffiliateByDiscountCode(
            args.discountCode,
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
        ? await dependencies.getAffiliateCommissionSnapshot({
            affiliateId: resolvedAffiliate.id,
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

      const existingOrder =
        await dependencies.findCheckoutOrderByCartId(fallbackCartId);
      if (
        existingOrder &&
        doesExistingOrderMatchCheckoutAttempt({
          existingOrder,
          input: args,
        })
      ) {
        return {
          accessKey: existingOrder.accessKey,
          order: toPublicCheckoutOrder(existingOrder),
          redirectUrl:
            existingOrder.payment.provider === 'shieldclimb'
              ? existingOrder.payment.redirectUrl
              : null,
        };
      }

      const lines = args.cartSnapshot.lines.map((line) => ({
        ...line,
        skuNumber: line.skuNumber || undefined,
      })) satisfies CheckoutOrderLine[];
      const currencyCode = args.cartSnapshot.currencyCode;
      const subtotalAmount = getCartSnapshotSubtotal(args.cartSnapshot);
      const itemCount = getCartSnapshotItemCount(args.cartSnapshot);
      const paymentCurrency = args.paymentCurrency.toLowerCase();
      const ipnCallbackEnabled = shouldEnableIpnCallback(requestUrl);
      const manualMethod = dependencies.getSwellManualPaymentMethod();
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
        currencyCode,
        shipping: swellShipping,
        billing: swellBilling,
        comments: args.shippingAddress.notes,
        couponCode: args.discountCode ?? undefined,
      });
      temporaryCartId = swellCart.id;

      let availableServices: CheckoutRatedService[] = [];
      let shipEngineErrorMessage: string | null = null;

      try {
        availableServices = await dependencies.getShipEngineCheckoutServices({
          shippingAddress: args.shippingAddress,
          currencyCode,
          subtotalAmount,
          itemCount,
        });
      } catch (shipEngineError) {
        shipEngineErrorMessage =
          shipEngineError instanceof Error
            ? shipEngineError.message
            : 'Unable to validate the shipping address.';
        console.error(
          'Unable to fetch ShipEngine rates for payment creation, falling back to Swell:',
          shipEngineError,
        );
      }

      if (availableServices.length === 0) {
        availableServices = mapSwellRatedServices(
          swellCart.shipment_rating?.services || [],
          swellCart.currency || currencyCode,
        );
      }

      if (availableServices.length === 0 && shipEngineErrorMessage) {
        throw apiError.badRequest(shipEngineErrorMessage, {
          code: 'address_validation_failed',
        });
      }

      availableServices = applyFreeShipping(
        availableServices,
        subtotalAmount,
        currencyCode,
      );

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
      const orderShipmentTotal = Number(
        swellOrder.shipment_total || selectedService.price.amount || 0,
      );
      const appliedDiscountCode = args.discountCode || swellOrder.coupon_code;
      const pricing = calculateCheckoutPricing({
        currencyCode: swellOrder.currency || currencyCode,
        subtotalAmount,
        couponDiscountAmount: couponDiscountTotal,
        couponCode: appliedDiscountCode,
        shippingAmount: orderShipmentTotal,
        taxAmount: orderTaxTotal,
        paymentMethod: args.paymentMethod,
      });
      const orderDiscountTotal = pricing.discountTotalValue;
      const orderTotal = pricing.totalValue;
      const fiatCurrency = (swellOrder.currency || currencyCode).toLowerCase();
      const pricingMetadata = buildCheckoutPricingMetadata({
        currencyCode: swellOrder.currency || currencyCode,
        subtotalAmount,
        shippingAmount: orderShipmentTotal,
        taxAmount: orderTaxTotal,
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

      const orderId = dependencies.createOrderId();
      const accessKey = dependencies.createAccessKey();
      const shieldClimbCallbackToken =
        dependencies.createShieldClimbCallbackToken();
      const session = await dependencies.optionalSession();
      const userId = session?.user?.id ?? null;

      if (args.paymentMethod === 'card') {
        const publicCallbackOrigin = getPublicCallbackOrigin(requestUrl);

        if (!publicCallbackOrigin) {
          throw apiError.badRequest(
            'Card checkout requires a public callback URL. Set `SHIELDCLIMB_CALLBACK_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, or `SITE_URL` to your public app origin before using ShieldClimb from local development.',
            { code: 'shieldclimb_callback_unavailable' },
          );
        }

        const initializingOrder = await dependencies.saveCheckoutOrder({
          ...buildShieldClimbOrderRecord({
            orderId,
            accessKey,
            cartId: fallbackCartId,
            userId,
            swellAccountId: account.id,
            swellCartId: ratedCart.id,
            swellOrderId: swellOrder.id,
            swellOrderNumber: swellOrder.number,
            currencyCode: swellOrder.currency || currencyCode,
            lines,
            shippingAddress: args.shippingAddress,
            shippingService: mapShippingService(
              selectedService,
              swellOrder.currency || currencyCode,
            ),
            orderSubtotal: subtotalAmount,
            orderDiscountTotal,
            discountCode: appliedDiscountCode,
            discounts: pricing.discounts,
            orderTaxTotal,
            orderGrandTotal: orderTotal,
            orderShipmentTotal,
            walletId: 'pending',
            addressIn: '',
            polygonAddressIn: '',
            ipnToken: '',
            callbackToken: shieldClimbCallbackToken,
            redirectUrl: '',
            paymentStatus: 'initializing',
            nowIso: dependencies.nowIso(),
          }),
          affiliate: affiliateData,
          promoter: promoterData,
        });
        checkoutOrderId = initializingOrder.orderId;

        const callbackUrl = new URL(
          '/api/providers/shieldclimb/callback',
          publicCallbackOrigin,
        );
        callbackUrl.searchParams.set('orderId', orderId);
        callbackUrl.searchParams.set('callbackToken', shieldClimbCallbackToken);

        let paymentAmount = orderTotal;
        if (fiatCurrency !== 'usd') {
          const converted = await dependencies.convertToUsd({
            amount: orderTotal,
            fromCurrency: fiatCurrency.toUpperCase(),
          });
          paymentAmount = Number(converted.value_coin);
        }

        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
          throw apiError.providerUnavailable(
            'ShieldClimb returned an invalid payment amount.',
            { provider: 'shieldclimb', operation: 'convert-to-usd' },
            false,
          );
        }

        const expectedValueCoin = paymentAmount.toFixed(2);

        const scWallet = await dependencies.createWalletForOrder({
          callbackUrl: callbackUrl.toString(),
        });
        const shieldClimbSessionId = createShieldClimbSessionId(scWallet.ipn_token);

        const redirectUrl = dependencies.buildShieldClimbPaymentUrl({
          addressIn: scWallet.address_in,
          amount: paymentAmount,
          email: args.shippingAddress.email,
          currency: 'USD',
        });

        await dependencies.updateSwellOrder(swellOrder.id, {
          billing: {
            ...(swellOrder.billing || {}),
            method: manualMethod,
            intent: {
              provider: 'shieldclimb',
              session_id: shieldClimbSessionId,
              ipn_token: scWallet.ipn_token,
              status: 'unpaid',
            },
          },
          metadata: {
            ...(swellOrder.metadata || {}),
            checkout_reference: orderId,
            coupon_code: appliedDiscountCode || null,
            pricing: pricingMetadata,
            shieldclimb: {
              session_id: shieldClimbSessionId,
              ipn_token: scWallet.ipn_token,
              polygon_address_in: scWallet.polygon_address_in,
              expected_value_coin: expectedValueCoin,
              payment_currency: 'USD',
              status: 'unpaid',
            },
            affiliate: resolvedAffiliate
              ? {
                  ...affiliateData,
                  paymentProvider: 'shieldclimb',
                  status: 'pending',
                }
              : null,
            promoter: promoterData
              ? {
                  ...promoterData,
                  paymentProvider: 'shieldclimb',
                  status: 'pending',
                }
              : null,
          },
        });

        const checkoutOrder = await dependencies.saveCheckoutOrder({
          ...buildShieldClimbOrderRecord({
            orderId,
            accessKey,
            cartId: fallbackCartId,
            userId,
            swellAccountId: account.id,
            swellCartId: ratedCart.id,
            swellOrderId: swellOrder.id,
            swellOrderNumber: swellOrder.number,
            currencyCode: swellOrder.currency || currencyCode,
            lines,
            shippingAddress: args.shippingAddress,
            shippingService: mapShippingService(
              selectedService,
              swellOrder.currency || currencyCode,
            ),
            orderSubtotal: subtotalAmount,
            orderDiscountTotal,
            discountCode: appliedDiscountCode,
            discounts: pricing.discounts,
            orderTaxTotal,
            orderGrandTotal: orderTotal,
            orderShipmentTotal,
            walletId: shieldClimbSessionId,
            addressIn: scWallet.address_in,
            polygonAddressIn: scWallet.polygon_address_in,
            ipnToken: scWallet.ipn_token,
            callbackUrl: scWallet.callback_url,
            callbackToken: shieldClimbCallbackToken,
            redirectUrl,
            expectedValueCoin,
            paymentCurrency: 'USD',
            paymentStatus: 'unpaid',
            nowIso: dependencies.nowIso(),
          }),
          affiliate: affiliateData,
          promoter: promoterData,
        });
        checkoutOrderId = checkoutOrder.orderId;

        await replaceSupersededOpenOrders({
          checkoutOrder,
          customerEmail: args.shippingAddress.email,
          dependencies,
        });

        const initiationTelemetry = {
          orderId,
          userId,
          currencyCode,
          orderTotal: orderTotal.toFixed(2),
          itemCount,
          paymentProvider: 'shieldclimb' as const,
          paymentMethod: 'card' as const,
          affiliateCode: resolvedAffiliate?.code ?? null,
          affiliateSource,
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
          redirectUrl,
          order: toPublicCheckoutOrder(
            checkoutOrder,
          ) satisfies CheckoutOrderPublic,
        };
      }

      const [estimate, minimum] = await Promise.all([
        dependencies.getNowPaymentsEstimate({
          amount: orderTotal,
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
        price_amount: Number(orderTotal.toFixed(2)),
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
          nowpayments: {
            payment_id: payment.payment_id,
            purchase_id: payment.purchase_id,
            payment_status: payment.payment_status,
            payment_currency: paymentCurrency,
            pay_address: payment.pay_address,
            source_wallet_address: args.sourceWalletAddress || null,
            pay_amount: payment.pay_amount,
          },
          affiliate: resolvedAffiliate
            ? {
                ...affiliateData,
                commissionOwed: (
                  orderTotal *
                  Number(
                    commissionSnapshot?.effectiveRate ||
                      resolvedAffiliate.commissionRate,
                  )
                ).toFixed(2),
                currencyCode: fiatCurrency.toUpperCase(),
                paymentProvider: 'nowpayments',
                status: 'pending',
              }
            : null,
          promoter: promoterData
            ? {
                ...promoterData,
                commissionOwed: (
                  orderTotal * Number(promoterData.commissionRate)
                ).toFixed(2),
                currencyCode: fiatCurrency.toUpperCase(),
                paymentProvider: 'nowpayments',
                status: 'pending',
              }
            : null,
        },
      });

      const checkoutOrder = await dependencies.saveCheckoutOrder({
        ...buildNowPaymentsOrderRecord({
          orderId,
          accessKey,
          cartId: fallbackCartId,
          userId,
          swellAccountId: account.id,
          swellCartId: ratedCart.id,
          swellOrderId: swellOrder.id,
          swellOrderNumber: swellOrder.number,
          currencyCode: swellOrder.currency || currencyCode,
          lines,
          shippingAddress: args.shippingAddress,
          shippingService: mapShippingService(
            selectedService,
            swellOrder.currency || currencyCode,
          ),
          orderSubtotal: subtotalAmount,
          orderDiscountTotal,
          discountCode: appliedDiscountCode,
          discounts: pricing.discounts,
          orderTaxTotal,
          orderGrandTotal: orderTotal,
          orderShipmentTotal,
          paymentCurrency,
          sourceWalletAddress: args.sourceWalletAddress,
          payment,
          ipnCallbackEnabled,
          nowIso: dependencies.nowIso(),
        }),
        affiliate: affiliateData,
        promoter: promoterData,
      });
      checkoutOrderId = checkoutOrder.orderId;

      await replaceSupersededOpenOrders({
        checkoutOrder,
        customerEmail: args.shippingAddress.email,
        dependencies,
      });

      const initiationTelemetry = {
        orderId,
        userId,
        currencyCode,
        orderTotal: orderTotal.toFixed(2),
        itemCount,
        paymentProvider: 'nowpayments' as const,
        paymentMethod: 'crypto' as const,
        affiliateCode: resolvedAffiliate?.code ?? null,
        affiliateSource,
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
        order: toPublicCheckoutOrder(
          checkoutOrder,
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
  optionalSession,
  getApprovedAffiliateByDiscountCode,
  getApprovedAffiliateByCode,
  getAffiliateCommissionSnapshot,
  getCommissionMonthKey,
  getSuccessfulPromoterForAffiliate,
  findCheckoutOrderByCartId,
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
  sendCheckoutPaymentInitiatedEvent,
  trackCheckoutPaymentInitiated,
});
