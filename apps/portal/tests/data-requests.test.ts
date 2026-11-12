/**
 * A4c1 — customers' data requests (NDPA 2023): what a copy leaves out (staff,
 * secrets, internal keys), its files (CSV safe for Excel, data.json), the zip
 * and its checksum, no ID number ever stored, and the wiring: a colleague
 * confirms who is asking (never the person who recorded it), each step set
 * once and audited, the copy only after that and rebuilt at each download.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { checkVerifiedHow, forCopy, leftOut, packZip, plain, requestNumber, sectionCsv, KIND_LABEL, REQUEST_KINDS } from '../lib/privacy/requests';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';
import { decide, ROLE_GRANTS } from '../lib/authz/catalogue';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('the kinds of request and their numbers', () => {
  assert.deepEqual([...REQUEST_KINDS], ['ACCESS', 'CORRECTION', 'ERASURE', 'OBJECTION']);
  for (const k of REQUEST_KINDS) assert.ok(KIND_LABEL[k].label && KIND_LABEL[k].what);
  assert.equal(requestNumber(2026, 7), 'DR-2026-000007');
});

test('how identity was checked: in words, never a document’s number', () => {
  assert.equal(checkVerifiedHow('Seen in person with photo ID matching the record').ok, true);
  assert.equal(checkVerifiedHow('ok').ok, false);
  for (const bad of ['NIN 12345678901 seen', 'Passport A 1234 5678 checked', 'BVN 2234-5678-90 confirmed']) assert.equal(checkVerifiedHow(bad).ok, false, bad);
  assert.equal(checkVerifiedHow('Called back on 0803 phone on record').ok, true, 'a few digits are fine');
});

test('the copy leaves out the staff who handled each record, secrets and internal keys; keeps the customer’s own data', () => {
  for (const k of ['createdById', 'approvedById', 'assignedToId', 'authorUserId', 'authorId', 'userId', 'exitedById', 'password', 'accessToken', 'token', 'ipHash', 'tokensIn', 'organisationId', 'importJobId', 'emailMessageId', 'technicianName']) assert.equal(leftOut(k), true, k);
  for (const k of ['id', 'customerId', 'jobCardId', 'fullName', 'phone', 'email', 'paidToName', 'driverName', 'ipAddress', 'userAgent', 'amount', 'body']) assert.equal(leftOut(k), false, k);
  const row = forCopy({ id: 'p1', branchId: 'b1', amount: { toFixed: () => '', toString: () => '1500.50' }, recordedById: 'u9', at: new Date('2026-11-01T10:00:00.000Z'), meta: { reviewedById: 'u2', note: 'x' } }, new Map([['b1', 'Ikeja Workshop']]));
  assert.deepEqual(row, { id: 'p1', branch: 'Ikeja Workshop', amount: '1500.50', at: '2026-11-01T10:00:00.000Z', meta: { note: 'x' } });
  assert.equal(plain(10n), '10');
});

test('each section as CSV: the mark for Excel, every field as a column, a formula never runs', () => {
  const csv = sectionCsv([{ id: 'a', note: '=HYPERLINK("x")' }, { id: 'b', extra: { k: 1 } }]);
  assert.ok(csv.startsWith('\uFEFF"id","note","extra"\r\n'));
  assert.ok(csv.includes(`"a","'=HYPERLINK(""x"")",\r\n`));
  assert.ok(csv.includes('"b",,"{""k"":1}"'));
});

test('the zip: README, a CSV per section, data.json; the same records at the same moment give the same checksum', () => {
  const p = { number: 'DR-2026-000001', organisation: 'Demo Motors', customerName: 'Ada Obi', madeAt: new Date('2026-11-12T09:00:00.000Z'), sections: [{ file: 'customer.csv', title: 'Your details', rows: [{ id: 'c1', fullName: 'Ada Obi' }] }, { file: 'payments.csv', title: 'Payments', rows: [] }] };
  const a = packZip(p);
  assert.equal(a.checksum, packZip(p).checksum);
  assert.match(a.checksum, /^[0-9a-f]{64}$/);
  const files = unzipSync(a.bytes);
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'customer.csv', 'data.json', 'payments.csv']);
  const readme = strFromU8(files['README.txt']!);
  assert.match(readme, /DR-2026-000001/);
  assert.match(readme, /customer\.csv\s+1\s+Your details/);
  assert.match(readme, /Passwords and sign-in tokens: never given out/);
  assert.deepEqual(JSON.parse(strFromU8(files['data.json']!)).sections.customer, [{ id: 'c1', fullName: 'Ada Obi' }]);
});

test('who handles them: the Administrator and the Customer Care Lead, across the organisation; no one else', () => {
  const who = (r: string) => decide({ userId: 'u', isSuperAdmin: false, roleSlugs: [r], branchId: 'b', departmentId: null }, 'privacy.requests.manage').allowed;
  assert.equal(who('administrator'), true);
  assert.equal(who('customer-care-lead'), true);
  for (const r of Object.keys(ROLE_GRANTS).filter((r) => !['administrator', 'customer-care-lead'].includes(r))) assert.equal(who(r), false, r);
});

test('wired in: a colleague confirms who is asking; each step set once and audited; the copy only after that, made at each download', () => {
  const a = read('lib/actions/data-requests.ts');
  assert.match(a, /if \(r\.createdById === userId\) return fail\('You recorded this request: a colleague confirms who is asking/);
  assert.match(a, /updateMany\(\{ where: \{ id: r\.id, status: 'RECEIVED', createdById: \{ not: userId \} \}/, 'the four-eyes rule holds in the write itself');
  assert.match(a, /updateMany\(\{ where: \{ id: r\.id, status: r\.status \}/);
  assert.match(a, /if \(r\.kind === 'ACCESS' && !r\.packDownloads\) return fail/);
  for (const act of ['privacy.request_recorded', 'privacy.request_verified', 'privacy.request_closed']) assert.match(a, new RegExp(`action: '${act.replace('.', '\\.')}'`));
  assert.match(a, /pg_advisory_xact_lock\(hashtext\(\$\{`data-requests:\$\{organisationId\}`\}\)\)/, 'numbers given one at a time');
  for (const fn of ['recordDataRequest', 'verifyDataRequest', 'closeDataRequest']) assert.match(a, new RegExp(`refuseDuringAssist\\('${fn}'\\)`));
  const route = read('app/(app)/data-requests/[id]/copy/route.ts');
  assert.match(route, /if \(r\.status === 'RECEIVED'\) return refuse\(409/, 'never before identity is confirmed');
  assert.match(route, /if \(r\.kind !== 'ACCESS'\) return refuse\(409/);
  assert.match(route, /7 \* 86_400_000/, 'not given out a week after it is answered');
  assert.match(route, /action: 'privacy\.copy_downloaded'/);
  assert.match(route, /'Cache-Control': 'no-store'/);
  assert.match(route, /refuseDuringAssist\('dataRequestCopy'\)/);
  const pack = read('lib/privacy/pack-server.ts');
  assert.match(pack, /db\.customer\.findFirst\(\{ where: \{ id: customerId, organisationId \} \}\)/, 'the customer found inside the organisation');
  assert.equal(DATA_INVENTORY.DataRequest?.ai, 'NEVER');
  assert.equal(DATA_INVENTORY.DataRequest?.lifecycle, 'ARCHIVE');
  for (const f of ['scripts/predeploy/0025-data-requests.sql', 'scripts/v-a4c1-data-requests.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "data_requests"/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE|RENAME)\b/i, 'additive only');
  }
});
