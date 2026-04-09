'use client';

import Link, { type LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type MouseEvent,
  type TouchEvent,
} from 'react';

type PrefetchMode = 'intent' | 'viewport' | 'off';

type IntentLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'prefetch'> & {
  intentDelayMs?: number;
  prefetchMode?: PrefetchMode;
  warmupUrls?: readonly string[];
};

const DEFAULT_INTENT_DELAY_MS = 80;
const PREFETCH_TTL_MS = 30_000;

const prefetchedRouteKeys = new Map<string, number>();
const prefetchedWarmupKeys = new Map<string, number>();

function toPrefetchKey(href: LinkProps['href']) {
  if (typeof href === 'string') {
    return href;
  }

  const pathname = href.pathname ?? '';
  const searchParams = new URLSearchParams();

  if (href.query) {
    for (const [key, value] of Object.entries(href.query)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          searchParams.append(key, String(item));
        }
        continue;
      }

      searchParams.set(key, String(value));
    }
  }

  const search = searchParams.toString();
  const hash = href.hash ? `#${href.hash}` : '';

  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}

function isInternalPrefetchTarget(value: string) {
  if (!value || value.startsWith('#')) {
    return false;
  }

  if (
    value.startsWith('mailto:') ||
    value.startsWith('tel:') ||
    value.startsWith('javascript:')
  ) {
    return false;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      if (typeof window === 'undefined') {
        return false;
      }

      return new URL(value, window.location.origin).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  return value.startsWith('/');
}

function shouldRunPrefetch(cache: Map<string, number>, key: string) {
  const now = Date.now();
  const lastRun = cache.get(key);

  if (lastRun && now - lastRun < PREFETCH_TTL_MS) {
    return false;
  }

  cache.set(key, now);
  return true;
}

function warmSameOriginUrl(url: string) {
  if (!isInternalPrefetchTarget(url)) {
    return;
  }

  if (!shouldRunPrefetch(prefetchedWarmupKeys, url)) {
    return;
  }

  void fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
  }).catch(() => {
    // Best-effort warmup only.
  });
}

export const IntentLink = forwardRef<HTMLAnchorElement, IntentLinkProps>(
  function IntentLink(
    {
      href,
      intentDelayMs = DEFAULT_INTENT_DELAY_MS,
      onBlur,
      onFocus,
      onMouseEnter,
      onMouseLeave,
      onTouchStart,
      prefetchMode = 'intent',
      target,
      warmupUrls,
      ...props
    },
    ref,
  ) {
    const router = useRouter();
    const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prefetchKey = toPrefetchKey(href);

    const clearIntentTimer = useCallback(() => {
      if (intentTimerRef.current !== null) {
        clearTimeout(intentTimerRef.current);
        intentTimerRef.current = null;
      }
    }, []);

    const runPrefetch = useCallback(() => {
      if (prefetchMode !== 'intent' || target === '_blank') {
        return;
      }

      if (isInternalPrefetchTarget(prefetchKey) && shouldRunPrefetch(prefetchedRouteKeys, prefetchKey)) {
        void router.prefetch(prefetchKey);
      }

      for (const url of warmupUrls ?? []) {
        warmSameOriginUrl(url);
      }
    }, [prefetchKey, prefetchMode, router, target, warmupUrls]);

    const scheduleIntentPrefetch = useCallback(() => {
      if (prefetchMode !== 'intent') {
        return;
      }

      clearIntentTimer();

      if (intentDelayMs <= 0) {
        runPrefetch();
        return;
      }

      intentTimerRef.current = setTimeout(() => {
        intentTimerRef.current = null;
        runPrefetch();
      }, intentDelayMs);
    }, [clearIntentTimer, intentDelayMs, prefetchMode, runPrefetch]);

    useEffect(() => clearIntentTimer, [clearIntentTimer]);

    const handleMouseEnter = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) {
          scheduleIntentPrefetch();
        }
      },
      [onMouseEnter, scheduleIntentPrefetch],
    );

    const handleMouseLeave = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onMouseLeave?.(event);
        clearIntentTimer();
      },
      [clearIntentTimer, onMouseLeave],
    );

    const handleFocus = useCallback(
      (event: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(event);
        if (!event.defaultPrevented) {
          runPrefetch();
        }
      },
      [onFocus, runPrefetch],
    );

    const handleBlur = useCallback(
      (event: FocusEvent<HTMLAnchorElement>) => {
        onBlur?.(event);
        clearIntentTimer();
      },
      [clearIntentTimer, onBlur],
    );

    const handleTouchStart = useCallback(
      (event: TouchEvent<HTMLAnchorElement>) => {
        onTouchStart?.(event);
        if (!event.defaultPrevented) {
          runPrefetch();
        }
      },
      [onTouchStart, runPrefetch],
    );

    return (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetchMode === 'viewport'}
        target={target}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        {...props}
      />
    );
  },
);
