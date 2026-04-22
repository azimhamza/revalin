export const CARD_CHECKOUT_MINIMUM_USD = 15;

export function isCardCheckoutMinimumMet(amountUsd: string | number) {
  const normalized = Number(amountUsd || 0);
  return Number.isFinite(normalized) && normalized >= CARD_CHECKOUT_MINIMUM_USD;
}

export function getCardCheckoutMinimumMessage() {
  return `Debit and credit card checkout is available for orders of $${CARD_CHECKOUT_MINIMUM_USD.toFixed(
    2,
  )} USD or more.`;
}
