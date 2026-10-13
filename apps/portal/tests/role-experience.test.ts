/**
 * What each role is shown (menu, approvals, store costs) — the pure rules
 * behind the role walkthrough in docs/ROLES_AND_ACCESS.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, ROLE_GRANTS, ROLE_DESCRIPTIONS, ROLE_LABELS, APPROVAL_PERMISSIONS, STORE_COST_PERMISSIONS, PERMISSIONS, type Principal } from '../lib/authz/catalogue';
import { navigationFor } from '../lib/authz/navigation';
import { approvalArea, isApproval } from '../lib/approvals';

const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
const keys = (roles: string[]) => navigationFor(who(roles)).map((i) => i.key);
const seesCosts = (roles: string[]) => STORE_COST_PERMISSIONS.some((k) => decide(who(roles), k).allowed);

test('every role says in plain words what it is for', () => {
  for (const slug of Object.keys(ROLE_GRANTS)) {
    assert.ok(ROLE_LABELS[slug], `${slug} has a name`);
    assert.ok((ROLE_DESCRIPTIONS[slug] ?? '').length > 30, `${slug} has a description`);
  }
  for (const k of APPROVAL_PERMISSIONS) assert.ok(k in PERMISSIONS, `${k} is a real permission`);
});

test('people who are not on the Security desk get their own exit passes, not the gate', () => {
  for (const role of ['technician', 'workshop-supervisor', 'finance-officer', 'store-officer', 'warranty-officer', 'calendar-user', 'workshop-manager', 'department-head']) {
    const k = keys([role]);
    assert.ok(k.includes('exit-passes'), `${role}: My exit passes`);
    assert.ok(!k.includes('security'), `${role}: no Security desk`);
    assert.equal(navigationFor(who([role])).find((i) => i.key === 'exit-passes')?.name, 'My exit passes');
    assert.equal(navigationFor(who([role])).find((i) => i.key === 'my-visitors')?.href, '/security/my-visitors', `${role}: My visitors`);
  }
  for (const role of ['security-officer', 'chief-security-officer', 'receptionist', 'administrator', 'branch-administrator']) {
    assert.ok(keys([role]).includes('security'), `${role}: the Security desk`);
    assert.ok(!keys([role]).includes('my-visitors'), `${role}: visitors are on the desk itself`);
  }
});

test('the Workshop Manager approves passes but does not run the gate', () => {
  const m = who(['workshop-manager']);
  assert.equal(decide(m, 'security.view').allowed, false);
  assert.equal(decide(m, 'security.gate.operate').allowed, false);
  assert.equal(decide(m, 'security.pass.approve', { branchId: 'a' }).allowed, true);
});

test('Approvals is in the menu for people who decide things, not for the workshop floor', () => {
  for (const role of ['workshop-manager', 'workshop-supervisor', 'store-officer', 'store-manager', 'finance-officer', 'warranty-hod', 'department-head', 'chief-security-officer']) {
    assert.ok(keys([role]).includes('approvals'), `${role}: Approvals`);
  }
  for (const role of ['technician', 'receptionist', 'security-officer', 'calendar-user', 'broadcaster', 'warranty-officer']) {
    assert.ok(!keys([role]).includes('approvals'), `${role}: no Approvals`);
  }
  assert.ok(navigationFor(who([], { isSuperAdmin: true })).some((i) => i.key === 'approvals'), 'the platform team');
});

test('delivery costs (goods receipts, pricing) are for the Store, Finance, management and Warranty only', () => {
  for (const role of ['store-manager', 'store-officer', 'finance-officer', 'workshop-manager', 'warranty-hod', 'warranty-officer', 'administrator', 'branch-administrator']) assert.ok(seesCosts([role]), `${role} sees costs`);
  for (const role of ['technician', 'workshop-supervisor', 'receptionist', 'security-officer']) assert.ok(!seesCosts([role]), `${role} does not see costs`);
});

test('approval items are recognised; work items are not', () => {
  assert.equal(approvalArea({ id: 'est-mgr-1', title: 'Final approval of the estimate — JC-1' }), 'Workshop');
  assert.equal(approvalArea({ id: 'service-close-1', title: 'Close requested — SV-1' }), 'Workshop');
  assert.equal(approvalArea({ id: 'prs-hod-1', title: 'Approve the parts request' }), 'Store');
  assert.equal(approvalArea({ id: 'epr-mgr-1', title: 'Approve the outside purchase' }), 'Money');
  assert.equal(approvalArea({ id: 'exitpass-1', title: 'Exit pass EP-1 needs your decision' }), 'Security');
  assert.equal(approvalArea({ id: 'warranty-claim-1', title: 'Approve warranty claim WC-1' }), 'Warranty');
  for (const id of ['warranty-claim-2', 'prs-rel-1', 'epr-pay-1', 'assign-1', 'est-ntf-1', 'jc-out-1', 'appt-1', 'my-assign-1', 'pricing-1', 'visit-1']) {
    assert.equal(isApproval({ id, title: id === 'warranty-claim-2' ? 'Submit claim WC-2 to the provider' : 'x' }), false, `${id} is work, not a decision`);
  }
});
