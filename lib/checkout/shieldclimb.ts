import {
  SHIELDCLIMB_API_BASE_URL,
  SHIELDCLIMB_PAYMENT_BASE_URL,
} from '@/lib/checkout/constants';
import { providerFetch } from '@/lib/api/provider-client';

export type ShieldClimbWalletResponse = {
  address_in: string;
  polygon_address_in: string;
  callback_url: string;
  ipn_token: string;
};

export type ShieldClimbPaymentStatusResponse = {
  status: 'paid' | 'unpaid';
  value_coin?: string;
  txid_out?: string;
  coin?: string;
};

export type ShieldClimbConvertResponse = {
  status: string;
  value_coin: string;
  exchange_rate: string;
};

function getShieldClimbPayoutWallet() {
  const wallet = process.env.SHIELDCLIMB_PAYOUT_WALLET?.trim();
  if (!wallet) {
    throw new Error('Missing SHIELDCLIMB_PAYOUT_WALLET environment variable.');
  }
  return wallet;
}

function getShieldClimbBranding() {
  return {
    logo: process.env.SHIELDCLIMB_LOGO_URL || process.env.SHIELDCLIMB_LOGO || '',
    background: process.env.SHIELDCLIMB_BACKGROUND || '#0B2E2F',
    theme: process.env.SHIELDCLIMB_THEME || 'dark',
    button: process.env.SHIELDCLIMB_BUTTON_COLOR || process.env.SHIELDCLIMB_BUTTON || '#F4F1EA',
    domain: process.env.SHIELDCLIMB_DOMAIN || 'payment.shieldclimb.com',
  };
}

/**
 * Create Wallet — GET /control/wallet.php
 * Docs: https://shieldclimb.apidog.io/create-wallet-25584818e0.md
 *
 * Required params: `address` (payout USDC Polygon wallet), `callback` (URL-encoded callback URL)
 */
export async function createShieldClimbWallet(args: {
  payoutWallet: string;
  callbackUrl: string;
}): Promise<ShieldClimbWalletResponse> {
  const url = new URL('/control/wallet.php', SHIELDCLIMB_API_BASE_URL);
  url.searchParams.set('address', args.payoutWallet);
  url.searchParams.set('callback', args.callbackUrl);

  const response = await providerFetch(url.toString(), {
    provider: 'shieldclimb',
    operation: 'create-wallet',
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ShieldClimb wallet creation failed: ${response.status} ${body}`);
  }

  return (await response.json()) as ShieldClimbWalletResponse;
}

/**
 * Process Payment - Multi-Providers (Hosted Checkout) — GET /pay.php
 * Docs: https://shieldclimb.apidog.io/optional-process-payment-multi-providers-hosted-checkout-25584820e0.md
 *
 * Required params: `address` (encrypted address_in), `amount`, `email`, `currency`, `domain`
 * Optional params: `logo`, `background`, `theme`, `button`
 */
export function buildShieldClimbPaymentUrl(args: {
  addressIn: string;
  amount: number;
  email: string;
  currency: string;
}): string {
  const branding = getShieldClimbBranding();
  const url = new URL('/pay.php', SHIELDCLIMB_PAYMENT_BASE_URL);

  url.searchParams.set('address', args.addressIn);
  url.searchParams.set('amount', args.amount.toFixed(2));
  url.searchParams.set('email', args.email);
  url.searchParams.set('currency', args.currency.toUpperCase());
  // NOTE: Do NOT set the `domain` parameter here — the Cloudflare Worker
  // proxy already appends `domain=payment.revalin.ca` to every request.
  // Adding it here would create a duplicate parameter.

  if (branding.logo) url.searchParams.set('logo', branding.logo);
  if (branding.background) url.searchParams.set('background', branding.background);
  if (branding.theme) url.searchParams.set('theme', branding.theme);
  if (branding.button) url.searchParams.set('button', branding.button);

  return url.toString();
}

/**
 * Check Payment Status — GET /control/payment-status.php
 * Docs: https://shieldclimb.apidog.io/check-payment-status-25584817e0.md
 *
 * Required param: `ipn_token`
 * WARNING: Do not use for automated polling — use callback events instead.
 */
export async function checkShieldClimbPaymentStatus(
  ipnToken: string
): Promise<ShieldClimbPaymentStatusResponse> {
  const url = new URL('/control/payment-status.php', SHIELDCLIMB_API_BASE_URL);
  url.searchParams.set('ipn_token', ipnToken);

  const response = await providerFetch(url.toString(), {
    provider: 'shieldclimb',
    operation: 'payment-status',
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ShieldClimb payment status check failed: ${response.status} ${body}`);
  }

  return (await response.json()) as ShieldClimbPaymentStatusResponse;
}

/**
 * Convert to USD — GET /control/convert.php
 * Docs: https://shieldclimb.apidog.io/convert-to-usd-25584815e0.md
 *
 * Required params: `from` (source currency), `value` (amount in source currency)
 * Returns: { status, value_coin (USD amount), exchange_rate }
 */
export async function convertToUsd(args: {
  amount: number;
  fromCurrency: string;
}): Promise<ShieldClimbConvertResponse> {
  const url = new URL('/control/convert.php', SHIELDCLIMB_API_BASE_URL);
  url.searchParams.set('from', args.fromCurrency.toUpperCase());
  url.searchParams.set('value', args.amount.toFixed(2));

  const response = await providerFetch(url.toString(), {
    provider: 'shieldclimb',
    operation: 'convert-to-usd',
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ShieldClimb currency conversion failed: ${response.status} ${body}`);
  }

  return (await response.json()) as ShieldClimbConvertResponse;
}

export async function createWalletForOrder(args: {
  callbackUrl: string;
}): Promise<ShieldClimbWalletResponse> {
  return createShieldClimbWallet({
    payoutWallet: getShieldClimbPayoutWallet(),
    callbackUrl: args.callbackUrl,
  });
}
