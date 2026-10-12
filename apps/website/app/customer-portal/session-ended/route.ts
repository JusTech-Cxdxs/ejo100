import { NextResponse, type NextRequest } from 'next/server';
import { customerAuth } from '@/lib/auth-customer';

export const dynamic = 'force-dynamic';

const REASONS = new Set(['inactive', 'expired', 'signed_out']);

/**
 * Ends a customer session that can no longer be used (expired, or the
 * account was switched off) and returns to sign-in with a friendly note.
 * Server components cannot clear cookies, so the dashboard layout sends
 * people here — otherwise a stale cookie would bounce between the sign-in
 * page (middleware: "has a cookie → dashboard") and the dashboard forever.
 */
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get('reason') ?? 'expired';
  const target = new URL('/customer-portal', request.url);
  target.searchParams.set('error', REASONS.has(reason) ? reason : 'expired');
  const out = NextResponse.redirect(target, 303);
  try {
    const res = await customerAuth.api.signOut({ headers: request.headers, asResponse: true });
    for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
  } catch {
    /* fall through: the cookies below still go */
  }
  for (const name of ['customer-auth.session_token', 'customer-auth.session_data', 'customer-auth.dont_remember']) {
    out.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    out.headers.append('set-cookie', `__Secure-${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  }
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
}
