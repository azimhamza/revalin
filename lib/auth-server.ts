import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

const getCachedServerSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

const getUncachedFreshServerSession = cache(async () => {
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
