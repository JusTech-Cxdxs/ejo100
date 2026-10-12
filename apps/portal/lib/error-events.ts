import { prisma } from '@ejo/database';
import { newRef, setErrorSink, type ErrorReport } from './errors';
import { buildErrorEventRow, classifyError, createRateGate, createSeen, isControlFlowDigest, type ErrorKind } from './error-events-core';

/**
 * Server-only (NOT a 'use server' file): stores each error reference in
 * error_events so IT can look up the number a person quotes (Audit Logs →
 * Error log). Rules:
 *  • never throws and never waits long: the person's answer is not held up;
 *  • never recurses: a failed write is logged as one plain line, nothing more;
 *  • at most 30 rows a minute per server instance, one row per reference;
 *  • after a failed write (database down), no attempts for a minute;
 *  • not journaled (ErrorEvent is in the audit journal's skip list).
 */

const allow = createRateGate(30);
const alreadySeen = createSeen(500);
let pausedUntil = 0;
const WRITE_TIMEOUT_MS = 4000;

type Who = { userId: string | null; organisationId: string | null };

/** The signed-in staff member behind these request headers, if any. */
async function whoFromHeaders(h: Headers | null): Promise<Who> {
  if (!h || !h.get('cookie')) return { userId: null, organisationId: null };
  try {
    const { auth } = await import('./auth');
    const session = await auth.api.getSession({ headers: h });
    const userId = session?.user?.id ?? null;
    if (!userId) return { userId: null, organisationId: null };
    const fromSession = (session!.user as { organisationId?: string | null }).organisationId ?? null;
    if (fromSession) return { userId, organisationId: fromSession };
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { organisationId: true } });
    return { userId, organisationId: u?.organisationId ?? null };
  } catch {
    return { userId: null, organisationId: null };
  }
}

function toHeaders(raw: Record<string, string | string[] | undefined> | Headers | undefined | null): Headers | null {
  if (!raw) return null;
  if (raw instanceof Headers) return raw;
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : v);
  return h;
}

export type ErrorEventInput = {
  ref: string; err: unknown; kind?: ErrorKind; headers?: Headers | Record<string, string | string[] | undefined> | null;
  method?: string | null; path?: string | null; route?: string | null;
};

/** Store one reference. Resolves when written (or skipped); never rejects. */
export async function recordErrorEvent(input: ErrorEventInput): Promise<void> {
  if (!input.ref || alreadySeen(input.ref)) return;
  if (Date.now() < pausedUntil || !allow()) return;
  try {
    const who = await whoFromHeaders(toHeaders(input.headers));
    const data = buildErrorEventRow({ ref: input.ref, app: 'portal', err: input.err, kind: input.kind, ...who, method: input.method, path: input.path, route: input.route });
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      prisma.errorEvent.create({ data, select: { id: true } }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('error_events write took too long')), WRITE_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
  } catch (err) {
    pausedUntil = Date.now() + 60_000;
    // Plain console line on purpose: going through logError here could loop.
    console.error(JSON.stringify({ level: 'warn', at: new Date().toISOString(), message: 'Could not store error reference', ref: input.ref, reason: String((err as Error)?.message ?? err).slice(0, 200) }));
  }
}

/** For instrumentation.ts onRequestError: render, action and route failures. */
export async function recordRequestError(
  err: unknown,
  request: { path: string; method: string; headers?: Record<string, string | string[] | undefined> },
  context: { routePath?: string; routeType?: string },
  givenRef?: string,
): Promise<void> {
  const digest = (err as { digest?: unknown })?.digest;
  if (isControlFlowDigest(digest)) return;
  const ref = givenRef || (typeof digest === 'string' && digest ? digest : newRef());
  await recordErrorEvent({ ref, err, kind: classifyError(err, { routeType: context.routeType }), headers: request.headers, method: request.method, path: request.path, route: context.routePath });
}

/**
 * Every logError (friendlyError's "quote reference …") is stored as well.
 * Runs inside the request, so the session cookie and path are still known;
 * `after()` keeps the write alive once the response has gone.
 */
export function installErrorSink(): void {
  setErrorSink((r: ErrorReport) => {
    const work = (async () => {
      let h: Headers | null = null;
      try {
        const { headers } = await import('next/headers');
        h = new Headers(await headers());
      } catch {
        h = null; // outside a request (scheduled job, build)
      }
      const path = h?.get('next-url') ?? h?.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? null;
      await recordErrorEvent({ ref: r.ref, err: r.err, kind: classifyError(r.err, { where: r.where }), headers: h, method: h ? 'POST' : null, path, route: r.where });
    })();
    import('next/server').then(({ after }) => { try { after(work); } catch { /* outside a request */ } }).catch(() => undefined);
  });
}

/** Retention: error references older than 90 days are removed by the daily job. */
export async function purgeOldErrorEvents(days = 90): Promise<number> {
  const res = await prisma.errorEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return res.count;
}
