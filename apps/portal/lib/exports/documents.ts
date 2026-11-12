/**
 * A4c2 — customer documents in bulk. Pure, with no Node modules (the form
 * imports it): the kinds of document, the period rules, how many go in one
 * zip, and the names of the files.
 *
 * The documents are the PDFs customers are sent — the estimate for a Job
 * Card or a Vehicle Service, and the inspection report — built from the
 * records as they stand at the moment of download, by the same code that
 * builds the copy emailed to the customer.
 */
export const DOCUMENT_KINDS = ['JOB_ESTIMATE', 'SERVICE_ESTIMATE', 'INSPECTION'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND: Record<DocumentKind, { label: string; what: string; dated: string; prefix: string }> = {
  JOB_ESTIMATE: { label: 'Job Card estimates', what: 'The estimate each customer was sent for a Job Card.', dated: 'the day the customer was sent it', prefix: 'Estimate' },
  SERVICE_ESTIMATE: { label: 'Vehicle Service estimates', what: 'The estimate each customer was sent for a Vehicle Service.', dated: 'the day the customer was sent it', prefix: 'Estimate' },
  INSPECTION: { label: 'Inspection reports', what: 'The customer’s report of each completed vehicle inspection.', dated: 'the day the inspection was completed', prefix: 'Inspection' },
};
export const isDocumentKind = (k: unknown): k is DocumentKind => typeof k === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(k);

/** Documents in one zip: each is drawn when it is downloaded, so a zip stays small enough to make in one go. */
export const DOCUMENTS_PER_ZIP = 40;
/** The longest period in one request. */
export const MAX_DAYS = 92;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A period of whole days in Lagos, first to last inclusive: real days, in order, not in the future, at most MAX_DAYS. */
export function checkPeriod(from: unknown, to: unknown, today: string): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const f = String(from ?? ''), t = String(to ?? '');
  if (!DAY.test(f) || !DAY.test(t) || Number.isNaN(Date.parse(`${f}T00:00:00Z`)) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) return { ok: false, error: 'Give the first and last day of the period.' };
  if (f > t) return { ok: false, error: 'The first day is after the last day.' };
  if (t > today) return { ok: false, error: 'The period cannot end in the future.' };
  const days = Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > MAX_DAYS) return { ok: false, error: `Choose a period of at most ${MAX_DAYS} days (this one is ${days}).` };
  return { ok: true, from: f, to: t };
}
/** The period as instants: from the start of the first day in Lagos to the start of the day after the last. */
export function periodWindow(from: string, to: string): { start: Date; end: Date } {
  return { start: new Date(`${from}T00:00:00.000+01:00`), end: new Date(new Date(`${to}T00:00:00.000+01:00`).getTime() + 86_400_000) };
}

export const partsOf = (count: number) => Math.max(1, Math.ceil(count / DOCUMENTS_PER_ZIP));

/** A document's file name inside the zip: its kind and number, safe on every system ("Estimate-JC-2026-000123.pdf"). */
export const documentFileName = (kind: DocumentKind, number: string) => `${DOCUMENT_KIND[kind].prefix}-${number.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)}.pdf`;
/** The zip's name: what, where from, the period, which part. */
export function zipFileName(kind: DocumentKind, from: string, to: string, part: number, parts: number): string {
  const what = kind === 'JOB_ESTIMATE' ? 'job-card-estimates' : kind === 'SERVICE_ESTIMATE' ? 'vehicle-service-estimates' : 'inspection-reports';
  return `EJO-${what}-${from}-to-${to}${parts > 1 ? `-part-${part}-of-${parts}` : ''}.zip`;
}
