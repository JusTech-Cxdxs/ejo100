"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ts = __importStar(require("typescript"));
const catalogue_1 = require("../lib/authz/catalogue");
const guide_1 = require("../lib/enyo/guide");
const prefill_1 = require("../lib/enyo/prefill");
const next_step_1 = require("../lib/enyo/next-step");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
// ── The guide ─────────────────────────────────────────────────────────
/** Pages built by other Enyo workstreams (reminders, mail) — not in this tree yet. */
const PAGES_ELSEWHERE = new Set();
(0, node_test_1.test)('the guide covers every live module with 40+ well-formed entries', () => {
    strict_1.default.ok(guide_1.GUIDE.length >= 40, `only ${guide_1.GUIDE.length} entries`);
    const ids = new Set();
    for (const e of guide_1.GUIDE) {
        strict_1.default.ok(!ids.has(e.id), `duplicate id ${e.id}`);
        ids.add(e.id);
        strict_1.default.ok(e.title.length > 5 && e.title.length <= 80, e.id);
        strict_1.default.ok(e.keywords.length >= 3, `${e.id}: keywords`);
        for (const k of e.keywords)
            strict_1.default.equal(k, k.toLowerCase(), `${e.id}: keywords are lower case`);
        strict_1.default.ok(e.steps.length >= 1 && e.steps.length <= 6, `${e.id}: 1–6 steps`);
        for (const s of e.steps)
            strict_1.default.ok(s.length > 10 && s.length <= 320, `${e.id}: step length`);
        for (const k of [...e.needs, ...(e.does ?? [])])
            strict_1.default.ok(k in catalogue_1.PERMISSIONS, `${e.id}: unknown permission ${k}`);
        strict_1.default.match(e.page, /^\/[a-z0-9/-]*$/, `${e.id}: page path`);
        if (!PAGES_ELSEWHERE.has(e.page))
            strict_1.default.ok((0, node_fs_1.existsSync)((0, node_path_1.join)(ROOT, 'app', '(app)', e.page, 'page.tsx')), `${e.id}: ${e.page} is not a page`);
    }
    for (const area of ['job-card', 'service', 'part', 'goods-receipt', 'warranty', 'crm', 'exit-pass', 'visitor', 'road-test', 'deliveries', 'contractors', 'incidents', 'appointment', 'broadcast', 'approvals', 'recycle-bin', 'users', 'roles', 'structure', 'assist', 'analytics', 'error', 'enyo', 'reminders', 'mail', 'refund']) {
        strict_1.default.ok(guide_1.GUIDE.some((e) => e.id.includes(area)), `no guide entry for ${area}`);
    }
});
(0, node_test_1.test)('each guide entry needs what its page needs (the same rule as the page guards)', () => {
    const AREA = { workshop: 'workshop.view', inventory: 'store.view', warranty: 'warranty.view' };
    for (const e of guide_1.GUIDE) {
        const top = e.page.split('/')[1] ?? '';
        const want = catalogue_1.PAGE_PERMISSIONS[top] ?? AREA[top];
        if (!want)
            continue;
        if (e.page === '/inventory/analytics' || e.page === '/inventory/pricing' || e.page === '/inventory/goods-receipts' || e.page === '/warranty/analytics')
            continue; // stricter than the area: checked below
        strict_1.default.ok(e.needs.includes(want), `${e.id}: ${e.page} needs ${want}`);
    }
    strict_1.default.deepEqual(guide_1.GUIDE.find((e) => e.id === 'inventory-analytics').needs, ['analytics.inventory.view']);
    strict_1.default.deepEqual(guide_1.GUIDE.find((e) => e.id === 'warranty-analytics').needs, ['analytics.warranty.view']);
});
(0, node_test_1.test)('guide search: a technician gets workshop steps, never pages they cannot open', () => {
    const tech = who(['technician']);
    const pay = (0, guide_1.searchGuide)('how do I record a payment', tech);
    strict_1.default.equal(pay.results[0]?.id, 'job-card-payment');
    strict_1.default.equal(pay.results[0]?.youCanDoThis, false, 'Finance records payments');
    strict_1.default.equal(pay.results[0]?.href, '/workshop/job-cards');
    const profit = (0, guide_1.searchGuide)('business analytics profit report', tech);
    strict_1.default.ok(!profit.results.some((r) => r.id === 'business-analytics'), 'no Analytics page for a technician');
    strict_1.default.ok(profit.notYours.includes('Read business analytics (sales, profit, cash)'), 'but it is named as someone else\'s');
    const bin = (0, guide_1.searchGuide)('restore something from the recycle bin', tech);
    strict_1.default.equal(bin.results.length, 0);
    strict_1.default.ok(bin.notYours.length > 0);
    const parts = (0, guide_1.searchGuide)('request parts from the store', tech);
    strict_1.default.equal(parts.results[0]?.id, 'job-card-parts');
    strict_1.default.equal(parts.results[0]?.youCanDoThis, true);
});
(0, node_test_1.test)('guide search: the same question gives each role what is theirs', () => {
    strict_1.default.equal((0, guide_1.searchGuide)('business analytics', who(['finance-officer'])).results[0]?.id, 'business-analytics');
    strict_1.default.equal((0, guide_1.searchGuide)('restore from the recycle bin', who(['administrator'])).results[0]?.id, 'recycle-bin');
    // Everyone requests their own exit pass.
    for (const role of ['technician', 'calendar-user', 'finance-officer', 'security-officer']) {
        strict_1.default.equal((0, guide_1.searchGuide)('request an exit pass', who([role])).results[0]?.id, 'exit-pass', role);
    }
    // A person with no role at all still gets the everyone pages, nothing else.
    const nobody = who([]);
    for (const e of guide_1.GUIDE)
        if ((0, guide_1.canOpenGuide)(e, nobody))
            strict_1.default.ok(e.needs.length === 0 || e.needs.includes('security.exit_pass.request'), `${e.id} shown to someone with no role`);
    strict_1.default.equal((0, guide_1.guideScore)(guide_1.GUIDE[0], 'the a of'), 0, 'filler words match nothing');
});
// ── The tools (read from source: they call the database) ──────────────
const TOOLS_DIR = (0, node_path_1.join)(ROOT, 'lib', 'enyo', 'tools');
const toolFiles = (0, node_fs_1.readdirSync)(TOOLS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
/** Turns a literal object/array/string/number/boolean expression into a value; throws on anything else. */
function literal(node, file) {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
        return literal(node.expression, file);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    if (ts.isNumericLiteral(node))
        return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return false;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand))
        return -Number(node.operand.text);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
        return `${literal(node.left, file)}${literal(node.right, file)}`;
    if (ts.isArrayLiteralExpression(node))
        return node.elements.map((e) => literal(e, file));
    if (ts.isObjectLiteralExpression(node)) {
        const out = {};
        for (const p of node.properties) {
            if (!ts.isPropertyAssignment(p))
                throw new Error(`${file}: tool schemas must be written as plain literals (found ${ts.SyntaxKind[p.kind]})`);
            const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
            out[key] = literal(p.initializer, file);
        }
        return out;
    }
    throw new Error(`${file}: tool schemas must be written as plain literals (found ${node.getText()})`);
}
function toolsIn(file) {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(TOOLS_DIR, file), 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const tools = [];
    let exportName = null;
    for (const st of sf.statements) {
        if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
            continue;
        for (const d of st.declarationList.declarations) {
            if (!ts.isIdentifier(d.name) || !/Tools$/.test(d.name.text) || !d.initializer || !ts.isArrayLiteralExpression(d.initializer))
                continue;
            exportName = d.name.text;
            for (const el of d.initializer.elements) {
                strict_1.default.ok(ts.isObjectLiteralExpression(el), `${file}: each tool is an object literal`);
                const props = new Map();
                for (const p of el.properties) {
                    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
                        props.set(p.name.text, p.initializer);
                    if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name))
                        props.set(p.name.text, p);
                }
                const get = (k) => (props.has(k) ? literal(props.get(k), file) : undefined);
                tools.push({ file, name: String(get('name')), kind: get('kind'), status: get('status'), description: get('description'), parameters: get('parameters'), runText: props.get('run')?.getText(sf) ?? '' });
            }
        }
    }
    return { tools, exportName, src, sf };
}
function checkProp(where, p) {
    strict_1.default.ok(p && typeof p === 'object', `${where}: property is an object`);
    strict_1.default.ok(['string', 'number', 'integer', 'boolean', 'array'].includes(String(p.type)), `${where}: type ${String(p.type)}`);
    const allowed = new Set(['type', 'description', 'enum', 'items', 'maxLength', 'minLength', 'minimum', 'maximum', 'maxItems', 'format']);
    for (const k of Object.keys(p))
        strict_1.default.ok(allowed.has(k), `${where}: unsupported keyword ${k}`);
    if (p.description !== undefined)
        strict_1.default.equal(typeof p.description, 'string', `${where}: description`);
    if (p.type === 'string') {
        if (p.enum !== undefined)
            strict_1.default.ok(Array.isArray(p.enum) && p.enum.length > 0 && p.enum.every((x) => typeof x === 'string'), `${where}: enum of strings`);
        else
            strict_1.default.ok(typeof p.maxLength === 'number' || p.format !== undefined, `${where}: free text needs a maxLength`);
        if (p.format !== undefined)
            strict_1.default.ok(p.format === 'date' || p.format === 'date-time', `${where}: format`);
    }
    if (p.type === 'number' || p.type === 'integer')
        strict_1.default.ok(typeof p.minimum === 'number' && typeof p.maximum === 'number', `${where}: numbers are bounded`);
    if (p.type === 'array') {
        strict_1.default.equal(typeof p.maxItems, 'number', `${where}: arrays are bounded`);
        checkProp(`${where}[]`, p.items);
    }
}
const ALL_TOOLS = toolFiles.flatMap((f) => toolsIn(f).tools);
(0, node_test_1.test)('every staff tool is well formed: unique snake_case name, read|draft, a status line, a description', () => {
    strict_1.default.ok(ALL_TOOLS.length >= 19, `only ${ALL_TOOLS.length} tools`);
    const names = new Set();
    for (const t of ALL_TOOLS) {
        strict_1.default.match(t.name, /^[a-z][a-z0-9]*(_[a-z0-9]+)+$|^[a-z][a-z0-9]+$/, `${t.file}: ${t.name} is snake_case`);
        strict_1.default.ok(!names.has(t.name), `duplicate tool name ${t.name}`);
        names.add(t.name);
        strict_1.default.ok(t.kind === 'read' || t.kind === 'draft', `${t.name}: kind is read or draft`);
        strict_1.default.ok(typeof t.status === 'string' && t.status.length > 3 && t.status.length <= 60, `${t.name}: status line`);
        strict_1.default.ok(typeof t.description === 'string' && t.description.length >= 40, `${t.name}: description for the model`);
        strict_1.default.ok(t.runText.length > 0, `${t.name}: has a run function`);
    }
    for (const core of ['guide_search', 'my_work', 'daily_brief', 'search_records', 'job_card_details', 'vehicle_service_details', 'customer_profile', 'vehicle_history', 'part_lookup', 'business_summary', 'technician_leaderboard', 'stock_alerts', 'warranty_watch', 'service_due', 'my_schedule', 'my_security', 'remember_fact', 'forget_fact', 'draft_job_card']) {
        strict_1.default.ok(names.has(core), `missing tool ${core}`);
    }
});
(0, node_test_1.test)('every tool schema is strict JSON Schema the engine can validate', () => {
    for (const t of ALL_TOOLS) {
        const s = t.parameters;
        strict_1.default.ok(s && typeof s === 'object', `${t.name}: parameters`);
        strict_1.default.equal(s.type, 'object', `${t.name}: an object schema`);
        strict_1.default.equal(s.additionalProperties, false, `${t.name}: no extra arguments`);
        strict_1.default.ok(s.properties && typeof s.properties === 'object', `${t.name}: properties`);
        for (const [k, p] of Object.entries(s.properties))
            checkProp(`${t.name}.${k}`, p);
        if (s.required !== undefined) {
            strict_1.default.ok(Array.isArray(s.required), `${t.name}: required is a list`);
            for (const r of s.required)
                strict_1.default.ok(r in s.properties, `${t.name}: required ${r} is a property`);
        }
        strict_1.default.doesNotThrow(() => JSON.parse(JSON.stringify(s)), `${t.name}: serialisable`);
    }
});
(0, node_test_1.test)('draft tools return a draft (drafts never write)', () => {
    for (const t of ALL_TOOLS.filter((x) => x.kind === 'draft')) {
        strict_1.default.match(t.runText, /draftResult\(/, `${t.name}: returns draftResult`);
        strict_1.default.doesNotMatch(t.runText, /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/, `${t.name}: writes nothing`);
    }
});
/** What counts as going through authorised code. */
const GUARDS = ['allows(', 'authorize(', 'getPrincipal(', 'requireUser(', 'reachWhere(', 'orgWhere(', 'seeJobCard(', 'seeService(', 'seeVehicle(', 'canSeeRecord(', 'branchWithinReach('];
(0, node_test_1.test)('every tool goes through authorised code (the module\'s readers or authorize / allows / reach)', () => {
    const missing = [];
    for (const file of toolFiles) {
        const { tools, src, sf } = toolsIn(file);
        // Functions imported from the server actions are authorised readers.
        const fromActions = new Set();
        for (const st of sf.statements) {
            if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier))
                continue;
            if (!st.moduleSpecifier.text.startsWith('@/lib/actions/'))
                continue;
            const named = st.importClause?.namedBindings;
            if (named && ts.isNamedImports(named))
                for (const e of named.elements)
                    if (!e.isTypeOnly)
                        fromActions.add(e.name.text);
        }
        // One level of local helpers (async function waiting() { … }).
        const helpers = new Map();
        for (const st of sf.statements)
            if (ts.isFunctionDeclaration(st) && st.name)
                helpers.set(st.name.text, st.getText(sf));
        for (const t of tools) {
            const called = [...helpers.entries()].filter(([n]) => t.runText.includes(`${n}(`)).map(([, body]) => body).join('\n');
            const text = `${t.runText}\n${called}`;
            const ok = GUARDS.some((g) => text.includes(g)) || [...fromActions].some((n) => text.includes(`${n}(`));
            if (!ok)
                missing.push(`${file}: ${t.name}`);
        }
        strict_1.default.doesNotMatch(src, /'use server'/, `${file}: tool files are server-only modules, never server actions`);
    }
    strict_1.default.deepEqual(missing, [], `Tools that do not go through authorised code:\n${missing.join('\n')}`);
});
(0, node_test_1.test)('the registry offers every tool file', () => {
    const index = read('lib/enyo/tools/index.ts');
    for (const file of toolFiles) {
        const { exportName } = toolsIn(file);
        strict_1.default.ok(exportName, `${file}: exports <area>Tools`);
        strict_1.default.match(index, new RegExp(`import \\{ ${exportName} \\} from '\\./${file.replace(/\.ts$/, '')}'`), `${file}: imported by the registry`);
        strict_1.default.match(index, new RegExp(`\\.\\.\\.${exportName},`), `${file}: spread into staffTools()`);
    }
    strict_1.default.match(index, /export function staffTools\(\): StaffTool\[\]/);
});
(0, node_test_1.test)('money and costs are refused, not hidden, for people without the right', () => {
    const business = read('lib/enyo/tools/business.ts');
    strict_1.default.match(business, /name: 'business_summary'[\s\S]{0,1500}if \(!\(await allows\('analytics\.business\.view'\)\)\) return refused\(/);
    strict_1.default.match(business, /name: 'technician_leaderboard'[\s\S]{0,1500}allows\('analytics\.business\.view'\), allows\('workshop\.close\.approve'\)[\s\S]{0,200}return refused\(/);
    const store = read('lib/enyo/tools/store.ts');
    strict_1.default.match(store, /STORE_COST_PERMISSIONS/);
    strict_1.default.match(store, /if \(!costs\) return base;/, 'costs only for people who already see them');
    const records = read('lib/enyo/tools/records.ts');
    strict_1.default.match(records, /name: 'customer_profile'[\s\S]{0,800}allows\('crm\.view'\)\)\) return refused\(/);
});
// ── Drafts pre-fill through validated parameters ──────────────────────
(0, node_test_1.test)('the Job Card pre-fill link is validated, clipped and never submits', () => {
    const id = 'cabcdefghijklmnopqrstuv1';
    const href = (0, prefill_1.jobCardPrefillHref)({ customerId: id, vehicleId: 'cvehicleabcdefghijklmn2', complaints: ['Fan not working', '  AC   not cold <script>  ', '', 'x'.repeat(500)], mileage: 51234 });
    strict_1.default.match(href, /^\/workshop\/job-cards\?prefill=1&/);
    strict_1.default.match(href, /#open-job-card$/);
    strict_1.default.doesNotMatch(href, /submit|auto/i);
    const sp = Object.fromEntries([...new URL(href, 'http://x').searchParams.entries()].filter(([k]) => k !== 'complaint'));
    const parsed = (0, prefill_1.parseJobCardPrefill)({ ...sp, complaint: new URL(href, 'http://x').searchParams.getAll('complaint') });
    strict_1.default.ok(parsed);
    strict_1.default.equal(parsed.customerId, id);
    strict_1.default.equal(parsed.mileage, 51234);
    strict_1.default.deepEqual(parsed.complaints.slice(0, 2), ['Fan not working', 'AC not cold script']);
    strict_1.default.equal(parsed.complaints[2].length, 200);
    // Nothing without prefill=1; bad ids, huge mileage and junk dropped; at most 5 complaints.
    strict_1.default.equal((0, prefill_1.parseJobCardPrefill)({ customerId: id }), null);
    const bad = (0, prefill_1.parseJobCardPrefill)({ prefill: '1', customerId: "x' OR 1=1", vehicleId: '../../etc', mileage: '99999999', complaint: Array.from({ length: 9 }, (_, i) => `c${i}`) });
    strict_1.default.ok(bad);
    strict_1.default.equal(bad.customerId, undefined);
    strict_1.default.equal(bad.vehicleId, undefined);
    strict_1.default.equal(bad.mileage, undefined);
    strict_1.default.equal(bad.complaints.length, 5);
});
(0, node_test_1.test)('the Open Job Card page checks the pre-fill on the server and only fills the form', () => {
    const page = read('app/(app)/workshop/job-cards/page.tsx');
    strict_1.default.match(page, /checkJobCardPrefill\(parseJobCardPrefill\(sp\)\)/);
    strict_1.default.match(page, /<CustomerVehiclePicker initialCustomer=\{prefill\?\.customer\} initialVehicleId=\{prefill\?\.vehicleId\} \/>/);
    const server = read('lib/enyo/prefill-server.ts');
    strict_1.default.match(server, /allows\('workshop\.job_card\.create'\)/);
    strict_1.default.match(server, /prisma\.customer\.findFirst\(\{ where: \{ id: p\.customerId, \.\.\.\(await orgWhere\(\)\) \}/);
    strict_1.default.match(server, /customerVehicle\.findFirst\(\{ where: \{ id: p\.vehicleId, customerId: customer\.id \}/);
});
// ── Next step and payment position ────────────────────────────────────
(0, node_test_1.test)('next step follows the record\'s state', () => {
    const base = { kind: 'JC', status: 'CHECKED_IN', approvalStatus: 'APPROVED', hasTechnician: true, technicianAccepted: 'ACCEPTED', estimateStatus: 'DRAFT', customerNotified: false, total: 100000, paid: 0, depositFraction: 0.7 };
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, approvalStatus: 'PENDING' }), /supervisor to approve the Job Card/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, hasTechnician: false }), /assigns a technician/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, estimateStatus: 'APPROVED' }), /Manager's final approval/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, estimateStatus: 'MANAGER_APPROVED' }), /Notify customer/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, estimateStatus: 'MANAGER_APPROVED', customerNotified: true, status: 'AWAITING_CUSTOMER_APPROVAL', paid: 20000 }), /₦70,000 \(70% of ₦100,000\); ₦20,000 paid/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, status: 'READY_FOR_COLLECTION', paid: 100000 }), /requests the close/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, status: 'CANCELLED', paid: 5000 }), /refund/);
    strict_1.default.match((0, next_step_1.nextStep)({ ...base, kind: 'SV', status: 'ESCALATED' }), /Job Card/);
    strict_1.default.deepEqual((0, next_step_1.paymentPosition)(100000, 70000, 0.7), { label: 'Deposit met, balance pending', balance: 30000 });
    strict_1.default.deepEqual((0, next_step_1.paymentPosition)(100000, 100000, 0.7), { label: 'Paid in full', balance: 0 });
    strict_1.default.deepEqual((0, next_step_1.paymentPosition)(0, 0, 0.7), { label: 'No priced estimate yet', balance: 0 });
});
// ── Routes, actions and retention keep their checks ───────────────────
(0, node_test_1.test)('the chat route checks origin, session, length, readiness and rate before answering', () => {
    const route = read('app/api/enyo/chat/route.ts');
    strict_1.default.match(route, /export const runtime = 'nodejs';/);
    strict_1.default.match(route, /export const maxDuration = 60;/);
    const order = ['sameOrigin(request)', 'requireUser()', 'MAX_MESSAGE_CHARS', 'enyoReady(organisationId, \'staffAssistant\')', 'overRateLimit(userId)', 'runAgent('];
    let at = -1;
    for (const step of order) {
        const i = route.indexOf(step, at + 1);
        strict_1.default.ok(i > at, `${step} comes in order`);
        at = i;
    }
    strict_1.default.match(route, /userId, organisationId, channel: 'STAFF', archivedAt: null/, 'only the person\'s own conversation');
    strict_1.default.match(route, /signal: request\.signal/, 'stops when the person stops');
    strict_1.default.match(route, /role: 'TOOL', toolName: m\.name, content: JSON\.stringify\(\{ ok: outcome\?\.ok/, 'only each tool\'s outcome is stored, never its result (mail and records keep their own retention)');
    strict_1.default.match(route, /logError\('enyo\.chat'/, 'failures carry an error reference');
    strict_1.default.match(read('lib/enyo/server.ts'), /prisma\.enyoMessage\.count\(\{\s*where: \{ role: 'USER', createdAt: \{ gte: new Date\(Date\.now\(\) - 60_000\) \}/, 'rate limit counted in the database');
    for (const r of ['app/api/enyo/refine/route.ts'])
        strict_1.default.match(read(r), /sameOrigin\(request\)[\s\S]*requireUser\(\)[\s\S]*MAX_MESSAGE_CHARS[\s\S]*enyoReady\(/);
    strict_1.default.match(read('app/api/enyo/status/route.ts'), /requireUser\(\)[\s\S]*status: 401/);
});
(0, node_test_1.test)('Enyo actions: settings are audited and validated; nothing personal changes during an assisted session', () => {
    const a = read('lib/actions/enyo.ts');
    strict_1.default.match(a, /export async function saveEnyoSettings[\s\S]{0,300}authorize\('enyo\.manage'[\s\S]{0,200}refuseDuringAssist\(/);
    strict_1.default.match(a, /name\.length > 30/);
    strict_1.default.match(a, /const MODES = \['SHADOW', 'SUGGEST', 'OFF'\] as const;/);
    strict_1.default.match(a, /action: 'enyo\.settings_changed'/);
    strict_1.default.match(a, /export async function testEnyoConnection[\s\S]{0,200}authorize\('enyo\.manage'/);
    strict_1.default.match(a, /export async function deleteEnyoConversation[\s\S]{0,200}refuseDuringAssist\(/);
    strict_1.default.match(a, /export async function deleteEnyoMemory[\s\S]{0,200}refuseDuringAssist\(/);
    for (const fn of ['listEnyoConversations', 'getEnyoConversation', 'renameEnyoConversation', 'rateEnyoMessage']) {
        strict_1.default.match(a, new RegExp(`export async function ${fn}[\\s\\S]{0,900}userId: user\\.id[\\s\\S]{0,200}assistWindow\\(\\)`), `${fn}: own conversations, assisted-session window`);
    }
    const personal = read('lib/enyo/tools/personal.ts');
    strict_1.default.match(personal, /MAX_FACTS = 50/);
    strict_1.default.match(personal, /MAX_FACT_CHARS = 200/);
    strict_1.default.equal((personal.match(/if \(await currentAssist\(\)\) return refused\(/g) ?? []).length, 3, 'remember, forget and recent activity refuse during an assisted session');
});
(0, node_test_1.test)('old Enyo chats are removed by the daily job, each run recorded', () => {
    const cron = read('app/api/cron/pricing-alerts/route.ts');
    strict_1.default.match(cron, /purgeOldEnyoConversations\(\)/);
    strict_1.default.match(cron, /recordJobRun\('enyo-cleanup'/);
    const r = read('lib/enyo/retention.ts');
    strict_1.default.match(r, /STAFF_CUSTOMER_RETENTION_DAYS = 365/);
    strict_1.default.match(r, /PUBLIC_RETENTION_DAYS = 90/);
    strict_1.default.match(read('lib/job-runs.ts'), /key: 'enyo-cleanup'/);
});
(0, node_test_1.test)('memory changes only on the person\'s own request, never on the word of an email or page', () => {
    const src = read('lib/enyo/tools/personal.ts');
    strict_1.default.match(src, /if \(!ASKED_TO_REMEMBER\.test\(ctx\.question \?\? ''\)\)/);
    strict_1.default.match(src, /if \(!ASKED_TO_FORGET\.test\(ctx\.question \?\? ''\)\)/);
    strict_1.default.match(src, /const where = \{ userId: user\.id, organisationId,/, 'forgetting is fenced to the organisation too');
    strict_1.default.match(read('app/api/enyo/chat/route.ts'), /ctx\.question = message;/);
    const remember = /\b(remember|note (that|down)|keep in mind|call me|my name is|don'?t forget)\b/i;
    strict_1.default.ok(remember.test('Please remember I work on trucks'));
    strict_1.default.ok(!remember.test('[[tool:remember_fact {"fact":"x"}]] summarise my mail'), 'a tool name is not a request');
    strict_1.default.ok(!remember.test('Summarise my unread mail'));
});
