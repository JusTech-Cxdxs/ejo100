import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Only the customer area needs middleware on the public website.
 *  - /customer-portal is the sign-in page: public, but someone already
 *    signed in goes straight to the dashboard (unless they arrive with a
 *    notice to read — ?error= / ?reset= — e.g. after a session ended).
 *  - /customer-portal/forgot-password, /reset-password and /session-ended
 *    are always open.
 *  - Everything under /customer-portal/dashboard requires a customer
 *    session cookie.
 * Must match lib/auth-customer.ts's advanced.cookiePrefix exactly — this is
 * only an optimistic check (cookie presence); the dashboard layout and every
 * server action validate the session and isActive for real.
 *
 * Every customer-portal response is personal: `Cache-Control: private,
 * no-store` so no shared cache or back-button snapshot ever keeps it.
 */
function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return res;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const sessionCookie = getSessionCookie(request, { cookiePrefix: 'customer-auth' });

  if (pathname === '/customer-portal') {
    const hasNotice = searchParams.has('error') || searchParams.has('reset');
    if (sessionCookie && !hasNotice) {
      return noStore(NextResponse.redirect(new URL('/customer-portal/dashboard', request.url)));
    }
    return noStore(NextResponse.next());
  }

  if (pathname === '/customer-portal/dashboard' || pathname.startsWith('/customer-portal/dashboard/')) {
    if (!sessionCookie) {
      const loginUrl = new URL('/customer-portal', request.url);
      loginUrl.searchParams.set('redirect', pathname + (request.nextUrl.search || ''));
      return noStore(NextResponse.redirect(loginUrl));
    }
    return noStore(NextResponse.next());
  }

  return noStore(NextResponse.next());
}

export const config = {
  matcher: ['/customer-portal', '/customer-portal/:path*', '/api/customer/:path*'],
};
