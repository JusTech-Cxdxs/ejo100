'use server';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';

import { authorize, seeService } from '@/lib/authz/server';

import { prisma } from '@ejo/database';
import { claimed, lockExisting } from '@/lib/integrity';
import { exceedsBalance } from '@/lib/integrity-core';
import { requireUser, requireEligibleFinanceOfficer, listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch } from './workshop';
import { writeAuditLog, getWorkshopOrgContext } from '@/lib/workshop-core';
import type { PaymentMethod } from './workshop';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';
import { sendEmail } from '@/lib/email';
import { renderServicePaymentRecordedUpdateEmail } from '@/lib/email-templates/service-payment-recorded-update';
import { renderServicePaymentRequirementMetEmail } from '@/lib/email-templates/service-payment-requirement-met';
import { renderServicePaymentCompletedInFullEmail } from '@/lib/email-templates/service-payment-completed-in-full';
import { renderCustomerServicePaymentReceivedEmail } from '@/lib/email-templates/customer-service-payment-received';
import { customerLinks } from '@/lib/customer-links-core';

class ServicePaymentActionError extends Error {}

export async function getVehicleServicePayments(vehicleServiceId: string) {
  await requireUser();
  await seeService(vehicleServiceId, 'getVehicleServicePayments');
  return prisma.payment.findMany({
    where: { vehicleServiceId },
    orderBy: { recordedAt: 'asc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
}

/**
 * Records one payment toward a Vehicle Service's approved estimate (Vehicle
 * Service version of recordPayment()). `amount` is exactly what is recorded;
 * amounts that would take the total past the estimate are refused. When the
 * total first reaches the 70% deposit, the service moves to IN_SERVICE
 * automatically.
 */
export async function recordServicePayment(
  vehicleServiceId: string,
  amount: number,
  method: PaymentMethod,
  notes?: string,
  idempotencyKey?: string,
): Promise<void> {
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('workshop.payment.record', undefined, 'recordServicePayment');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ServicePaymentActionError('Enter a valid payment amount.');
  }
  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: {
      branchId: true,
      status: true,
      serviceNumber: true,
      supervisorId: true,
      assignedTechnicianId: true,
      workStartedAt: true,
      customer: { select: { fullName: true, email: true } },
      department: { select: { name: true } },
      serviceEstimate: { select: { status: true, customerNotifiedAt: true, lineItems: { select: { amount: true } } } },
      payments: { select: { amount: true } },
    },
  });
  if (!service) {
    throw new ServicePaymentActionError('Vehicle Service record not found.');
  }
  if (!service.serviceEstimate || !service.serviceEstimate.customerNotifiedAt) {
    throw new ServicePaymentActionError('Payments can only be recorded once the customer has been notified of the approved estimate.');
  }
  // Payments stay open through Completed and Ready for Collection: the
  // balance is often settled at collection, and close/checkout require full
  // payment. Overpayment is still refused below.
  if (!['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'].includes(service.status)) {
    throw new ServicePaymentActionError('Payments can only be recorded while this Vehicle Service is checked in, in service, completed or ready for collection.');
  }
  const user = await requireEligibleFinanceOfficer(service.branchId, 'workshop.payment.record');
  // Same form submitted again (e.g. after a dropped connection): if it is the
  // same payment, it is already done; if the key was reused for something
  // different, refuse.
  if (idempotencyKey) {
    const done = await prisma.payment.findUnique({ where: { idempotencyKey }, select: { vehicleServiceId: true, amount: true, method: true } });
    if (done) {
      if (done.vehicleServiceId === vehicleServiceId && Number(done.amount) === amount && done.method === method) return;
      throw new ServicePaymentActionError('This form was already used for a different payment — refresh the page and enter it again.');
    }
  }
  // Duplicate guard: same amount, method and recorder within 20 seconds is a
  // double click or a resend after a dropped connection.
  if (await prisma.payment.findFirst({ where: { vehicleServiceId, amount, method, recordedById: user.id, recordedAt: { gte: new Date(Date.now() - 20000) } }, select: { id: true } })) {
    throw new Error('This payment was just recorded — check the payments list before recording it again.');
  }

  const total = service.serviceEstimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
  const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  const alreadyPaid = service.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount ?? 0), 0);
  const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (total > 0 && alreadyPaid >= total) {
    throw new ServicePaymentActionError('This estimate has already been paid in full — nothing left to record.');
  }

  const roundedAmount = Math.round(amount * 100) / 100;
  const prospectiveTotal = Math.round((alreadyPaid + roundedAmount) * 100) / 100;
  const roundedTotal = Math.round(total * 100) / 100;
  if (prospectiveTotal > roundedTotal) {
    const remaining = Math.round((roundedTotal - alreadyPaid) * 100) / 100;
    throw new ServicePaymentActionError(
      `This amount exceeds the remaining balance on this estimate. Please review — up to ${formatNaira(remaining)} can be recorded.`,
    );
  }

  // Two cashiers at once: decide again with the Vehicle Service row locked,
  // against the payments as they are now (see lib/integrity.ts).
  const PAYABLE = ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'];
  const settled = await prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'vehicleService', [vehicleServiceId], 'This Vehicle Service no longer exists — refresh the page.');
    // The same form, resent while the first was still saving: already recorded.
    if (idempotencyKey && (await tx.payment.findUnique({ where: { idempotencyKey }, select: { id: true } }))) return null;
    const now = await tx.vehicleService.findUnique({
      where: { id: vehicleServiceId },
      select: { status: true, workStartedAt: true, serviceEstimate: { select: { lineItems: { select: { amount: true } } } }, payments: { select: { amount: true } } },
    });
    if (!now || !PAYABLE.includes(now.status)) {
      throw new ServicePaymentActionError('This Vehicle Service changed while you were recording the payment — refresh the page.');
    }
    const totalNow = Math.round((now.serviceEstimate?.lineItems ?? []).reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0) * 100) / 100;
    const paidNow = now.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount ?? 0), 0);
    if (exceedsBalance(paidNow, roundedAmount, totalNow)) {
      const remaining = Math.max(0, Math.round((totalNow - paidNow) * 100) / 100);
      throw new ServicePaymentActionError(
        `Another payment was recorded on this Vehicle Service just now. Up to ${formatNaira(remaining)} can still be recorded — refresh to see it.`,
      );
    }
    const minimumNow = Math.round(totalNow * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
    const afterNow = Math.round((paidNow + roundedAmount) * 100) / 100;
    const metDeposit = paidNow < minimumNow && afterNow >= minimumNow;
    const completedFull = paidNow < totalNow && afterNow >= totalNow;
    const autoApprove = now.status === 'CHECKED_IN' && (metDeposit || completedFull);
    await tx.payment.create({
      data: {
        idempotencyKey: idempotencyKey || null,
        vehicleServiceId,
        amount: roundedAmount,
        method,
        notes: notes?.trim() || null,
        recordedById: user.id,
      },
    });
    if (autoApprove) {
      claimed(await tx.vehicleService.updateMany({
        where: { id: vehicleServiceId, status: 'CHECKED_IN' },
        data: { status: 'IN_SERVICE', workStartedAt: now.workStartedAt ?? new Date() },
      }));
    }
    return { newTotal: afterNow, autoApprove, justMetDeposit: metDeposit, justCompletedFull: completedFull };
  });
  if (!settled) return;
  const newTotal = settled.newTotal;
  const shouldAutoApprove = settled.autoApprove;
  const { justMetDeposit, justCompletedFull } = settled;
  void minimumDeposit;

  await writeAuditLog({
    userId: user.id,
    action: 'payment.recorded',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { amount: roundedAmount, method, notes: notes?.trim() || undefined },
  });
  if (shouldAutoApprove) {
    await writeAuditLog({
      userId: user.id,
      action: 'payment.approved',
      entityType: 'VehicleService',
      entityId: vehicleServiceId,
      metadata: { totalPaid: newTotal },
    });
  }

  try {
    const orgContext = await getWorkshopOrgContext(service.department?.name);
    const portalUrl = portalBaseUrl();
    const balance = roundedTotal - newTotal;

    const recipientIds = new Set<string>();
    const managers = await listEligibleManagersForBranch(service.branchId);
    for (const m of managers.supervisors) recipientIds.add(m.id);
    const financeOfficers = await listEligibleFinanceOfficersForBranch(service.branchId);
    for (const f of financeOfficers.supervisors) recipientIds.add(f.id);

    const recipients = await prisma.user.findMany({
      where: { id: { in: Array.from(recipientIds) } },
      select: { id: true, fullName: true, email: true },
    });

    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `Payment recorded on Vehicle Service ${service.serviceNumber}`,
        renderServicePaymentRecordedUpdateEmail({
          recipientName: recipient.fullName,
          serviceNumber: service.serviceNumber,
          customerName: service.customer.fullName,
          amountReceived: formatNaira(roundedAmount),
          totalPaidSoFar: formatNaira(newTotal),
          totalEstimate: formatNaira(roundedTotal),
          balanceRemaining: balance > 0 ? formatNaira(balance) : undefined,
          serviceUrl: `${portalUrl}/workshop/vehicle-service/${vehicleServiceId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send payment-recorded update emails for Vehicle Service', service.serviceNumber, err);
  }

  if (justMetDeposit || justCompletedFull) {
    try {
      const orgContext = await getWorkshopOrgContext(service.department?.name);
      const portalUrl = portalBaseUrl();

      const recipientIds = new Set<string>();
      if (service.supervisorId) recipientIds.add(service.supervisorId);
      if (service.assignedTechnicianId) recipientIds.add(service.assignedTechnicianId);
      const managers = await listEligibleManagersForBranch(service.branchId);
      for (const m of managers.supervisors) recipientIds.add(m.id);
      const financeOfficers = await listEligibleFinanceOfficersForBranch(service.branchId);
      for (const f of financeOfficers.supervisors) recipientIds.add(f.id);

      const recipients = await prisma.user.findMany({
        where: { id: { in: Array.from(recipientIds) } },
        select: { id: true, fullName: true, email: true },
      });

      for (const recipient of recipients) {
        if (justCompletedFull) {
          await sendEmail(
            recipient.email,
            `Vehicle Service ${service.serviceNumber} paid in full`,
            renderServicePaymentCompletedInFullEmail({
              recipientName: recipient.fullName,
              serviceNumber: service.serviceNumber,
              customerName: service.customer.fullName,
              totalPaid: formatNaira(newTotal),
              serviceUrl: `${portalUrl}/workshop/vehicle-service/${vehicleServiceId}`,
              logoUrl: `${portalUrl}/images/logo/email-logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        } else {
          await sendEmail(
            recipient.email,
            `Deposit paid, work can start — Vehicle Service ${service.serviceNumber}`,
            renderServicePaymentRequirementMetEmail({
              recipientName: recipient.fullName,
              serviceNumber: service.serviceNumber,
              customerName: service.customer.fullName,
              totalPaidSoFar: formatNaira(newTotal),
              totalEstimate: formatNaira(roundedTotal),
              serviceUrl: `${portalUrl}/workshop/vehicle-service/${vehicleServiceId}`,
              logoUrl: `${portalUrl}/images/logo/email-logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        }
      }
    } catch (err) {
      logFailure('Failed to send payment milestone emails for Vehicle Service', service.serviceNumber, err);
    }
  }

  try {
    const orgContext = await getWorkshopOrgContext(service.department?.name);
    const websiteUrl = websiteBaseUrl();
    const balance = roundedTotal - newTotal;
    await sendEmail(
      service.customer.email,
      `Payment received — Vehicle Service ${service.serviceNumber}`,
      renderCustomerServicePaymentReceivedEmail({
        customerName: service.customer.fullName,
        serviceNumber: service.serviceNumber,
        amountReceived: formatNaira(roundedAmount),
        totalPaidSoFar: formatNaira(newTotal),
        totalEstimate: formatNaira(roundedTotal),
        balanceRemaining: balance > 0 ? formatNaira(balance) : undefined,
        serviceUrl: `${customerLinks(websiteUrl).service(vehicleServiceId)}`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send customer payment-received email for Vehicle Service', service.serviceNumber, err);
  }
}
