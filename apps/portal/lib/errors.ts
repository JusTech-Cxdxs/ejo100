/**
 * Turning failures into messages people can act on — and logs engineers can
 * debug — without ever showing users technical text or logging secrets.
 *
 *  • Our own business messages ("Give a reason for declining") pass through.
 *  • Database conditions become plain words (duplicate, gone, conflict).
 *  • Anything technical → "Something went wrong… quote reference ABC123",
 *    with the full detail in the server log under that reference.
 */
const PRISMA: Record<string, string> = {
  P2002: 'That already exists — check for a duplicate.',
  P2003: 'This is linked to something that no longer exists — refresh the page and try again.',
  P2025: 'This record no longer exists or was just changed — refresh the page.',
  P2034: 'Someone else changed this at the same time — refresh and try again.',
  P1001: 'The database is not reachable right now — please try again in a moment.',
  P1008: 'The database took too long to answer — please try again.',
  P2024: 'The system is very busy right now — please try again in a moment.',
};
const TECHNICAL = /prisma|invocation|Invalid `|Cannot read properties|undefined is not|is not a function|ECONN|ETIMEDOUT|fetch failed|socket|stack|SyntaxError|TypeError|ReferenceError|\bat [\w.]+ \(/i;

/** Remove anything secret-looking before it reaches a log. */
export function redact(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***@')
    .replace(/\b(bearer|token|apikey|api_key|password|secret|authorization)\b(["':=\s]+)[^\s"',}]+/gi, '$1$2***')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***jwt***')
    .slice(0, 2000);
}

function ref(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Structured server log line (JSON) — what, where, when, reference; no secrets. */
export function logError(where: string, err: unknown, extra?: Record<string, unknown>): string {
  const r = ref();
  const e = err as { name?: string; message?: string; code?: string; stack?: string };
  console.error(JSON.stringify({ level: 'error', ref: r, where, at: new Date().toISOString(), name: e?.name, code: e?.code, message: redact(String(e?.message ?? err)), stack: e?.stack ? redact(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined, ...(extra ? { extra: JSON.parse(redact(JSON.stringify(extra))) } : {}) }));
  return r;
}

/** The message to show the person. */
export function friendlyError(err: unknown, fallback = 'That could not be completed.', where = 'action'): string {
  const e = err as { code?: string; message?: string; digest?: string; meta?: { target?: unknown } };
  // Next.js redirects / not-found are control flow, not errors.
  if (e?.digest?.startsWith?.('NEXT_')) throw err;
  // Two identical submissions raced: the database kept exactly one — it went through.
  if (e?.code === 'P2002' && JSON.stringify(e.meta?.target ?? '').includes('idempotencyKey')) {
    return 'This was already recorded — it went through. Refresh the page to see it.';
  }
  // Two records saved at the same instant picked the same reference number:
  // nothing was duplicated (the database refused the second) — just save again.
  if (e?.code === 'P2002' && /Number/.test(JSON.stringify(e.meta?.target ?? ''))) {
    logError(where, err);
    return 'Someone else saved a record at exactly the same moment, so this one was not saved — please submit it again.';
  }
  if (e?.code && PRISMA[e.code]) {
    logError(where, err);
    return PRISMA[e.code]!;
  }
  const msg = typeof e?.message === 'string' ? e.message.trim() : '';
  if (msg && msg.length <= 300 && !msg.includes('\n') && !TECHNICAL.test(msg)) return msg;
  const r = logError(where, err);
  return `${fallback} Something went wrong on our side — please try again. If it keeps happening, quote reference ${r}.`;
}
