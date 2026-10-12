import { NextResponse, type NextRequest } from 'next/server';
import { recordErrorEvent } from '@/lib/error-events';

export const dynamic = 'force-dynamic';

/**
 * POST /api/error-report: a failure in the browser (no server digest) is
 * stored under the reference the error screen shows. Same-origin only, small
 * bodies only, at most 20 a minute per server instance. Always answers 204.
 */
let start = 0;
let count = 0;
const done = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) return done();
  if (Number(request.headers.get('content-length') ?? 0) > 4000) return done();
  const now = Date.now();
  if (now - start >= 60_000) { start = now; count = 0; }
  if (++count > 20) return done();
  let body: { ref?: unknown; message?: unknown; name?: unknown; path?: unknown };
  try {
    body = JSON.parse((await request.text()).slice(0, 4000));
  } catch {
    return done();
  }
  if (typeof body.ref !== 'string' || !/^\d{10}$/.test(body.ref)) return done();
  await recordErrorEvent({
    ref: body.ref,
    err: { name: typeof body.name === 'string' ? body.name.slice(0, 100) : 'Error', message: typeof body.message === 'string' ? body.message.slice(0, 500) : 'No message' },
    routeType: 'browser',
    headers: request.headers,
    method: 'GET',
    path: typeof body.path === 'string' ? body.path.slice(0, 300) : null,
    route: 'browser',
  });
  return done();
}
