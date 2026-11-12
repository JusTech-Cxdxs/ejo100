/**
 * B — portal invitations for imported customers: who is invited (an email on
 * file, access on, never invited from the import, never signed in, no portal
 * account), once each (compare-and-set), with the same welcome and one-time
 * link as a customer registered at the front desk; for the people who manage
 * customers; never during assist; audited; one additive column.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('wired in: who is invited, once, by whom, with what', () => {
  const a = read('lib/actions/data-exchange.ts');
  assert.match(a, /const portalWaiting = \(jobId: string, organisationId: string\): Prisma\.CustomerWhereInput => \(\{ importJobId: jobId, organisationId, isActive: true, email: \{ not: null \}, portalInvitedAt: null, lastLoginAt: null, accounts: \{ none: \{\} \} \}\)/);
  const fn = a.slice(a.indexOf('export async function sendCustomerPortalInvitations'), a.indexOf('/** Where a record brought in by an import came from'));
  assert.match(fn, /refuseDuringAssist\('sendCustomerPortalInvitations'\)/);
  assert.match(fn, /authorize\('crm\.manage', undefined, 'sendCustomerPortalInvitations'/);
  assert.match(fn, /const job = await myImportJob\(jobId\)/, 'the import found inside the person’s organisation');
  assert.match(fn, /job\.entity !== 'customers'/);
  assert.match(fn, /job\.status !== 'COMPLETED'/);
  assert.match(fn, /take: 25/);
  assert.match(fn, /updateMany\(\{ where: \{ id: c\.id, organisationId: job\.organisationId, portalInvitedAt: null \}, data: \{ portalInvitedAt: new Date\(\) \} \}\)/, 'each customer once');
  assert.ok(fn.indexOf('if (claimed.count !== 1) continue;') < fn.indexOf("sendCustomerAccessEmail(c.id, 'welcome', userId)"), 'claimed before the email is sent');
  assert.match(fn, /action: 'customer\.portal_invited'/);
  assert.doesNotMatch(fn, /password/i, 'no password is made, sent or seen here');
  const view = read('components/data-exchange/ImportJobView.tsx');
  assert.match(view, /data-testid="portal-invitations"/);
  assert.match(view, /job\.me\.canInvitePortal/);
});

test('the column: additive, re-runnable, skipped on a brand-new database', () => {
  for (const f of ['scripts/predeploy/0027-customer-portal-invited.sql', 'scripts/v-b-customer-portal-invited.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portalInvitedAt" TIMESTAMP\(3\);/);
    assert.match(sql, /IF to_regclass\('public\.customers'\) IS NULL THEN/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE|RENAME)\b/i, 'additive only');
  }
  assert.match(read('../../packages/database/prisma/schema.prisma'), /portalInvitedAt DateTime\?/);
});
