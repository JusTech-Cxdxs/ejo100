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
import { requireUser, writeAuditLog, requireEligibleManager, listEligibleFinanceOfficersForBranch, listEligibleManagersForBranch } from './workshop';
import { requireStoreStaff, listEligibleStoreOfficersForBranch, listEligibleStoreManagersForBranch } from './store';
import { sendEmail } from '@/lib/email';
import { renderPartRequestApprovalNeededEmail, renderPartRequestStatusEmail } from '@/lib/email-templates/part-request-status';
import { renderExternalProcurementApprovalNeededEmail, renderExternalProcurementStatusEmail } from '@/lib/email-templates/external-procurement-status';

/** Mirrors getStoreOrgContext()/getWorkshopOrgContext() exactly, but
 * scoped directly to a real branchId rather than a fixed department
 * slug — this workflow's own emails genuinely span both the Workshop
 * side (requesting, HOD approval) and the Store side (approval,
 * release), so no single department name would ever be honestly
 * correct for every recipient. */
async function getSourcingOrgContext(branchId: string, departmentName: string): Promise<{ companyName: string; branchName: string; departmentName: string }> {
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    select: { name: true, businessUnit: { select: { company: { select: { name: true } } } } },
  });
  return { companyName: branch.businessUnit.company.name, branchName: branch.name, departmentName };
}

/** The one real query every email this whole request chain sends
 * needs — fetched once, reused everywhere, so every stage's own email
 * shows the exact same real Job Card/vehicle picture, never a
 * slightly different one assembled separately each time. */
async function getPartRequestEmailContext(jobCardId: string) {
  const jobCard = await prisma.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    select: {
      jobNumber: true,
      branchId: true,
      supervisorId: true,
      assignedTechnicianId: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
      department: { select: { name: true } },
    },
  });
  // A Job Card's own department is genuinely optional in the real
  // schema (departmentId String?) — a real, live bug this fixes: the
  // first version assumed it was always present and crashed in
  // production the moment a Job Card with no department set actually
  // reached this code. "Workshop" is an honest, generic fallback,
  // never a guess at which specific department it might have been.
  return { ...jobCard, departmentName: jobCard.department?.name ?? 'Workshop' };
}

/** The Technician and Supervisor both hear about every real stage
 * this request moves through — the Supervisor's own genuine ability
 * to follow up depends on actually knowing what's happening, not
 * just the Technician who happened to raise it in the first place. */
async function notifyTechnicianAndSupervisorOfPartRequestStatus(
  jobCardId: string,
  slipId: string,
  referenceNumber: string,
  kind: 'hod_approved' | 'store_approved' | 'released' | 'rejected',
  rejectionReason?: string,
): Promise<void> {
  try {
    const jobCard = await getPartRequestEmailContext(jobCardId);
    const recipientIds = [jobCard.supervisorId, jobCard.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { fullName: true, email: true } });
    const orgContext = await getSourcingOrgContext(jobCard.branchId, jobCard.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `Parts request ${kind === 'rejected' ? 'rejected' : 'update'} — ${referenceNumber}`,
        renderPartRequestStatusEmail({
          recipientName: recipient.fullName,
          kind,
          referenceNumber,
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          rejectionReason,
          requestUrl: `${portalUrl}/workshop/parts-requests/${slipId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send Parts Request status emails', referenceNumber, err);
  }
}

/** Mirrors notifyTechnicianAndSupervisorOfPartRequestStatus() exactly
 * — External Procurement's own version, for its own four real
 * stages. getPartRequestEmailContext() is reused as-is here rather
 * than duplicated: it's already generic to any Job Card, nothing in
 * it is specific to Store Parts. */
async function notifyTechnicianAndSupervisorOfExternalProcurementStatus(
  jobCardId: string,
  requestId: string,
  referenceNumber: string,
  kind: 'sent_to_manager' | 'approved' | 'disbursed' | 'rejected',
  amount?: number,
  rejectionReason?: string,
): Promise<void> {
  try {
    const jobCard = await getPartRequestEmailContext(jobCardId);
    const recipientIds = [jobCard.supervisorId, jobCard.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { fullName: true, email: true } });
    const orgContext = await getSourcingOrgContext(jobCard.branchId, jobCard.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `Procurement request ${kind === 'rejected' ? 'rejected' : 'update'} — ${referenceNumber}`,
        renderExternalProcurementStatusEmail({
          recipientName: recipient.fullName,
          kind,
          referenceNumber,
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          amount,
          rejectionReason,
          requestUrl: `${portalUrl}/workshop/external-procurement/${requestId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send External Procurement status emails', referenceNumber, err);
  }
}

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

  // The real, accurate signal for whether there's still something new
  // to request — reusing the exact same eligibility check each
  // request page already uses to decide what it can show, rather than
  // a looser "is anything currently active" check that would keep
  // showing the button even once every real line has already been
  // successfully released or disbursed, with nothing new to raise.
  const [requestablePartLines, requestableExternalLines] = await Promise.all([
    getRequestablePartRequestLines(jobCardId),
    getRequestableExternalProcurementLines(jobCardId),
  ]);

  return {
    isEligibleToSource: SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number]),
    needsStoreParts: storeLineItems.length > 0,
    needsExternalProcurement: externalLineItems.length > 0,
    hasRequestablePartLines: requestablePartLines.length > 0,
    hasRequestableExternalLines: requestableExternalLines.length > 0,
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
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          supervisorId: true,
          assignedTechnicianId: true,
          customer: { select: { fullName: true } },
          vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
        },
      },
      requestedBy: { select: { fullName: true } },
      hodApprovedBy: { select: { fullName: true } },
      storeApprovedBy: { select: { fullName: true } },
      releasedBy: { select: { fullName: true } },
      receivedByUser: { select: { fullName: true } },
      rejectedBy: { select: { fullName: true } },
      lines: {
        include: {
          part: {
            select: {
              id: true,
              name: true,
              partNumber: true,
              baseUnitOfMeasure: true,
              trackingType: true,
              // Every serial genuinely available right now, in real
              // FIFO order (earliest-received first) — the same real
              // order Store's own batch-tracked stock already uses.
              // Fetched here so the release form can offer a real,
              // live, searchable pick instead of free text that could
              // easily drift from what's actually in stock.
              serials: { where: { status: 'IN_STOCK' }, orderBy: { receivedAt: 'asc' }, select: { serialNumber: true, receivedAt: true } },
            },
          },
          estimateLineItem: { select: { description: true, unitPrice: true, amount: true } },
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
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          assignedTechnician: { select: { fullName: true } },
          customer: { select: { fullName: true } },
          vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
        },
      },
      requestedBy: { select: { fullName: true } },
      financeReviewedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      disbursedBy: { select: { fullName: true } },
      rejectedBy: { select: { fullName: true } },
      estimateLineItem: { select: { description: true } },
      lines: { include: { estimateLineItem: { select: { type: true } } } },
      supplementaryLines: { orderBy: { createdAt: 'asc' }, include: { addedBy: { select: { fullName: true } } } },
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

/** Every real Store Part line for this Job Card that's actually ready
 * to request — matched to a real catalog Part (Store already did
 * that work back at estimate time) and not already covered by an
 * earlier, still-active request. There's genuinely nothing left for
 * a human to pick here: the Part, the quantity, the unit, and the
 * price were all decided the moment Store matched the line — this
 * just finds what's real and waiting. */
export async function getRequestablePartRequestLines(jobCardId: string) {
  await requireUser();
  const [estimate, existingSlips] = await Promise.all([
    prisma.estimate.findUnique({
      where: { jobCardId },
      select: {
        lineItems: {
          where: { type: 'STORE_PART', matchedPartId: { not: null } },
          select: {
            id: true,
            description: true,
            quantity: true,
            unitOfMeasure: true,
            amount: true,
            matchedPartId: true,
            matchedPart: { select: { id: true, name: true, partNumber: true } },
            partType: { select: { name: true } },
          },
        },
      },
    }),
    prisma.partRequestSlip.findMany({
      where: { jobCardId, status: { not: 'REJECTED' } },
      select: { lines: { select: { estimateLineItemId: true } } },
    }),
  ]);
  const alreadyRequestedLineIds = new Set(
    existingSlips.flatMap((s: (typeof existingSlips)[number]) => s.lines.map((l: { estimateLineItemId: string | null }) => l.estimateLineItemId).filter(Boolean)),
  );
  return (estimate?.lineItems ?? []).filter((li: { id: string }) => !alreadyRequestedLineIds.has(li.id));
}

/** Raises a Store parts request — the first of the three real approval
 * steps (Workshop HOD next, then Store, then release). Immediately moves
 * the Job Card to AWAITING_PARTS if it isn't already there. Deliberately
 * takes no Part/quantity input at all: everything real about what's
 * being requested (which Part, how many, what it costs) was already
 * decided the moment Store matched each line back at estimate time —
 * this only ever pulls that, in full, never lets anyone re-enter or
 * second-guess it here. */
export async function requestPartRequestSlip(jobCardId: string): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, branchId: true } });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }
  if (!SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number])) {
    throw new SourcingActionError("This Job Card isn't far enough along to request parts yet — it needs to be at least In Progress (70% paid).");
  }
  const requestableLines = await getRequestablePartRequestLines(jobCardId);
  if (requestableLines.length === 0) {
    throw new SourcingActionError('There are no matched Store Part lines ready to request — everything has already been requested, or nothing has been matched yet.');
  }

  const referenceNumber = await generatePartRequestSlipNumber();
  const slip = await prisma.partRequestSlip.create({
    data: {
      referenceNumber,
      jobCardId,
      branchId: jobCard.branchId,
      requestedById: user.id,
      lines: {
        create: requestableLines.map((l: (typeof requestableLines)[number]) => ({
          partId: l.matchedPartId as string,
          estimateLineItemId: l.id,
          quantityRequested: l.quantity,
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
    metadata: { referenceNumber, lineCount: requestableLines.length },
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
    metadata: { referenceNumber, lineCount: requestableLines.length },
  });

  try {
    const [emailContext, managers, requestedByUser, lineDetails] = await Promise.all([
      getPartRequestEmailContext(jobCardId),
      listEligibleManagersForBranch(jobCard.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
      prisma.partRequestSlipLine.findMany({
        where: { slipId: slip.id },
        select: { quantityRequested: true, part: { select: { name: true, baseUnitOfMeasure: true } } },
      }),
    ]);
    const orgContext = await getSourcingOrgContext(jobCard.branchId, emailContext.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Parts request needs your approval — ${referenceNumber}`,
        renderPartRequestApprovalNeededEmail({
          recipientName: manager.fullName,
          requestedByName: requestedByUser?.fullName ?? 'A team member',
          referenceNumber,
          jobNumber: emailContext.jobNumber,
          customerName: emailContext.customer.fullName,
          vehicle: emailContext.vehicle,
          requestedAt: new Date(),
          lines: lineDetails.map((l: (typeof lineDetails)[number]) => ({ partName: l.part.name, quantity: Number(l.quantityRequested), baseUnitOfMeasure: l.part.baseUnitOfMeasure })),
          approvalUrl: `${portalUrl}/workshop/parts-requests/${slip.id}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send Parts Request approval-needed emails', referenceNumber, err);
  }

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

  await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'hod_approved');

  // Now Store's own turn — the same real "approval needed" email as
  // the HOD's own, just addressed to whoever can actually approve and
  // reserve stock next.
  try {
    const [emailContext, storeOfficers, storeManagers, lineDetails] = await Promise.all([
      getPartRequestEmailContext(slip.jobCardId),
      listEligibleStoreOfficersForBranch(slip.branchId),
      listEligibleStoreManagersForBranch(slip.branchId),
      prisma.partRequestSlipLine.findMany({
        where: { slipId },
        select: { quantityRequested: true, part: { select: { name: true, baseUnitOfMeasure: true } } },
      }),
    ]);
    const storeRecipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...storeOfficers.staff, ...storeManagers.staff]) {
      storeRecipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getSourcingOrgContext(slip.branchId, emailContext.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const recipient of storeRecipients.values()) {
      await sendEmail(
        recipient.email,
        `Parts request needs your approval — ${slip.referenceNumber}`,
        renderPartRequestApprovalNeededEmail({
          recipientName: recipient.fullName,
          requestedByName: 'The Workshop HOD',
          referenceNumber: slip.referenceNumber,
          jobNumber: emailContext.jobNumber,
          customerName: emailContext.customer.fullName,
          vehicle: emailContext.vehicle,
          requestedAt: new Date(),
          lines: lineDetails.map((l: (typeof lineDetails)[number]) => ({ partName: l.part.name, quantity: Number(l.quantityRequested), baseUnitOfMeasure: l.part.baseUnitOfMeasure })),
          approvalUrl: `${portalUrl}/workshop/parts-requests/${slipId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send Parts Request Store-approval-needed emails', slip.referenceNumber, err);
  }
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

  await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'store_approved');
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

  await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'released');
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

  await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'rejected', reason.trim());
}

/** Raises an external procurement request — a genuine cash advance
 * (an imprest, in real accounting terms) for a part or job the Store
 * doesn't carry. Immediately moves the Job Card to AWAITING_PARTS if it
 * isn't already there. */
/** Every real External Part/External Job line on this Job Card's own
 * estimate that's ready to request — already priced (by whoever had
 * pricing authority for that line type, back at estimate time) and
 * not already covered by an earlier, still-active request. Same
 * reasoning as the Store Parts side: nothing here needs a human to
 * re-enter it, it's a real fact the estimate already holds. */
export async function getRequestableExternalProcurementLines(jobCardId: string) {
  await requireUser();
  const [estimate, existingRequests] = await Promise.all([
    prisma.estimate.findUnique({
      where: { jobCardId },
      select: {
        lineItems: {
          where: { type: { in: ['EXTERNAL_PART', 'EXTERNAL_JOB'] }, amount: { not: null } },
          select: { id: true, description: true, quantity: true, unitOfMeasure: true, amount: true, type: true },
        },
      },
    }),
    prisma.externalProcurementRequest.findMany({
      where: { jobCardId, status: { not: 'REJECTED' } },
      select: {
        estimateLineItemId: true,
        lines: { select: { estimateLineItemId: true } },
      },
    }),
  ]);
  // Covers both the legacy single-line shape (estimateLineItemId on
  // the request itself) and the real, current multi-line shape (each
  // real line has its own) — a request raised either way correctly
  // keeps its covered lines out of what's still requestable.
  const alreadyRequestedLineIds = new Set(
    existingRequests.flatMap((r: { estimateLineItemId: string | null; lines: { estimateLineItemId: string | null }[] }) => [
      r.estimateLineItemId,
      ...r.lines.map((l) => l.estimateLineItemId),
    ]).filter(Boolean),
  );
  return (estimate?.lineItems ?? []).filter((li: { id: string }) => !alreadyRequestedLineIds.has(li.id));
}

/** The real fix for a genuine complaint: a Lathe job and a Bushing
 * both needed for the same repair are one real trip to Finance for
 * cash, not two separate, unconnected ones — raising them one at a
 * time, each its own request with its own reference number and its
 * own approval chain, was never right. This raises every currently-
 * eligible External Part/Job line together as ONE real request, with
 * ONE reference number, ONE combined total, and ONE approval chain
 * from here through disbursement — the same real shape Store Parts
 * already has, not a UI convenience wrapped around several separate
 * records underneath. */
export async function requestExternalProcurementBatch(jobCardId: string): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, branchId: true } });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }
  if (!SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number])) {
    throw new SourcingActionError("This Job Card isn't far enough along to request procurement yet — it needs to be at least In Progress (70% paid).");
  }
  const requestableLines = await getRequestableExternalProcurementLines(jobCardId);
  if (requestableLines.length === 0) {
    throw new SourcingActionError('There is nothing ready to request — either every line has already been requested, or nothing is priced yet.');
  }
  // The one real total for the whole request — the sum of every real
  // line's own already-approved amount, locked in right here and
  // never recomputed later, the same "locked the moment it's
  // submitted" reasoning the single-line version always had.
  const estimatedAmount = requestableLines.reduce((sum: number, l: (typeof requestableLines)[number]) => sum + Number(l.amount), 0);
  const description = requestableLines.map((l: (typeof requestableLines)[number]) => l.description).join(', ');

  const referenceNumber = await generateExternalProcurementRequestNumber();
  const request = await prisma.externalProcurementRequest.create({
    data: {
      referenceNumber,
      jobCardId,
      branchId: jobCard.branchId,
      requestedById: user.id,
      description,
      estimatedAmount,
      lines: {
        create: requestableLines.map((l: (typeof requestableLines)[number]) => ({
          estimateLineItemId: l.id,
          description: l.description,
          quantity: l.quantity,
          unitOfMeasure: l.unitOfMeasure,
          amount: Number(l.amount),
        })),
      },
    },
  });

  await syncJobCardSourcingStatus(jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.requested',
    entityType: 'ExternalProcurementRequest',
    entityId: request.id,
    metadata: { referenceNumber, estimatedAmount, lineCount: requestableLines.length },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.requested',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { referenceNumber, estimatedAmount, lineCount: requestableLines.length },
  });

  // Finance reviews first, so they're the first real recipient — one
  // real email for the whole request, showing every real line
  // together, exactly the way the request itself now actually works.
  try {
    const [emailContext, financeOfficers, requestedByUser] = await Promise.all([
      getPartRequestEmailContext(jobCardId),
      listEligibleFinanceOfficersForBranch(jobCard.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const orgContext = await getSourcingOrgContext(jobCard.branchId, emailContext.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const officer of financeOfficers.supervisors) {
      await sendEmail(
        officer.email,
        `Procurement request needs your review — ${referenceNumber}`,
        renderExternalProcurementApprovalNeededEmail({
          recipientName: officer.fullName,
          requestedByName: requestedByUser?.fullName ?? 'A team member',
          referenceNumber,
          jobNumber: emailContext.jobNumber,
          customerName: emailContext.customer.fullName,
          lines: requestableLines.map((l: (typeof requestableLines)[number]) => ({ description: l.description, quantity: Number(l.quantity), unitOfMeasure: l.unitOfMeasure, amount: Number(l.amount) })),
          estimatedAmount,
          approvalUrl: `${portalUrl}/workshop/external-procurement/${request.id}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send External Procurement approval-needed email', referenceNumber, err);
  }

  return { id: request.id, referenceNumber };
}

/** Finance's own real addition — transport, logistics, or any other
 * genuine supplementary cost the technician's original request could
 * never have anticipated. Deliberately cannot touch the technician's
 * own description or estimatedAmount at all — this only ever creates
 * a new, separate line alongside it. */
export async function addExternalProcurementSupplementaryLine(requestId: string, description: string, amount: number): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { status: true, branchId: true } });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_FINANCE_REVIEW') {
    throw new SourcingActionError('This request is not currently open for Finance to add to.');
  }
  const trimmedDescription = description?.trim();
  if (!trimmedDescription) {
    throw new SourcingActionError('A description is required for this line.');
  }
  if (!(amount > 0)) {
    throw new SourcingActionError('Amount must be greater than zero.');
  }
  const user = await requireEligibleFinance(request.branchId);
  const line = await prisma.externalProcurementSupplementaryLine.create({
    data: { requestId, description: trimmedDescription, amount, addedById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.supplementary_line_added',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
    metadata: { description: trimmedDescription, amount, lineId: line.id },
  });
}

export async function removeExternalProcurementSupplementaryLine(lineId: string): Promise<void> {
  const line = await prisma.externalProcurementSupplementaryLine.findUnique({
    where: { id: lineId },
    select: { requestId: true, description: true, request: { select: { status: true, branchId: true } } },
  });
  if (!line) {
    throw new SourcingActionError('Line not found.');
  }
  if (line.request.status !== 'PENDING_FINANCE_REVIEW') {
    throw new SourcingActionError('This request is not currently open for Finance to edit.');
  }
  const user = await requireEligibleFinance(line.request.branchId);
  await prisma.externalProcurementSupplementaryLine.delete({ where: { id: lineId } });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.supplementary_line_removed',
    entityType: 'ExternalProcurementRequest',
    entityId: line.requestId,
    metadata: { description: line.description },
  });
}

/** The same real correction/edit path already proven elsewhere in this
 * system (a Goods Receipt line's own cost, a Part's own selling
 * price) — Finance can fix a genuine mistake in their own
 * supplementary line without deleting and re-adding it, but only
 * while the request is still genuinely theirs to edit. */
export async function editExternalProcurementSupplementaryLine(lineId: string, description: string, amount: number): Promise<void> {
  const line = await prisma.externalProcurementSupplementaryLine.findUnique({
    where: { id: lineId },
    select: { requestId: true, description: true, amount: true, request: { select: { status: true, branchId: true } } },
  });
  if (!line) {
    throw new SourcingActionError('Line not found.');
  }
  if (line.request.status !== 'PENDING_FINANCE_REVIEW') {
    throw new SourcingActionError('This request is not currently open for Finance to edit.');
  }
  const trimmedDescription = description?.trim();
  if (!trimmedDescription) {
    throw new SourcingActionError('A description is required for this line.');
  }
  if (!(amount > 0)) {
    throw new SourcingActionError('Amount must be greater than zero.');
  }
  const user = await requireEligibleFinance(line.request.branchId);
  await prisma.externalProcurementSupplementaryLine.update({ where: { id: lineId }, data: { description: trimmedDescription, amount } });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.supplementary_line_edited',
    entityType: 'ExternalProcurementRequest',
    entityId: line.requestId,
    metadata: { from: { description: line.description, amount: Number(line.amount) }, to: { description: trimmedDescription, amount } },
  });
}

/** Mirrors getPartAuditTrail()/getGoodsReceiptAuditTrail() exactly —
 * the real, chronological record of everything Finance has done to
 * this request's own supplementary lines (added, edited, removed),
 * shown alongside the request's own real milestones on its Timeline. */
export async function getExternalProcurementRequestAuditTrail(requestId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'ExternalProcurementRequest', entityId: requestId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const userIds = [...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? (userById.get(e.userId) ?? 'Unknown') : 'System' }));
}

/** Finance's own deliberate checkpoint — explicitly passing the
 * request forward to the Manager once they're satisfied nothing more
 * needs adding, rather than an ambiguous automatic handoff. Genuinely
 * fine to send forward with zero supplementary lines added — not
 * every request needs one. */
export async function sendExternalProcurementToManager(requestId: string): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({
    where: { id: requestId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      referenceNumber: true,
      description: true,
      estimatedAmount: true,
      supplementaryLines: { select: { description: true, amount: true } },
      lines: { select: { description: true, quantity: true, unitOfMeasure: true, amount: true } },
    },
  });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_FINANCE_REVIEW') {
    throw new SourcingActionError('This request is not currently awaiting Finance review.');
  }
  const user = await requireEligibleFinance(request.branchId);
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: { status: 'PENDING_MANAGER_APPROVAL', financeReviewedById: user.id, financeReviewedAt: new Date() },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.sent_to_manager',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.sent_to_manager',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber },
  });

  await notifyTechnicianAndSupervisorOfExternalProcurementStatus(request.jobCardId, requestId, request.referenceNumber, 'sent_to_manager');

  // The real, full total — the technician's own original figure plus
  // whatever real supplementary costs Finance has since added — is
  // what the Manager actually needs to see, never just the smaller
  // original estimate.
  const realTotal = Number(request.estimatedAmount) + request.supplementaryLines.reduce((sum: number, l: { amount: unknown }) => sum + Number(l.amount), 0);
  try {
    const [emailContext, managers] = await Promise.all([
      getPartRequestEmailContext(request.jobCardId),
      listEligibleManagersForBranch(request.branchId),
    ]);
    const orgContext = await getSourcingOrgContext(request.branchId, emailContext.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Procurement request needs your approval — ${request.referenceNumber}`,
        renderExternalProcurementApprovalNeededEmail({
          recipientName: manager.fullName,
          requestedByName: 'Finance',
          referenceNumber: request.referenceNumber,
          jobNumber: emailContext.jobNumber,
          customerName: emailContext.customer.fullName,
          lines: [
            ...request.lines.map((l: (typeof request.lines)[number]) => ({ description: l.description, quantity: Number(l.quantity), unitOfMeasure: l.unitOfMeasure, amount: Number(l.amount) })),
            // A legacy, single-line request has no real lines of its
            // own — its one real fact is still the request's own
            // description/estimatedAmount, shown the same way here.
            ...(request.lines.length === 0 ? [{ description: request.description, quantity: 1, unitOfMeasure: null, amount: Number(request.estimatedAmount) }] : []),
            // Finance's own real additions, shown the same way as
            // every other item — the Manager approves the genuine
            // full picture, not just the technician's own original
            // figure.
            ...request.supplementaryLines.map((l: { description?: string; amount: unknown }) => ({ description: (l as { description: string }).description, quantity: 1, unitOfMeasure: null, amount: Number(l.amount) })),
          ],
          estimatedAmount: realTotal,
          approvalUrl: `${portalUrl}/workshop/external-procurement/${requestId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send External Procurement Manager-approval-needed email', request.referenceNumber, err);
  }
}

/** A Workshop Manager confirming the combined total — the technician's
 * own original figure plus whatever real supplementary costs Finance
 * has since added — before any money actually moves. The same gate
 * structure as the Store side's HOD step, just now approving the
 * genuine full picture rather than only the technician's initial
 * guess. */
export async function approveExternalProcurementRequest(requestId: string, notes?: string): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({
    where: { id: requestId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      referenceNumber: true,
      estimatedAmount: true,
      supplementaryLines: { select: { amount: true } },
    },
  });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_MANAGER_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting approval.');
  }
  const user = await requireEligibleManager(request.branchId);
  // Locked in right here, at the exact moment of approval — never
  // recomputed later, so nothing that happens afterward could ever
  // silently change what the Manager actually approved.
  const supplementaryTotal = request.supplementaryLines.reduce(
    (sum: number, line: (typeof request.supplementaryLines)[number]) => sum + Number(line.amount),
    0,
  );
  const approvedTotal = Math.round((Number(request.estimatedAmount) + supplementaryTotal) * 100) / 100;
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: {
      status: 'APPROVED',
      managerApprovedById: user.id,
      managerApprovedAt: new Date(),
      managerNotes: notes?.trim() || undefined,
      approvedTotal,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.approved',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
    metadata: { approvedTotal, estimatedAmount: Number(request.estimatedAmount), supplementaryTotal },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.approved',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber, approvedTotal },
  });

  await notifyTechnicianAndSupervisorOfExternalProcurementStatus(request.jobCardId, requestId, request.referenceNumber, 'approved', approvedTotal);
}

/** Finance actually handing over the cash advance — the real amount
 * given, which may differ slightly from the original estimate, kept as
 * its own field rather than overwriting it. */
/** Finance's own final step — recording exactly how the already-
 * approved total was actually paid out. Deliberately no amount
 * parameter at all anymore: the real figure was locked in the moment
 * the Manager approved it (approvedTotal), and is simply copied
 * across here, never retyped — the one thing this step can genuinely
 * never touch, by design. */
export async function disburseExternalProcurementRequest(
  requestId: string,
  payment: { paymentMethod: string; paymentReference?: string; disbursementNotes?: string },
): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({
    where: { id: requestId },
    select: { status: true, branchId: true, jobCardId: true, referenceNumber: true, approvedTotal: true },
  });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'APPROVED') {
    throw new SourcingActionError('This request has not been approved for disbursement.');
  }
  if (request.approvedTotal === null) {
    // Should never genuinely happen — approval always sets this — but
    // a missing approved total is a real data problem worth stopping
    // on rather than silently disbursing an unknown amount.
    throw new SourcingActionError('This request has no approved total on record — contact an administrator before disbursing.');
  }
  const paymentMethod = payment.paymentMethod?.trim();
  if (!paymentMethod) {
    throw new SourcingActionError('Payment method is required.');
  }
  const user = await requireEligibleFinance(request.branchId);
  const disbursedAmount = request.approvedTotal;
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: {
      status: 'DISBURSED',
      disbursedById: user.id,
      disbursedAt: new Date(),
      disbursedAmount,
      paymentMethod,
      paymentReference: payment.paymentReference?.trim() || undefined,
      disbursementNotes: payment.disbursementNotes?.trim() || undefined,
    },
  });

  await syncJobCardSourcingStatus(request.jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.disbursed',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
    metadata: { disbursedAmount: Number(disbursedAmount), paymentMethod, paymentReference: payment.paymentReference },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.disbursed',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber, disbursedAmount: Number(disbursedAmount), paymentMethod },
  });

  await notifyTechnicianAndSupervisorOfExternalProcurementStatus(request.jobCardId, requestId, request.referenceNumber, 'disbursed', Number(disbursedAmount));
}

/** Rejectable only before a Manager has approved it — once approved, an
 * unwind is a real conversation between Manager and Finance, not a
 * status flip, the same reasoning as the Store side never un-reserving
 * via rejection either. */
/** Rejectable at either real stage — Finance's own review, or the
 * Manager's approval — mirroring exactly how a Store Parts request can
 * be rejected at either HOD or Store's own stage. */
export async function rejectExternalProcurementRequest(requestId: string, reason: string): Promise<void> {
  const request = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true } });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_FINANCE_REVIEW' && request.status !== 'PENDING_MANAGER_APPROVAL') {
    throw new SourcingActionError('This request can no longer be rejected.');
  }
  if (!reason?.trim()) {
    throw new SourcingActionError('A reason is required.');
  }
  const stage = request.status === 'PENDING_FINANCE_REVIEW' ? 'FINANCE_REVIEW' : 'MANAGER_APPROVAL';
  const user = stage === 'FINANCE_REVIEW' ? await requireEligibleFinance(request.branchId) : await requireEligibleManager(request.branchId);
  await prisma.externalProcurementRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionStage: stage, rejectionReason: reason.trim() },
  });

  await syncJobCardSourcingStatus(request.jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.rejected',
    entityType: 'ExternalProcurementRequest',
    entityId: requestId,
    metadata: { stage, reason: reason.trim() },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.rejected',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { referenceNumber: request.referenceNumber, stage, reason: reason.trim() },
  });

  await notifyTechnicianAndSupervisorOfExternalProcurementStatus(request.jobCardId, requestId, request.referenceNumber, 'rejected', undefined, reason.trim());
}
