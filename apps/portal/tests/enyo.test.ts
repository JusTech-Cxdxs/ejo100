/**
 * Enyo in the staff portal — checked without a database:
 *  • the how-to guide only shows pages a person can open (same rule as the pages);
 *  • every staff tool is well formed (unique snake_case name, kind read|draft,
 *    a status line, a strict JSON schema) and goes through authorised code;
 *  • the registry offers every tool file;
 *  • drafts pre-fill forms through validated, clipped parameters only;
 *  • the routes and actions keep their safety checks (origin, rate limit,
 *    length cap, readiness, settings audit, assisted-session refusals).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { PAGE_PERMISSIONS, PERMISSIONS, type Principal } from '../lib/authz/catalogue';
import { GUIDE, canOpenGuide, guideScore, searchGuide } from '../lib/enyo/guide';
import { jobCardPrefillHref, parseJobCardPrefill } from '../lib/enyo/prefill';
import { nextStep, paymentPosition } from '../lib/enyo/next-step';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });

// ── The guide ─────────────────────────────────────────────────────────

/** Pages built by other Enyo workstreams (reminders, mail) — not in this tree yet. */
const PAGES_ELSEWHERE = new Set<string>();

test('the guide covers every live module with 40+ well-formed entries', () => {
  assert.ok(GUIDE.length >= 40, `only ${GUIDE.length} entries`);
  const ids = new Set<string>();
  for (const e of GUIDE) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.title.length > 5 && e.title.length <= 80, e.id);
    assert.ok(e.keywords.length >= 3, `${e.id}: keywords`);
    for (const k of e.keywords) assert.equal(k, k.toLowerCase(), `${e.id}: keywords are lower case`);
    assert.ok(e.steps.length >= 1 && e.steps.length <= 6, `${e.id}: 1–6 steps`);
    for (const s of e.steps) assert.ok(s.length > 10 && s.length <= 320, `${e.id}: step length`);
    for (const k of [...e.needs, ...(e.does ?? [])]) assert.ok(k in PERMISSIONS, `${e.id}: unknown permission ${k}`);
    assert.match(e.page, /^\/[a-z0-9/-]*$/, `${e.id}: page path`);
    if (!PAGES_ELSEWHERE.has(e.page)) assert.ok(existsSync(join(ROOT, 'app', '(app)', e.page, 'page.tsx')), `${e.id}: ${e.page} is not a page`);
  }
  for (const area of ['job-card', 'service', 'part', 'goods-receipt', 'warranty', 'crm', 'exit-pass', 'visitor', 'road-test', 'deliveries', 'contractors', 'incidents', 'appointment', 'broadcast', 'approvals', 'recycle-bin', 'users', 'roles', 'structure', 'assist', 'analytics', 'error', 'enyo', 'reminders', 'mail', 'refund']) {
    assert.ok(GUIDE.some((e) => e.id.includes(area)), `no guide entry for ${area}`);
  }
});

test('each guide entry needs what its page needs (the same rule as the page guards)', () => {
  const AREA: Record<string, string> = { workshop: 'workshop.view', inventory: 'store.view', warranty: 'warranty.view' };
  for (const e of GUIDE) {
    const top = e.page.split('/')[1] ?? '';
    const want = PAGE_PERMISSIONS[top] ?? AREA[top];
    if (!want) continue;
    if (e.page === '/inventory/analytics' || e.page === '/inventory/pricing' || e.page === '/inventory/goods-receipts' || e.page === '/warranty/analytics') continue; // stricter than the area: checked below
    assert.ok(e.needs.includes(want as never), `${e.id}: ${e.page} needs ${want}`);
  }
  assert.deepEqual(GUIDE.find((e) => e.id === 'inventory-analytics')!.needs, ['analytics.inventory.view']);
  assert.deepEqual(GUIDE.find((e) => e.id === 'warranty-analytics')!.needs, ['analytics.warranty.view']);
});

test('guide search: a technician gets workshop steps, never pages they cannot open', () => {
  const tech = who(['technician']);
  const pay = searchGuide('how do I record a payment', tech);
  assert.equal(pay.results[0]?.id, 'job-card-payment');
  assert.equal(pay.results[0]?.youCanDoThis, false, 'Finance records payments');
  assert.equal(pay.results[0]?.href, '/workshop/job-cards');

  const profit = searchGuide('business analytics profit report', tech);
  assert.ok(!profit.results.some((r) => r.id === 'business-analytics'), 'no Analytics page for a technician');
  assert.ok(profit.notYours.includes('Read business analytics (sales, profit, cash)'), 'but it is named as someone else\'s');

  const bin = searchGuide('restore something from the recycle bin', tech);
  assert.equal(bin.results.length, 0);
  assert.ok(bin.notYours.length > 0);

  const parts = searchGuide('request parts from the store', tech);
  assert.equal(parts.results[0]?.id, 'job-card-parts');
  assert.equal(parts.results[0]?.youCanDoThis, true);
});

test('guide search: the same question gives each role what is theirs', () => {
  assert.equal(searchGuide('business analytics', who(['finance-officer'])).results[0]?.id, 'business-analytics');
  assert.equal(searchGuide('restore from the recycle bin', who(['administrator'])).results[0]?.id, 'recycle-bin');
  // Everyone requests their own exit pass.
  for (const role of ['technician', 'calendar-user', 'finance-officer', 'security-officer']) {
    assert.equal(searchGuide('request an exit pass', who([role])).results[0]?.id, 'exit-pass', role);
  }
  // A person with no role at all still gets the everyone pages, nothing else.
  const nobody = who([]);
  for (const e of GUIDE) if (canOpenGuide(e, nobody)) assert.ok(e.needs.length === 0 || e.needs.includes('security.exit_pass.request'), `${e.id} shown to someone with no role`);
  assert.equal(guideScore(GUIDE[0]!, 'the a of'), 0, 'filler words match nothing');
});

// ── The tools (read from source: they call the database) ──────────────

const TOOLS_DIR = join(ROOT, 'lib', 'enyo', 'tools');
const toolFiles = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');

type ToolDef = { file: string; name: string; kind: unknown; status: unknown; description: unknown; parameters: unknown; runText: string };

/** Turns a literal object/array/string/number/boolean expression into a value; throws on anything else. */
function literal(node: ts.Expression, file: string): unknown {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression, file);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return `${literal(node.left, file)}${literal(node.right, file)}`;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => literal(e, file));
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) throw new Error(`${file}: tool schemas must be written as plain literals (found ${ts.SyntaxKind[p.kind]})`);
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
      out[key] = literal(p.initializer, file);
    }
    return out;
  }
  throw new Error(`${file}: tool schemas must be written as plain literals (found ${node.getText()})`);
}

function toolsIn(file: string): { tools: ToolDef[]; exportName: string | null; src: string; sf: ts.SourceFile } {
  const src = readFileSync(join(TOOLS_DIR, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const tools: ToolDef[] = [];
  let exportName: string | null = null;
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !/Tools$/.test(d.name.text) || !d.initializer || !ts.isArrayLiteralExpression(d.initializer)) continue;
      exportName = d.name.text;
      for (const el of d.initializer.elements) {
        assert.ok(ts.isObjectLiteralExpression(el), `${file}: each tool is an object literal`);
        const props = new Map<string, ts.Expression>();
        for (const p of (el as ts.ObjectLiteralExpression).properties) {
          if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) props.set(p.name.text, p.initializer);
          if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name)) props.set(p.name.text, p as unknown as ts.Expression);
        }
        const get = (k: string) => (props.has(k) ? literal(props.get(k)!, file) : undefined);
        tools.push({ file, name: String(get('name')), kind: get('kind'), status: get('status'), description: get('description'), parameters: get('parameters'), runText: props.get('run')?.getText(sf) ?? '' });
      }
    }
  }
  return { tools, exportName, src, sf };
}

type Prop = { type?: unknown; description?: unknown; enum?: unknown; items?: unknown; maxLength?: unknown; minLength?: unknown; minimum?: unknown; maximum?: unknown; maxItems?: unknown; format?: unknown };
function checkProp(where: string, p: Prop): void {
  assert.ok(p && typeof p === 'object', `${where}: property is an object`);
  assert.ok(['string', 'number', 'integer', 'boolean', 'array'].includes(String(p.type)), `${where}: type ${String(p.type)}`);
  const allowed = new Set(['type', 'description', 'enum', 'items', 'maxLength', 'minLength', 'minimum', 'maximum', 'maxItems', 'format']);
  for (const k of Object.keys(p)) assert.ok(allowed.has(k), `${where}: unsupported keyword ${k}`);
  if (p.description !== undefined) assert.equal(typeof p.description, 'string', `${where}: description`);
  if (p.type === 'string') {
    if (p.enum !== undefined) assert.ok(Array.isArray(p.enum) && p.enum.length > 0 && p.enum.every((x) => typeof x === 'string'), `${where}: enum of strings`);
    else assert.ok(typeof p.maxLength === 'number' || p.format !== undefined, `${where}: free text needs a maxLength`);
    if (p.format !== undefined) assert.ok(p.format === 'date' || p.format === 'date-time', `${where}: format`);
  }
  if (p.type === 'number' || p.type === 'integer') assert.ok(typeof p.minimum === 'number' && typeof p.maximum === 'number', `${where}: numbers are bounded`);
  if (p.type === 'array') {
    assert.equal(typeof p.maxItems, 'number', `${where}: arrays are bounded`);
    checkProp(`${where}[]`, p.items as Prop);
  }
}

const ALL_TOOLS = toolFiles.flatMap((f) => toolsIn(f).tools);

test('every staff tool is well formed: unique snake_case name, read|draft, a status line, a description', () => {
  assert.ok(ALL_TOOLS.length >= 19, `only ${ALL_TOOLS.length} tools`);
  const names = new Set<string>();
  for (const t of ALL_TOOLS) {
    assert.match(t.name, /^[a-z][a-z0-9]*(_[a-z0-9]+)+$|^[a-z][a-z0-9]+$/, `${t.file}: ${t.name} is snake_case`);
    assert.ok(!names.has(t.name), `duplicate tool name ${t.name}`);
    names.add(t.name);
    assert.ok(t.kind === 'read' || t.kind === 'draft', `${t.name}: kind is read or draft`);
    assert.ok(typeof t.status === 'string' && t.status.length > 3 && t.status.length <= 60, `${t.name}: status line`);
    assert.ok(typeof t.description === 'string' && t.description.length >= 40, `${t.name}: description for the model`);
    assert.ok(t.runText.length > 0, `${t.name}: has a run function`);
  }
  for (const core of ['guide_search', 'my_work', 'daily_brief', 'search_records', 'job_card_details', 'vehicle_service_details', 'customer_profile', 'vehicle_history', 'part_lookup', 'business_summary', 'technician_leaderboard', 'stock_alerts', 'warranty_watch', 'service_due', 'my_schedule', 'my_security', 'remember_fact', 'forget_fact', 'draft_job_card']) {
    assert.ok(names.has(core), `missing tool ${core}`);
  }
});

test('every tool schema is strict JSON Schema the engine can validate', () => {
  for (const t of ALL_TOOLS) {
    const s = t.parameters as { type?: unknown; properties?: Record<string, Prop>; required?: unknown; additionalProperties?: unknown };
    assert.ok(s && typeof s === 'object', `${t.name}: parameters`);
    assert.equal(s.type, 'object', `${t.name}: an object schema`);
    assert.equal(s.additionalProperties, false, `${t.name}: no extra arguments`);
    assert.ok(s.properties && typeof s.properties === 'object', `${t.name}: properties`);
    for (const [k, p] of Object.entries(s.properties!)) checkProp(`${t.name}.${k}`, p);
    if (s.required !== undefined) {
      assert.ok(Array.isArray(s.required), `${t.name}: required is a list`);
      for (const r of s.required as string[]) assert.ok(r in s.properties!, `${t.name}: required ${r} is a property`);
    }
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(s)), `${t.name}: serialisable`);
  }
});

test('draft tools return a draft (drafts never write)', () => {
  for (const t of ALL_TOOLS.filter((x) => x.kind === 'draft')) {
    assert.match(t.runText, /draftResult\(/, `${t.name}: returns draftResult`);
    assert.doesNotMatch(t.runText, /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/, `${t.name}: writes nothing`);
  }
});

/** What counts as going through authorised code. */
const GUARDS = ['allows(', 'authorize(', 'getPrincipal(', 'requireUser(', 'reachWhere(', 'orgWhere(', 'seeJobCard(', 'seeService(', 'seeVehicle(', 'canSeeRecord(', 'branchWithinReach('];

test('every tool goes through authorised code (the module\'s readers or authorize / allows / reach)', () => {
  const missing: string[] = [];
  for (const file of toolFiles) {
    const { tools, src, sf } = toolsIn(file);
    // Functions imported from the server actions are authorised readers.
    const fromActions = new Set<string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      if (!st.moduleSpecifier.text.startsWith('@/lib/actions/')) continue;
      const named = st.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const e of named.elements) if (!e.isTypeOnly) fromActions.add(e.name.text);
    }
    // One level of local helpers (async function waiting() { … }).
    const helpers = new Map<string, string>();
    for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name) helpers.set(st.name.text, st.getText(sf));
    for (const t of tools) {
      const called = [...helpers.entries()].filter(([n]) => t.runText.includes(`${n}(`)).map(([, body]) => body).join('\n');
      const text = `${t.runText}\n${called}`;
      const ok = GUARDS.some((g) => text.includes(g)) || [...fromActions].some((n) => text.includes(`${n}(`));
      if (!ok) missing.push(`${file}: ${t.name}`);
    }
    assert.doesNotMatch(src, /'use server'/, `${file}: tool files are server-only modules, never server actions`);
  }
  assert.deepEqual(missing, [], `Tools that do not go through authorised code:\n${missing.join('\n')}`);
});

test('the registry offers every tool file', () => {
  const index = read('lib/enyo/tools/index.ts');
  for (const file of toolFiles) {
    const { exportName } = toolsIn(file);
    assert.ok(exportName, `${file}: exports <area>Tools`);
    assert.match(index, new RegExp(`import \\{ ${exportName} \\} from '\\./${file.replace(/\.ts$/, '')}'`), `${file}: imported by the registry`);
    assert.match(index, new RegExp(`\\.\\.\\.${exportName},`), `${file}: spread into staffTools()`);
  }
  assert.match(index, /export function staffTools\(\): StaffTool\[\]/);
});

test('money and costs are refused, not hidden, for people without the right', () => {
  const business = read('lib/enyo/tools/business.ts');
  assert.match(business, /name: 'business_summary'[\s\S]{0,1500}if \(!\(await allows\('analytics\.business\.view'\)\)\) return refused\(/);
  assert.match(business, /name: 'technician_leaderboard'[\s\S]{0,1500}allows\('analytics\.business\.view'\), allows\('workshop\.close\.approve'\)[\s\S]{0,200}return refused\(/);
  const store = read('lib/enyo/tools/store.ts');
  assert.match(store, /STORE_COST_PERMISSIONS/);
  assert.match(store, /if \(!costs\) return base;/, 'costs only for people who already see them');
  const records = read('lib/enyo/tools/records.ts');
  assert.match(records, /name: 'customer_profile'[\s\S]{0,800}allows\('crm\.view'\)\)\) return refused\(/);
});

// ── Drafts pre-fill through validated parameters ──────────────────────

test('the Job Card pre-fill link is validated, clipped and never submits', () => {
  const id = 'cabcdefghijklmnopqrstuv1';
  const href = jobCardPrefillHref({ customerId: id, vehicleId: 'cvehicleabcdefghijklmn2', complaints: ['Fan not working', '  AC   not cold <script>  ', '', 'x'.repeat(500)], mileage: 51234 });
  assert.match(href, /^\/workshop\/job-cards\?prefill=1&/);
  assert.match(href, /#open-job-card$/);
  assert.doesNotMatch(href, /submit|auto/i);
  const sp = Object.fromEntries([...new URL(href, 'http://x').searchParams.entries()].filter(([k]) => k !== 'complaint'));
  const parsed = parseJobCardPrefill({ ...sp, complaint: new URL(href, 'http://x').searchParams.getAll('complaint') });
  assert.ok(parsed);
  assert.equal(parsed.customerId, id);
  assert.equal(parsed.mileage, 51234);
  assert.deepEqual(parsed.complaints.slice(0, 2), ['Fan not working', 'AC not cold script']);
  assert.equal(parsed.complaints[2]!.length, 200);
  // Nothing without prefill=1; bad ids, huge mileage and junk dropped; at most 5 complaints.
  assert.equal(parseJobCardPrefill({ customerId: id }), null);
  const bad = parseJobCardPrefill({ prefill: '1', customerId: "x' OR 1=1", vehicleId: '../../etc', mileage: '99999999', complaint: Array.from({ length: 9 }, (_, i) => `c${i}`) });
  assert.ok(bad);
  assert.equal(bad.customerId, undefined);
  assert.equal(bad.vehicleId, undefined);
  assert.equal(bad.mileage, undefined);
  assert.equal(bad.complaints.length, 5);
});

test('the Open Job Card page checks the pre-fill on the server and only fills the form', () => {
  const page = read('app/(app)/workshop/job-cards/page.tsx');
  assert.match(page, /checkJobCardPrefill\(parseJobCardPrefill\(sp\)\)/);
  assert.match(page, /<CustomerVehiclePicker initialCustomer=\{prefill\?\.customer\} initialVehicleId=\{prefill\?\.vehicleId\} \/>/);
  const server = read('lib/enyo/prefill-server.ts');
  assert.match(server, /allows\('workshop\.job_card\.create'\)/);
  assert.match(server, /prisma\.customer\.findFirst\(\{ where: \{ id: p\.customerId, \.\.\.\(await orgWhere\(\)\) \}/);
  assert.match(server, /customerVehicle\.findFirst\(\{ where: \{ id: p\.vehicleId, customerId: customer\.id \}/);
});

// ── Next step and payment position ────────────────────────────────────

test('next step follows the record\'s state', () => {
  const base = { kind: 'JC' as const, status: 'CHECKED_IN', approvalStatus: 'APPROVED', hasTechnician: true, technicianAccepted: 'ACCEPTED', estimateStatus: 'DRAFT', customerNotified: false, total: 100000, paid: 0, depositFraction: 0.7 };
  assert.match(nextStep({ ...base, approvalStatus: 'PENDING' }), /supervisor to approve the Job Card/);
  assert.match(nextStep({ ...base, hasTechnician: false }), /assigns a technician/);
  assert.match(nextStep({ ...base, estimateStatus: 'APPROVED' }), /Manager's final approval/);
  assert.match(nextStep({ ...base, estimateStatus: 'MANAGER_APPROVED' }), /Notify customer/);
  assert.match(nextStep({ ...base, estimateStatus: 'MANAGER_APPROVED', customerNotified: true, status: 'AWAITING_CUSTOMER_APPROVAL', paid: 20000 }), /₦70,000 \(70% of ₦100,000\); ₦20,000 paid/);
  assert.match(nextStep({ ...base, status: 'READY_FOR_COLLECTION', paid: 100000 }), /requests the close/);
  assert.match(nextStep({ ...base, status: 'CANCELLED', paid: 5000 }), /refund/);
  assert.match(nextStep({ ...base, kind: 'SV', status: 'ESCALATED' }), /Job Card/);
  assert.deepEqual(paymentPosition(100000, 70000, 0.7), { label: 'Deposit met, balance pending', balance: 30000 });
  assert.deepEqual(paymentPosition(100000, 100000, 0.7), { label: 'Paid in full', balance: 0 });
  assert.deepEqual(paymentPosition(0, 0, 0.7), { label: 'No priced estimate yet', balance: 0 });
});

// ── Routes, actions and retention keep their checks ───────────────────

test('the chat route checks origin, session, length, readiness and rate before answering', () => {
  const route = read('app/api/enyo/chat/route.ts');
  assert.match(route, /export const runtime = 'nodejs';/);
  assert.match(route, /export const maxDuration = 60;/);
  const order = ['sameOrigin(request)', 'requireUser()', 'MAX_MESSAGE_CHARS', 'enyoReady(organisationId, \'staffAssistant\')', 'overRateLimit(userId)', 'runAgent('];
  let at = -1;
  for (const step of order) {
    const i = route.indexOf(step, at + 1);
    assert.ok(i > at, `${step} comes in order`);
    at = i;
  }
  assert.match(route, /userId, organisationId, channel: 'STAFF', archivedAt: null/, 'only the person\'s own conversation');
  assert.match(route, /signal: request\.signal/, 'stops when the person stops');
  assert.match(route, /role: 'TOOL', toolName: m\.name, content: JSON\.stringify\(\{ ok: outcome\?\.ok/, 'only each tool\'s outcome is stored, never its result (mail and records keep their own retention)');
  assert.match(route, /logError\('enyo\.chat'/, 'failures carry an error reference');
  assert.match(read('lib/enyo/server.ts'), /prisma\.enyoMessage\.count\(\{\s*where: \{ role: 'USER', createdAt: \{ gte: new Date\(Date\.now\(\) - 60_000\) \}/, 'rate limit counted in the database');
  for (const r of ['app/api/enyo/refine/route.ts']) assert.match(read(r), /sameOrigin\(request\)[\s\S]*requireUser\(\)[\s\S]*MAX_MESSAGE_CHARS[\s\S]*enyoReady\(/);
  assert.match(read('app/api/enyo/status/route.ts'), /requireUser\(\)[\s\S]*status: 401/);
});

test('Enyo actions: settings are audited and validated; nothing personal changes during an assisted session', () => {
  const a = read('lib/actions/enyo.ts');
  assert.match(a, /export async function saveEnyoSettings[\s\S]{0,300}authorize\('enyo\.manage'[\s\S]{0,200}refuseDuringAssist\(/);
  assert.match(a, /name\.length > 30/);
  assert.match(a, /const MODES = \['SHADOW', 'SUGGEST', 'OFF'\] as const;/);
  assert.match(a, /action: 'enyo\.settings_changed'/);
  assert.match(a, /export async function testEnyoConnection[\s\S]{0,200}authorize\('enyo\.manage'/);
  assert.match(a, /export async function deleteEnyoConversation[\s\S]{0,200}refuseDuringAssist\(/);
  assert.match(a, /export async function deleteEnyoMemory[\s\S]{0,200}refuseDuringAssist\(/);
  for (const fn of ['listEnyoConversations', 'getEnyoConversation', 'renameEnyoConversation', 'rateEnyoMessage']) {
    assert.match(a, new RegExp(`export async function ${fn}[\\s\\S]{0,900}userId: user\\.id[\\s\\S]{0,200}assistWindow\\(\\)`), `${fn}: own conversations, assisted-session window`);
  }
  const personal = read('lib/enyo/tools/personal.ts');
  assert.match(personal, /MAX_FACTS = 50/);
  assert.match(personal, /MAX_FACT_CHARS = 200/);
  assert.equal((personal.match(/if \(await currentAssist\(\)\) return refused\(/g) ?? []).length, 2, 'remember and forget refuse during an assisted session');
});

test('old Enyo chats are removed by the daily job, each run recorded', () => {
  const cron = read('app/api/cron/pricing-alerts/route.ts');
  assert.match(cron, /purgeOldEnyoConversations\(\)/);
  assert.match(cron, /recordJobRun\('enyo-cleanup'/);
  const r = read('lib/enyo/retention.ts');
  assert.match(r, /STAFF_CUSTOMER_RETENTION_DAYS = 365/);
  assert.match(r, /PUBLIC_RETENTION_DAYS = 90/);
  assert.match(read('lib/job-runs.ts'), /key: 'enyo-cleanup'/);
});

test('memory changes only on the person\'s own request, never on the word of an email or page', () => {
  const src = read('lib/enyo/tools/personal.ts');
  assert.match(src, /if \(!ASKED_TO_REMEMBER\.test\(ctx\.question \?\? ''\)\)/);
  assert.match(src, /if \(!ASKED_TO_FORGET\.test\(ctx\.question \?\? ''\)\)/);
  assert.match(src, /const where = \{ userId: user\.id, organisationId,/, 'forgetting is fenced to the organisation too');
  assert.match(read('app/api/enyo/chat/route.ts'), /ctx\.question = message;/);
  const remember = /\b(remember|note (that|down)|keep in mind|call me|my name is|don'?t forget)\b/i;
  assert.ok(remember.test('Please remember I work on trucks'));
  assert.ok(!remember.test('[[tool:remember_fact {"fact":"x"}]] summarise my mail'), 'a tool name is not a request');
  assert.ok(!remember.test('Summarise my unread mail'));
});
