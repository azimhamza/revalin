'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CheckCircle2, Copy, CreditCard, Landmark, Lock, Loader2, RefreshCw, ShieldCheck, Tag, Truck, UserCheck, Wallet, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { CartItemCard } from '@/components/cart/cart-item';
import { useCart } from '@/components/cart/cart-context';
import { AddToCartButton } from '@/components/cart/add-to-cart';
import { VariantOptionSelectorComponent, useProductImages } from '@/components/products/variant-selector';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  QUICK_PAYMENT_CURRENCIES,
  SHIELDCLIMB_PUBLIC_POLLING_ID,
  SHIPPING_COUNTRIES,
  isTerminalPaymentStatus,
} from '@/lib/checkout/constants';
import type {
  CheckoutAppliedDiscount,
  CheckoutOrderPublic,
  CheckoutShippingAddress,
  CheckoutShippingService,
  ShieldClimbPublicPaymentData,
  NowPaymentsPaymentData,
} from '@/lib/checkout/types';
import { calculateCheckoutPricing, getCheckoutDiscounts } from '@/lib/checkout/pricing';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/swell/types';
import { formatPrice, getDiscountPercentage, getDisplayCompareAtPrice, getDisplayPrice } from '@/lib/swell/utils';
import { useAuthSession } from '@/components/auth/session-provider';
import { CheckoutAuthBanner } from './checkout-auth-banner';
import { getApiData, getApiErrorMessage, readJsonSafely } from '@/lib/api/client';

type CheckoutExperienceProps = {
  quickAddProducts: Product[];
};

type CheckoutSession = {
  accessKey: string;
  order: CheckoutOrderPublic;
};

type CheckoutApiSession = {
  sessionId: string;
  sessionKey: string;
  version: number;
  expiresAt?: string | null;
};

type CheckoutApiSessionState = CheckoutApiSession & {
  state?: {
    expiresAt?: string | null;
    status?: string | null;
  };
};

type CheckoutQuote = {
  currencyCode: string;
  subtotalAmount: {
    amount: string;
    currencyCode: string;
  };
  discountAmount?: {
    amount: string;
    currencyCode: string;
  };
  discountCode?: string;
  discounts?: CheckoutAppliedDiscount[];
  paymentMethod?: 'card' | 'crypto';
  services: CheckoutShippingService[];
  selectedServiceId: string;
};

type CheckoutCartSnapshot = {
  currencyCode: string;
  lines: CheckoutOrderPublic['lines'];
};

type AppliedDiscount = {
  code: string;
  amount: string;
  currencyCode: string;
};

type CheckoutDraft = {
  shippingAddress: CheckoutShippingAddress;
  paymentMethod: 'crypto' | 'card';
  paymentCurrency: string;
  sourceWalletAddress: string;
  discountCode: string;
  appliedDiscount: AppliedDiscount | null;
  apiSession: CheckoutApiSession | null;
};

const CHECKOUT_DRAFT_KEY = 'revalin_checkout_draft';
const SHIPPING_DRAFT_KEY = 'revalin_checkout_shipping_draft';
const BRAND_FETCH_QUERY = 'c=1dxbfHSJFAPEGdCLU4o5B';

const SHIPPING_CARRIER_LOGOS: Record<string, string> = {
  'amazon shipping': `https://cdn.brandfetch.io/amazon.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'an post': `https://cdn.brandfetch.io/anpost.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'apc overnight': `https://cdn.brandfetch.io/apc-overnight.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'apg ecommerce': `https://cdn.brandfetch.io/apgecommerce.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  aramex: `https://cdn.brandfetch.io/aramex.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'aramex australia': `https://cdn.brandfetch.io/aramex.com.au/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'asendia uk': `https://cdn.brandfetch.io/asendia.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'brt it': `https://cdn.brandfetch.io/brt.it/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  brt: `https://cdn.brandfetch.io/brt.it/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'canada post': `https://cdn.brandfetch.io/canadapost-postescanada.ca/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  chronopost: `https://cdn.brandfetch.io/chronopost.fr/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'colis prive store': `https://cdn.brandfetch.io/colisprive.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'colis prive': `https://cdn.brandfetch.io/colisprive.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  correos: `https://cdn.brandfetch.io/correos.es/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'couriers please': `https://cdn.brandfetch.io/couriersplease.com.au/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'deutsche post cross border': `https://cdn.brandfetch.io/deutschepost.de/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dhl express': `https://cdn.brandfetch.io/dhl.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dhl express australia': `https://cdn.brandfetch.io/dhl.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dhl express canada': `https://cdn.brandfetch.io/dhl.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dhl express uk': `https://cdn.brandfetch.io/dhl.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dhl express mydhl api': `https://cdn.brandfetch.io/dhl.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dhl parcel uk': `https://cdn.brandfetch.io/dhlparcel.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  dhl: `https://cdn.brandfetch.io/dhl.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  dpd: `https://cdn.brandfetch.io/dpd.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dpd local': `https://cdn.brandfetch.io/dpdlocal-online.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dpd uk': `https://cdn.brandfetch.io/dpd.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'dpd germany': `https://cdn.brandfetch.io/dpd.de/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  dx: `https://cdn.brandfetch.io/dxdelivery.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  evri: `https://cdn.brandfetch.io/evri.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'evri corporate': `https://cdn.brandfetch.io/evri.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'evri international': `https://cdn.brandfetch.io/evri.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'royal mail': `https://cdn.brandfetch.io/royalmail.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  fedex: `https://cdn.brandfetch.io/fedex.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'fedex uk': `https://cdn.brandfetch.io/fedex.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'fedex international connect': `https://cdn.brandfetch.io/fedex.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  globalpost: `https://cdn.brandfetch.io/goglobalpost.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'hermes germany': `https://cdn.brandfetch.io/hermesworld.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  inpost: `https://cdn.brandfetch.io/inpost.pl/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'la post lettre suivie': `https://cdn.brandfetch.io/laposte.fr/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'mondial relay dc': `https://cdn.brandfetch.io/mondialrelay.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'mondial relay': `https://cdn.brandfetch.io/mondialrelay.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'parcelforce royal mail': `https://cdn.brandfetch.io/parcelforce.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  parcelforce: `https://cdn.brandfetch.io/parcelforce.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'parcelforce worldwide': `https://cdn.brandfetch.io/parcelforce.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  postnl: `https://cdn.brandfetch.io/postnl.nl/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'poste italiane': `https://cdn.brandfetch.io/poste.it/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  procarrier: `https://cdn.brandfetch.io/procarrier.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  purolator: `https://cdn.brandfetch.io/purolator.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'purolator canada': `https://cdn.brandfetch.io/purolator.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'seko omni channel logistics': `https://cdn.brandfetch.io/sekologistics.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'seko omni-channel logistics': `https://cdn.brandfetch.io/sekologistics.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  sendle: `https://cdn.brandfetch.io/sendle.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  seur: `https://cdn.brandfetch.io/seur.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'spring global': `https://cdn.brandfetch.io/spring-gds.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'starlinks global': `https://cdn.brandfetch.io/starlinksglobal.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'the delivery group uk': `https://cdn.brandfetch.io/thedeliverygroup.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'tnt uk': `https://cdn.brandfetch.io/tnt.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'tusk logistics': `https://cdn.brandfetch.io/tusklogistics.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  ups: 'https://cdn.brandfetch.io/id5aN1Q7um/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B',
  'ups ground freight': 'https://cdn.brandfetch.io/id5aN1Q7um/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B',
  usps: `https://cdn.brandfetch.io/usps.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'usps (stamps.com)': `https://cdn.brandfetch.io/usps.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'stamps.com': `https://cdn.brandfetch.io/stamps.com/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  whistl: `https://cdn.brandfetch.io/whistl.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  yodel: `https://cdn.brandfetch.io/yodel.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
  'yodel out of home': `https://cdn.brandfetch.io/yodel.co.uk/theme/dark/logo.svg?${BRAND_FETCH_QUERY}`,
};

const DEFAULT_SHIPPING_ADDRESS: CheckoutShippingAddress = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'CA',
  notes: '',
};

function normalizeShippingAddressDraft(value: Partial<CheckoutShippingAddress> | null | undefined): CheckoutShippingAddress {
  return {
    ...DEFAULT_SHIPPING_ADDRESS,
    ...(value || {}),
  };
}

function parseCheckoutDraft(rawDraft: string | null): CheckoutDraft | null {
  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as Partial<CheckoutDraft> | null;

    if (!parsed || typeof parsed !== 'object') return null;

    return {
      shippingAddress: normalizeShippingAddressDraft(parsed.shippingAddress),
      paymentMethod: parsed.paymentMethod === 'card' ? 'card' : 'crypto',
      paymentCurrency:
        typeof parsed.paymentCurrency === 'string' && QUICK_PAYMENT_CURRENCIES.includes(parsed.paymentCurrency)
          ? parsed.paymentCurrency
          : QUICK_PAYMENT_CURRENCIES[0],
      sourceWalletAddress:
        typeof parsed.sourceWalletAddress === 'string' ? parsed.sourceWalletAddress : '',
      discountCode: typeof parsed.discountCode === 'string' ? parsed.discountCode : '',
      appliedDiscount:
        parsed.appliedDiscount &&
        typeof parsed.appliedDiscount.code === 'string' &&
        typeof parsed.appliedDiscount.amount === 'string' &&
        typeof parsed.appliedDiscount.currencyCode === 'string'
          ? {
              code: parsed.appliedDiscount.code,
              amount: parsed.appliedDiscount.amount,
              currencyCode: parsed.appliedDiscount.currencyCode,
            }
          : null,
      apiSession:
        parsed.apiSession &&
        typeof parsed.apiSession.sessionId === 'string' &&
        typeof parsed.apiSession.sessionKey === 'string' &&
        typeof parsed.apiSession.version === 'number'
          ? {
              sessionId: parsed.apiSession.sessionId,
              sessionKey: parsed.apiSession.sessionKey,
              version: parsed.apiSession.version,
              expiresAt:
                typeof parsed.apiSession.expiresAt === 'string'
                  ? parsed.apiSession.expiresAt
                  : null,
            }
          : null,
    };
  } catch {
    return null;
  }
}

function toCheckoutApiSession(value: unknown): CheckoutApiSession | null {
  if (!value || typeof value !== 'object') return null;

  const sessionId =
    typeof (value as { sessionId?: unknown }).sessionId === 'string'
      ? (value as { sessionId: string }).sessionId
      : null;
  const sessionKey =
    typeof (value as { sessionKey?: unknown }).sessionKey === 'string'
      ? (value as { sessionKey: string }).sessionKey
      : null;
  const version =
    typeof (value as { version?: unknown }).version === 'number'
      ? (value as { version: number }).version
      : null;

  if (!sessionId || !sessionKey || version === null) {
    return null;
  }

  const state =
    'state' in value && value.state && typeof value.state === 'object'
      ? (value.state as { expiresAt?: unknown })
      : null;

  return {
    sessionId,
    sessionKey,
    version,
    expiresAt: typeof state?.expiresAt === 'string' ? state.expiresAt : null,
  };
}

function isCheckoutApiSessionExpired(session: CheckoutApiSession | null | undefined) {
  if (!session?.expiresAt) {
    return false;
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function isDraftOutOfDateResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') {
    return false;
  }

  const details = (error as { details?: unknown }).details;
  return Boolean(
    (error as { code?: unknown }).code === 'conflict' &&
      details &&
      typeof details === 'object' &&
      (details as { code?: unknown }).code === 'draft_out_of_date',
  );
}

function isExpiredCheckoutSessionResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'conflict' &&
      (error as { message?: unknown }).message === 'Checkout session expired.',
  );
}

function PaymentBrandIcons({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://cdn.brandfetch.io/idhem73aId/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Visa" className="h-3 max-w-[28px] object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://cdn.brandfetch.io/idFw8DodCr/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Mastercard" className="h-3.5 max-w-[22px] object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://cdn.brandfetch.io/idnrCPuv87/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Apple Pay" className="h-3 max-w-[14px] object-contain" />
      <span className="text-[10px] font-medium text-foreground/40">Apple Pay</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://cdn.brandfetch.io/idWNFFMbfp/w/400/h/400/theme/dark/icon.png?c=1dxbfHSJFAPEGdCLU4o5B" alt="Google Pay" className="h-3.5 max-w-[22px] object-contain" />
    </div>
  );
}

function isShieldClimbOrder(payment: CheckoutOrderPublic['payment']): payment is ShieldClimbPublicPaymentData {
  return payment.provider === 'shieldclimb';
}

function isNowPaymentsOrder(payment: CheckoutOrderPublic['payment']): payment is NowPaymentsPaymentData {
  return payment.provider === 'nowpayments';
}

function getPollingId(payment: CheckoutOrderPublic['payment']): string | undefined {
  if (isShieldClimbOrder(payment)) return SHIELDCLIMB_PUBLIC_POLLING_ID;
  if (isNowPaymentsOrder(payment)) return payment.paymentId;
  return undefined;
}

function formatTicker(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === 'USDTTRC20') return 'USDT TRC20';
  return normalized;
}

function normalizeCarrierBrandKey(value?: string | null) {
  if (!value) return '';

  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getShippingCarrierLogo(value?: string | null) {
  const normalized = normalizeCarrierBrandKey(value);
  if (!normalized) return null;
  return SHIPPING_CARRIER_LOGOS[normalized] || null;
}

function formatEstimatedDeliveryDays(value?: number | null) {
  if (!Number.isFinite(value) || !value || value <= 0) return null;
  if (value === 1) return 'Estimated 1 business day';
  return `Estimated ${value} business days`;
}

function formatShippingOptionCategory(category?: CheckoutShippingService['quoteCategory']) {
  if (category === 'cheapest') return 'Cheapest';
  if (category === 'best_value') return 'Best value';
  if (category === 'fastest') return 'Fastest';
  return null;
}

function isFreeShippingPrice(amount?: string | null) {
  return Number(amount || 0) <= 0.009;
}

function renderShippingPrice(currentAmount: string, currencyCode: string, originalAmount?: string | null) {
  const isFree = isFreeShippingPrice(currentAmount);
  const hasOriginal = originalAmount && Number(originalAmount) > 0.009;

  if (!isFree) {
    return formatPrice(currentAmount, currencyCode);
  }

  return (
    <span className="inline-flex items-center gap-2">
      {hasOriginal ? (
        <span className="text-xs font-medium text-foreground/45 line-through">
          {formatPrice(originalAmount, currencyCode)}
        </span>
      ) : null}
      <span className="text-[#0B2E2F]">Free</span>
    </span>
  );
}

function formatPaymentStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function isProvinceRequired(countryCode?: string | null) {
  const normalized = countryCode?.trim().toUpperCase();
  return normalized === 'CA' || normalized === 'US';
}

function formatDateTime(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function paymentStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'finished' || normalized === 'paid') return 'bg-[#0B2E2F] text-[#F4F1EA]';
  if (normalized === 'partially_paid') return 'bg-amber-100 text-amber-900';
  if (
    normalized === 'failed' ||
    normalized === 'expired' ||
    normalized === 'refunded' ||
    normalized === 'cancelled' ||
    normalized === 'replaced'
  ) {
    return 'bg-red-100 text-red-800';
  }

  return 'bg-[#0B2E2F]/10 text-[#0B2E2F]';
}

const NOWPAYMENTS_FAILURE_STATUSES = new Set([
  'failed',
  'expired',
  'refunded',
  'cancelled',
  'replaced',
]);

const INACTIVE_CHECKOUT_RESTORE_STATUSES = new Set([
  'failed',
  'expired',
  'refunded',
  'cancelled',
  'replaced',
]);

function describeNowPaymentsFailure(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'expired') {
    return 'This crypto payment window expired before the transfer completed. Start a new checkout to generate a fresh payment request.';
  }

  if (normalized === 'refunded') {
    return 'This payment was refunded by the processor. Start a new checkout if you still want to place the order.';
  }

  if (normalized === 'cancelled' || normalized === 'replaced') {
    return 'This crypto payment request is no longer active. Start a new checkout to continue with a fresh payment session.';
  }

  return 'The crypto payment could not be completed. Start a new checkout or choose a different payment method to continue.';
}

function isShippingAddressReady(address: CheckoutShippingAddress) {
  return Boolean(
    address.firstName.trim() &&
      address.lastName.trim() &&
      /\S+@\S+\.\S+/.test(address.email.trim()) &&
      address.phone.trim().length >= 7 &&
      address.address1.trim() &&
      address.city.trim() &&
      (!isProvinceRequired(address.country) || address.province.trim()) &&
      address.postalCode.trim() &&
      address.country.trim()
  );
}

function ShippingField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  required = true,
}: {
  label: string;
  name: keyof CheckoutShippingAddress;
  value: string | undefined;
  onChange: (name: keyof CheckoutShippingAddress, value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">{label}</span>
      <input
        type={type}
        name={name}
        value={value || ''}
        onChange={event => onChange(name, event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
      />
    </label>
  );
}

function StaticOrderLineCard({
  line,
  currencyCode,
}: {
  line: CheckoutOrderPublic['lines'][number];
  currencyCode: string;
}) {
  return (
    <div className="rounded-2xl bg-popover p-3">
      <div className="flex gap-3">
        <div className="size-[76px] shrink-0 overflow-hidden rounded-xl bg-card">
          <img src={line.imageUrl} alt={line.productTitle} className="size-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{line.productTitle}</p>
              <p className="mt-1 text-xs text-foreground/55">{line.variantTitle}</p>
            </div>
            <p className="text-sm font-semibold">{formatPrice(line.lineTotal.amount, currencyCode)}</p>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-foreground/55">
            <span>Qty {line.quantity}</span>
            <span>{formatPrice(line.unitPrice.amount, currencyCode)} each</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className={cn('text-sm text-foreground/60', emphasized && 'text-foreground')}>{label}</span>
      <span className={cn('text-right text-sm font-medium', emphasized && 'text-lg font-semibold tracking-tight flex items-center justify-end')}>
        {value}
      </span>
    </div>
  );
}

function getInitialQuickAddSelection(product: Product) {
  const initialVariant = product.variants.find(variant => variant.availableForSale) || product.variants[0];

  return (
    initialVariant?.selectedOptions.reduce<Record<string, string>>((result, option) => {
      result[option.name.toLowerCase()] = option.value;
      return result;
    }, {}) || {}
  );
}

function CheckoutQuickAddCard({ product }: { product: Product }) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => getInitialQuickAddSelection(product));

  const selectedVariant = useMemo(() => {
    if (product.variants.length === 0) return null;

    return (
      product.variants.find(variant =>
        variant.selectedOptions.every(option => selectedOptions[option.name.toLowerCase()] === option.value)
      ) || null
    );
  }, [product, selectedOptions]);

  const [selectedImage] = useProductImages(product, selectedVariant?.selectedOptions);
  const visibleOptions = product.options.filter(option => option.values.length > 1);
  const displayPrice = getDisplayPrice(product, selectedVariant);
  const compareAtPrice = getDisplayCompareAtPrice(product, selectedVariant, displayPrice);
  const discountPercentage = getDiscountPercentage(compareAtPrice, displayPrice);

  return (
    <article className="rounded-[22px] border border-border/70 bg-background p-2.5">
      <div className="flex gap-3">
        <Link href={`/product/${product.handle}`} className="block shrink-0">
          <div className="size-16 overflow-hidden rounded-xl bg-card">
            <img
              src={selectedImage?.url || product.featuredImage.url}
              alt={selectedImage?.altText || product.featuredImage.altText || product.title}
              className="size-full object-cover"
            />
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/product/${product.handle}`} className="line-clamp-2 text-sm font-semibold leading-5">
                {product.title}
              </Link>
              <p className="mt-1 text-xs text-foreground/55">
                {selectedVariant?.selectedOptions.length
                  ? selectedVariant.selectedOptions.map(option => option.value).join(' / ')
                  : 'Ready to add'}
              </p>
            </div>
            <p className="flex items-baseline gap-1.5 text-sm font-semibold">
              <span>{formatPrice(displayPrice.amount, displayPrice.currencyCode)}</span>
              {compareAtPrice ? (
                <span className="text-xs font-medium text-foreground/40 line-through">
                  {formatPrice(compareAtPrice.amount, compareAtPrice.currencyCode)}
                </span>
              ) : null}
              {discountPercentage ? (
                <span className="rounded-full bg-[#2D6A4F]/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#2D6A4F]">
                  {discountPercentage}% off
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      {visibleOptions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visibleOptions.map(option => (
            <div key={option.id}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                {option.name}
              </p>
              <VariantOptionSelectorComponent
                option={option}
                product={product}
                variant="shop"
                hideLabel
                selectedValue={selectedOptions[option.name.toLowerCase()] || ''}
                selectedOptions={selectedOptions}
                isTargetingProduct
                onSelect={valueName =>
                  setSelectedOptions(current => ({
                    ...current,
                    [option.name.toLowerCase()]: valueName,
                  }))
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      <AddToCartButton
        product={product}
        selectedVariant={selectedVariant}
        size="sm"
        className="mt-3 w-fit ml-auto"
        contentClassName="text-sm"
        style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
        unselectedStyle={{ backgroundColor: '#ECE9E2', color: '#0B2E2F' }}
      />
    </article>
  );
}

function DevPaymentSimulator({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess: (order: CheckoutOrderPublic) => void;
}) {
  const [loading, setLoading] = useState<'complete' | 'fail' | null>(null);

  const simulate = async (action: 'complete' | 'fail') => {
    setLoading(action);
    try {
      const response = await fetch('/api/checkout/v2/dev/simulate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });

      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, `Simulation failed (${action}).`));
      }

      const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
      if (data?.order) {
        onSuccess(data.order);
        toast.success(action === 'complete' ? 'Payment marked as complete' : 'Payment marked as failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-50/50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">Dev Payment Testing</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => simulate('complete')}
          disabled={loading !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-white px-2 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
        >
          {loading === 'complete' ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          Simulate Complete
        </button>
        <button
          type="button"
          onClick={() => simulate('fail')}
          disabled={loading !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-white px-2 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
        >
          {loading === 'fail' ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
          Simulate Failed
        </button>
      </div>
    </div>
  );
}

export function CheckoutExperience({ quickAddProducts }: CheckoutExperienceProps) {
  const { cart } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: authSession } = useAuthSession();
  const initialDiscountCode = (searchParams.get('discount') || '').toUpperCase();

  const [shippingAddress, setShippingAddress] = useState<CheckoutShippingAddress>(DEFAULT_SHIPPING_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'card'>('crypto');
  const [paymentCurrency, setPaymentCurrency] = useState(QUICK_PAYMENT_CURRENCIES[0]);
  const [sourceWalletAddress, setSourceWalletAddress] = useState('');
  const [discountCode, setDiscountCode] = useState(initialDiscountCode);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [shouldAutoApplyDiscount, setShouldAutoApplyDiscount] = useState(Boolean(initialDiscountCode));
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [countryOptions, setCountryOptions] = useState(SHIPPING_COUNTRIES);
  const [selectedShippingServiceId, setSelectedShippingServiceId] = useState('');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [checkoutApiSession, setCheckoutApiSession] = useState<CheckoutApiSession | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isCardCheckoutOpen, setIsCardCheckoutOpen] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isReleasingOrder, setIsReleasingOrder] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const previousCartSignature = useRef<string | null>(null);
  const lastQuoteRequestSignature = useRef<string | null>(null);
  const quoteAbortController = useRef<AbortController | null>(null);
  const previousPaymentSnapshot = useRef<{ orderId: string; status: string } | null>(null);

  const orderId = searchParams.get('order');
  const accessKey = searchParams.get('key');
  const discountParam = searchParams.get('discount');
  const retryOrderId = searchParams.get('retry');
  const retryKey = searchParams.get('key');

  const activeOrder = checkoutSession?.order ?? null;
  const selectedQuoteService =
    quote?.services.find(service => service.id === selectedShippingServiceId) ||
    quote?.services.find(service => service.id === quote.selectedServiceId) ||
    null;

  const summaryCurrencyCode = activeOrder?.currencyCode || quote?.currencyCode || cart?.cost.totalAmount.currencyCode || 'USD';
  const summaryItems = activeOrder
    ? activeOrder.lines.map(line => (
        <StaticOrderLineCard key={line.id} line={line} currencyCode={activeOrder.currencyCode} />
      ))
    : cart?.lines.map(item => <CartItemCard key={item.id} item={item} onCloseCart={() => {}} />);
  const cartSignature = `${cart?.totalQuantity ?? 0}:${cart?.cost.subtotalAmount.amount ?? '0'}`;
  const summaryItemCount = activeOrder
    ? activeOrder.lines.reduce((total, line) => total + line.quantity, 0)
    : cart?.totalQuantity || 0;

  const summarySubtotal = activeOrder
    ? activeOrder.totals.subtotalAmount.amount
    : quote?.subtotalAmount.amount || cart?.cost.subtotalAmount.amount || '0.00';
  const summaryShipping = activeOrder?.totals.shippingAmount?.amount || selectedQuoteService?.price.amount || '0.00';
  const summaryShippingOriginal = selectedQuoteService?.originalPrice?.amount;
  const summaryTax = activeOrder?.totals.taxAmount?.amount || selectedQuoteService?.taxAmount?.amount || '0.00';
  const summaryPricing = useMemo(() => {
    if (activeOrder) {
      const discounts = getCheckoutDiscounts({
        currencyCode: activeOrder.currencyCode,
        discounts: activeOrder.totals.discounts,
        discountAmount: activeOrder.totals.discountAmount?.amount,
        discountCode: activeOrder.totals.discountCode,
      });

      return {
        discounts,
        totalAmount: activeOrder.totals.totalAmount,
        cryptoDiscountAmount: discounts.find(discount => discount.kind === 'crypto')?.amount,
      };
    }

    if (quote?.paymentMethod === paymentMethod) {
      const discounts = getCheckoutDiscounts({
        currencyCode: quote.currencyCode,
        discounts: quote.discounts,
        discountAmount: quote.discountAmount?.amount,
        discountCode: quote.discountCode,
      });
      const totalValue = (
        Number(summarySubtotal) -
        Number(quote.discountAmount?.amount || 0) +
        Number(summaryShipping) +
        Number(summaryTax)
      ).toFixed(2);

      return {
        discounts,
        totalAmount: {
          amount: totalValue,
          currencyCode: quote.currencyCode,
        },
        cryptoDiscountAmount: discounts.find(discount => discount.kind === 'crypto')?.amount,
      };
    }

    const pricing = calculateCheckoutPricing({
      currencyCode: summaryCurrencyCode,
      subtotalAmount: summarySubtotal,
      couponDiscountAmount: appliedDiscount?.amount || '0.00',
      couponCode: appliedDiscount?.code,
      shippingAmount: summaryShipping,
      taxAmount: summaryTax,
      paymentMethod,
    });

    return {
      discounts: pricing.discounts,
      totalAmount: pricing.totalAmount,
      cryptoDiscountAmount: pricing.cryptoDiscountAmount,
    };
  }, [
    activeOrder,
    appliedDiscount?.amount,
    appliedDiscount?.code,
    paymentMethod,
    quote?.currencyCode,
    quote?.discountAmount?.amount,
    quote?.discountCode,
    quote?.discounts,
    quote?.paymentMethod,
    summaryCurrencyCode,
    summaryShipping,
    summarySubtotal,
    summaryTax,
  ]);
  const summaryDiscountLines = summaryPricing.discounts;
  const hasResolvedShippingPrice = Boolean(activeOrder?.shippingService || selectedQuoteService);
  const summaryShippingValue = hasResolvedShippingPrice
    ? renderShippingPrice(summaryShipping, summaryCurrencyCode, summaryShippingOriginal)
    : isShippingAddressReady(shippingAddress)
      ? (isLoadingQuote ? 'Calculating...' : 'Select a method')
      : 'Enter address';
  const hasResolvedTax = Boolean(activeOrder?.totals.taxAmount || selectedQuoteService?.taxAmount);
  const summaryTaxValue = hasResolvedTax
    ? formatPrice(summaryTax, summaryCurrencyCode)
    : selectedQuoteService
      ? 'Estimated at payment'
    : isShippingAddressReady(shippingAddress)
      ? (isLoadingQuote ? 'Calculating...' : 'Select a method')
      : 'Enter address';
  const summaryCryptoDiscountAmount = summaryPricing.cryptoDiscountAmount?.amount;
  const summaryTotal = summaryPricing.totalAmount.amount;
  const isCartHydrating = !activeOrder && cart === undefined;

  const quickAddCatalog = useMemo(() => {
    if (!cart || cart.lines.length === 0) return quickAddProducts;
    const currentHandles = new Set(cart.lines.map(item => item.merchandise.product.handle));
    return quickAddProducts.filter(product => !currentHandles.has(product.handle));
  }, [cart, quickAddProducts]);
  const cartSnapshot = useMemo<CheckoutCartSnapshot | null>(() => {
    if (!cart || cart.lines.length === 0) return null;

    return {
      currencyCode: cart.cost.totalAmount.currencyCode,
      lines: cart.lines.map(item => {
        const imageUrl =
          item.merchandise.product.featuredImage.url ||
          item.merchandise.product.images[0]?.url ||
          '/placeholder.jpg';
        const lineTotalAmount = Number(item.cost.totalAmount.amount || 0);
        const unitAmount =
          item.quantity > 0 ? (lineTotalAmount / item.quantity).toFixed(2) : item.merchandise.product.priceRange.minVariantPrice.amount;

        return {
          id: item.id,
          merchandiseId: item.merchandise.id,
          productHandle: item.merchandise.product.handle,
          productTitle: item.merchandise.product.title,
          variantTitle: item.merchandise.title,
          skuNumber: item.merchandise.sku || undefined,
          imageUrl,
          selectedOptions: item.merchandise.selectedOptions,
          quantity: item.quantity,
          unitPrice: {
            amount: unitAmount,
            currencyCode: cart.cost.totalAmount.currencyCode,
          },
          lineTotal: {
            amount: lineTotalAmount.toFixed(2),
            currencyCode: cart.cost.totalAmount.currencyCode,
          },
        };
      }),
    };
  }, [cart]);
  const quoteRequestSignature = useMemo(() => {
    if (!cartSnapshot || !isShippingAddressReady(shippingAddress)) return null;

    const {
      firstName,
      lastName,
      email,
      phone,
      address1,
      address2,
      city,
      province,
      postalCode,
      country,
    } = shippingAddress;

    return JSON.stringify({
      shippingAddress: {
        firstName,
        lastName,
        email,
        phone,
        address1,
        address2,
        city,
        province,
        postalCode,
        country,
      },
      cart: cartSnapshot.lines.map(line => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
      discountCode: appliedDiscount?.code || '',
    });
  }, [cartSnapshot, appliedDiscount, shippingAddress]);

  // Handle retry URL: pre-fill checkout from a previous failed order
  useEffect(() => {
    if (!retryOrderId || !retryKey || orderId) return;

    fetch(`/api/checkout/v2/orders/${encodeURIComponent(retryOrderId)}?key=${encodeURIComponent(retryKey)}`, {
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) return;
        const payload = await readJsonSafely(response);
        const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
        const retryOrder = data?.order;
        if (!retryOrder) return;
        if (retryOrder.shippingAddress) {
          setShippingAddress(retryOrder.shippingAddress);
        }
        if (retryOrder.totals.discountCode) {
          setDiscountCode(retryOrder.totals.discountCode);
          setAppliedDiscount(null);
          setShouldAutoApplyDiscount(true);
        }
      })
      .catch(() => {
        // Silent fail — user can still fill in manually
      });
  }, [retryOrderId, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!discountParam) return;
    const normalizedDiscountCode = discountParam.toUpperCase();
    setDiscountCode(normalizedDiscountCode);
    setAppliedDiscount(current => (current?.code === normalizedDiscountCode ? current : null));
    setShouldAutoApplyDiscount(true);
    setDiscountError(null);
  }, [discountParam]);

  useEffect(() => {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      setCountryOptions(
        SHIPPING_COUNTRIES.map(country => ({
          code: country.code,
          label: displayNames.of(country.code) || country.code,
        }))
      );
    } catch {
      setCountryOptions(SHIPPING_COUNTRIES);
    }
  }, []);

  useEffect(() => {
    try {
      const checkoutDraft = parseCheckoutDraft(window.localStorage.getItem(CHECKOUT_DRAFT_KEY));

      if (checkoutDraft) {
        const hydratedApiSession = isCheckoutApiSessionExpired(checkoutDraft.apiSession)
          ? null
          : checkoutDraft.apiSession;

        setShippingAddress(checkoutDraft.shippingAddress);
        setPaymentMethod(checkoutDraft.paymentMethod);
        setPaymentCurrency(checkoutDraft.paymentCurrency);
        setSourceWalletAddress(checkoutDraft.sourceWalletAddress);
        setCheckoutApiSession(hydratedApiSession);
        const hydratedDiscountCode = initialDiscountCode || checkoutDraft.discountCode;
        const hydratedAppliedDiscount =
          checkoutDraft.appliedDiscount?.code === hydratedDiscountCode ? checkoutDraft.appliedDiscount : null;

        setDiscountCode(hydratedDiscountCode);
        setAppliedDiscount(hydratedAppliedDiscount);
        setShouldAutoApplyDiscount(Boolean(hydratedDiscountCode) && !hydratedAppliedDiscount);
      } else {
        const rawShippingDraft = window.localStorage.getItem(SHIPPING_DRAFT_KEY);

        if (rawShippingDraft) {
          const parsed = JSON.parse(rawShippingDraft) as Partial<CheckoutShippingAddress>;
          setShippingAddress(normalizeShippingAddressDraft(parsed));
        }
      }
    } catch {
      // Best effort only.
    } finally {
      setIsDraftHydrated(true);
    }
  }, [initialDiscountCode]);

  // Auto-fill from saved user address (if authenticated and form is at defaults)
  useEffect(() => {
    if (!isDraftHydrated || activeOrder) return;
    if (!authSession?.user) return;
    const saved = (authSession.user as any).shippingAddress;
    if (!saved) return;
    // Only auto-fill if form is still at defaults (no user input yet)
    if (shippingAddress.firstName || shippingAddress.email) return;
    try {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      if (parsed && parsed.firstName) {
        setShippingAddress((current) => ({
          ...current,
          ...parsed,
        }));
      }
    } catch {
      // Best effort only.
    }
  }, [isDraftHydrated, activeOrder, authSession]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isDraftHydrated || activeOrder) return;
    if (!authSession?.user) return;

    const preferredCurrency = (authSession.user as any).preferredPaymentCurrency;
    const savedWallet = (authSession.user as any).cryptoWalletAddress;

    if (typeof preferredCurrency === 'string' && QUICK_PAYMENT_CURRENCIES.includes(preferredCurrency)) {
      setPaymentCurrency(current => (current === QUICK_PAYMENT_CURRENCIES[0] ? preferredCurrency : current));
    }

    if (typeof savedWallet === 'string' && savedWallet.trim()) {
      setSourceWalletAddress(current => (current.trim() ? current : savedWallet.trim()));
    }
  }, [isDraftHydrated, activeOrder, authSession]);

  // Auto-fill affiliate discount code from cookie (lowest priority)
  useEffect(() => {
    if (!isDraftHydrated || activeOrder) return;
    if (discountCode) return; // URL param or draft already set
    try {
      const match = document.cookie.match(/(?:^|;\s*)revalin_ref_discount=([^;]+)/);
      if (match?.[1]) {
        setDiscountCode(decodeURIComponent(match[1]).toUpperCase());
        setShouldAutoApplyDiscount(true);
      }
    } catch {
      // Best effort only.
    }
  }, [isDraftHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isDraftHydrated) return;

    try {
      const nextDraft: CheckoutDraft = {
        shippingAddress,
        paymentMethod,
        paymentCurrency,
        sourceWalletAddress,
        discountCode,
        appliedDiscount,
        apiSession: checkoutApiSession,
      };

      window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(nextDraft));
      window.localStorage.setItem(SHIPPING_DRAFT_KEY, JSON.stringify(shippingAddress));
    } catch {
      // Best effort only.
    }
  }, [
    appliedDiscount,
    checkoutApiSession,
    discountCode,
    isDraftHydrated,
    paymentCurrency,
    paymentMethod,
    shippingAddress,
    sourceWalletAddress,
  ]);

  useEffect(() => {
    if (previousCartSignature.current === null) {
      previousCartSignature.current = cartSignature;
      return;
    }

    if (previousCartSignature.current === cartSignature) {
      return;
    }

    previousCartSignature.current = cartSignature;

    if (!activeOrder) {
      quoteAbortController.current?.abort();
      setQuote(null);
      setSelectedShippingServiceId('');
      lastQuoteRequestSignature.current = null;
    }
  }, [activeOrder, cartSignature]);

  useEffect(() => {
    if (!orderId || !accessKey) {
      setCheckoutSession(null);
      return;
    }

    let cancelled = false;
    setIsLoadingOrder(true);

    fetch(`/api/checkout/v2/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(accessKey)}`, {
      cache: 'no-store',
    })
      .then(async response => {
        const payload = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, 'Unable to restore checkout session.'));
        }
        const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
        if (!data?.order) {
          throw new Error('Unable to restore checkout session.');
        }

        if (cancelled) return;

        const normalizedPaymentStatus = data.order.payment.status.toLowerCase();
        if (INACTIVE_CHECKOUT_RESTORE_STATUSES.has(normalizedPaymentStatus)) {
          setCheckoutSession(null);
          setQuote(null);
          setSelectedShippingServiceId('');
          setError(null);
          syncCheckoutUrlImmediately();
          updateCheckoutUrl();
          return;
        }

        setCheckoutSession({ accessKey, order: data.order });
        setShippingAddress(data.order.shippingAddress);
        if (isNowPaymentsOrder(data.order.payment)) {
          setPaymentMethod('crypto');
          setPaymentCurrency(data.order.payment.paymentCurrency);
          setSourceWalletAddress(data.order.payment.sourceWalletAddress || '');
        } else {
          setPaymentMethod('card');
          setSourceWalletAddress('');
        }
        setDiscountCode(data.order.totals.discountCode || discountParam || '');
        setQuote(null);
        setSelectedShippingServiceId(data.order.shippingService?.id || '');
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to restore checkout session.');
          setCheckoutSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOrder(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, orderId]);

  const pollingId = checkoutSession?.order.payment ? getPollingId(checkoutSession.order.payment) : undefined;
  const autoPollingId =
    checkoutSession?.order.payment && isNowPaymentsOrder(checkoutSession.order.payment)
      ? getPollingId(checkoutSession.order.payment)
      : undefined;

  useEffect(() => {
    if (!autoPollingId || isTerminalPaymentStatus(checkoutSession?.order.payment.status)) {
      return;
    }

    const currentOrderId = checkoutSession!.order.orderId;
    const currentAccessKey = checkoutSession!.accessKey;

    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/checkout/v2/payments/${encodeURIComponent(autoPollingId)}/status?orderId=${encodeURIComponent(
          currentOrderId
        )}&key=${encodeURIComponent(currentAccessKey)}`,
        { cache: 'no-store' }
      );

      if (!response.ok) return;
      const payload = await readJsonSafely(response);
      const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
      if (!data?.order) return;
      setCheckoutSession(current => (current ? { ...current, order: data.order } : current));
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    checkoutSession?.accessKey,
    checkoutSession?.order.orderId,
    checkoutSession?.order.payment.status,
    autoPollingId,
  ]);

  useEffect(() => {
    if (!copiedValue) return;
    const timeout = window.setTimeout(() => setCopiedValue(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedValue]);

  useEffect(() => {
    return () => {
      quoteAbortController.current?.abort();
    };
  }, []);

  const resetQuoteState = useCallback(() => {
    quoteAbortController.current?.abort();
    setQuote(null);
    setSelectedShippingServiceId('');
    lastQuoteRequestSignature.current = null;
  }, []);

  const updateCheckoutUrl = (nextOrderId?: string, nextAccessKey?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextOrderId && nextAccessKey) {
      params.set('order', nextOrderId);
      params.set('key', nextAccessKey);
    } else {
      params.delete('order');
      params.delete('key');
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const syncCheckoutUrlImmediately = (nextOrderId?: string, nextAccessKey?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextOrderId && nextAccessKey) {
      params.set('order', nextOrderId);
      params.set('key', nextAccessKey);
    } else {
      params.delete('order');
      params.delete('key');
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  };

  const resetCheckoutSession = useCallback(() => {
    resetQuoteState();
    setCheckoutApiSession(null);
    setCheckoutSession(null);
    setError(null);
    previousPaymentSnapshot.current = null;
    updateCheckoutUrl();
  }, [resetQuoteState, updateCheckoutUrl]);

  const handleShippingChange = (name: keyof CheckoutShippingAddress, value: string) => {
    setShippingAddress(current => ({ ...current, [name]: value }));
    if (!activeOrder) {
      resetQuoteState();
    }
  };

  const handleDiscountCodeChange = (value: string) => {
    const normalizedCode = value.trim().toUpperCase();

    setDiscountCode(normalizedCode);
    setShouldAutoApplyDiscount(false);
    setDiscountError(null);

    if (appliedDiscount?.code && appliedDiscount.code !== normalizedCode) {
      setAppliedDiscount(null);
      if (!activeOrder) {
        resetQuoteState();
      }
    }
  };

  const buildCheckoutSessionPayload = useCallback(
    (overrides?: Partial<{
      shippingAddress: CheckoutShippingAddress;
      discountCode: string;
      selectedShippingServiceId: string;
    }>) => ({
      cartSnapshot: cartSnapshot || undefined,
      shippingAddress: overrides?.shippingAddress || shippingAddress,
      paymentMethod,
      paymentCurrency,
      sourceWalletAddress: sourceWalletAddress.trim() || undefined,
      discountCode:
        overrides?.discountCode !== undefined
          ? overrides.discountCode || undefined
          : appliedDiscount?.code || undefined,
      selectedShippingServiceId:
        overrides?.selectedShippingServiceId || selectedShippingServiceId || undefined,
    }),
    [
      appliedDiscount?.code,
      cartSnapshot,
      paymentCurrency,
      paymentMethod,
      selectedShippingServiceId,
      shippingAddress,
      sourceWalletAddress,
    ],
  );

  const createCheckoutApiSession = useCallback(async (
    requestBody: ReturnType<typeof buildCheckoutSessionPayload>,
  ) => {
    const response = await fetch('/api/checkout/v2/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    const responsePayload = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(responsePayload, 'Unable to create checkout session.'));
    }

    const data = getApiData<CheckoutApiSessionState>(responsePayload);
    const nextSession = toCheckoutApiSession(data);

    if (!nextSession) {
      throw new Error('Unable to create checkout session.');
    }

    setCheckoutApiSession(nextSession);
    return nextSession;
  }, []);

  const ensureCheckoutApiSession = useCallback(async (
    payload: ReturnType<typeof buildCheckoutSessionPayload> = buildCheckoutSessionPayload(),
  ) => {
    if (checkoutApiSession && !isCheckoutApiSessionExpired(checkoutApiSession)) {
      return checkoutApiSession;
    }

    if (checkoutApiSession) {
      setCheckoutApiSession(null);
    }

    return createCheckoutApiSession(payload);
  }, [buildCheckoutSessionPayload, checkoutApiSession, createCheckoutApiSession]);

  const refreshCheckoutApiSession = useCallback(
    async (session: CheckoutApiSession, signal?: AbortSignal) => {
      const response = await fetch(
        `/api/checkout/v2/sessions/${encodeURIComponent(
          session.sessionId,
        )}?sessionKey=${encodeURIComponent(session.sessionKey)}`,
        {
          cache: 'no-store',
          signal,
        },
      );
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to refresh checkout session.'));
      }

      const nextSession = toCheckoutApiSession(getApiData<CheckoutApiSessionState>(payload));
      if (!nextSession) {
        throw new Error('Unable to refresh checkout session.');
      }

      setCheckoutApiSession(nextSession);
      return nextSession;
    },
    [],
  );

  const repriceCheckoutApiSession = useCallback(
    async (args: {
      session: CheckoutApiSession;
      payload: ReturnType<typeof buildCheckoutSessionPayload>;
      fallbackMessage: string;
      signal?: AbortSignal;
    }) => {
      const postReprice = async (session: CheckoutApiSession) => {
        const response = await fetch(
          `/api/checkout/v2/sessions/${encodeURIComponent(session.sessionId)}/reprice`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: args.signal,
            body: JSON.stringify({
              ...args.payload,
              sessionKey: session.sessionKey,
              version: session.version,
            }),
          },
        );
        const payload = await readJsonSafely(response);

        return { response, payload };
      };

      let next = await postReprice(args.session);

      if (!next.response.ok && isExpiredCheckoutSessionResponse(next.payload) && !args.signal?.aborted) {
        const freshSession = await createCheckoutApiSession(args.payload);
        next = await postReprice(freshSession);
      }

      if (!next.response.ok && isDraftOutOfDateResponse(next.payload) && !args.signal?.aborted) {
        const currentSession = await refreshCheckoutApiSession(args.session, args.signal);
        next = await postReprice(currentSession);
      }

      let data = getApiData<{
        session: CheckoutApiSessionState;
        quote?: CheckoutQuote | null;
        stale?: boolean;
      }>(next.payload);

      if (next.response.ok && data?.stale && !args.signal?.aborted) {
        const currentSession = toCheckoutApiSession(data.session);
        if (!currentSession) {
          throw new Error('Unable to refresh checkout session.');
        }
        setCheckoutApiSession(currentSession);
        next = await postReprice(currentSession);
        data = getApiData<{
          session: CheckoutApiSessionState;
          quote?: CheckoutQuote | null;
          stale?: boolean;
        }>(next.payload);
      }

      if (!next.response.ok) {
        throw new Error(getApiErrorMessage(next.payload, args.fallbackMessage));
      }

      const nextSession = toCheckoutApiSession(data?.session);
      if (nextSession) {
        setCheckoutApiSession(nextSession);
      }
      if (!data?.quote) {
        throw new Error(args.fallbackMessage);
      }

      return {
        session: data.session,
        quote: data.quote,
      };
    },
    [createCheckoutApiSession, refreshCheckoutApiSession],
  );

  const applyDiscountCode = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

    if (!cartSnapshot) {
      setDiscountError('Add items to your stack first.');
      return;
    }

    if (!isShippingAddressReady(shippingAddress)) {
      setDiscountError('Complete the shipping address to validate a discount code.');
      return;
    }

    setIsValidatingDiscount(true);
    setDiscountError(null);
    setShouldAutoApplyDiscount(false);

    try {
      const session = await ensureCheckoutApiSession();
      const data = await repriceCheckoutApiSession({
        session,
        payload: buildCheckoutSessionPayload({
          shippingAddress,
          discountCode: code,
        }),
        fallbackMessage: 'Invalid discount code.',
      });

      setQuote(data.quote);
      setSelectedShippingServiceId((current) =>
        data.quote.services.some((service: CheckoutShippingService) => service.id === current)
          ? current
          : data.quote.selectedServiceId,
      );
      const appliedCode = data.quote.discountCode || code;
      setDiscountCode(appliedCode);
      setAppliedDiscount({
        code: appliedCode,
        amount: data.quote.discountAmount?.amount || '0.00',
        currencyCode: data.quote.discountAmount?.currencyCode || data.quote.currencyCode,
      });
      setDiscountError(null);
    } catch (applyError: unknown) {
      setDiscountError(applyError instanceof Error ? applyError.message : 'Invalid discount code.');
      setAppliedDiscount(null);
    } finally {
      setIsValidatingDiscount(false);
    }
  }, [
    buildCheckoutSessionPayload,
    cartSnapshot,
    ensureCheckoutApiSession,
    repriceCheckoutApiSession,
    shippingAddress,
  ]);

  const handleApplyDiscount = async () => {
    await applyDiscountCode(discountCode);
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setShouldAutoApplyDiscount(false);
    setDiscountError(null);
    resetQuoteState();
  };

  useEffect(() => {
    const normalizedDiscountCode = discountCode.trim().toUpperCase();

    if (!shouldAutoApplyDiscount || activeOrder) return;
    if (!normalizedDiscountCode || !cartSnapshot) return;
    if (!isShippingAddressReady(shippingAddress)) return;
    if (isValidatingDiscount || isLoadingQuote) return;

    if (appliedDiscount?.code === normalizedDiscountCode) {
      setShouldAutoApplyDiscount(false);
      return;
    }

    void applyDiscountCode(normalizedDiscountCode);
  }, [
    activeOrder,
    appliedDiscount?.code,
    applyDiscountCode,
    cartSnapshot,
    discountCode,
    isLoadingQuote,
    isValidatingDiscount,
    shippingAddress,
    shouldAutoApplyDiscount,
  ]);

  const requestQuote = useCallback(
    async (nextShippingAddress: CheckoutShippingAddress, signature?: string | null) => {
      if (!cartSnapshot) {
        quoteAbortController.current?.abort();
        setError('Your stack is empty.');
        setQuote(null);
        setSelectedShippingServiceId('');
        setIsLoadingQuote(false);
        return;
      }

      if (!isShippingAddressReady(nextShippingAddress)) {
        quoteAbortController.current?.abort();
        setError('Complete the shipping address to see delivery methods.');
        setQuote(null);
        setSelectedShippingServiceId('');
        setIsLoadingQuote(false);
        return;
      }

      if (signature) {
        lastQuoteRequestSignature.current = signature;
      }

      quoteAbortController.current?.abort();
      const controller = new AbortController();
      quoteAbortController.current = controller;
      setIsLoadingQuote(true);
      setError(null);

      try {
        // Include the pending affiliate discount code in the first quote so
        // the user sees it applied as soon as the shipping address is ready.
        const pendingCode = shouldAutoApplyDiscount && !appliedDiscount
          ? discountCode.trim().toUpperCase() || undefined
          : undefined;

        const session = await ensureCheckoutApiSession();
        const data = await repriceCheckoutApiSession({
          session,
          payload: buildCheckoutSessionPayload({
            shippingAddress: nextShippingAddress,
            ...(pendingCode ? { discountCode: pendingCode } : {}),
          }),
          fallbackMessage: 'Unable to fetch shipping options.',
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setQuote(data.quote);
        setSelectedShippingServiceId(current =>
          data.quote.services.some((service: CheckoutShippingService) => service.id === current)
            ? current
            : data.quote.selectedServiceId
        );

        // If we piggybacked the affiliate discount, mark it as applied.
        if (pendingCode && data.quote.discountAmount && Number(data.quote.discountAmount.amount) > 0) {
          const appliedCode = data.quote.discountCode || pendingCode;
          setDiscountCode(appliedCode);
          setAppliedDiscount({
            code: appliedCode,
            amount: data.quote.discountAmount.amount || '0.00',
            currencyCode: data.quote.discountAmount.currencyCode || data.quote.currencyCode,
          });
          setShouldAutoApplyDiscount(false);
        }
      } catch (quoteError: unknown) {
        if (quoteError instanceof Error && quoteError.name === 'AbortError') {
          return;
        }

        setError(quoteError instanceof Error ? quoteError.message : 'Unable to fetch shipping options.');
        setQuote(null);
        setSelectedShippingServiceId('');
      } finally {
        if (quoteAbortController.current === controller) {
          quoteAbortController.current = null;
          setIsLoadingQuote(false);
        }
      }
    },
    [appliedDiscount, buildCheckoutSessionPayload, cartSnapshot, discountCode, ensureCheckoutApiSession, repriceCheckoutApiSession, shouldAutoApplyDiscount]
  );

  const handleFetchQuote = async () => {
    await requestQuote(shippingAddress, quoteRequestSignature);
  };

  useEffect(() => {
    if (activeOrder || !quoteRequestSignature || isLoadingQuote) {
      return;
    }

    if (lastQuoteRequestSignature.current === quoteRequestSignature) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void requestQuote(shippingAddress, quoteRequestSignature);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [activeOrder, isLoadingQuote, quoteRequestSignature, requestQuote, shippingAddress]);

  const submitCheckoutPayment = useCallback(async () => {
    if (!selectedShippingServiceId) {
      setError('Select a shipping method before creating the payment.');
      return;
    }

    setIsCreatingPayment(true);
    setError(null);

    try {
      const session = await ensureCheckoutApiSession();
      const response = await fetch(
        `/api/checkout/v2/sessions/${encodeURIComponent(session.sessionId)}/finalize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...buildCheckoutSessionPayload({
              selectedShippingServiceId,
            }),
            sessionKey: session.sessionKey,
            version: session.version,
          }),
        },
      );

      const payload = await readJsonSafely(response);

      if (!response.ok) {
        console.error('[CHECKOUT] create-payment failed:', response.status, payload);
        throw new Error(getApiErrorMessage(payload, 'Unable to create payment.'));
      }

      const data = getApiData<{
        session: CheckoutApiSessionState;
        accessKey: string;
        order: CheckoutOrderPublic;
        redirectUrl?: string | null;
      }>(payload);
      const nextSession = toCheckoutApiSession(data?.session);
      if (nextSession) {
        setCheckoutApiSession(nextSession);
      }
      if (!data?.order || !data.accessKey) {
        throw new Error('Unable to create payment.');
      }

      setCheckoutSession({
        accessKey: data.accessKey,
        order: data.order,
      });

      if (isNowPaymentsOrder(data.order.payment)) {
        setPaymentCurrency(data.order.payment.paymentCurrency);
        setSourceWalletAddress(data.order.payment.sourceWalletAddress || '');
      } else {
        setSourceWalletAddress('');
      }
      if (data.order.totals.discountCode) {
        setDiscountCode(data.order.totals.discountCode);
      }

      syncCheckoutUrlImmediately(data.order.orderId, data.accessKey);

      // ShieldClimb card payments redirect to hosted checkout
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      updateCheckoutUrl(data.order.orderId, data.accessKey);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create payment.');
      setIsCardCheckoutOpen(false);
    } finally {
      setIsCreatingPayment(false);
    }
  }, [
    buildCheckoutSessionPayload,
    ensureCheckoutApiSession,
    selectedShippingServiceId,
    syncCheckoutUrlImmediately,
    updateCheckoutUrl,
  ]);

  const handleCreatePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (paymentMethod === 'card') {
      // Show info dialog first — useEffect below triggers the actual payment
      setIsCardCheckoutOpen(true);
      return;
    }

    await submitCheckoutPayment();
  };

  const cardCheckoutFired = useRef(false);

  useEffect(() => {
    if (!isCardCheckoutOpen) {
      cardCheckoutFired.current = false;
      return;
    }
    if (cardCheckoutFired.current) return;
    cardCheckoutFired.current = true;

    // Brief pause so the user can scan the info before redirecting
    const timer = window.setTimeout(() => {
      void submitCheckoutPayment();
    }, 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardCheckoutOpen]);

  const refreshStatus = async () => {
    if (!pollingId) return;

    setIsRefreshingStatus(true);

    try {
      const response = await fetch(
        `/api/checkout/v2/payments/${encodeURIComponent(
          pollingId
        )}/status?orderId=${encodeURIComponent(checkoutSession!.order.orderId)}&key=${encodeURIComponent(checkoutSession!.accessKey)}`,
        {
          cache: 'no-store',
        }
      );

      const payload = await readJsonSafely(response);
      const data = getApiData<{ order: CheckoutOrderPublic }>(payload);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to refresh payment status.'));
      }

      if (!data?.order) {
        throw new Error('Unable to refresh payment status.');
      }

      setCheckoutSession(current => (current ? { ...current, order: data.order } : current));
      setError(null);
    } catch (refreshError: unknown) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh payment status.');
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  useEffect(() => {
    if (!activeOrder) {
      previousPaymentSnapshot.current = null;
      return;
    }

    const nextSnapshot = {
      orderId: activeOrder.orderId,
      status: activeOrder.payment.status.toLowerCase(),
    };
    const previousSnapshot = previousPaymentSnapshot.current;

    previousPaymentSnapshot.current = nextSnapshot;

    if (
      !previousSnapshot ||
      previousSnapshot.orderId !== nextSnapshot.orderId ||
      previousSnapshot.status === nextSnapshot.status ||
      !isNowPaymentsOrder(activeOrder.payment) ||
      !NOWPAYMENTS_FAILURE_STATUSES.has(nextSnapshot.status)
    ) {
      return;
    }

    toast('Crypto payment not completed', {
      id: `checkout-payment-failure-${activeOrder.orderId}-${nextSnapshot.status}`,
      description: describeNowPaymentsFailure(nextSnapshot.status),
      duration: 9000,
      icon: <X className="size-4 text-[#B42318]" />,
      action: {
        label: 'Start new checkout',
        onClick: () => resetCheckoutSession(),
      },
      style: {
        background: '#F4F1EA',
        border: '1px solid rgba(11, 46, 47, 0.12)',
        color: '#0B2E2F',
        boxShadow: '0 20px 48px rgba(11, 46, 47, 0.12)',
      },
      classNames: {
        toast: 'rounded-[22px]',
        title: 'text-sm font-semibold tracking-[-0.015em]',
        description: 'text-xs leading-5 text-[#0B2E2F]/70',
        actionButton: '!rounded-full !border-0 !px-3.5 !py-2 !text-xs !font-semibold !shadow-none',
      },
      actionButtonStyle: {
        background: '#0B2E2F',
        color: '#F4F1EA',
      },
    });
  }, [activeOrder, resetCheckoutSession]);

  const copyText = async (label: string, value?: string | null) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
    } catch {
      setError(`Unable to copy ${label.toLowerCase()} right now.`);
    }
  };

  const clearCheckoutSession = () => {
    resetCheckoutSession();
  };

  const releaseActiveOrder = useCallback(
    async (nextPaymentMethod: 'card' | 'crypto') => {
      if (!checkoutSession || !activeOrder) return;

      setIsReleasingOrder(true);
      setError(null);

      try {
        const preservedShippingServiceId = activeOrder.shippingService?.id || '';
        const response = await fetch(
          `/api/checkout/v2/orders/${encodeURIComponent(activeOrder.orderId)}?key=${encodeURIComponent(
            checkoutSession.accessKey
          )}&reason=switch_payment`,
          {
            method: 'DELETE',
          }
        );
        const payload = await readJsonSafely(response);

        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, 'Unable to release the current payment attempt.'));
        }

        quoteAbortController.current?.abort();
        setCheckoutSession(null);
        setQuote(null);
        setSelectedShippingServiceId(preservedShippingServiceId);
        setPaymentMethod(nextPaymentMethod);
        lastQuoteRequestSignature.current = null;
        syncCheckoutUrlImmediately();
        updateCheckoutUrl();

        if (isShippingAddressReady(shippingAddress)) {
          await requestQuote(shippingAddress, quoteRequestSignature);
        }
      } catch (releaseError: unknown) {
        setError(
          releaseError instanceof Error
            ? releaseError.message
            : 'Unable to switch payment methods right now.'
        );
      } finally {
        setIsReleasingOrder(false);
      }
    },
    [activeOrder, checkoutSession, quoteRequestSignature, requestQuote, shippingAddress]
  );

  const paymentStatus = activeOrder?.payment.status || 'waiting';
  const nowPayment = activeOrder?.payment && isNowPaymentsOrder(activeOrder.payment) ? activeOrder.payment : null;
  const shieldClimbPayment = activeOrder?.payment && isShieldClimbOrder(activeOrder.payment) ? activeOrder.payment : null;
  const paymentExpiresAt = nowPayment ? formatDateTime(nowPayment.validUntil || nowPayment.expirationEstimateDate) : null;

  const canPlaceOrder = cart && cart.lines.length > 0 && selectedShippingServiceId && !isCreatingPayment;

  return (
    <div className="px-sides pb-16 pt-[5.75rem] md:pt-top-spacing">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Checkout</p>
          <h1 className="mt-1.5 text-[2rem] font-semibold tracking-tight md:text-[2.5rem]">Complete your order</h1>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_370px] xl:grid-cols-[minmax(0,1fr)_390px]">
          {/* ── Sidebar ── */}
          <aside className="order-first space-y-4 lg:order-last lg:sticky lg:top-top-spacing">
            <div className="overflow-hidden rounded-[26px] border border-border/70 bg-card shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              <div className="border-b border-border/70 px-4 py-3.5 md:px-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {activeOrder ? 'Order' : 'Your stack'}
                  </h2>
                  <span className="rounded-full bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                    {summaryItemCount} {summaryItemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 px-3.5 py-3.5 md:px-4 lg:max-h-[260px] lg:overflow-y-auto">
                {isLoadingOrder || isCartHydrating ? (
                  <div className="rounded-2xl border border-border/70 bg-background px-4 py-6 text-sm text-foreground/60">
                    Loading your stack...
                  </div>
                ) : summaryItems?.length ? (
                  summaryItems
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-sm text-foreground/60">
                    Your stack is empty.
                  </div>
                )}
              </div>

              <div className="border-t border-border/70 px-4 py-4 md:px-5">
                <div className="space-y-2">
                  <SummaryBlock label="Subtotal" value={formatPrice(summarySubtotal, summaryCurrencyCode)} />
                  {summaryDiscountLines.map(discount => (
                    <SummaryBlock
                      key={`${discount.kind}:${discount.code || discount.label}`}
                      label={discount.label}
                      value={`-${formatPrice(discount.amount.amount, discount.amount.currencyCode)}`}
                    />
                  ))}
                  <SummaryBlock
                    label={activeOrder?.shippingService?.name || selectedQuoteService?.name || 'Shipping'}
                    value={summaryShippingValue}
                  />
                  <SummaryBlock label="Tax" value={summaryTaxValue} />
                </div>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <SummaryBlock label="Total" value={formatPrice(summaryTotal, summaryCurrencyCode)} emphasized />
                </div>

                {activeOrder && nowPayment && !nowPayment.ipnCallbackEnabled ? (
                  <div className="mt-3 rounded-xl border border-border/70 bg-[#0B2E2F]/5 px-3 py-2.5 text-xs text-foreground/60">
                    Dev mode: status polling active (no IPN callbacks on localhost).
                  </div>
                ) : null}

                {process.env.NODE_ENV === 'development' && activeOrder ? (
                  <DevPaymentSimulator
                    orderId={activeOrder.orderId}
                    onSuccess={(updatedOrder) => {
                      setCheckoutSession(current => current ? { ...current, order: updatedOrder } : current);
                    }}
                  />
                ) : null}
              </div>
            </div>

            {!activeOrder && quickAddCatalog.length > 0 ? (
              <div className="rounded-[26px] border border-border/70 bg-card p-4 shadow-[0_20px_48px_rgba(11,46,47,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Add more</p>
                <div className="mt-3 space-y-2.5">
                  {quickAddCatalog.slice(0, 2).map(product => (
                    <CheckoutQuickAddCard key={product.id} product={product} />
                  ))}
                </div>
              </div>
            ) : activeOrder && paymentStatus !== 'finished' && paymentStatus !== 'paid' ? (
              <div className="rounded-[26px] border border-border/70 bg-card p-4 text-sm text-foreground/65">
                Need to make changes? Use{' '}
                <span className="font-semibold text-foreground">Edit order</span>{' '}
                above to go back.
              </div>
            ) : null}
          </aside>

          {/* ── Main content ── */}
          <section>
            {!activeOrder ? (
              <form onSubmit={handleCreatePayment}>
                <div className="mb-4">
                  <CheckoutAuthBanner />
                </div>
                <div className="rounded-[26px] border border-border/70 bg-card shadow-[0_20px_48px_rgba(11,46,47,0.04)]">

                  {/* ── 1. Contact ── */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-6 items-center justify-center rounded-full bg-[#0B2E2F] text-xs font-bold text-[#F4F1EA]">1</span>
                      <p className="text-base font-semibold">Contact</p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <ShippingField label="First name" name="firstName" value={shippingAddress.firstName} onChange={handleShippingChange} autoComplete="given-name" />
                      <ShippingField label="Last name" name="lastName" value={shippingAddress.lastName} onChange={handleShippingChange} autoComplete="family-name" />
                      <ShippingField label="Email" name="email" value={shippingAddress.email} onChange={handleShippingChange} type="email" autoComplete="email" />
                      <ShippingField label="Phone" name="phone" value={shippingAddress.phone} onChange={handleShippingChange} type="tel" autoComplete="tel" />
                    </div>
                  </div>

                  <div className="mx-4 border-t border-border/50 md:mx-5" />

                  {/* ── 2. Shipping address ── */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-6 items-center justify-center rounded-full bg-[#0B2E2F] text-xs font-bold text-[#F4F1EA]">2</span>
                      <p className="text-base font-semibold">Shipping address</p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <ShippingField label="Street address" name="address1" value={shippingAddress.address1} onChange={handleShippingChange} autoComplete="address-line1" />
                      </div>
                      <div className="md:col-span-2">
                        <ShippingField label="Apartment, suite, unit" name="address2" value={shippingAddress.address2} onChange={handleShippingChange} autoComplete="address-line2" placeholder="Optional" required={false} />
                      </div>
                      <ShippingField label="City" name="city" value={shippingAddress.city} onChange={handleShippingChange} autoComplete="address-level2" />
                      <ShippingField
                        label="State / Province / Region"
                        name="province"
                        value={shippingAddress.province}
                        onChange={handleShippingChange}
                        autoComplete="address-level1"
                        required={isProvinceRequired(shippingAddress.country)}
                        placeholder={isProvinceRequired(shippingAddress.country) ? undefined : 'Optional where not used'}
                      />
                      <ShippingField label="Postal / ZIP code" name="postalCode" value={shippingAddress.postalCode} onChange={handleShippingChange} autoComplete="postal-code" />
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Country</span>
                        <select
                          value={shippingAddress.country}
                          onChange={event => handleShippingChange('country', event.target.value)}
                          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
                        >
                          {countryOptions.map(country => (
                            <option key={country.code} value={country.code}>
                              {country.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="md:col-span-2 flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Delivery notes</span>
                        <textarea
                          value={shippingAddress.notes || ''}
                          onChange={event => handleShippingChange('notes', event.target.value)}
                          rows={2}
                          placeholder="Optional delivery instructions"
                          className="rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mx-4 border-t border-border/50 md:mx-5" />

                  {/* ── 3. Delivery method ── */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-6 items-center justify-center rounded-full bg-[#0B2E2F] text-xs font-bold text-[#F4F1EA]">3</span>
                        <p className="text-base font-semibold">Delivery method</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleFetchQuote}
                        disabled={isLoadingQuote || !isShippingAddressReady(shippingAddress)}
                        className="text-xs"
                      >
                        <RefreshCw className={cn('size-3', isLoadingQuote && 'animate-spin')} />
                        {isLoadingQuote ? 'Loading...' : 'Refresh rates'}
                      </Button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {quote ? (
                        quote.services.map(service => {
                          const isActive = (selectedShippingServiceId || quote.selectedServiceId) === service.id;
                          const carrierLogo = getShippingCarrierLogo(service.carrier);
                          const estimatedDelivery = formatEstimatedDeliveryDays(service.estimatedDays);
                          const optionCategory = formatShippingOptionCategory(service.quoteCategory);
                          return (
                            <label
                              key={service.id}
                              className={cn(
                                'flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-3.5 py-2.5 transition-colors',
                                isActive ? 'border-[#0B2E2F] bg-[#0B2E2F]/5' : 'border-border bg-background'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <input type="radio" className="accent-[#0B2E2F]" checked={isActive} onChange={() => setSelectedShippingServiceId(service.id)} />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold">{service.name}</p>
                                    {optionCategory ? (
                                      <span className="rounded-full bg-[#0B2E2F]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]">
                                        {optionCategory}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                    {service.carrier ? (
                                      carrierLogo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={carrierLogo}
                                          alt={service.carrier}
                                          className="h-4 w-auto max-w-[84px] object-contain opacity-80"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <p className="text-xs text-foreground/55">{service.carrier}</p>
                                      )
                                    ) : null}
                                    {estimatedDelivery ? (
                                      <p className="text-xs text-foreground/55">{estimatedDelivery}</p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <div className="text-sm font-semibold">
                                {renderShippingPrice(
                                  service.price.amount,
                                  service.price.currencyCode,
                                  service.originalPrice?.amount
                                )}
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <p className="rounded-xl border border-dashed border-border bg-background px-4 py-4 text-sm text-foreground/55">
                          Complete your address to see shipping rates.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mx-4 border-t border-border/50 md:mx-5" />

                  {/* ── 4. Payment ── */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-6 items-center justify-center rounded-full bg-[#0B2E2F] text-xs font-bold text-[#F4F1EA]">4</span>
                      <p className="text-base font-semibold">Payment</p>
                    </div>

                    <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                          paymentMethod === 'card'
                            ? 'border-[#0B2E2F] bg-[#0B2E2F]/5 ring-1 ring-[#0B2E2F]'
                            : 'border-border bg-background hover:border-[#0B2E2F]/30'
                        )}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
                          <CreditCard className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">Debit / Credit Card</p>
                          <PaymentBrandIcons className="mt-1" />
                        </div>
                        <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', paymentMethod === 'card' ? 'border-[#0B2E2F]' : 'border-foreground/20')}>
                          {paymentMethod === 'card' && <div className="size-2.5 rounded-full bg-[#0B2E2F]" />}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('crypto')}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                          paymentMethod === 'crypto'
                            ? 'border-[#0B2E2F] bg-[#0B2E2F]/5 ring-1 ring-[#0B2E2F]'
                            : 'border-border bg-background hover:border-[#0B2E2F]/30'
                        )}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
                          <Wallet className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">Direct Crypto</p>
                            <span className="rounded-full bg-[#0B2E2F] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F4F1EA]">Save 5%</span>
                          </div>
                          <p className="text-xs text-foreground/55">BTC, ETH, USDT, more</p>
                        </div>
                        <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', paymentMethod === 'crypto' ? 'border-[#0B2E2F]' : 'border-foreground/20')}>
                          {paymentMethod === 'crypto' && <div className="size-2.5 rounded-full bg-[#0B2E2F]" />}
                        </div>
                      </button>

                      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-background/40 px-3.5 py-3 opacity-55">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground/40">
                          <Landmark className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground/50">ACH Bank Transfer</p>
                            <span className="rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground/40">Coming soon</span>
                          </div>
                          <p className="text-xs text-foreground/35">Direct bank-to-bank payments</p>
                        </div>
                      </div>
                    </div>

                    {paymentMethod === 'crypto' ? (
                      <div className="mt-3 space-y-4">
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-foreground/45">Select network</p>
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_PAYMENT_CURRENCIES.map(currency => {
                              const isActive = paymentCurrency === currency;
                              return (
                                <button
                                  key={currency}
                                  type="button"
                                  onClick={() => setPaymentCurrency(currency)}
                                  className={cn(
                                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                    isActive
                                      ? 'border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]'
                                      : 'border-[#0B2E2F]/10 bg-white text-[#0B2E2F] hover:bg-[#ece9e2]'
                                  )}
                                >
                                  {formatTicker(currency)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                          <Label
                            htmlFor="sourceWalletAddress"
                            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/52"
                          >
                            Paying from wallet
                          </Label>
                          <Input
                            id="sourceWalletAddress"
                            type="text"
                            value={sourceWalletAddress}
                            onChange={e => setSourceWalletAddress(e.target.value)}
                            placeholder="Optional sender wallet address"
                            className="mt-2 h-11 w-full rounded-2xl border-[#0B2E2F]/10 bg-white px-4 text-sm shadow-none placeholder:text-foreground/35 focus-visible:ring-2 focus-visible:ring-[#0B2E2F]/15"
                          />
                          <p className="mt-2 text-xs leading-5 text-foreground/45">
                            Optional. Used only as a reminder and for support context. We still
                            generate a fresh deposit address for every order.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="px-1 text-xs text-foreground/45">
                          Want to save 5%? Choose <button type="button" onClick={() => setPaymentMethod('crypto')} className="font-semibold text-[#0B2E2F] underline underline-offset-2">Direct Crypto</button> above and pay from your wallet.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mx-4 border-t border-border/50 md:mx-5" />

                  {/* ── 5. Discount code ── */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-center gap-2.5">
                      <Tag className="size-4 text-foreground/45" />
                      <p className="text-sm font-semibold">Discount code</p>
                    </div>

                    {appliedDiscount ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#0B2E2F]/20 bg-[#0B2E2F]/5 px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="size-4 text-[#0B2E2F]" />
                          <div>
                            <p className="text-sm font-semibold text-[#0B2E2F]">{appliedDiscount.code}</p>
                            <p className="text-xs text-foreground/60">
                              -{formatPrice(appliedDiscount.amount, appliedDiscount.currencyCode)} off
                            </p>
                          </div>
                        </div>
                        <button type="button" onClick={handleRemoveDiscount} className="flex size-7 items-center justify-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground" aria-label="Remove discount code">
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={discountCode}
                            onChange={event => handleDiscountCodeChange(event.target.value)}
                            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); handleApplyDiscount(); } }}
                            placeholder="Enter code"
                            disabled={isValidatingDiscount}
                            className="h-10 flex-1 rounded-xl border border-border bg-background px-3.5 text-sm uppercase text-foreground outline-none transition-colors focus:border-[#0B2E2F] disabled:opacity-50"
                          />
                          <Button type="button" variant="outline" onClick={handleApplyDiscount} disabled={!discountCode.trim() || isValidatingDiscount} className="h-10 shrink-0">
                            {isValidatingDiscount ? <Loader2 className="size-4 animate-spin" /> : 'Apply'}
                          </Button>
                        </div>
                        {discountError && <p className="mt-1.5 text-xs text-red-600">{discountError}</p>}
                      </div>
                    )}
                  </div>

                  {/* ── Place order CTA ── */}
                  <div className="border-t border-border/50 p-4 md:p-5">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!canPlaceOrder}
                      className="flex w-full items-center justify-center gap-2.5"
                      style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                    >
                      {isCreatingPayment ? (
                        <>
                          <Loader2 className="size-5 animate-spin" />
                          Placing order...
                        </>
                      ) : paymentMethod === 'card' ? (
                        <>
                          <ShieldCheck className="size-5" />
                          Secure checkout
                        </>
                      ) : (
                        <>
                          Place order
                          <ArrowRight className="size-5" />
                        </>
                      )}
                    </Button>
                    {paymentMethod === 'card' ? (
                      <p className="mt-3 text-center text-xs text-foreground/50">
                        Pay with your card as normal on a secure hosted page. Transaction settles via blockchain for speed.
                      </p>
                    ) : (
                      <p className="mt-3 text-center text-xs text-foreground/50">
                        You&apos;ll receive a {formatTicker(paymentCurrency)} deposit address in the next step.{summaryCryptoDiscountAmount ? ` Direct crypto savings of ${formatPrice(summaryCryptoDiscountAmount, summaryCurrencyCode)} applied automatically.` : ' 5% discount applied automatically.'}
                      </p>
                    )}
                  </div>
                </div>
              </form>
            ) : (
              /* ── Post-order: payment view ── */
              <div className="space-y-5">
                {(paymentStatus === 'finished' || paymentStatus === 'paid') ? (
                  /* ── Order confirmed view ── */
                  <div className="space-y-5">
                    <div className="rounded-[26px] border border-border/70 bg-card p-5 shadow-[0_20px_48px_rgba(11,46,47,0.04)] md:p-8">
                      <div className="flex flex-col items-center text-center">
                        <div className="flex size-14 items-center justify-center rounded-full bg-[#0B2E2F]">
                          <CheckCircle2 className="size-7 text-[#F4F1EA]" />
                        </div>
                        <h2 className="mt-4 text-2xl font-semibold tracking-tight">Order confirmed</h2>
                        <p className="mt-2 text-sm text-foreground/60">
                          Order {activeOrder.swell.orderNumber || activeOrder.swell.orderId} has been placed successfully.
                        </p>
                        <p className="mt-1 text-sm text-foreground/60">
                          A confirmation email will be sent to{' '}
                          <span className="font-medium text-foreground">{activeOrder.shippingAddress.email}</span>.
                        </p>
                      </div>

                      {/* ── Order items ── */}
                      <div className="mt-6 space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Items ordered</p>
                        <div className="divide-y divide-border/50">
                          {activeOrder.lines.map(line => (
                            <div key={line.id} className="flex items-center gap-3 py-3">
                              {line.imageUrl ? (
                                <img src={line.imageUrl} alt={line.productTitle} className="size-12 rounded-lg border border-border/40 object-cover" />
                              ) : (
                                <div className="flex size-12 items-center justify-center rounded-lg border border-border/40 bg-background text-xs text-foreground/30">img</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{line.productTitle}</p>
                                {line.variantTitle ? (
                                  <p className="text-xs text-foreground/50">{line.variantTitle}</p>
                                ) : null}
                                <p className="text-xs text-foreground/50">Qty: {line.quantity}</p>
                              </div>
                              <p className="text-sm font-semibold">{formatPrice(line.lineTotal.amount, line.lineTotal.currencyCode)}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Order details grid ── */}
                      <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Shipping to</p>
                          <div className="mt-2 space-y-1 text-sm">
                            <p className="font-medium">{activeOrder.shippingAddress.firstName} {activeOrder.shippingAddress.lastName}</p>
                            <p className="text-foreground/65">{activeOrder.shippingAddress.address1}</p>
                            {activeOrder.shippingAddress.address2 ? <p className="text-foreground/65">{activeOrder.shippingAddress.address2}</p> : null}
                            <p className="text-foreground/65">{activeOrder.shippingAddress.city}, {activeOrder.shippingAddress.province} {activeOrder.shippingAddress.postalCode}</p>
                          </div>
                          {activeOrder.shippingService ? (
                            <div className="mt-3 rounded-lg bg-[#0B2E2F]/5 px-3 py-2 text-xs">
                              <p className="font-semibold">{activeOrder.shippingService.name}</p>
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Order summary</p>
                          <div className="mt-2 space-y-1.5 text-sm">
                            <div className="flex justify-between">
                              <span className="text-foreground/65">Subtotal</span>
                              <span>{formatPrice(activeOrder.totals.subtotalAmount.amount, activeOrder.totals.subtotalAmount.currencyCode)}</span>
                            </div>
                            {activeOrder.totals.discountAmount && Number(activeOrder.totals.discountAmount.amount) > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-foreground/65">Discount</span>
                                <span>-{formatPrice(activeOrder.totals.discountAmount.amount, activeOrder.totals.discountAmount.currencyCode)}</span>
                              </div>
                            ) : null}
                            {activeOrder.totals.shippingAmount ? (
                              <div className="flex justify-between">
                                <span className="text-foreground/65">Shipping</span>
                                <span>{Number(activeOrder.totals.shippingAmount.amount) === 0 ? 'Free' : formatPrice(activeOrder.totals.shippingAmount.amount, activeOrder.totals.shippingAmount.currencyCode)}</span>
                              </div>
                            ) : null}
                            {activeOrder.totals.taxAmount && Number(activeOrder.totals.taxAmount.amount) > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-foreground/65">Tax</span>
                                <span>{formatPrice(activeOrder.totals.taxAmount.amount, activeOrder.totals.taxAmount.currencyCode)}</span>
                              </div>
                            ) : null}
                            <div className="flex justify-between border-t border-border/50 pt-1.5 font-semibold">
                              <span>Total</span>
                              <span>{formatPrice(activeOrder.totals.totalAmount.amount, activeOrder.totals.totalAmount.currencyCode)}</span>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-[#0B2E2F]/5 px-2.5 py-1.5 text-xs">
                              <p className="text-foreground/45">Method</p>
                              <p className="font-semibold">{shieldClimbPayment ? 'Card' : 'Crypto'}</p>
                            </div>
                            <div className="rounded-lg bg-[#0B2E2F]/5 px-2.5 py-1.5 text-xs">
                              <p className="text-foreground/45">Status</p>
                              <p className="font-semibold capitalize">{formatPaymentStatus(paymentStatus)}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Actions ── */}
                      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                        <Link
                          href={`/order/${encodeURIComponent(activeOrder.orderId)}?key=${encodeURIComponent(checkoutSession!.accessKey)}`}
                          className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors"
                          style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                        >
                          View order status
                          <ArrowRight className="size-4" />
                        </Link>
                        <Button type="button" variant="outline" size="sm" onClick={clearCheckoutSession}>
                          Order more
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Payment pending view ── */
                  <div className="rounded-[26px] border border-border/70 bg-card p-4 shadow-[0_20px_48px_rgba(11,46,47,0.04)] md:p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-semibold tracking-tight">Complete payment</h2>
                          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]', paymentStatusTone(paymentStatus))}>
                            {formatPaymentStatus(paymentStatus)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground/60">
                          Order {activeOrder.swell.orderNumber || activeOrder.swell.orderId}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={refreshStatus} disabled={isRefreshingStatus}>
                          <RefreshCw className={cn('size-3.5', isRefreshingStatus && 'animate-spin')} />
                          Refresh
                        </Button>
                        {!isTerminalPaymentStatus(paymentStatus) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => releaseActiveOrder(shieldClimbPayment ? 'crypto' : 'card')}
                            disabled={isReleasingOrder}
                          >
                            {isReleasingOrder ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                Switching...
                              </>
                            ) : (
                              'Choose different payment'
                            )}
                          </Button>
                        ) : (
                          <Button type="button" variant="ghost" size="sm" onClick={clearCheckoutSession}>
                            Start new checkout
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_200px]">
                      <div className="space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4 md:p-5">
                        {/* ── ShieldClimb (card) payment view ── */}
                        {shieldClimbPayment ? (
                          <>
                            <div className="rounded-2xl border border-[#0B2E2F]/15 bg-white px-5 py-5">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="flex size-9 items-center justify-center rounded-full bg-[#0B2E2F]">
                                  <CreditCard className="size-4 text-[#F4F1EA]" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold">Complete your card payment</p>
                                  <p className="text-xs text-foreground/50">Secure hosted checkout</p>
                                </div>
                              </div>
                              <a
                                href={shieldClimbPayment.redirectUrl}
                                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                                style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                              >
                                <ShieldCheck className="size-4" />
                                Pay now
                                <ArrowRight className="size-4" />
                              </a>
                              <p className="mt-3 text-center text-xs leading-4 text-foreground/45">
                                Your card is charged normally. The transaction settles through blockchain for speed and security.
                              </p>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Reference</p>
                                <p className="mt-1 text-sm font-semibold">{activeOrder.orderId}</p>
                              </div>
                              <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Method</p>
                                <p className="mt-1 text-sm font-semibold">Debit / Credit Card</p>
                              </div>
                            </div>
                          </>
                        ) : null}

                        {/* ── NOWPayments (crypto) payment view ── */}
                        {nowPayment ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-border/60 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Send exactly</p>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <p className="text-xl font-semibold tracking-tight">
                                    {nowPayment.payAmount} {formatTicker(nowPayment.paymentCurrency)}
                                  </p>
                                  <button type="button" onClick={() => copyText('Amount', nowPayment.payAmount)} className="rounded-full border border-border bg-background p-1.5 text-foreground/70 transition-colors hover:text-foreground" aria-label="Copy payment amount">
                                    <Copy className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-border/60 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Network</p>
                                <p className="mt-2 text-xl font-semibold tracking-tight">
                                  {nowPayment.network ? nowPayment.network.toUpperCase() : formatTicker(nowPayment.paymentCurrency)}
                                </p>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border/60 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Deposit address</p>
                                  <p className="mt-2 break-all text-sm leading-6">{nowPayment.payAddress}</p>
                                </div>
                                <button type="button" onClick={() => copyText('Address', nowPayment.payAddress)} className="rounded-full border border-border bg-background p-1.5 text-foreground/70 transition-colors hover:text-foreground" aria-label="Copy payment address">
                                  <Copy className="size-3.5" />
                                </button>
                              </div>
                            </div>

                            {nowPayment.sourceWalletAddress ? (
                              <div className="rounded-2xl border border-border/60 bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Paying from</p>
                                    <p className="mt-2 break-all text-sm leading-6">{nowPayment.sourceWalletAddress}</p>
                                  </div>
                                  <button type="button" onClick={() => copyText('Wallet', nowPayment.sourceWalletAddress)} className="rounded-full border border-border bg-background p-1.5 text-foreground/70 transition-colors hover:text-foreground" aria-label="Copy source wallet address">
                                    <Copy className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {nowPayment.payinExtraId ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <p className="font-semibold">Memo / destination tag required</p>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <p className="break-all">{nowPayment.payinExtraId}</p>
                                  <button type="button" onClick={() => copyText('Memo', nowPayment.payinExtraId)} className="rounded-full border border-amber-200 bg-white p-1.5 text-amber-900" aria-label="Copy memo">
                                    <Copy className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Reference</p>
                                <p className="mt-1 text-sm font-semibold">{activeOrder.orderId}</p>
                              </div>
                              <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Expires</p>
                                <p className="mt-1 text-sm font-semibold">{paymentExpiresAt || 'Refresh to check'}</p>
                              </div>
                            </div>
                          </>
                        ) : null}

                        {copiedValue ? <p className="text-sm font-medium text-[#0B2E2F]">{copiedValue} copied.</p> : null}
                      </div>

                      <div className="space-y-4">
                        {nowPayment?.payAddress ? (
                          <div className="rounded-2xl border border-border/70 bg-white p-4 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Scan to pay</p>
                            <div className="mt-3 flex justify-center">
                              <QRCodeSVG value={nowPayment.payAddress} size={140} />
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-2xl border border-border/70 bg-[#0B2E2F] p-3.5 text-[#F4F1EA]">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/60">Shipping to</p>
                          <div className="mt-3 space-y-1.5 text-sm leading-6">
                            <p className="font-semibold">{activeOrder.shippingAddress.firstName} {activeOrder.shippingAddress.lastName}</p>
                            <p>{activeOrder.shippingAddress.address1}</p>
                            {activeOrder.shippingAddress.address2 ? <p>{activeOrder.shippingAddress.address2}</p> : null}
                            <p>{activeOrder.shippingAddress.city}, {activeOrder.shippingAddress.province} {activeOrder.shippingAddress.postalCode}</p>
                          </div>
                          {activeOrder.shippingService ? (
                            <div className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs">
                              <p className="font-semibold">{activeOrder.shippingService.name}</p>
                              <p className="text-[#F4F1EA]/80">{formatPrice(activeOrder.shippingService.price.amount, activeOrder.shippingService.price.currencyCode)}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Card checkout info overlay ── */}
      <Dialog open={isCardCheckoutOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-[380px] gap-0 rounded-[26px] border border-border/70 bg-card p-0 shadow-[0_20px_48px_rgba(11,46,47,0.08)] [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Secure checkout</DialogTitle>
          </DialogHeader>

          {/* Header */}
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-[#0B2E2F]">
                <Lock className="size-[18px] text-[#F4F1EA]" />
              </div>
              <div>
                <p className="text-[15px] font-semibold tracking-tight text-[#0B2E2F]">Connecting to payment</p>
                <p className="text-xs text-foreground/50">Secure hosted checkout</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border/60 bg-background px-4 py-3.5">
              <p className="text-[13px] leading-5 text-foreground/70">You&apos;ll pay with your card as normal. The transaction is settled through blockchain, which keeps processing <span className="font-medium text-foreground">fast and fees low</span>. Nothing extra is needed from you.</p>
            </div>
          </div>

          {/* Info items */}
          <div className="px-6 pb-5">
            <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-background">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]">
                  <CreditCard className="size-3 text-[#F4F1EA]" />
                </div>
                <p className="text-[13px] leading-5 text-foreground/70">Your card details stay with the payment provider and are <span className="font-medium text-foreground">never stored by Revalin</span>.</p>
              </div>
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]">
                  <UserCheck className="size-3 text-[#F4F1EA]" />
                </div>
                <p className="text-[13px] leading-5 text-foreground/70">The provider may ask to <span className="font-medium text-foreground">verify your identity</span> — this is a standard security step.</p>
              </div>
            </div>
          </div>

          {/* Loading footer */}
          <div className="border-t border-border/50 px-6 py-4">
            <div className="flex items-center justify-center gap-2.5">
              <Loader2 className="size-4 animate-spin text-[#0B2E2F]" />
              <span className="text-sm font-medium text-[#0B2E2F]">Setting up your payment&hellip;</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
