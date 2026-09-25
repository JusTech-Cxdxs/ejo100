'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopOrgContext, requireEligibleFinanceOfficer } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderCustomerRefundReceiptEmail } from '@/lib/email-templates/customer-refund-receipt';

class RefundActionError extends Error {}

export type RefundTarget = { jobCardId: string } | { vehicleServiceId: string };

export type RefundPosition = { paid: number; refunded: number; remaining: number; isFullyRefunded: boolean };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadTarget(target: RefundTarget) {
  if ('jobCardId' in target) {
    const jc = await prisma.jobCard.findUnique({
      where: { id: target.jobCardId },
      select: {
        id: true,
        jobNumber: true,
        status: true,
        branchId: true,
        customer: { select: { fullName: true, email: true } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
        department: { select: { name: true } },
        payments: { select: { amount: true } },
        refunds: { select: { amount: true } },
        cancellationRequests: { where: { status: 'APPROVED' }, orderBy: { decidedAt: 'desc' }, take: 1, select: { reason: true } },
      },
    });
    if (!jc) return null;
    return {
      kind: 'JOB_CARD' as const,
      id: jc.id,
      number: jc.jobNumber,
      label: 'Job Card',
      status: jc.status,
      branchId: jc.branchId,
      customer: jc.customer,
      vehicle: jc.vehicle,
      departmentName: jc.department?.name,
      payments: jc.payments,
      refunds: jc.refunds,
      cancellationReason: jc.cancellationRequests[0]?.reason ?? null,
      entityType: 'JobCard',
      portalAnchor: `jobcard-${jc.id}`,
    };
  }
  const vs = await prisma.vehicleService.findUnique({
    where: { id: target.vehicleServiceId },
    select: {
      id: true,
      serviceNumber: true,
      status: true,
      branchId: true,
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true } },
      department: { select: { name: true } },
      payments: { select: { amount: true } },
      refunds: { select: { amount: true } },
    },
  });
  if (!vs) return null;
  return {
    kind: 'VEHICLE_SERVICE' as const,
    id: vs.id,
    number: vs.serviceNumber,
    label: 'Vehicle Service',
    status: vs.status,
    branchId: vs.branchId,
    customer: vs.customer,
    vehicle: vs.vehicle,
    departmentName: vs.department?.name,
    payments: vs.payments,
    refunds: vs.refunds,
    cancellationReason: null as string | null,
    entityType: 'VehicleService',
    portalAnchor: `service-${vs.id}`,
  };
}

function position(payments: { amount: unknown }[], refunds: { amount: unknown }[]): RefundPosition {
  const paid = round2(payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0));
  const refunded = round2(refunds.reduce((s: number, r: { amount: unknown }) => s + Number(r.amount), 0));
  const remaining = round2(Math.max(0, paid - refunded));
  return { paid, refunded, remaining, isFullyRefunded: remaining <= 0 };
}

/** Money in, money returned, and what is still owed back to the customer. */
export async function getRefundPosition(target: RefundTarget): Promise<RefundPosition> {
  await requireUser();
  const t = await loadTarget(target);
  if (!t) throw new RefundActionError('Record not found.');
  return position(t.payments, t.refunds);
}

/** Every refund on one Job Card or Vehicle Service, newest first. */
export async function listRefunds(target: RefundTarget) {
  await requireUser();
  return prisma.refund.findMany({
    where: 'jobCardId' in target ? { jobCardId: target.jobCardId } : { vehicleServiceId: target.vehicleServiceId },
    orderBy: { recordedAt: 'desc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
}

/** One refund with everything its receipt needs. */
export async function getRefund(id: string) {
  await requireUser();
  return prisma.refund.findUnique({
    where: { id },
    include: {
      recordedBy: { select: { fullName: true } },
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          branch: true,
          customer: { select: { fullName: true, email: true, phone: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } },
          payments: { select: { amount: true } },
          refunds: { select: { amount: true } },
        },
      },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          branch: true,
          customer: { select: { fullName: true, email: true, phone: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } },
          payments: { select: { amount: true } },
          refunds: { select: { amount: true } },
        },
      },
    },
  });
}

/** RF-2026-000001 */
async function generateRefundNumber(): Promise<string> {
  const prefix = `RF-${new Date().getFullYear()}-`;
  const latest = await prisma.refund.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const next = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

export type RecordRefundInput = {
  target: RefundTarget;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  paidToName: string;
  reason?: string;
  notes?: string;
};

/**
 * Finance pays money back to the customer and records it here — only
 * once the job has been CANCELLED (i.e. a Manager has already authorised
 * it), only by a Finance Officer for this branch or a Master Admin, and
 * never more than is still owed back. A refund can be paid in parts
 * (e.g. part cash, part transfer); each gets its own RF-number and
 * receipt. The vehicle can't be handed back until the refund is complete.
 */
export async function recordRefund(input: RecordRefundInput): Promise<{ id: string; referenceNumber: string }> {
  const t = await loadTarget(input.target);
  if (!t) throw new RefundActionError('Record not found.');
  const user = await requireEligibleFinanceOfficer(t.branchId);

  if (t.status !== 'CANCELLED') {
    throw new RefundActionError(
      t.kind === 'JOB_CARD'
        ? 'A refund can only be recorded once the cancellation has been approved by a Manager.'
        : 'A refund can only be recorded once this Vehicle Service has been cancelled.',
    );
  }
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RefundActionError('Enter a refund amount greater than zero.');
  }
  const pos = position(t.payments, t.refunds);
  if (pos.remaining <= 0) {
    throw new RefundActionError('Everything paid on this record has already been refunded.');
  }
  if (amount > pos.remaining) {
    throw new RefundActionError(`That is more than is still owed back — only ₦${pos.remaining.toLocaleString('en-NG', { minimumFractionDigits: 2 })} remains to be refunded.`);
  }
  if (input.method !== 'CASH' && input.method !== 'BANK_TRANSFER') {
    throw new RefundActionError('Choose how the refund was paid — cash or bank transfer.');
  }
  const paidToName = input.paidToName.trim();
  if (!paidToName) {
    throw new RefundActionError('Enter the name of the person who received the refund.');
  }
  const reason = input.reason?.trim() || t.cancellationReason || '';
  if (!reason) {
    throw new RefundActionError('Enter the reason for this refund.');
  }

  const referenceNumber = await generateRefundNumber();
  const refund = await prisma.refund.create({
    data: {
      referenceNumber,
      jobCardId: t.kind === 'JOB_CARD' ? t.id : null,
      vehicleServiceId: t.kind === 'VEHICLE_SERVICE' ? t.id : null,
      amount,
      method: input.method,
      paidToName,
      reason,
      notes: input.notes?.trim() || null,
      recordedById: user.id,
    },
  });

  const after = position(t.payments, [...t.refunds, { amount }]);
  await writeAuditLog({
    userId: user.id,
    action: 'refund.recorded',
    entityType: t.entityType,
    entityId: t.id,
    metadata: { referenceNumber, amount, method: input.method, paidToName, reason, notes: input.notes?.trim() || undefined, remainingAfter: after.remaining },
  });
  if (after.isFullyRefunded) {
    await writeAuditLog({
      userId: user.id,
      action: 'refund.completed',
      entityType: t.entityType,
      entityId: t.id,
      metadata: { totalRefunded: after.refunded, totalPaid: after.paid },
    });
  }

  try {
    const orgContext = await getWorkshopOrgContext(t.departmentName);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    await sendEmail(
      t.customer.email,
      `Refund receipt ${referenceNumber} — ${t.label} ${t.number}`,
      renderCustomerRefundReceiptEmail({
        customerName: t.customer.fullName,
        referenceNumber,
        recordLabel: t.label,
        recordNumber: t.number,
        vehicleDescription: [t.vehicle.make, t.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        amount: `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        method: input.method === 'CASH' ? 'Cash' : 'Bank Transfer',
        paidToName,
        totalRefunded: `₦${after.refunded.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        remaining: after.remaining > 0 ? `₦${after.remaining.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#${t.portalAnchor}`,
        logoUrl: `${websiteUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send refund receipt email', referenceNumber, err);
  }
  return { id: refund.id, referenceNumber };
}

/** Every refund in the workshop — the Refunds register. Newest first,
 * searchable by RF-number, Job Card / Service number or customer. */
export async function listAllRefunds(search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.refund.findMany({
    where: q
      ? {
          OR: [
            { referenceNumber: { contains: q, mode: 'insensitive' } },
            { paidToName: { contains: q, mode: 'insensitive' } },
            { jobCard: { jobNumber: { contains: q, mode: 'insensitive' } } },
            { vehicleService: { serviceNumber: { contains: q, mode: 'insensitive' } } },
            { jobCard: { customer: { fullName: { contains: q, mode: 'insensitive' } } } },
            { vehicleService: { customer: { fullName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : undefined,
    orderBy: { recordedAt: 'desc' },
    take: 200,
    include: {
      recordedBy: { select: { fullName: true } },
      jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
      vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { fullName: true } } } },
    },
  });
}
