"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The support inbox (hand-overs from Enyo): who sees which tickets, the inbox
 * tabs, SUP numbers in the search and on record links, and the menu entry.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const support_rules_1 = require("../lib/support-rules");
const search_plan_1 = require("../lib/search-plan");
const catalogue_1 = require("../lib/authz/catalogue");
const navigation_1 = require("../lib/authz/navigation");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null, orgBranchIds: ['b1', 'b2'], organisationId: 'o1', ...extra });
(0, node_test_1.test)('ticket fence: always the organisation; branch staff see their branch and the website enquiries (no branch)', () => {
    strict_1.default.deepEqual((0, support_rules_1.ticketReachWhere)({ branchId: 'b1' }, 'o1'), { AND: [{ organisationId: 'o1' }, { OR: [{ branchId: 'b1' }, { branchId: null }] }] });
    strict_1.default.deepEqual((0, support_rules_1.ticketReachWhere)({ branchId: { in: ['b1', 'b2'] } }, 'o1'), { AND: [{ organisationId: 'o1' }, { OR: [{ branchId: { in: ['b1', 'b2'] } }, { branchId: null }] }] });
    strict_1.default.deepEqual((0, support_rules_1.ticketReachWhere)({ branchId: '__no_access__' }, 'o1'), { id: '__no_access__' }, 'no permission: nothing at all');
    strict_1.default.deepEqual((0, support_rules_1.ticketReachWhere)({ branchId: 'b1' }, null), { AND: [{ organisationId: '__no_organisation__' }, { OR: [{ branchId: 'b1' }, { branchId: null }] }] }, 'no organisation fails closed');
    strict_1.default.deepEqual((0, support_rules_1.ticketReachWhere)({}, null), {}, 'the platform team (no organisation, every branch)');
});
(0, node_test_1.test)('who may handle tickets: front desk, workshop manager and administrators — not the workshop floor', () => {
    for (const role of ['receptionist', 'workshop-manager', 'administrator', 'branch-administrator'])
        strict_1.default.equal((0, catalogue_1.decide)(who([role]), 'support.tickets.manage').allowed, true, role);
    for (const role of ['technician', 'workshop-supervisor', 'finance-officer', 'security-officer', 'store-officer', 'branch-assistant'])
        strict_1.default.equal((0, catalogue_1.decide)(who([role]), 'support.tickets.manage').allowed, false, role);
    // Branch-scoped: another branch's ticket is out of reach.
    strict_1.default.equal((0, catalogue_1.decide)(who(['receptionist']), 'support.tickets.manage', { branchId: 'b2' }).allowed, false);
    strict_1.default.equal((0, catalogue_1.decide)(who(['administrator']), 'support.tickets.manage', { branchId: 'b2' }).allowed, true);
    // Another organisation's branch never.
    strict_1.default.equal((0, catalogue_1.decide)(who(['administrator']), 'support.tickets.manage', { branchId: 'other-org-branch' }).allowed, false);
});
(0, node_test_1.test)('the menu: "Support centre" right under Customers, for people who handle tickets only', () => {
    const keys = (roles) => (0, navigation_1.navigationFor)(who(roles)).map((i) => i.key);
    for (const role of ['receptionist', 'workshop-manager', 'administrator']) {
        const k = keys([role]);
        strict_1.default.ok(k.includes('support-inbox'), role);
        strict_1.default.equal(k.indexOf('support-inbox'), k.indexOf('crm') + 1, `${role}: under Customers`);
    }
    for (const role of ['technician', 'workshop-supervisor', 'finance-officer'])
        strict_1.default.ok(!keys([role]).includes('support-inbox'), role);
    strict_1.default.equal((0, navigation_1.navigationFor)(who(['receptionist'])).find((i) => i.key === 'support-inbox')?.href, '/crm/support');
});
(0, node_test_1.test)('inbox tabs', () => {
    strict_1.default.equal((0, support_rules_1.supportFilter)('waiting'), 'waiting');
    strict_1.default.equal((0, support_rules_1.supportFilter)('<script>'), 'open');
    strict_1.default.equal((0, support_rules_1.supportFilter)(undefined), 'open');
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('open', 'u'), { status: { in: ['OPEN'] } });
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('waiting', 'u'), { status: { in: ['WAITING_ON_CUSTOMER'] } });
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('resolved', 'u'), { status: { in: ['RESOLVED', 'CLOSED'] } });
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('mine', 'u'), { assignedToId: 'u', status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } });
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('unassigned', 'u'), { status: { in: ['OPEN', 'ON_HOLD'] }, assignedToId: null });
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('on_hold', 'u'), { status: { in: ['ON_HOLD'] } });
    strict_1.default.deepEqual((0, support_rules_1.filterWhere)('all', 'u'), {});
    strict_1.default.equal((0, support_rules_1.isSupportStatus)('RESOLVED'), true);
    strict_1.default.equal((0, support_rules_1.isSupportStatus)('DELETED'), false);
    strict_1.default.equal(support_rules_1.SUPPORT_STATUS_FOR_CUSTOMER.WAITING_ON_CUSTOMER, 'Waiting for your reply');
});
(0, node_test_1.test)('first-response time reads plainly', () => {
    const t0 = new Date('2026-10-14T08:00:00Z');
    const at = (min) => new Date(t0.getTime() + min * 60_000);
    strict_1.default.equal((0, support_rules_1.waitLabel)(t0, at(0.2)), 'under a minute');
    strict_1.default.equal((0, support_rules_1.waitLabel)(t0, at(12)), '12 min');
    strict_1.default.equal((0, support_rules_1.waitLabel)(t0, at(60)), '1 h');
    strict_1.default.equal((0, support_rules_1.waitLabel)(t0, at(185)), '3 h 5 min');
    strict_1.default.equal((0, support_rules_1.waitLabel)(t0, at(60 * 24)), '1 day');
    strict_1.default.equal((0, support_rules_1.waitLabel)(t0, at(60 * 24 * 3 + 10)), '3 days');
});
(0, node_test_1.test)('replies keep their line breaks, lose the excess', () => {
    strict_1.default.equal((0, support_rules_1.cleanReply)('  Hello\r\n\r\n\r\n\r\nThanks  '), 'Hello\n\nThanks');
    strict_1.default.equal((0, support_rules_1.cleanReply)(undefined), '');
});
(0, node_test_1.test)('SUP numbers are searchable and link to the ticket', () => {
    const p = (0, search_plan_1.planSearch)('SUP-2026-000014');
    strict_1.default.equal(p.kind, 'reference');
    strict_1.default.deepEqual(p.prefixes, ['SUP']);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'SUP'), [{ equals: 'SUP-2026-000014' }]);
    strict_1.default.deepEqual((0, search_plan_1.planSearch)('sup').prefixes, ['SUP']);
    strict_1.default.ok((0, search_plan_1.planSearch)('s').prefixes.includes('SUP'));
    strict_1.default.equal((0, search_plan_1.referenceUrl)('SUP', 'abc'), '/crm/support/abc');
    strict_1.default.deepEqual([...'Ticket SUP-2026-000014 opened'.matchAll(search_plan_1.REFERENCE_PATTERN)].map((m) => m[0]), ['SUP-2026-000014']);
    // Search and the record links read the same list.
    const search = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib', 'actions', 'search.ts'), 'utf8');
    strict_1.default.match(search, /numbers: \[\['SUP', 'number'\]\]/);
    strict_1.default.match(search, /find\(supportReach,/);
    const resolver = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib', 'record-resolver.ts'), 'utf8');
    strict_1.default.match(resolver, /q\('SUP'/);
});
(0, node_test_1.test)('the actions: authorise, fence, audit; staff replies are compare-and-set and never log the text', () => {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib', 'actions', 'support.ts'), 'utf8');
    for (const fn of ['getSupportInbox', 'getSupportTicket', 'replyToSupportTicket', 'setSupportTicketStatus', 'assignSupportTicket']) {
        const i = src.indexOf(`export async function ${fn}(`);
        strict_1.default.ok(i !== -1, fn);
        const body = src.slice(i, src.indexOf('\nexport ', i + 10) === -1 ? undefined : src.indexOf('\nexport ', i + 10));
        strict_1.default.match(body, /await authorize\('support\.tickets\.manage'|await authorize\(PERM/, `${fn} authorises`);
        strict_1.default.match(body, /ticketReachWhere\(await reachWhere\(PERM(, \{ lens: false \})?\), await myOrganisationId\(\)\)/, `${fn} is fenced`);
    }
    for (const action of ['support.replied', 'support.status_changed', 'support.assigned'])
        strict_1.default.ok(src.includes(`action: '${action}'`), action);
    strict_1.default.doesNotMatch(src, /metadata: \{[^}]*\bbody\b/, 'the reply text is never put in the audit trail');
});
(0, node_test_1.test)('a customer\'s own Support page: only their tickets, staff names never shown', () => {
    const data = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, '..', 'website', 'lib', 'customer-portal', 'data.ts'), 'utf8');
    // Their own, or a website request left with their own account's email (never linked by a typed address alone).
    strict_1.default.match(data, /where: \{ organisationId, OR: \[\{ customerId \}, \.\.\.\(e \? \[\{ customerId: null, channel: 'WEBSITE' as const, contactEmail: \{ equals: e, mode: 'insensitive' as const \} \}\] : \[\]\)\] \}/);
    strict_1.default.doesNotMatch(data.slice(data.indexOf('loadSupportTickets')), /authorUserId|summary: true/);
    const action = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, '..', 'website', 'lib', 'customer-portal', 'support.ts'), 'utf8');
    strict_1.default.match(action, /where: \{ id: ticketId, organisationId: me\.organisationId, OR: \[\{ customerId: me\.id \}, \{ customerId: null, channel: 'WEBSITE', contactEmail: \{ equals: me\.email, mode: 'insensitive' \} \}\] \}/);
});
