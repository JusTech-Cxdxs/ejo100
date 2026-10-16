/**
 * (A byte-for-byte copy lives in the other app; a unit test keeps them equal.)
 * Markdown tables in Enyo's answers (both apps' small Markdown readers use
 * this): a header row, a separator row (| --- | :---: |) and body rows.
 * Pure string work, safe on half-streamed text: until the separator row has
 * arrived the lines are not a table yet.
 */

/** "| a | b |" → ["a", "b"]; escaped pipes (\|) stay in the cell. */
export function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (ch === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.length > 1 && t.slice(1).includes('|');
}

export function isTableSeparator(line: string): boolean {
  return isTableRow(line) && tableCells(line).every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));
}

export type TableAlign = 'left' | 'center' | 'right';
export type RawTable = { head: string[]; align: TableAlign[]; rows: string[][] };

/**
 * When `lines[i]` starts a table (a row followed by a separator row), the
 * table and the index after it; otherwise null. Rows are padded or cut to the
 * header's width; at most 60 rows and 8 columns are kept.
 */
export function readTable(lines: string[], i: number): { table: RawTable; next: number } | null {
  if (!isTableRow(lines[i] ?? '') || !isTableSeparator(lines[i + 1] ?? '')) return null;
  const head = tableCells(lines[i]!).slice(0, 8);
  const align = tableCells(lines[i + 1]!).slice(0, head.length).map((c): TableAlign => {
    const t = c.replace(/\s/g, '');
    return t.startsWith(':') && t.endsWith(':') ? 'center' : t.endsWith(':') ? 'right' : 'left';
  });
  while (align.length < head.length) align.push('left');
  const rows: string[][] = [];
  let j = i + 2;
  while (j < lines.length && isTableRow(lines[j]!)) {
    if (rows.length < 60) {
      const cells = tableCells(lines[j]!).slice(0, head.length);
      while (cells.length < head.length) cells.push('');
      rows.push(cells);
    }
    j += 1;
  }
  return { table: { head, align, rows }, next: j };
}
