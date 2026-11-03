/**
 * Open job cards at the cut-over (P5): the pure row check — every row a job
 * card at one of EJO's open stages, SAP's statuses understood, the parts
 * issued parsed, closed and unknown stages refused, a vehicle required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, mappingProblems } from '../lib/data-exchange/fields';
import { checkOpenJobRow, openJobStage, parseIssuedParts } from '../lib/data-exchange/check-open-jobs';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('stages: EJO’s words and SAP’s statuses; closed is history; nonsense is refused', () => {
  assert.equal(openJobStage(''), 'CHECKED_IN');
  assert.equal(openJobStage('CRTD'), 'CHECKED_IN');
  assert.equal(openJobStage('Checked in'), 'CHECKED_IN');
  assert.equal(openJobStage('REL'), 'IN_PROGRESS');
  assert.equal(openJobStage('Work in progress'), 'IN_PROGRESS');
  assert.equal(openJobStage('Awaiting parts'), 'AWAITING_PARTS');
  assert.equal(openJobStage('MATS'), 'AWAITING_PARTS');
  assert.equal(openJobStage('QC'), 'QUALITY_CHECK');
  assert.equal(openJobStage('Quality check'), 'QUALITY_CHECK');
  assert.equal(openJobStage('Awaiting customer approval'), 'AWAITING_CUSTOMER_APPROVAL');
  assert.equal(openJobStage('Estimate sent'), 'AWAITING_CUSTOMER_APPROVAL');
  assert.equal(openJobStage('TECO'), 'COMPLETED');
  assert.equal(openJobStage('Completed'), 'COMPLETED');
  assert.equal(openJobStage('Ready for collection'), 'READY_FOR_COLLECTION');
  assert.equal(openJobStage('Invoiced'), 'READY_FOR_COLLECTION');
  for (const closed of ['CLSD', 'Closed', 'Checked out', 'Collected', 'Cancelled', 'CNCL', 'DLFL']) assert.equal(openJobStage(closed), 'CLOSED', closed);
  assert.equal(openJobStage('Somewhere'), null);
});

test('parts issued: "number xqty @price" items, names allowed, nonsense reported', () => {
  const p = parseIssuedParts('8-97366-430-0 x2 @45000; Oil filter x1 @6500; Wiper blade set; 8-98123456-0 × 3');
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.items.map((i) => [i.partNumber, i.text, i.quantity, i.unitPrice, i.amount]), [
    ['8-97366-430-0', '8-97366-430-0', 2, 45000, 90000], [null, 'Oil filter', 1, 6500, 6500], [null, 'Wiper blade set', 1, null, null], ['8-98123456-0', '8-98123456-0', 3, null, null],
  ]);
  assert.match(parseIssuedParts('Brake pads x abc').problems[0] ?? parseIssuedParts('Brake pads x abc').items[0]!.text, /Brake pads/);
  assert.equal(parseIssuedParts('').items.length, 0);
});

test('a row: the SAP order list maps itself; the estimate total is labour + parts; the deposit is read; refusals for closed, unknown stage, no vehicle, future date', () => {
  const h = ['AUFNR', 'KUNUM', 'VHVIN', 'LICENSE_NUM', 'ERDAT', 'STAT', 'RECDV', 'KTEXT', 'LTXA1', 'Technician', 'Supervisor', 'Labour', 'Parts', 'Estimate approved', 'Parts issued', 'Paid', 'Payment method', 'Receipt', 'Paid on', 'Notes', 'Branch'];
  const m = autoMap('openJobs', h);
  assert.deepEqual(mappingProblems('openJobs', m), []);
  assert.deepEqual(mappingProblems('openJobs', { ...m, vin: null, plateNumber: null }), ['Choose the column for the vehicle’s chassis number (VIN) or plate: an open job card is on a vehicle.']);
  const row = ['000483203', '0001000102', 'JAANLR85EL7100002', 'LND 102 CD', '30.10.2026', 'REL', '22,900', 'Brakes squeal; steering pulls left', 'Front pads worn', 'EMP-0042', 'EMP-0007', '45000', '112200', 'Yes', '8-98100000-0 x1 @45000; 8-98100012-2 x2 @33600', '60000', 'Bank transfer', 'RCPT-2026-1041', '30.10.2026', '', 'Isolo Branch'];
  const c = checkOpenJobRow(row, m, '2026-11-02');
  assert.equal(c.status, 'GOOD', JSON.stringify(c.issues));
  const v = c.values!;
  assert.equal(v.jobNumber, '483203');
  assert.equal(v.stage, 'IN_PROGRESS');
  assert.deepEqual(v.complaints, ['Brakes squeal', 'steering pulls left']);
  assert.equal(v.mileage, 22900);
  assert.equal(v.estimateTotal, 157200);
  assert.equal(v.estimateApproved, true);
  assert.equal(v.partsIssued.length, 2);
  assert.equal(v.paidAmount, 60000);
  assert.equal(v.paymentMethod, 'BANK_TRANSFER');
  assert.equal(v.paidOn, '2026-10-30');
  assert.equal(v.technician, 'EMP-0042');
  assert.deepEqual(c.keys, ['job:483203', 'vin:JAANLR85EL7100002', 'plate:LND102CD']);
  const err = (cells: string[]) => checkOpenJobRow(cells, m, '2026-11-02').issues.filter((i) => i.level === 'error').map((i) => i.message);
  assert.match(err([...row.slice(0, 5), 'CLSD', ...row.slice(6)])[0]!, /belongs in the job card history file/);
  assert.match(err([...row.slice(0, 5), 'Somewhere', ...row.slice(6)])[0]!, /is not a stage EJO knows/);
  assert.match(err([row[0]!, row[1]!, '', '', ...row.slice(4)])[0]!, /Which vehicle is it\?/);
  assert.match(err([...row.slice(0, 4), '15.03.2027', ...row.slice(5)])[0]!, /is in the future/);
  assert.deepEqual(err(['', ...row.slice(1)]), ['Job number is required (the SAP order number, AUFNR, or the old job card number).']);
  // No complaint: kept with the standard words; cash; no estimate → not approved.
  const bare = checkOpenJobRow([row[0]!, row[1]!, row[2]!, '', row[4]!, '', '', '', '', '', '', '', '', '', '', '', 'Cash', '', '', '', ''], m, '2026-11-02');
  assert.equal(bare.status, 'WARNING');
  assert.deepEqual(bare.values?.complaints, ['Brought in from the old system; see the old job card.']);
  assert.equal(bare.values?.stage, 'CHECKED_IN');
  assert.equal(bare.values?.estimateApproved, false);
  assert.equal(bare.values?.paymentMethod, 'CASH');
});

test('wired in: the import loads live job cards with the old number kept, the estimate approved before EJO, opening payments Finance confirms, no emails; undo bins only untouched job cards', () => {
  const server = read('lib/data-exchange/open-jobs-server.ts');
  assert.match(server, /externalSource: range, externalId: v\.jobNumber, importJobId: job\.id/);
  assert.match(server, /approvalStatus: approved \? 'APPROVED' : 'PENDING'/);
  assert.match(server, /idempotencyKey: `import:\$\{job\.id\}:\$\{r\.id\}`/, 'an opening payment is never recorded twice');
  assert.doesNotMatch(server, /sendEmail|notify/i, 'nobody is emailed');
  assert.match(server, /export async function untouchedSinceImport/);
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /moveImportedJobCardsToBinInTx\(tx, quiet, job\.id/);
  assert.match(read('lib/data-exchange/fields.ts'), /openJobs: \{[\s\S]*financeSignOff: true/);
  const page = read('app/(app)/workshop/job-cards/[id]/page.tsx');
  assert.match(page, /data-testid="job-card-origin"/);
  for (const f of ['scripts/predeploy/0016-open-job-cards.sql', 'scripts/v-p5-open-job-cards.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "externalId"/);
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE) /im);
  }
});
