export const CARD_CHECKOUT_MINIMUM_USD = 15;

const DISABLED_CARD_DEBIT_ENV_VALUES = new Set([
  '0',
  'false',
  'no',
  'off',
  'disabled',
]);

export function isCardDebitCheckoutEnabled() {
  const configured =
    (
      process.env.CHECKOUT_CARD_DEBIT_ENABLED ??
      process.env.NEXT_PUBLIC_CHECKOUT_CARD_DEBIT_ENABLED
    )
      ?.trim()
      .toLowerCase();

  if (!configured) {
    return true;
  }

  return !DISABLED_CARD_DEBIT_ENV_VALUES.has(configured);
}

export function getCardDebitCheckoutUnavailableMessage() {
  return '';
}

export function isCardCheckoutMinimumMet(amountUsd: string | number) {
  const normalized = Number(amountUsd || 0);
  return Number.isFinite(normalized) && normalized >= CARD_CHECKOUT_MINIMUM_USD;
}

export function getCardCheckoutMinimumMessage() {
  return `Debit and credit card checkout is available for orders of $${CARD_CHECKOUT_MINIMUM_USD.toFixed(
    2,
  )} USD or more.`;
}

export function isSquareFallbackCheckoutEnabled() {
  const configured =
    (
      process.env.CHECKOUT_SQUARE_FALLBACK_ENABLED ??
      process.env.NEXT_PUBLIC_CHECKOUT_SQUARE_FALLBACK_ENABLED
    )
      ?.trim()
      .toLowerCase();

  if (!configured) {
    return false;
  }

  return !DISABLED_CARD_DEBIT_ENV_VALUES.has(configured);
}
