import { SESSION_COOKIE_NAME } from '@evidencechase/shared/constants';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sends signed-out visitors to the login page before the manager area renders. This only checks
 * that a session cookie exists. The API validates the session on every request, and a stale
 * cookie still gets a 401 there, which the client turns into a redirect to login.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/audits/:path*'],
};
