/**
 * The training set for the Python ML phase — formatting and the
 * no-personal-data rule. Pure and tested (tests/enyo-predict.test.ts).
 *
 * A row is one finished job: what the customer complained about (with
 * anything that could identify a person removed), the vehicle's features
 * (never its plate, VIN or engine number), the final approved lines and,
 * when Enyo predicted that job, how the prediction did. No customer, staff
 * or record ids leave the system: each row gets an id that is only stable
 * inside one export.
 */
import { createHash } from 'node:crypto';
import { lineKey, type HistLine } from './lines-core';

export type DatasetLine = { type: string; key: string; label: string; quantity: number; unit_price: number | null; amount: number | null };

export type DatasetRow = {
  row_id: string;
  kind: 'JOB_CARD' | 'SERVICE';
  /** Lagos calendar day the job was opened — the time-ordered split uses it. */
  opened_on: string;
  branch_code: string | null;
  complaint_text: string;
  make: string | null;
  model: string | null;
  year: number | null;
  /** Rounded down to the nearest 5,000 km. */
  mileage_band_km: number | null;
  vehicle_type: string | null;
  lines: DatasetLine[];
  labour_total: number | null;
  /** When Enyo predicted this job (shadow or suggest mode). */
  predicted_keys: string[] | null;
  precision: number | null;
  recall: number | null;
  model_version: string | null;
};

/** Every column of a row — and nothing else ever goes out. */
export const DATASET_COLUMNS: readonly (keyof DatasetRow)[] = [
  'row_id', 'kind', 'opened_on', 'branch_code', 'complaint_text', 'make', 'model', 'year', 'mileage_band_km', 'vehicle_type',
  'lines', 'labour_total', 'predicted_keys', 'precision', 'recall', 'model_version',
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Nigerian and international phone numbers: +234 803 123 4567, 0803-123-4567, 08031234567, (01) 234 5678.
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g;
// Plates: LSR-123-XY, ABC 123 DE, KJA123AB (any case when joined or hyphenated;
// capitals only when written with spaces, so "at 50 km" is left alone), and
// test plates like E2E-001-AA.
const PLATE_JOINED = /\b[A-Z][A-Z0-9]{1,2}-?\d{2,4}-?[A-Z]{1,3}\b/gi;
const PLATE_SPACED = /\b[A-Z]{2,3} \d{2,4} [A-Z]{1,3}\b/g;
// Seventeen-character VINs.
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const URL_RE = /\bhttps?:\/\/\S+/gi;

/**
 * Removes what could identify a person from free text: email addresses,
 * phone numbers, number plates, VINs, links, and any of the given names
 * (the customer's and the staff's own names, matched as whole words).
 */
export function scrubText(text: string, names: string[] = []): string {
  let s = String(text ?? '');
  s = s.replace(URL_RE, '[link]').replace(EMAIL, '[email]').replace(VIN, (m) => (/\d/.test(m) ? '[vin]' : m)).replace(PLATE_SPACED, '[plate]').replace(PLATE_JOINED, '[plate]');
  s = s.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 7 ? '[phone]' : m));
  const parts = new Set<string>();
  for (const n of names) {
    for (const p of String(n ?? '').split(/\s+/)) {
      const w = p.replace(/[^\p{L}'-]/gu, '');
      if (w.length >= 3) parts.add(w);
    }
  }
  for (const p of [...parts].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu'), '$1[name]');
  }
  return s.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

/** A row id that cannot be traced back to the record (salted per export). */
export function opaqueId(recordId: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${recordId}`).digest('hex').slice(0, 16);
}

export function mileageBand(km: number | null | undefined): number | null {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return null;
  return Math.floor(km / 5000) * 5000;
}

/** Final lines → the dataset's shape (descriptions scrubbed as well). */
export function datasetLines(lines: HistLine[], names: string[] = []): DatasetLine[] {
  return lines.map((l) => ({
    type: l.type,
    key: lineKey(l),
    label: scrubText(l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description, names).slice(0, 200),
    quantity: l.quantity,
    unit_price: l.type === 'STORE_PART' ? null : l.unitPrice,
    amount: l.type === 'STORE_PART' ? null : l.amount,
  }));
}

/** Keeps exactly the declared columns, in order (a guard against a field slipping in). */
export function pickColumns(row: DatasetRow): DatasetRow {
  const out = {} as Record<string, unknown>;
  for (const c of DATASET_COLUMNS) out[c] = row[c];
  return out as DatasetRow;
}

export function toJsonl(rows: DatasetRow[]): string {
  return rows.map((r) => JSON.stringify(pickColumns(r))).join('\n') + (rows.length ? '\n' : '');
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  // Never let a spreadsheet run a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with one row per job; `line_keys` is the multi-label target (pipe-separated), `lines` the full JSON. */
export function toCsv(rows: DatasetRow[]): string {
  const header = [...DATASET_COLUMNS.filter((c) => c !== 'lines' && c !== 'predicted_keys'), 'line_keys', 'predicted_line_keys', 'lines'];
  const out = [header.join(',')];
  for (const r of rows.map(pickColumns)) {
    const cells = DATASET_COLUMNS.filter((c) => c !== 'lines' && c !== 'predicted_keys').map((c) => csvCell(r[c]));
    cells.push(csvCell(r.lines.map((l) => l.key).join('|')), csvCell(r.predicted_keys ? r.predicted_keys.join('|') : null), csvCell(r.lines));
    out.push(cells.join(','));
  }
  return `${out.join('\n')}\n`;
}
