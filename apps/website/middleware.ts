import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Only the customer area needs middleware on the public website.
 * /customer-portal is the login page (public unless already signed in,
 * in which case it forwards straight to the dashboard); everything under
 * /customer-portal/dashboard requires a valid customer session cookie.
 * Must match lib/auth-customer.ts's advanced.cookiePrefix exactly — this
 * is only an optimistic check (cookie presence), not full validation.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request, { cookiePrefix: 'customer-auth' });

  if (pathname === '/customer-portal') {
    if (sessionCookie) {
      return NextResponse.redirect(new URL('/customer-portal/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/customer-portal/dashboard')) {
    if (!sessionCookie) {
      const loginUrl = new URL('/customer-portal', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/customer-portal', '/customer-portal/dashboard/:path*'],
};
