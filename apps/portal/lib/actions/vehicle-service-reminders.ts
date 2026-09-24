'use server';

import { prisma, getAuditActor } from '@ejo/database';
import { requireUser, writeAuditLog, currentUserIsMasterAdmin, getWorkshopBranchId, listEligibleManagersForBranch } from './workshop';
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
    userId: getAuditActor()?.userId ?? null,
    action: 'vehicle.service_reminder_sent',
    entityType: 'CustomerVehicle',
    entityId: need.vehicleId,
    metadata: { stage: need.nextStage, overdue: need.isOverdue, trigger: trigger ?? 'AUTOMATIC', estimatedDueOdometer: need.estimatedDueOdometer, estimatedDueDate: need.estimatedDueDate?.toISOString() ?? null },
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
 * stage in the sequence) — refused until it is actually due,
 * because a person deliberately chose to send it. Logged (trigger
 * MANUAL) and audited like every other reminder. Never sent to a
 * vehicle that's back in the workshop, or one not yet due.
 */
export async function sendManualServiceReminder(vehicleId: string): Promise<void> {
  await requireUser();
  const [t] = await loadServiceTracking({ vehicleId });
  if (!t) throw new Error('This vehicle has no completed service to remind about yet.');
  if (t.inWorkshop) throw new Error(`This vehicle is in the workshop right now (${t.inWorkshop.number}) — no reminder is needed.`);
  if (t.attendedAt) throw new Error('This prediction has already been attended to — no further reminders.');
  if (!t.reminderDue) {
    throw new Error(
      t.nextReminderFrom
        ? `The next reminder isn't due yet — it can be sent from ${t.nextReminderFrom.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })}.`
        : 'This vehicle is not due yet — reminders start once it is due soon.',
    );
  }
  if (!t.customerEmail) throw new Error('The customer has no email address on file.');
  const nextStage = t.reminderDue.stage as ServiceReminderStage;
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
  // Audited (attributed to this user) inside sendServiceReminder.
}

/**
 * "Send all due reminders" — one click by a Workshop Manager or Master
 * Admin sends exactly the reminders the system says are due right now
 * (same stages, 7-working-day spacing and skips). Staff-triggered, never
 * scheduled: nothing is ever emailed without a person choosing to.
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
      await sendServiceReminder(need, 'MANUAL');
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
