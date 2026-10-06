/**
 * Authorization Catalogue — allowed AND denied cases for every kind of
 * scope (principle 4: every path is tested, allowed and denied).
 * Pure: no database, no network. Run with `npm run test --workspace=apps/portal`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, scopeFor, PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, PAGE_PERMISSIONS, type Principal, type PermissionKey } from '../lib/authz/catalogue';

const A = 'branch-a';
const B = 'branch-b';
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: A, departmentId: 'dept-1', ...extra });
const yes = (p: Principal, k: PermissionKey, r?: Parameters<typeof decide>[2]) => assert.equal(decide(p, k, r).allowed, true, `${p.roleSlugs.join('+') || 'baseline'} should be allowed ${k}`);
const no = (p: Principal, k: PermissionKey, r?: Parameters<typeof decide>[2]) => assert.equal(decide(p, k, r).allowed, false, `${p.roleSlugs.join('+') || 'baseline'} should be refused ${k}`);

test('Master Admin (platform team) holds everything, everywhere', () => {
  const m = who([], { isSuperAdmin: true });
  for (const k of Object.keys(PERMISSIONS) as PermissionKey[]) yes(m, k, { branchId: B });
});

test('Receptionist opens jobs and receives visitors in their branch only', () => {
  const r = who(['receptionist']);
  yes(r, 'workshop.job_card.create', { branchId: A });
  no(r, 'workshop.job_card.create', { branchId: B });
  yes(r, 'security.reception.operate', { branchId: A });
  no(r, 'security.gate.operate', { branchId: A });
  no(r, 'workshop.payment.record', { branchId: A });
});

test('Supervisors act only on jobs assigned to them (and never open jobs)', () => {
  const s = who(['workshop-supervisor']);
  yes(s, 'workshop.estimate.approve', { branchId: A, assigneeIds: ['me'] });
  no(s, 'workshop.estimate.approve', { branchId: A, assigneeIds: ['someone-else'] });
  yes(s, 'workshop.technician.assign', { assigneeIds: ['me'] });
  yes(s, 'workshop.job.supervise', { assigneeIds: ['me'] });
  no(s, 'workshop.job.supervise', { assigneeIds: ['x'] });
  no(s, 'workshop.job_card.create');
});

test('Technicians work only on their own assigned jobs', () => {
  const t = who(['technician']);
  yes(t, 'workshop.job.work', { assigneeIds: [null, 'me'] });
  no(t, 'workshop.job.work', { assigneeIds: ['other'] });
  no(t, 'workshop.estimate.final_approve', { branchId: A });
  no(t, 'analytics.business.view');
});

test('Whoever opened a job may request its close or cancellation', () => {
  const r = who(['receptionist']);
  yes(r, 'workshop.close.request', { ownerIds: ['me'] });
  no(r, 'workshop.close.request', { ownerIds: ['other'], assigneeIds: ['x'] });
});

test('Workshop Manager approves for their branch, not another', () => {
  const m = who(['workshop-manager']);
  for (const k of ['workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod', 'procurement.epr.approve', 'warranty.claim.approve'] as PermissionKey[]) {
    yes(m, k, { branchId: A });
    no(m, k, { branchId: B });
  }
  no(m, 'schedule.manage');
  no(m, 'admin.users.manage');
});

test('Finance records money; it does not approve purchases', () => {
  const f = who(['finance-officer']);
  yes(f, 'workshop.payment.record', { branchId: A });
  yes(f, 'workshop.refund.record', { branchId: A });
  yes(f, 'procurement.epr.disburse', { branchId: A });
  no(f, 'procurement.epr.approve', { branchId: A });
  no(f, 'workshop.payment.record', { branchId: B });
});

test('Store staff manage their own branch Store only', () => {
  for (const slug of ['store-manager', 'store-officer']) {
    const s = who([slug]);
    yes(s, 'store.parts.manage', { branchId: A });
    no(s, 'store.parts.manage', { branchId: B });
    yes(s, 'store.grn.record', { branchId: A });
    yes(s, 'store.prs.release', { branchId: A });
    no(s, 'store.prs.approve_hod', { branchId: A });
  }
});

test('Warranty officer prepares; HOD approves', () => {
  yes(who(['warranty-officer']), 'warranty.manage', { branchId: A });
  no(who(['warranty-officer']), 'warranty.claim.approve', { branchId: A });
  yes(who(['warranty-hod']), 'warranty.claim.approve', { branchId: A });
});

test('Administrator runs the organisation but does not approve workshop money', () => {
  const a = who(['administrator']);
  for (const k of ['admin.organisation.manage', 'admin.structure.manage', 'admin.users.manage', 'admin.roles.manage', 'audit.view', 'analytics.business.view', 'notifications.broadcast.send'] as PermissionKey[]) yes(a, k, { branchId: B });
  no(a, 'workshop.close.approve', { branchId: A });
  no(a, 'workshop.payment.record', { branchId: A });
  no(a, 'schedule.manage');
});

test('Security: gate staff operate the gate; the Chief manages incidents', () => {
  yes(who(['security-officer']), 'security.gate.operate', { branchId: A });
  no(who(['security-officer']), 'security.incident.manage', { branchId: A });
  yes(who(['chief-security-officer']), 'security.incident.manage', { branchId: A });
  no(who(['chief-security-officer']), 'security.gate.operate', { branchId: B });
});

test('Pass approvals: department heads for their department; anyone the request waits on', () => {
  const h = who(['department-head']);
  yes(h, 'security.pass.approve', { departmentId: 'dept-1' });
  no(h, 'security.pass.approve', { departmentId: 'dept-2', branchId: A });
  yes(who([]), 'security.pass.approve', { assigneeIds: ['me'] });
  no(who([]), 'security.pass.approve', { assigneeIds: ['x'] });
});

test('Several roles: the widest scope wins', () => {
  const p = who(['calendar-user', 'broadcaster']);
  assert.equal(scopeFor(p, 'notifications.broadcast.send'), 'ALL');
  assert.equal(scopeFor(p, 'schedule.view'), 'OWN');
  assert.equal(scopeFor(who(['calendar-user', 'scheduling-admin']), 'schedule.view'), 'ALL');
});

test('A grant added on the Roles page counts, but only for catalogue permissions', () => {
  const p = who(['technician'], { extraGrants: { 'workshop.payment.record': 'BRANCH' } });
  yes(p, 'workshop.payment.record', { branchId: A });
  no(p, 'workshop.payment.record', { branchId: B });
  assert.equal(decide(p, 'not.a.permission' as PermissionKey).allowed, false);
});

test('Organisation-wide staff (no branch on their profile) are not limited to one branch', () => {
  yes(who(['finance-officer'], { branchId: null }), 'workshop.payment.record', { branchId: B });
});

test('Everyone signed in can see their branch and raise parts requests', () => {
  const p = who([]);
  for (const k of ['workshop.view', 'workshop.job_card.view', 'store.view', 'security.view', 'warranty.view', 'sourcing.request'] as PermissionKey[]) {
    yes(p, k, { branchId: A });
    no(p, k, { branchId: B });
  }
  no(p, 'schedule.view');
  no(p, 'analytics.business.view');
});

test('The catalogue is internally consistent', () => {
  for (const [slug, grants] of Object.entries(ROLE_GRANTS)) {
    assert.ok(ROLE_LABELS[slug], `role ${slug} has a label`);
    for (const k of Object.keys(grants)) assert.ok(k in PERMISSIONS, `${slug} grants unknown permission ${k}`);
  }
  for (const k of Object.values(PAGE_PERMISSIONS)) assert.ok(k in PERMISSIONS, `page permission ${k} exists`);
  for (const [k, v] of Object.entries(PERMISSIONS)) {
    assert.ok(v.label.length > 5 && !/[_]/.test(v.label), `${k} has a readable label`);
  }
});

test('Approvals and money need the person to BELONG to the branch (homeBranch)', () => {
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

test('Analytics: each module’s own people see its analytics; others do not', () => {
  yes(who(['store-officer']), 'analytics.inventory.view', { branchId: A });
  yes(who(['warranty-officer']), 'analytics.warranty.view', { branchId: A });
  no(who(['technician']), 'analytics.inventory.view', { branchId: A });
  no(who(['receptionist']), 'analytics.warranty.view', { branchId: A });
  no(who(['store-officer']), 'analytics.business.view', { branchId: A });
});

test('Tenant fence: no scope — not even ALL — reaches another organisation', () => {
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
  assert.equal(decide(admin, 'workshop.job_card.view', { branchId: 'org-2-branch' }).reason, 'Outside your organisation');
  // The platform team is not fenced.
  yes(who([], { isSuperAdmin: true, orgBranchIds: mine }), 'workshop.job_card.view', { branchId: 'org-2-branch' });
});
