// Account, admin, and affiliate routes are live again. Leave this empty unless
// a route family needs to be intentionally hidden in the future.
const TEMPORARILY_HIDDEN_ROUTE_PREFIXES: string[] = [];

function getPathname(path?: string | null) {
  if (!path || !path.startsWith('/')) return null;

  try {
    return new URL(path, 'https://revalin.local').pathname;
  } catch {
    return path.split('?')[0] || null;
  }
}

export function isTemporarilyHiddenAppRoute(path?: string | null) {
  const pathname = getPathname(path);
  if (!pathname) return false;

  return TEMPORARILY_HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getSafeAppDestination(
  path?: string | null,
  fallback = '/',
) {
  if (!path || !path.startsWith('/')) return fallback;
  if (isTemporarilyHiddenAppRoute(path)) return fallback;
  return path;
}

export function getAccountDestinationForRole(role?: string | null) {
  if (role === 'admin') return getSafeAppDestination('/admin');
  if (role === 'affiliate') return getSafeAppDestination('/affiliate/dashboard');
  return getSafeAppDestination('/account');
}

function canAccessDestination(args: {
  path: string;
  role?: string | null;
  canAccessAffiliateDashboard?: boolean;
}) {
  const pathname = getPathname(args.path);
  if (!pathname) return false;

  if (pathname === '/login' || pathname === '/signup' || pathname === '/auth/continue') {
    return false;
  }

  if (pathname === '/verify-email') {
    return false;
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return args.role === 'admin';
  }

  if (
    pathname === '/affiliate/dashboard' ||
    pathname.startsWith('/affiliate/dashboard/')
  ) {
    return Boolean(
      args.role === 'affiliate' ||
        args.role === 'admin' ||
        args.canAccessAffiliateDashboard,
    );
  }

  if (pathname === '/affiliate/signup' && args.canAccessAffiliateDashboard) {
    return false;
  }

  if (pathname === '/account' || pathname.startsWith('/account/')) {
    return true;
  }

  return true;
}

export function getAuthenticatedAppDestination(args: {
  path?: string | null;
  fallback: string;
  role?: string | null;
  canAccessAffiliateDashboard?: boolean;
}) {
  const safePath = getSafeAppDestination(args.path, args.fallback);

  if (
    !canAccessDestination({
      path: safePath,
      role: args.role,
      canAccessAffiliateDashboard: args.canAccessAffiliateDashboard,
    })
  ) {
    return args.fallback;
  }

  return safePath;
}
