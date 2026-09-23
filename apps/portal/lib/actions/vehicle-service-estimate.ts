'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopOrgContext, currentUserIsMasterAdmin, requireJobCardApprover, listEligibleManagersForBranch, requireEligibleManager } from './workshop';
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
import { MINIMUM_DEPOSIT_FRACTION, COMPANY_BANK_DETAILS } from '@/lib/workshop-constants';

class ServiceEstimateActionError extends Error {}

/**
 * Creates the one real estimate for a Vehicle Service — refused if
 * the visit has already been escalated to a real Job Card (that
 * Job Card's own Estimate is the real one from that point on, never
 * this one — the two are mutually exclusive by design), and a
 * harmless no-op if a draft already exists.
 */
export async function createServiceEstimate(vehicleServiceId: string): Promise<{ id: string }> {
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
    throw new ServiceEstimateActionError('This Vehicle Service was already escalated to a real Job Card — write the estimate there instead.');
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
 * The one real, deliberate way to undo choosing the "normal service"
 * path — same flexibility as cancelVehicleInspection: genuinely
 * deletes the record after logging what happened first, so choosing
 * to escalate instead is never blocked by an abandoned draft. Only
 * while still DRAFT or SUBMITTED — once APPROVED, real Store Part
 * requests or real payments may already exist against this estimate,
 * so cancelling it at that point would orphan real, live records
 * rather than undo a choice that was never acted on yet.
 */
export async function cancelServiceEstimate(vehicleServiceId: string): Promise<void> {
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
  const service = await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.cancelled',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { serviceNumber: service?.serviceNumber, previousStatus: estimate.status },
  });
  await prisma.serviceEstimate.delete({ where: { id: estimate.id } });
}

export type ServiceEstimateLineItemInput = {
  type: 'STORE_PART' | 'INTERNAL_JOB' | 'LABOUR' | 'SUNDRY';
  description: string;
  quantity: number;
  unitPrice?: number;
  /** Only meaningful for a STORE_PART line — which generic kind of
   * part is actually needed (e.g. "Engine Oil Filter"); Store later
   * matches this to a real, specific, vehicle-fitting Part from the
   * actual catalogue via matchServiceEstimateStorePartLine below. */
  partTypeId?: string;
  /** Only meaningful for a non-STORE_PART line — a STORE_PART line's
   * unit is set automatically once Store matches it, never by
   * whoever adds the line. Same real rule as Job Card's own estimate. */
  unitOfMeasure?: string;
};

/** Who can add to or edit a Vehicle Service's estimate — the assigned
 * supervisor, the assigned technician, or a Master Administrator.
 * Same real shape as Job Card's own requireEstimateContributor. */
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
  throw new ServiceEstimateActionError(
    'Only the assigned supervisor, the assigned technician, or a Master Administrator can work on this estimate.',
  );
}

/** Who's actually allowed to set the PRICE on a given line — same
 * real reasoning as Job Card's own requirePricingAuthority, just
 * simpler since Vehicle Service has no External Part/Job concept at
 * all: every priceable type here (Internal Job, Labour, Sundry) is
 * priced by the supervisor alone, never the technician. Store Part
 * is never priced here regardless of who's asking — that price can
 * only ever come from Store's own real match against the catalog. */
async function requireServicePricingAuthority(service: { supervisorId: string | null }, userId: string): Promise<void> {
  if (await currentUserIsMasterAdmin()) return;
  if (userId === service.supervisorId) return;
  throw new ServiceEstimateActionError('Only the assigned supervisor can set a price for this line — the technician can add the description and quantity, but not the price.');
}

export async function addServiceEstimateLineItem(estimateId: string, input: ServiceEstimateLineItemInput): Promise<void> {
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
  if (estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  const contributor = await requireServiceEstimateContributor(estimate.vehicleService);

  // Same real evidence-based rule as Job Card's own estimate — only
  // Sundry is capped at one line; Internal Job and Labour both need
  // to support multiple real entries.
  if (input.type === 'SUNDRY' && estimate.lineItems.some((li: { type: string }) => li.type === 'SUNDRY')) {
    throw new ServiceEstimateActionError('A Sundry line already exists on this estimate — edit it instead of adding another.');
  }

  if (input.unitPrice !== undefined) {
    if (input.type === 'STORE_PART') {
      throw new ServiceEstimateActionError('A Store Part line is priced by Store matching it to a real catalog Part, not typed in directly.');
    }
    await requireServicePricingAuthority(estimate.vehicleService, contributor.id);
  }

  if (input.type === 'STORE_PART' && input.partTypeId) {
    // A Store Part line's own description is never trusted from
    // client input — always derived server-side from the real
    // PartType's own name, same principle as Job Card's own estimate.
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

  await prisma.serviceEstimateLineItem.create({
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
  });
  await writeAuditLog({
    userId: contributor.id,
    action: 'service_estimate.line_item_added',
    entityType: 'VehicleService',
    entityId: estimate.vehicleServiceId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber, type: input.type, description, quantity: input.quantity, unitPrice: input.unitPrice, amount },
  });
}

/**
 * The real Vehicle Service equivalent of Job Card's own
 * jobCardHasUnmatchedStoreParts — the one honest check that decides
 * whether Store should stay right here matching this Vehicle
 * Service's next line, or genuinely be done and sent back to the
 * general queue.
 */
export async function serviceEstimateHasUnmatchedStoreParts(vehicleServiceId: string): Promise<boolean> {
  const remaining = await prisma.serviceEstimateLineItem.count({
    where: { estimate: { vehicleServiceId }, type: 'STORE_PART', matchedPartId: null },
  });
  return remaining > 0;
}

/** The real Store-matching step — same two-moment flow, same
 * pricing-alert hard-stop, as Job Card's own estimate matching: a
 * Part currently priced below its own real cost can never be matched
 * onto a customer's estimate, here either. */
export async function matchServiceEstimateStorePartLine(lineItemId: string, partId: string): Promise<void> {
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
    throw new ServiceEstimateActionError('Only a Store Part line can be matched to a real Part.');
  }
  // DRAFT included deliberately, not just SUBMITTED — same real
  // reasoning as Job Card's own estimate: matching has to be
  // possible before submission whenever a Store Part is involved, or
  // submitting an estimate with one in it would be a genuine
  // deadlock.
  if (lineItem.estimate.status !== 'DRAFT' && lineItem.estimate.status !== 'SUBMITTED') {
    throw new ServiceEstimateActionError('This estimate is not currently awaiting Store matching.');
  }
  const user = await requireStoreStaff(lineItem.estimate.vehicleService.branchId);

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
  // Same real, deliberate safeguard as Job Card's own matching — a
  // Part with no fitment rows at all is genuinely universal (fluids,
  // cleaners, generic consumables) and always allowed through; a
  // Part that DOES have real fitment rows on record is a discrete
  // component this workshop has said only fits specific vehicles,
  // and matching it onto the wrong one is the exact real mistake
  // this exists to prevent.
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
        `${part.name} is only recorded to fit specific vehicles, and ${vehicleLabel} isn't one of them — this would be the exact real mistake Vehicle Fitment exists to prevent. If this Part genuinely does fit, add ${vehicleLabel} to its Vehicle Fitment list first.`,
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
    throw new ServiceEstimateActionError(`${part.name} is currently priced below its own real cost — resolve the open Pricing Alert on this Part before matching it to an estimate.`);
  }
  const unitPrice = Number(part.sellingPrice);
  const amount = Math.round(unitPrice * Number(lineItem.quantity) * 100) / 100;
  await prisma.serviceEstimateLineItem.update({
    where: { id: lineItemId },
    data: { matchedPartId: partId, unitPrice, amount, unitOfMeasure: part.baseUnitOfMeasure },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_store_matched',
    entityType: 'ServiceEstimateLineItem',
    entityId: lineItemId,
    metadata: { partId, partName: part.name, unitPrice, amount },
  });
  // Same real "one entry against the real entity, one against the
  // parent record" pattern already used everywhere else — without
  // this second entry, Store's own matching work never shows up on
  // the Vehicle Service's own timeline at all.
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_store_matched',
    entityType: 'VehicleService',
    entityId: lineItem.estimate.vehicleService.id,
    metadata: { serviceNumber: lineItem.estimate.vehicleService.serviceNumber, partName: part.name, unitPrice, amount },
  });

  // Same real automatic replacement for a manual "Notify — Matching
  // Complete" button as Job Card's own version — checked fresh here
  // rather than trusted from before this match, since this match
  // itself is what might have just made it true.
  const remainingUnmatched = await prisma.serviceEstimateLineItem.count({
    where: { estimateId: lineItem.estimate.id, type: 'STORE_PART', matchedPartId: null },
  });
  if (remainingUnmatched === 0) {
    await sendServiceStoreMatchingCompleteNotification(lineItem.estimate.vehicleService, user.id);
  }
}

export async function removeServiceEstimateLineItem(lineItemId: string): Promise<void> {
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
  if (line.estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  // Same real "whoever entered it, the supervisor, or a Master
  // Administrator" rule as Job Card's own estimate — a technician can
  // correct their own mistake, but can't erase someone else's entry
  // without real oversight.
  const user = await requireUser();
  const isOwnEntry = line.enteredById === user.id;
  const isSupervisor = line.estimate.vehicleService.supervisorId === user.id;
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isOwnEntry && !isSupervisor && !isMasterAdmin) {
    throw new ServiceEstimateActionError('Only whoever entered this line, the assigned supervisor, or a Master Administrator can remove it.');
  }
  await prisma.serviceEstimateLineItem.delete({ where: { id: lineItemId } });
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
 * Real, after-the-fact correction of a line already on the estimate
 * — same exact real reasoning as Job Card's own updateEstimateLineItem,
 * including the one real detail that makes it trustworthy: a matched
 * Store Part line's own price is never frozen the moment it was
 * matched — while the estimate is still genuinely open for editing,
 * changing the quantity here recomputes against the Part's own
 * CURRENT real selling price, never a stale snapshot.
 */
export async function updateServiceEstimateLineItem(lineItemId: string, input: ServiceEstimateLineItemUpdateInput): Promise<void> {
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
  if (lineItem.estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  const editor = await requireServiceEstimateContributor(lineItem.estimate.vehicleService);
  if (input.unitPrice !== undefined) {
    if (lineItem.type === 'STORE_PART') {
      throw new ServiceEstimateActionError('A Store Part line is priced by Store matching it to a real catalog Part, not typed in directly.');
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

  await prisma.serviceEstimateLineItem.update({
    where: { id: lineItemId },
    data: {
      description,
      quantity: input.quantity,
      unitPrice: unitPrice ?? null,
      amount,
      ...(lineItem.type !== 'STORE_PART' ? { unitOfMeasure: input.unitOfMeasure?.trim() || null } : {}),
    },
  });
  await writeAuditLog({
    userId: editor.id,
    action: 'service_estimate.line_item_updated',
    entityType: 'VehicleService',
    entityId: lineItem.estimate.vehicleServiceId,
    metadata: { serviceNumber: lineItem.estimate.vehicleService.serviceNumber, type: lineItem.type, description, quantity: input.quantity, unitPrice, amount },
  });
}

/** Submitted is a real, deliberate "ready for the customer to see"
 * moment, distinct from still being drafted — same real reasoning
 * Job Card's own estimate uses, just without the extra Manager stage
 * that a routine Vehicle Service visit doesn't need. */
export async function submitServiceEstimate(estimateId: string): Promise<void> {
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
  // Same real "live" to "locked" transition as Job Card's own
  // submitEstimateForValidation — a matched Store Part line's price
  // has tracked Store's own current selling price the whole time
  // it's been Draft; this is the one moment that number gets written
  // down as the estimate's own permanent record, rather than the
  // possibly-stale figure sitting in the database from whenever the
  // line's quantity last happened to change.
  for (const li of estimate.lineItems as (typeof estimate.lineItems)[number][]) {
    if (li.type === 'STORE_PART' && li.matchedPartId && li.matchedPart?.sellingPrice !== null && li.matchedPart?.sellingPrice !== undefined) {
      const liveUnitPrice = Number(li.matchedPart.sellingPrice);
      const liveAmount = Math.round(Number(li.quantity) * liveUnitPrice * 100) / 100;
      if (Number(li.unitPrice ?? -1) !== liveUnitPrice || Number(li.amount ?? -1) !== liveAmount) {
        await prisma.serviceEstimateLineItem.update({ where: { id: li.id }, data: { unitPrice: liveUnitPrice, amount: liveAmount } });
      }
      // Also updated in memory, not just in the database — the
      // "missing prices" check right below reads from this same
      // in-memory array, and needs to see the just-corrected value.
      (li as { unitPrice: unknown }).unitPrice = liveUnitPrice;
    }
  }
  // Same real gate as Job Card's own — an unmatched Store Part line
  // never has a real unitPrice at all, so this one check honestly
  // catches both "forgot to price a line" and "Store hasn't matched
  // this yet" without needing two separate checks.
  const missingPricesOn = estimate.lineItems.filter((li: { unitPrice: unknown }) => li.unitPrice === null);
  if (missingPricesOn.length > 0) {
    throw new ServiceEstimateActionError(
      `Every line needs a price before submitting — missing on: ${missingPricesOn.map((li: { description: string }) => li.description).join(', ')}.`,
    );
  }
  const user = await requireServiceEstimateContributor(estimate.vehicleService);

  await prisma.serviceEstimate.update({ where: { id: estimateId }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.submitted',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  // Notify whoever approves it — fail-soft, matching every other
  // notification in this project.
  try {
    if (!estimate.vehicleService.supervisor) return;
    const submitter = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const orgContext = await getWorkshopOrgContext(estimate.vehicleService.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-submitted email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

export async function approveServiceEstimate(estimateId: string): Promise<void> {
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
  // Same real re-check as Job Card's own approveEstimate — a new
  // unmatched Store Part line could genuinely have been added since
  // submission (editing stays open right up until real approval),
  // so nothing should reach a Manager, let alone the customer, still
  // priced on a technician's guess rather than Store's own real match.
  const unmatchedStoreParts = estimate.lineItems.filter((li: { type: string; matchedPartId: string | null }) => li.type === 'STORE_PART' && !li.matchedPartId);
  if (unmatchedStoreParts.length > 0) {
    throw new ServiceEstimateActionError(
      `${pluralize(unmatchedStoreParts.length, 'Store Part line')} still ${unmatchedStoreParts.length === 1 ? 'needs' : 'need'} to be matched by Store before this estimate can be approved.`,
    );
  }
  const user = await requireJobCardApprover(estimate.vehicleService);
  await prisma.serviceEstimate.update({
    where: { id: estimateId },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.approved',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  // Same real hand-off as Job Card's own approveEstimate — the
  // supervisor's own approval is not the final word; every eligible
  // Workshop Manager for the branch is notified next, and whichever
  // one acts first completes the review. Fail-soft, matching every
  // other notification in this file.
  try {
    const managers = await listEligibleManagersForBranch(estimate.vehicleService.branchId);
    if (managers.supervisors.length === 0) return;
    const approver = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const companyName = estimate.vehicleService.branch.businessUnit.organisation.name;
    const branchName = estimate.vehicleService.branch.name;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} ready for your review`,
        renderServiceEstimateReadyForManagerEmail({
          managerName: manager.fullName,
          serviceNumber: estimate.vehicleService.serviceNumber,
          customerName: estimate.vehicleService.customer.fullName,
          approvedByName: approver?.fullName ?? 'The supervisor',
          totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName,
          branchName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-ready-for-manager email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

/** The Workshop Manager's own real sign-off — same real two-role
 * shape as Job Card's own approveEstimateAsManager. Notifies whoever
 * created this Vehicle Service next, never the customer directly —
 * that hand-off is a separate, explicit step (see
 * notifyCustomerOfApprovedServiceEstimate below). */
export async function approveServiceEstimateAsManager(estimateId: string): Promise<void> {
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
  const user = await requireEligibleManager(estimate.vehicleService.branchId);

  await prisma.serviceEstimate.update({
    where: { id: estimateId },
    data: { status: 'MANAGER_APPROVED', managerApprovedAt: new Date(), managerApprovedById: user.id },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.manager_approved',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  // Notify whoever created this Vehicle Service — the Manager
  // approving is not the same as anyone deciding the customer should
  // be told. That decision belongs to this person specifically; see
  // notifyCustomerOfApprovedServiceEstimate below for the actual
  // customer hand-off, which this person triggers explicitly. Fail-
  // soft, matching every other notification in this file.
  try {
    const manager = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      estimate.vehicleService.createdBy.email,
      `Estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} approved by manager`,
      renderServiceEstimateReadyForCustomerNotificationEmail({
        recipientName: estimate.vehicleService.createdBy.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        customerName: estimate.vehicleService.customer.fullName,
        approvedByManagerName: manager?.fullName ?? 'The manager',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: estimate.vehicleService.branch.businessUnit.organisation.name,
        branchName: estimate.vehicleService.branch.name,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-ready-for-customer-notification email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

/** The explicit, real hand-off to the customer — only whoever created
 * this Vehicle Service, or a Master Admin, may trigger this, and only
 * once the Manager has approved. Deliberately never automatic — same
 * real reasoning as Job Card's own notifyCustomerOfApprovedEstimate.
 * Carries the same real estimate PDF (and inspection PDF, when one
 * exists) the customer has always received at this point. */
export async function notifyCustomerOfApprovedServiceEstimate(estimateId: string): Promise<void> {
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
    throw new ServiceEstimateActionError('Only whoever created this Vehicle Service, or a Master Administrator, can notify the customer.');
  }
  if (estimate.customerNotifiedAt) {
    throw new ServiceEstimateActionError('The customer has already been notified about this estimate.');
  }

  await prisma.serviceEstimate.update({
    where: { id: estimateId },
    data: { customerNotifiedAt: new Date(), customerNotifiedById: user.id },
  });
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const vehicleDescription = [estimate.vehicleService.vehicle.make, estimate.vehicleService.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    // Same real three-way customer-facing split as Job Card's own —
    // Store Part + Internal Job merged into "Parts & Services", Labour
    // and Sundry kept separate, never the internal type per line.
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
    // Same real reference shape as Job Card's own: number — vehicle — plate.
    const paymentRemarkSuggestion = [estimate.vehicleService.serviceNumber, vehicleDescription, estimate.vehicleService.vehicle.plateNumber]
      .filter(Boolean)
      .join(' — ');
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    await sendEmail(
      estimate.vehicleService.customer.email,
      `Your estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} has been approved`,
      renderCustomerServiceEstimateApprovedEmail({
        customerName: estimate.vehicleService.customer.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        vehicleDescription,
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
        bankName: COMPANY_BANK_DETAILS.bankName,
        accountName: COMPANY_BANK_DETAILS.accountName,
        accountNumber: COMPANY_BANK_DETAILS.accountNumber,
        paymentRemarkSuggestion,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#service-${estimate.vehicleService.id}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: estimate.vehicleService.branch.businessUnit.organisation.name,
        branchName: estimate.vehicleService.branch.name,
      }),
      await (async () => {
        // The real, styled PDF attachment — reuses Job Card's own
        // exact PDF layout component (EstimatePdf), just with its
        // reference label parameterized to say "VEHICLE SERVICE"
        // instead of the default "JOB CARD" — everything else about
        // the document, including the real minimum-deposit section
        // now that Vehicle Service has its own real payment system,
        // is identical.
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
              bankName: COMPANY_BANK_DETAILS.bankName,
              accountName: COMPANY_BANK_DETAILS.accountName,
              accountNumber: COMPANY_BANK_DETAILS.accountNumber,
              paymentRemarkSuggestion,
            }),
          );
          const attachments: { filename: string; content: Buffer; contentType: string }[] = [
            { filename: `Estimate-${estimate.vehicleService.serviceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
          ];

          // The inspection report rides along on the same email, same
          // moment, only when there's a real completed inspection to
          // show — a skipped inspection has no real findings to hand
          // the customer at all, by the same honest design already
          // used for the print route itself.
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
              // Same real rule — never let the inspection PDF block
              // either the estimate PDF or the email itself.
              // eslint-disable-next-line no-console
              console.error('Failed to generate Vehicle Service inspection PDF attachment', estimate.vehicleService.serviceNumber, inspectionPdfErr);
            }
          }

          return attachments;
        } catch (pdfErr) {
          // A failed PDF must never block the email itself — the
          // customer still needs the approval notice either way.
          // eslint-disable-next-line no-console
          console.error('Failed to generate Vehicle Service estimate PDF attachment', estimate.vehicleService.serviceNumber, pdfErr);
          return undefined;
        }
      })(),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer estimate-approved email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

export async function getServiceEstimate(vehicleServiceId: string) {
  await requireUser();
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      toUser.email,
      `A note on the estimate for Vehicle Service ${service.serviceNumber}`,
      renderServiceEstimateNudgeEmail({
        recipientName: toUser.fullName,
        fromName: fromUser?.fullName ?? 'A team member',
        fromRole: params.fromRole,
        serviceNumber: service.serviceNumber,
        customerName: service.customer.fullName,
        note: params.note,
        vehicleServiceUrl: `${portalUrl}/workshop/vehicle-service/${params.vehicleServiceId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch {
    // Same real "the note is logged either way" reasoning as Job
    // Card's own version — a failed email never blocks the real,
    // permanent record of the nudge itself.
  }
}

/** The technician nudges the assigned supervisor to review or price
 * the estimate — same real informal back-and-forth as Job Card's own. */
export async function notifySupervisorAboutServiceEstimate(vehicleServiceId: string, note?: string): Promise<void> {
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
    throw new ServiceEstimateActionError('Only the assigned technician can notify the supervisor about this estimate.');
  }
  if (!service.supervisorId) {
    throw new ServiceEstimateActionError('This Vehicle Service has no supervisor assigned yet.');
  }
  await sendServiceEstimateNudge({ vehicleServiceId, fromRole: 'technician', fromUserId: user.id, toUserId: service.supervisorId, note });
}

/** The supervisor nudges the assigned technician to review or price
 * the estimate — same real informal back-and-forth as Job Card's own. */
export async function notifyTechnicianAboutServiceEstimate(vehicleServiceId: string, note?: string): Promise<void> {
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
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
    // Real, permanent audit entry above stands regardless of whether
    // the email itself goes out.
  }
}

/**
 * The real "Store, please come match this" request — same real
 * purpose as Job Card's own requestStoreMatching: explicit, not
 * merely implied by unmatched lines existing, and it emails every
 * real eligible Store Officer/Manager for the branch with exactly
 * which lines are waiting.
 */
export async function requestServiceEstimateStoreMatching(vehicleServiceId: string, note?: string): Promise<void> {
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
    throw new ServiceEstimateActionError('Only the assigned supervisor, the assigned technician, or a Master Administrator can request Store matching.');
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
    for (const recipient of storeRecipients.values()) {
      await sendEmail(
        recipient.email,
        `Store matching requested — Vehicle Service ${service.serviceNumber}`,
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
    // Same real status-only nudge back to supervisor/technician as
    // Job Card's own version, distinct from the detailed request
    // Store itself receives above.
    const statusRecipientIds = [service.supervisorId, service.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const statusRecipients = await prisma.user.findMany({ where: { id: { in: statusRecipientIds } }, select: { fullName: true, email: true } });
    for (const recipient of statusRecipients) {
      await sendEmail(
        recipient.email,
        `Store matching requested — Vehicle Service ${service.serviceNumber}`,
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
    // Real, permanent audit entry above stands regardless of whether
    // any of these emails go out.
  }
}

/**
 * Store's own real starting queue for Vehicle Service — same real
 * "only what's been deliberately requested" honesty as Job Card's
 * own listUnmatchedStorePartLines: matchingRequestedAt not being null
 * is what actually keeps this queue meaningful, not merely having an
 * unmatched line, or every in-progress Draft someone's still
 * mid-way through building would show up here too.
 */
export async function listUnmatchedServiceEstimateStorePartLines(branchId: string) {
  await requireUser();
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
