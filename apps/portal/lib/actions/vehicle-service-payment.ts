'use server';

import { prisma } from '@ejo/database';
import {
  requireUser,
  writeAuditLog,
  requireEligibleFinanceOfficer,
  listEligibleManagersForBranch,
  listEligibleFinanceOfficersForBranch,
  getWorkshopOrgContext,
} from './workshop';
import type { PaymentMethod } from './workshop';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';
import { sendEmail } from '@/lib/email';
import { renderServicePaymentRecordedUpdateEmail } from '@/lib/email-templates/service-payment-recorded-update';
import { renderServicePaymentRequirementMetEmail } from '@/lib/email-templates/service-payment-requirement-met';
import { renderServicePaymentCompletedInFullEmail } from '@/lib/email-templates/service-payment-completed-in-full';
import { renderCustomerServicePaymentReceivedEmail } from '@/lib/email-templates/customer-service-payment-received';

class ServicePaymentActionError extends Error {}

export async function getVehicleServicePayments(vehicleServiceId: string) {
  await requireUser();
  return prisma.payment.findMany({
    where: { vehicleServiceId },
    orderBy: { recordedAt: 'asc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
}

/**
 * Records one payment toward a Vehicle Service's own approved
 * estimate — the exact real Vehicle Service equivalent of Job Card's
 * own recordPayment(). Same real reasoning throughout: `amount` is
 * always exactly what's recorded (never a trusted "preset"), rejects
 * anything that would push the cumulative total past the estimate,
 * and approval — moving the Vehicle Service to IN_SERVICE — is fully
 * automatic the moment the running total first crosses the real 70%
 * minimum deposit, whichever specific payment that happens to be.
 */
export async function recordServicePayment(
  vehicleServiceId: string,
  amount: number,
  method: PaymentMethod,
  notes?: string,
): Promise<void> {
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
  // Same real reasoning as Job Card's own gate — payments keep
  // accumulating right up to full payment, well after the 70%
  // deposit has already moved this Vehicle Service to IN_SERVICE, not
  // just during the brief window before work starts.
  if (service.status !== 'CHECKED_IN' && service.status !== 'IN_SERVICE') {
    throw new ServicePaymentActionError('Payments can only be recorded while this Vehicle Service is checked in or in service.');
  }
  const user = await requireEligibleFinanceOfficer(service.branchId);

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

  const newTotal = prospectiveTotal;
  const justMetDeposit = alreadyPaid < minimumDeposit && newTotal >= minimumDeposit;
  const justCompletedFull = alreadyPaid < roundedTotal && newTotal >= roundedTotal;
  const shouldAutoApprove = service.status === 'CHECKED_IN' && (justMetDeposit || justCompletedFull);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        vehicleServiceId,
        amount: roundedAmount,
        method,
        notes: notes?.trim() || null,
        recordedById: user.id,
      },
    }),
    ...(shouldAutoApprove
      ? [prisma.vehicleService.update({
          where: { id: vehicleServiceId },
          data: {
            status: 'IN_SERVICE',
            workStartedAt: service.workStartedAt ? undefined : new Date(),
          },
        })]
      : []),
  ]);

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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send payment-recorded update emails for Vehicle Service', service.serviceNumber, err);
  }

  if (justMetDeposit || justCompletedFull) {
    try {
      const orgContext = await getWorkshopOrgContext(service.department?.name);
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

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
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        } else {
          await sendEmail(
            recipient.email,
            `Deposit requirement met on Vehicle Service ${service.serviceNumber}`,
            renderServicePaymentRequirementMetEmail({
              recipientName: recipient.fullName,
              serviceNumber: service.serviceNumber,
              customerName: service.customer.fullName,
              totalPaidSoFar: formatNaira(newTotal),
              totalEstimate: formatNaira(roundedTotal),
              serviceUrl: `${portalUrl}/workshop/vehicle-service/${vehicleServiceId}`,
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to send payment milestone emails for Vehicle Service', service.serviceNumber, err);
    }
  }

  try {
    const orgContext = await getWorkshopOrgContext(service.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
        serviceUrl: `${portalUrl}/workshop/vehicle-service/${vehicleServiceId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer payment-received email for Vehicle Service', service.serviceNumber, err);
  }
}
