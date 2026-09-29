/**
 * Vehicle intelligence — one vehicle's descriptive, diagnostic, predictive
 * and prescriptive picture, from facts already recorded (odometer
 * readings, visits, money, parts fitted, warranties, service schedule).
 * Pure functions: every number is reproducible and tested.
 */
export type VIInput = {
  mileage: { date: Date; km: number }[];
  visits: { date: Date }[];
  customerSpend: number;
  outstanding: number;
  coveredValue: number;
  partsFitted: { partId: string; partName: string; date: Date | null; slipId: string; jobCard: { id: string; number: string } | null; vehicleService: { id: string; number: string } | null }[];
  warranties: { id: string; number: string; endsAt: Date; distanceEnd: number | null; covering: boolean }[];
  service: { dueDate: Date | null; dueKm: number | null } | null;
  now?: Date;
};

export type VIAction = { priority: 1 | 2 | 3; title: string; detail: string; href: string | null };

const DAY = 86400000;
const fmtDate = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
const plural = (n: number, w: string) => `${n.toLocaleString('en-NG')} ${n === 1 ? w : `${w}s`}`;

export function computeVehicleIntelligence(input: VIInput) {
  const now = input.now ?? new Date();
  const readings = [...input.mileage].filter((m) => Number.isFinite(m.km)).sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = readings[0];
  const last = readings[readings.length - 1];
  const spanDays = first && last ? (last.date.getTime() - first.date.getTime()) / DAY : 0;
  // Pace needs at least two readings a week apart, and the odometer going up.
  const kmPerDay = first && last && spanDays >= 7 && last.km > first.km ? (last.km - first.km) / spanDays : null;
  const projectedKm = last ? Math.round(last.km + (kmPerDay ?? 0) * Math.max(0, (now.getTime() - last.date.getTime()) / DAY)) : null;
  const kmToDate = (km: number): Date | null => (last && kmPerDay && kmPerDay > 0 ? new Date(last.date.getTime() + ((km - last.km) / kmPerDay) * DAY) : null);

  // ── Descriptive
  const visits = [...input.visits].sort((a, b) => a.date.getTime() - b.date.getTime());
  const descriptive = {
    visits: visits.length,
    customerSpend: Math.round(input.customerSpend * 100) / 100,
    coveredValue: Math.round(input.coveredValue * 100) / 100,
    outstanding: Math.round(input.outstanding * 100) / 100,
    kmRecorded: first && last ? Math.max(0, last.km - first.km) : null,
    kmPerDay: kmPerDay === null ? null : Math.round(kmPerDay * 10) / 10,
    lastReading: last ? { km: last.km, date: last.date } : null,
  };

  // ── Diagnostic: the same part fitted 2+ times within 365 days
  const byPart = new Map<string, VIInput['partsFitted']>();
  input.partsFitted.filter((p) => p.date).forEach((p) => byPart.set(p.partId, [...(byPart.get(p.partId) ?? []), p]));
  const repeatParts = [...byPart.values()]
    .map((list) => list.slice().sort((a, b) => a.date!.getTime() - b.date!.getTime()))
    .filter((list) => list.some((p, i) => i > 0 && p.date!.getTime() - list[i - 1]!.date!.getTime() <= 365 * DAY))
    .map((list) => ({ partId: list[0]!.partId, partName: list[0]!.partName, times: list.length, last: list[list.length - 1]! }));
  const gaps = visits.slice(1).map((v, i) => (v.date.getTime() - visits[i]!.date.getTime()) / DAY);
  const diagnostic = {
    repeatParts,
    avgDaysBetweenVisits: gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null,
    daysSinceLastVisit: visits.length ? Math.floor((now.getTime() - visits[visits.length - 1]!.date.getTime()) / DAY) : null,
  };

  // ── Predictive
  let serviceDue: { date: Date; reason: 'date' | 'km' } | null = null;
  if (input.service) {
    const byKm = input.service.dueKm !== null ? kmToDate(input.service.dueKm) : null;
    const byDate = input.service.dueDate;
    if (byDate && byKm) serviceDue = byKm.getTime() < byDate.getTime() ? { date: byKm, reason: 'km' } : { date: byDate, reason: 'date' };
    else if (byDate) serviceDue = { date: byDate, reason: 'date' };
    else if (byKm) serviceDue = { date: byKm, reason: 'km' };
  }
  const warrantyEnds = input.warranties
    .filter((w) => w.covering)
    .map((w) => {
      const byKm = w.distanceEnd !== null ? kmToDate(w.distanceEnd) : null;
      const end = byKm && byKm.getTime() < w.endsAt.getTime() ? { date: byKm, reason: 'km' as const } : { date: w.endsAt, reason: 'date' as const };
      return { id: w.id, number: w.number, ...end, daysLeft: Math.ceil((end.date.getTime() - now.getTime()) / DAY) };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const predictive = { projectedKm, serviceDue, serviceDueInDays: serviceDue ? Math.ceil((serviceDue.date.getTime() - now.getTime()) / DAY) : null, warrantyEnds };

  // ── Prescriptive
  const actions: VIAction[] = [];
  if (descriptive.outstanding > 0) {
    actions.push({ priority: 1, title: `Collect ₦${descriptive.outstanding.toLocaleString('en-NG', { minimumFractionDigits: 2 })} outstanding`, detail: 'Approved work on this vehicle is not fully paid.', href: null });
  }
  if (predictive.serviceDueInDays !== null && serviceDue) {
    if (predictive.serviceDueInDays < 0) actions.push({ priority: 1, title: 'Service overdue', detail: `Due ${fmtDate(serviceDue.date)} (${serviceDue.reason === 'km' ? 'by projected mileage' : 'by date'}) — contact the customer to book it.`, href: null });
    else if (predictive.serviceDueInDays <= 14) actions.push({ priority: 2, title: `Service due in ${plural(predictive.serviceDueInDays, 'day')}`, detail: `${fmtDate(serviceDue.date)} (${serviceDue.reason === 'km' ? 'by projected mileage' : 'by date'}) — book it in.`, href: null });
  }
  warrantyEnds.filter((w) => w.daysLeft >= 0 && w.daysLeft <= 60).forEach((w) =>
    actions.push({ priority: 2, title: `${w.number} ends in ${plural(w.daysLeft, 'day')}`, detail: `Ends ${fmtDate(w.date)}${w.reason === 'km' ? ' (by projected mileage)' : ''} — offer a final warranty health check while repairs are still covered.`, href: `/warranty/${w.id}` }),
  );
  repeatParts.forEach((p) =>
    actions.push({ priority: 2, title: `Repeat part: ${p.partName} fitted ${plural(p.times, 'time')}`, detail: 'Within a year — look for the root cause, and check whether the latest one is under warranty.', href: `/inventory/parts/${p.partId}` }),
  );
  if (diagnostic.daysSinceLastVisit !== null && diagnostic.daysSinceLastVisit > 365) {
    actions.push({ priority: 3, title: `No visit for ${plural(diagnostic.daysSinceLastVisit, 'day')}`, detail: 'Re-engage the customer with a service reminder.', href: null });
  }
  actions.sort((a, b) => a.priority - b.priority);
  return { descriptive, diagnostic, predictive, prescriptive: { actions } };
}

export type VehicleIntelligence = ReturnType<typeof computeVehicleIntelligence>;
