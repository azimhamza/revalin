import crypto from 'node:crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import {
  checkoutOrders,
  gmailWatchState,
  interacEmailEvents,
  interacReviewItems,
} from '@/lib/db/schema';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { buildPublicCheckoutOrder } from '@/lib/checkout/public-order';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import type { CheckoutOrderPublic, CheckoutOrderRecord, InteracPaymentData } from '@/lib/checkout/types';
import { isInteracPayment } from '@/lib/checkout/types';
import { withProviderTimeout } from '@/lib/api/provider-client';

const INTERAC_PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const MESSAGE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;
const SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const DEFAULT_UNSUPPORTED_PROCESSOR_DOMAINS = ['wise.com'];

export type InteracParsedEmail = {
  message?: string | null;
  amount?: string | null;
  amountValue?: number | null;
  currency?: string | null;
  sentFrom?: string | null;
  bankReference?: string | null;
  transferDate?: string | null;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
  snippet?: string;
};

type PubSubEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
    message_id?: string;
  };
};

type InteracAuthenticity = {
  passed: boolean;
  fromOk: boolean;
  recipientOk: boolean;
  authOk: boolean;
  forwarded: boolean;
  reasons: string[];
};

type ReviewReason =
  | 'wrong_amount'
  | 'partial_payment'
  | 'missing_message'
  | 'unknown_message'
  | 'duplicate'
  | 'late_payment'
  | 'parser_failed'
  | 'suspicious_email'
  | 'security_question'
  | 'screenshot_submitted';

type InteracAmountOutcome =
  | { kind: 'partial'; cumulativeCents: number; remainingCents: number; senderMismatch: boolean }
  | { kind: 'paid'; cumulativeCents: number; senderMismatch: boolean }
  | { kind: 'over'; cumulativeCents: number }
  | { kind: 'duplicate' }
  | { kind: 'noop' };

const REVIEW_REASON_PRIORITY: Record<ReviewReason, number> = {
  screenshot_submitted: 10,
  unknown_message: 20,
  missing_message: 30,
  parser_failed: 40,
  security_question: 50,
  partial_payment: 60,
  duplicate: 70,
  late_payment: 80,
  wrong_amount: 90,
  suspicious_email: 100,
};

function configuredMailbox() {
  return process.env.GMAIL_INTERAC_USER?.trim() || 'interac@revalin.ca';
}

export function getInteracRecipientEmail() {
  return process.env.INTERAC_RECIPIENT_EMAIL?.trim() || configuredMailbox();
}

export function createInteracMessageCode() {
  const bytes = crypto.randomBytes(9);
  let chars = '';
  for (const byte of bytes) {
    chars += MESSAGE_CODE_ALPHABET[byte % MESSAGE_CODE_ALPHABET.length];
  }
  return `RVL-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export function getInteracExpiresAt(now = new Date()) {
  return new Date(now.getTime() + INTERAC_PAYMENT_WINDOW_MS).toISOString();
}

function normalizeEmail(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function extractEmailAddress(value?: string | null) {
  const raw = value || '';
  const angleMatch = raw.match(/<([^>]+)>/);
  const email = angleMatch?.[1] || raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || raw;
  return normalizeEmail(email);
}

function getEmailDomain(value?: string | null) {
  const email = extractEmailAddress(value);
  const domain = email.split('@')[1];
  return domain?.replace(/[>\s]+$/g, '') || null;
}

function getUnsupportedProcessorDomains() {
  const configured = process.env.INTERAC_UNSUPPORTED_PROCESSOR_DOMAINS;
  const values = configured
    ? configured.split(',')
    : DEFAULT_UNSUPPORTED_PROCESSOR_DOMAINS;
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function getUnsupportedProcessorDomain(value?: string | null) {
  const domain = getEmailDomain(value);
  if (!domain) return null;
  return getUnsupportedProcessorDomains().find((blocked) => domain === blocked || domain.endsWith(`.${blocked}`)) || null;
}

function normalizeCode(value?: string | null) {
  const normalized = (value || '')
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, '-');
  const match = normalized.match(/\bRVL\s*-\s*([A-Z0-9]{3,5})\s*-\s*([A-Z0-9]{3,5})\b/);

  if (match) {
    return `RVL-${match[1]}-${match[2]}`;
  }

  return normalized;
}

function parseAmount(value?: string | null) {
  if (!value) return null;
  const amountMatch = value.match(/\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(?:\(?\s*CAD\s*\)?)?/i);
  const cleaned = (amountMatch?.[1] || value).replace(/,/g, '').replace(/[^\d.]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCents(value?: string | number | null) {
  const parsed = typeof value === 'number' ? value : parseAmount(value);
  return parsed === null || !Number.isFinite(parsed)
    ? null
    : Math.round((parsed + Number.EPSILON) * 100);
}

function decodeBase64Url(value?: string) {
  if (!value) return '';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function collectMessagePartText(part: GmailMessagePart | undefined, targetMime: string): string[] {
  if (!part) return [];
  const result: string[] = [];
  if (part.mimeType === targetMime && part.body?.data) {
    result.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts || []) {
    result.push(...collectMessagePartText(child, targetMime));
  }
  return result;
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|td|th|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getHeader(headers: GmailHeader[] | undefined, name: string) {
  const normalized = name.toLowerCase();
  return headers?.find((header) => header.name?.toLowerCase() === normalized)?.value || '';
}

function normalizeEmailBody(value: string) {
  return value
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLabel(text: string, label: string, nextLabels: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = nextLabels
    .map((nextLabel) => nextLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(
    `(?:^|\\n|\\s{2,})\\s*${escapedLabel}\\s*:?\\s*([\\s\\S]*?)(?=(?:\\n|\\s{2,}|\\s)+(?:${next})\\s*:?|$)`,
    'i',
  );
  const match = text.match(pattern);
  return match?.[1]?.trim().replace(/\n+/g, ' ') || null;
}

function normalizeLabel(value: string) {
  return value
    .replace(/:$/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function extractLineLabel(text: string, label: string, nextLabels: string[]) {
  const normalizedLabel = normalizeLabel(label);
  const normalizedNextLabels = new Set(nextLabels.map(normalizeLabel));
  const lines = text.split('\n').map(line => line.trim());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    if (!line) continue;

    const [left, ...rightParts] = line.split(':');
    if (normalizeLabel(left || line) !== normalizedLabel) {
      continue;
    }

    const inlineValue = rightParts.join(':').trim();
    if (inlineValue) {
      return inlineValue;
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] || '';
      if (!nextLine) continue;

      if (normalizedNextLabels.has(normalizeLabel(nextLine))) {
        break;
      }

      return nextLine;
    }
  }

  return null;
}

function extractField(text: string, label: string, nextLabels: string[]) {
  return extractLabel(text, label, nextLabels) || extractLineLabel(text, label, nextLabels);
}

function extractMessageCode(value?: string | null) {
  const normalized = normalizeCode(value);
  return normalized.match(/\bRVL-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}\b/)?.[0] || null;
}

function extractFallbackAmount(text: string, subject?: string | null) {
  return (
    subject?.match(/(?:received|deposited)\s+\$?([\d,]+(?:\.\d{2})?)/i)?.[1] ||
    text.match(/Funds Deposited!\s*\n\s*(\$?\s*[\d,]+(?:\.\d{2})?(?:\s*\([A-Z]{3}\))?)/i)?.[1] ||
    text.match(/\$\s*[\d,]+(?:\.\d{2})?\s*(?:\([A-Z]{3}\))?/i)?.[0] ||
    null
  );
}

function centsToAmount(cents: number) {
  return (Math.max(cents, 0) / 100).toFixed(2);
}

function getInteracPaidCents(payment: InteracPaymentData) {
  return (
    toCents(payment.receivedAmount) ??
    toCents(payment.amountPaidToDate) ??
    toCents(payment.cumulativePaidAmount) ??
    0
  );
}

function hasInteracSecurityQuestion(payment: InteracPaymentData) {
  return Boolean(
    payment.securityQuestion?.trim() ||
      payment.securityAnswer?.trim(),
  );
}

export function parseInteracEmail(args: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): InteracParsedEmail {
  const baseText = normalizeEmailBody([args.text, args.html ? stripHtml(args.html) : null]
    .filter(Boolean)
    .join('\n'));

  const labels = ['Message', 'Date', 'Reference Number', 'Sent From', 'Amount', 'FAQ'];
  const labelPattern = new RegExp(`\\s+(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`, 'gi');
  const text = baseText.replace(labelPattern, '\n$1:');
  const messageField = extractField(text, 'Message', labels.filter((label) => label !== 'Message'));
  const message = extractMessageCode(messageField) || extractMessageCode(`${args.subject || ''}\n${text}`);
  const transferDate = extractField(text, 'Date', labels.filter((label) => label !== 'Date'));
  const bankReference = extractField(text, 'Reference Number', labels.filter((label) => label !== 'Reference Number'));
  const sentFrom = extractField(text, 'Sent From', labels.filter((label) => label !== 'Sent From'));
  const amountField = extractField(text, 'Amount', labels.filter((label) => label !== 'Amount'));
  const subjectAmount = extractFallbackAmount(text, args.subject);
  const amountValue = parseAmount(amountField || subjectAmount);
  const currency = (amountField || subjectAmount)?.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase() || 'CAD';

  return {
    message,
    transferDate,
    bankReference,
    sentFrom,
    amount: amountField || subjectAmount,
    amountValue,
    currency,
  };
}

function buildAuthenticity(args: {
  headers: GmailHeader[] | undefined;
  from: string;
  to: string;
  text: string;
}) {
  const authResults = getHeader(args.headers, 'Authentication-Results');
  const fromOk = /notify@payments\.interac\.ca/i.test(args.from);
  const recipient = normalizeEmail(configuredMailbox());
  const recipientOk = normalizeEmail(args.to).includes(recipient);
  const authLower = authResults.toLowerCase();
  const authOk =
    authLower.includes('spf=pass') &&
    authLower.includes('dkim=pass') &&
    authLower.includes('dmarc=pass');
  const forwarded = /begin forwarded message|^fwd:/im.test(args.text);
  const reasons = [
    !fromOk ? 'from_not_interac' : null,
    !recipientOk ? 'recipient_mismatch' : null,
    !authOk ? 'email_auth_failed' : null,
    forwarded ? 'forwarded_message' : null,
  ].filter(Boolean) as string[];

  return {
    passed: fromOk && recipientOk && authOk && !forwarded,
    fromOk,
    recipientOk,
    authOk,
    forwarded,
    reasons,
  } satisfies InteracAuthenticity;
}

async function getGmailAccessToken() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw apiError.internal('Missing Gmail OAuth configuration.');
  }

  const response = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const payload = await response.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw apiError.providerUnavailable('Unable to refresh Gmail access token.', payload);
  }
  return payload.access_token;
}

async function gmailFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null) as T;
  if (!response.ok) {
    throw apiError.providerUnavailable('Gmail API request failed.', payload);
  }
  return payload;
}

export async function renewGmailInteracWatch() {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  const mailbox = configuredMailbox();
  if (!topicName) {
    throw apiError.internal('Missing GMAIL_PUBSUB_TOPIC.');
  }

  const accessToken = await getGmailAccessToken();
  const result = await gmailFetch<{ historyId: string; expiration?: string }>(
    `/users/${encodeURIComponent(mailbox)}/watch`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      }),
    },
  );

  const expiration = result.expiration ? new Date(Number(result.expiration)) : null;
  await db
    .insert(gmailWatchState)
    .values({
      mailbox,
      topicName,
      lastHistoryId: result.historyId,
      expiration,
      lastRenewedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gmailWatchState.mailbox,
      set: {
        topicName,
        lastHistoryId: result.historyId,
        expiration,
        lastRenewedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return result;
}

async function getWatchState(mailbox = configuredMailbox()) {
  const rows = await db
    .select()
    .from(gmailWatchState)
    .where(eq(gmailWatchState.mailbox, mailbox))
    .limit(1);
  return rows[0] || null;
}

async function saveLastHistoryId(mailbox: string, historyId?: string | null) {
  if (!historyId) return;
  await db
    .insert(gmailWatchState)
    .values({
      mailbox,
      topicName: process.env.GMAIL_PUBSUB_TOPIC || '',
      lastHistoryId: historyId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gmailWatchState.mailbox,
      set: {
        lastHistoryId: historyId,
        updatedAt: new Date(),
      },
    });
}

async function fetchGmailMessage(messageId: string, accessToken: string) {
  return gmailFetch<GmailMessage>(
    `/users/${encodeURIComponent(configuredMailbox())}/messages/${encodeURIComponent(messageId)}?format=full`,
    accessToken,
  );
}

async function listHistory(args: {
  accessToken: string;
  startHistoryId: string;
}) {
  return gmailFetch<{
    history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
    historyId?: string;
  }>(
    `/users/${encodeURIComponent(configuredMailbox())}/history?startHistoryId=${encodeURIComponent(args.startHistoryId)}&historyTypes=messageAdded`,
    args.accessToken,
  );
}

function getMessageBodies(message: GmailMessage) {
  const text = collectMessagePartText(message.payload, 'text/plain').join('\n');
  const html = collectMessagePartText(message.payload, 'text/html').join('\n');
  const fallback = message.payload?.body?.data
    ? decodeBase64Url(message.payload.body.data)
    : '';
  return {
    text: text || (message.payload?.mimeType === 'text/plain' ? fallback : ''),
    html: html || (message.payload?.mimeType === 'text/html' ? fallback : ''),
  };
}

async function upsertEvent(args: {
  gmailMessage: GmailMessage;
  pubsubMessageId?: string | null;
  parsed: InteracParsedEmail;
  authenticity: InteracAuthenticity;
  rawText: string;
  rawHtml: string;
}) {
  const headers = args.gmailMessage.payload?.headers || [];
  const now = new Date();
  const values = {
    gmailMessageId: args.gmailMessage.id,
    pubsubMessageId: args.pubsubMessageId ?? null,
    historyId: args.gmailMessage.historyId ?? null,
    subject: getHeader(headers, 'Subject') || null,
    fromAddress: getHeader(headers, 'From') || null,
    toAddress: getHeader(headers, 'To') || null,
    replyToAddress: getHeader(headers, 'Reply-To') || null,
    authenticationResults: getHeader(headers, 'Authentication-Results') || null,
    authenticity: args.authenticity,
    parsed: args.parsed,
    rawText: args.rawText,
    rawHtml: args.rawHtml,
    receivedAt: args.gmailMessage.internalDate
      ? new Date(Number(args.gmailMessage.internalDate))
      : now,
    updatedAt: now,
  };

  const [row] = await db
    .insert(interacEmailEvents)
    .values(values)
    .onConflictDoUpdate({
      target: interacEmailEvents.gmailMessageId,
      set: values,
    })
    .returning();

  return row!;
}

async function updateEventStatus(args: {
  eventId: string;
  status: 'matched_paid' | 'matched_partial' | 'review_required' | 'parser_failed' | 'ignored';
  matchedOrderId?: string | null;
  reviewReason?: string | null;
  parserError?: string | null;
}) {
  await db
    .update(interacEmailEvents)
    .set({
      status: args.status,
      matchedOrderId: args.matchedOrderId ?? null,
      reviewReason: args.reviewReason ?? null,
      parserError: args.parserError ?? null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(interacEmailEvents.id, args.eventId));
}

async function createReviewItem(args: {
  order?: CheckoutOrderRecord | null;
  eventId?: string | null;
  reason: ReviewReason;
  parsed?: InteracParsedEmail | null;
  screenshotUrls?: string[] | null;
  adminNotes?: string | null;
}) {
  const payment = args.order && isInteracPayment(args.order.payment) ? args.order.payment : null;
  const nextScreenshotUrls = args.screenshotUrls ?? null;
  const nextMessageCode = normalizeCode(args.parsed?.message) || payment?.messageCode || null;
  const nextReceivedAmount = args.parsed?.amountValue?.toFixed(2) ?? null;

  const existingRows = args.order?.orderId
    ? await db
        .select()
        .from(interacReviewItems)
        .where(
          and(
            eq(interacReviewItems.orderId, args.order.orderId),
            eq(interacReviewItems.status, 'open'),
          ),
        )
        .orderBy(desc(interacReviewItems.updatedAt))
        .limit(1)
    : args.eventId
      ? await db
          .select()
          .from(interacReviewItems)
          .where(
            and(
              eq(interacReviewItems.eventId, args.eventId),
              eq(interacReviewItems.status, 'open'),
            ),
          )
          .orderBy(desc(interacReviewItems.updatedAt))
          .limit(1)
      : [];
  const existing = existingRows[0] ?? null;

  if (existing) {
    const existingScreenshots = Array.isArray(existing.screenshotUrls)
      ? existing.screenshotUrls.filter((item): item is string => typeof item === 'string')
      : [];
    const screenshotUrls = Array.from(new Set([
      ...existingScreenshots,
      ...(nextScreenshotUrls ?? []),
    ]));
    const existingPriority = REVIEW_REASON_PRIORITY[existing.reason as ReviewReason] ?? 0;
    const nextPriority = REVIEW_REASON_PRIORITY[args.reason] ?? 0;
    const nextAdminNotes = args.adminNotes?.trim()
      ? existing.adminNotes?.includes(args.adminNotes.trim())
        ? existing.adminNotes
        : [existing.adminNotes, args.adminNotes.trim()].filter(Boolean).join('\n\n')
      : existing.adminNotes;
    const [row] = await db
      .update(interacReviewItems)
      .set({
        eventId: existing.eventId ?? args.eventId ?? null,
        reason: nextPriority > existingPriority ? args.reason : existing.reason,
        expectedAmount: payment?.cadAmount ?? existing.expectedAmount,
        receivedAmount: nextReceivedAmount ?? existing.receivedAmount,
        messageCode: nextMessageCode ?? existing.messageCode,
        senderName: args.parsed?.sentFrom ?? existing.senderName,
        senderEmail: payment?.replyToEmail ?? existing.senderEmail,
        bankReference: args.parsed?.bankReference ?? existing.bankReference,
        screenshotUrls: screenshotUrls.length ? screenshotUrls : existing.screenshotUrls,
        adminNotes: nextAdminNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(interacReviewItems.id, existing.id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(interacReviewItems)
    .values({
      orderId: args.order?.orderId ?? null,
      eventId: args.eventId ?? null,
      reason: args.reason,
      expectedAmount: payment?.cadAmount ?? null,
      receivedAmount: nextReceivedAmount,
      messageCode: nextMessageCode,
      senderName: args.parsed?.sentFrom ?? null,
      senderEmail: payment?.replyToEmail ?? null,
      bankReference: args.parsed?.bankReference ?? null,
      screenshotUrls: nextScreenshotUrls,
      adminNotes: args.adminNotes ?? null,
      updatedAt: new Date(),
    })
    .returning();
  return row!;
}

function isReviewableInteracOrder(order: CheckoutOrderRecord) {
  if (!isInteracPayment(order.payment)) return false;
  if (order.payment.status === 'paid') return false;
  if (order.payment.status === 'replaced') return false;
  if (order.payment.status === 'cancelled') return false;
  if (order.payment.swellPaymentId) return false;
  return Date.parse(order.payment.expiresAt) > Date.now();
}

async function findLikelyInteracOrderForMissingMessage(args: {
  parsed: InteracParsedEmail;
  replyToEmail?: string | null;
}) {
  const receivedCents = toCents(args.parsed.amountValue ?? args.parsed.amount);
  if (receivedCents === null || receivedCents <= 0) return null;

  const replyTo = extractEmailAddress(args.replyToEmail);
  const senderName = (args.parsed.sentFrom || '').trim().toLowerCase();
  if (!replyTo && !senderName) return null;

  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(sql`${checkoutOrders.payment}->>'provider' = 'interac'`)
    .orderBy(desc(checkoutOrders.createdAt))
    .limit(25);

  const candidates: CheckoutOrderRecord[] = [];

  for (const row of rows) {
    const order = await getCheckoutOrder(row.orderId);
    if (!order || !isReviewableInteracOrder(order)) continue;

    const payment = order.payment;
    if (!isInteracPayment(payment)) continue;
    if (toCents(payment.cadAmount) !== receivedCents) continue;

    const expectedEmail = extractEmailAddress(payment.expectedSenderEmail);
    const expectedName = payment.expectedSenderName.trim().toLowerCase();
    const emailMatches = Boolean(replyTo && expectedEmail && replyTo === expectedEmail);
    const nameMatches = Boolean(senderName && expectedName && senderName === expectedName);

    if (emailMatches || nameMatches) {
      candidates.push(order);
    }
  }

  return candidates.length === 1 ? candidates[0]! : null;
}

export async function findInteracOrderByMessageCode(messageCode?: string | null) {
  const normalized = normalizeCode(messageCode);
  if (!normalized) return null;

  const rows = await db
    .select()
    .from(checkoutOrders)
    .where(
      and(
        sql`${checkoutOrders.payment}->>'provider' = 'interac'`,
        sql`upper(${checkoutOrders.payment}->>'messageCode') = ${normalized}`,
      ),
    )
    .orderBy(desc(checkoutOrders.createdAt))
    .limit(1);

  if (!rows[0]) return null;
  return getCheckoutOrder(rows[0].orderId);
}

async function reconcileEvent(args: {
  eventId: string;
  parsed: InteracParsedEmail;
  authenticity: InteracAuthenticity;
  replyToEmail?: string | null;
  gmailMessageId: string;
}) {
  if (!args.authenticity.passed) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      reviewReason: 'suspicious_email',
    });
    await createReviewItem({
      reason: 'suspicious_email',
      eventId: args.eventId,
      parsed: args.parsed,
      adminNotes: args.authenticity.reasons.join(', '),
    });
    return null;
  }

  const unsupportedProcessorDomain = getUnsupportedProcessorDomain(args.replyToEmail);
  if (unsupportedProcessorDomain) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      reviewReason: 'suspicious_email',
    });
    await createReviewItem({
      reason: 'suspicious_email',
      eventId: args.eventId,
      parsed: args.parsed,
      adminNotes: `Unsupported Interac sender/processor domain: ${unsupportedProcessorDomain}. Customer must send from a Canadian bank account with Interac Autodeposit.`,
    });
    return null;
  }

  if (!args.parsed.message) {
    const likelyOrder = await findLikelyInteracOrderForMissingMessage({
      parsed: args.parsed,
      replyToEmail: args.replyToEmail,
    });
    if (likelyOrder && isInteracPayment(likelyOrder.payment)) {
      const receivedCents = toCents(args.parsed.amountValue ?? args.parsed.amount);
      const expectedCents = toCents(likelyOrder.payment.cadAmount);
      const updatedOrder = await updateCheckoutOrder(likelyOrder.orderId, (current) => {
        if (!isInteracPayment(current.payment)) return current;
        if (current.payment.status === 'paid' || current.payment.swellPaymentId) return current;

        return {
          ...current,
          payment: {
            ...current.payment,
            status: 'under_review',
            submittedAt: current.payment.submittedAt || new Date().toISOString(),
            receivedAmount: receivedCents === null ? current.payment.receivedAmount : centsToAmount(receivedCents),
            amountPaidToDate: receivedCents === null ? current.payment.amountPaidToDate : centsToAmount(receivedCents),
            cumulativePaidAmount: receivedCents === null ? current.payment.cumulativePaidAmount : centsToAmount(receivedCents),
            remainingBalanceAmount:
              receivedCents === null || expectedCents === null
                ? current.payment.remainingBalanceAmount
                : centsToAmount(Math.max(expectedCents - receivedCents, 0)),
            senderName: args.parsed.sentFrom ?? current.payment.senderName ?? null,
            replyToEmail: args.replyToEmail ?? current.payment.replyToEmail ?? null,
            bankReference: args.parsed.bankReference ?? current.payment.bankReference ?? null,
            gmailMessageId: args.gmailMessageId,
            updatedAt: new Date().toISOString(),
          } satisfies InteracPaymentData,
        };
      });

      await updateEventStatus({
        eventId: args.eventId,
        status: 'review_required',
        matchedOrderId: likelyOrder.orderId,
        reviewReason: 'missing_message',
      });
      await createReviewItem({
        reason: 'missing_message',
        eventId: args.eventId,
        order: updatedOrder || likelyOrder,
        parsed: args.parsed,
        adminNotes: 'No Interac Message code was present. This was attached by exact CAD amount plus sender match; verify manually before approving.',
      });
      return updatedOrder ? buildPublicCheckoutOrder(updatedOrder) : buildPublicCheckoutOrder(likelyOrder);
    }

    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      reviewReason: 'missing_message',
    });
    await createReviewItem({ reason: 'missing_message', eventId: args.eventId, parsed: args.parsed });
    return null;
  }

  const order = await findInteracOrderByMessageCode(args.parsed.message);
  if (!order || !isInteracPayment(order.payment)) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      reviewReason: 'unknown_message',
    });
    await createReviewItem({ reason: 'unknown_message', eventId: args.eventId, parsed: args.parsed });
    return null;
  }

  if (order.payment.status === 'paid' || order.payment.swellPaymentId) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'duplicate',
    });
    await createReviewItem({ reason: 'duplicate', eventId: args.eventId, order, parsed: args.parsed });
    return null;
  }

  const expectedCents = toCents(order.payment.cadAmount);
  const receivedCents = toCents(args.parsed.amountValue ?? args.parsed.amount);
  const parsedCurrency = (args.parsed.currency || 'CAD').trim().toUpperCase();
  if (parsedCurrency !== 'CAD') {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'wrong_amount',
    });
    await createReviewItem({
      reason: 'wrong_amount',
      eventId: args.eventId,
      order,
      parsed: args.parsed,
      adminNotes: `Interac email parsed as ${parsedCurrency}; expected CAD.`,
    });
    return null;
  }

  if (expectedCents === null || receivedCents === null || receivedCents <= 0) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'wrong_amount',
    });
    await createReviewItem({ reason: 'wrong_amount', eventId: args.eventId, order, parsed: args.parsed });
    return null;
  }

  if (Date.parse(order.payment.expiresAt) <= Date.now()) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'late_payment',
    });
    await createReviewItem({ reason: 'late_payment', eventId: args.eventId, order, parsed: args.parsed });
    return null;
  }

  const previouslyPaidCents = getInteracPaidCents(order.payment);
  const cumulativeReceivedCents = previouslyPaidCents + receivedCents;
  const expectedEmail = extractEmailAddress(order.payment.expectedSenderEmail);
  const expectedName = order.payment.expectedSenderName.trim().toLowerCase();
  const replyTo = extractEmailAddress(args.replyToEmail);
  const senderName = (args.parsed.sentFrom || '').trim().toLowerCase();
  const currentSenderMismatch = Boolean(
    (replyTo && expectedEmail && replyTo !== expectedEmail) ||
    (senderName && expectedName && senderName !== expectedName),
  );

  if (hasInteracSecurityQuestion(order.payment)) {
    const reviewOrder = await updateCheckoutOrder(order.orderId, (current) => {
      if (!isInteracPayment(current.payment)) return current;

      return {
        ...current,
        payment: {
          ...current.payment,
          status: current.payment.status === 'paid' ? 'paid' : 'under_review',
          submittedAt: current.payment.submittedAt || new Date().toISOString(),
          receivedAmount: centsToAmount(cumulativeReceivedCents),
          amountPaidToDate: centsToAmount(cumulativeReceivedCents),
          cumulativePaidAmount: centsToAmount(cumulativeReceivedCents),
          remainingBalanceAmount: centsToAmount(Math.max(expectedCents - cumulativeReceivedCents, 0)),
          senderName: args.parsed.sentFrom ?? current.payment.senderName ?? null,
          replyToEmail: args.replyToEmail ?? current.payment.replyToEmail ?? null,
          bankReference: args.parsed.bankReference ?? current.payment.bankReference ?? null,
          gmailMessageId: args.gmailMessageId,
          senderMismatch: Boolean(current.payment.senderMismatch || currentSenderMismatch),
          updatedAt: new Date().toISOString(),
        } satisfies InteracPaymentData,
      };
    });

    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'security_question',
    });
    await createReviewItem({
      reason: 'security_question',
      eventId: args.eventId,
      order: reviewOrder || order,
      parsed: args.parsed,
      adminNotes: 'Customer supplied an Interac security question/answer. Do not auto-confirm; verify manually before approving.',
    });
    return reviewOrder ? buildPublicCheckoutOrder(reviewOrder) : null;
  }

  if (cumulativeReceivedCents < expectedCents) {
    let amountOutcome = { kind: 'noop' } as InteracAmountOutcome;
    const updatedOrder = await updateCheckoutOrder(order.orderId, (current) => {
      if (!isInteracPayment(current.payment)) {
        amountOutcome = { kind: 'noop' };
        return current;
      }

      if (current.payment.status === 'paid' || current.payment.swellPaymentId) {
        amountOutcome = { kind: 'duplicate' };
        return current;
      }

      const currentPaidCents = getInteracPaidCents(current.payment);
      const nextCumulativeCents = currentPaidCents + receivedCents;
      const nextSenderMismatch = Boolean(current.payment.senderMismatch || currentSenderMismatch);

      if (nextCumulativeCents > expectedCents) {
        amountOutcome = {
          kind: 'over',
          cumulativeCents: nextCumulativeCents,
        };
        return current;
      }

      const isNowPaid = nextCumulativeCents === expectedCents;
      const remainingCents = Math.max(expectedCents - nextCumulativeCents, 0);
      amountOutcome = isNowPaid
        ? {
            kind: 'paid',
            cumulativeCents: nextCumulativeCents,
            senderMismatch: nextSenderMismatch,
          }
        : {
            kind: 'partial',
            cumulativeCents: nextCumulativeCents,
            remainingCents,
            senderMismatch: nextSenderMismatch,
          };

      return {
        ...current,
        payment: {
          ...current.payment,
          status: isNowPaid ? 'paid' : 'partially_paid',
          submittedAt: current.payment.submittedAt || new Date().toISOString(),
          confirmedAt: isNowPaid ? new Date().toISOString() : current.payment.confirmedAt,
          receivedAmount: centsToAmount(nextCumulativeCents),
          amountPaidToDate: centsToAmount(nextCumulativeCents),
          cumulativePaidAmount: centsToAmount(nextCumulativeCents),
          remainingBalanceAmount: centsToAmount(remainingCents),
          senderName: args.parsed.sentFrom ?? current.payment.senderName ?? null,
          replyToEmail: args.replyToEmail ?? current.payment.replyToEmail ?? null,
          bankReference: args.parsed.bankReference ?? current.payment.bankReference ?? null,
          gmailMessageId: args.gmailMessageId,
          senderMismatch: nextSenderMismatch,
          updatedAt: new Date().toISOString(),
        } satisfies InteracPaymentData,
      };
    });

    if (amountOutcome.kind === 'duplicate') {
      await updateEventStatus({
        eventId: args.eventId,
        status: 'review_required',
        matchedOrderId: order.orderId,
        reviewReason: 'duplicate',
      });
      await createReviewItem({ reason: 'duplicate', eventId: args.eventId, order: updatedOrder || order, parsed: args.parsed });
      return null;
    }

    if (amountOutcome.kind === 'over') {
      await updateEventStatus({
        eventId: args.eventId,
        status: 'review_required',
        matchedOrderId: order.orderId,
        reviewReason: 'wrong_amount',
      });
      await createReviewItem({
        reason: 'wrong_amount',
        eventId: args.eventId,
        order: updatedOrder || order,
        parsed: args.parsed,
        adminNotes: `Interac overpayment. Expected ${centsToAmount(expectedCents)} CAD total, received ${centsToAmount(amountOutcome.cumulativeCents)} CAD total.`,
      });
      return null;
    }

    if (amountOutcome.kind === 'noop') {
      await updateEventStatus({
        eventId: args.eventId,
        status: 'parser_failed',
        matchedOrderId: order.orderId,
        reviewReason: 'parser_failed',
        parserError: 'Unable to apply Interac partial payment to the current order state.',
      });
      await createReviewItem({
        reason: 'parser_failed',
        eventId: args.eventId,
        order: updatedOrder || order,
        parsed: args.parsed,
        adminNotes: 'Unable to apply Interac partial payment to the current order state.',
      });
      return null;
    }

    if (amountOutcome.kind === 'paid') {
      const result = await applyVerifiedPaymentStatus({
        orderId: order.orderId,
        provider: 'interac',
        targetStatus: 'paid',
        source: 'interac_email',
        paymentUpdater: current => current.payment,
      });

      await updateEventStatus({
        eventId: args.eventId,
        status: 'matched_paid',
        matchedOrderId: order.orderId,
      });

      if (currentSenderMismatch && !order.payment.senderMismatch) {
        await createReviewItem({
          reason: 'suspicious_email',
          eventId: args.eventId,
          order: result.order || updatedOrder || order,
          parsed: args.parsed,
          adminNotes: 'Partial Interac payment sender email/name differed from checkout-provided sender details. Payment auto-confirmed because message code and cumulative amount matched.',
        });
      }

      const paidOrder = result.order || updatedOrder;
      return paidOrder ? buildPublicCheckoutOrder(paidOrder) : null;
    }

    await updateEventStatus({
      eventId: args.eventId,
      status: 'matched_partial',
      matchedOrderId: order.orderId,
      reviewReason: 'partial_payment',
    });

    if (currentSenderMismatch && !order.payment.senderMismatch) {
      await createReviewItem({
        reason: 'suspicious_email',
        eventId: args.eventId,
        order,
        parsed: args.parsed,
        adminNotes: 'Partial Interac payment sender email/name differed from checkout-provided sender details. Payment remains matched by message code and amount.',
      });
    }

    return updatedOrder ? buildPublicCheckoutOrder(updatedOrder) : null;
  }

  if (cumulativeReceivedCents > expectedCents) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'wrong_amount',
    });
    await createReviewItem({
      reason: 'wrong_amount',
      eventId: args.eventId,
      order,
      parsed: args.parsed,
      adminNotes: `Interac overpayment. Expected ${centsToAmount(expectedCents)} CAD total, received ${centsToAmount(cumulativeReceivedCents)} CAD total.`,
    });
    return null;
  }

  let paidApplied = false;
  let paidBranchOutcome = { kind: 'noop' } as InteracAmountOutcome;
  const result = await applyVerifiedPaymentStatus({
    orderId: order.orderId,
    provider: 'interac',
    targetStatus: 'paid',
    source: 'interac_email',
    paymentUpdater: (current) => {
      if (!isInteracPayment(current.payment)) return current.payment;
      if (current.payment.status === 'paid' || current.payment.swellPaymentId) {
        paidBranchOutcome = { kind: 'duplicate' };
        return current.payment;
      }

      const currentPaidCents = getInteracPaidCents(current.payment);
      const nextCumulativeCents = currentPaidCents + receivedCents;
      const nextSenderMismatch = Boolean(current.payment.senderMismatch || currentSenderMismatch);
      if (nextCumulativeCents > expectedCents) {
        paidBranchOutcome = { kind: 'over', cumulativeCents: nextCumulativeCents };
        return current.payment;
      }
      if (nextCumulativeCents < expectedCents) {
        paidBranchOutcome = {
          kind: 'partial',
          cumulativeCents: nextCumulativeCents,
          remainingCents: expectedCents - nextCumulativeCents,
          senderMismatch: nextSenderMismatch,
        };
        return {
          ...current.payment,
          status: 'partially_paid',
          submittedAt: current.payment.submittedAt || new Date().toISOString(),
          receivedAmount: centsToAmount(nextCumulativeCents),
          amountPaidToDate: centsToAmount(nextCumulativeCents),
          cumulativePaidAmount: centsToAmount(nextCumulativeCents),
          remainingBalanceAmount: centsToAmount(expectedCents - nextCumulativeCents),
          senderName: args.parsed.sentFrom ?? current.payment.senderName ?? null,
          replyToEmail: args.replyToEmail ?? current.payment.replyToEmail ?? null,
          bankReference: args.parsed.bankReference ?? current.payment.bankReference ?? null,
          gmailMessageId: args.gmailMessageId,
          senderMismatch: nextSenderMismatch,
          updatedAt: new Date().toISOString(),
        } satisfies InteracPaymentData;
      }

      paidApplied = true;
      paidBranchOutcome = {
        kind: 'paid',
        cumulativeCents: nextCumulativeCents,
        senderMismatch: nextSenderMismatch,
      };
      return {
        ...current.payment,
        status: 'paid',
        confirmedAt: new Date().toISOString(),
        receivedAmount: centsToAmount(nextCumulativeCents),
        amountPaidToDate: centsToAmount(nextCumulativeCents),
        cumulativePaidAmount: centsToAmount(nextCumulativeCents),
        remainingBalanceAmount: '0.00',
        senderName: args.parsed.sentFrom ?? current.payment.senderName ?? null,
        replyToEmail: args.replyToEmail ?? current.payment.replyToEmail ?? null,
        bankReference: args.parsed.bankReference ?? current.payment.bankReference ?? null,
        gmailMessageId: args.gmailMessageId,
        senderMismatch: nextSenderMismatch,
        updatedAt: new Date().toISOString(),
      } satisfies InteracPaymentData;
    },
  });

  if (paidBranchOutcome.kind === 'duplicate' || (!paidApplied && result.order && isInteracPayment(result.order.payment) && result.order.payment.status === 'paid')) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'duplicate',
    });
    await createReviewItem({ reason: 'duplicate', eventId: args.eventId, order: result.order || order, parsed: args.parsed });
    return null;
  }

  if (paidBranchOutcome.kind === 'over') {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'review_required',
      matchedOrderId: order.orderId,
      reviewReason: 'wrong_amount',
    });
    await createReviewItem({
      reason: 'wrong_amount',
      eventId: args.eventId,
      order: result.order || order,
      parsed: args.parsed,
      adminNotes: `Interac overpayment. Expected ${centsToAmount(expectedCents)} CAD total, received ${centsToAmount(paidBranchOutcome.cumulativeCents)} CAD total.`,
    });
    return null;
  }

  if (paidBranchOutcome.kind === 'partial') {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'matched_partial',
      matchedOrderId: order.orderId,
      reviewReason: 'partial_payment',
    });
    if (currentSenderMismatch && !order.payment.senderMismatch) {
      await createReviewItem({
        reason: 'suspicious_email',
        eventId: args.eventId,
        order: result.order || order,
        parsed: args.parsed,
        adminNotes: 'Interac payment sender email/name differed from checkout-provided sender details. Payment remains matched by message code and amount.',
      });
    }
    return result.order ? buildPublicCheckoutOrder(result.order) : null;
  }

  if (!paidApplied) {
    await updateEventStatus({
      eventId: args.eventId,
      status: 'parser_failed',
      matchedOrderId: order.orderId,
      reviewReason: 'parser_failed',
      parserError: 'Unable to apply Interac payment to the current order state.',
    });
    await createReviewItem({
      reason: 'parser_failed',
      eventId: args.eventId,
      order: result.order || order,
      parsed: args.parsed,
      adminNotes: 'Unable to apply Interac payment to the current order state.',
    });
    return null;
  }

  await updateEventStatus({
    eventId: args.eventId,
    status: 'matched_paid',
    matchedOrderId: order.orderId,
  });

  if (currentSenderMismatch && !order.payment.senderMismatch) {
    await createReviewItem({
      reason: 'suspicious_email',
      eventId: args.eventId,
      order: result.order || order,
      parsed: args.parsed,
      adminNotes: 'Sender email/name differed from checkout-provided Interac sender details. Payment auto-confirmed because message code and amount matched.',
    });
  }

  return result.order ? buildPublicCheckoutOrder(result.order) : null;
}

async function processGmailMessage(args: {
  messageId: string;
  accessToken: string;
  pubsubMessageId?: string | null;
}) {
  const message = await fetchGmailMessage(args.messageId, args.accessToken);
  const headers = message.payload?.headers || [];
  const bodies = getMessageBodies(message);
  const subject = getHeader(headers, 'Subject');
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const replyTo = getHeader(headers, 'Reply-To');
  const textForAuth = normalizeEmailBody([subject, bodies.text, stripHtml(bodies.html)].join('\n'));
  const authenticity = buildAuthenticity({ headers, from, to, text: textForAuth });
  const parsed = parseInteracEmail({ subject, text: bodies.text, html: bodies.html });
  const event = await upsertEvent({
    gmailMessage: message,
    pubsubMessageId: args.pubsubMessageId,
    parsed,
    authenticity,
    rawText: bodies.text,
    rawHtml: bodies.html,
  });

  if (event.status !== 'received') {
    return null;
  }

  try {
    return await reconcileEvent({
      eventId: event.id,
      parsed,
      authenticity,
      replyToEmail: replyTo,
      gmailMessageId: message.id,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown Interac parser error.';
    await updateEventStatus({
      eventId: event.id,
      status: 'parser_failed',
      reviewReason: 'parser_failed',
      parserError: messageText,
    });
    await createReviewItem({
      reason: 'parser_failed',
      eventId: event.id,
      parsed,
      adminNotes: messageText,
    });
    throw error;
  }
}

export async function processGmailInteracPubSub(body: unknown) {
  const envelope = body as PubSubEnvelope;
  const data = envelope.message?.data
    ? JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8')) as {
        emailAddress?: string;
        historyId?: string;
      }
    : null;

  const mailbox = data?.emailAddress || configuredMailbox();
  if (normalizeEmail(mailbox) !== normalizeEmail(configuredMailbox())) {
    throw apiError.badRequest('Pub/Sub notification mailbox does not match configured Interac mailbox.');
  }
  const incomingHistoryId = data?.historyId;
  const pubsubMessageId = envelope.message?.messageId || envelope.message?.message_id || null;
  const state = await getWatchState(mailbox);
  const accessToken = await getGmailAccessToken();

  if (!state?.lastHistoryId) {
    await saveLastHistoryId(mailbox, incomingHistoryId);
    return { processed: 0, initialized: true };
  }

  const history = await listHistory({
    accessToken,
    startHistoryId: state.lastHistoryId,
  });
  const messageIds = Array.from(new Set(
    (history.history || [])
      .flatMap((entry) => entry.messagesAdded || [])
      .map((entry) => entry.message?.id)
      .filter(Boolean) as string[],
  ));

  const orders: CheckoutOrderPublic[] = [];
  for (const messageId of messageIds) {
    const order = await processGmailMessage({
      messageId,
      accessToken,
      pubsubMessageId,
    });
    if (order) orders.push(order);
  }

  await saveLastHistoryId(mailbox, history.historyId || incomingHistoryId);
  return { processed: messageIds.length, orders };
}

export async function syncGmailInteracMessages() {
  const state = await getWatchState();
  if (!state?.lastHistoryId) {
    await renewGmailInteracWatch();
    return { processed: 0, initialized: true };
  }

  return processGmailInteracPubSub({
    message: {
      data: Buffer.from(JSON.stringify({
        emailAddress: state.mailbox,
        historyId: state.lastHistoryId,
      })).toString('base64'),
    },
  });
}

export async function submitInteracTransfer(args: {
  orderId: string;
  accessKey: string;
  screenshotUrl?: string | null;
}) {
  let openedSecurityReview = false;
  const updated = await updateCheckoutOrder(args.orderId, (current) => {
    if (current.accessKey !== args.accessKey || !isInteracPayment(current.payment)) {
      return current;
    }
    if (current.payment.status === 'paid') {
      return current;
    }
    const needsSecurityReview = hasInteracSecurityQuestion(current.payment);
    openedSecurityReview =
      needsSecurityReview &&
      (current.payment.status === 'awaiting_transfer' ||
        current.payment.status === 'submitted');
    const screenshotUrls = [
      ...(current.payment.screenshotUrls || []),
      ...(args.screenshotUrl ? [args.screenshotUrl] : []),
    ];
    return {
      ...current,
      payment: {
        ...current.payment,
        status:
          current.payment.status === 'awaiting_transfer' ||
          (needsSecurityReview && current.payment.status === 'submitted')
            ? (needsSecurityReview ? 'under_review' : 'submitted')
            : current.payment.status,
        submittedAt: current.payment.submittedAt || new Date().toISOString(),
        screenshotUrls,
        updatedAt: new Date().toISOString(),
      },
    };
  });

  if (!updated || updated.accessKey !== args.accessKey) {
    throw apiError.notFound('Checkout session not found.');
  }
  if (!isInteracPayment(updated.payment)) {
    throw apiError.badRequest('Order is not an Interac payment.');
  }
  if (updated.payment.status === 'paid' || updated.payment.swellPaymentId) {
    return buildPublicCheckoutOrder(updated);
  }

  if (openedSecurityReview) {
    await createReviewItem({
      order: updated,
      reason: 'security_question',
      screenshotUrls: args.screenshotUrl ? [args.screenshotUrl] : null,
      adminNotes: 'Customer marked this Interac transfer as using a security question/answer. Verify manually before approving.',
    });
  } else if (args.screenshotUrl) {
    await createReviewItem({
      order: updated,
      reason: 'screenshot_submitted',
      screenshotUrls: [args.screenshotUrl],
    });
  }

  return buildPublicCheckoutOrder(updated);
}

export async function uploadInteracScreenshot(args: {
  orderId: string;
  accessKey: string;
  file: Blob;
}) {
  const order = await getCheckoutOrder(args.orderId);
  if (!order || order.accessKey !== args.accessKey) {
    throw apiError.notFound('Checkout session not found.');
  }
  if (!isInteracPayment(order.payment)) {
    throw apiError.badRequest('Order is not an Interac payment.');
  }
  if (!SCREENSHOT_TYPES.has(args.file.type)) {
    throw apiError.badRequest('Upload a JPG, PNG, WebP, HEIC, or HEIF screenshot.');
  }
  if (args.file.size > MAX_SCREENSHOT_SIZE) {
    throw apiError.badRequest('Screenshot file is too large. Max size is 10 MB.');
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw apiError.internal('Missing BLOB_READ_WRITE_TOKEN env var.');
  }

  const originalName = (args.file as Blob & { name?: string }).name || 'screenshot';
  const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '.jpg';
  const key = `interac/${args.orderId}/${crypto.randomUUID()}${extension}`;
  const blob = await withProviderTimeout({
    provider: 'blob',
    operation: 'upload_interac_screenshot',
    route: '/api/checkout/v2/orders/:orderId/interac-screenshot',
    task: () => put(key, args.file, {
      access: 'public',
      token,
      contentType: args.file.type,
    }),
  });

  const publicOrder = await submitInteracTransfer({
    orderId: args.orderId,
    accessKey: args.accessKey,
    screenshotUrl: blob.url,
  });

  return {
    order: publicOrder,
    screenshotUrl: blob.url,
  };
}

export async function listInteracReviews(args: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 50;
  const conditions = args.status && args.status !== 'all'
    ? [eq(interacReviewItems.status, args.status as typeof interacReviewItems.$inferSelect.status)]
    : [];
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(interacReviewItems)
    .where(where)
    .orderBy(desc(interacReviewItems.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interacReviewItems)
    .where(where);
  return {
    data: rows,
    page,
    pageSize,
    total: totalRows[0]?.count ?? rows.length,
  };
}

export async function approveInteracReview(args: {
  reviewId: string;
  adminUserId: string;
  notes?: string | null;
}) {
  const rows = await db
    .select()
    .from(interacReviewItems)
    .where(eq(interacReviewItems.id, args.reviewId))
    .limit(1);
  const review = rows[0];
  if (!review?.orderId) {
    throw apiError.notFound('Interac review item not found.');
  }

  const order = await getCheckoutOrder(review.orderId);
  if (!order || !isInteracPayment(order.payment)) {
    throw apiError.notFound('Interac order not found.');
  }

  if (order.payment.status !== 'paid') {
    const result = await applyVerifiedPaymentStatus({
      orderId: order.orderId,
      provider: 'interac',
      targetStatus: 'paid',
      source: 'interac_admin',
      paymentUpdater: (current) => {
        if (!isInteracPayment(current.payment)) return current.payment;
        return {
          ...current.payment,
          status: 'paid',
          confirmedAt: current.payment.confirmedAt || new Date().toISOString(),
          receivedAmount: review.receivedAmount ?? current.payment.receivedAmount,
          senderName: review.senderName ?? current.payment.senderName ?? null,
          replyToEmail: review.senderEmail ?? current.payment.replyToEmail ?? null,
          bankReference: review.bankReference ?? current.payment.bankReference ?? null,
          updatedAt: new Date().toISOString(),
        } satisfies InteracPaymentData;
      },
    });
    if (!result.order) {
      throw apiError.internal('Unable to approve Interac payment.');
    }
  }

  await db
    .update(interacReviewItems)
    .set({
      status: 'resolved',
      adminNotes: args.notes ?? review.adminNotes,
      resolvedByUserId: args.adminUserId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(interacReviewItems.id, args.reviewId));

  await db
    .update(interacReviewItems)
    .set({
      status: 'resolved',
      resolvedByUserId: args.adminUserId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(interacReviewItems.orderId, order.orderId),
        eq(interacReviewItems.status, 'open'),
        ne(interacReviewItems.id, args.reviewId),
      ),
    );

  const updatedOrder = await getCheckoutOrder(order.orderId);
  return buildPublicCheckoutOrder(updatedOrder || order);
}

export async function updateInteracReviewStatus(args: {
  reviewId: string;
  status: 'ignored' | 'refunded' | 'open';
  adminUserId?: string;
  notes?: string | null;
}) {
  await db
    .update(interacReviewItems)
    .set({
      status: args.status,
      adminNotes: args.notes ?? null,
      resolvedByUserId: args.status === 'open' ? null : args.adminUserId ?? null,
      resolvedAt: args.status === 'open' ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(interacReviewItems.id, args.reviewId));
  return { reviewId: args.reviewId, status: args.status };
}
