"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Final quality pass: error references (what people see, what is logged and
 * stored), plurals, Lagos dates and relative times, and the expiry rules of
 * password links. Pure: no database.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const errors_1 = require("../lib/errors");
const error_events_core_1 = require("../lib/error-events-core");
const pluralize_1 = require("../lib/utils/pluralize");
const format_date_1 = require("../lib/utils/format-date");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (p) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, p), 'utf8');
const REPO = (0, node_path_1.join)(ROOT, '..', '..');
const readRepo = (p) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(REPO, p), 'utf8');
/** Silence the JSON log lines these tests cause on purpose. */
function quietly(fn) {
    const logged = [];
    const original = console.error;
    console.error = (...args) => { logged.push(args.map(String).join(' ')); };
    try {
        return { value: fn(), logged };
    }
    finally {
        console.error = original;
    }
}
// ------------------------------------------------------------ error references
const TECHNICAL_FAILURES = [
    Object.assign(new Error('\nInvalid `prisma.jobCard.update()` invocation in\n/var/task/apps/portal/.next/server/chunks/123.js:1:2345\n\nAn operation failed because it depends on one or more records that were required but not found.'), { name: 'PrismaClientKnownRequestError' }),
    new TypeError("Cannot read properties of undefined (reading 'id')"),
    new TypeError('fetch failed'),
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
    new Error('Unknown argument `userId`. Available options are listed in green.'),
    new Error('insert or update on table "payments" violates foreign key constraint "payments_jobCardId_fkey"'),
    new Error('duplicate key value violates unique constraint "users_email_key"'),
    new ReferenceError('estimate is not defined'),
    new Error('x.map is not a function'),
    new Error('Unexpected token < in JSON at position 0'),
    new Error('Error: boom\n    at handler (/app/lib/actions/workshop.ts:120:5)'),
    new Error('at Object.<anonymous> (/srv/node_modules/@prisma/client/runtime/library.js:1:1)'),
    'a thrown string with no message property but a stack: at foo (bar.js:1:1)',
    { weird: true },
    null,
];
(0, node_test_1.test)('technical failures never reach the person: plain words and a 10-digit reference', () => {
    for (const err of TECHNICAL_FAILURES) {
        const { value } = quietly(() => (0, errors_1.friendlyError)(err, 'Could not save the payment.'));
        strict_1.default.ok(!errors_1.TECHNICAL.test(value), `technical text reached the user: ${value}`);
        strict_1.default.match(value, /^Could not save the payment\. Something went wrong on our side\. Please try again, and if it keeps happening, quote reference \d{10}\.$/, `for ${String(err?.message ?? err)}`);
    }
});
(0, node_test_1.test)('our own business messages pass through unchanged', () => {
    for (const msg of ['Give a reason for declining.', 'Only the assigned supervisor can approve this estimate.', 'That plate number is already registered to another vehicle.']) {
        strict_1.default.equal((0, errors_1.friendlyError)(new Error(msg)), msg);
    }
});
(0, node_test_1.test)('database conditions become plain words; connection trouble carries a reference', () => {
    const { value: gone } = quietly(() => (0, errors_1.friendlyError)(Object.assign(new Error('x'), { code: 'P2025' })));
    strict_1.default.equal(gone, 'This record no longer exists or was just changed. Refresh the page.');
    const { value: down } = quietly(() => (0, errors_1.friendlyError)(Object.assign(new Error("Can't reach database server"), { code: 'P1001' })));
    strict_1.default.match(down, /^The database is not reachable right now\. .* quote reference \d{10}\.$/);
    const { value: twice } = quietly(() => (0, errors_1.friendlyError)(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['idempotencyKey'] } })));
    strict_1.default.match(twice, /already recorded/);
    const { value: raced } = quietly(() => (0, errors_1.friendlyError)(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['jobNumber'] } })));
    strict_1.default.match(raced, /same moment/);
});
(0, node_test_1.test)('Next.js redirects and not-found are passed on, never turned into an error message', () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/dashboard;307;' });
    strict_1.default.throws(() => (0, errors_1.friendlyError)(redirect), (e) => e === redirect);
});
(0, node_test_1.test)('the reference a person sees is the one logged and handed to the store', () => {
    const seen = [];
    (0, errors_1.setErrorSink)((r) => seen.push(r));
    try {
        const { value, logged } = quietly(() => (0, errors_1.friendlyError)(new TypeError("Cannot read properties of null (reading 'x')"), 'Could not open Job Card.', 'createJobCard'));
        const ref = /quote reference (\d{10})/.exec(value)?.[1];
        strict_1.default.ok(ref);
        strict_1.default.equal(seen.length, 1);
        strict_1.default.equal(seen[0].ref, ref);
        strict_1.default.equal(seen[0].where, 'createJobCard');
        const line = JSON.parse(logged[0]);
        strict_1.default.equal(line.ref, ref);
        strict_1.default.equal(line.level, 'error');
    }
    finally {
        (0, errors_1.setErrorSink)(null);
    }
});
(0, node_test_1.test)('a failing store never breaks the answer', () => {
    (0, errors_1.setErrorSink)(() => { throw new Error('store is down'); });
    try {
        const { value } = quietly(() => (0, errors_1.friendlyError)(new Error('fetch failed')));
        strict_1.default.match(value, /quote reference \d{10}/);
    }
    finally {
        (0, errors_1.setErrorSink)(null);
    }
});
(0, node_test_1.test)('logs carry no secrets and no full email addresses', () => {
    const { logged } = quietly(() => (0, errors_1.logError)('test', new Error('login failed for ada.obi@example.com password=hunter2 postgresql://admin:pw@db:5432/x token: abc123 reset-password:AbCdEfGhIjKlMnOp')));
    const line = logged[0];
    for (const secret of ['hunter2', 'admin:pw', 'abc123', 'ada.obi@', 'AbCdEfGhIjKlMnOp'])
        strict_1.default.ok(!line.includes(secret), `${secret} leaked: ${line}`);
    strict_1.default.ok(line.includes('a***@example.com'));
    strict_1.default.equal((0, errors_1.maskEmails)('x bola@kcg.ng y'), 'x b***@kcg.ng y');
    strict_1.default.ok(!(0, errors_1.redact)('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part').includes('eyJhbGci'));
});
(0, node_test_1.test)('references: ten digits, and different every time', () => {
    const refs = new Set(Array.from({ length: 2000 }, () => (0, errors_1.newRef)()));
    for (const r of refs)
        strict_1.default.match(r, /^[1-9]\d{9}$/);
    strict_1.default.ok(refs.size > 1990);
});
(0, node_test_1.test)('isPlainMessage: short, single-line, non-technical', () => {
    strict_1.default.equal((0, errors_1.isPlainMessage)('Enter the amount.'), true);
    strict_1.default.equal((0, errors_1.isPlainMessage)('a\nb'), false);
    strict_1.default.equal((0, errors_1.isPlainMessage)('x'.repeat(301)), false);
    strict_1.default.equal((0, errors_1.isPlainMessage)('Invalid `prisma.x()` invocation'), false);
});
(0, node_test_1.test)('error kinds: each failure is sorted and has advice for IT', () => {
    strict_1.default.equal((0, error_events_core_1.classifyError)(Object.assign(new Error('x'), { code: 'P1001' })), 'connection');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new TypeError('Failed to fetch'), { where: 'browser' }), 'connection');
    strict_1.default.equal((0, error_events_core_1.classifyError)(Object.assign(new Error('x'), { code: 'P2003' })), 'database');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new Error('You do not have permission to do this.')), 'permission');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new Error('That Job Card no longer exists.')), 'not-found');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new TypeError('x is undefined'), { routeType: 'render' }), 'render');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new TypeError('x is undefined'), { where: 'createPayment' }), 'action');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new TypeError('x is undefined'), { routeType: 'route' }), 'route');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new Error('boom'), { where: 'browser' }), 'browser');
    strict_1.default.equal((0, error_events_core_1.classifyError)(new Error('boom')), 'unknown');
    for (const k of error_events_core_1.ERROR_KINDS)
        strict_1.default.ok(error_events_core_1.KIND_TODO[k.key].length > 40, k.key);
});
(0, node_test_1.test)('stored rows: redacted, emails masked, query string dropped, capped', () => {
    const err = new Error(`password=hunter2 for ada@example.com ${'x'.repeat(3000)}`);
    err.stack = `Error: boom\n${'    at f (/a.js:1:1)\n'.repeat(40)}`;
    const row = (0, error_events_core_1.buildErrorEventRow)({ ref: '1234567890', app: 'portal', err, path: '/reset-password?token=secret-token-value&x=1', method: 'POST', route: '/reset-password', userId: 'u1', organisationId: 'o1' });
    strict_1.default.equal(row.path, '/reset-password');
    strict_1.default.ok(!row.message.includes('hunter2'));
    strict_1.default.ok(!row.message.includes('ada@'));
    strict_1.default.ok(row.message.length <= 1000);
    strict_1.default.ok((row.stack ?? '').split('\n').length <= 8);
    strict_1.default.equal(row.userId, 'u1');
    strict_1.default.equal(row.organisationId, 'o1');
    strict_1.default.equal(row.customerId, null);
    const s = (0, error_events_core_1.buildErrorEventRow)({ ref: '1', app: 'website', err: 'just text' });
    strict_1.default.equal(s.message, 'just text');
    strict_1.default.equal(s.kind, 'unknown');
});
(0, node_test_1.test)('the store is rate-limited and stores one row per reference', () => {
    const allow = (0, error_events_core_1.createRateGate)(3, 60_000);
    const t0 = 1_000_000;
    strict_1.default.deepEqual([allow(t0), allow(t0 + 1), allow(t0 + 2), allow(t0 + 3)], [true, true, true, false]);
    strict_1.default.equal(allow(t0 + 60_000), true, 'a new minute starts a new allowance');
    const seen = (0, error_events_core_1.createSeen)(2);
    strict_1.default.equal(seen('a'), false);
    strict_1.default.equal(seen('a'), true);
    seen('b');
    seen('c');
    strict_1.default.equal(seen('a'), false, 'the oldest is forgotten once the window is full');
});
(0, node_test_1.test)('control-flow digests are not errors; references are searched as typed', () => {
    strict_1.default.equal((0, error_events_core_1.isControlFlowDigest)('NEXT_NOT_FOUND'), true);
    strict_1.default.equal((0, error_events_core_1.isControlFlowDigest)('NEXT_REDIRECT;push;/x;307;'), true);
    strict_1.default.equal((0, error_events_core_1.isControlFlowDigest)('DYNAMIC_SERVER_USAGE'), true);
    strict_1.default.equal((0, error_events_core_1.isControlFlowDigest)('3553129217'), false);
    strict_1.default.equal((0, error_events_core_1.normaliseRef)(' 3553129217 '), '3553129217');
    strict_1.default.equal((0, error_events_core_1.normaliseRef)('Reference: 1714287536.'), '1714287536');
    strict_1.default.equal((0, error_events_core_1.normaliseRef)('ref 1714287536'), '1714287536');
    strict_1.default.equal((0, error_events_core_1.normaliseRef)("1' OR 1=1"), null);
    strict_1.default.equal((0, error_events_core_1.normaliseRef)(''), null);
});
(0, node_test_1.test)('error screens show the reference with a copy button and never the raw message', () => {
    const screen = read('components/ErrorScreen.tsx');
    strict_1.default.ok(screen.includes('error.digest'));
    strict_1.default.ok(screen.includes('Copy reference'));
    strict_1.default.ok(screen.includes('/api/error-report'));
    strict_1.default.ok(!/\{error\.message\}/.test(screen), 'the raw message is never rendered');
    const global = read('app/global-error.tsx');
    strict_1.default.ok(!global.includes('globals.css'), 'the last-resort screen carries its own styles');
    strict_1.default.ok(global.includes('prefers-reduced-motion'));
    for (const f of ['app/(app)/error.tsx', 'app/error.tsx'])
        strict_1.default.ok(read(f).includes('ErrorScreen'), f);
    strict_1.default.ok(readRepo('apps/website/app/customer-portal/dashboard/error.tsx').includes('ErrorScreen'));
    strict_1.default.ok(readRepo('apps/website/app/global-error.tsx').includes('prefers-reduced-motion'));
});
(0, node_test_1.test)('the error log page is guarded and organisation-fenced', () => {
    const src = read('lib/actions/error-log.ts');
    strict_1.default.ok(src.includes("authorize('audit.view'"));
    strict_1.default.ok((src.match(/orgWhere\(\)/g) ?? []).length >= 2, 'events and customers are both fenced');
    strict_1.default.ok(read('app/(app)/audit-logs/errors/page.tsx').includes("guardPage('audit.view'"));
    strict_1.default.ok(read('app/(app)/audit-logs/page.tsx').includes('/audit-logs/errors'));
    strict_1.default.ok(read('app/api/cron/pricing-alerts/route.ts').includes('purgeOldErrorEvents(90)'));
    strict_1.default.ok(read('lib/job-runs.ts').includes("key: 'error-log-cleanup'"));
    strict_1.default.ok(readRepo('packages/database/src/audit-journal.ts').includes("'ErrorEvent'"), 'error rows are never journaled');
});
// ------------------------------------------------------------ plurals
(0, node_test_1.test)('plurals: only exactly one is singular', () => {
    strict_1.default.equal((0, pluralize_1.pluralize)(0, 'job'), '0 jobs');
    strict_1.default.equal((0, pluralize_1.pluralize)(1, 'job'), '1 job');
    strict_1.default.equal((0, pluralize_1.pluralize)(2, 'job'), '2 jobs');
    strict_1.default.equal((0, pluralize_1.pluralize)(1.5, 'day'), '1.5 days');
    strict_1.default.equal((0, pluralize_1.pluralize)(-1, 'day'), '-1 days');
    strict_1.default.equal((0, pluralize_1.pluralize)(1, 'day'), '1 day');
});
(0, node_test_1.test)('plurals: English rules, irregulars, phrases and letter case', () => {
    const cases = [
        ['person', 'people'], ['child', 'children'], ['staff', 'staff'], ['entry', 'entries'], ['policy', 'policies'], ['delivery', 'deliveries'],
        ['day', 'days'], ['key', 'keys'], ['pass', 'passes'], ['branch', 'branches'], ['box', 'boxes'], ['bus', 'buses'], ['status', 'statuses'],
        ['address', 'addresses'], ['match', 'matches'], ['serial number', 'serial numbers'], ['working day', 'working days'], ['Job Card', 'Job Cards'],
        ['STORE PARTS REQUEST REF', 'STORE PARTS REQUEST REFS'], ['REFUND RECEIPT', 'REFUND RECEIPTS'], ['Part', 'Parts'], ['km', 'km'], ['min', 'min'],
        ['Pcs', 'Pcs'], ['Litres', 'Litres'], ['chassis', 'chassis'], ['Each', 'Each'], ['pc', 'pcs'], ['shelf', 'shelves'], ['Person', 'People'],
    ];
    for (const [one, many] of cases)
        strict_1.default.equal((0, pluralize_1.pluralOf)(one), many, one);
    strict_1.default.equal((0, pluralize_1.pluralize)(3, 'person'), '3 people');
    strict_1.default.equal((0, pluralize_1.pluralize)(1, 'person'), '1 person');
    strict_1.default.equal((0, pluralize_1.pluralize)(2, 'warranty', 'warranties'), '2 warranties', 'an explicit plural wins');
    strict_1.default.equal((0, pluralize_1.pluralizeWord)(4, 'Litre'), 'Litres');
    strict_1.default.equal((0, pluralize_1.pluralizeWord)(1, 'Litre'), 'Litre');
});
(0, node_test_1.test)('no "1 jobs": hand-made plurals in pages and libraries go through pluralize', () => {
    const files = ['app/(app)/permissions/page.tsx', 'app/(app)/inventory/analytics/page.tsx', 'lib/inventory-analytics.ts', 'lib/warranty-analytics.ts', 'app/(app)/settings/page.tsx'];
    const bad = /\$\{[^}]*\}\s(days|claims|permissions|roles|areas) |\{[a-zA-Z.]+(Days|length)\}\s(days|permissions|roles)\b/;
    for (const f of files)
        strict_1.default.ok(!bad.test(read(f)), `${f} builds a plural by hand`);
});
// ------------------------------------------------------------ dates and times
(0, node_test_1.test)('dates are Lagos dates, not server (UTC) dates', () => {
    // 23:30 UTC on 31 December is 00:30 on 1 January in Lagos.
    const d = new Date('2026-12-31T23:30:00Z');
    strict_1.default.equal((0, format_date_1.lagosDayKey)(d), '2027-01-01');
    strict_1.default.equal((0, format_date_1.lagosYear)(d), 2027);
    strict_1.default.match((0, format_date_1.formatDateOnly)(d), /01\/01\/2027/);
    strict_1.default.match((0, format_date_1.formatDateTime)(d), /1 January 2027/);
    // hour12 gave "0:30 am" on Node 20 (the production runtime); hourCycle h12 gives "12:30 am" everywhere.
    strict_1.default.match((0, format_date_1.formatDateTime)(d), /12:30\s?am/i);
    strict_1.default.match((0, format_date_1.formatDateTime)(new Date('2026-10-12T12:05:00Z')), /1:05\s?pm/i);
    strict_1.default.equal((0, format_date_1.isSameLagosDay)(new Date('2026-10-12T23:10:00Z'), new Date('2026-10-13T08:00:00Z')), true);
    strict_1.default.equal((0, format_date_1.isSameLagosDay)(new Date('2026-10-12T22:50:00Z'), new Date('2026-10-12T23:10:00Z')), false);
});
(0, node_test_1.test)('relative times are right at every boundary', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    const ago = (ms, short = false) => (0, format_date_1.formatRelative)(new Date(now.getTime() - ms), now, { short });
    const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
    strict_1.default.equal(ago(0), 'just now');
    strict_1.default.equal(ago(-5 * M), 'just now', 'a clock slightly ahead never reads "in the future"');
    strict_1.default.equal(ago(59 * S), 'just now');
    strict_1.default.equal(ago(60 * S), '1 minute ago');
    strict_1.default.equal(ago(119 * S), '1 minute ago');
    strict_1.default.equal(ago(2 * M), '2 minutes ago');
    strict_1.default.equal(ago(59 * M + 59 * S), '59 minutes ago');
    strict_1.default.equal(ago(H), '1 hour ago');
    strict_1.default.equal(ago(2 * H - S), '1 hour ago');
    strict_1.default.equal(ago(2 * H), '2 hours ago');
    strict_1.default.equal(ago(D - S), '23 hours ago');
    strict_1.default.equal(ago(D), 'yesterday');
    strict_1.default.equal(ago(2 * D), '2 days ago');
    strict_1.default.equal(ago(6 * D), '6 days ago');
    strict_1.default.equal(ago(7 * D), '5 Oct 2026');
    strict_1.default.equal(ago(5 * M, true), '5 min ago');
    strict_1.default.equal(ago(3 * H, true), '3 h ago');
    strict_1.default.equal(ago(2 * D, true), '2 d ago');
    strict_1.default.equal((0, format_date_1.formatRelative)(new Date('not a date'), now), '');
});
(0, node_test_1.test)('server pages never format a date without the Lagos time zone', () => {
    const custody = read('app/(app)/workshop/custody/page.tsx');
    strict_1.default.ok(!/toLocaleDateString\('en-NG', \{ year: 'numeric', month: 'long', day: 'numeric' \}\)/.test(custody));
    strict_1.default.ok(readRepo('apps/website/lib/customer-portal/notifications.ts').includes("timeZone: 'Africa/Lagos'"));
});
(0, node_test_1.test)('record histories list the newest first, in a stable order', () => {
    const fns = [
        ['lib/actions/warranty.ts', 'getWarrantyAuditTrail'], ['lib/actions/warranty.ts', 'getWarrantyPolicyAuditTrail'], ['lib/actions/warranty.ts', 'getWarrantyProviderAuditTrail'],
        ['lib/actions/warranty-claims.ts', 'getWarrantyClaimAuditTrail'], ['lib/actions/workshop.ts', 'getJobCardAuditTrail'], ['lib/actions/workshop.ts', 'getVehicleAuditTrail'],
        ['lib/actions/vehicle-service.ts', 'getVehicleServiceAuditTrail'], ['lib/actions/store.ts', 'getPartAuditTrail'], ['lib/actions/store.ts', 'getGoodsReceiptAuditTrail'],
        ['lib/actions/sourcing.ts', 'getExternalProcurementRequestAuditTrail'],
    ];
    for (const [f, fn] of fns) {
        const src = read(f);
        const i = src.indexOf(`export async function ${fn}(`);
        const body = src.slice(i, src.indexOf('\nexport ', i + 10));
        strict_1.default.ok(body.includes("orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]"), `${fn} is not newest-first`);
    }
});
// ------------------------------------------------------------ password links
(0, node_test_1.test)('password links: staff reset 1 h, staff welcome 72 h, customer reset 1 h, customer welcome 72 h; single use; newest only', () => {
    const staffAuth = read('lib/auth.ts');
    strict_1.default.match(staffAuth, /RESET_LINK_SECONDS = 60 \* 60;/);
    strict_1.default.match(staffAuth, /resetPasswordTokenExpiresIn: RESET_LINK_SECONDS/);
    strict_1.default.match(staffAuth, /verification\.deleteMany\(\{ where: \{ value: user\.id, identifier: \{ startsWith: 'reset-password:', not: `reset-password:\$\{token\}` \} \} \}\)/);
    const onboarding = read('lib/staff-onboarding.ts');
    strict_1.default.match(onboarding, /const SET_PASSWORD_HOURS = 72;/);
    const issue = onboarding.slice(onboarding.indexOf('export async function issueSetPasswordLink'));
    strict_1.default.ok(issue.indexOf('verification.deleteMany') < issue.indexOf('createVerificationValue'), 'earlier links are withdrawn before the new one');
    strict_1.default.match(issue, /hours \* 3600_000/);
    const customerAccess = read('lib/customer-access.ts');
    strict_1.default.match(customerAccess, /CUSTOMER_SET_PASSWORD_HOURS = 72;/);
    const cIssue = customerAccess.slice(customerAccess.indexOf('export async function issueCustomerSetPasswordLink'));
    strict_1.default.ok(cIssue.indexOf('customerVerification.deleteMany') < cIssue.indexOf('INSERT INTO customer_verifications'));
    strict_1.default.match(cIssue, /randomBytes\(32\)/);
    strict_1.default.match(cIssue, /\/customer-portal\/reset-password\?token=/);
    const customerAuth = readRepo('apps/website/lib/auth-customer.ts');
    strict_1.default.match(customerAuth, /RESET_LINK_SECONDS = 60 \* 60;/);
    strict_1.default.match(customerAuth, /resetPasswordTokenExpiresIn: RESET_LINK_SECONDS/);
    strict_1.default.match(customerAuth, /not: `reset-password:\$\{token\}`/);
    strict_1.default.match(customerAuth, /modelName: 'customerVerification'/);
    // Registration sends the right link: staff "Add" → welcome (72 h), customer register → welcome with set-password link.
    strict_1.default.ok(read('lib/actions/users-admin.ts').includes("sendStaffAccessEmail(created.id, 'welcome')"));
    strict_1.default.ok(onboarding.includes("kind === 'welcome' ? await issueSetPasswordLink(userId)"));
    strict_1.default.ok(customerAccess.includes('const setPasswordUrl = await issueCustomerSetPasswordLink(customer.id);'));
});
