/**
 * An export comes straight back in: every list that Data Exchange can also
 * import is read back by the importer — in EJO's own column names and in
 * SAP's field names — with its numbers (KUNNR, LIFNR, VBELN…) recognised,
 * the "About this file" sheet and the CSV's "#" lines passed over, and the
 * values unchanged. Also: the demo files in docs/demo match themselves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, mappingProblems, ENTITIES, type EntityKey } from '../lib/data-exchange/fields';
import { CsvReader, isBlankRow, isNoteRow, parseCsv } from '../lib/data-exchange/csv-reader';
import { readXlsx } from '../lib/data-exchange/xlsx-reader';
import { checkCustomerRow } from '../lib/data-exchange/check';
import { exportStream } from '../lib/exports/stream';
import { columnsFor, sapValue, SAP_FIELDS, hasSapLayout } from '../lib/exports/sap-layout';
import type { ColumnType, ExportColumn } from '../lib/exports/format';

const ROOT = join(__dirname, '..', '..');
const KINDS = readFileSync(join(ROOT, 'lib/exports/kinds.ts'), 'utf8');

/** A list's columns as kinds.ts declares them (header and type), read from the source. */
function declared(kind: string): { header: string; type: ColumnType }[] {
  const at = KINDS.indexOf(`key: '${kind}', label:`);
  assert.ok(at >= 0, `export kind ${kind}`);
  const end = KINDS.indexOf('async *rows', at);
  return [...KINDS.slice(at, end).matchAll(/header: '([^']+)', type: '(\w+)'/g)].map((m) => ({ header: m[1]!, type: m[2] as ColumnType }));
}
const headers = (kind: string) => declared(kind).map((c) => c.header);

/** Export list → the import it comes back through, and the fields that must be recognised. */
const ROUND_TRIPS: [string, EntityKey, string[]][] = [
  ['customers', 'customers', ['externalId', 'fullName', 'customerType', 'email', 'phone', 'altPhone', 'address', 'taxId', 'customerSince']],
  ['vehicles', 'vehicles', ['customerExternalId', 'externalId', 'chassisNumber', 'plateNumber', 'engineNumber', 'make', 'model', 'year', 'mileage']],
  ['parts', 'parts', ['partNumber', 'name', 'category', 'baseUnit', 'trackingType', 'barcode', 'sellingPrice', 'reorderPoint', 'safetyStock']],
  ['suppliers', 'suppliers', ['externalId', 'name', 'phone', 'email', 'address', 'taxId']],
  ['sap-invoices', 'invoices', ['invoiceNumber', 'invoiceDate', 'customerExternalId', 'amount', 'currency', 'vin', 'companyCode', 'fiscalYear', 'documentType', 'description']],
];

test('every export that can be imported comes back in, with its SAP numbers recognised (EJO column names)', () => {
  for (const [kind, entity, must] of ROUND_TRIPS) {
    const h = headers(kind);
    const m = autoMap(entity, h);
    for (const f of must) assert.notEqual(m[f], null, `${kind}: ${f} is not recognised in ${JSON.stringify(h)}`);
    assert.deepEqual(mappingProblems(entity, m), [], kind);
  }
  // The customer's NAME never feeds the customer NUMBER (an invoice export has both).
  const inv = headers('sap-invoices');
  assert.equal(inv[autoMap('invoices', inv).customerExternalId!], 'Customer number (SAP)');
  // A file exported before these names changed still comes back in.
  const old = autoMap('invoices', ['Invoice number (SAP)', 'Invoice date', 'Customer', 'Customer SAP number', 'Amount']);
  assert.equal(old.invoiceNumber, 0); assert.equal(old.customerExternalId, 3);
  assert.equal(autoMap('customers', ['SAP / old-system number', 'Name']).externalId, 0);
  assert.equal(autoMap('suppliers', ['Supplier number (SAP)', 'Name']).externalId, 0);
});

test('SAP field names: only real columns, each recognised by the importer, the numbers and keys first', () => {
  for (const [kind, map] of Object.entries(SAP_FIELDS)) {
    const h = headers(kind);
    for (const ejo of Object.keys(map)) assert.ok(h.includes(ejo), `${kind}: SAP layout names "${ejo}", which the list does not export`);
    assert.ok(hasSapLayout(kind));
  }
  const notImported = new Set(['ZZ_EJO_ID', 'WAERS']); // the EJO record; a currency column where the import has none
  for (const [kind, entity, must] of [...ROUND_TRIPS, ['stock', 'stock', ['partNumber', 'quantity', 'unit', 'totalValue', 'unitCost']] as [string, EntityKey, string[]]]) {
    const cols = declared(kind).map((c) => ({ ...c, get: () => null }));
    const sap = columnsFor(kind, cols, 'sap').map((c) => c.header);
    const m = autoMap(entity, sap);
    const used = new Set(Object.values(m).filter((v) => v !== null));
    // Opening stock carries no description (the part has one), so MAKTX there is for people reading the file.
    const unmatched = sap.filter((x, i) => !used.has(i) && !(notImported.has(x) || (x === 'WAERS' && entity !== 'invoices') || (x === 'MAKTX' && entity === 'stock')));
    assert.deepEqual(unmatched, [], `${kind}: SAP columns the importer does not recognise`);
    for (const f of must) if (ENTITIES[entity].fields.some((x) => x.key === f) && sap.length) {
      const sapName = Object.entries(SAP_FIELDS[kind]!).find(([ejo]) => autoMap(entity, [ejo])[f] === 0)?.[1];
      if (sapName) assert.notEqual(m[f], null, `${kind}: ${f} (${sapName})`);
    }
  }
  assert.deepEqual(columnsFor('customers', declared('customers').map((c) => ({ ...c, get: () => null })), 'sap').map((c) => c.header).slice(0, 3), ['KUNNR', 'NAME1', 'KTOKD']);
  // A list SAP does not hold keeps EJO's columns, whatever is asked.
  const jobs = declared('job-cards').map((c) => ({ ...c, get: () => null }));
  assert.equal(columnsFor('job-cards', jobs, 'sap'), jobs);
});

test('SAP numbers keep their leading zeros in SAP’s layout (customers, suppliers, billing documents)', () => {
  const cols = columnsFor('sap-invoices', declared('sap-invoices').map((c) => ({ header: c.header, type: c.type, get: (r: Record<string, unknown>) => r[c.header] })), 'sap');
  const row = { 'Invoice number': '90001001', 'Customer number (SAP)': '1000101', 'Invoice date': '2021-04-08' };
  const got = Object.fromEntries(cols.map((c) => [c.header, c.get(row)]));
  assert.equal(got.VBELN, '0090001001'); assert.equal(got.KUNAG, '0001000101'); assert.equal(got.FKDAT, '20210408');
  assert.equal(columnsFor('suppliers', [{ header: 'Supplier number (SAP or old system)', type: 'code', get: () => 'V-77' }], 'sap')[0]!.get({}), 'V-77', 'a number with letters is left as it is');
});

test('SAP values: days as YYYYMMDD (a Lagos day), flags X or empty', () => {
  assert.deepEqual(sapValue('day', new Date('2019-03-14T00:00:00.000Z')), { type: 'code', value: '20190314' });
  assert.deepEqual(sapValue('day', '2019-03-14'), { type: 'code', value: '20190314' });
  // 23:30 UTC on 31 Oct is 00:30 on 1 Nov in Lagos.
  assert.deepEqual(sapValue('date', new Date('2026-10-31T23:30:00.000Z')), { type: 'code', value: '20261101' });
  assert.deepEqual(sapValue('bool', true), { type: 'code', value: 'X' });
  assert.deepEqual(sapValue('bool', false), { type: 'code', value: '' });
  assert.deepEqual(sapValue('day', null), { type: 'code', value: null });
  assert.deepEqual(sapValue('money', 1500), { type: 'money', value: 1500 });
});

// ── The whole way: a customers file written by the export, read by the importer ─

type Cust = Record<string, unknown>;
const CUSTOMERS: Cust[] = [
  { 'Customer number (SAP or old system)': '1000101', Name: 'Babatunde Eze', Type: 'Individual', Email: 'babatunde.eze@example.ng', Phone: '+234 804 201 4007', 'Second phone': null, Address: '14 Oshodi-Apapa Expressway, Ikeja', 'Tax ID': null, Tags: 'Fleet', 'Customer since': '2013-02-11', 'Customer portal': false, 'EJO record': 'ckx1' },
  { 'Customer number (SAP or old system)': null, Name: 'Eko Cold Chain Ltd', Type: 'Organisation', 'Company name': 'Eko Cold Chain Ltd', Email: null, Phone: '0806 218 4126', Address: '7 Adeniyi Jones Avenue', 'Tax ID': '10000018-0001', Tags: '', 'Customer since': null, 'Customer portal': false, 'EJO record': 'ckx2' },
];
const custColumns = (): ExportColumn<Cust>[] => declared('customers').map((c) => ({ header: c.header, type: c.type, get: (r: Cust) => r[c.header] ?? null }));

async function text(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []; const r = s.getReader();
  for (;;) { const { value, done } = await r.read(); if (done) break; parts.push(value); }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
async function* once<R>(rows: R[]) { yield rows; }
/** Rows as the uploader reads them: blank rows and "#" notes above the header left out. */
function readCsv(bytes: Uint8Array, pieces = 13): string[][] {
  const t = new TextDecoder().decode(bytes); const r = new CsvReader(); const all: string[][] = [];
  for (let i = 0; i < t.length; i += pieces) all.push(...r.push(t.slice(i, i + pieces)));
  all.push(...r.end());
  const out: string[][] = []; let header = false;
  for (const row of all) { if (isBlankRow(row)) continue; if (!header && isNoteRow(row)) continue; header = true; out.push(row); }
  return out;
}

for (const layout of ['ejo', 'sap'] as const) {
  for (const format of ['csv', 'xlsx'] as const) {
    test(`customers exported (${format}, ${layout === 'sap' ? 'SAP field names' : 'EJO names'}) are read back by the importer, unchanged`, async () => {
      const columns = columnsFor('customers', custColumns(), layout);
      const about: [string, string][] = layout === 'sap' && format === 'csv' ? [] : [['List', 'Customers'], ['Filters', 'Search: a, b; c | d']];
      const bytes = await text(exportStream({ format, sheetName: 'Customers', columns, rows: once(CUSTOMERS), about }));
      let rows: string[][];
      if (format === 'csv') rows = readCsv(bytes);
      else { rows = []; await readXlsx(() => (async function* () { yield bytes; })(), (r) => { rows.push(...r.filter((x) => !isBlankRow(x))); }); }
      assert.deepEqual(rows[0], columns.map((c) => c.header), 'the header is the first row read (not the About sheet or lines)');
      if (layout === 'sap' && format === 'csv') assert.ok(!new TextDecoder().decode(bytes).includes('#'), 'no notes above the header for SAP');
      const mapping = autoMap('customers', rows[0]!);
      const back = rows.slice(1).map((cells) => checkCustomerRow(cells, mapping).values!);
      // EJO keeps SAP numbers without the leading zeros (either form finds the record); SAP's layout writes them back.
      assert.equal(back[0]!.externalId, '1000101');
      if (layout === 'sap') assert.equal(rows[1]![0], '0001000101', 'KUNNR in SAP’s own form, with its leading zeros');
      assert.equal(back[0]!.fullName, 'Babatunde Eze');
      assert.equal(back[0]!.email, 'babatunde.eze@example.ng');
      assert.match(String(back[0]!.phone), /804\s?201\s?4007/);
      assert.equal(back[0]!.customerSince, '2013-02-11');
      assert.equal(back[1]!.externalId, null, 'a customer SAP does not have yet: KUNNR empty, for SAP to create');
      assert.equal(back[1]!.customerType, 'ORGANIZATION');
      assert.equal(back[1]!.taxId, '10000018-0001');
    });
  }
}

test('a leading apostrophe (text, not a formula) is not part of the value: +234 phones come back', () => {
  const m = autoMap('customers', ['Name', 'Phone']);
  assert.match(String(checkCustomerRow(['Ada Okafor', "'+234 803 123 4567"], m).values!.phone), /803/);
  assert.equal(checkCustomerRow(["'=HYPERLINK(1)", ''], m).values!.fullName, '=HYPERLINK(1)', 'kept as text; any export writes the guard again');
});

test('an export’s CSV with notes that hold separators still reads with commas', () => {
  const t = '﻿"# Filters: Region; Lagos | Ikeja"\r\n"# List: Parts"\r\n"Part number","Description"\r\n"8-98100000-0","Brake pad set; NQR"\r\n';
  const rows = parseCsv(t).filter((r) => !isNoteRow(r));
  assert.deepEqual(rows, [['Part number', 'Description'], ['8-98100000-0', 'Brake pad set; NQR']]);
});

// ── The demo files match themselves ─────────────────────────────────────

test('docs/demo: every column of every SAP demo file is recognised, nothing required is missing (both folders)', () => {
  for (const demo of [join(ROOT, '..', '..', 'docs', 'demo', 'correct'), join(ROOT, '..', '..', 'docs', 'demo', 'with-mistakes')]) for (const [file, entity] of [['01_SAP_customers_demo.csv', 'customers'], ['03a_SAP_parts_200.csv', 'parts'], ['04_SAP_opening_stock_demo.csv', 'stock'], ['05_SAP_suppliers_demo.csv', 'suppliers'], ['06_SAP_invoice_history_demo.csv', 'invoices'], ['08_production_QC_register_demo.csv', 'registers']] as [string, EntityKey][]) {
    const [h] = parseCsv(readFileSync(join(demo, file), 'utf8'));
    const m = autoMap(entity, h!);
    const used = new Set(Object.values(m).filter((v) => v !== null));
    assert.deepEqual(h!.filter((_, i) => !used.has(i)), [], `${file}: columns not recognised`);
    assert.deepEqual(mappingProblems(entity, m), [], file);
  }
});

test('docs/demo/correct tells one consistent story', async () => {
  const demo = join(ROOT, '..', '..', 'docs', 'demo', 'correct');
  const csvOf = (f: string) => { const [h, ...rows] = parseCsv(readFileSync(join(demo, f), 'utf8')); return rows.filter((r) => !isBlankRow(r)).map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? '']))); };
  const xlsxOf = async (f: string) => { const b = new Uint8Array(readFileSync(join(demo, f))); const rows: string[][] = []; await readXlsx(() => (async function* () { yield b; })(), (r) => { rows.push(...r); }); const [h, ...rest] = rows; return rest.map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? '']))); };
  const sapDay = (s: string) => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s); if (!m) return null; const d = `${m[3]}-${m[2]}-${m[1]}`; return new Date(`${d}T00:00:00Z`).toISOString().startsWith(d) ? d : null; };
  const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const dmy = (s: string) => { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; };
  const customers = csvOf('01_SAP_customers_demo.csv'); const invoices = csvOf('06_SAP_invoice_history_demo.csv'); const qc = csvOf('08_production_QC_register_demo.csv');
  const vehicles = await xlsxOf('02_vehicles_demo.xlsx'); const pdi = await xlsxOf('07_PDI_register_demo.xlsx');
  // Different people: no two customers share an email (a shared email is the same customer to EJO).
  const emails = customers.map((c) => c.SMTP_ADDR).filter(Boolean);
  assert.equal(new Set(emails).size, emails.length, 'two customers share an email');
  // Customer since is never after the first invoice.
  for (const inv of invoices) {
    const day = sapDay(inv.FKDAT!); const c = customers.find((x) => x.KUNNR === inv.KUNAG && x.ERDAT);
    if (day && c) assert.ok(c.ERDAT! <= day, `${inv.VBELN}: invoiced ${day}, customer since ${c.ERDAT}`);
  }
  const seen = new Set<string>();
  for (const v of vehicles) {
    const vin = v.VIN!;
    if (!vin || seen.has(vin)) continue; // the planted vehicle with no VIN, the planted second copy
    seen.add(vin);
    const built = qc.filter((r) => r.VIN === vin).map((r) => ymd(r.Date!)).sort();
    const pdis = pdi.filter((r) => r.VIN === vin);
    const services = invoices.filter((r) => r.VHVIN === vin && sapDay(r.FKDAT!)).sort((a, b) => sapDay(a.FKDAT!)!.localeCompare(sapDay(b.FKDAT!)!));
    if (built.length) assert.equal(Number(v.Year), Number(built[0]!.slice(0, 4)), `${vin}: model year is the year it was built`);
    for (const p of pdis) {
      assert.ok(dmy(p['PDI date']!) > built[built.length - 1]!, `${vin}: PDI after the line`);
      assert.equal(String(p['Report no']).slice(4, 8), dmy(p['PDI date']!).slice(0, 4), `${vin}: the PDI report carries its year`);
    }
    if (services.length && pdis.length) assert.ok(sapDay(services[0]!.FKDAT!)! > dmy(pdis[0]!['PDI date']!), `${vin}: serviced before its PDI`);
    const km = services.map((r) => /^Service ([\d,]+) km$/.exec(r.ARKTX!)?.[1]).filter(Boolean).map((x) => Number(x!.replace(/,/g, '')));
    assert.deepEqual(km, [...km].sort((a, b) => a - b), `${vin}: a later service at a lower reading`);
    if (km.length) assert.ok(Number(v.Mileage) > km[km.length - 1]!, `${vin}: mileage ${v.Mileage} not past its last service`);
  }
  assert.ok(seen.size >= 30);
});
