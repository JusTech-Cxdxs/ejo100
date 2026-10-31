/**
 * A streaming Excel (.xlsx) reader: the first worksheet, row by row, without
 * ever holding the whole sheet in memory — an 800,000-row parts list reads
 * the same way as a 10-row one. Works in the browser and in tests.
 *
 * An .xlsx file is a zip of XML parts. Pass 1 reads the small parts (which
 * sheet is first, the shared strings, the cell styles that say which numbers
 * are dates); pass 2 streams the sheet itself through fflate's inflater and
 * hands back each complete <row>. Formulas are never run: a formula cell
 * gives its last saved value. Macro workbooks (.xlsm) are refused before
 * this is reached.
 */
import { Unzip, UnzipInflate } from 'fflate';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** XML text → plain text (entities, numeric references and Excel's _x000D_ escapes). */
export function xmlText(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] ?? '';
    })
    .replace(/_x([0-9A-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** The text of every <t> in a fragment (rich text runs joined), phonetic guides (<rPh>) left out. */
function runsText(fragment: string): string {
  const clean = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? xmlText(m[1]) : '';
  return out;
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) out.push(m[1] ? runsText(m[1]) : '');
  return out;
}

/** The workbook's first sheet, as a path inside the zip ("xl/worksheets/sheet1.xml"). */
export function firstSheetPath(workbookXml: string, relsXml: string): string {
  const sheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbookXml) ?? /<sheet\b[^>]*\bid="([^"]+)"/.exec(workbookXml);
  const id = sheet?.[1];
  if (id) {
    for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const attrs = m[1]!;
      if (new RegExp(`\\bId="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(attrs)) {
        const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
        if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** For each cell style (the s="…" index), whether it shows a date. */
export function dateStyles(stylesXml: string): boolean[] {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), xmlText(m[2]!));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  const out: boolean[] = [];
  for (const m of xfs.matchAll(/<xf\b([^>]*)/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(m[1]!)?.[1] ?? 0);
    const code = custom.get(id);
    // A custom format is a date when it has day/month/year parts outside quotes and brackets (not just "0.00" or "#,##0").
    const isDate = BUILTIN_DATE_FORMATS.has(id) || (code !== undefined && /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^[#0.,%\s]+$/.test(code));
    out.push(isDate);
  }
  return out;
}

/** An Excel day number → "2024-03-15" (the 1900 system, with Excel's 29 Feb 1900 quirk). */
export function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
}

/** "BC12" → 54 (column B C → zero-based index). */
export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** A plain number Excel stored with float noise (0.30000000000000004, 1.2E+10) → how a person reads it. */
function numberText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Number.isInteger(n)) return Math.abs(n) < 1e21 ? BigInt(Math.round(n)).toString() : v;
  return String(Number(n.toPrecision(15)));
}

/**
 * The sheet XML, fed in pieces: hands back each complete row, cells placed by
 * their column letter (Excel leaves empty cells out). Pure.
 */
export class XlsxSheetParser {
  private buf = '';
  private lastRow = 0;
  constructor(private shared: string[], private dates: boolean[]) {}

  push(text: string): string[][] {
    this.buf += text;
    const out: string[][] = [];
    for (;;) {
      const start = this.buf.indexOf('<row');
      if (start < 0) { this.buf = this.buf.slice(-8); break; }
      const gt = this.buf.indexOf('>', start);
      if (gt < 0) { this.buf = this.buf.slice(start); break; }
      const selfClosing = this.buf[gt - 1] === '/';
      const end = selfClosing ? gt + 1 : this.buf.indexOf('</row>', gt);
      if (end < 0) { this.buf = this.buf.slice(start); break; }
      const head = this.buf.slice(start, gt + 1);
      const body = selfClosing ? '' : this.buf.slice(gt + 1, end);
      this.buf = this.buf.slice(selfClosing ? end : end + 6);
      // Rows Excel left out entirely (blank lines) come back as empty rows, so line numbers match Excel's.
      const r = Number(/\br="(\d+)"/.exec(head)?.[1] ?? this.lastRow + 1);
      while (this.lastRow + 1 < r) { out.push([]); this.lastRow += 1; }
      this.lastRow = r;
      out.push(this.cells(body));
    }
    return out;
  }

  private cells(body: string): string[] {
    const row: string[] = [];
    let next = 0;
    for (const m of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1] ?? '';
      const inner = m[2] ?? '';
      const ref = /\br="([A-Z]+\d*)"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1] ?? 'n';
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let text = '';
      if (type === 's') text = v !== undefined ? this.shared[Number(v)] ?? '' : '';
      else if (type === 'inlineStr') text = runsText(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
      else if (type === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
      else if (type === 'e') text = '';
      else if (type === 'str' || type === 'd') text = v !== undefined ? xmlText(v) : '';
      else if (v !== undefined) text = style >= 0 && this.dates[style] ? excelDate(Number(v)) : numberText(xmlText(v));
      while (row.length < col) row.push('');
      row[col] = text;
    }
    return row;
  }
}

/** Something that gives the file's bytes in pieces, from the start, as often as asked. */
export type ByteSource = () => AsyncIterable<Uint8Array>;

/** Read the named parts of the zip (whole), skipping everything else. */
async function readParts(source: ByteSource, want: (name: string) => boolean): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const pending: Promise<void>[] = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (!want(file.name)) return;
    const decoder = new TextDecoder('utf-8');
    let text = '';
    pending.push(new Promise<void>((resolve, reject) => {
      file.ondata = (err, chunk, final) => {
        if (err) { reject(err); return; }
        text += decoder.decode(chunk, { stream: !final });
        if (final) { found.set(file.name, text); resolve(); }
      };
    }));
    file.start();
  };
  for await (const chunk of source()) unzip.push(chunk, false);
  unzip.push(new Uint8Array(0), true);
  await Promise.all(pending);
  return found;
}

/**
 * Every row of the first worksheet, in order, as text cells. `onRows` is
 * called with each batch as it is read (await it to apply back-pressure).
 */
export async function readXlsx(source: ByteSource, onRows: (rows: string[][]) => Promise<void> | void): Promise<void> {
  const small = await readParts(source, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || n === 'xl/styles.xml' || n === '[Content_Types].xml');
  const types = small.get('[Content_Types].xml') ?? '';
  if (/macroEnabled|vbaProject/i.test(types)) throw new Error('This workbook contains macros. Save it as a plain Excel workbook (.xlsx) or as CSV, then choose it again.');
  if (!small.has('xl/workbook.xml')) throw new Error('This file is not an Excel workbook (.xlsx). Save it from Excel as .xlsx or as CSV, then choose it again.');
  const sheetPath = firstSheetPath(small.get('xl/workbook.xml') ?? '', small.get('xl/_rels/workbook.xml.rels') ?? '');
  const parser = new XlsxSheetParser(parseSharedStrings(small.get('xl/sharedStrings.xml') ?? ''), dateStyles(small.get('xl/styles.xml') ?? ''));

  // Pass 2: stream the sheet. Rows found while inflating are queued and handed over between chunks.
  const queue: string[][] = [];
  let failure: unknown = null;
  let seen = false;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (file.name !== sheetPath) return;
    seen = true;
    const decoder = new TextDecoder('utf-8');
    file.ondata = (err, chunk, final) => {
      if (err) { failure = err; return; }
      queue.push(...parser.push(decoder.decode(chunk, { stream: !final })));
    };
    file.start();
  };
  const flush = async () => {
    while (queue.length) await onRows(queue.splice(0, 2000));
  };
  for await (const chunk of source()) {
    unzip.push(chunk, false);
    if (failure) throw failure;
    await flush();
  }
  unzip.push(new Uint8Array(0), true);
  if (failure) throw failure;
  if (!seen) throw new Error('The workbook’s first sheet could not be found.');
  await flush();
}
