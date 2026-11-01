import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, mappingProblems } from '../lib/data-exchange/fields';
import { parseDay } from '../lib/data-exchange/dates';
import { checkInvoiceRow, checkRegisterRow, registerKind, registerResult } from '../lib/data-exchange/check-history';
import { checkCustomerRow } from '../lib/data-exchange/check';
import { customerMoney, monthlySpend, sortCrmRows } from '../lib/crm';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('dates as SAP, Excel and people write them', () => {
  assert.equal(parseDay('20190314'), '2019-03-14'); // SAP internal (ERDAT)
  assert.equal(parseDay('14.03.2019'), '2019-03-14'); // SAP display
  assert.equal(parseDay('14/03/2019'), '2019-03-14'); // Nigerian, day first
  assert.equal(parseDay('03/14/2019'), '2019-03-14'); // month first only when the day cannot be a month
  assert.equal(parseDay('2019-03-14'), '2019-03-14'); // ISO and Excel dates
  assert.equal(parseDay('2019-03-14 10:30'), '2019-03-14');
  assert.equal(parseDay('14-MAR-19'), '2019-03-14');
  assert.equal(parseDay('14 March 2019'), '2019-03-14');
  assert.equal(parseDay('March 14, 2019'), '2019-03-14');
  assert.equal(parseDay('31.06.2019'), null, 'no 31 June');
  assert.equal(parseDay('00000000'), null, 'SAP’s empty date');
  assert.equal(parseDay('soon'), null);
});

test('customers: SAP ERDAT becomes “customer since”; a bad date is a note, not a rejection', () => {
  const m = autoMap('customers', ['KUNNR', 'NAME1', 'TELF1', 'ERDAT']);
  assert.equal(m.customerSince, 3);
  const ok = checkCustomerRow(['0001000123', 'Ada Okafor', '0803 123 4567', '20140602'], m);
  assert.equal(ok.values?.customerSince, '2014-06-02');
  const bad = checkCustomerRow(['0001000124', 'Bayo Ade', '0803 123 4568', 'last year'], m);
  assert.equal(bad.status, 'WARNING');
  assert.equal(bad.values?.customerSince, null);
});

test('invoices from SAP: an SAP billing extract maps itself; net plus tax; credit notes; naira only', () => {
  const m = autoMap('invoices', ['VBELN', 'FKDAT', 'KUNAG', 'NETWR', 'MWSBK', 'WAERK', 'VHVIN', 'FKART']);
  assert.deepEqual([m.invoiceNumber, m.invoiceDate, m.customerExternalId, m.amount, m.tax, m.currency, m.vin, m.documentType], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(mappingProblems('invoices', m), []);
  const r = checkInvoiceRow(['0090001234', '14.03.2023', '0001000123', '450,000.00', '33,750.00', 'NGN', 'jaanlr85el7100001', 'F2'], m, '2026-11-01');
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.deepEqual(r.values, { invoiceNumber: '90001234', invoiceDate: '2023-03-14', amount: 483750, customer: { externalId: '1000123', phone: null }, vin: 'jaanlr85el7100001', vinKey: 'JAANLR85EL7100001', documentType: 'F2', description: null });
  assert.deepEqual(r.keys, ['inv:90001234']);
  const credit = checkInvoiceRow(['90001299', '20230401', '1000123', '12000-', '', '', '', 'G2'], m, '2026-11-01');
  assert.equal(credit.values?.amount, -12000);
  assert.match(credit.issues[0]!.message, /credit note/);
  assert.match(checkInvoiceRow(['1', '20230401', '1000123', '100', '', 'USD', '', ''], m, '2026-11-01').issues.map((i) => i.message).join(' '), /Only naira/);
  assert.match(checkInvoiceRow(['1', '20300101', '1000123', '100', '', '', '', ''], m, '2026-11-01').issues[0]!.message, /in the future/);
  assert.equal(checkInvoiceRow(['', '20230401', '1000123', '100', '', '', '', ''], m).status, 'REJECTED');
  assert.equal(checkInvoiceRow(['9', '20230401', '', '100', '', '', '', ''], m).status, 'REJECTED', 'whose invoice is it?');
});

test('registers: kind, result and the one-check-once key', () => {
  assert.equal(registerKind('PDI'), 'PDI');
  assert.equal(registerKind('Pre-delivery'), 'PDI');
  assert.equal(registerKind('Quality'), 'QC');
  assert.equal(registerKind('Assembly line'), 'PRODUCTION');
  assert.equal(registerKind('lunch'), null);
  assert.equal(registerResult('OK'), 'PASS');
  assert.equal(registerResult('NG'), 'FAIL');
  assert.equal(registerResult('Reworked'), 'REWORK');
  const m = autoMap('registers', ['VIN', 'Date', 'Model', 'Station', 'Result', 'Inspected by', 'Remarks']);
  const r = checkRegisterRow(['JAANLR85EL7100001', '11/03/2024', 'NQR', 'Final inspection', 'OK', 'A. Bello', 'Door seal replaced'], m, 'PDI', '2026-11-01');
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.equal(r.values?.kind, 'PDI');
  assert.equal(r.values?.result, 'PASS');
  assert.equal(r.values?.dedupeKey, 'PDI|JAANLR85EL7100001|2024-03-11|FINAL INSPECTION');
  // No register column and none chosen: rejected with the way out.
  assert.match(checkRegisterRow(['JAANLR85EL7100001', '11/03/2024', '', '', '', '', ''], m, null).issues[0]!.message, /Production, QC or PDI/);
  assert.equal(checkRegisterRow(['', '11/03/2024', '', '', '', '', ''], m, 'QC').status, 'REJECTED');
});

test('the CRM counts SAP invoices as spend and visits, never as owed; averages stay EJO’s', () => {
  const now = new Date('2026-10-15T12:00:00+01:00');
  const jobs = [{ kind: 'JC' as const, id: 'j', receivedAt: new Date('2026-09-01T09:00:00+01:00'), finishedAt: new Date('2026-09-03T09:00:00+01:00'), cancelled: false, customerBilled: 100000, payments: [{ at: new Date('2026-09-03T10:00:00+01:00'), amount: 100000 }], refunds: [] }];
  const sap = [{ at: new Date('2024-05-10T12:00:00+01:00'), amount: 250000 }, { at: new Date('2026-02-10T12:00:00+01:00'), amount: 50000 }];
  const m = customerMoney(jobs, now, sap);
  assert.equal(m.netPaid, 400000);
  assert.equal(m.fromSap, 300000);
  assert.equal(m.visits, 3);
  assert.equal(m.outstanding, 0);
  assert.equal(m.averageJob, 100000, 'average job is EJO’s own');
  assert.equal(m.netPaidThisYear, 150000);
  assert.equal(+m.lastVisit!, +new Date('2026-09-01T09:00:00+01:00'));
  const months = monthlySpend(jobs, now, 12, sap);
  assert.equal(months.find((x) => x.key === '2026-02')?.sap, 50000);
  assert.equal(months.find((x) => x.key === '2026-02')?.net, 50000);
  // Newest customers by when they became customers, not when they were imported.
  const rows = [
    { id: 'old', fullName: 'Old', customerType: 'INDIVIDUAL', tags: [], isActive: true, createdAt: new Date('2026-10-01'), customerSince: new Date('2012-01-01'), address: null, phone: null, hasPortalAccount: false, lastLoginAt: null, vehicles: 0, openJobs: 0, netPaid: 0, lastVisit: null },
    { id: 'new', fullName: 'New', customerType: 'INDIVIDUAL', tags: [], isActive: true, createdAt: new Date('2026-09-01'), customerSince: null, address: null, phone: null, hasPortalAccount: false, lastLoginAt: null, vehicles: 0, openJobs: 0, netPaid: 0, lastVisit: null },
  ];
  assert.deepEqual(sortCrmRows(rows, 'recent').map((r) => r.id), ['new', 'old']);
});

test('history is read-only and recoverable: undo voids, a reload restores, nothing is deleted', () => {
  const src = read('lib/data-exchange/history-server.ts');
  assert.doesNotMatch(src, /\.delete(Many)?\(/);
  assert.match(src, /historicalInvoice\.updateMany\(\{ where: \{ importJobId: jobId, voidedAt: null \}, data: \{ voidedAt: at \} \}\)/);
  assert.match(src, /data: \{ voidedAt: null, importJobId: job\.id \}/);
  // The CRM, Headquarters and analytics read only invoices that are not voided.
  for (const f of ['lib/actions/crm.ts', 'lib/actions/headquarters.ts', 'lib/actions/master-analytics.ts', 'lib/actions/vehicle-history.ts']) {
    const s = read(f);
    for (const q of s.matchAll(/historicalInvoice\.(findMany|groupBy|aggregate)\(\{[\s\S]{0,400}?\}/g)) assert.match(q[0], /voidedAt: null/, `${f}: ${q[0].slice(0, 80)}`);
  }
  assert.match(read('lib/actions/crm.ts'), /WHERE h\."voidedAt" IS NULL/);
  // Never shown to customers: the customer portal does not read SAP history.
  assert.doesNotMatch(read('../website/lib/customer-portal/data.ts'), /historicalInvoice|vehicleHistoryRecord/);
});

test('new customers are new to the business: SAP’s creation date when known', () => {
  assert.match(read('lib/actions/crm.ts'), /newThisMonth: all\.filter\(\(r\) => \+\(r\.customerSince \?\? r\.createdAt\) >= \+monthStart\)/);
  assert.match(read('lib/actions/headquarters.ts'), /OR: \[\{ customerSince: \{ gte: lagosDay\(period\.from\), lt: lagosDay\(period\.to\) \} \}, \{ customerSince: null, createdAt: range \}\]/);
});
