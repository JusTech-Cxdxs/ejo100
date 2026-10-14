/**
 * Pre-filling the Open Job Card form from an Enyo draft. Pure: builds the
 * link and reads it back, validating and clipping every value. The page then
 * checks the ids against the person's organisation (lib/enyo/prefill-server.ts)
 * and only fills the form — nothing is ever submitted for the person.
 */

export type JobCardPrefill = { customerId?: string; vehicleId?: string; complaints: string[]; mileage?: number };

export const PREFILL_MAX_COMPLAINTS = 5;
export const PREFILL_MAX_COMPLAINT_CHARS = 200;
export const PREFILL_MAX_MILEAGE = 2_000_000;

const ID = /^[a-z0-9]{20,40}$/;

/** Plain text only: no control characters, single spaces, clipped. */
export function cleanLine(v: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function jobCardPrefillHref(p: JobCardPrefill): string {
  const q = new URLSearchParams({ prefill: '1' });
  if (p.customerId && ID.test(p.customerId)) q.set('customerId', p.customerId);
  if (p.vehicleId && ID.test(p.vehicleId)) q.set('vehicleId', p.vehicleId);
  for (const c of p.complaints.map((x) => cleanLine(x, PREFILL_MAX_COMPLAINT_CHARS)).filter(Boolean).slice(0, PREFILL_MAX_COMPLAINTS)) q.append('complaint', c);
  if (p.mileage !== undefined && Number.isInteger(p.mileage) && p.mileage >= 0 && p.mileage <= PREFILL_MAX_MILEAGE) q.set('mileage', String(p.mileage));
  return `/workshop/job-cards?${q.toString()}#open-job-card`;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');
const all = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

/** The validated pre-fill from the page's query, or null when there is none. */
export function parseJobCardPrefill(sp: Raw): JobCardPrefill | null {
  if (first(sp.prefill) !== '1') return null;
  const customerId = first(sp.customerId);
  const vehicleId = first(sp.vehicleId);
  const mileageRaw = first(sp.mileage);
  const mileage = /^\d{1,7}$/.test(mileageRaw) ? Number(mileageRaw) : undefined;
  const out: JobCardPrefill = {
    complaints: all(sp.complaint).map((c) => cleanLine(c, PREFILL_MAX_COMPLAINT_CHARS)).filter(Boolean).slice(0, PREFILL_MAX_COMPLAINTS),
    ...(ID.test(customerId) ? { customerId } : {}),
    ...(ID.test(vehicleId) ? { vehicleId } : {}),
    ...(mileage !== undefined && mileage <= PREFILL_MAX_MILEAGE ? { mileage } : {}),
  };
  return out.customerId || out.complaints.length || out.mileage !== undefined ? out : null;
}
