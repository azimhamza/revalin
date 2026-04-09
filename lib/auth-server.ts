import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth';

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

async function hasSessionCookie() {
  const cookieStore = await cookies();
  return SESSION_COOKIE_NAMES.some((cookieName) => Boolean(cookieStore.get(cookieName)?.value));
}

const getCachedServerSession = cache(async () => {
  if (!(await hasSessionCookie())) {
    return null;
  }

  return auth.api.getSession({
    headers: await headers(),
  });
});

const getUncachedFreshServerSession = cache(async () => {
  if (!(await hasSessionCookie())) {
    return null;
  }

  return auth.api.getSession({
    headers: await headers(),
    query: {
      disableCookieCache: true,
    },
  });
});

export async function getServerSession() {
  return getCachedServerSession();
}

export async function getFreshServerSession() {
  return getUncachedFreshServerSession();
}

export type ServerSession = Awaited<ReturnType<typeof getServerSession>>;
