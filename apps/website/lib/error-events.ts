import { prisma } from '@ejo/database';
import { newRef, redact } from './error-ref';

export { newRef, redact };

/**
 * Server-only: error references for the website and the customer portal.
 * The same scheme as the staff portal (apps/portal/lib/error-events.ts):
 * the 10-digit number a person sees is the one in the log line and in the
 * error_events table, where IT finds it (portal → Audit Logs → Error log).
 * Never throws, never waits long, at most 30 rows a minute per instance,
 * and pauses for a minute after a failed write.
 */

function classify(err: unknown, routeType?: string): string {
  const e = err as { name?: string; code?: string; message?: string } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const text = `${e?.name ?? ''} ${typeof e?.message === 'string' ? e.message : String(err ?? '')}`;
  if (/^P1\d{3}$/.test(code) || code === 'P2024' || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|Failed to fetch|NetworkError|Load failed|Can't reach database/i.test(text)) return 'connection';
  if (/^P2\d{3}$/.test(code) || /Prisma|violates .* constraint|duplicate key value/i.test(text)) return 'database';
  if (routeType === 'browser') return 'browser';
  if (routeType === 'render') return 'render';
  if (routeType === 'route' || routeType === 'middleware') return 'route';
  return 'action';
}

let start = 0;
let count = 0;
let pausedUntil = 0;
const seen = new Set<string>();

async function customerFrom(h: Headers | null): Promise<{ customerId: string | null; organisationId: string | null }> {
  if (!h || !h.get('cookie')) return { customerId: null, organisationId: null };
  try {
    const { customerAuth } = await import('./auth-customer');
    const session = await customerAuth.api.getSession({ headers: h });
    if (!session?.user?.id) return { customerId: null, organisationId: null };
    const c = await prisma.customer.findUnique({ where: { id: session.user.id }, select: { id: true, organisationId: true } });
    return { customerId: c?.id ?? null, organisationId: c?.organisationId ?? null };
  } catch {
    return { customerId: null, organisationId: null };
  }
}

function toHeaders(raw: Headers | Record<string, string | string[] | undefined> | null | undefined): Headers | null {
  if (!raw) return null;
  if (raw instanceof Headers) return raw;
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : v);
  return h;
}

const cut = (v: unknown, max: number): string | null => (v === null || v === undefined || v === '' ? null : redact(String(v)).slice(0, max));

export async function recordErrorEvent(input: {
  ref: string; err: unknown; routeType?: string; headers?: Headers | Record<string, string | string[] | undefined> | null;
  method?: string | null; path?: string | null; route?: string | null;
}): Promise<void> {
  if (!input.ref || seen.has(input.ref)) return;
  seen.add(input.ref);
  if (seen.size > 500) seen.delete(seen.values().next().value as string);
  const now = Date.now();
  if (now < pausedUntil) return;
  if (now - start >= 60_000) { start = now; count = 0; }
  if (++count > 30) return;
  try {
    const who = await customerFrom(toHeaders(input.headers));
    const e = input.err as { name?: string; message?: string; stack?: string } | null;
    const message = typeof e?.message === 'string' && e.message ? e.message : String(input.err ?? 'No message');
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      prisma.errorEvent.create({
        data: {
          ref: input.ref.slice(0, 40), app: 'website', organisationId: who.organisationId, userId: null, customerId: who.customerId,
          method: cut(input.method, 10), path: cut(input.path?.split('?')[0], 300), route: cut(input.route, 300),
          kind: classify(input.err, input.routeType), name: cut(e?.name, 100), message: cut(message, 1000) ?? 'No message',
          stack: e?.stack ? cut(e.stack.split('\n').slice(0, 8).join('\n'), 1500) : null,
        },
        select: { id: true },
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('error_events write took too long')), 4000); }),
    ]).finally(() => clearTimeout(timer));
  } catch (err) {
    pausedUntil = Date.now() + 60_000;
    console.error(JSON.stringify({ level: 'warn', app: 'website', at: new Date().toISOString(), message: 'Could not store error reference', ref: input.ref, reason: String((err as Error)?.message ?? err).slice(0, 200) }));
  }
}

/**
 * For a server action's catch block: log the failure, store it, and return
 * the reference to put in the customer's message.
 */
export async function logCustomerError(where: string, err: unknown): Promise<string> {
  const ref = newRef();
  const e = err as { name?: string; message?: string; code?: string; stack?: string };
  console.error(JSON.stringify({ level: 'error', app: 'website', ref, where, at: new Date().toISOString(), name: e?.name, code: e?.code, message: redact(String(e?.message ?? err)), stack: e?.stack ? redact(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined }));
  let h: Headers | null = null;
  try {
    const { headers } = await import('next/headers');
    h = new Headers(await headers());
  } catch {
    h = null;
  }
  const work = recordErrorEvent({ ref, err, routeType: 'action', headers: h, method: 'POST', path: h?.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? null, route: where });
  try {
    const { after } = await import('next/server');
    after(work);
  } catch {
    void work;
  }
  return ref;
}
