import { QUICK_PAYMENT_CURRENCIES } from '@/lib/checkout/constants';

export type AccountShippingAddress = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type AccountCryptoPreferences = {
  preferredPaymentCurrency: string;
  cryptoWalletAddress: string;
};

export function parseAccountShippingAddress(value: unknown): AccountShippingAddress | null {
  if (!value || typeof value !== 'string') return null;

  try {
    return JSON.parse(value) as AccountShippingAddress;
  } catch {
    return null;
  }
}

export function normalizePreferredPaymentCurrency(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized && QUICK_PAYMENT_CURRENCIES.includes(normalized)) {
    return normalized;
  }

  return QUICK_PAYMENT_CURRENCIES[0];
}

export function normalizeCryptoWalletAddress(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseAccountCryptoPreferences(value: {
  preferredPaymentCurrency?: unknown;
  cryptoWalletAddress?: unknown;
} | null | undefined): AccountCryptoPreferences {
  return {
    preferredPaymentCurrency: normalizePreferredPaymentCurrency(value?.preferredPaymentCurrency),
    cryptoWalletAddress: normalizeCryptoWalletAddress(value?.cryptoWalletAddress),
  };
}

export function formatAccountDate(
  value?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
) {
  if (!value) return 'N/A';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...options,
  }).format(date);
}

export function getOrderStatusLabel(status?: string | null) {
  return (status || 'pending').replace(/_/g, ' ');
}

export function getOrderStatusClasses(status?: string | null) {
  const normalized = (status || 'pending').toLowerCase();

  if (normalized === 'finished' || normalized === 'paid') {
    return 'bg-emerald-500/10 text-emerald-950 ring-1 ring-emerald-600/15';
  }

  if (normalized === 'failed' || normalized === 'expired' || normalized === 'refunded') {
    return 'bg-rose-500/10 text-rose-950 ring-1 ring-rose-600/15';
  }

  return 'bg-amber-500/10 text-amber-950 ring-1 ring-amber-600/15';
}

export function getOrderItemCount(lines: Array<{ quantity?: number }> = []) {
  return lines.reduce<number>((sum, line) => sum + (line.quantity || 1), 0);
}

export function splitUserName(name?: string | null) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(' '),
  };
}

export function formatPaymentCurrencyLabel(value?: string | null) {
  const normalized = (value || '').trim().toUpperCase();

  if (normalized === 'USDTTRC20') return 'USDT TRC20';

  return normalized || 'N/A';
}

export function maskWalletAddress(value?: string | null) {
  const normalized = normalizeCryptoWalletAddress(value);
  if (!normalized) return 'Not saved';
  if (normalized.length <= 14) return normalized;

  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
}
