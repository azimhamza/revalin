import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { ACCOUNT_ORDER_HISTORY_STATUSES } from '@/lib/checkout/constants';

function buildAccountOrderStatusWhereClause() {
  return or(
    ...ACCOUNT_ORDER_HISTORY_STATUSES.map((status) =>
      checkoutOrders.paymentStatus
        ? eq(checkoutOrders.paymentStatus, status)
        : sql`lower(${checkoutOrders.payment}->>'status') = ${status}`,
    ),
  );
}

export async function linkOrdersToUser(userId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const result = await db
    .update(checkoutOrders)
    .set({ userId })
    .where(
      and(
        isNull(checkoutOrders.userId),
        checkoutOrders.email
          ? eq(checkoutOrders.email, normalizedEmail)
          : sql`lower(${checkoutOrders.shippingAddress}->>'email') = lower(${normalizedEmail})`,
        buildAccountOrderStatusWhereClause()
      )
    );

  return result;
}
