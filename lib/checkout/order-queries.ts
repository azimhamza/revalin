import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { ACCOUNT_ORDER_HISTORY_STATUSES } from '@/lib/checkout/constants';

function buildAccountOrderStatusWhereClause() {
  return or(
    ...ACCOUNT_ORDER_HISTORY_STATUSES.map(status => sql`lower(${checkoutOrders.payment}->>'status') = ${status}`)
  );
}

export async function getOrdersForUser(userId: string) {
  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(
      and(
        eq(checkoutOrders.userId, userId),
        buildAccountOrderStatusWhereClause()
      )
    )
    .orderBy(desc(checkoutOrders.createdAt))
    .limit(50);

  return rows;
}
