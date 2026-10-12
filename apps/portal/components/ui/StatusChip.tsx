import type { ReactNode } from 'react';
import type { Tone } from './tones';

/**
 * ONE status → colour rule for the whole portal:
 *   green  done / good          (completed, approved, released, active, paid…)
 *   amber  waiting / attention  (pending, awaiting…, due soon, submitted…)
 *   red    problem / stopped    (cancelled, rejected, overdue, failed…)
 *   blue   in progress / info   (checked in, in progress, in service…)
 *   grey   closed / archived    (closed, checked out, expired…)
 */
const EXACT: Record<string, Tone> = {
  COMPLETED: 'success', READY_FOR_COLLECTION: 'success', APPROVED: 'success', RELEASED: 'success', ACTIVE: 'success', PAID: 'success',
  SETTLED: 'success', RECEIVED: 'success', CLEARED: 'success', ON_TRACK: 'success', DONE: 'success', ISSUED: 'success', PASSED: 'success',
  FULFILLED: 'success', CONFIRMED: 'success', RESOLVED: 'success', ACCEPTED: 'success', RETURNED: 'success', COLLECTED: 'success', HEALTHY: 'success',
  REPAIRED: 'success', REPLACED: 'success', REIMBURSED: 'success', SIGNED_IN: 'success', ON_PREMISES: 'info', INSIDE: 'info', OUT: 'info',
  CHECKED_IN: 'info', IN_PROGRESS: 'info', IN_SERVICE: 'info', OPEN: 'info', BOOKED: 'info', SCHEDULED: 'info', DRAFT: 'neutral', NEW: 'info',
  ON_ROAD_TEST: 'info', IN_TRANSIT: 'info', ORDERED: 'info', ARRIVED: 'info', PARTIAL: 'warning', PARTIALLY_RELEASED: 'warning', PARTIALLY_PAID: 'warning',
  QUALITY_CHECK: 'warning', SUBMITTED: 'warning', DUE_SOON: 'warning', ON_HOLD: 'warning', ESCALATED: 'warning', REQUESTED: 'warning', UNPAID: 'warning',
  CANCELLED: 'error', CANCELED: 'error', REJECTED: 'error', DECLINED: 'error', OVERDUE: 'error', FAILED: 'error', VOID: 'error', VOIDED: 'error',
  DENIED: 'error', LOST: 'error', DEAD: 'neutral', OUT_OF_STOCK: 'error', CRITICAL: 'error', REFUSED: 'error', NO_SHOW: 'error',
  CLOSED: 'neutral', CHECKED_OUT: 'neutral', EXPIRED: 'neutral', ARCHIVED: 'neutral', INACTIVE: 'neutral', ENDED: 'neutral', LEFT: 'neutral',
  SIGNED_OUT: 'neutral', STOPPED: 'neutral', SUPERSEDED: 'neutral', WITHDRAWN: 'neutral',
  IN_STOCK: 'success', DISBURSED: 'success', MANAGER_APPROVED: 'success', COVERED: 'success', LIVE: 'success',
  PARTIALLY_ACCEPTED: 'warning', APPROVED_TO_SUBMIT: 'warning', AT_GATE: 'warning', UNDER_REVIEW: 'warning', SUSPENDED: 'warning', EXPIRING_SOON: 'warning',
  EXPECTED: 'info', NOT_STARTED: 'neutral', SKIPPED: 'neutral', DISMISSED: 'neutral', TRANSFERRED: 'neutral', REVOKED: 'error',
};

export function statusTone(status: string | null | undefined): Tone {
  const s = (status ?? '').toUpperCase().replace(/[\s-]+/g, '_');
  if (EXACT[s]) return EXACT[s]!;
  if (/CANCEL|REJECT|DECLIN|OVERDUE|FAIL|DENI|REFUS/.test(s)) return 'error';
  if (/AWAIT|PENDING|WAIT|DUE|REVIEW|HOLD|REQUEST/.test(s)) return 'warning';
  if (/COMPLET|APPROV|RELEAS|DONE|PAID|SETTL|ACTIVE|READY/.test(s)) return 'success';
  if (/CLOSED|EXPIR|ARCHIV|INACTIVE|CHECKED_OUT/.test(s)) return 'neutral';
  return 'info';
}

export const humanStatus = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const CHIP: Record<Tone, string> = {
  brand: 'bg-[var(--ejo-primary)]/12 text-[var(--ejo-primary)] ring-[var(--ejo-primary)]/25',
  success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)] ring-[var(--ejo-success)]/25',
  warning: 'bg-[var(--ejo-warning)]/14 text-[var(--ejo-warning-text)] ring-[var(--ejo-warning)]/30',
  error: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)] ring-[var(--ejo-error)]/25',
  info: 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)] ring-[var(--ejo-info)]/25',
  neutral: 'bg-[var(--ejo-text-muted)]/12 text-[var(--ejo-text-muted)] ring-[var(--ejo-text-muted)]/20',
};
const DOT: Record<Tone, string> = {
  brand: 'bg-[var(--ejo-primary)]', success: 'bg-[var(--ejo-success)]', warning: 'bg-[var(--ejo-warning)]',
  error: 'bg-[var(--ejo-error)]', info: 'bg-[var(--ejo-info)]', neutral: 'bg-[var(--ejo-text-muted)]',
};

/** A status pill with a coloured dot. Pass the raw status; `label` overrides the words, `tone` the colour. */
export function StatusChip({ status, label, tone, className = '', children }: { status?: string | null; label?: ReactNode; tone?: Tone; className?: string; children?: ReactNode }) {
  const t = tone ?? statusTone(status);
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CHIP[t]} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[t]}`} aria-hidden="true" />
      <span className="truncate">{children ?? label ?? (status ? humanStatus(status) : '—')}</span>
    </span>
  );
}
