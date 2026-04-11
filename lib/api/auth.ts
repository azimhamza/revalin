import {
  getFreshServerSession,
  getServerSession,
  type ServerSession,
} from '@/lib/auth-server';
import { apiError } from '@/lib/api/errors';
import { getPromoterByUserIdentity } from '@/lib/checkout/promoter-service';

type AuthenticatedSession = NonNullable<ServerSession>;

function getRole(session: AuthenticatedSession) {
  return typeof (session.user as { role?: unknown }).role === 'string'
    ? ((session.user as { role?: string }).role ?? null)
    : null;
}

export async function optionalSession(args?: { fresh?: boolean }) {
  return args?.fresh ? getFreshServerSession() : getServerSession();
}

export async function requireSession(args?: { fresh?: boolean }) {
  const session = await optionalSession(args);
  if (!session?.user) {
    throw apiError.unauthenticated();
  }
  return session as AuthenticatedSession;
}

export async function requireAdmin(args?: { fresh?: boolean }) {
  const session = await requireSession(args);
  if (getRole(session) !== 'admin') {
    throw apiError.forbidden();
  }
  return session;
}

export async function requireAffiliateOrAdmin(args?: { fresh?: boolean }) {
  const session = await requireSession(args);
  const role = getRole(session);
  if (role !== 'affiliate' && role !== 'admin') {
    throw apiError.forbidden();
  }
  return session;
}

export async function requirePromoterOrAdmin(args?: { fresh?: boolean }) {
  const session = await requireSession(args);
  const role = getRole(session);
  if (role === 'admin') {
    return session;
  }

  const promoter = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });
  if (promoter?.status !== 'approved') {
    throw apiError.forbidden();
  }

  return session;
}

export function getSessionRole(session: AuthenticatedSession | null | undefined) {
  return session ? getRole(session) : null;
}

export type { AuthenticatedSession };
