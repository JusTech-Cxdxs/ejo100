"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Customers (CRM): the pure rules — registration checks, tags, the audit
 * diff, customer money (what THEY paid / owe), Lagos months, list filters —
 * the welcome email (a set-password link, never a password) and the
 * security fences of the CRM actions (read from the source).
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const crm_1 = require("../lib/crm");
const customer_welcome_1 = require("../lib/email-templates/customer-welcome");
const customer_broadcast_1 = require("../lib/email-templates/customer-broadcast");
const catalogue_1 = require("../lib/authz/catalogue");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (p) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, p), 'utf8');
const at = (s) => new Date(`${s}+01:00`); // Lagos time
(0, node_test_1.test)('phone: Nigerian-friendly — digits, spaces, a leading +, 7 to 20 characters', () => {
    strict_1.default.equal((0, crm_1.cleanPhone)('0803 123 4567'), '0803 123 4567');
    strict_1.default.equal((0, crm_1.cleanPhone)('  +234   803 123 4567 '), '+234 803 123 4567');
    strict_1.default.equal((0, crm_1.cleanPhone)('08031234567'), '08031234567');
    strict_1.default.throws(() => (0, crm_1.cleanPhone)(''), /required/);
    strict_1.default.equal((0, crm_1.cleanPhone)('', { required: false }), null);
    strict_1.default.throws(() => (0, crm_1.cleanPhone)('0803-123-4567'), /digits, spaces/);
    strict_1.default.throws(() => (0, crm_1.cleanPhone)('080+3123456'), /digits, spaces/);
    strict_1.default.throws(() => (0, crm_1.cleanPhone)('12345'), /between 7 and 20/);
    strict_1.default.throws(() => (0, crm_1.cleanPhone)('+234 803 123 4567 8901 2'), /between 7 and 20/);
    strict_1.default.throws(() => (0, crm_1.cleanPhone)('+ 1 2 3 4'), /7 and 20|7 digits/);
    strict_1.default.throws(() => (0, crm_1.cleanPhone)('abc', { required: false, label: 'Second phone number' }), /^Error: Second phone number|Second phone number/);
});
(0, node_test_1.test)('primary address: required, one short line, at most 80 characters', () => {
    strict_1.default.equal((0, crm_1.cleanPrimaryAddress)('  Plot 3,   Cheesebrough, Lagos '), 'Plot 3, Cheesebrough, Lagos');
    strict_1.default.throws(() => (0, crm_1.cleanPrimaryAddress)(''), /required/);
    strict_1.default.throws(() => (0, crm_1.cleanPrimaryAddress)('   '), /required/);
    strict_1.default.equal((0, crm_1.cleanPrimaryAddress)('x'.repeat(80)).length, 80);
    strict_1.default.throws(() => (0, crm_1.cleanPrimaryAddress)('x'.repeat(81)), /80 characters or fewer/);
});
(0, node_test_1.test)('email: lower-cased and checked', () => {
    strict_1.default.equal((0, crm_1.cleanEmail)('  Ada@Example.COM '), 'ada@example.com');
    strict_1.default.throws(() => (0, crm_1.cleanEmail)('not-an-email'), /valid email/);
    strict_1.default.throws(() => (0, crm_1.cleanEmail)(''), /required/);
});
(0, node_test_1.test)('tags: trimmed, de-duplicated (first spelling kept), capped', () => {
    strict_1.default.deepEqual((0, crm_1.normaliseTags)('Fleet, VIP ,  fleet,, Corporate  account'), ['Fleet', 'VIP', 'Corporate account']);
    strict_1.default.deepEqual((0, crm_1.normaliseTags)(['a', 'A', 'b']), ['a', 'b']);
    strict_1.default.deepEqual((0, crm_1.normaliseTags)(''), []);
    strict_1.default.throws(() => (0, crm_1.normaliseTags)('x'.repeat(31)), /at most 30/);
    strict_1.default.throws(() => (0, crm_1.normaliseTags)(Array.from({ length: 13 }, (_, i) => `t${i}`)), /At most 12/);
});
(0, node_test_1.test)('audit diff: only what changed, as { from, to } — never a password or token', () => {
    const before = { fullName: 'Ada', phone: '0803', altPhone: null, tags: ['VIP'], address: 'Lagos', isActive: true };
    const after = { fullName: 'Ada', phone: '0805', altPhone: '', tags: ['VIP', 'Fleet'], address: 'Lagos', password: 'secret', token: 'abc' };
    const d = (0, crm_1.diffChanges)(before, after);
    strict_1.default.deepEqual(d, { phone: { from: '0803', to: '0805' }, tags: { from: ['VIP'], to: ['VIP', 'Fleet'] } });
    strict_1.default.equal('password' in d || 'token' in d, false);
    strict_1.default.deepEqual((0, crm_1.diffChanges)({ a: 1 }, { a: 1 }), {});
    const lines = (0, crm_1.describeChanges)({ phone: { from: '0803', to: '0805' }, isActive: { from: true, to: false }, altPhone: { from: null, to: '0901' }, password: { from: 'x', to: 'y' } });
    strict_1.default.deepEqual(lines, ['Phone: 0803 → 0805', 'Portal access: on → off', 'Second phone: empty → 0901']);
    strict_1.default.equal((0, crm_1.customerActionLabel)('customer.address_added'), 'Address added');
    strict_1.default.equal((0, crm_1.customerActionLabel)('customer.some_new_thing'), 'Some new thing');
});
const job = (o) => ({ kind: 'JC', receivedAt: at('2026-03-01T09:00:00'), finishedAt: null, cancelled: false, customerBilled: 0, payments: [], refunds: [], ...o });
(0, node_test_1.test)('customer money: what the customer paid and owes (customer-billed lines only)', () => {
    const NOW = at('2026-10-15T12:00:00');
    const jobs = [
        // Finished, billed ₦80,000, paid in full in two parts (one last year).
        job({ id: 'A', receivedAt: at('2025-12-20T09:00:00'), finishedAt: at('2025-12-23T09:00:00'), customerBilled: 80000, payments: [{ at: at('2025-12-20T10:00:00'), amount: 56000 }, { at: at('2026-01-05T10:00:00'), amount: 24000 }] }),
        // Finished, billed ₦50,000, ₦20,000 paid — owes ₦30,000.
        job({ id: 'B', kind: 'SV', receivedAt: at('2026-10-01T09:00:00'), finishedAt: at('2026-10-02T09:00:00'), customerBilled: 50000, payments: [{ at: at('2026-10-01T10:00:00'), amount: 20000 }] }),
        // Cancelled after a ₦10,000 deposit, refunded ₦10,000: owes nothing, counts as a visit.
        job({ id: 'C', receivedAt: at('2026-09-01T09:00:00'), cancelled: true, customerBilled: 40000, payments: [{ at: at('2026-09-01T10:00:00'), amount: 10000 }], refunds: [{ at: at('2026-09-03T10:00:00'), amount: 10000 }] }),
        // Over-paid one job: never hides a debt on another.
        job({ id: 'D', receivedAt: at('2026-05-01T09:00:00'), finishedAt: at('2026-05-01T17:00:00'), customerBilled: 1000, payments: [{ at: at('2026-05-01T10:00:00'), amount: 5000 }] }),
        // Only booked (not received): not a visit.
        job({ id: 'E', kind: 'SV', receivedAt: null }),
    ];
    const m = (0, crm_1.customerMoney)(jobs, NOW);
    strict_1.default.equal(m.paidIn, 115000);
    strict_1.default.equal(m.refunded, 10000);
    strict_1.default.equal(m.netPaid, 105000);
    strict_1.default.equal(m.billed, 131000, 'finished, not-cancelled work only');
    strict_1.default.equal(m.outstanding, 30000);
    strict_1.default.equal(m.visits, 4);
    strict_1.default.equal(m.finishedJobs, 3);
    strict_1.default.equal(m.averageJob, 43666.67);
    // Turnaround: 3 days, 1 day, 8 hours → (3 + 1 + 0.333) / 3 = 1.4
    strict_1.default.equal(m.averageTurnaroundDays, 1.4);
    // This year (Lagos): 24,000 + 20,000 + 10,000 + 5,000 − 10,000 = 49,000
    strict_1.default.equal(m.netPaidThisYear, 49000);
    strict_1.default.equal(+m.lastVisit, +at('2026-10-01T09:00:00'));
    const empty = (0, crm_1.customerMoney)([], NOW);
    strict_1.default.equal(empty.averageJob, null);
    strict_1.default.equal(empty.averageTurnaroundDays, null);
    strict_1.default.equal(empty.lastVisit, null);
});
(0, node_test_1.test)('spend by Lagos calendar month: 00:30 on the 1st is the new month', () => {
    strict_1.default.equal((0, crm_1.lagosMonthKey)(new Date('2026-09-30T23:30:00Z')), '2026-10');
    strict_1.default.equal((0, crm_1.lagosMonthKey)(new Date('2026-09-30T22:30:00Z')), '2026-09');
    strict_1.default.equal(+(0, crm_1.lagosYearStart)(new Date('2025-12-31T23:30:00Z')), +new Date('2026-01-01T00:00:00+01:00'));
    const months = (0, crm_1.monthlySpend)([
        job({ id: 'A', finishedAt: at('2026-10-01T00:30:00'), customerBilled: 100, payments: [{ at: at('2026-10-01T00:30:00'), amount: 70 }], refunds: [{ at: at('2026-09-30T23:30:00'), amount: 20 }] }),
        job({ id: 'old', finishedAt: at('2025-01-01T12:00:00'), customerBilled: 999, payments: [{ at: at('2025-01-01T12:00:00'), amount: 999 }] }),
    ], at('2026-10-15T12:00:00'), 12);
    strict_1.default.equal(months.length, 12);
    strict_1.default.equal(months[11].key, '2026-10');
    strict_1.default.equal(months[0].key, '2025-11');
    strict_1.default.deepEqual({ paid: months[11].paid, billed: months[11].billed, net: months[11].net }, { paid: 70, billed: 100, net: 70 });
    strict_1.default.deepEqual({ refunds: months[10].refunds, net: months[10].net }, { refunds: 20, net: -20 });
    strict_1.default.equal(months.reduce((s, m) => s + m.paid, 0), 70, 'older than 12 months is left out');
});
(0, node_test_1.test)('profile gaps, open jobs and the hub filters, sort and pages', () => {
    strict_1.default.deepEqual((0, crm_1.profileGaps)({ address: null, phone: '0803' }), ['primary address']);
    strict_1.default.deepEqual((0, crm_1.profileGaps)({ address: ' ', phone: null }), ['primary address', 'phone']);
    strict_1.default.deepEqual((0, crm_1.profileGaps)({ address: 'Lagos', phone: '0803' }), []);
    strict_1.default.equal((0, crm_1.isOpenJob)('JC', 'IN_PROGRESS'), true);
    strict_1.default.equal((0, crm_1.isOpenJob)('JC', 'CHECKED_OUT'), false);
    strict_1.default.equal((0, crm_1.isOpenJob)('SV', 'SCHEDULED'), false, 'a booking is not open work');
    strict_1.default.equal((0, crm_1.isOpenJob)('SV', 'ESCALATED'), false);
    const row = (o) => ({ customerType: 'INDIVIDUAL', tags: [], isActive: true, createdAt: at('2026-01-01T09:00:00'), address: 'Lagos', phone: '0803', hasPortalAccount: true, lastLoginAt: null, vehicles: 0, openJobs: 0, netPaid: 0, lastVisit: null, ...o });
    const rows = [
        row({ id: '1', fullName: 'Zed Motors', customerType: 'ORGANIZATION', tags: ['Fleet'], netPaid: 500, openJobs: 1, createdAt: at('2026-03-01T09:00:00') }),
        row({ id: '2', fullName: 'ada', isActive: false, netPaid: 900, address: null, lastVisit: at('2026-09-01T09:00:00') }),
        row({ id: '3', fullName: 'Bola', lastLoginAt: at('2026-10-01T09:00:00'), createdAt: at('2026-02-01T09:00:00') }),
    ];
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { type: 'ORGANIZATION' }).map((r) => r.id), ['1']);
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { tag: 'fleet' }).map((r) => r.id), ['1']);
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { status: 'off' }).map((r) => r.id), ['2']);
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { open: 'yes' }).map((r) => r.id), ['1']);
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { portal: 'signed_in' }).map((r) => r.id), ['3']);
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { portal: 'never' }).map((r) => r.id), ['1'], 'switched-off customers are not "never signed in"');
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { gaps: 'yes' }).map((r) => r.id), ['2']);
    strict_1.default.deepEqual((0, crm_1.applyCrmFilters)(rows, { status: 'customer_created_emailed' }).map((r) => r.id), ['1', '2', '3'], 'unknown values never filter');
    strict_1.default.deepEqual((0, crm_1.sortCrmRows)(rows, 'name').map((r) => r.id), ['2', '3', '1']);
    strict_1.default.deepEqual((0, crm_1.sortCrmRows)(rows, 'spend').map((r) => r.id), ['2', '1', '3']);
    strict_1.default.deepEqual((0, crm_1.sortCrmRows)(rows, 'recent').map((r) => r.id), ['1', '3', '2']);
    strict_1.default.deepEqual((0, crm_1.sortCrmRows)(rows, 'last_visit').map((r) => r.id)[0], '2');
    const p = (0, crm_1.paginate)(Array.from({ length: 50 }, (_, i) => i), '3', 24);
    strict_1.default.deepEqual({ page: p.page, pages: p.pages, first: p.items[0], n: p.items.length }, { page: 3, pages: 3, first: 48, n: 2 });
    strict_1.default.equal((0, crm_1.paginate)([1, 2], 'x').page, 1);
    strict_1.default.equal((0, crm_1.paginate)([1, 2], '99').page, 1);
});
(0, node_test_1.test)('welcome email: a set-password link and what the portal is for — never a password, names escaped', () => {
    const { subject, html } = (0, customer_welcome_1.renderCustomerWelcomeEmail)({
        kind: 'welcome', customerName: 'Ada <b>Obi</b>', email: 'ada@example.com', setPasswordUrl: 'https://site.example/customer-portal/reset-password?token=tok_123', setPasswordHours: 72,
        signInUrl: 'https://site.example/customer-portal', logoUrl: 'https://site.example/images/logo/logo.png', companyName: 'Kewalram Nigeria', branchName: 'Isolo Branch',
        branchContact: { address: 'Plot 3, Isolo', phones: ['0800 000 0000'], email: 'isolo@example.com' },
    });
    strict_1.default.match(subject, /Welcome/);
    strict_1.default.ok(html.includes('Set my password'));
    strict_1.default.ok(html.includes('https://site.example/customer-portal/reset-password?token=tok_123'));
    strict_1.default.ok(html.includes('72 hours'));
    strict_1.default.ok(html.includes('ada@example.com'));
    strict_1.default.ok(html.includes('0800 000 0000') && html.includes('isolo@example.com'), 'branch contact');
    strict_1.default.doesNotMatch(html, /temporary password|Temporary password/i);
    strict_1.default.ok(!html.includes('<b>Obi</b>'), 'names are escaped');
    const again = (0, customer_welcome_1.renderCustomerWelcomeEmail)({ kind: 'access', customerName: 'Ada', email: 'a@b.co', setPasswordUrl: 'https://x/y?token=t', setPasswordHours: 72, signInUrl: 'https://x/customer-portal', logoUrl: 'https://x/l.png', companyName: 'K', branchName: '' });
    strict_1.default.match(again.subject, /set your customer portal password/);
    strict_1.default.ok(again.html.includes('Any earlier link no longer works'));
    const bc = (0, customer_broadcast_1.renderCustomerBroadcastEmail)({ customerName: 'Ada', title: 'Closed <Monday>', message: 'Line one\n\nLine two', categoryLabel: 'Announcement', portalUrl: 'https://x/customer-portal', logoUrl: 'https://x/l.png', companyName: 'K' });
    strict_1.default.ok(bc.html.includes('Line one') && bc.html.includes('Line two'));
    strict_1.default.ok(!bc.html.includes('<Monday>'));
});
(0, node_test_1.test)('permissions: who sees and who manages customers', () => {
    const who = (roleSlugs) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null });
    for (const r of ['receptionist', 'workshop-supervisor', 'workshop-manager', 'administrator', 'branch-administrator'])
        strict_1.default.ok((0, catalogue_1.decide)(who([r]), 'crm.view').allowed, `${r} sees customers`);
    for (const r of ['receptionist', 'workshop-manager', 'administrator', 'branch-administrator'])
        strict_1.default.ok((0, catalogue_1.decide)(who([r]), 'crm.manage').allowed, `${r} manages customers`);
    for (const r of ['technician', 'finance-officer', 'store-officer', 'security-officer', 'broadcaster'])
        strict_1.default.equal((0, catalogue_1.decide)(who([r]), 'crm.view').allowed, false, `${r} does not open the CRM`);
    strict_1.default.equal((0, catalogue_1.decide)(who(['workshop-supervisor']), 'crm.manage').allowed, false, 'supervisors view only');
    // Never across organisations.
    strict_1.default.equal((0, catalogue_1.decide)({ ...who(['administrator']), orgBranchIds: ['b1'] }, 'crm.view', { branchId: 'other-org' }).allowed, false);
});
(0, node_test_1.test)('CRM actions: authorised, fenced to the organisation, audited — and the token never reaches the audit trail', () => {
    const src = read('lib/actions/crm.ts');
    for (const part of src.split('\nexport async function ').slice(1)) {
        const name = part.slice(0, part.indexOf('('));
        const body = part.slice(0, part.indexOf('\nexport ') === -1 ? undefined : part.indexOf('\nexport '));
        if (name === 'canSeeCrm' || name === 'getCustomerNames')
            continue;
        strict_1.default.match(body, /authorize\(|allows\(/, `${name} checks a permission`);
        if (/\(\s*\w*[iI]d\w*\s*:/.test(part.slice(0, part.indexOf(')') + 1)))
            strict_1.default.match(body, /fencedCustomer|orgWhere\(/, `${name} checks the customer's organisation`);
        if (/prisma\.\w+\.(create|update|delete|deleteMany)\(|tx\.\w+\.(update|delete)/.test(body))
            strict_1.default.match(body, /await audit\(/, `${name} writes the customer audit trail`);
    }
    strict_1.default.match(src, /async function fencedCustomer\(id: string\)[\s\S]{0,200}orgWhere\(\)/);
    strict_1.default.match(src, /if \(!active\) await tx\.customerSession\.deleteMany\(\{ where: \{ customerId: c\.id \} \}\)/, 'switching off signs them out at once');
    strict_1.default.match(src, /You can only delete notes you wrote yourself/);
    const access = read('lib/customer-access.ts');
    strict_1.default.match(access, /customerVerification\.deleteMany\(\{ where: \{ value: customerId, identifier: \{ startsWith: 'reset-password:' \} \} \}\)/, 'a new link withdraws earlier ones');
    strict_1.default.match(access, /randomBytes\(32\)/);
    strict_1.default.match(access, /\/customer-portal\/reset-password\?token=/);
    strict_1.default.match(access, /\$executeRaw`INSERT INTO customer_verifications/, 'written outside the data journal — the identifier is the token');
    strict_1.default.doesNotMatch(access, /customerVerification\.create\(/);
    const ws = read('lib/actions/workshop.ts');
    const reg = ws.slice(ws.indexOf('export async function findOrCreateCustomer('), ws.indexOf('// VEHICLES'));
    strict_1.default.match(reg, /cleanPrimaryAddress\(input\.address\)/);
    strict_1.default.match(reg, /cleanPhone\(input\.phone, \{ required: true/);
    strict_1.default.match(reg, /already registered on the platform/);
    strict_1.default.doesNotMatch(reg, /temporaryPassword|generateSecurePassword/, 'no password is ever emailed');
});
(0, node_test_1.test)('customer broadcasts never reach staff', () => {
    const rules = read('lib/notification-rules.ts');
    const fn = rules.slice(rules.indexOf('export function reaches('), rules.indexOf('export function reaches(') + 700);
    strict_1.default.doesNotMatch(fn, /CUSTOMERS/);
    strict_1.default.match(fn, /return false;\n\}/);
    const delivery = read('lib/broadcast-delivery.ts');
    strict_1.default.match(delivery, /if \(isCustomerAudience\(b\.audience\)\) \{[\s\S]{0,400}continue;/, 'customer broadcasts take the customer path, never the staff one');
    strict_1.default.match(delivery, /notifyByEmail: true/);
    const actions = read('lib/actions/notifications.ts');
    strict_1.default.match(actions, /CUSTOMERS_SELECTED'\) \{[\s\S]{0,400}organisationId: m\.organisationId!/, 'chosen customers must belong to the organisation');
});
