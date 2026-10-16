import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decide, ROLE_DESCRIPTIONS, ROLE_GRANTS, ROLE_LABELS, type Principal } from '../lib/authz/catalogue';
import { sensitivePermissionsOf } from '../lib/assist/rules';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const who = (roles: string[]): Principal => ({ userId: 'u', isSuperAdmin: false, roleSlugs: roles, branchId: 'b1', departmentId: null, organisationId: 'o1', orgBranchIds: ['b1', 'b2'] });

test('customer care works support requests, never the set-up', () => {
  const p = who(['customer-care']);
  assert.ok(decide(p, 'support.tickets.manage', { branchId: 'b1' }).allowed);
  assert.equal(decide(p, 'support.tickets.manage', { branchId: 'b2' }).allowed, false, 'own branch only');
  assert.equal(decide(p, 'support.manage').allowed, false);
  assert.equal(decide(p, 'crm.manage', { branchId: 'b1' }).allowed, false, 'read-only outside the Support centre');
  assert.ok(decide(who(['customer-care-lead']), 'support.tickets.manage', { branchId: 'b2' }).allowed, 'the lead sees every branch');
  assert.equal(decide(who(['customer-care-lead']), 'support.manage').allowed, false);
});

test('executive: everything read-only with analytics, approves nothing but their own department’s passes', () => {
  const g = ROLE_GRANTS.executive!;
  for (const k of ['analytics.business.view', 'workshop.view', 'store.view', 'warranty.view', 'security.view', 'crm.view'] as const) assert.equal(g[k], 'ALL', k);
  for (const k of Object.keys(g)) if (/approve|record|manage|create|release|disburse|operate/.test(k)) assert.equal(k, 'security.pass.approve', k);
  assert.equal(g['security.pass.approve'], 'DEPARTMENT');
});

test('IT administrator: people, roles, settings, audit and Enyo — no transactions, no Recycle bin, no money', () => {
  const g = ROLE_GRANTS['it-administrator']!;
  for (const k of ['admin.users.manage', 'admin.roles.manage', 'admin.settings.manage', 'audit.view', 'enyo.manage'] as const) assert.equal(g[k], 'ALL', k);
  for (const k of Object.keys(g)) assert.doesNotMatch(k, /^(workshop|store|procurement|warranty|analytics)\.|recycle|payment|refund/, k);
  // Nobody widens their own access, and only an Organisation Administrator gives the Administrator role.
  assert.match(read('lib/actions/roles.ts'), /You cannot change a role you hold yourself/);
  assert.match(read('lib/actions/users-admin.ts'), /Only an Organisation Administrator can give or remove the Administrator role/);
  // Never assisted (a Branch Assistant cannot work as them).
  assert.ok(sensitivePermissionsOf(who(['it-administrator'])).length > 0);
  assert.ok(sensitivePermissionsOf(who(['executive'])).length > 0);
});

test('the new roles have labels, descriptions and are created for every organisation', () => {
  const sql = read('../../scripts/postdeploy/0004-support-leadership-it-roles.sql');
  for (const slug of ['customer-care', 'customer-care-lead', 'executive', 'it-administrator']) {
    assert.ok(ROLE_LABELS[slug], slug);
    assert.ok(ROLE_DESCRIPTIONS[slug], slug);
    assert.match(sql, new RegExp(`'${slug}'`), slug);
    assert.match(read('../../scripts/v24-roles.sql'), new RegExp(`'${slug}'`), slug);
  }
  assert.match(sql, /ON CONFLICT \("organisationId", "slug"\) DO NOTHING/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
});

test('complaints and HR questions reach the right team; the customer portal opens requests itself', () => {
  const help = read('lib/actions/help.ts');
  assert.match(help, /about === 'complaint' \? 'customer_care' : about === 'hr' \? 'hr'/);
  assert.match(help, /routeHelp\(m\.organisationId, about\)/);
  const auto = read('lib/support/automations.ts');
  assert.match(auto, /tags: \{ has: 'portal_request' \}/);
  assert.match(auto, /tags\.includes\('complaint'\) \? 'customer_care'/);
  const portal = read('../website/lib/customer-portal/support.ts');
  assert.match(portal, /export async function openSupportRequest/);
  assert.match(portal, /customerId: me\.id, contactName: me\.fullName/);
  assert.match(portal, /tags: \['portal_request', \.\.\.kind\.tags\]/);
});

test('System health says when the database is behind this release', async () => {
  const { schemaVerdict, SCHEMA_MARKERS } = await import('../lib/schema-health-core');
  const all = new Set(SCHEMA_MARKERS.map((m) => `${m.table}.${m.column}`));
  assert.equal(schemaVerdict(all).state, 'current');
  const v37 = new Set(['support_tickets.token', 'support_tickets.requesterUserId']);
  const r = schemaVerdict(v37);
  assert.equal(r.state, 'behind');
  assert.equal(r.at, 'v37');
  assert.equal(r.expected, 'v38');
  assert.equal(r.missing.length, 2);
  assert.equal(schemaVerdict(new Set()).at, 'older than v36');
  assert.match(read('app/(app)/settings/page.tsx'), /schemaHealth\(\)/);
});
