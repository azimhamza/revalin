import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getSafeAppDestination,
  isTemporarilyHiddenAppRoute,
} from '@/lib/account-destination';

const AUTH_COOKIE = 'better-auth.session_token';

const PROTECTED_PREFIXES = ['/account', '/admin', '/affiliate/dashboard'];
const AUTH_PAGES = ['/login', '/signup'];
const VERIFY_PAGE = '/verify-email';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(AUTH_COOKIE);

  if (isTemporarilyHiddenAppRoute(pathname)) {
    return NextResponse.next();
  }

  // Protected routes: redirect to login if no session cookie
  if (PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Auth pages: redirect to account if already logged in
  if (AUTH_PAGES.includes(pathname)) {
    if (hasSession) {
      return NextResponse.redirect(
        new URL(getSafeAppDestination('/account'), request.url),
      );
    }
  }

  // Verify-email page: require session (redirect to login if none)
  if (pathname === VERIFY_PAGE) {
    if (!hasSession) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/account/:path*',
    '/admin/:path*',
    '/affiliate/dashboard/:path*',
    '/login',
    '/signup',
    '/verify-email',
  ],
};
