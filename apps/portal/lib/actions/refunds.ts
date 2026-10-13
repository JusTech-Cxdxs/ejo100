'use server';
import { websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';

import { authorize, jobOrServiceReach, seeJobCard, seeService, } from '@/lib/authz/server';

import { prisma } from '@ejo/database';
import { lockExisting } from '@/lib/integrity';
import { retryOnNumberClash, toMinor } from '@/lib/integrity-core';
import { requireUser, requireEligibleFinanceOfficer } from './workshop';
import { writeAuditLog, getWorkshopOrgContext } from '@/lib/workshop-core';
import { sendEmail } from '@/lib/email';
import { renderCustomerRefundReceiptEmail } from '@/lib/email-templates/customer-refund-receipt';
import { customerTotal } from '@/lib/estimate-billing';
import { lagosYear } from '@/lib/utils/format-date';

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
        estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } },
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
      // What the customer still owes on an active Job Card (customer lines
      // only); nothing once it's cancelled — then everything paid is owed back.
      customerOwes: jc.status === 'CANCELLED' ? 0 : customerTotal(jc.estimate?.lineItems ?? []),
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

/** Paid in, refunded out, and what is still owed back: everything paid
 * minus refunds minus whatever the customer still owes (nothing once
 * cancelled; on an active Job Card only an overpayment is owed back). */
function position(payments: { amount: unknown }[], refunds: { amount: unknown }[], customerOwes = 0): RefundPosition {
  const paid = round2(payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0));
  const refunded = round2(refunds.reduce((s: number, r: { amount: unknown }) => s + Number(r.amount), 0));
  const remaining = round2(Math.max(0, paid - refunded - customerOwes));
  return { paid, refunded, remaining, isFullyRefunded: remaining <= 0 };
}

/** Only for a Job Card / Vehicle Service the person can see (never another
 * branch's or organisation's). */
async function seeTarget(target: RefundTarget, where: string): Promise<void> {
  if ('jobCardId' in target) await seeJobCard(target.jobCardId, where);
  else await seeService(target.vehicleServiceId, where);
}

export async function getRefundPosition(target: RefundTarget): Promise<RefundPosition> {
  await requireUser();
  await seeTarget(target, 'getRefundPosition');
  const t = await loadTarget(target);
  if (!t) throw new RefundActionError('Record not found.');
  return position(t.payments, t.refunds, 'customerOwes' in t ? t.customerOwes : 0);
}

/** Every refund on one Job Card or Vehicle Service, newest first. */
export async function listRefunds(target: RefundTarget) {
  await requireUser();
  await seeTarget(target, 'listRefunds');
  return prisma.refund.findMany({
    where: 'jobCardId' in target ? { jobCardId: target.jobCardId } : { vehicleServiceId: target.vehicleServiceId },
    orderBy: { recordedAt: 'desc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
}

/** One refund with everything its receipt needs. */
export async function getRefund(id: string) {
  await requireUser();
  const owner = await prisma.refund.findUnique({ where: { id }, select: { jobCardId: true, vehicleServiceId: true } });
  if (!owner) return null;
  try {
    await seeTarget(owner.jobCardId ? { jobCardId: owner.jobCardId } : { vehicleServiceId: owner.vehicleServiceId ?? '' }, `Refund:${id}`);
  } catch {
    return null; // shown exactly like a refund that does not exist
  }
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
async function generateRefundNumber(db: Pick<typeof prisma, 'refund'> = prisma): Promise<string> {
  const prefix = `RF-${lagosYear()}-`;
  const latest = await db.refund.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const next = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

export type RecordRefundInput = {
  target: RefundTarget;
  idempotencyKey?: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  paidToName: string;
  reason?: string;
  notes?: string;
};

/**
 * Finance pays money back to the customer and records it here. Only by a
 * Finance Officer for the branch or a Master Admin, and never more than is
 * owed back: on a cancelled job (cancellation is the Manager's authorisation)
 * everything paid; on an active Job Card only an overpayment. A refund can
 * be paid in parts (e.g. part cash, part transfer), each with its own
 * RF-number and receipt. A cancelled vehicle can't be handed back until the
 * refund is complete.
 */
export async function recordRefund(input: RecordRefundInput): Promise<{ id: string; referenceNumber: string }> {
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('workshop.refund.record', undefined, 'recordRefund');
  const t = await loadTarget(input.target);
  if (!t) throw new RefundActionError('Record not found.');
  const user = await requireEligibleFinanceOfficer(t.branchId, 'workshop.refund.record');
  // Same form submitted again (e.g. after a dropped connection): return the refund already recorded.
  if (input.idempotencyKey) {
    const done = await prisma.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, referenceNumber: true, amount: true, jobCardId: true, vehicleServiceId: true } });
    if (done) {
      const sameRecord = t.kind === 'JOB_CARD' ? done.jobCardId === t.id : done.vehicleServiceId === t.id;
      if (sameRecord && Number(done.amount) === input.amount) return { id: done.id, referenceNumber: done.referenceNumber };
      throw new RefundActionError('This form was already used for a different refund — refresh the page and enter it again.');
    }
  }
  // Duplicate guard: same amount and recorder within 20 seconds is a double
  // click or a resend after a dropped connection.
  if (await prisma.refund.findFirst({ where: { amount: input.amount, recordedById: user.id, recordedAt: { gte: new Date(Date.now() - 20000) }, ...(t.kind === 'JOB_CARD' ? { jobCardId: t.id } : { vehicleServiceId: t.id }) }, select: { id: true } })) {
    throw new RefundActionError('This refund was just recorded — check the refunds list before recording it again.');
  }

  // An active Job Card can refund an overpayment only (the customer paid more
  // than they now owe, e.g. lines moved to warranty after a deposit).
  const owes = 'customerOwes' in t ? t.customerOwes : 0;
  const isOverpaymentRefund = t.status !== 'CANCELLED' && t.kind === 'JOB_CARD' && position(t.payments, t.refunds, owes).remaining > 0;
  if (t.status !== 'CANCELLED' && t.kind === 'JOB_CARD' && !isOverpaymentRefund && t.refunds.length > 0) {
    throw new RefundActionError('The overpayment on this Job Card has already been refunded — nothing more is owed back.');
  }
  if (t.status !== 'CANCELLED' && !isOverpaymentRefund) {
    throw new RefundActionError(
      t.kind === 'JOB_CARD'
        ? 'A refund can only be recorded once the cancellation has been approved by a Manager, or when the customer has paid more than they now owe.'
        : 'A refund can only be recorded once this Vehicle Service has been cancelled.',
    );
  }
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RefundActionError('Enter a refund amount greater than zero.');
  }
  const pos = position(t.payments, t.refunds, t.status === 'CANCELLED' ? 0 : owes);
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
  const reason = input.reason?.trim() || (isOverpaymentRefund ? 'Overpayment — lines now covered by warranty, goodwill or internally' : t.cancellationReason) || '';
  if (!reason) {
    throw new RefundActionError('Enter the reason for this refund.');
  }

  // Two Finance officers at once: decide again with the Job Card / Vehicle
  // Service row locked, against payments and refunds as they are now, so two
  // refunds can never both fit into the same balance.
  const recorded = await retryOnNumberClash('referenceNumber', () => prisma.$transaction(async (tx) => {
    await lockExisting(tx, t.kind === 'JOB_CARD' ? 'jobCard' : 'vehicleService', [t.id], 'This record no longer exists — refresh the page.');
    // The same form, resent while the first was still being saved: hand back that refund.
    if (input.idempotencyKey) {
      const same = await tx.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, referenceNumber: true } });
      if (same) return { created: same, after: null, duplicate: true as const };
    }
    const fresh = t.kind === 'JOB_CARD'
      ? await tx.jobCard.findUnique({ where: { id: t.id }, select: { status: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } }, estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } } } })
      : await tx.vehicleService.findUnique({ where: { id: t.id }, select: { status: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } });
    if (!fresh || fresh.status !== t.status) {
      throw new RefundActionError('This record changed while you were recording the refund — refresh the page.');
    }
    const owesNow = fresh.status === 'CANCELLED' ? 0 : ('estimate' in fresh ? customerTotal(fresh.estimate?.lineItems ?? []) : 0);
    const now = position(fresh.payments, fresh.refunds, owesNow);
    if (toMinor(amount) > toMinor(now.remaining)) {
      throw new RefundActionError(
        now.remaining <= 0
          ? 'Another refund was recorded just now — everything owed back has been refunded. Refresh to see it.'
          : `Another refund was recorded just now — only ₦${now.remaining.toLocaleString('en-NG', { minimumFractionDigits: 2 })} remains to be refunded.`,
      );
    }
    const referenceNumber = await generateRefundNumber(tx);
    const created = await tx.refund.create({
      data: {
        idempotencyKey: input.idempotencyKey || null,
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
    return { created, after: position(fresh.payments, [...fresh.refunds, { amount }], owesNow), duplicate: false as const };
  }));
  if (recorded.duplicate) return { id: recorded.created.id, referenceNumber: recorded.created.referenceNumber };
  const refund = recorded.created;
  const referenceNumber = refund.referenceNumber;

  const after = recorded.after;
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
    const websiteUrl = websiteBaseUrl();
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
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send refund receipt email', referenceNumber, err);
  }
  return { id: refund.id, referenceNumber };
}

/** Every refund in the workshop — the Refunds register. Newest first,
 * searchable by RF-number, Job Card / Service number or customer. */
export async function listAllRefunds(search?: string) {
  await requireUser();
  const q = search?.trim();
  // The register shows only refunds on Job Cards / Vehicle Services within reach.
  const reach = await jobOrServiceReach();
  return prisma.refund.findMany({
    where: {
      AND: [
        reach,
        q
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
      : {},
      ],
    },
    orderBy: { recordedAt: 'desc' },
    take: 200,
    include: {
      recordedBy: { select: { fullName: true } },
      jobCard: { select: { id: true, jobNumber: true, customer: { select: { id: true, fullName: true } } } },
      vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { id: true, fullName: true } } } },
    },
  });
}
