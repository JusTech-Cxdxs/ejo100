/**
 * Server-side observability: every unexpected server error becomes ONE
 * structured log line (JSON) — what, where, when, which route, and the
 * reference users see — with secrets removed. Vercel's log view (or any log
 * drain such as Better Stack / Datadog) can search and alert on these.
 */
export function register() {
  // Nothing to start yet — a tracing / metrics SDK would be registered here.
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  const { redact } = await import('./lib/errors');
  const e = err as { name?: string; message?: string; digest?: string; stack?: string };
  console.error(JSON.stringify({
    level: 'error', at: new Date().toISOString(), ref: e?.digest, name: e?.name, message: redact(String(e?.message ?? err)),
    method: request.method, path: request.path.split('?')[0], route: context.routePath, type: context.routeType,
    stack: e?.stack ? redact(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined,
  }));
}
