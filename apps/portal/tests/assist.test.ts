/**
 * Assisted sessions — who may be assisted, by whom, and the signed cookie.
 * Pure: no database, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_GRANTS, ROLE_LABELS, PERMISSIONS, type PermissionKey } from '../lib/authz/catalogue';
import { actorLabel, assistMinutes, assistRefusal, assistSummary, isSensitivePermission, sensitivePermissionsOf, type AssistParty } from '../lib/assist/rules';
import { sessionBinding, signAssistToken, signedAssistId, verifyAssistToken } from '../lib/assist/token';

const party = (userId: string, roleSlugs: string[], extra: Partial<AssistParty> = {}): AssistParty => ({
  userId, isActive: true, isSuperAdmin: false, organisationId: 'org-1', branchId: 'branch-a', departmentId: null, roleSlugs, ...extra,
});
const assistant = party('ada', ['branch-assistant']);

test('the Branch Assistant role holds only support.assist', () => {
  assert.deepEqual(Object.keys(ROLE_GRANTS['branch-assistant']!), ['support.assist']);
  assert.equal(ROLE_GRANTS['branch-assistant']!['support.assist'], 'BRANCH');
  assert.ok(ROLE_LABELS['branch-assistant']);
  assert.ok('support.assist' in PERMISSIONS);
});

test('sensitive permissions: approvals, money, administration and the rest', () => {
  for (const k of ['workshop.estimate.approve', 'workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod', 'security.pass.approve', 'warranty.claim.approve',
    'workshop.payment.record', 'workshop.refund.record', 'procurement.epr.review', 'procurement.epr.disburse', 'procurement.epr.approve',
    'admin.users.manage', 'admin.roles.manage', 'audit.view', 'analytics.business.view', 'analytics.inventory.view', 'notifications.broadcast.send',
    'security.incident.manage', 'support.assist', 'store.parts.manage']) assert.equal(isSensitivePermission(k), true, k);
  for (const k of ['workshop.view', 'workshop.job_card.view', 'workshop.job.work', 'workshop.estimate.edit', 'workshop.inspection.perform', 'sourcing.request', 'store.view', 'security.exit_pass.request', 'schedule.view', 'workshop.job_card.create']) {
    assert.equal(isSensitivePermission(k), false, k);
  }
});

test('technicians and front desk can be assisted; no role with approvals or money can', () => {
  assert.equal(assistRefusal(assistant, party('musa', ['technician'])), null);
  assert.equal(assistRefusal(assistant, party('funmi', ['receptionist'])), null);
  for (const role of ['workshop-manager', 'workshop-supervisor', 'finance-officer', 'administrator', 'branch-administrator', 'store-manager', 'store-officer', 'warranty-hod', 'department-head', 'chief-security-officer', 'broadcaster', 'branch-assistant']) {
    assert.equal(assistRefusal(assistant, party('x', [role]))?.code, 'SENSITIVE', role);
  }
  // Every role that holds any approval is refused, whatever it is called.
  for (const [slug, grants] of Object.entries(ROLE_GRANTS)) {
    if ((Object.keys(grants) as PermissionKey[]).some((k) => /approve/.test(k))) assert.equal(assistRefusal(assistant, party('x', [slug]))?.code, 'SENSITIVE', slug);
  }
});

test('an added grant (Roles page) or a second role counts too', () => {
  assert.equal(assistRefusal(assistant, party('musa', ['technician'], { extraGrants: { 'workshop.payment.record': 'BRANCH' } }))?.code, 'SENSITIVE');
  assert.equal(assistRefusal(assistant, party('musa', ['technician', 'workshop-manager']))?.code, 'SENSITIVE');
  assert.equal(assistRefusal(assistant, party('root', [], { isSuperAdmin: true }))?.code, 'SENSITIVE');
  assert.deepEqual(sensitivePermissionsOf(party('musa', ['technician'])), []);
});

test('same organisation, same branch, active, not yourself', () => {
  assert.equal(assistRefusal(assistant, party('ada', ['technician']))?.code, 'SELF');
  assert.equal(assistRefusal(assistant, party('musa', ['technician'], { organisationId: 'org-2' }))?.code, 'OUT_OF_REACH');
  assert.equal(assistRefusal(assistant, party('musa', ['technician'], { branchId: 'branch-b' }))?.code, 'OUT_OF_REACH');
  assert.equal(assistRefusal(assistant, party('musa', ['technician'], { isActive: false }))?.code, 'COLLEAGUE_INACTIVE');
  assert.equal(assistRefusal({ ...assistant, organisationId: null }, party('musa', ['technician'], { organisationId: null }))?.code, 'OUT_OF_REACH');
});

test('the assistant must hold support.assist, be active, have a branch and not be the platform team', () => {
  const musa = party('musa', ['technician']);
  assert.equal(assistRefusal(party('t2', ['technician']), musa)?.code, 'NOT_ALLOWED');
  assert.equal(assistRefusal({ ...assistant, isActive: false }, musa)?.code, 'ASSISTANT_INACTIVE');
  assert.equal(assistRefusal({ ...assistant, branchId: null }, musa)?.code, 'NO_BRANCH');
  assert.equal(assistRefusal(party('root', [], { isSuperAdmin: true }), musa)?.code, 'PLATFORM_TEAM');
  // Granted on the Roles page to another role: still branch-scoped.
  assert.equal(assistRefusal(party('rita', ['calendar-user'], { extraGrants: { 'support.assist': 'BRANCH' } }), musa), null);
});

test('session length: 30 minutes by default, between 5 and 120', () => {
  assert.equal(assistMinutes(undefined), 30);
  assert.equal(assistMinutes(''), 30);
  assert.equal(assistMinutes('abc'), 30);
  assert.equal(assistMinutes('-5'), 30);
  assert.equal(assistMinutes('45'), 45);
  assert.equal(assistMinutes('1'), 5);
  assert.equal(assistMinutes('9999'), 120);
});

const SECRET = 'test-secret-at-least-32-characters-long';

test('the cookie is signed, bound to the sign-in, and refuses tampering', () => {
  const token = signAssistToken('ckassist123', 'auth-session-1', SECRET);
  assert.equal(verifyAssistToken(token, 'auth-session-1', SECRET), 'ckassist123');
  // Another sign-in (signed out and back in, or another browser).
  assert.equal(verifyAssistToken(token, 'auth-session-2', SECRET), null);
  assert.equal(signedAssistId(token, SECRET), 'ckassist123', 'still recognised as ours, to end it');
  // Another secret.
  assert.equal(verifyAssistToken(token, 'auth-session-1', 'another-secret-at-least-32-characters'), null);
  // A different session id with the old signature.
  const [v, , bind, sig] = token.split('.');
  assert.equal(verifyAssistToken(`${v}.ckother456.${bind}.${sig}`, 'auth-session-1', SECRET), null);
  // A binding swapped in from another sign-in.
  assert.equal(verifyAssistToken(`${v}.ckassist123.${sessionBinding('auth-session-2')}.${sig}`, 'auth-session-2', SECRET), null);
  for (const bad of ['', 'v1', 'v1.a.b', 'v2.ckassist123.x.y', `${token}x`, 'v1.../...', 'x'.repeat(400)]) assert.equal(verifyAssistToken(bad, 'auth-session-1', SECRET), null, bad);
  assert.equal(verifyAssistToken(null, 'auth-session-1', SECRET), null);
  assert.throws(() => signAssistToken('ckassist123', 'auth-session-1', 'short'));
  assert.throws(() => signAssistToken('bad id!', 'auth-session-1', SECRET));
  assert.ok(!token.includes('auth-session-1'), 'the sign-in id itself is never in the cookie');
});

test('audit wording names both people', () => {
  assert.equal(actorLabel('Musa Ibrahim', { assistedBy: { id: 'a', name: 'Ada Okafor' }, assistSessionId: 's' }), 'Musa Ibrahim (assisted by Ada Okafor)');
  assert.equal(actorLabel('Musa Ibrahim', { reason: 'x' }), 'Musa Ibrahim');
  assert.equal(actorLabel(null, null), null);
  assert.equal(actorLabel('Musa Ibrahim', { assistedBy: { id: 'a' } }), 'Musa Ibrahim');
  assert.equal(assistSummary('Ada Okafor', '14:05', '14:31', 6), 'Ada Okafor helped you with your work from 14:05 to 14:31 — 6 actions recorded.');
  assert.equal(assistSummary('Ada Okafor', '14:05', '14:06', 1), 'Ada Okafor helped you with your work from 14:05 to 14:06 — 1 action recorded.');
  assert.equal(assistSummary('Ada Okafor', '14:05', '14:06', 0), 'Ada Okafor helped you with your work from 14:05 to 14:06 — no actions recorded.');
});

test('the wiring: business rules run as the colleague, every audit row names the assistant, own-account pages refuse', () => {
  const root = join(__dirname, '..', '..');
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
  const ws = read('lib/actions/workshop.ts');
  assert.match(ws, /export async function requireUser\(\)[\s\S]{0,400}setAuditActor\(acting\.id, 'portal', acting\.organisationId, acting\.assist \?/);
  assert.match(ws, /const actingForRequest = cache\([\s\S]{0,600}activeAssistFor\(session\.user\.id, session\.session\.id\)/);
  assert.match(read('lib/authz/server.ts'), /export const getPrincipal = cache\(async \(\): Promise<Principal> => \{\s*const user = await requireUser\(\);/);
  assert.match(read('lib/workshop-core.ts'), /actor\?\.assistedBy && actor\.userId === params\.userId/);
  assert.match(read('app/(app)/profile/page.tsx'), /Not available during an assisted session/);
  assert.match(read('lib/actions/notifications.ts'), /export async function setNotificationsMuted[\s\S]{0,120}refuseDuringAssist/);
  assert.match(read('app/(app)/layout.tsx'), /<AssistBanner /);
  // The lookup path never writes: the audit journal resolves "who is acting" through it.
  const server = read('lib/assist/server.ts');
  const lookup = server.slice(server.indexOf('export const activeAssistFor'), server.indexOf('export const signedInContext'));
  assert.doesNotMatch(lookup, /\.(create|update|updateMany|upsert|delete|deleteMany)\(/);
  assert.doesNotMatch(lookup, /writeAuditLog\(/);
  // The password is checked with Better Auth's own verifier and never written anywhere.
  const actions = read('lib/actions/assist.ts');
  assert.match(actions, /authCtx\.password\.verify\(\{ hash: account\.password, password \}\)/);
  assert.doesNotMatch(actions, /metadata: \{[^}]*password/);
  assert.match(actions, /httpOnly: true,\s*sameSite: 'lax',\s*secure: process\.env\.NODE_ENV === 'production'/);
});
