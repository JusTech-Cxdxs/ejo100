import { NextResponse } from 'next/server';
import { prisma } from '@ejo/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — for uptime monitors (LOG-04). Checks the database with a
 * trivial query; answers only "ok" or "unavailable", never error details.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'connected', at: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ status: 'unavailable', database: 'unreachable' }, { status: 503, headers });
  }
}
