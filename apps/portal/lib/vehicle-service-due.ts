export type NextServiceDue = { dueOdometer: number | null; dueDate: Date | null };

/**
 * Next service due by distance or date, whichever comes first.
 * Called once, when the Primary Service (engine oil, in practice) is
 * confirmed done on a visit; other work on the same visit never moves it.
 *
 * Either bound is null when the organisation has not configured that interval.
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
