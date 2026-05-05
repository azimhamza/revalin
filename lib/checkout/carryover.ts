import type {
  CheckoutOrderRecord,
  CheckoutPaymentCarryoverPublicData,
  CheckoutShippingAddress,
} from './types.ts';
import { isNowPaymentsPayment, isShieldClimbPayment } from './types.ts';

type CheckoutCarryoverComparable = {
  currencyCode: string;
  cartLinesSignature: string;
  shippingAddressSignature: string;
  shippingServiceId: string;
  shipmentProtection: boolean;
  discountCode: string;
};

type BuildCarryoverComparableFromInputArgs = {
  currencyCode: string;
  cartLines: Array<{
    merchandiseId: string;
    quantity: number;
  }>;
  shippingAddress: CheckoutShippingAddress;
  shippingServiceId?: string | null;
  shipmentProtection?: boolean;
  discountCode?: string | null;
};

type CheckoutCarryoverContext = {
  comparable: CheckoutCarryoverComparable;
  exactOrders: CheckoutOrderRecord[];
  chainOrders: CheckoutOrderRecord[];
  latestExactOrder: CheckoutOrderRecord | null;
  latestSuccessfulOrder: CheckoutOrderRecord | null;
  creditedAmount: number;
  remainingAmount: number;
  carryoverRootOrderId: string | null;
};

const NON_CREDITED_PAYMENT_STATUSES = new Set([
  'failed',
  'expired',
  'cancelled',
  'replaced',
  'refunded',
]);

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['finished', 'paid']);

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

function normalizePaymentStatus(status?: string | null) {
  return normalizeComparableValue(status).toLowerCase().replace(/-/g, '_');
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

function parseFiniteAmount(value?: string | number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  return Math.max(value, 0).toFixed(2);
}

function getOrderTotalAmount(order: CheckoutOrderRecord) {
  return parseFiniteAmount(order.totals.totalAmount.amount);
}

function getStoredAmountPaidToDate(order: CheckoutOrderRecord) {
  return parseFiniteAmount(order.payment.amountPaidToDate);
}

export function buildCarryoverComparableFromOrder(
  order: CheckoutOrderRecord,
): CheckoutCarryoverComparable {
  return {
    currencyCode: normalizeComparableValue(order.currencyCode).toUpperCase(),
    cartLinesSignature: buildComparableCartLinesSignature(
      order.lines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
    ),
    shippingAddressSignature: buildComparableShippingAddressSignature(
      order.shippingAddress,
    ),
    shippingServiceId: normalizeComparableValue(order.shippingService?.id),
    shipmentProtection: Boolean(order.totals.shipmentProtection),
    discountCode: normalizeComparableDiscountCode(order.totals.discountCode),
  };
}

export function buildCarryoverComparableFromFinalizeInput(
  args: BuildCarryoverComparableFromInputArgs,
): CheckoutCarryoverComparable {
  return {
    currencyCode: normalizeComparableValue(args.currencyCode).toUpperCase(),
    cartLinesSignature: buildComparableCartLinesSignature(args.cartLines),
    shippingAddressSignature: buildComparableShippingAddressSignature(
      args.shippingAddress,
    ),
    shippingServiceId: normalizeComparableValue(args.shippingServiceId),
    shipmentProtection: args.shipmentProtection === true,
    discountCode: normalizeComparableDiscountCode(args.discountCode),
  };
}

export function isSameCarryoverCheckout(
  left: CheckoutCarryoverComparable,
  right: CheckoutCarryoverComparable,
) {
  return (
    left.currencyCode === right.currencyCode &&
    left.cartLinesSignature === right.cartLinesSignature &&
    left.shippingAddressSignature === right.shippingAddressSignature &&
    left.shippingServiceId === right.shippingServiceId &&
    left.shipmentProtection === right.shipmentProtection &&
    left.discountCode === right.discountCode
  );
}

export function isSameCarryoverCheckoutOrder(
  left: CheckoutOrderRecord,
  right: CheckoutOrderRecord,
) {
  return isSameCarryoverCheckout(
    buildCarryoverComparableFromOrder(left),
    buildCarryoverComparableFromOrder(right),
  );
}

export function getCheckoutCarryoverRootOrderId(order: CheckoutOrderRecord) {
  const storedRoot = normalizeComparableValue(order.payment.carryoverRootOrderId);
  return storedRoot || order.orderId;
}

export function isSupersededCheckoutOrder(order: CheckoutOrderRecord) {
  return Boolean(normalizeComparableValue(order.payment.supersededByOrderId));
}

export function getCheckoutAttemptAmount(order: CheckoutOrderRecord) {
  const totalAmount = getOrderTotalAmount(order);
  const explicitAttemptAmount = parseFiniteAmount(order.payment.attemptAmount);
  if (explicitAttemptAmount > 0) {
    return Math.min(explicitAttemptAmount, totalAmount || explicitAttemptAmount);
  }

  const amountPaidToDate = getStoredAmountPaidToDate(order);
  const derivedAttemptAmount = totalAmount - amountPaidToDate;
  if (derivedAttemptAmount > 0) {
    return Math.min(derivedAttemptAmount, totalAmount || derivedAttemptAmount);
  }

  return totalAmount;
}

function getProportionalCreditedAmount(args: {
  attemptAmount: number;
  receivedAmount: number;
  expectedAmount: number;
}) {
  if (args.attemptAmount <= 0 || args.receivedAmount <= 0 || args.expectedAmount <= 0) {
    return 0;
  }

  return Math.min(
    args.attemptAmount,
    (args.receivedAmount / args.expectedAmount) * args.attemptAmount,
  );
}

export function getCheckoutCreditedAmount(order: CheckoutOrderRecord) {
  const normalizedStatus = normalizePaymentStatus(order.payment.status);
  if (NON_CREDITED_PAYMENT_STATUSES.has(normalizedStatus)) {
    return 0;
  }

  const attemptAmount = getCheckoutAttemptAmount(order);
  if (attemptAmount <= 0) {
    return 0;
  }

  if (SUCCESSFUL_PAYMENT_STATUSES.has(normalizedStatus)) {
    return attemptAmount;
  }

  if (normalizedStatus !== 'partially_paid') {
    return 0;
  }

  if (isShieldClimbPayment(order.payment)) {
    return getProportionalCreditedAmount({
      attemptAmount,
      receivedAmount: parseFiniteAmount(order.payment.valueCoinReceived),
      expectedAmount: parseFiniteAmount(order.payment.expectedValueCoin),
    });
  }

  if (isNowPaymentsPayment(order.payment)) {
    return getProportionalCreditedAmount({
      attemptAmount,
      receivedAmount: parseFiniteAmount(order.payment.amountReceived),
      expectedAmount: parseFiniteAmount(order.payment.payAmount),
    });
  }

  return 0;
}

export function buildCarryoverContext(args: {
  orders: CheckoutOrderRecord[];
  comparable: CheckoutCarryoverComparable;
  orderTotal: number;
}): CheckoutCarryoverContext {
  const exactOrders = args.orders.filter((order) =>
    isSameCarryoverCheckout(
      buildCarryoverComparableFromOrder(order),
      args.comparable,
    ),
  );

  if (exactOrders.length === 0) {
    return {
      comparable: args.comparable,
      exactOrders: [],
      chainOrders: [],
      latestExactOrder: null,
      latestSuccessfulOrder: null,
      creditedAmount: 0,
      remainingAmount: Math.max(args.orderTotal, 0),
      carryoverRootOrderId: null,
    };
  }

  const latestExactOrder = exactOrders[0]!;
  const carryoverRootOrderId = getCheckoutCarryoverRootOrderId(latestExactOrder);
  const chainOrders = exactOrders.filter((order) => {
    const rootOrderId = getCheckoutCarryoverRootOrderId(order);
    return rootOrderId === carryoverRootOrderId || order.orderId === carryoverRootOrderId;
  });

  const creditedAmount = Math.min(
    Math.max(args.orderTotal, 0),
    chainOrders.reduce(
      (total, order) => total + getCheckoutCreditedAmount(order),
      0,
    ),
  );

  return {
    comparable: args.comparable,
    exactOrders,
    chainOrders,
    latestExactOrder,
    latestSuccessfulOrder:
      chainOrders.find((order) =>
        SUCCESSFUL_PAYMENT_STATUSES.has(normalizePaymentStatus(order.payment.status)),
      ) || null,
    creditedAmount,
    remainingAmount: Math.max(args.orderTotal - creditedAmount, 0),
    carryoverRootOrderId,
  };
}

export function buildCheckoutCarryoverPublicData(args: {
  order: CheckoutOrderRecord;
  relatedOrders: CheckoutOrderRecord[];
  supersededByAccessKey?: string | null;
}): CheckoutPaymentCarryoverPublicData {
  const orderTotal = getOrderTotalAmount(args.order);
  const context = buildCarryoverContext({
    orders: args.relatedOrders,
    comparable: buildCarryoverComparableFromOrder(args.order),
    orderTotal,
  });

  return {
    amountPaidToDate: formatAmount(getStoredAmountPaidToDate(args.order)),
    attemptAmount: formatAmount(getCheckoutAttemptAmount(args.order)),
    carryoverRootOrderId: getCheckoutCarryoverRootOrderId(args.order),
    supersededByOrderId: normalizeComparableValue(args.order.payment.supersededByOrderId) || undefined,
    supersededByAccessKey:
      normalizeComparableValue(args.supersededByAccessKey) || undefined,
    cumulativePaidAmount: formatAmount(context.creditedAmount),
    remainingBalanceAmount: formatAmount(context.remainingAmount),
  };
}
