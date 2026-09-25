import { workingDaysBetween } from '@/lib/utils/working-days';

/**
 * The two working-day figures shown for every Job Card / Vehicle Service
 * — time in custody and time "In Service" — computed by ONE rule for the
 * detail page, the dashboards and every print, so they always agree.
 *
 * In Service runs from when work started to whatever GENUINELY ended the
 * work — whichever happened first of:
 *   • completed (work signed off),
 *   • cancellation approved (work stopped),
 *   • checked out (the vehicle left).
 * It is only "so far" (still counting) while none of those has happened.
 * A job that never started work has no In Service figure at all. Figures
 * are never negative (status overrides can record events out of order).
 *
 * Custody runs from check-in to check-out (or still counting).
 */
export type VisitDurations = {
  custody: { days: number; final: boolean };
  inService: { days: number; final: boolean; endedBy: 'COMPLETED' | 'CANCELLED' | 'CHECKED_OUT' | null } | null;
};

export function visitDurations(v: {
  checkedInAt: Date;
  workStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  checkedOutAt: Date | null;
  now?: Date;
}): VisitDurations {
  const now = v.now ?? new Date();
  const custodyEnd = v.checkedOutAt ?? now;
  const custody = { days: Math.max(0, workingDaysBetween(new Date(v.checkedInAt), new Date(custodyEnd))), final: Boolean(v.checkedOutAt) };
  if (!v.workStartedAt) return { custody, inService: null };
  const start = new Date(v.workStartedAt);
  // Only events at or after the start of work can end it.
  const enders = (
    [
      ['COMPLETED', v.completedAt],
      ['CANCELLED', v.cancelledAt],
      ['CHECKED_OUT', v.checkedOutAt],
    ] as const
  )
    .filter(([, at]) => at && new Date(at).getTime() >= start.getTime())
    .map(([by, at]) => ({ by, at: new Date(at as Date) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const end = enders[0];
  return {
    custody,
    inService: {
      days: Math.max(0, workingDaysBetween(start, end ? end.at : now)),
      final: Boolean(end),
      endedBy: end ? end.by : null,
    },
  };
}
