import { sql, type SQLWrapper } from "drizzle-orm";

const NUMERIC_TEXT_PATTERN = "^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$";

function cleanMoneyText(value: SQLWrapper) {
  return sql<string>`nullif(regexp_replace(trim(coalesce(${value}, '')), '[^0-9.+-]', '', 'g'), '')`;
}

export function nullablePayoutAmountSql(value: SQLWrapper) {
  const cleaned = cleanMoneyText(value);

  return sql<string | null>`case when ${cleaned} ~ ${NUMERIC_TEXT_PATTERN} then ${cleaned}::numeric else null end`;
}

export function payoutAmountSql(
  preferredValue: SQLWrapper,
  fallbackValue: SQLWrapper,
) {
  return sql<string>`coalesce(${nullablePayoutAmountSql(preferredValue)}, ${nullablePayoutAmountSql(fallbackValue)}, 0)`;
}

export function sumPayoutAmountSql(
  preferredValue: SQLWrapper,
  fallbackValue: SQLWrapper,
) {
  return sql<string>`coalesce(sum(${payoutAmountSql(preferredValue, fallbackValue)}), 0)`;
}
