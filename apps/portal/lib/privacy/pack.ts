/**
 * A4c1 — the files of a customer's copy (server only: Node's crypto and the
 * zip): each section as CSV for a spreadsheet, data.json for another system,
 * the README, and the zip with its SHA-256. The labels and rules the pages
 * share are in ./requests (no Node modules, so the forms can import them).
 */
import { zipSync, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { safeText } from '../exports/format';
import type { Plain } from './requests';

// ── The files ───────────────────────────────────────────────────────────────

const cell = (v: Plain): string => {
  if (v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${safeText(s).replace(/"/g, '""')}"`;
};
/** A section as CSV (UTF-8 with its mark, so Excel reads Naira and accents): the union of the records' fields as the header, in first-seen order. */
export function sectionCsv(rows: Record<string, Plain>[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const lines = [cols.map((c) => cell(c)).join(','), ...rows.map((r) => cols.map((c) => cell(r[c] ?? null)).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export type Section = { file: string; title: string; rows: Record<string, Plain>[] };

export function readme(p: { number: string; organisation: string; customerName: string; madeAt: Date; sections: Section[] }): string {
  const day = p.madeAt.toISOString().replace('T', ' ').slice(0, 16);
  return [
    `A copy of your data — ${p.organisation}`,
    '='.repeat(60),
    '',
    `For: ${p.customerName}`,
    `Request: ${p.number}`,
    `Made: ${day} UTC, from the records as they were at that moment.`,
    '',
    'What is in it',
    '-------------',
    'Everything our records system (EJO) holds about you, record by record:',
    '',
    ...p.sections.map((s) => `  ${s.file.padEnd(34)} ${String(s.rows.length).padStart(6)}  ${s.title}`),
    '',
    'Each .csv file opens in Excel, Google Sheets or Numbers. data.json holds the',
    'same records in one file, for another system to read (dates in UTC, ISO 8601;',
    'amounts in Naira exactly as recorded). Records refer to each other by their',
    '"id" (a payment\'s jobCardId is the id of its job card).',
    '',
    'What is not in it',
    '-----------------',
    '- Who among our staff handled each record, and our internal keys: they are',
    '  about other people, or about our systems, not about you.',
    '- Passwords and sign-in tokens: never given out, to anyone.',
    '- Technical logs (error reports) that happen to carry your account.',
    '',
    'Questions, or something is wrong? Reply to the message this came with, quoting',
    `${p.number}. You may also ask us to correct or erase your data, or to stop`,
    'using it for a purpose; some records (invoices, payments, warranties) we must',
    'keep for as long as the law requires.',
    '',
  ].join('\r\n');
}

/**
 * The zip: README.txt, one CSV per section, data.json. Every entry dated the
 * moment it was made, so its SHA-256 identifies exactly what was given.
 */
export function packZip(p: { number: string; organisation: string; customerName: string; madeAt: Date; sections: Section[] }): { bytes: Uint8Array; checksum: string } {
  const mtime = p.madeAt;
  const files: Record<string, [Uint8Array, { mtime: Date }]> = {
    'README.txt': [strToU8(readme(p)), { mtime }],
  };
  for (const s of p.sections) files[s.file] = [strToU8(sectionCsv(s.rows)), { mtime }];
  files['data.json'] = [strToU8(JSON.stringify({ request: p.number, organisation: p.organisation, madeAt: p.madeAt.toISOString(), sections: Object.fromEntries(p.sections.map((s) => [s.file.replace(/\.csv$/, ''), s.rows])) }, null, 2)), { mtime }];
  const bytes = zipSync(files, { level: 6 });
  return { bytes, checksum: createHash('sha256').update(bytes).digest('hex') };
}

export const packFileName = (number: string, madeAt: Date) => `EJO-data-copy-${number}-${madeAt.toISOString().slice(0, 10)}.zip`;
