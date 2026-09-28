/**
 * How a Job Card or Vehicle Service ended — one rule for both history
 * pages. A cancelled Job Card that is handed back becomes CHECKED_OUT
 * just like a finished one, so the APPROVED cancellation (not the status)
 * is the source of truth for "cancelled".
 */
export type VisitOutcome = 'COMPLETED_CHECKED_OUT' | 'CANCELLED_CHECKED_OUT' | 'CANCELLED_AWAITING_HANDBACK' | 'ESCALATED' | 'IN_PROGRESS';
export type RefundState = 'REFUNDED' | 'PARTLY_REFUNDED' | 'REFUND_DUE' | 'NOTHING_PAID';

export function refundState(paid: number, refunded: number): RefundState {
  if (paid <= 0) return 'NOTHING_PAID';
  if (refunded <= 0) return 'REFUND_DUE';
  if (refunded + 0.005 < paid) return 'PARTLY_REFUNDED';
  return 'REFUNDED';
}

export function jobCardOutcome(jc: { status: string; checkedOutAt: Date | null; hasApprovedCancellation: boolean }): VisitOutcome {
  const cancelled = jc.status === 'CANCELLED' || jc.hasApprovedCancellation;
  if (cancelled) return jc.status === 'CHECKED_OUT' || jc.checkedOutAt ? 'CANCELLED_CHECKED_OUT' : 'CANCELLED_AWAITING_HANDBACK';
  if (jc.status === 'CHECKED_OUT') return 'COMPLETED_CHECKED_OUT';
  return 'IN_PROGRESS';
}

export function vehicleServiceOutcome(vs: { status: string; collectedAt: Date | null; escalated: boolean }): VisitOutcome {
  if (vs.status === 'ESCALATED' || vs.escalated) return 'ESCALATED';
  if (vs.status === 'CANCELLED') return vs.collectedAt ? 'CANCELLED_CHECKED_OUT' : 'CANCELLED_AWAITING_HANDBACK';
  if (vs.status === 'COLLECTED') return 'COMPLETED_CHECKED_OUT';
  return 'IN_PROGRESS';
}

export type OutcomeFilter = 'completed' | 'cancelled' | 'cancelled_refunded' | 'cancelled_not_refunded' | 'cancelled_awaiting';

export const OUTCOME_FILTERS: { key: OutcomeFilter; label: string }[] = [
  { key: 'completed', label: 'Completed → checked out' },
  { key: 'cancelled', label: 'Cancelled → checked out' },
  { key: 'cancelled_refunded', label: 'Cancelled — refunded' },
  { key: 'cancelled_not_refunded', label: 'Cancelled — not refunded' },
  { key: 'cancelled_awaiting', label: 'Cancelled — awaiting hand-back' },
];

export function matchesOutcomeFilter(filter: OutcomeFilter, outcome: VisitOutcome, refund: RefundState): boolean {
  switch (filter) {
    case 'completed':
      return outcome === 'COMPLETED_CHECKED_OUT';
    case 'cancelled':
      return outcome === 'CANCELLED_CHECKED_OUT';
    case 'cancelled_refunded':
      return (outcome === 'CANCELLED_CHECKED_OUT' || outcome === 'CANCELLED_AWAITING_HANDBACK') && (refund === 'REFUNDED' || refund === 'PARTLY_REFUNDED');
    case 'cancelled_not_refunded':
      return (outcome === 'CANCELLED_CHECKED_OUT' || outcome === 'CANCELLED_AWAITING_HANDBACK') && (refund === 'REFUND_DUE' || refund === 'NOTHING_PAID');
    case 'cancelled_awaiting':
      return outcome === 'CANCELLED_AWAITING_HANDBACK';
  }
}

export function parseOutcomeFilter(v: string | undefined): OutcomeFilter | undefined {
  return OUTCOME_FILTERS.some((f) => f.key === v) ? (v as OutcomeFilter) : undefined;
}

/** Badge text and colour for a finished visit (null while still active). */
export function outcomeBadge(outcome: VisitOutcome, refund: RefundState): { label: string; className: string } | null {
  if (outcome === 'COMPLETED_CHECKED_OUT') return { label: 'Completed → checked out', className: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' };
  if (outcome === 'ESCALATED') return { label: 'Escalated to Job Card', className: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]' };
  if (outcome === 'IN_PROGRESS') return null;
  const where = outcome === 'CANCELLED_CHECKED_OUT' ? 'Cancelled → checked out' : 'Cancelled — awaiting hand-back';
  const money =
    refund === 'REFUNDED' ? 'refunded' : refund === 'PARTLY_REFUNDED' ? 'partly refunded' : refund === 'REFUND_DUE' ? 'refund due' : 'nothing paid';
  const tone =
    refund === 'REFUND_DUE' || refund === 'PARTLY_REFUNDED'
      ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
      : refund === 'REFUNDED'
        ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
        : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]';
  return { label: `${where} · ${money}`, className: tone };
}
