import { NextResponse, type NextRequest } from 'next/server';
import { globalSearch } from '@/lib/actions/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * GET /api/search?q=… — the top bar's search. A plain GET (not a server
 * action) so a new keystroke cancels the previous request instead of queueing
 * behind it: server actions from one page run one after another. Same code,
 * same permissions and fences as before (globalSearch checks the session).
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  try {
    const groups = await globalSearch(q);
    return NextResponse.json({ groups }, { headers: NO_STORE });
  } catch (err) {
    const signedOut = err instanceof Error && /sign|auth|session/i.test(err.message);
    return NextResponse.json({ error: signedOut ? 'Please sign in again.' : 'Search is unavailable just now.' }, { status: signedOut ? 401 : 503, headers: NO_STORE });
  }
}
