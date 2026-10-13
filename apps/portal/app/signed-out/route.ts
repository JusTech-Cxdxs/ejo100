import { NextResponse, type NextRequest } from 'next/server';

/**
 * Ends a session the server no longer accepts (account switched off or
 * removed) and shows the sign-in page with the reason. Clearing the cookies
 * here prevents a /login ↔ /dashboard redirect loop.
 */
const COOKIES = ['session_token', 'session_data', 'dont_remember'];

export function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get('reason') === 'inactive' ? 'inactive' : 'signed_out';
  const res = NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
  for (const name of COOKIES) {
    for (const prefix of ['better-auth.', '__Secure-better-auth.']) {
      res.cookies.set(`${prefix}${name}`, '', { path: '/', maxAge: 0, secure: prefix.startsWith('__Secure'), httpOnly: true, sameSite: 'lax' });
    }
  }
  return res;
}
