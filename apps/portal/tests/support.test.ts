/**
 * The support inbox (hand-overs from Enyo): who sees which tickets, the inbox
 * tabs, SUP numbers in the search and on record links, and the menu entry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanReply, filterWhere, isSupportStatus, supportFilter, ticketReachWhere, waitLabel, SUPPORT_STATUS_FOR_CUSTOMER } from '../lib/support-rules';
import { planSearch, numberFilters, referenceUrl, REFERENCE_PATTERN } from '../lib/search-plan';
import { decide, type Principal } from '../lib/authz/catalogue';
import { navigationFor } from '../lib/authz/navigation';

const ROOT = join(__dirname, '..', '..');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null, orgBranchIds: ['b1', 'b2'], organisationId: 'o1', ...extra });

test('ticket fence: always the organisation; branch staff see their branch and the website enquiries (no branch)', () => {
  assert.deepEqual(ticketReachWhere({ branchId: 'b1' }, 'o1'), { AND: [{ organisationId: 'o1' }, { OR: [{ branchId: 'b1' }, { branchId: null }] }] });
  assert.deepEqual(ticketReachWhere({ branchId: { in: ['b1', 'b2'] } }, 'o1'), { AND: [{ organisationId: 'o1' }, { OR: [{ branchId: { in: ['b1', 'b2'] } }, { branchId: null }] }] });
  assert.deepEqual(ticketReachWhere({ branchId: '__no_access__' }, 'o1'), { id: '__no_access__' }, 'no permission: nothing at all');
  assert.deepEqual(ticketReachWhere({ branchId: 'b1' }, null), { AND: [{ organisationId: '__no_organisation__' }, { OR: [{ branchId: 'b1' }, { branchId: null }] }] }, 'no organisation fails closed');
  assert.deepEqual(ticketReachWhere({}, null), {}, 'the platform team (no organisation, every branch)');
});

test('who may handle tickets: front desk, workshop manager and administrators — not the workshop floor', () => {
  for (const role of ['receptionist', 'workshop-manager', 'administrator', 'branch-administrator']) assert.equal(decide(who([role]), 'support.tickets.manage').allowed, true, role);
  for (const role of ['technician', 'workshop-supervisor', 'finance-officer', 'security-officer', 'store-officer', 'branch-assistant']) assert.equal(decide(who([role]), 'support.tickets.manage').allowed, false, role);
  // Branch-scoped: another branch's ticket is out of reach.
  assert.equal(decide(who(['receptionist']), 'support.tickets.manage', { branchId: 'b2' }).allowed, false);
  assert.equal(decide(who(['administrator']), 'support.tickets.manage', { branchId: 'b2' }).allowed, true);
  // Another organisation's branch never.
  assert.equal(decide(who(['administrator']), 'support.tickets.manage', { branchId: 'other-org-branch' }).allowed, false);
});

test('the menu: "Support centre" right under Customers, for people who handle tickets only', () => {
  const keys = (roles: string[]) => navigationFor(who(roles)).map((i) => i.key);
  for (const role of ['receptionist', 'workshop-manager', 'administrator']) {
    const k = keys([role]);
    assert.ok(k.includes('support-inbox'), role);
    assert.equal(k.indexOf('support-inbox'), k.indexOf('crm') + 1, `${role}: under Customers`);
  }
  for (const role of ['technician', 'workshop-supervisor', 'finance-officer']) assert.ok(!keys([role]).includes('support-inbox'), role);
  assert.equal(navigationFor(who(['receptionist'])).find((i) => i.key === 'support-inbox')?.href, '/crm/support');
});

test('inbox tabs', () => {
  assert.equal(supportFilter('waiting'), 'waiting');
  assert.equal(supportFilter('<script>'), 'open');
  assert.equal(supportFilter(undefined), 'open');
  assert.deepEqual(filterWhere('open', 'u'), { status: { in: ['OPEN'] } });
  assert.deepEqual(filterWhere('waiting', 'u'), { status: { in: ['WAITING_ON_CUSTOMER'] } });
  assert.deepEqual(filterWhere('resolved', 'u'), { status: { in: ['RESOLVED', 'CLOSED'] } });
  assert.deepEqual(filterWhere('mine', 'u'), { assignedToId: 'u', status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } });
  assert.deepEqual(filterWhere('unassigned', 'u'), { status: { in: ['OPEN', 'ON_HOLD'] }, assignedToId: null });
  assert.deepEqual(filterWhere('on_hold', 'u'), { status: { in: ['ON_HOLD'] } });
  assert.deepEqual(filterWhere('all', 'u'), {});
  assert.equal(isSupportStatus('RESOLVED'), true);
  assert.equal(isSupportStatus('DELETED'), false);
  assert.equal(SUPPORT_STATUS_FOR_CUSTOMER.WAITING_ON_CUSTOMER, 'Waiting for your reply');
});

test('first-response time reads plainly', () => {
  const t0 = new Date('2026-10-14T08:00:00Z');
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  assert.equal(waitLabel(t0, at(0.2)), 'under a minute');
  assert.equal(waitLabel(t0, at(12)), '12 min');
  assert.equal(waitLabel(t0, at(60)), '1 h');
  assert.equal(waitLabel(t0, at(185)), '3 h 5 min');
  assert.equal(waitLabel(t0, at(60 * 24)), '1 day');
  assert.equal(waitLabel(t0, at(60 * 24 * 3 + 10)), '3 days');
});

test('replies keep their line breaks, lose the excess', () => {
  assert.equal(cleanReply('  Hello\r\n\r\n\r\n\r\nThanks  '), 'Hello\n\nThanks');
  assert.equal(cleanReply(undefined), '');
});

test('SUP numbers are searchable and link to the ticket', () => {
  const p = planSearch('SUP-2026-000014');
  assert.equal(p.kind, 'reference');
  assert.deepEqual(p.prefixes, ['SUP']);
  assert.deepEqual(numberFilters(p, 'SUP'), [{ equals: 'SUP-2026-000014' }]);
  assert.deepEqual(planSearch('sup').prefixes, ['SUP']);
  assert.ok(planSearch('s').prefixes.includes('SUP'));
  assert.equal(referenceUrl('SUP', 'abc'), '/crm/support/abc');
  assert.deepEqual([...'Ticket SUP-2026-000014 opened'.matchAll(REFERENCE_PATTERN)].map((m) => m[0]), ['SUP-2026-000014']);
  // Search and the record links read the same list.
  const search = readFileSync(join(ROOT, 'lib', 'actions', 'search.ts'), 'utf8');
  assert.match(search, /numbers: \[\['SUP', 'number'\]\]/);
  assert.match(search, /find\(supportReach,/);
  const resolver = readFileSync(join(ROOT, 'lib', 'record-resolver.ts'), 'utf8');
  assert.match(resolver, /q\('SUP'/);
});

test('the actions: authorise, fence, audit; staff replies are compare-and-set and never log the text', () => {
  const src = readFileSync(join(ROOT, 'lib', 'actions', 'support.ts'), 'utf8');
  for (const fn of ['getSupportInbox', 'getSupportTicket', 'replyToSupportTicket', 'setSupportTicketStatus', 'assignSupportTicket']) {
    const i = src.indexOf(`export async function ${fn}(`);
    assert.ok(i !== -1, fn);
    const body = src.slice(i, src.indexOf('\nexport ', i + 10) === -1 ? undefined : src.indexOf('\nexport ', i + 10));
    assert.match(body, /await authorize\('support\.tickets\.manage'|await authorize\(PERM/, `${fn} authorises`);
    assert.match(body, /ticketReachWhere\(await reachWhere\(PERM\), await myOrganisationId\(\)\)/, `${fn} is fenced`);
  }
  for (const action of ['support.replied', 'support.status_changed', 'support.assigned']) assert.ok(src.includes(`action: '${action}'`), action);
  assert.doesNotMatch(src, /metadata: \{[^}]*\bbody\b/, 'the reply text is never put in the audit trail');
});

test('a customer\'s own Support page: only their tickets, staff names never shown', () => {
  const data = readFileSync(join(ROOT, '..', 'website', 'lib', 'customer-portal', 'data.ts'), 'utf8');
  // Their own, or a website request left with their own account's email (never linked by a typed address alone).
  assert.match(data, /where: \{ organisationId, OR: \[\{ customerId \}, \.\.\.\(e \? \[\{ customerId: null, channel: 'WEBSITE' as const, contactEmail: \{ equals: e, mode: 'insensitive' as const \} \}\] : \[\]\)\] \}/);
  assert.doesNotMatch(data.slice(data.indexOf('loadSupportTickets')), /authorUserId|summary: true/);
  const action = readFileSync(join(ROOT, '..', 'website', 'lib', 'customer-portal', 'support.ts'), 'utf8');
  assert.match(action, /where: \{ id: ticketId, organisationId: me\.organisationId, OR: \[\{ customerId: me\.id \}, \{ customerId: null, channel: 'WEBSITE', contactEmail: \{ equals: me\.email, mode: 'insensitive' \} \}\] \}/);
});
