import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { contentSecurityPolicy, newNonce, themeScriptHash } from '@/lib/security-headers';

/**
 * Route protection for the (app) group, and keeping signed-in people off the
 * auth pages. A cookie-presence check only (Better Auth's edge-safe pattern):
 * it decides where to send someone, while the server re-validates the session
 * on every request. Public files (/images, robots.txt…) are excluded by the
 * matcher and STATIC_FILE below, so they are never redirected to /login.
 */
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password', '/verify-email'];
// Scheduled jobs carry no sign-in cookie — they are protected by CRON_SECRET
// inside each route (a missing or wrong secret is refused there).
// /signed-out clears a session the server refused (switched-off account).
const ALWAYS_PUBLIC = ['/api/auth', '/api/cron', '/api/health', '/signed-out'];

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
  // Signed-in traffic and anonymous traffic are counted SEPARATELY, so a busy
  // office (many people behind one internet address) never locks out its own
  // sign-in / forgot-password / set-password requests. Signed in: 120 a minute
  // per person and 1,500 per address; anonymous: 120 per address. (The cookie
  // is not verified here — a forged one only moves a client into the
  // per-address 1,500 bucket; sign-in itself has its own limit in lib/auth.ts.)
  const token = getSessionCookie(request);
  const now = Date.now();
  if (posts.size > 5000) for (const [k, w] of posts) if (now - w.start > WINDOW_MS) posts.delete(k);
  if (posts.size > 20000) posts.clear();
  const over = (key: string, max: number) => {
    const w = posts.get(key);
    if (!w || now - w.start > WINDOW_MS) { posts.set(key, { n: 1, start: now }); return false; }
    w.n += 1;
    return w.n > max;
  };
  if (!token) return over(`anon:${ip}`, MAX_POSTS);
  const perAddress = over(`auth:${ip}`, MAX_POSTS_PER_ADDRESS);
  const perPerson = over(`s:${token.slice(0, 32)}`, MAX_POSTS);
  return perPerson || perAddress;
}

// Public files at the root (robots.txt, a manifest, an icon…) are fetched
// with GET. Only those pass straight through: a POST to a ".json"-looking
// path still reaches the server actions, so it is signed-in checked and
// flood-limited like any other (SEC-03).
const STATIC_FILE = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|txt|json|map|xml|webmanifest)$/i;

/**
 * Every request gets an id (x-request-id, LOG-02): passed to the server code
 * (lib/request-id.ts) and echoed in the response, so a person reporting a
 * problem can quote it and it matches the server log line. Always generated
 * here; an id sent by the browser is ignored.
 *
 * Pages also get a Content-Security-Policy with a fresh nonce
 * (lib/security-headers.ts). Next.js reads the policy from the request
 * headers and puts the nonce on its own scripts.
 */
async function pass(request: NextRequest, requestId: string): Promise<NextResponse> {
  const csp = contentSecurityPolicy(newNonce(), await themeScriptHash());
  const forwarded = new Headers(request.headers);
  forwarded.set('x-request-id', requestId);
  forwarded.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers: forwarded } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('x-request-id', requestId);
  return res;
}

function tagged(res: NextResponse, requestId: string): NextResponse {
  res.headers.set('x-request-id', requestId);
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if ((request.method === 'GET' || request.method === 'HEAD') && STATIC_FILE.test(pathname)) return NextResponse.next();
  const requestId = crypto.randomUUID();
  if (tooManyPosts(request)) {
    return tagged(new NextResponse('Too many requests — please wait a moment and try again.', { status: 429, headers: { 'Retry-After': '60' } }), requestId);
  }

  const isAlwaysPublic = ALWAYS_PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAlwaysPublic) {
    return pass(request, requestId);
  }

  const sessionCookie = getSessionCookie(request);
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isAuthPage) {
    // Already signed in and revisiting /login etc. — send straight to the
    // dashboard instead of showing the form again.
    if (sessionCookie) {
      return tagged(NextResponse.redirect(new URL('/dashboard', request.url)), requestId);
    }
    return pass(request, requestId);
  }

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return tagged(NextResponse.redirect(loginUrl), requestId);
  }

  return pass(request, requestId);
}

export const config = {
  // Run on everything except Next's own internals, favicon.ico and the
  // public /images directory. Other static-looking paths are let through by
  // the middleware itself, for GET only (see STATIC_FILE above).
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|images/).*)',
  ],
};
