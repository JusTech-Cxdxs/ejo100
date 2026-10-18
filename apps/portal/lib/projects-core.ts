/**
 * Project rules that need no database: the project's status machine,
 * delivery progress across its deliverables, and milestone urgency.
 * Relative imports only (unit tests compile this file directly).
 */

export type ProjectStatus = 'TENDER' | 'AWARDED' | 'IN_PROGRESS' | 'DELIVERED' | 'ACCEPTED' | 'CLOSED' | 'LOST';
export type ProjectKind = 'GOVERNMENT' | 'CORPORATE' | 'EDUCATION' | 'NGO';

export const PROJECT_STATUSES: ProjectStatus[] = ['TENDER', 'AWARDED', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'CLOSED', 'LOST'];

/** TENDER → AWARDED → IN_PROGRESS → DELIVERED → ACCEPTED → CLOSED, or LOST while still a tender. */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  TENDER: ['AWARDED', 'LOST'],
  AWARDED: ['IN_PROGRESS', 'LOST'],
  IN_PROGRESS: ['DELIVERED'],
  DELIVERED: ['ACCEPTED'],
  ACCEPTED: ['CLOSED'],
  CLOSED: [],
  LOST: [],
};

export function canMoveProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return (PROJECT_TRANSITIONS[from] ?? []).includes(to);
}

export function nextProjectStatuses(from: ProjectStatus): ProjectStatus[] {
  return PROJECT_TRANSITIONS[from] ?? [];
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  TENDER: 'Tender',
  AWARDED: 'Awarded',
  IN_PROGRESS: 'In progress',
  DELIVERED: 'Delivered',
  ACCEPTED: 'Accepted',
  CLOSED: 'Closed',
  LOST: 'Lost',
};

export const PROJECT_MOVE_LABEL: Record<ProjectStatus, string> = {
  TENDER: 'Back to tender',
  AWARDED: 'Mark as awarded',
  IN_PROGRESS: 'Start delivery',
  DELIVERED: 'Mark as delivered',
  ACCEPTED: 'Record acceptance',
  CLOSED: 'Close the project',
  LOST: 'Mark as lost',
};

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = { GOVERNMENT: 'Government', CORPORATE: 'Corporate', EDUCATION: 'Education', NGO: 'NGO / development' };

/** Live projects: awarded and being delivered (counted on the home page and in KPIs). */
export const PROJECT_LIVE_STATUSES: ProjectStatus[] = ['AWARDED', 'IN_PROGRESS', 'DELIVERED'];

// ── Delivery progress ─────────────────────────────────────────────────────

export type DeliverableRow = { quantity: number; deliveredQuantity: number; acceptedAt?: Date | string | null };

/** Units delivered against units contracted, as a whole percentage (0 when nothing is contracted). */
export function deliveryProgress(rows: DeliverableRow[]): { ordered: number; delivered: number; percent: number; accepted: number } {
  const ordered = rows.reduce((s, r) => s + Math.max(0, r.quantity), 0);
  const delivered = rows.reduce((s, r) => s + Math.min(Math.max(0, r.deliveredQuantity), Math.max(0, r.quantity)), 0);
  const accepted = rows.filter((r) => Boolean(r.acceptedAt)).length;
  return { ordered, delivered, accepted, percent: ordered === 0 ? 0 : Math.min(100, Math.round((delivered / ordered) * 100)) };
}

/** A deliverable may record at most what is still outstanding. */
export function deliveryAllowed(row: DeliverableRow, quantity: number): { ok: boolean; reason: string | null } {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: 'Enter a whole number of units delivered.' };
  const left = row.quantity - row.deliveredQuantity;
  if (quantity > left) return { ok: false, reason: left <= 0 ? 'Every unit of this deliverable has already been delivered.' : `Only ${left} ${left === 1 ? 'unit is' : 'units are'} still to be delivered.` };
  return { ok: true, reason: null };
}

/** A deliverable can be accepted once everything contracted has been delivered. */
export function canAcceptDeliverable(row: DeliverableRow): boolean {
  return !row.acceptedAt && row.quantity > 0 && row.deliveredQuantity >= row.quantity;
}

// ── Milestones ────────────────────────────────────────────────────────────

export type MilestoneState = 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING' | 'UNDATED';
export const MILESTONE_DUE_SOON_DAYS = 7;
const DAY = 86_400_000;

export function milestoneState(m: { dueDate: Date | string | null; completedAt: Date | string | null }, now: Date = new Date()): MilestoneState {
  if (m.completedAt) return 'DONE';
  if (!m.dueDate) return 'UNDATED';
  const days = (new Date(m.dueDate).getTime() - now.getTime()) / DAY;
  if (days < 0) return 'OVERDUE';
  if (days <= MILESTONE_DUE_SOON_DAYS) return 'DUE_SOON';
  return 'UPCOMING';
}

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = { DONE: 'Done', OVERDUE: 'Overdue', DUE_SOON: 'Due soon', UPCOMING: 'Upcoming', UNDATED: 'No date' };

/** Contract value counted as "awarded this year": projects awarded (or beyond) whose start falls in the year, else created in it. */
export function awardedThisYear(rows: { status: string; contractValue: number | string | { toString(): string }; startDate: Date | string | null; createdAt: Date | string }[], yearStart: Date, yearEnd: Date): number {
  let total = 0;
  for (const r of rows) {
    if (!['AWARDED', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'CLOSED'].includes(r.status)) continue;
    const at = new Date(r.startDate ?? r.createdAt).getTime();
    if (at < yearStart.getTime() || at >= yearEnd.getTime()) continue;
    total += Number(r.contractValue) || 0;
  }
  return Math.round(total * 100) / 100;
}
