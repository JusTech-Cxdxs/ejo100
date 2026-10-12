import { cleanForLog } from './errors';

/**
 * One structured, redacted log line for a failure (LOG-01). Replaces raw
 * `console.error('…', err)` calls: errors are reduced to name / code /
 * message / the first stack lines, every value has secrets removed, and
 * email addresses are masked — logs never carry tokens, passwords or a
 * person's full email.
 */
const clean = cleanForLog;

function describe(value: unknown): unknown {
  if (value instanceof Error) {
    const e = value as Error & { code?: string; digest?: string };
    return { name: e.name, code: e.code, digest: e.digest, message: clean(String(e.message)), stack: e.stack ? clean(e.stack.split('\n').slice(1, 5).join(' | ')) : undefined };
  }
  if (typeof value === 'string') return clean(value);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  try {
    return JSON.parse(clean(JSON.stringify(value)));
  } catch {
    return clean(String(value));
  }
}

export function logFailure(message: string, ...details: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message: clean(message), details: details.map(describe) }));
}
