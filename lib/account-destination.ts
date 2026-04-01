// Account, admin, and affiliate routes are live again. Leave this empty unless
// a route family needs to be intentionally hidden in the future.
const TEMPORARILY_HIDDEN_ROUTE_PREFIXES: string[] = [];

export function isTemporarilyHiddenAppRoute(path?: string | null) {
  if (!path || !path.startsWith('/')) return false;

  return TEMPORARILY_HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
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
