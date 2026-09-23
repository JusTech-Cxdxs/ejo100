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

/**
 * Vehicles currently in the workshop for work — an open routine
 * service, or an open repair Job Card. A "your service is due"
 * reminder or an Overdue listing makes no sense for a vehicle that is
 * already booked in and being looked after.
 */
export async function vehiclesCurrentlyInWorkshop(vehicleIds: string[]): Promise<Set<string>> {
  if (vehicleIds.length === 0) return new Set();
  const [services, jobCards] = await Promise.all([
    prisma.vehicleService.findMany({
      where: { vehicleId: { in: vehicleIds }, status: { in: [...SERVICE_ACTIVE_STATUSES] }, escalatedToJobCardId: null },
      select: { vehicleId: true },
    }),
    prisma.jobCard.findMany({
      where: { vehicleId: { in: vehicleIds }, status: { notIn: ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] } },
      select: { vehicleId: true },
    }),
  ]);
  return new Set([
    ...services.map((s: (typeof services)[number]) => s.vehicleId),
    ...jobCards.map((j: (typeof jobCards)[number]) => j.vehicleId),
  ]);
}
