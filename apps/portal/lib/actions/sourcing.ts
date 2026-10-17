'use server';
import { actorLabel } from '@/lib/assist/rules';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { emailColleaguesLater } from '@/lib/workflow-notify';

import { authorize, authorizeOnJobCard, authorizeOnService, branchWithinReach, seeBranchAnyOf, seeJobCard, seeService, refuseDuringAssist, refuse } from '@/lib/authz/server';

/**
 * Sourcing for a Job Card (or Vehicle Service) once work has started:
 * - Store parts: a Parts Request Slip, approved by the Workshop HOD, then
 *   Store (which reserves stock), then released by a storekeeper.
 * - External parts/jobs: a cash advance, reviewed by Finance, approved by a
 *   Manager, then disbursed by Finance.
 * Which flow applies is read from the estimate's line types, not chosen.
 * Both start only once the deposit has moved the job to IN_PROGRESS.
 */

import { prisma, getAuditActor } from '@ejo/database';
import { assertJobStillOpen } from '@/lib/sourcing-lifecycle';
import { claimed as claimedOrStale, lockExisting, lockRows, StaleStateError } from '@/lib/integrity';
import { retryOnNumberClash } from '@/lib/integrity-core';
import { issuePartWarrantiesForSlip } from './warranty';
import { pluralize } from '@/lib/utils/pluralize';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';
import { replayQuantityFifo, planQuantityRelease } from '@/lib/inventory/quantity-fifo';
import { loadQuantityTraces, sourcesForReleases } from '@/lib/inventory/quantity-trace';
import { requireUser, requireEligibleManager, listEligibleFinanceOfficersForBranch, listEligibleManagersForBranch } from './workshop';
import { writeAuditLog, getWorkshopOrgContext } from '@/lib/workshop-core';
import { renderCustomerJobWorkUpdateEmail } from '@/lib/email-templates/customer-job-work-update';
import { requireStoreStaff, listEligibleStoreOfficersForBranch, listEligibleStoreManagersForBranch } from './store';
import { sendEmail } from '@/lib/email';
import { renderPartRequestApprovalNeededEmail, renderPartRequestStatusEmail, PART_REQUEST_STATUS } from '@/lib/email-templates/part-request-status';
import { renderExternalProcurementApprovalNeededEmail, renderExternalProcurementStatusEmail, EXTERNAL_PROCUREMENT_STATUS } from '@/lib/email-templates/external-procurement-status';
import { renderServiceEstimatePartRequestApprovalNeededEmail, renderServiceEstimatePartRequestStatusEmail } from '@/lib/email-templates/service-estimate-part-request-status';
import { lagosYear } from '@/lib/utils/format-date';
import { customerLinks } from '@/lib/customer-links-core';

/** Like getStoreOrgContext(), but by branch: these emails go to both
 * Workshop and Store staff, so the department name is passed in. */
async function getSourcingOrgContext(branchId: string, departmentName: string): Promise<{ companyName: string; branchName: string; departmentName: string }> {
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } },
  });
  // Named companyName because every email template takes `companyName`.
  return { companyName: branch.businessUnit.organisation.name, branchName: branch.name, departmentName };
}

/** Job Card and vehicle details shared by every email in the request chain. */
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
  // departmentId is optional on JobCard; fall back to a generic name.
  return { ...jobCard, departmentName: jobCard.department?.name ?? 'Workshop' };
}

/** Vehicle Service version of getPartRequestEmailContext(). */
async function getServiceEstimatePartRequestEmailContext(vehicleServiceId: string) {
  const service = await prisma.vehicleService.findUniqueOrThrow({
    where: { id: vehicleServiceId },
    select: {
      serviceNumber: true,
      branchId: true,
      supervisorId: true,
      assignedTechnicianId: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
      department: { select: { name: true } },
    },
  });
  return { ...service, departmentName: service.department?.name ?? 'Workshop' };
}

/** Vehicle Service version of notifyTechnicianAndSupervisorOfPartRequestStatus(),
 * with its own email template. */
async function notifySupervisorAndTechnicianOfServiceEstimatePartRequestStatus(
  vehicleServiceId: string,
  slipId: string,
  referenceNumber: string,
  kind: 'hod_approved' | 'store_approved' | 'released' | 'rejected',
  rejectionReason?: string,
): Promise<void> {
  try {
    const service = await getServiceEstimatePartRequestEmailContext(vehicleServiceId);
    const recipientIds = [service.supervisorId, service.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { fullName: true, email: true } });
    const orgContext = await getSourcingOrgContext(service.branchId, service.departmentName);
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `${PART_REQUEST_STATUS[kind].heading} — ${referenceNumber}`,
        renderServiceEstimatePartRequestStatusEmail({
          recipientName: recipient.fullName,
          kind,
          referenceNumber,
          serviceNumber: service.serviceNumber,
          customerName: service.customer.fullName,
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
    logFailure('Failed to send Service Estimate Parts Request status emails', referenceNumber, err);
  }
}

/** Emails the technician and supervisor at every stage of a parts request. */
async function notifyTechnicianAndSupervisorOfPartRequestStatus(
  jobCardId: string,
  slipId: string,
  referenceNumber: string,
  kind: 'hod_approved' | 'store_approved' | 'released' | 'rejected',
  rejectionReason?: string,
): Promise<void> {
  try {
    const [jobCard, slip] = await Promise.all([
      getPartRequestEmailContext(jobCardId),
      prisma.partRequestSlip.findUnique({ where: { id: slipId }, select: { requestedById: true, hodApprovedById: true, rejectionStage: true } }),
    ]);
    // The job's technician and supervisor, the person who raised the request
    // (when someone else did), and — when the Store turns it down — the HOD
    // who approved it.
    const recipientIds = [...new Set([jobCard.supervisorId, jobCard.assignedTechnicianId, slip?.requestedById, kind === 'rejected' && slip?.rejectionStage === 'STORE' ? slip.hodApprovedById : null].filter((id): id is string => Boolean(id)))];
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds }, isActive: true }, select: { fullName: true, email: true } });
    const orgContext = await getSourcingOrgContext(jobCard.branchId, jobCard.departmentName);
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `${PART_REQUEST_STATUS[kind].heading} — ${referenceNumber}`,
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
    logFailure('Failed to send Parts Request status emails', referenceNumber, err);
  }
}

/** External Procurement version of notifyTechnicianAndSupervisorOfPartRequestStatus(). */
async function notifyTechnicianAndSupervisorOfExternalProcurementStatus(
  jobCardId: string,
  requestId: string,
  referenceNumber: string,
  kind: 'sent_to_manager' | 'approved' | 'disbursed' | 'rejected',
  amount?: number,
  rejectionReason?: string,
): Promise<void> {
  try {
    const [jobCard, req] = await Promise.all([
      getPartRequestEmailContext(jobCardId),
      prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { requestedById: true } }),
    ]);
    // The job's technician and supervisor, and the person who raised the request (when someone else did).
    const recipientIds = [...new Set([jobCard.supervisorId, jobCard.assignedTechnicianId, req?.requestedById].filter((id): id is string => Boolean(id)))];
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds }, isActive: true }, select: { fullName: true, email: true } });
    const orgContext = await getSourcingOrgContext(jobCard.branchId, jobCard.departmentName);
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `${EXTERNAL_PROCUREMENT_STATUS[kind].heading} — ${referenceNumber}`,
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
    logFailure('Failed to send External Procurement status emails', referenceNumber, err);
  }
}

class SourcingActionError extends Error {}

/** Sourcing starts once the deposit has started work (IN_PROGRESS). Later
 * stages, such as Quality Check, can still need a late part. */
const SOURCEABLE_STATUSES = ['IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED'] as const;

/** PRS-2026-000001, same format as JC- and GRN- numbers. */
async function generatePartRequestSlipNumber(db: Pick<typeof prisma, 'partRequestSlip'> = prisma): Promise<string> {
  const year = lagosYear();
  const prefix = `PRS-${year}-`;
  const latest = await db.partRequestSlip.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

/** EPR-2026-000001 */
async function generateExternalProcurementRequestNumber(db: Pick<typeof prisma, 'externalProcurementRequest'> = prisma): Promise<string> {
  const year = lagosYear();
  const prefix = `EPR-${year}-`;
  const latest = await db.externalProcurementRequest.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

/** A Finance Officer for the branch, or a Master Admin. */
async function requireEligibleFinance(branchId: string, key: 'procurement.epr.review' | 'procurement.epr.disburse' = 'procurement.epr.review'): Promise<{ id: string }> {
  const user = await requireUser();
  await authorize(key, { branchId, homeBranch: true }, `finance:${key}`, key === 'procurement.epr.disburse' ? 'Only a Finance Officer for this branch can disburse this.' : 'Only a Finance Officer for this branch can review this.');
  return user;
}

/** Reads the estimate's line types and reports which sourcing flows the Job
 * Card needs: none, Store parts, external, or both (as separate requests). */
export async function getJobCardSourcingNeeds(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getJobCardSourcingNeeds');
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

  // Uses the same eligibility checks as the request pages, so the button
  // disappears once every line has been requested.
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

/** Only changes JobCard.status when it is IN_PROGRESS or AWAITING_PARTS;
 * never overrides a status that has moved on (e.g. Quality Check). */
async function syncJobCardSourcingStatus(jobCardId: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      jobNumber: true,
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true } },
      department: { select: { name: true } },
    },
  });
  if (!jobCard) return;
  if (jobCard.status !== 'IN_PROGRESS' && jobCard.status !== 'AWAITING_PARTS') return;

  const [outstandingSlips, outstandingRequests] = await Promise.all([
    prisma.partRequestSlip.count({ where: { jobCardId, status: { notIn: ['RELEASED', 'REJECTED'] } } }),
    prisma.externalProcurementRequest.count({ where: { jobCardId, status: { notIn: ['DISBURSED', 'REJECTED'] } } }),
  ]);
  const hasOutstanding = outstandingSlips > 0 || outstandingRequests > 0;

  const to = hasOutstanding && jobCard.status !== 'AWAITING_PARTS' ? 'AWAITING_PARTS' : !hasOutstanding && jobCard.status === 'AWAITING_PARTS' ? 'IN_PROGRESS' : null;
  if (!to) return;
  // Only if the Job Card is still where we read it; a status someone changed
  // in the meantime wins.
  const moved = await prisma.jobCard.updateMany({ where: { id: jobCardId, status: jobCard.status }, data: { status: to } });
  if (moved.count === 0) return;
  // Logged on the Job Card, attributed to whoever's action caused it.
  await writeAuditLog({
    userId: getAuditActor()?.userId ?? null,
    action: 'job_card.status_updated',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: {
      jobNumber: jobCard.jobNumber,
      from: jobCard.status,
      to,
      automatic: true,
      reason: to === 'AWAITING_PARTS' ? 'Parts requested and not yet received' : 'All requested parts received',
    },
  });
  // Parts arrived: send the "work resumed" email a manual resume sends, not
  // "work has started" again.
  if (to === 'IN_PROGRESS') {
    try {
      const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
      const websiteUrl = websiteBaseUrl();
      await sendEmail(
        jobCard.customer.email,
        `Work has resumed — Job Card ${jobCard.jobNumber}`,
        renderCustomerJobWorkUpdateEmail({
          kind: 'RESUMED',
          customerName: jobCard.customer.fullName,
          jobNumber: jobCard.jobNumber,
          vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
          dashboardUrl: `${customerLinks(websiteUrl).jobCard(jobCardId)}`,
          logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    } catch (err) {
      logFailure('Failed to send work-resumed email', jobCardId, err);
    }
  }
}

export async function getPartRequestSlip(id: string) {
  await requireUser();
  const owner = await prisma.partRequestSlip.findUnique({ where: { id }, select: { branchId: true } });
  if (!owner) return null;
  try {
    await seeBranchAnyOf(['workshop.job_card.view', 'store.view'], owner.branchId, `PartRequestSlip:${id}`);
  } catch {
    return null; // shown exactly like a request that does not exist
  }
  const slip = await prisma.partRequestSlip.findUnique({
    where: { id },
    include: {
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          supervisorId: true,
          assignedTechnicianId: true,
          assignedTechnician: { select: { id: true, fullName: true } },
          customer: { select: { id: true, fullName: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
          branch: { select: { name: true, address: true, hotlines: true, email: true } },
        },
      },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          supervisorId: true,
          assignedTechnicianId: true,
          assignedTechnician: { select: { id: true, fullName: true } },
          customer: { select: { id: true, fullName: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
          branch: { select: { name: true, address: true, hotlines: true, email: true } },
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
              // In-stock serials, oldest first (FIFO), for the release form's picker.
              serials: { where: { status: 'IN_STOCK' }, orderBy: { receivedAt: 'asc' }, select: { serialNumber: true, receivedAt: true } },
            },
          },
          estimateLineItem: { select: { description: true, unitPrice: true, amount: true } },
          serviceEstimateLineItem: { select: { description: true, unitPrice: true, amount: true } },
          // What the line was released with (serials, or batches and quantities),
          // so the released slip is traceable.
          issuedSerials: {
            select: {
              serialNumber: true,
              goodsReceiptLine: { select: { goodsReceipt: { select: { id: true, referenceNumber: true } } } },
            },
          },
          batchConsumptions: {
            select: {
              quantityTaken: true,
              batch: {
                select: {
                  batchNumber: true,
                  goodsReceiptLine: { select: { goodsReceipt: { select: { id: true, referenceNumber: true } } } },
                },
              },
            },
          },
          // A QUANTITY line's release rows, resolved below into the deliveries they
          // drew from (quantitySources).
          quantityConsumptions: { select: { id: true } },
        },
      },
    },
  });
  if (!slip) return null;

  // For QUANTITY lines: which goods receipt(s) each release drew from, FIFO,
  // including releases made before per-delivery tracking existed.
  const quantityPartIds = slip.lines
    .filter((l: (typeof slip.lines)[number]) => l.part.trackingType === 'QUANTITY' && l.quantityConsumptions.length > 0)
    .map((l: (typeof slip.lines)[number]) => l.partId);
  const traces = await loadQuantityTraces(quantityPartIds);
  return {
    ...slip,
    lines: slip.lines.map((l: (typeof slip.lines)[number]) => ({
      ...l,
      quantitySources:
        l.part.trackingType === 'QUANTITY'
          ? sourcesForReleases(traces.get(l.partId), l.quantityConsumptions.map((c: (typeof l.quantityConsumptions)[number]) => c.id))
          : [],
    })),
  };
}

export async function listPartRequestSlips(branchId: string, search?: string) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  const q = search?.trim();
  return prisma.partRequestSlip.findMany({
    take: 500, // newest 500; search reaches older records
    where: {
      branchId,
      ...(q
        ? {
            OR: [
              { referenceNumber: { contains: q, mode: 'insensitive' } },
              { jobCard: { jobNumber: { contains: q, mode: 'insensitive' } } },
              { vehicleService: { serviceNumber: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      jobCard: { select: { id: true, jobNumber: true } },
      vehicleService: { select: { id: true, serviceNumber: true } },
      requestedBy: { select: { fullName: true } },
      lines: { select: { id: true } },
    },
  });
}

export async function getExternalProcurementRequest(id: string) {
  await requireUser();
  const owner = await prisma.externalProcurementRequest.findUnique({ where: { id }, select: { branchId: true } });
  if (!owner) return null;
  try {
    await seeBranchAnyOf(['workshop.job_card.view', 'store.view', 'procurement.epr.review'], owner.branchId, `ExternalProcurementRequest:${id}`);
  } catch {
    return null;
  }
  return prisma.externalProcurementRequest.findUnique({
    where: { id },
    include: {
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          assignedTechnician: { select: { fullName: true } },
          supervisor: { select: { fullName: true } },
          customer: { select: { id: true, fullName: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, engineType: true, chassisNumber: true, plateNumber: true } },
          branch: { select: { name: true, address: true, hotlines: true, email: true } },
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
  branchId = await branchWithinReach('store.view', branchId);
  const q = search?.trim();
  return prisma.externalProcurementRequest.findMany({
    take: 500, // newest 500; search reaches older records
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

/** Store Part lines on this Job Card that are matched to a catalogue part
 * and not covered by an active request. Part, quantity, unit and price all
 * come from the match. */
export async function getRequestablePartRequestLines(jobCardId: string) {
  await requireUser();
  return requestablePartRequestLines(prisma, jobCardId);
}

async function requestablePartRequestLines(db: Pick<typeof prisma, 'estimate' | 'partRequestSlip'>, jobCardId: string) {
  const [estimate, existingSlips] = await Promise.all([
    db.estimate.findUnique({
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
    db.partRequestSlip.findMany({
      where: { jobCardId, status: { not: 'REJECTED' } },
      select: { lines: { select: { estimateLineItemId: true } } },
    }),
  ]);
  const alreadyRequestedLineIds = new Set(
    existingSlips.flatMap((s: (typeof existingSlips)[number]) => s.lines.map((l: { estimateLineItemId: string | null }) => l.estimateLineItemId).filter(Boolean)),
  );
  return (estimate?.lineItems ?? []).filter((li: { id: string }) => !alreadyRequestedLineIds.has(li.id));
}

/** Raises a Store parts request (then HOD approval, Store approval,
 * release) and moves the Job Card to AWAITING_PARTS. Takes no part or
 * quantity input: everything comes from the matched estimate lines. */
export async function requestPartRequestSlip(jobCardId: string): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  await authorizeOnJobCard('sourcing.request', jobCardId, 'requestPartRequestSlip');
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, branchId: true } });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }
  if (!SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number])) {
    throw new SourcingActionError("This Job Card isn't far enough along to request parts yet — it needs to be at least In Progress (70% paid).");
  }
  // Built and created with the Job Card locked: a double click (or two
  // people) can't raise two requests for the same lines, which would reserve
  // the same parts twice.
  const { slip, requestableLines, referenceNumber } = await retryOnNumberClash('referenceNumber', () => prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'jobCard', [jobCardId]);
    const requestableLines = await requestablePartRequestLines(tx, jobCardId);
    if (requestableLines.length === 0) {
      throw new SourcingActionError('There are no matched Store Part lines ready to request — everything has already been requested, or nothing has been matched yet.');
    }

    const referenceNumber = await generatePartRequestSlipNumber(tx);
    const slip = await tx.partRequestSlip.create({
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
    return { slip, requestableLines, referenceNumber };
  }));

  await syncJobCardSourcingStatus(jobCardId);
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.requested',
    entityType: 'PartRequestSlip',
    entityId: slip.id,
    metadata: { referenceNumber, lineCount: requestableLines.length },
  });
  // Each stage is also logged on the Job Card with the reference number,
  // so its timeline shows the sourcing.
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
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
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
    logFailure('Failed to send Parts Request approval-needed emails', referenceNumber, err);
  }

  return { id: slip.id, referenceNumber };
}

/**
 * Whether a Vehicle Service may source parts: estimate approved, customer
 * notified, and the 70% deposit recorded. Status alone isn't enough, since
 * services moved to IN_SERVICE by hand before the deposit rule existed would
 * otherwise qualify.
 */
async function isVehicleServiceEligibleToSource(vehicleServiceId: string): Promise<boolean> {
  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: {
      status: true,
      serviceEstimate: { select: { status: true, customerNotifiedAt: true, lineItems: { select: { amount: true } } } },
      payments: { select: { amount: true } },
    },
  });
  if (!service || service.status !== 'IN_SERVICE') return false;
  const estimate = service.serviceEstimate;
  if (!estimate || estimate.status !== 'MANAGER_APPROVED' || !estimate.customerNotifiedAt) return false;
  const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
  const paid = service.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount ?? 0), 0);
  const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  return total > 0 && paid >= minimumDeposit;
}

/** Vehicle Service version of getJobCardSourcingNeeds(). */
export async function getVehicleServiceSourcingNeeds(vehicleServiceId: string) {
  await requireUser();
  await seeService(vehicleServiceId, 'getVehicleServiceSourcingNeeds');
  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: { serviceEstimate: { select: { id: true, lineItems: { where: { type: 'STORE_PART' }, select: { id: true } } } } },
  });
  const estimate = service?.serviceEstimate ?? null;
  const [isEligibleToSource, existingPartRequestSlips, requestableLines] = await Promise.all([
    isVehicleServiceEligibleToSource(vehicleServiceId),
    prisma.partRequestSlip.findMany({
      where: { vehicleServiceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, referenceNumber: true },
    }),
    estimate ? getRequestableServiceEstimatePartRequestLines(estimate.id) : Promise.resolve([]),
  ]);
  return {
    isEligibleToSource,
    serviceEstimateId: estimate?.id ?? null,
    needsStoreParts: (estimate?.lineItems.length ?? 0) > 0,
    hasRequestablePartLines: requestableLines.length > 0,
    existingPartRequestSlips,
  };
}

/** Vehicle Service version of getRequestablePartRequestLines(). */
export async function getRequestableServiceEstimatePartRequestLines(serviceEstimateId: string) {
  await requireUser();
  return requestableServiceEstimateLines(prisma, serviceEstimateId);
}

async function requestableServiceEstimateLines(db: Pick<typeof prisma, 'serviceEstimate' | 'partRequestSlip'>, serviceEstimateId: string) {
  const estimate = await db.serviceEstimate.findUnique({
    where: { id: serviceEstimateId },
    select: {
      vehicleServiceId: true,
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
  });
  if (!estimate) return [];
  const existingSlips = await db.partRequestSlip.findMany({
    where: { vehicleServiceId: estimate.vehicleServiceId, status: { not: 'REJECTED' } },
    select: { lines: { select: { serviceEstimateLineItemId: true } } },
  });
  const alreadyRequestedLineIds = new Set(
    existingSlips.flatMap((s: (typeof existingSlips)[number]) => s.lines.map((l: { serviceEstimateLineItemId: string | null }) => l.serviceEstimateLineItemId).filter(Boolean)),
  );
  return estimate.lineItems.filter((li: { id: string }) => !alreadyRequestedLineIds.has(li.id));
}

/** Vehicle Service version of requestPartRequestSlip(). Vehicle Service has
 * no AWAITING_PARTS status, so no status change is made. */
export async function requestServiceEstimatePartRequestSlip(serviceEstimateId: string): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: serviceEstimateId },
    select: { status: true, vehicleServiceId: true, vehicleService: { select: { status: true, branchId: true } } },
  });
  if (estimate) await authorizeOnService('sourcing.request', estimate.vehicleServiceId, 'requestServiceEstimatePartRequestSlip');
  if (!estimate) {
    throw new SourcingActionError('Service Estimate not found.');
  }
  // See isVehicleServiceEligibleToSource: the deposit chain, not status alone.
  if (!(await isVehicleServiceEligibleToSource(estimate.vehicleServiceId))) {
    throw new SourcingActionError('Parts can only be requested once the customer has been notified and the 70% deposit recorded.');
  }
  // Same as requestPartRequestSlip: never two requests for the same lines.
  const { slip, requestableLines, referenceNumber } = await retryOnNumberClash('referenceNumber', () => prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'vehicleService', [estimate.vehicleServiceId]);
    const requestableLines = await requestableServiceEstimateLines(tx, serviceEstimateId);
    if (requestableLines.length === 0) {
      throw new SourcingActionError('There are no matched Store Part lines ready to request — everything has already been requested, or nothing has been matched yet.');
    }

    const referenceNumber = await generatePartRequestSlipNumber(tx);
    const slip = await tx.partRequestSlip.create({
      data: {
        referenceNumber,
        vehicleServiceId: estimate.vehicleServiceId,
        branchId: estimate.vehicleService.branchId,
        requestedById: user.id,
        lines: {
          create: requestableLines.map((l: (typeof requestableLines)[number]) => ({
            partId: l.matchedPartId as string,
            serviceEstimateLineItemId: l.id,
            quantityRequested: l.quantity,
          })),
        },
      },
    });
    return { slip, requestableLines, referenceNumber };
  }));

  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.requested',
    entityType: 'PartRequestSlip',
    entityId: slip.id,
    metadata: { referenceNumber, lineCount: requestableLines.length },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.requested',
    entityType: 'VehicleService',
    entityId: estimate.vehicleServiceId,
    metadata: { referenceNumber, lineCount: requestableLines.length },
  });

  try {
    const [emailContext, managers, requestedByUser, lineDetails] = await Promise.all([
      getServiceEstimatePartRequestEmailContext(estimate.vehicleServiceId),
      listEligibleManagersForBranch(estimate.vehicleService.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
      prisma.partRequestSlipLine.findMany({
        where: { slipId: slip.id },
        select: { quantityRequested: true, part: { select: { name: true, baseUnitOfMeasure: true } } },
      }),
    ]);
    const orgContext = await getSourcingOrgContext(estimate.vehicleService.branchId, emailContext.departmentName);
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Parts request needs your approval — ${referenceNumber}`,
        renderServiceEstimatePartRequestApprovalNeededEmail({
          recipientName: manager.fullName,
          requestedByName: requestedByUser?.fullName ?? 'A team member',
          referenceNumber,
          serviceNumber: emailContext.serviceNumber,
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
    logFailure('Failed to send Service Estimate Parts Request approval-needed emails', referenceNumber, err);
  }

  return { id: slip.id, referenceNumber };
}

/** Step 1 of 3: the Workshop HOD confirms the request before Store checks stock. */
export async function approvePartRequestSlipByHod(slipId: string, notes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approvePartRequestSlipByHod');
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('store.prs.approve_hod', undefined, 'approvePartRequestSlipByHod');
  const slip = await prisma.partRequestSlip.findUnique({ where: { id: slipId }, select: { status: true, branchId: true, jobCardId: true, vehicleServiceId: true, referenceNumber: true, requestedById: true } });
  if (!slip) {
    throw new SourcingActionError('Request not found.');
  }
  if (slip.status !== 'PENDING_HOD_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting HOD approval.');
  }
  const user = await requireEligibleManager(slip.branchId, 'store.prs.approve_hod');
  // Separation of duties: nobody approves their own request.
  if (user.id === slip.requestedById) await refuse('store.prs.approve_hod', 'approvePartRequestSlipByHod', 'You raised this parts request, so another manager must approve it.');
  // Nothing more is approved for a job that is cancelled or finished.
  await assertJobStillOpen(prisma, slip);
  const claimed = await prisma.partRequestSlip.updateMany({
    where: { id: slipId, status: 'PENDING_HOD_APPROVAL' },
    data: { status: 'PENDING_STORE_APPROVAL', hodApprovedById: user.id, hodApprovedAt: new Date(), hodNotes: notes?.trim() || undefined },
  });
  // Compare-and-set: if someone else already moved it on (double click,
  // two people at once), nothing changes and this request stops here.
  if (claimed.count === 0) throw new Error('This was just done by someone else — refresh to see the latest.');
  await writeAuditLog({ userId: user.id, action: 'part_request_slip.hod_approved', entityType: 'PartRequestSlip', entityId: slipId });

  // Job Card slips. Vehicle Service slips are handled in the `else if` below.
  if (slip.jobCardId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.hod_approved',
      entityType: 'JobCard',
      entityId: slip.jobCardId,
      metadata: { referenceNumber: slip.referenceNumber },
    });

    await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'hod_approved');

    // Now Store's turn: the same "approval needed" email, sent to Store.
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
      const portalUrl = portalBaseUrl();
      const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
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
      logFailure('Failed to send Parts Request Store-approval-needed emails', slip.referenceNumber, err);
    }
  } else if (slip.vehicleServiceId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.hod_approved',
      entityType: 'VehicleService',
      entityId: slip.vehicleServiceId,
      metadata: { referenceNumber: slip.referenceNumber },
    });

    await notifySupervisorAndTechnicianOfServiceEstimatePartRequestStatus(slip.vehicleServiceId, slipId, slip.referenceNumber, 'hod_approved');

    try {
      const [emailContext, storeOfficers, storeManagers, lineDetails] = await Promise.all([
        getServiceEstimatePartRequestEmailContext(slip.vehicleServiceId),
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
      const portalUrl = portalBaseUrl();
      const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
      for (const recipient of storeRecipients.values()) {
        await sendEmail(
          recipient.email,
          `Parts request needs your approval — ${slip.referenceNumber}`,
          renderServiceEstimatePartRequestApprovalNeededEmail({
            recipientName: recipient.fullName,
            requestedByName: 'The Workshop HOD',
            referenceNumber: slip.referenceNumber,
            serviceNumber: emailContext.serviceNumber,
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
      logFailure('Failed to send Service Estimate Parts Request Store-approval-needed emails', slip.referenceNumber, err);
    }
  }
}

/** Step 2 of 3: Store approves and reserves the stock. Reserving here, not
 * at release, stops a later request from being promised the same units.
 * Every line's availability (on hand minus reserved) is checked first. */
export async function approvePartRequestSlipByStore(slipId: string, notes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approvePartRequestSlipByStore');
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('store.prs.release', undefined, 'approvePartRequestSlipByStore');
  const slip = await prisma.partRequestSlip.findUnique({
    where: { id: slipId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      vehicleServiceId: true,
      referenceNumber: true,
      requestedById: true,
      hodApprovedById: true,
      lines: { select: { id: true, partId: true, quantityRequested: true, part: { select: { name: true } } } },
    },
  });
  if (!slip) {
    throw new SourcingActionError('Request not found.');
  }
  if (slip.status !== 'PENDING_STORE_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting Store approval.');
  }
  const user = await requireStoreStaff(slip.branchId, 'store.prs.release');
  // Separation of duties: the person who asked for the parts, or gave the first approval, does not also approve them out of the Store.
  if (user.id === slip.requestedById || user.id === slip.hodApprovedById) await refuse('store.prs.release', 'approvePartRequestSlipByStore', 'You already took part in this request (asked for it or approved it), so another member of the Store must approve it.');

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
    // Lock order: request, then the job's state, then stock. A cancellation
    // uses the same order (lib/sourcing-lifecycle.ts), so they queue instead of
    // deadlocking.
    await lockRows(tx, 'partRequestSlip', [slipId]);
    await assertJobStillOpen(tx, slip);
    // Two storekeepers approving different requests for the same part: the
    // check above is only a fast answer. Lock the stock rows and decide again
    // against what is on hand and reserved now.
    await lockRows(tx, 'partStockByPart', slip.lines.map((l: (typeof slip.lines)[number]) => l.partId));
    const needed = new Map<string, number>();
    for (const line of slip.lines) needed.set(line.partId, (needed.get(line.partId) ?? 0) + Number(line.quantityRequested));
    const stockNow = await tx.partStock.findMany({ where: { partId: { in: Array.from(needed.keys()) } }, select: { partId: true, quantityOnHand: true, quantityReserved: true } });
    for (const [partId, qty] of needed) {
      const row = stockNow.find((r: (typeof stockNow)[number]) => r.partId === partId);
      const available = Number(row?.quantityOnHand ?? 0) - Number(row?.quantityReserved ?? 0);
      if (available < qty) {
        const name = slip.lines.find((l: (typeof slip.lines)[number]) => l.partId === partId)?.part.name ?? 'A part';
        throw new SourcingActionError(`${name} was just reserved for another request — ${Math.max(0, available)} available now, ${qty} requested.`);
      }
    }
    for (const line of slip.lines) {
      await tx.partStock.update({ where: { partId: line.partId }, data: { quantityReserved: { increment: line.quantityRequested } } });
    }
    const claimed = await tx.partRequestSlip.updateMany({
      where: { id: slipId, status: 'PENDING_STORE_APPROVAL' },
      data: { status: 'APPROVED', storeApprovedById: user.id, storeApprovedAt: new Date(), storeNotes: notes?.trim() || undefined },
    });
    // Compare-and-set: if someone else already moved it on (double click,
    // two people at once), nothing changes and this request stops here.
    if (claimed.count === 0) throw new Error('This was just done by someone else — refresh to see the latest.');
  });

  await writeAuditLog({ userId: user.id, action: 'part_request_slip.store_approved', entityType: 'PartRequestSlip', entityId: slipId });

  if (slip.jobCardId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.store_approved',
      entityType: 'JobCard',
      entityId: slip.jobCardId,
      metadata: { referenceNumber: slip.referenceNumber },
    });

    await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'store_approved');
  } else if (slip.vehicleServiceId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.store_approved',
      entityType: 'VehicleService',
      entityId: slip.vehicleServiceId,
      metadata: { referenceNumber: slip.referenceNumber },
    });

    await notifySupervisorAndTechnicianOfServiceEstimatePartRequestStatus(slip.vehicleServiceId, slipId, slip.referenceNumber, 'store_approved');
  }
}

/** Step 3 of 3: a storekeeper releases the parts. Full release only (no
 * partial or backorder). Turns the reservation into a stock reduction and
 * updates the tracking records: oldest batches first for BATCH, the chosen
 * units for SERIALIZED, FIFO receipt layers for QUANTITY. */
export async function releasePartRequestSlip(
  slipId: string,
  receivedBy: { receivedByUserId?: string; receivedByName?: string },
  lineSerials?: Record<string, string[]>,
): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('releasePartRequestSlip');
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('store.prs.release', undefined, 'releasePartRequestSlip');
  const slip = await prisma.partRequestSlip.findUnique({
    where: { id: slipId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      vehicleServiceId: true,
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
    throw new SourcingActionError('Record who is collecting this: a staff member or a name.');
  }
  const user = await requireStoreStaff(slip.branchId, 'store.prs.release');

  // Validate before writing: a SERIALIZED line needs exactly as many serials
  // as its quantity, each an in-stock unit of that part.
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
    // Claim the slip first (compare-and-set) so a simultaneous release stops
    // before touching stock, then lock this slip's stock rows in a fixed order
    // so two releases of the same parts queue instead of deadlocking or both
    // drawing down the same batches.
    claimedOrStale(await tx.partRequestSlip.updateMany({
      where: { id: slipId, status: 'APPROVED' },
      data: {
        status: 'RELEASED',
        releasedById: user.id,
        releasedAt: new Date(),
        receivedByUserId: receivedBy.receivedByUserId,
        receivedByName: receivedBy.receivedByName?.trim() || undefined,
      },
    }), 'This was just released by someone else — refresh to see the latest.');
    // Never release parts to a job that is cancelled or finished.
    await assertJobStillOpen(tx, slip);
    await lockRows(tx, 'partStockByPart', slip.lines.map((l: (typeof slip.lines)[number]) => l.partId));
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
          // Record which batch this release drew from, and how much, for warranty
          // and quality traces.
          await tx.partBatchConsumption.create({ data: { batchId: batch.id, slipLineId: line.id, quantityTaken: take } });
          remaining -= take;
        }
        if (remaining > 0) {
          // The aggregate is already correct; log the gap in the batch records.
          logFailure('Batch records did not cover the full released quantity', line.partId, remaining);
        }
      } else if (line.part.trackingType === 'SERIALIZED') {
        const serials = (lineSerials?.[line.id] ?? []).map((s) => s.trim()).filter(Boolean);
        for (const serialNumber of serials) {
          const issued = await tx.partSerial.updateMany({
            where: { partId: line.partId, serialNumber, status: 'IN_STOCK' },
            // Which release this unit was issued against, for warranty traces.
            data: { status: 'ISSUED', issuedToSlipLineId: line.id },
          });
          // Another release may have issued this unit since the check above; never
          // release a unit twice.
          if (issued.count !== 1) throw new StaleStateError(`${line.part.name}: serial ${serialNumber} was just issued on another request — refresh and choose another unit.`);
        }
      } else {
        // QUANTITY parts: each goods receipt line is a FIFO layer. Replay earlier
        // receipts and releases to get what each delivery still holds, then draw
        // oldest-first and record one row per delivery touched, so the part is
        // traceable to its GRN. See lib/inventory/quantity-fifo.ts.
        const [receiptLines, priorConsumptions] = await Promise.all([
          tx.goodsReceiptLine.findMany({
            where: { partId: line.partId },
            select: { id: true, quantityInBaseUnit: true, goodsReceipt: { select: { receivedAt: true } } },
          }),
          tx.partQuantityConsumption.findMany({
            where: { partId: line.partId },
            select: { id: true, consumedAt: true, quantityTaken: true, goodsReceiptLineId: true },
          }),
        ]);
        const layers = receiptLines.map((r: (typeof receiptLines)[number]) => ({
          id: r.id,
          receivedAt: r.goodsReceipt.receivedAt,
          quantity: Number(r.quantityInBaseUnit),
        }));
        const current = replayQuantityFifo(
          layers,
          priorConsumptions.map((c: (typeof priorConsumptions)[number]) => ({
            id: c.id,
            consumedAt: c.consumedAt,
            quantity: Number(c.quantityTaken),
            goodsReceiptLineId: c.goodsReceiptLineId,
          })),
        );
        const plan = planQuantityRelease(layers, current.layers, qty);
        for (const portion of plan) {
          await tx.partQuantityConsumption.create({
            data: { partId: line.partId, slipLineId: line.id, quantityTaken: portion.quantity, goodsReceiptLineId: portion.goodsReceiptLineId },
          });
        }
        if (plan.some((p: (typeof plan)[number]) => p.goodsReceiptLineId === null)) {
          // As above: the aggregate is correct, but receipts didn't cover the release.
          logFailure('Goods Receipt layers did not cover the full released quantity', line.partId);
        }
      }

      await tx.partRequestSlipLine.update({ where: { id: line.id }, data: { quantityReleased: qty } });
    }
  });

  if (slip.jobCardId) {
    await syncJobCardSourcingStatus(slip.jobCardId);
  }
  // Issue a warranty for each released part that carries one (customer,
  // vehicle, job, slip line, serial). Never blocks the release.
  try {
    await issuePartWarrantiesForSlip(slipId);
  } catch (err) {
    // Recorded in the audit trail as well as the server log, so Warranty can
    // issue the missing warranties from the slip.
    logFailure('Failed to issue part warranties for released slip', slipId, err);
    await writeAuditLog({ userId: user.id, action: 'part_warranty.issue_failed', entityType: 'PartRequestSlip', entityId: slipId, metadata: { error: String((err as Error)?.message ?? err).slice(0, 300) } }).catch(() => undefined);
  }
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.released',
    entityType: 'PartRequestSlip',
    entityId: slipId,
    metadata: { receivedByUserId: receivedBy.receivedByUserId, receivedByName: receivedBy.receivedByName },
  });
  if (slip.jobCardId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.released',
      entityType: 'JobCard',
      entityId: slip.jobCardId,
      metadata: { referenceNumber: slip.referenceNumber, receivedByUserId: receivedBy.receivedByUserId, receivedByName: receivedBy.receivedByName },
    });

    await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'released');
  } else if (slip.vehicleServiceId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.released',
      entityType: 'VehicleService',
      entityId: slip.vehicleServiceId,
      metadata: { referenceNumber: slip.referenceNumber, receivedByUserId: receivedBy.receivedByUserId, receivedByName: receivedBy.receivedByName },
    });

    await notifySupervisorAndTechnicianOfServiceEstimatePartRequestStatus(slip.vehicleServiceId, slipId, slip.referenceNumber, 'released');
  }
}

/** Rejects a request still awaiting HOD or Store approval, by whoever would
 * approve at that stage. Not possible once APPROVED, since stock is reserved. */
export async function rejectPartRequestSlip(slipId: string, reason: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('rejectPartRequestSlip');
  const slip = await prisma.partRequestSlip.findUnique({ where: { id: slipId }, select: { status: true, branchId: true, jobCardId: true, vehicleServiceId: true, referenceNumber: true } });
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
  const user = stage === 'HOD' ? await requireEligibleManager(slip.branchId, 'store.prs.approve_hod') : await requireStoreStaff(slip.branchId, 'store.prs.release');

  // Compare-and-set: only from the stage the rejecter saw. If Store approved
  // it meanwhile, stock is reserved; a stale reject must not overwrite
  // APPROVED and strand the reservation.
  claimedOrStale(await prisma.partRequestSlip.updateMany({
    where: { id: slipId, status: slip.status },
    data: { status: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionStage: stage, rejectionReason: reason.trim() },
  }));

  if (slip.jobCardId) {
    await syncJobCardSourcingStatus(slip.jobCardId);
  }
  await writeAuditLog({
    userId: user.id,
    action: 'part_request_slip.rejected',
    entityType: 'PartRequestSlip',
    entityId: slipId,
    metadata: { stage, reason: reason.trim() },
  });
  if (slip.jobCardId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.rejected',
      entityType: 'JobCard',
      entityId: slip.jobCardId,
      metadata: { referenceNumber: slip.referenceNumber, stage, reason: reason.trim() },
    });

    await notifyTechnicianAndSupervisorOfPartRequestStatus(slip.jobCardId, slipId, slip.referenceNumber, 'rejected', reason.trim());
  } else if (slip.vehicleServiceId) {
    await writeAuditLog({
      userId: user.id,
      action: 'part_request_slip.rejected',
      entityType: 'VehicleService',
      entityId: slip.vehicleServiceId,
      metadata: { referenceNumber: slip.referenceNumber, stage, reason: reason.trim() },
    });

    await notifySupervisorAndTechnicianOfServiceEstimatePartRequestStatus(slip.vehicleServiceId, slipId, slip.referenceNumber, 'rejected', reason.trim());
  }
}

/** External Part/Job lines on this Job Card that are priced and not covered
 * by an active request. */
export async function getRequestableExternalProcurementLines(jobCardId: string) {
  await requireUser();
  return requestableExternalLines(prisma, jobCardId);
}

async function requestableExternalLines(db: Pick<typeof prisma, 'estimate' | 'externalProcurementRequest'>, jobCardId: string) {
  const [estimate, existingRequests] = await Promise.all([
    db.estimate.findUnique({
      where: { jobCardId },
      select: {
        lineItems: {
          where: { type: { in: ['EXTERNAL_PART', 'EXTERNAL_JOB'] }, amount: { not: null } },
          select: { id: true, description: true, quantity: true, unitOfMeasure: true, amount: true, type: true },
        },
      },
    }),
    db.externalProcurementRequest.findMany({
      where: { jobCardId, status: { not: 'REJECTED' } },
      select: {
        estimateLineItemId: true,
        lines: { select: { estimateLineItemId: true } },
      },
    }),
  ]);
  // Covers both legacy single-line requests (estimateLineItemId on the
  // request) and multi-line requests (one row per line).
  const alreadyRequestedLineIds = new Set(
    existingRequests.flatMap((r: { estimateLineItemId: string | null; lines: { estimateLineItemId: string | null }[] }) => [
      r.estimateLineItemId,
      ...r.lines.map((l) => l.estimateLineItemId),
    ]).filter(Boolean),
  );
  return (estimate?.lineItems ?? []).filter((li: { id: string }) => !alreadyRequestedLineIds.has(li.id));
}

/** Raises one cash-advance request covering every eligible External
 * Part/Job line, with one reference number, total and approval chain, and
 * moves the Job Card to AWAITING_PARTS. */
export async function requestExternalProcurementBatch(jobCardId: string): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireUser();
  await authorizeOnJobCard('sourcing.request', jobCardId, 'requestExternalProcurementBatch');
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, branchId: true } });
  if (!jobCard) {
    throw new SourcingActionError('Job Card not found.');
  }
  if (!SOURCEABLE_STATUSES.includes(jobCard.status as (typeof SOURCEABLE_STATUSES)[number])) {
    throw new SourcingActionError("This Job Card isn't far enough along to request procurement yet — it needs to be at least In Progress (70% paid).");
  }
  // Built and created with the Job Card locked: a double click can never
  // raise two requests for the same lines (which Finance would pay twice).
  const { request, requestableLines, referenceNumber, estimatedAmount } = await retryOnNumberClash('referenceNumber', () => prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'jobCard', [jobCardId]);
    const requestableLines = await requestableExternalLines(tx, jobCardId);
    if (requestableLines.length === 0) {
      throw new SourcingActionError('There is nothing ready to request — either every line has already been requested, or nothing is priced yet.');
    }
    // Fixed at submission: the sum of the lines' approved amounts.
    const estimatedAmount = requestableLines.reduce((sum: number, l: (typeof requestableLines)[number]) => sum + Number(l.amount), 0);
    const description = requestableLines.map((l: (typeof requestableLines)[number]) => l.description).join(', ');

    const referenceNumber = await generateExternalProcurementRequestNumber(tx);
    const request = await tx.externalProcurementRequest.create({
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
    return { request, requestableLines, referenceNumber, estimatedAmount };
  }));

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

  // Finance reviews first, so they get the first email.
  try {
    const [emailContext, financeOfficers, requestedByUser] = await Promise.all([
      getPartRequestEmailContext(jobCardId),
      listEligibleFinanceOfficersForBranch(jobCard.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const orgContext = await getSourcingOrgContext(jobCard.branchId, emailContext.departmentName);
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const officer of financeOfficers.supervisors) {
      await sendEmail(
        officer.email,
        `Procurement request needs your approval — ${referenceNumber}`,
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
    logFailure('Failed to send External Procurement approval-needed email', referenceNumber, err);
  }

  return { id: request.id, referenceNumber };
}

/** Finance adds a supplementary cost (transport, logistics, etc.) as a new
 * line. The technician's lines and estimate are never changed. */
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
  const user = await requireEligibleFinance(request.branchId, 'procurement.epr.review');
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
  const user = await requireEligibleFinance(line.request.branchId, 'procurement.epr.review');
  await prisma.externalProcurementSupplementaryLine.delete({ where: { id: lineId } });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.supplementary_line_removed',
    entityType: 'ExternalProcurementRequest',
    entityId: line.requestId,
    metadata: { description: line.description },
  });
}

/** Finance corrects one of its supplementary lines while the request is
 * still in Finance review. */
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
  const user = await requireEligibleFinance(line.request.branchId, 'procurement.epr.review');
  await prisma.externalProcurementSupplementaryLine.update({ where: { id: lineId }, data: { description: trimmedDescription, amount } });
  await writeAuditLog({
    userId: user.id,
    action: 'external_procurement.supplementary_line_edited',
    entityType: 'ExternalProcurementRequest',
    entityId: line.requestId,
    metadata: { from: { description: line.description, amount: Number(line.amount) }, to: { description: trimmedDescription, amount } },
  });
}

/** Audit entries for the request's supplementary lines (added, edited,
 * removed), shown on its timeline. */
export async function getExternalProcurementRequestAuditTrail(requestId: string) {
  await requireUser();
  const owner = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { branchId: true } });
  if (!owner) return [];
  await seeBranchAnyOf(['workshop.job_card.view', 'store.view', 'procurement.epr.review'], owner.branchId, 'getExternalProcurementRequestAuditTrail');
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'ExternalProcurementRequest', entityId: requestId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  const userIds = [...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(userById.get(e.userId) ?? 'Unknown', e.metadata) : 'System' }));
}

/** Finance passes the request to the Manager. Supplementary lines are optional. */
export async function sendExternalProcurementToManager(requestId: string): Promise<void> {
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('procurement.epr.review', undefined, 'sendExternalProcurementToManager');
  const request = await prisma.externalProcurementRequest.findUnique({
    where: { id: requestId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      referenceNumber: true,
      requestedById: true,
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
  const user = await requireEligibleFinance(request.branchId, 'procurement.epr.review');
  // Separation of duties: nobody reviews their own request for cash.
  if (user.id === request.requestedById) await refuse('procurement.epr.review', 'sendExternalProcurementToManager', 'You raised this request, so another Finance colleague must review it.');
  const claimed = await prisma.externalProcurementRequest.updateMany({
    where: { id: requestId, status: 'PENDING_FINANCE_REVIEW' },
    data: { status: 'PENDING_MANAGER_APPROVAL', financeReviewedById: user.id, financeReviewedAt: new Date() },
  });
  // Compare-and-set: if someone else already moved it on (double click,
  // two people at once), nothing changes and this request stops here.
  if (claimed.count === 0) throw new Error('This was just done by someone else — refresh to see the latest.');
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

  // The Manager sees the full total: the original estimate plus Finance's
  // supplementary lines.
  const realTotal = Number(request.estimatedAmount) + request.supplementaryLines.reduce((sum: number, l: { amount: unknown }) => sum + Number(l.amount), 0);
  try {
    const [emailContext, managers] = await Promise.all([
      getPartRequestEmailContext(request.jobCardId),
      listEligibleManagersForBranch(request.branchId),
    ]);
    const orgContext = await getSourcingOrgContext(request.branchId, emailContext.departmentName);
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
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
            // Legacy single-line requests have no line rows; show the request's own
            // description and amount.
            ...(request.lines.length === 0 ? [{ description: request.description, quantity: 1, unitOfMeasure: null, amount: Number(request.estimatedAmount) }] : []),
            // Finance's supplementary lines, listed with the rest.
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
    logFailure('Failed to send External Procurement Manager-approval-needed email', request.referenceNumber, err);
  }
}

/** A Workshop Manager approves the full total (original estimate plus
 * Finance's supplementary lines) before any money moves. */
export async function approveExternalProcurementRequest(requestId: string, notes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveExternalProcurementRequest');
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('procurement.epr.approve', undefined, 'approveExternalProcurementRequest');
  const request = await prisma.externalProcurementRequest.findUnique({
    where: { id: requestId },
    select: {
      status: true,
      branchId: true,
      jobCardId: true,
      referenceNumber: true,
      estimatedAmount: true,
      requestedById: true,
      financeReviewedById: true,
      supplementaryLines: { select: { amount: true } },
    },
  });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'PENDING_MANAGER_APPROVAL') {
    throw new SourcingActionError('This request is not awaiting approval.');
  }
  const user = await requireEligibleManager(request.branchId, 'procurement.epr.approve');
  // Separation of duties: the person who asked for the cash, or reviewed it, does not also approve it.
  if (user.id === request.requestedById || user.id === request.financeReviewedById) await refuse('procurement.epr.approve', 'approveExternalProcurementRequest', 'You already took part in this request (raised or reviewed it), so another manager must approve it.');
  // Nothing is approved or paid out for a Job Card that is cancelled or finished.
  await assertJobStillOpen(prisma, { jobCardId: request.jobCardId });
  // Fixed at approval, so nothing later can change what the Manager approved.
  const supplementaryTotal = request.supplementaryLines.reduce(
    (sum: number, line: (typeof request.supplementaryLines)[number]) => sum + Number(line.amount),
    0,
  );
  const approvedTotal = Math.round((Number(request.estimatedAmount) + supplementaryTotal) * 100) / 100;
  const claimed = await prisma.externalProcurementRequest.updateMany({
    where: { id: requestId, status: 'PENDING_MANAGER_APPROVAL' },
    data: {
      status: 'APPROVED',
      managerApprovedById: user.id,
      managerApprovedAt: new Date(),
      managerNotes: notes?.trim() || undefined,
      approvedTotal,
    },
  });
  // Compare-and-set: if someone else already moved it on (double click,
  // two people at once), nothing changes and this request stops here.
  if (claimed.count === 0) throw new Error('This was just done by someone else — refresh to see the latest.');
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
  // Finance pays it out next: tell the branch's Finance officers. Not the
  // person who raised it or the manager who approved it (they may not pay it out).
  const finance = await listEligibleFinanceOfficersForBranch(request.branchId).catch(() => ({ supervisors: [] as { id: string }[] }));
  emailColleaguesLater({
    branchId: request.branchId,
    userIds: finance.supervisors.map((f) => f.id).filter((id) => id !== request.requestedById),
    exceptUserId: user.id,
    path: `/workshop/external-procurement/${requestId}`,
    where: 'external_procurement.approved',
    notice: {
      subject: `Ready to pay out — ${request.referenceNumber}`,
      heading: 'An outside purchase is ready to pay out',
      intro: `The manager approved outside purchase ${request.referenceNumber}. It is waiting for Finance to pay it out.`,
      facts: [['Reference', request.referenceNumber], ['Approved total', `₦${approvedTotal.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]],
      next: 'Open the request, record how it was paid (method and reference), and pay out exactly the approved total.',
      status: { label: 'Ready to pay out', tone: 'info' },
      ctaLabel: 'Open the request',
    },
  });
}

/** Finance records the disbursement. No amount parameter: the amount is the
 * approvedTotal fixed at Manager approval, copied across, never retyped. */
export async function disburseExternalProcurementRequest(
  requestId: string,
  payment: { paymentMethod: string; paymentReference?: string; disbursementNotes?: string },
): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('disburseExternalProcurementRequest');
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('procurement.epr.disburse', undefined, 'disburseExternalProcurementRequest');
  const request = await prisma.externalProcurementRequest.findUnique({
    where: { id: requestId },
    select: { status: true, branchId: true, jobCardId: true, referenceNumber: true, approvedTotal: true, requestedById: true, managerApprovedById: true },
  });
  if (!request) {
    throw new SourcingActionError('Request not found.');
  }
  if (request.status !== 'APPROVED') {
    throw new SourcingActionError('This request has not been approved for disbursement.');
  }
  if (request.approvedTotal === null) {
    // Approval always sets approvedTotal; if it's missing, stop rather than
    // disburse an unknown amount.
    throw new SourcingActionError('This request has no approved total on record — contact an administrator before disbursing.');
  }
  const paymentMethod = payment.paymentMethod?.trim();
  if (!paymentMethod) {
    throw new SourcingActionError('Payment method is required.');
  }
  const user = await requireEligibleFinance(request.branchId, 'procurement.epr.disburse');
  // Separation of duties: the person who asked for the cash, or approved it, never pays it out.
  // (Finance may review and later pay out the same request: the manager's approval sits between; the integrity watch flags it.)
  if (user.id === request.requestedById || user.id === request.managerApprovedById) await refuse('procurement.epr.disburse', 'disburseExternalProcurementRequest', 'You already took part in this request (raised or approved it), so another Finance colleague must pay it out.');
  // Nothing is approved or paid out for a Job Card that is cancelled or finished.
  await assertJobStillOpen(prisma, { jobCardId: request.jobCardId });
  const disbursedAmount = request.approvedTotal;
  const claimed = await prisma.externalProcurementRequest.updateMany({
    where: { id: requestId, status: 'APPROVED' },
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
  // Compare-and-set: if someone else already moved it on (double click,
  // two people at once), nothing changes and this request stops here.
  if (claimed.count === 0) throw new Error('This was just done by someone else — refresh to see the latest.');

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

/** Rejects a request in Finance review or awaiting Manager approval, by
 * whoever decides at that stage. Not possible once approved. */
export async function rejectExternalProcurementRequest(requestId: string, reason: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('rejectExternalProcurementRequest');
  const request = await prisma.externalProcurementRequest.findUnique({ where: { id: requestId }, select: { status: true, branchId: true, jobCardId: true, referenceNumber: true, financeReviewedById: true } });
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
  const user = stage === 'FINANCE_REVIEW' ? await requireEligibleFinance(request.branchId, 'procurement.epr.review') : await requireEligibleManager(request.branchId, 'procurement.epr.approve');
  // Compare-and-set: a stale reject must never overwrite an approval made
  // a moment earlier (which Finance may already be disbursing against).
  claimedOrStale(await prisma.externalProcurementRequest.updateMany({
    where: { id: requestId, status: request.status },
    data: { status: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionStage: stage, rejectionReason: reason.trim() },
  }));

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
  // Turned down by the manager: the Finance colleague who reviewed it hears too.
  if (stage === 'MANAGER_APPROVAL') {
    emailColleaguesLater({
      branchId: request.branchId,
      userIds: [request.financeReviewedById],
      exceptUserId: user.id,
      path: `/workshop/external-procurement/${requestId}`,
      where: 'external_procurement.rejected',
      notice: {
        subject: `Not approved — ${request.referenceNumber}`,
        heading: 'An outside purchase you reviewed was not approved',
        intro: `The manager did not approve outside purchase ${request.referenceNumber}, which you sent for approval. Nothing is to be paid out.`,
        facts: [['Reference', request.referenceNumber], ['Reason', reason.trim().slice(0, 300)]],
        status: { label: 'Not approved', tone: 'warning' },
        ctaLabel: 'Open the request',
      },
    });
  }
}
