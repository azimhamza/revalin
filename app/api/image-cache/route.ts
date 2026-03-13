import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const CACHE_DIR = process.env.IMAGE_CACHE_DIR
  || (process.env.VERCEL
    ? path.join('/tmp', 'revalin-image-cache')
    : path.join(process.cwd(), '.next', 'cache', 'image-cache'));
const BROWSER_MAX_AGE_SECONDS = 60 * 10;
const STALE_WHILE_REVALIDATE_SECONDS = 60 * 60 * 24;
const ORIGIN_REVALIDATE_MS = 1000 * 60 * 60 * 6;
const FALLBACK_REVALIDATE_MS = 1000 * 60 * 5;

const ALLOWED_EXACT_HOSTS = new Set([
  'cdn.swell.store',
  'zylq-002.dx.commercecloud.salesforce.com',
  'edge.disstg.commercecloud.salesforce.com',
]);

type CachedMetadata = {
  etag: string;
  lastModified?: string;
  contentType: string;
  sourceUrl: string;
  cachedAt: number;
  revalidateAfter: number;
};

type CachedEntry = {
  body: Buffer;
  metadata: CachedMetadata;
};

type CacheState = 'HIT' | 'MISS' | 'REVALIDATED' | 'STALE';

type ImagePayload = CachedEntry & {
  state: CacheState;
};

const inFlight = new Map<string, Promise<ImagePayload>>();

function isAllowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return ALLOWED_EXACT_HOSTS.has(normalized) || normalized === 'swell.store' || normalized.endsWith('.swell.store');
}

function parseSourceUrl(value: string | null): URL | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (!isAllowedHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function createCacheKey(sourceUrl: string, version: string): string {
  return createHash('sha256').update(`${sourceUrl}|${version}`).digest('hex');
}

function getCachePaths(cacheKey: string) {
  return {
    metadataPath: path.join(CACHE_DIR, `${cacheKey}.json`),
    imagePath: path.join(CACHE_DIR, `${cacheKey}.bin`),
  };
}

function normalizeContentType(contentTypeHeader: string | null): string {
  const value = (contentTypeHeader || 'image/jpeg').split(';')[0].trim().toLowerCase();
  return value.startsWith('image/') ? value : 'image/jpeg';
}

function computeFallbackEtag(cacheKey: string): string {
  return `"${cacheKey}"`;
}

function clientHasCurrentEtag(request: Request, etag: string): boolean {
  const header = request.headers.get('if-none-match');
  if (!header) return false;
  return header
    .split(',')
    .map(token => token.trim())
    .includes(etag);
}

function buildResponseHeaders(metadata: CachedMetadata, state: CacheState): Headers {
  const headers = new Headers();
  headers.set('Content-Type', metadata.contentType);
  headers.set('Cache-Control', `public, max-age=${BROWSER_MAX_AGE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`);
  headers.set('ETag', metadata.etag);
  headers.set('X-Image-Cache', state);

  if (metadata.lastModified) {
    headers.set('Last-Modified', metadata.lastModified);
  }

  return headers;
}

async function readCachedEntry(cacheKey: string): Promise<CachedEntry | null> {
  const { metadataPath, imagePath } = getCachePaths(cacheKey);

  try {
    const [metadataRaw, imageBuffer] = await Promise.all([readFile(metadataPath, 'utf8'), readFile(imagePath)]);
    const metadata = JSON.parse(metadataRaw) as CachedMetadata;
    if (!metadata?.contentType || !metadata?.etag) return null;

    return {
      metadata,
      body: imageBuffer,
    };
  } catch {
    return null;
  }
}

async function persistCacheEntry(cacheKey: string, entry: CachedEntry): Promise<boolean> {
  const { metadataPath, imagePath } = getCachePaths(cacheKey);

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await Promise.all([
      writeFile(imagePath, entry.body),
      writeFile(metadataPath, JSON.stringify(entry.metadata)),
    ]);
    return true;
  } catch (error) {
    // Cache persistence is best-effort; upstream image fetch should still succeed.
    console.warn('image-cache: failed to persist cache entry', {
      cacheDir: CACHE_DIR,
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function fetchAndRefreshImage(
  sourceUrl: URL,
  cacheKey: string,
  cachedEntry: CachedEntry | null
): Promise<ImagePayload> {
  const conditionalHeaders = new Headers();

  if (cachedEntry?.metadata.etag) {
    conditionalHeaders.set('If-None-Match', cachedEntry.metadata.etag);
  }
  if (cachedEntry?.metadata.lastModified) {
    conditionalHeaders.set('If-Modified-Since', cachedEntry.metadata.lastModified);
  }

  try {
    const upstreamResponse = await fetch(sourceUrl.toString(), {
      method: 'GET',
      headers: conditionalHeaders,
      redirect: 'follow',
      cache: 'no-store',
    });

    if (upstreamResponse.status === 304 && cachedEntry) {
      const refreshedMetadata: CachedMetadata = {
        ...cachedEntry.metadata,
        cachedAt: Date.now(),
        revalidateAfter: Date.now() + ORIGIN_REVALIDATE_MS,
      };

      const refreshedEntry: CachedEntry = {
        metadata: refreshedMetadata,
        body: cachedEntry.body,
      };

      await persistCacheEntry(cacheKey, refreshedEntry);
      return { ...refreshedEntry, state: 'REVALIDATED' };
    }

    if (!upstreamResponse.ok) {
      throw new Error(`Upstream image request failed with ${upstreamResponse.status}`);
    }

    const contentType = normalizeContentType(upstreamResponse.headers.get('content-type'));
    const imageBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const etag = upstreamResponse.headers.get('etag') || computeFallbackEtag(cacheKey);
    const lastModified = upstreamResponse.headers.get('last-modified') || undefined;

    const nextEntry: CachedEntry = {
      metadata: {
        etag,
        lastModified,
        contentType,
        sourceUrl: sourceUrl.toString(),
        cachedAt: Date.now(),
        revalidateAfter: Date.now() + ORIGIN_REVALIDATE_MS,
      },
      body: imageBuffer,
    };

    await persistCacheEntry(cacheKey, nextEntry);
    return { ...nextEntry, state: cachedEntry ? 'REVALIDATED' : 'MISS' };
  } catch (error) {
    if (cachedEntry) {
      const staleEntry: CachedEntry = {
        ...cachedEntry,
        metadata: {
          ...cachedEntry.metadata,
          revalidateAfter: Date.now() + FALLBACK_REVALIDATE_MS,
        },
      };

      await persistCacheEntry(cacheKey, staleEntry);
      return { ...staleEntry, state: 'STALE' };
    }

    throw error;
  }
}

async function getImagePayload(sourceUrl: URL, cacheKey: string): Promise<ImagePayload> {
  const cachedEntry = await readCachedEntry(cacheKey);
  if (cachedEntry && Date.now() < cachedEntry.metadata.revalidateAfter) {
    return { ...cachedEntry, state: 'HIT' };
  }

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = fetchAndRefreshImage(sourceUrl, cacheKey, cachedEntry);
  inFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    if (inFlight.get(cacheKey) === request) {
      inFlight.delete(cacheKey);
    }
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const sourceUrl = parseSourceUrl(requestUrl.searchParams.get('src'));

  if (!sourceUrl) {
    return new Response('Invalid or unsupported src URL', { status: 400 });
  }

  const version = requestUrl.searchParams.get('v') || '';
  const cacheKey = createCacheKey(sourceUrl.toString(), version);

  try {
    const payload = await getImagePayload(sourceUrl, cacheKey);
    const headers = buildResponseHeaders(payload.metadata, payload.state);

    if (clientHasCurrentEtag(request, payload.metadata.etag)) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(payload.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load image';
    return new Response(message, { status: 502 });
  }
}
