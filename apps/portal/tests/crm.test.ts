/**
 * Customers (CRM): the pure rules — registration checks, tags, the audit
 * diff, customer money (what THEY paid / owe), Lagos months, list filters —
 * the welcome email (a set-password link, never a password) and the
 * security fences of the CRM actions (read from the source).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanPhone, cleanPrimaryAddress, cleanEmail, normaliseTags, diffChanges, describeChanges, customerMoney, monthlySpend, lagosMonthKey,
  lagosYearStart, profileGaps, applyCrmFilters, sortCrmRows, paginate, customerActionLabel, isOpenJob, type CrmJob, type CrmRow,
} from '../lib/crm';
import { renderCustomerWelcomeEmail } from '../lib/email-templates/customer-welcome';
import { renderCustomerBroadcastEmail } from '../lib/email-templates/customer-broadcast';
import { decide, type Principal } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const at = (s: string) => new Date(`${s}+01:00`); // Lagos time

test('phone: Nigerian-friendly — digits, spaces, a leading +, 7 to 20 characters', () => {
  assert.equal(cleanPhone('0803 123 4567'), '0803 123 4567');
  assert.equal(cleanPhone('  +234   803 123 4567 '), '+234 803 123 4567');
  assert.equal(cleanPhone('08031234567'), '08031234567');
  assert.throws(() => cleanPhone(''), /required/);
  assert.equal(cleanPhone('', { required: false }), null);
  assert.throws(() => cleanPhone('0803-123-4567'), /digits, spaces/);
  assert.throws(() => cleanPhone('080+3123456'), /digits, spaces/);
  assert.throws(() => cleanPhone('12345'), /between 7 and 20/);
  assert.throws(() => cleanPhone('+234 803 123 4567 8901 2'), /between 7 and 20/);
  assert.throws(() => cleanPhone('+ 1 2 3 4'), /7 and 20|7 digits/);
  assert.throws(() => cleanPhone('abc', { required: false, label: 'Second phone number' }), /^Error: Second phone number|Second phone number/);
});

test('primary address: required, one short line, at most 80 characters', () => {
  assert.equal(cleanPrimaryAddress('  Plot 3,   Cheesebrough, Lagos '), 'Plot 3, Cheesebrough, Lagos');
  assert.throws(() => cleanPrimaryAddress(''), /required/);
  assert.throws(() => cleanPrimaryAddress('   '), /required/);
  assert.equal(cleanPrimaryAddress('x'.repeat(80)).length, 80);
  assert.throws(() => cleanPrimaryAddress('x'.repeat(81)), /80 characters or fewer/);
});

test('email: lower-cased and checked', () => {
  assert.equal(cleanEmail('  Ada@Example.COM '), 'ada@example.com');
  assert.throws(() => cleanEmail('not-an-email'), /valid email/);
  assert.throws(() => cleanEmail(''), /required/);
});

test('tags: trimmed, de-duplicated (first spelling kept), capped', () => {
  assert.deepEqual(normaliseTags('Fleet, VIP ,  fleet,, Corporate  account'), ['Fleet', 'VIP', 'Corporate account']);
  assert.deepEqual(normaliseTags(['a', 'A', 'b']), ['a', 'b']);
  assert.deepEqual(normaliseTags(''), []);
  assert.throws(() => normaliseTags('x'.repeat(31)), /at most 30/);
  assert.throws(() => normaliseTags(Array.from({ length: 13 }, (_, i) => `t${i}`)), /At most 12/);
});

test('audit diff: only what changed, as { from, to } — never a password or token', () => {
  const before = { fullName: 'Ada', phone: '0803', altPhone: null, tags: ['VIP'], address: 'Lagos', isActive: true };
  const after = { fullName: 'Ada', phone: '0805', altPhone: '', tags: ['VIP', 'Fleet'], address: 'Lagos', password: 'secret', token: 'abc' };
  const d = diffChanges(before as Record<string, unknown>, after as Record<string, unknown>);
  assert.deepEqual(d, { phone: { from: '0803', to: '0805' }, tags: { from: ['VIP'], to: ['VIP', 'Fleet'] } });
  assert.equal('password' in d || 'token' in d, false);
  assert.deepEqual(diffChanges({ a: 1 }, { a: 1 }), {});
  const lines = describeChanges({ phone: { from: '0803', to: '0805' }, isActive: { from: true, to: false }, altPhone: { from: null, to: '0901' }, password: { from: 'x', to: 'y' } });
  assert.deepEqual(lines, ['Phone: 0803 → 0805', 'Portal access: on → off', 'Second phone: empty → 0901']);
  assert.equal(customerActionLabel('customer.address_added'), 'Address added');
  assert.equal(customerActionLabel('customer.some_new_thing'), 'Some new thing');
});

const job = (o: Partial<CrmJob> & Pick<CrmJob, 'id'>): CrmJob => ({ kind: 'JC', receivedAt: at('2026-03-01T09:00:00'), finishedAt: null, cancelled: false, customerBilled: 0, payments: [], refunds: [], ...o });

test('customer money: what the customer paid and owes (customer-billed lines only)', () => {
  const NOW = at('2026-10-15T12:00:00');
  const jobs: CrmJob[] = [
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
  const m = customerMoney(jobs, NOW);
  assert.equal(m.paidIn, 115000);
  assert.equal(m.refunded, 10000);
  assert.equal(m.netPaid, 105000);
  assert.equal(m.billed, 131000, 'finished, not-cancelled work only');
  assert.equal(m.outstanding, 30000);
  assert.equal(m.visits, 4);
  assert.equal(m.finishedJobs, 3);
  assert.equal(m.averageJob, 43666.67);
  // Turnaround: 3 days, 1 day, 8 hours → (3 + 1 + 0.333) / 3 = 1.4
  assert.equal(m.averageTurnaroundDays, 1.4);
  // This year (Lagos): 24,000 + 20,000 + 10,000 + 5,000 − 10,000 = 49,000
  assert.equal(m.netPaidThisYear, 49000);
  assert.equal(+m.lastVisit!, +at('2026-10-01T09:00:00'));
  const empty = customerMoney([], NOW);
  assert.equal(empty.averageJob, null);
  assert.equal(empty.averageTurnaroundDays, null);
  assert.equal(empty.lastVisit, null);
});

test('spend by Lagos calendar month: 00:30 on the 1st is the new month', () => {
  assert.equal(lagosMonthKey(new Date('2026-09-30T23:30:00Z')), '2026-10');
  assert.equal(lagosMonthKey(new Date('2026-09-30T22:30:00Z')), '2026-09');
  assert.equal(+lagosYearStart(new Date('2025-12-31T23:30:00Z')), +new Date('2026-01-01T00:00:00+01:00'));
  const months = monthlySpend([
    job({ id: 'A', finishedAt: at('2026-10-01T00:30:00'), customerBilled: 100, payments: [{ at: at('2026-10-01T00:30:00'), amount: 70 }], refunds: [{ at: at('2026-09-30T23:30:00'), amount: 20 }] }),
    job({ id: 'old', finishedAt: at('2025-01-01T12:00:00'), customerBilled: 999, payments: [{ at: at('2025-01-01T12:00:00'), amount: 999 }] }),
  ], at('2026-10-15T12:00:00'), 12);
  assert.equal(months.length, 12);
  assert.equal(months[11]!.key, '2026-10');
  assert.equal(months[0]!.key, '2025-11');
  assert.deepEqual({ paid: months[11]!.paid, billed: months[11]!.billed, net: months[11]!.net }, { paid: 70, billed: 100, net: 70 });
  assert.deepEqual({ refunds: months[10]!.refunds, net: months[10]!.net }, { refunds: 20, net: -20 });
  assert.equal(months.reduce((s, m) => s + m.paid, 0), 70, 'older than 12 months is left out');
});

test('profile gaps, open jobs and the hub filters, sort and pages', () => {
  assert.deepEqual(profileGaps({ address: null, phone: '0803' }), ['primary address']);
  assert.deepEqual(profileGaps({ address: ' ', phone: null }), ['primary address', 'phone']);
  assert.deepEqual(profileGaps({ address: 'Lagos', phone: '0803' }), []);
  assert.equal(isOpenJob('JC', 'IN_PROGRESS'), true);
  assert.equal(isOpenJob('JC', 'CHECKED_OUT'), false);
  assert.equal(isOpenJob('SV', 'SCHEDULED'), false, 'a booking is not open work');
  assert.equal(isOpenJob('SV', 'ESCALATED'), false);
  const row = (o: Partial<CrmRow> & Pick<CrmRow, 'id' | 'fullName'>): CrmRow => ({ customerType: 'INDIVIDUAL', tags: [], isActive: true, createdAt: at('2026-01-01T09:00:00'), address: 'Lagos', phone: '0803', hasPortalAccount: true, lastLoginAt: null, vehicles: 0, openJobs: 0, netPaid: 0, lastVisit: null, ...o });
  const rows = [
    row({ id: '1', fullName: 'Zed Motors', customerType: 'ORGANIZATION', tags: ['Fleet'], netPaid: 500, openJobs: 1, createdAt: at('2026-03-01T09:00:00') }),
    row({ id: '2', fullName: 'ada', isActive: false, netPaid: 900, address: null, lastVisit: at('2026-09-01T09:00:00') }),
    row({ id: '3', fullName: 'Bola', lastLoginAt: at('2026-10-01T09:00:00'), createdAt: at('2026-02-01T09:00:00') }),
  ];
  assert.deepEqual(applyCrmFilters(rows, { type: 'ORGANIZATION' }).map((r) => r.id), ['1']);
  assert.deepEqual(applyCrmFilters(rows, { tag: 'fleet' }).map((r) => r.id), ['1']);
  assert.deepEqual(applyCrmFilters(rows, { status: 'off' }).map((r) => r.id), ['2']);
  assert.deepEqual(applyCrmFilters(rows, { open: 'yes' }).map((r) => r.id), ['1']);
  assert.deepEqual(applyCrmFilters(rows, { portal: 'signed_in' }).map((r) => r.id), ['3']);
  assert.deepEqual(applyCrmFilters(rows, { portal: 'never' }).map((r) => r.id), ['1'], 'switched-off customers are not "never signed in"');
  assert.deepEqual(applyCrmFilters(rows, { gaps: 'yes' }).map((r) => r.id), ['2']);
  assert.deepEqual(applyCrmFilters(rows, { status: 'customer_created_emailed' }).map((r) => r.id), ['1', '2', '3'], 'unknown values never filter');
  assert.deepEqual(sortCrmRows(rows, 'name').map((r) => r.id), ['2', '3', '1']);
  assert.deepEqual(sortCrmRows(rows, 'spend').map((r) => r.id), ['2', '1', '3']);
  assert.deepEqual(sortCrmRows(rows, 'recent').map((r) => r.id), ['1', '3', '2']);
  assert.deepEqual(sortCrmRows(rows, 'last_visit').map((r) => r.id)[0], '2');
  const p = paginate(Array.from({ length: 50 }, (_, i) => i), '3', 24);
  assert.deepEqual({ page: p.page, pages: p.pages, first: p.items[0], n: p.items.length }, { page: 3, pages: 3, first: 48, n: 2 });
  assert.equal(paginate([1, 2], 'x').page, 1);
  assert.equal(paginate([1, 2], '99').page, 1);
});

test('welcome email: a set-password link and what the portal is for — never a password, names escaped', () => {
  const { subject, html } = renderCustomerWelcomeEmail({
    kind: 'welcome', customerName: 'Ada <b>Obi</b>', email: 'ada@example.com', setPasswordUrl: 'https://site.example/customer-portal/reset-password?token=tok_123', setPasswordHours: 72,
    signInUrl: 'https://site.example/customer-portal', logoUrl: 'https://site.example/images/logo/logo.png', companyName: 'Kewalram Nigeria', branchName: 'Isolo Branch',
    branchContact: { address: 'Plot 3, Isolo', phones: ['0800 000 0000'], email: 'isolo@example.com' },
  });
  assert.match(subject, /Welcome/);
  assert.ok(html.includes('Set my password'));
  assert.ok(html.includes('https://site.example/customer-portal/reset-password?token=tok_123'));
  assert.ok(html.includes('72 hours'));
  assert.ok(html.includes('ada@example.com'));
  assert.ok(html.includes('0800 000 0000') && html.includes('isolo@example.com'), 'branch contact');
  assert.doesNotMatch(html, /temporary password|Temporary password/i);
  assert.ok(!html.includes('<b>Obi</b>'), 'names are escaped');
  const again = renderCustomerWelcomeEmail({ kind: 'access', customerName: 'Ada', email: 'a@b.co', setPasswordUrl: 'https://x/y?token=t', setPasswordHours: 72, signInUrl: 'https://x/customer-portal', logoUrl: 'https://x/l.png', companyName: 'K', branchName: '' });
  assert.match(again.subject, /set your customer portal password/);
  assert.ok(again.html.includes('Any earlier link no longer works'));
  const bc = renderCustomerBroadcastEmail({ customerName: 'Ada', title: 'Closed <Monday>', message: 'Line one\n\nLine two', categoryLabel: 'Announcement', portalUrl: 'https://x/customer-portal', logoUrl: 'https://x/l.png', companyName: 'K' });
  assert.ok(bc.html.includes('Line one') && bc.html.includes('Line two'));
  assert.ok(!bc.html.includes('<Monday>'));
});

test('permissions: who sees and who manages customers', () => {
  const who = (roleSlugs: string[]): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null });
  for (const r of ['receptionist', 'workshop-supervisor', 'workshop-manager', 'administrator', 'branch-administrator']) assert.ok(decide(who([r]), 'crm.view').allowed, `${r} sees customers`);
  for (const r of ['receptionist', 'workshop-manager', 'administrator', 'branch-administrator']) assert.ok(decide(who([r]), 'crm.manage').allowed, `${r} manages customers`);
  for (const r of ['technician', 'finance-officer', 'store-officer', 'security-officer', 'broadcaster']) assert.equal(decide(who([r]), 'crm.view').allowed, false, `${r} does not open the CRM`);
  assert.equal(decide(who(['workshop-supervisor']), 'crm.manage').allowed, false, 'supervisors view only');
  // Never across organisations.
  assert.equal(decide({ ...who(['administrator']), orgBranchIds: ['b1'] }, 'crm.view', { branchId: 'other-org' }).allowed, false);
});

test('CRM actions: authorised, fenced to the organisation, audited — and the token never reaches the audit trail', () => {
  const src = read('lib/actions/crm.ts');
  for (const part of src.split('\nexport async function ').slice(1)) {
    const name = part.slice(0, part.indexOf('('));
    const body = part.slice(0, part.indexOf('\nexport ') === -1 ? undefined : part.indexOf('\nexport '));
    if (name === 'canSeeCrm' || name === 'getCustomerNames') continue;
    assert.match(body, /authorize\(|allows\(/, `${name} checks a permission`);
    if (/\(\s*\w*[iI]d\w*\s*:/.test(part.slice(0, part.indexOf(')') + 1))) assert.match(body, /fencedCustomer|orgWhere\(/, `${name} checks the customer's organisation`);
    if (/prisma\.\w+\.(create|update|delete|deleteMany)\(|tx\.\w+\.(update|delete)/.test(body)) assert.match(body, /await audit\(/, `${name} writes the customer audit trail`);
  }
  assert.match(src, /async function fencedCustomer\(id: string\)[\s\S]{0,200}orgWhere\(\)/);
  assert.match(src, /if \(!active\) await tx\.customerSession\.deleteMany\(\{ where: \{ customerId: c\.id \} \}\)/, 'switching off signs them out at once');
  assert.match(src, /You can only delete notes you wrote yourself/);
  const access = read('lib/customer-access.ts');
  assert.match(access, /customerVerification\.deleteMany\(\{ where: \{ value: customerId, identifier: \{ startsWith: 'reset-password:' \} \} \}\)/, 'a new link withdraws earlier ones');
  assert.match(access, /randomBytes\(32\)/);
  assert.match(access, /\/customer-portal\/reset-password\?token=/);
  assert.match(access, /\$executeRaw`INSERT INTO customer_verifications/, 'written outside the data journal — the identifier is the token');
  assert.doesNotMatch(access, /customerVerification\.create\(/);
  const ws = read('lib/actions/workshop.ts');
  const reg = ws.slice(ws.indexOf('export async function findOrCreateCustomer('), ws.indexOf('// VEHICLES'));
  assert.match(reg, /cleanPrimaryAddress\(input\.address\)/);
  assert.match(reg, /cleanPhone\(input\.phone, \{ required: true/);
  assert.match(reg, /already registered on the platform/);
  assert.doesNotMatch(reg, /temporaryPassword|generateSecurePassword/, 'no password is ever emailed');
});

test('customer broadcasts never reach staff', () => {
  const rules = read('lib/notification-rules.ts');
  const fn = rules.slice(rules.indexOf('export function reaches('), rules.indexOf('export function reaches(') + 700);
  assert.doesNotMatch(fn, /CUSTOMERS/);
  assert.match(fn, /return false;\n\}/);
  const delivery = read('lib/broadcast-delivery.ts');
  assert.match(delivery, /if \(isCustomerAudience\(b\.audience\)\) \{[\s\S]{0,400}continue;/, 'customer broadcasts take the customer path, never the staff one');
  assert.match(delivery, /notifyByEmail: true/);
  const actions = read('lib/actions/notifications.ts');
  assert.match(actions, /CUSTOMERS_SELECTED'\) \{[\s\S]{0,400}organisationId: m\.organisationId!/, 'chosen customers must belong to the organisation');
});
