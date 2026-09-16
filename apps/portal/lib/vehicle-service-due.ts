export type NextServiceDue = { dueOdometer: number | null; dueDate: Date | null };

/**
 * Deterministic dual-trigger calculation — no ML, Phase 1 on purpose.
 * Called once, at the real moment Primary Service (Engine Oil, in
 * practice) is actually confirmed done on a visit — never inferred
 * from a catalogue item's own flag, and never touched by any other
 * work performed the same visit (a brake-pad replacement or an AC
 * gas top-up never moves this clock, no matter how the organisation
 * configures their own real interval for those items separately).
 *
 * Either bound is null whenever the organisation hasn't actually
 * configured a real interval for it — an honest reflection of that,
 * never a fabricated guess at a number nobody set.
 */
export function calculateNextServiceDue(
  primaryServiceMileage: number | null,
  primaryServiceDate: Date,
  intervalKm: number | null,
  intervalDays: number | null,
): NextServiceDue {
  const dueOdometer = intervalKm !== null && primaryServiceMileage !== null ? primaryServiceMileage + intervalKm : null;
  let dueDate: Date | null = null;
  if (intervalDays !== null) {
    const candidate = new Date(primaryServiceDate);
    candidate.setDate(candidate.getDate() + intervalDays);
    dueDate = candidate;
  }
  return { dueOdometer, dueDate };
}
