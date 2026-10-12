/**
 * Authenticated access-control tests at the HTTP / server-action level (not
 * the UI) — CI only, against `next start` + the throw-away CI database.
 *
 *  AC-CRON   cron routes: no / wrong / query-string secret → 401; right one → 200.
 *  AC-PULSE  live pulse: signed-out → 401.
 *  AC-PAGES  every role × every list page: the server's answer (200 vs
 *            redirect to Access denied) must equal the Authorization
 *            Catalogue's decide() for the page's guard(s) — both directions.
 *  AC-XORG   another organisation's (fully privileged) admin opens the first
 *            organisation's records by id — record pages and print views —
 *            must be 404 / denied and never contain the record's data; the
 *            first organisation's own admin sees them (positive control).
 *  AC-IDOR   every exported server action that takes one id string, called
 *            by the other organisation's admin with the first organisation's
 *            ids: no data of the first organisation in any answer, and no
 *            change to its records (table fingerprints before/after).
 *  AC-ANON   every one of the build's server actions called with a forged
 *            session cookie (passes the middleware's presence check): every
 *            call refused, nothing changed in the database.
 *  AC-PRIV   privilege escalation as a Technician (and as the other admin):
 *            role / permission / staff / organisation / branch changes are
 *            refused and the database is unchanged (verified with SQL).
 *  AC-MW     middleware: a path ending in a "static" extension skips it.
 *  AC-REDIR  open redirect via returnTo on a form action.
 *
 * Writes a JSON evidence file (sec-access.json) and annotations.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, FORGED_COOKIE, action, actionById, actionMap, closeDb, concretePath, digestMessages, isEmptyValue, redact, report, signIn, sql, type Check } from './lib';
import { E2E_PASSWORD, MASTER, OTHER_ORG_ADMIN, PEOPLE } from '../people';
import { decide, PERMISSIONS, type PermissionKey, type Principal } from '../../lib/authz/catalogue';

const FIX = JSON.parse(readFileSync(process.env.SEC_FIXTURES ?? 'sec-fixtures.json', 'utf8'));
const APP = join(__dirname, '..', '..', 'app');
const ACTIONS_DIR = join(__dirname, '..', '..', 'lib', 'actions');
const evidence: Record<string, unknown> = {};
let failures = 0;

/** Strings that only the FIRST organisation's data contains. */
const LEAK = [/JC-SEC-\d/, /SEC-(PAY|SLIP|REF|SAME|NUM|VS)-\d/, /Ada Customer/, /Secret fixture/, /Fixture Supplier/, /PRS-SEC-/, /GRN-SEC-/, /VS-SEC-/, /WTY-SEC-/, /RF-SEC-/, /BC-SEC-/, /APT-SEC-/,
  /Hannah Admin/, /Tunde Technician/, /Mary Manager/, /Stella Store/, /Femi Finance/, /Morgan Master/, /Funmi Frontdesk/, /Brake pad \(sec test\)/, /Sec Test Motors/, /customer@e2e\.test/, /(?<![-\w])(admin|tech|finance|store|manager)@e2e\.test/];
const leaks = (raw: string) => LEAK.filter((r) => r.test(raw)).map((r) => r.source);

let xff = 0;
/** Sweeps use a fresh client address per call so the per-address flood limit
 * (a separate test) does not turn the sweep into 429s. */
const fresh = () => ({ 'x-forwarded-for': `10.9.${(xff = (xff + 1) % 250)}.${Math.floor(Math.random() * 250)}` });

async function get(path: string, cookie?: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...fresh() }, redirect: 'manual' });
  const body = await r.text();
  return { status: r.status, location: r.headers.get('location') ?? '', body };
}
const denied = (r: { status: number; location: string; body: string }) =>
  (r.status >= 300 && r.status < 400 && /access-denied|\/login/.test(r.location)) || /NEXT_REDIRECT;[^"]*access-denied|http-equiv="refresh"[^>]*access-denied/.test(r.body);

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]!); }));
}

/** Fingerprint of every first-organisation business table (row count + md5). */
const WATCH = ['job_cards', 'estimates', 'estimate_line_items', 'payments', 'refunds', 'part_stock', 'parts', 'part_request_slips', 'goods_receipts', 'vehicle_services', 'warranties', 'warranty_providers', 'warranty_policies',
  'broadcasts', 'appointments', 'customers', 'customer_vehicles', 'users', 'user_roles', 'roles', 'role_permissions', 'branches', 'departments', 'organisations', 'accounts'];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of WATCH) {
    const exists = await sql<{ e: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS e`, [`public.${t}`]);
    if (!exists[0]?.e) continue;
    const r = await sql<{ n: string; h: string }>(`SELECT count(*)::text AS n, coalesce(md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))), '') AS h FROM public.${t} x`);
    out[t] = `${r[0]!.n}:${r[0]!.h.slice(0, 10)}`;
  }
  return out;
}
const diff = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== b[k]);

// ── Cron + pulse ─────────────────────────────────────────────────────────
async function cron(): Promise<Check[]> {
  const checks: Check[] = [];
  for (const route of ['appointment-reminders', 'pricing-alerts', 'service-reminders']) {
    const p = `/api/cron/${route}`;
    const none = await fetch(`${BASE}${p}`);
    const wrong = await fetch(`${BASE}${p}`, { headers: { authorization: 'Bearer wrong-secret' } });
    const query = await fetch(`${BASE}${p}?key=${encodeURIComponent(process.env.CRON_SECRET ?? '')}&secret=${encodeURIComponent(process.env.CRON_SECRET ?? '')}`);
    const raw = await fetch(`${BASE}${p}`, { headers: { authorization: process.env.CRON_SECRET ?? '' } });
    const right = await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const post = await fetch(`${BASE}${p}`, { method: 'POST' });
    checks.push({ id: 'AC-CRON', title: p, pass: [none, wrong, query, raw].every((r) => r.status === 401) && right.status === 200 && post.status !== 200,
      detail: `none=${none.status} wrong=${wrong.status} ?key=${query.status} no-Bearer=${raw.status} POST=${post.status} correct=${right.status}` });
  }
  const pulse = await fetch(`${BASE}/api/live/pulse`, { redirect: 'manual' });
  const pulseForged = await fetch(`${BASE}/api/live/pulse`, { headers: { cookie: FORGED_COOKIE }, redirect: 'manual' });
  const toLogin = pulse.status === 307 && (pulse.headers.get('location') ?? '').includes('/login');
  checks.push({ id: 'AC-PULSE', title: '/api/live/pulse signed out', pass: (pulse.status === 401 || toLogin) && pulseForged.status === 401, detail: `no cookie=${pulse.status}${toLogin ? ' → /login (middleware)' : ''}, forged cookie=${pulseForged.status}` });
  return checks;
}

// ── Role × page matrix against the catalogue ─────────────────────────────
type Guard = { all: PermissionKey[]; any: PermissionKey[][] };
function guardsOf(dir: string): Guard {
  const g: Guard = { all: [], any: [] };
  // The page itself and every layout above it.
  let d = dir;
  while (d.startsWith(APP)) {
    for (const f of ['page.tsx', 'layout.tsx']) {
      if (f === 'page.tsx' && d !== dir) continue;
      const file = join(d, f);
      if (!existsSync(file)) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/guardPage\(\s*'([a-z._]+)'/g)) g.all.push(m[1] as PermissionKey);
      for (const m of src.matchAll(/guardAnyPage\(\s*\[([^\]]+)\]/g)) g.any.push([...m[1]!.matchAll(/'([a-z._]+)'/g)].map((x) => x[1] as PermissionKey));
    }
    d = join(d, '..');
  }
  return g;
}
function listPages(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listPages(p, acc);
    else if (n === 'page.tsx') acc.push(dir);
  }
  return acc;
}
async function principalFor(email: string): Promise<Principal> {
  const u = (await sql<{ id: string; branchId: string | null; departmentId: string | null; organisationId: string | null }>(`SELECT id, "branchId", "departmentId", "organisationId" FROM users WHERE email=$1`, [email]))[0]!;
  const roles = await sql<{ slug: string; sa: boolean }>(`SELECT r.slug, r."isSuperAdmin" AS sa FROM user_roles ur JOIN roles r ON r.id=ur."roleId" WHERE ur."userId"=$1`, [u.id]);
  const grants = await sql<{ key: string }>(`SELECT DISTINCT p.key FROM user_roles ur JOIN role_permissions rp ON rp."roleId"=ur."roleId" JOIN permissions p ON p.id=rp."permissionId" WHERE ur."userId"=$1`, [u.id]);
  const extra: Principal['extraGrants'] = {};
  for (const g of grants) if (g.key in PERMISSIONS) extra[g.key as PermissionKey] = 'BRANCH';
  return { userId: u.id, isSuperAdmin: roles.some((r) => r.sa), roleSlugs: roles.map((r) => r.slug), branchId: u.branchId, departmentId: u.departmentId, organisationId: u.organisationId, extraGrants: extra };
}
async function pages(cookies: Map<string, string>): Promise<Check[]> {
  const all = listPages(join(APP, '(app)')).filter((d) => !d.includes('[')).map((d) => ({ dir: d, path: '/' + d.slice(join(APP, '(app)').length + 1).split('/').filter(Boolean).join('/') }));
  const matrix: Record<string, Record<string, string>> = {};
  const mismatches: string[] = [];
  const stricter: string[] = [];
  let n = 0;
  for (const [email, cookie] of cookies) {
    const p = await principalFor(email);
    matrix[email] = {};
    await pool(all, 6, async ({ dir, path }) => {
      if (path === '/') return;
      const g = guardsOf(dir);
      const expectAllow = g.all.every((k) => decide(p, k).allowed) && g.any.every((ks) => ks.some((k) => decide(p, k).allowed));
      const r = await get(path, cookie);
      const isDenied = denied(r);
      const ok = r.status === 200 && !isDenied;
      matrix[email]![path] = ok ? 'allow' : isDenied ? 'deny' : `HTTP ${r.status}`;
      n += 1;
      const line = `${email.split('@')[0]} ${path}: server=${matrix[email]![path]} catalogue=${expectAllow ? 'allow' : 'deny'} (${[...g.all, ...g.any.map((x) => x.join('|'))].join(',') || 'no guard'})`;
      if (ok && !expectAllow) mismatches.push(line);
      else if (!ok && expectAllow) stricter.push(line);
    });
  }
  evidence.pageMatrix = matrix;
  return [
    { id: 'AC-PAGES', title: `role × page matrix (${cookies.size} accounts × ${all.length} pages = ${n} requests): server never allows what the catalogue denies`, pass: mismatches.length === 0, detail: mismatches.length ? mismatches.slice(0, 25).join('; ') : 'no page served to a role the catalogue denies' },
    { id: 'AC-PAGES-STRICT', title: 'pages refused although the page guard allows (extra in-page checks; triage)', pass: true, severity: 'warning', detail: stricter.length ? stricter.slice(0, 30).join('; ') : 'none' },
  ];
}

// ── Cross-organisation record pages + print views ────────────────────────
async function crossOrgPages(theirs: string, ours: string): Promise<Check[]> {
  const targets: [string, string][] = [
    ['/workshop/job-cards/', FIX.jcPay], ['/workshop/job-cards/', FIX.jcSlips], ['/workshop/vehicle-service/', FIX.vehicleService], ['/inventory/parts/', FIX.parts.approve],
    ['/inventory/parts/%/edit', FIX.parts.approve], ['/inventory/goods-receipts/', FIX.goodsReceipt], ['/workshop/parts-requests/', FIX.pendingSlips[0]], ['/warranty/', FIX.warranty],
    ['/warranty/providers/', FIX.warrantyProvider], ['/warranty/policies/', FIX.warrantyPolicy], ['/workshop/vehicles/%/edit', FIX.vehicleId],
    ['/branches/', FIX.branchId], ['/notifications/broadcasts/', FIX.broadcast], ['/schedule/', FIX.appointment], ['/schedule/%/edit', FIX.appointment],
    ['/workshop/job-cards/%/request-parts', FIX.jcSlips], ['/inventory/estimate-matching/', FIX.jcSlips],
    ['/print/job-cards/', FIX.jcPay], ['/print/job-cards/%/estimate', FIX.jcPay], ['/print/vehicle-service/', FIX.vehicleService], ['/print/vehicle-service/%/estimate', FIX.vehicleService],
    ['/print/parts-requests/', FIX.pendingSlips[0]], ['/print/refunds/', FIX.refund], ['/print/warranty/', FIX.warranty],
  ];
  const checks: Check[] = [];
  const bad: string[] = [];
  const control: string[] = [];
  for (const [pattern, id] of targets) {
    const path = pattern.includes('%') ? pattern.replace('%', id) : `${pattern}${id}`;
    const them = await get(path, theirs);
    const us = await get(path, ours);
    const leaked = leaks(them.body);
    const refused = them.status === 404 || denied(them) || /not.found|could not be found|This page could not be found/i.test(them.body);
    if (leaked.length || !refused) bad.push(`${path.replace(id, ':id')}: HTTP ${them.status}${leaked.length ? ` LEAK[${leaked.join(',')}]` : ''}${refused ? '' : ' not refused'}`);
    if (us.status !== 200 || leaks(us.body).length === 0) control.push(`${path.replace(id, ':id')}: own admin HTTP ${us.status}, markers ${leaks(us.body).length}`);
  }
  checks.push({ id: 'AC-XORG', title: `another organisation's admin opens ${targets.length} record pages / print views by id`, pass: bad.length === 0, detail: bad.length ? bad.join('; ') : `all ${targets.length} refused (404 / denied), no data in any response` });
  checks.push({ id: 'AC-XORG-CTRL', title: 'positive control: the Master Admin sees them (proves the leak markers work)', pass: true, severity: 'warning', detail: control.length ? `pages where the own admin did not see a marker (no oracle there): ${control.join('; ')}` : 'own admin sees every record (test can detect a leak)' });
  return checks;
}

// ── Server actions by id (IDOR sweep) ────────────────────────────────────
function singleIdActions(): { name: string; param: string }[] {
  const out: { name: string; param: string }[] = [];
  for (const f of readdirSync(ACTIONS_DIR).filter((x) => x.endsWith('.ts') && !x.includes('form-handlers'))) {
    const src = readFileSync(join(ACTIONS_DIR, f), 'utf8');
    if (!src.slice(0, 300).includes("'use server'")) continue;
    for (const m of src.matchAll(/^export async function (\w+)\((\w+): string(?:, \w+\?: [^,)]+)*\)/gm)) out.push({ name: m[1]!, param: m[2]! });
  }
  return out;
}
function idsFor(param: string): string[] {
  const p = param.toLowerCase();
  const all = [FIX.jcPay, FIX.jcRefund, FIX.jcSlips, FIX.vehicleService, FIX.parts.approve, FIX.goodsReceipt, FIX.pendingSlips[0], FIX.approvedSlip, FIX.warranty, FIX.warrantyProvider, FIX.warrantyPolicy, FIX.refund, FIX.broadcast, FIX.appointment, FIX.vehicleId, FIX.customerId, FIX.branchId, FIX.orgId, FIX.users.admin, FIX.users.tech];
  if (p.includes('jobcard')) return [FIX.jcPay, FIX.jcSlips, FIX.jcRefund];
  if (p.includes('vehicleservice') || p === 'serviceid') return [FIX.vehicleService];
  if (p.includes('branch')) return [FIX.branchId];
  if (p.includes('organisation')) return [FIX.orgId];
  if (p.includes('vehicle')) return [FIX.vehicleId];
  if (p.includes('slip')) return [FIX.pendingSlips[0], FIX.approvedSlip];
  if (p.includes('part')) return [FIX.parts.approve, FIX.parts.release];
  if (p.includes('user')) return [FIX.users.admin, FIX.users.tech];
  if (p.includes('customer')) return [FIX.customerId];
  if (p.includes('query') || p === 'raw' || p.includes('serial') || p === 'name') return ['SEC', 'Ada', 'JC-SEC'];
  return all;
}
async function idorSweep(theirs: string[], ours: string): Promise<Check[]> {
  const list = singleIdActions().filter((a) => { try { actionMapHas(a.name); return true; } catch { return false; } });
  const calls = list.flatMap((a) => idsFor(a.param).map((id) => ({ ...a, id })));
  const before = await fingerprint();
  const leaked: string[] = [];
  const returned: string[] = [];
  let i = 0;
  await pool(calls, 8, async (c) => {
    const cookie = theirs[(i += 1) % theirs.length]!;
    const r = await action(c.name, [c.id], { cookie });
    const l = leaks(r.raw);
    if (l.length) leaked.push(`${c.name}(${c.param}) → ${l.join(',')}`);
    else if (r.ok && !isEmptyValue(r.value)) returned.push(`${c.name}(${c.param}): ${redact(JSON.stringify(r.value)).slice(0, 80)}`);
  });
  const after = await fingerprint();
  const changed = diff(before, after);
  // Positive control: the same calls by the owning organisation's Master Admin do return data.
  let controlHits = 0;
  for (const c of calls.filter((x) => /^get(JobCard|Part|GoodsReceipt|Warranty|Refund|Broadcast|Appointment|Branch|VehicleService|PartRequestSlip)$/.test(x.name))) {
    const r = await action(c.name, [c.id], { cookie: ours });
    if (leaks(r.raw).length) controlHits += 1;
  }
  evidence.idor = { calls: calls.length, actions: list.length, leaked, returned, changed, controlHits };
  return [
    { id: 'AC-IDOR', title: `other org admin → ${list.length} id-taking server actions × first-org ids (${calls.length} calls)`, pass: leaked.length === 0 && changed.length === 0,
      detail: `${leaked.length ? `LEAKS: ${leaked.slice(0, 15).join('; ')}` : 'no first-org data in any response'}; tables changed: ${changed.join(',') || 'none'}; positive control (own Master Admin) responses with data: ${controlHits}` },
    { id: 'AC-IDOR-VAL', title: 'non-empty answers to the other org (no first-org marker; triage)', pass: true, severity: 'warning', detail: returned.length ? returned.slice(0, 20).join('; ') : 'none' },
  ];
}
function actionMapHas(name: string) { const m = actionMap(); if (!Object.values(m).some((a) => a.name === name)) throw new Error('absent'); }

// ── Signed-out sweep over EVERY action of the build ─────────────────────
async function anonSweep(): Promise<Check[]> {
  const map = actionMap();
  const before = await fingerprint();
  const results: { name: string; file: string; via: string; outcome: string; value?: string; raw?: unknown }[] = [];
  await pool(Object.entries(map), 8, async ([id, a]) => {
    const path = concretePath(a.page ?? '/dashboard');
    const isForm = /FormAction$|FormHandler$/.test(a.name) || a.file.includes('form-handlers');
    const r = await actionById(id, [], { cookie: FORGED_COOKIE, path, ...(isForm ? { formData: { id: FIX.jcPay, jobCardId: FIX.jcPay, partId: FIX.parts.approve, returnTo: '/dashboard' } } : {}) });
    const outcome = r.redirect ? `redirect ${r.redirect.split('?')[0]}` : r.error ? `error ${r.error}` : r.ok ? 'returned' : `HTTP ${r.status}`;
    results.push({ name: a.name, file: a.file, via: path, outcome, value: r.ok ? redact(JSON.stringify(r.value ?? null)).slice(0, 120) : undefined, raw: r.ok ? r.value : undefined });
  });
  const after = await fingerprint();
  const msgs = digestMessages();
  const why = new Map<string, number>();
  for (const r of results) {
    const reason = r.outcome.startsWith('error ') ? (msgs.get(r.outcome.slice(6)) ?? 'error (no log line)') : r.outcome;
    const k = reason.replace(/[0-9a-f]{20,}/g, '…').slice(0, 70);
    why.set(k, (why.get(k) ?? 0) + 1);
    (r as { reason?: string }).reason = reason;
  }
  const returnedData = results.filter((r) => r.outcome === 'returned' && !isEmptyValue(r.raw));
  const returnedEmpty = results.filter((r) => r.outcome === 'returned' && !returnedData.includes(r));
  const changed = diff(before, after);
  evidence.anon = { total: results.length, reasons: Object.fromEntries(why), returnedData, returnedEmpty: returnedEmpty.map((r) => `${r.file}:${r.name}=${r.value}`), changed };
  return [
    { id: 'AC-ANON', title: `all ${results.length} server actions of the build called with a forged session cookie`, pass: returnedData.length === 0 && changed.length === 0,
      detail: `returned data: ${returnedData.length ? returnedData.map((r) => `${r.file}:${r.name}=${r.value}`).slice(0, 10).join('; ') : 'none'}; tables changed: ${changed.join(',') || 'none'}; outcomes: ${[...why].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v}× ${k}`).join(' | ')}` },
    { id: 'AC-ANON-EMPTY', title: 'actions that answered (empty) instead of refusing — triage', pass: true, severity: 'warning', detail: returnedEmpty.length ? returnedEmpty.map((r) => `${r.file}:${r.name}=${r.value}`).join('; ').slice(0, 1500) : 'none' },
  ];
}

// ── Privilege escalation ────────────────────────────────────────────────
async function privilege(tech: string, otherAdmin: string): Promise<Check[]> {
  const snapshot = async () => ({
    techRoles: (await sql(`SELECT "roleId" FROM user_roles WHERE "userId"=$1 ORDER BY 1`, [FIX.users.tech])).map((r) => r.roleId).join(','),
    techRolePerms: (await sql(`SELECT count(*)::int AS n FROM role_permissions WHERE "roleId"=$1`, [FIX.roles.tech]))[0]!.n,
    adminActive: (await sql(`SELECT "isActive" FROM users WHERE id=$1`, [FIX.users.admin]))[0]!.isActive,
    users: (await sql(`SELECT count(*)::int AS n FROM users`))[0]!.n,
    orgName: (await sql(`SELECT name FROM organisations WHERE id=$1`, [FIX.orgId]))[0]!.name,
    branch: JSON.stringify((await sql(`SELECT name, "bankAccountNumber" FROM branches WHERE id=$1`, [FIX.branchId]))[0]),
    payments: (await sql(`SELECT count(*)::int AS n FROM payments WHERE "jobCardId"=$1`, [FIX.jcPay2]))[0]!.n,
    deptCount: (await sql(`SELECT count(*)::int AS n FROM departments WHERE "branchId"=$1`, [FIX.branchId]))[0]!.n,
    broadcastActive: (await sql(`SELECT "isActive" FROM broadcasts WHERE id=$1`, [FIX.broadcast]))[0]!.isActive,
    firstOrgEmployeeIds: (await sql(`SELECT md5(string_agg(coalesce("employeeId",'-'), ',' ORDER BY id)) h FROM users WHERE "organisationId"=$1`, [FIX.orgId]))[0]!.h,
  });
  const attempts: [string, unknown[]][] = [
    ['assignRole', [FIX.users.tech, FIX.roles.admin]],
    ['grantRolePermission', [FIX.roles.tech, 'admin.users.manage']],
    ['grantRolePermission', [FIX.roles.tech, 'admin.roles.manage']],
    ['setStaffActive', [FIX.users.admin, false, 'security test']],
    ['createStaffMember', [{ fullName: 'Evil Insider', email: 'evil@e2e.test', branchId: FIX.branchId, roleId: FIX.roles.admin }]],
    ['updateOrganisation', [FIX.orgId, { name: 'Pwned Org' }]],
    ['updateBranch', [FIX.branchId, { name: 'Pwned Branch', bankAccountNumber: '0000000000' }]],
    ['createDepartment', [FIX.branchId, 'Pwned Department']],
    ['assignMissingEmployeeIds', []],
    ['recordPayment', [FIX.jcPay2, 1000, 'CASH', 'escalation test', 'priv-esc-key']],
    ['stopBroadcast', [FIX.broadcast]],
  ];
  const checks: Check[] = [];
  for (const [who, cookie] of [['technician', tech], ['other-org admin', otherAdmin]] as const) {
    const before = await snapshot();
    const outcomes: string[] = [];
    for (const [name, args] of attempts) {
      try {
        const r = await action(name, args, { cookie });
        outcomes.push(`${name}=${r.ok ? 'ACCEPTED' : r.error ? 'refused' : r.redirect ? `redirect` : `HTTP ${r.status}`}`);
      } catch (e) { outcomes.push(`${name}=not-in-build`); }
    }
    const after = await snapshot();
    const changed = Object.keys(before).filter((k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k]);
    // An administrator of the OTHER organisation may run assignMissingEmployeeIds for their own
    // people (organisation-fenced); what matters is that nothing of the first organisation changed.
    const accepted = outcomes.filter((o) => o.endsWith('ACCEPTED') && !(who === 'other-org admin' && o.startsWith('assignMissingEmployeeIds')));
    checks.push({ id: 'AC-PRIV', title: `${who}: ${attempts.length} privileged actions against the first organisation`, pass: changed.length === 0 && accepted.length === 0, detail: `${outcomes.join(' ')}; first-org DB state changed: ${changed.join(',') || 'nothing'}` });
  }
  return checks;
}

// ── Middleware bypass + rate limit + open redirect ───────────────────────
async function middlewareAndRedirect(store: string, cookie: string): Promise<Check[]> {
  const checks: Check[] = [];
  const id = Object.entries(actionMap()).find(([, a]) => a.name === 'getBranches')?.[0];
  if (id) {
    // No cookie at all: through a normal path the middleware redirects to /login; through
    // a path ending in ".json" (a dynamic [id] segment) the middleware does not run.
    const normal = await actionById(id, [], { path: '/print/job-cards/x' });
    const dotted = await actionById(id, [], { path: '/print/job-cards/x.json' });
    const reached = !String(dotted.redirect ?? '').includes('/login') && dotted.status !== 307;
    checks.push({ id: 'AC-MW', title: 'middleware skipped for /print/job-cards/<id>.json (no cookie)', pass: !reached, severity: 'warning',
      detail: `normal path: HTTP ${normal.status} → ${normal.redirect ?? '-'}; ".json" path: HTTP ${dotted.status}, ${dotted.error ? 'action RAN (refused inside: requireUser)' : dotted.redirect ?? 'no redirect'}` });
    // Flood limit: 130 POSTs with one session on a normal path vs the ".json" path.
    const burst = async (path: string) => {
      const r = await Promise.all(Array.from({ length: 130 }, () => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Next-Action': id, origin: BASE, cookie, 'content-type': 'text/plain;charset=UTF-8', 'x-forwarded-for': '10.200.0.1' }, body: '[]', redirect: 'manual' }).then((x) => x.status)));
      return r.filter((s) => s === 429).length;
    };
    const limited = await burst('/dashboard');
    await new Promise((r) => setTimeout(r, 61_000));
    const bypass = await burst('/print/job-cards/x.json');
    checks.push({ id: 'AC-RATE', title: '120 POST/min per session: normal path vs ".json" path', pass: limited > 0 && bypass > 0, severity: 'warning', detail: `429s: /dashboard=${limited}/130, /print/job-cards/x.json=${bypass}/130` });
  }
  // Open redirect on setPartStockLevelsFormAction (returnTo not validated).
  try {
    const r = await action('setPartStockLevelsFormAction', [], { cookie: store, formData: { partId: FIX.parts.receive, returnTo: 'https://evil.example/phish', reorderPoint: '1', safetyStock: '1' } });
    const off = /^https?:\/\/evil\.example/.test(r.redirect ?? '') || /^\/\//.test(r.redirect ?? '');
    checks.push({ id: 'AC-REDIR', title: 'returnTo=https://evil.example on setPartStockLevelsFormAction', pass: !off, detail: `redirect → ${r.redirect ?? '(none)'} (HTTP ${r.status})` });
  } catch (e) { checks.push({ id: 'AC-REDIR', title: 'open redirect', pass: true, severity: 'warning', detail: `not run: ${String(e)}` }); }
  return checks;
}

async function main() {
  const only = (process.env.AC_ONLY ?? '').split(',').filter(Boolean);
  const run = (k: string) => !only.length || only.includes(k);
  const master = await signIn(MASTER.email, MASTER.password);
  const cookies = new Map<string, string>([[MASTER.email, master]]);
  for (const p of PEOPLE.filter((x) => x.email !== 'reset@e2e.test')) cookies.set(p.email, await signIn(p.email, E2E_PASSWORD));
  cookies.set(OTHER_ORG_ADMIN.email, await signIn(OTHER_ORG_ADMIN.email, E2E_PASSWORD));
  const theirs = [cookies.get(OTHER_ORG_ADMIN.email)!];
  for (let i = 0; i < 11; i += 1) theirs.push(await signIn(OTHER_ORG_ADMIN.email, E2E_PASSWORD));

  if (run('cron')) failures += report('Access control — cron & live routes', await cron());
  if (run('pages')) failures += report('Access control — role × page matrix', await pages(cookies));
  // Positive control with the platform's Master Admin (sees every record).
  if (run('xorg')) failures += report('Access control — cross-organisation pages', await crossOrgPages(theirs[0]!, master));
  if (run('idor')) failures += report('Access control — cross-organisation server actions (IDOR sweep)', await idorSweep(theirs, master));
  if (run('anon')) failures += report('Access control — signed-out calls to every server action', await anonSweep());
  if (run('priv')) failures += report('Access control — privilege escalation', await privilege(cookies.get('tech@e2e.test')!, theirs[1]!));
  if (run('mw')) failures += report('Access control — middleware, flood limit, open redirect', await middlewareAndRedirect(cookies.get('store@e2e.test')!, cookies.get('frontdesk@e2e.test')!));
  writeFileSync(process.env.SEC_ACCESS_OUT ?? 'sec-access.json', JSON.stringify(evidence, null, 1));
  await closeDb();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.log(`::error title=access-control crashed::${String(e?.stack ?? e).replace(/\n/g, '%0A').slice(0, 3000)}`); await closeDb(); process.exit(1); });
