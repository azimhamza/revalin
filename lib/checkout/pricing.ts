import type { CheckoutAppliedDiscount } from '@/lib/checkout/types';
import type { Money } from '@/lib/swell/types';

type MoneyInput = string | number | null | undefined;
type PaymentMethod = 'card' | 'crypto' | 'interac' | 'square';

export const DIRECT_PAYMENT_DISCOUNT_RATE = 0.05;
export const DIRECT_PAYMENT_DISCOUNT_PERCENT = DIRECT_PAYMENT_DISCOUNT_RATE * 100;
export const DIRECT_CRYPTO_DISCOUNT_RATE = DIRECT_PAYMENT_DISCOUNT_RATE;
export const DIRECT_CRYPTO_DISCOUNT_PERCENT = DIRECT_PAYMENT_DISCOUNT_PERCENT;
export const DIRECT_CRYPTO_DISCOUNT_LABEL = `Direct Crypto (${DIRECT_PAYMENT_DISCOUNT_PERCENT}% off)`;
export const DIRECT_INTERAC_DISCOUNT_LABEL = `Interac e-Transfer (${DIRECT_PAYMENT_DISCOUNT_PERCENT}% off)`;

function toNumber(value: MoneyInput) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDiscountRate(rate: number) {
  const percent = rate * 100;
  const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;

  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function getCouponDiscountLabel(code?: string | null, rate?: number) {
  const normalizedRate = Math.max(0, toNumber(rate));

  if (normalizedRate > 0) {
    const percentLabel = `${formatDiscountRate(normalizedRate)}% off`;
    return code ? `${percentLabel} (${code})` : percentLabel;
  }

  return code ? `Discount (${code})` : 'Discount';
}

export function toMoney(value: MoneyInput, currencyCode: string): Money {
  const normalized = roundCurrency(Math.max(0, toNumber(value)));

  return {
    amount: normalized.toFixed(2),
    currencyCode,
  };
}

export function getCheckoutDiscounts(args: {
  currencyCode: string;
  discounts?: CheckoutAppliedDiscount[] | null;
  discountAmount?: MoneyInput;
  discountCode?: string | null;
}) {
  if (Array.isArray(args.discounts) && args.discounts.length > 0) {
    return args.discounts.filter(discount => toNumber(discount.amount?.amount) > 0);
  }

  const legacyDiscountAmount = roundCurrency(Math.max(0, toNumber(args.discountAmount)));
  if (legacyDiscountAmount <= 0) {
    return [] satisfies CheckoutAppliedDiscount[];
  }

  return [
    {
      kind: args.discountCode ? 'coupon' : 'manual',
      label: getCouponDiscountLabel(args.discountCode),
      code: args.discountCode || undefined,
      amount: toMoney(legacyDiscountAmount, args.currencyCode),
    },
  ] satisfies CheckoutAppliedDiscount[];
}

export function isDirectPaymentDiscountMethod(
  paymentMethod?: PaymentMethod | null,
) {
  return paymentMethod === 'crypto' || paymentMethod === 'interac';
}

export function isCheckoutPaymentMethodDiscount(
  discount: CheckoutAppliedDiscount,
) {
  return discount.kind === 'crypto' || discount.kind === 'interac';
}

function getDirectPaymentDiscountKind(
  paymentMethod: PaymentMethod,
): Extract<CheckoutAppliedDiscount['kind'], 'crypto' | 'interac'> | null {
  if (paymentMethod === 'crypto') return 'crypto';
  if (paymentMethod === 'interac') return 'interac';
  return null;
}

function getDirectPaymentDiscountLabel(
  paymentMethod: PaymentMethod,
) {
  if (paymentMethod === 'crypto') return DIRECT_CRYPTO_DISCOUNT_LABEL;
  if (paymentMethod === 'interac') return DIRECT_INTERAC_DISCOUNT_LABEL;
  return 'Payment method discount';
}

export function calculateCheckoutPricing(args: {
  currencyCode: string;
  subtotalAmount: MoneyInput;
  couponDiscountAmount?: MoneyInput;
  couponDiscountRate?: MoneyInput;
  couponCode?: string | null;
  shippingAmount?: MoneyInput;
  shipmentProtectionAmount?: MoneyInput;
  taxAmount?: MoneyInput;
  landedCostAmount?: MoneyInput;
  paymentMethod: PaymentMethod;
}) {
  const subtotalValue = roundCurrency(Math.max(0, toNumber(args.subtotalAmount)));
  const shippingValue = roundCurrency(Math.max(0, toNumber(args.shippingAmount)));
  const shipmentProtectionValue = roundCurrency(Math.max(0, toNumber(args.shipmentProtectionAmount)));
  const taxValue = roundCurrency(Math.max(0, toNumber(args.taxAmount)));
  const landedCostValue = roundCurrency(Math.max(0, toNumber(args.landedCostAmount)));
  const couponDiscountRate = Math.max(0, toNumber(args.couponDiscountRate));
  const couponDiscountBaseValue = roundCurrency(subtotalValue + shippingValue + shipmentProtectionValue);
  const fixedCouponDiscountValue = roundCurrency(Math.max(0, toNumber(args.couponDiscountAmount)));
  const percentageCouponDiscountValue =
    couponDiscountRate > 0
      ? roundCurrency(couponDiscountBaseValue * couponDiscountRate)
      : 0;
  const couponDiscountValue = Math.min(
    couponDiscountBaseValue,
    roundCurrency(Math.max(fixedCouponDiscountValue, percentageCouponDiscountValue)),
  );
  const totalBeforePaymentMethodDiscount = roundCurrency(
    Math.max(0, subtotalValue - couponDiscountValue + shippingValue + shipmentProtectionValue + taxValue + landedCostValue)
  );
  const directPaymentDiscountKind = getDirectPaymentDiscountKind(args.paymentMethod);
  const paymentMethodDiscountValue =
    directPaymentDiscountKind
      ? roundCurrency(totalBeforePaymentMethodDiscount * DIRECT_PAYMENT_DISCOUNT_RATE)
      : 0;
  const cryptoDiscountValue =
    args.paymentMethod === 'crypto' ? paymentMethodDiscountValue : 0;
  const interacDiscountValue =
    args.paymentMethod === 'interac' ? paymentMethodDiscountValue : 0;

  const discounts: CheckoutAppliedDiscount[] = [];

  if (couponDiscountValue > 0) {
    discounts.push({
      kind: 'coupon',
      label: getCouponDiscountLabel(args.couponCode, couponDiscountRate),
      code: args.couponCode || undefined,
      rate: couponDiscountRate > 0 ? couponDiscountRate : undefined,
      amount: toMoney(couponDiscountValue, args.currencyCode),
    });
  }

  if (directPaymentDiscountKind && paymentMethodDiscountValue > 0) {
    discounts.push({
      kind: directPaymentDiscountKind,
      label: getDirectPaymentDiscountLabel(args.paymentMethod),
      amount: toMoney(paymentMethodDiscountValue, args.currencyCode),
    });
  }

  const discountTotalValue = roundCurrency(couponDiscountValue + paymentMethodDiscountValue);
  const totalValue = roundCurrency(
    Math.max(0, subtotalValue - discountTotalValue + shippingValue + shipmentProtectionValue + taxValue + landedCostValue)
  );

  return {
    subtotalValue,
    shippingValue,
    shipmentProtectionValue,
    taxValue,
    landedCostValue,
    couponDiscountValue,
    cryptoDiscountValue,
    interacDiscountValue,
    paymentMethodDiscountValue,
    discountTotalValue,
    totalValue,
    subtotalAmount: toMoney(subtotalValue, args.currencyCode),
    shippingAmount: toMoney(shippingValue, args.currencyCode),
    shipmentProtectionAmount: toMoney(shipmentProtectionValue, args.currencyCode),
    taxAmount: toMoney(taxValue, args.currencyCode),
    landedCostAmount: toMoney(landedCostValue, args.currencyCode),
    discountAmount: toMoney(discountTotalValue, args.currencyCode),
    totalAmount: toMoney(totalValue, args.currencyCode),
    cryptoDiscountAmount:
      cryptoDiscountValue > 0 ? toMoney(cryptoDiscountValue, args.currencyCode) : undefined,
    interacDiscountAmount:
      interacDiscountValue > 0 ? toMoney(interacDiscountValue, args.currencyCode) : undefined,
    paymentMethodDiscountAmount:
      paymentMethodDiscountValue > 0
        ? toMoney(paymentMethodDiscountValue, args.currencyCode)
        : undefined,
    discounts,
  };
}

export function buildCheckoutPricingMetadata(args: {
  currencyCode: string;
  subtotalAmount: MoneyInput;
  shippingAmount?: MoneyInput;
  shipmentProtectionAmount?: MoneyInput;
  taxAmount?: MoneyInput;
  landedCostAmount?: MoneyInput;
  totalAmount: MoneyInput;
  discounts?: CheckoutAppliedDiscount[] | null;
  discountAmount?: MoneyInput;
  discountCode?: string | null;
  paymentMethod?: PaymentMethod;
}) {
  const discounts = getCheckoutDiscounts({
    currencyCode: args.currencyCode,
    discounts: args.discounts,
    discountAmount: args.discountAmount,
    discountCode: args.discountCode,
  });

  return {
    currencyCode: args.currencyCode,
    paymentMethod: args.paymentMethod,
    subtotal: toMoney(args.subtotalAmount, args.currencyCode),
    shipping: toMoney(args.shippingAmount, args.currencyCode),
    shipmentProtection: toMoney(args.shipmentProtectionAmount, args.currencyCode),
    tax: toMoney(args.taxAmount, args.currencyCode),
    landedCost: toMoney(args.landedCostAmount, args.currencyCode),
    total: toMoney(args.totalAmount, args.currencyCode),
    discounts: discounts.map(discount => ({
      kind: discount.kind,
      label: discount.label,
      code: discount.code || null,
      rate: discount.rate || null,
      amount: discount.amount,
    })),
  };
}
