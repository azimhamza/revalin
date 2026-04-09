import {
  POST_AUTH_PENDING_COOKIE,
  POST_AUTH_PENDING_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/auth/post-auth-cookie';

export function readBrowserCookie(name: string) {
  if (typeof document === 'undefined') return null;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function setPostAuthPendingCookie() {
  if (typeof document === 'undefined') return;

  document.cookie = [
    `${POST_AUTH_PENDING_COOKIE}=1`,
    'path=/',
    'SameSite=Lax',
    `Max-Age=${POST_AUTH_PENDING_COOKIE_MAX_AGE_SECONDS}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearPostAuthPendingCookie() {
  if (typeof document === 'undefined') return;

  document.cookie = [
    `${POST_AUTH_PENDING_COOKIE}=`,
    'path=/',
    'SameSite=Lax',
    'Max-Age=0',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
