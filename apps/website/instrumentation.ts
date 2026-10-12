/**
 * Every unexpected server error becomes one structured, redacted log line
 * and one error_events row under the reference shown on screen (the digest
 * for page errors). Same scheme as the staff portal; IT looks references up
 * on the portal's Error log page.
 */
export function register() {}

type RequestInfo = { path: string; method: string; headers?: Record<string, string | string[] | undefined> };

export async function onRequestError(err: unknown, request: RequestInfo, context: { routePath: string; routeType: string }) {
  const { redact, newRef } = await import('./lib/error-ref');
  const e = err as { name?: string; message?: string; digest?: string; stack?: string };
  if (typeof e?.digest === 'string' && /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(e.digest)) return;
  const ref = e?.digest || newRef();
  console.error(JSON.stringify({
    level: 'error', app: 'website', at: new Date().toISOString(), ref, name: e?.name, message: redact(String(e?.message ?? err)),
    method: request.method, path: request.path.split('?')[0], route: context.routePath, type: context.routeType,
    stack: e?.stack ? redact(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined,
  }));
  // Written as `=== 'nodejs'` so the edge build drops the database code entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { recordErrorEvent } = await import('./lib/error-events');
      await recordErrorEvent({ ref, err, routeType: context.routeType, headers: request.headers, method: request.method, path: request.path, route: context.routePath });
    } catch {
      /* the log line above is the fallback */
    }
  }
}
