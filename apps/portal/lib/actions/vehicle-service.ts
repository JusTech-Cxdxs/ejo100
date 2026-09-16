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
  getWorkshopOrgContext,
} from './workshop';
import { calculateNextServiceDue } from '@/lib/vehicle-service-due';
import { sendEmail } from '@/lib/email';
import { renderSupervisorVehicleServiceAssignedEmail } from '@/lib/email-templates/supervisor-vehicle-service-assigned';
import { renderVehicleServiceDecisionEmail } from '@/lib/email-templates/vehicle-service-decision';
import { renderTechnicianVehicleServiceAssignedEmail } from '@/lib/email-templates/technician-vehicle-service-assigned';

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

  // Notify the assigned supervisor — best-effort, fail-soft, matching
  // the exact same pattern createJobCard already uses: a transient
  // SMTP hiccup is never a reason to undo a real, already-successful
  // Vehicle Service creation.
  try {
    const [supervisor, customer, vehicleFull, complaints] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.supervisorId }, select: { fullName: true, email: true } }),
      prisma.customer.findUnique({ where: { id: input.customerId }, select: { fullName: true } }),
      prisma.customerVehicle.findUnique({ where: { id: input.vehicleId }, select: { make: true, model: true } }),
      prisma.vehicleServiceComplaint.findMany({ where: { vehicleServiceId: service.id }, orderBy: { sequenceNumber: 'asc' }, select: { description: true } }),
    ]);
    if (supervisor && customer) {
      const orgContext = await getWorkshopOrgContext(department.name);
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
      await sendEmail(
        supervisor.email,
        `New Vehicle Service ${serviceNumber} assigned to you`,
        renderSupervisorVehicleServiceAssignedEmail({
          supervisorName: supervisor.fullName,
          serviceNumber,
          customerName: customer.fullName,
          vehicleDescription: [vehicleFull?.make, vehicleFull?.model].filter(Boolean).join(' ') || 'Vehicle',
          reasons: complaints.map((c: (typeof complaints)[number]) => c.description),
          serviceUrl: `${portalUrl}/workshop/vehicle-service/${service.id}`,
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send supervisor notification email for Vehicle Service', serviceNumber, err);
  }

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
    select: {
      supervisorId: true,
      serviceNumber: true,
      createdById: true,
      customer: { select: { fullName: true } },
      department: { select: { name: true } },
    },
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
  await notifyVehicleServiceCreatorOfDecision({
    serviceId,
    serviceNumber: service.serviceNumber,
    createdById: service.createdById,
    customerName: service.customer.fullName,
    departmentName: service.department?.name,
    decision: 'APPROVED',
    approverId: approver.id,
    notes,
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
    select: {
      supervisorId: true,
      serviceNumber: true,
      createdById: true,
      customer: { select: { fullName: true } },
      department: { select: { name: true } },
    },
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
  await notifyVehicleServiceCreatorOfDecision({
    serviceId,
    serviceNumber: service.serviceNumber,
    createdById: service.createdById,
    customerName: service.customer.fullName,
    departmentName: service.department?.name,
    decision: 'REJECTED',
    approverId: approver.id,
    rejectionReason: trimmedReason,
    notes,
  });
}

/** Shared by approveVehicleService/rejectVehicleService above rather
 * than duplicated — the "fetch context, build the email, send it"
 * logic is identical either way, only the content differs. Fail-soft,
 * matching every other notification in this file: a transient SMTP
 * hiccup is never a reason to undo a real, already-successful
 * approval/rejection. */
async function notifyVehicleServiceCreatorOfDecision(params: {
  serviceId: string;
  serviceNumber: string;
  createdById: string;
  customerName: string;
  departmentName?: string;
  decision: 'APPROVED' | 'REJECTED';
  approverId: string;
  rejectionReason?: string;
  notes?: string;
}): Promise<void> {
  try {
    const [creator, approver] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.createdById }, select: { fullName: true, email: true } }),
      prisma.user.findUnique({ where: { id: params.approverId }, select: { fullName: true } }),
    ]);
    if (!creator || !approver) return;
    const orgContext = await getWorkshopOrgContext(params.departmentName);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      creator.email,
      params.decision === 'APPROVED' ? `Vehicle Service ${params.serviceNumber} approved` : `Vehicle Service ${params.serviceNumber} rejected`,
      renderVehicleServiceDecisionEmail({
        decision: params.decision,
        recipientName: creator.fullName,
        serviceNumber: params.serviceNumber,
        customerName: params.customerName,
        approverName: approver.fullName,
        rejectionReason: params.rejectionReason,
        notes: params.notes,
        serviceUrl: `${portalUrl}/workshop/vehicle-service/${params.serviceId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send decision email for Vehicle Service', params.serviceNumber, err);
  }
}

/** Never enforced server-side that approval must happen first — same
 * real design as Job Card's own assignTechnician — but the UI only
 * ever shows this action once a supervisor has actually approved the
 * visit, so a technician is never pulled onto an unreviewed job in
 * real practice. */
export async function assignTechnicianToVehicleService(serviceId: string, technicianId: string): Promise<void> {
  const user = await requireUser();
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: {
      serviceNumber: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true } },
      supervisor: { select: { fullName: true } },
      department: { select: { name: true } },
    },
  });
  if (!service) {
    throw new VehicleServiceActionError('Vehicle Service record not found.');
  }
  const technician = await prisma.user.findUnique({ where: { id: technicianId }, select: { fullName: true, email: true } });
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

  try {
    const orgContext = await getWorkshopOrgContext(service.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      technician.email,
      `You've been assigned to Vehicle Service ${service.serviceNumber}`,
      renderTechnicianVehicleServiceAssignedEmail({
        technicianName: technician.fullName,
        serviceNumber: service.serviceNumber,
        customerName: service.customer.fullName,
        vehicleDescription: [service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        supervisorName: service.supervisor?.fullName ?? 'Supervisor',
        serviceUrl: `${portalUrl}/workshop/vehicle-service/${serviceId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send technician notification email for Vehicle Service', service.serviceNumber, err);
  }
}

export async function deleteVehicleService(serviceId: string): Promise<void> {
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isMasterAdmin) {
    throw new VehicleServiceActionError('Only a Master Administrator can delete a Vehicle Service.');
  }
  await prisma.vehicleService.delete({ where: { id: serviceId } });
}

export type VehicleServiceHealth = {
  status: 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE' | 'NO_DATA';
  nextServiceDueOdometer: number | null;
  nextServiceDueDate: Date | null;
  primaryServiceMileage: number | null;
  primaryServiceDate: Date | null;
  serviceId: string;
  serviceNumber: string;
};

/**
 * The vehicle's own real service status, right now — up to date, due
 * soon, or overdue — based on the most recent completed Vehicle
 * Service that actually has a real next-due prediction. Genuinely
 * different from that Vehicle Service's own real status; this
 * answers "is this vehicle due", not "is this visit finished".
 * DUE_SOON is a deliberately generous real window (1,000km or 30
 * days) — a workshop wants advance notice, not a surprise on the due
 * date itself. NO_DATA means honestly what it says: no completed
 * Primary Service exists yet to calculate from, never treated as
 * OVERDUE by default.
 */
export async function getVehicleServiceHealth(vehicleId: string): Promise<VehicleServiceHealth | null> {
  await requireUser();
  const vehicle = await prisma.customerVehicle.findUnique({ where: { id: vehicleId }, select: { mileage: true } });
  if (!vehicle) return null;

  const latest = await prisma.vehicleService.findFirst({
    where: { vehicleId, OR: [{ nextServiceDueOdometer: { not: null } }, { nextServiceDueDate: { not: null } }] },
    orderBy: { primaryServiceDate: 'desc' },
    select: { id: true, serviceNumber: true, nextServiceDueOdometer: true, nextServiceDueDate: true, primaryServiceMileage: true, primaryServiceDate: true },
  });
  if (!latest) return null;

  const DUE_SOON_KM = 1000;
  const DUE_SOON_DAYS = 30;
  const now = new Date();
  let status: VehicleServiceHealth['status'] = 'UP_TO_DATE';

  const kmRemaining = latest.nextServiceDueOdometer !== null && vehicle.mileage !== null ? latest.nextServiceDueOdometer - vehicle.mileage : null;
  const daysRemaining = latest.nextServiceDueDate !== null ? Math.ceil((latest.nextServiceDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  const overdueByKm = kmRemaining !== null && kmRemaining <= 0;
  const overdueByDate = daysRemaining !== null && daysRemaining <= 0;
  const dueSoonByKm = kmRemaining !== null && kmRemaining <= DUE_SOON_KM;
  const dueSoonByDate = daysRemaining !== null && daysRemaining <= DUE_SOON_DAYS;

  if (overdueByKm || overdueByDate) {
    status = 'OVERDUE';
  } else if (dueSoonByKm || dueSoonByDate) {
    status = 'DUE_SOON';
  }

  return {
    status,
    nextServiceDueOdometer: latest.nextServiceDueOdometer,
    nextServiceDueDate: latest.nextServiceDueDate,
    primaryServiceMileage: latest.primaryServiceMileage,
    primaryServiceDate: latest.primaryServiceDate,
    serviceId: latest.id,
    serviceNumber: latest.serviceNumber,
  };
}

export type VehicleDueForService = {
  vehicleId: string;
  status: 'DUE_SOON' | 'OVERDUE';
  vehicleDescription: string;
  plateNumber: string | null;
  customerName: string;
  nextServiceDueOdometer: number | null;
  nextServiceDueDate: Date | null;
};

/**
 * Every real vehicle at this branch genuinely due soon or overdue —
 * the workshop's own real "who needs a reminder" list. Only ever the
 * latest Primary Service completion per vehicle counts; an older,
 * superseded prediction from a previous visit never lingers here
 * once a newer one exists.
 */
export async function listVehiclesDueForService(branchId: string): Promise<VehicleDueForService[]> {
  await requireUser();
  const services = await prisma.vehicleService.findMany({
    where: { branchId, OR: [{ nextServiceDueOdometer: { not: null } }, { nextServiceDueDate: { not: null } }] },
    orderBy: { primaryServiceDate: 'desc' },
    select: {
      vehicleId: true,
      nextServiceDueOdometer: true,
      nextServiceDueDate: true,
      vehicle: { select: { make: true, model: true, plateNumber: true, mileage: true } },
      customer: { select: { fullName: true } },
    },
  });

  const DUE_SOON_KM = 1000;
  const DUE_SOON_DAYS = 30;
  const now = new Date();
  const seenVehicles = new Set<string>();
  const due: VehicleDueForService[] = [];

  for (const s of services) {
    if (seenVehicles.has(s.vehicleId)) continue; // only the latest real prediction per vehicle counts
    seenVehicles.add(s.vehicleId);

    const kmRemaining = s.nextServiceDueOdometer !== null && s.vehicle.mileage !== null ? s.nextServiceDueOdometer - s.vehicle.mileage : null;
    const daysRemaining = s.nextServiceDueDate !== null ? Math.ceil((s.nextServiceDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const overdue = (kmRemaining !== null && kmRemaining <= 0) || (daysRemaining !== null && daysRemaining <= 0);
    const dueSoon = (kmRemaining !== null && kmRemaining <= DUE_SOON_KM) || (daysRemaining !== null && daysRemaining <= DUE_SOON_DAYS);

    if (overdue || dueSoon) {
      due.push({
        vehicleId: s.vehicleId,
        status: overdue ? 'OVERDUE' : 'DUE_SOON',
        vehicleDescription: [s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        plateNumber: s.vehicle.plateNumber,
        customerName: s.customer.fullName,
        nextServiceDueOdometer: s.nextServiceDueOdometer,
        nextServiceDueDate: s.nextServiceDueDate,
      });
    }
  }

  return due.sort((a, b) => (a.status === b.status ? 0 : a.status === 'OVERDUE' ? -1 : 1));
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
      complaints: { orderBy: { sequenceNumber: 'asc' } },
      branch: { select: { businessUnit: { select: { organisationId: true } } } },
    },
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
  input?: { odometerAtService?: number; technicianNotes?: string; primaryServiceCompleted?: boolean },
): Promise<void> {
  const user = await requireUser();
  const service = await prisma.vehicleService.findUnique({
    where: { id: serviceId },
    select: {
      status: true,
      serviceNumber: true,
      vehicleId: true,
      odometerAtService: true,
      branch: { select: { businessUnit: { select: { organisation: { select: { id: true, primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } } } } } },
    },
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
    if (input?.primaryServiceCompleted) {
      const now = new Date();
      const org = service.branch.businessUnit.organisation;
      const nextDue = calculateNextServiceDue(odometerAtService, now, org.primaryServiceIntervalKm, org.primaryServiceIntervalDays);
      data.primaryServiceMileage = odometerAtService;
      data.primaryServiceDate = now;
      data.nextServiceDueOdometer = nextDue.dueOdometer;
      data.nextServiceDueDate = nextDue.dueDate;
    }
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
      inspection: {
        select: {
          items: {
            where: { severity: { in: ['ATTENTION', 'SERVICE_REQUIRED', 'CRITICAL'] } },
            select: { section: true, name: true, condition: true, severity: true, action: true },
          },
        },
      },
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

  // Real inspection findings carry straight into the new Job Card as
  // their own real complaint lines — the supervisor building the
  // estimate there sees exactly what was actually found, in the
  // inspection's own words, rather than having to reopen the
  // inspection separately or have it retyped from memory.
  const findingLines = (service.inspection?.items ?? []).map((item: { section: string; name: string; condition: string | null; severity: string | null; action: string | null }) => {
    const severityLabel = item.severity === 'CRITICAL' ? 'Critical' : item.severity === 'SERVICE_REQUIRED' ? 'Service Required' : 'Attention';
    const detail = [item.condition, item.action].filter(Boolean).join(' — ');
    return `[Inspection: ${severityLabel}] ${item.section} — ${item.name}${detail ? `: ${detail}` : ''}`;
  });

  const complaints = [
    ...service.complaints.map((c: { description: string }) => c.description),
    ...findingLines,
    additionalComplaint?.trim(),
  ].filter((c): c is string => Boolean(c));
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
    metadata: { serviceNumber: service.serviceNumber, jobCardId: jobCard.id, findingsIncluded: findingLines.length },
  });
  return { jobCardId: jobCard.id };
}

/** The organisation's own configured Primary Service policy — the
 * real "whichever comes first" rule Vehicle Service's own
 * next-service prediction is anchored to. Master Admin only, same
 * real trust level as everything else in this module. */
export async function updatePrimaryServiceInterval(
  organisationId: string,
  intervalKm: number | undefined,
  intervalDays: number | undefined,
): Promise<void> {
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isMasterAdmin) {
    throw new VehicleServiceActionError('Only a Master Administrator can change the Primary Service interval.');
  }
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { primaryServiceIntervalKm: intervalKm ?? null, primaryServiceIntervalDays: intervalDays ?? null },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'organisation.primary_service_interval_updated',
    entityType: 'Organisation',
    entityId: organisationId,
    metadata: { intervalKm: intervalKm ?? null, intervalDays: intervalDays ?? null },
  });
}
