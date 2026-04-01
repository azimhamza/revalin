import crypto from 'crypto';
import { getLiveProduct } from '@/lib/swell';
import { getInventoryState } from '@/lib/inventory';
import { createSwellCoupon } from '@/lib/checkout/swell-order-management';
import { hasLoopsConfig, sendTransactionalEmail } from '@/lib/email/loops';
import {
  findBackInStockSubscription,
  listBackInStockSubscriptions,
  saveBackInStockSubscription,
  updateBackInStockSubscription,
} from './store';
import type { BackInStockSubscription } from './types';

const DEFAULT_ALERT_EMAIL = 'support@revalin.ca';
const DISCOUNT_PERCENT = 20;
const DISCOUNT_WINDOW_HOURS = 48;

function getAlertRecipient() {
  return process.env.BACKORDER_ALERT_EMAIL_TO?.trim() || DEFAULT_ALERT_EMAIL;
}

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}

function createCouponCode() {
  return `READY20-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function createSubscriptionId() {
  return `bis_${crypto.randomBytes(8).toString('hex')}`;
}

async function sendAdminBackorderAlert(subscription: BackInStockSubscription) {
  if (!hasLoopsConfig()) {
    return;
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_ADMIN_BACKORDER?.trim();
  if (!transactionalId) {
    console.warn('Skipping admin backorder alert: LOOPS_TRANSACTIONAL_ADMIN_BACKORDER not set.');
    return;
  }

  const productUrl = `${getSiteUrl()}/product/${subscription.productHandle}`;

  await sendTransactionalEmail({
    email: getAlertRecipient(),
    transactionalId,
    dataVariables: {
      productTitle: subscription.productTitle,
      variantTitle: subscription.variantTitle || '',
      customerEmail: subscription.email,
      productUrl,
    },
  });
}

async function sendCustomerReadyEmail(subscription: BackInStockSubscription) {
  if (!subscription.couponCode || !subscription.couponExpiresAt) {
    throw new Error('Missing coupon details for notification email.');
  }

  if (!hasLoopsConfig()) {
    throw new Error('Loops not configured — cannot send back-in-stock email.');
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_BACK_IN_STOCK?.trim();
  if (!transactionalId) {
    throw new Error('LOOPS_TRANSACTIONAL_BACK_IN_STOCK not set.');
  }

  const siteUrl = getSiteUrl();
  const productUrl = `${siteUrl}/product/${subscription.productHandle}`;
  const checkoutUrl = `${siteUrl}/checkout?discount=${encodeURIComponent(subscription.couponCode)}`;

  await sendTransactionalEmail({
    email: subscription.email,
    transactionalId,
    dataVariables: {
      productTitle: subscription.productTitle,
      variantTitle: subscription.variantTitle || '',
      discountPercent: DISCOUNT_PERCENT,
      discountCode: subscription.couponCode,
      discountExpiresAt: subscription.couponExpiresAt,
      productUrl,
      checkoutUrl,
    },
  });
}

export async function subscribeToBackInStock(args: {
  email: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  variantId?: string;
  variantTitle?: string;
}) {
  const existing = await findBackInStockSubscription({
    email: args.email,
    productHandle: args.productHandle,
    variantId: args.variantId,
  });

  if (existing) {
    return {
      created: false,
      subscription: existing,
    };
  }

  const now = new Date().toISOString();
  const subscription: BackInStockSubscription = {
    id: createSubscriptionId(),
    email: args.email.trim().toLowerCase(),
    productId: args.productId,
    productHandle: args.productHandle,
    productTitle: args.productTitle,
    variantId: args.variantId,
    variantTitle: args.variantTitle,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    lastError: null,
  };

  await saveBackInStockSubscription(subscription);

  try {
    await sendAdminBackorderAlert(subscription);
    await updateBackInStockSubscription(subscription.id, current => ({
      ...current,
      adminNotificationSentAt: new Date().toISOString(),
      lastError: null,
    }));
  } catch (error) {
    await updateBackInStockSubscription(subscription.id, current => ({
      ...current,
      lastError: error instanceof Error ? error.message : 'Unable to send admin backorder email.',
    }));
  }

  return {
    created: true,
    subscription,
  };
}

export async function processBackInStockSubscriptions(args: {
  handles?: string[];
  limit?: number;
} = {}) {
  const handles = new Set((args.handles || []).map(handle => handle.trim()).filter(Boolean));
  const subscriptions = await listBackInStockSubscriptions();
  const pending = subscriptions.filter(subscription => {
    if (subscription.status !== 'pending') return false;
    if (handles.size === 0) return true;
    return handles.has(subscription.productHandle);
  });

  const selected = typeof args.limit === 'number' ? pending.slice(0, args.limit) : pending;
  const productCache = new Map<string, Awaited<ReturnType<typeof getLiveProduct>>>();

  let inspected = 0;
  let ready = 0;
  let notified = 0;
  let failed = 0;

  for (const subscription of selected) {
    inspected += 1;

    if (!productCache.has(subscription.productHandle)) {
      productCache.set(subscription.productHandle, await getLiveProduct(subscription.productHandle));
    }

    const product = productCache.get(subscription.productHandle);

    if (!product) {
      failed += 1;
      await updateBackInStockSubscription(subscription.id, current => ({
        ...current,
        lastError: 'Product could not be loaded while processing back-in-stock notifications.',
      }));
      continue;
    }

    const variant = subscription.variantId
      ? product.variants.find(candidate => candidate.id === subscription.variantId) || null
      : null;
    const inventory = getInventoryState(product, variant);

    if (inventory.isBackorder) {
      continue;
    }

    ready += 1;

    let current = subscription;

    if (!current.couponCode || !current.couponId || !current.couponExpiresAt) {
      const expiresAt = new Date(Date.now() + DISCOUNT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const couponCode = createCouponCode();
      const coupon = await createSwellCoupon({
        code: couponCode,
        name: `Back in stock - ${current.productTitle}`,
        percentOff: DISCOUNT_PERCENT,
        expiresAt,
        description: `Auto-issued for ${current.email}`,
      });

      const saved = await updateBackInStockSubscription(current.id, active => ({
        ...active,
        couponId: coupon.id,
        couponCode,
        couponExpiresAt: expiresAt,
        lastError: null,
      }));

      if (saved) {
        current = saved;
      }
    }

    try {
      await sendCustomerReadyEmail(current);
      notified += 1;
      await updateBackInStockSubscription(current.id, active => ({
        ...active,
        status: 'notified',
        notifiedAt: new Date().toISOString(),
        lastError: null,
      }));
    } catch (error) {
      failed += 1;
      await updateBackInStockSubscription(current.id, active => ({
        ...active,
        lastError: error instanceof Error ? error.message : 'Unable to send ready email.',
      }));
    }
  }

  return {
    inspected,
    ready,
    notified,
    failed,
    pending: pending.length,
  };
}
