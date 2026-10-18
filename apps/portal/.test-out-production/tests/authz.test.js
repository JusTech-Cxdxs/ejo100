"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Authorization Catalogue — allowed AND denied cases for every kind of
 * scope (principle 4: every path is tested, allowed and denied).
 * Pure: no database, no network. Run with `npm run test --workspace=apps/portal`.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const catalogue_1 = require("../lib/authz/catalogue");
const A = 'branch-a';
const B = 'branch-b';
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: A, departmentId: 'dept-1', ...extra });
const yes = (p, k, r) => strict_1.default.equal((0, catalogue_1.decide)(p, k, r).allowed, true, `${p.roleSlugs.join('+') || 'baseline'} should be allowed ${k}`);
const no = (p, k, r) => strict_1.default.equal((0, catalogue_1.decide)(p, k, r).allowed, false, `${p.roleSlugs.join('+') || 'baseline'} should be refused ${k}`);
(0, node_test_1.test)('Master Admin (platform team) holds everything, everywhere', () => {
    const m = who([], { isSuperAdmin: true });
    for (const k of Object.keys(catalogue_1.PERMISSIONS))
        yes(m, k, { branchId: B });
});
(0, node_test_1.test)('Receptionist opens jobs and receives visitors in their branch only', () => {
    const r = who(['receptionist']);
    yes(r, 'workshop.job_card.create', { branchId: A });
    no(r, 'workshop.job_card.create', { branchId: B });
    yes(r, 'security.reception.operate', { branchId: A });
    no(r, 'security.gate.operate', { branchId: A });
    no(r, 'workshop.payment.record', { branchId: A });
});
(0, node_test_1.test)('Supervisors act only on jobs assigned to them (and never open jobs)', () => {
    const s = who(['workshop-supervisor']);
    yes(s, 'workshop.estimate.approve', { branchId: A, assigneeIds: ['me'] });
    no(s, 'workshop.estimate.approve', { branchId: A, assigneeIds: ['someone-else'] });
    yes(s, 'workshop.technician.assign', { assigneeIds: ['me'] });
    yes(s, 'workshop.job.supervise', { assigneeIds: ['me'] });
    no(s, 'workshop.job.supervise', { assigneeIds: ['x'] });
    no(s, 'workshop.job_card.create');
});
(0, node_test_1.test)('Technicians work only on their own assigned jobs', () => {
    const t = who(['technician']);
    yes(t, 'workshop.job.work', { assigneeIds: [null, 'me'] });
    no(t, 'workshop.job.work', { assigneeIds: ['other'] });
    no(t, 'workshop.estimate.final_approve', { branchId: A });
    no(t, 'analytics.business.view');
});
(0, node_test_1.test)('Whoever opened a job may request its close or cancellation', () => {
    const r = who(['receptionist']);
    yes(r, 'workshop.close.request', { ownerIds: ['me'] });
    no(r, 'workshop.close.request', { ownerIds: ['other'], assigneeIds: ['x'] });
});
(0, node_test_1.test)('Workshop Manager approves for their branch, not another', () => {
    const m = who(['workshop-manager']);
    for (const k of ['workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod', 'procurement.epr.approve', 'warranty.claim.approve']) {
        yes(m, k, { branchId: A });
        no(m, k, { branchId: B });
    }
    no(m, 'schedule.manage');
    no(m, 'admin.users.manage');
});
(0, node_test_1.test)('Finance records money; it does not approve purchases', () => {
    const f = who(['finance-officer']);
    yes(f, 'workshop.payment.record', { branchId: A });
    yes(f, 'workshop.refund.record', { branchId: A });
    yes(f, 'procurement.epr.disburse', { branchId: A });
    no(f, 'procurement.epr.approve', { branchId: A });
    no(f, 'workshop.payment.record', { branchId: B });
});
(0, node_test_1.test)('Store staff manage their own branch Store only', () => {
    for (const slug of ['store-manager', 'store-officer']) {
        const s = who([slug]);
        yes(s, 'store.parts.manage', { branchId: A });
        no(s, 'store.parts.manage', { branchId: B });
        yes(s, 'store.grn.record', { branchId: A });
        yes(s, 'store.prs.release', { branchId: A });
        no(s, 'store.prs.approve_hod', { branchId: A });
    }
});
(0, node_test_1.test)('Warranty officer prepares; HOD approves', () => {
    yes(who(['warranty-officer']), 'warranty.manage', { branchId: A });
    no(who(['warranty-officer']), 'warranty.claim.approve', { branchId: A });
    yes(who(['warranty-hod']), 'warranty.claim.approve', { branchId: A });
});
(0, node_test_1.test)('Administrator runs the organisation but does not approve workshop money', () => {
    const a = who(['administrator']);
    for (const k of ['admin.organisation.manage', 'admin.structure.manage', 'admin.users.manage', 'admin.roles.manage', 'audit.view', 'analytics.business.view', 'notifications.broadcast.send'])
        yes(a, k, { branchId: B });
    no(a, 'workshop.close.approve', { branchId: A });
    no(a, 'workshop.payment.record', { branchId: A });
    no(a, 'schedule.manage');
});
(0, node_test_1.test)('Security: gate staff operate the gate; the Chief manages incidents', () => {
    yes(who(['security-officer']), 'security.gate.operate', { branchId: A });
    no(who(['security-officer']), 'security.incident.manage', { branchId: A });
    yes(who(['chief-security-officer']), 'security.incident.manage', { branchId: A });
    no(who(['chief-security-officer']), 'security.gate.operate', { branchId: B });
});
(0, node_test_1.test)('Pass approvals: heads of department for their department; the branch manager for the branch', () => {
    const h = who(['department-head']);
    yes(h, 'security.pass.approve', { departmentId: 'dept-1' });
    no(h, 'security.pass.approve', { departmentId: 'dept-2', branchId: A });
    yes(who(['workshop-manager']), 'security.pass.approve', { branchId: A });
    for (const slug of ['technician', 'finance-officer', 'workshop-supervisor', 'receptionist', 'security-officer'])
        no(who([slug]), 'security.pass.approve', { branchId: A });
});
(0, node_test_1.test)('Several roles: the widest scope wins', () => {
    const p = who(['calendar-user', 'broadcaster']);
    strict_1.default.equal((0, catalogue_1.scopeFor)(p, 'notifications.broadcast.send'), 'ALL');
    strict_1.default.equal((0, catalogue_1.scopeFor)(p, 'schedule.view'), 'OWN');
    strict_1.default.equal((0, catalogue_1.scopeFor)(who(['calendar-user', 'scheduling-admin']), 'schedule.view'), 'ALL');
});
(0, node_test_1.test)('A grant added on the Roles page counts, but only for catalogue permissions', () => {
    const p = who(['technician'], { extraGrants: { 'workshop.payment.record': 'BRANCH' } });
    yes(p, 'workshop.payment.record', { branchId: A });
    no(p, 'workshop.payment.record', { branchId: B });
    strict_1.default.equal((0, catalogue_1.decide)(p, 'not.a.permission').allowed, false);
});
(0, node_test_1.test)('Organisation-wide staff (no branch on their profile) are not limited to one branch', () => {
    yes(who(['finance-officer'], { branchId: null }), 'workshop.payment.record', { branchId: B });
});
(0, node_test_1.test)('Everyone signed in may only request their own exit pass — nothing else by default', () => {
    const p = who([]);
    yes(p, 'security.exit_pass.request', { ownerIds: ['me'] });
    no(p, 'security.exit_pass.request', { ownerIds: ['someone-else'] });
    for (const k of ['workshop.view', 'workshop.job_card.view', 'store.view', 'security.view', 'warranty.view', 'sourcing.request', 'schedule.view', 'analytics.business.view', 'workshop.job.work', 'workshop.estimate.approve'])
        no(p, k, { branchId: A, assigneeIds: ['me'] });
});
(0, node_test_1.test)('Realistic duties: each department does its own work only', () => {
    // Finance: money — never supervises, works on jobs, opens jobs or books visitors.
    const f = who(['finance-officer']);
    for (const k of ['workshop.job.supervise', 'workshop.estimate.approve', 'workshop.technician.assign', 'workshop.job.work', 'workshop.estimate.edit', 'workshop.job_card.create', 'security.view', 'workshop.close.request'])
        no(f, k, { branchId: A, assigneeIds: ['me'] });
    yes(f, 'workshop.job_card.view', { branchId: A });
    // Security: the gate — no workshop, no money.
    const s = who(['security-officer']);
    for (const k of ['workshop.job_card.view', 'workshop.payment.record', 'workshop.job_card.create', 'store.view'])
        no(s, k, { branchId: A });
    yes(s, 'security.gate.operate', { branchId: A });
    // Manager approves and closes — never opens jobs.
    const m = who(['workshop-manager']);
    no(m, 'workshop.job_card.create', { branchId: A });
    no(m, 'workshop.customer.manage', { branchId: A });
    yes(m, 'workshop.close.approve', { branchId: A });
    // Front desk opens jobs and talks to customers — never approves or works on them.
    const r = who(['receptionist']);
    yes(r, 'workshop.job_card.create', { branchId: A });
    yes(r, 'workshop.customer.notify', { branchId: A });
    for (const k of ['workshop.estimate.approve', 'workshop.job.work', 'workshop.technician.assign', 'workshop.estimate.final_approve', 'workshop.payment.record'])
        no(r, k, { branchId: A, assigneeIds: ['me'] });
    // Technician writes the estimate but cannot approve it, cannot assign technicians, cannot supervise.
    const t = who(['technician']);
    yes(t, 'workshop.estimate.edit', { assigneeIds: ['me'] });
    for (const k of ['workshop.estimate.approve', 'workshop.technician.assign', 'workshop.job.supervise', 'workshop.job_card.create'])
        no(t, k, { branchId: A, assigneeIds: ['me'] });
    // Supervisor can do what the technician does, plus approve and assign.
    const sup = who(['workshop-supervisor']);
    for (const k of ['workshop.estimate.edit', 'workshop.job.work', 'workshop.inspection.perform', 'workshop.estimate.approve', 'workshop.technician.assign'])
        yes(sup, k, { assigneeIds: ['me'] });
    no(sup, 'workshop.job_card.create', { branchId: A });
});
(0, node_test_1.test)('Two levels of administration: headquarters (all branches) and branch', () => {
    const hq = who(['administrator'], { orgBranchIds: [A, B] });
    yes(hq, 'admin.users.manage', { branchId: B });
    yes(hq, 'admin.structure.manage', { branchId: B });
    const ba = who(['branch-administrator']);
    yes(ba, 'admin.users.manage', { branchId: A });
    no(ba, 'admin.users.manage', { branchId: B });
    no(ba, 'admin.roles.manage');
    no(ba, 'admin.structure.manage');
    no(ba, 'admin.organisation.manage');
    // Neither administrator does the departments' transactions.
    for (const a of [hq, ba])
        for (const k of ['workshop.job_card.create', 'workshop.payment.record', 'workshop.close.approve'])
            no(a, k, { branchId: A });
});
(0, node_test_1.test)('The catalogue is internally consistent', () => {
    for (const [slug, grants] of Object.entries(catalogue_1.ROLE_GRANTS)) {
        strict_1.default.ok(catalogue_1.ROLE_LABELS[slug], `role ${slug} has a label`);
        for (const k of Object.keys(grants))
            strict_1.default.ok(k in catalogue_1.PERMISSIONS, `${slug} grants unknown permission ${k}`);
    }
    for (const k of Object.values(catalogue_1.PAGE_PERMISSIONS))
        strict_1.default.ok(k in catalogue_1.PERMISSIONS, `page permission ${k} exists`);
    for (const [k, v] of Object.entries(catalogue_1.PERMISSIONS)) {
        strict_1.default.ok(v.label.length > 5 && !/[_]/.test(v.label), `${k} has a readable label`);
    }
});
(0, node_test_1.test)('Approvals and money need the person to BELONG to the branch (homeBranch)', () => {
    const noBranch = who(['workshop-manager'], { branchId: null });
    // Viewing: organisation-wide staff are not limited to one branch …
    yes(noBranch, 'workshop.job_card.view', { branchId: B });
    // … but approving or moving money: someone with no branch is refused.
    no(noBranch, 'workshop.close.approve', { branchId: B, homeBranch: true });
    no(who(['finance-officer'], { branchId: null }), 'workshop.payment.record', { branchId: A, homeBranch: true });
    yes(who(['finance-officer']), 'workshop.payment.record', { branchId: A, homeBranch: true });
    no(who(['finance-officer']), 'workshop.payment.record', { branchId: B, homeBranch: true });
    // The platform team and organisation-wide (ALL) grants are unaffected.
    yes(who([], { isSuperAdmin: true, branchId: null }), 'workshop.close.approve', { branchId: B, homeBranch: true });
});
(0, node_test_1.test)('Analytics: each module’s own people see its analytics; others do not', () => {
    yes(who(['store-officer']), 'analytics.inventory.view', { branchId: A });
    yes(who(['warranty-officer']), 'analytics.warranty.view', { branchId: A });
    no(who(['technician']), 'analytics.inventory.view', { branchId: A });
    no(who(['receptionist']), 'analytics.warranty.view', { branchId: A });
    no(who(['store-officer']), 'analytics.business.view', { branchId: A });
});
(0, node_test_1.test)('Tenant fence: no scope — not even ALL — reaches another organisation', () => {
    const mine = ['branch-a', 'branch-a2'];
    const admin = who(['administrator'], { organisationId: 'org-1', orgBranchIds: mine });
    // Organisation-wide inside their own organisation …
    yes(admin, 'audit.view', { branchId: 'branch-a2' });
    yes(admin, 'workshop.job_card.view', { branchId: 'branch-a2' });
    // … never across into another organisation.
    no(admin, 'workshop.job_card.view', { branchId: 'org-2-branch' });
    no(admin, 'analytics.business.view', { branchId: 'org-2-branch' });
    const tech = who(['technician'], { organisationId: 'org-1', orgBranchIds: mine });
    no(tech, 'workshop.job.work', { branchId: 'org-2-branch', assigneeIds: ['me'] });
    strict_1.default.equal((0, catalogue_1.decide)(admin, 'workshop.job_card.view', { branchId: 'org-2-branch' }).reason, 'Outside your organisation');
    // The platform team is not fenced.
    yes(who([], { isSuperAdmin: true, orgBranchIds: mine }), 'workshop.job_card.view', { branchId: 'org-2-branch' });
});
