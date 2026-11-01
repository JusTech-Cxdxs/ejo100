/**
 * "Where it came from" and "when" filters for the lists (customers,
 * vehicles, parts, suppliers). Pure: parsed from the page's address, applied
 * in the database by the list's own action.
 *
 *  • Source: created in EJO 100 / imported from SAP / imported from a
 *    spreadsheet (an old system) — by the import that created the record.
 *  • Import: one import, by its number (IMP-2026-000012).
 *  • Date entered EJO: when the record was created or imported.
 *  • Original date: when it began in the other system (a customer's
 *    "customer since", from SAP's ERDAT) — on lists that have one.
 * Dates are Lagos calendar days, both ends included.
 */

export type SourceKey = 'all' | 'ejo' | 'sap' | 'legacy';
export const SOURCE_OPTIONS: { key: SourceKey; label: string }[] = [
  { key: 'all', label: 'Any source' },
  { key: 'ejo', label: 'Created in EJO' },
  { key: 'sap', label: 'Imported from SAP' },
  { key: 'legacy', label: 'Imported from a spreadsheet' },
];

export type SourceFilter = {
  source: SourceKey;
  /** An import number as typed, normalised ("IMP-2026-000012"), or null. */
  imp: string | null;
  enteredFrom: Date | null;
  enteredTo: Date | null;
  originalFrom: Date | null;
  originalTo: Date | null;
};

export const SOURCE_PARAMS = ['source', 'imp', 'enteredFrom', 'enteredTo', 'originalFrom', 'originalTo'] as const;

const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
/** "2026-03-14" → the start of that Lagos day (or, for `end`, the start of the next day: an exclusive bound). */
export function lagosDayBound(v: string | undefined | null, end = false): Date | null {
  const m = ymd.exec(String(v ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+01:00`);
  if (Number.isNaN(d.getTime())) return null;
  return end ? new Date(+d + 86_400_000) : d;
}
/** The same, as a date-only value (for date columns such as "customer since"). */
export function dayBound(v: string | undefined | null, end = false): Date | null {
  const m = ymd.exec(String(v ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return end ? new Date(+d + 86_400_000) : d;
}

/** "imp 2026 12", "IMP-2026-000012", "imp-2026-12" → "IMP-2026-000012". */
export function normaliseImportNumber(v: string | undefined | null): string | null {
  const m = /^\s*imp[\s\-_]*(\d{4})[\s\-_]*(\d{1,6})\s*$/i.exec(String(v ?? ''));
  return m ? `IMP-${m[1]}-${m[2]!.padStart(6, '0')}` : null;
}

export function parseSourceFilter(sp: Partial<Record<(typeof SOURCE_PARAMS)[number], string | undefined>>): SourceFilter {
  const source = SOURCE_OPTIONS.some((o) => o.key === sp.source) ? (sp.source as SourceKey) : 'all';
  return {
    source,
    imp: normaliseImportNumber(sp.imp),
    enteredFrom: lagosDayBound(sp.enteredFrom),
    enteredTo: lagosDayBound(sp.enteredTo, true),
    originalFrom: dayBound(sp.originalFrom),
    originalTo: dayBound(sp.originalTo, true),
  };
}

export function isFiltered(f: SourceFilter): boolean {
  return f.source !== 'all' || Boolean(f.imp || f.enteredFrom || f.enteredTo || f.originalFrom || f.originalTo);
}

/**
 * The Prisma condition for a record type that has importJobId and createdAt:
 * `importIds` are the organisation's imports of the chosen source (sap /
 * legacy) or the one import asked for (imp); null when not needed.
 */
export function sourceWhere(f: SourceFilter, importIds: { bySource: string[] | null; byNumber: string[] | null }): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (f.source === 'ejo') and.push({ importJobId: null });
  if ((f.source === 'sap' || f.source === 'legacy') && importIds.bySource) and.push({ importJobId: { in: importIds.bySource } });
  if (f.imp && importIds.byNumber) and.push({ importJobId: { in: importIds.byNumber } });
  if (f.enteredFrom || f.enteredTo) and.push({ createdAt: { ...(f.enteredFrom ? { gte: f.enteredFrom } : {}), ...(f.enteredTo ? { lt: f.enteredTo } : {}) } });
  return and.length ? { AND: and } : {};
}

/** The same filter on rows already loaded (the CRM list filters in memory). */
export function matchesSource(r: { importJobId: string | null; createdAt: Date; original?: Date | null }, f: SourceFilter, importIds: { bySource: Set<string> | null; byNumber: Set<string> | null }): boolean {
  if (f.source === 'ejo' && r.importJobId) return false;
  if ((f.source === 'sap' || f.source === 'legacy') && (!r.importJobId || !importIds.bySource?.has(r.importJobId))) return false;
  if (f.imp && (!r.importJobId || !importIds.byNumber?.has(r.importJobId))) return false;
  if (f.enteredFrom && +r.createdAt < +f.enteredFrom) return false;
  if (f.enteredTo && +r.createdAt >= +f.enteredTo) return false;
  if (f.originalFrom || f.originalTo) {
    if (!r.original) return false;
    if (f.originalFrom && +r.original < +f.originalFrom) return false;
    if (f.originalTo && +r.original >= +f.originalTo) return false;
  }
  return true;
}
