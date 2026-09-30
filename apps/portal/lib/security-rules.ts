/**
 * Security rules shared by every screen, print and check — one definition
 * of "overdue", one way of saying a duration, one set of status labels.
 */
export function visitOverdueMinutes(v: { status: string; checkedInAt: Date | null; expectedDurationMinutes: number }, now: Date = new Date()): number {
  if (v.status !== 'CHECKED_IN' || !v.checkedInAt) return 0;
  const due = new Date(v.checkedInAt).getTime() + v.expectedDurationMinutes * 60000;
  return Math.max(0, Math.floor((now.getTime() - due) / 60000));
}

export function exitPassOverdueMinutes(p: { status: string; returning: boolean; expectedReturnAt: Date | null }, now: Date = new Date()): number {
  if (p.status !== 'OUT' || !p.returning || !p.expectedReturnAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(p.expectedReturnAt).getTime()) / 60000));
}

/** "45 min", "1 hr", "2 hr 5 min", "1 day 3 hr". */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h) parts.push(`${h} hr`);
  if (mm || parts.length === 0) parts.push(`${mm} min`);
  return parts.join(' ');
}

export function minutesBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export const VISIT_STATUS_LABEL: Record<string, string> = {
  EXPECTED: 'Expected',
  CHECKED_IN: 'On premises',
  CHECKED_OUT: 'Checked out',
  CANCELLED: 'Cancelled',
};

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  ON_FOOT: 'On foot',
  CAR: 'Car',
  MOTORCYCLE: 'Motorcycle',
  TRUCK: 'Truck',
  BUS: 'Bus',
  OTHER: 'Other vehicle',
};

export const EXIT_PASS_STATUS_LABEL: Record<string, string> = {
  PENDING_HEAD: 'Awaiting Department Head',
  PENDING_MANAGER: 'Awaiting Manager',
  APPROVED: 'Approved — may leave',
  OUT: 'Out',
  RETURNED: 'Returned',
  CLOSED: 'Left (no return)',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
};

export const STATUS_CHIP: Record<string, string> = {
  EXPECTED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  CHECKED_IN: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CHECKED_OUT: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  DECLINED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
  CANCELLED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  PENDING_HEAD: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  PENDING_MANAGER: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  LEFT: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  OPEN: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
  UNDER_REVIEW: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  AT_GATE: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  RECEIVED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  APPROVED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  OUT: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  RETURNED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  CLOSED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};

export function roadTestOverdueMinutes(r: { status: string; gateOutAt: Date | null; expectedDurationMinutes: number }, now: Date = new Date()): number {
  if (r.status !== 'OUT' || !r.gateOutAt) return 0;
  const due = new Date(r.gateOutAt).getTime() + r.expectedDurationMinutes * 60000;
  return Math.max(0, Math.floor((now.getTime() - due) / 60000));
}

export const ROAD_TEST_STATUS_LABEL: Record<string, string> = {
  PENDING_MANAGER: 'Awaiting Manager',
  APPROVED: 'Approved — may go out',
  OUT: 'Out on road test',
  RETURNED: 'Returned',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
};

export const INCIDENT_TYPES = [
  'Unauthorised entry attempt',
  'Visitor refused entry',
  'Lost visitor pass',
  'Employee going out without an exit pass',
  'Vehicle leaving without release',
  'Property damage',
  'Theft or loss',
  'Accident at the gate',
  'Suspicious activity',
  'Fire or safety hazard',
  'Other',
] as const;

export const SEVERITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
export const SEVERITY_CHIP: Record<string, string> = {
  LOW: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  MEDIUM: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  HIGH: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  CRITICAL: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};
export const INCIDENT_STATUS_LABEL: Record<string, string> = { OPEN: 'Open', UNDER_REVIEW: 'Under review', CLOSED: 'Closed' };
export const DELIVERY_STATUS_LABEL: Record<string, string> = { EXPECTED: 'Expected', AT_GATE: 'At the gate', RECEIVED: 'Received by Store', LEFT: 'Left', CANCELLED: 'Cancelled' };
