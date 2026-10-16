/**
 * Integrity under concurrency, enforced on the source (like guard-coverage):
 *
 *  1. No workflow status is ever written with a plain update — every status
 *     change is a compare-and-set (updateMany with the expected status in its
 *     where, checked with claimed()), so two people acting at once can't both
 *     win and a stale screen can't overwrite a newer decision.
 *  2. Totals that are checked and then added to (money against an estimate,
 *     stock against what is on hand, a room's calendar) are re-checked under
 *     a row lock.
 *  3. One-per-record requests are created under the parent's lock.
 *
 * A new action that breaks one of these fails CI before it ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const LIB = join(ROOT, 'lib');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : n.endsWith('.ts') ? [p] : [];
  });
}

/** Index of the parenthesis closing the one at `open` (strings and // comments skipped). */
function closeParen(s: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '/' && s[i + 1] === '/') i = s.indexOf('\n', i);
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Top-level keys of the object literal starting at `open` ('{'). */
function topLevelKeys(s: string, open: number): string[] {
  if (open < 0) return [];
  const keys: string[] = [];
  let depth = 0;
  let token = '';
  for (let i = open; i < s.length; i++) {
    const c = s[i]!;
    if (c === '{' || c === '[' || c === '(') { depth++; if (depth === 1) { token = ''; continue; } }
    if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) break; }
    if (depth !== 1) continue;
    if (c === ',') { token = ''; continue; }
    if (c === ':' && token.trim() && !keys.includes(token.trim())) keys.push(token.trim());
    else if (/[\w$]/.test(c)) token += c;
    else if (!/\s/.test(c)) token = '';
  }
  return keys;
}

/** Writes of `status` that are deliberately not compare-and-set, with why. */
const ALLOWED_PLAIN_STATUS_WRITES: Record<string, string> = {
  // "Done for now" is re-callable by design; completing never races a decision.
  'lib/actions/vehicle-inspection.ts:vehicleInspection.update': 'inspection completion is idempotent',
  // Creating the estimate row (upsert's create branch) — no prior state to race.
  'lib/actions/workshop.ts:estimate.upsert': 'creates the DRAFT estimate',
  // One-off repair of legacy rows, guarded by its own where (status not ESCALATED).
  'lib/vehicle-service-cycle.ts:vehicleService.update': 'legacy normalisation',
  // Creates a PENDING learned answer; the update branch never touches status.
  'lib/enyo/learned.ts:enyoLearnedAnswer.upsert': 'creates the PENDING candidate',
  // A support mailbox's reading status (ACTIVE / ERROR / PAUSED) is configuration, not a workflow:
  // the last run or the administrator's choice simply wins.
  'lib/actions/support-admin.ts:supportMailbox.update': 'pause / resume a support mailbox',
  'lib/support/intake.ts:supportMailbox.update': 'reading status and position of a support mailbox',
  // A colleague's answer becomes a PENDING candidate again for approval.
  'lib/support/learn.ts:enyoLearnedAnswer.upsert': 'creates or resets the PENDING candidate',
  'lib/actions/support-monitor.ts:enyoLearnedAnswer.upsert': 'a reviewer\'s correction becomes (or resets) a PENDING candidate',
  // A customer / website chat answer becomes a PENDING candidate (an existing one is left as it is).
  'lib/enyo/conversations.ts:enyoLearnedAnswer.upsert': 'creates the PENDING candidate',
};

function body(fnName: string, src: string): string {
  const at = src.indexOf(`export async function ${fnName}(`);
  assert.ok(at >= 0, `function ${fnName} not found`);
  const next = src.indexOf('\nexport ', at + 10);
  return next === -1 ? src.slice(at) : src.slice(at, next);
}

test('no workflow status is written with a plain update (compare-and-set only)', () => {
  const offenders: string[] = [];
  for (const file of files(LIB)) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file).split('\\').join('/');
    for (const m of src.matchAll(/\b(?:prisma|tx)\.(\w+)\.(update|upsert)\(\{/g)) {
      const open = m.index! + m[0].length - 2;
      const call = src.slice(open, closeParen(src, open) + 1);
      const data = call.includes('data') ? call.slice(call.indexOf('data')) : call;
      if (!/\bstatus\s*[:,}]/.test(data)) continue;
      const key = `${rel}:${m[1]}.${m[2]}`;
      if (key in ALLOWED_PLAIN_STATUS_WRITES) continue;
      offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length} ${m[1]}.${m[2]}`);
    }
  }
  assert.deepEqual(offenders, [], `Status written without compare-and-set:\n${offenders.join('\n')}`);
});

test('topLevelKeys reads nested where clauses correctly', () => {
  const src = "({ where: { id: x, status: s.status, OR: [{ a: null }, { b: { lt: 1 } }] }, data: { y: 1 } })";
  assert.deepEqual(topLevelKeys(src, src.indexOf('{', src.indexOf('where:'))), ['id', 'status', 'OR']);
  const idOnly = '({ where: { id: x }, data: { status: 1 } })';
  assert.deepEqual(topLevelKeys(idOnly, idOnly.indexOf('{', idOnly.indexOf('where:'))), ['id']);
  const shorthand = '({ where: { id }, data: {} })';
  assert.deepEqual(topLevelKeys(shorthand, shorthand.indexOf('{', shorthand.indexOf('where:'))), []);
});

test('the allow-list only names writes that still exist (no stale exceptions)', () => {
  for (const key of Object.keys(ALLOWED_PLAIN_STATUS_WRITES)) {
    const [file, call] = key.split(':') as [string, string];
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(src.includes(`.${call}(`), `${key} no longer exists — remove it from the allow-list`);
  }
});

const read = (f: string) => readFileSync(join(LIB, 'actions', f), 'utf8');

test('money: payments and refunds are decided again under the record lock', () => {
  assert.match(body('recordPayment', read('workshop.ts')), /lockExisting\(tx, 'jobCard'/);
  assert.match(body('recordServicePayment', read('vehicle-service-payment.ts')), /lockExisting\(tx, 'vehicleService'/);
  const refund = body('recordRefund', read('refunds.ts'));
  assert.match(refund, /lockExisting\(tx,/);
  assert.match(refund, /retryOnNumberClash\('referenceNumber'/);
  for (const [f, fn] of [['workshop.ts', 'recordPayment'], ['vehicle-service-payment.ts', 'recordServicePayment'], ['refunds.ts', 'recordRefund']] as const) {
    assert.match(body(fn, read(f)), /exceedsBalance|toMinor/, `${fn} must compare money in whole kobo`);
  }
});

test('stock: reservation and release lock the stock rows; serials are issued exactly once', () => {
  const src = read('sourcing.ts');
  assert.match(body('approvePartRequestSlipByStore', src), /lockRows\(tx, 'partStockByPart'/);
  const release = body('releasePartRequestSlip', src);
  assert.match(release, /lockRows\(tx, 'partStockByPart'/);
  assert.match(release, /issued\.count !== 1/);
  // The slip is claimed BEFORE any stock moves.
  assert.ok(release.indexOf("status: 'APPROVED' }") < release.indexOf('quantityOnHand: { decrement'), 'release must claim the slip first');
});

test('goods receipts carry an idempotency key — a resent delivery never adds stock twice', () => {
  const src = readFileSync(join(LIB, 'actions', 'store.ts'), 'utf8');
  const grn = body('recordGoodsReceipt', src);
  assert.match(grn, /idempotencyKey: input\.idempotencyKey/);
  assert.match(grn, /goodsReceipt\.findUnique\(\{ where: \{ idempotencyKey/);
  assert.match(readFileSync(join(ROOT, 'components', 'GoodsReceiptForm.tsx'), 'utf8'), /<IdempotencyKey \/>/);
  assert.match(readFileSync(join(ROOT, '..', '..', 'packages', 'database', 'prisma', 'schema.prisma'), 'utf8'), /model GoodsReceipt \{[^}]*idempotencyKey\s+String\?\s+@unique/);
});

test('one-per-record requests are created under the parent lock', () => {
  const checks: [string, string, RegExp][] = [
    ['workshop.ts', 'requestJobCardCancellation', /lockExisting\(tx, 'jobCard'/],
    ['workshop.ts', 'requestJobCardClose', /lockExisting\(tx, 'jobCard'/],
    ['vehicle-service.ts', 'requestVehicleServiceCancellation', /lockExisting\(tx, 'vehicleService'/],
    ['vehicle-service.ts', 'requestVehicleServiceClose', /lockExisting\(tx, 'vehicleService'/],
    ['sourcing.ts', 'requestPartRequestSlip', /lockExisting\(tx, 'jobCard'/],
    ['sourcing.ts', 'requestServiceEstimatePartRequestSlip', /lockExisting\(tx, 'vehicleService'/],
    ['sourcing.ts', 'requestExternalProcurementBatch', /lockExisting\(tx, 'jobCard'/],
  ];
  for (const [f, fn, re] of checks) assert.match(body(fn, read(f)), re, `${fn} must create under the parent lock`);
});

test('bookings: a room and a host can never be double-booked by two people at once', () => {
  const src = read('scheduling.ts');
  assert.match(body('createAppointment', src), /bookExclusively\(/);
  assert.match(body('updateAppointment', src), /bookExclusively\(/);
  assert.match(src, /lockRows\(tx, 'meetingRoom'[\s\S]{0,200}lockRows\(tx, 'user'/, 'always room first, then host — one lock order');
});

test('administration: the last Administrator / Master Administrator is counted under a lock', () => {
  const remove = body('removeRole', read('users-admin.ts'));
  assert.match(remove, /lockRows\(tx, 'role'/);
  assert.match(remove, /last Master Administrator/);
  assert.match(remove, /last active Administrator/);
  assert.match(remove, /userId: \{ not: userId \}/, 'count the OTHER active administrators');
});

test('inside a transaction, only the transaction client is used (no second connection)', () => {
  // A query on the global client inside an interactive transaction needs a
  // second pooled connection — with a pool of one (serverless) it waits for
  // itself. Every transaction body added for integrity uses `tx` only.
  const offenders: string[] = [];
  for (const file of files(join(LIB, 'actions')).concat([join(LIB, 'integrity.ts')])) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\$transaction\(async \(tx\) => \{/g)) {
      const open = m.index! + m[0].length - 1 - '(async (tx) => {'.length + 1;
      const end = closeParen(src, src.indexOf('(', m.index!));
      const inner = src.slice(open, end);
      const hits = inner.match(/\bawait prisma\.\w+\.\w+\(/g);
      if (hits) offenders.push(`${relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length} ${hits.join(', ')}`);
    }
  }
  assert.deepEqual(offenders, [], `Global client used inside a transaction:\n${offenders.join('\n')}`);
});

test('every compare-and-set actually compares something besides the id', () => {
  // claimed(await X.updateMany({ where: { id } … })) would "win" every time —
  // the where must also name the state the person saw (status, assignee …).
  const weak: string[] = [];
  for (const file of files(LIB)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:claimed|claimedOrStale|stillAsSeen)\(\s*await \w+\.(\w+)\.(updateMany|deleteMany)\(/g)) {
      const open = src.indexOf('(', m.index! + m[0].length - 1);
      const call = src.slice(open, closeParen(src, open) + 1);
      const keys = topLevelKeys(call, call.indexOf('{', call.indexOf('where:')));
      if (keys.filter((k) => k !== 'id').length === 0) weak.push(`${relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length} ${m[1]}.${m[2]}`);
    }
  }
  assert.deepEqual(weak, [], `Compare-and-set without an expected state:\n${weak.join('\n')}`);
});

test('escalation can never open two Job Cards, nor a Job Card without its link', () => {
  const esc = body('escalateVehicleServiceToJobCard', read('vehicle-service.ts'));
  assert.match(esc, /'CANCELLED', 'ESCALATED'\]\.includes\(service\.status\)/, 'an escalated service is refused up front');
  assert.match(esc, /escalatedToJobCardId: null,\s*OR: \[\{ escalatedAt: null \}/, 'claimed on escalatedAt before the Job Card is opened');
  assert.ok(esc.indexOf('escalatedAt: claimedAt }') < esc.indexOf('await createJobCard('), 'claim first');
  const create = body('createJobCard', read('workshop.ts'));
  assert.match(create, /escalatedFromVehicleService: \{ connect: \{ id: escalatedServiceId \} \}/, 'Job Card created already linked');
});

test('close and cancellation approvals lock the parent first (no deadlock between them)', () => {
  for (const fn of ['approveCancellationRequest', 'approveCloseRequest']) {
    const b = body(fn, read('workshop.ts'));
    assert.ok(b.indexOf("lockExisting(tx, 'jobCard'") > -1 && b.indexOf("lockExisting(tx, 'jobCard'") < b.indexOf('claimed('), fn);
  }
  for (const fn of ['approveVehicleServiceCancellationRequest', 'approveVehicleServiceCloseRequest']) {
    const b = body(fn, read('vehicle-service.ts'));
    assert.ok(b.indexOf("lockExisting(tx, 'vehicleService'") > -1 && b.indexOf("lockExisting(tx, 'vehicleService'") < b.indexOf('claimed('), fn);
  }
});

test('estimates are submitted as one locked step (read, reprice, check, submit)', () => {
  assert.match(body('submitEstimateForValidation', read('workshop.ts')), /withEstimateUnchanged\(estimate\.id, 'DRAFT', async \(tx\) => \{\s*const lines = await tx\.estimateLineItem\.findMany/);
  assert.match(body('submitServiceEstimate', read('vehicle-service-estimate.ts')), /withServiceEstimateUnchanged\(estimateId, 'DRAFT', async \(tx\) => \{\s*const lines = await tx\.serviceEstimateLineItem\.findMany/);
});

test('a resent payment or refund form is recognised under the lock, not refused as "over the balance"', () => {
  assert.match(body('recordPayment', read('workshop.ts')), /lockExisting\(tx, 'jobCard'[\s\S]{0,300}tx\.payment\.findUnique\(\{ where: \{ idempotencyKey \}/);
  assert.match(body('recordServicePayment', read('vehicle-service-payment.ts')), /lockExisting\(tx, 'vehicleService'[\s\S]{0,300}tx\.payment\.findUnique\(\{ where: \{ idempotencyKey \}/);
  assert.match(body('recordRefund', read('refunds.ts')), /lockExisting\([\s\S]{0,400}tx\.refund\.findUnique\(\{ where: \{ idempotencyKey/);
});

test('a service being escalated is read-only until its Job Card is open', () => {
  const cycle = readFileSync(join(LIB, 'vehicle-service-cycle.ts'), 'utf8');
  assert.match(cycle, /if \(svc && escalationInFlight\(svc\)\)/, 'assertServiceNotEscalated refuses an in-flight escalation');
  assert.match(body('approveVehicleServiceCancellationRequest', read('vehicle-service.ts')), /escalatedAt: \{ lt: new Date\(Date\.now\(\) - ESCALATION_CLAIM_MS\) \}/);
  const esc = body('escalateVehicleServiceToJobCard', read('vehicle-service.ts'));
  assert.ok(esc.indexOf('const [estimateNow, paymentsNow]') > esc.indexOf('data: { escalatedAt: claimedAt }'), 're-checked after the claim');
});
