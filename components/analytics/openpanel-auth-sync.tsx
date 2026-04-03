'use client';

import { useEffect, useRef } from 'react';
import { useAuthSession } from '@/components/auth/session-provider';
import { AFFILIATE_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getFirstName(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;

  return trimmed.split(/\s+/)[0];
}

export default function OpenPanelAuthSync() {
  const { data: session, isPending } = useAuthSession();
  const lastSyncKeyRef = useRef<string | null>(null);
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) return;

    const user = session?.user;
    const userRole = typeof (user as any)?.role === 'string' ? (user as any).role : null;
    const affiliateCode = readCookie(AFFILIATE_COOKIE_NAME);
    const syncKey = JSON.stringify({
      affiliateCode,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      name: user?.name ?? null,
      role: userRole,
      userId: user?.id ?? null,
    });

    if (!window.op) return;
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;

    if (!user?.id) {
      if (identifiedUserIdRef.current) {
        window.op.clear?.();
        identifiedUserIdRef.current = null;
      }
      window.op.setGlobalProperties({
        affiliate_code: affiliateCode,
        auth_state: 'anonymous',
        email_verified: null,
        user_id: null,
        user_role: null,
      });
      return;
    }

    if (identifiedUserIdRef.current && identifiedUserIdRef.current !== user.id) {
      window.op.clear?.();
    }
    identifiedUserIdRef.current = user.id;

    window.op.identify({
      profileId: user.id,
      email: user.email,
      firstName: getFirstName(user.name),
      properties: {
        affiliate_code: affiliateCode,
        auth_state: 'authenticated',
        email_verified: Boolean(user.emailVerified),
        full_name: user.name,
        ...(userRole ? { user_role: userRole } : {}),
      },
    });

    window.op.setGlobalProperties({
      affiliate_code: affiliateCode,
      auth_state: 'authenticated',
      email_verified: Boolean(user.emailVerified),
      user_id: user.id,
      ...(userRole ? { user_role: userRole } : { user_role: null }),
    });
  }, [isPending, session?.user]);

  return null;
}
