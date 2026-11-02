/**
 * Exports — the list's filters, kept and described. Pure.
 *
 * An export stores only the filters it was asked for (never the data): the
 * file is built from them, for the person downloading it, each time. Only
 * known filter names are kept, each short, so an export cannot be used to
 * smuggle anything into the record or the file.
 */
import { SOURCE_OPTIONS } from '../source-filter';

export const EXPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const isExportFormat = (f: unknown): f is ExportFormat => (EXPORT_FORMATS as readonly string[]).includes(String(f));

/** Filter names a list may pass, with how they read in words. */
const LABELS: Record<string, string> = {
  q: 'Search', type: 'Vehicle category', tag: 'Tag', status: 'Status', open: 'Open jobs', portal: 'Customer portal', gaps: 'Missing details', sort: 'Sorted by',
  outcome: 'Outcome', filter: 'Showing', period: 'Period', history: 'History from before EJO', year: 'Fiscal year', customerId: 'Customer',
  lead: 'Lead time (days)', service: 'Service level', from: 'From', to: 'To', kind: 'Kind', userId: 'Person', show: 'Showing people', branch: 'Branch', role: 'Role',
  stage: 'Stage', source: 'Source', imp: 'Import', layout: 'Column names', enteredFrom: 'Entered EJO from', enteredTo: 'Entered EJO to', originalFrom: 'Original date from', originalTo: 'Original date to',
};
/** Paging and page-only flags never travel with an export (the file holds every matching record). */
const DROP = new Set(['page', 'error', 'binned', 'focus', 'prefill', 'tab', 'cursor', 'add', 'id']);
const MAX_KEYS = 24;
const MAX_LEN = 120;

/** The filters to keep: known names, text only, trimmed. */
export function cleanParams(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (DROP.has(k) || !(k in LABELS)) continue;
    const val = (Array.isArray(v) ? v[0] : v);
    if (typeof val !== 'string' && typeof val !== 'number') continue;
    // eslint-disable-next-line no-control-regex
    const s = String(val).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_LEN);
    if (s) out[k] = s;
  }
  return out;
}

const VALUE_WORDS: Record<string, Record<string, string>> = {
  type: { PASSENGER: 'Passenger', COMMERCIAL: 'Commercial' },
  history: { exclude: 'Left out (EJO only)', include: 'Included' },
  source: Object.fromEntries(SOURCE_OPTIONS.map((o) => [o.key, o.label])),
  service: { '0.9': '90%', '0.95': '95%', '0.975': '97.5%', '0.99': '99%' },
  layout: { sap: 'SAP field names', ejo: 'EJO (plain English)' },
  stage: { KIT: 'Kit arrival', LINE: 'On the line', QA: 'Quality audit', PDI: 'Pre-delivery inspection', YARD: 'In the yard', SOLD: 'Sold' },
  status: { issues: 'With open shortages or damage' },
};

/** "Search: Ade · Source: Imported from SAP" — or "Everything in the list". */
export function describeParams(params: Record<string, string>): string {
  const parts = Object.entries(params)
    .filter(([k]) => !['customerId', 'userId', 'branch', 'role'].includes(k))
    .map(([k, v]) => `${LABELS[k] ?? k}: ${VALUE_WORDS[k]?.[v] ?? (k === 'imp' ? v.toUpperCase() : v)}`);
  return parts.length ? parts.join(' · ') : 'Everything in the list';
}

/** How long an export's link works, and how many parts a person may take at once. */
export const EXPORT_LINK_HOURS = 24;
/** A part stops at a clean row boundary after this long; the next part carries on from there. */
export const PART_BUDGET_MS = 40_000;
/**
 * A part also stops after this many rows (a file people can open). Past
 * 1,048,575 rows an Excel part continues on a second sheet. EXPORT_PART_MAX_ROWS
 * is for the end-to-end tests only.
 */
export function partMaxRows(): number {
  return Math.max(1, Math.trunc(Number(process.env.EXPORT_PART_MAX_ROWS)) || 2_000_000);
}
/** A part that started this recently is still downloading (another tab, or a double click). */
export const PART_IN_FLIGHT_MS = 75_000;
/** Exports a person may start in an hour (a file of the whole customer list, a thousand times, is not a report). */
export const EXPORTS_PER_HOUR = 60;
