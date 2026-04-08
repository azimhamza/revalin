import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { TAGS } from '@/lib/constants';

// Webhook handlers must never be statically rendered or cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Swell webhook receiver.
 *
 * Configure in the Swell dashboard → Settings → Webhooks:
 *   URL:    https://<your-domain>/api/swell/webhook
 *   Events: products.created, products.updated, products.deleted,
 *           categories.created, categories.updated, categories.deleted
 *   Header: Authorization: Bearer <SWELL_WEBHOOK_SECRET>
 *
 * On any product/category change, busts the cache tags shared between the
 * inner Swell `fetch` (in `lib/swell/swell.ts`) and the outer `'use cache'`
 * wrappers (in `lib/swell/index.ts`), so the next request hits Swell live.
 *
 * Latency from Swell update → live page is ~ webhook round-trip + 1 SSR.
 */

const WEBHOOK_SECRET = process.env.SWELL_WEBHOOK_SECRET || '';

function constantTimeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function extractIncomingSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }

  const headerSecret = request.headers.get('x-swell-webhook-secret');
  if (headerSecret) return headerSecret.trim();

  // Allow `?secret=...` as a fallback so this also works with the
  // Swell-dashboard URL-secret style.
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret) return querySecret.trim();

  return null;
}

function isAuthorized(request: Request): boolean {
  if (!WEBHOOK_SECRET) {
    // Fail closed: refuse to process webhooks until the secret is configured.
    return false;
  }

  const incoming = extractIncomingSecret(request);
  if (!incoming) return false;

  return constantTimeStringEqual(incoming, WEBHOOK_SECRET);
}

type SwellWebhookPayload = {
  type?: string;
  model?: string;
  event?: string;
  data?: Record<string, unknown>;
};

function resolveModel(payload: SwellWebhookPayload): string {
  // Swell sends `type` as either `products.updated` (dotted) or `products` +
  // separate `event` field, depending on the webhook version. Normalise both.
  const rawType = (payload.type || '').toLowerCase();
  if (rawType.includes('.')) return rawType.split('.')[0];
  if (rawType) return rawType;

  const model = (payload.model || '').toLowerCase();
  if (model) return model;

  return '';
}

function tagsForModel(model: string): string[] {
  switch (model) {
    case 'product':
    case 'products':
    case 'product.variant':
    case 'products.variants':
    case 'variant':
    case 'variants':
      // Variant + product changes both invalidate every product list and
      // every collection list (collection ↔ product membership may have
      // shifted as well).
      return [TAGS.products, TAGS.collectionProducts];

    case 'category':
    case 'categories':
      return [TAGS.collections, TAGS.collectionProducts];

    default:
      return [];
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: SwellWebhookPayload;
  try {
    payload = (await request.json()) as SwellWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const model = resolveModel(payload);
  const tags = tagsForModel(model);

  if (tags.length === 0) {
    // Unknown / unhandled event — acknowledge so Swell does not retry.
    return NextResponse.json({ ok: true, revalidated: [], model: model || null });
  }

  for (const tag of tags) {
    revalidateTag(tag);
  }

  return NextResponse.json({
    ok: true,
    revalidated: tags,
    model,
    type: payload.type ?? null,
    event: payload.event ?? null,
  });
}

export async function GET() {
  // Health check for the Swell dashboard "Test" button.
  return NextResponse.json({ ok: true, configured: Boolean(WEBHOOK_SECRET) });
}
