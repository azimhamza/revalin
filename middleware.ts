import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isTemporarilyHiddenAppRoute } from '@/lib/account-destination';

const AUTH_COOKIES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

const PROTECTED_PREFIXES = [
  '/account',
  '/admin',
  '/affiliate/dashboard',
  '/affiliate/signup',
];
const VERIFY_PAGE = '/verify-email';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = AUTH_COOKIES.some(cookieName => request.cookies.has(cookieName));

  if (isTemporarilyHiddenAppRoute(pathname)) {
    return NextResponse.next();
  }

  // Protected routes: redirect to login if no session cookie
  if (PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set(
        'callbackUrl',
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  // Verify-email page: require session (redirect to login if none)
  if (pathname === VERIFY_PAGE) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set(
        'callbackUrl',
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/account/:path*',
    '/admin/:path*',
    '/affiliate/dashboard/:path*',
    '/affiliate/signup',
    '/verify-email',
  ],
};
