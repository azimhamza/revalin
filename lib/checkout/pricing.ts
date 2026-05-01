import type { CheckoutAppliedDiscount } from '@/lib/checkout/types';
import type { Money } from '@/lib/swell/types';

type MoneyInput = string | number | null | undefined;
type PaymentMethod = 'card' | 'crypto' | 'interac';

export const DIRECT_CRYPTO_DISCOUNT_RATE = 0.05;
export const DIRECT_CRYPTO_DISCOUNT_PERCENT = DIRECT_CRYPTO_DISCOUNT_RATE * 100;
export const DIRECT_CRYPTO_DISCOUNT_LABEL = `Direct Crypto (${DIRECT_CRYPTO_DISCOUNT_PERCENT}% off)`;

function toNumber(value: MoneyInput) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
      label: args.discountCode ? `Discount (${args.discountCode})` : 'Discount',
      code: args.discountCode || undefined,
      amount: toMoney(legacyDiscountAmount, args.currencyCode),
    },
  ] satisfies CheckoutAppliedDiscount[];
}

export function calculateCheckoutPricing(args: {
  currencyCode: string;
  subtotalAmount: MoneyInput;
  couponDiscountAmount?: MoneyInput;
  couponCode?: string | null;
  shippingAmount?: MoneyInput;
  taxAmount?: MoneyInput;
  landedCostAmount?: MoneyInput;
  paymentMethod: PaymentMethod;
}) {
  const subtotalValue = roundCurrency(Math.max(0, toNumber(args.subtotalAmount)));
  const shippingValue = roundCurrency(Math.max(0, toNumber(args.shippingAmount)));
  const taxValue = roundCurrency(Math.max(0, toNumber(args.taxAmount)));
  const landedCostValue = roundCurrency(Math.max(0, toNumber(args.landedCostAmount)));
  const couponDiscountValue = roundCurrency(Math.max(0, toNumber(args.couponDiscountAmount)));
  const totalBeforeCryptoDiscount = roundCurrency(
    Math.max(0, subtotalValue - couponDiscountValue + shippingValue + taxValue + landedCostValue)
  );
  const cryptoDiscountValue =
    args.paymentMethod === 'crypto'
      ? roundCurrency(totalBeforeCryptoDiscount * DIRECT_CRYPTO_DISCOUNT_RATE)
      : 0;

  const discounts: CheckoutAppliedDiscount[] = [];

  if (couponDiscountValue > 0) {
    discounts.push({
      kind: 'coupon',
      label: args.couponCode ? `Discount (${args.couponCode})` : 'Discount',
      code: args.couponCode || undefined,
      amount: toMoney(couponDiscountValue, args.currencyCode),
    });
  }

  if (cryptoDiscountValue > 0) {
    discounts.push({
      kind: 'crypto',
      label: DIRECT_CRYPTO_DISCOUNT_LABEL,
      amount: toMoney(cryptoDiscountValue, args.currencyCode),
    });
  }

  const discountTotalValue = roundCurrency(couponDiscountValue + cryptoDiscountValue);
  const totalValue = roundCurrency(
    Math.max(0, subtotalValue - discountTotalValue + shippingValue + taxValue + landedCostValue)
  );

  return {
    subtotalValue,
    shippingValue,
    taxValue,
    landedCostValue,
    couponDiscountValue,
    cryptoDiscountValue,
    discountTotalValue,
    totalValue,
    subtotalAmount: toMoney(subtotalValue, args.currencyCode),
    shippingAmount: toMoney(shippingValue, args.currencyCode),
    taxAmount: toMoney(taxValue, args.currencyCode),
    landedCostAmount: toMoney(landedCostValue, args.currencyCode),
    discountAmount: toMoney(discountTotalValue, args.currencyCode),
    totalAmount: toMoney(totalValue, args.currencyCode),
    cryptoDiscountAmount:
      cryptoDiscountValue > 0 ? toMoney(cryptoDiscountValue, args.currencyCode) : undefined,
    discounts,
  };
}

export function buildCheckoutPricingMetadata(args: {
  currencyCode: string;
  subtotalAmount: MoneyInput;
  shippingAmount?: MoneyInput;
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
    tax: toMoney(args.taxAmount, args.currencyCode),
    landedCost: toMoney(args.landedCostAmount, args.currencyCode),
    total: toMoney(args.totalAmount, args.currencyCode),
    discounts: discounts.map(discount => ({
      kind: discount.kind,
      label: discount.label,
      code: discount.code || null,
      amount: discount.amount,
    })),
  };
}
