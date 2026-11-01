/**
 * A streaming CSV reader (RFC 4180, as Excel and SAP write it): feed it text
 * in pieces of any size, get complete rows back. Quoted fields may hold
 * commas, doubled quotes and line breaks, and may be split across pieces.
 * Works the same in the browser (reading a File in chunks) and in tests.
 * Pure: no dependencies.
 */

/** The separator a file uses, from its first line: comma, semicolon (European Excel), tab or pipe (SAP extracts). */
export function detectDelimiter(firstLine: string): ',' | ';' | '\t' | '|' {
  const counts: [',' | ';' | '\t' | '|', number][] = [',', ';', '\t', '|'].map((d) => {
    let n = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === d) n += 1;
    }
    return [d as ',' | ';' | '\t' | '|', n];
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

/** A "#" note above the header (an EJO export's About lines): "# List: Customers". */
const NOTE = /^\s*"?#/;

/** The first complete line that is not a "#" note, or null while none has arrived yet. */
function firstDataLine(text: string): string | null {
  const lines = text.split(/\r\n|\r|\n/);
  for (const l of lines.slice(0, -1)) if (!NOTE.test(l)) return l;
  return null;
}

/** A row that is a "#" note (only the first cell, starting with #) — skipped above the header, so an EJO export reads back in. */
export function isNoteRow(cells: unknown[]): boolean {
  return String(cells[0] ?? '').trimStart().startsWith('#') && cells.slice(1).every((c) => String(c ?? '').trim() === '');
}

export class CsvReader {
  private field = '';
  private row: string[] = [];
  private quoted = false;
  /** A quote just closed a quoted field: the next quote (doubled) is a literal quote. */
  private quoteEnded = false;
  private started = false;
  private pendingCR = false;
  private delimiter: string | null;

  constructor(delimiter?: string) {
    this.delimiter = delimiter ?? null;
  }

  /** Feed the next piece of text; returns the rows it completed. */
  push(text: string): string[][] {
    const out: string[][] = [];
    let s = text;
    if (!this.started) {
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // byte-order mark
      if (!this.delimiter) {
        const buf = this.field + s;
        const line = firstDataLine(buf);
        if (line === null && buf.length < 64 * 1024) {
          // Wait for the first full line (after any "#" notes) before deciding the separator.
          this.field = buf;
          return out;
        }
        this.delimiter = detectDelimiter(line ?? buf.split(/\r\n|\r|\n/)[0]!);
        s = buf;
        this.field = '';
      }
      this.started = true;
    }
    const d = this.delimiter!;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i]!;
      if (this.pendingCR) {
        this.pendingCR = false;
        if (ch === '\n') continue;
      }
      if (this.quoted) {
        if (ch === '"') { this.quoted = false; this.quoteEnded = true; }
        else this.field += ch;
        continue;
      }
      if (ch === '"') {
        if (this.quoteEnded) { this.field += '"'; this.quoted = true; this.quoteEnded = false; continue; }
        if (this.field === '') { this.quoted = true; continue; }
        this.field += ch; // a stray quote inside an unquoted field is kept as text
        continue;
      }
      this.quoteEnded = false;
      if (ch === d) { this.row.push(this.field); this.field = ''; continue; }
      if (ch === '\r' || ch === '\n') {
        this.row.push(this.field);
        this.field = '';
        out.push(this.row);
        this.row = [];
        if (ch === '\r') this.pendingCR = true;
        continue;
      }
      this.field += ch;
    }
    return out;
  }

  /** The end of the file: the last row, if it had no line break after it. */
  end(): string[][] {
    if (!this.started && this.field) {
      this.started = true;
      this.delimiter = detectDelimiter(firstDataLine(`${this.field}\n`) ?? this.field);
      const s = this.field;
      this.field = '';
      const rows = this.push(s);
      return [...rows, ...this.end()];
    }
    if (this.field !== '' || this.row.length) {
      this.row.push(this.field);
      const r = this.row;
      this.row = [];
      this.field = '';
      return [r];
    }
    return [];
  }

  get separator(): string | null {
    return this.delimiter;
  }
}

/** Blank lines (every cell empty) are not records. */
export function isBlankRow(r: unknown[]): boolean {
  return r.every((c) => c === null || c === undefined || String(c).trim() === '');
}

/** Parse a whole CSV text (tests and small files). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const r = new CsvReader(delimiter);
  return [...r.push(text), ...r.end()];
}
