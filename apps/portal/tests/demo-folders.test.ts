/**
 * docs/demo has two folders from the same data:
 *   correct/        every row passes EJO's import check (only the credit notes carry a note);
 *   with-mistakes/  the same rows, then the planted mistakes listed in its
 *                   mistakes.json and README — each caught exactly where and
 *                   how the list says, in EJO's own words.
 * EJO's real checks are run on every row of every file in both folders.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, type EntityKey } from '../lib/data-exchange/fields';
import { parseCsv } from '../lib/data-exchange/csv-reader';
import { readXlsx } from '../lib/data-exchange/xlsx-reader';
import { checkCustomerRow, checkVehicleRow, type Issue } from '../lib/data-exchange/check';
import { checkPartRow, checkStockRow, checkSupplierRow } from '../lib/data-exchange/check-inventory';
import { checkInvoiceRow, checkRegisterRow } from '../lib/data-exchange/check-history';

const DEMO = join(__dirname, '..', '..', '..', '..', 'docs', 'demo');
const FILES: [string, EntityKey][] = [
  ['01_SAP_customers_demo.csv', 'customers'], ['02_vehicles_demo.xlsx', 'vehicles'], ['03a_SAP_parts_200.csv', 'parts'], ['04_SAP_opening_stock_demo.csv', 'stock'],
  ['05_SAP_suppliers_demo.csv', 'suppliers'], ['06_SAP_invoice_history_demo.csv', 'invoices'], ['07_PDI_register_demo.xlsx', 'registers'], ['08_production_QC_register_demo.csv', 'registers'],
];
type Planted = { file: string; row: number; entity: string; what: string; expect: 'rejected' | 'duplicate' | 'warning'; by: 'check' | 'file' | 'database'; says: string };
const PLANTED: Planted[] = JSON.parse(readFileSync(join(DEMO, 'with-mistakes', 'mistakes.json'), 'utf8'));
const CREDIT_NOTE = /kept as a credit note/;

async function rowsOf(path: string): Promise<string[][]> {
  if (path.endsWith('.csv')) return parseCsv(readFileSync(path, 'utf8')).filter((r) => r.some((c) => c.trim() !== ''));
  const bytes = new Uint8Array(readFileSync(path));
  const out: string[][] = [];
  await readXlsx(() => (async function* () { yield bytes; })(), (r) => { out.push(...r.map((x) => x.map((c) => String(c ?? '')))); });
  return out;
}
/** EJO's import check on one row (the same function the import runs). */
function check(file: string, entity: EntityKey, cells: string[], m: ReturnType<typeof autoMap>): Issue[] {
  switch (entity) {
    case 'customers': return checkCustomerRow(cells, m).issues;
    case 'vehicles': return checkVehicleRow(cells, m).issues;
    case 'parts': return checkPartRow(cells, m, 'SAP').issues;
    case 'stock': return checkStockRow(cells, m).issues;
    case 'suppliers': return checkSupplierRow(cells, m).issues;
    case 'invoices': return checkInvoiceRow(cells, m).issues;
    default: return checkRegisterRow(cells, m, file.startsWith('07') ? 'PDI' : null).issues;
  }
}
/** The key EJO keeps one of per file (the second is a duplicate): customer, supplier or part number, VIN, invoice number in its company code and year. */
function keyOf(entity: EntityKey, h: string[], cells: string[]): string | null {
  const at = (name: string) => (cells[h.indexOf(name)] ?? '').trim();
  switch (entity) {
    case 'customers': return at('KUNNR').replace(/^0+/, '') || null;
    case 'suppliers': return at('LIFNR').replace(/^0+/, '') || null;
    case 'parts': return at('MATNR') || null;
    case 'vehicles': return at('VIN') || null;
    case 'invoices': return at('VBELN') ? `${at('VBELN').replace(/^0+/, '')}|${at('BUKRS')}|${at('GJAHR')}` : null;
    default: return null;
  }
}

test('docs/demo: two folders, every file in both (the 50,000 parts in correct/ only), and a README for each', () => {
  for (const [f] of FILES) {
    assert.ok(existsSync(join(DEMO, 'correct', f)), `correct/${f}`);
    assert.ok(existsSync(join(DEMO, 'with-mistakes', f)), `with-mistakes/${f}`);
  }
  assert.ok(existsSync(join(DEMO, 'correct', '03_SAP_parts_50k.csv')));
  for (const r of ['README.md', 'correct/README.md', 'with-mistakes/README.md']) assert.ok(existsSync(join(DEMO, r)), r);
  // Every file with mistakes has some; the README lists every one of them.
  const readme = readFileSync(join(DEMO, 'with-mistakes', 'README.md'), 'utf8');
  for (const [f] of FILES) assert.ok(PLANTED.some((p) => p.file === f), `${f} has planted mistakes`);
  for (const p of PLANTED) assert.ok(readme.includes(`| ${p.row} | ${p.what} | ${p.says} |`), `README lists ${p.file} row ${p.row}`);
});

test('correct/: EJO’s check accepts every row of every file — no error, no duplicate (only the credit notes carry a note)', async () => {
  for (const [f, entity] of FILES) {
    const [h, ...data] = await rowsOf(join(DEMO, 'correct', f));
    const m = autoMap(entity, h!);
    const seen = new Map<string, number>();
    data.forEach((cells, i) => {
      const row = i + 2;
      const issues = check(f, entity, cells, m);
      assert.deepEqual(issues.filter((x) => x.level === 'error').map((x) => x.message), [], `correct/${f} row ${row}`);
      for (const w of issues.filter((x) => x.level !== 'error')) assert.match(w.message, CREDIT_NOTE, `correct/${f} row ${row}: ${w.message}`);
      const k = keyOf(entity, h!, cells);
      if (k) { assert.ok(!seen.has(k), `correct/${f} row ${row} repeats row ${seen.get(k)}`); seen.set(k, row); }
    });
  }
});

test('with-mistakes/: the same rows, then exactly the planted mistakes — each caught where and as the list says', async () => {
  for (const [f, entity] of FILES) {
    const [ch, ...clean] = await rowsOf(join(DEMO, 'correct', f));
    const [h, ...data] = await rowsOf(join(DEMO, 'with-mistakes', f));
    assert.deepEqual(h, ch, `${f}: the same columns`);
    const planted = PLANTED.filter((p) => p.file === f).sort((a, b) => a.row - b.row);
    assert.deepEqual(data.slice(0, clean.length), clean, `${f}: the correct rows first, unchanged`);
    assert.deepEqual(planted.map((p) => p.row), data.slice(clean.length).map((_, i) => clean.length + 2 + i), `${f}: then one planted row per listed mistake`);
    const m = autoMap(entity, h!);
    const seen = new Map<string, number>();
    data.forEach((cells, i) => {
      const row = i + 2;
      const p = planted.find((x) => x.row === row);
      const issues = check(f, entity, cells, m);
      const errors = issues.filter((x) => x.level === 'error').map((x) => x.message);
      const notes = issues.filter((x) => x.level !== 'error' && !CREDIT_NOTE.test(x.message)).map((x) => x.message);
      const k = keyOf(entity, h!, cells);
      const dupOf = k ? seen.get(k) : undefined;
      if (k && dupOf === undefined) seen.set(k, row);
      if (!p) {
        assert.deepEqual(errors, [], `${f} row ${row}: an unplanted error`);
        assert.equal(dupOf, undefined, `${f} row ${row}: an unplanted duplicate`);
        return;
      }
      if (p.by === 'check' && p.expect === 'rejected') assert.deepEqual(errors, [p.says], `${f} row ${row}: ${p.what}`);
      if (p.by === 'check' && p.expect === 'warning') { assert.deepEqual(errors, [], `${f} row ${row}`); assert.ok(notes.includes(p.says), `${f} row ${row}: ${p.what} → ${notes.join(' | ')}`); }
      if (p.by === 'file') {
        assert.ok(dupOf !== undefined, `${f} row ${row}: ${p.what} is a duplicate`);
        assert.equal(p.says, p.says.replace(/as row \d+ of/, `as row ${dupOf} of`), `${f} row ${row}: the duplicate points at row ${dupOf}`);
      }
      // Caught only against what EJO holds: the row itself passes the row check.
      if (p.by === 'database') assert.deepEqual(errors, [], `${f} row ${row}: ${p.what} passes the row check, and is caught against the database`);
    });
  }
});
