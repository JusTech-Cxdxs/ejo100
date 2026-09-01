'use server';

/**
 * Sourcing — the two paths a Job Card's estimate can genuinely need once
 * work has actually started: Store-held parts (a Parts Request Slip,
 * approved by the Workshop HOD then Store, released by a Storekeeper) and
 * externally-sourced parts/jobs (a cash advance — request, Manager
 * approval, Finance disbursement). Which one(s) apply to a given Job Card
 * is never a human decision — it's read directly from the estimate's own
 * line item types.
 *
 * Both gated on the same 70%-paid threshold that already governs when the
 * estimate itself becomes visible (JobCard.status reaching IN_PROGRESS or
 * later) — reused directly, not reimplemented.
 *
 * Cross-cutting between Workshop and Store, so this lives as its own file
 * rather than inside either workshop.ts or store.ts — reuses the real,
 * already-verified auth helpers from both rather than duplicating them.
 */

import { prisma } from '@ejo/database';
import { pluralize } from '@/lib/utils/pluralize';
import { requireUser, writeAuditLog, requireEligibleManager, listEligibleFinanceOfficersForBranch } from './workshop';
import { requireStoreStaff } from './store';

class SourcingActionError extends Error {}

/** A Job Card is only far enough along to source anything once payment has
 * genuinely started work — the same real-world moment IN_PROGRESS already
 * marks. Anything at or past that point (including later stages like
 * Quality Check) can still legitimately need a late-discovered part. */
const SOURCEABLE_STATUSES = ['IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED'] as const;

/** PRS-2026-000001 — same year-prefixed, zero-padded sequence as
 * JC-/GRN- numbering elsewhere in this project. */
async function generatePartRequestSlipNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PRS-${year}-`;
  const latest = await prisma.partRequestSlip.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

/** EPR-2026-000001 */
async function generateExternalProcurementRequestNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EPR-${year}-`;
  const latest = await prisma.externalProcurementRequest.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

/** Finance Officer for the branch, or a Master Admin — same fallback
 * pattern as requireEligibleManager()/requireStoreStaff(), reusing the
 * already-exported list function rather than re-querying roles directly. */
async function requireEligibleFinance(branchId: string): Promise<{ id: string }> {
  const user = await requireUser();
  const officers = await listEligibleFinanceOfficersForBranch(branchId);
  const isEligible = officers.supervisors.some((s) => s.id === user.id);
  if (!isEligible) {
    throw new SourcingActionError('Only a Finance Officer for this branch, or a Master Administrator, can disburse this.');
  }
  return user;
}

/** The auto-detection itself — reads the Job Card's own estimate and
 * reports plainly what it actually needs, rather than making anyone
 * guess which flow applies. A Job Card with only labour/internal-job
 * lines needs neither; one with both store and external parts needs
 * both, shown as two separate, independent requests. */
export async function getJobCardSourcingNeeds(jobCardId: string) {
  await requireUser();
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      estimate: {
        select: {
          lineItems: {
            select: { id: true, type: true, description: true, quantity: true, amount: true },
          },
        },
      },
    },
  });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }

  const lineItems = jobCard.estimate?.lineItems ?? [];
  const storeLineItems = lineItems.filter((li: (typeof lineItems)[number]) => li.type === 'STORE_PART');
  const externalLineItems = lineItems.filter((li: (typeof lineItems)[number]) => li.type === 'EXTERNAL_PART' || li.type === 'EXTERNAL_JOB');

  const [existingPartRequestSlips, existingExternalProcurementRequests] = await Promise.all([
    prisma.partRequestSlip.findMany({
      where: { jobCardId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, referenceNumber: true },
    }),
    prisma.externalProcurementRequest.findMany({
      where: { jobCardId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, referenceNumber: true },
    }),
  ]);

  return {
    isEligibleToSource: SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number]),
    needsStoreParts: storeLineItems.length > 0,
    needsExternalProcurement: externalLineItems.length > 0,
    storeLineItems,
    externalLineItems,
    existingPartRequestSlips,
    existingExternalProcurementRequests,
  };
}

/** Only ever touches JobCard.status if it's currently IN_PROGRESS or
 * AWAITING_PARTS — never clobbers a status that's genuinely moved past
 * this point (e.g. Quality Check), even if a request is somehow still
 * outstanding at that stage. */
async function syncJobCardSourcingStatus(jobCardId: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true } });
  if (!jobCard) return;
  if (jobCard.status !== 'IN_PROGRESS' && jobCard.status !== 'AWAITING_PARTS') return;

  const [outstandingSlips, outstandingRequests] = await Promise.all([
    prisma.partRequestSlip.count({ where: { jobCardId, status: { notIn: ['RELEASED', 'REJECTED'] } } }),
    prisma.externalProcurementRequest.count({ where: { jobCardId, status: { notIn: ['DISBURSED', 'REJECTED'] } } }),
  ]);
  const hasOutstanding = outstandingSlips > 0 || outstandingRequests > 0;

  if (hasOutstanding && jobCard.status !== 'AWAITING_PARTS') {
    await prisma.jobCard.update({ where: { id: jobCardId }, data: { status: 'AWAITING_PARTS' } });
  } else if (!hasOutstanding && jobCard.status === 'AWAITING_PARTS') {
    await prisma.jobCard.update({ where: { id: jobCardId }, data: { status: 'IN_PROGRESS' } });
  }
}

export async function getPartRequestSlip(id: string) {
  await requireUser();
  return prisma.partRequestSlip.findUnique({
    where: { id },
    include: {
      jobCard: { select: { id: true, jobNumber: true } },
      requestedBy: { select: { fullName: true } },
      hodApprovedBy: { select: { fullName: true } },
      storeApprovedBy: { select: { fullName: true } },
      releasedBy: { select: { fullName: true } },
      receivedByUser: { select: { fullName: true } },
      rejectedBy: { select: { fullName: true } },
      lines: {
        include: {
          part: { select: { id: true, name: true, baseUnitOfMeasure: true, trackingType: true } },
          estimateLineItem: { select: { description: true } },
        },
      },
    },
  });
}

export async function listPartRequestSlips(branchId: string, search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.partRequestSlip.findMany({
    where: {
      branchId,
      ...(q
        ? {
            OR: [
              { referenceNumber: { contains: q, mode: 'insensitive' } },
              { jobCard: { jobNumber: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      jobCard: { select: { id: true, jobNumber: true } },
      requestedBy: { select: { fullName: true } },
      lines: { select: { id: true } },
    },
  });
}

export async function getExternalProcurementRequest(id: string) {
  await requireUser();
  return prisma.externalProcurementRequest.findUnique({
    where: { id },
    include: {
      jobCard: { select: { id: true, jobNumber: true } },
      requestedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      disbursedBy: { select: { fullName: true } },
      rejectedBy: { select: { fullName: true } },
      estimateLineItem: { select: { description: true } },
    },
  });
}

export async function listExternalProcurementRequests(branchId: string, search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.externalProcurementRequest.findMany({
    where: {
      branchId,
      ...(q
        ? {
            OR: [
              { referenceNumber: { contains: q, mode: 'insensitive' } },
              { jobCard: { jobNumber: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { jobCard: { select: { id: true, jobNumber: true } }, requestedBy: { select: { fullName: true } } },
  });
}

export type RequestPartRequestSlipLineInput = {
  partId: string;
  estimateLineItemId?: string;
  quantityRequested: number;
};

/** Raises a Store parts request — the first of the three real approval
 * steps (Workshop HOD next, then Store, then release). Immediately moves
 * the Job Card to AWAITING_PARTS if it isn't already there. */
export async function requestPartRequestSlip(jobCardId: string, lines: RequestPartRequestSlipLineInput[]): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, branchId: true } });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }
  if (!SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number])) {
    throw new SourcingActionError("This Job Card isn't far enough along to request parts yet — it needs to be at least In Progress (70% paid).");
  }
  if (!lines || lines.length === 0) {
    throw new SourcingActionError('At least one line is required.');
  }
  for (const line of lines) {
    if (!(line.quantityRequested > 0)) {
      throw new SourcingActionError('Quantity requested must be greater than zero for every line.');
    }
  }

  const referenceNumber = await generatePartRequestSlipNumber();
  const slip = await prisma.partRequestSlip.create({
    data: {
      referenceNumber,
      jobCardId,
      branchId: jobCard.branchId,
      requestedById: user.id,
      lines: {
        create: lines.map((l) => ({
          partId: l.partId,
          estimateLineItemId: l.estimateLineItemId,
          quantityRequested: l.quantityRequested,
        })),
      },
    },
  });

  await syncJobCardSourcingStatus(jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.requested',
    entityType: 'PartRequestSlip',
    entityId: slip.id,
    metadata: { referenceNumber, lineCount: lines.length },
  });
  // Every stage of this request also lands on the Job Card's own
  // audit trail, with the real reference number — the Job Card is
  // the "mother record" for everything that happens against it, so
  // its own timeline should show that sourcing happened at all, even
  // though the full, detailed timeline for this specific request
  // still lives on the request's own page.
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.requested',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { referenceNumber, lineCount: lines.length },
  });

  return { id: slip.id, referenceNumber };
}

/** Step one of three — the Workshop HOD confirming the request itself is
 * legitimate, before Store ever looks at stock availability. */
export async function approvePartRequestSlipByHod(slipId: string, notes?: string): Promise<void> {
  const slip = await prisma.partRequestSlip.findUnique({ where: { id: slipId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true } });
  if (!slip) {
    throw new SourcingActionError('Request not found.');
  }
  if (slip.status !== 'PENDING_HOD_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting HOD approval.');
  }
  const user = await requireEligibleManager(slip.branchId);
  await prisma.partRequestSlip.update({
    where: { id: slipId },
    data: { status: 'PENDING_STORE_APPROVAL', hodApprovedById: user.id, hodApprovedAt: new Date(), hodNotes: notes?.trim() || undefined },
  });
  await writeAuditLog({ userId: user.id, action: 'part_request_slip.hod_approved', entityType: 'PartRequestSlip', entityId: slipId });
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.hod_approved',
    entityType: 'JobCard',
    entityId: slip.jobCardId,
    metadata: { referenceNumber: slip.referenceNumber },
  });
}

/** Step two of three — Store confirming and reserving the actual stock.
 * Reservation happens here, not at release, specifically so a second
 * request approved moments later can't be promised the same units this
 * one already claimed. Checks every line's real availability (on hand
 * minus already reserved) before reserving any of them. */
export async function approvePartRequestSlipByStore(slipId: string, notes?: string): Promise<void> {
  const slip = await prisma.partRequestSlip.findUnique({
    where: { id: slipId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      referenceNumber: true,
      lines: { select: { id: true, partId: true, quantityRequested: true, part: { select: { name: true } } } },
    },
  });
  if (!slip) {
    throw new SourcingActionError('Request not found.');
  }
  if (slip.status !== 'PENDING_STORE_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting Store approval.');
  }
  const user = await requireStoreStaff(slip.branchId);

  for (const line of slip.lines) {
    const stock = await prisma.partStock.findUnique({ where: { partId: line.partId } });
    const available = Number(stock?.quantityOnHand ?? 0) - Number(stock?.quantityReserved ?? 0);
    if (available < Number(line.quantityRequested)) {
      throw new SourcingActionError(
        `Not enough available stock for ${line.part.name} — ${available} available, ${Number(line.quantityRequested)} requested.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const line of slip.lines) {
      await tx.partStock.update({ where: { partId: line.partId }, data: { quantityReserved: { increment: line.quantityRequested } } });
    }
    await tx.partRequestSlip.update({
      where: { id: slipId },
      data: { status: 'APPROVED', storeApprovedById: user.id, storeApprovedAt: new Date(), storeNotes: notes?.trim() || undefined },
    });
  });

  await writeAuditLog({ userId: user.id, action: 'part_request_slip.store_approved', entityType: 'PartRequestSlip', entityId: slipId });
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.store_approved',
    entityType: 'JobCard',
    entityId: slip.jobCardId,
    metadata: { referenceNumber: slip.referenceNumber },
  });
}

/** Step three of three — a Storekeeper physically releasing it. Full
 * release only for this first version, not partial/backorder — every
 * line's complete requested quantity is released at once. Converts the
 * reservation into the actual, permanent stock reduction: decrements the
 * aggregate, and updates whichever tracking-type-specific record applies
 * (oldest batches first for BATCH parts, the specific confirmed units for
 * SERIALIZED ones) — the mirror image of how Goods Receipt adds stock in
 * the first place. */
export async function releasePartRequestSlip(
  slipId: string,
  receivedBy: { receivedByUserId?: string; receivedByName?: string },
  lineSerials?: Record<string, string[]>,
): Promise<void> {
  const slip = await prisma.partRequestSlip.findUnique({
    where: { id: slipId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      referenceNumber: true,
      lines: {
        select: {
          id: true,
          partId: true,
          quantityRequested: true,
          part: { select: { name: true, trackingType: true } },
        },
      },
    },
  });
  if (!slip) {
    throw new SourcingActionError('Request not found.');
  }
  if (slip.status !== 'APPROVED') {
    throw new SourcingActionError('This request has not been approved for release.');
  }
  if (!receivedBy.receivedByUserId && !receivedBy.receivedByName?.trim()) {
    throw new SourcingActionError('Who is collecting this must be recorded — either a real user or a name.');
  }
  const user = await requireStoreStaff(slip.branchId);

  // Validated up front, before any writes: a SERIALIZED line's provided
  // serials must match its requested quantity exactly, and every one of
  // them must genuinely be a real, currently in-stock unit of that part
  // — never silently accepted if it doesn't exist or was already issued.
  for (const line of slip.lines) {
    if (line.part.trackingType === 'SERIALIZED') {
      const serials = (lineSerials?.[line.id] ?? []).map((s) => s.trim()).filter(Boolean);
      if (serials.length !== Number(line.quantityRequested)) {
        throw new SourcingActionError(
          `${line.part.name}: ${pluralize(serials.length, 'serial number')} provided, but ${Number(line.quantityRequested)} requested. These must match exactly.`,
        );
      }
      const inStockCount = await prisma.partSerial.count({
        where: { partId: line.partId, serialNumber: { in: serials }, status: 'IN_STOCK' },
      });
      if (inStockCount !== serials.length) {
        throw new SourcingActionError(`${line.part.name}: one or more of the serial numbers provided aren't currently in stock for this part.`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const line of slip.lines) {
      const qty = Number(line.quantityRequested);
      await tx.partStock.update({
        where: { partId: line.partId },
        data: { quantityOnHand: { decrement: qty }, quantityReserved: { decrement: qty } },
      });

      if (line.part.trackingType === 'BATCH') {
        let remaining = qty;
        const batches = await tx.partBatch.findMany({
          where: { partId: line.partId, remainingQuantity: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        });
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(batch.remainingQuantity));
          await tx.partBatch.update({ where: { id: batch.id }, data: { remainingQuantity: { decrement: take } } });
          remaining -= take;
        }
        if (remaining > 0) {
          // Batch records didn't fully cover the released quantity —
          // the aggregate is still correct (decremented above), but
          // this is a real data-integrity signal worth knowing about,
          // not silently swallowed.
          // eslint-disable-next-line no-console
          console.error('Batch records did not cover the full released quantity', line.partId, remaining);
        }
      } else if (line.part.trackingType === 'SERIALIZED') {
        const serials = (lineSerials?.[line.id] ?? []).map((s) => s.trim()).filter(Boolean);
        for (const serialNumber of serials) {
          await tx.partSerial.updateMany({
            where: { partId: line.partId, serialNumber, status: 'IN_STOCK' },
            data: { status: 'ISSUED' },
          });
        }
      }

      await tx.partRequestSlipLine.update({ where: { id: line.id }, data: { quantityReleased: qty } });
    }

    await tx.partRequestSlip.update({
      where: { id: slipId },
      data: {
        status: 'RELEASED',
        releasedById: user.id,
        releasedAt: new Date(),
        receivedByUserId: receivedBy.receivedByUserId,
        receivedByName: receivedBy.receivedByName?.trim() || undefined,
      },
    });
  });

  await syncJobCardSourcingStatus(slip.jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.released',
    entityType: 'PartRequestSlip',
    entityId: slipId,
    metadata: { receivedByUserId: receivedBy.receivedByUserId, receivedByName: receivedBy.receivedByName },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.released',
    entityType: 'JobCard',
    entityId: slip.jobCardId,
    metadata: { referenceNumber: slip.referenceNumber, receivedByUserId: receivedBy.receivedByUserId, receivedByName: receivedBy.receivedByName },
  });
}

/** Rejectable at either stage still pending a decision — by whoever would
 * have approved at that same stage (HOD if still awaiting HOD, Store if
 * already past HOD and awaiting Store). Never rejectable once APPROVED,
 * since stock is reserved by then — a wrong reservation is unwound by a
 * real Manager/Store conversation, not a status flip. */
export async function rejectPartRequestSlip(slipId: string, reason: string): Promise<void> {
  const slip = await prisma.partRequestSlip.findUnique({ where: { id: slipId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true } });
  if (!slip) {
    throw new SourcingActionError('Request not found.');
  }
  if (slip.status !== 'PENDING_HOD_APPROVAL' && slip.status !== 'PENDING_STORE_APPROVAL') {
    throw new SourcingActionError('This request can no longer be rejected.');
  }
  if (!reason?.trim()) {
    throw new SourcingActionError('A reason is required.');
  }
  const stage = slip.status === 'PENDING_HOD_APPROVAL' ? 'HOD' : 'STORE';
  const user = stage === 'HOD' ? await requireEligibleManager(slip.branchId) : await requireStoreStaff(slip.branchId);

  await prisma.partRequestSlip.update({
    where: { id: slipId },
    data: { status: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionStage: stage, rejectionReason: reason.trim() },
  });

  await syncJobCardSourcingStatus(slip.jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.rejected',
    entityType: 'PartRequestSlip',
    entityId: slipId,
    metadata: { stage, reason: reason.trim() },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.rejected',
    entityType: 'JobCard',
    entityId: slip.jobCardId,
    metadata: { referenceNumber: slip.referenceNumber, stage, reason: reason.trim() },
  });
}

/** Raises an external procurement request — a genuine cash advance
 * (an imprest, in real accounting terms) for a part or job the Store
 * doesn't carry. Immediately moves the Job Card to AWAITING_PARTS if it
 * isn't already there. */
export async function requestExternalProcurement(
  jobCardId: string,
  description: string,
  estimatedAmount: number,
  estimateLineItemId?: string,
): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, branchId: true } });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }
  if (!SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number])) {
    throw new SourcingActionError("This Job Card isn't far enough along to request procurement yet — it needs to be at least In Progress (70% paid).");
  }
  if (!description?.trim()) {
    throw new SourcingActionError('A description is required.');
  }
  if (!(estimatedAmount > 0)) {
    throw new SourcingActionError('Estimated amount must be greater than zero.');
  }

  const referenceNumber = await generateExternalProcurementRequestNumber();
  const request = await prisma.externalProcurementRequest.create({
    data: {
      referenceNumber,
      jobCardId,
      branchId: jobCard.branchId,
      estimateLineItemId,
      requestedById: user.id,
      description: description.trim(),
      estimatedAmount,
    },
  });

  await syncJobCardSourcingStatus(jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.requested',
    entityType: 'ExternalProcurementRequest',
    entityId: request.id,
    metadata: { referenceNumber, estimatedAmount },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.requested',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { referenceNumber, estimatedAmount },
  });

  return { id: request.id, referenceNumber };
}

/** A Workshop Manager confirming the request itself, before any money
 * moves — the same gate structure as the Store side's HOD step. */
export async function approveExternalProcurementRequest(requestId: string, notes?: string): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true } });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_MANAGER_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting approval.');
  }
  const user = await requireEligibleManager(request.branchId);
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: { status: 'APPROVED', managerApprovedById: user.id, managerApprovedAt: new Date(), managerNotes: notes?.trim() || undefined },
  });
  await writeAuditLog({ userId: user.id, action: 'external_procurement.approved', entityType: 'ExternalProcurementRequest', entityId: requestId });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.approved',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber },
  });
}

/** Finance actually handing over the cash advance — the real amount
 * given, which may differ slightly from the original estimate, kept as
 * its own field rather than overwriting it. */
export async function disburseExternalProcurementRequest(requestId: string, disbursedAmount: number): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true } });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'APPROVED') {
    throw new SourcingActionError('This request has not been approved for disbursement.');
  }
  if (!(disbursedAmount > 0)) {
    throw new SourcingActionError('Disbursed amount must be greater than zero.');
  }
  const user = await requireEligibleFinance(request.branchId);
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: { status: 'DISBURSED', disbursedById: user.id, disbursedAt: new Date(), disbursedAmount },
  });

  await syncJobCardSourcingStatus(request.jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.disbursed',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
    metadata: { disbursedAmount },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.disbursed',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber, disbursedAmount },
  });
}

/** Rejectable only before a Manager has approved it — once approved, an
 * unwind is a real conversation between Manager and Finance, not a
 * status flip, the same reasoning as the Store side never un-reserving
 * via rejection either. */
export async function rejectExternalProcurementRequest(requestId: string, reason: string): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true } });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_MANAGER_APPROVAL') {
    throw new SourcingActionError('This request can no longer be rejected.');
  }
  if (!reason?.trim()) {
    throw new SourcingActionError('A reason is required.');
  }
  const user = await requireEligibleManager(request.branchId);
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionReason: reason.trim() },
  });

  await syncJobCardSourcingStatus(request.jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.rejected',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
    metadata: { reason: reason.trim() },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.rejected',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber, reason: reason.trim() },
  });
}
