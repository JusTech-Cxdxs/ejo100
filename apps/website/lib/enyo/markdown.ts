/**
 * The small, safe Markdown subset Enyo's answers use: paragraphs, bullet and
 * numbered lists, **bold**, *italic*, `code` and [links](/path). Parsed into
 * plain data and rendered as React elements — never as HTML — so nothing in
 * an answer can inject markup or script. Links are kept only when they point
 * inside this site or at an https address (rules.safeHref); anything else
 * stays as plain text. Browser-safe: imports only ./rules and the shared table reader.
 */
import { safeHref } from './rules';
import { readTable, type TableAlign } from './markdown-table';

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' };

export type Block =
  | { t: 'table'; head: Inline[][]; align: TableAlign[]; rows: Inline[][][] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][]; start: number };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = (src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', c: inlineLines(para) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) { flush(); continue; }
    const tbl = readTable(lines, i);
    if (tbl) {
      flush();
      out.push({ t: 'table', head: tbl.table.head.map((c) => inline(c)), align: tbl.table.align, rows: tbl.table.rows.map((r) => r.map((c) => inline(c))) });
      i = tbl.next - 1;
      continue;
    }
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    if (b || n) {
      flush();
      const ordered = !b;
      const items: Inline[][] = [];
      const start = n ? Number(n[1]) : 1;
      let j = i;
      for (; j < lines.length; j++) {
        const m = ordered ? NUMBERED.exec(lines[j]!) : BULLET.exec(lines[j]!);
        if (m) { items.push(inline(ordered ? m[2]! : m[1]!)); continue; }
        // A wrapped continuation line belongs to the item above.
        if (lines[j]!.trim() && /^\s{2,}/.test(lines[j]!) && items.length) {
          items[items.length - 1]!.push({ t: 'text', v: ' ' }, ...inline(lines[j]!.trim()));
          continue;
        }
        break;
      }
      out.push(ordered ? { t: 'ol', items, start } : { t: 'ul', items });
      i = j - 1;
      continue;
    }
    // Headings are shown as bold lines (answers are short; no big type in a chat bubble).
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ t: 'p', c: [{ t: 'strong', c: inline(h[1]!) }] }); continue; }
    para.push(line);
  }
  flush();
  return out;
}

function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((l, i) => {
    if (i) out.push({ t: 'br' });
    out.push(...inline(l.trim()));
  });
  return out;
}

/** Inline formatting. Unclosed markers stay as the characters typed. */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const push = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) { push(); out.push({ t: 'code', v: s.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (ch === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) { push(); out.push({ t: 'strong', c: inline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if ((ch === '*' || ch === '_') && s[i + 1] !== ch && s[i + 1] !== ' ') {
      const end = s.indexOf(ch, i + 1);
      // `_` only as emphasis at word edges, so snake_case and file_names stay intact.
      const edge = ch === '*' || ((i === 0 || /\W/.test(s[i - 1]!)) && (end + 1 >= s.length || /\W/.test(s[end + 1]!)));
      if (end > i + 1 && s[end - 1] !== ' ' && edge) { push(); out.push({ t: 'em', c: inline(s.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    if (ch === '[') {
      const close = s.indexOf('](', i + 1);
      const end = close === -1 ? -1 : s.indexOf(')', close + 2);
      if (close > i && end > close) {
        const label = s.slice(i + 1, close);
        const href = safeHref(s.slice(close + 2, end));
        push();
        if (href) out.push({ t: 'link', href, c: inline(label) });
        else out.push(...inline(label));
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  push();
  return out;
}

/** Plain text of an answer (for copying, screen-reader summaries and tests). */
export function plainText(blocks: Block[]): string {
  const flat = (c: Inline[]): string => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : x.t === 'br' ? '\n' : flat(x.c))).join('');
  return blocks.map((b) => (b.t === 'p' ? flat(b.c) : b.t === 'table' ? [b.head, ...b.rows].map((r) => r.map(flat).join(' | ')).join('\n') : b.items.map((it, k) => `${b.t === 'ol' ? `${b.start + k}.` : '-'} ${flat(it)}`).join('\n'))).join('\n\n');
}
