'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { AFFILIATE_COOKIE_NAME } from '@/lib/checkout/affiliate-constants';
import {
  clearPostAuthPendingCookie,
  readBrowserCookie,
} from '@/lib/auth/post-auth-client';
import { POST_AUTH_PENDING_COOKIE } from '@/lib/auth/post-auth-cookie';

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  emailVerified?: boolean | null;
  role?: string | null;
  [key: string]: unknown;
};

type SessionData = {
  user?: SessionUser | null;
  session?: Record<string, unknown> | null;
  [key: string]: unknown;
} | null;

type SessionContext = {
  data: SessionData;
  error: Error | null;
  isPending: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
};

const AuthSessionContext = createContext<SessionContext | null>(null);

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

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
    const userEmail = typeof user?.email === 'string' ? user.email : undefined;
    const userName = typeof user?.name === 'string' ? user.name : undefined;
    const affiliateCode = readCookie(AFFILIATE_COOKIE_NAME);
    const syncKey = JSON.stringify({
      affiliateCode,
      email: userEmail ?? null,
      emailVerified: user?.emailVerified ?? null,
      name: userName ?? null,
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
      ...(userEmail ? { email: userEmail } : {}),
      firstName: getFirstName(userName),
      properties: {
        affiliate_code: affiliateCode,
        auth_state: 'authenticated',
        email_verified: Boolean(user.emailVerified),
        ...(userName ? { full_name: userName } : {}),
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

    const runReconcile = () => {
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
    };

    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      const idleHandle = idleWindow.requestIdleCallback(runReconcile, {
        timeout: 2_000,
      });

      return () => {
        idleWindow.cancelIdleCallback?.(idleHandle);
      };
    }

    const timeoutHandle = window.setTimeout(runReconcile, 500);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [session.data?.user?.id, session.isPending]);

  return null;
}

async function noopRefetch() {}

export function SessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: SessionData;
}) {
  const session: SessionContext = {
    data: initialSession,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: noopRefetch,
  };

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
