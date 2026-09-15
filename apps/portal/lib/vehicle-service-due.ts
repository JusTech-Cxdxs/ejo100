export type NextServiceDue = { dueOdometer: number | null; dueDate: Date | null };

/**
 * Deterministic dual-trigger calculation — no ML, Phase 1 on purpose
 * — anchored to a real, deliberate architectural simplification
 * confirmed directly from how the actual workshop operates: a
 * customer comes back because the engine oil (the real, genuine
 * primary/periodic service) is due, not because of an average or
 * earliest-of-everything across every minor item ever performed on
 * the vehicle. Only ServiceTypes marked isPrimary contribute to the
 * vehicle's own next-routine-service prediction here — a brake-pad
 * replacement, an AC gas top-up, or a filter swapped on inspection
 * are all still genuinely recorded on this same visit, but never
 * move the vehicle's own next-service clock unless that specific
 * item has itself deliberately been marked primary too.
 *
 * Among whichever primary items were actually performed this visit
 * (ordinarily just one — "Engine Oil" — but the business could
 * configure more than one primary type), takes the EARLIEST real due
 * point, the same honest "whichever comes first" principle as
 * before, just scoped to primary items only now. Both fields end up
 * null when no primary item was performed this visit at all — an
 * honest reflection that this particular visit didn't include the
 * vehicle's own real periodic service, not a bug.
 */
export function calculateNextServiceDue(
  odometerAtService: number | null,
  serviceDate: Date,
  performedTypes: { intervalKm: number | null; intervalDays: number | null; isPrimary: boolean }[],
): NextServiceDue {
  let dueOdometer: number | null = null;
  let dueDate: Date | null = null;

  for (const t of performedTypes) {
    if (!t.isPrimary) continue;
    if (t.intervalKm !== null && odometerAtService !== null) {
      const candidate = odometerAtService + t.intervalKm;
      if (dueOdometer === null || candidate < dueOdometer) dueOdometer = candidate;
    }
    if (t.intervalDays !== null) {
      const candidate = new Date(serviceDate);
      candidate.setDate(candidate.getDate() + t.intervalDays);
      if (dueDate === null || candidate.getTime() < dueDate.getTime()) dueDate = candidate;
    }
  }
  return { dueOdometer, dueDate };
}
