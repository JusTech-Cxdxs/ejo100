/**
 * C1a — the daily postings for SAP: the five kinds and their SAP columns,
 * SAP's formats (YYYYMMDD in Lagos, leading zeros, a point for decimals), the
 * CSV rebuilt byte for byte (its checksum never changes), SAP's return file
 * read line by line, and the wiring: postings start at the cut-over sign-off,
 * never history, opening balances or the demo; one file at a time under a
 * lock; answers set once (compare-and-set); a rejected posting goes again only
 * when sent again; every step audited; the rights at the branch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerColumns, BRANCH_KINDS, checksumOf, isPostingKind, KINDS, lagosWindow, postingCsv, postingFileName, POSTING_KINDS, readAnswer, sapDay, sapMoney, sapNumber, sapQuantity, sapText } from '../lib/sap/postings';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('the kinds: each file’s columns start with the line and the record, as SAP’s return file names them back', () => {
  assert.deepEqual([...POSTING_KINDS], ['NEW_CUSTOMER', 'GOODS_RECEIPT', 'GOODS_ISSUE', 'BILLING', 'PAYMENT', 'REFUND', 'USAGE_DECISION', 'PRODUCTION_RECEIPT']);
  for (const k of POSTING_KINDS) assert.deepEqual(KINDS[k].columns.slice(0, 2), ['ZZ_EJO_LINE', 'ZZ_EJO_ID'], k);
  assert.ok(KINDS.NEW_CUSTOMER.organisation);
  assert.equal(isPostingKind('STOCK'), false);
  assert.equal(KINDS.GOODS_RECEIPT.columns.includes('BWART'), true);
});

test('SAP’s formats: the Lagos day as YYYYMMDD, leading zeros on numbers, a point for decimals, one line of text', () => {
  assert.equal(sapDay(new Date('2026-11-10T23:30:00.000Z')), '20261111', 'half past midnight in Lagos is the next day');
  assert.equal(sapDay(null), '');
  const w = lagosWindow('2026-11-10', '2026-11-10');
  assert.equal(w.start.toISOString(), '2026-11-09T23:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-11-10T23:00:00.000Z');
  assert.equal(sapNumber('KUNNR', '1000101'), '0001000101');
  assert.equal(sapNumber('LIFNR', 'V-77'), 'V-77');
  assert.equal(sapNumber('KUNNR', null), '');
  assert.equal(sapQuantity(2.5), '2.5');
  assert.equal(sapQuantity(1 / 3), '0.333');
  assert.equal(sapMoney(1234.5), '1234.50');
  assert.equal(sapText('12 New Road;\nIkeja\t', 40), '12 New Road Ikeja');
  assert.equal(sapText('x'.repeat(50), 35).length, 35);
});

test('the file: line 1 the header, the lines in order, the same bytes every time (so the same checksum)', () => {
  const lines = [{ payload: { ZZ_EJO_LINE: 'l1', ZZ_EJO_ID: 'p1', BUDAT: '20261110', WERKS: '1000', KUNNR: '0001000101', WRBTR: '15000.00', WAERS: 'NGN', ZLSCH: 'T', XBLNR: 'JC-2026-000001' } }];
  const csv = postingCsv('PAYMENT', lines);
  assert.equal(csv.split('\r\n')[0], '"ZZ_EJO_LINE","ZZ_EJO_ID","BUDAT","WERKS","KUNNR","WRBTR","WAERS","ZLSCH","XBLNR"');
  assert.equal(csv.split('\r\n')[1], '"l1","p1","20261110","1000","0001000101","15000.00","NGN","T","JC-2026-000001"');
  assert.equal(checksumOf(csv), checksumOf(postingCsv('PAYMENT', lines)));
  assert.match(checksumOf(csv), /^[0-9a-f]{64}$/);
  assert.notEqual(checksumOf(csv), checksumOf(postingCsv('PAYMENT', [{ payload: { ...lines[0]!.payload, WRBTR: '15000.01' } }])));
  assert.equal(postingFileName('GOODS_ISSUE', 'SAP-2026-000004', '2026-11-10'), 'EJO-GOODS-ISSUE-20261110-SAP-2026-000004-SAP.csv');
});

test('SAP’s return file: found by ZZ_EJO_LINE; S posted with its document, E rejected with its message, W posted with its note', () => {
  assert.equal(answerColumns(['BELNR', 'MESSAGE']), null, 'no line column');
  const cols = answerColumns(['zz_ejo_line', 'Status', 'MBLNR', 'Message'])!;
  assert.deepEqual(readAnswer(['ckx1abcdefghijklmnop', 'S', '4900001234', ''], cols), { lineId: 'ckx1abcdefghijklmnop', outcome: 'POSTED', document: '4900001234', message: null });
  assert.deepEqual(readAnswer(['ckx1abcdefghijklmnop', 'E', '', 'Material 8-98 not in plant 1000'], cols), { lineId: 'ckx1abcdefghijklmnop', outcome: 'REJECTED', document: null, message: 'Material 8-98 not in plant 1000' });
  assert.deepEqual(readAnswer(['ckx1abcdefghijklmnop', 'E', '', ''], cols), { lineId: 'ckx1abcdefghijklmnop', outcome: 'REJECTED', document: null, message: 'Rejected by SAP (no message given).' });
  assert.equal((readAnswer(['ckx1abcdefghijklmnop', 'W', '4900001235', 'Posting date in next period'], cols) as { outcome: string }).outcome, 'POSTED');
  assert.match((readAnswer(['ckx1abcdefghijklmnop', 'maybe', '', ''], cols) as { error: string }).error, /neither posted \(S\) nor rejected \(E\)/);
  assert.match((readAnswer(['=cmd|calc', 'S', '', ''], cols) as { error: string }).error, /is not an EJO posting line/);
});

test('wired in: from the cut-over, never history or the demo, one file at a time, answers once, sent again only when asked, audited, rights at the branch', () => {
  const s = read('lib/sap/postings-server.ts');
  assert.match(s, /action: 'data_exchange\.cutover_signed_off'/, 'postings start at the branch’s sign-off as cut over');
  assert.match(s, /isOpeningBalance: false, importJobId: null/, 'never an opening balance or an import');
  assert.match(s, /db\.demoRecord\.findMany/, 'never the demo');
  assert.match(s, /pg_advisory_xact_lock\(hashtext\(\$\{`sap-postings:\$\{s\.organisationId\}`\}\)\)/, 'one file at a time per organisation');
  assert.match(s, /status: \{ in: \['SENT', 'POSTED', 'REJECTED'\] \}/, 'a posting in a file (or rejected and not sent again) is never collected again');
  assert.match(s, /updateMany\(\{ where: \{ id: l\.id, status: 'SENT' \}/, 'each answer once (compare-and-set)');
  assert.match(s, /action: 'sap\.postings_made'/);
  assert.match(s, /action: 'sap\.postings_answered'/);
  assert.match(s, /externalId: null \}, data: \{ externalSource: 'SAP', externalId: kunnr \}/, 'a new customer’s KUNNR only where EJO has none');
  assert.doesNotMatch(s, /fetch\(|https?:\/\//, 'EJO never calls SAP');
  const a = read('lib/actions/sap-postings.ts');
  assert.match(a, /allows\('dataexchange\.export\.run', \{ branchId \}\)/);
  assert.match(a, /allows\('dataexchange\.export\.sensitive'\)/, 'the new customers file carries personal data');
  assert.match(a, /allows\('dataexchange\.import\.approve', \{ branchId \}\)/);
  assert.match(a, /refuseDuringAssist\('makeSapPostingFile'\)/);
  assert.match(a, /updateMany\(\{ where: \{ id: l\.id, status: 'REJECTED' \}, data: \{ status: 'RESEND' \} \}\)/);
  const route = read('app/(app)/data-exchange/sap/[id]/download/route.ts');
  assert.match(route, /if \(sum !== f\.checksum\) return refuse\(409/, 'a file that no longer matches its checksum is never given out');
  assert.match(route, /action: 'sap\.postings_downloaded'/);
  assert.equal(DATA_INVENTORY.SapPostingFile?.lifecycle, 'ARCHIVE');
  assert.equal(DATA_INVENTORY.SapPostingLine?.ai, 'NEVER');
  for (const f of ['scripts/predeploy/0024-sap-postings.sql', 'scripts/v-c1a-sap-postings.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "sap_posting_files"/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "sap_posting_lines"/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i, 'additive only');
  }
});

test('C1b kinds: refunds at the workshop; PDI usage decisions and vehicles to the yard at the plant; SAP’s zeros on order and equipment numbers', () => {
  assert.deepEqual(BRANCH_KINDS.WORKSHOP, ['GOODS_RECEIPT', 'GOODS_ISSUE', 'BILLING', 'PAYMENT', 'REFUND']);
  assert.deepEqual(BRANCH_KINDS.ASSEMBLY_PLANT, ['USAGE_DECISION', 'PRODUCTION_RECEIPT']);
  assert.equal(BRANCH_KINDS.SALES, undefined, 'a sales branch posts nothing yet');
  assert.ok(KINDS.REFUND.columns.includes('SGTXT') && KINDS.REFUND.amountColumn === 'WRBTR');
  assert.ok(KINDS.USAGE_DECISION.columns.includes('VCODE') && KINDS.USAGE_DECISION.columns.includes('SERNR'));
  assert.equal(KINDS.PRODUCTION_RECEIPT.quantityColumn, 'MENGE');
  assert.ok(!KINDS.USAGE_DECISION.columns.some((c) => /NAME/.test(c)), 'no person’s name in the plant’s files');
  assert.equal(sapNumber('AUFNR', '1000234'), '000001000234');
  assert.equal(sapNumber('EQUNR', '10000077'), '000000000010000077');
  assert.equal(sapNumber('AUFNR', 'PO-77'), 'PO-77');
  assert.equal(sapNumber('AUFNR', ''), '');
});

test('C1b wired in: decisions A from the passed PDI, R from its audit entry written with the decision; one yard receipt per vehicle; never the demo; “Sent to SAP” on the record’s page', () => {
  const s = read('lib/sap/postings-server.ts');
  assert.match(s, /ref: `UD:A:\$\{p\.id\}`/);
  assert.match(s, /action: 'plant\.pdi_rejected'/);
  assert.match(s, /ref: `UD:R:\$\{r\.id\}`/);
  assert.match(s, /ref: `YD:\$\{p\.vehicle\.id\}`/, 'a vehicle is received into the yard once');
  assert.match(s, /externalSource: \{ not: 'EJO-DEMO' \}/);
  assert.match(s, /ref: `RF:\$\{r\.id\}`/);
  const plant = read('lib/actions/plant.ts');
  const reject = plant.slice(plant.indexOf('export async function rejectPdi'), plant.indexOf('export async function cancelPdi'));
  assert.match(reject, /await tx\.auditLog\.create\(\{ data: \{ organisationId: p\.organisationId, userId: me\.userId, action: 'plant\.pdi_rejected'/, 'the R decision is never lost: its entry is written in the same transaction');
  assert.doesNotMatch(reject, /writeAuditLog/);
  const a = read('lib/actions/sap-postings.ts');
  const trail = a.slice(a.indexOf('export async function getSapTrail'));
  assert.match(trail, /sapTrailOf\(organisationId/);
  assert.match(trail, /if \(!make && !answer\) return null/);
  assert.match(a, /branch: \{ businessUnit: \{ organisationId \} \}/, 'a job card or service found inside the person’s organisation');
  for (const [page, type] of [['app/(app)/workshop/job-cards/[id]/page.tsx', 'JobCard'], ['app/(app)/workshop/vehicle-service/[id]/page.tsx', 'VehicleService'], ['app/(app)/plant/pdi/[id]/page.tsx', 'PdiInspection'], ['app/(app)/crm/customers/[id]/page.tsx', 'Customer']] as const) {
    assert.match(read(page), new RegExp(`<SapTrail entityType="${type}"`), page);
  }
});

test('C1b SAP’s master data back in: SAP’s own extract updates records found by their SAP number only, never guessed', () => {
  const s = read('lib/data-exchange/round-trip-server.ts');
  assert.match(s, /mapping\.ejoRecord == null && job\.sourceSystem === 'SAP' \? await sapMatches\(/, 'only SAP’s file without an EJO record column, only from SAP');
  assert.match(s, /out\.set\(key, had && had !== id \? 'MANY' : id\)/, 'a number on two records is never guessed');
  assert.match(s, /SAP number \$\{sap\} is on more than one/);
  assert.match(s, /matchedBy: cur \? \(ejo \? 'ejo' : 'sap'\) : null/);
  assert.match(s, /db\.customer\.findMany\(\{ where: \{ organisationId: job\.organisationId, \.\.\.sap \}/, 'fenced to the organisation');
  assert.match(s, /db\.part\.findMany\(\{ where: \{ branchId: job\.branchId,/, 'a part to the import’s branch');
  const a = read('lib/actions/data-exchange.ts');
  assert.match(a, /mapping\.ejoRecord == null && !\(input\.sourceSystem !== 'LEGACY' && mapping\.externalId != null\)/);
});
