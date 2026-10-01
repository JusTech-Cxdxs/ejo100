/**
 * Server-only service-reminder engine (used by the scheduled job and by the
 * signed-in reminder actions). NOT a 'use server' file — none of this can be
 * called from outside the server.
 */

import { prisma, getAuditActor } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { loadServiceTracking } from '@/lib/vehicle-service-cycle';
import { sendEmail } from '@/lib/email';
import { renderServiceReminderEmail, serviceReminderSubject, type ServiceReminderStage } from '@/lib/email-templates/service-reminder';


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
  // Every vehicle whose reminder is due right now — straight from the
  // one shared tracking calculation and staging rule (nextReminderStage),
  // so this list, the Service Tracker, custody and the vehicle page can
  // never disagree. Semi-automatic: nothing here sends anything.
  const tracked = await loadServiceTracking();
  return tracked
    .filter((t) => t.reminderDue !== null)
    .map((t) => ({
      vehicleId: t.vehicleId,
      nextStage: t.reminderDue!.stage as ServiceReminderStage,
      estimatedDueOdometer: t.nextServiceDueOdometer,
      estimatedDueDate: t.nextServiceDueDate,
      kmRemaining: t.kmRemaining,
      daysRemaining: t.daysRemaining,
      isOverdue: t.status === 'OVERDUE',
    }));
}

/**
 * Sends exactly one real reminder and logs it — the log is the one
 * real, permanent proof this happened, capturing the real facts as
 * they stood at this exact moment (never re-derivable later once the
 * vehicle's own mileage and the org's own interval keep moving).
 */
export async function sendServiceReminder(need: VehicleNeedingReminder, trigger?: 'MANUAL', sentById?: string): Promise<void> {
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
  // Which reminder this is in the current service cycle — shown to the
  // customer. (Who sent it is recorded on the internal audit trail only;
  // no employee's name ever appears in a customer email.)
  const sentThisCycle = await prisma.serviceReminderLog.count({
    where: { vehicleId: need.vehicleId, ...(lastService?.primaryServiceDate ? { sentAt: { gte: lastService.primaryServiceDate } } : {}) },
  });

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
      reminderCount: sentThisCycle + 1,
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
  // Every reminder sent — single or bulk — is on the vehicle's audit
  // trail, attributed to whoever clicked Send.
  await writeAuditLog({
    // Passed explicitly by the caller (never left to request context),
    // so every reminder on the trail names who sent it.
    userId: sentById ?? getAuditActor()?.userId ?? null,
    action: 'vehicle.service_reminder_sent',
    entityType: 'CustomerVehicle',
    entityId: need.vehicleId,
    metadata: { stage: need.nextStage, overdue: need.isOverdue, trigger: trigger ?? 'AUTOMATIC', estimatedDueOdometer: need.estimatedDueOdometer, estimatedDueDate: need.estimatedDueDate?.toISOString() ?? null },
  });
}

