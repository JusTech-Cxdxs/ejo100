'use server';

import { prisma } from '@ejo/database';
import { requireUser, currentUserIsMasterAdmin, listEligibleManagersForBranch } from './workshop';
import { writeAuditLog, getWorkshopBranchId } from '@/lib/workshop-core';
import { loadServiceTracking } from '@/lib/vehicle-service-cycle';
import { type ServiceReminderStage } from '@/lib/email-templates/service-reminder';
import { getVehiclesNeedingServiceReminder, sendServiceReminder } from '@/lib/service-reminders-core';
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
  const user = await requireUser();
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
    user.id,
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
      throw new Error('Only a Workshop Manager can run reminders on demand.');
    }
  }
  const needing = await getVehiclesNeedingServiceReminder();
  let sent = 0;
  let failed = 0;
  for (const need of needing) {
    try {
      await sendServiceReminder(need, 'MANUAL', user.id);
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
