/**
 * A4 exports: values written the way Excel and other systems read them,
 * formulas never run, filters kept and described, the stream (CSV and
 * Excel) correct at any size, and every list's export wired to its page
 * with the right permissions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { csvLine, csvValue, excelDaySerial, excelSerial, exportFileName, lagosDay, lagosDateTime, safeText, EXCEL_MAX_DATA_ROWS } from '../lib/exports/format';
import { cleanParams, describeParams, isExportFormat, EXPORT_LINK_HOURS, PART_BUDGET_MS, PART_IN_FLIGHT_MS } from '../lib/exports/describe';
import { exportStream, xlsxCell } from '../lib/exports/stream';
import { parseWarrantyFilter, warrantyMatchesFilter } from '../lib/warranty-list';
import { PERMISSIONS, ROLE_GRANTS } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

async function bytesOf(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const r = s.getReader();
  for (;;) { const { value, done } = await r.read(); if (done) break; parts.push(value); }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function* blocksOf<R>(rows: R[], size = 3): AsyncGenerator<R[]> { for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size); }

test('nothing typed into EJO runs as a formula in the file', () => {
  for (const s of ['=1+1', '+234 803', '-5', '@SUM(A1)', '\tx', '\rx']) assert.ok(safeText(s).startsWith("'"), s);
  assert.equal(safeText('Ade & Sons'), 'Ade & Sons');
  assert.equal(csvValue('text', '=HYPERLINK("x")'), `'=HYPERLINK("x")`);
  // Excel cells are always plain text (inlineStr), never a formula cell.
  const cell = xlsxCell('text', '=CMD()', 'A2');
  assert.match(cell, /t="inlineStr"/);
  assert.doesNotMatch(cell, /<f>/);
  assert.match(xlsxCell('text', '<b>&', 'A2'), /&lt;b&gt;&amp;/);
});

test('dates in Lagos time, money as numbers, record numbers as text, Yes / No', () => {
  // 23:30 UTC is 00:30 the next day in Lagos.
  assert.equal(lagosDay(new Date('2026-03-14T23:30:00Z')), '2026-03-15');
  assert.equal(lagosDateTime(new Date('2026-03-14T23:30:00Z')), '2026-03-15 00:30');
  assert.equal(csvValue('date', new Date('2026-03-14T23:30:00Z')), '2026-03-15');
  // A calendar date (customer since, invoice date) is that date, never shifted.
  assert.equal(csvValue('day', new Date('2011-09-15T00:00:00Z')), '2011-09-15');
  assert.equal(excelDaySerial(new Date('2026-01-01T00:00:00Z')), 46023);
  assert.equal(excelSerial(new Date('2025-12-31T23:00:00Z'), false), 46023, 'midnight in Lagos is the new day');
  assert.equal(csvValue('money', '125000.5'), '125000.50');
  assert.equal(csvValue('int', 3.6), '4');
  assert.equal(csvValue('bool', true), 'Yes');
  assert.equal(csvValue('bool', false), 'No');
  assert.equal(csvValue('code', '0000123456'), '0000123456', 'SAP keeps its leading zeros');
  assert.match(xlsxCell('code', '0000123456', 'A2'), /<t xml:space="preserve">0000123456<\/t>/);
  assert.match(xlsxCell('money', 1234.567, 'B2'), /s="5"><v>1234.57<\/v>/);
  assert.match(xlsxCell('day', new Date('2026-01-01T00:00:00Z'), 'C2'), /s="3"><v>46023<\/v>/);
  assert.equal(xlsxCell('int', null, 'D2'), '', 'empty stays empty');
  assert.equal(csvLine(['a"b', 'c']), '"a""b","c"\r\n');
  assert.match(exportFileName('customers', 'EXP-2026-000012', 'xlsx', new Date('2026-11-01T10:00:00Z')), /^EJO-customers-2026-11-01-EXP-2026-000012\.xlsx$/);
});

test('an export keeps only the list’s known filters, short and plain', () => {
  const p = cleanParams({ q: '  Ade  ', page: '7', error: 'x', evil: 'y', source: 'sap', imp: 'imp-2026-000003', type: ['COMMERCIAL', 'PASSENGER'], cursor: 'abc', tag: 'a\u0000b', long: 'z'.repeat(500), filter: 'z'.repeat(500) });
  assert.deepEqual(Object.keys(p).sort(), ['filter', 'imp', 'q', 'source', 'tag', 'type']);
  assert.equal(p.q, 'Ade');
  assert.equal(p.type, 'COMMERCIAL');
  assert.equal(p.tag, 'a b');
  assert.equal(p.filter!.length, 120);
  assert.deepEqual(cleanParams(null), {});
  assert.equal(describeParams({ q: 'Ade', source: 'sap', imp: 'imp-2026-000003', history: 'exclude', type: 'COMMERCIAL' }), 'Search: Ade · Source: Imported from SAP · Import: IMP-2026-000003 · History from before EJO: Left out (EJO only) · Vehicle category: Commercial');
  assert.equal(describeParams({}), 'Everything in the list');
  assert.equal(describeParams({ customerId: 'c1', userId: 'u1' }), 'Everything in the list', 'internal ids are never shown as words');
  assert.ok(isExportFormat('xlsx') && isExportFormat('csv') && !isExportFormat('pdf'));
  assert.equal(EXPORT_LINK_HOURS, 24);
  assert.ok(PART_BUDGET_MS < 60_000 - 10_000, 'a part finishes well inside the request limit');
  assert.ok(PART_IN_FLIGHT_MS > PART_BUDGET_MS);
});

type Row = { n: string; name: string; at: Date; amount: number; ok: boolean };
const COLUMNS = [
  { header: 'Number', type: 'code' as const, get: (r: Row) => r.n },
  { header: 'Name', type: 'text' as const, get: (r: Row) => r.name },
  { header: 'When', type: 'datetime' as const, get: (r: Row) => r.at },
  { header: 'Amount', type: 'money' as const, get: (r: Row) => r.amount },
  { header: 'Active', type: 'bool' as const, get: (r: Row) => r.ok },
];
const ROWS: Row[] = [
  { n: '0001', name: 'Ada Okafor', at: new Date('2026-10-31T23:15:00Z'), amount: 1500, ok: true },
  { n: '0002', name: '=EVIL()', at: new Date('2026-11-01T08:00:00Z'), amount: 25.5, ok: false },
  { n: '0003', name: 'Musa, "Haulage"', at: new Date('2026-11-01T09:00:00Z'), amount: 0, ok: true },
  { n: '0004', name: 'Chinedu', at: new Date('2026-11-01T10:00:00Z'), amount: 99.99, ok: true },
];

test('CSV: UTF-8 with a byte-order mark, the About lines, the header, every row; counted', async () => {
  let stats = { rows: -1, bytes: -1 };
  const bytes = await bytesOf(exportStream({ format: 'csv', sheetName: 'Customers', columns: COLUMNS, rows: blocksOf(ROWS), about: [['List', 'Customers'], ['Filters', 'Search: Ade']], onDone: (s) => { stats = s; } }));
  const text = new TextDecoder().decode(bytes);
  assert.equal(bytes[0], 0xef); assert.equal(bytes[1], 0xbb); assert.equal(bytes[2], 0xbf);
  const lines = text.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines[0], '"# List: Customers"');
  assert.equal(lines[1], '"# Filters: Search: Ade"');
  assert.equal(lines[2], '"Number","Name","When","Amount","Active"');
  assert.equal(lines[3], '"0001","Ada Okafor","2026-11-01 00:15","1500.00","Yes"');
  assert.equal(lines[4], `"0002","'=EVIL()","2026-11-01 09:00","25.50","No"`);
  assert.equal(lines[5], '"0003","Musa, ""Haulage""","2026-11-01 10:00","0.00","Yes"');
  assert.deepEqual(stats, { rows: 4, bytes: bytes.length });
});

test('Excel: About this file first, the data sheet open, a frozen bold header, real cells', async () => {
  let stats = { rows: -1, bytes: -1 };
  const bytes = await bytesOf(exportStream({ format: 'xlsx', sheetName: 'Customers', columns: COLUMNS, rows: blocksOf(ROWS), about: [['List', 'Customers']], aboutAfter: () => [['More to come', 'part 2']], onDone: (s) => { stats = s; } }));
  const files = unzipSync(bytes);
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(files[f], f);
  const wb = strFromU8(files['xl/workbook.xml']!);
  assert.match(wb, /<sheet name="About this file" sheetId="1"[^>]*\/><sheet name="Customers" sheetId="2"/);
  assert.match(wb, /activeTab="1"/);
  const about = strFromU8(files['xl/worksheets/sheet1.xml']!);
  assert.match(about, /More to come/);
  assert.match(about, /<t xml:space="preserve">Rows<\/t><\/is><\/c><c r="B\d+" t="inlineStr" s="2"><is><t xml:space="preserve">4<\/t>/);
  const data = strFromU8(files['xl/worksheets/sheet2.xml']!);
  assert.match(data, /state="frozen"/);
  assert.match(data, /<row r="1"><c r="A1" t="inlineStr" s="1">/);
  assert.equal((data.match(/<row /g) ?? []).length, 5);
  assert.match(data, /<c r="D2" s="5"><v>1500<\/v><\/c>/);
  assert.match(data, /<c r="C2" s="4"><v>46327\.0\d*<\/v><\/c>/);
  assert.match(data, /<t xml:space="preserve">=EVIL\(\)<\/t>/, 'text cell, not a formula');
  assert.equal(stats.rows, 4);
  assert.equal(stats.bytes, bytes.length);
});

test('Excel: past 1,048,575 rows the list carries on on a numbered next sheet', async () => {
  assert.equal(EXCEL_MAX_DATA_ROWS, 1_048_575);
  const total = EXCEL_MAX_DATA_ROWS + 3;
  async function* many(): AsyncGenerator<{ i: number }[]> {
    const size = 50_000;
    for (let i = 0; i < total; i += size) yield Array.from({ length: Math.min(size, total - i) }, (_, k) => ({ i: i + k }));
  }
  const bytes = await bytesOf(exportStream({ format: 'xlsx', sheetName: 'Parts', columns: [{ header: 'N', type: 'int', get: (r: { i: number }) => r.i }], rows: many(), about: [] }));
  const files = unzipSync(bytes, { filter: (f) => !f.name.endsWith('sheet2.xml') });
  const wb = strFromU8(files['xl/workbook.xml']!);
  assert.match(wb, /<sheet name="Parts" sheetId="2"[^>]*\/><sheet name="Parts \(2\)" sheetId="3"/);
  const second = strFromU8(files['xl/worksheets/sheet3.xml']!);
  assert.equal((second.match(/<row /g) ?? []).length, 1 + 3, 'header + the 3 rows past the limit');
  assert.match(second, new RegExp(`<v>${EXCEL_MAX_DATA_ROWS}</v>`));
  assert.match(strFromU8(files['xl/worksheets/sheet1.xml']!), /Excel holds 1,048,575 rows a sheet/);
});

test('the warranty register and its export share one filter', () => {
  assert.equal(parseWarrantyFilter('expired'), 'expired');
  assert.equal(parseWarrantyFilter('nonsense'), 'all');
  const r = { kind: 'ASSET', state: 'EXPIRING_SOON' as const, reminderDue: true };
  assert.ok(warrantyMatchesFilter('covered', r));
  assert.ok(warrantyMatchesFilter('expiring', r));
  assert.ok(warrantyMatchesFilter('asset', r));
  assert.ok(!warrantyMatchesFilter('part', r));
  assert.ok(warrantyMatchesFilter('reminder', r));
  assert.ok(!warrantyMatchesFilter('expired', r));
  assert.match(read('app/(app)/warranty/page.tsx'), /warrantyMatchesFilter\(filter,/);
});

test('permissions: exporting is its own grant; contact details and payments need the sensitive one too', () => {
  assert.ok(PERMISSIONS['dataexchange.export.run']);
  assert.ok(PERMISSIONS['dataexchange.export.sensitive']);
  for (const [role, g] of Object.entries(ROLE_GRANTS)) {
    if (g['dataexchange.export.sensitive']) assert.ok(g['dataexchange.export.run'], `${role}: sensitive without run`);
  }
  assert.ok(!ROLE_GRANTS['technician']?.['dataexchange.export.run'], 'technicians do not export');
  assert.ok(!ROLE_GRANTS['receptionist']?.['dataexchange.export.run'], 'the front desk does not export');
  const kinds = read('lib/exports/kinds.ts');
  for (const m of kinds.matchAll(/view: \[([^\]]+)\]/g)) for (const k of m[1]!.match(/'([a-z_.]+)'/g) ?? []) assert.ok(PERMISSIONS[k.slice(1, -1) as keyof typeof PERMISSIONS], `unknown permission ${k}`);
  // Customers and SAP invoices (contact details and payments) and the audit trail (sign-in addresses) are sensitive.
  for (const key of ['customers', 'sap-invoices', 'audit-log']) assert.match(kinds, new RegExp(`key: '${key}'[^\\n]*sensitive: true`), key);
});

test('every Export button names a real list; the file is built at download, for the person downloading it', () => {
  const kinds = read('lib/exports/kinds.ts');
  const keys = new Set([...kinds.matchAll(/key: '([a-z-]+)', label:/g)].map((m) => m[1]!));
  assert.ok(keys.size >= 16, `${keys.size} lists`);
  const pages: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'page.tsx') pages.push(p); } };
  walk(join(ROOT, 'app', '(app)'));
  const used = new Set<string>();
  for (const p of pages) for (const m of readFileSync(p, 'utf8').matchAll(/<Export(?:Action|Button) kind="([a-z-]+)"/g)) used.add(m[1]!);
  for (const k of used) assert.ok(keys.has(k), `${k} is not an export`);
  for (const k of ['customers', 'vehicles', 'parts', 'stock', 'suppliers', 'goods-receipts', 'job-cards', 'vehicle-services', 'warranties', 'imports', 'exports', 'users', 'audit-log', 'security-register', 'headquarters']) assert.ok(used.has(k), `no Export button for ${k}`);
  // Every list ends its rows with a link back to the record, except the summary-only lists.
  const route = read('app/(app)/data-exchange/exports/[id]/download/route.ts');
  assert.match(route, /claimPart\(id\)/);
  assert.match(route, /'Cache-Control': 'no-store'/);
  const server = read('lib/exports/download-server.ts');
  assert.match(server, /refuseDuringAssist/);
  assert.match(server, /expiresAt\.getTime\(\) <= Date\.now\(\)/);
  assert.match(server, /already downloaded this export/);
  assert.match(server, /updateMany\(\{ where: \{ id: existing\.id, finishedAt: null, startedAt: existing\.startedAt, parts: existing\.parts \}/, 'one part at a time: compare and set');
  assert.match(server, /action: 'data_exchange\.exported'/);
  const actions = read('lib/actions/exports.ts');
  assert.match(actions, /export async function createExport[\s\S]{0,300}authorize\('dataexchange\.export\.run'/);
  assert.match(actions, /refuseDuringAssist\('createExport'\)/);
  assert.match(actions, /EXPORTS_PER_HOUR/);
  // No copy of the data is stored: the export holds its filters only.
  assert.doesNotMatch(read('../../packages/database/prisma/schema.prisma').slice(read('../../packages/database/prisma/schema.prisma').indexOf('model ExportJob')), /Bytes\b|content\s+String/);
});
