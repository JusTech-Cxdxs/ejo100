/**
 * Final quality pass: error references (what people see, what is logged and
 * stored), plurals, Lagos dates and relative times, and the expiry rules of
 * password links. Pure: no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { friendlyError, logError, newRef, redact, maskEmails, setErrorSink, TECHNICAL, isPlainMessage, type ErrorReport } from '../lib/errors';
import { buildErrorEventRow, classifyError, createRateGate, createSeen, isControlFlowDigest, normaliseRef, ERROR_KINDS, KIND_TODO } from '../lib/error-events-core';
import { pluralize, pluralizeWord, pluralOf } from '../lib/utils/pluralize';
import { formatDateTime, formatDateOnly, formatRelative, isSameLagosDay, lagosDayKey, lagosYear } from '../lib/utils/format-date';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const REPO = join(ROOT, '..', '..');
const readRepo = (p: string) => readFileSync(join(REPO, p), 'utf8');

/** Silence the JSON log lines these tests cause on purpose. */
function quietly<T>(fn: () => T): { value: T; logged: string[] } {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  try {
    return { value: fn(), logged };
  } finally {
    console.error = original;
  }
}

// ------------------------------------------------------------ error references

const TECHNICAL_FAILURES: unknown[] = [
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

test('technical failures never reach the person: plain words and a 10-digit reference', () => {
  for (const err of TECHNICAL_FAILURES) {
    const { value } = quietly(() => friendlyError(err, 'Could not save the payment.'));
    assert.ok(!TECHNICAL.test(value), `technical text reached the user: ${value}`);
    assert.match(value, /^Could not save the payment\. Something went wrong on our side\. Please try again, and if it keeps happening, quote reference \d{10}\.$/, `for ${String((err as Error)?.message ?? err)}`);
  }
});

test('our own business messages pass through unchanged', () => {
  for (const msg of ['Give a reason for declining.', 'Only the assigned supervisor can approve this estimate.', 'That plate number is already registered to another vehicle.']) {
    assert.equal(friendlyError(new Error(msg)), msg);
  }
});

test('database conditions become plain words; connection trouble carries a reference', () => {
  const { value: gone } = quietly(() => friendlyError(Object.assign(new Error('x'), { code: 'P2025' })));
  assert.equal(gone, 'This record no longer exists or was just changed. Refresh the page.');
  const { value: down } = quietly(() => friendlyError(Object.assign(new Error("Can't reach database server"), { code: 'P1001' })));
  assert.match(down, /^The database is not reachable right now\. .* quote reference \d{10}\.$/);
  const { value: twice } = quietly(() => friendlyError(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['idempotencyKey'] } })));
  assert.match(twice, /already recorded/);
  const { value: raced } = quietly(() => friendlyError(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['jobNumber'] } })));
  assert.match(raced, /same moment/);
});

test('Next.js redirects and not-found are passed on, never turned into an error message', () => {
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/dashboard;307;' });
  assert.throws(() => friendlyError(redirect), (e) => e === redirect);
});

test('the reference a person sees is the one logged and handed to the store', () => {
  const seen: ErrorReport[] = [];
  setErrorSink((r) => seen.push(r));
  try {
    const { value, logged } = quietly(() => friendlyError(new TypeError("Cannot read properties of null (reading 'x')"), 'Could not open Job Card.', 'createJobCard'));
    const ref = /quote reference (\d{10})/.exec(value)?.[1];
    assert.ok(ref);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.ref, ref);
    assert.equal(seen[0]!.where, 'createJobCard');
    const line = JSON.parse(logged[0]!);
    assert.equal(line.ref, ref);
    assert.equal(line.level, 'error');
  } finally {
    setErrorSink(null);
  }
});

test('a failing store never breaks the answer', () => {
  setErrorSink(() => { throw new Error('store is down'); });
  try {
    const { value } = quietly(() => friendlyError(new Error('fetch failed')));
    assert.match(value, /quote reference \d{10}/);
  } finally {
    setErrorSink(null);
  }
});

test('logs carry no secrets and no full email addresses', () => {
  const { logged } = quietly(() => logError('test', new Error('login failed for ada.obi@example.com password=hunter2 postgresql://admin:pw@db:5432/x token: abc123 reset-password:AbCdEfGhIjKlMnOp')));
  const line = logged[0]!;
  for (const secret of ['hunter2', 'admin:pw', 'abc123', 'ada.obi@', 'AbCdEfGhIjKlMnOp']) assert.ok(!line.includes(secret), `${secret} leaked: ${line}`);
  assert.ok(line.includes('a***@example.com'));
  assert.equal(maskEmails('x bola@kcg.ng y'), 'x b***@kcg.ng y');
  assert.ok(!redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part').includes('eyJhbGci'));
});

test('references: ten digits, and different every time', () => {
  const refs = new Set(Array.from({ length: 2000 }, () => newRef()));
  for (const r of refs) assert.match(r, /^[1-9]\d{9}$/);
  assert.ok(refs.size > 1990);
});

test('isPlainMessage: short, single-line, non-technical', () => {
  assert.equal(isPlainMessage('Enter the amount.'), true);
  assert.equal(isPlainMessage('a\nb'), false);
  assert.equal(isPlainMessage('x'.repeat(301)), false);
  assert.equal(isPlainMessage('Invalid `prisma.x()` invocation'), false);
});

test('error kinds: each failure is sorted and has advice for IT', () => {
  assert.equal(classifyError(Object.assign(new Error('x'), { code: 'P1001' })), 'connection');
  assert.equal(classifyError(new TypeError('Failed to fetch'), { where: 'browser' }), 'connection');
  assert.equal(classifyError(Object.assign(new Error('x'), { code: 'P2003' })), 'database');
  assert.equal(classifyError(new Error('You do not have permission to do this.')), 'permission');
  assert.equal(classifyError(new Error('That Job Card no longer exists.')), 'not-found');
  assert.equal(classifyError(new TypeError('x is undefined'), { routeType: 'render' }), 'render');
  assert.equal(classifyError(new TypeError('x is undefined'), { where: 'createPayment' }), 'action');
  assert.equal(classifyError(new TypeError('x is undefined'), { routeType: 'route' }), 'route');
  assert.equal(classifyError(new Error('boom'), { where: 'browser' }), 'browser');
  assert.equal(classifyError(new Error('boom')), 'unknown');
  for (const k of ERROR_KINDS) assert.ok(KIND_TODO[k.key].length > 40, k.key);
});

test('stored rows: redacted, emails masked, query string dropped, capped', () => {
  const err = new Error(`password=hunter2 for ada@example.com ${'x'.repeat(3000)}`);
  err.stack = `Error: boom\n${'    at f (/a.js:1:1)\n'.repeat(40)}`;
  const row = buildErrorEventRow({ ref: '1234567890', app: 'portal', err, path: '/reset-password?token=secret-token-value&x=1', method: 'POST', route: '/reset-password', userId: 'u1', organisationId: 'o1' });
  assert.equal(row.path, '/reset-password');
  assert.ok(!row.message.includes('hunter2'));
  assert.ok(!row.message.includes('ada@'));
  assert.ok(row.message.length <= 1000);
  assert.ok((row.stack ?? '').split('\n').length <= 8);
  assert.equal(row.userId, 'u1');
  assert.equal(row.organisationId, 'o1');
  assert.equal(row.customerId, null);
  const s = buildErrorEventRow({ ref: '1', app: 'website', err: 'just text' });
  assert.equal(s.message, 'just text');
  assert.equal(s.kind, 'unknown');
});

test('the store is rate-limited and stores one row per reference', () => {
  const allow = createRateGate(3, 60_000);
  const t0 = 1_000_000;
  assert.deepEqual([allow(t0), allow(t0 + 1), allow(t0 + 2), allow(t0 + 3)], [true, true, true, false]);
  assert.equal(allow(t0 + 60_000), true, 'a new minute starts a new allowance');
  const seen = createSeen(2);
  assert.equal(seen('a'), false);
  assert.equal(seen('a'), true);
  seen('b'); seen('c');
  assert.equal(seen('a'), false, 'the oldest is forgotten once the window is full');
});

test('control-flow digests are not errors; references are searched as typed', () => {
  assert.equal(isControlFlowDigest('NEXT_NOT_FOUND'), true);
  assert.equal(isControlFlowDigest('NEXT_REDIRECT;push;/x;307;'), true);
  assert.equal(isControlFlowDigest('DYNAMIC_SERVER_USAGE'), true);
  assert.equal(isControlFlowDigest('3553129217'), false);
  assert.equal(normaliseRef(' 3553129217 '), '3553129217');
  assert.equal(normaliseRef('Reference: 1714287536.'), '1714287536');
  assert.equal(normaliseRef('ref 1714287536'), '1714287536');
  assert.equal(normaliseRef("1' OR 1=1"), null);
  assert.equal(normaliseRef(''), null);
});

test('error screens show the reference with a copy button and never the raw message', () => {
  const screen = read('components/ErrorScreen.tsx');
  assert.ok(screen.includes('error.digest'));
  assert.ok(screen.includes('Copy reference'));
  assert.ok(screen.includes('/api/error-report'));
  assert.ok(!/\{error\.message\}/.test(screen), 'the raw message is never rendered');
  const global = read('app/global-error.tsx');
  assert.ok(!global.includes('globals.css'), 'the last-resort screen carries its own styles');
  assert.ok(global.includes('prefers-reduced-motion'));
  for (const f of ['app/(app)/error.tsx', 'app/error.tsx']) assert.ok(read(f).includes('ErrorScreen'), f);
  assert.ok(readRepo('apps/website/app/customer-portal/dashboard/error.tsx').includes('ErrorScreen'));
  assert.ok(readRepo('apps/website/app/global-error.tsx').includes('prefers-reduced-motion'));
});

test('the error log page is guarded and organisation-fenced', () => {
  const src = read('lib/actions/error-log.ts');
  assert.ok(src.includes("authorize('audit.view'"));
  assert.ok((src.match(/orgWhere\(\)/g) ?? []).length >= 2, 'events and customers are both fenced');
  assert.ok(read('app/(app)/audit-logs/errors/page.tsx').includes("guardPage('audit.view'"));
  assert.ok(read('app/(app)/audit-logs/page.tsx').includes('/audit-logs/errors'));
  assert.ok(read('app/api/cron/pricing-alerts/route.ts').includes('purgeOldErrorEvents(90)'));
  assert.ok(read('lib/job-runs.ts').includes("key: 'error-log-cleanup'"));
  assert.ok(readRepo('packages/database/src/audit-journal.ts').includes("'ErrorEvent'"), 'error rows are never journaled');
});

// ------------------------------------------------------------ plurals

test('plurals: only exactly one is singular', () => {
  assert.equal(pluralize(0, 'job'), '0 jobs');
  assert.equal(pluralize(1, 'job'), '1 job');
  assert.equal(pluralize(2, 'job'), '2 jobs');
  assert.equal(pluralize(1.5, 'day'), '1.5 days');
  assert.equal(pluralize(-1, 'day'), '-1 days');
  assert.equal(pluralize(1, 'day'), '1 day');
});

test('plurals: English rules, irregulars, phrases and letter case', () => {
  const cases: [string, string][] = [
    ['person', 'people'], ['child', 'children'], ['staff', 'staff'], ['entry', 'entries'], ['policy', 'policies'], ['delivery', 'deliveries'],
    ['day', 'days'], ['key', 'keys'], ['pass', 'passes'], ['branch', 'branches'], ['box', 'boxes'], ['bus', 'buses'], ['status', 'statuses'],
    ['address', 'addresses'], ['match', 'matches'], ['serial number', 'serial numbers'], ['working day', 'working days'], ['Job Card', 'Job Cards'],
    ['STORE PARTS REQUEST REF', 'STORE PARTS REQUEST REFS'], ['REFUND RECEIPT', 'REFUND RECEIPTS'], ['Part', 'Parts'], ['km', 'km'], ['min', 'min'],
    ['Pcs', 'Pcs'], ['Litres', 'Litres'], ['chassis', 'chassis'], ['Each', 'Each'], ['pc', 'pcs'], ['shelf', 'shelves'], ['Person', 'People'],
  ];
  for (const [one, many] of cases) assert.equal(pluralOf(one), many, one);
  assert.equal(pluralize(3, 'person'), '3 people');
  assert.equal(pluralize(1, 'person'), '1 person');
  assert.equal(pluralize(2, 'warranty', 'warranties'), '2 warranties', 'an explicit plural wins');
  assert.equal(pluralizeWord(4, 'Litre'), 'Litres');
  assert.equal(pluralizeWord(1, 'Litre'), 'Litre');
});

test('no "1 jobs": hand-made plurals in pages and libraries go through pluralize', () => {
  const files = ['app/(app)/permissions/page.tsx', 'app/(app)/inventory/analytics/page.tsx', 'lib/inventory-analytics.ts', 'lib/warranty-analytics.ts', 'app/(app)/settings/page.tsx'];
  const bad = /\$\{[^}]*\}\s(days|claims|permissions|roles|areas) |\{[a-zA-Z.]+(Days|length)\}\s(days|permissions|roles)\b/;
  for (const f of files) assert.ok(!bad.test(read(f)), `${f} builds a plural by hand`);
});

// ------------------------------------------------------------ dates and times

test('dates are Lagos dates, not server (UTC) dates', () => {
  // 23:30 UTC on 31 December is 00:30 on 1 January in Lagos.
  const d = new Date('2026-12-31T23:30:00Z');
  assert.equal(lagosDayKey(d), '2027-01-01');
  assert.equal(lagosYear(d), 2027);
  assert.match(formatDateOnly(d), /01\/01\/2027/);
  assert.match(formatDateTime(d), /1 January 2027/);
  assert.match(formatDateTime(d), /12:30/);
  assert.equal(isSameLagosDay(new Date('2026-10-12T23:10:00Z'), new Date('2026-10-13T08:00:00Z')), true);
  assert.equal(isSameLagosDay(new Date('2026-10-12T22:50:00Z'), new Date('2026-10-12T23:10:00Z')), false);
});

test('relative times are right at every boundary', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const ago = (ms: number, short = false) => formatRelative(new Date(now.getTime() - ms), now, { short });
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  assert.equal(ago(0), 'just now');
  assert.equal(ago(-5 * M), 'just now', 'a clock slightly ahead never reads "in the future"');
  assert.equal(ago(59 * S), 'just now');
  assert.equal(ago(60 * S), '1 minute ago');
  assert.equal(ago(119 * S), '1 minute ago');
  assert.equal(ago(2 * M), '2 minutes ago');
  assert.equal(ago(59 * M + 59 * S), '59 minutes ago');
  assert.equal(ago(H), '1 hour ago');
  assert.equal(ago(2 * H - S), '1 hour ago');
  assert.equal(ago(2 * H), '2 hours ago');
  assert.equal(ago(D - S), '23 hours ago');
  assert.equal(ago(D), 'yesterday');
  assert.equal(ago(2 * D), '2 days ago');
  assert.equal(ago(6 * D), '6 days ago');
  assert.equal(ago(7 * D), '5 Oct 2026');
  assert.equal(ago(5 * M, true), '5 min ago');
  assert.equal(ago(3 * H, true), '3 h ago');
  assert.equal(ago(2 * D, true), '2 d ago');
  assert.equal(formatRelative(new Date('not a date'), now), '');
});

test('server pages never format a date without the Lagos time zone', () => {
  const custody = read('app/(app)/workshop/custody/page.tsx');
  assert.ok(!/toLocaleDateString\('en-NG', \{ year: 'numeric', month: 'long', day: 'numeric' \}\)/.test(custody));
  assert.ok(readRepo('apps/website/lib/customer-portal/notifications.ts').includes("timeZone: 'Africa/Lagos'"));
});

test('record histories list the newest first, in a stable order', () => {
  const fns: [string, string][] = [
    ['lib/actions/warranty.ts', 'getWarrantyAuditTrail'], ['lib/actions/warranty.ts', 'getWarrantyPolicyAuditTrail'], ['lib/actions/warranty.ts', 'getWarrantyProviderAuditTrail'],
    ['lib/actions/warranty-claims.ts', 'getWarrantyClaimAuditTrail'], ['lib/actions/workshop.ts', 'getJobCardAuditTrail'], ['lib/actions/workshop.ts', 'getVehicleAuditTrail'],
    ['lib/actions/vehicle-service.ts', 'getVehicleServiceAuditTrail'], ['lib/actions/store.ts', 'getPartAuditTrail'], ['lib/actions/store.ts', 'getGoodsReceiptAuditTrail'],
    ['lib/actions/sourcing.ts', 'getExternalProcurementRequestAuditTrail'],
  ];
  for (const [f, fn] of fns) {
    const src = read(f);
    const i = src.indexOf(`export async function ${fn}(`);
    const body = src.slice(i, src.indexOf('\nexport ', i + 10));
    assert.ok(body.includes("orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]"), `${fn} is not newest-first`);
  }
});

// ------------------------------------------------------------ password links

test('password links: staff reset 1 h, staff welcome 72 h, customer reset 1 h, customer welcome 72 h; single use; newest only', () => {
  const staffAuth = read('lib/auth.ts');
  assert.match(staffAuth, /RESET_LINK_SECONDS = 60 \* 60;/);
  assert.match(staffAuth, /resetPasswordTokenExpiresIn: RESET_LINK_SECONDS/);
  assert.match(staffAuth, /verification\.deleteMany\(\{ where: \{ value: user\.id, identifier: \{ startsWith: 'reset-password:', not: `reset-password:\$\{token\}` \} \} \}\)/);

  const onboarding = read('lib/staff-onboarding.ts');
  assert.match(onboarding, /const SET_PASSWORD_HOURS = 72;/);
  const issue = onboarding.slice(onboarding.indexOf('export async function issueSetPasswordLink'));
  assert.ok(issue.indexOf('verification.deleteMany') < issue.indexOf('createVerificationValue'), 'earlier links are withdrawn before the new one');
  assert.match(issue, /hours \* 3600_000/);

  const customerAccess = read('lib/customer-access.ts');
  assert.match(customerAccess, /CUSTOMER_SET_PASSWORD_HOURS = 72;/);
  const cIssue = customerAccess.slice(customerAccess.indexOf('export async function issueCustomerSetPasswordLink'));
  assert.ok(cIssue.indexOf('customerVerification.deleteMany') < cIssue.indexOf('INSERT INTO customer_verifications'));
  assert.match(cIssue, /randomBytes\(32\)/);
  assert.match(cIssue, /\/customer-portal\/reset-password\?token=/);

  const customerAuth = readRepo('apps/website/lib/auth-customer.ts');
  assert.match(customerAuth, /RESET_LINK_SECONDS = 60 \* 60;/);
  assert.match(customerAuth, /resetPasswordTokenExpiresIn: RESET_LINK_SECONDS/);
  assert.match(customerAuth, /not: `reset-password:\$\{token\}`/);
  assert.match(customerAuth, /modelName: 'customerVerification'/);

  // Registration sends the right link: staff "Add" → welcome (72 h), customer register → welcome with set-password link.
  assert.ok(read('lib/actions/users-admin.ts').includes("sendStaffAccessEmail(created.id, 'welcome')"));
  assert.ok(onboarding.includes("kind === 'welcome' ? await issueSetPasswordLink(userId)"));
  assert.ok(customerAccess.includes('const setPasswordUrl = await issueCustomerSetPasswordLink(customer.id);'));
});
