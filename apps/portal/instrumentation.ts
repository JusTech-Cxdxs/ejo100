/**
 * Server-side observability. Every unexpected server error becomes one
 * structured, redacted JSON log line AND one row in error_events, under the
 * reference the person sees on screen (Next's digest for page errors). IT
 * finds it on Audit Logs → Error log.
 */
export async function register() {
  // Written as `=== 'nodejs'` so the edge build drops the database code entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installErrorSink } = await import('./lib/error-events');
    installErrorSink();
  }
}

type RequestInfo = { path: string; method: string; headers?: Record<string, string | string[] | undefined> };
type ContextInfo = { routerKind: string; routePath: string; routeType: string };

export async function onRequestError(err: unknown, request: RequestInfo, context: ContextInfo) {
  const { cleanForLog, newRef } = await import('./lib/errors');
  const { isControlFlowDigest } = await import('./lib/error-events-core');
  const e = err as { name?: string; message?: string; digest?: string; stack?: string };
  if (isControlFlowDigest(e?.digest)) return;
  // One number everywhere: the digest the error screen shows, or a new one for errors with no screen (API routes).
  const ref = e?.digest || newRef();
  console.error(JSON.stringify({
    level: 'error', app: 'portal', at: new Date().toISOString(), ref, name: e?.name, message: cleanForLog(String(e?.message ?? err)),
    method: request.method, path: request.path.split('?')[0], route: context.routePath, type: context.routeType,
    stack: e?.stack ? cleanForLog(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined,
  }));
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { recordRequestError } = await import('./lib/error-events');
      await recordRequestError(err, request, context, ref);
    } catch {
      /* the log line above is the fallback */
    }
  }
}
