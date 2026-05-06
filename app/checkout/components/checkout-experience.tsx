'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, Copy, CreditCard, FlaskConical, Landmark, Lock, Loader2, RefreshCw, Send, ShieldCheck, Tag, Truck, Upload, UserCheck, Wallet, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type Ref } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { CartItemCard } from '@/components/cart/cart-item';
import { useCart } from '@/components/cart/cart-context';
import { AddToCartButton } from '@/components/cart/add-to-cart';
import { VariantOptionSelectorComponent, useProductImages } from '@/components/products/variant-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  QUICK_PAYMENT_CURRENCIES,
  SHIELDCLIMB_PUBLIC_POLLING_ID,
  SHIPPING_COUNTRIES,
  isTerminalPaymentStatus,
} from '@/lib/checkout/constants';
import { ADMIN_DISABLED_SHIPPING_SERVICE_ID } from '@/lib/checkout/admin-shipping';
import {
  clearStoredCheckoutResume as clearStoredCheckoutResumeValue,
  isCheckoutResumeExpired,
  persistCheckoutResume,
  readStoredCheckoutResume,
  type CheckoutResume,
} from '@/lib/checkout/client-resume';
import {
  getCardProcessingUnavailableMessage,
} from '@/lib/checkout/payment-method-rules';
import type {
  CheckoutAppliedDiscount,
  CheckoutOrderPublic,
  CheckoutShippingAddress,
  CheckoutShippingService,
  InteracPaymentData,
  BankfulPublicPaymentData,
  ShieldClimbPublicPaymentData,
  NowPaymentsPublicPaymentData,
  SquarePublicPaymentData,
} from '@/lib/checkout/types';
import {
  calculateCheckoutPricing,
  getCheckoutDiscounts,
  isCheckoutPaymentMethodDiscount,
  isDirectPaymentDiscountMethod,
} from '@/lib/checkout/pricing';
import { cn } from '@/lib/utils';
import type { CartItem, Product } from '@/lib/swell/types';
import { formatPrice, getDiscountPercentage, getDisplayCompareAtPrice, getDisplayPrice } from '@/lib/swell/utils';
import { useAuthSession } from '@/components/auth/session-provider';
import { CheckoutAuthBanner } from './checkout-auth-banner';
import { getApiData, getApiErrorMessage, readJsonSafely } from '@/lib/api/client';
import { getInventoryState, HIGH_DEMAND_SHIPPING_LABEL } from '@/lib/inventory';
import { useLazyProductAvailability } from '@/lib/catalog/availability-client';

type CheckoutExperienceProps = {
  cardProcessingEnabled: boolean;
  cardSquareFallbackEnabled: boolean;
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
  paymentMethod?: 'card' | 'crypto' | 'interac' | 'square';
  services: CheckoutShippingService[];
  selectedServiceId: string;
};

type SquareFallbackUnlock = {
  reason: string;
  message: string;
};

type CheckoutCartSnapshot = {
  currencyCode: string;
  lines: CheckoutOrderPublic['lines'];
};

type CheckoutBillingAddress = Pick<
  CheckoutShippingAddress,
  'address1' | 'address2' | 'city' | 'province' | 'postalCode' | 'country'
>;

type AppliedDiscount = {
  code: string;
  amount: string;
  currencyCode: string;
  rate?: number;
};

function getCartItemFulfillmentEstimate(item: CartItem) {
  const fallbackInventory = getInventoryState(item.merchandise.product);
  const baseEstimate = item.fulfillmentEstimate || {
    label: fallbackInventory.shippingLeadTimeLabel,
    availableToShipNow: fallbackInventory.availableQuantity || 0,
    isHighDemand: fallbackInventory.isHighDemand,
  };

  if (baseEstimate.isHighDemand || baseEstimate.availableToShipNow >= item.quantity) {
    return baseEstimate;
  }

  return {
    ...baseEstimate,
    label: HIGH_DEMAND_SHIPPING_LABEL,
    isHighDemand: true,
  };
}

function getQuoteCouponDiscountAmount(quote: CheckoutQuote) {
  const couponDiscounts = (quote.discounts || []).filter(
    discount => discount.kind === 'coupon',
  );
  const couponAmount = couponDiscounts.reduce(
    (total, discount) => total + Number(discount.amount.amount || 0),
    0,
  );

  if (couponAmount > 0) {
    const couponRate = couponDiscounts.find(
      discount => typeof discount.rate === 'number' && Number.isFinite(discount.rate) && discount.rate > 0,
    )?.rate;

    return {
      amount: couponAmount.toFixed(2),
      currencyCode: couponDiscounts[0]?.amount.currencyCode || quote.currencyCode,
      rate: couponRate,
    };
  }

  if (quote.discounts?.length || isDirectPaymentDiscountMethod(quote.paymentMethod)) {
    return {
      amount: '0.00',
      currencyCode: quote.discountAmount?.currencyCode || quote.currencyCode,
    };
  }

  return {
    amount: quote.discountAmount?.amount || '0.00',
    currencyCode: quote.discountAmount?.currencyCode || quote.currencyCode,
  };
}

function formatAppliedDiscountSummary(discount: AppliedDiscount) {
  const amount = `-${formatPrice(discount.amount, discount.currencyCode)}`;

  if (typeof discount.rate === 'number' && Number.isFinite(discount.rate) && discount.rate > 0) {
    const percent = discount.rate * 100;
    const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;
    const percentLabel = Number.isInteger(rounded)
      ? rounded.toFixed(0)
      : rounded.toFixed(2).replace(/\.?0+$/, '');

    return `${percentLabel}% off (${amount})`;
  }

  return `${amount} off`;
}

function getCheckoutErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

function isInvalidDiscountMessage(message: string) {
  return /discount code is invalid|invalid discount code|expired/i.test(message);
}

type CheckoutDraft = {
  shippingAddress: CheckoutShippingAddress;
  paymentMethod: 'crypto' | 'card' | 'interac' | 'square';
  paymentCurrency: string;
  sourceWalletAddress: string;
  interacSenderEmail: string;
  interacSenderName: string;
  interacHasSecurityQuestion: boolean;
  interacSecurityQuestion: string;
  interacSecurityAnswer: string;
  shipmentProtection: boolean;
  adminShippingDisabled: boolean;
  discountCode: string;
  appliedDiscount: AppliedDiscount | null;
  apiSession: CheckoutApiSession | null;
  cartSignature: string | null;
};

const CHECKOUT_DRAFT_KEY = 'revalin_checkout_draft';
const SHIPPING_DRAFT_KEY = 'revalin_checkout_shipping_draft';
const BRAND_FETCH_QUERY = 'c=1dxbfHSJFAPEGdCLU4o5B';
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GooglePlaceResult = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  name?: string;
};

type GooglePlacesAutocomplete = {
  addListener: (eventName: 'place_changed', handler: () => void) => { remove: () => void };
  getPlace: () => GooglePlaceResult;
};

type GooglePlacesApi = {
  maps?: {
    places?: {
      Autocomplete: new (
        input: HTMLInputElement,
        options?: {
          fields?: string[];
          types?: string[];
          componentRestrictions?: {
            country: string[];
          };
        },
      ) => GooglePlacesAutocomplete;
    };
    event?: {
      clearInstanceListeners: (instance: GooglePlacesAutocomplete) => void;
    };
  };
};

let googlePlacesScriptPromise: Promise<void> | null = null;

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

const DEFAULT_BILLING_ADDRESS: CheckoutBillingAddress = {
  address1: '',
  address2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'CA',
};

function normalizeShippingAddressDraft(value: Partial<CheckoutShippingAddress> | null | undefined): CheckoutShippingAddress {
  return {
    ...DEFAULT_SHIPPING_ADDRESS,
    ...(value || {}),
  };
}

function billingAddressFromShipping(address: CheckoutShippingAddress): CheckoutBillingAddress {
  return {
    address1: address.address1,
    address2: address.address2 || '',
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    country: address.country,
  };
}

function normalizeBillingAddressForPayment(address: CheckoutBillingAddress): CheckoutBillingAddress {
  return {
    address1: address.address1.trim(),
    address2: address.address2?.trim() || '',
    city: address.city.trim(),
    province: address.province.trim(),
    postalCode: address.postalCode.trim(),
    country: address.country.trim().toUpperCase(),
  };
}

function getGooglePlacesApi() {
  return (window as Window & { google?: GooglePlacesApi }).google;
}

function loadGooglePlacesScript(apiKey: string) {
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured.'));
  }

  const googlePlaces = getGooglePlacesApi()?.maps?.places;
  if (googlePlaces?.Autocomplete) {
    return Promise.resolve();
  }

  if (!googlePlacesScriptPromise) {
    googlePlacesScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-revalin-google-places="true"]',
      );

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Unable to load Google Places.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: apiKey,
        libraries: 'places',
      });

      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.dataset.revalinGooglePlaces = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Google Places.'));
      document.head.appendChild(script);
    });
  }

  return googlePlacesScriptPromise;
}

function getAddressComponent(
  components: GoogleAddressComponent[],
  type: string,
  name: 'long_name' | 'short_name' = 'long_name',
) {
  return components.find(component => component.types.includes(type))?.[name] || '';
}

function buildShippingAddressFromPlace(
  place: GooglePlaceResult,
  current: CheckoutShippingAddress,
): CheckoutShippingAddress | null {
  const components = place.address_components || [];
  if (components.length === 0) {
    return null;
  }

  const streetNumber = getAddressComponent(components, 'street_number');
  const route = getAddressComponent(components, 'route');
  const address1 = [streetNumber, route].filter(Boolean).join(' ').trim();
  const city =
    getAddressComponent(components, 'locality') ||
    getAddressComponent(components, 'postal_town') ||
    getAddressComponent(components, 'sublocality') ||
    getAddressComponent(components, 'administrative_area_level_2');
  const province = getAddressComponent(components, 'administrative_area_level_1', 'short_name');
  const postalCode = [
    getAddressComponent(components, 'postal_code'),
    getAddressComponent(components, 'postal_code_suffix'),
  ]
    .filter(Boolean)
    .join('-');
  const country = getAddressComponent(components, 'country', 'short_name');
  const subpremise = getAddressComponent(components, 'subpremise');

  return {
    ...current,
    address1: address1 || place.name || current.address1,
    address2: subpremise || current.address2,
    city: city || current.city,
    province: province || current.province,
    postalCode: postalCode || current.postalCode,
    country: country || current.country,
  };
}

function parseCheckoutDraft(rawDraft: string | null): CheckoutDraft | null {
  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as Partial<CheckoutDraft> | null;

    if (!parsed || typeof parsed !== 'object') return null;

    return {
      shippingAddress: normalizeShippingAddressDraft(parsed.shippingAddress),
      paymentMethod:
        parsed.paymentMethod === 'card'
          ? 'card'
          : parsed.paymentMethod === 'interac'
            ? 'interac'
            : parsed.paymentMethod === 'square'
              ? 'square'
              : 'crypto',
      paymentCurrency:
        typeof parsed.paymentCurrency === 'string' && QUICK_PAYMENT_CURRENCIES.includes(parsed.paymentCurrency)
          ? parsed.paymentCurrency
          : QUICK_PAYMENT_CURRENCIES[0],
      sourceWalletAddress:
        typeof parsed.sourceWalletAddress === 'string' ? parsed.sourceWalletAddress : '',
      interacSenderEmail:
        typeof parsed.interacSenderEmail === 'string' ? parsed.interacSenderEmail : '',
      interacSenderName:
        typeof parsed.interacSenderName === 'string' ? parsed.interacSenderName : '',
      interacHasSecurityQuestion: parsed.interacHasSecurityQuestion === true,
      interacSecurityQuestion:
        typeof parsed.interacSecurityQuestion === 'string' ? parsed.interacSecurityQuestion : '',
      interacSecurityAnswer:
        typeof parsed.interacSecurityAnswer === 'string' ? parsed.interacSecurityAnswer : '',
      shipmentProtection: parsed.shipmentProtection === true,
      adminShippingDisabled: parsed.adminShippingDisabled === true,
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
              rate:
                typeof parsed.appliedDiscount.rate === 'number' &&
                Number.isFinite(parsed.appliedDiscount.rate) &&
                parsed.appliedDiscount.rate > 0
                  ? parsed.appliedDiscount.rate
                  : undefined,
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
      cartSignature:
        typeof parsed.cartSignature === 'string' ? parsed.cartSignature : null,
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

function getApiErrorDetails(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object' || !('details' in error)) {
    return null;
  }

  const details = (error as { details?: unknown }).details;
  return details && typeof details === 'object'
    ? (details as Record<string, unknown>)
    : null;
}

function getSquareFallbackUnlockFromError(
  payload: unknown,
  message: string,
): SquareFallbackUnlock | null {
  const details = getApiErrorDetails(payload);
  if (!details || details.squareFallbackEligible !== true) {
    return null;
  }

  if (details.fallbackPaymentMethod !== 'square') {
    return null;
  }

  return {
    reason:
      typeof details.reason === 'string'
        ? details.reason
        : typeof details.code === 'string'
          ? details.code
          : 'bankful_failed',
    message,
  };
}

function isDraftOutOfDateResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  const details = getApiErrorDetails(payload);
  return Boolean(
    error &&
      typeof error === 'object' &&
    (error as { code?: unknown }).code === 'conflict' &&
      details &&
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

function buildComparableCheckoutLinesSignature(
  args:
    | {
        currencyCode: string;
        lines: Array<{
          merchandiseId: string;
          quantity: number;
          lineTotal?: { amount: string } | null;
        }>;
      }
    | null
    | undefined,
) {
  if (!args) {
    return 'empty';
  }

  return JSON.stringify({
    currencyCode: args.currencyCode,
    lines: args.lines
      .map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
        lineTotal: line.lineTotal?.amount || '',
      }))
      .sort((left, right) => left.merchandiseId.localeCompare(right.merchandiseId)),
  });
}

function PaymentBrandIcons({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://cdn.brandfetch.io/idhem73aId/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Visa" className="h-3 max-w-[28px] object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://cdn.brandfetch.io/idFw8DodCr/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Mastercard" className="h-3.5 max-w-[22px] object-contain" />
    </div>
  );
}

function isShieldClimbOrder(payment: CheckoutOrderPublic['payment']): payment is ShieldClimbPublicPaymentData {
  return payment.provider === 'shieldclimb';
}

function isNowPaymentsOrder(payment: CheckoutOrderPublic['payment']): payment is NowPaymentsPublicPaymentData {
  return payment.provider === 'nowpayments';
}

function isInteracOrder(payment: CheckoutOrderPublic['payment']): payment is InteracPaymentData {
  return payment.provider === 'interac';
}

function isBankfulOrder(payment: CheckoutOrderPublic['payment']): payment is BankfulPublicPaymentData {
  return payment.provider === 'bankful';
}

function isSquareOrder(payment: CheckoutOrderPublic['payment']): payment is SquarePublicPaymentData {
  return payment.provider === 'square';
}

function getPollingId(payment: CheckoutOrderPublic['payment']): string | undefined {
  if (isShieldClimbOrder(payment)) return SHIELDCLIMB_PUBLIC_POLLING_ID;
  if (isNowPaymentsOrder(payment)) return payment.paymentId;
  if (isBankfulOrder(payment)) return payment.transactionRecordId || payment.attemptId;
  if (isSquareOrder(payment)) return payment.paymentId || payment.squareOrderId || payment.paymentLinkId;
  if (isInteracOrder(payment)) return payment.messageCode || 'interac';
  return undefined;
}

function formatTicker(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === 'USDTTRC20') return 'USDT TRC20';
  if (normalized === 'USDCMATIC') return 'USDC Polygon';
  return normalized;
}

function normalizeCardNumberInput(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function normalizeCardExpiryInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function parseCardExpiry(value: string) {
  const digits = value.replace(/\D/g, '');
  const month = digits.slice(0, 2);
  const year = digits.slice(2, 4);
  if (month.length < 1 || year.length !== 2) return null;
  const monthNumber = Number(month);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return {
    expiryMonth: month.padStart(2, '0'),
    expiryYear: year,
  };
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

function isBillingAddressReady(address: CheckoutBillingAddress) {
  return Boolean(
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
  inputRef,
}: {
  label: string;
  name: keyof CheckoutShippingAddress;
  value: string | undefined;
  onChange: (name: keyof CheckoutShippingAddress, value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">{label}</span>
      <input
        ref={inputRef}
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

function BillingAddressField({
  label,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  required = true,
}: {
  label: string;
  name: keyof CheckoutBillingAddress;
  value: string | undefined;
  onChange: (name: keyof CheckoutBillingAddress, value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">{label}</span>
      <input
        type="text"
        name={`billing-${name}`}
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
              {line.fulfillmentEstimate?.label ? (
                <p className="mt-1 text-xs font-medium text-[#0B2E2F]/60">{line.fulfillmentEstimate.label}</p>
              ) : null}
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

function CheckoutQuickAddCard({ product: initialProduct }: { product: Product }) {
  const { product, loadAvailability } = useLazyProductAvailability(initialProduct);
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
  const inventory = getInventoryState(product, selectedVariant);

  return (
    <article
      className="rounded-[22px] border border-border/70 bg-background p-2.5"
      onPointerEnter={() => void loadAvailability()}
      onFocusCapture={() => void loadAvailability()}
      onTouchStart={() => void loadAvailability()}
    >
      <div className="flex gap-3">
        <Link href={`/product/${product.handle}`} prefetch={false} className="block shrink-0">
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
              <Link href={`/product/${product.handle}`} prefetch={false} className="line-clamp-2 text-sm font-semibold leading-5">
                {product.title}
              </Link>
              <p className="mt-1 text-xs text-foreground/55">
                {selectedVariant?.selectedOptions.length
                  ? selectedVariant.selectedOptions.map(option => option.value).join(' / ')
                  : 'Ready to add'}
              </p>
              <p className="mt-1 text-xs font-medium text-[#0B2E2F]/60">{inventory.message}</p>
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

export function CheckoutExperience({
  cardProcessingEnabled,
  cardSquareFallbackEnabled,
  quickAddProducts,
}: CheckoutExperienceProps) {
  const { cart } = useCart();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: authSession, isPending: isAuthPending } = useAuthSession();
  const initialDiscountCode = (searchParams.get('discount') || '').toUpperCase();
  const [shippingAddress, setShippingAddress] = useState<CheckoutShippingAddress>(DEFAULT_SHIPPING_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'card' | 'interac' | 'square'>('crypto');
  const [squareFallbackUnlock, setSquareFallbackUnlock] = useState<SquareFallbackUnlock | null>(null);
  const [paymentCurrency, setPaymentCurrency] = useState(QUICK_PAYMENT_CURRENCIES[0]);
  const [sourceWalletAddress, setSourceWalletAddress] = useState('');
  const [interacSenderEmail, setInteracSenderEmail] = useState('');
  const [interacSenderName, setInteracSenderName] = useState('');
  const [interacHasSecurityQuestion, setInteracHasSecurityQuestion] = useState(false);
  const [interacSecurityQuestion, setInteracSecurityQuestion] = useState('');
  const [interacSecurityAnswer, setInteracSecurityAnswer] = useState('');
  const [shipmentProtection, setShipmentProtection] = useState(false);
  const [adminShippingDisabled, setAdminShippingDisabled] = useState(false);
  const [isSubmittingInterac, setIsSubmittingInterac] = useState(false);
  const [isUploadingInteracScreenshot, setIsUploadingInteracScreenshot] = useState(false);
  const [cardholderName, setCardholderName] = useState('');
  const [cardBillingSameAsShipping, setCardBillingSameAsShipping] = useState(true);
  const [cardBillingAddress, setCardBillingAddress] = useState<CheckoutBillingAddress>(DEFAULT_BILLING_ADDRESS);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [discountCode, setDiscountCode] = useState(initialDiscountCode);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [ageVerified, setAgeVerified] = useState(false);
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
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isReleasingOrder, setIsReleasingOrder] = useState(false);
  const [releaseAction, setReleaseAction] = useState<'edit' | 'switch' | null>(null);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [address1InputElement, setAddress1InputElement] = useState<HTMLInputElement | null>(null);
  const [hashCheckoutParams, setHashCheckoutParams] = useState<{
    orderId: string;
    accessKey: string;
  } | null>(null);
  const previousCartSignature = useRef<string | null>(null);
  const lastQuoteRequestSignature = useRef<string | null>(null);
  const activeQuoteRequestSignature = useRef<string | null>(null);
  const quoteAbortController = useRef<AbortController | null>(null);
  const previousPaymentSnapshot = useRef<{ orderId: string; status: string } | null>(null);
  const shieldClimbPaymentWindow = useRef<Window | null>(null);
  const paymentSubmitInFlight = useRef(false);
  const recentlyFinalizedCheckout = useRef<{ orderId: string; accessKey: string; expiresAt: number } | null>(null);
  const restoreRequestVersion = useRef(0);
  const checkoutSessionRef = useRef<CheckoutSession | null>(null);
  const interacSenderDefaults = useRef({ email: '', name: '' });

  const orderId = searchParams.get('order') || hashCheckoutParams?.orderId || null;
  const accessKey = searchParams.get('key') || hashCheckoutParams?.accessKey || null;
  const discountParam = searchParams.get('discount');
  const retryOrderId = searchParams.get('retry');
  const retryKey = searchParams.get('key');

  const activeOrder = checkoutSession?.order ?? null;
  const isAdminCheckoutUser = (authSession?.user as any)?.role === 'admin';
  const effectiveAdminShippingDisabled =
    isAdminCheckoutUser && adminShippingDisabled && !activeOrder;
  const effectiveShipmentProtection = effectiveAdminShippingDisabled
    ? false
    : shipmentProtection;
  const effectiveSelectedShippingServiceId = effectiveAdminShippingDisabled
    ? ADMIN_DISABLED_SHIPPING_SERVICE_ID
    : selectedShippingServiceId;
  checkoutSessionRef.current = checkoutSession;
  const isCurrentCheckoutSession = (nextOrderId: string, nextAccessKey: string) => {
    const current = checkoutSessionRef.current;
    return current?.accessKey === nextAccessKey && current.order.orderId === nextOrderId;
  };
  const openHostedPaymentWindowPlaceholder = () => {
    try {
      const paymentWindow = window.open('', '_blank');
      if (!paymentWindow) return null;

      paymentWindow.opener = null;
      try {
        paymentWindow.document.title = 'Opening payment...';
        paymentWindow.document.body.style.margin = '0';
        paymentWindow.document.body.style.fontFamily =
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        paymentWindow.document.body.innerHTML =
          '<div style="min-height:100vh;display:grid;place-items:center;background:#f4f1ea;color:#0b2e2f"><div style="text-align:center"><div style="font-size:16px;font-weight:700">Opening secure payment...</div><div style="margin-top:8px;font-size:13px;opacity:.7">You can return to Revalin after paying.</div></div></div>';
      } catch {
        // The tab can still be redirected even if writing the placeholder fails.
      }

      return paymentWindow;
    } catch {
      return null;
    }
  };
  const selectedQuoteService =
    quote?.services.find(service => service.id === effectiveSelectedShippingServiceId) ||
    quote?.services.find(service => service.id === quote.selectedServiceId) ||
    null;

  useEffect(() => {
    const readHashCheckoutParams = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const nextOrderId = params.get('order')?.trim();
      const nextAccessKey = params.get('key')?.trim();

      setHashCheckoutParams(
        nextOrderId && nextAccessKey
          ? { orderId: nextOrderId, accessKey: nextAccessKey }
          : null,
      );
    };

    readHashCheckoutParams();
    window.addEventListener('hashchange', readHashCheckoutParams);
    return () => {
      window.removeEventListener('hashchange', readHashCheckoutParams);
    };
  }, []);

  const defaultInteracSenderEmail = shippingAddress.email.trim();
  const defaultInteracSenderName = `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim();
  const effectiveInteracSenderEmail = interacSenderEmail.trim() || defaultInteracSenderEmail;
  const effectiveInteracSenderName = interacSenderName.trim() || defaultInteracSenderName;
  const effectiveInteracSecurityQuestion = interacHasSecurityQuestion
    ? interacSecurityQuestion.trim()
    : '';
  const effectiveInteracSecurityAnswer = interacHasSecurityQuestion
    ? interacSecurityAnswer.trim()
    : '';

  const summaryCurrencyCode = activeOrder?.currencyCode || quote?.currencyCode || cart?.cost.totalAmount.currencyCode || 'USD';
  const summaryItems = activeOrder
    ? activeOrder.lines.map(line => (
        <StaticOrderLineCard key={line.id} line={line} currencyCode={activeOrder.currencyCode} />
      ))
    : cart?.lines.map(item => <CartItemCard key={item.id} item={item} onCloseCart={() => {}} />);
  const cartSignature = useMemo(() => {
    if (cart === undefined) return 'loading';
    if (!cart || cart.lines.length === 0) return 'empty';

    return JSON.stringify({
      currencyCode: cart.cost.totalAmount.currencyCode,
      lines: cart.lines
        .map(item => ({
          merchandiseId: item.merchandise.id,
          quantity: item.quantity,
          lineTotal: item.cost.totalAmount.amount,
        }))
        .sort((left, right) => left.merchandiseId.localeCompare(right.merchandiseId)),
    });
  }, [cart]);
  const summaryItemCount = activeOrder
    ? activeOrder.lines.reduce((total, line) => total + line.quantity, 0)
    : cart?.totalQuantity || 0;

  const summarySubtotal = activeOrder
    ? activeOrder.totals.subtotalAmount.amount
    : quote?.subtotalAmount.amount || cart?.cost.subtotalAmount.amount || '0.00';
  const summaryShipping = activeOrder?.totals.shippingAmount?.amount || selectedQuoteService?.price.amount || '0.00';
  const summaryShippingOriginal = selectedQuoteService?.originalPrice?.amount;
  const summaryTax = activeOrder?.totals.taxAmount?.amount || selectedQuoteService?.taxAmount?.amount || '0.00';
  const summaryLandedCost =
    activeOrder?.totals.landedCostAmount?.amount ||
    selectedQuoteService?.landedCostAmount?.amount ||
    '0.00';
  const selectedAvailableShipmentProtection =
    activeOrder?.totals.shipmentProtection ||
    selectedQuoteService?.availableShipmentProtection ||
    selectedQuoteService?.shipmentProtection ||
    null;
  const selectedChargedShipmentProtection =
    activeOrder?.totals.shipmentProtection ||
    (effectiveShipmentProtection
      ? selectedQuoteService?.shipmentProtection ||
        selectedQuoteService?.availableShipmentProtection ||
        null
      : null) ||
    null;
  const summaryShipmentProtection =
    activeOrder?.totals.shipmentProtectionAmount?.amount ||
    selectedChargedShipmentProtection?.totalAmount.amount ||
    '0.00';
  const summaryShipmentProtectionValue =
    selectedChargedShipmentProtection
      ? formatPrice(
          summaryShipmentProtection,
          selectedChargedShipmentProtection.totalAmount.currencyCode || summaryCurrencyCode,
        )
      : '';
  const availableShipmentProtectionValue =
    selectedAvailableShipmentProtection
      ? formatPrice(
          selectedAvailableShipmentProtection.totalAmount.amount,
          selectedAvailableShipmentProtection.totalAmount.currencyCode || summaryCurrencyCode,
        )
      : '';
  const shipmentProtectionRateLabel = effectiveShipmentProtection
    ? summaryShipmentProtectionValue || (summaryItemCount > 0 && isShippingAddressReady(shippingAddress) ? 'Calculating...' : 'Enter address')
    : availableShipmentProtectionValue || (summaryItemCount > 0 && isShippingAddressReady(shippingAddress) ? 'Calculating...' : 'Enter address');
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
        paymentMethodDiscountAmount: discounts.find(isCheckoutPaymentMethodDiscount)?.amount,
      };
    }

    if (quote) {
      const quoteCouponDiscountAmount = getQuoteCouponDiscountAmount(quote).amount;
      const pricing = calculateCheckoutPricing({
        currencyCode: quote.currencyCode,
        subtotalAmount: summarySubtotal,
        couponDiscountAmount: quoteCouponDiscountAmount,
        couponCode: quote.discountCode || appliedDiscount?.code,
        shippingAmount: summaryShipping,
        shipmentProtectionAmount: summaryShipmentProtection,
        taxAmount: summaryTax,
        landedCostAmount: summaryLandedCost,
        paymentMethod,
      });

      return {
        discounts: pricing.discounts,
        totalAmount: pricing.totalAmount,
        paymentMethodDiscountAmount: pricing.paymentMethodDiscountAmount,
      };
    }

    const pricing = calculateCheckoutPricing({
      currencyCode: summaryCurrencyCode,
      subtotalAmount: summarySubtotal,
      couponDiscountAmount: appliedDiscount?.amount || '0.00',
      couponCode: appliedDiscount?.code,
      shippingAmount: summaryShipping,
      shipmentProtectionAmount: summaryShipmentProtection,
      taxAmount: summaryTax,
      landedCostAmount: summaryLandedCost,
      paymentMethod,
    });

    return {
      discounts: pricing.discounts,
      totalAmount: pricing.totalAmount,
      paymentMethodDiscountAmount: pricing.paymentMethodDiscountAmount,
    };
  }, [
    activeOrder,
    appliedDiscount?.amount,
    appliedDiscount?.code,
    paymentMethod,
    quote?.currencyCode,
    quote?.discountAmount?.amount,
    quote?.discountAmount?.currencyCode,
    quote?.discountCode,
    quote?.discounts,
    quote?.paymentMethod,
    summaryCurrencyCode,
    summaryLandedCost,
    summaryShipmentProtection,
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
  const hasLandedCost = Number(summaryLandedCost || 0) > 0.009;
  const summaryLandedCostValue = formatPrice(summaryLandedCost, summaryCurrencyCode);
  const summaryPaymentMethodDiscountAmount = summaryPricing.paymentMethodDiscountAmount?.amount;
  const directPaymentSavingsMessage = summaryPaymentMethodDiscountAmount
    ? ` 5% savings of ${formatPrice(summaryPaymentMethodDiscountAmount, summaryCurrencyCode)} applied automatically.`
    : ' 5% savings applied automatically.';
  const summaryTotal = summaryPricing.totalAmount.amount;
  const isCartHydrating = !activeOrder && cart === undefined;
  const isCardCheckoutUnavailable = !cardProcessingEnabled;
  const squareFallbackAvailable =
    cardProcessingEnabled && cardSquareFallbackEnabled && Boolean(squareFallbackUnlock);
  const cardCheckoutUnavailableMessage = getCardProcessingUnavailableMessage();

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
          fulfillmentEstimate: getCartItemFulfillmentEstimate(item),
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
      paymentMethod,
      paymentCurrency,
      shipmentProtection: effectiveShipmentProtection,
      adminShippingDisabled: effectiveAdminShippingDisabled,
    });
  }, [
    cartSnapshot,
    appliedDiscount,
    effectiveAdminShippingDisabled,
    effectiveShipmentProtection,
    paymentCurrency,
    paymentMethod,
    shippingAddress,
  ]);

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
        setShipmentProtection(Boolean(retryOrder.totals.shipmentProtection));
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
    if (!GOOGLE_MAPS_API_KEY || !address1InputElement) return;

    let autocomplete: GooglePlacesAutocomplete | null = null;
    let listener: { remove: () => void } | null = null;
    let isDisposed = false;

    loadGooglePlacesScript(GOOGLE_MAPS_API_KEY)
      .then(() => {
        if (isDisposed) return;

        const Autocomplete = getGooglePlacesApi()?.maps?.places?.Autocomplete;
        if (!Autocomplete) return;

        autocomplete = new Autocomplete(address1InputElement, {
          fields: ['address_components', 'formatted_address', 'name'],
          types: ['address'],
          componentRestrictions: { country: ['ca', 'us'] },
        });
        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete?.getPlace();
          if (!place) return;

          setShippingAddress(current => buildShippingAddressFromPlace(place, current) || current);
        });
      })
      .catch((placesError) => {
        console.warn('Google Places autocomplete is unavailable.', placesError);
      });

    return () => {
      isDisposed = true;
      listener?.remove();
      if (autocomplete) {
        getGooglePlacesApi()?.maps?.event?.clearInstanceListeners(autocomplete);
      }
    };
  }, [address1InputElement]);

  useEffect(() => {
    try {
      const checkoutDraft = parseCheckoutDraft(window.localStorage.getItem(CHECKOUT_DRAFT_KEY));

      if (checkoutDraft) {
        const canReuseDraftPricing =
          cart !== undefined &&
          Boolean(checkoutDraft.cartSignature) &&
          checkoutDraft.cartSignature === cartSignature;
        const hydratedApiSession = isCheckoutApiSessionExpired(checkoutDraft.apiSession)
          ? null
          : canReuseDraftPricing
            ? checkoutDraft.apiSession
            : null;

        setShippingAddress(checkoutDraft.shippingAddress);
        setPaymentMethod(
          checkoutDraft.paymentMethod === 'card' && !cardProcessingEnabled
            ? 'crypto'
            : checkoutDraft.paymentMethod === 'square'
              ? 'crypto'
              : checkoutDraft.paymentMethod,
        );
        setPaymentCurrency(checkoutDraft.paymentCurrency);
        setSourceWalletAddress(checkoutDraft.sourceWalletAddress);
        setInteracSenderEmail(checkoutDraft.interacSenderEmail);
        setInteracSenderName(checkoutDraft.interacSenderName);
        setInteracHasSecurityQuestion(checkoutDraft.interacHasSecurityQuestion);
        setInteracSecurityQuestion(checkoutDraft.interacSecurityQuestion);
        setInteracSecurityAnswer(checkoutDraft.interacSecurityAnswer);
        setShipmentProtection(checkoutDraft.shipmentProtection);
        setAdminShippingDisabled(checkoutDraft.adminShippingDisabled);
        setCheckoutApiSession(hydratedApiSession);
        const hydratedDiscountCode = initialDiscountCode || checkoutDraft.discountCode;
        const hydratedAppliedDiscount =
          canReuseDraftPricing && checkoutDraft.appliedDiscount?.code === hydratedDiscountCode
            ? checkoutDraft.appliedDiscount
            : null;

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
  }, [cardProcessingEnabled, initialDiscountCode]);

  useEffect(() => {
    if (!isDraftHydrated || activeOrder || cart === undefined) return;
    if (!checkoutApiSession && !appliedDiscount) return;

    try {
      const checkoutDraft = parseCheckoutDraft(window.localStorage.getItem(CHECKOUT_DRAFT_KEY));
      if (!checkoutDraft) return;
      if (checkoutDraft.cartSignature && checkoutDraft.cartSignature === cartSignature) return;

      setCheckoutApiSession(null);
      setAppliedDiscount(null);
      setDiscountError(null);
      setShouldAutoApplyDiscount(Boolean(discountCode.trim()));
    } catch {
      // Best effort only.
    }
  }, [
    activeOrder,
    appliedDiscount,
    cart,
    cartSignature,
    checkoutApiSession,
    discountCode,
    isDraftHydrated,
  ]);

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
        interacSenderEmail,
        interacSenderName,
        interacHasSecurityQuestion,
        interacSecurityQuestion,
        interacSecurityAnswer,
        shipmentProtection,
        adminShippingDisabled: effectiveAdminShippingDisabled,
        discountCode,
        appliedDiscount,
        apiSession: checkoutApiSession,
        cartSignature: cartSignature === 'loading' ? null : cartSignature,
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
    effectiveAdminShippingDisabled,
    shipmentProtection,
    interacSenderEmail,
    interacSenderName,
    interacHasSecurityQuestion,
    interacSecurityQuestion,
    interacSecurityAnswer,
    shippingAddress,
    sourceWalletAddress,
    cartSignature,
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

    const finalized = recentlyFinalizedCheckout.current;
    if (finalized && finalized.expiresAt > Date.now()) {
      return;
    }

    if (!activeOrder) {
      quoteAbortController.current?.abort();
      setQuote(null);
      setSelectedShippingServiceId('');
      lastQuoteRequestSignature.current = null;
      activeQuoteRequestSignature.current = null;
      setCheckoutApiSession(null);
      setAppliedDiscount(null);
      setDiscountError(null);
      setShouldAutoApplyDiscount(Boolean(discountCode.trim()));
    }
  }, [activeOrder, cartSignature, discountCode]);

  const resetQuoteState = useCallback(() => {
    quoteAbortController.current?.abort();
    setQuote(null);
    setSelectedShippingServiceId('');
    lastQuoteRequestSignature.current = null;
    activeQuoteRequestSignature.current = null;
  }, []);

  useEffect(() => {
    if (isAuthPending || isAdminCheckoutUser || !adminShippingDisabled) return;

    setAdminShippingDisabled(false);
    setSelectedShippingServiceId((current) =>
      current === ADMIN_DISABLED_SHIPPING_SERVICE_ID ? '' : current,
    );
    resetQuoteState();
  }, [
    adminShippingDisabled,
    isAdminCheckoutUser,
    isAuthPending,
    resetQuoteState,
  ]);

  const updateCheckoutUrl = useCallback((nextOrderId?: string, nextAccessKey?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete('order');
    params.delete('key');

    const nextQuery = params.toString();
    const nextHash = nextOrderId && nextAccessKey
      ? `#${new URLSearchParams({ order: nextOrderId, key: nextAccessKey }).toString()}`
      : '';
    const nextUrl = `${pathname}${nextQuery ? `?${nextQuery}` : ''}${nextHash}`;

    setHashCheckoutParams(
      nextOrderId && nextAccessKey
        ? { orderId: nextOrderId, accessKey: nextAccessKey }
        : null,
    );
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [pathname, searchParams]);

  const syncCheckoutUrlImmediately = useCallback((nextOrderId?: string, nextAccessKey?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete('order');
    params.delete('key');

    const nextQuery = params.toString();
    const nextHash = nextOrderId && nextAccessKey
      ? `#${new URLSearchParams({ order: nextOrderId, key: nextAccessKey }).toString()}`
      : '';
    const nextUrl = `${pathname}${nextQuery ? `?${nextQuery}` : ''}${nextHash}`;

    setHashCheckoutParams(
      nextOrderId && nextAccessKey
        ? { orderId: nextOrderId, accessKey: nextAccessKey }
        : null,
    );
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [pathname, searchParams]);

  const followCheckoutOrder = useCallback((nextOrderId: string, nextAccessKey: string) => {
    syncCheckoutUrlImmediately(nextOrderId, nextAccessKey);
    updateCheckoutUrl(nextOrderId, nextAccessKey);
  }, [syncCheckoutUrlImmediately, updateCheckoutUrl]);

  const clearStoredCheckoutResume = useCallback(() => {
    try {
      clearStoredCheckoutResumeValue();
    } catch {
      // Best effort only.
    }
  }, []);

  useEffect(() => {
    if (!isDraftHydrated) return;
    if (orderId || accessKey || checkoutSessionRef.current?.order) return;

    let cancelled = false;

    try {
      const resume = readStoredCheckoutResume();
      if (!resume) {
        return;
      }

      if (!Number.isFinite(Date.parse(resume.savedAt)) || isCheckoutResumeExpired(resume)) {
        clearStoredCheckoutResume();
        return;
      }

      const requestVersion = restoreRequestVersion.current + 1;
      restoreRequestVersion.current = requestVersion;
      recentlyFinalizedCheckout.current = {
        orderId: resume.orderId,
        accessKey: resume.accessKey,
        expiresAt: Date.now() + 10_000,
      };
      setIsLoadingOrder(true);
      followCheckoutOrder(resume.orderId, resume.accessKey);

      fetch(`/api/checkout/v2/orders/${encodeURIComponent(resume.orderId)}?key=${encodeURIComponent(resume.accessKey)}`, {
        cache: 'no-store',
      })
        .then(async response => {
          const payload = await readJsonSafely(response);
          if (response.status === 429) {
            return;
          }
          if (!response.ok) {
            throw new Error(getApiErrorMessage(payload, 'Unable to restore checkout session.'));
          }
          const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
          if (!data?.order) {
            throw new Error('Unable to restore checkout session.');
          }

          if (cancelled || restoreRequestVersion.current !== requestVersion) return;

          const supersededByOrderId = data.order.payment.supersededByOrderId?.trim();
          const supersededByAccessKey = data.order.payment.supersededByAccessKey?.trim();
          if (
            supersededByOrderId &&
            supersededByAccessKey &&
            (supersededByOrderId !== resume.orderId || supersededByAccessKey !== resume.accessKey)
          ) {
            followCheckoutOrder(supersededByOrderId, supersededByAccessKey);
            return;
          }

          const normalizedPaymentStatus = data.order.payment.status.toLowerCase();
          if (INACTIVE_CHECKOUT_RESTORE_STATUSES.has(normalizedPaymentStatus)) {
            clearStoredCheckoutResume();
            setCheckoutSession(null);
            setQuote(null);
            setSelectedShippingServiceId('');
            setError(null);
            syncCheckoutUrlImmediately();
            updateCheckoutUrl();
            return;
          }

          setCheckoutSession({ accessKey: resume.accessKey, order: data.order });
          setShippingAddress(data.order.shippingAddress);
          if (isNowPaymentsOrder(data.order.payment)) {
            setPaymentMethod('crypto');
            setPaymentCurrency(data.order.payment.paymentCurrency);
            setSourceWalletAddress(data.order.payment.sourceWalletAddress || '');
          } else if (isInteracOrder(data.order.payment)) {
            setPaymentMethod('interac');
            setInteracSenderEmail(data.order.payment.expectedSenderEmail || '');
            setInteracSenderName(data.order.payment.expectedSenderName || '');
            setInteracHasSecurityQuestion(Boolean(
              data.order.payment.securityQuestion || data.order.payment.securityAnswer,
            ));
            setInteracSecurityQuestion(data.order.payment.securityQuestion || '');
            setInteracSecurityAnswer(data.order.payment.securityAnswer || '');
            setSourceWalletAddress('');
          } else if (isSquareOrder(data.order.payment)) {
            setPaymentMethod('square');
            setSourceWalletAddress('');
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
          if (!cancelled && restoreRequestVersion.current === requestVersion) {
            setError(fetchError instanceof Error ? fetchError.message : 'Unable to restore checkout session.');
          }
        })
        .finally(() => {
          if (!cancelled && restoreRequestVersion.current === requestVersion) {
            setIsLoadingOrder(false);
          }
        });
    } catch {
      clearStoredCheckoutResume();
    }

    return () => {
      cancelled = true;
    };
  }, [
    accessKey,
    clearStoredCheckoutResume,
    discountParam,
    followCheckoutOrder,
    isDraftHydrated,
    orderId,
    syncCheckoutUrlImmediately,
    updateCheckoutUrl,
  ]);

  useEffect(() => {
    const currentCheckoutSession = checkoutSessionRef.current;

    if (!orderId || !accessKey) {
      const finalized = recentlyFinalizedCheckout.current;
      if (finalized && finalized.expiresAt > Date.now()) return;
      recentlyFinalizedCheckout.current = null;
      restoreRequestVersion.current += 1;
      setIsLoadingOrder(false);
      if (currentCheckoutSession?.order) return;
      setCheckoutSession(null);
      return;
    }

    if (
      currentCheckoutSession?.accessKey === accessKey &&
      currentCheckoutSession.order.orderId === orderId
    ) {
      return;
    }

    recentlyFinalizedCheckout.current = null;
    const requestVersion = restoreRequestVersion.current + 1;
    restoreRequestVersion.current = requestVersion;

    if (cartSignature === 'loading') {
      return;
    }

    let cancelled = false;
    setIsLoadingOrder(true);

    fetch(`/api/checkout/v2/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(accessKey)}`, {
      cache: 'no-store',
    })
      .then(async response => {
        const payload = await readJsonSafely(response);
        if (response.status === 429) {
          return;
        }
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, 'Unable to restore checkout session.'));
        }
        const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
        if (!data?.order) {
          throw new Error('Unable to restore checkout session.');
        }

        if (cancelled || restoreRequestVersion.current !== requestVersion) return;

        const supersededByOrderId = data.order.payment.supersededByOrderId?.trim();
        const supersededByAccessKey = data.order.payment.supersededByAccessKey?.trim();
        if (
          supersededByOrderId &&
          supersededByAccessKey &&
          (supersededByOrderId !== orderId || supersededByAccessKey !== accessKey)
        ) {
          setCheckoutSession(null);
          setQuote(null);
          setSelectedShippingServiceId('');
          setError(null);
          followCheckoutOrder(supersededByOrderId, supersededByAccessKey);
          return;
        }

        const normalizedPaymentStatus = data.order.payment.status.toLowerCase();
        if (INACTIVE_CHECKOUT_RESTORE_STATUSES.has(normalizedPaymentStatus)) {
          clearStoredCheckoutResume();
          setCheckoutSession(null);
          setQuote(null);
          setSelectedShippingServiceId('');
          setError(null);
          syncCheckoutUrlImmediately();
          updateCheckoutUrl();
          return;
        }

        const liveCartSignature = cartSignature === 'empty' ? 'empty' : cartSignature;
        const restoredOrderSignature = buildComparableCheckoutLinesSignature({
          currencyCode: data.order.currencyCode,
          lines: data.order.lines.map((line) => ({
            merchandiseId: line.merchandiseId,
            quantity: line.quantity,
            lineTotal: {
              amount: line.lineTotal.amount,
            },
          })),
        });

        if (
          cartSignature !== 'empty' &&
          !isInteracOrder(data.order.payment) &&
          !isSquareOrder(data.order.payment) &&
          liveCartSignature !== restoredOrderSignature &&
          normalizedPaymentStatus !== 'finished' &&
          normalizedPaymentStatus !== 'paid'
        ) {
          clearStoredCheckoutResume();
          setCheckoutSession(null);
          setQuote(null);
          setSelectedShippingServiceId('');
          setError(null);
          syncCheckoutUrlImmediately();
          updateCheckoutUrl();
          return;
        }

        setCheckoutSession(current => {
          if (
            current?.accessKey === accessKey &&
            current.order.orderId === data.order.orderId &&
            current.order.updatedAt === data.order.updatedAt &&
            current.order.payment.status === data.order.payment.status
          ) {
            return current;
          }

          return { accessKey, order: data.order };
        });
        setShippingAddress(data.order.shippingAddress);
        if (isNowPaymentsOrder(data.order.payment)) {
          setPaymentMethod('crypto');
          setPaymentCurrency(data.order.payment.paymentCurrency);
          setSourceWalletAddress(data.order.payment.sourceWalletAddress || '');
        } else if (isInteracOrder(data.order.payment)) {
          setPaymentMethod('interac');
          setInteracSenderEmail(data.order.payment.expectedSenderEmail || '');
          setInteracSenderName(data.order.payment.expectedSenderName || '');
          setInteracHasSecurityQuestion(Boolean(
            data.order.payment.securityQuestion || data.order.payment.securityAnswer,
          ));
          setInteracSecurityQuestion(data.order.payment.securityQuestion || '');
          setInteracSecurityAnswer(data.order.payment.securityAnswer || '');
          setSourceWalletAddress('');
        } else if (isSquareOrder(data.order.payment)) {
          setPaymentMethod('square');
          setSourceWalletAddress('');
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
        if (!cancelled && restoreRequestVersion.current === requestVersion) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to restore checkout session.');
          setCheckoutSession(current => (
            current?.accessKey === accessKey && current.order.orderId === orderId
              ? current
              : null
          ));
        }
      })
      .finally(() => {
        if (!cancelled && restoreRequestVersion.current === requestVersion) {
          setIsLoadingOrder(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessKey,
    cartSignature,
    clearStoredCheckoutResume,
    discountParam,
    followCheckoutOrder,
    orderId,
    syncCheckoutUrlImmediately,
    updateCheckoutUrl,
  ]);

  useEffect(() => {
    if (!isDraftHydrated) return;

    try {
      if (!checkoutSession?.order) return;

      const normalizedPaymentStatus = checkoutSession.order.payment.status.toLowerCase();
      if (
        INACTIVE_CHECKOUT_RESTORE_STATUSES.has(normalizedPaymentStatus) ||
        isTerminalPaymentStatus(normalizedPaymentStatus)
      ) {
        clearStoredCheckoutResume();
        return;
      }

      const resume: CheckoutResume = {
        version: 1,
        orderId: checkoutSession.order.orderId,
        accessKey: checkoutSession.accessKey,
        provider: checkoutSession.order.payment.provider,
        status: checkoutSession.order.payment.status,
        savedAt: new Date().toISOString(),
        updatedAt: checkoutSession.order.updatedAt,
      };

      persistCheckoutResume(resume);
    } catch {
      // Best effort only.
    }
  }, [
    checkoutSession,
    clearStoredCheckoutResume,
    isDraftHydrated,
  ]);

  useEffect(() => {
    const supersededByOrderId = activeOrder?.payment.supersededByOrderId?.trim();
    const supersededByAccessKey = activeOrder?.payment.supersededByAccessKey?.trim();

    if (!supersededByOrderId || !supersededByAccessKey) {
      return;
    }

    if (
      supersededByOrderId === activeOrder?.orderId &&
      supersededByAccessKey === checkoutSession?.accessKey
    ) {
      return;
    }

    followCheckoutOrder(supersededByOrderId, supersededByAccessKey);
  }, [
    activeOrder?.orderId,
    activeOrder?.payment.supersededByAccessKey,
    activeOrder?.payment.supersededByOrderId,
    checkoutSession?.accessKey,
    followCheckoutOrder,
  ]);

  useEffect(() => {
    if (activeOrder) return;
    if (paymentMethod !== 'card' || cardProcessingEnabled) {
      return;
    }

    setPaymentMethod('crypto');
  }, [activeOrder, cardProcessingEnabled, paymentMethod]);

  useEffect(() => {
    if (activeOrder || paymentMethod !== 'square' || squareFallbackAvailable) {
      return;
    }

    setPaymentMethod('crypto');
  }, [activeOrder, paymentMethod, squareFallbackAvailable]);

  const pollingId = checkoutSession?.order.payment ? getPollingId(checkoutSession.order.payment) : undefined;
  const autoPollingId =
    checkoutSession?.order.payment
      ? getPollingId(checkoutSession.order.payment)
      : undefined;
  const shouldUseFastHostedPolling =
    checkoutSession?.order.payment ? isSquareOrder(checkoutSession.order.payment) : false;

  useEffect(() => {
    if (!autoPollingId || !checkoutSession || isTerminalPaymentStatus(checkoutSession.order.payment.status)) {
      return;
    }

    const currentOrderId = checkoutSession.order.orderId;
    const currentAccessKey = checkoutSession.accessKey;
    let cancelled = false;
    let pollInFlight = false;

    const pollPaymentStatus = async () => {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;

      try {
        const response = await fetch(
          `/api/checkout/v2/payments/${encodeURIComponent(autoPollingId)}/status?orderId=${encodeURIComponent(
            currentOrderId
          )}&key=${encodeURIComponent(currentAccessKey)}`,
          { cache: 'no-store' }
        );

        if (!response.ok) return;
        const payload = await readJsonSafely(response);
        const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
        if (!data?.order || cancelled) return;
        setCheckoutSession(current => (
          current?.accessKey === currentAccessKey && current.order.orderId === currentOrderId
            ? { ...current, order: data.order }
            : current
        ));
      } finally {
        pollInFlight = false;
      }
    };
    const pollWhenVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void pollPaymentStatus();
    };

    void pollPaymentStatus();
    const interval = window.setInterval(pollPaymentStatus, shouldUseFastHostedPolling ? 4000 : 12000);
    const windowMonitor = window.setInterval(() => {
      const paymentWindow = shieldClimbPaymentWindow.current;
      if (!paymentWindow) return;

      let isClosed = false;
      try {
        isClosed = paymentWindow.closed;
      } catch {
        isClosed = true;
      }

      if (!isClosed) return;

      shieldClimbPaymentWindow.current = null;
      void pollPaymentStatus();
    }, 1000);
    window.addEventListener('focus', pollWhenVisible);
    window.addEventListener('pageshow', pollWhenVisible);
    document.addEventListener('visibilitychange', pollWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(windowMonitor);
      window.removeEventListener('focus', pollWhenVisible);
      window.removeEventListener('pageshow', pollWhenVisible);
      document.removeEventListener('visibilitychange', pollWhenVisible);
    };
  }, [
    checkoutSession?.accessKey,
    checkoutSession?.order.orderId,
    checkoutSession?.order.payment.status,
    autoPollingId,
    shouldUseFastHostedPolling,
  ]);

  useEffect(() => {
    if (!copiedValue) return;
    const timeout = window.setTimeout(() => setCopiedValue(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedValue]);

  useEffect(() => {
    return () => {
      quoteAbortController.current?.abort();
      activeQuoteRequestSignature.current = null;
    };
  }, []);

  const resetCheckoutSession = useCallback(() => {
    restoreRequestVersion.current += 1;
    recentlyFinalizedCheckout.current = null;
    resetQuoteState();
    setCheckoutApiSession(null);
    setCheckoutSession(null);
    setError(null);
    setSquareFallbackUnlock(null);
    previousPaymentSnapshot.current = null;
    clearStoredCheckoutResume();
    updateCheckoutUrl();
  }, [clearStoredCheckoutResume, resetQuoteState, updateCheckoutUrl]);

  const fillInteracSenderDetails = useCallback((address: CheckoutShippingAddress = shippingAddress) => {
    const nextEmail = address.email.trim();
    const nextName = `${address.firstName} ${address.lastName}`.trim();
    const previousDefaults = interacSenderDefaults.current;

    if (nextEmail) {
      setInteracSenderEmail(current => {
        const normalizedCurrent = current.trim();
        return !normalizedCurrent || normalizedCurrent === previousDefaults.email
          ? nextEmail
          : current;
      });
    }

    if (nextName) {
      setInteracSenderName(current => {
        const normalizedCurrent = current.trim();
        return !normalizedCurrent || normalizedCurrent === previousDefaults.name
          ? nextName
          : current;
      });
    }

    interacSenderDefaults.current = {
      email: nextEmail || previousDefaults.email,
      name: nextName || previousDefaults.name,
    };
  }, [shippingAddress]);

  const selectPaymentMethod = useCallback((nextPaymentMethod: 'card' | 'crypto' | 'interac' | 'square') => {
    if (nextPaymentMethod === 'card' && !cardProcessingEnabled) {
      if (!activeOrder && paymentMethod !== 'crypto') {
        resetQuoteState();
      }
      setPaymentMethod('crypto');
      return;
    }

    if (nextPaymentMethod === 'square' && !squareFallbackAvailable) {
      return;
    }

    if (nextPaymentMethod === 'interac') {
      fillInteracSenderDetails();
    }

    if (nextPaymentMethod !== 'square') {
      setSquareFallbackUnlock(null);
    }

    if (!activeOrder && nextPaymentMethod !== paymentMethod) {
      resetQuoteState();
    }

    setPaymentMethod(nextPaymentMethod);
  }, [
    activeOrder,
    cardProcessingEnabled,
    fillInteracSenderDetails,
    paymentMethod,
    resetQuoteState,
    squareFallbackAvailable,
  ]);

  const handleShippingChange = (name: keyof CheckoutShippingAddress, value: string) => {
    setShippingAddress(current => ({ ...current, [name]: value }));
    if (!activeOrder) {
      resetQuoteState();
    }
  };

  const handleCardBillingSameAsShippingChange = (checked: boolean) => {
    setCardBillingSameAsShipping(checked);
    if (!checked) {
      setCardBillingAddress(billingAddressFromShipping(shippingAddress));
    }
    if (error === 'Enter a complete billing address.') {
      setError(null);
    }
  };

  const handleCardBillingAddressChange = (name: keyof CheckoutBillingAddress, value: string) => {
    setCardBillingAddress(current => ({ ...current, [name]: value }));
    if (error === 'Enter a complete billing address.') {
      setError(null);
    }
  };

  const handleShipmentProtectionChange = (checked: boolean) => {
    if (effectiveAdminShippingDisabled) return;

    setShipmentProtection(checked);
    if (!activeOrder) {
      lastQuoteRequestSignature.current = null;
    }
  };

  const handleAdminShippingDisabledChange = (checked: boolean) => {
    setAdminShippingDisabled(checked);
    if (!activeOrder) {
      resetQuoteState();
    }
    if (checked) {
      setShipmentProtection(false);
      setSelectedShippingServiceId(ADMIN_DISABLED_SHIPPING_SERVICE_ID);
    } else {
      setSelectedShippingServiceId('');
    }
  };

  useEffect(() => {
    if (!isDraftHydrated || activeOrder || paymentMethod !== 'interac') return;
    fillInteracSenderDetails(shippingAddress);
  }, [
    activeOrder,
    fillInteracSenderDetails,
    isDraftHydrated,
    paymentMethod,
    shippingAddress,
  ]);

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
      shipmentProtection: effectiveShipmentProtection,
      adminShippingDisabled: effectiveAdminShippingDisabled || undefined,
      interacSenderEmail:
        paymentMethod === 'interac'
          ? effectiveInteracSenderEmail || undefined
          : interacSenderEmail.trim() || undefined,
      interacSenderName:
        paymentMethod === 'interac'
          ? effectiveInteracSenderName || undefined
          : interacSenderName.trim() || undefined,
      interacSecurityQuestion:
        paymentMethod === 'interac'
          ? effectiveInteracSecurityQuestion || undefined
          : undefined,
      interacSecurityAnswer:
        paymentMethod === 'interac'
          ? effectiveInteracSecurityAnswer || undefined
          : undefined,
      discountCode:
        overrides?.discountCode !== undefined
          ? overrides.discountCode || undefined
          : appliedDiscount?.code || undefined,
      selectedShippingServiceId:
        effectiveAdminShippingDisabled
          ? ADMIN_DISABLED_SHIPPING_SERVICE_ID
          : overrides?.selectedShippingServiceId || selectedShippingServiceId || undefined,
    }),
    [
      appliedDiscount?.code,
      cartSnapshot,
      effectiveInteracSenderEmail,
      effectiveInteracSenderName,
      effectiveInteracSecurityQuestion,
      effectiveInteracSecurityAnswer,
      effectiveAdminShippingDisabled,
      effectiveShipmentProtection,
      interacSenderEmail,
      interacSenderName,
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
      setShouldAutoApplyDiscount(true);
      return;
    }

    if (isLoadingQuote) {
      setDiscountError(null);
      setShouldAutoApplyDiscount(true);
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
      const couponDiscountAmount = getQuoteCouponDiscountAmount(data.quote);
      setDiscountCode(appliedCode);
      setAppliedDiscount({
        code: appliedCode,
        amount: couponDiscountAmount.amount,
        currencyCode: couponDiscountAmount.currencyCode,
        rate: couponDiscountAmount.rate,
      });
      setDiscountError(null);
    } catch (applyError: unknown) {
      const message = getCheckoutErrorMessage(applyError, 'Invalid discount code.');
      setDiscountError(message);
      setAppliedDiscount(null);
      setShouldAutoApplyDiscount(false);
      if (isInvalidDiscountMessage(message)) {
        setDiscountCode('');
      }
    } finally {
      setIsValidatingDiscount(false);
    }
  }, [
    buildCheckoutSessionPayload,
    cartSnapshot,
    ensureCheckoutApiSession,
    isLoadingQuote,
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
        activeQuoteRequestSignature.current = null;
        setError('Your stack is empty.');
        setQuote(null);
        setSelectedShippingServiceId('');
        setIsLoadingQuote(false);
        return null;
      }

      if (!isShippingAddressReady(nextShippingAddress)) {
        quoteAbortController.current?.abort();
        activeQuoteRequestSignature.current = null;
        setError('Complete the shipping address to see delivery methods.');
        setQuote(null);
        setSelectedShippingServiceId('');
        setIsLoadingQuote(false);
        return null;
      }

      if (signature) {
        lastQuoteRequestSignature.current = signature;
      }

      quoteAbortController.current?.abort();
      const controller = new AbortController();
      quoteAbortController.current = controller;
      activeQuoteRequestSignature.current = signature || null;
      setIsLoadingQuote(true);
      setError(null);

      const pendingCode = shouldAutoApplyDiscount && !appliedDiscount
        ? discountCode.trim().toUpperCase() || undefined
        : undefined;

      try {
        // Include the pending affiliate discount code in the first quote so
        // the user sees it applied as soon as the shipping address is ready.
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
          return null;
        }

        setQuote(data.quote);
        setSelectedShippingServiceId(current =>
          data.quote.services.some((service: CheckoutShippingService) => service.id === current)
            ? current
            : data.quote.selectedServiceId
        );

        const couponDiscountAmount = getQuoteCouponDiscountAmount(data.quote);
        const refreshedDiscountCode = data.quote.discountCode || pendingCode || appliedDiscount?.code;
        if (refreshedDiscountCode && Number(couponDiscountAmount.amount) > 0) {
          const nextAppliedDiscount = {
            code: refreshedDiscountCode,
            amount: couponDiscountAmount.amount,
            currencyCode: couponDiscountAmount.currencyCode,
            rate: couponDiscountAmount.rate,
          };

          if (pendingCode) {
            setDiscountCode(refreshedDiscountCode);
            setShouldAutoApplyDiscount(false);
          }

          if (
            !appliedDiscount ||
            appliedDiscount.code !== nextAppliedDiscount.code ||
            appliedDiscount.amount !== nextAppliedDiscount.amount ||
            appliedDiscount.currencyCode !== nextAppliedDiscount.currencyCode ||
            appliedDiscount.rate !== nextAppliedDiscount.rate
          ) {
            setAppliedDiscount(nextAppliedDiscount);
          }
        }

        return data.quote;
      } catch (quoteError: unknown) {
        if (quoteError instanceof Error && quoteError.name === 'AbortError') {
          return null;
        }

        const message = getCheckoutErrorMessage(quoteError, 'Unable to fetch shipping options.');
        if (pendingCode && isInvalidDiscountMessage(message)) {
          setDiscountError(message);
          setDiscountCode('');
          setAppliedDiscount(null);
          setShouldAutoApplyDiscount(false);
          lastQuoteRequestSignature.current = null;
        } else {
          setError(message);
        }
        setQuote(null);
        setSelectedShippingServiceId('');
        return null;
      } finally {
        if (quoteAbortController.current === controller) {
          quoteAbortController.current = null;
          activeQuoteRequestSignature.current = null;
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
    const activeSignature = activeQuoteRequestSignature.current;
    if (!quoteAbortController.current || !activeSignature) {
      return;
    }

    if (quoteRequestSignature === activeSignature) {
      return;
    }

    quoteAbortController.current.abort();
    quoteAbortController.current = null;
    activeQuoteRequestSignature.current = null;
    lastQuoteRequestSignature.current = null;
    setIsLoadingQuote(false);
  }, [quoteRequestSignature]);

  useEffect(() => {
    if (activeOrder || !quoteRequestSignature || isLoadingQuote) {
      return;
    }

    if (shouldAutoApplyDiscount && discountCode.trim() && !appliedDiscount) {
      return;
    }

    if (lastQuoteRequestSignature.current === quoteRequestSignature) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void requestQuote(shippingAddress, quoteRequestSignature);
    }, 1100);

    return () => window.clearTimeout(timeout);
  }, [
    activeOrder,
    appliedDiscount,
    discountCode,
    isLoadingQuote,
    quoteRequestSignature,
    requestQuote,
    shippingAddress,
    shouldAutoApplyDiscount,
  ]);

  const ensureShippingServiceIdForPayment = useCallback(async () => {
    if (!quoteRequestSignature || !isShippingAddressReady(shippingAddress)) {
      setError('Complete the shipping address to see delivery methods.');
      return null;
    }

    const selectedQuoteIsCurrent =
      Boolean(selectedShippingServiceId) &&
      lastQuoteRequestSignature.current === quoteRequestSignature &&
      Boolean(quote?.services.some(service => service.id === selectedShippingServiceId));

    if (selectedQuoteIsCurrent) {
      return selectedShippingServiceId;
    }

    const currentQuoteDefaultServiceId =
      lastQuoteRequestSignature.current === quoteRequestSignature
        ? quote?.selectedServiceId || quote?.services[0]?.id || ''
        : '';
    if (currentQuoteDefaultServiceId) {
      setSelectedShippingServiceId(currentQuoteDefaultServiceId);
      return currentQuoteDefaultServiceId;
    }

    const nextQuote = await requestQuote(shippingAddress, quoteRequestSignature);
    if (!nextQuote) {
      return null;
    }

    const nextShippingServiceId = nextQuote?.selectedServiceId || nextQuote?.services[0]?.id || '';

    if (!nextShippingServiceId) {
      setError('Select a shipping method before creating the payment.');
      return null;
    }

    setSelectedShippingServiceId(nextShippingServiceId);
    return nextShippingServiceId;
  }, [
    quote,
    quoteRequestSignature,
    requestQuote,
    selectedShippingServiceId,
    shippingAddress,
  ]);

  const submitCheckoutPayment = useCallback(async (cardInput?: {
    number: string;
    cvv: string;
    expiryMonth: string;
    expiryYear: string;
    cardholderName?: string;
    billingAddress?: CheckoutBillingAddress;
  }) => {
    if (paymentMethod === 'card' && !cardProcessingEnabled) {
      setError(getCardProcessingUnavailableMessage());
      return;
    }

    if (paymentMethod === 'square' && !squareFallbackAvailable) {
      setError('Hosted card checkout is not available right now.');
      return;
    }

    if (paymentMethod === 'interac' && (!effectiveInteracSenderEmail || !effectiveInteracSenderName)) {
      setError('Enter the email and name you will use for the Interac e-Transfer.');
      return;
    }

    if (paymentSubmitInFlight.current) {
      return;
    }
    paymentSubmitInFlight.current = true;
    setIsCreatingPayment(true);
    setError(null);

    try {
      const ensuredShippingServiceId = await ensureShippingServiceIdForPayment();
      if (!ensuredShippingServiceId) {
        if (shieldClimbPaymentWindow.current && !shieldClimbPaymentWindow.current.closed) {
          shieldClimbPaymentWindow.current.close();
        }
        shieldClimbPaymentWindow.current = null;
        return;
      }

      const finalizePayload = buildCheckoutSessionPayload({
        selectedShippingServiceId: ensuredShippingServiceId,
      });
      const session = await ensureCheckoutApiSession(finalizePayload);
      const postFinalize = async (targetSession: CheckoutApiSession) => {
        const response = await fetch(
          `/api/checkout/v2/sessions/${encodeURIComponent(targetSession.sessionId)}/finalize`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...finalizePayload,
              ...(paymentMethod === 'card' && cardInput ? { card: cardInput } : {}),
              sessionKey: targetSession.sessionKey,
              version: targetSession.version,
            }),
          },
        );

        return {
          response,
          payload: await readJsonSafely(response),
        };
      };

      let result = await postFinalize(session);

      if (isDraftOutOfDateResponse(result.payload)) {
        const currentSession = await refreshCheckoutApiSession(session);
        result = await postFinalize(currentSession);
      } else if (isExpiredCheckoutSessionResponse(result.payload)) {
        const freshSession = await createCheckoutApiSession(finalizePayload);
        result = await postFinalize(freshSession);
      }

      const { response, payload } = result;

      if (!response.ok) {
        console.error('[CHECKOUT] create-payment failed:', response.status, payload);
        const message = getApiErrorMessage(payload, 'Unable to create payment.');
        const fallbackUnlock =
          paymentMethod === 'card' && cardSquareFallbackEnabled
            ? getSquareFallbackUnlockFromError(payload, message)
            : null;

        if (fallbackUnlock) {
          setSquareFallbackUnlock(fallbackUnlock);
          setCheckoutApiSession(null);
          setPaymentMethod('square');
          setError(null);
          return;
        }

        throw new Error(message);
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

      restoreRequestVersion.current += 1;
      quoteAbortController.current?.abort();
      quoteAbortController.current = null;
      activeQuoteRequestSignature.current = null;
      recentlyFinalizedCheckout.current = {
        orderId: data.order.orderId,
        accessKey: data.accessKey,
        expiresAt: Date.now() + 10_000,
      };
      try {
        persistCheckoutResume({
          version: 1,
          orderId: data.order.orderId,
          accessKey: data.accessKey,
          provider: data.order.payment.provider,
          status: data.order.payment.status,
          savedAt: new Date().toISOString(),
          updatedAt: data.order.updatedAt,
        });
      } catch {
        // Best effort only.
      }

      setCheckoutSession({
        accessKey: data.accessKey,
        order: data.order,
      });
      setShippingAddress(data.order.shippingAddress);
      setSelectedShippingServiceId(data.order.shippingService?.id || ensuredShippingServiceId);

      if (isNowPaymentsOrder(data.order.payment)) {
        setPaymentCurrency(data.order.payment.paymentCurrency);
        setSourceWalletAddress(data.order.payment.sourceWalletAddress || '');
      } else if (isInteracOrder(data.order.payment)) {
        setInteracSenderEmail(data.order.payment.expectedSenderEmail || '');
        setInteracSenderName(data.order.payment.expectedSenderName || '');
        setInteracHasSecurityQuestion(Boolean(
          data.order.payment.securityQuestion || data.order.payment.securityAnswer,
        ));
        setInteracSecurityQuestion(data.order.payment.securityQuestion || '');
        setInteracSecurityAnswer(data.order.payment.securityAnswer || '');
        setSourceWalletAddress('');
      } else if (isSquareOrder(data.order.payment)) {
        setPaymentMethod('square');
        setSourceWalletAddress('');
      } else {
        setSourceWalletAddress('');
      }
      if (isBankfulOrder(data.order.payment)) {
        setCardholderName('');
        setCardBillingSameAsShipping(true);
        setCardBillingAddress(DEFAULT_BILLING_ADDRESS);
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');
      }
      if (data.order.totals.discountCode) {
        setDiscountCode(data.order.totals.discountCode);
      }

      syncCheckoutUrlImmediately(data.order.orderId, data.accessKey);

      if (!isSquareOrder(data.order.payment)) {
        updateCheckoutUrl(data.order.orderId, data.accessKey);
      }

      const hostedRedirectUrl =
        data.redirectUrl ||
        (isSquareOrder(data.order.payment)
          ? data.order.payment.checkoutUrl
          : isShieldClimbOrder(data.order.payment)
            ? data.order.payment.redirectUrl
            : null);

      if (hostedRedirectUrl) {
        const paymentWindow = shieldClimbPaymentWindow.current;

        if (paymentWindow && !paymentWindow.closed) {
          shieldClimbPaymentWindow.current = paymentWindow;
          paymentWindow.location.href = hostedRedirectUrl;
          paymentWindow.focus();
        } else {
          const openedWindow = window.open(
            hostedRedirectUrl,
            '_blank',
            'noopener,noreferrer',
          );
          shieldClimbPaymentWindow.current = openedWindow;

          if (!openedWindow) {
            toast('Secure payment ready', {
              description:
                'Use the Pay now button below to open the hosted payment page.',
            });
          }
        }

        return;
      }

      if (shieldClimbPaymentWindow.current && !shieldClimbPaymentWindow.current.closed) {
        shieldClimbPaymentWindow.current.close();
      }
      shieldClimbPaymentWindow.current = null;
    } catch (submitError: unknown) {
      if (
        shieldClimbPaymentWindow.current &&
        !shieldClimbPaymentWindow.current.closed
      ) {
        shieldClimbPaymentWindow.current.close();
      }
      shieldClimbPaymentWindow.current = null;
      setError(submitError instanceof Error ? submitError.message : 'Unable to create payment.');
    } finally {
      paymentSubmitInFlight.current = false;
      setIsCreatingPayment(false);
    }
  }, [
    buildCheckoutSessionPayload,
    cardProcessingEnabled,
    cardSquareFallbackEnabled,
    ensureShippingServiceIdForPayment,
    ensureCheckoutApiSession,
    createCheckoutApiSession,
    refreshCheckoutApiSession,
    squareFallbackAvailable,
    interacSenderEmail,
    interacSenderName,
    effectiveInteracSenderEmail,
    effectiveInteracSenderName,
    paymentMethod,
    syncCheckoutUrlImmediately,
    updateCheckoutUrl,
  ]);

  const handleCreatePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (paymentMethod === 'card' && !cardProcessingEnabled) {
      setError(getCardProcessingUnavailableMessage());
      return;
    }

    if (paymentMethod === 'card') {
      await continueToCardCheckout();
      return;
    }

    if (paymentMethod === 'square') {
      if (!squareFallbackAvailable) {
        setError('Hosted card checkout is not available right now.');
        return;
      }

      shieldClimbPaymentWindow.current = openHostedPaymentWindowPlaceholder();
    }

    await submitCheckoutPayment();
  };

  const continueToCardCheckout = useCallback(async () => {
    if (isCreatingPayment) return;

    if (!cardProcessingEnabled) {
      setError(getCardProcessingUnavailableMessage());
      return;
    }

    const parsedExpiry = parseCardExpiry(cardExpiry);
    const normalizedCardholderName = cardholderName.trim().replace(/\s+/g, ' ');
    const normalizedNumber = cardNumber.replace(/\D/g, '');
    const normalizedCvv = cardCvv.replace(/\D/g, '');

    if (!normalizedCardholderName) {
      setError('Enter the name on the card.');
      return;
    }

    if (!cardBillingSameAsShipping && !isBillingAddressReady(cardBillingAddress)) {
      setError('Enter a complete billing address.');
      return;
    }

    if (normalizedNumber.length < 12 || !parsedExpiry || normalizedCvv.length < 3) {
      setError('Enter valid card number, expiry, and CVV.');
      return;
    }

    const billingAddress = cardBillingSameAsShipping
      ? undefined
      : normalizeBillingAddressForPayment(cardBillingAddress);

    await submitCheckoutPayment({
      number: normalizedNumber,
      cvv: normalizedCvv,
      expiryMonth: parsedExpiry.expiryMonth,
      expiryYear: parsedExpiry.expiryYear,
      cardholderName: normalizedCardholderName,
      ...(billingAddress ? { billingAddress } : {}),
    });
  }, [
    cardBillingAddress,
    cardBillingSameAsShipping,
    cardCvv,
    cardProcessingEnabled,
    cardExpiry,
    cardholderName,
    cardNumber,
    isCreatingPayment,
    submitCheckoutPayment,
  ]);

  const refreshStatus = async () => {
    if (!pollingId || !checkoutSession) return;

    setIsRefreshingStatus(true);
    const currentOrderId = checkoutSession.order.orderId;
    const currentAccessKey = checkoutSession.accessKey;

    try {
      const response = await fetch(
        `/api/checkout/v2/payments/${encodeURIComponent(
          pollingId
        )}/status?orderId=${encodeURIComponent(currentOrderId)}&key=${encodeURIComponent(currentAccessKey)}`,
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

      setCheckoutSession(current => (
        current?.accessKey === currentAccessKey && current.order.orderId === currentOrderId
          ? { ...current, order: data.order }
          : current
      ));
      setError(null);
    } catch (refreshError: unknown) {
      if (isCurrentCheckoutSession(currentOrderId, currentAccessKey)) {
        setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh payment status.');
      }
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const submitInteracTransfer = async () => {
    if (!checkoutSession || !activeOrder || !interacPayment) return;

    setIsSubmittingInterac(true);
    setError(null);
    const currentOrderId = activeOrder.orderId;
    const currentAccessKey = checkoutSession.accessKey;

    try {
      const response = await fetch(
        `/api/checkout/v2/orders/${encodeURIComponent(currentOrderId)}/interac-submission`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessKey: currentAccessKey }),
        },
      );
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to update Interac status.'));
      }
      const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
      if (data?.order) {
        setCheckoutSession(current => (
          current?.accessKey === currentAccessKey && current.order.orderId === currentOrderId
            ? { ...current, order: data.order }
            : current
        ));
      }
      await refreshStatus();
    } catch (submitError: unknown) {
      if (isCurrentCheckoutSession(currentOrderId, currentAccessKey)) {
        setError(submitError instanceof Error ? submitError.message : 'Unable to update Interac status.');
      }
    } finally {
      setIsSubmittingInterac(false);
    }
  };

  const uploadInteracScreenshot = async (file: File | null | undefined) => {
    if (!file || !checkoutSession || !activeOrder || !interacPayment) return;

    setIsUploadingInteracScreenshot(true);
    setError(null);
    const currentOrderId = activeOrder.orderId;
    const currentAccessKey = checkoutSession.accessKey;

    try {
      const formData = new FormData();
      formData.set('accessKey', currentAccessKey);
      formData.set('file', file);
      const response = await fetch(
        `/api/checkout/v2/orders/${encodeURIComponent(currentOrderId)}/interac-screenshot`,
        {
          method: 'POST',
          body: formData,
        },
      );
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to upload screenshot.'));
      }
      const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
      if (data?.order) {
        setCheckoutSession(current => (
          current?.accessKey === currentAccessKey && current.order.orderId === currentOrderId
            ? { ...current, order: data.order }
            : current
        ));
      }
      if (isCurrentCheckoutSession(currentOrderId, currentAccessKey)) {
        toast.success('Screenshot uploaded for review');
      }
    } catch (uploadError: unknown) {
      if (isCurrentCheckoutSession(currentOrderId, currentAccessKey)) {
        setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload screenshot.');
      }
    } finally {
      setIsUploadingInteracScreenshot(false);
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
    async (nextPaymentMethod: 'card' | 'crypto' | 'interac' | 'square') => {
      if (!checkoutSession || !activeOrder) return;

      setIsReleasingOrder(true);
      setReleaseAction('switch');
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
        activeQuoteRequestSignature.current = null;
        setCheckoutSession(null);
        setQuote(null);
        setSelectedShippingServiceId(preservedShippingServiceId);
        setShipmentProtection(Boolean(activeOrder.totals.shipmentProtection));
        selectPaymentMethod(nextPaymentMethod);
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
        setReleaseAction(null);
        setIsReleasingOrder(false);
      }
    },
    [
      activeOrder,
      checkoutSession,
      quoteRequestSignature,
      requestQuote,
      selectPaymentMethod,
      shippingAddress,
      syncCheckoutUrlImmediately,
      updateCheckoutUrl,
    ]
  );

  const paymentStatus = activeOrder?.payment.status || 'waiting';
  const nowPayment = activeOrder?.payment && isNowPaymentsOrder(activeOrder.payment) ? activeOrder.payment : null;
  const shieldClimbPayment = activeOrder?.payment && isShieldClimbOrder(activeOrder.payment) ? activeOrder.payment : null;
  const bankfulPayment = activeOrder?.payment && isBankfulOrder(activeOrder.payment) ? activeOrder.payment : null;
  const squarePayment = activeOrder?.payment && isSquareOrder(activeOrder.payment) ? activeOrder.payment : null;
  const interacPayment = activeOrder?.payment && isInteracOrder(activeOrder.payment) ? activeOrder.payment : null;
  const hostedCardPaymentUrl = shieldClimbPayment?.redirectUrl || squarePayment?.checkoutUrl || null;
  const activeOrderUsesCardPayment = Boolean(shieldClimbPayment || bankfulPayment || squarePayment);
  const alternatePaymentMethod: 'card' | 'crypto' | 'interac' | 'square' = activeOrderUsesCardPayment
    ? 'crypto'
    : interacPayment
      ? 'crypto'
      : cardProcessingEnabled
        ? 'card'
        : 'interac';
  const paymentExpiresAt = nowPayment ? formatDateTime(nowPayment.validUntil || nowPayment.expirationEstimateDate) : null;
  const isPartiallyPaid = paymentStatus === 'partially_paid';

  const editActiveOrder = useCallback(async () => {
    if (!checkoutSession || !activeOrder || isPartiallyPaid) return;

    setIsReleasingOrder(true);
    setReleaseAction('edit');
    setError(null);

    try {
      const preservedShippingServiceId = activeOrder.shippingService?.id || '';
      const response = await fetch(
        `/api/checkout/v2/orders/${encodeURIComponent(activeOrder.orderId)}?key=${encodeURIComponent(
          checkoutSession.accessKey
        )}&reason=edit_order`,
        {
          method: 'DELETE',
        }
      );
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to return this checkout to edit mode.'));
      }

      quoteAbortController.current?.abort();
      activeQuoteRequestSignature.current = null;
      setCheckoutSession(null);
      setQuote(null);
      setSelectedShippingServiceId(preservedShippingServiceId);
      setShipmentProtection(Boolean(activeOrder.totals.shipmentProtection));
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
          : 'Unable to return this checkout to edit mode right now.'
      );
    } finally {
      setReleaseAction(null);
      setIsReleasingOrder(false);
    }
  }, [
    activeOrder,
    checkoutSession,
    isPartiallyPaid,
    quoteRequestSignature,
    requestQuote,
    shippingAddress,
    syncCheckoutUrlImmediately,
    updateCheckoutUrl,
  ]);

  const activeOrderTotalAmount = activeOrder
    ? Number(interacPayment?.cadAmount || activeOrder.totals.totalAmount.amount || 0)
    : 0;
  const remainingBalanceAmount = (() => {
    if (!activeOrder) return 0;
    const parsed = Number(activeOrder.payment.remainingBalanceAmount);
    if (Number.isFinite(parsed)) {
      return Math.max(parsed, 0);
    }

    if (!isPartiallyPaid) {
      return 0;
    }

    return Math.max(
      activeOrderTotalAmount - Number(activeOrder.payment.cumulativePaidAmount || 0),
      0,
    );
  })();
  const cumulativePaidAmount = (() => {
    if (!activeOrder) return 0;
    const parsed = Number(activeOrder.payment.cumulativePaidAmount);
    if (Number.isFinite(parsed)) {
      return Math.max(parsed, 0);
    }

    if (remainingBalanceAmount > 0) {
      return Math.max(activeOrderTotalAmount - remainingBalanceAmount, 0);
    }

    const fallback = Number(
      interacPayment?.receivedAmount ||
      activeOrder.payment.amountPaidToDate ||
      0,
    );
    return Number.isFinite(fallback) ? Math.max(fallback, 0) : 0;
  })();

  const nowPaymentsRemainingCrypto = (() => {
    if (!isPartiallyPaid || !nowPayment) return 0;
    const payAmount = Number(nowPayment.payAmount || 0);
    const amountReceived = Number(nowPayment.amountReceived || 0);
    return Math.max(payAmount - amountReceived, 0);
  })();

  const partialPaymentPaidDisplay = (() => {
    if (!isPartiallyPaid || !activeOrder) return null;
    return {
      received: formatPrice(cumulativePaidAmount.toFixed(2), interacPayment ? 'CAD' : activeOrder.currencyCode),
      total: formatPrice(activeOrderTotalAmount.toFixed(2), interacPayment ? 'CAD' : activeOrder.currencyCode),
      remaining: formatPrice(remainingBalanceAmount.toFixed(2), interacPayment ? 'CAD' : activeOrder.currencyCode),
    };
  })();
  const interacAmountToSend = interacPayment && isPartiallyPaid && remainingBalanceAmount > 0
    ? remainingBalanceAmount.toFixed(2)
    : interacPayment?.cadAmount;

  const canPayRemainderWithCard = cardProcessingEnabled;

  const canSwitchToAlternatePayment =
    alternatePaymentMethod !== 'card'
      ? true
      : canPayRemainderWithCard;

  const canPlaceOrder =
    cart &&
    cart.lines.length > 0 &&
    effectiveSelectedShippingServiceId &&
    !isCreatingPayment &&
    ageVerified &&
    !(paymentMethod === 'card' && !cardProcessingEnabled) &&
    !(paymentMethod === 'square' && !squareFallbackAvailable) &&
    !(
      paymentMethod === 'interac' &&
      (!effectiveInteracSenderEmail || !effectiveInteracSenderName)
    );
  const isCheckoutRestoring = !isDraftHydrated || (isLoadingOrder && !activeOrder);

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

        {squareFallbackUnlock ? (
          <div className="mb-6 overflow-hidden rounded-2xl border border-[#C58A1B]/35 bg-[#FBEFCF]/55">
            <div className="flex items-start gap-3 px-4 py-3.5 md:px-5">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F] text-[#F4F1EA]">
                <RefreshCw className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0B2E2F]">
                  Your card didn&apos;t go through — let&apos;s try again
                </p>
                <p className="mt-1 text-xs leading-5 text-[#0B2E2F]/70">
                  No charge was made. We&apos;ve switched you to our backup secure card processor (Square). Use the same card —
                  press <span className="font-semibold">Place Order &amp; Pay</span> below and the secure payment page will open
                  in a new tab.
                </p>
              </div>
            </div>
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
                  {selectedChargedShipmentProtection ? (
                    <SummaryBlock
                      label="Shipment Protection"
                      value={summaryShipmentProtectionValue}
                    />
                  ) : null}
                  <SummaryBlock label="Tax" value={summaryTaxValue} />
                  {hasLandedCost ? (
                    <SummaryBlock label="Duties & import taxes" value={summaryLandedCostValue} />
                  ) : null}
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
            ) : activeOrder && paymentStatus !== 'finished' && paymentStatus !== 'paid' && !isPartiallyPaid ? (
              <div className="rounded-[26px] border border-border/70 bg-card p-4 text-sm text-foreground/65">
                Need to make changes? Use{' '}
                <span className="font-semibold text-foreground">Edit order</span>{' '}
                above to return to cart and shipping before you pay.
              </div>
            ) : null}
          </aside>

          {/* ── Main content ── */}
          <section>
            {isCheckoutRestoring ? (
              <div className="rounded-[26px] border border-border/70 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.04)]">
                <div className="flex items-center gap-3 text-sm text-foreground/60">
                  <Loader2 className="size-4 animate-spin text-[#0B2E2F]" />
                  Restoring checkout...
                </div>
              </div>
            ) : !activeOrder ? (
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
                        <ShippingField
                          label="Street address"
                          name="address1"
                          value={shippingAddress.address1}
                          onChange={handleShippingChange}
                          autoComplete="address-line1"
                          inputRef={setAddress1InputElement}
                        />
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

                    {isAdminCheckoutUser ? (
                      <label className="mt-3 flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-amber-300/70 bg-amber-50/60 px-3.5 py-3 transition-colors hover:bg-amber-50">
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            checked={adminShippingDisabled}
                            onChange={(event) => handleAdminShippingDisabledChange(event.target.checked)}
                            className="mt-0.5 size-[18px] shrink-0 rounded accent-[#0B2E2F]"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-amber-950">Disable shipping</p>
                            <p className="mt-1 text-xs leading-5 text-amber-900/70">
                              Admin test order. No shipping charge, duties, protection, or label purchase.
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70">
                          Admin
                        </span>
                      </label>
                    ) : null}

                    {!effectiveAdminShippingDisabled ? (
                      <label className="mt-3 flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background px-3.5 py-3 transition-colors hover:bg-muted/40">
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            checked={effectiveShipmentProtection}
                            onChange={(event) => handleShipmentProtectionChange(event.target.checked)}
                            className="mt-0.5 size-[18px] shrink-0 rounded accent-[#0B2E2F]"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <ShieldCheck className="size-4 text-[#0B2E2F]" strokeWidth={1.7} />
                              <p className="text-sm font-semibold">Shipment Protection</p>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-foreground/55">
                              Optional replacement support for lost or damaged packages.
                            </p>
                            {effectiveShipmentProtection && selectedQuoteService ? (
                              <p className="mt-1 text-[11px] font-medium text-foreground/45">
                                Added to your order total as Shipment Protection.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-sm font-semibold">
                          {shipmentProtectionRateLabel}
                        </span>
                      </label>
                    ) : null}

                    <div className="mt-3 space-y-2">
                      {quote ? (
                        quote.services.map(service => {
                          const isActive = (effectiveSelectedShippingServiceId || quote.selectedServiceId) === service.id;
                          const carrierLogo = getShippingCarrierLogo(service.carrier);
                          const estimatedDelivery = formatEstimatedDeliveryDays(service.estimatedDays);
                          const optionCategory = formatShippingOptionCategory(service.quoteCategory);
                          const optionLandedCost = Number(service.landedCostAmount?.amount || 0);
                          const optionProtection = effectiveShipmentProtection
                            ? service.shipmentProtection || service.availableShipmentProtection
                            : service.availableShipmentProtection;
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
                              <div className="text-right">
                                <div className="text-sm font-semibold">
                                  {renderShippingPrice(
                                    service.price.amount,
                                    service.price.currencyCode,
                                    service.originalPrice?.amount
                                  )}
                                </div>
                                {optionLandedCost > 0.009 ? (
                                  <p className="mt-1 text-[11px] font-medium text-foreground/55">
                                    +{formatPrice(service.landedCostAmount?.amount || '0.00', service.landedCostAmount?.currencyCode || service.price.currencyCode)} duties
                                  </p>
                                ) : null}
                                {optionProtection ? (
                                  <p className="mt-1 text-[11px] font-medium text-foreground/55">
                                    +{formatPrice(optionProtection.totalAmount.amount, optionProtection.totalAmount.currencyCode)} Shipment Protection
                                  </p>
                                ) : null}
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

                    <div className="mt-3 grid gap-2.5 md:grid-cols-3">
                      {cardProcessingEnabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isCardCheckoutUnavailable && !squareFallbackAvailable) return;
                            selectPaymentMethod(squareFallbackAvailable ? 'square' : 'card');
                          }}
                          disabled={isCardCheckoutUnavailable && !squareFallbackAvailable}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-all',
                            isCardCheckoutUnavailable && !squareFallbackAvailable
                              ? 'cursor-not-allowed border-border/70 bg-background/60 opacity-55'
                              : paymentMethod === 'card' || paymentMethod === 'square'
                              ? 'border-[#0B2E2F] bg-[#0B2E2F]/5 ring-1 ring-[#0B2E2F]'
                              : 'border-border bg-background hover:border-[#0B2E2F]/30'
                          )}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
                            <CreditCard className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold leading-5">Debit / Credit Card</p>
                              {isCardCheckoutUnavailable || squareFallbackAvailable ? (
                                <span className="rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground/45">
                                  {squareFallbackAvailable
                                    ? 'Hosted checkout'
                                    : 'Disabled'}
                                </span>
                              ) : null}
                            </div>
                            {isCardCheckoutUnavailable && !squareFallbackAvailable ? (
                              <p className="mt-1 text-xs text-foreground/45">
                                {cardCheckoutUnavailableMessage}
                              </p>
                            ) : squareFallbackAvailable ? (
                              <p className="mt-1 text-xs text-foreground/55">Secure Square-hosted card checkout</p>
                            ) : (
                              <PaymentBrandIcons className="mt-1" />
                            )}
                          </div>
                          <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', paymentMethod === 'card' || paymentMethod === 'square' ? 'border-[#0B2E2F]' : 'border-foreground/20')}>
                            {(paymentMethod === 'card' || paymentMethod === 'square') && <div className="size-2.5 rounded-full bg-[#0B2E2F]" />}
                          </div>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => selectPaymentMethod('crypto')}
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
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold leading-5">Direct Crypto</p>
                            <span className="rounded-full bg-[#0B2E2F] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F4F1EA]">Save 5%</span>
                          </div>
                          <p className="text-xs text-foreground/55">BTC, ETH, USDT, more</p>
                        </div>
                        <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', paymentMethod === 'crypto' ? 'border-[#0B2E2F]' : 'border-foreground/20')}>
                          {paymentMethod === 'crypto' && <div className="size-2.5 rounded-full bg-[#0B2E2F]" />}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => selectPaymentMethod('interac')}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                          paymentMethod === 'interac'
                            ? 'border-[#0B2E2F] bg-[#0B2E2F]/5 ring-1 ring-[#0B2E2F]'
                            : 'border-border bg-background hover:border-[#0B2E2F]/30'
                        )}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
                          <Landmark className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="whitespace-nowrap text-sm font-semibold leading-5">Interac e-Transfer</p>
                            <span className="whitespace-nowrap rounded-full bg-[#0B2E2F] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#F4F1EA]">Save 5%</span>
                          </div>
                          <p className="text-xs text-foreground/55">Auto-deposit confirmation</p>
                        </div>
                        <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', paymentMethod === 'interac' ? 'border-[#0B2E2F]' : 'border-foreground/20')}>
                          {paymentMethod === 'interac' && <div className="size-2.5 rounded-full bg-[#0B2E2F]" />}
                        </div>
                      </button>
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
                    ) : paymentMethod === 'interac' ? (
                      <div className="mt-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
                            <Send className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">Interac sender details</p>
                            <p className="mt-1 text-xs leading-5 text-foreground/50">
                              Use the email and name your Canadian bank will show on the e-Transfer. Wise and third-party Interac processors are not supported.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Email used for your e-Transfer</span>
                            <Input
                              type="email"
                              value={interacSenderEmail}
                              onChange={event => setInteracSenderEmail(event.target.value)}
                              placeholder={shippingAddress.email || 'name@example.com'}
                              className="h-11 rounded-xl border-border bg-white"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Name shown by your bank</span>
                            <Input
                              type="text"
                              value={interacSenderName}
                              onChange={event => setInteracSenderName(event.target.value)}
                              placeholder={`${shippingAddress.firstName} ${shippingAddress.lastName}`.trim() || 'Your full name'}
                              className="h-11 rounded-xl border-border bg-white"
                            />
                          </label>
                        </div>
                        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-white px-3.5 py-3">
                          <input
                            type="checkbox"
                            checked={interacHasSecurityQuestion}
                            onChange={event => setInteracHasSecurityQuestion(event.target.checked)}
                            className="mt-0.5 size-4 rounded border-border accent-[#0B2E2F]"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">My e-Transfer has a security question</span>
                            <span className="mt-0.5 block text-xs leading-5 text-foreground/50">
                              Optional. Only add this if your bank does not use Autodeposit. This sends the transfer to manual review.
                            </span>
                          </span>
                        </label>
                        {interacHasSecurityQuestion ? (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Security question</span>
                              <Input
                                type="text"
                                value={interacSecurityQuestion}
                                onChange={event => setInteracSecurityQuestion(event.target.value)}
                                placeholder="Question shown by your bank"
                                className="h-11 rounded-xl border-border bg-white"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Security answer</span>
                              <Input
                                type="text"
                                value={interacSecurityAnswer}
                                onChange={event => setInteracSecurityAnswer(event.target.value)}
                                placeholder="Answer we should use"
                                className="h-11 rounded-xl border-border bg-white"
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    ) : paymentMethod === 'square' ? (
                      <div
                        className={cn(
                          'mt-3 rounded-2xl border px-4 py-4',
                          squareFallbackUnlock
                            ? 'border-[#C58A1B]/40 bg-[#FBEFCF]/45'
                            : 'border-[#0B2E2F]/15 bg-[#0B2E2F]/5'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F] text-[#F4F1EA]">
                            {squareFallbackUnlock ? <RefreshCw className="size-4" /> : <CreditCard className="size-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {squareFallbackUnlock ? 'Retry with secure hosted checkout' : 'Secure hosted card checkout'}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-foreground/60">
                              {squareFallbackUnlock
                                ? 'Use the same card. When you press Place Order & Pay, Square opens a secure payment page in a new tab — this page waits for confirmation. Your card was not charged on the previous attempt.'
                                : 'Your order will be charged in CAD through Square. After placing the order, the payment page opens in a new tab and this page waits for confirmation.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : paymentMethod === 'card' && isCardCheckoutUnavailable ? (
                      <div className="mt-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-foreground/45">
                            <CreditCard className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">Debit / Credit Card unavailable</p>
                            <p className="mt-1 text-xs leading-5 text-foreground/50">
                              {cardCheckoutUnavailableMessage}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0B2E2F]/8 text-[#0B2E2F]">
                            <Lock className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">Card details</p>
                            <p className="mt-1 text-xs leading-5 text-foreground/50">
                              Encrypted. Revalin never stores your card details. Only transaction IDs and card last four digits are stored after approval.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          <label className="flex flex-col gap-1.5" htmlFor="checkout-cardholder-name">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Name on card</span>
                            <Input
                              id="checkout-cardholder-name"
                              name="cc-name"
                              type="text"
                              autoComplete="cc-name"
                              autoCapitalize="words"
                              autoCorrect="off"
                              required={paymentMethod === 'card'}
                              maxLength={128}
                              value={cardholderName}
                              onChange={event => {
                                setCardholderName(event.target.value);
                                if (error === 'Enter the name on the card.') {
                                  setError(null);
                                }
                              }}
                              placeholder={`${shippingAddress.firstName} ${shippingAddress.lastName}`.trim() || 'Name on card'}
                              className="h-11 rounded-xl border-border bg-white"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5" htmlFor="checkout-card-number">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Card number</span>
                            <Input
                              id="checkout-card-number"
                              name="cc-number"
                              type="text"
                              inputMode="numeric"
                              autoComplete="cc-number"
                              autoCapitalize="off"
                              autoCorrect="off"
                              required={paymentMethod === 'card'}
                              minLength={12}
                              maxLength={23}
                              value={cardNumber}
                              onChange={event => {
                                setCardNumber(normalizeCardNumberInput(event.target.value));
                                if (error === 'Enter valid card number, expiry, and CVV.') {
                                  setError(null);
                                }
                              }}
                              placeholder="1234 1234 1234 1234"
                              className="h-11 rounded-xl border-border bg-white"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1.5" htmlFor="checkout-card-expiry">
                              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Expiry</span>
                              <Input
                                id="checkout-card-expiry"
                                name="cc-exp"
                                type="text"
                                inputMode="numeric"
                                autoComplete="cc-exp"
                                autoCapitalize="off"
                                autoCorrect="off"
                                required={paymentMethod === 'card'}
                                maxLength={5}
                                value={cardExpiry}
                                onChange={event => {
                                  setCardExpiry(normalizeCardExpiryInput(event.target.value));
                                  if (error === 'Enter valid card number, expiry, and CVV.') {
                                    setError(null);
                                  }
                                }}
                                placeholder="MM/YY"
                                className="h-11 rounded-xl border-border bg-white"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5" htmlFor="checkout-card-cvv">
                              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">CVV</span>
                              <Input
                                id="checkout-card-cvv"
                                name="cc-csc"
                                type="text"
                                inputMode="numeric"
                                autoComplete="cc-csc"
                                autoCapitalize="off"
                                autoCorrect="off"
                                required={paymentMethod === 'card'}
                                minLength={3}
                                maxLength={4}
                                value={cardCvv}
                                onChange={event => {
                                  setCardCvv(event.target.value.replace(/\D/g, '').slice(0, 4));
                                  if (error === 'Enter valid card number, expiry, and CVV.') {
                                    setError(null);
                                  }
                                }}
                                placeholder="123"
                                className="h-11 rounded-xl border-border bg-white"
                              />
                            </label>
                          </div>
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-white px-3.5 py-3">
                            <input
                              type="checkbox"
                              checked={cardBillingSameAsShipping}
                              onChange={event => handleCardBillingSameAsShippingChange(event.target.checked)}
                              className="size-4 rounded border-border accent-[#0B2E2F]"
                            />
                            <span className="text-sm font-semibold">Billing address same as shipping</span>
                          </label>
                          {!cardBillingSameAsShipping ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="md:col-span-2">
                                <BillingAddressField
                                  label="Billing street address"
                                  name="address1"
                                  value={cardBillingAddress.address1}
                                  onChange={handleCardBillingAddressChange}
                                  autoComplete="billing address-line1"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <BillingAddressField
                                  label="Apartment, suite, unit"
                                  name="address2"
                                  value={cardBillingAddress.address2}
                                  onChange={handleCardBillingAddressChange}
                                  autoComplete="billing address-line2"
                                  placeholder="Optional"
                                  required={false}
                                />
                              </div>
                              <BillingAddressField
                                label="City"
                                name="city"
                                value={cardBillingAddress.city}
                                onChange={handleCardBillingAddressChange}
                                autoComplete="billing address-level2"
                              />
                              <BillingAddressField
                                label="State / Province / Region"
                                name="province"
                                value={cardBillingAddress.province}
                                onChange={handleCardBillingAddressChange}
                                autoComplete="billing address-level1"
                                required={isProvinceRequired(cardBillingAddress.country)}
                                placeholder={isProvinceRequired(cardBillingAddress.country) ? undefined : 'Optional where not used'}
                              />
                              <BillingAddressField
                                label="Postal / ZIP code"
                                name="postalCode"
                                value={cardBillingAddress.postalCode}
                                onChange={handleCardBillingAddressChange}
                                autoComplete="billing postal-code"
                              />
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Country</span>
                                <select
                                  value={cardBillingAddress.country}
                                  onChange={event => handleCardBillingAddressChange('country', event.target.value)}
                                  className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
                                >
                                  {countryOptions.map(country => (
                                    <option key={country.code} value={country.code}>
                                      {country.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          ) : null}
                          <p className="px-1 text-xs text-foreground/45">
                            Want to save 5%? Choose <button type="button" onClick={() => selectPaymentMethod('crypto')} className="font-semibold text-[#0B2E2F] underline underline-offset-2">Direct Crypto</button> or <button type="button" onClick={() => selectPaymentMethod('interac')} className="font-semibold text-[#0B2E2F] underline underline-offset-2">Interac e-Transfer</button> above.
                          </p>
                        </div>
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
                              {formatAppliedDiscountSummary(appliedDiscount)}
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

                  {/* ── 6. Age verification ── */}
                  <div className="mx-4 border-t border-border/50 md:mx-5" />
                  <div className="p-4 md:p-5">
                    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <BadgeCheck className="size-4 shrink-0 text-amber-700" />
                        <p className="text-sm font-semibold text-amber-900">Age Verification Required</p>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800/70">
                        Federal and provincial regulations require us to verify that all purchasers are at least 21 years of age.
                      </p>
                    </div>

                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-4 transition-colors hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={ageVerified}
                        onChange={(e) => setAgeVerified(e.target.checked)}
                        className="mt-0.5 size-[18px] shrink-0 rounded accent-[#0B2E2F]"
                      />
                      <span className="text-[13px] leading-relaxed text-foreground/80">
                        I confirm that I am 21 years of age or older. I acknowledge that all products sold by Revalin are intended strictly for laboratory and research purposes only. These products are not intended for human consumption, are not dietary supplements, and have not been evaluated or approved by Health Canada or the FDA. I accept full responsibility for the use of any products purchased.
                      </span>
                    </label>
                  </div>

                  {/* ── Place order CTA ── */}
                  <div className="border-t border-border/50 p-4 md:p-5">
                    <p className="mb-4 text-[12px] leading-relaxed text-foreground/45">
                      By clicking Place Order, you confirm that you have read and accept our{' '}
                      <Link href="/terms-of-service" className="underline underline-offset-2 hover:text-foreground/70">Terms of Service</Link>
                      {' '}and acknowledge our{' '}
                      <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-foreground/70">Privacy Policy</Link>.
                    </p>

                    {/* Trust badges */}
                    <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                      {[
                        { icon: ShieldCheck, label: 'Secure Checkout' },
                        { icon: FlaskConical, label: 'Lab Tested' },
                        { icon: Truck, label: 'Insured Shipping' },
                        { icon: Lock, label: 'Encrypted' },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5">
                          <Icon className="size-3.5 text-[#0B2E2F]/60" strokeWidth={1.5} />
                          <span className="text-[11px] font-medium text-foreground/60">{label}</span>
                        </div>
                      ))}
                    </div>

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
                      ) : (
                        <>
                          <Lock className="size-4" />
                          {paymentMethod === 'card' || paymentMethod === 'square' ? 'Place Order & Pay' : 'Place Order — Secure'}
                        </>
                      )}
                    </Button>
                    {paymentMethod === 'card' || paymentMethod === 'square' ? (
                      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-foreground/45">
                        <Lock className="size-3" />
                        {paymentMethod === 'square'
                          ? 'Square opens in a new tab; this page tracks confirmation automatically.'
                          : 'Your information is protected with 256-bit SSL encryption'}
                      </p>
                    ) : paymentMethod === 'interac' ? (
                      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-foreground/45">
                        <Lock className="size-3" />
                        You&apos;ll receive a copyable Interac message code and exact amount after placing the order.{directPaymentSavingsMessage}
                      </p>
                    ) : (
                      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-foreground/45">
                        <Lock className="size-3" />
                        You&apos;ll receive a {formatTicker(paymentCurrency)} deposit address in the next step.{directPaymentSavingsMessage}
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
                                {line.fulfillmentEstimate?.label ? (
                                  <p className="text-xs text-foreground/50">{line.fulfillmentEstimate.label}</p>
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
                            {activeOrder.totals.shipmentProtectionAmount ? (
                              <div className="flex justify-between">
                                <span className="text-foreground/65">Shipment Protection</span>
                                <span>{formatPrice(activeOrder.totals.shipmentProtectionAmount.amount, activeOrder.totals.shipmentProtectionAmount.currencyCode)}</span>
                              </div>
                            ) : null}
                            {activeOrder.totals.taxAmount && Number(activeOrder.totals.taxAmount.amount) > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-foreground/65">Tax</span>
                                <span>{formatPrice(activeOrder.totals.taxAmount.amount, activeOrder.totals.taxAmount.currencyCode)}</span>
                              </div>
                            ) : null}
                            {activeOrder.totals.landedCostAmount && Number(activeOrder.totals.landedCostAmount.amount) > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-foreground/65">Duties & import taxes</span>
                                <span>{formatPrice(activeOrder.totals.landedCostAmount.amount, activeOrder.totals.landedCostAmount.currencyCode)}</span>
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
                              <p className="font-semibold">{activeOrderUsesCardPayment ? 'Card' : interacPayment ? 'Interac' : 'Crypto'}</p>
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
                        {!isTerminalPaymentStatus(paymentStatus) && !isPartiallyPaid ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={editActiveOrder}
                            disabled={isReleasingOrder}
                          >
                            {isReleasingOrder && releaseAction === 'edit' ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                Returning...
                              </>
                            ) : (
                              'Edit order'
                            )}
                          </Button>
                        ) : null}
                        {!isTerminalPaymentStatus(paymentStatus) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => releaseActiveOrder(activeOrderUsesCardPayment ? 'crypto' : 'card')}
                            disabled={isReleasingOrder || !canSwitchToAlternatePayment}
                          >
                            {isReleasingOrder && releaseAction === 'switch' ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                Switching...
                              </>
                            ) : (
                              canSwitchToAlternatePayment
                                ? 'Choose different payment'
                                : 'Card checkout disabled'
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
                        {/* ── Hosted card payment view ── */}
                        {hostedCardPaymentUrl ? (
                          <>
                            {/* ── Partial payment banner ── */}
                            {isPartiallyPaid && partialPaymentPaidDisplay ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                  <div>
                                    <p className="font-semibold">Partial payment received</p>
                                    <p className="mt-1 text-amber-800">
                                      We received {partialPaymentPaidDisplay.received} of {partialPaymentPaidDisplay.total}. <span className="font-semibold">{partialPaymentPaidDisplay.remaining} remaining.</span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {/* ── "Don't close tab" banner ── */}
                            {!isTerminalPaymentStatus(paymentStatus) && !isPartiallyPaid ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                  <div>
                                    <p className="text-sm font-semibold text-amber-900">Do not close this tab</p>
                                    <p className="mt-0.5 text-xs leading-5 text-amber-800">
                                      Complete your payment in the other tab. This page automatically tracks your payment and will update when confirmed.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {/* ── Remainder payment options (for partially_paid) ── */}
                            {isPartiallyPaid ? (
                              <div className="rounded-2xl border border-[#0B2E2F]/15 bg-white px-5 py-5">
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="flex size-9 items-center justify-center rounded-full bg-amber-500">
                                    <Wallet className="size-4 text-white" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold">Pay remaining balance</p>
                                    <p className="text-xs text-foreground/50">{partialPaymentPaidDisplay?.remaining} left to pay</p>
                                  </div>
                                </div>
                                <div className="space-y-2.5">
                                  <button
                                    type="button"
                                    onClick={() => releaseActiveOrder('crypto')}
                                    disabled={isReleasingOrder}
                                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#0B2E2F]/15 bg-[#0B2E2F] px-5 py-3 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90 disabled:opacity-50"
                                  >
                                    {isReleasingOrder ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                                    Pay with crypto
                                    <ArrowRight className="size-4" />
                                  </button>
                                  {canPayRemainderWithCard ? (
                                    <button
                                      type="button"
                                      onClick={() => releaseActiveOrder('card')}
                                      disabled={isReleasingOrder}
                                      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#0B2E2F]/15 bg-white px-5 py-3 text-sm font-semibold text-[#0B2E2F] transition-colors hover:bg-[#0B2E2F]/5 disabled:opacity-50"
                                    >
                                      {isReleasingOrder ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                                      Pay with card
                                      <ArrowRight className="size-4" />
                                    </button>
                                  ) : (
                                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-background/60 px-5 py-3 text-sm text-foreground/45">
                                      <CreditCard className="size-4" />
                                      Card checkout disabled
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                                        Disabled
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
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
                                href={hostedCardPaymentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                                style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                              >
                                <ShieldCheck className="size-4" />
                                Pay now
                                <ArrowRight className="size-4" />
                              </a>
                              <p className="mt-3 text-center text-xs leading-4 text-foreground/45">
                                You may need to complete payment in the new tab. This page tracks your payment automatically.
                              </p>
                            </div>
                            )}

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

                        {/* ── Interac e-Transfer payment view ── */}
                        {interacPayment ? (
                          <>
                            {isPartiallyPaid && partialPaymentPaidDisplay ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                  <div>
                                    <p className="font-semibold">Partial payment received</p>
                                    <p className="mt-1 text-amber-800">
                                      We received {partialPaymentPaidDisplay.received} of {partialPaymentPaidDisplay.total}. <span className="font-semibold">{partialPaymentPaidDisplay.remaining} remaining.</span> Send the remaining amount with the same Message code.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {['submitted', 'under_review', 'review_required'].includes(paymentStatus) ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                  <div>
                                    <p className="font-semibold">Payment submitted</p>
                                    <p className="mt-1 text-amber-800">
                                      We&apos;ll keep checking automatically. If we can&apos;t match it, we&apos;ll review it within 2 working hours. Review hours are 7:00 AM-12:00 AM ET.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-border/60 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                                  {isPartiallyPaid ? 'Send remaining' : 'Send exactly'}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <p className="text-xl font-semibold tracking-tight">
                                    {formatPrice(interacAmountToSend || interacPayment.cadAmount, 'CAD')}
                                  </p>
                                  <button type="button" onClick={() => copyText('Amount', interacAmountToSend || interacPayment.cadAmount)} className="rounded-full border border-border bg-background p-1.5 text-foreground/70 transition-colors hover:text-foreground" aria-label="Copy Interac amount">
                                    <Copy className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-border/60 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Expires</p>
                                <p className="mt-2 text-xl font-semibold tracking-tight">
                                  {formatDateTime(interacPayment.expiresAt) || '15 minutes'}
                                </p>
                              </div>
                            </div>

	                            <div className="rounded-2xl border border-border/60 bg-white p-4">
	                              <div className="flex items-start justify-between gap-3">
	                                <div>
	                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Send to</p>
	                                  <p className="mt-2 break-all text-sm leading-6">{interacPayment.recipientEmail}</p>
	                                  <p className="mt-2 text-xs leading-5 text-foreground/45">
	                                    Send from a Canadian bank account using Interac Autodeposit. Wise and third-party processors are not supported.
	                                  </p>
	                                </div>
                                <button type="button" onClick={() => copyText('Email', interacPayment.recipientEmail)} className="rounded-full border border-border bg-background p-1.5 text-foreground/70 transition-colors hover:text-foreground" aria-label="Copy Interac email">
                                  <Copy className="size-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-[#0B2E2F]/20 bg-[#0B2E2F]/5 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
	                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/60">Message code required</p>
	                                  <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0B2E2F]">
	                                    {interacPayment.messageCode}
	                                  </p>
	                                  <p className="mt-2 text-xs leading-5 text-[#0B2E2F]/70">
	                                    Paste this exact code into your bank&apos;s Interac Message field. Missing or changed codes require manual review and can delay the order.
	                                  </p>
                                </div>
                                <button type="button" onClick={() => copyText('Message code', interacPayment.messageCode)} className="rounded-full border border-[#0B2E2F]/15 bg-white p-1.5 text-[#0B2E2F] transition-colors hover:bg-[#F4F1EA]" aria-label="Copy Interac message code">
                                  <Copy className="size-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border/60 bg-white p-4">
                              <p className="text-sm font-semibold">After sending</p>
                              <p className="mt-1 text-xs leading-5 text-foreground/50">
                                This page checks automatically. Use the button below if you&apos;ve sent it, or upload a screenshot if support needs to review it.
                              </p>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <Button type="button" onClick={submitInteracTransfer} disabled={isSubmittingInterac || paymentStatus === 'paid'} className="w-full">
                                  {isSubmittingInterac ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                  I sent the e-Transfer
                                </Button>
                                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground/75 transition-colors hover:bg-muted">
                                  {isUploadingInteracScreenshot ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                  Upload screenshot
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    disabled={isUploadingInteracScreenshot}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      void uploadInteracScreenshot(file);
                                      event.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Expected sender</p>
                                <p className="mt-1 text-sm font-semibold">{interacPayment.expectedSenderName}</p>
                                <p className="mt-0.5 break-all text-xs text-foreground/50">{interacPayment.expectedSenderEmail}</p>
                              </div>
                              {interacPayment.securityQuestion || interacPayment.securityAnswer ? (
                                <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Security question</p>
                                  <p className="mt-1 text-sm font-semibold">{interacPayment.securityQuestion || 'Not provided'}</p>
                                  {interacPayment.securityAnswer ? (
                                    <p className="mt-0.5 break-all text-xs text-foreground/50">Answer: {interacPayment.securityAnswer}</p>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Status</p>
                                <p className="mt-1 text-sm font-semibold capitalize">{formatPaymentStatus(paymentStatus)}</p>
                              </div>
                            </div>
                          </>
                        ) : null}

                        {/* ── NOWPayments (crypto) payment view ── */}
                        {nowPayment ? (
                          <>
                            {/* ── Partial payment banner (crypto) ── */}
                            {isPartiallyPaid && partialPaymentPaidDisplay ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                  <div>
                                    <p className="font-semibold">Partial payment received</p>
                                    <p className="mt-1 text-amber-800">
                                      We received {partialPaymentPaidDisplay.received} of {partialPaymentPaidDisplay.total}. <span className="font-semibold">{partialPaymentPaidDisplay.remaining} remaining.</span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-border/60 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                                  {isPartiallyPaid ? 'Send remaining' : 'Send exactly'}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <p className="text-xl font-semibold tracking-tight">
                                    {isPartiallyPaid
                                      ? `${nowPaymentsRemainingCrypto.toFixed(4)} ${formatTicker(nowPayment.paymentCurrency)}`
                                      : `${nowPayment.payAmount} ${formatTicker(nowPayment.paymentCurrency)}`
                                    }
                                  </p>
                                  <button type="button" onClick={() => copyText('Amount', isPartiallyPaid ? nowPaymentsRemainingCrypto.toFixed(4) : nowPayment.payAmount)} className="rounded-full border border-border bg-background p-1.5 text-foreground/70 transition-colors hover:text-foreground" aria-label="Copy payment amount">
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

                        {/* ── Order summary in payment pending view ── */}
                        {isPartiallyPaid ? (
                          <div className="rounded-2xl border border-border/60 bg-white p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45">Order summary</p>

                            <div className="mt-3 divide-y divide-border/50">
                              {activeOrder.lines.map(line => (
                                <div key={line.id} className="flex items-center gap-3 py-2.5">
                                  {line.imageUrl ? (
                                    <img src={line.imageUrl} alt={line.productTitle} className="size-10 rounded-lg border border-border/40 object-cover" />
                                  ) : (
                                    <div className="flex size-10 items-center justify-center rounded-lg border border-border/40 bg-background text-xs text-foreground/30">img</div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{line.productTitle}</p>
                                    {line.fulfillmentEstimate?.label ? (
                                      <p className="text-xs text-foreground/50">{line.fulfillmentEstimate.label}</p>
                                    ) : null}
                                    <p className="text-xs text-foreground/50">Qty: {line.quantity}</p>
                                  </div>
                                  <p className="text-sm font-semibold">{formatPrice(line.lineTotal.amount, line.lineTotal.currencyCode)}</p>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3 text-sm">
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
                              {activeOrder.totals.shipmentProtectionAmount ? (
                                <div className="flex justify-between">
                                  <span className="text-foreground/65">Shipment Protection</span>
                                  <span>{formatPrice(activeOrder.totals.shipmentProtectionAmount.amount, activeOrder.totals.shipmentProtectionAmount.currencyCode)}</span>
                                </div>
                              ) : null}
                              {activeOrder.totals.taxAmount && Number(activeOrder.totals.taxAmount.amount) > 0 ? (
                                <div className="flex justify-between">
                                  <span className="text-foreground/65">Tax</span>
                                  <span>{formatPrice(activeOrder.totals.taxAmount.amount, activeOrder.totals.taxAmount.currencyCode)}</span>
                                </div>
                              ) : null}
                              {activeOrder.totals.landedCostAmount && Number(activeOrder.totals.landedCostAmount.amount) > 0 ? (
                                <div className="flex justify-between">
                                  <span className="text-foreground/65">Duties & import taxes</span>
                                  <span>{formatPrice(activeOrder.totals.landedCostAmount.amount, activeOrder.totals.landedCostAmount.currencyCode)}</span>
                                </div>
                              ) : null}
                              <div className="flex justify-between border-t border-border/50 pt-1.5 font-semibold">
                                <span>Total</span>
                                <span>{formatPrice(activeOrder.totals.totalAmount.amount, activeOrder.totals.totalAmount.currencyCode)}</span>
                              </div>
                              {partialPaymentPaidDisplay ? (
                                <>
                                  <div className="flex justify-between text-green-700">
                                    <span className="font-medium">Amount paid</span>
                                    <span className="font-semibold">{partialPaymentPaidDisplay.received}</span>
                                  </div>
                                  <div className="flex justify-between text-amber-700">
                                    <span className="font-semibold">Remaining balance</span>
                                    <span className="font-semibold">{partialPaymentPaidDisplay.remaining}</span>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
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

    </div>
  );
}
