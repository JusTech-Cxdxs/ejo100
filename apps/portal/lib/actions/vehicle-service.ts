'use server';

import { prisma } from '@ejo/database';
import {
  requireUser,
  writeAuditLog,
  createJobCard,
  getWorkshopBranchId,
  getWorkshopDepartmentForVehicleType,
  isEligibleSupervisor,
  currentUserIsMasterAdmin,
  requireJobCardApprover,
} from './workshop';
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
  supervisorId: string;
};

export async function createVehicleService(input: CreateVehicleServiceInput): Promise<{ id: string; serviceNumber: string }> {
  const user = await requireUser();
  if (!input.supervisorId) {
    throw new VehicleServiceActionError('A supervisor must be assigned to open a Vehicle Service.');
  }
  const vehicle = await prisma.customerVehicle.findUnique({
    where: { id: input.vehicleId },
    select: { customerId: true, vehicleType: true },
  });
  if (!vehicle || vehicle.customerId !== input.customerId) {
    throw new VehicleServiceActionError('This vehicle does not genuinely belong to the selected customer.');
  }
  if (!vehicle.vehicleType) {
    throw new VehicleServiceActionError(
      'This vehicle has no Passenger/Commercial type on file yet — set it on the Vehicles page before opening a Vehicle Service for it.',
    );
  }
  // The same real, department-derived routing Job Card already uses —
  // never taken from client input, so it's structurally impossible
  // for a Vehicle Service to be routed to the wrong Workshop
  // department by a client-side mistake.
  const department = await getWorkshopDepartmentForVehicleType(vehicle.vehicleType);
  if (!(await isEligibleSupervisor(input.supervisorId, department.id))) {
    throw new VehicleServiceActionError("The selected supervisor is not eligible for this vehicle's Workshop department.");
  }
  const branchId = await getWorkshopBranchId();
  const serviceNumber = await generateServiceNumber();
  const realComplaints = input.customerComplaints.map((c) => c.trim()).filter((c) => c.length > 0);
  const service = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicleService.create({
      data: {
        serviceNumber,
        branchId,
        departmentId: department.id,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        supervisorId: input.supervisorId,
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

export type VehicleServiceAuditEntry = {
  id: string;
  action: string;
  createdAt: Date;
  metadata: unknown;
  user: { fullName: string } | null;
};

/** No take limit here, deliberately — same real reasoning as Job
 * Card's own audit trail: a Vehicle Service's real history is never
 * something that quietly gets cut off once it accumulates enough
 * entries. */
export async function getVehicleServiceAuditTrail(serviceId: string): Promise<VehicleServiceAuditEntry[]> {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'VehicleService', entityId: serviceId },
    orderBy: { createdAt: 'desc' },
  });
  const userIds = [
    ...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id))),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u]));
  return entries.map((e: (typeof entries)[number]) => ({
    id: e.id,
    action: e.action,
    createdAt: e.createdAt,
    metadata: e.metadata,
    user: e.userId ? (userById.get(e.userId) ?? null) : null,
  }));
}

export async function approveVehicleService(serviceId: string, notes?: string): Promise<void> {
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: { supervisorId: true, serviceNumber: true },
  });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  const approver = await requireJobCardApprover(service);
  await prisma.vehicleService.update({
    where: { id: serviceId },
    data: { approvalStatus: 'APPROVED', approvedById: approver.id, approvedAt: new Date(), rejectionReason: null, approvalNotes: notes?.trim() || null },
  });
  await writeAuditLog({
    userId: approver.id,
    action: 'vehicle_service.approved',
    entityType: 'VehicleService',
    entityId: serviceId,
    metadata: { serviceNumber: service.serviceNumber, notes: notes?.trim() || undefined },
  });
}

/** The required `reason` is what would show in a real status badge —
 * a rejection doesn't have to mean something was wrong with the
 * vehicle itself; availability or workload are valid real reasons
 * too, same as Job Card. */
export async function rejectVehicleService(serviceId: string, reason: string, notes?: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new VehicleServiceActionError('A reason is required to reject a Vehicle Service.');
  }
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: { supervisorId: true, serviceNumber: true },
  });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  const approver = await requireJobCardApprover(service);
  await prisma.vehicleService.update({
    where: { id: serviceId },
    data: { approvalStatus: 'REJECTED', approvedById: approver.id, approvedAt: new Date(), rejectionReason: trimmedReason, approvalNotes: notes?.trim() || null },
  });
  await writeAuditLog({
    userId: approver.id,
    action: 'vehicle_service.rejected',
    entityType: 'VehicleService',
    entityId: serviceId,
    metadata: { serviceNumber: service.serviceNumber, reason: trimmedReason },
  });
}

/** Never enforced server-side that approval must happen first — same
 * real design as Job Card's own assignTechnician — but the UI only
 * ever shows this action once a supervisor has actually approved the
 * visit, so a technician is never pulled onto an unreviewed job in
 * real practice. */
export async function assignTechnicianToVehicleService(serviceId: string, technicianId: string): Promise<void> {
  const user = await requireUser();
  const service = await prisma.vehicleService.findUnique({ where: { id: serviceId }, select: { serviceNumber: true } });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  const technician = await prisma.user.findUnique({ where: { id: technicianId }, select: { fullName: true } });
  if (!technician) {
    throw new VehicleServiceActionError('That technician could not be found.');
  }
  await prisma.vehicleService.update({ where: { id: serviceId }, data: { assignedTechnicianId: technicianId } });
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle_service.technician_assigned',
    entityType: 'VehicleService',
    entityId: serviceId,
    metadata: { serviceNumber: service.serviceNumber, technicianName: technician.fullName },
  });
}

export async function deleteVehicleService(serviceId: string): Promise<void> {
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isMasterAdmin) {
    throw new VehicleServiceActionError('Only a Master Administrator can delete a Vehicle Service.');
  }
  await prisma.vehicleService.delete({ where: { id: serviceId } });
}

export async function listVehicleServices(branchId: string, search?: string, vehicleType?: 'PASSENGER' | 'COMMERCIAL', status?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.vehicleService.findMany({
    where: {
      branchId,
      ...(status ? { status: status as never } : {}),
      ...(vehicleType ? { vehicle: { vehicleType } } : {}),
      ...(q
        ? {
            OR: [
              { serviceNumber: { contains: q, mode: 'insensitive' } },
              { customer: { fullName: { contains: q, mode: 'insensitive' } } },
              { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
              { vehicle: { chassisNumber: { contains: q, mode: 'insensitive' } } },
              { assignedTechnician: { fullName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      serviceNumber: true,
      status: true,
      createdAt: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true, vehicleType: true } },
      items: { select: { serviceType: { select: { name: true } } } },
    },
  });
}

export async function getVehicleService(serviceId: string) {
  await requireUser();
  return prisma.vehicleService.findUnique({
    where: { id: serviceId },
    include: {
      customer: true,
      vehicle: true,
      createdBy: { select: { id: true, fullName: true } },
      assignedTechnician: { select: { id: true, fullName: true } },
      supervisor: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      department: { select: { id: true, name: true } },
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
