/**
 * A4c2 — customer documents in bulk, and the one place a document's contents
 * are worked out: the customer's figures (covered lines never charged, the
 * deposit), the period rules, the parts, the file names, and the wiring —
 * the email to the customer and the bulk copies use the same builders; the
 * zip needs both export rights at a workshop of the organisation, is never
 * cached or given during assist, and each download is audited.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectionPdfProps, jobEstimatePdfProps, jobEstimateTotals, letterhead, nairaForPdf, serviceEstimatePdfProps, serviceEstimateTotals } from '../lib/pdf/document-props';
import { checkPeriod, documentFileName, DOCUMENTS_PER_ZIP, partsOf, periodWindow, zipFileName } from '../lib/exports/documents';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const head = letterhead({ name: 'Demo Motors', legalName: null, hqAddress: null, poBox: null, rcNumber: null, hotlines: [], website: null, email: null, secret: 'x' } as never, { name: 'Ikeja', address: null, hotlines: [], email: null, bankAccountNumber: '1' } as never, 'https://portal.example/');
const bank = { bankName: 'Bank', accountName: 'Demo', accountNumber: '0001112223' };
const vehicle = { make: 'Isuzu', model: 'NQR', year: 2024, plateNumber: 'ABC-123XY', chassisNumber: 'JAAN1R75K00000001' };
const customer = { fullName: 'Ada Obi', address: '3 Street' };

test('the letterhead: only its own fields, the portal’s logo', () => {
  assert.deepEqual(Object.keys(head.organisation).sort(), ['email', 'hotlines', 'hqAddress', 'legalName', 'name', 'poBox', 'rcNumber', 'website']);
  assert.deepEqual(Object.keys(head.branch).sort(), ['address', 'email', 'hotlines', 'name']);
  assert.equal(head.logoUrl, 'https://portal.example/images/logo/logo.png');
});

test('a Job Card estimate: covered lines are shown but never charged; three figures; the 70% deposit; NGN in the PDF', () => {
  const lines = [
    { type: 'STORE_PART', description: 'Oil filter', quantity: 2, amount: '5000.00', unitOfMeasure: 'piece' },
    { type: 'EXTERNAL_JOB', description: 'Machining', quantity: 1, amount: 2500, unitOfMeasure: null },
    { type: 'LABOUR', description: 'Fit', quantity: 1, amount: 3000, unitOfMeasure: null },
    { type: 'LABOUR', description: 'Warranty labour', quantity: 1, amount: 9000, unitOfMeasure: null, billTo: 'WARRANTY', coveringWarranty: { warrantyNumber: 'WR-1' } },
    { type: 'SUNDRY', description: 'Rags', quantity: 1, amount: 500, unitOfMeasure: null },
  ];
  assert.deepEqual(jobEstimateTotals(lines), { services: 7500, labour: 3000, sundry: 500, total: 11000, minimumDeposit: 7700 });
  const p = jobEstimatePdfProps({ letterhead: head, bank, jobNumber: 'JC-2026-000001', customer, vehicle, lineItems: lines });
  assert.equal(p.totalAmount, 'NGN 11,000.00');
  assert.equal(p.minimumDepositAmount, 'NGN 7,700.00');
  assert.deepEqual([p.servicesSubtotal, p.labourSubtotal, p.sundrySubtotal], ['NGN 7,500.00', 'NGN 3,000.00', 'NGN 500.00']);
  assert.deepEqual(p.lineItems[0], { description: 'Oil filter', quantity: 2, unitLabel: 'pieces', amount: 'NGN 5,000.00' });
  assert.equal(p.lineItems[3]!.amount, 'Covered by warranty WR-1 — not charged');
  assert.equal(p.paymentRemarkSuggestion, 'JC-2026-000001 Isuzu NQR ABC-123XY');
  assert.equal(p.vehicleDescription, 'Isuzu NQR');
  assert.equal(p.accountNumber, '0001112223');
  assert.ok(!('type' in p.lineItems[0]!), 'the internal line types never reach the customer');
  assert.equal(nairaForPdf(0), 'NGN 0.00');
});

test('a Vehicle Service estimate: everything but labour and sundry is Parts & Services; its own label; the year on the vehicle', () => {
  const lines = [{ type: 'STORE_PART', description: 'Filter', quantity: '1', amount: 4000, unitOfMeasure: null }, { type: 'INTERNAL_JOB', description: 'Wash', quantity: 1, amount: 1000, unitOfMeasure: null }, { type: 'LABOUR', description: 'Service', quantity: 1, amount: 5000, unitOfMeasure: 'hour' }];
  assert.deepEqual(serviceEstimateTotals(lines), { services: 5000, labour: 5000, sundry: 0, total: 10000, minimumDeposit: 7000 });
  const p = serviceEstimatePdfProps({ letterhead: head, bank, serviceNumber: 'SV-2026-000009', customer, vehicle, lineItems: lines });
  assert.equal(p.referenceLabel, 'VEHICLE SERVICE');
  assert.equal(p.vehicleDescription, '2024 Isuzu NQR');
  assert.equal(p.sundrySubtotal, null);
  assert.equal(p.lineItems[2]!.unitLabel, 'hour');
  assert.equal(p.paymentRemarkSuggestion, 'SV-2026-000009 Isuzu NQR ABC-123XY');
});

test('an inspection report: reviewed items only', () => {
  const p = inspectionPdfProps({ letterhead: head, serviceNumber: 'SV-1', customerName: 'Ada Obi', vehicle, inspectedByName: 'T', completedOnLabel: 'x', items: [{ section: 'Brakes', name: 'Pads', condition: 'Worn', severity: 'HIGH', action: 'Replace' }, { section: 'Brakes', name: 'Discs', condition: null, severity: null, action: null }] });
  assert.deepEqual(p.reviewedItems.map((i: { name: string }) => i.name), ['Pads']);
});

test('the period: real days in order, not in the future, at most 92; whole days in Lagos', () => {
  const today = '2026-11-12';
  assert.deepEqual(checkPeriod('2026-11-01', '2026-11-12', today), { ok: true, from: '2026-11-01', to: '2026-11-12' });
  for (const [f, t] of [['2026-11-13', '2026-11-12'], ['2026-11-01', '2026-11-13'], ['2026-08-01', '2026-11-12'], ['x', '2026-11-12'], ['2026-13-40', '2026-11-12']]) assert.equal(checkPeriod(f, t, today).ok, false, `${f}..${t}`);
  assert.equal(checkPeriod('2026-08-13', '2026-11-12', today).ok, true, '92 days');
  const w = periodWindow('2026-11-01', '2026-11-01');
  assert.equal(w.start.toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-11-01T23:00:00.000Z');
});

test('the parts and the names', () => {
  assert.equal(DOCUMENTS_PER_ZIP, 40);
  assert.deepEqual([partsOf(0), partsOf(1), partsOf(40), partsOf(41), partsOf(121)], [1, 1, 1, 2, 4]);
  assert.equal(documentFileName('JOB_ESTIMATE', 'JC-2026-000123'), 'Estimate-JC-2026-000123.pdf');
  assert.equal(documentFileName('INSPECTION', 'SV 1/2'), 'Inspection-SV_1_2.pdf');
  assert.ok(!documentFileName('INSPECTION', '../../etc/passwd').includes('/'));
  assert.equal(zipFileName('SERVICE_ESTIMATE', '2026-11-01', '2026-11-12', 1, 1), 'EJO-vehicle-service-estimates-2026-11-01-to-2026-11-12.zip');
  assert.equal(zipFileName('JOB_ESTIMATE', '2026-11-01', '2026-11-12', 2, 3), 'EJO-job-card-estimates-2026-11-01-to-2026-11-12-part-2-of-3.zip');
});

test('wired in: the email and the bulk copies use the same builders; both rights at a workshop of the organisation; audited; never cached or during assist', () => {
  const job = read('lib/actions/workshop.ts');
  assert.match(job, /EstimatePdf\(jobEstimatePdfProps\(\{/);
  const svc = read('lib/actions/vehicle-service-estimate.ts');
  assert.match(svc, /EstimatePdf\(serviceEstimatePdfProps\(\{/);
  assert.match(svc, /InspectionPdf\(inspectionPdfProps\(\{/);
  const srv = read('lib/exports/documents-server.ts');
  for (const b of ['jobEstimatePdfProps', 'serviceEstimatePdfProps', 'inspectionPdfProps']) assert.match(srv, new RegExp(`${b}\\(\\{ letterhead: head`));
  assert.match(srv, /branch: \{ businessUnit: \{ organisationId: s\.organisationId \} \}/, 'every query hangs on the branch inside the organisation');
  assert.match(srv, /orderBy: \[\{ customerNotifiedAt: 'asc' \}, \{ id: 'asc' \}\]/, 'a fixed order, so the parts never overlap');
  const route = read('app/(app)/data-exchange/documents/download/route.ts');
  assert.match(route, /allows\('dataexchange\.export\.sensitive'\)/);
  assert.match(route, /allows\('dataexchange\.export\.run', \{ branchId: branch\.id \}\)\) \|\| !\(await allows\('dataexchange\.export\.sensitive', \{ branchId: branch\.id \}\)/);
  assert.match(route, /type: 'WORKSHOP', businessUnit: \{ organisationId \}/);
  assert.match(route, /refuseDuringAssist\('documentsDownload'\)/);
  assert.match(route, /action: 'data_exchange\.documents_downloaded'/);
  assert.match(route, /'Cache-Control': 'no-store'/);
  const shared = read('lib/exports/documents.ts');
  assert.doesNotMatch(shared, /^import /m, 'the form’s shared module pulls in nothing (the browser bundle builds)');
  assert.doesNotMatch(read('components/data-exchange/DocumentsForm.tsx'), /documents-server|document-props/);
});
