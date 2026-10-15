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
  /** v32, for the Python trainer: the complaint's words as the portal tokenises them (from the scrubbed text). */
  complaint_tokens: string[];
  /** The job's context as tokens (kind, make, model family, age band, mileage band, vehicle type, branch, department). */
  feature_tokens: string[];
  /** Counts about the work (lines of each type, part quantities, complaint length): ml/features-core.ts workNumbers. */
  work_numbers: Record<string, number>;
  /** Hours from opening to ready for collection (or completion); null when not finished. */
  turnaround_hours: number | null;
};

/** Every column of a row — and nothing else ever goes out. */
export const DATASET_COLUMNS: readonly (keyof DatasetRow)[] = [
  'row_id', 'kind', 'opened_on', 'branch_code', 'complaint_text', 'make', 'model', 'year', 'mileage_band_km', 'vehicle_type',
  'lines', 'labour_total', 'predicted_keys', 'precision', 'recall', 'model_version',
  'complaint_tokens', 'feature_tokens', 'work_numbers', 'turnaround_hours',
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
    // The key from the scrubbed description too: it goes into trained models.
    key: lineKey({ ...l, description: scrubText(l.description, names) }),
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
const CSV_PLAIN = DATASET_COLUMNS.filter((c) => c !== 'lines' && c !== 'predicted_keys');

export function toCsv(rows: DatasetRow[]): string {
  const header = [...CSV_PLAIN, 'line_keys', 'predicted_line_keys', 'lines'];
  const out = [header.join(',')];
  for (const r of rows.map(pickColumns)) {
    const cells = CSV_PLAIN.map((c) => csvCell(Array.isArray(r[c]) ? (r[c] as string[]).join(' ') : r[c]));
    cells.push(csvCell(r.lines.map((l) => l.key).join('|')), csvCell(r.predicted_keys ? r.predicted_keys.join('|') : null), csvCell(r.lines));
    out.push(cells.join(','));
  }
  return `${out.join('\n')}\n`;
}

/** Hours between opening and ready, two decimals; null unless the end exists and follows the start (at most 180 days). */
export function turnaroundHours(openedAt: Date, readyAt: Date | null | undefined): number | null {
  if (!readyAt) return null;
  const h = (readyAt.getTime() - openedAt.getTime()) / 3_600_000;
  return h > 0 && h <= 24 * 180 ? Math.round(h * 100) / 100 : null;
}

// ------------------------------------------------------------ data quality
//
// Models are only as good as what they learn from. Before any row leaves for
// training (or the CSV export), rows that would teach the wrong thing are
// dropped, and impossible values are blanked. Test data typed while the
// system was being tried out ("test", "asdf", "hello") is the commonest case;
// the organisation's "learn from" date (Settings → Enyo) removes the rest.

/** Placeholder words a person types when trying a form out. */
const PLACEHOLDER = new Set(['test', 'tests', 'testing', 'tested', 'demo', 'sample', 'dummy', 'example', 'asdf', 'qwerty', 'lorem', 'ipsum', 'abc', 'abcd', 'xyz', 'hello', 'hi', 'hey', 'ok', 'okay', 'nil', 'none', 'na', 'nothing', 'blah', 'foo', 'bar', 'trial', 'check', 'checking', 'something', 'stuff', 'whatever', 'random', 'fake', 'temp', 'tmp']);
const SCRUB_MARK = /\[(?:name|email|phone|plate|vin|link)\]/g;

/** A keyboard-mash word: a long run of consonants, one letter repeated, or a keyboard row. */
export function isMash(word: string): boolean {
  const w = word.toLowerCase();
  if (w.length < 4) return false;
  if (/(.)\1{3,}/u.test(w)) return true;
  if (/^[a-z]+$/.test(w) && !/[aeiouy]/.test(w)) return true;
  if (/[bcdfghjklmnpqrstvwxz]{6,}/.test(w)) return true;
  return /^(?:qwer|wert|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|jkl|uiop)/.test(w) && w.length <= 10;
}

/** 'ok', 'empty' (no words) or 'junk' (placeholder or keyboard mash) for a complaint, after scrubbing. */
export function complaintQuality(text: string): 'ok' | 'empty' | 'junk' {
  const words = String(text ?? '').replace(SCRUB_MARK, ' ').toLowerCase().match(/\p{L}+/gu) ?? [];
  if (!words.length) return 'empty';
  const real = words.filter((w) => !PLACEHOLDER.has(w) && !isMash(w) && w.length >= 2);
  if (!real.length) return 'junk';
  // Mostly mash with a stray real word ("asdfgh ok brake qwerty") is still junk.
  const mash = words.filter(isMash).length;
  if (mash >= 2 && mash / words.length > 0.5) return 'junk';
  if (real.join('').length < 3) return 'junk';
  return 'ok';
}

/** A model year a vehicle can have; anything else is a typing slip and is blanked. */
export function plausibleYear(year: number | null | undefined, now = new Date()): number | null {
  if (year === null || year === undefined || !Number.isInteger(year)) return null;
  return year >= 1950 && year <= now.getUTCFullYear() + 1 ? year : null;
}

/** Shortest believable time from opening to ready (anything quicker was a test or a slip). */
export const MIN_TURNAROUND_HOURS = 0.5;

function badLine(l: DatasetLine): boolean {
  if (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 10_000) return true;
  if (l.unit_price !== null && (!Number.isFinite(l.unit_price) || l.unit_price < 0 || l.unit_price > 50_000_000)) return true;
  if (l.amount !== null && (!Number.isFinite(l.amount) || l.amount < 0 || l.amount > 500_000_000)) return true;
  return !l.key || !l.label.replace(SCRUB_MARK, '').trim();
}

export type QualityReport = {
  examined: number;
  kept: number;
  /** Rows left out, by reason. */
  dropped: { no_complaint: number; test_or_junk_text: number; impossible_line: number; duplicate: number };
  /** Values blanked in rows that were kept, by reason. */
  blanked: { turnaround_too_short: number };
};

/**
 * The rows worth learning from, and what was left out and why. Keeps order.
 * Duplicates: the same complaint, vehicle, day and lines (a record saved
 * twice, or the same test repeated) count once.
 */
export function qualityFilter(rows: DatasetRow[]): { rows: DatasetRow[]; report: QualityReport } {
  const report: QualityReport = { examined: rows.length, kept: 0, dropped: { no_complaint: 0, test_or_junk_text: 0, impossible_line: 0, duplicate: 0 }, blanked: { turnaround_too_short: 0 } };
  const seen = new Set<string>();
  const out: DatasetRow[] = [];
  for (const r of rows) {
    const q = complaintQuality(r.complaint_text);
    if (q === 'empty') { report.dropped.no_complaint += 1; continue; }
    if (q === 'junk') { report.dropped.test_or_junk_text += 1; continue; }
    if (!r.lines.length || r.lines.some(badLine)) { report.dropped.impossible_line += 1; continue; }
    const sig = JSON.stringify([r.opened_on, r.kind, r.complaint_text.toLowerCase(), r.make, r.model, r.lines.map((l) => `${l.key}:${l.quantity}`).sort()]);
    if (seen.has(sig)) { report.dropped.duplicate += 1; continue; }
    seen.add(sig);
    if (r.turnaround_hours !== null && r.turnaround_hours < MIN_TURNAROUND_HOURS) {
      report.blanked.turnaround_too_short += 1;
      out.push({ ...r, turnaround_hours: null });
    } else out.push(r);
  }
  report.kept = out.length;
  return { rows: out, report };
}
