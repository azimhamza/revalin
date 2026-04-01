import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { ACCOUNT_ORDER_HISTORY_STATUSES } from '@/lib/checkout/constants';

function buildAccountOrderStatusWhereClause() {
  return or(
    ...ACCOUNT_ORDER_HISTORY_STATUSES.map(status => sql`lower(${checkoutOrders.payment}->>'status') = ${status}`)
  );
}

export async function linkOrdersToUser(userId: string, email: string) {
  const result = await db
    .update(checkoutOrders)
    .set({ userId })
    .where(
      and(
        isNull(checkoutOrders.userId),
        sql`lower(${checkoutOrders.shippingAddress}->>'email') = lower(${email})`,
        buildAccountOrderStatusWhereClause()
      )
    );

  return result;
}
