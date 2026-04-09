import { apiError } from '@/lib/api/errors';

type RateLimitProfile = 'auth' | 'marketing' | 'checkout' | 'public_write';

type RateLimitWindow = {
  limit: number;
  windowMs: number;
};

const RATE_LIMITS: Record<RateLimitProfile, RateLimitWindow> = {
  auth: { limit: 6, windowMs: 60_000 },
  marketing: { limit: 4, windowMs: 60_000 },
  checkout: { limit: 18, windowMs: 60_000 },
  public_write: { limit: 10, windowMs: 60_000 },
};

const store = new Map<string, { count: number; resetAt: number }>();

function getClientAddress(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

export function assertRateLimit(args: {
  request: Request;
  profile?: RateLimitProfile;
  key?: string;
}) {
  if (!args.profile) {
    return null;
  }

  const { limit, windowMs } = RATE_LIMITS[args.profile];
  const now = Date.now();
  const clientKey = args.key || getClientAddress(args.request);
  const bucketKey = `${args.profile}:${clientKey}`;
  const bucket = store.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    store.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      limit,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  if (bucket.count >= limit) {
    throw apiError.rateLimited(undefined, {
      limit,
      resetAt: new Date(bucket.resetAt).toISOString(),
    });
  }

  bucket.count += 1;
  store.set(bucketKey, bucket);
  return {
    limit,
    remaining: Math.max(limit - bucket.count, 0),
    resetAt: bucket.resetAt,
  };
}

export type { RateLimitProfile };
