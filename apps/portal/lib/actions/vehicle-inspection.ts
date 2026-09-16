'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog } from './workshop';
import { getApplicableTemplate, VEHICLE_INSPECTION_TEMPLATE } from '@/lib/vehicle-inspection-template';

class VehicleInspectionActionError extends Error {}

/**
 * Creates the one real inspection record for a Vehicle Service and
 * generates its items from the vehicle-type-aware template — called
 * once, the first time anyone opens the inspection workspace for
 * this visit. Calling it again on an already-started inspection is a
 * harmless no-op, returning the existing record rather than erroring
 * or duplicating items.
 */
export async function startVehicleInspection(vehicleServiceId: string): Promise<{ id: string }> {
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

  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_inspection.started',
    entityType: 'VehicleInspection',
    entityId: inspection.id,
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

/** The one real, deliberate door out of doing an inspection at all —
 * still creates a real record, so a skip is exactly as visible and
 * accountable in the audit trail as a completed inspection, never a
 * silent absence. Calling it on an already-started or already-decided
 * inspection is refused rather than silently overwriting real work. */
export async function skipVehicleInspection(vehicleServiceId: string, reason?: string): Promise<{ id: string }> {
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
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_inspection.skipped',
    entityType: 'VehicleInspection',
    entityId: inspection.id,
    metadata: { serviceNumber: service.serviceNumber, reason: reason?.trim() || undefined },
  });
  return { id: inspection.id };
}

/** One real save per section — a technician reviews a group of
 * related items together and saves them at once, rather than firing
 * a server action per keystroke. Items with nothing entered at all
 * are left exactly as they were (still genuinely not-yet-reviewed),
 * never overwritten with empty values. */
export async function updateInspectionItems(inspectionId: string, items: InspectionItemInput[]): Promise<void> {
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('Inspection record not found.');
  }
  if (inspection.status === 'COMPLETED') {
    throw new VehicleInspectionActionError('This inspection is already completed — nothing further can be changed here.');
  }
  await prisma.$transaction(
    items.map((item) =>
      prisma.vehicleInspectionItem.update({
        where: { id: item.itemId },
        data: {
          condition: item.condition?.trim() || null,
          severity: item.severity ?? null,
          action: item.action?.trim() || null,
          notes: item.notes?.trim() || null,
        },
      }),
    ),
  );
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_inspection.items_updated',
    entityType: 'VehicleInspection',
    entityId: inspectionId,
    metadata: { count: items.length },
  });
}

export async function completeVehicleInspection(inspectionId: string, notes?: string): Promise<void> {
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('Inspection record not found.');
  }
  if (inspection.status === 'COMPLETED') {
    throw new VehicleInspectionActionError('This inspection is already completed.');
  }
  await prisma.vehicleInspection.update({
    where: { id: inspectionId },
    data: { status: 'COMPLETED', completedAt: new Date(), notes: notes?.trim() || null },
  });
  await writeAuditLog({ userId: user.id, action: 'vehicle_inspection.completed', entityType: 'VehicleInspection', entityId: inspectionId });
}

export async function getVehicleInspection(vehicleServiceId: string) {
  await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({
    where: { vehicleServiceId },
    include: {
      inspectedBy: { select: { fullName: true } },
      items: true,
    },
  });
  if (!inspection) return inspection;
  // Re-sorted here to the template's own real priority order — never
  // the database's own default row order, which reflects nothing
  // meaningful and would silently undo the deliberate "most commonly
  // reached-for item first" ordering the template itself encodes.
  const sectionOrder = VEHICLE_INSPECTION_TEMPLATE.map((s) => s.section);
  const itemOrder = new Map(VEHICLE_INSPECTION_TEMPLATE.flatMap((s) => s.items.map((i, idx) => [`${s.section}::${i.name}`, idx])));
  const items = [...inspection.items].sort((a, b) => {
    const sectionDiff = sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
    if (sectionDiff !== 0) return sectionDiff;
    return (itemOrder.get(`${a.section}::${a.name}`) ?? 0) - (itemOrder.get(`${b.section}::${b.name}`) ?? 0);
  });
  return { ...inspection, items };
}
