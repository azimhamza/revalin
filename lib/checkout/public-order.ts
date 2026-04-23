import {
  buildCheckoutCarryoverPublicData,
  isSameCarryoverCheckoutOrder,
} from './carryover';
import { findCheckoutOrdersByCartId } from './order-store';
import type { CheckoutOrderPublic, CheckoutOrderRecord } from './types';
import { toPublicCheckoutOrder } from './types';

export async function buildPublicCheckoutOrder(
  order: CheckoutOrderRecord,
): Promise<CheckoutOrderPublic> {
  const relatedOrders = order.cartId
    ? await findCheckoutOrdersByCartId(order.cartId)
    : [order];

  const supersededByOrderId = order.payment.supersededByOrderId?.trim();
  const supersededByOrder =
    supersededByOrderId
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
