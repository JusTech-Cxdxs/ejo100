'use server';
import { logFailure } from '@/lib/log';

import { authorizeOnService, seeService } from '@/lib/authz/server';

import { assertServiceNotEscalated } from '@/lib/vehicle-service-cycle';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { getApplicableTemplate, VEHICLE_INSPECTION_TEMPLATE } from '@/lib/vehicle-inspection-template';
import { sendLoggedEmail } from '@/lib/logged-email';

class VehicleInspectionActionError extends Error {}

/** Logs each inspection event against both the inspection and its Vehicle
 * Service, so it shows on both timelines. */
async function logInspectionEvent(params: {
  userId: string;
  action: string;
  inspectionId: string;
  vehicleServiceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await Promise.all([
    writeAuditLog({ userId: params.userId, action: params.action, entityType: 'VehicleInspection', entityId: params.inspectionId, metadata: params.metadata }),
    writeAuditLog({ userId: params.userId, action: params.action, entityType: 'VehicleService', entityId: params.vehicleServiceId, metadata: params.metadata }),
  ]);
}

/**
 * Creates the Vehicle Service's inspection with items from the
 * vehicle-type template. Called the first time the inspection is opened;
 * calling it again returns the existing record.
 */
export async function startVehicleInspection(vehicleServiceId: string): Promise<{ id: string }> {
  await authorizeOnService('workshop.inspection.perform', vehicleServiceId, 'startVehicleInspection');
  await assertServiceNotEscalated({ vehicleServiceId });
  const user = await requireUser();
  const existing = await prisma.vehicleInspection.findUnique({ where: { vehicleServiceId }, select: { id: true } });
  if (existing) return existing;

  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: { serviceNumber: true, vehicle: { select: { vehicleType: true } } },
  });
  if (!service) {
    throw new VehicleInspectionActionError('Vehicle Service record not found.');
  }
  if (!service.vehicle.vehicleType) {
    throw new VehicleInspectionActionError(
      'This vehicle has no Passenger/Commercial type on file yet — set it on the Vehicles page before starting an inspection.',
    );
  }

  const template = getApplicableTemplate(service.vehicle.vehicleType);
  const inspection = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicleInspection.create({
      data: { vehicleServiceId, inspectedById: user.id, status: 'IN_PROGRESS', startedAt: new Date() },
    });
    await tx.vehicleInspectionItem.createMany({
      data: template.flatMap((s) => s.items.map((i) => ({ inspectionId: created.id, section: s.section, name: i.name }))),
    });
    return created;
  });

  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.started',
    inspectionId: inspection.id,
    vehicleServiceId,
    metadata: { serviceNumber: service.serviceNumber },
  });
  return { id: inspection.id };
}

export type InspectionItemInput = {
  itemId: string;
  condition?: string;
  severity?: 'GOOD' | 'ATTENTION' | 'SERVICE_REQUIRED' | 'CRITICAL';
  action?: string;
  notes?: string;
};

/** Records that the inspection was skipped, so a skip is as visible in the
 * audit trail as a completed inspection. Refused if the inspection was
 * already started or decided; cancelVehicleInspection undoes that first. */
export async function skipVehicleInspection(vehicleServiceId: string, reason?: string): Promise<{ id: string }> {
  await authorizeOnService('workshop.inspection.perform', vehicleServiceId, 'skipVehicleInspection');
  await assertServiceNotEscalated({ vehicleServiceId });
  const user = await requireUser();
  const existing = await prisma.vehicleInspection.findUnique({ where: { vehicleServiceId }, select: { id: true, status: true } });
  if (existing) {
    throw new VehicleInspectionActionError(`This inspection is already ${existing.status.toLowerCase().replace('_', ' ')} — it can't be skipped now.`);
  }
  const service = await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true } });
  if (!service) {
    throw new VehicleInspectionActionError('Vehicle Service record not found.');
  }
  const inspection = await prisma.vehicleInspection.create({
    data: { vehicleServiceId, inspectedById: user.id, status: 'SKIPPED', skippedAt: new Date(), skipReason: reason?.trim() || null },
  });
  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.skipped',
    inspectionId: inspection.id,
    vehicleServiceId,
    metadata: { serviceNumber: service.serviceNumber, reason: reason?.trim() || undefined },
  });
  return { id: inspection.id };
}

/**
 * Undoes a start, completion or skip by deleting the inspection, so the
 * service is back at the Start/Skip choice. Logged against the Vehicle
 * Service (and the inspection id) before the delete.
 */
export async function cancelVehicleInspection(vehicleServiceId: string, reason?: string): Promise<void> {
  await authorizeOnService('workshop.inspection.perform', vehicleServiceId, 'cancelVehicleInspection');
  await assertServiceNotEscalated({ vehicleServiceId });
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { vehicleServiceId }, select: { id: true, status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('No inspection exists yet for this Vehicle Service.');
  }
  const service = await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true } });
  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.cancelled',
    inspectionId: inspection.id,
    vehicleServiceId,
    metadata: { serviceNumber: service?.serviceNumber, previousStatus: inspection.status, reason: reason?.trim() || undefined },
  });
  await prisma.vehicleInspection.delete({ where: { id: inspection.id } });
}

/** Saves one section at a time. Items left blank keep their current
 * values. Allowed after completion too (completion doesn't lock the
 * record); clearing an item's severity moves it back to Not Reviewed. */
export async function updateInspectionItems(inspectionId: string, items: InspectionItemInput[]): Promise<void> {
  {
    const owner = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { vehicleServiceId: true } });
    if (!owner) throw new Error('This inspection no longer exists — refresh the page.');
    await authorizeOnService('workshop.inspection.perform', owner.vehicleServiceId, 'updateInspectionItems');
  }
  await assertServiceNotEscalated({ inspectionId });
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { vehicleServiceId: true, status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('Inspection record not found.');
  }
  if (inspection.status === 'SKIPPED') {
    throw new VehicleInspectionActionError('This inspection was skipped. Cancel the skip first to start an inspection.');
  }
  // Every item must belong to this inspection (the one just authorised); an
  // item id from another inspection rejects the whole save.
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const saved = await tx.vehicleInspectionItem.updateMany({
        where: { id: item.itemId, inspectionId },
        data: {
          condition: item.condition?.trim() || null,
          severity: item.severity ?? null,
          action: item.action?.trim() || null,
          notes: item.notes?.trim() || null,
        },
      });
      if (saved.count !== 1) throw new VehicleInspectionActionError('An item on this form is not part of this inspection — refresh the page.');
    }
  });
  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.items_updated',
    inspectionId,
    vehicleServiceId: inspection.vehicleServiceId,
    metadata: { count: items.length },
  });
}

/** Can be called again after further edits; updates completedAt and notes. */
export async function completeVehicleInspection(inspectionId: string, notes?: string): Promise<void> {
  {
    const owner = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { vehicleServiceId: true } });
    if (!owner) throw new Error('This inspection no longer exists — refresh the page.');
    await authorizeOnService('workshop.inspection.perform', owner.vehicleServiceId, 'completeVehicleInspection');
  }
  await assertServiceNotEscalated({ inspectionId });
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { vehicleServiceId: true, status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('Inspection record not found.');
  }
  if (inspection.status === 'SKIPPED') {
    throw new VehicleInspectionActionError('This inspection was skipped — there is nothing to complete.');
  }
  await prisma.vehicleInspection.update({
    where: { id: inspectionId },
    data: { status: 'COMPLETED', completedAt: new Date(), notes: notes?.trim() || null },
  });
  await logInspectionEvent({ userId: user.id, action: 'vehicle_inspection.completed', inspectionId, vehicleServiceId: inspection.vehicleServiceId });
  // Tell the supervisor (and the service technician): the estimate is next.
  try {
    const sv = await prisma.vehicleService.findUnique({ where: { id: inspection.vehicleServiceId }, select: { serviceNumber: true, supervisor: { select: { fullName: true, email: true } }, assignedTechnician: { select: { fullName: true, email: true } } } });
    if (sv) await sendLoggedEmail({ entityType: 'VehicleService', entityId: inspection.vehicleServiceId, recipients: [sv.supervisor, sv.assignedTechnician].filter((x): x is { fullName: string; email: string } => Boolean(x?.email)), subject: `Inspection completed — ${sv.serviceNumber}`, heading: 'The vehicle inspection is complete', lines: [sv.serviceNumber, 'The findings are recorded — the estimate can now be prepared.'], path: `/workshop/vehicle-service/${inspection.vehicleServiceId}`, actorId: user.id });
  } catch (err) {
    logFailure('Inspection completed email failed', err);
  }
}

export async function getVehicleInspection(vehicleServiceId: string) {
  await requireUser();
  await seeService(vehicleServiceId, 'getVehicleInspection');
  const inspection = await prisma.vehicleInspection.findUnique({
    where: { vehicleServiceId },
    include: {
      inspectedBy: { select: { fullName: true } },
      items: true,
    },
  });
  if (!inspection) return inspection;
  // Sort by the template's section order, not database row order.
  const sectionOrder = VEHICLE_INSPECTION_TEMPLATE.map((s) => s.section);
  const itemOrder = new Map(VEHICLE_INSPECTION_TEMPLATE.flatMap((s) => s.items.map((i, idx) => [`${s.section}::${i.name}`, idx])));
  const items = [...inspection.items].sort((a, b) => {
    const sectionDiff = sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
    if (sectionDiff !== 0) return sectionDiff;
    return (itemOrder.get(`${a.section}::${a.name}`) ?? 0) - (itemOrder.get(`${b.section}::${b.name}`) ?? 0);
  });
  return { ...inspection, items };
}
