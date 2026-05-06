export const CARD_CHECKOUT_MINIMUM_USD = 15;

const DISABLED_CHECKOUT_ENV_VALUES = new Set([
  '0',
  'false',
  'no',
  'off',
  'disabled',
]);

function readBooleanEnv(names: string[], defaultValue: boolean) {
  for (const name of names) {
    const configured = process.env[name]?.trim().toLowerCase();
    if (!configured) continue;

    return !DISABLED_CHECKOUT_ENV_VALUES.has(configured);
  }

  return defaultValue;
}

export function isCardProcessingEnabled() {
  return readBooleanEnv(['CHECKOUT_CARD_PROCESSING_ENABLED'], true);
}

export function getCardProcessingUnavailableMessage() {
  return 'Card checkout is temporarily unavailable. Choose crypto or Interac e-Transfer.';
}

export function isCardSquareFallbackEnabled() {
  return readBooleanEnv(
    [
      'CHECKOUT_CARD_SQUARE_FALLBACK_ENABLED',
      // Temporary compatibility alias for the original Square fallback rollout.
      'CHECKOUT_SQUARE_FALLBACK_ENABLED',
    ],
    false,
  );
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
