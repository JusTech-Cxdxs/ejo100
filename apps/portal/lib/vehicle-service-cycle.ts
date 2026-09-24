import { prisma } from '@ejo/database';
import { calculateNextServiceDue } from '@/lib/vehicle-service-due';
import { onOrAfterWorkingDay } from '@/lib/utils/working-days';

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
    // A date the customer can actually bring the vehicle in: a weekend
    // due date rolls to the Monday.
    nextServiceDueDate: next.dueDate ? onOrAfterWorkingDay(next.dueDate) : null,
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
  await normaliseEscalatedServices();
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

const CYCLE_SOURCE_SELECT = {
  vehicle: { select: { serviceIntervalKm: true, serviceIntervalDays: true } },
  branch: { select: { businessUnit: { select: { organisation: { select: { primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } } } } } },
} as const;

/**
 * Escalated services, made consistent (idempotent):
 * 1. Any escalated before the ESCALATED status existed gets it now.
 * 2. Any whose Job Card has since been genuinely checked out (not a
 *    cancelled hand-back) starts its next-service count from that
 *    checkout — the moment the work actually finished and left.
 */
export async function normaliseEscalatedServices(): Promise<void> {
  // An "Escalated" service whose Job Card no longer exists (deleted) has
  // nothing to hand over to — it is cancelled rather than left stuck.
  await prisma.vehicleService.updateMany({
    where: { status: 'ESCALATED', escalatedToJobCardId: null },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  const legacy = await prisma.vehicleService.findMany({
    where: { escalatedToJobCardId: { not: null }, status: { not: 'ESCALATED' } },
    select: { id: true, escalatedToJobCard: { select: { createdAt: true } } },
  });
  for (const s of legacy) {
    await prisma.vehicleService.update({ where: { id: s.id }, data: { status: 'ESCALATED', escalatedAt: s.escalatedToJobCard?.createdAt ?? new Date() } });
  }
  const unanchored = await prisma.vehicleService.findMany({
    where: {
      status: 'ESCALATED',
      primaryServiceDate: null,
      escalatedToJobCard: { status: 'CHECKED_OUT', checkedOutAt: { not: null }, cancellationRequests: { none: { status: 'APPROVED' } } },
    },
    select: { id: true, escalatedToJobCardId: true },
  });
  for (const s of unanchored) {
    if (s.escalatedToJobCardId) await anchorEscalatedServiceFromJobCard(s.escalatedToJobCardId);
  }
}

/**
 * When a Job Card that came from a Vehicle Service is genuinely checked
 * out, that is the moment the vehicle's service was actually finished —
 * so the next-service count starts from that checkout (date) and the
 * Job Card's own odometer reading. A cancelled Job Card never anchors:
 * no service was done. No-op for a Job Card with no linked service, or
 * one already anchored.
 */
export async function anchorEscalatedServiceFromJobCard(jobCardId: string): Promise<void> {
  const svc = await prisma.vehicleService.findFirst({
    where: { escalatedToJobCardId: jobCardId, primaryServiceDate: null },
    select: {
      id: true,
      odometerAtService: true,
      escalatedToJobCard: {
        select: {
          status: true,
          checkedOutAt: true,
          mileageAtCheckIn: true,
          // An approved cancellation is the one real signal a Job Card was
          // cancelled — its vehicle is also "checked out" (handed back),
          // but no service was ever done, so it must never anchor.
          cancellationRequests: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 },
        },
      },
      ...CYCLE_SOURCE_SELECT,
    },
  });
  const jc = svc?.escalatedToJobCard;
  if (!svc || !jc || jc.status !== 'CHECKED_OUT' || !jc.checkedOutAt || jc.cancellationRequests.length > 0) return;
  await prisma.vehicleService.update({
    where: { id: svc.id },
    data: computeServiceCycle(jc.mileageAtCheckIn ?? svc.odometerAtService, jc.checkedOutAt, svc),
  });
}

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

/** Spacing kept between one reminder and the next for the same prediction. */
export const MIN_DAYS_BETWEEN_REMINDERS = 14;

/**
 * Which reminder is due now for one prediction — the single rule the
 * whole system uses. Reminders are SEMI-AUTOMATIC: this only decides
 * WHEN a reminder is due and which stage; a person always clicks Send.
 *   Due soon: 1st (friendly) → 2nd (follow-up) → 3rd (due), each at
 *   least 14 days after the last. Overdue: the overdue reminder (4),
 *   repeatable every 14 days. Returns when the next one becomes due if
 *   it isn't due yet.
 */
export function nextReminderStage(
  status: ServiceDueStatus,
  lastStage: number | null,
  lastSentAt: Date | null,
  now: Date = new Date(),
): { stage: 1 | 2 | 3 | 4 | null; dueFrom: Date | null } {
  if (status === 'ON_TRACK') return { stage: null, dueFrom: null };
  // The team works Monday–Friday: a follow-up that would fall due on a
  // weekend becomes due on the Monday, so it's waiting when they're in.
  const gapPassedAt = lastSentAt ? onOrAfterWorkingDay(new Date(new Date(lastSentAt).getTime() + MIN_DAYS_BETWEEN_REMINDERS * 86400000)) : null;
  const gapPassed = !gapPassedAt || gapPassedAt <= now;
  if (status === 'OVERDUE') {
    if (lastStage === null || lastStage < 4) return { stage: 4, dueFrom: null };
    return gapPassed ? { stage: 4, dueFrom: null } : { stage: null, dueFrom: gapPassedAt };
  }
  if (lastStage === null) return { stage: 1, dueFrom: null };
  if (!gapPassed) return { stage: null, dueFrom: gapPassedAt };
  return { stage: lastStage === 1 ? 2 : 3, dueFrom: null };
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
  /** The reminder a person can send right now (null = none due), or when
   * the next one becomes due. Never set while in the workshop or once
   * attended to. */
  reminderDue: { stage: 1 | 2 | 3 | 4 } | null;
  nextReminderFrom: Date | null;
  /** The last service was carried out on a Job Card (escalated). */
  viaJobCard: { id: string; jobNumber: string } | null;
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
      escalatedToJobCard: { select: { id: true, jobNumber: true } },
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
      ...(() => {
        const inWorkshop = visits.get(s.vehicleId) ?? null;
        if (inWorkshop || s.attendedAt) return { reminderDue: null, nextReminderFrom: null };
        const next = nextReminderStage(due.status, cycleLogs[0]?.reminderNumber ?? null, cycleLogs[0]?.sentAt ?? null, now);
        return { reminderDue: next.stage ? { stage: next.stage } : null, nextReminderFrom: next.dueFrom };
      })(),
      viaJobCard: s.escalatedToJobCard ? { id: s.escalatedToJobCard.id, jobNumber: s.escalatedToJobCard.jobNumber } : null,
    };
  });
}

// ── Escalated = read-only ─────────────────────────────────────────────

type EscalationRef = { vehicleServiceId?: string; estimateId?: string; lineItemId?: string; inspectionId?: string };

/**
 * Refuses any change to a Vehicle Service that has been handed over to
 * a Job Card — all work, payment and checkout continue there. Called at
 * the top of every mutation that isn't already refused by its own
 * status rules, so "Escalated" is genuinely read-only on the server,
 * not just hidden on the page.
 */
export async function assertServiceNotEscalated(ref: EscalationRef): Promise<void> {
  const select = { status: true, escalatedToJobCardId: true, escalatedToJobCard: { select: { jobNumber: true } } } as const;
  let svc: { status: string; escalatedToJobCardId: string | null; escalatedToJobCard: { jobNumber: string } | null } | null = null;
  if (ref.vehicleServiceId) {
    svc = await prisma.vehicleService.findUnique({ where: { id: ref.vehicleServiceId }, select });
  } else if (ref.estimateId) {
    svc = (await prisma.serviceEstimate.findUnique({ where: { id: ref.estimateId }, select: { vehicleService: { select } } }))?.vehicleService ?? null;
  } else if (ref.lineItemId) {
    svc = (await prisma.serviceEstimateLineItem.findUnique({ where: { id: ref.lineItemId }, select: { estimate: { select: { vehicleService: { select } } } } }))?.estimate.vehicleService ?? null;
  } else if (ref.inspectionId) {
    svc = (await prisma.vehicleInspection.findUnique({ where: { id: ref.inspectionId }, select: { vehicleService: { select } } }))?.vehicleService ?? null;
  }
  if (svc && (svc.status === 'ESCALATED' || svc.escalatedToJobCardId)) {
    throw new Error(`This Vehicle Service was escalated to ${svc.escalatedToJobCard?.jobNumber ?? 'a Job Card'} and is now read-only — continue on the Job Card.`);
  }
}
