'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, currentUserIsMasterAdmin, getWorkshopBranchId, listEligibleManagersForBranch } from './workshop';
import { backfillServiceCycleAnchors, vehiclesCurrentlyInWorkshop, serviceDueStatus, loadServiceTracking } from '@/lib/vehicle-service-cycle';
import { sendEmail } from '@/lib/email';
import { renderServiceReminderEmail, serviceReminderSubject, type ServiceReminderStage } from '@/lib/email-templates/service-reminder';

// The real gap kept between one reminder and the next of the same
// general kind, so a vehicle sitting overdue for months doesn't get
// emailed on every single run — a real, deliberate cadence, not a
// flood.
const MIN_DAYS_BETWEEN_REMINDERS = 14;

export type VehicleNeedingReminder = {
  vehicleId: string;
  nextStage: ServiceReminderStage;
  estimatedDueOdometer: number | null;
  estimatedDueDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  isOverdue: boolean;
};

/**
 * The real, current decision for every vehicle with a genuine next-
 * service prediction — computed fresh each time from what's actually
 * true right now, never from a queue or a "pending" flag that could
 * drift out of date or double-send. Only reminder logs sent AFTER
 * the current real prediction was set actually count toward the
 * stage progression — once a vehicle is genuinely serviced again,
 * its next-service prediction changes, and any older reminders sent
 * against the previous cycle rightly stop influencing what's sent
 * next.
 */
export async function getVehiclesNeedingServiceReminder(): Promise<VehicleNeedingReminder[]> {
  // Every completed service now starts the count — catch up any
  // completed before that, so no vehicle silently misses reminders.
  await backfillServiceCycleAnchors();
  const services = await prisma.vehicleService.findMany({
    where: { OR: [{ nextServiceDueOdometer: { not: null } }, { nextServiceDueDate: { not: null } }] },
    orderBy: { primaryServiceDate: 'desc' },
    select: {
      vehicleId: true,
      attendedAt: true,
      nextServiceDueOdometer: true,
      nextServiceDueDate: true,
      primaryServiceDate: true,
      vehicle: { select: { mileage: true } },
    },
  });

  const now = new Date();
  const seenVehicles = new Set<string>();
  const results: VehicleNeedingReminder[] = [];

  const inWorkshop = await vehiclesCurrentlyInWorkshop([...new Set(services.map((x: (typeof services)[number]) => x.vehicleId))]);

  for (const s of services) {
    if (seenVehicles.has(s.vehicleId)) continue; // only the latest real prediction per vehicle counts
    seenVehicles.add(s.vehicleId);
    // Already handled by staff (Attend To), or booked back in right now
    // — never email "your service is due" to a customer whose vehicle is
    // already in our workshop.
    if (s.attendedAt || inWorkshop.has(s.vehicleId)) continue;

    // The one shared calculation — identical to the vehicle page,
    // custody and the Service Tracker.
    const due = serviceDueStatus(s.nextServiceDueOdometer, s.nextServiceDueDate, s.vehicle.mileage, now);
    const { kmRemaining, daysRemaining } = due;
    const isOverdue = due.status === 'OVERDUE';
    const isDueSoon = due.status === 'DUE_SOON';

    if (!isOverdue && !isDueSoon) continue; // nothing to remind about yet

    // Only reminders sent for this same real prediction cycle count
    // — a reminder sent before this vehicle's current, real
    // primaryServiceDate belonged to a previous, already-resolved
    // cycle and shouldn't influence what stage comes next now.
    const priorReminders = await prisma.serviceReminderLog.findMany({
      where: { vehicleId: s.vehicleId, ...(s.primaryServiceDate ? { sentAt: { gte: s.primaryServiceDate } } : {}) },
      orderBy: { sentAt: 'desc' },
      select: { reminderNumber: true, sentAt: true },
    });
    const lastReminder = priorReminders[0];
    const daysSinceLastReminder = lastReminder ? Math.floor((now.getTime() - lastReminder.sentAt.getTime()) / (1000 * 60 * 60 * 24)) : null;

    let nextStage: ServiceReminderStage | null = null;

    if (isOverdue) {
      if (!lastReminder) {
        // Genuinely never reminded at all and already overdue — the
        // real overdue reminder is still the honest first one to
        // send, not a fabricated earlier stage that never actually
        // happened.
        nextStage = 4;
      } else if (lastReminder.reminderNumber < 4) {
        nextStage = 4;
      } else if (daysSinceLastReminder !== null && daysSinceLastReminder >= MIN_DAYS_BETWEEN_REMINDERS) {
        nextStage = 4;
      }
    } else {
      // Due soon, not yet overdue.
      if (!lastReminder) {
        nextStage = 1;
      } else if (lastReminder.reminderNumber === 1 && daysSinceLastReminder !== null && daysSinceLastReminder >= MIN_DAYS_BETWEEN_REMINDERS) {
        nextStage = 2;
      } else if (lastReminder.reminderNumber >= 2 && daysSinceLastReminder !== null && daysSinceLastReminder >= MIN_DAYS_BETWEEN_REMINDERS) {
        // Getting closer still and the gap has passed again — the
        // real "actionable, very close" stage, never repeating stage
        // 2's own wording forever.
        nextStage = 3;
      }
    }

    if (nextStage === null) continue;

    results.push({
      vehicleId: s.vehicleId,
      nextStage,
      estimatedDueOdometer: s.nextServiceDueOdometer,
      estimatedDueDate: s.nextServiceDueDate,
      kmRemaining,
      daysRemaining,
      isOverdue,
    });
  }

  return results;
}

/**
 * Sends exactly one real reminder and logs it — the log is the one
 * real, permanent proof this happened, capturing the real facts as
 * they stood at this exact moment (never re-derivable later once the
 * vehicle's own mileage and the org's own interval keep moving).
 */
export async function sendServiceReminder(need: VehicleNeedingReminder, trigger?: 'MANUAL'): Promise<void> {
  const vehicle = await prisma.customerVehicle.findUnique({
    where: { id: need.vehicleId },
    select: {
      make: true,
      model: true,
      plateNumber: true,
      mileage: true,
      customer: { select: { id: true, fullName: true, email: true } },
      vehicleServices: {
        // Every completed service has an anchor date; the odometer can be
        // missing (date-only anchor), so the date is the reliable key.
        where: { primaryServiceDate: { not: null } },
        orderBy: { primaryServiceDate: 'desc' },
        take: 1,
        select: { primaryServiceMileage: true, primaryServiceDate: true, branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } } },
      },
    },
  });
  if (!vehicle || !vehicle.customer.email) return;

  const lastService = vehicle.vehicleServices[0];
  const branchContext = lastService?.branch;
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
  const vehicleDescription = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'your vehicle';

  await sendEmail(
    vehicle.customer.email,
    serviceReminderSubject(need.nextStage),
    renderServiceReminderEmail({
      stage: need.nextStage,
      customerName: vehicle.customer.fullName,
      vehicleDescription,
      plateNumber: vehicle.plateNumber,
      currentMileage: vehicle.mileage,
      lastServiceMileage: lastService?.primaryServiceMileage ?? null,
      lastServiceDate: lastService?.primaryServiceDate ?? null,
      estimatedDueOdometer: need.estimatedDueOdometer,
      estimatedDueDate: need.estimatedDueDate,
      kmRemaining: need.kmRemaining,
      daysRemaining: need.daysRemaining,
      isOverdue: need.isOverdue,
      // The customer's own account — never a staff-portal page they can't open.
      vehicleUrl: `${websiteUrl}/customer-portal/dashboard`,
      logoUrl: `${websiteUrl}/images/logo/logo.png`,
      companyName: branchContext?.businessUnit.organisation.name ?? 'EJO 100',
      branchName: branchContext?.name ?? '',
    }),
  );

  await prisma.serviceReminderLog.create({
    data: {
      vehicleId: need.vehicleId,
      reminderNumber: need.nextStage,
      estimatedDueOdometer: need.estimatedDueOdometer,
      estimatedDueDate: need.estimatedDueDate,
      recordedOdometerAtSend: vehicle.mileage,
      trigger: trigger ?? (need.isOverdue ? 'OVERDUE' : 'DUE_SOON'),
      deliveryStatus: 'SENT',
    },
  });
}

/** The real, permanent reminder history for one vehicle — shown on
 * its own page so nobody wonders whether a reminder actually went
 * out, or has to guess at what it said at the time. */
export async function getVehicleReminderHistory(vehicleId: string) {
  await requireUser();
  return prisma.serviceReminderLog.findMany({
    where: { vehicleId },
    orderBy: { sentAt: 'desc' },
  });
}

/**
 * A staff member sending a reminder right now, from the Service Tracker
 * or the vehicle's page. Picks the honest stage for where the vehicle
 * actually stands (overdue → the overdue reminder; due soon → the next
 * stage in the sequence), bypassing only the automatic 14-day spacing,
 * because a person deliberately chose to send it. Logged (trigger
 * MANUAL) and audited like every other reminder. Never sent to a
 * vehicle that's back in the workshop, or one not yet due.
 */
export async function sendManualServiceReminder(vehicleId: string): Promise<void> {
  const user = await requireUser();
  const [t] = await loadServiceTracking({ vehicleId });
  if (!t) throw new Error('This vehicle has no completed service to remind about yet.');
  if (t.inWorkshop) throw new Error(`This vehicle is in the workshop right now (${t.inWorkshop.number}) — no reminder is needed.`);
  if (t.status === 'ON_TRACK') throw new Error('This vehicle is not due yet — reminders start once it is due soon.');
  if (!t.customerEmail) throw new Error('The customer has no email address on file.');
  const last = t.reminders.lastStage;
  const nextStage = (t.status === 'OVERDUE' ? 4 : last === null ? 1 : last === 1 ? 2 : 3) as ServiceReminderStage;
  await sendServiceReminder(
    {
      vehicleId,
      nextStage,
      estimatedDueOdometer: t.nextServiceDueOdometer,
      estimatedDueDate: t.nextServiceDueDate,
      kmRemaining: t.kmRemaining,
      daysRemaining: t.daysRemaining,
      isOverdue: t.status === 'OVERDUE',
    },
    'MANUAL',
  );
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle.service_reminder_sent',
    entityType: 'CustomerVehicle',
    entityId: vehicleId,
    metadata: { stage: nextStage, status: t.status, lastServiceNumber: t.lastService.serviceNumber },
  });
}

/**
 * Runs the automatic reminder pass on demand — exactly what the daily
 * scheduled job does (same stages, same 14-day spacing, same skips) —
 * for a Workshop Manager or Master Admin who doesn't want to wait.
 */
export async function runServiceRemindersNow(): Promise<{ evaluated: number; sent: number; failed: number }> {
  const user = await requireUser();
  if (!(await currentUserIsMasterAdmin())) {
    const managers = await listEligibleManagersForBranch(await getWorkshopBranchId());
    if (!managers.supervisors.some((m: { id: string }) => m.id === user.id)) {
      throw new Error('Only a Workshop Manager or Master Administrator can run reminders on demand.');
    }
  }
  const needing = await getVehiclesNeedingServiceReminder();
  let sent = 0;
  let failed = 0;
  for (const need of needing) {
    try {
      await sendServiceReminder(need);
      sent += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error('Failed to send service reminder', need.vehicleId, err);
    }
  }
  await writeAuditLog({ userId: user.id, action: 'service_reminders.run_manually', entityType: 'System', entityId: 'service-reminders', metadata: { evaluated: needing.length, sent, failed } });
  return { evaluated: needing.length, sent, failed };
}
