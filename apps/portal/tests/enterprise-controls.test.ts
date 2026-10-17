import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Enterprise controls (Stage 1): separation of duties on parts and outside
 * purchases, the append-only audit trail, and request ids in error logs.
 * Static checks: each rule is in the code where the step happens, so a later
 * edit that drops one fails here before it reaches a review.
 */
const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The body of one exported function, up to the next top-level export. */
function body(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = src.indexOf('\nexport ', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

const SOD: Array<{ fn: string; perm: string; refused: string[] }> = [
  { fn: 'approvePartRequestSlipByHod', perm: 'store.prs.approve_hod', refused: ['slip.requestedById'] },
  { fn: 'approvePartRequestSlipByStore', perm: 'store.prs.release', refused: ['slip.requestedById', 'slip.hodApprovedById'] },
  { fn: 'sendExternalProcurementToManager', perm: 'procurement.epr.review', refused: ['request.requestedById'] },
  { fn: 'approveExternalProcurementRequest', perm: 'procurement.epr.approve', refused: ['request.requestedById', 'request.financeReviewedById'] },
  { fn: 'disburseExternalProcurementRequest', perm: 'procurement.epr.disburse', refused: ['request.requestedById', 'request.managerApprovedById'] },
];

test('separation of duties: nobody approves, reviews or pays out a request they raised or already approved', () => {
  const src = read('lib/actions/sourcing.ts');
  for (const s of SOD) {
    const b = body(src, s.fn);
    for (const r of s.refused) {
      const field = r.split('.')[1]!;
      assert.match(b, new RegExp(`${field}: true`), `${s.fn} reads ${field}`);
      assert.match(b, new RegExp(`user\\.id === ${r.replace('.', '\\.')}`), `${s.fn} compares the person with ${r}`);
    }
    assert.match(b, new RegExp(`await refuse\\('${s.perm.replace(/\./g, '\\.')}', '${s.fn}'`), `${s.fn} refuses through refuse() (audited)`);
    // The refusal comes before the compare-and-set claim, so nothing changes first.
    const refuseAt = b.indexOf('await refuse(');
    const claimAt = b.search(/\.updateMany\(|\$transaction\(/);
    if (claimAt >= 0) assert.ok(refuseAt < claimAt, `${s.fn} refuses before changing anything`);
  }
});

test('the integrity watch flags the same Finance colleague reviewing and paying out', () => {
  const scan = read('lib/integrity/scan.ts');
  assert.match(scan, /spa:epr-review-pay:/);
});

test('the audit trail is append-only in the database (postdeploy 0005)', () => {
  const sql = readFileSync(join(ROOT, '..', '..', 'scripts', 'postdeploy', '0005-audit-log-append-only.sql'), 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+(public\.)?ejo_audit_logs_append_only\(\)/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "?(public\.)?audit_logs"?\s+FOR EACH ROW/i);
  assert.match(sql, /BEFORE TRUNCATE ON "?(public\.)?audit_logs"?/i);
  assert.match(sql, /RAISE EXCEPTION/i);
  assert.match(sql, /ejo\.audit_maintenance/, 'a deliberate, named maintenance switch for retention only');
  assert.match(sql, /to_regclass\('public\.audit_logs'\)/, 'safe on a database without the table');
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|^\s*TRUNCATE\b/im, 'never removes data');
});

test('the audit retention job, if any, switches maintenance on for its own transaction only', () => {
  const sql = readFileSync(join(ROOT, '..', '..', 'scripts', 'postdeploy', '0005-audit-log-append-only.sql'), 'utf8');
  // set_config(..., true) / SET LOCAL is transaction-scoped; a session-wide switch would leave the trail open.
  assert.doesNotMatch(sql, /set_config\('ejo\.audit_maintenance',\s*'on',\s*false\)/i);
});

test('error references are tied to the request id in the logs', () => {
  const ev = read('lib/error-events.ts');
  assert.match(ev, /h\?\.get\('x-request-id'\)/);
  assert.match(ev, /message: 'Error reference', ref: r\.ref/);
  const mw = read('middleware.ts');
  assert.match(mw, /forwarded\.set\('x-request-id', requestId\)/);
  assert.match(mw, /res\.headers\.set\('x-request-id', requestId\)/);
});

test('the person whose step it now is gets an email, end to end', () => {
  const src = read('lib/actions/sourcing.ts');
  // Finance hears when an outside purchase is ready to pay out; the reviewer hears when the manager turns it down.
  assert.match(body(src, 'approveExternalProcurementRequest'), /where: 'external_procurement\.approved'/);
  assert.match(body(src, 'rejectExternalProcurementRequest'), /if \(stage === 'MANAGER_APPROVAL'\)[\s\S]*financeReviewedById/);
  // Whoever raised a parts request or outside purchase hears every outcome; a Store rejection also tells the HOD.
  assert.match(src, /slip\?\.requestedById, kind === 'rejected' && slip\?\.rejectionStage === 'STORE' \? slip\.hodApprovedById/);
  assert.match(src, /jobCard\.assignedTechnicianId, req\?\.requestedById/);
  // After the response: a slow mail server never delays approve, reject or rework.
  assert.doesNotMatch(src, /await emailColleagues\(/);
  const ws = read('lib/actions/workshop.ts');
  assert.doesNotMatch(ws, /await emailColleagues\(/);
  assert.match(ws, /where: 'job_card\.quality_check'/);
  assert.match(ws, /where: 'job_card\.rework'/);
  assert.match(body(ws, 'returnEstimateForChanges'), /where: 'estimate\.returned_for_changes'/);
  assert.match(body(ws, 'reassignSupervisor'), /where: 'job_card\.supervisor_reassigned'/);
  const sup = read('lib/actions/support.ts');
  assert.match(body(sup, 'moveSupportTicket'), /nextAssignee\(t\.organisationId, target\.id\)/);
  assert.match(body(sup, 'moveSupportTicket'), /nobody_free_alerted/);
  assert.match(sup, /where: 'support\.reassigned'/);
  assert.match(read('lib/actions/security.ts'), /Department Head authorised/);
  assert.match(read('lib/actions/users-admin.ts'), /if \(active\) after\(\(\) => tellReactivated\(user\.id\)\)/);
  assert.match(read('lib/auth.ts'), /onPasswordReset: async/);
  assert.match(read('lib/auth.ts'), /ctx\.path === '\/change-password'[\s\S]*sendPasswordChangedNotice/);
  // One helper: never the person who acted, active colleagues of the same organisation only, never throws.
  const h = read('lib/workflow-notify.ts');
  assert.match(h, /x !== o\.exceptUserId/);
  assert.match(h, /organisationId, isActive: true/);
  assert.match(h, /catch \(err\)/);
});
