import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  researchAccessConsentEvents,
  researchAccessConsents,
  user,
} from '@/lib/db/schema';
import {
  RESEARCH_USE_MINIMUM_AGE,
  RESEARCH_USE_TERMS_VERSION,
} from '@/lib/compliance';

export const RESEARCH_ACCESS_CONSENT_COOKIE = 'revalin_research_consent';
export const RESEARCH_ACCESS_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type ConsentEventType =
  | 'site_gate_acceptance'
  | 'newsletter_signup'
  | 'account_authenticated'
  | 'checkout_finalized';

type ConsentRequestContext = {
  request?: Request;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type ConsentOptionalFields = {
  institutionName?: string | null;
  institutionIdentifier?: string | null;
  researchUseDescription?: string | null;
};

export function createResearchConsentToken() {
  return `${crypto.randomUUID()}-${crypto.randomBytes(8).toString('hex')}`;
}

export function createResearchConsentId() {
  return crypto.randomUUID();
}

export function normalizeConsentEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim();
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    firstForwardedIp ||
    null
  );
}

export function buildResearchConsentCookie(token: string) {
  return [
    `${RESEARCH_ACCESS_CONSENT_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${RESEARCH_ACCESS_CONSENT_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    'HttpOnly',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function cleanOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getContextIp(args: ConsentRequestContext) {
  return args.ipAddress ?? (args.request ? getClientIp(args.request) : null);
}

function getContextUserAgent(args: ConsentRequestContext) {
  return args.userAgent ?? args.request?.headers.get('user-agent')?.trim() ?? null;
}

async function getConsentTokenFromCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(RESEARCH_ACCESS_CONSENT_COOKIE)?.value?.trim() || null;
}

async function getConsentByToken(token: string) {
  const [row] = await db
    .select()
    .from(researchAccessConsents)
    .where(eq(researchAccessConsents.consentToken, token))
    .limit(1);

  return row ?? null;
}

async function insertConsentEvent(args: {
  consentId: string;
  eventType: ConsentEventType;
  source?: string | null;
  email?: string | null;
  userId?: string | null;
  checkoutOrderId?: string | null;
  checkoutSessionId?: string | null;
  metadata?: Record<string, unknown> | null;
} & ConsentRequestContext) {
  const email = args.email?.trim() || null;

  await db.insert(researchAccessConsentEvents).values({
    consentId: args.consentId,
    eventType: args.eventType,
    source: args.source ?? null,
    email,
    normalizedEmail: normalizeConsentEmail(email),
    userId: args.userId ?? null,
    checkoutOrderId: args.checkoutOrderId ?? null,
    checkoutSessionId: args.checkoutSessionId ?? null,
    ipAddress: getContextIp(args),
    userAgent: getContextUserAgent(args),
    metadata: args.metadata ?? null,
  });
}

export async function recordResearchAccessConsent(args: {
  consentId?: string;
  consentToken: string;
  acceptedAt?: Date;
  entryPath?: string | null;
  referrer?: string | null;
  metadata?: Record<string, unknown> | null;
} & ConsentOptionalFields &
  ConsentRequestContext) {
  const now = args.acceptedAt ?? new Date();
  const institutionName = cleanOptionalText(args.institutionName);
  const institutionIdentifier = cleanOptionalText(args.institutionIdentifier);
  const researchUseDescription = cleanOptionalText(args.researchUseDescription);

  const [row] = await db
    .insert(researchAccessConsents)
    .values({
      ...(args.consentId ? { id: args.consentId } : {}),
      consentToken: args.consentToken,
      termsVersion: RESEARCH_USE_TERMS_VERSION,
      minimumAge: RESEARCH_USE_MINIMUM_AGE,
      termsAccepted: true,
      researchUseAccepted: true,
      institutionName,
      institutionIdentifier,
      researchUseDescription,
      institutionNameProvided: Boolean(institutionName),
      institutionIdentifierProvided: Boolean(institutionIdentifier),
      researchUseDescriptionProvided: Boolean(researchUseDescription),
      ipAddress: getContextIp(args),
      userAgent: getContextUserAgent(args),
      entryPath: args.entryPath?.trim() || null,
      referrer: args.referrer?.trim() || null,
      metadata: args.metadata ?? null,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: researchAccessConsents.consentToken,
      set: {
        termsVersion: RESEARCH_USE_TERMS_VERSION,
        minimumAge: RESEARCH_USE_MINIMUM_AGE,
        termsAccepted: true,
        researchUseAccepted: true,
        institutionName,
        institutionIdentifier,
        researchUseDescription,
        institutionNameProvided: Boolean(institutionName),
        institutionIdentifierProvided: Boolean(institutionIdentifier),
        researchUseDescriptionProvided: Boolean(researchUseDescription),
        ipAddress: getContextIp(args),
        userAgent: getContextUserAgent(args),
        entryPath: args.entryPath?.trim() || null,
        referrer: args.referrer?.trim() || null,
        metadata: args.metadata ?? null,
        updatedAt: now,
      },
    })
    .returning();

  const consent = row!;

  await insertConsentEvent({
    consentId: consent.id,
    eventType: 'site_gate_acceptance',
    source: 'entry_gate',
    request: args.request,
    ipAddress: getContextIp(args),
    userAgent: getContextUserAgent(args),
    metadata: {
      institutionNameProvided: Boolean(institutionName),
      institutionIdentifierProvided: Boolean(institutionIdentifier),
      researchUseDescriptionProvided: Boolean(researchUseDescription),
    },
  });

  return consent;
}

export async function linkCurrentResearchConsentToEmail(args: {
  email: string;
  source: string;
  eventType?: Extract<ConsentEventType, 'newsletter_signup'>;
} & ConsentRequestContext) {
  const token = await getConsentTokenFromCookie();
  if (!token) return null;

  const consent = await getConsentByToken(token);
  if (!consent) return null;

  const email = args.email.trim();
  const normalizedEmail = normalizeConsentEmail(email);

  await db
    .update(researchAccessConsents)
    .set({
      email,
      normalizedEmail,
      updatedAt: new Date(),
    })
    .where(eq(researchAccessConsents.id, consent.id));

  await insertConsentEvent({
    consentId: consent.id,
    eventType: args.eventType ?? 'newsletter_signup',
    source: args.source,
    email,
    request: args.request,
    ipAddress: getContextIp(args),
    userAgent: getContextUserAgent(args),
  });

  return consent;
}

export async function linkCurrentResearchConsentToUser(args: {
  userId: string;
  email: string;
} & ConsentRequestContext) {
  const token = await getConsentTokenFromCookie();
  if (!token) return null;

  const consent = await getConsentByToken(token);
  if (!consent) return null;

  const email = args.email.trim();
  const normalizedEmail = normalizeConsentEmail(email);
  const now = new Date();

  await db
    .update(researchAccessConsents)
    .set({
      email,
      normalizedEmail,
      userId: args.userId,
      updatedAt: now,
    })
    .where(eq(researchAccessConsents.id, consent.id));

  await db
    .update(user)
    .set({
      researchUseAccepted: true,
      researchUseAcceptedAt: consent.acceptedAt,
      researchUseTermsVersion: consent.termsVersion,
      updatedAt: now,
    })
    .where(eq(user.id, args.userId));

  await insertConsentEvent({
    consentId: consent.id,
    eventType: 'account_authenticated',
    source: 'post_auth_reconcile',
    email,
    userId: args.userId,
    request: args.request,
    ipAddress: getContextIp(args),
    userAgent: getContextUserAgent(args),
  });

  return consent;
}

export async function linkCurrentResearchConsentToOrder(args: {
  checkoutOrderId: string;
  checkoutSessionId: string;
  email?: string | null;
  userId?: string | null;
} & ConsentRequestContext) {
  const token = await getConsentTokenFromCookie();
  if (!token) return null;

  const consent = await getConsentByToken(token);
  if (!consent) return null;

  const email = args.email?.trim() || consent.email;
  const normalizedEmail = normalizeConsentEmail(email);

  await db
    .update(researchAccessConsents)
    .set({
      email: email || null,
      normalizedEmail,
      userId: args.userId ?? consent.userId,
      updatedAt: new Date(),
    })
    .where(eq(researchAccessConsents.id, consent.id));

  await insertConsentEvent({
    consentId: consent.id,
    eventType: 'checkout_finalized',
    source: 'checkout',
    email,
    userId: args.userId ?? consent.userId,
    checkoutOrderId: args.checkoutOrderId,
    checkoutSessionId: args.checkoutSessionId,
    request: args.request,
    ipAddress: getContextIp(args),
    userAgent: getContextUserAgent(args),
    metadata: {
      linkedByConsentCookie: true,
    },
  });

  return consent;
}

export async function hasResearchConsentForCurrentRequest() {
  const token = await getConsentTokenFromCookie();
  if (!token) return false;

  const [row] = await db
    .select({ id: researchAccessConsents.id })
    .from(researchAccessConsents)
    .where(
      sql`${researchAccessConsents.consentToken} = ${token} and ${researchAccessConsents.termsAccepted} = true`,
    )
    .limit(1);

  return Boolean(row);
}
