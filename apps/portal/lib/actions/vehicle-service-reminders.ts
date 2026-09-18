'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderServiceReminderEmail, serviceReminderSubject, type ServiceReminderStage } from '@/lib/email-templates/service-reminder';

const DUE_SOON_KM = 1000;
const DUE_SOON_DAYS = 30;
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
  const services = await prisma.vehicleService.findMany({
    where: { OR: [{ nextServiceDueOdometer: { not: null } }, { nextServiceDueDate: { not: null } }] },
    orderBy: { primaryServiceDate: 'desc' },
    select: {
      vehicleId: true,
      nextServiceDueOdometer: true,
      nextServiceDueDate: true,
      primaryServiceDate: true,
      vehicle: { select: { mileage: true } },
    },
  });

  const now = new Date();
  const seenVehicles = new Set<string>();
  const results: VehicleNeedingReminder[] = [];

  for (const s of services) {
    if (seenVehicles.has(s.vehicleId)) continue; // only the latest real prediction per vehicle counts
    seenVehicles.add(s.vehicleId);

    const kmRemaining = s.nextServiceDueOdometer !== null && s.vehicle.mileage !== null ? s.nextServiceDueOdometer - s.vehicle.mileage : null;
    const daysRemaining = s.nextServiceDueDate !== null ? Math.ceil((s.nextServiceDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isOverdue = (kmRemaining !== null && kmRemaining <= 0) || (daysRemaining !== null && daysRemaining <= 0);
    const isDueSoon = (kmRemaining !== null && kmRemaining <= DUE_SOON_KM) || (daysRemaining !== null && daysRemaining <= DUE_SOON_DAYS);

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
export async function sendServiceReminder(need: VehicleNeedingReminder): Promise<void> {
  const vehicle = await prisma.customerVehicle.findUnique({
    where: { id: need.vehicleId },
    select: {
      make: true,
      model: true,
      plateNumber: true,
      mileage: true,
      customer: { select: { id: true, fullName: true, email: true } },
      vehicleServices: {
        where: { primaryServiceMileage: { not: null } },
        orderBy: { primaryServiceDate: 'desc' },
        take: 1,
        select: { primaryServiceMileage: true, primaryServiceDate: true, branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } } },
      },
    },
  });
  if (!vehicle || !vehicle.customer.email) return;

  const lastService = vehicle.vehicleServices[0];
  const branchContext = lastService?.branch;
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
      vehicleUrl: `${portalUrl}/workshop/vehicles/${need.vehicleId}/edit`,
      logoUrl: `${portalUrl}/images/logo/logo.png`,
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
      trigger: need.isOverdue ? 'OVERDUE' : 'DUE_SOON',
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
