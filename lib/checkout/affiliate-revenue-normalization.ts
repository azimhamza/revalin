import { formatAmount } from "./affiliate-math.ts";

type RevenueConversionResult = {
  value_coin: string;
};

export async function normalizeRevenueToUsd(args: {
  amount: number;
  currencyCode: string;
  convertCurrency?: (args: {
    amount: number;
    fromCurrency: string;
  }) => Promise<RevenueConversionResult>;
}) {
  const currencyCode = args.currencyCode.trim().toUpperCase();

  if (currencyCode === "USD") {
    return {
      normalizedOrderTotal: formatAmount(args.amount),
      payoutCurrencyCode: "USD",
    };
  }

  if (currencyCode === "CAD" && args.convertCurrency) {
    const converted = await args.convertCurrency({
      amount: args.amount,
      fromCurrency: "CAD",
    });

    return {
      normalizedOrderTotal: formatAmount(Number(converted.value_coin)),
      payoutCurrencyCode: "USD",
    };
  }

  throw new Error(
    `Unable to normalize affiliate revenue for currency ${currencyCode}.`,
  );
}
