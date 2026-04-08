import crypto from 'node:crypto';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { SwellCartLine } from '@/lib/swell/types';
import { getCart } from '@/lib/swell/swell';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import { FREE_SHIPPING_THRESHOLD, isTerminalPaymentStatus } from '@/lib/checkout/constants';
import { markCheckoutOrderSetupFailed } from '@/lib/checkout/order-recovery';
import { createNowPaymentsPayment, getNowPaymentsEstimate, getNowPaymentsMinimumAmount } from '@/lib/checkout/nowpayments';
import { createWalletForOrder, buildShieldClimbPaymentUrl, convertToUsd } from '@/lib/checkout/shieldclimb';
import { getApprovedAffiliateByCode, getApprovedAffiliateByDiscountCode } from '@/lib/checkout/affiliate-service';
import { AFFILIATE_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';
import { createAndStoreWallet, updateWalletShieldClimbData } from '@/lib/checkout/wallet-service';
import { buildInitialCheckoutOrderProcessing } from '@/lib/checkout/payment-lifecycle';
import { saveCheckoutOrder, findCheckoutOrderByCartId, updateCheckoutOrder } from '@/lib/checkout/order-store';
import {
  sendCheckoutPaymentInitiatedEvent,
  trackCheckoutPaymentInitiated,
} from '@/lib/checkout/telemetry';
import {
  getAffiliateCommissionSnapshot,
  getCommissionMonthKey,
} from '@/lib/checkout/commission-service';
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
  type StorefrontCartSnapshot,
} from '@/lib/checkout/swell-order-management';
import {
  applyFreeShipping,
  findCheckoutShippingService,
  getCartSnapshotItemCount,
  getCartSnapshotSubtotal,
  getShipEngineCheckoutServices,
  getStorefrontCartItemCount,
  getStorefrontCartSubtotal,
  mapSwellRatedServices,
  type CheckoutRatedService,
} from '@/lib/checkout/shipping-rates';
import {
  buildCheckoutPricingMetadata,
  calculateCheckoutPricing,
} from '@/lib/checkout/pricing';
import type {
  CheckoutOrderLine,
  CheckoutOrderPublic,
  CheckoutOrderRecord,
  CheckoutShippingAddress,
  CheckoutShippingService,
  NowPaymentsPaymentData,
  ShieldClimbPaymentData,
} from '@/lib/checkout/types';
import { toPublicCheckoutOrder } from '@/lib/checkout/types';
import { resolveUnitPrice } from '@/lib/swell/utils';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const countryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Invalid country code');

const shippingSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  address1: z.string().trim().min(1),
  address2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  province: z.string().trim().optional().default(''),
  postalCode: z.string().trim().min(1),
  country: countryCodeSchema,
  notes: z.string().trim().max(500).optional(),
});

const createPaymentSchema = z.object({
  paymentMethod: z.enum(['card', 'crypto']).default('crypto'),
  paymentCurrency: z.string().trim().min(2),
  sourceWalletAddress: z.string().trim().max(255).optional(),
  selectedShippingServiceId: z.string().trim().min(1),
  discountCode: z.string().trim().min(1).optional(),
  shippingAddress: shippingSchema,
  cartSnapshot: z
    .object({
      currencyCode: z.string().trim().min(1),
      lines: z
        .array(
          z.object({
            id: z.string(),
            merchandiseId: z.string().trim().min(1),
            productHandle: z.string().trim().min(1),
            productTitle: z.string(),
            variantTitle: z.string(),
            skuNumber: z.string().optional(),
            imageUrl: z.string(),
            selectedOptions: z.array(
              z.object({
                name: z.string(),
                value: z.string(),
              })
            ),
            quantity: z.number().int().positive(),
            unitPrice: z.object({
              amount: z.string(),
              currencyCode: z.string(),
            }),
            lineTotal: z.object({
              amount: z.string(),
              currencyCode: z.string(),
            }),
          })
        )
        .min(1),
    })
    .optional(),
});

function createOrderId() {
  return `RVL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createAccessKey() {
  return crypto.randomUUID() + crypto.randomBytes(8).toString('hex');
}

function createShieldClimbCallbackToken() {
  return crypto.randomUUID() + crypto.randomBytes(8).toString('hex');
}

function serializeCartLine(line: SwellCartLine): CheckoutOrderLine {
  const imageUrl = line.merchandise.product.images.edges[0]?.node.url || '/placeholder.jpg';
  const effectiveUnitPrice = resolveUnitPrice(line.merchandise.price.amount, line.quantity, line.bulkPriceTiers);
  const lineTotal = {
    amount: (Number(effectiveUnitPrice) * line.quantity).toFixed(2),
    currencyCode: line.merchandise.price.currencyCode || 'USD',
  };

  return {
    id: line.id,
    merchandiseId: line.merchandise.id,
    productHandle: line.merchandise.product.handle,
    productTitle: line.merchandise.product.title,
    variantTitle: line.merchandise.title,
    skuNumber: line.merchandise.sku || undefined,
    imageUrl,
    selectedOptions: line.merchandise.selectedOptions || [],
    quantity: line.quantity,
    unitPrice: {
      amount: Number(effectiveUnitPrice).toFixed(2),
      currencyCode: line.merchandise.price.currencyCode || 'USD',
    },
    lineTotal,
  };
}

function buildOrderDescription(lines: CheckoutOrderLine[]) {
  const summary = lines
    .map(line => `${line.productTitle} x${line.quantity}`)
    .join(', ')
    .slice(0, 180);

  return summary || 'Revalin research order';
}

function shouldEnableIpnCallback(requestUrl: URL) {
  return !['localhost', '127.0.0.1'].includes(requestUrl.hostname) && !requestUrl.hostname.endsWith('.local');
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

  if (['localhost', '127.0.0.1'].includes(requestUrl.hostname) || requestUrl.hostname.endsWith('.local')) {
    return null;
  }

  return requestUrl.origin;
}

function mapShippingService(service: CheckoutRatedService, currencyCode: string): CheckoutShippingService {
  return {
    id: service.id,
    name: service.name,
    source: service.source,
    carrier: service.carrier,
    carrierCode: service.carrierCode,
    serviceCode: service.serviceCode,
    shipengineRateId: service.shipengineRateId,
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
  cartSnapshot: z.infer<typeof createPaymentSchema>['cartSnapshot']
): StorefrontCartSnapshot | undefined {
  if (!cartSnapshot) return undefined;

  return {
    currencyCode: cartSnapshot.currencyCode,
    lines: cartSnapshot.lines.map(line => ({
      merchandiseId: line.merchandiseId,
      productHandle: line.productHandle,
      quantity: line.quantity,
    })),
  };
}

function buildNowPaymentsOrderRecord(args: {
  orderId: string;
  accessKey: string;
  storefrontCartId: string;
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
  sourceWalletAddress?: string;
  payment: Awaited<ReturnType<typeof createNowPaymentsPayment>>;
  ipnCallbackEnabled: boolean;
}): CheckoutOrderRecord {
  const now = new Date().toISOString();
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
      args.payment.amount_received === undefined || args.payment.amount_received === null
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
    cartId: args.storefrontCartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: { amount: args.orderSubtotal.toFixed(2), currencyCode: args.currencyCode },
      discountAmount: { amount: args.orderDiscountTotal.toFixed(2), currencyCode: args.currencyCode },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: { amount: args.orderTaxTotal.toFixed(2), currencyCode: args.currencyCode },
      totalAmount: { amount: args.orderGrandTotal.toFixed(2), currencyCode: args.currencyCode },
      shippingAmount: { amount: args.orderShipmentTotal.toFixed(2), currencyCode: args.currencyCode },
      shippingThresholdAmount: { amount: FREE_SHIPPING_THRESHOLD.toFixed(2), currencyCode: args.currencyCode },
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
  storefrontCartId: string;
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
  callbackToken?: string;
  redirectUrl: string;
  paymentStatus?: string;
}): CheckoutOrderRecord {
  const now = new Date().toISOString();
  const shippingStatus = args.orderShipmentTotal <= 0.009 ? 'free' : 'quoted';

  const paymentData: ShieldClimbPaymentData = {
    provider: 'shieldclimb',
    walletId: args.walletId,
    addressIn: args.addressIn,
    polygonAddressIn: args.polygonAddressIn,
    ipnToken: args.ipnToken,
    callbackToken: args.callbackToken,
    status: args.paymentStatus || 'unpaid',
    redirectUrl: args.redirectUrl,
    createdAt: now,
    updatedAt: now,
  };

  return {
    orderId: args.orderId,
    accessKey: args.accessKey,
    cartId: args.storefrontCartId,
    userId: args.userId ?? null,
    createdAt: now,
    updatedAt: now,
    currencyCode: args.currencyCode,
    shippingAddress: args.shippingAddress,
    shippingService: args.shippingService,
    lines: args.lines,
    totals: {
      subtotalAmount: { amount: args.orderSubtotal.toFixed(2), currencyCode: args.currencyCode },
      discountAmount: { amount: args.orderDiscountTotal.toFixed(2), currencyCode: args.currencyCode },
      discountCode: args.discountCode,
      discounts: args.discounts?.length ? args.discounts : undefined,
      taxAmount: { amount: args.orderTaxTotal.toFixed(2), currencyCode: args.currencyCode },
      totalAmount: { amount: args.orderGrandTotal.toFixed(2), currencyCode: args.currencyCode },
      shippingAmount: { amount: args.orderShipmentTotal.toFixed(2), currencyCode: args.currencyCode },
      shippingThresholdAmount: { amount: FREE_SHIPPING_THRESHOLD.toFixed(2), currencyCode: args.currencyCode },
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

export async function POST(request: Request) {
  let swellOrderId: string | undefined;
  let checkoutOrderId: string | undefined;

  try {
    const rawBody = await request.json();
    console.log('[CREATE-PAYMENT] incoming payload keys:', Object.keys(rawBody), 'paymentMethod:', rawBody.paymentMethod, 'hasCartSnapshot:', !!rawBody.cartSnapshot, 'hasDiscount:', !!rawBody.discountCode, 'selectedService:', rawBody.selectedShippingServiceId);
    const body = createPaymentSchema.parse(rawBody);
    const cookieStore = await cookies();
    const storefrontCartId = cookieStore.get('cartId')?.value;
    const fallbackCartId = storefrontCartId || `checkout-${Date.now().toString(36)}`;
    const fallbackCurrencyCode = await resolveRequestCurrencyCode();
    const storefrontCart =
      !body.cartSnapshot && storefrontCartId ? await getCart(storefrontCartId, fallbackCurrencyCode) : null;

    if (!body.cartSnapshot && (!storefrontCart || storefrontCart.lines.edges.length === 0)) {
      console.error('[CREATE-PAYMENT] EXIT:empty_cart storefrontCartId:', storefrontCartId, 'hasSnapshot:', !!body.cartSnapshot);
      return NextResponse.json({ code: 'empty_cart', error: 'Your stack is empty.' }, { status: 400 });
    }

    // ── Affiliate resolution ──
    const affiliateRefCode = cookieStore.get(AFFILIATE_COOKIE_NAME)?.value;
    let resolvedAffiliate: Awaited<ReturnType<typeof getApprovedAffiliateByDiscountCode>> = null;
    let affiliateSource: 'url' | 'discount_code' | null = null;

    if (body.discountCode) {
      resolvedAffiliate = await getApprovedAffiliateByDiscountCode(body.discountCode);
      if (resolvedAffiliate) {
        affiliateSource = affiliateRefCode ? 'url' : 'discount_code';
      }
    }
    if (!resolvedAffiliate && affiliateRefCode) {
      resolvedAffiliate = await getApprovedAffiliateByCode(affiliateRefCode);
      if (resolvedAffiliate) affiliateSource = 'url';
    }

    const commissionSnapshot = resolvedAffiliate
      ? await getAffiliateCommissionSnapshot({ affiliateId: resolvedAffiliate.id })
      : null;

    if (resolvedAffiliate) {
      console.log('[CREATE-PAYMENT] affiliate resolved:', resolvedAffiliate.code, 'source:', affiliateSource, 'rate:', resolvedAffiliate.commissionRate);
    }

    const affiliateData = resolvedAffiliate
      ? {
          id: resolvedAffiliate.id,
          code: resolvedAffiliate.code,
          commissionRate:
            commissionSnapshot?.effectiveRate || resolvedAffiliate.commissionRate,
          commissionRateAtPurchase:
            commissionSnapshot?.effectiveRate || resolvedAffiliate.commissionRate,
          commissionTierAtPurchase: commissionSnapshot
            ? commissionSnapshot.hasOverride
              ? `${commissionSnapshot.tierLabel} override`
              : commissionSnapshot.tierLabel
            : null,
          commissionMonthKey: commissionSnapshot?.monthKey ?? getCommissionMonthKey(new Date()),
          discountCode: resolvedAffiliate.discountCode,
          discountPercentAtPurchase: resolvedAffiliate.discountPercent,
          source: affiliateSource,
        }
      : null;

    // Idempotency: prevent duplicate orders from the same cart
    if (storefrontCartId) {
      const existingOrder = await findCheckoutOrderByCartId(storefrontCartId);
      if (existingOrder) {
        console.warn('[CREATE-PAYMENT] EXIT:duplicate_cart cartId already has order:', existingOrder.orderId);
        return NextResponse.json(
          {
            accessKey: existingOrder.accessKey,
            order: toPublicCheckoutOrder(existingOrder),
          },
          { status: 200 }
        );
      }
    }

    const lines = body.cartSnapshot?.lines || storefrontCart!.lines.edges.map(edge => serializeCartLine(edge.node));
    const currencyCode = body.cartSnapshot?.currencyCode || storefrontCart?.cost.totalAmount.currencyCode || fallbackCurrencyCode;
    const subtotalAmount = body.cartSnapshot
      ? getCartSnapshotSubtotal(body.cartSnapshot)
      : getStorefrontCartSubtotal(storefrontCart);
    const itemCount = body.cartSnapshot
      ? getCartSnapshotItemCount(body.cartSnapshot)
      : getStorefrontCartItemCount(storefrontCart);
    const paymentCurrency = body.paymentCurrency.toLowerCase();
    const requestUrl = new URL(request.url);
    const ipnCallbackEnabled = shouldEnableIpnCallback(requestUrl);
    const manualMethod = getSwellManualPaymentMethod();
    const swellShipping = toSwellAddress({
      ...body.shippingAddress,
      email: body.shippingAddress.email,
      phone: body.shippingAddress.phone,
    });
    const swellBilling = {
      ...swellShipping,
      method: manualMethod,
    };

    const account = await upsertSwellGuestAccount({
      email: body.shippingAddress.email,
      firstName: body.shippingAddress.firstName,
      lastName: body.shippingAddress.lastName,
      phone: body.shippingAddress.phone,
      shipping: swellShipping,
      billing: swellBilling,
    });

    const swellCart = await createSwellCheckoutCart({
      accountId: account.id,
      storefrontCartId,
      storefrontCartSnapshot: toStorefrontCartSnapshot(body.cartSnapshot),
      currencyCode,
      shipping: swellShipping,
      billing: swellBilling,
      comments: body.shippingAddress.notes,
      couponCode: body.discountCode,
    });

    let availableServices: CheckoutRatedService[] = [];
    let shipEngineErrorMessage: string | null = null;

    if (!body.discountCode) {
      try {
        availableServices = await getShipEngineCheckoutServices({
          shippingAddress: body.shippingAddress,
          currencyCode,
          subtotalAmount,
          itemCount,
        });
      } catch (shipEngineError) {
        shipEngineErrorMessage = shipEngineError instanceof Error ? shipEngineError.message : 'Unable to validate the shipping address.';
        console.error('Unable to fetch ShipEngine rates for payment creation, falling back to Swell:', shipEngineError);
      }
    }

    if (availableServices.length === 0) {
      availableServices = mapSwellRatedServices(swellCart.shipment_rating?.services || [], swellCart.currency || currencyCode);
    }

    if (availableServices.length === 0 && shipEngineErrorMessage) {
      await deleteSwellCheckoutCart(swellCart.id);
      console.warn('Checkout payment blocked by address validation.', {
        error: shipEngineErrorMessage,
        country: body.shippingAddress.country,
        province: body.shippingAddress.province,
        postalCode: body.shippingAddress.postalCode,
      });
      return NextResponse.json(
        { code: 'address_validation_failed', error: shipEngineErrorMessage },
        { status: 400 }
      );
    }

    availableServices = applyFreeShipping(availableServices, subtotalAmount, currencyCode);

    const selectedService = findCheckoutShippingService(availableServices, body.selectedShippingServiceId);

    if (!selectedService) {
      await deleteSwellCheckoutCart(swellCart.id);
      console.warn('Checkout payment blocked because selected shipping service was not available.', {
        selectedShippingServiceId: body.selectedShippingServiceId,
        availableServiceIds: availableServices.map(service => service.id),
      });
      return NextResponse.json(
        {
          code: 'invalid_shipping_service',
          error: 'No valid shipping service was selected. Refresh shipping options and retry.',
        },
        { status: 400 }
      );
    }

    const ratedCart = await updateSwellCheckoutCart(swellCart.id, {
      shipping: {
        ...swellShipping,
        service: selectedService.source === 'swell' ? selectedService.id : undefined,
        service_name: selectedService.name,
        price: Number(selectedService.price.amount || 0),
      },
      billing: {
        ...swellBilling,
        method: manualMethod,
      },
      coupon_code: body.discountCode,
    });

    const swellOrder = await convertSwellCartToOrder(ratedCart.id);
    swellOrderId = swellOrder.id;

    const couponDiscountTotal = Number(swellOrder.discount_total ?? swellOrder.item_discount ?? 0);
    const orderTaxTotal = Number(swellOrder.tax_total || 0);
    const orderShipmentTotal = Number(swellOrder.shipment_total || selectedService.price.amount || 0);
    const appliedDiscountCode = body.discountCode || swellOrder.coupon_code;
    const pricing = calculateCheckoutPricing({
      currencyCode: swellOrder.currency || currencyCode,
      subtotalAmount,
      couponDiscountAmount: couponDiscountTotal,
      couponCode: appliedDiscountCode,
      shippingAmount: orderShipmentTotal,
      taxAmount: orderTaxTotal,
      paymentMethod: body.paymentMethod,
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
      paymentMethod: body.paymentMethod,
    });

    if (!orderTotal || orderTotal <= 0 || !Number.isFinite(orderTotal)) {
      console.error('[CREATE-PAYMENT] EXIT:zero_total grand_total:', swellOrder.grand_total);
      return NextResponse.json(
        { code: 'invalid_order_total', error: 'Order total must be greater than zero.' },
        { status: 400 }
      );
    }

    const orderId = createOrderId();
    const accessKey = createAccessKey();
    const shieldClimbCallbackToken = createShieldClimbCallbackToken();

    // Fetch auth session once for both card/crypto paths (non-blocking on failure)
    const authSession = await auth.api.getSession({ headers: await headers() }).catch(() => null);
    const userId = authSession?.user?.id ?? null;

    // ── Card path: ShieldClimb ──
    if (body.paymentMethod === 'card') {
      const publicCallbackOrigin = getPublicCallbackOrigin(requestUrl);

      if (!publicCallbackOrigin) {
        await deleteSwellCheckoutCart(swellCart.id);
        return NextResponse.json(
          {
            code: 'shieldclimb_callback_unavailable',
            error:
              'Card checkout requires a public callback URL. Set `SHIELDCLIMB_CALLBACK_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, or `SITE_URL` to your public app origin before using ShieldClimb from local development.',
          },
          { status: 400 }
        );
      }

      const initializingOrder = await saveCheckoutOrder({
        ...buildShieldClimbOrderRecord({
          orderId,
          accessKey,
          storefrontCartId: fallbackCartId,
          userId,
          swellAccountId: account.id,
          swellCartId: ratedCart.id,
          swellOrderId: swellOrder.id,
          swellOrderNumber: swellOrder.number,
          currencyCode: swellOrder.currency || currencyCode,
          lines,
          shippingAddress: body.shippingAddress,
          shippingService: mapShippingService(selectedService, swellOrder.currency || currencyCode),
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
        }),
        affiliate: affiliateData,
      });
      checkoutOrderId = initializingOrder.orderId;

      const wallet = await createAndStoreWallet(orderId);

      const callbackUrl = new URL('/api/shieldclimb/callback', publicCallbackOrigin);
      callbackUrl.searchParams.set('orderId', orderId);
      callbackUrl.searchParams.set('callbackToken', shieldClimbCallbackToken);

      const scWallet = await createWalletForOrder({
        callbackUrl: callbackUrl.toString(),
      });

      await updateWalletShieldClimbData(wallet.id, {
        addressIn: scWallet.address_in,
        polygonAddressIn: scWallet.polygon_address_in,
        ipnToken: scWallet.ipn_token,
      });

      // Convert to USD if currency is CAD (ShieldClimb card providers require USD)
      let paymentAmount = orderTotal;
      if (fiatCurrency === 'cad') {
        const converted = await convertToUsd({ amount: orderTotal, fromCurrency: 'CAD' });
        paymentAmount = Number(converted.value_coin);
      }

      const redirectUrl = buildShieldClimbPaymentUrl({
        addressIn: scWallet.address_in,
        amount: paymentAmount,
        email: body.shippingAddress.email,
        currency: fiatCurrency === 'cad' ? 'USD' : fiatCurrency.toUpperCase(),
      });

      await updateSwellOrder(swellOrder.id, {
        billing: {
          ...(swellOrder.billing || {}),
          method: manualMethod,
          intent: {
            provider: 'shieldclimb',
            wallet_id: wallet.id,
            status: 'unpaid',
          },
        },
        metadata: {
          ...(swellOrder.metadata || {}),
          checkout_reference: orderId,
          coupon_code: appliedDiscountCode || null,
          pricing: pricingMetadata,
          shieldclimb: {
            wallet_id: wallet.id,
            status: 'unpaid',
          },
          affiliate: resolvedAffiliate
            ? {
                id: resolvedAffiliate.id,
                code: resolvedAffiliate.code,
                commissionRate:
                  commissionSnapshot?.effectiveRate ||
                  resolvedAffiliate.commissionRate,
                commissionRateAtPurchase:
                  commissionSnapshot?.effectiveRate ||
                  resolvedAffiliate.commissionRate,
                commissionTierAtPurchase: commissionSnapshot
                  ? commissionSnapshot.hasOverride
                    ? `${commissionSnapshot.tierLabel} override`
                    : commissionSnapshot.tierLabel
                  : null,
                commissionMonthKey:
                  commissionSnapshot?.monthKey ?? getCommissionMonthKey(new Date()),
                discountCode: resolvedAffiliate.discountCode,
                discountPercentAtPurchase: resolvedAffiliate.discountPercent,
                source: affiliateSource,
                paymentProvider: 'shieldclimb',
                status: 'pending',
              }
            : null,
        },
      });

      const checkoutOrder = await saveCheckoutOrder({
        ...buildShieldClimbOrderRecord({
          orderId,
          accessKey,
          storefrontCartId: fallbackCartId,
          userId,
          swellAccountId: account.id,
          swellCartId: ratedCart.id,
          swellOrderId: swellOrder.id,
          swellOrderNumber: swellOrder.number,
          currencyCode: swellOrder.currency || currencyCode,
          lines,
          shippingAddress: body.shippingAddress,
          shippingService: mapShippingService(selectedService, swellOrder.currency || currencyCode),
          orderSubtotal: subtotalAmount,
          orderDiscountTotal,
          discountCode: appliedDiscountCode,
          discounts: pricing.discounts,
          orderTaxTotal,
          orderGrandTotal: orderTotal,
          orderShipmentTotal,
          walletId: wallet.id,
          addressIn: scWallet.address_in,
          polygonAddressIn: scWallet.polygon_address_in,
          ipnToken: scWallet.ipn_token,
          callbackToken: shieldClimbCallbackToken,
          redirectUrl,
          paymentStatus: 'unpaid',
        }),
        affiliate: affiliateData,
      });
      checkoutOrderId = checkoutOrder.orderId;

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

      sendCheckoutPaymentInitiatedEvent({
        ...initiationTelemetry,
        customerEmail: body.shippingAddress.email,
      }).catch(() => {});
      trackCheckoutPaymentInitiated(initiationTelemetry).catch(() => {});

      return NextResponse.json(
        {
          accessKey,
          redirectUrl,
          order: toPublicCheckoutOrder(checkoutOrder) satisfies CheckoutOrderPublic,
        },
        { status: 201 }
      );
    }

    // ── Crypto path: NOWPayments (unchanged) ──
    const [estimate, minimum] = await Promise.all([
      getNowPaymentsEstimate({
        amount: orderTotal,
        currencyFrom: fiatCurrency,
        currencyTo: paymentCurrency,
      }),
      getNowPaymentsMinimumAmount({
        currencyFrom: paymentCurrency,
        fiatEquivalent: fiatCurrency,
        isFixedRate: true,
        isFeePaidByUser: false,
      }),
    ]);

    if (estimate.estimated_amount < minimum.min_amount) {
      console.warn('Checkout payment blocked by NOWPayments minimum.', {
        paymentCurrency,
        estimatedAmount: estimate.estimated_amount,
        minimumAmount: minimum.min_amount,
        orderTotal,
        fiatCurrency,
      });
      return NextResponse.json(
        {
          code: 'nowpayments_minimum_not_met',
          error: `The order total is below NOWPayments minimum for ${paymentCurrency.toUpperCase()}. Choose another currency or use a different shipping/payment configuration.`,
        },
        { status: 400 }
      );
    }

    const payment = await createNowPaymentsPayment({
      price_amount: Number(orderTotal.toFixed(2)),
      price_currency: fiatCurrency,
      pay_currency: paymentCurrency,
      ipn_callback_url: ipnCallbackEnabled ? new URL('/api/nowpayments/ipn', requestUrl.origin).toString() : undefined,
      order_id: orderId,
      order_description: buildOrderDescription(lines),
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    });

    await updateSwellOrder(swellOrder.id, {
      billing: {
        ...(swellOrder.billing || {}),
        method: manualMethod,
        intent: {
          provider: 'nowpayments',
          payment_id: payment.payment_id,
          payment_status: payment.payment_status,
          payment_currency: paymentCurrency,
          source_wallet_address: body.sourceWalletAddress || null,
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
          source_wallet_address: body.sourceWalletAddress || null,
          pay_amount: payment.pay_amount,
        },
        affiliate: resolvedAffiliate
          ? {
              id: resolvedAffiliate.id,
              code: resolvedAffiliate.code,
              commissionRate:
                commissionSnapshot?.effectiveRate ||
                resolvedAffiliate.commissionRate,
              commissionRateAtPurchase:
                commissionSnapshot?.effectiveRate ||
                resolvedAffiliate.commissionRate,
              commissionTierAtPurchase: commissionSnapshot
                ? commissionSnapshot.hasOverride
                  ? `${commissionSnapshot.tierLabel} override`
                  : commissionSnapshot.tierLabel
                : null,
              commissionMonthKey:
                commissionSnapshot?.monthKey ?? getCommissionMonthKey(new Date()),
              discountCode: resolvedAffiliate.discountCode,
              discountPercentAtPurchase: resolvedAffiliate.discountPercent,
              commissionOwed: (
                orderTotal *
                Number(
                  commissionSnapshot?.effectiveRate ||
                    resolvedAffiliate.commissionRate,
                )
              ).toFixed(2),
              currencyCode: fiatCurrency.toUpperCase(),
              source: affiliateSource,
              paymentProvider: 'nowpayments',
              status: 'pending',
            }
          : null,
      },
    });

    const checkoutOrder = await saveCheckoutOrder({
      ...buildNowPaymentsOrderRecord({
        orderId,
        accessKey,
        storefrontCartId: fallbackCartId,
        userId,
        swellAccountId: account.id,
        swellCartId: ratedCart.id,
        swellOrderId: swellOrder.id,
        swellOrderNumber: swellOrder.number,
        currencyCode: swellOrder.currency || currencyCode,
        lines,
        shippingAddress: body.shippingAddress,
        shippingService: mapShippingService(selectedService, swellOrder.currency || currencyCode),
        orderSubtotal: subtotalAmount,
        orderDiscountTotal,
        discountCode: appliedDiscountCode,
        discounts: pricing.discounts,
        orderTaxTotal,
        orderGrandTotal: orderTotal,
        orderShipmentTotal,
        paymentCurrency,
        sourceWalletAddress: body.sourceWalletAddress,
        payment,
        ipnCallbackEnabled,
      }),
      affiliate: affiliateData,
    });
    checkoutOrderId = checkoutOrder.orderId;

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

    sendCheckoutPaymentInitiatedEvent({
      ...initiationTelemetry,
      customerEmail: body.shippingAddress.email,
    }).catch(() => {});
    trackCheckoutPaymentInitiated(initiationTelemetry).catch(() => {});

    return NextResponse.json(
      {
        accessKey,
        order: toPublicCheckoutOrder(checkoutOrder) satisfies CheckoutOrderPublic,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[CREATE-PAYMENT] EXIT:zod_error', JSON.stringify(error.issues, null, 2));
      return NextResponse.json(
        { code: 'invalid_checkout_payload', error: 'Please complete every required checkout field.' },
        { status: 400 }
      );
    }

    if (error instanceof Error && /coupon|discount|promotion/i.test(error.message)) {
      console.error('[CREATE-PAYMENT] EXIT:discount_error', error.message);
      return NextResponse.json(
        { code: 'invalid_discount_code', error: 'That discount code is invalid or has expired.' },
        { status: 400 }
      );
    }

    const reason = error instanceof Error ? error.message : 'Unknown payment setup error.';

    if (swellOrderId) {
      await cancelSwellOrder(swellOrderId, reason);
    }

    if (checkoutOrderId) {
      await updateCheckoutOrder(checkoutOrderId, current => {
        if (isTerminalPaymentStatus(current.payment.status)) {
          return current;
        }

        return markCheckoutOrderSetupFailed(current, reason);
      });
    }

    console.error('Unable to create payment:', error);
    return NextResponse.json(
      {
        error: 'Unable to create the payment right now. Please try again or contact support.',
      },
      { status: 500 }
    );
  }
}
