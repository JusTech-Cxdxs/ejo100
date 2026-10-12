/**
 * Shared helpers for the CI security / concurrency tests (throw-away CI
 * database only — never a real deployment). Test infrastructure, not app code.
 *
 *  - signIn(): a real Better Auth session cookie.
 *  - action(): call a server action by NAME the way the browser does
 *    (POST + `Next-Action: <id>` header, args encoded as React's encodeReply
 *    would for plain JSON values), using the id map from action-map.mjs.
 *  - sql(): read the database directly (pg) to verify the real outcome.
 *  - report(): GitHub annotations + job summary, the only output CI exposes.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { Pool } from 'pg';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const MAP_FILE = process.env.ACTION_MAP ?? 'actions.json';

type ActionInfo = { name: string; file: string; page: string | null; pages: number };
let map: Record<string, ActionInfo> | null = null;
const byName = new Map<string, { id: string } & ActionInfo>();
export function actionMap(): Record<string, ActionInfo> {
  if (!map) {
    map = JSON.parse(readFileSync(MAP_FILE, 'utf8')) as Record<string, ActionInfo>;
    for (const [id, a] of Object.entries(map)) byName.set(`${a.file}:${a.name}`, { id, ...a }), byName.has(a.name) || byName.set(a.name, { id, ...a });
  }
  return map;
}
export function actionId(name: string): { id: string } & ActionInfo {
  actionMap();
  const a = byName.get(name);
  if (!a) throw new Error(`No server action named ${name} in ${MAP_FILE}`);
  return a;
}

export async function signIn(email: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`sign-in ${email}: HTTP ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

/** A cookie that passes the middleware's presence check but is no session. */
export const FORGED_COOKIE = 'better-auth.session_token=forged.not-a-real-session';

export type ActionResult = {
  status: number;
  ok: boolean; // the action returned normally (no thrown error, no redirect)
  error: string | null; // digest of a thrown error, if any
  redirect: string | null; // x-action-redirect / Location
  value: unknown;
  raw: string;
};

/** Fill a page pattern like /workshop/job-cards/[id] with a placeholder. */
export const concretePath = (p: string) => p.replace(/\[\.\.\.[^\]]+\]/g, 'x').replace(/\[[^\]]+\]/g, 'x');

/** React's encodeReply for plain JSON args: strings starting with "$" are escaped. */
function encodeArg(v: unknown): unknown {
  if (typeof v === 'string') return v.startsWith('$') ? `$${v}` : v;
  if (v instanceof Date) return `$D${v.toISOString()}`;
  if (v === undefined) return '$undefined';
  if (Array.isArray(v)) return v.map(encodeArg);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeArg(x)]));
  return v;
}

export function parseFlight(raw: string): { value: unknown; error: string | null } {
  const lines = raw.split('\n').filter(Boolean);
  const row = (n: string) => lines.find((l) => l.startsWith(`${n}:`))?.slice(n.length + 1);
  const head = row('0');
  let a: unknown;
  try { a = head ? (JSON.parse(head) as { a?: unknown }).a : undefined; } catch { a = undefined; }
  if (typeof a === 'string' && a.startsWith('$@')) {
    const body = row(a.slice(2)) ?? '';
    if (body.startsWith('E')) {
      try { return { value: null, error: String((JSON.parse(body.slice(1)) as { digest?: string }).digest ?? 'error') }; } catch { return { value: null, error: 'error' }; }
    }
    try { return { value: JSON.parse(body), error: null }; } catch { return { value: body, error: null }; }
  }
  if (a === '$undefined') return { value: undefined, error: null };
  return { value: a, error: null };
}

export async function action(name: string, args: unknown[], opts: { cookie?: string; path?: string; formData?: Record<string, string> } = {}): Promise<ActionResult> {
  const a = actionId(name);
  return actionById(a.id, args, { ...opts, path: opts.path ?? concretePath(a.page ?? '/dashboard') });
}

export async function actionById(id: string, args: unknown[], opts: { cookie?: string; path: string; formData?: Record<string, string> }): Promise<ActionResult> {
  const headers: Record<string, string> = { 'Next-Action': id, origin: BASE, accept: 'text/x-component' };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | FormData;
  if (opts.formData) {
    // React 19 encodeReply of [FormData]: the FormData's fields as "_1_<name>", the args row at "0" = ["$K1"].
    const fd = new FormData();
    for (const [k, v] of Object.entries(opts.formData)) fd.append(`_1_${k}`, v);
    fd.append('0', JSON.stringify(['$K1']));
    body = fd;
  } else {
    headers['content-type'] = 'text/plain;charset=UTF-8';
    body = JSON.stringify(args.map(encodeArg));
  }
  // The per-address flood limit is tested separately (access-control AC-RATE); here every
  // call gets its own client address, and a 429 for this session is waited out and retried
  // — never silently counted as "refused".
  if (!headers['x-forwarded-for']) headers['x-forwarded-for'] = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  let r = await fetch(`${BASE}${opts.path}`, { method: 'POST', headers, body, redirect: 'manual' });
  for (let i = 0; r.status === 429 && i < 40; i += 1) {
    await new Promise((x) => setTimeout(x, 2000));
    r = await fetch(`${BASE}${opts.path}`, { method: 'POST', headers, body, redirect: 'manual' });
  }
  const raw = await r.text();
  const redirect = r.headers.get('x-action-redirect') ?? r.headers.get('location');
  const isFlight = (r.headers.get('content-type') ?? '').includes('text/x-component');
  const parsed = isFlight ? parseFlight(raw) : { value: null, error: r.ok ? null : `http-${r.status}` };
  return { status: r.status, ok: r.ok && isFlight && !parsed.error && !redirect, error: parsed.error, redirect, value: parsed.value, raw };
}

let pool: Pool | null = null;
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, max: 4 });
  return (await pool.query(text, params)).rows as T[];
}
export async function closeDb() { await pool?.end(); }

// ── Reporting ───────────────────────────────────────────────────────────
export type Check = { id: string; title: string; pass: boolean; detail: string; severity?: 'error' | 'warning' };
const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
const escTitle = (s: string) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

/** One annotation per check group (GitHub keeps only ~10 per type per step,
 * so details are packed into the message), a table in the job summary. */
export function report(group: string, checks: Check[]): number {
  const failed = checks.filter((c) => !c.pass);
  const lines = checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'} ${c.id} ${c.title} — ${c.detail}`);
  const msg = `${checks.length - failed.length}/${checks.length} passed%0A${lines.map(esc).join('%0A')}`;
  console.log(`::${failed.some((c) => c.severity !== 'warning') ? 'error' : failed.length ? 'warning' : 'notice'} title=${escTitle(group)}::${msg}`);
  for (const l of lines) console.log(l);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`### ${group}`, '', '| Result | Check | Detail |', '|---|---|---|', ...checks.map((c) => `| ${c.pass ? '✅' : c.severity === 'warning' ? '⚠️' : '❌'} | ${c.id} ${c.title} | ${c.detail.replace(/\|/g, '\\|').slice(0, 400)} |`), ''].join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }
  return failed.filter((c) => c.severity !== 'warning').length;
}

/** Server-side reason for a refused call: the portal logs every thrown error as
 * one JSON line with `ref` = the digest the client received (instrumentation.ts). */
export function digestMessages(log = process.env.PORTAL_LOG ?? 'portal.log'): Map<string, string> {
  const m = new Map<string, string>();
  let text = '';
  try { text = readFileSync(log, 'utf8'); } catch { return m; }
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    try { const j = JSON.parse(line) as { ref?: string; message?: string }; if (j.ref) m.set(String(j.ref), String(j.message ?? '').split('\n')[0]!.slice(0, 120)); } catch { /* not JSON */ }
  }
  return m;
}

/** "Nothing": null, '', false, 0, [], {}, React's "$undefined", or an object of only those. */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '' || v === false || v === 0 || v === '$undefined') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as object).every(isEmptyValue);
  return false;
}

/** Never print personal data in CI output: mask emails and long values. */
export const redact = (s: string) => s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (e) => `${e[0]}***@${e.split('@')[1]}`);
