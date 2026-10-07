import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { livePulse } from '@/lib/live-pulse';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * GET /api/live/pulse — "has anything changed in my organisation?"
 *
 * Open pages ask this every few seconds, so it is a plain GET route rather
 * than a server action: no page machinery, no React render, one signed-cookie
 * session check, one key lookup and (shared per organisation, see
 * lib/live-pulse) two tiny indexed queries. Returns an opaque signature only.
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: NO_STORE });
    const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isActive: true, organisationId: true } });
    if (!u?.isActive) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: NO_STORE });
    const pulse = await livePulse(u.organisationId);
    return NextResponse.json({ pulse }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers: NO_STORE });
  }
}
