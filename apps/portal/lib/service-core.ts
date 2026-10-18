/**
 * Service Centre rules that need no database: the service job's status
 * machine, warranty coverage worked out from the warranty rows a serial
 * carries, the cost-centre rules of the warranty ledger, and the money on a
 * paid job. Relative imports only (unit tests compile this file directly).
 */

export type ServiceJobStatus = 'OPEN' | 'ASSIGNED' | 'DIAGNOSED' | 'AWAITING_PARTS' | 'REPAIRING' | 'QA' | 'READY' | 'RETURNED' | 'CLOSED' | 'CANCELLED';
export type ServiceJobKind = 'WARRANTY' | 'PAID' | 'GOODWILL';
export type WarrantyCostCentre = 'PRODUCTION_DEFECT' | 'COMPONENT_SUPPLIER' | 'TRANSIT_DAMAGE' | 'USER_DAMAGE' | 'GOODWILL';

export const SERVICE_JOB_STATUSES: ServiceJobStatus[] = ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING', 'QA', 'READY', 'RETURNED', 'CLOSED', 'CANCELLED'];

/** Where a job may go next, by who moves it (the pages and actions enforce the "who"). */
export const SERVICE_TRANSITIONS: Record<ServiceJobStatus, ServiceJobStatus[]> = {
  OPEN: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'DIAGNOSED', 'CANCELLED'],
  DIAGNOSED: ['AWAITING_PARTS', 'REPAIRING', 'QA', 'ASSIGNED'],
  AWAITING_PARTS: ['REPAIRING', 'QA'],
  REPAIRING: ['AWAITING_PARTS', 'QA'],
  QA: ['READY', 'REPAIRING'],
  READY: ['RETURNED'],
  RETURNED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canMoveServiceJob(from: ServiceJobStatus, to: ServiceJobStatus): boolean {
  return (SERVICE_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses where the unit is still with the Service Centre. */
export const SERVICE_OPEN_STATUSES: ServiceJobStatus[] = ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING', 'QA', 'READY'];
export const isServiceJobOpen = (status: string): boolean => (SERVICE_OPEN_STATUSES as string[]).includes(status);

/** Statuses in which the assigned technician works on the job. */
export const TECHNICIAN_WORK_STATUSES: ServiceJobStatus[] = ['ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING'];

export const SERVICE_JOB_STATUS_LABEL: Record<ServiceJobStatus, string> = {
  OPEN: 'Open — to assign',
  ASSIGNED: 'Assigned',
  DIAGNOSED: 'Diagnosed',
  AWAITING_PARTS: 'Awaiting parts',
  REPAIRING: 'Repairing',
  QA: 'Quality check',
  READY: 'Ready for collection',
  RETURNED: 'Returned to customer',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const SERVICE_KIND_LABEL: Record<ServiceJobKind, string> = { WARRANTY: 'Warranty', PAID: 'Paid (out of warranty)', GOODWILL: 'Goodwill' };

export const COST_CENTRE_LABEL: Record<WarrantyCostCentre, string> = {
  PRODUCTION_DEFECT: 'Production defect (Production carries it)',
  COMPONENT_SUPPLIER: 'Component failure (recover from the supplier)',
  TRANSIT_DAMAGE: 'Transit damage (Logistics carries it)',
  USER_DAMAGE: 'User damage (not covered — the customer pays)',
  GOODWILL: 'Goodwill (Commercial carries it)',
};
export const COST_CENTRES: WarrantyCostCentre[] = ['PRODUCTION_DEFECT', 'COMPONENT_SUPPLIER', 'TRANSIT_DAMAGE', 'USER_DAMAGE', 'GOODWILL'];

// ── Warranty coverage from the rows a serial carries ─────────────────────

export type CoverageRow = { id: string; kind: string; status: string; startsAt: Date | string; endsAt: Date | string; warrantyNumber?: string };
export type CoverageState = 'COVERED' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'NONE';
export type Coverage = { state: CoverageState; covered: boolean; warranty: CoverageRow | null; daysLeft: number | null };

const DAY = 86_400_000;
export const COVERAGE_EXPIRING_SOON_DAYS = 30;

/**
 * Which PRODUCT warranty covers a serial on a given day. An ACTIVE warranty
 * whose dates include the day covers it; the latest-ending one wins when
 * several do. Otherwise the best explanation of why not: pending verification,
 * suspended, expired (the most recent), or none at all. Void and transferred
 * rows never count.
 */
export function warrantyCoverageOn(rows: CoverageRow[], on: Date = new Date()): Coverage {
  const t = on.getTime();
  const products = rows.filter((r) => r.kind === 'PRODUCT' && r.status !== 'VOID' && r.status !== 'TRANSFERRED');
  const ends = (r: CoverageRow) => new Date(r.endsAt).getTime();
  const starts = (r: CoverageRow) => new Date(r.startsAt).getTime();
  const active = products.filter((r) => r.status === 'ACTIVE' && starts(r) <= t && ends(r) >= t).sort((a, b) => ends(b) - ends(a));
  if (active[0]) {
    const daysLeft = Math.ceil((ends(active[0]) - t) / DAY);
    return { state: daysLeft <= COVERAGE_EXPIRING_SOON_DAYS ? 'EXPIRING_SOON' : 'COVERED', covered: true, warranty: active[0], daysLeft };
  }
  const pending = products.find((r) => r.status === 'PENDING_VERIFICATION' && ends(r) >= t);
  if (pending) return { state: 'PENDING_VERIFICATION', covered: false, warranty: pending, daysLeft: Math.ceil((ends(pending) - t) / DAY) };
  const suspended = products.find((r) => r.status === 'SUSPENDED' && ends(r) >= t);
  if (suspended) return { state: 'SUSPENDED', covered: false, warranty: suspended, daysLeft: Math.ceil((ends(suspended) - t) / DAY) };
  const expired = products.filter((r) => ends(r) < t).sort((a, b) => ends(b) - ends(a));
  if (expired[0]) return { state: 'EXPIRED', covered: false, warranty: expired[0], daysLeft: Math.ceil((ends(expired[0]) - t) / DAY) };
  return { state: 'NONE', covered: false, warranty: null, daysLeft: null };
}

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  COVERED: 'Under warranty',
  EXPIRING_SOON: 'Under warranty — ending soon',
  EXPIRED: 'Warranty expired',
  PENDING_VERIFICATION: 'Warranty awaiting verification',
  SUSPENDED: 'Warranty suspended',
  NONE: 'No warranty on record',
};

/** The kind of job a serial gets: covered today → warranty, otherwise paid. */
export function serviceJobKindFor(coverage: Coverage): ServiceJobKind {
  return coverage.covered ? 'WARRANTY' : 'PAID';
}

/** Warranty end date: the start plus the policy's months (end of the same day of the month). */
export function warrantyEndsAt(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

// ── Cost centres (the warranty ledger) ───────────────────────────────────

/** Whether Zinox carries the cost (user damage is charged to the customer). */
export function costCentreCarriedByZinox(cc: WarrantyCostCentre): boolean {
  return cc !== 'USER_DAMAGE';
}

/** The cost centres that make sense for a job of this kind. */
export function allowedCostCentres(kind: ServiceJobKind): WarrantyCostCentre[] {
  if (kind === 'WARRANTY') return ['PRODUCTION_DEFECT', 'COMPONENT_SUPPLIER', 'TRANSIT_DAMAGE', 'USER_DAMAGE', 'GOODWILL'];
  if (kind === 'GOODWILL') return ['GOODWILL'];
  return ['USER_DAMAGE', 'GOODWILL'];
}

/** Whether a component-supplier case should also raise a supplier claim. */
export const raisesSupplierClaim = (cc: WarrantyCostCentre): boolean => cc === 'COMPONENT_SUPPLIER';

export type LedgerRow = { costCentre: WarrantyCostCentre | string; amount: number | string | { toString(): string }; recordedAt: Date | string };

/** Totals by cost centre for a period (all rows in `rows` that fall in [from, to)). */
export function ledgerTotals(rows: LedgerRow[], from: Date, to: Date): { byCostCentre: Record<WarrantyCostCentre, number>; total: number; count: number } {
  const byCostCentre = Object.fromEntries(COST_CENTRES.map((c) => [c, 0])) as Record<WarrantyCostCentre, number>;
  let total = 0;
  let count = 0;
  for (const r of rows) {
    const at = new Date(r.recordedAt).getTime();
    if (at < from.getTime() || at >= to.getTime()) continue;
    const amount = Math.round(Number(r.amount) * 100) / 100;
    if (!Number.isFinite(amount)) continue;
    const cc = r.costCentre as WarrantyCostCentre;
    if (cc in byCostCentre) byCostCentre[cc] = Math.round((byCostCentre[cc] + amount) * 100) / 100;
    total = Math.round((total + amount) * 100) / 100;
    count += 1;
  }
  return { byCostCentre, total, count };
}

/** Start of the Lagos month / year that contains `now`. */
export function lagosMonthStart(now: Date = new Date()): Date {
  const [y, m] = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).split('-').map(Number) as [number, number];
  return new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+01:00`);
}
export function lagosYearStart(now: Date = new Date()): Date {
  const y = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 4);
  return new Date(`${y}-01-01T00:00:00+01:00`);
}

// ── Money on a paid job ──────────────────────────────────────────────────

export function paidJobBalance(quotedAmount: number | null, paidAmount: number): number {
  if (quotedAmount === null) return 0;
  return Math.max(0, Math.round((quotedAmount - paidAmount) * 100) / 100);
}

/**
 * A unit goes back to its customer when the repair passed QA and, for a paid
 * job, the quotation has been paid in full.
 */
export function canReturnUnit(job: { status: string; kind: string; quotedAmount: number | null; paidAmount: number }): { ok: boolean; reason: string | null } {
  if (job.status !== 'READY') return { ok: false, reason: 'The unit is not ready for collection yet.' };
  if (job.kind === 'PAID') {
    if (job.quotedAmount === null) return { ok: false, reason: 'Quote the repair before returning the unit.' };
    const balance = paidJobBalance(job.quotedAmount, job.paidAmount);
    if (balance > 0) return { ok: false, reason: `₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })} is still outstanding on this paid repair.` };
  }
  return { ok: true, reason: null };
}

/** QA after repair is never done by the technician who repaired the unit. */
export function canQaServiceJob(job: { status: string; technicianId: string | null }, byUserId: string): { ok: boolean; reason: string | null } {
  if (job.status !== 'QA') return { ok: false, reason: 'The job is not at the quality check step.' };
  if (job.technicianId && job.technicianId === byUserId) return { ok: false, reason: 'The technician who repaired the unit cannot pass its quality check.' };
  return { ok: true, reason: null };
}

/** The steps shown on the job page, in order. */
export const SERVICE_STEPS: { status: ServiceJobStatus; label: string }[] = [
  { status: 'OPEN', label: 'Opened' },
  { status: 'ASSIGNED', label: 'Assigned' },
  { status: 'DIAGNOSED', label: 'Diagnosed' },
  { status: 'REPAIRING', label: 'Repair' },
  { status: 'QA', label: 'Quality check' },
  { status: 'READY', label: 'Ready' },
  { status: 'RETURNED', label: 'Returned' },
];

export function serviceStepIndex(status: string): number {
  const order: ServiceJobStatus[] = ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'REPAIRING', 'QA', 'READY', 'RETURNED'];
  const s = status === 'AWAITING_PARTS' ? 'REPAIRING' : status === 'CLOSED' ? 'RETURNED' : status;
  const i = order.indexOf(s as ServiceJobStatus);
  return i === -1 ? 0 : i;
}
