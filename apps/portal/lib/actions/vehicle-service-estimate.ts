'use server';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';

import { claimed } from '@/lib/integrity';
import { authorize, authorizeOnService, refuse, branchWithinReach, seeService, refuseDuringAssist } from '@/lib/authz/server';

import { assertServiceNotEscalated } from '@/lib/vehicle-service-cycle';
import { prisma } from '@ejo/database';
import { requireUser, currentUserIsMasterAdmin, requireJobCardApprover, listEligibleManagersForBranch, requireEligibleManager } from './workshop';
import { bankDetailsFor } from '@/lib/workshop-core';
import { writeAuditLog, getWorkshopOrgContext } from '@/lib/workshop-core';
import { requireStoreStaff, listEligibleStoreOfficersForBranch, listEligibleStoreManagersForBranch } from './store';
import { renderServiceEstimateNudgeEmail } from '@/lib/email-templates/service-estimate-nudge';
import { renderServiceStoreMatchingRequestedEmail, renderServiceStoreMatchingStatusEmail } from '@/lib/email-templates/service-store-matching-status';
import { renderServiceEstimateReadyForManagerEmail } from '@/lib/email-templates/service-estimate-ready-for-manager';
import { renderServiceEstimateReadyForCustomerNotificationEmail } from '@/lib/email-templates/service-estimate-ready-for-customer-notification';
import { sendEmail } from '@/lib/email';
import { renderServiceEstimateSubmittedEmail } from '@/lib/email-templates/service-estimate-submitted';
import { renderCustomerServiceEstimateApprovedEmail } from '@/lib/email-templates/customer-service-estimate-approved';
import { renderToBuffer } from '@react-pdf/renderer';
import { EstimatePdf } from '@/lib/pdf/estimate-pdf';
import { InspectionPdf } from '@/lib/pdf/inspection-pdf';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';
import { scheduleResolution } from '@/lib/enyo/predict/lines';

class ServiceEstimateActionError extends Error {}

/** Same guarantee as the Job Card estimate's withEstimateUnchanged: a line
 * change only lands if the estimate is still in the status the editor saw,
 * serialised against any approval of it (see lib/integrity.ts). */
async function withServiceEstimateUnchanged<T>(estimateId: string, seenStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'MANAGER_APPROVED', work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    claimed(
      await tx.serviceEstimate.updateMany({ where: { id: estimateId, status: seenStatus }, data: { status: seenStatus } }),
      'This estimate was just submitted or approved by someone else — refresh the page to see it.',
    );
    return work(tx);
  });
}

/** Creates the Vehicle Service's estimate. Refused once the visit is
 * escalated (the Job Card's estimate applies from then); a no-op if a draft
 * already exists. */
export async function createServiceEstimate(vehicleServiceId: string): Promise<{ id: string }> {
  await authorizeOnService('workshop.estimate.edit', vehicleServiceId, 'createServiceEstimate');
  await assertServiceNotEscalated({ vehicleServiceId });
  const user = await requireUser();
  const existing = await prisma.serviceEstimate.findUnique({ where: { vehicleServiceId }, select: { id: true } });
  if (existing) return existing;

  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: { serviceNumber: true, escalatedToJobCardId: true },
  });
  if (!service) {
    throw new ServiceEstimateActionError('Vehicle Service record not found.');
  }
  if (service.escalatedToJobCardId) {
    throw new ServiceEstimateActionError('This Vehicle Service was escalated to a Job Card. Write the estimate there instead.');
  }

  const estimate = await prisma.serviceEstimate.create({
    data: { vehicleServiceId, createdById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.created',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { serviceNumber: service.serviceNumber },
  });
  return { id: estimate.id };
}

/**
 * Undoes choosing the normal-service path: logs, then deletes the estimate,
 * so an abandoned draft never blocks escalation. Only while DRAFT or
 * SUBMITTED; once approved, Store requests or payments may depend on it.
 */
export async function cancelServiceEstimate(vehicleServiceId: string): Promise<void> {
  await assertServiceNotEscalated({ vehicleServiceId });
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { vehicleServiceId },
    select: { id: true, status: true },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('No estimate exists yet for this Vehicle Service.');
  }
  if (estimate.status === 'MANAGER_APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be cancelled here.');
  }
  const service = await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true, supervisorId: true, assignedTechnicianId: true } });
  if (!service) throw new ServiceEstimateActionError('Vehicle Service record not found.');
  // Only the people working on the estimate (assigned supervisor / technician, or Master Admin).
  await requireServiceEstimateContributor(service);
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.cancelled',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { serviceNumber: service?.serviceNumber, previousStatus: estimate.status },
  });
  // Only if it is still in the status checked above; never delete an
  // estimate a manager approved a moment ago.
  claimed(await prisma.serviceEstimate.deleteMany({ where: { id: estimate.id, status: estimate.status } }), 'This estimate was just approved or changed by someone else — refresh the page.');
}

export type ServiceEstimateLineItemInput = {
  type: 'STORE_PART' | 'INTERNAL_JOB' | 'LABOUR' | 'SUNDRY';
  description: string;
  quantity: number;
  unitPrice?: number;
  /** STORE_PART only: the generic part type needed (e.g. "Engine Oil Filter"),
   * which Store matches to a catalogue part (matchServiceEstimateStorePartLine). */
  partTypeId?: string;
  /** Non-STORE_PART lines only. A Store Part's unit is set when Store matches it. */
  unitOfMeasure?: string;
};

/** Who may add to or edit the estimate: the assigned supervisor, the
 * assigned technician, or a Master Administrator. */
async function requireServiceEstimateContributor(service: {
  supervisorId: string | null;
  assignedTechnicianId: string | null;
}): Promise<{ id: string }> {
  const user = await requireUser();
  if (service.supervisorId === user.id || service.assignedTechnicianId === user.id) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  return refuse('workshop.estimate.edit', 'requireServiceEstimateContributor', 
    'Only the assigned supervisor or the assigned technician can work on this estimate.',
  );
}

/** Who may set a line's price. Vehicle Service has no external lines, so
 * every priceable type (Internal Job, Labour, Sundry) is priced by the
 * supervisor. Store Part prices only come from Store matching. */
async function requireServicePricingAuthority(service: { supervisorId: string | null }, userId: string): Promise<void> {
  if (await currentUserIsMasterAdmin()) return;
  if (userId === service.supervisorId) return;
  return refuse('workshop.estimate.edit', 'requireServicePricingAuthority', 'Only the assigned supervisor can set a price for this line — the technician can add the description and quantity, but not the price.');
}

export async function addServiceEstimateLineItem(estimateId: string, input: ServiceEstimateLineItemInput): Promise<void> {
  await assertServiceNotEscalated({ estimateId });
  let description = input.description.trim();
  if (input.type !== 'STORE_PART' && !description) {
    throw new ServiceEstimateActionError('A description is required for this line item.');
  }
  if (input.type === 'STORE_PART' && !input.partTypeId) {
    throw new ServiceEstimateActionError('Choose which kind of part is needed before adding a Store Part line.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ServiceEstimateActionError('Quantity must be a positive number.');
  }
  if (input.unitPrice !== undefined && (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)) {
    throw new ServiceEstimateActionError('Unit price must be zero or a positive number.');
  }
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      vehicleServiceId: true,
      lineItems: { select: { type: true } },
      vehicleService: { select: { serviceNumber: true, supervisorId: true, assignedTechnicianId: true } },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status === 'APPROVED' || estimate.status === 'MANAGER_APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  const contributor = await requireServiceEstimateContributor(estimate.vehicleService);

  // Only Sundry is limited to one line, as on Job Card estimates.
  if (input.type === 'SUNDRY' && estimate.lineItems.some((li: { type: string }) => li.type === 'SUNDRY')) {
    throw new ServiceEstimateActionError('A Sundry line already exists on this estimate — edit it instead of adding another.');
  }

  if (input.unitPrice !== undefined) {
    if (input.type === 'STORE_PART') {
      throw new ServiceEstimateActionError('A Store Part line is priced when Store matches it to a catalogue part, not typed in.');
    }
    await requireServicePricingAuthority(estimate.vehicleService, contributor.id);
  }

  if (input.type === 'STORE_PART' && input.partTypeId) {
    // Description comes from the PartType, never from the client.
    const partType = await prisma.partType.findUnique({ where: { id: input.partTypeId }, select: { name: true } });
    if (!partType) {
      throw new ServiceEstimateActionError('That part type could not be found.');
    }
    description = partType.name;
  }
  if (input.type === 'STORE_PART' && input.unitOfMeasure) {
    throw new ServiceEstimateActionError('A Store Part line\'s unit is set automatically once Store matches it, not entered directly.');
  }

  const amount = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;

  await withServiceEstimateUnchanged(estimateId, estimate.status, (tx) => tx.serviceEstimateLineItem.create({
    data: {
      estimateId,
      type: input.type,
      description,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      amount,
      partTypeId: input.type === 'STORE_PART' ? input.partTypeId : null,
      unitOfMeasure: input.type === 'STORE_PART' ? null : input.unitOfMeasure?.trim() || null,
      enteredById: contributor.id,
    },
  }));
  await writeAuditLog({
    userId: contributor.id,
    action: 'service_estimate.line_item_added',
    entityType: 'VehicleService',
    entityId: estimate.vehicleServiceId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber, type: input.type, description, quantity: input.quantity, unitPrice: input.unitPrice, amount },
  });
}

/** Vehicle Service version of jobCardHasUnmatchedStoreParts(). */
export async function serviceEstimateHasUnmatchedStoreParts(vehicleServiceId: string): Promise<boolean> {
  await requireUser();
  await seeService(vehicleServiceId, 'serviceEstimateHasUnmatchedStoreParts');
  const remaining = await prisma.serviceEstimateLineItem.count({
    where: { estimate: { vehicleServiceId }, type: 'STORE_PART', matchedPartId: null },
  });
  return remaining > 0;
}

/** Store matching for a Vehicle Service estimate line. Same rules as the
 * Job Card version, including the hard stop on parts priced below cost. */
export async function matchServiceEstimateStorePartLine(lineItemId: string, partId: string): Promise<void> {
  await assertServiceNotEscalated({ lineItemId });
  const lineItem = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      type: true,
      quantity: true,
      partTypeId: true,
      estimate: {
        select: {
          id: true,
          status: true,
          vehicleService: {
            select: {
              id: true,
              serviceNumber: true,
              branchId: true,
              supervisorId: true,
              assignedTechnicianId: true,
              customer: { select: { fullName: true } },
              vehicle: { select: { make: true, model: true, engineType: true, year: true } },
            },
          },
        },
      },
    },
  });
  if (!lineItem) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (lineItem.type !== 'STORE_PART') {
    throw new ServiceEstimateActionError('Only a Store Part line can be matched to a catalogue part.');
  }
  // DRAFT is allowed as well as SUBMITTED: submission requires every line to
  // be priced, so matching has to be possible before it.
  if (lineItem.estimate.status !== 'DRAFT' && lineItem.estimate.status !== 'SUBMITTED') {
    throw new ServiceEstimateActionError('This estimate is not currently awaiting Store matching.');
  }
  const user = await requireStoreStaff(lineItem.estimate.vehicleService.branchId, 'store.matching');

  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: {
      branchId: true, partTypeId: true, name: true, baseUnitOfMeasure: true, sellingPrice: true,
      fitments: { select: { make: true, model: true, engineType: true, yearFrom: true, yearTo: true } },
    },
  });
  if (!part) {
    throw new ServiceEstimateActionError('Part not found.');
  }
  if (part.branchId !== lineItem.estimate.vehicleService.branchId) {
    throw new ServiceEstimateActionError('This Part does not belong to the same branch as this Vehicle Service.');
  }
  // A part with no fitment rows is universal and always allowed. A part with
  // fitment rows can only be matched to a vehicle on that list.
  if (part.fitments.length > 0) {
    const vehicle = lineItem.estimate.vehicleService.vehicle;
    const canCheck = vehicle?.make && vehicle?.model;
    const fits = !canCheck || part.fitments.some((f: { make: string; model: string | null; engineType: string | null; yearFrom: number | null; yearTo: number | null }) => {
      if (f.make.toLowerCase() !== vehicle!.make!.toLowerCase()) return false;
      if (f.model && f.model.toLowerCase() !== vehicle!.model!.toLowerCase()) return false;
      if (f.engineType && vehicle!.engineType && f.engineType.toLowerCase() !== vehicle!.engineType.toLowerCase()) return false;
      if (f.engineType && !vehicle!.engineType) return false;
      if (vehicle!.year !== null) {
        if (f.yearFrom !== null && vehicle!.year < f.yearFrom) return false;
        if (f.yearTo !== null && vehicle!.year > f.yearTo) return false;
      }
      return true;
    });
    if (!fits) {
      const vehicleLabel = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'this Vehicle Service\'s own vehicle';
      throw new ServiceEstimateActionError(
        `${part.name} is only recorded to fit specific vehicles, and ${vehicleLabel} isn't one of them. If it does fit, add ${vehicleLabel} to the part's Vehicle Fitment list first.`,
      );
    }
  }
  if (lineItem.partTypeId && part.partTypeId !== lineItem.partTypeId) {
    throw new ServiceEstimateActionError(`${part.name} is not the requested Part Type for this line.`);
  }
  if (part.sellingPrice === null) {
    throw new ServiceEstimateActionError(`${part.name} has no selling price set yet — set one on the Part's own page before matching.`);
  }
  const openCriticalLoss = await prisma.pricingAlert.findFirst({ where: { partId, severity: 'CRITICAL_LOSS', status: 'OPEN' }, select: { id: true } });
  if (openCriticalLoss) {
    throw new ServiceEstimateActionError(`${part.name} is priced below cost. Resolve the open Pricing Alert on this part before matching it to an estimate.`);
  }
  const unitPrice = Number(part.sellingPrice);
  const amount = Math.round(unitPrice * Number(lineItem.quantity) * 100) / 100;
  await withServiceEstimateUnchanged(lineItem.estimate.id, lineItem.estimate.status, (tx) => tx.serviceEstimateLineItem.update({
    where: { id: lineItemId },
    data: { matchedPartId: partId, unitPrice, amount, unitOfMeasure: part.baseUnitOfMeasure },
  }));
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_store_matched',
    entityType: 'ServiceEstimateLineItem',
    entityId: lineItemId,
    metadata: { partId, partName: part.name, unitPrice, amount },
  });
  // Also log against the Vehicle Service so matching shows on its timeline.
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_store_matched',
    entityType: 'VehicleService',
    entityId: lineItem.estimate.vehicleService.id,
    metadata: { serviceNumber: lineItem.estimate.vehicleService.serviceNumber, partName: part.name, unitPrice, amount },
  });

  // When nothing is left unmatched, notify automatically. Counted after this
  // match because this match may have been the last one.
  const remainingUnmatched = await prisma.serviceEstimateLineItem.count({
    where: { estimateId: lineItem.estimate.id, type: 'STORE_PART', matchedPartId: null },
  });
  if (remainingUnmatched === 0) {
    await sendServiceStoreMatchingCompleteNotification(lineItem.estimate.vehicleService, user.id);
  }
}

export async function removeServiceEstimateLineItem(lineItemId: string): Promise<void> {
  await assertServiceNotEscalated({ lineItemId });
  const line = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      enteredById: true,
      description: true,
      estimate: { select: { id: true, status: true, vehicleServiceId: true, vehicleService: { select: { serviceNumber: true, supervisorId: true } } } },
    },
  });
  if (!line) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (line.estimate.status === 'APPROVED' || line.estimate.status === 'MANAGER_APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  // Whoever entered the line, the supervisor, or a Master Administrator may
  // remove it.
  const user = await requireUser();
  const isOwnEntry = line.enteredById === user.id;
  const isSupervisor = line.estimate.vehicleService.supervisorId === user.id;
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isOwnEntry && !isSupervisor && !isMasterAdmin) {
    return refuse('workshop.estimate.edit', 'removeServiceEstimateLineItem', 'Only whoever entered this line or the assigned supervisor can remove it.');
  }
  await withServiceEstimateUnchanged(line.estimate.id, line.estimate.status, (tx) => tx.serviceEstimateLineItem.delete({ where: { id: lineItemId } }));
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_item_removed',
    entityType: 'VehicleService',
    entityId: line.estimate.vehicleServiceId,
    metadata: { serviceNumber: line.estimate.vehicleService.serviceNumber, description: line.description },
  });
}

export type ServiceEstimateLineItemUpdateInput = {
  description: string;
  quantity: number;
  unitPrice?: number;
  unitOfMeasure?: string;
};

/**
 * Edits a line on the estimate. While the estimate is open, a matched Store
 * Part line is repriced from the part's current selling price when the
 * quantity changes.
 */
export async function updateServiceEstimateLineItem(lineItemId: string, input: ServiceEstimateLineItemUpdateInput): Promise<void> {
  await assertServiceNotEscalated({ lineItemId });
  const description = input.description.trim();
  if (!description) {
    throw new ServiceEstimateActionError('A description is required for this line item.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ServiceEstimateActionError('Quantity must be a positive number.');
  }
  if (input.unitPrice !== undefined && (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)) {
    throw new ServiceEstimateActionError('Unit price must be zero or a positive number.');
  }

  const lineItem = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      type: true,
      matchedPartId: true,
      matchedPart: { select: { sellingPrice: true, name: true } },
      estimate: {
        select: {
          id: true,
          status: true,
          vehicleServiceId: true,
          vehicleService: { select: { serviceNumber: true, supervisorId: true, assignedTechnicianId: true } },
        },
      },
    },
  });
  if (!lineItem) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (lineItem.estimate.status === 'APPROVED' || lineItem.estimate.status === 'MANAGER_APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  const editor = await requireServiceEstimateContributor(lineItem.estimate.vehicleService);
  if (input.unitPrice !== undefined) {
    if (lineItem.type === 'STORE_PART') {
      throw new ServiceEstimateActionError('A Store Part line is priced when Store matches it to a catalogue part, not typed in.');
    }
    await requireServicePricingAuthority(lineItem.estimate.vehicleService, editor.id);
  }
  if (input.unitOfMeasure !== undefined && lineItem.type === 'STORE_PART') {
    throw new ServiceEstimateActionError('A Store Part line\'s unit is set automatically once Store matches it, not entered directly.');
  }

  let unitPrice = input.unitPrice;
  let amount: number | null = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;
  if (lineItem.type === 'STORE_PART' && lineItem.matchedPartId) {
    if (lineItem.matchedPart?.sellingPrice === null || lineItem.matchedPart?.sellingPrice === undefined) {
      throw new ServiceEstimateActionError(`${lineItem.matchedPart?.name ?? 'This Part'} no longer has a selling price set — set one before this line can be updated.`);
    }
    unitPrice = Number(lineItem.matchedPart.sellingPrice);
    amount = Math.round(input.quantity * unitPrice * 100) / 100;
  }

  await withServiceEstimateUnchanged(lineItem.estimate.id, lineItem.estimate.status, (tx) => tx.serviceEstimateLineItem.update({
    where: { id: lineItemId },
    data: {
      description,
      quantity: input.quantity,
      unitPrice: unitPrice ?? null,
      amount,
      ...(lineItem.type !== 'STORE_PART' ? { unitOfMeasure: input.unitOfMeasure?.trim() || null } : {}),
    },
  }));
  await writeAuditLog({
    userId: editor.id,
    action: 'service_estimate.line_item_updated',
    entityType: 'VehicleService',
    entityId: lineItem.estimate.vehicleServiceId,
    metadata: { serviceNumber: lineItem.estimate.vehicleService.serviceNumber, type: lineItem.type, description, quantity: input.quantity, unitPrice, amount },
  });
}

/** Marks the estimate ready for approval. Every line must be priced. */
export async function submitServiceEstimate(estimateId: string): Promise<void> {
  await assertServiceNotEscalated({ estimateId });
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      lineItems: { select: { id: true, type: true, matchedPartId: true, quantity: true, unitPrice: true, amount: true, description: true, matchedPart: { select: { sellingPrice: true } } } },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          supervisorId: true,
          assignedTechnicianId: true,
          department: { select: { name: true } },
          customer: { select: { fullName: true } },
          supervisor: { select: { fullName: true, email: true } },
        },
      },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status !== 'DRAFT') {
    throw new ServiceEstimateActionError('This estimate has already been submitted.');
  }
  if (estimate.lineItems.length === 0) {
    throw new ServiceEstimateActionError('Add at least one line item before submitting this estimate.');
  }
  // Who may submit is checked before anything is written.
  const user = await requireServiceEstimateContributor(estimate.vehicleService);

  // Read, reprice, check and submit as one step with the estimate locked
  // (same as the Job Card estimate's submit).
  await withServiceEstimateUnchanged(estimateId, 'DRAFT', async (tx) => {
    const lines = await tx.serviceEstimateLineItem.findMany({
      where: { estimateId },
      select: { id: true, type: true, matchedPartId: true, quantity: true, unitPrice: true, amount: true, description: true, matchedPart: { select: { sellingPrice: true } } },
    });
    if (lines.length === 0) {
      throw new ServiceEstimateActionError('Add at least one line item before submitting this estimate.');
    }
    // Submission fixes a matched Store Part line's current price on the estimate.
    for (const li of lines as (typeof lines)[number][]) {
      if (li.type === 'STORE_PART' && li.matchedPartId && li.matchedPart?.sellingPrice !== null && li.matchedPart?.sellingPrice !== undefined) {
        const liveUnitPrice = Number(li.matchedPart.sellingPrice);
        const liveAmount = Math.round(Number(li.quantity) * liveUnitPrice * 100) / 100;
        if (Number(li.unitPrice ?? -1) !== liveUnitPrice || Number(li.amount ?? -1) !== liveAmount) {
          await tx.serviceEstimateLineItem.update({ where: { id: li.id }, data: { unitPrice: liveUnitPrice, amount: liveAmount } });
        }
        (li as { unitPrice: unknown }).unitPrice = liveUnitPrice;
      }
    }
    // An unmatched Store Part line never has a unitPrice, so this one check
    // catches both an unpriced line and one Store hasn't matched.
    const missingPricesOn = lines.filter((li: { unitPrice: unknown }) => li.unitPrice === null);
    if (missingPricesOn.length > 0) {
      throw new ServiceEstimateActionError(
        `Every line needs a price before submitting — missing on: ${missingPricesOn.map((li: { description: string }) => li.description).join(', ')}.`,
      );
    }
    claimed(await tx.serviceEstimate.updateMany({ where: { id: estimateId, status: 'DRAFT' }, data: { status: 'SUBMITTED', submittedAt: new Date() } }), 'This estimate was just submitted by someone else — refresh the page.');
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.submitted',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  // Notify whoever approves it (fail-soft).
  try {
    if (!estimate.vehicleService.supervisor) return;
    // Independent lookups for the email, run in parallel.
    const [submitter, orgContext] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }), getWorkshopOrgContext(estimate.vehicleService.department?.name)]);
    const portalUrl = portalBaseUrl();
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    await sendEmail(
      estimate.vehicleService.supervisor.email,
      `Estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} needs your approval`,
      renderServiceEstimateSubmittedEmail({
        recipientName: estimate.vehicleService.supervisor.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        customerName: estimate.vehicleService.customer.fullName,
        submittedByName: submitter?.fullName ?? 'A team member',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        serviceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send estimate-submitted email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

export async function approveServiceEstimate(estimateId: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveServiceEstimate');
  await assertServiceNotEscalated({ estimateId });
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      lineItems: { select: { type: true, matchedPartId: true, amount: true } },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          supervisorId: true,
          branchId: true,
          customer: { select: { fullName: true } },
          branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status !== 'SUBMITTED') {
    throw new ServiceEstimateActionError('Only a submitted estimate can be approved.');
  }
  // Re-check at approval: a Store Part line may have been added since
  // submission, and nothing goes to a Manager unmatched.
  const unmatchedStoreParts = estimate.lineItems.filter((li: { type: string; matchedPartId: string | null }) => li.type === 'STORE_PART' && !li.matchedPartId);
  if (unmatchedStoreParts.length > 0) {
    throw new ServiceEstimateActionError(
      `${pluralize(unmatchedStoreParts.length, 'Store Part line')} still ${unmatchedStoreParts.length === 1 ? 'needs' : 'need'} to be matched by Store before this estimate can be approved.`,
    );
  }
  const user = await requireJobCardApprover(estimate.vehicleService);
  await authorize('workshop.estimate.approve', { branchId: estimate.vehicleService.branchId, assigneeIds: [estimate.vehicleService.supervisorId] }, 'approveServiceEstimate');
  claimed(await prisma.serviceEstimate.updateMany({ where: { id: estimateId, status: 'SUBMITTED' },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  }), 'This estimate was just approved or changed by someone else — refresh the page.');
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.approved',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  // Supervisor approval is not final: the branch's Workshop Managers are
  // notified and the first to act completes the review. Fail-soft.
  try {
    const managers = await listEligibleManagersForBranch(estimate.vehicleService.branchId);
    if (managers.supervisors.length === 0) return;
    const approver = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = portalBaseUrl();
    const companyName = estimate.vehicleService.branch.businessUnit.organisation.name;
    const branchName = estimate.vehicleService.branch.name;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} needs your approval`,
        renderServiceEstimateReadyForManagerEmail({
          managerName: manager.fullName,
          serviceNumber: estimate.vehicleService.serviceNumber,
          customerName: estimate.vehicleService.customer.fullName,
          approvedByName: approver?.fullName ?? 'The supervisor',
          totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName,
          branchName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send estimate-ready-for-manager email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

/** The Workshop Manager's sign-off. The service's creator is notified;
 * sending to the customer is a separate step
 * (notifyCustomerOfApprovedServiceEstimate). */
export async function approveServiceEstimateAsManager(estimateId: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveServiceEstimateAsManager');
  await assertServiceNotEscalated({ estimateId });
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      lineItems: { select: { amount: true } },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          branchId: true,
          createdById: true,
          createdBy: { select: { fullName: true, email: true } },
          customer: { select: { fullName: true } },
          branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status !== 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate has not been approved by its supervisor yet.');
  }
  const user = await requireEligibleManager(estimate.vehicleService.branchId, 'workshop.estimate.final_approve');
  await authorize('workshop.estimate.final_approve', { branchId: estimate.vehicleService.branchId }, 'approveServiceEstimateAsManager');

  claimed(await prisma.serviceEstimate.updateMany({ where: { id: estimateId, status: 'APPROVED' },
    data: { status: 'MANAGER_APPROVED', managerApprovedAt: new Date(), managerApprovedById: user.id },
  }), 'This estimate was just approved or changed by someone else — refresh the page.');

  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.manager_approved',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });
  // Enyo: score its prediction against the approved lines (once; errors only logged).
  scheduleResolution({ kind: 'SERVICE', id: estimate.vehicleService.id });

  // Tell the Vehicle Service's creator; they decide when the customer is
  // notified. Fail-soft.
  try {
    const manager = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      estimate.vehicleService.createdBy.email,
      `Estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} approved by manager — ready to send`,
      renderServiceEstimateReadyForCustomerNotificationEmail({
        recipientName: estimate.vehicleService.createdBy.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        customerName: estimate.vehicleService.customer.fullName,
        approvedByManagerName: manager?.fullName ?? 'The manager',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: estimate.vehicleService.branch.businessUnit.organisation.name,
        branchName: estimate.vehicleService.branch.name,
      }),
    );
  } catch (err) {
    logFailure('Failed to send estimate-ready-for-customer-notification email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

/** Sends the Manager-approved estimate to the customer, with the estimate
 * PDF (and the inspection PDF when there is one). Only the service's
 * creator or a Master Admin, and only after Manager approval. */
export async function notifyCustomerOfApprovedServiceEstimate(estimateId: string): Promise<void> {
  await assertServiceNotEscalated({ estimateId });
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      customerNotifiedAt: true,
      lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true } },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          createdById: true,
          customer: { select: { fullName: true, email: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } },
          branch: {
            select: {
              name: true,
              address: true,
              hotlines: true,
              email: true,
              businessUnit: { select: { organisation: { select: { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true } } } },
            },
          },
          inspection: {
            select: {
              status: true,
              completedAt: true,
              inspectedBy: { select: { fullName: true } },
              items: { select: { section: true, name: true, condition: true, severity: true, action: true } },
            },
          },
        },
      },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status !== 'MANAGER_APPROVED') {
    throw new ServiceEstimateActionError('This estimate has not been approved by the manager yet.');
  }
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (user.id !== estimate.vehicleService.createdById && !isMasterAdmin) {
    return refuse('workshop.customer.notify', 'notifyCustomerOfApprovedServiceEstimate', 'Only whoever created this Vehicle Service can notify the customer.');
  }
  if (estimate.customerNotifiedAt) {
    throw new ServiceEstimateActionError('The customer has already been notified about this estimate.');
  }

  claimed(await prisma.serviceEstimate.updateMany({ where: { id: estimateId, status: 'MANAGER_APPROVED', customerNotifiedAt: null },
    data: { customerNotifiedAt: new Date(), customerNotifiedById: user.id },
  }), 'The customer was just notified about this estimate by someone else — refresh the page.');
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.customer_notified',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  try {
    const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = portalBaseUrl();
    const vehicleDescription = [estimate.vehicleService.vehicle.make, estimate.vehicleService.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    // Customer-facing split, as for Job Cards: Parts & Services (Store Part +
    // Internal Job), Labour and Sundry. Never the internal line types.
    let servicesTotal = 0;
    let labourTotal = 0;
    let sundryTotal = 0;
    for (const li of estimate.lineItems as { type: string; amount: unknown }[]) {
      const amount = Number(li.amount ?? 0);
      if (li.type === 'LABOUR') labourTotal += amount;
      else if (li.type === 'SUNDRY') sundryTotal += amount;
      else servicesTotal += amount;
    }
    const minimumDepositForEmail = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
    // Payment reference: number, vehicle, plate (same as Job Cards).
    const paymentRemarkSuggestion = [estimate.vehicleService.serviceNumber, vehicleDescription, estimate.vehicleService.vehicle.plateNumber]
      .filter(Boolean)
      .join(' ');
    const websiteUrl = websiteBaseUrl();
    await sendEmail(
      estimate.vehicleService.customer.email,
      `Estimate ready for ${estimate.vehicleService.serviceNumber} — ${[vehicleDescription, estimate.vehicleService.vehicle.plateNumber ? `(${estimate.vehicleService.vehicle.plateNumber})` : ''].filter(Boolean).join(' ')}`,
      renderCustomerServiceEstimateApprovedEmail({
        customerName: estimate.vehicleService.customer.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        vehicleDescription,
        plateNumber: estimate.vehicleService.vehicle.plateNumber,
        lineItems: (estimate.lineItems as { description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null }[]).map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitOfMeasure: li.unitOfMeasure,
          amount: formatNaira(Number(li.amount ?? 0)),
        })),
        servicesSubtotal: servicesTotal > 0 ? formatNaira(servicesTotal) : undefined,
        labourSubtotal: labourTotal > 0 ? formatNaira(labourTotal) : undefined,
        sundrySubtotal: sundryTotal > 0 ? formatNaira(sundryTotal) : undefined,
        totalAmount: formatNaira(total),
        minimumDepositAmount: formatNaira(minimumDepositForEmail),
        depositPercent: Math.round(MINIMUM_DEPOSIT_FRACTION * 100),
        ...(await bankDetailsFor((await prisma.vehicleService.findUnique({ where: { id: estimate.vehicleService.id }, select: { branchId: true } }))?.branchId)),
        paymentRemarkSuggestion,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#service-${estimate.vehicleService.id}`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: estimate.vehicleService.branch.businessUnit.organisation.name,
        branchName: estimate.vehicleService.branch.name,
      }),
      await (async () => {
        // Uses the Job Card PDF layout (EstimatePdf) with the reference label set to
        // "VEHICLE SERVICE".
        try {
          const org = estimate.vehicleService.branch.businessUnit.organisation;
          const formatNairaForPdf = (value: number) => `NGN ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
          const pdfBuffer = await renderToBuffer(
            EstimatePdf({
              organisation: {
                name: org.name,
                legalName: org.legalName,
                hqAddress: org.hqAddress,
                poBox: org.poBox,
                rcNumber: org.rcNumber,
                hotlines: org.hotlines,
                website: org.website,
                email: org.email,
              },
              branch: {
                name: estimate.vehicleService.branch.name,
                address: estimate.vehicleService.branch.address,
                hotlines: estimate.vehicleService.branch.hotlines,
                email: estimate.vehicleService.branch.email,
              },
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              jobNumber: estimate.vehicleService.serviceNumber,
              referenceLabel: 'VEHICLE SERVICE',
              customerName: estimate.vehicleService.customer.fullName,
              customerAddress: estimate.vehicleService.customer.address,
              vehicleDescription: [estimate.vehicleService.vehicle.year, estimate.vehicleService.vehicle.make, estimate.vehicleService.vehicle.model].filter(Boolean).join(' ') || vehicleDescription,
              plateNumber: estimate.vehicleService.vehicle.plateNumber,
              chassisNumber: estimate.vehicleService.vehicle.chassisNumber,
              lineItems: estimate.lineItems.map((li: { description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null }) => ({
                description: li.description,
                quantity: Number(li.quantity),
                unitLabel: li.unitOfMeasure ? pluralizeWord(Number(li.quantity), li.unitOfMeasure) : null,
                amount: formatNairaForPdf(Number(li.amount ?? 0)),
              })),
              servicesSubtotal: servicesTotal > 0 ? formatNairaForPdf(servicesTotal) : null,
              labourSubtotal: labourTotal > 0 ? formatNairaForPdf(labourTotal) : null,
              sundrySubtotal: sundryTotal > 0 ? formatNairaForPdf(sundryTotal) : null,
              totalAmount: formatNairaForPdf(total),
              minimumDepositAmount: formatNairaForPdf(minimumDeposit),
              ...(await bankDetailsFor((await prisma.vehicleService.findUnique({ where: { id: estimate.vehicleService.id }, select: { branchId: true } }))?.branchId)),
              paymentRemarkSuggestion,
            }),
          );
          const attachments: { filename: string; content: Buffer; contentType: string }[] = [
            { filename: `Estimate-${estimate.vehicleService.serviceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
          ];

          // Attach the inspection report only for a completed inspection; a skipped
          // inspection has no findings.
          const inspection = estimate.vehicleService.inspection;
          if (inspection && inspection.status === 'COMPLETED') {
            try {
              const reviewedItems = inspection.items.filter((i: { severity: string | null }) => i.severity);
              const inspectionPdfBuffer = await renderToBuffer(
                InspectionPdf({
                  organisation: {
                    name: org.name,
                    legalName: org.legalName,
                    hqAddress: org.hqAddress,
                    poBox: org.poBox,
                    rcNumber: org.rcNumber,
                    hotlines: org.hotlines,
                    website: org.website,
                    email: org.email,
                  },
                  branch: {
                    name: estimate.vehicleService.branch.name,
                    address: estimate.vehicleService.branch.address,
                    hotlines: estimate.vehicleService.branch.hotlines,
                    email: estimate.vehicleService.branch.email,
                  },
                  logoUrl: `${portalUrl}/images/logo/logo.png`,
                  serviceNumber: estimate.vehicleService.serviceNumber,
                  customerName: estimate.vehicleService.customer.fullName,
                  vehicleDescription: [estimate.vehicleService.vehicle.year, estimate.vehicleService.vehicle.make, estimate.vehicleService.vehicle.model].filter(Boolean).join(' ') || vehicleDescription,
                  plateNumber: estimate.vehicleService.vehicle.plateNumber,
                  chassisNumber: estimate.vehicleService.vehicle.chassisNumber,
                  inspectedByName: inspection.inspectedBy.fullName,
                  completedOnLabel: inspection.completedAt ? formatDateTime(inspection.completedAt) : formatDateTime(new Date()),
                  reviewedItems: reviewedItems.map((i: { section: string; name: string; condition: string | null; severity: string | null; action: string | null }) => ({
                    section: i.section,
                    name: i.name,
                    condition: i.condition,
                    severity: i.severity,
                    action: i.action,
                  })),
                }),
              );
              attachments.push({ filename: `Inspection-${estimate.vehicleService.serviceNumber}.pdf`, content: inspectionPdfBuffer, contentType: 'application/pdf' });
            } catch (inspectionPdfErr) {
              // Never let the inspection PDF block the estimate PDF or the email.
              logFailure('Failed to generate Vehicle Service inspection PDF attachment', estimate.vehicleService.serviceNumber, inspectionPdfErr);
            }
          }

          return attachments;
        } catch (pdfErr) {
          // A failed PDF never blocks the email.
          logFailure('Failed to generate Vehicle Service estimate PDF attachment', estimate.vehicleService.serviceNumber, pdfErr);
          return undefined;
        }
      })(),
    );
  } catch (err) {
    logFailure('Failed to send customer estimate-approved email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

export async function getServiceEstimate(vehicleServiceId: string) {
  await requireUser();
  await seeService(vehicleServiceId, 'getServiceEstimate');
  return prisma.serviceEstimate.findUnique({
    where: { vehicleServiceId },
    include: {
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      customerNotifiedBy: { select: { fullName: true } },
      lineItems: {
        orderBy: { createdAt: 'asc' },
        include: { enteredBy: { select: { fullName: true } }, matchedPart: { select: { name: true, sellingPrice: true } } },
      },
    },
  });
}

async function sendServiceEstimateNudge(params: {
  vehicleServiceId: string;
  fromRole: 'supervisor' | 'technician';
  fromUserId: string;
  toUserId: string;
  note?: string;
}): Promise<void> {
  const service = await prisma.vehicleService.findUnique({
    where: { id: params.vehicleServiceId },
    select: { serviceNumber: true, customer: { select: { fullName: true } } },
  });
  if (!service) {
    throw new ServiceEstimateActionError('Vehicle Service not found.');
  }
  await writeAuditLog({
    userId: params.fromUserId,
    action: params.fromRole === 'supervisor' ? 'service_estimate.nudge_to_technician' : 'service_estimate.nudge_to_supervisor',
    entityType: 'VehicleService',
    entityId: params.vehicleServiceId,
    metadata: params.note?.trim() ? { notes: params.note.trim() } : undefined,
  });
  try {
    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.fromUserId }, select: { fullName: true } }),
      prisma.user.findUnique({ where: { id: params.toUserId }, select: { fullName: true, email: true } }),
    ]);
    if (!toUser) return;
    const orgContext = await getWorkshopOrgContext();
    const portalUrl = portalBaseUrl();
    await sendEmail(
      toUser.email,
      `Please look at the estimate — Vehicle Service ${service.serviceNumber}`,
      renderServiceEstimateNudgeEmail({
        recipientName: toUser.fullName,
        fromName: fromUser?.fullName ?? 'A team member',
        fromRole: params.fromRole,
        serviceNumber: service.serviceNumber,
        customerName: service.customer.fullName,
        note: params.note,
        vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${params.vehicleServiceId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch {
    // The note is audited even if the email fails.
  }
}

/** The technician nudges the supervisor to review or price the estimate. */
export async function notifySupervisorAboutServiceEstimate(vehicleServiceId: string, note?: string): Promise<void> {
  await assertServiceNotEscalated({ vehicleServiceId });
  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: { supervisorId: true, assignedTechnicianId: true },
  });
  if (!service) {
    throw new ServiceEstimateActionError('Vehicle Service not found.');
  }
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (user.id !== service.assignedTechnicianId && !isMasterAdmin) {
    return refuse('workshop.estimate.edit', 'notifySupervisorAboutServiceEstimate', 'Only the assigned technician can notify the supervisor about this estimate.');
  }
  if (!service.supervisorId) {
    throw new ServiceEstimateActionError('This Vehicle Service has no supervisor assigned yet.');
  }
  await sendServiceEstimateNudge({ vehicleServiceId, fromRole: 'technician', fromUserId: user.id, toUserId: service.supervisorId, note });
}

/** The supervisor nudges the technician to review or price the estimate. */
export async function notifyTechnicianAboutServiceEstimate(vehicleServiceId: string, note?: string): Promise<void> {
  await assertServiceNotEscalated({ vehicleServiceId });
  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: { supervisorId: true, assignedTechnicianId: true },
  });
  if (!service) {
    throw new ServiceEstimateActionError('Vehicle Service not found.');
  }
  const user = await requireJobCardApprover(service);
  if (!service.assignedTechnicianId) {
    throw new ServiceEstimateActionError('This Vehicle Service has no technician assigned yet.');
  }
  await sendServiceEstimateNudge({ vehicleServiceId, fromRole: 'supervisor', fromUserId: user.id, toUserId: service.assignedTechnicianId, note });
}

async function sendServiceStoreMatchingCompleteNotification(
  service: { id: string; serviceNumber: string; supervisorId: string | null; assignedTechnicianId: string | null; customer: { fullName: string } },
  userId: string,
  note?: string,
): Promise<void> {
  await writeAuditLog({
    userId,
    action: 'service_estimate.store_matching_completed',
    entityType: 'VehicleService',
    entityId: service.id,
    metadata: { note: note?.trim() || undefined },
  });
  try {
    const orgContext = await getWorkshopOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    const recipientIds = [service.supervisorId, service.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { fullName: true, email: true } });
    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `Store matching complete — Vehicle Service ${service.serviceNumber}`,
        renderServiceStoreMatchingStatusEmail({
          recipientName: recipient.fullName,
          kind: 'complete',
          serviceNumber: service.serviceNumber,
          customerName: service.customer.fullName,
          note,
          vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${service.id}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
  } catch {
    // The audit entry above stands even if the email fails.
  }
}

/**
 * Asks Store to match this service's Store Part lines (Vehicle Service
 * version of requestStoreMatching). Emails the branch's Store staff with the
 * waiting lines.
 */
export async function requestServiceEstimateStoreMatching(vehicleServiceId: string, note?: string): Promise<void> {
  await assertServiceNotEscalated({ vehicleServiceId });
  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: {
      branchId: true,
      serviceNumber: true,
      supervisorId: true,
      assignedTechnicianId: true,
      customer: { select: { fullName: true } },
      serviceEstimate: {
        select: {
          id: true,
          lineItems: {
            where: { type: 'STORE_PART', matchedPartId: null },
            select: {
              description: true,
              quantity: true,
              partType: { select: { parts: { where: { isActive: true }, take: 1, select: { baseUnitOfMeasure: true } } } },
            },
          },
        },
      },
    },
  });
  if (!service) {
    throw new ServiceEstimateActionError('Vehicle Service not found.');
  }
  if (!service.serviceEstimate) {
    throw new ServiceEstimateActionError('This Vehicle Service has no estimate yet.');
  }
  if (service.serviceEstimate.lineItems.length === 0) {
    throw new ServiceEstimateActionError('There are no Store Part lines currently awaiting a match.');
  }
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (service.supervisorId !== user.id && service.assignedTechnicianId !== user.id && !isMasterAdmin) {
    return refuse('workshop.estimate.edit', 'requestServiceEstimateStoreMatching', 'Only the assigned supervisor or the assigned technician can request Store matching.');
  }

  await prisma.serviceEstimate.update({
    where: { id: service.serviceEstimate.id },
    data: { matchingRequestedAt: new Date(), matchingRequestedById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.store_matching_requested',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { lineCount: service.serviceEstimate.lineItems.length, note: note?.trim() || undefined },
  });

  try {
    const [storeOfficers, storeManagers, requestedByUser] = await Promise.all([
      listEligibleStoreOfficersForBranch(service.branchId),
      listEligibleStoreManagersForBranch(service.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const storeRecipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...storeOfficers.staff, ...storeManagers.staff]) {
      storeRecipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getWorkshopOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const recipient of storeRecipients.values()) {
      await sendEmail(
        recipient.email,
        `Please match parts — Vehicle Service ${service.serviceNumber}`,
        renderServiceStoreMatchingRequestedEmail({
          recipientName: recipient.fullName,
          requestedByName: requestedByUser?.fullName ?? 'A team member',
          serviceNumber: service.serviceNumber,
          customerName: service.customer.fullName,
          lines: service.serviceEstimate.lineItems.map((l: { description: string; quantity: unknown; partType: { parts: { baseUnitOfMeasure: string }[] } | null }) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unit: l.partType?.parts[0]?.baseUnitOfMeasure ?? null,
          })),
          note,
          matchingUrl: `${portalUrl}/inventory/service-estimate-matching/${vehicleServiceId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
    // Status-only email to the supervisor and technician; Store gets the
    // detailed one above.
    const statusRecipientIds = [service.supervisorId, service.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const statusRecipients = await prisma.user.findMany({ where: { id: { in: statusRecipientIds } }, select: { fullName: true, email: true } });
    for (const recipient of statusRecipients) {
      await sendEmail(
        recipient.email,
        `Waiting for Store to match parts — Vehicle Service ${service.serviceNumber}`,
        renderServiceStoreMatchingStatusEmail({
          recipientName: recipient.fullName,
          kind: 'awaiting',
          serviceNumber: service.serviceNumber,
          customerName: service.customer.fullName,
          note,
          vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${vehicleServiceId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
  } catch {
    // The audit entry above stands even if these emails fail.
  }
}

/**
 * Store's Vehicle Service queue: unmatched lines on estimates that were sent
 * for matching (matchingRequestedAt set), not every draft in progress.
 */
export async function listUnmatchedServiceEstimateStorePartLines(branchId: string) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  return prisma.serviceEstimateLineItem.findMany({
    where: {
      type: 'STORE_PART',
      matchedPartId: null,
      estimate: { status: { in: ['DRAFT', 'SUBMITTED'] }, matchingRequestedAt: { not: null }, vehicleService: { branchId } },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      partType: { select: { id: true, name: true, category: { select: { name: true } } } },
      estimate: {
        select: {
          vehicleService: {
            select: {
              id: true,
              serviceNumber: true,
              vehicle: { select: { id: true, make: true, model: true, engineType: true, year: true } },
            },
          },
        },
      },
    },
  });
}

export async function listUnmatchedServiceEstimateStorePartLinesForVehicleService(vehicleServiceId: string) {
  await requireUser();
  await seeService(vehicleServiceId, 'listUnmatchedServiceEstimateStorePartLinesForVehicleService');
  return prisma.serviceEstimateLineItem.findMany({
    where: {
      type: 'STORE_PART',
      matchedPartId: null,
      estimate: { status: { in: ['DRAFT', 'SUBMITTED'] }, matchingRequestedAt: { not: null }, vehicleServiceId },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      partType: { select: { id: true, name: true, category: { select: { name: true } } } },
    },
  });
}
