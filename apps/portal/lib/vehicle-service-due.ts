export type NextServiceDue = { dueOdometer: number | null; dueDate: Date | null };

/**
 * Deterministic dual-trigger calculation, exactly the real principle
 * this whole module is built on — no ML, no averages, Phase 1 on
 * purpose. Takes the EARLIEST real due point across every
 * ServiceType actually performed this visit that carries a real
 * interval, since the honest "something on this vehicle is due"
 * moment is whichever real trigger comes first, never the latest or
 * an average of them. A ServiceType with no interval on either axis
 * (a genuine one-off, like a single AC gas top-up) contributes
 * nothing real here — correctly, not a bug. Both fields end up null
 * only when NOTHING performed this visit carries any real interval
 * at all, an honest reflection of that real state.
 */
export function calculateNextServiceDue(
  odometerAtService: number | null,
  serviceDate: Date,
  performedTypes: { intervalKm: number | null; intervalDays: number | null }[],
): NextServiceDue {
  let dueOdometer: number | null = null;
  let dueDate: Date | null = null;

  for (const t of performedTypes) {
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
