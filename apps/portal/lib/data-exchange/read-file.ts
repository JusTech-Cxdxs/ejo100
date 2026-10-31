/**
 * Reading a chosen file in the browser, a piece at a time: CSV (any
 * separator, UTF-8 or Windows-1252 as old systems write it) or Excel (.xlsx,
 * first sheet). Rows come back numbered as Excel numbers them (the header is
 * row 1), so a problem reported on "row 5,212" is row 5,212 in the file.
 */
import { CsvReader, isBlankRow } from './csv-reader';
import { readXlsx } from './xlsx-reader';

export type FileKind = 'csv' | 'xlsx';

/** What a file is, by its first bytes (not its name): a zip is an Excel workbook; anything else is read as text. */
export async function sniffKind(file: File): Promise<FileKind | 'xls' | 'unknown'> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) return 'xlsx';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'xls'; // old binary Excel
  if (/\.xlsm$/i.test(file.name)) return 'unknown';
  return 'csv';
}

/** The file's SHA-256 fingerprint (the same file uploaded twice is recognised). */
export async function fingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function* chunks(file: File, size = 1 << 20, onBytes?: (n: number) => void): AsyncGenerator<Uint8Array> {
  let done = 0;
  for (let at = 0; at < file.size; at += size) {
    const buf = new Uint8Array(await file.slice(at, at + size).arrayBuffer());
    done += buf.length;
    onBytes?.(done);
    yield buf;
  }
}

/** UTF-8 unless the start of the file is not valid UTF-8 (then Windows-1252, as older Excel and SAP GUI exports write). */
async function textEncoding(file: File): Promise<string> {
  const head = await file.slice(0, 256 * 1024).arrayBuffer();
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head);
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

/**
 * Every row of the file, in order, handed to `onRows` in batches (awaited, so
 * sending can keep pace). `onProgress` gets the share of the file read (0–1).
 * Blank rows are left out but keep their numbers.
 */
export async function readFileRows(
  file: File,
  kind: FileKind,
  onRows: (rows: { rowNumber: number; cells: string[] }[]) => Promise<void>,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  let n = 0;
  const hand = async (rows: string[][]) => {
    const out: { rowNumber: number; cells: string[] }[] = [];
    for (const cells of rows) {
      n += 1;
      if (!isBlankRow(cells)) out.push({ rowNumber: n, cells: cells.map((c) => String(c ?? '')) });
    }
    if (out.length) await onRows(out);
  };
  if (kind === 'xlsx') {
    // Two passes (the small parts, then the sheet): progress follows the second.
    let pass = 0;
    await readXlsx(() => { pass += 1; const p = pass; return chunks(file, 1 << 20, (b) => { if (p === 2) onProgress?.(b / Math.max(file.size, 1)); }); }, hand);
    onProgress?.(1);
    return;
  }
  const decoder = new TextDecoder(await textEncoding(file));
  const reader = new CsvReader();
  for await (const buf of chunks(file, 1 << 20, (b) => onProgress?.(b / Math.max(file.size, 1)))) {
    await hand(reader.push(decoder.decode(buf, { stream: true })));
  }
  await hand([...reader.push(decoder.decode()), ...reader.end()]);
  onProgress?.(1);
}
