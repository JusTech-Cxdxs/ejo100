/**
 * Exports — writing a list as it is read: CSV (UTF-8 with a byte-order mark,
 * so Excel opens ₦ and Nigerian names correctly) or Excel (.xlsx, streamed
 * through fflate's zip). Rows arrive in blocks from the database and leave
 * as bytes at once: a file of any size is never held in memory, and the
 * download starts straight away.
 *
 * Excel: a bold, frozen header row; real date and money cells; text as plain
 * text (nothing runs as a formula); more than 1,048,575 rows continue on a
 * numbered next sheet; an "About this file" sheet comes first. CSV: the same
 * About lines first, each starting with "#", then the header row.
 */
import { Zip, ZipDeflate, strToU8 } from 'fflate';
import { EXCEL_MAX_DATA_ROWS, csvLine, csvValue, excelDaySerial, excelSerial, type ColumnType, type ExportColumn } from './format';

export type StreamStats = { rows: number; bytes: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function columnName(i: number): string {
  let s = ''; let n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Styles: 0 plain, 1 bold header, 2 wrapped text, 3 date, 4 date and time, 5 money, 6 whole number. */
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F5EC"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="7"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="3" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
};
const dateOf = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) { const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
};

/** One Excel cell. */
export function xlsxCell(type: ColumnType, v: unknown, ref: string): string {
  if (v === null || v === undefined || v === '') return '';
  const text = (s: string) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
  switch (type) {
    case 'int': { const n = num(v); return n === null ? '' : `<c r="${ref}" s="6"><v>${Math.round(n)}</v></c>`; }
    case 'number': { const n = num(v); return n === null ? '' : `<c r="${ref}"><v>${n}</v></c>`; }
    case 'money': { const n = num(v); return n === null ? '' : `<c r="${ref}" s="5"><v>${Math.round(n * 100) / 100}</v></c>`; }
    case 'day': { const d = dateOf(v); return d ? `<c r="${ref}" s="3"><v>${excelDaySerial(d)}</v></c>` : ''; }
    case 'date': { const d = dateOf(v); return d ? `<c r="${ref}" s="3"><v>${typeof v === 'string' ? excelDaySerial(d) : excelSerial(d, false)}</v></c>` : ''; }
    case 'datetime': { const d = dateOf(v); return d ? `<c r="${ref}" s="4"><v>${excelSerial(d, true)}</v></c>` : ''; }
    case 'bool': return text(v ? 'Yes' : 'No');
    default: return text(String(v));
  }
}

const sheetHead = (widths: number[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, 6), 60)}" customWidth="1"/>`).join('')}</cols><sheetData>`;
const SHEET_TAIL = '</sheetData></worksheet>';
const headerRow = (headers: string[]) => `<row r="1">${headers.map((h, i) => `<c r="${columnName(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(h)}</t></is></c>`).join('')}</row>`;
const safeSheet = (n: string) => n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

/**
 * The file as a stream of bytes. `rows` yields blocks of records; `about`
 * is the About sheet / lines (label, value). `onDone` gets the row count and
 * size once the last byte has been written.
 */
export function exportStream<R>(input: {
  format: 'xlsx' | 'csv';
  sheetName: string;
  columns: ExportColumn<R>[];
  rows: AsyncIterable<R[]>;
  about: [string, string][];
  /** Lines known only once the rows are written (Excel's About sheet is written last): "more parts follow". */
  aboutAfter?: () => [string, string][];
  onDone?: (stats: StreamStats) => void | Promise<void>;
}): ReadableStream<Uint8Array> {
  const it = (input.format === 'csv' ? csvChunks(input) : xlsxChunks(input))[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close(); else controller.enqueue(value);
      } catch (err) { controller.error(err); }
    },
    async cancel() { await it.return?.(undefined); },
  });
}

async function* csvChunks<R>(input: Parameters<typeof exportStream<R>>[0]): AsyncGenerator<Uint8Array> {
  let bytes = 0; let rows = 0;
  const out = (s: string) => { const u = strToU8(s); bytes += u.length; return u; };
  let head = '﻿';
  for (const [k, v] of input.about) head += csvLine([`# ${k}: ${v}`.replace(/\r?\n/g, ' ')]);
  head += csvLine(input.columns.map((c) => c.header));
  yield out(head);
  for await (const block of input.rows) {
    let chunk = '';
    for (const r of block) { chunk += csvLine(input.columns.map((c) => csvValue(c.type, c.get(r)))); rows += 1; }
    if (chunk) yield out(chunk);
  }
  await input.onDone?.({ rows, bytes });
}

async function* xlsxChunks<R>(input: Parameters<typeof exportStream<R>>[0]): AsyncGenerator<Uint8Array> {
  const queue: Uint8Array[] = [];
  let failed: Error | null = null;
  let bytes = 0; let rows = 0;
  const zip = new Zip((err, data) => { if (err) failed = err; else if (data.length) { queue.push(data); bytes += data.length; } });
  const drain = function* () { if (failed) throw failed; while (queue.length) yield queue.shift()!; };
  const headers = input.columns.map((c) => c.header);
  const widths = input.columns.map((c) => c.width ?? Math.max(10, Math.min(40, c.header.length + 2)));
  const name = safeSheet(input.sheetName);
  const sheetNames: string[] = [];
  let sheet: ZipDeflate | null = null;
  let rowInSheet = 0;
  const openSheet = () => {
    sheetNames.push(sheetNames.length === 0 ? name : safeSheet(`${name.slice(0, 26)} (${sheetNames.length + 1})`));
    // Sheet 1 is "About this file"; the data sheets follow.
    sheet = new ZipDeflate(`xl/worksheets/sheet${sheetNames.length + 1}.xml`, { level: 6 });
    zip.add(sheet);
    sheet.push(strToU8(sheetHead(widths) + headerRow(headers)));
    rowInSheet = 0;
  };
  openSheet();
  yield* drain();
  for await (const block of input.rows) {
    let chunk = '';
    for (const r of block) {
      if (rowInSheet >= EXCEL_MAX_DATA_ROWS) {
        sheet!.push(strToU8(chunk + SHEET_TAIL), true); chunk = '';
        openSheet();
      }
      const ri = rowInSheet + 2;
      chunk += `<row r="${ri}">${input.columns.map((c, ci) => xlsxCell(c.type, c.get(r), `${columnName(ci)}${ri}`)).join('')}</row>`;
      rowInSheet += 1; rows += 1;
    }
    if (chunk) sheet!.push(strToU8(chunk));
    yield* drain();
  }
  sheet!.push(strToU8(SHEET_TAIL), true);
  // About this file (written last, listed first): it carries the final row count.
  const about = [...input.about, ...(input.aboutAfter?.() ?? []), ['Rows', rows.toLocaleString('en-NG')] as [string, string], ...(sheetNames.length > 1 ? [['Sheets', `${sheetNames.length} (Excel holds 1,048,575 rows a sheet)`] as [string, string]] : [])];
  const small = (path: string, xml: string) => { const f = new ZipDeflate(path, { level: 6 }); zip.add(f); f.push(strToU8(xml), true); };
  small('xl/worksheets/sheet1.xml', `${sheetHead([28, 80])}<row r="1"><c r="A1" t="inlineStr" s="1"><is><t>About this file</t></is></c><c r="B1" t="inlineStr" s="1"><is><t></t></is></c></row>${about.map(([k, v], i) => `<row r="${i + 2}"><c r="A${i + 2}" t="inlineStr"><is><t xml:space="preserve">${esc(k)}</t></is></c><c r="B${i + 2}" t="inlineStr" s="2"><is><t xml:space="preserve">${esc(v)}</t></is></c></row>`).join('')}${SHEET_TAIL}`);
  const all = ['About this file', ...sheetNames];
  small('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${all.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  small('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  // The data sheet opens first; About this file is the first tab.
  small('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="1"/></bookViews><sheets>${all.map((s, i) => `<sheet name="${esc(s)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  small('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${all.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${all.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  small('xl/styles.xml', STYLES);
  zip.end();
  yield* drain();
  await input.onDone?.({ rows, bytes });
}
