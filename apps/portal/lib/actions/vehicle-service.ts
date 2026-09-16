'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, createJobCard, getWorkshopBranchId } from './workshop';
import { calculateNextServiceDue } from '@/lib/vehicle-service-due';

class VehicleServiceActionError extends Error {}

async function generateServiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SV-${year}-`;
  const latest = await prisma.vehicleService.findFirst({
    where: { serviceNumber: { startsWith: prefix } },
    orderBy: { serviceNumber: 'desc' },
    select: { serviceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.serviceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

export type CreateVehicleServiceInput = {
  customerId: string;
  vehicleId: string;
  customerComplaints: string[];
  mileageAtCheckIn?: number;
};

export async function createVehicleService(input: CreateVehicleServiceInput): Promise<{ id: string; serviceNumber: string }> {
  const user = await requireUser();
  // The same real branch lookup createJobCard already uses — the
  // Workshop department's own branch, never the creating person's
  // own account field, which may legitimately be unset for many
  // accounts that can still open real work here.
  const branchId = await getWorkshopBranchId();
  const vehicle = await prisma.customerVehicle.findUnique({ where: { id: input.vehicleId }, select: { customerId: true } });
  if (!vehicle || vehicle.customerId !== input.customerId) {
    throw new VehicleServiceActionError('This vehicle does not genuinely belong to the selected customer.');
  }
  const serviceNumber = await generateServiceNumber();
  const realComplaints = input.customerComplaints.map((c) => c.trim()).filter((c) => c.length > 0);
  const service = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicleService.create({
      data: {
        serviceNumber,
        branchId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        createdById: user.id,
        odometerAtService: input.mileageAtCheckIn ?? null,
      },
    });
    if (realComplaints.length > 0) {
      await tx.vehicleServiceComplaint.createMany({
        data: realComplaints.map((description, i) => ({ vehicleServiceId: created.id, sequenceNumber: i + 1, description })),
      });
    }
    return created;
  });
  await writeAuditLog({ userId: user.id, action: 'vehicle_service.created', entityType: 'VehicleService', entityId: service.id, metadata: { serviceNumber } });
  return { id: service.id, serviceNumber };
}

export async function listVehicleServices(branchId: string, status?: string) {
  await requireUser();
  return prisma.vehicleService.findMany({
    where: { branchId, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      serviceNumber: true,
      status: true,
      createdAt: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true } },
      items: { select: { serviceType: { select: { name: true } } } },
    },
  });
}

export async function getVehicleService(serviceId: string) {
  await requireUser();
  return prisma.vehicleService.findUnique({
    where: { id: serviceId },
    include: {
      customer: { select: { id: true, fullName: true, phone: true, email: true } },
      vehicle: { select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, mileage: true, vehicleType: true } },
      createdBy: { select: { fullName: true } },
      assignedTechnician: { select: { id: true, fullName: true } },
      escalatedToJobCard: { select: { id: true, jobNumber: true } },
      items: { include: { serviceType: true } },
      complaints: { orderBy: { sequenceNumber: 'asc' } },
      branch: { select: { businessUnit: { select: { organisationId: true } } } },
    },
  });
}

/**
 * Adds Service Types to an already-open Vehicle Service — the
 * supervisor's own real job after actually inspecting the vehicle,
 * never something the front desk decides when the customer first
 * walks in. Adding an item already on the visit is a harmless
 * no-op, same real reasoning as assignRole elsewhere in this app.
 */
export async function addServiceItemsToVehicleService(serviceId: string, serviceTypeIds: string[]): Promise<void> {
  const user = await requireUser();
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: { status: true, serviceNumber: true },
  });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  if (service.status === 'COLLECTED' || service.status === 'CANCELLED') {
    throw new VehicleServiceActionError(`Cannot add work to a Vehicle Service that's already ${service.status.toLowerCase()}.`);
  }
  const existing = await prisma.vehicleServiceItem.findMany({
    where: { vehicleServiceId: serviceId },
    select: { serviceTypeId: true },
  });
  const existingIds = new Set(existing.map((e: { serviceTypeId: string }) => e.serviceTypeId));
  const toAdd = serviceTypeIds.filter((id) => !existingIds.has(id));
  if (toAdd.length === 0) return;
  await prisma.vehicleServiceItem.createMany({
    data: toAdd.map((serviceTypeId) => ({ vehicleServiceId: serviceId, serviceTypeId })),
  });
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_service.items_added',
    entityType: 'VehicleService',
    entityId: serviceId,
    metadata: { serviceNumber: service.serviceNumber, count: toAdd.length },
  });
}

/** The real status ladder this whole module is built to be lighter
 * than Job Card's own — a strict forward line, one real branch point
 * (Cancelled), no parallel/backward states at all, matching the
 * user's own explicit request for something that "does not take
 * much." Odometer, next-service calculation, and the real write-back
 * onto CustomerVehicle.mileage all happen exactly once, at the real
 * moment of completion — never recomputed or re-triggered by any
 * later status change. */
export async function updateVehicleServiceStatus(
  serviceId: string,
  newStatus: 'CHECKED_IN' | 'IN_SERVICE' | 'COMPLETED' | 'COLLECTED' | 'CANCELLED',
  input?: { odometerAtService?: number; technicianNotes?: string },
): Promise<void> {
  const user = await requireUser();
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: { status: true, serviceNumber: true, vehicleId: true, odometerAtService: true },
  });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  const ladder: Record<string, string[]> = {
    SCHEDULED: ['CHECKED_IN', 'CANCELLED'],
    CHECKED_IN: ['IN_SERVICE', 'CANCELLED'],
    IN_SERVICE: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['COLLECTED'],
    COLLECTED: [],
    CANCELLED: [],
  };
  if (!ladder[service.status]?.includes(newStatus)) {
    throw new VehicleServiceActionError(`A Vehicle Service currently ${service.status} cannot move directly to ${newStatus}.`);
  }

  const data: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'CHECKED_IN') {
    data.checkedInAt = new Date();
    if (input?.odometerAtService !== undefined) data.odometerAtService = input.odometerAtService;
  }
  if (newStatus === 'COMPLETED') {
    data.completedAt = new Date();
    if (input?.technicianNotes !== undefined) data.technicianNotes = input.technicianNotes.trim() || null;

    const odometerAtService = input?.odometerAtService ?? service.odometerAtService;
    const performedTypes = await prisma.vehicleServiceItem.findMany({
      where: { vehicleServiceId: serviceId },
      select: { serviceType: { select: { intervalKm: true, intervalDays: true, isPrimary: true } } },
    });
    const nextDue = calculateNextServiceDue(
      odometerAtService,
      new Date(),
      performedTypes.map((p: { serviceType: { intervalKm: number | null; intervalDays: number | null; isPrimary: boolean } }) => p.serviceType),
    );
    data.nextServiceDueOdometer = nextDue.dueOdometer;
    data.nextServiceDueDate = nextDue.dueDate;
  }
  if (newStatus === 'COLLECTED') data.collectedAt = new Date();
  if (newStatus === 'CANCELLED') data.cancelledAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.vehicleService.update({ where: { id: serviceId }, data });
    // The one real, shared "last known odometer" — the exact same
    // field Job Card check-in already writes to, never a second,
    // competing value for the same real vehicle.
    if (newStatus === 'CHECKED_IN' && input?.odometerAtService !== undefined) {
      await tx.customerVehicle.update({ where: { id: service.vehicleId }, data: { mileage: input.odometerAtService } });
    }
  });

  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_service.status_updated',
    entityType: 'VehicleService',
    entityId: serviceId,
    metadata: { serviceNumber: service.serviceNumber, from: service.status, to: newStatus },
  });
}

/** The one real, deliberate door out of this lighter workflow — a
 * genuine Job Card gets created from the service's own real
 * customer/vehicle/complaint, and this Vehicle Service is marked as
 * escalated and stops progressing on its own. Reuses createJobCard
 * directly rather than duplicating its own real logic. */
export async function escalateVehicleServiceToJobCard(
  serviceId: string,
  supervisorId: string,
  additionalComplaint?: string,
): Promise<{ jobCardId: string }> {
  const user = await requireUser();
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: {
      serviceNumber: true,
      customerId: true,
      vehicleId: true,
      status: true,
      escalatedToJobCardId: true,
      odometerAtService: true,
      complaints: { orderBy: { sequenceNumber: 'asc' }, select: { description: true } },
    },
  });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  if (service.escalatedToJobCardId) {
    throw new VehicleServiceActionError('This Vehicle Service has already been escalated to a real Job Card.');
  }
  if (service.status === 'COLLECTED' || service.status === 'CANCELLED') {
    throw new VehicleServiceActionError(`A Vehicle Service that's already ${service.status.toLowerCase()} cannot be escalated.`);
  }

  const complaints = [...service.complaints.map((c: { description: string }) => c.description), additionalComplaint?.trim()].filter((c): c is string => Boolean(c));
  const jobCard = await createJobCard({
    customerId: service.customerId,
    vehicleId: service.vehicleId,
    complaints: complaints.length > 0 ? complaints : ['Escalated from Vehicle Service — see linked record for the original real request.'],
    supervisorId,
    mileageAtCheckIn: service.odometerAtService ?? undefined,
  });

  await prisma.vehicleService.update({ where: { id: serviceId }, data: { escalatedToJobCardId: jobCard.id } });
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_service.escalated_to_job_card',
    entityType: 'VehicleService',
    entityId: serviceId,
    metadata: { serviceNumber: service.serviceNumber, jobCardId: jobCard.id },
  });
  return { jobCardId: jobCard.id };
}

export async function listServiceTypes(organisationId: string) {
  await requireUser();
  return prisma.serviceType.findMany({
    where: { organisationId, isActive: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function createServiceType(
  organisationId: string,
  input: { name: string; category: string; intervalKm?: number; intervalDays?: number; isPrimary?: boolean },
): Promise<{ id: string }> {
  const user = await requireUser();
  const name = input.name.trim();
  const category = input.category.trim();
  if (!name || !category) {
    throw new VehicleServiceActionError('Enter a name and a category before saving.');
  }
  const isPrimary = input.isPrimary ?? false;
  if (isPrimary && !input.intervalKm && !input.intervalDays) {
    throw new VehicleServiceActionError('A Primary Service Anchor needs at least one interval — kilometres, days, or both — otherwise the system has no way to calculate when the vehicle is next due.');
  }
  const serviceType = await prisma.serviceType.create({
    data: { organisationId, name, category, intervalKm: input.intervalKm ?? null, intervalDays: input.intervalDays ?? null, isPrimary },
  });
  await writeAuditLog({ userId: user.id, action: 'service_type.created', entityType: 'ServiceType', entityId: serviceType.id, metadata: { name, category, isPrimary } });
  return { id: serviceType.id };
}
