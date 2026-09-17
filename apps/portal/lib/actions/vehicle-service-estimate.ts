'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog } from './workshop';

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
    entityType: 'ServiceEstimate',
    entityId: estimate.id,
    metadata: { serviceNumber: service.serviceNumber },
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

export type ServiceEstimateLineItemInput = {
  type?: 'STORE_PART' | 'OTHER';
  description: string;
  quantity: number;
  unitPrice?: number;
  /** Only meaningful for a STORE_PART line — which generic kind of
   * part is actually needed (e.g. "Engine Oil Filter"); Store later
   * matches this to a real, specific, vehicle-fitting Part from the
   * actual catalogue via matchServiceEstimateStorePartLine below. */
  partTypeId?: string;
};

export async function addServiceEstimateLineItem(estimateId: string, input: ServiceEstimateLineItemInput): Promise<void> {
  const user = await requireUser();
  const type = input.type ?? 'OTHER';
  const description = input.description.trim();
  if (type !== 'STORE_PART' && !description) {
    throw new ServiceEstimateActionError('A description is required for this line item.');
  }
  if (type === 'STORE_PART' && !input.partTypeId) {
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
    select: { status: true, vehicleServiceId: true, vehicleService: { select: { serviceNumber: true } } },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }

  let realDescription = description;
  if (type === 'STORE_PART' && input.partTypeId) {
    const partType = await prisma.partType.findUnique({ where: { id: input.partTypeId }, select: { name: true } });
    if (!partType) {
      throw new ServiceEstimateActionError('That part type could not be found.');
    }
    // A Store Part line's own description is never trusted from
    // client input — always derived server-side from the real
    // PartType's own name, same principle as Job Card's own estimate.
    realDescription = partType.name;
  }

  await prisma.serviceEstimateLineItem.create({
    data: {
      estimateId,
      type,
      description: realDescription,
      quantity: input.quantity,
      unitPrice: type === 'STORE_PART' ? null : (input.unitPrice ?? null),
      amount: type !== 'STORE_PART' && input.unitPrice !== undefined ? Math.round(input.unitPrice * input.quantity * 100) / 100 : null,
      partTypeId: type === 'STORE_PART' ? input.partTypeId : null,
      enteredById: user.id,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_item_added',
    entityType: 'ServiceEstimate',
    entityId: estimateId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber, type, description: realDescription, quantity: input.quantity, unitPrice: input.unitPrice },
  });
}

/** The real Store-matching step — same two-moment flow, same
 * pricing-alert hard-stop, as Job Card's own estimate matching: a
 * Part currently priced below its own real cost can never be matched
 * onto a customer's estimate, here either. */
export async function matchServiceEstimateStorePartLine(lineItemId: string, partId: string): Promise<void> {
  const user = await requireUser();
  const lineItem = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: { type: true, quantity: true, estimate: { select: { id: true, status: true, vehicleService: { select: { serviceNumber: true } } } } },
  });
  if (!lineItem) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (lineItem.type !== 'STORE_PART') {
    throw new ServiceEstimateActionError('Only a Store Part line can be matched to a real Part.');
  }
  if (lineItem.estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { id: true, name: true, sellingPrice: true, baseUnitOfMeasure: true } });
  if (!part) {
    throw new ServiceEstimateActionError('That part could not be found.');
  }
  if (part.sellingPrice === null || part.sellingPrice === undefined) {
    throw new ServiceEstimateActionError(`${part.name} has no real selling price set yet — set one before matching it to an estimate.`);
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
    entityType: 'ServiceEstimate',
    entityId: lineItem.estimate.id,
    metadata: { serviceNumber: lineItem.estimate.vehicleService.serviceNumber, partName: part.name, unitPrice },
  });
}

export async function removeServiceEstimateLineItem(lineItemId: string): Promise<void> {
  const user = await requireUser();
  const line = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: { description: true, estimate: { select: { id: true, status: true, vehicleService: { select: { serviceNumber: true } } } } },
  });
  if (!line) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (line.estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  await prisma.serviceEstimateLineItem.delete({ where: { id: lineItemId } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_item_removed',
    entityType: 'ServiceEstimate',
    entityId: line.estimate.id,
    metadata: { serviceNumber: line.estimate.vehicleService.serviceNumber, description: line.description },
  });
}

/** Submitted is a real, deliberate "ready for the customer to see"
 * moment, distinct from still being drafted — same real reasoning
 * Job Card's own estimate uses, just without the extra Manager stage
 * that a routine Vehicle Service visit doesn't need. */
export async function submitServiceEstimate(estimateId: string): Promise<void> {
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: { status: true, vehicleService: { select: { serviceNumber: true } }, lineItems: { select: { id: true } } },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.lineItems.length === 0) {
    throw new ServiceEstimateActionError('Add at least one line item before submitting this estimate.');
  }
  await prisma.serviceEstimate.update({ where: { id: estimateId }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.submitted',
    entityType: 'ServiceEstimate',
    entityId: estimateId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });
}

export async function approveServiceEstimate(estimateId: string): Promise<void> {
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: { status: true, vehicleService: { select: { serviceNumber: true } } },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status !== 'SUBMITTED') {
    throw new ServiceEstimateActionError('Only a submitted estimate can be approved.');
  }
  await prisma.serviceEstimate.update({
    where: { id: estimateId },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.approved',
    entityType: 'ServiceEstimate',
    entityId: estimateId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });
}

export async function getServiceEstimate(vehicleServiceId: string) {
  await requireUser();
  return prisma.serviceEstimate.findUnique({
    where: { vehicleServiceId },
    include: {
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lineItems: { orderBy: { createdAt: 'asc' }, include: { enteredBy: { select: { fullName: true } } } },
    },
  });
}
