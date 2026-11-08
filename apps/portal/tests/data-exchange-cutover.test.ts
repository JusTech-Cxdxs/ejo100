/**
 * The cut-over checklist (P9): each kind of branch's steps in load order,
 * each step's state worked out from its imports (Finance's confirmation
 * counts), "not needed" with a reason (the latest mark counts), the next step
 * to do, waiting for the step a file names, and the sign-off — only when every
 * step is settled, reopened with a reason. Marks live in the audit trail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanCutoverReason, cutoverSnapshot, cutoverStepsFor, cutoverView, CUTOVER_PLAN, organisationWide, type CutoverJob, type CutoverMark } from '../lib/data-exchange/cutover';
import { ENTITIES } from '../lib/data-exchange/fields';
import { branchTypeFits } from '../lib/branch-types';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
let n = 0;
const job = (entity: string, status: string, o: Partial<CutoverJob> = {}): CutoverJob => ({ id: `j${++n}`, number: `IMP-2026-${String(n).padStart(6, '0')}`, entity, branchId: null, status, createdRows: 10, updatedRows: 0, completedAt: status === 'COMPLETED' ? new Date('2026-11-01T10:00:00Z') : null, signedOffAt: null, createdAt: new Date(Date.UTC(2026, 10, 1, 0, n)), ...o });
const mark = (action: CutoverMark['action'], entity: string | undefined, minute: number, reason?: string): CutoverMark => ({ action, entity, reason, at: new Date(Date.UTC(2026, 10, 2, 9, minute)), by: 'Hannah Admin' });

test('the plan: every step is an import there is, in an order where each file comes after the one it names, on a branch that can hold it', () => {
  for (const [type, steps] of Object.entries(CUTOVER_PLAN)) {
    const keys = steps!.map((s) => s.entity);
    assert.equal(new Set(keys).size, keys.length, `${type}: each step once`);
    keys.forEach((k, i) => {
      assert.ok(ENTITIES[k], `${type}: ${k}`);
      const after = ENTITIES[k].after;
      if (after && keys.includes(after)) assert.ok(keys.indexOf(after) < i, `${type}: ${k} after ${after}`);
      if (!organisationWide(k)) assert.ok(branchTypeFits(ENTITIES[k].branchArea ?? 'store', type), `${type} can hold ${k}`);
    });
    assert.equal(keys[0], 'staff', `${type}: the people first`);
  }
  assert.deepEqual(cutoverStepsFor('ASSEMBLY_PLANT').map((s) => s.entity), ['staff', 'plantShipments', 'plantVehicles', 'plantKits', 'plantKitIssues']);
  assert.deepEqual(cutoverStepsFor('HEAD_OFFICE'), [], 'headquarters has no checklist');
  assert.equal(organisationWide('customers'), true);
  assert.equal(organisationWide('stock'), false);
});

test('states from the imports: loaded, waiting for Finance, waiting for approval, being prepared, undone, not started', () => {
  const steps = cutoverStepsFor('WORKSHOP');
  const v = cutoverView(steps, [
    job('staff', 'COMPLETED', { createdRows: 41 }), job('customers', 'UNDONE'), job('customers', 'COMPLETED', { createdRows: 200, updatedRows: 3 }),
    job('vehicles', 'AWAITING_APPROVAL'), job('parts', 'VALIDATED'), job('stock', 'COMPLETED'), job('invoices', 'COMPLETED', { signedOffAt: new Date() }), job('jobs', 'UNDONE'),
  ], []);
  const st = Object.fromEntries(v.steps.map((s) => [s.entity, s.state]));
  assert.deepEqual([st.staff, st.customers, st.vehicles, st.parts, st.stock, st.invoices, st.jobs, st.openJobs], ['DONE', 'DONE', 'AWAITING_APPROVAL', 'IN_PROGRESS', 'AWAITING_FINANCE', 'DONE', 'UNDONE', 'NOT_STARTED']);
  const customers = v.steps.find((s) => s.entity === 'customers')!;
  assert.deepEqual([customers.added, customers.filled, customers.imports.length], [200, 3, 2]);
  assert.equal(v.settled, 3);
  // Waiting for what it names: open job cards wait for the vehicles (not loaded yet).
  assert.equal(v.steps.find((s) => s.entity === 'openJobs')!.waitingFor, 'vehicles');
  assert.equal(v.next, 'suppliers', 'the first step to do now: not settled, not under way, not waiting');
  assert.equal(v.signedOff, null);
  assert.ok(v.blockers.some((b) => b === 'Opening stock: loaded — waiting for finance to confirm the totals.'), v.blockers.join('|'));
});

test('not needed: with its reason, the latest mark counts; a loaded step is never "not needed"; the sign-off when every step is settled, reopened after', () => {
  const steps = cutoverStepsFor('ASSEMBLY_PLANT');
  const jobs = [job('staff', 'COMPLETED'), job('plantShipments', 'COMPLETED'), job('plantVehicles', 'COMPLETED'), job('plantKits', 'COMPLETED')];
  let v = cutoverView(steps, jobs, [mark('not_needed', 'plantKitIssues', 1, 'No open shortages on the day'), mark('needed', 'plantKitIssues', 2)]);
  assert.equal(v.steps.at(-1)!.state, 'NOT_STARTED', 'needed again');
  assert.equal(v.blockers.length, 1);
  const marks = [mark('not_needed', 'plantKitIssues', 1, 'x'), mark('needed', 'plantKitIssues', 2), mark('not_needed', 'plantKitIssues', 3, 'No open shortages on the day')];
  v = cutoverView(steps, jobs, marks);
  assert.deepEqual(v.steps.at(-1)!.notNeeded, { reason: 'No open shortages on the day', at: marks[2]!.at, by: 'Hannah Admin' });
  assert.deepEqual(v.blockers, []);
  assert.equal(v.next, null);
  // A step loaded after being marked not needed is loaded.
  assert.equal(cutoverView(steps, [...jobs, job('plantKitIssues', 'COMPLETED')], marks).steps.at(-1)!.state, 'DONE');
  assert.deepEqual(cutoverSnapshot(v).at(-1), { entity: 'plantKitIssues', state: 'NOT_NEEDED', added: 0, filled: 0, imports: [], reason: 'No open shortages on the day' });
  assert.equal(cutoverSnapshot(v)[1]!.imports.length, 1);
  const signed = cutoverView(steps, jobs, [...marks, mark('signed_off', undefined, 10)]);
  assert.equal(signed.signedOff?.by, 'Hannah Admin');
  assert.equal(cutoverView(steps, jobs, [...marks, mark('signed_off', undefined, 10), mark('reopened', undefined, 11, 'Kits file to load again')]).signedOff, null);
});

test('reasons: a few real words, at most 300 characters', () => {
  assert.equal(cleanCutoverReason('  No open   claims  '), 'No open claims');
  assert.equal(cleanCutoverReason('n/a'), null);
  assert.equal(cleanCutoverReason('12345'), null);
  assert.equal(cleanCutoverReason('x'.repeat(400))!.length, 300);
});

test('wired in: approvers at the branch mark and sign; append-only marks read back before they count; never during an assisted session', () => {
  const a = read('lib/actions/data-exchange-cutover.ts');
  assert.match(a, /allows\('dataexchange\.import\.approve', \{ branchId: b\.id \}\)/);
  assert.match(a, /refuseDuringAssist\(where\)/);
  assert.match(a, /businessUnit: \{ organisationId \}/, 'fenced to the organisation');
  assert.match(a, /return \(await prisma\.auditLog\.count\(\{ where \}\)\) > before;/, 'a mark counts only once it is in the audit trail');
  assert.doesNotMatch(a, /auditLog\.(update|delete)/, 'nothing is ever edited');
  assert.match(a, /if \(view\.blockers\.length\) return fail/);
  assert.match(a, /steps: cutoverSnapshot\(view\)/, 'the sign-off keeps the checklist as it stood');
});
