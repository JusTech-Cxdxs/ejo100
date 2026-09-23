import { prisma } from '@ejo/database';
import { calculateNextServiceDue } from '@/lib/vehicle-service-due';

/**
 * The next-service clock for Vehicle Services.
 *
 * Every completed service now starts the count — there is no longer an
 * "engine oil was changed" tick deciding whether it does. The anchor is
 * the service's own odometer reading and completion date; the interval
 * is the vehicle's own (manufacturer) interval when set, otherwise the
 * organisation's default.
 *
 * Deliberately NOT a server action ('use server' is absent): it writes
 * data and performs no authorisation of its own, so it must never be
 * exposed as a callable endpoint. Only ever called from code that has
 * already authorised (loaders, the status action) or from the cron.
 */

/** Statuses that mean the work on a Vehicle Service is genuinely done. */
export const SERVICE_DONE_STATUSES = ['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'COLLECTED'] as const;

/** Statuses that mean a vehicle is currently booked in for a routine service. */
export const SERVICE_ACTIVE_STATUSES = ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE'] as const;

type IntervalSource = {
  vehicle: { serviceIntervalKm: number | null; serviceIntervalDays: number | null };
  branch: { businessUnit: { organisation: { primaryServiceIntervalKm: number | null; primaryServiceIntervalDays: number | null } } };
};

/** The anchor + prediction one completed visit establishes. */
export function computeServiceCycle(odometer: number | null, completedAt: Date, source: IntervalSource) {
  const org = source.branch.businessUnit.organisation;
  // A vehicle's own real interval takes priority over the organisation
  // default the moment it's set — never silently overridden.
  const intervalKm = source.vehicle.serviceIntervalKm ?? org.primaryServiceIntervalKm;
  const intervalDays = source.vehicle.serviceIntervalDays ?? org.primaryServiceIntervalDays;
  const next = calculateNextServiceDue(odometer, completedAt, intervalKm, intervalDays);
  return {
    primaryServiceMileage: odometer,
    primaryServiceDate: completedAt,
    nextServiceDueOdometer: next.dueOdometer,
    nextServiceDueDate: next.dueDate,
  };
}

/**
 * Starts the count for any service completed before every completion
 * anchored the clock (i.e. when the old oil-change tick was left
 * unticked). Uses that service's own real completion date and odometer
 * — never "now" — so the prediction is exactly what it would have been.
 * Idempotent: only touches completed, non-escalated services with no
 * anchor yet, so after the first run it finds nothing.
 */
export async function backfillServiceCycleAnchors(): Promise<number> {
  const pending = await prisma.vehicleService.findMany({
    where: {
      status: { in: [...SERVICE_DONE_STATUSES] },
      completedAt: { not: null },
      primaryServiceDate: null,
      escalatedToJobCardId: null,
    },
    select: {
      id: true,
      odometerAtService: true,
      completedAt: true,
      vehicle: { select: { serviceIntervalKm: true, serviceIntervalDays: true } },
      branch: { select: { businessUnit: { select: { organisation: { select: { primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } } } } } },
    },
  });
  for (const s of pending) {
    await prisma.vehicleService.update({
      where: { id: s.id },
      data: computeServiceCycle(s.odometerAtService, s.completedAt as Date, s),
    });
  }
  return pending.length;
}

/** The open visit a vehicle is currently in the workshop on. */
export type WorkshopVisit = { kind: 'VEHICLE_SERVICE' | 'JOB_CARD'; id: string; number: string; status: string };

/**
 * Vehicles currently in the workshop for work — an open routine
 * service, or an open repair Job Card — and exactly which visit. Such a
 * vehicle is still tracked and shown everywhere (with the visit named),
 * but no "your service is due" reminder is ever emailed while it's here.
 */
export async function workshopVisitsForVehicles(vehicleIds: string[]): Promise<Map<string, WorkshopVisit>> {
  const out = new Map<string, WorkshopVisit>();
  if (vehicleIds.length === 0) return out;
  const [services, jobCards] = await Promise.all([
    prisma.vehicleService.findMany({
      where: { vehicleId: { in: vehicleIds }, status: { in: [...SERVICE_ACTIVE_STATUSES] }, escalatedToJobCardId: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, vehicleId: true, serviceNumber: true, status: true },
    }),
    prisma.jobCard.findMany({
      where: { vehicleId: { in: vehicleIds }, status: { notIn: ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, vehicleId: true, jobNumber: true, status: true },
    }),
  ]);
  for (const j of jobCards) if (!out.has(j.vehicleId)) out.set(j.vehicleId, { kind: 'JOB_CARD', id: j.id, number: j.jobNumber, status: j.status });
  for (const v of services) if (!out.has(v.vehicleId)) out.set(v.vehicleId, { kind: 'VEHICLE_SERVICE', id: v.id, number: v.serviceNumber, status: v.status });
  return out;
}

export async function vehiclesCurrentlyInWorkshop(vehicleIds: string[]): Promise<Set<string>> {
  return new Set((await workshopVisitsForVehicles(vehicleIds)).keys());
}

// ── One shared due calculation ────────────────────────────────────────
// Used by the vehicle page, custody, the Service Tracker and the
// reminder engine alike, so they can never disagree.

export const DUE_SOON_KM = 1000;
export const DUE_SOON_DAYS = 30;

export type ServiceDueStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

export function serviceDueStatus(nextServiceDueOdometer: number | null, nextServiceDueDate: Date | null, currentMileage: number | null, now: Date = new Date()) {
  const kmRemaining = nextServiceDueOdometer !== null && currentMileage !== null ? nextServiceDueOdometer - currentMileage : null;
  const daysRemaining = nextServiceDueDate !== null ? Math.ceil((new Date(nextServiceDueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const overdue = (kmRemaining !== null && kmRemaining <= 0) || (daysRemaining !== null && daysRemaining <= 0);
  const dueSoon = (kmRemaining !== null && kmRemaining <= DUE_SOON_KM) || (daysRemaining !== null && daysRemaining <= DUE_SOON_DAYS);
  const status: ServiceDueStatus = overdue ? 'OVERDUE' : dueSoon ? 'DUE_SOON' : 'ON_TRACK';
  return { kmRemaining, daysRemaining, status };
}

export type TrackedVehicle = {
  vehicleId: string;
  vehicleDescription: string;
  plateNumber: string | null;
  currentMileage: number | null;
  customerName: string;
  customerEmail: string | null;
  /** The completed visit whose prediction is current. */
  lastService: { id: string; serviceNumber: string; date: Date | null; mileage: number | null };
  nextServiceDueOdometer: number | null;
  nextServiceDueDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  status: ServiceDueStatus;
  /** Staff marked this prediction handled (Attend To). */
  attendedAt: Date | null;
  /** Currently back in the workshop — tracked, but never reminded. */
  inWorkshop: WorkshopVisit | null;
  reminders: { sentThisCycle: number; lastSentAt: Date | null; lastStage: number | null };
};

/**
 * Every vehicle's CURRENT service prediction (its most recent completed
 * visit), with its live due status, whether it's back in the workshop,
 * and this cycle's reminder history. Starts the count for any older
 * service first, so nothing is missed.
 */
export async function loadServiceTracking(scope: { branchId?: string; vehicleId?: string } = {}): Promise<TrackedVehicle[]> {
  await backfillServiceCycleAnchors();
  const services = await prisma.vehicleService.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(scope.vehicleId ? { vehicleId: scope.vehicleId } : {}),
      OR: [{ nextServiceDueOdometer: { not: null } }, { nextServiceDueDate: { not: null } }],
    },
    orderBy: { primaryServiceDate: 'desc' },
    select: {
      id: true,
      vehicleId: true,
      serviceNumber: true,
      attendedAt: true,
      primaryServiceDate: true,
      primaryServiceMileage: true,
      nextServiceDueOdometer: true,
      nextServiceDueDate: true,
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true, year: true, plateNumber: true, mileage: true } },
    },
  });
  // Only the latest real prediction per vehicle counts.
  const latest = new Map<string, (typeof services)[number]>();
  for (const s of services) if (!latest.has(s.vehicleId)) latest.set(s.vehicleId, s);
  const vehicleIds = [...latest.keys()];
  const [visits, logs] = await Promise.all([
    workshopVisitsForVehicles(vehicleIds),
    vehicleIds.length
      ? prisma.serviceReminderLog.findMany({
          where: { vehicleId: { in: vehicleIds } },
          orderBy: { sentAt: 'desc' },
          select: { vehicleId: true, sentAt: true, reminderNumber: true },
        })
      : Promise.resolve([] as { vehicleId: string; sentAt: Date; reminderNumber: number }[]),
  ]);
  const now = new Date();
  return [...latest.values()].map((s) => {
    const due = serviceDueStatus(s.nextServiceDueOdometer, s.nextServiceDueDate, s.vehicle.mileage, now);
    // Only reminders for THIS prediction cycle count (same rule as the engine).
    const cycleLogs = logs.filter((l: { vehicleId: string; sentAt: Date }) => l.vehicleId === s.vehicleId && (!s.primaryServiceDate || l.sentAt >= s.primaryServiceDate));
    return {
      vehicleId: s.vehicleId,
      vehicleDescription: [s.vehicle.year, s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      plateNumber: s.vehicle.plateNumber,
      currentMileage: s.vehicle.mileage,
      customerName: s.customer.fullName,
      customerEmail: s.customer.email,
      lastService: { id: s.id, serviceNumber: s.serviceNumber, date: s.primaryServiceDate, mileage: s.primaryServiceMileage },
      nextServiceDueOdometer: s.nextServiceDueOdometer,
      nextServiceDueDate: s.nextServiceDueDate,
      kmRemaining: due.kmRemaining,
      daysRemaining: due.daysRemaining,
      status: due.status,
      attendedAt: s.attendedAt,
      inWorkshop: visits.get(s.vehicleId) ?? null,
      reminders: {
        sentThisCycle: cycleLogs.length,
        lastSentAt: cycleLogs[0]?.sentAt ?? null,
        lastStage: cycleLogs[0]?.reminderNumber ?? null,
      },
    };
  });
}
