/**
 * Service Centre rules (lib/service-core.ts): the job status machine, warranty
 * cover worked out from the rows a serial carries, cost-centre rules, the
 * ledger totals and the money on a paid repair. Plus source checks that the
 * actions keep the segregation the Service Centre promises.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canMoveServiceJob, SERVICE_TRANSITIONS, SERVICE_JOB_STATUSES, isServiceJobOpen, warrantyCoverageOn, serviceJobKindFor, warrantyEndsAt,
  allowedCostCentres, costCentreCarriedByZinox, raisesSupplierClaim, ledgerTotals, paidJobBalance, canReturnUnit, canQaServiceJob, serviceStepIndex, lagosMonthStart, lagosYearStart,
  COST_CENTRES, SERVICE_JOB_STATUS_LABEL, COVERAGE_LABEL,
} from '../lib/service-core';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.UTC(2026, 9, 18) + days * DAY);

test('the status machine only moves forward along the service path', () => {
  assert.ok(canMoveServiceJob('OPEN', 'ASSIGNED'));
  assert.ok(canMoveServiceJob('ASSIGNED', 'DIAGNOSED'));
  assert.ok(canMoveServiceJob('DIAGNOSED', 'REPAIRING'));
  assert.ok(canMoveServiceJob('DIAGNOSED', 'AWAITING_PARTS'));
  assert.ok(canMoveServiceJob('AWAITING_PARTS', 'REPAIRING'));
  assert.ok(canMoveServiceJob('REPAIRING', 'QA'));
  assert.ok(canMoveServiceJob('QA', 'READY'), 'QA passed');
  assert.ok(canMoveServiceJob('QA', 'REPAIRING'), 'QA failed → rework');
  assert.ok(canMoveServiceJob('READY', 'RETURNED'));
  assert.ok(canMoveServiceJob('RETURNED', 'CLOSED'));
  assert.ok(!canMoveServiceJob('OPEN', 'READY'), 'no skipping to ready');
  assert.ok(!canMoveServiceJob('QA', 'RETURNED'), 'a unit is returned only once ready');
  assert.ok(!canMoveServiceJob('READY', 'CANCELLED'), 'a repaired unit is not cancelled');
  assert.ok(!canMoveServiceJob('CLOSED', 'OPEN'));
  assert.ok(!canMoveServiceJob('CANCELLED', 'ASSIGNED'));
  for (const s of SERVICE_JOB_STATUSES) assert.ok(Array.isArray(SERVICE_TRANSITIONS[s]), `${s} has transitions`);
  assert.deepEqual(SERVICE_TRANSITIONS.CLOSED, []);
  assert.deepEqual(SERVICE_TRANSITIONS.CANCELLED, []);
  assert.ok(isServiceJobOpen('AWAITING_PARTS') && isServiceJobOpen('READY') && !isServiceJobOpen('RETURNED') && !isServiceJobOpen('CANCELLED'));
  assert.equal(serviceStepIndex('AWAITING_PARTS'), serviceStepIndex('REPAIRING'));
  assert.equal(serviceStepIndex('CLOSED'), serviceStepIndex('RETURNED'));
  for (const s of SERVICE_JOB_STATUSES) assert.ok(SERVICE_JOB_STATUS_LABEL[s].length > 3);
});

test('warranty cover: an ACTIVE product warranty whose dates include the day covers it; the latest-ending wins', () => {
  const rows = [
    { id: 'a', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-400), endsAt: at(-35), warrantyNumber: 'WR-1' },
    { id: 'b', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-30), endsAt: at(300), warrantyNumber: 'WR-2' },
    { id: 'c', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-30), endsAt: at(60), warrantyNumber: 'WR-3' },
    { id: 'd', kind: 'PART', status: 'ACTIVE', startsAt: at(-30), endsAt: at(900), warrantyNumber: 'WR-PART' },
  ];
  const c = warrantyCoverageOn(rows, at(0));
  assert.equal(c.state, 'COVERED');
  assert.ok(c.covered);
  assert.equal(c.warranty?.id, 'b', 'latest-ending active warranty');
  assert.equal(c.daysLeft, 300);
  assert.equal(serviceJobKindFor(c), 'WARRANTY');
  // Part warranties never cover the unit.
  assert.equal(warrantyCoverageOn([rows[3]!], at(0)).state, 'NONE');
});

test('warranty cover: ending soon, expired, pending, suspended, void and none', () => {
  const soon = warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-300), endsAt: at(10) }], at(0));
  assert.equal(soon.state, 'EXPIRING_SOON');
  assert.ok(soon.covered);
  assert.equal(soon.daysLeft, 10);
  const expired = warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-400), endsAt: at(-5) }], at(0));
  assert.equal(expired.state, 'EXPIRED');
  assert.ok(!expired.covered);
  assert.equal(expired.warranty?.id, 'a');
  assert.equal(serviceJobKindFor(expired), 'PAID');
  assert.equal(warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'PENDING_VERIFICATION', startsAt: at(-1), endsAt: at(300) }], at(0)).state, 'PENDING_VERIFICATION');
  assert.equal(warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'SUSPENDED', startsAt: at(-1), endsAt: at(300) }], at(0)).state, 'SUSPENDED');
  assert.equal(warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'VOID', startsAt: at(-1), endsAt: at(300) }], at(0)).state, 'NONE');
  assert.equal(warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(5), endsAt: at(300) }], at(0)).state, 'NONE', 'not started yet');
  assert.equal(warrantyCoverageOn([], at(0)).state, 'NONE');
  // String dates (as they come back from JSON) work too.
  assert.ok(warrantyCoverageOn([{ id: 'a', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-1).toISOString(), endsAt: at(1).toISOString() }], at(0)).covered);
  for (const k of Object.keys(COVERAGE_LABEL)) assert.ok(COVERAGE_LABEL[k as keyof typeof COVERAGE_LABEL].length > 5);
});

test('warranty end date: start plus the policy months, clamped to the month end', () => {
  assert.equal(warrantyEndsAt(new Date(Date.UTC(2026, 0, 31)), 1).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(warrantyEndsAt(new Date(Date.UTC(2026, 2, 4)), 12).toISOString().slice(0, 10), '2027-03-04');
  assert.equal(warrantyEndsAt(new Date(Date.UTC(2026, 10, 15)), 24).toISOString().slice(0, 10), '2028-11-15');
});

test('cost centres: user damage is the customer\'s; component failures raise a supplier claim; paid jobs only user damage or goodwill', () => {
  assert.deepEqual(allowedCostCentres('WARRANTY'), COST_CENTRES);
  assert.deepEqual(allowedCostCentres('PAID'), ['USER_DAMAGE', 'GOODWILL']);
  assert.deepEqual(allowedCostCentres('GOODWILL'), ['GOODWILL']);
  assert.ok(!costCentreCarriedByZinox('USER_DAMAGE'));
  for (const c of COST_CENTRES.filter((x) => x !== 'USER_DAMAGE')) assert.ok(costCentreCarriedByZinox(c), c);
  assert.ok(raisesSupplierClaim('COMPONENT_SUPPLIER') && !raisesSupplierClaim('PRODUCTION_DEFECT'));
});

test('ledger totals: by cost centre within the period, rounded to kobo; reversals subtract', () => {
  const rows = [
    { costCentre: 'PRODUCTION_DEFECT', amount: '1000.005', recordedAt: at(-1) },
    { costCentre: 'PRODUCTION_DEFECT', amount: 250, recordedAt: at(-2) },
    { costCentre: 'COMPONENT_SUPPLIER', amount: 99.99, recordedAt: at(-3) },
    { costCentre: 'GOODWILL', amount: -50, recordedAt: at(-3) },
    { costCentre: 'TRANSIT_DAMAGE', amount: 10, recordedAt: at(-40) }, // outside
    { costCentre: 'USER_DAMAGE', amount: 'not-a-number', recordedAt: at(-1) },
  ];
  const t = ledgerTotals(rows, at(-30), at(0));
  assert.equal(t.byCostCentre.PRODUCTION_DEFECT, 1250.01);
  assert.equal(t.byCostCentre.COMPONENT_SUPPLIER, 99.99);
  assert.equal(t.byCostCentre.GOODWILL, -50);
  assert.equal(t.byCostCentre.TRANSIT_DAMAGE, 0);
  assert.equal(t.total, 1300);
  assert.equal(t.count, 4);
  assert.equal(lagosMonthStart(new Date('2026-10-18T03:00:00Z')).toISOString(), '2026-09-30T23:00:00.000Z');
  assert.equal(lagosYearStart(new Date('2026-10-18T03:00:00Z')).toISOString(), '2025-12-31T23:00:00.000Z');
});

test('money on a paid repair: balance, and the unit goes back only once paid in full', () => {
  assert.equal(paidJobBalance(null, 0), 0);
  assert.equal(paidJobBalance(45000, 20000), 25000);
  assert.equal(paidJobBalance(45000, 45000), 0);
  assert.equal(paidJobBalance(100, 150), 0, 'never negative');
  assert.equal(paidJobBalance(0.3, 0.1), 0.2);
  assert.deepEqual(canReturnUnit({ status: 'READY', kind: 'WARRANTY', quotedAmount: null, paidAmount: 0 }), { ok: true, reason: null });
  assert.ok(!canReturnUnit({ status: 'QA', kind: 'WARRANTY', quotedAmount: null, paidAmount: 0 }).ok);
  assert.match(canReturnUnit({ status: 'READY', kind: 'PAID', quotedAmount: null, paidAmount: 0 }).reason ?? '', /Quote/);
  assert.match(canReturnUnit({ status: 'READY', kind: 'PAID', quotedAmount: 45000, paidAmount: 20000 }).reason ?? '', /25,000\.00/);
  assert.ok(canReturnUnit({ status: 'READY', kind: 'PAID', quotedAmount: 45000, paidAmount: 45000 }).ok);
  assert.ok(canReturnUnit({ status: 'READY', kind: 'GOODWILL', quotedAmount: null, paidAmount: 0 }).ok);
});

test('QA after repair is never done by the technician who repaired the unit', () => {
  assert.ok(canQaServiceJob({ status: 'QA', technicianId: 'tech' }, 'supervisor').ok);
  const self = canQaServiceJob({ status: 'QA', technicianId: 'tech' }, 'tech');
  assert.ok(!self.ok);
  assert.match(self.reason ?? '', /technician who repaired/);
  assert.ok(!canQaServiceJob({ status: 'REPAIRING', technicianId: 'tech' }, 'supervisor').ok);
});

test('the actions keep the rules: assignment-aware checks, compare-and-set, the unit back to SOLD, refuseDuringAssist on QA', () => {
  const src = read('lib/actions/service.ts');
  assert.match(src, /async function authorizeOnServiceJob\(/, 'one assignment-aware check from the record itself');
  assert.match(src, /assigneeIds: \[job\.technicianId, job\.supervisorId\]/);
  for (const fn of ['recordServiceDiagnosis', 'recordServicePartUsed', 'recordServiceResolution', 'markServiceAwaitingParts', 'resumeServiceRepair']) {
    assert.match(src, new RegExp(`export async function ${fn}\\([\\s\\S]{0,400}authorizeOnServiceJob\\('service\\.job\\.work'`), `${fn} is the technician's step`);
  }
  for (const fn of ['assignServiceTechnician', 'recordServiceQa', 'returnServiceUnit', 'closeServiceJob', 'cancelServiceJob', 'quoteServiceJob', 'recordServiceJobPayment']) {
    assert.match(src, new RegExp(`export async function ${fn}\\([\\s\\S]{0,400}authorizeOnServiceJob\\('service\\.manage'`), `${fn} is the supervisor's step`);
  }
  assert.match(src, /export async function recordServiceQa\([\s\S]{0,200}refuseDuringAssist\('recordServiceQa'\)/);
  assert.match(src, /canQaServiceJob\(job, user\.id\)/, 'the technician cannot pass their own repair');
  assert.match(src, /finishedUnit\.updateMany\(\{ where: \{ id: look\.unit\.id, status: look\.unit\.status as FinishedUnitStatus \}, data: \{ status: 'IN_SERVICE' \} \}/, 'the unit goes IN_SERVICE by compare-and-set');
  assert.match(src, /finishedUnit\.updateMany\(\{ where: \{ id: unit\.id, status: 'IN_SERVICE' \}, data: \{ status: to \} \}/, 'and back by compare-and-set');
  assert.match(src, /const to = unit\.customerId \? 'SOLD' : 'IN_STOCK'/);
  assert.doesNotMatch(src, /serviceJob\.update\(\{[^}]*data: \{[^}]*status/, 'no plain status update');
  assert.match(src, /nextDocumentNumber\('SVC'/);
  for (const key of ['service.manage', 'service.job.work', 'warranty.claim.approve', 'service.view']) assert.ok(src.includes(`'${key}'`), key);
  // Cost centre and ledger are the Warranty Manager's.
  assert.match(src, /export async function setServiceCostCentre\([\s\S]{0,300}authorize\('warranty\.claim\.approve', \{ branchId: job\.branchId, homeBranch: true \}/);
  assert.match(src, /export async function recordWarrantyLedgerEntry\([\s\S]{0,300}authorize\('warranty\.claim\.approve', \{ branchId: job\.branchId, homeBranch: true \}/);
  // Dashboard ids.
  for (const id of ['service-claim-', 'service-assign-', 'service-qa-']) assert.ok(src.includes(`\`${id}$`), id);
});

test('product warranties: PRODUCT kind, one active per unit, the Warranty module\'s numbering, and claims linked to a service job', () => {
  const src = read('lib/actions/product-warranty.ts');
  assert.match(src, /kind: 'PRODUCT', status: 'ACTIVE'/);
  assert.match(src, /`WR-\$\{lagosYear\(\)\}-`/);
  assert.match(src, /`WC-\$\{lagosYear\(\)\}-`/);
  assert.match(src, /retryOnNumberClash\('warrantyNumber'/);
  assert.match(src, /retryOnNumberClash\('claimNumber'/);
  assert.match(src, /already holds/);
  assert.match(src, /openServiceJob\(\{ serialNumber: unit\.serialNumber, fault, kind: 'WARRANTY', warrantyClaimId: claim\.id \}\)/);
  assert.match(src, /authorize\('warranty\.manage'/);
});

test('every route folder is guarded and has a loading file; print pages exist', () => {
  for (const dir of ['app/(app)/service', 'app/(app)/projects']) {
    assert.match(read(`${dir}/layout.tsx`), /guardAnyPage\(\['(service|projects)\.view'\]/);
  }
  for (const dir of ['app/(app)/service', 'app/(app)/service/jobs', 'app/(app)/service/jobs/new', 'app/(app)/service/jobs/[id]', 'app/(app)/service/warranties', 'app/(app)/service/claims', 'app/(app)/service/ledger', 'app/(app)/projects', 'app/(app)/projects/new', 'app/(app)/projects/[id]']) {
    assert.equal(read(`${dir}/loading.tsx`).trim(), "export { default } from '@/components/RouteLoading';", dir);
    assert.match(read(`${dir}/page.tsx`), /guardAnyPage\(/, `${dir} page guards`);
  }
  assert.match(read('app/(app)/service/ledger/page.tsx'), /guardAnyPage\(\['warranty\.claim\.approve', 'service\.manage'\]/);
  for (const p of ['app/print/service-job/[id]/page.tsx', 'app/print/project-acceptance/[id]/page.tsx']) {
    const s = read(p);
    assert.match(s, /accentColor="#E10600"/);
    assert.match(s, /variant !== 'client'/);
    assert.match(s, /notFound\(\)/);
  }
});
