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
// Scheduled jobs carry no sign-in cookie — they are protected by CRON_SECRET
// inside each route (a missing or wrong secret is refused there).
// /signed-out clears a session the server refused (switched-off account).
const ALWAYS_PUBLIC = ['/api/auth', '/api/cron', '/signed-out'];

// Flood protection for submissions (form posts / server actions): at most
// 120 a minute per person (1,500 per shared address), per server instance. Reading pages is never
// limited. (The global layer is an edge WAF — see docs/PRODUCTION_READINESS.md.)
const WINDOW_MS = 60_000;
const MAX_POSTS = 120;
/** A shared office address (many signed-in people) gets a larger allowance. */
const MAX_POSTS_PER_ADDRESS = 1500;
const posts = new Map<string, { n: number; start: number }>();
function tooManyPosts(request: NextRequest): boolean {
  if (request.method !== 'POST') return false;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  // Counted per signed-in person (session cookie) AND per address: a whole
  // office behind one internet address is not one person.
  const token = getSessionCookie(request);
  const now = Date.now();
  if (posts.size > 5000) for (const [k, w] of posts) if (now - w.start > WINDOW_MS) posts.delete(k);
  const over = (key: string, max: number) => {
    const w = posts.get(key);
    if (!w || now - w.start > WINDOW_MS) { posts.set(key, { n: 1, start: now }); return false; }
    w.n += 1;
    return w.n > max;
  };
  const perPerson = token ? over(`s:${token.slice(0, 32)}`, MAX_POSTS) : false;
  const perAddress = over(`ip:${ip}`, token ? MAX_POSTS_PER_ADDRESS : MAX_POSTS);
  return perPerson || perAddress;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (tooManyPosts(request)) {
    return new NextResponse('Too many requests — please wait a moment and try again.', { status: 429, headers: { 'Retry-After': '60' } });
  }

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
