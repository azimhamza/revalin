import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { apiIdempotencyKeys, checkoutDrafts } from '@/lib/db/schema';
import type { CheckoutShippingAddress } from '@/lib/checkout/types';

export type CheckoutSessionStatus =
  | 'draft'
  | 'quoted'
  | 'finalizing'
  | 'finalized'
  | 'expired';

export type CheckoutSessionRecord = {
  sessionId: string;
  sessionKey: string;
  version: number;
  status: CheckoutSessionStatus;
  email: string;
  normalizedEmail: string;
  cartId: string | null;
  cartSnapshot: Record<string, unknown> | null;
  shippingAddress: CheckoutShippingAddress | null;
  selectedShippingServiceId: string | null;
  shipmentProtection: boolean;
  paymentMethod: 'card' | 'crypto' | 'interac' | 'square' | null;
  paymentCurrency: string | null;
  sourceWalletAddress: string | null;
  interacSenderEmail: string | null;
  interacSenderName: string | null;
  interacSecurityQuestion: string | null;
  interacSecurityAnswer: string | null;
  discountCode: string | null;
  pricingSnapshot: Record<string, unknown> | null;
  providerQuoteCache: Record<string, unknown> | null;
  quoteExpiresAt: string | null;
  expiresAt: string | null;
  finalizedOrderId: string | null;
  finalizedAccessKey: string | null;
  paymentCompleted: string | null;
  createdAt: string;
  updatedAt: string;
};

type UpsertSessionInput = {
  email?: string | null;
  cartId?: string | null;
  cartSnapshot?: Record<string, unknown> | null;
  shippingAddress?: CheckoutShippingAddress | null;
  selectedShippingServiceId?: string | null;
  shipmentProtection?: boolean;
  paymentMethod?: 'card' | 'crypto' | 'interac' | 'square' | null;
  paymentCurrency?: string | null;
  sourceWalletAddress?: string | null;
  interacSenderEmail?: string | null;
  interacSenderName?: string | null;
  interacSecurityQuestion?: string | null;
  interacSecurityAnswer?: string | null;
  discountCode?: string | null;
  pricingSnapshot?: Record<string, unknown> | null;
  providerQuoteCache?: Record<string, unknown> | null;
  quoteExpiresAt?: Date | null;
  expiresAt?: Date | null;
  status?: CheckoutSessionStatus;
  finalizedOrderId?: string | null;
  finalizedAccessKey?: string | null;
  paymentCompleted?: Date | null;
};

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_QUOTE_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

function asNullableRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function rowToSession(row: typeof checkoutDrafts.$inferSelect): CheckoutSessionRecord {
  return {
    sessionId: row.id,
    sessionKey: row.sessionKey,
    version: row.version,
    status: row.status,
    email: row.email,
    normalizedEmail: row.normalizedEmail,
    cartId: row.cartId ?? null,
    cartSnapshot: asNullableRecord(row.cartSnapshot),
    shippingAddress: (row.shippingAddress as CheckoutShippingAddress | null) ?? null,
    selectedShippingServiceId: row.selectedShippingServiceId ?? null,
    shipmentProtection: row.shipmentProtection === true,
    paymentMethod: (row.paymentMethod as CheckoutSessionRecord['paymentMethod']) ?? null,
    paymentCurrency: row.paymentCurrency ?? null,
    sourceWalletAddress: row.sourceWalletAddress ?? null,
    interacSenderEmail: row.interacSenderEmail ?? null,
    interacSenderName: row.interacSenderName ?? null,
    interacSecurityQuestion: row.interacSecurityQuestion ?? null,
    interacSecurityAnswer: row.interacSecurityAnswer ?? null,
    discountCode: row.discountCode ?? null,
    pricingSnapshot: asNullableRecord(row.pricingSnapshot),
    providerQuoteCache: asNullableRecord(row.providerQuoteCache),
    quoteExpiresAt: row.quoteExpiresAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    finalizedOrderId: row.finalizedOrderId ?? null,
    finalizedAccessKey: row.finalizedAccessKey ?? null,
    paymentCompleted: row.paymentCompleted?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildSessionExpiresAt() {
  return new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
}

function buildQuoteExpiresAt() {
  return new Date(Date.now() + DEFAULT_QUOTE_TTL_MS);
}

export async function createCheckoutSession(input: UpsertSessionInput = {}) {
  const sessionId = crypto.randomUUID();
  const sessionKey = crypto.randomUUID() + crypto.randomBytes(8).toString('hex');
  const now = new Date();
  const expiresAt = input.expiresAt ?? buildSessionExpiresAt();

  const [row] = await db
    .insert(checkoutDrafts)
    .values({
      id: sessionId,
      email: input.email?.trim() || '',
      normalizedEmail: normalizeEmail(input.email),
      sessionKey,
      version: 1,
      status: input.status ?? 'draft',
      cartId: input.cartId ?? null,
      cartSnapshot: input.cartSnapshot ?? {},
      shippingAddress: input.shippingAddress ?? null,
      selectedShippingServiceId: input.selectedShippingServiceId ?? null,
      shipmentProtection: input.shipmentProtection ?? false,
      paymentMethod: input.paymentMethod ?? null,
      paymentCurrency: input.paymentCurrency ?? null,
      sourceWalletAddress: input.sourceWalletAddress ?? null,
      interacSenderEmail: input.interacSenderEmail ?? null,
      interacSenderName: input.interacSenderName ?? null,
      interacSecurityQuestion: input.interacSecurityQuestion ?? null,
      interacSecurityAnswer: input.interacSecurityAnswer ?? null,
      discountCode: input.discountCode ?? null,
      pricingSnapshot: input.pricingSnapshot ?? null,
      providerQuoteCache: input.providerQuoteCache ?? null,
      quoteExpiresAt: input.quoteExpiresAt ?? null,
      expiresAt,
      finalizedOrderId: input.finalizedOrderId ?? null,
      finalizedAccessKey: input.finalizedAccessKey ?? null,
      paymentCompleted: input.paymentCompleted ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rowToSession(row!);
}

export async function getCheckoutSession(sessionId: string) {
  const rows = await db
    .select()
    .from(checkoutDrafts)
    .where(eq(checkoutDrafts.id, sessionId))
    .limit(1);

  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function requireCheckoutSession(args: {
  sessionId: string;
  sessionKey?: string | null;
}) {
  const session = await getCheckoutSession(args.sessionId);

  if (!session) {
    throw apiError.notFound('Checkout session not found.');
  }

  if (args.sessionKey && session.sessionKey !== args.sessionKey) {
    throw apiError.notFound('Checkout session not found.');
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    throw apiError.conflict('Checkout session expired.');
  }

  return session;
}

export async function updateCheckoutSession(args: {
  sessionId: string;
  sessionKey: string;
  expectedVersion?: number;
  bumpVersion?: boolean;
  changes: UpsertSessionInput;
}) {
  const current = await requireCheckoutSession({
    sessionId: args.sessionId,
    sessionKey: args.sessionKey,
  });

  if (
    typeof args.expectedVersion === 'number' &&
    current.version !== args.expectedVersion
  ) {
    throw apiError.conflict('Checkout session is out of date.', {
      code: 'draft_out_of_date',
      currentVersion: current.version,
    });
  }

  const nextVersion = current.version + (args.bumpVersion === false ? 0 : 1);
  const nextEmail = args.changes.email ?? current.email;
  const nextExpiresAt = args.changes.expiresAt ?? buildSessionExpiresAt();

  const [row] = await db
    .update(checkoutDrafts)
    .set({
      email: nextEmail,
      normalizedEmail: normalizeEmail(nextEmail),
      version: nextVersion,
      status: args.changes.status ?? current.status,
      cartId:
        args.changes.cartId === undefined ? current.cartId : args.changes.cartId,
      cartSnapshot:
        args.changes.cartSnapshot === undefined
          ? current.cartSnapshot
          : args.changes.cartSnapshot,
      shippingAddress:
        args.changes.shippingAddress === undefined
          ? current.shippingAddress
          : args.changes.shippingAddress,
      selectedShippingServiceId:
        args.changes.selectedShippingServiceId === undefined
          ? current.selectedShippingServiceId
          : args.changes.selectedShippingServiceId,
      shipmentProtection:
        args.changes.shipmentProtection === undefined
          ? current.shipmentProtection
          : args.changes.shipmentProtection,
      paymentMethod:
        args.changes.paymentMethod === undefined
          ? current.paymentMethod
          : args.changes.paymentMethod,
      paymentCurrency:
        args.changes.paymentCurrency === undefined
          ? current.paymentCurrency
          : args.changes.paymentCurrency,
      sourceWalletAddress:
        args.changes.sourceWalletAddress === undefined
          ? current.sourceWalletAddress
          : args.changes.sourceWalletAddress,
      interacSenderEmail:
        args.changes.interacSenderEmail === undefined
          ? current.interacSenderEmail
          : args.changes.interacSenderEmail,
      interacSenderName:
        args.changes.interacSenderName === undefined
          ? current.interacSenderName
          : args.changes.interacSenderName,
      interacSecurityQuestion:
        args.changes.interacSecurityQuestion === undefined
          ? current.interacSecurityQuestion
          : args.changes.interacSecurityQuestion,
      interacSecurityAnswer:
        args.changes.interacSecurityAnswer === undefined
          ? current.interacSecurityAnswer
          : args.changes.interacSecurityAnswer,
      discountCode:
        args.changes.discountCode === undefined
          ? current.discountCode
          : args.changes.discountCode,
      pricingSnapshot:
        args.changes.pricingSnapshot === undefined
          ? current.pricingSnapshot
          : args.changes.pricingSnapshot,
      providerQuoteCache:
        args.changes.providerQuoteCache === undefined
          ? current.providerQuoteCache
          : args.changes.providerQuoteCache,
      quoteExpiresAt:
        args.changes.quoteExpiresAt === undefined
          ? current.quoteExpiresAt
            ? new Date(current.quoteExpiresAt)
            : null
          : args.changes.quoteExpiresAt,
      expiresAt: nextExpiresAt,
      finalizedOrderId:
        args.changes.finalizedOrderId === undefined
          ? current.finalizedOrderId
          : args.changes.finalizedOrderId,
      finalizedAccessKey:
        args.changes.finalizedAccessKey === undefined
          ? current.finalizedAccessKey
          : args.changes.finalizedAccessKey,
      paymentCompleted:
        args.changes.paymentCompleted === undefined
          ? current.paymentCompleted
            ? new Date(current.paymentCompleted)
            : null
          : args.changes.paymentCompleted,
      updatedAt: new Date(),
    })
    .where(eq(checkoutDrafts.id, args.sessionId))
    .returning();

  return rowToSession(row!);
}

export async function saveCheckoutQuoteState(args: {
  sessionId: string;
  sessionKey: string;
  expectedVersion?: number;
  pricingSnapshot: Record<string, unknown>;
  providerQuoteCache?: Record<string, unknown> | null;
  selectedShippingServiceId?: string | null;
}) {
  return updateCheckoutSession({
    sessionId: args.sessionId,
    sessionKey: args.sessionKey,
    expectedVersion: args.expectedVersion,
    bumpVersion: false,
    changes: {
      status: 'quoted',
      pricingSnapshot: args.pricingSnapshot,
      providerQuoteCache: args.providerQuoteCache ?? args.pricingSnapshot,
      selectedShippingServiceId: args.selectedShippingServiceId,
      quoteExpiresAt: buildQuoteExpiresAt(),
    },
  });
}

export async function getStoredIdempotentResponse<T>(key: string) {
  const rows = await db
    .select()
    .from(apiIdempotencyKeys)
    .where(eq(apiIdempotencyKeys.key, key))
    .limit(1);

  if (!rows[0]?.response) {
    return null;
  }

  return rows[0].response as T;
}

export async function storeIdempotentResponse(args: {
  key: string;
  scope: string;
  resourceId?: string | null;
  response: Record<string, unknown>;
  expiresAt?: Date | null;
}) {
  await db
    .insert(apiIdempotencyKeys)
    .values({
      key: args.key,
      scope: args.scope,
      resourceId: args.resourceId ?? null,
      response: args.response,
      expiresAt: args.expiresAt ?? buildSessionExpiresAt(),
    })
    .onConflictDoUpdate({
      target: apiIdempotencyKeys.key,
      set: {
        scope: args.scope,
        resourceId: args.resourceId ?? null,
        response: args.response,
        expiresAt: args.expiresAt ?? buildSessionExpiresAt(),
      },
    });
}
