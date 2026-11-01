import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sapNumberQuery } from '../lib/search-plan';
import { isFiltered, lagosDayBound, matchesSource, normaliseImportNumber, parseSourceFilter, sourceWhere } from '../lib/source-filter';
import { checkInvoiceRow, sapRange } from '../lib/data-exchange/check-history';
import { autoMap } from '../lib/data-exchange/fields';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('an SAP number is recognised as typed, with SAP’s zeros, and narrowed by year', () => {
  assert.deepEqual(sapNumberQuery('125262'), { number: '125262', year: null, forms: ['125262'] });
  assert.deepEqual(sapNumberQuery('0000125262')?.forms, ['0000125262', '125262']);
  assert.deepEqual(sapNumberQuery('125262 2026'), { number: '125262', year: 2026, forms: ['125262'] });
  assert.equal(sapNumberQuery('125262/2025')?.year, 2025);
  assert.equal(sapNumberQuery('SAP 1000123')?.number, '1000123');
  assert.equal(sapNumberQuery('8-98123456-0')?.number, '8-98123456-0');
  assert.equal(sapNumberQuery('Ada Okafor'), null, 'names are not numbers');
  assert.equal(sapNumberQuery('ab'), null);
});

test('search lists every SAP match, labelled with its kind and year, inside the person’s reach', () => {
  const src = read('lib/actions/search.ts');
  for (const label of ['customer ${c.externalId}', 'vehicle ${v.externalId}', 'supplier ${x.externalId}', 'material ${p.externalId}', 'invoice ${i.invoiceNumber} · ${i.fiscalYear ?? i.invoiceDate.getUTCFullYear()}']) assert.ok(src.includes(label), label);
  assert.match(src, /voidedAt: null, invoiceNumber: ext, \.\.\.\(n\.year \? \{ fiscalYear: n\.year \} : \{\}\)/);
  assert.match(src, /ctx\.canCrm \? prisma\.historicalInvoice/);
  assert.match(src, /plan\.kind === 'reference' \|\| plan\.kind === 'prefix' \? \[\]/);
});

test('SAP invoices keep company code and fiscal year; a reused number in another year is a different invoice', () => {
  const m = autoMap('invoices', ['BELNR', 'BUKRS', 'GJAHR', 'BUDAT', 'KUNNR', 'DMBTR']);
  const a = checkInvoiceRow(['125262', '1000', '2025', '14.03.2025', '1000123', '1000'], m, '2026-11-01');
  const b = checkInvoiceRow(['125262', '1000', '2026', '14.03.2026', '1000123', '1000'], m, '2026-11-01');
  assert.equal(a.values?.source, 'SAP/1000/2025');
  assert.equal(b.values?.source, 'SAP/1000/2026');
  assert.notDeepEqual(a.keys, b.keys, 'not duplicates of each other');
  assert.equal(a.values?.fiscalYear, 2025);
  // Without company code or year: the plain range, and the fiscal year is the invoice date's.
  const c = checkInvoiceRow(['125262', '', '', '14.03.2024', '1000123', '1000'], m, '2026-11-01');
  assert.equal(c.values?.source, 'SAP');
  assert.equal(c.values?.fiscalYear, 2024);
  assert.equal(sapRange(null, null, false), 'SAP');
});

test('source and date filters: created here or imported, which import, when entered, original date', () => {
  assert.equal(normaliseImportNumber('imp 2026 12'), 'IMP-2026-000012');
  assert.equal(normaliseImportNumber('IMP-2026-000012'), 'IMP-2026-000012');
  assert.equal(normaliseImportNumber('JC-2026-1'), null);
  assert.equal(+lagosDayBound('2026-03-14')!, +new Date('2026-03-13T23:00:00Z'));
  assert.equal(+lagosDayBound('2026-03-14', true)!, +new Date('2026-03-14T23:00:00Z'));
  const f = parseSourceFilter({ source: 'sap', enteredFrom: '2026-10-25', enteredTo: '2026-10-31', originalTo: '2018-12-31' });
  assert.equal(isFiltered(f), true);
  assert.equal(isFiltered(parseSourceFilter({ source: 'nonsense' })), false);
  assert.deepEqual(sourceWhere(parseSourceFilter({ source: 'ejo' }), { bySource: null, byNumber: null }), { AND: [{ importJobId: null }] });
  const sets = { bySource: new Set(['imp1']), byNumber: null };
  const row = { importJobId: 'imp1', createdAt: new Date('2026-10-28T10:00:00Z'), original: new Date('2014-06-02T00:00:00Z') };
  assert.equal(matchesSource(row, f, sets), true, '"customers since 2018 or before, imported from SAP last week"');
  assert.equal(matchesSource({ ...row, original: new Date('2020-01-01T00:00:00Z') }, f, sets), false);
  assert.equal(matchesSource({ ...row, importJobId: null }, f, sets), false);
  assert.equal(matchesSource({ ...row, createdAt: new Date('2026-11-01T10:00:00Z') }, f, sets), false);
});

test('dashboards can leave out the history from before EJO', () => {
  assert.match(read('lib/actions/crm.ts'), /WHERE \$\{history\} AND h\."voidedAt" IS NULL/);
  assert.match(read('lib/actions/headquarters.ts'), /if \(org && ids\.length && opts\.history !== false\)/);
  assert.match(read('lib/actions/master-analytics.ts'), /const sapRows = fence\.organisationId && withHistory/);
  assert.match(read('app/(app)/headquarters/page.tsx'), /getHeadquarters\(sp\.period, \{ history \}\)/);
});
