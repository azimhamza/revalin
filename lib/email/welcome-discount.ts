import crypto from 'node:crypto';

const DEFAULT_WELCOME_DISCOUNT_CODE_PREFIX = 'W10';
const LEGACY_WELCOME_DISCOUNT_CODE_PREFIX = 'WELCOME10';
const DEFAULT_WELCOME_DISCOUNT_USED_PROPERTY_KEY = 'initCodeUsed';
const DEFAULT_WELCOME_DISCOUNT_CODE_PROPERTY_KEY = 'initCode';
const WELCOME_DISCOUNT_SUFFIX_PATTERN = /^[A-Z0-9]{6,8}$/;
export const WELCOME_DISCOUNT_PERCENT = 10;
export const WELCOME_DISCOUNT_WINDOW_HOURS = 72;

function normalizeWelcomeDiscountCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getWelcomeDiscountCodePrefixes() {
  const configured = process.env.WELCOME_DISCOUNT_CODE_PREFIX?.trim();
  const prefixes = [
    configured,
    DEFAULT_WELCOME_DISCOUNT_CODE_PREFIX,
    LEGACY_WELCOME_DISCOUNT_CODE_PREFIX,
  ]
    .map((prefix) => (prefix ? normalizeWelcomeDiscountCode(prefix) : ''))
    .filter(Boolean);

  return Array.from(new Set(prefixes));
}

function getWelcomeDiscountCodeCreationPrefix() {
  return normalizeWelcomeDiscountCode(
    process.env.WELCOME_DISCOUNT_CODE_PREFIX?.trim() ||
      DEFAULT_WELCOME_DISCOUNT_CODE_PREFIX,
  );
}

function matchesWelcomeDiscountPrefix(code: string, prefix: string) {
  if (code === prefix) {
    return true;
  }

  if (!code.startsWith(prefix)) {
    return false;
  }

  return WELCOME_DISCOUNT_SUFFIX_PATTERN.test(code.slice(prefix.length));
}

function getWelcomeDiscountUsedPropertyKey() {
  return (
    process.env.LOOPS_WELCOME_DISCOUNT_USED_PROPERTY_KEY?.trim() ||
    DEFAULT_WELCOME_DISCOUNT_USED_PROPERTY_KEY
  );
}

function getWelcomeDiscountCodePropertyKey() {
  return (
    process.env.LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY?.trim() ||
    DEFAULT_WELCOME_DISCOUNT_CODE_PROPERTY_KEY
  );
}

export function createWelcomeDiscountCode() {
  return `${getWelcomeDiscountCodeCreationPrefix()}${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
}

export function getWelcomeDiscountContactCode(
  contact?: Record<string, unknown> | null,
) {
  if (!contact) {
    return null;
  }

  const codePropertyKey = getWelcomeDiscountCodePropertyKey();
  const candidates = [
    contact.welcomeDiscountCode,
    contact[codePropertyKey],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export function contactHasWelcomeDiscount(
  contact?: Record<string, unknown> | null,
) {
  return Boolean(getWelcomeDiscountContactCode(contact));
}

export function isWelcomeDiscountCode(discountCode?: string | null) {
  const normalizedDiscountCode = discountCode
    ? normalizeWelcomeDiscountCode(discountCode)
    : '';
  if (!normalizedDiscountCode) {
    return false;
  }

  return getWelcomeDiscountCodePrefixes().some((prefix) =>
    matchesWelcomeDiscountPrefix(normalizedDiscountCode, prefix),
  );
}

export function isSuccessfulPaymentStatus(status?: string | null) {
  if (!status) {
    return false;
  }

  const normalizedStatus = status.trim().toLowerCase();
  return normalizedStatus === 'finished' || normalizedStatus === 'paid';
}

export function buildWelcomeDiscountContactProperties(args: {
  discountCode: string;
  discountExpiresAt: string;
}) {
  const codePropertyKey = getWelcomeDiscountCodePropertyKey();
  const usedPropertyKey = getWelcomeDiscountUsedPropertyKey();

  return {
    welcomeDiscountCode: args.discountCode,
    welcomeDiscountExpiresAt: args.discountExpiresAt,
    [codePropertyKey]: args.discountCode,
    [usedPropertyKey]: false,
  } satisfies Record<string, string | number | boolean | null>;
}

export async function markWelcomeDiscountUsed(args: {
  email: string;
  discountCode?: string | null;
}) {
  const { createOrUpdateContact, hasLoopsConfig } = await import('@/lib/email/loops');

  if (!hasLoopsConfig()) {
    console.warn('Skipping welcome discount usage update: Loops not configured.');
    return null;
  }

  if (!isWelcomeDiscountCode(args.discountCode)) {
    return null;
  }

  const propertyKey = getWelcomeDiscountUsedPropertyKey();
  if (!propertyKey) {
    console.warn(
      'Skipping welcome discount usage update: LOOPS_WELCOME_DISCOUNT_USED_PROPERTY_KEY not set.',
    );
    return null;
  }

  return createOrUpdateContact({
    email: args.email.trim(),
    properties: {
      [propertyKey]: true,
    },
  });
}
