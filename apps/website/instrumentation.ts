/**
 * Every unexpected server error becomes ONE structured, redacted log line
 * (same format as the staff portal) — searchable in Vercel's logs (LOG-03).
 */
export function register() {}

function redact(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***@')
    .replace(/\b(bearer|token|apikey|api_key|password|secret|authorization)\b(["':=\s]+)[^\s"',}]+/gi, '$1$2***')
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')
    .slice(0, 2000);
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  const e = err as { name?: string; message?: string; digest?: string; stack?: string };
  console.error(JSON.stringify({
    level: 'error', app: 'website', at: new Date().toISOString(), ref: e?.digest, name: e?.name, message: redact(String(e?.message ?? err)),
    method: request.method, path: request.path.split('?')[0], route: context.routePath, type: context.routeType,
    stack: e?.stack ? redact(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined,
  }));
}
