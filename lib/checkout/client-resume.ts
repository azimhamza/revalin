import type { CheckoutOrderPublic } from './types';

export const CHECKOUT_RESUME_KEY = 'revalin_checkout_resume';
export const CHECKOUT_RESUME_DISMISSAL_KEY =
  'revalin_checkout_resume_dismissal';
export const CHECKOUT_RESUME_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2;

export type CheckoutResume = {
  version: 1;
  orderId: string;
  accessKey: string;
  provider: CheckoutOrderPublic['payment']['provider'];
  status: string;
  savedAt: string;
  updatedAt?: string;
};

export type CheckoutResumeDismissal = {
  version: 1;
  snapshotKey: string;
  dismissedAt: string;
};

export function parseCheckoutResume(rawResume: string | null): CheckoutResume | null {
  if (!rawResume) return null;

  try {
    const parsed = JSON.parse(rawResume) as Partial<CheckoutResume> | null;

    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (typeof parsed.orderId !== 'string' || !parsed.orderId.trim()) return null;
    if (typeof parsed.accessKey !== 'string' || !parsed.accessKey.trim()) return null;
    if (
      parsed.provider !== 'shieldclimb' &&
      parsed.provider !== 'bankful' &&
      parsed.provider !== 'nowpayments' &&
      parsed.provider !== 'interac'
    ) return null;
    if (typeof parsed.status !== 'string' || !parsed.status.trim()) return null;
    if (typeof parsed.savedAt !== 'string' || !parsed.savedAt.trim()) return null;

    return {
      version: 1,
      orderId: parsed.orderId.trim(),
      accessKey: parsed.accessKey.trim(),
      provider: parsed.provider,
      status: parsed.status.trim(),
      savedAt: parsed.savedAt,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function isCheckoutResumeExpired(resume: CheckoutResume, now = Date.now()) {
  const savedAt = Date.parse(resume.savedAt);
  return !Number.isFinite(savedAt) || now - savedAt > CHECKOUT_RESUME_MAX_AGE_MS;
}

export function readStoredCheckoutResume(): CheckoutResume | null {
  if (typeof window === 'undefined') return null;
  return parseCheckoutResume(window.localStorage.getItem(CHECKOUT_RESUME_KEY));
}

export function persistCheckoutResume(resume: CheckoutResume) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHECKOUT_RESUME_KEY, JSON.stringify(resume));
}

export function clearStoredCheckoutResume() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CHECKOUT_RESUME_KEY);
}

export function parseCheckoutResumeDismissal(
  rawDismissal: string | null,
): CheckoutResumeDismissal | null {
  if (!rawDismissal) return null;

  try {
    const parsed = JSON.parse(rawDismissal) as
      | Partial<CheckoutResumeDismissal>
      | null;

    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (typeof parsed.snapshotKey !== 'string' || !parsed.snapshotKey.trim()) {
      return null;
    }
    if (typeof parsed.dismissedAt !== 'string' || !parsed.dismissedAt.trim()) {
      return null;
    }

    return {
      version: 1,
      snapshotKey: parsed.snapshotKey.trim(),
      dismissedAt: parsed.dismissedAt,
    };
  } catch {
    return null;
  }
}

export function readStoredCheckoutResumeDismissal() {
  if (typeof window === 'undefined') return null;

  return parseCheckoutResumeDismissal(
    window.localStorage.getItem(CHECKOUT_RESUME_DISMISSAL_KEY),
  );
}

export function persistCheckoutResumeDismissal(
  dismissal: CheckoutResumeDismissal,
) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    CHECKOUT_RESUME_DISMISSAL_KEY,
    JSON.stringify(dismissal),
  );
}

export function clearStoredCheckoutResumeDismissal() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(CHECKOUT_RESUME_DISMISSAL_KEY);
}
