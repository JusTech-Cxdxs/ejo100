import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { CsvReader, detectDelimiter, parseCsv } from '../lib/data-exchange/csv-reader';
import { XlsxSheetParser, columnIndex, dateStyles, excelDate, firstSheetPath, parseSharedStrings, readXlsx, xmlText } from '../lib/data-exchange/xlsx-reader';
import { autoMap, cleanMapping, headerKey, mappingFromProfile, mappingProblems, profileFromMapping } from '../lib/data-exchange/fields';
import { cellText, checkCustomerRow, checkVehicleRow, phoneKey, primaryAddress } from '../lib/data-exchange/check';

// ── CSV ───────────────────────────────────────────────────────────────────
test('csv: quotes, doubled quotes, line breaks inside a field, CRLF, BOM and a last line without a break', () => {
  const text = '﻿Name,Address,Note\r\n"Okafor, Ada","Plot 3\nLagos","She said ""hi"""\r\nBello,,x';
  assert.deepEqual(parseCsv(text), [['Name', 'Address', 'Note'], ['Okafor, Ada', 'Plot 3\nLagos', 'She said "hi"'], ['Bello', '', 'x']]);
});

test('csv: the same rows whatever size the pieces are (split inside quotes and between \\r and \\n)', () => {
  const text = 'a;b\r\n"x;\r\ny";"q""q"\r\n1;2\r\n';
  const whole = parseCsv(text);
  for (const size of [1, 2, 3, 5, 7]) {
    const r = new CsvReader();
    const rows: string[][] = [];
    for (let i = 0; i < text.length; i += size) rows.push(...r.push(text.slice(i, i + size)));
    rows.push(...r.end());
    assert.deepEqual(rows, whole, `pieces of ${size}`);
  }
  assert.deepEqual(whole, [['a', 'b'], ['x;\r\ny', 'q"q'], ['1', '2']]);
});

test('csv: the separator is worked out from the first line (comma, semicolon, tab, pipe)', () => {
  assert.equal(detectDelimiter('KUNNR|NAME1|TELF1'), '|');
  assert.equal(detectDelimiter('a;b;"c,d"'), ';');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
  assert.equal(detectDelimiter('single'), ',');
});

// ── Excel ─────────────────────────────────────────────────────────────────
function workbook(sheetXml: string, opts: { shared?: string[]; styles?: string; macro?: boolean } = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<Types>${opts.macro ? '<Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>' : ''}</Types>`),
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId7"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/sheet9.xml"/></Relationships>'),
    'xl/worksheets/sheet9.xml': strToU8(sheetXml),
  };
  if (opts.shared) files['xl/sharedStrings.xml'] = strToU8(`<sst>${opts.shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`);
  if (opts.styles) files['xl/styles.xml'] = strToU8(opts.styles);
  return zipSync(files);
}
const sourceOf = (bytes: Uint8Array, size = 7) => () => (async function* () { for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size); })();

test('excel: shared and inline strings, numbers without float noise, dates, gaps and blank rows, any piece size', async () => {
  const styles = '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>';
  const sheet = '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Sold</t></is></c></row>'
    + '<row r="3"><c r="A3"><v>1000123</v></c><c r="B3" t="s"><v>2</v></c><c r="C3"><v>0.30000000000000004</v></c><c r="D3" s="1"><v>45366</v></c></row>'
    + '<row r="4" spans="1:4"/>'
    + '<row r="5"><c r="B5" t="str"><f>A1&amp;"x"</f><v>KUNNRx</v></c><c r="C5" t="b"><v>1</v></c><c r="D5" s="2"><v>1234.5</v></c></row>'
    + '</sheetData></worksheet>';
  const bytes = workbook(sheet, { shared: ['KUNNR', 'NAME1', 'Okafor &amp; Sons'], styles });
  for (const size of [5, 64, 100000]) {
    const rows: string[][] = [];
    await readXlsx(sourceOf(bytes, size), (r) => { rows.push(...r); });
    assert.deepEqual(rows, [
      ['KUNNR', 'NAME1', '', 'Sold'],
      [],
      ['1000123', 'Okafor & Sons', '0.3', '2024-03-15'],
      [],
      ['', 'KUNNRx', 'TRUE', '1234.5'],
    ], `pieces of ${size}`);
  }
});

test('excel: a macro workbook and a file that is not a workbook are refused with a plain reason', async () => {
  await assert.rejects(readXlsx(sourceOf(workbook('<sheetData/>', { macro: true })), () => undefined), /contains macros/);
  await assert.rejects(readXlsx(sourceOf(zipSync({ 'a.txt': strToU8('x') })), () => undefined), /not an Excel workbook/);
});

test('excel helpers: columns, entities, rich text, first sheet, date styles', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('Z9'), 25);
  assert.equal(columnIndex('AA10'), 26);
  assert.equal(columnIndex('BC12'), 54);
  assert.equal(xmlText('a &amp; b &#8358;5 _x000D_'), 'a & b ₦5 \r');
  assert.deepEqual(parseSharedStrings('<sst><si><r><t>Ada </t></r><r><t xml:space="preserve">Okafor</t></r><rPh><t>x</t></rPh></si><si/></sst>'), ['Ada Okafor', '']);
  assert.equal(firstSheetPath('<sheet name="A" r:id="rId2"/>', '<Relationship Id="rId2" Target="/xl/worksheets/s.xml"/>'), 'xl/worksheets/s.xml');
  assert.deepEqual(dateStyles('<numFmts><numFmt numFmtId="170" formatCode="#,##0.00"/><numFmt numFmtId="171" formatCode="[$-409]d-mmm-yy"/></numFmts><cellXfs><xf numFmtId="14"/><xf numFmtId="170"/><xf numFmtId="171"/></cellXfs>'), [true, false, true]);
  assert.equal(excelDate(45366), '2024-03-15');
  const p = new XlsxSheetParser([], []);
  // A row split between two pieces comes back once its closing tag arrives; the blank row 1 before it is kept.
  assert.deepEqual(p.push('<row r="2"><c r="B2"><v>5</v></c></r'), []);
  assert.deepEqual(p.push('ow>'), [[], ['', '5']]);
});

// ── Matching columns ──────────────────────────────────────────────────────
test('columns match by plain names and SAP field names, each column once', () => {
  assert.equal(headerKey(' Customer No. '), 'customerno');
  const sap = ['KUNNR', 'NAME1', 'NAME2', 'STRAS', 'ORT01', 'REGIO', 'TELF1', 'TELF2', 'SMTP_ADDR', 'STCD1'];
  const m = autoMap('customers', sap);
  assert.deepEqual([m.externalId, m.fullName, m.name2, m.address, m.city, m.state, m.phone, m.altPhone, m.email, m.taxId], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const excel = autoMap('customers', ['Customer Name', 'Phone', 'Mobile', 'E-mail', 'Address']);
  assert.equal(excel.fullName, 0);
  assert.equal(excel.phone, 1);
  assert.equal(excel.altPhone, null, 'Mobile is a phone alias already used once, so it is not reused');
  assert.equal(excel.email, 3);
  const v = autoMap('vehicles', ['KUNNR', 'VIN', 'Reg No', 'Make', 'Model', 'Year', 'Odometer']);
  assert.deepEqual([v.customerExternalId, v.chassisNumber, v.plateNumber, v.make, v.model, v.year, v.mileage], [0, 1, 2, 3, 4, 5, 6]);
});

test('a mapping from the browser is checked, and saved profiles fit files with columns in another order', () => {
  const m = cleanMapping('customers', { fullName: 2, email: '0', phone: 2, address: 99, nonsense: 1 }, 3);
  assert.equal(m.fullName, 2);
  assert.equal(m.email, 0);
  assert.equal(m.phone, null, 'a column is used once');
  assert.equal(m.address, null, 'no such column');
  assert.ok(!('nonsense' in m));
  const profile = profileFromMapping({ fullName: 0, phone: 1 }, ['NAME1', 'TELF1']);
  assert.deepEqual(profile, { fullName: 'NAME1', phone: 'TELF1' });
  const again = mappingFromProfile('customers', profile, ['telf1', 'Something', 'name1']);
  assert.equal(again.fullName, 2);
  assert.equal(again.phone, 0);
  assert.deepEqual(mappingProblems('customers', { fullName: null }), ['Choose the column for “Name”.']);
  assert.equal(mappingProblems('vehicles', { customerExternalId: 0, chassisNumber: null, plateNumber: null }).length, 1);
});

// ── Checking rows ─────────────────────────────────────────────────────────
const CUST = autoMap('customers', ['KUNNR', 'NAME1', 'NAME2', 'Type', 'Company', 'SMTP_ADDR', 'TELF1', 'TELF2', 'STRAS', 'ORT01', 'REGIO', 'STCD1', 'Tags']);

test('a good SAP customer row: leading zeros off the number, name lines joined, keys for matching', () => {
  const r = checkCustomerRow(['0001000123', 'Dangote', 'Cement Plc', 'Company', 'Dangote Cement Plc', 'FLEET@Dangote.com', '0803 123 4567', '', 'Plot 3, Cheesebrough', 'Lagos', 'Lagos', '1234567-0001', 'Fleet, VIP'], CUST);
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.equal(r.values?.externalId, '1000123');
  assert.equal(r.values?.fullName, 'Dangote Cement Plc');
  assert.equal(r.values?.customerType, 'ORGANIZATION');
  assert.equal(r.values?.email, 'fleet@dangote.com');
  assert.equal(r.values?.address, 'Plot 3, Cheesebrough, Lagos');
  assert.deepEqual(r.values?.tags, ['Fleet', 'VIP']);
  assert.deepEqual(r.keys, ['ext:1000123', 'email:fleet@dangote.com', 'phone:8031234567']);
});

test('old data with gaps loads with notes; only a missing name rejects the row', () => {
  const noEmail = checkCustomerRow(['', 'Musa Bello', '', '', '', 'not-an-email', '12', '', '', '', '', '', ''], CUST);
  assert.equal(noEmail.status, 'WARNING');
  assert.equal(noEmail.values?.email, null, 'an invalid email is never kept');
  assert.equal(noEmail.values?.phone, null);
  assert.ok(noEmail.issues.some((i) => /not a valid email/.test(i.message)));
  assert.ok(noEmail.issues.some((i) => /No address/.test(i.message)));
  assert.ok(noEmail.issues.some((i) => /cannot recognise this customer/.test(i.message)));
  const noName = checkCustomerRow(['1', '', '', '', '', '', '0803 000 0000', '', '', '', '', '', ''], CUST);
  assert.equal(noName.status, 'REJECTED');
  assert.equal(noName.values, null);
});

test('several emails in one cell keep the first; N/A and dashes are empty', () => {
  const r = checkCustomerRow(['7', 'Ada', '', '', '', 'ada@x.ng; ops@x.ng', 'N/A', '-', '', '', '', '', ''], CUST);
  assert.equal(r.values?.email, 'ada@x.ng');
  assert.equal(r.values?.phone, null);
  assert.equal(cellText(' -- '), '');
  assert.equal(cellText('null'), '');
});

test('a long address keeps a short printed line and the full text', () => {
  const long = 'Block 12, Plot 34, Industrial Estate Road, Off Oshodi-Apapa Expressway, Behind the Old Depot';
  const a = primaryAddress(long, 'Isolo', 'Lagos');
  assert.ok(a.address && a.address.length <= 80);
  assert.equal(a.shortened, true);
  assert.equal(a.full?.line1, long);
  assert.equal(a.full?.city, 'Isolo');
  assert.deepEqual(primaryAddress('Plot 3', 'Lagos', 'Lagos'), { address: 'Plot 3, Lagos', full: null, shortened: false });
});

test('phones match however they are written', () => {
  assert.equal(phoneKey('0803 123 4567'), '8031234567');
  assert.equal(phoneKey('+234 803 123 4567'), '8031234567');
  assert.equal(phoneKey('234-803-123-4567'), '8031234567');
  assert.equal(phoneKey('12'), null);
});

const VEH = autoMap('vehicles', ['KUNNR', 'Customer email', 'Customer phone', 'EQUNR', 'VIN', 'Plate', 'Engine number', 'Engine type', 'Make', 'Model', 'Year', 'Category', 'Mileage']);

test('vehicles: VIN and plate tidied, commercial worked out from the model, year and mileage checked', () => {
  const r = checkVehicleRow(['1000123', '', '', '', 'jaanlr85 el7100001', 'lnd 123 ab', '4JJ1-1', '4JJ1', 'Isuzu', 'NQR 71', '2024', '', '45,200 km'], VEH, 2026);
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.equal(r.values?.chassisNumber, 'JAANLR85EL7100001');
  assert.equal(r.values?.plateNumber, 'LND 123 AB');
  assert.equal(r.values?.vehicleType, 'COMMERCIAL');
  assert.equal(r.values?.mileage, 45200);
  assert.deepEqual(r.keys, ['vin:JAANLR85EL7100001', 'plate:LND123AB']);
  const suv = checkVehicleRow(['9', '', '', '', '', 'KJA 1 AA', '', '', 'Soueast', 'S07', '1890', '', 'lots'], VEH, 2026);
  assert.equal(suv.status, 'WARNING');
  assert.equal(suv.values?.vehicleType, 'PASSENGER');
  assert.equal(suv.values?.year, null);
  assert.equal(suv.values?.mileage, null);
  assert.ok(suv.issues.some((i) => /not a year/.test(i.message)));
});

test('vehicles: no customer, or no VIN and no plate, rejects the row; an odd VIN is only a note', () => {
  assert.equal(checkVehicleRow(['', '', '', '', 'JAANLR85EL7100001', '', '', '', '', '', '', '', ''], VEH).status, 'REJECTED');
  assert.equal(checkVehicleRow(['1', '', '', '', '', '', '', '', 'Isuzu', '', '', '', ''], VEH).status, 'REJECTED');
  const odd = checkVehicleRow(['1', '', '', '', 'NQR-12345', '', '', '', '', '', '', '', ''], VEH);
  assert.equal(odd.status, 'WARNING');
  assert.match(odd.issues[0]!.message, /not a standard 17-character VIN/);
});
