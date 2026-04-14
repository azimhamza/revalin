const FALLBACK_BASELINE_RATE = 0.15;

export function trimNumericString(value: string) {
  return value.replace(/\.?0+$/, "") || "0";
}

export function formatRate(value: number) {
  return trimNumericString(value.toFixed(4));
}

export function formatAmount(value: number) {
  return value.toFixed(2);
}

export function parseRate(value: string | number | null | undefined) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  return Number.isFinite(numeric) ? numeric : FALLBACK_BASELINE_RATE;
}

export function parseAmount(value: string | number | null | undefined) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeCommissionRateInput(
  value: string | number | null | undefined,
) {
  const raw =
    typeof value === "string"
      ? value.trim()
      : value === null
        ? ""
        : `${value ?? ""}`;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Commission rate must be a number greater than 0.");
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  if (normalized > 1) {
    throw new Error("Commission rate cannot exceed 100%.");
  }

  const numeric = Number(normalized.toFixed(4));
  return {
    numeric,
    stored: formatRate(numeric),
    percentDisplay: trimNumericString((numeric * 100).toFixed(2)),
  };
}

export function formatUsdAmount(value: string | number) {
  const numeric = parseAmount(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
}

export { FALLBACK_BASELINE_RATE };
