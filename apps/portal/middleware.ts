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
 *
 * IMPORTANT — matcher: the previous pattern only excluded _next/static,
 * _next/image, and favicon.ico. Every OTHER request, including requests
 * for public static files like /images/logo/logo.png, was treated as a
 * protected route: an unauthenticated request for that image had no
 * session cookie, so middleware redirected it to /login — which is
 * exactly the "logo.png redirects to /login" behaviour reported. The
 * file was never missing; it was never actually being served.
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
  // Run on everything except Next's own internals, favicon.ico, the
  // public /images directory, and any request that looks like a static
  // file (has a recognizable file extension) — none of those should ever
  // be treated as a protected app route.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|images/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|txt|json|map)$).*)',
  ],
};
