'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useSession } from '@/lib/auth-client';
import { AFFILIATE_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';
import {
  clearPostAuthPendingCookie,
  readBrowserCookie,
} from '@/lib/auth/post-auth-client';
import { POST_AUTH_PENDING_COOKIE } from '@/lib/auth/post-auth-cookie';

type SessionContext = ReturnType<typeof useSession>;

const AuthSessionContext = createContext<SessionContext | null>(null);

function readCookie(name: string) {
  return readBrowserCookie(name);
}

function getFirstName(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;

  return trimmed.split(/\s+/)[0];
}

function OpenPanelSessionSync({ session }: { session: SessionContext }) {
  const { data, isPending } = session;
  const lastSyncKeyRef = useRef<string | null>(null);
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) return;

    const user = data?.user;
    const userRole =
      typeof (user as any)?.role === 'string' ? (user as any).role : null;
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
  }, [data?.user, isPending]);

  return null;
}

function PostAuthReconcileBootstrap({ session }: { session: SessionContext }) {
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (session.isPending) return;
    const userId = session.data?.user?.id ?? null;
    if (!userId) {
      attemptedRef.current = null;
      return;
    }

    const pending = readBrowserCookie(POST_AUTH_PENDING_COOKIE);
    if (!pending) {
      attemptedRef.current = null;
      return;
    }

    if (attemptedRef.current === userId) {
      return;
    }

    attemptedRef.current = userId;

    fetch('/api/auth/reconcile', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .catch((error) => {
        console.error('[POST-AUTH-RECONCILE]', error);
      })
      .finally(() => {
        clearPostAuthPendingCookie();
      });
  }, [session.data?.user?.id, session.isPending]);

  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <AuthSessionContext.Provider value={session}>
      <OpenPanelSessionSync session={session} />
      <PostAuthReconcileBootstrap session={session} />
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within a SessionProvider');
  }
  return context;
}
