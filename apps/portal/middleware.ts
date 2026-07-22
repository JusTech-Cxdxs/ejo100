import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Route protection for the (app) group, plus keeping already-authenticated
 * users off the auth pages. This is a lightweight, edge-safe check (cookie
 * presence only, per Better Auth's documented middleware pattern) — it
 * decides whether to redirect, not whether the session is still valid
 * server-side. Full session validation happens per-request via
 * auth.api.getSession() in server components/route handlers that need
 * the actual user (see app/page.tsx).
 */
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password', '/verify-email'];
const ALWAYS_PUBLIC = ['/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAlwaysPublic = ALWAYS_PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAlwaysPublic) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isAuthPage) {
    // Already signed in and revisiting /login etc. — send straight to the
    // dashboard instead of showing the form again.
    if (sessionCookie) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
