/**
 * The features every learning model sees, computed ONE way for training and
 * for use. The training export (predict/dataset.ts) writes these tokens and
 * numbers into each row; the Python trainer (ml/) only reads them; the portal
 * computes them again with this same code when it asks a model. So training
 * and use can never drift apart.
 *
 * Pure: no database, no framework imports (unit-tested in tests/enyo-ml.test.ts).
 */
import { modelFamily, normaliseText, tokenise } from '../predict/text';

export type JobFacts = {
  kind: 'JOB_CARD' | 'SERVICE';
  complaint: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileageKm: number | null;
  vehicleType: string | null;
  branchCode: string | null;
  department: string | null;
  /** When the job was opened (for the vehicle's age). */
  openedAt: Date;
};

export type LineFacts = { type: string; key: string; quantity: number };

const slug = (s: string | null | undefined) => normaliseText(s ?? '').replace(/ /g, '_').slice(0, 40);

/** Vehicle age in bands (0-2, 3-5, 6-10, 11-15, 16+ years). */
export function ageBand(year: number | null, at: Date): string | null {
  if (!year || !Number.isFinite(year)) return null;
  const age = at.getUTCFullYear() - year;
  if (age < 0 || age > 80) return null;
  return age <= 2 ? '0_2' : age <= 5 ? '3_5' : age <= 10 ? '6_10' : age <= 15 ? '11_15' : '16_plus';
}

/** Mileage in bands of 25,000 km, capped at 300,000+. */
export function mileageToken(km: number | null): string | null {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return null;
  return String(Math.min(300_000, Math.floor(km / 25_000) * 25_000));
}

/** "make:toyota", "family:hilux", "kind:service", ... — the job's context as words the models can weigh. */
export function featureTokens(f: JobFacts): string[] {
  const out = [`kind:${f.kind === 'SERVICE' ? 'service' : 'job'}`];
  const make = slug(f.make);
  if (make) out.push(`make:${make}`);
  const family = modelFamily(f.model);
  if (family) out.push(`family:${make ? `${make}_` : ''}${family}`);
  const age = ageBand(f.year, f.openedAt);
  if (age) out.push(`age:${age}`);
  const km = mileageToken(f.mileageKm);
  if (km) out.push(`km:${km}`);
  const type = slug(f.vehicleType);
  if (type) out.push(`vtype:${type}`);
  const branch = slug(f.branchCode);
  if (branch) out.push(`branch:${branch}`);
  const dept = slug(f.department);
  if (dept) out.push(`dept:${dept}`);
  return out;
}

/** The complaint's words (the same tokeniser as the look-alike search). */
export function complaintTokens(text: string): string[] {
  return tokenise(text);
}

/** The approved lines as words: "line:<key>". Keys are already normalised (predict/lines-core.ts lineKey). */
export function lineTokens(lines: LineFacts[]): string[] {
  return [...new Set(lines.map((l) => `line:${l.key}`.slice(0, 120)))];
}

export const LINE_TYPES = ['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'] as const;

/** Numbers about the work itself: lines of each type, quantities, how many complaints. */
export function workNumbers(complaint: string, lines: LineFacts[]): Record<string, number> {
  const out: Record<string, number> = { complaint_words: tokenise(complaint).length, lines_total: lines.length };
  for (const t of LINE_TYPES) out[`lines_${t.toLowerCase()}`] = lines.filter((l) => l.type === t).length;
  out.parts_quantity = lines.filter((l) => l.type === 'STORE_PART' || l.type === 'EXTERNAL_PART').reduce((s, l) => s + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
  return out;
}
