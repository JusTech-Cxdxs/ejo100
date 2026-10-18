"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * What each role is shown (menu, approvals, store costs) — the pure rules
 * behind the role walkthrough in docs/ROLES_AND_ACCESS.md.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const catalogue_1 = require("../lib/authz/catalogue");
const navigation_1 = require("../lib/authz/navigation");
const approvals_1 = require("../lib/approvals");
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
const keys = (roles) => (0, navigation_1.navigationFor)(who(roles)).map((i) => i.key);
const seesCosts = (roles) => catalogue_1.STORE_COST_PERMISSIONS.some((k) => (0, catalogue_1.decide)(who(roles), k).allowed);
(0, node_test_1.test)('every role says in plain words what it is for', () => {
    for (const slug of Object.keys(catalogue_1.ROLE_GRANTS)) {
        strict_1.default.ok(catalogue_1.ROLE_LABELS[slug], `${slug} has a name`);
        strict_1.default.ok((catalogue_1.ROLE_DESCRIPTIONS[slug] ?? '').length > 30, `${slug} has a description`);
    }
    for (const k of catalogue_1.APPROVAL_PERMISSIONS)
        strict_1.default.ok(k in catalogue_1.PERMISSIONS, `${k} is a real permission`);
});
(0, node_test_1.test)('people who are not on the Security desk get their own exit passes, not the gate', () => {
    for (const role of ['technician', 'workshop-supervisor', 'finance-officer', 'store-officer', 'warranty-officer', 'calendar-user', 'workshop-manager', 'department-head']) {
        const k = keys([role]);
        strict_1.default.ok(k.includes('exit-passes'), `${role}: My exit passes`);
        strict_1.default.ok(!k.includes('security'), `${role}: no Security desk`);
        strict_1.default.equal((0, navigation_1.navigationFor)(who([role])).find((i) => i.key === 'exit-passes')?.name, 'My exit passes');
        strict_1.default.equal((0, navigation_1.navigationFor)(who([role])).find((i) => i.key === 'my-visitors')?.href, '/security/my-visitors', `${role}: My visitors`);
    }
    for (const role of ['security-officer', 'chief-security-officer', 'receptionist', 'administrator', 'branch-administrator']) {
        strict_1.default.ok(keys([role]).includes('security'), `${role}: the Security desk`);
        strict_1.default.ok(!keys([role]).includes('my-visitors'), `${role}: visitors are on the desk itself`);
    }
});
(0, node_test_1.test)('the Workshop Manager approves passes but does not run the gate', () => {
    const m = who(['workshop-manager']);
    strict_1.default.equal((0, catalogue_1.decide)(m, 'security.view').allowed, false);
    strict_1.default.equal((0, catalogue_1.decide)(m, 'security.gate.operate').allowed, false);
    strict_1.default.equal((0, catalogue_1.decide)(m, 'security.pass.approve', { branchId: 'a' }).allowed, true);
});
(0, node_test_1.test)('Approvals is in the menu for people who decide things, not for the workshop floor', () => {
    for (const role of ['workshop-manager', 'workshop-supervisor', 'store-officer', 'store-manager', 'finance-officer', 'warranty-hod', 'department-head', 'chief-security-officer']) {
        strict_1.default.ok(keys([role]).includes('approvals'), `${role}: Approvals`);
    }
    for (const role of ['technician', 'receptionist', 'security-officer', 'calendar-user', 'broadcaster', 'warranty-officer']) {
        strict_1.default.ok(!keys([role]).includes('approvals'), `${role}: no Approvals`);
    }
    strict_1.default.ok((0, navigation_1.navigationFor)(who([], { isSuperAdmin: true })).some((i) => i.key === 'approvals'), 'the platform team');
});
(0, node_test_1.test)('delivery costs (goods receipts, pricing) are for the Store, Finance, management and Warranty only', () => {
    for (const role of ['store-manager', 'store-officer', 'finance-officer', 'workshop-manager', 'warranty-hod', 'warranty-officer', 'administrator', 'branch-administrator'])
        strict_1.default.ok(seesCosts([role]), `${role} sees costs`);
    for (const role of ['technician', 'workshop-supervisor', 'receptionist', 'security-officer'])
        strict_1.default.ok(!seesCosts([role]), `${role} does not see costs`);
});
(0, node_test_1.test)('approval items are recognised; work items are not', () => {
    strict_1.default.equal((0, approvals_1.approvalArea)({ id: 'est-mgr-1', title: 'Final approval of the estimate — JC-1' }), 'Workshop');
    strict_1.default.equal((0, approvals_1.approvalArea)({ id: 'service-close-1', title: 'Close requested — SV-1' }), 'Workshop');
    strict_1.default.equal((0, approvals_1.approvalArea)({ id: 'prs-hod-1', title: 'Approve the parts request' }), 'Store');
    strict_1.default.equal((0, approvals_1.approvalArea)({ id: 'epr-mgr-1', title: 'Approve the outside purchase' }), 'Money');
    strict_1.default.equal((0, approvals_1.approvalArea)({ id: 'exitpass-1', title: 'Exit pass EP-1 needs your decision' }), 'Security');
    strict_1.default.equal((0, approvals_1.approvalArea)({ id: 'warranty-claim-1', title: 'Approve warranty claim WC-1' }), 'Warranty');
    for (const id of ['warranty-claim-2', 'prs-rel-1', 'epr-pay-1', 'assign-1', 'est-ntf-1', 'jc-out-1', 'appt-1', 'my-assign-1', 'pricing-1', 'visit-1']) {
        strict_1.default.equal((0, approvals_1.isApproval)({ id, title: id === 'warranty-claim-2' ? 'Submit claim WC-2 to the provider' : 'x' }), false, `${id} is work, not a decision`);
    }
});
