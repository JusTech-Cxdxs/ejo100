'use server';
import { highestBinnedReference, highestSequence } from '@/lib/recycle-bin/numbers';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';

import { allows, authorize, authorizeOnJobCard, authorizeOnService, canSeeRecord, inMyOrganisation, orgWhere, reachWhere, refuse, seeJobCard, seeVehicle, seePart, NOT_AVAILABLE, refuseDuringAssist } from '@/lib/authz/server';
import { cleanEmail, cleanName, cleanPhone, cleanPrimaryAddress, normaliseTags } from '@/lib/crm';
import { sendCustomerAccessEmail } from '@/lib/customer-access';
import { withdrawOpenSourcing } from '@/lib/sourcing-lifecycle';
import { ESCALATION_CLAIM_MS } from '@/lib/vehicle-service-cycle';
import { jobCardActive, jobCardInside, serviceInside } from '@/lib/custody';


import { bankDetailsFor } from '@/lib/workshop-core';
import { writeAuditLog, getWorkshopOrgContext, getWorkshopDepartmentForVehicleType, isEligibleSupervisor, getWorkshopBranchId, branchInMyOrganisationOrSystem } from '@/lib/workshop-core';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';

/**
 * Workshop server actions: customers, vehicles, Job Cards, estimates,
 * payments, cancellation/close requests and custody.
 *
 * These run as Next.js server actions against @ejo/database rather than
 * calling apps/api: the portal and the API are on different origins, so the
 * portal's httpOnly session cookie cannot be forwarded to it.
 */

import { notifyGateOfRelease } from '@/lib/security-notify';
import { customerTotal, isCustomerLine, coveredLabel } from '@/lib/estimate-billing';
import { prisma, JobCardStatus, setAuditActor, setAuditActorResolver } from '@ejo/database';
import { claimed, lockExisting } from '@/lib/integrity';
import { exceedsBalance, NUMBER_CLASH_TRIES, numberClashPause } from '@/lib/integrity-core';
import { MINIMUM_DEPOSIT_FRACTION, APPROVAL_DEADLINE_WORKING_DAYS, APPROVAL_REMINDER_WORKING_DAYS, CANCELLED_COLLECTION_GRACE_WORKING_DAYS, READY_FOR_COLLECTION_GRACE_WORKING_DAYS } from '@/lib/workshop-constants';
import { workingDaysBetween, addWorkingDays } from '@/lib/utils/working-days';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { getOrganisation } from '@/lib/actions/organisation';
import { getSelectableJobCardStatuses, isReworkTransition as isReworkMove } from '@/lib/job-card-status-rules';
import { anchorEscalatedServiceFromJobCard } from '@/lib/vehicle-service-cycle';
import { custodyReminderState, notDueYetMessage, type CustodyReminderKind } from '@/lib/custody-reminders';
import { renderToBuffer } from '@react-pdf/renderer';
import { EstimatePdf } from '@/lib/pdf/estimate-pdf';
import { activeAssistFor, signedInSession, type ActiveAssist } from '@/lib/assist/server';
import { sendEmail } from '@/lib/email';
import { renderSupervisorJobCardAssignedEmail } from '@/lib/email-templates/supervisor-job-card-assigned';
import { renderCustomerJobCardAcknowledgmentEmail } from '@/lib/email-templates/customer-job-card-acknowledgment';
import { renderJobCardDecisionEmail } from '@/lib/email-templates/job-card-decision';
import { renderTechnicianJobCardAssignedEmail } from '@/lib/email-templates/technician-job-card-assigned';
import { renderTechnicianResponseEmail } from '@/lib/email-templates/technician-response-notification';
import { renderEstimateSubmittedEmail } from '@/lib/email-templates/estimate-submitted-for-validation';
import { renderEstimateReadyForManagerEmail } from '@/lib/email-templates/estimate-ready-for-manager';
import { renderCustomerEstimateApprovedEmail } from '@/lib/email-templates/customer-estimate-approved';
import { renderEstimateReadyForCustomerNotificationEmail } from '@/lib/email-templates/estimate-ready-for-customer-notification';
import { renderEstimateNudgeEmail } from '@/lib/email-templates/estimate-nudge';
import { renderPaymentRecordedUpdateEmail } from '@/lib/email-templates/payment-recorded-update';
import { renderPaymentRequirementMetEmail } from '@/lib/email-templates/payment-requirement-met';
import { renderPaymentCompletedInFullEmail } from '@/lib/email-templates/payment-completed-in-full';
import { renderCustomerPaymentReceivedEmail } from '@/lib/email-templates/customer-payment-received';
import { renderCancellationRequestedEmail } from '@/lib/email-templates/cancellation-requested';
import { renderCancellationDeclinedEmail } from '@/lib/email-templates/cancellation-declined';
import { renderJobCardCancelledStaffEmail } from '@/lib/email-templates/job-card-cancelled-staff';
import { renderCustomerJobCardCancelledEmail } from '@/lib/email-templates/customer-job-card-cancelled';
import { renderCustomerApprovalReminderEmail } from '@/lib/email-templates/customer-approval-reminder';
import { renderCustomerJobCardClosedEmail } from '@/lib/email-templates/customer-job-card-closed';
import { renderCloseRequestedEmail } from '@/lib/email-templates/close-requested';
import { renderCloseRequestDeclinedEmail } from '@/lib/email-templates/close-request-declined';
import { renderCustomerVehicleCheckedOutEmail } from '@/lib/email-templates/customer-vehicle-checked-out';
import { renderJobCardClosedStaffEmail } from '@/lib/email-templates/job-card-closed-staff';
import { renderVehicleCheckedOutStaffEmail } from '@/lib/email-templates/vehicle-checked-out-staff';
import { renderCustomerCollectionOverdueEmail } from '@/lib/email-templates/customer-collection-overdue';
import { renderCustomerJobWorkUpdateEmail } from '@/lib/email-templates/customer-job-work-update';
import { renderCustomerJobInProgressEmail } from '@/lib/email-templates/customer-job-in-progress';
import { renderCustomerQualityCheckEmail } from '@/lib/email-templates/customer-quality-check';
import { renderCustomerJobCompletedEmail } from '@/lib/email-templates/customer-job-completed';
import { renderCustomerReadyForCollectionEmail } from '@/lib/email-templates/customer-ready-for-collection';
import { lagosYear } from '@/lib/utils/format-date';
import { schedulePrediction, scheduleResolution } from '@/lib/enyo/predict/lines';

class WorkshopActionError extends Error {}

/** The signed-in session — looked up once per request, then reused. */
const sessionForRequest = cache(async () => {
  const session = await signedInSession();
  if (!session?.user?.id) return null;
  // A deactivated person is signed out immediately; an open session (or the
  // 5-minute cookie cache) never outlives the deactivation.
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isActive: true } });
  return u?.isActive ? session : null;
});

// The audit journal resolves the actor from this request's cached session:
// an actor set inside requireUser() does not flow back to its caller (E2E-09).
// Outside a request (scheduled jobs, after()) there is no actor.
setAuditActorResolver(async () => {
  try {
    const acting = await actingForRequest();
    if (!acting) return null;
    const actor = { userId: acting.id, source: 'portal', organisationId: acting.organisationId, assistedBy: acting.assist ? { id: acting.assist.assistant.id, name: acting.assist.assistant.name } : null, assistSessionId: acting.assist?.sessionId ?? null };
    return actor;
  } catch {
    return null;
  }
});

/**
 * Who the business rules run as in this request. Normally the signed-in
 * person. During an assisted session (lib/assist) it is the colleague being
 * helped, so "only the assigned technician" checks see the technician; the
 * assistant is carried alongside and named in every audit entry.
 */
const actingForRequest = cache(async (): Promise<{ id: string; organisationId: string | null; assist: ActiveAssist | null } | null> => {
  const session = await sessionForRequest();
  if (!session?.user?.id) return null;
  const organisationId = (session.user as { organisationId?: string | null }).organisationId ?? null;
  const assist = await activeAssistFor(session.user.id, session.session.id);
  if (assist) return { id: assist.subject.id, organisationId: assist.subject.organisationId, assist };
  return { id: session.user.id, organisationId, assist: null };
});

export async function requireUser(): Promise<{ id: string }> {
  const acting = await actingForRequest();
  if (!acting) {
    throw new WorkshopActionError('Not authenticated.');
  }
  // Every write for the rest of this request is attributed to this user in
  // the audit journal (@ejo/database audit-journal).
  setAuditActor(acting.id, 'portal', acting.organisationId, acting.assist ? { assistedBy: { id: acting.assist.assistant.id, name: acting.assist.assistant.name }, assistSessionId: acting.assist.sessionId } : null);
  return { id: acting.id };
}

export async function currentUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

async function currentUserIsMasterAdminUncached(): Promise<boolean> {
  const user = await requireUser();
  const match = await prisma.userRole.findFirst({
    where: { userId: user.id, role: { isSuperAdmin: true } },
  });
  return Boolean(match);
}


/** Only the Job Card's assigned supervisor, or a Master Administrator, may approve or reject it. */
export async function requireJobCardApprover(jobCard: { supervisorId: string | null }): Promise<{ id: string }> {
  const user = await requireUser();
  if (jobCard.supervisorId === user.id) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  return refuse('workshop.job.supervise', 'requireJobCardApprover', 'Only the assigned supervisor can approve or reject this Job Card.');
}

/** Runs an estimate line change in one transaction that first re-claims the
 * estimate in the status the editor saw (a no-op write that takes the row
 * lock). A concurrent approval is then either fully before the edit, which
 * is refused, or fully after it: an approved estimate never changes underneath. */
async function withEstimateUnchanged<T>(estimateId: string, seenStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'MANAGER_APPROVED', work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    claimed(
      await tx.estimate.updateMany({ where: { id: estimateId, status: seenStatus }, data: { status: seenStatus } }),
      'This estimate was just submitted or approved by someone else — refresh the page to see it.',
    );
    return work(tx);
  });
}

/** Emails the Job Card's creator when it is approved or rejected. Fail-soft:
 * an email failure never undoes the decision. */
async function notifyJobCardCreatorOfDecision(params: {
  jobCardId: string;
  jobNumber: string;
  decision: 'APPROVED' | 'REJECTED';
  approverId: string;
  rejectionReason?: string;
  notes?: string;
}): Promise<void> {
  try {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: params.jobCardId },
      select: {
        customer: { select: { fullName: true } },
        createdBy: { select: { fullName: true, email: true } },
        department: { select: { name: true } },
      },
    });
    if (!jobCard) return;
    const approver = await prisma.user.findUnique({
      where: { id: params.approverId },
      select: { fullName: true },
    });
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = portalBaseUrl();

    await sendEmail(
      jobCard.createdBy.email,
      params.decision === 'APPROVED'
        ? `Job Card ${params.jobNumber} approved`
        : `Job Card ${params.jobNumber} returned for correction`,
      renderJobCardDecisionEmail({
        decision: params.decision,
        recipientName: jobCard.createdBy.fullName,
        jobNumber: params.jobNumber,
        customerName: jobCard.customer.fullName,
        approverName: approver?.fullName ?? 'Supervisor',
        rejectionReason: params.rejectionReason,
        notes: params.notes,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${params.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send Job Card decision email to creator', params.jobNumber, err);
  }
}

/** Found via the Workshop department, not a hard-coded id or name. */



export type EligibleSupervisor = { id: string; fullName: string; email: string };
export type EligibleSupervisorResult = {
  supervisors: EligibleSupervisor[];
  // True when nobody holds the Workshop Supervisor role in this department yet
  // and the list is Master Administrators standing in. The UI must say so.
  usingFallback: boolean;
};

/** Users eligible to supervise a Job Card for the given vehicle type: members
 * of that type's Workshop department holding the "Workshop Supervisor" role,
 * so a Passenger job can never be given a Commercial supervisor.
 * Falls back to Master Administrators when the department has nobody yet,
 * flagged with `usingFallback: true`. */
/** The eligibility query shared by the creation picker (by vehicle type) and
 * the reassignment picker (by Job Card), so the rule and its fallback live
 * in one place. */
async function listEligibleSupervisorsForDepartmentId(departmentId: string): Promise<EligibleSupervisorResult> {
  const departmentSupervisors = await prisma.user.findMany({
    where: {
      departmentId,
      isActive: true,
      roles: { some: { role: { slug: 'workshop-supervisor' } } },
    },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  if (departmentSupervisors.length > 0) {
    return { supervisors: departmentSupervisors, usingFallback: false };
  }
  const masterAdmins = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { isSuperAdmin: true } } },
    },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  return { supervisors: masterAdmins, usingFallback: true };
}

export async function listEligibleSupervisorsForVehicleType(
  vehicleType: 'PASSENGER' | 'COMMERCIAL',
): Promise<EligibleSupervisorResult> {
  await requireUser();
  const department = await getWorkshopDepartmentForVehicleType(vehicleType);
  return listEligibleSupervisorsForDepartmentId(department.id);
}

/** Reassignment picker: the Job Card's department is already known. */
export async function listEligibleSupervisorsForJobCard(jobCardId: string): Promise<EligibleSupervisorResult> {
  await requireUser();
  await seeJobCard(jobCardId, 'listEligibleSupervisorsForJobCard');
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { departmentId: true },
  });
  if (!jobCard?.departmentId) {
    return { supervisors: [], usingFallback: false };
  }
  return listEligibleSupervisorsForDepartmentId(jobCard.departmentId);
}


// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

export async function listCustomers(search?: string) {
  await requireUser();
  return prisma.customer.findMany({
    where: search
      ? {
          ...(await orgWhere()),
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : await orgWhere(),
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      _count: { select: { vehicles: true, jobCards: true } },
      createdBy: { select: { fullName: true } },
    },
  });
}

export type CustomerSearchResult = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
};

const PICKER_RESULT_LIMIT = 20;

/**
 * Typeahead search for SearchableSelect. Separate from listCustomers(),
 * which serves the full table page. Queries the whole customer table and
 * returns the top 20 matches; a blank query returns nothing.
 */
export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  await requireUser();
  const q = query.trim();
  if (!q) return [];
  return prisma.customer.findMany({
    where: {
      ...(await orgWhere()),
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { fullName: 'asc' },
    take: PICKER_RESULT_LIMIT,
    select: { id: true, fullName: true, email: true, phone: true },
  });
}

/** Default picker suggestions before anything is typed: most recently registered customers. */
export async function listRecentCustomers(): Promise<CustomerSearchResult[]> {
  await requireUser();
  return prisma.customer.findMany({
    where: await orgWhere(),
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { id: true, fullName: true, email: true, phone: true },
  });
}

export type CreateCustomerInput = {
  customerType: 'INDIVIDUAL' | 'ORGANIZATION';
  fullName: string;
  /** Primary address, required from v28 (one short line, max 80 characters). */
  address: string;
  email: string;
  /** Primary phone, required from v28. */
  phone: string;
  altPhone?: string;
  tags?: string[];
};

/** Returns the existing customer with this email, or creates one, so a
 * returning customer never gets a duplicate record. New customers need a
 * primary address and phone, and receive a welcome email with a one-time
 * set-password link (never a password). Front desk registers customers;
 * CRM managers and administrators may too. */
export async function findOrCreateCustomer(input: CreateCustomerInput) {
  if (!(await allows('workshop.customer.manage'))) await authorize('crm.manage', undefined, 'findOrCreateCustomer', 'Only front desk, managers and administrators can register customers.');
  const currentUser = await requireUser();
  const email = cleanEmail(input.email);
  const fullName = cleanName(input.fullName, input.customerType === 'ORGANIZATION' ? 'Organisation name' : 'Customer name');

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    // Never hand back (or attach work to) another organisation's customer.
    if (!(await inMyOrganisation(existing.organisationId))) {
      throw new WorkshopActionError('That email address is already registered on the platform — use a different email for this customer.');
    }
    return { customer: existing, wasExisting: true, welcomeEmailSent: false };
  }

  // Required for new customers (older records may lack them).
  const address = cleanPrimaryAddress(input.address);
  const phone = cleanPhone(input.phone, { required: true, label: 'Phone number' })!;
  const altPhone = cleanPhone(input.altPhone, { required: false, label: 'Second phone number' });
  const tags = normaliseTags(input.tags ?? []);

  const branchId = await getWorkshopBranchId();
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    select: { businessUnit: { select: { organisationId: true } } },
  });

  const customer = await prisma.customer.create({
    data: {
      organisationId: branch.businessUnit.organisationId,
      customerType: input.customerType,
      fullName,
      address,
      email,
      phone,
      altPhone,
      tags,
      createdById: currentUser.id,
    },
  });

  await writeAuditLog({
    userId: currentUser.id,
    organisationId: customer.organisationId,
    action: 'customer.created',
    entityType: 'Customer',
    entityId: customer.id,
    metadata: { actor: 'staff', fullName: customer.fullName, email: customer.email, customerType: customer.customerType, phone, address },
  });

  const welcome = await sendCustomerAccessEmail(customer.id, 'welcome', currentUser.id);

  return { customer, wasExisting: false, welcomeEmailSent: welcome.sent };
}

// ---------------------------------------------------------------------------
// VEHICLES
// ---------------------------------------------------------------------------

export type VehicleSearchResult = {
  id: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicleType: 'PASSENGER' | 'COMMERCIAL' | null;
};

/**
 * A customer's vehicles for the Job Card picker. Scoped to one customer, so
 * no search is needed; `take: 50` is only a safety cap. Includes
 * vehicleType so the picker can load the right supervisors straight away.
 */
export async function listVehiclesForCustomer(customerId: string): Promise<VehicleSearchResult[]> {
  await requireUser();
  if (!customerId) return [];
  return prisma.customerVehicle.findMany({
    where: { customerId, customer: await orgWhere() },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, plateNumber: true, chassisNumber: true, make: true, model: true, year: true, vehicleType: true },
  });
}

export async function listAllVehicles(search?: string, vehicleType?: 'PASSENGER' | 'COMMERCIAL') {
  await requireUser();
  const q = search?.trim();
  return prisma.customerVehicle.findMany({
    where: {
      customer: await orgWhere(),
      ...(vehicleType ? { vehicleType } : {}),
      ...(q
        ? {
            OR: [
              { plateNumber: { contains: q, mode: 'insensitive' } },
              { chassisNumber: { contains: q, mode: 'insensitive' } },
              { make: { contains: q, mode: 'insensitive' } },
              { model: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      customer: { select: { fullName: true, email: true } },
      createdBy: { select: { fullName: true } },
    },
  });
}

export async function getVehicle(id: string) {
  await requireUser();
  // Another organisation's vehicle behaves as "not found".
  return prisma.customerVehicle.findFirst({
    where: { id, customer: await orgWhere() },
    include: {
      customer: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
    },
  });
}

export type CreateVehicleInput = {
  customerId: string;
  make?: string;
  model?: string;
  vehicleType?: 'PASSENGER' | 'COMMERCIAL';
  year?: number;
  plateNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
  engineType?: string;
  mileage?: number;
};

/** Nigerian plates are written like "LAG 123 AA". Stored uppercased with
 * single spaces so "lag 123  aa" and "LAG 123 AA" count as the same plate. */
function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** VINs are 17 characters with no spaces. Stored uppercased for duplicate matching. */
function normalizeChassis(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export async function createVehicle(input: CreateVehicleInput) {
  await authorize('workshop.customer.manage', undefined, 'createVehicle');
  const currentUser = await requireUser();
  if (!input.customerId) {
    throw new WorkshopActionError('A vehicle must belong to a customer.');
  }
  const owner = await prisma.customer.findFirst({ where: { id: input.customerId, ...(await orgWhere()) }, select: { id: true } });
  if (!owner) throw new WorkshopActionError('That customer could not be found.');

  // Enforced server-side; the form's `required` attributes can be bypassed.
  // Mileage and engine number stay optional (mileage is captured at Job Card
  // check-in; engine numbers are sometimes unavailable).
  const make = input.make?.trim();
  const model = input.model?.trim();
  const plateNumberRaw = input.plateNumber?.trim();
  const chassisNumberRaw = input.chassisNumber?.trim();
  if (!make || !model || !input.year || !plateNumberRaw || !chassisNumberRaw || !input.vehicleType) {
    throw new WorkshopActionError('Vehicle type, make, model, year, plate number, and chassis/VIN are all required to register a vehicle.');
  }

  const plateNumber = normalizePlate(plateNumberRaw);
  const chassisNumber = normalizeChassis(chassisNumberRaw);

  if (chassisNumber.length !== 17) {
    throw new WorkshopActionError('Chassis / VIN must be exactly 17 characters.');
  }

  // Friendly error before the unique constraint, which still catches two
  // submissions racing past this check.
  const existingByPlate = await prisma.customerVehicle.findUnique({ where: { plateNumber } });
  if (existingByPlate) {
    throw new WorkshopActionError(`A vehicle with plate number "${plateNumber}" is already registered.`);
  }
  const existingByChassis = await prisma.customerVehicle.findUnique({ where: { chassisNumber } });
  if (existingByChassis) {
    throw new WorkshopActionError(`A vehicle with chassis/VIN "${chassisNumber}" is already registered.`);
  }

  const vehicle = await prisma.customerVehicle.create({
    data: {
      customerId: input.customerId,
      make,
      model,
      vehicleType: input.vehicleType,
      year: input.year,
      plateNumber,
      chassisNumber,
      engineNumber: input.engineNumber?.trim() || null,
      engineType: input.engineType?.trim() || null,
      mileage: input.mileage ?? null,
      createdById: currentUser.id,
    },
  });
  // "Vehicle registered": the first entry on the vehicle's trail.
  await writeAuditLog({
    userId: currentUser.id,
    action: 'vehicle.created',
    entityType: 'CustomerVehicle',
    entityId: vehicle.id,
    metadata: { plateNumber: vehicle.plateNumber, chassisNumber: vehicle.chassisNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year, customerId: vehicle.customerId },
  });
  return vehicle;
}

export type UpdateVehicleInput = {
  id: string;
  make?: string;
  model?: string;
  vehicleType?: 'PASSENGER' | 'COMMERCIAL';
  year?: number;
  plateNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
  engineType?: string;
  mileage?: number;
  serviceIntervalKm?: number;
  serviceIntervalDays?: number;
};

/** Same validation as createVehicle(); duplicate checks exclude this vehicle's own row. */
export async function updateVehicle(input: UpdateVehicleInput): Promise<void> {
  await authorize('workshop.customer.manage', undefined, 'updateVehicle');
  const currentUser = await requireUser();
  const existing = await prisma.customerVehicle.findFirst({ where: { id: input.id, customer: await orgWhere() } });
  if (!existing) {
    throw new WorkshopActionError('Vehicle not found.');
  }

  const make = input.make?.trim();
  const model = input.model?.trim();
  const plateNumberRaw = input.plateNumber?.trim();
  const chassisNumberRaw = input.chassisNumber?.trim();
  if (!make || !model || !input.year || !plateNumberRaw || !chassisNumberRaw || !input.vehicleType) {
    throw new WorkshopActionError('Vehicle type, make, model, year, plate number, and chassis/VIN are all required.');
  }

  const plateNumber = normalizePlate(plateNumberRaw);
  const chassisNumber = normalizeChassis(chassisNumberRaw);

  if (chassisNumber.length !== 17) {
    throw new WorkshopActionError('Chassis / VIN must be exactly 17 characters.');
  }

  const existingByPlate = await prisma.customerVehicle.findUnique({ where: { plateNumber } });
  if (existingByPlate && existingByPlate.id !== input.id) {
    throw new WorkshopActionError(`A vehicle with plate number "${plateNumber}" is already registered.`);
  }
  const existingByChassis = await prisma.customerVehicle.findUnique({ where: { chassisNumber } });
  if (existingByChassis && existingByChassis.id !== input.id) {
    throw new WorkshopActionError(`A vehicle with chassis/VIN "${chassisNumber}" is already registered.`);
  }

  await prisma.customerVehicle.update({
    where: { id: input.id },
    data: {
      make,
      model,
      vehicleType: input.vehicleType,
      year: input.year,
      plateNumber,
      chassisNumber,
      engineNumber: input.engineNumber?.trim() || null,
      engineType: input.engineType?.trim() || null,
      mileage: input.mileage ?? null,
      serviceIntervalKm: input.serviceIntervalKm ?? null,
      serviceIntervalDays: input.serviceIntervalDays ?? null,
    },
  });

  await writeAuditLog({
    userId: currentUser.id,
    action: 'vehicle.updated',
    entityType: 'CustomerVehicle',
    entityId: input.id,
    metadata: { plateNumber, make, model },
  });
}

/** Who last performed `action` on the entity and when, read from AuditLog
 * rather than a separate updatedBy column. Null if there is no such entry. */
export async function getLastEditInfo(entityType: string, entityId: string, action: string): Promise<{ userName: string; at: Date } | null> {
  await requireUser();
  // Only for records the person can see (today: vehicles and parts).
  if (entityType === 'CustomerVehicle') await seeVehicle(entityId, 'getLastEditInfo');
  else if (entityType === 'Part') await seePart(entityId, 'getLastEditInfo');
  else throw new Error(NOT_AVAILABLE);
  const entry = await prisma.auditLog.findFirst({
    where: { entityType, entityId, action },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, createdAt: true },
  });
  if (!entry) return null;
  if (!entry.userId) return { userName: 'Unknown', at: entry.createdAt };
  const user = await prisma.user.findUnique({ where: { id: entry.userId }, select: { fullName: true } });
  return { userName: user?.fullName ?? 'Unknown', at: entry.createdAt };
}

export type VehicleAuditEntry = {
  id: string;
  action: string;
  createdAt: Date;
  metadata: unknown;
  user: { fullName: string } | null;
};

/** The vehicle's full audit history. Not capped. */
export async function getVehicleAuditTrail(vehicleId: string): Promise<VehicleAuditEntry[]> {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleAuditTrail');
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'CustomerVehicle', entityId: vehicleId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

// ---------------------------------------------------------------------------
// JOB CARDS
// ---------------------------------------------------------------------------

/** JC-<year>-<sequence>, e.g. "JC-2026-000042".
 *
 * The next number comes from the highest jobNumber this year, not a row
 * count: a count undercounts once any Job Card is deleted and then repeats
 * the same number on every retry. The sequence is zero-padded to 6 digits,
 * so a descending string sort matches numeric order. Concurrent creates can
 * still collide; createJobCard retries on that.
 */
async function generateJobNumber(): Promise<string> {
  const year = lagosYear();
  const prefix = `JC-${year}-`;
  const latest = await prisma.jobCard.findFirst({
    where: { jobNumber: { startsWith: prefix } },
    orderBy: { jobNumber: 'desc' },
    select: { jobNumber: true },
  });
  // A binned number stays reserved (lib/recycle-bin/numbers.ts).
  const binned = await highestBinnedReference('JobCard', prefix);
  const nextSequence = highestSequence(prefix, [latest?.jobNumber, binned]) + 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

export async function listJobCards(status?: JobCardStatus, search?: string, vehicleType?: 'PASSENGER' | 'COMMERCIAL') {
  await requireUser();
  const q = search?.trim();
  const reach = await reachWhere('workshop.job_card.view');

  return prisma.jobCard.findMany({
    where: {
      ...reach,
      ...(status ? { status } : {}),
      ...(vehicleType ? { vehicle: { vehicleType } } : {}),
      ...(q
        ? {
            OR: [
              { jobNumber: { contains: q, mode: 'insensitive' } },
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
    include: {
      customer: { select: { fullName: true, phone: true } },
      vehicle: { select: { id: true, make: true, model: true, plateNumber: true, vehicleType: true } },
      assignedTechnician: { select: { fullName: true } },
      escalatedFromVehicleService: { select: { id: true, serviceNumber: true } },
    },
  });
}

async function getJobCardUnscoped(id: string) {
  await requireUser();
  return prisma.jobCard.findUnique({
    where: { id },
    include: {
      customer: true,
      vehicle: true,
      assignedTechnician: { select: { id: true, fullName: true } },
      supervisor: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, fullName: true } },
      branch: { select: { name: true, address: true, hotlines: true, email: true } },
      complaints: { orderBy: { sequenceNumber: 'asc' } },
      // Estimate lines and payments, for the Vehicle Collection Receipt.
      estimate: { include: { lineItems: { orderBy: { createdAt: 'asc' }, include: { coveringWarranty: { select: { id: true, warrantyNumber: true } } } } } },
      payments: { orderBy: { recordedAt: 'asc' }, include: { recordedBy: { select: { fullName: true } } } },
      refunds: { orderBy: { recordedAt: 'asc' }, include: { recordedBy: { select: { fullName: true } } } },
      escalatedFromVehicleService: { select: { id: true, serviceNumber: true, escalatedAt: true } },
      // Used only to tell whether the Job Card was ever cancelled (for the
      // receipt's cancelled variant). After checkout its status is CHECKED_OUT
      // either way, so this is the only place that fact survives.
      cancellationRequests: {
        where: { status: 'APPROVED' },
        orderBy: { decidedAt: 'desc' },
        take: 1,
        select: {
          reason: true,
          decidedAt: true,
          requestedBy: { select: { fullName: true } },
          decidedBy: { select: { fullName: true } },
        },
      },
      // Store Parts Request / External Procurement numbers, listed on the
      // receipt's organisation copy.
      partRequestSlips: { select: { referenceNumber: true } },
      externalProcurementRequests: { select: { referenceNumber: true } },
    },
  });
}

export type JobCardAuditEntry = {
  id: string;
  action: string;
  createdAt: Date;
  metadata: unknown;
  user: { fullName: string } | null;
};

/** The Job Card's audit trail (AuditLog rows for this entity), newest first. */
export async function getJobCardAuditTrail(jobCardId: string): Promise<JobCardAuditEntry[]> {
  await requireUser();
  await seeJobCard(jobCardId, 'getJobCardAuditTrail');
  // Not capped: a 50-row cap once hid a busy Job Card's earliest entries,
  // including its creation. The UI decides how many to show.
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'JobCard', entityId: jobCardId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const userIds = [
    ...new Set(
      entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)),
    ),
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

export type CreateJobCardInput = {
  customerId: string;
  vehicleId: string;
  complaints: string[];
  supervisorId: string;
  mileageAtCheckIn?: number;
  /** Set when this Job Card continues an escalated Vehicle Service; the
   * customer's acknowledgment email then explains the escalation. */
  escalatedFromServiceNumber?: string;
};


export async function createJobCard(input: CreateJobCardInput) {
  let escalatedServiceId: string | null = null;
  if (input.escalatedFromServiceNumber) {
    // Escalating a Vehicle Service is done by its supervisor or technician,
    // checked against the service record itself: same customer, same vehicle,
    // not already escalated.
    const sv = await prisma.vehicleService.findFirst({
      // Only a service that escalateVehicleService has just claimed for hand-over
      // (status, payments and cancellation already checked); never a direct call
      // that skips those checks.
      where: { serviceNumber: input.escalatedFromServiceNumber, customerId: input.customerId, vehicleId: input.vehicleId, escalatedToJobCardId: null, escalatedAt: { gte: new Date(Date.now() - ESCALATION_CLAIM_MS) } },
      select: { id: true },
    });
    if (!sv) throw new WorkshopActionError('That Vehicle Service cannot be escalated — refresh the page.');
    await authorizeOnService('workshop.job.work', sv.id, 'createJobCard.escalation');
    escalatedServiceId = sv.id;
  } else {
    await authorize('workshop.job_card.create', undefined, 'createJobCard');
  }
  const user = await requireUser();
  const complaints = input.complaints.map((c) => c.trim()).filter((c) => c.length > 0);
  if (!input.customerId || !input.vehicleId || complaints.length === 0) {
    throw new WorkshopActionError('Customer, vehicle, and at least one complaint are required to open a Job Card.');
  }
  if (!input.supervisorId) {
    throw new WorkshopActionError('A supervisor must be assigned to open a Job Card.');
  }
  if (input.mileageAtCheckIn !== undefined && input.mileageAtCheckIn !== null && (!Number.isInteger(input.mileageAtCheckIn) || input.mileageAtCheckIn < 0 || input.mileageAtCheckIn > 5_000_000)) {
    throw new WorkshopActionError('Enter the mileage as a whole number of kilometres.');
  }
  if (complaints.some((c) => c.length > 500)) {
    throw new WorkshopActionError('Keep each complaint under 500 characters.');
  }

  // The department is derived from the vehicle's recorded type, never from
  // client input. The vehicle must belong to this organisation.
  const vehicle = await prisma.customerVehicle.findFirst({
    where: { id: input.vehicleId, customer: await orgWhere() },
    select: { vehicleType: true, make: true, model: true, plateNumber: true, customerId: true },
  });
  if (!vehicle) {
    throw new WorkshopActionError('That vehicle could not be found.');
  }
  // The Job Card is always filed under the vehicle's owner.
  if (vehicle.customerId !== input.customerId) {
    throw new WorkshopActionError('That vehicle belongs to a different customer — choose the customer again.');
  }
  if (!vehicle.vehicleType) {
    throw new WorkshopActionError(
      'This vehicle has no Passenger/Commercial type on file yet — set it on the Vehicles page before opening a Job Card for it.',
    );
  }
  const department = await getWorkshopDepartmentForVehicleType(vehicle.vehicleType);

  if (!(await isEligibleSupervisor(input.supervisorId, department.id))) {
    throw new WorkshopActionError('The selected supervisor is not eligible for this vehicle\'s Workshop department.');
  }

  const branchId = await getWorkshopBranchId();

  // Retries only on a jobNumber collision (two creates reading the same
  // latest number). Any other error is re-thrown immediately.
  // On success we break out with `created` so the notification emails below
  // run once, outside the retry loop.
  async function attemptCreate(jobNumber: string) {
    return prisma.$transaction(async (tx) => {
    // One open Job Card per vehicle: the vehicle row is locked while this is
    // decided, so a double click (or two desks at once) opens exactly one.
    await lockExisting(tx, 'customerVehicle', [input.vehicleId], 'That vehicle could not be found.');
    const open = await tx.jobCard.findFirst({ where: { vehicleId: input.vehicleId, status: { notIn: [JobCardStatus.CANCELLED, JobCardStatus.CLOSED, JobCardStatus.CHECKED_OUT] } }, select: { jobNumber: true } });
    if (open) throw new WorkshopActionError(`This vehicle already has an open Job Card (${open.jobNumber}) — continue on that one.`);
    return tx.jobCard.create({
      data: {
        jobNumber,
        branchId,
        departmentId: department.id,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        supervisorId: input.supervisorId,
        mileageAtCheckIn: input.mileageAtCheckIn ?? null,
        createdById: user.id,
        status: JobCardStatus.CHECKED_IN,
        // Escalation: linked to its Vehicle Service in the same write.
        ...(escalatedServiceId ? { escalatedFromVehicleService: { connect: { id: escalatedServiceId } } } : {}),
        complaints: {
          create: complaints.map((description, i) => ({
            sequenceNumber: i + 1,
            description,
          })),
        },
      },
      include: {
        customer: { select: { fullName: true, email: true } },
        supervisor: { select: { fullName: true, email: true } },
        complaints: { orderBy: { sequenceNumber: 'asc' } },
      },
    });
    });
  }

  const MAX_ATTEMPTS = NUMBER_CLASH_TRIES;
  let created: Awaited<ReturnType<typeof attemptCreate>> | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const jobNumber = await generateJobNumber();
    try {
      created = await attemptCreate(jobNumber);
      break;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      const target = (err as { meta?: { target?: unknown } } | null)?.meta?.target;
      // `meta.target` is usually an array of column names on Postgres, but can
      // be a string; accept both.
      const isJobNumberCollision =
        code === 'P2002' &&
        ((Array.isArray(target) && target.includes('jobNumber')) ||
          (typeof target === 'string' && target.includes('jobNumber')));
      if (isJobNumberCollision && attempt < MAX_ATTEMPTS) {
        await numberClashPause(attempt);
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new WorkshopActionError('Could not generate a unique Job Card number after several attempts — please try again.');
  }

  // Notify the assigned supervisor. Fail-soft: an email failure never undoes
  // the creation.
  try {
    const orgContext = await getWorkshopOrgContext(department.name);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      created.supervisor!.email,
      `New Job Card ${created.jobNumber} assigned to you`,
      renderSupervisorJobCardAssignedEmail({
        supervisorName: created.supervisor!.fullName,
        jobNumber: created.jobNumber,
        customerName: created.customer.fullName,
        vehicleDescription: [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        complaints: created.complaints.map((c: (typeof created.complaints)[number]) => c.description),
        jobCardUrl: `${portalUrl}/workshop/job-cards/${created.id}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send supervisor notification email for Job Card', created.jobNumber, err);
  }

  // Customer email in its own try/catch so one failure doesn't stop the other.
  // Links go to the website, where the customer's dashboard lives.
  try {
    const orgContext = await getWorkshopOrgContext(department.name);
    const websiteUrl = websiteBaseUrl();
    await sendEmail(
      created.customer.email,
      input.escalatedFromServiceNumber
        ? `Your service continues as Job Card ${created.jobNumber}`
        : `Your vehicle is checked in — Job Card ${created.jobNumber}`,
      renderCustomerJobCardAcknowledgmentEmail({
        customerName: created.customer.fullName,
        jobNumber: created.jobNumber,
        vehicleDescription: [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        complaints: created.complaints.map((c: (typeof created.complaints)[number]) => c.description),
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${created.id}`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
        escalatedFromServiceNumber: input.escalatedFromServiceNumber,
      }),
    );
  } catch (err) {
    logFailure('Failed to send customer acknowledgment email for Job Card', created.jobNumber, err);
  }

  await writeAuditLog({
    userId: user.id,
    action: 'job_card.created',
    entityType: 'JobCard',
    entityId: created.id,
    metadata: { jobNumber: created.jobNumber, departmentId: department.id, supervisorId: input.supervisorId },
  });

  // Enyo: what similar past jobs needed, stored after the creation has
  // committed (Shadow / Suggest mode). Never in the way: errors are only logged.
  schedulePrediction({ kind: 'JOB_CARD', id: created.id });

  return created;
}

export async function updateJobCardStatus(id: string, status: JobCardStatus, collectedByName?: string, reworkReason?: string) {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    select: {
      status: true,
      jobNumber: true,
      departmentId: true,
      branchId: true,
      workStartedAt: true,
      completedAt: true,
      checkedOutAt: true,
      createdById: true,
      supervisorId: true,
      assignedTechnicianId: true,
      department: { select: { name: true } },
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true } },
      estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } },
      payments: { select: { amount: true } },
      refunds: { select: { amount: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  // Only someone who may see this Job Card (its branch, their organisation)
  // can move it. A refusal is audited and reads as "not available".
  await authorizeOnJobCard('workshop.job_card.view', id, 'workshop.updateJobCardStatus');
  // Re-saving the current status is a no-op: no reset of the collection
  // clock, no overwritten collector, no audit entry.
  if (jobCard.status === status) {
    return (await prisma.jobCard.findUnique({ where: { id } }))!;
  }
  // CLOSED and CANCELLED are only set by the Manager approval flows
  // (approveCloseRequest, approveCancellationRequest), never here.
  if (status === JobCardStatus.CLOSED) {
    throw new WorkshopActionError('A Job Card is closed by approving a close request, not directly — see Request Close.');
  }
  if (status === JobCardStatus.CANCELLED) {
    throw new WorkshopActionError('A Job Card is cancelled by approving a cancellation request, not directly — see Request Cancellation.');
  }
  // A cancelled Job Card is terminal; the only remaining step is handing the
  // vehicle back (CHECKED_OUT).
  if (jobCard.status === JobCardStatus.CANCELLED && status !== JobCardStatus.CHECKED_OUT) {
    throw new WorkshopActionError('This Job Card is cancelled — the only status change available is checking the vehicle out.');
  }
  // A cancelled Job Card that took money can't hand the vehicle back until
  // Finance has refunded all of it, so a refund is never forgotten.
  if (jobCard.status === JobCardStatus.CANCELLED && status === JobCardStatus.CHECKED_OUT) {
    // Handing a cancelled vehicle back is the front desk's step for that
    // branch (same rule as a cancelled Vehicle Service).
    await authorizeOnJobCard('workshop.job_card.create', id, 'workshop.handBackCancelledJobCard');
    const paid = jobCard.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);
    const refunded = jobCard.refunds.reduce((sum: number, r: { amount: unknown }) => sum + Number(r.amount), 0);
    const owed = Math.round((paid - refunded) * 100) / 100;
    if (owed > 0) {
      throw new WorkshopActionError(`₦${owed.toLocaleString('en-NG', { minimumFractionDigits: 2 })} paid on this Job Card must be refunded (recorded under Refunds) before the vehicle can be handed back.`);
    }
  }
  // No checkout while money is owed. Cancelled Job Cards are exempt: nothing
  // is being paid for, the vehicle is only waiting to be collected.
  if (
    status === JobCardStatus.CHECKED_OUT
    && jobCard.status !== JobCardStatus.CANCELLED
  ) {
    const totalEstimate = customerTotal(jobCard.estimate?.lineItems ?? []);
    const totalPaid = jobCard.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);
    if (totalPaid < totalEstimate) {
      throw new WorkshopActionError('Payment must be completed in full before this Job Card can be checked out.');
    }
  }
  const priorStatus = jobCard.status;
  // The collector's name is required on checkout, as on a parts release.
  if (status === JobCardStatus.CHECKED_OUT && priorStatus !== JobCardStatus.CHECKED_OUT && !collectedByName?.trim()) {
    throw new WorkshopActionError('The name of whoever is collecting the vehicle is required to check it out.');
  }
  // Enforce the standard forward progression server-side. Master Admin
  // bypasses it. CHECKED_OUT and cancellation moves are covered by the guards
  // above; this only handles plain single-step moves.
  if (priorStatus !== status && priorStatus !== JobCardStatus.CANCELLED) {
    const isMasterAdmin = await currentUserIsMasterAdmin();
    if (!isMasterAdmin) {
      const managers = await listEligibleManagersForBranch(jobCard.branchId);
      const roleContext = {
        isMasterAdmin: false,
        isSupervisor: jobCard.supervisorId === user.id,
        isAssignedTechnician: jobCard.assignedTechnicianId === user.id,
        isEligibleManager: managers.supervisors.some((m) => m.id === user.id),
      };
      const allowed = getSelectableJobCardStatuses(priorStatus, roleContext);
      if (!allowed.includes(status)) {
        throw new WorkshopActionError(`This Job Card can't move from ${priorStatus} to ${status} directly — choose one of the next steps offered on the page.`);
      }
    }
  }
  // Rework is the one allowed backward move (see job-card-status-rules.ts).
  // It needs a reason and is logged as its own action.
  const isReworkTransition = isReworkMove(priorStatus, status);
  if (isReworkTransition && !reworkReason?.trim()) {
    throw new WorkshopActionError('A reason is required to send this Job Card back for rework.');
  }
  // Reworking a vehicle whose close is already being decided would leave
  // a Manager approving a close for unfinished work.
  if (isReworkTransition) {
    const pendingClose = await prisma.closeRequest.findFirst({ where: { jobCardId: id, status: 'PENDING' }, select: { id: true } });
    if (pendingClose) {
      throw new WorkshopActionError('A close request is pending for this Job Card — decline it first, then send the vehicle back for rework.');
    }
  }
  // Compare-and-set: the move only happens if the Job Card is still in the
  // status this person saw. Two concurrent moves can't both win, and a
  // cancellation approved meanwhile can't be overwritten.
  claimed(await prisma.jobCard.updateMany({
    where: { id, status: priorStatus },
    data: {
      status,
      readyForCollectionAt: isReworkTransition && priorStatus === JobCardStatus.READY_FOR_COLLECTION ? null : status === JobCardStatus.READY_FOR_COLLECTION ? new Date() : undefined,
      // Set only on first arrival at each status, never overwritten by a later
      // return (e.g. IN_PROGRESS again after AWAITING_PARTS).
      workStartedAt: status === JobCardStatus.IN_PROGRESS && !jobCard.workStartedAt ? new Date() : undefined,
      // Rework after sign-off reopens the work: completion and
      // ready-for-collection are cleared so they record the final finish
      // (the audit trail keeps each pass).
      completedAt: isReworkTransition && priorStatus !== JobCardStatus.QUALITY_CHECK ? null : status === JobCardStatus.COMPLETED && !jobCard.completedAt ? new Date() : undefined,
      checkedOutAt: status === JobCardStatus.CHECKED_OUT && !jobCard.checkedOutAt ? new Date() : undefined,
      collectedByName: status === JobCardStatus.CHECKED_OUT ? collectedByName?.trim() : undefined,
    },
  }));
  const result = (await prisma.jobCard.findUnique({ where: { id } }))!;

  // Security expects the vehicle at the gate: checkout or hand-back.
  if (status === JobCardStatus.CHECKED_OUT && priorStatus !== JobCardStatus.CHECKED_OUT) {
    await notifyGateOfRelease('JOB_CARD', id, user.id);
  }

  // For a Job Card that came from a Vehicle Service, a real checkout (not a
  // cancelled hand-back) completes that service; the next-service count
  // starts here.
  if (status === JobCardStatus.CHECKED_OUT && priorStatus !== JobCardStatus.CANCELLED && priorStatus !== JobCardStatus.CHECKED_OUT) {
    try {
      await anchorEscalatedServiceFromJobCard(id);
    } catch (err) {
      logFailure('Failed to start the next-service count from this Job Card checkout', id, err);
    }
  }

  // Customer emails on an actual transition into these statuses only.
  // AWAITING_PARTS is internal and sends no customer email.
  if (priorStatus !== status && (
    status === JobCardStatus.IN_PROGRESS
    || status === JobCardStatus.QUALITY_CHECK
    || status === JobCardStatus.COMPLETED
    || status === JobCardStatus.READY_FOR_COLLECTION
  )) {
    try {
      const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
      const websiteUrl = websiteBaseUrl();
      const vehicleDescription = [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
      const dashboardUrl = `${websiteUrl}/customer-portal/dashboard#jobcard-${id}`;
      const logoUrl = `${websiteUrl}/images/logo/email-logo.png`;
      // Has this Job Card been sent back for rework before? (This move isn't
      // counted; its audit entry is written after these emails.)
      const reworkedBefore =
        isReworkTransition ||
        (await prisma.auditLog.count({ where: { entityType: 'JobCard', entityId: id, action: 'job_card.rework_requested' } })) > 0;
      const shared = {
        customerName: jobCard.customer.fullName,
        jobNumber: jobCard.jobNumber,
        vehicleDescription,
        dashboardUrl,
        logoUrl,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      };

      // After a rework, tell the customer it's a rework, not "work has started" again.
      if (status === JobCardStatus.IN_PROGRESS && isReworkTransition) {
        await sendEmail(
          jobCard.customer.email,
          `An update on your vehicle — Job Card ${jobCard.jobNumber}`,
          renderCustomerJobWorkUpdateEmail({ ...shared, kind: 'REWORK' }),
        );
      } else if (status === JobCardStatus.IN_PROGRESS && priorStatus === JobCardStatus.AWAITING_PARTS) {
        await sendEmail(
          jobCard.customer.email,
          `Work on your vehicle has resumed — Job Card ${jobCard.jobNumber}`,
          renderCustomerJobWorkUpdateEmail({ ...shared, kind: 'RESUMED' }),
        );
      } else if (status === JobCardStatus.IN_PROGRESS) {
        await sendEmail(
          jobCard.customer.email,
          `Work on your vehicle has started — Job Card ${jobCard.jobNumber}`,
          renderCustomerJobInProgressEmail(shared),
        );
      } else if (status === JobCardStatus.QUALITY_CHECK) {
        // After a rework the customer already knows checks are under way; no
        // duplicate quality-check email.
        if (!reworkedBefore) {
          await sendEmail(
            jobCard.customer.email,
            `Your vehicle is in final quality checks — Job Card ${jobCard.jobNumber}`,
            renderCustomerQualityCheckEmail(shared),
          );
        }
      } else if (status === JobCardStatus.COMPLETED) {
        await sendEmail(
          jobCard.customer.email,
          `Your vehicle passed its quality inspection — Job Card ${jobCard.jobNumber}`,
          renderCustomerJobCompletedEmail({ ...shared, afterRework: reworkedBefore }),
        );
      } else {
        const dueDate = addWorkingDays(new Date(), READY_FOR_COLLECTION_GRACE_WORKING_DAYS);
        await sendEmail(
          jobCard.customer.email,
          `Your vehicle is ready for collection — Job Card ${jobCard.jobNumber}`,
          renderCustomerReadyForCollectionEmail({
            ...shared,
            dueDate: dueDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' }),
            afterRework: reworkedBefore,
          }),
        );
      }
    } catch (err) {
      logFailure('Failed to send status-lifecycle email', id, status, err);
    }
  }

  // CHECKED_OUT emails the customer and every staff party on the Job Card
  // (creator, supervisor, technician, branch Managers), once per transition.
  // CLOSED never reaches here; its emails are sent from approveCloseRequest.
  if (priorStatus !== status && status === JobCardStatus.CHECKED_OUT) {
    try {
      const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
      const websiteUrl = websiteBaseUrl();
      const portalUrl = portalBaseUrl();
      const vehicleDescription = [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
      const dashboardUrl = `${websiteUrl}/customer-portal/dashboard`;
      const jobCardUrl = `${portalUrl}/workshop/job-cards/${id}`;
      const websiteLogoUrl = `${websiteUrl}/images/logo/email-logo.png`;
      const portalLogoUrl = `${portalUrl}/images/logo/email-logo.png`;
      const realCollectedByName = result.collectedByName ?? collectedByName?.trim() ?? 'the customer';

      await sendEmail(
        jobCard.customer.email,
        `Your vehicle has been collected — Job Card ${jobCard.jobNumber}`,
        renderCustomerVehicleCheckedOutEmail({
          customerName: jobCard.customer.fullName,
          jobNumber: jobCard.jobNumber,
          vehicleDescription,
          collectedByName: realCollectedByName,
          dashboardUrl,
          logoUrl: websiteLogoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );

      const recipientIds = new Set<string>();
      if (jobCard.createdById) recipientIds.add(jobCard.createdById);
      if (jobCard.supervisorId) recipientIds.add(jobCard.supervisorId);
      if (jobCard.assignedTechnicianId) recipientIds.add(jobCard.assignedTechnicianId);
      const managers = await listEligibleManagersForBranch(jobCard.branchId);
      for (const m of managers.supervisors) recipientIds.add(m.id);

      const staffRecipients = await prisma.user.findMany({
        where: { id: { in: Array.from(recipientIds) } },
        select: { id: true, fullName: true, email: true },
      });

      for (const recipient of staffRecipients) {
        await sendEmail(
          recipient.email,
          `Vehicle checked out — Job Card ${jobCard.jobNumber}`,
          renderVehicleCheckedOutStaffEmail({
            recipientName: recipient.fullName,
            jobNumber: jobCard.jobNumber,
            customerName: jobCard.customer.fullName,
            collectedByName: realCollectedByName,
            jobCardUrl,
            logoUrl: portalLogoUrl,
            companyName: orgContext.companyName,
            branchName: orgContext.branchName,
            departmentName: orgContext.departmentName,
          }),
        );
      }
    } catch (err) {
      logFailure('Failed to send checkout email chain', id, status, err);
    }
  }

  await writeAuditLog({
    userId: user.id,
    action: isReworkTransition ? 'job_card.rework_requested' : 'job_card.status_updated',
    entityType: 'JobCard',
    entityId: id,
    metadata: isReworkTransition
      ? { from: priorStatus, to: status, reason: reworkReason?.trim() }
      : { from: priorStatus, to: status },
  });

  return result;
}

/** The supervisor (or Master Admin) confirms the Job Card is correctly
 * opened. Separate from `status`. */
export async function approveJobCard(jobCardId: string, notes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveJobCard');
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, jobNumber: true, approvalStatus: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const approver = await requireJobCardApprover(jobCard);

  // Compare-and-set on the decision this person saw (and on the supervisor):
  // a racing approve/reject or reassignment can't both land.
  claimed(await prisma.jobCard.updateMany({
    where: { id: jobCardId, approvalStatus: jobCard.approvalStatus, supervisorId: jobCard.supervisorId },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: approver.id,
      approvedAt: new Date(),
      rejectionReason: null,
      approvalNotes: notes?.trim() || null,
    },
  }));

  await writeAuditLog({
    userId: approver.id,
    action: 'job_card.approved',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: notes?.trim() ? { notes: notes.trim() } : undefined,
  });

  await notifyJobCardCreatorOfDecision({
    jobCardId,
    jobNumber: jobCard.jobNumber,
    decision: 'APPROVED',
    approverId: approver.id,
    notes,
  });
}

/** Returns the Job Card to its creator. `reason` is the short text shown on
 * the status badge; `notes` is optional detail. */
export async function rejectJobCard(jobCardId: string, reason: string, notes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('rejectJobCard');
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new WorkshopActionError('A reason is required to reject a Job Card.');
  }
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, jobNumber: true, approvalStatus: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const approver = await requireJobCardApprover(jobCard);

  claimed(await prisma.jobCard.updateMany({
    where: { id: jobCardId, approvalStatus: jobCard.approvalStatus, supervisorId: jobCard.supervisorId },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: approver.id,
      approvedAt: new Date(),
      rejectionReason: trimmedReason,
      approvalNotes: notes?.trim() || null,
      // Cleared so the creator can route the Job Card to another supervisor.
      // Who rejected it and why stays in the fields above and the audit log.
      supervisorId: null,
    },
  }));

  await writeAuditLog({
    userId: approver.id,
    action: 'job_card.rejected',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { reason: trimmedReason, notes: notes?.trim() || undefined },
  });

  await notifyJobCardCreatorOfDecision({
    jobCardId,
    jobNumber: jobCard.jobNumber,
    decision: 'REJECTED',
    approverId: approver.id,
    rejectionReason: trimmedReason,
    notes,
  });
}

/** Routes a Job Card to a different supervisor, typically after a
 * rejection. Only the creator or a Master Administrator may do this.
 * Resets approval to PENDING and clears the previous decision, as
 * assignTechnician() does for acceptance. */
export async function reassignSupervisor(jobCardId: string, newSupervisorId: string): Promise<void> {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      createdById: true,
      departmentId: true,
      jobNumber: true,
      supervisorId: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true } },
      complaints: { orderBy: { sequenceNumber: 'asc' } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  if (jobCard.createdById !== user.id && !(await currentUserIsMasterAdmin())) {
    return refuse('workshop.job_card.create', 'reassignSupervisor', 'Only this Job Card\'s creator can reassign the supervisor.');
  }
  if (!jobCard.departmentId) {
    throw new WorkshopActionError('This Job Card has no Workshop department set — cannot validate supervisor eligibility.');
  }
  if (!(await isEligibleSupervisor(newSupervisorId, jobCard.departmentId))) {
    throw new WorkshopActionError('The selected supervisor is not eligible for this Job Card\'s Workshop department.');
  }

  // Only if the supervisor is still the one this person saw; a decision or
  // another reassignment in the meantime wins.
  claimed(await prisma.jobCard.updateMany({
    where: { id: jobCardId, supervisorId: jobCard.supervisorId },
    data: {
      supervisorId: newSupervisorId,
      approvalStatus: 'PENDING',
      approvedById: null,
      approvedAt: null,
      rejectionReason: null,
      approvalNotes: null,
    },
  }));

  await writeAuditLog({
    userId: user.id,
    action: 'job_card.supervisor_reassigned',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { newSupervisorId },
  });

  try {
    const supervisor = await prisma.user.findUnique({
      where: { id: newSupervisorId },
      select: { fullName: true, email: true },
    });
    if (!supervisor) return;
    const department = await prisma.department.findUnique({
      where: { id: jobCard.departmentId },
      select: { name: true },
    });
    const orgContext = await getWorkshopOrgContext(department?.name);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      supervisor.email,
      `New Job Card ${jobCard.jobNumber} assigned to you`,
      renderSupervisorJobCardAssignedEmail({
        supervisorName: supervisor.fullName,
        jobNumber: jobCard.jobNumber,
        customerName: jobCard.customer.fullName,
        vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        complaints: jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => c.description),
        jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send supervisor reassignment email for Job Card', jobCard.jobNumber, err);
  }
}

/** Assigns a technician and resets acceptance to PENDING; a previous
 * technician's response doesn't carry over. Emails the technician (fail-soft). */
export async function assignTechnician(jobCardId: string, technicianId: string) {
  const actor = await requireUser();
  // Only this job's supervisor (Master Admin always) assigns its technician,
  // checked on the record itself.
  await authorizeOnJobCard('workshop.technician.assign', jobCardId, 'assignTechnician');
  const current = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, supervisorId: true } });
  if (!current) throw new WorkshopActionError('Job Card not found.');
  if (current.supervisorId !== actor.id && !(await currentUserIsMasterAdmin())) {
    return refuse('workshop.technician.assign', 'assignTechnician', 'Only the assigned supervisor can assign the technician on this Job Card.');
  }
  if (['CLOSED', 'CHECKED_OUT', 'CANCELLED'].includes(current.status)) throw new WorkshopActionError('This Job Card is finished — the technician can no longer change.');
  const org = (await prisma.user.findUnique({ where: { id: actor.id }, select: { organisationId: true } }))?.organisationId;
  const tech = await prisma.user.findFirst({ where: { id: technicianId, isActive: true, ...(org ? { organisationId: org } : {}), roles: { some: { role: { OR: [{ slug: { in: [...WORKSHOP_HANDS] } }, { isSuperAdmin: true }] } } } }, select: { id: true } });
  if (!tech) throw new WorkshopActionError('Choose an active technician (or supervisor) — only workshop staff can be assigned to a job.');
  // Compare-and-set: still the same supervisor, and not finished meanwhile.
  claimed(await prisma.jobCard.updateMany({
    where: { id: jobCardId, status: current.status, supervisorId: current.supervisorId },
    data: {
      assignedTechnicianId: technicianId,
      technicianAcceptanceStatus: 'PENDING',
      technicianRespondedAt: null,
      technicianRejectionReason: null,
    },
  }));
  const jobCard = await prisma.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    select: {
      id: true,
      jobNumber: true,
      customer: { select: { fullName: true } },
      supervisor: { select: { fullName: true } },
      department: { select: { name: true } },
      vehicle: { select: { make: true, model: true } },
      complaints: { orderBy: { sequenceNumber: 'asc' } },
    },
  });

  const assignedTo = await prisma.user.findUnique({ where: { id: technicianId }, select: { fullName: true } });
  await writeAuditLog({
    userId: actor.id,
    action: 'job_card.technician_assigned',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { jobNumber: jobCard.jobNumber, technicianId, technicianName: assignedTo?.fullName ?? null },
  });

  try {
    const technician = await prisma.user.findUnique({
      where: { id: technicianId },
      select: { fullName: true, email: true },
    });
    if (!technician) return jobCard;
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      technician.email,
      `You are assigned to Job Card ${jobCard.jobNumber}`,
      renderTechnicianJobCardAssignedEmail({
        technicianName: technician.fullName,
        jobNumber: jobCard.jobNumber,
        customerName: jobCard.customer.fullName,
        vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        complaints: jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => c.description),
        supervisorName: jobCard.supervisor?.fullName ?? 'Supervisor',
        jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCard.id}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send technician assignment email for Job Card', jobCard.jobNumber, err);
  }

  return jobCard;
}

/** Only the assigned technician, or a Master Administrator, may respond to an assignment. */
async function requireAssignedTechnician(jobCard: { assignedTechnicianId: string | null }): Promise<{ id: string }> {
  const user = await requireUser();
  if (jobCard.assignedTechnicianId === user.id) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  return refuse('workshop.job.work', 'requireAssignedTechnician', 'Only the assigned technician can respond to this assignment.');
}

/** Emails the supervisor when the technician accepts or rejects. */
async function notifySupervisorOfTechnicianResponse(params: {
  jobCardId: string;
  jobNumber: string;
  response: 'ACCEPTED' | 'REJECTED';
  technicianId: string;
  rejectionReason?: string;
}): Promise<void> {
  try {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: params.jobCardId },
      select: {
        customer: { select: { fullName: true } },
        supervisor: { select: { fullName: true, email: true } },
        department: { select: { name: true } },
      },
    });
    if (!jobCard?.supervisor) return;
    const technician = await prisma.user.findUnique({
      where: { id: params.technicianId },
      select: { fullName: true },
    });
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = portalBaseUrl();

    await sendEmail(
      jobCard.supervisor.email,
      params.response === 'ACCEPTED'
        ? `Assignment accepted on Job Card ${params.jobNumber}`
        : `Assignment declined on Job Card ${params.jobNumber}`,
      renderTechnicianResponseEmail({
        response: params.response,
        supervisorName: jobCard.supervisor.fullName,
        jobNumber: params.jobNumber,
        customerName: jobCard.customer.fullName,
        technicianName: technician?.fullName ?? 'Technician',
        rejectionReason: params.rejectionReason,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${params.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send technician response email to supervisor', params.jobNumber, err);
  }
}

export async function acceptTechnicianAssignment(jobCardId: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { assignedTechnicianId: true, jobNumber: true, technicianAcceptanceStatus: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const technician = await requireAssignedTechnician(jobCard);

  // Only if this person is still the assigned technician: if the supervisor
  // reassigned the job meanwhile, this must not mark the new technician as
  // having accepted.
  claimed(await prisma.jobCard.updateMany({
    where: { id: jobCardId, assignedTechnicianId: technician.id, technicianAcceptanceStatus: jobCard.technicianAcceptanceStatus },
    data: {
      technicianAcceptanceStatus: 'ACCEPTED',
      technicianRespondedAt: new Date(),
      technicianRejectionReason: null,
    },
  }), 'This assignment changed just now — refresh the page to see who it is assigned to.');

  await writeAuditLog({
    userId: technician.id,
    action: 'assignment.accepted',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  await notifySupervisorOfTechnicianResponse({
    jobCardId,
    jobNumber: jobCard.jobNumber,
    response: 'ACCEPTED',
    technicianId: technician.id,
  });
}

export async function rejectTechnicianAssignment(jobCardId: string, reason: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new WorkshopActionError('A reason is required to reject an assignment.');
  }
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { assignedTechnicianId: true, jobNumber: true, technicianAcceptanceStatus: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const technician = await requireAssignedTechnician(jobCard);

  // Only if this person is still the assigned technician; never unassign
  // someone the supervisor assigned a moment ago.
  claimed(await prisma.jobCard.updateMany({
    where: { id: jobCardId, assignedTechnicianId: technician.id, technicianAcceptanceStatus: jobCard.technicianAcceptanceStatus },
    data: {
      // Back to unassigned so the supervisor can pick someone else. The
      // rejection (who, when, why) is kept in the audit log.
      assignedTechnicianId: null,
      technicianAcceptanceStatus: null,
      technicianRespondedAt: null,
      technicianRejectionReason: null,
    },
  }), 'This assignment changed just now — refresh the page to see who it is assigned to.');

  await writeAuditLog({
    userId: technician.id,
    action: 'assignment.rejected',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { reason: trimmedReason },
  });

  await notifySupervisorOfTechnicianResponse({
    jobCardId,
    jobNumber: jobCard.jobNumber,
    response: 'REJECTED',
    technicianId: technician.id,
    rejectionReason: trimmedReason,
  });
}

/** People who can be assigned to a Job Card, with their role names shown. */
const WORKSHOP_HANDS = ['technician', 'workshop-supervisor'] as const;

export async function listTechnicianCandidates() {
  await requireUser();
  return prisma.user.findMany({
    // Technicians and supervisors (a supervisor can do anything a technician can).
    where: { isActive: true, ...(await orgWhere()), roles: { some: { role: { slug: { in: [...WORKSHOP_HANDS] } } } } },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

export async function getWorkshopDashboardCounts() {
  await requireUser();
  // Uses the shared definitions in lib/custody.ts (the same "active" and
  // "still inside" as the custody pages and Security dashboard) and the same
  // reach (a branch-scoped person counts their branch).
  const reach = await reachWhere('workshop.job_card.view');
  const [activeJobCards, totalCustomers, totalVehicles, inWorkshop, servicesInWorkshop] = await Promise.all([
    prisma.jobCard.count({ where: { ...reach, ...jobCardActive() } }),
    prisma.customer.count({ where: await orgWhere() }),
    prisma.customerVehicle.count({ where: { customer: await orgWhere() } }),
    prisma.jobCard.count({ where: { ...reach, ...jobCardInside() } }),
    prisma.vehicleService.count({ where: { ...reach, ...serviceInside() } }),
  ]);
  return { activeJobCards, totalCustomers, totalVehicles, inWorkshop, servicesInWorkshop };
}

// ---------------------------------------------------------------------------
// ESTIMATES: one per Job Card, with line items of type Store Part, External
// Part, External Job, Internal Job, Labour or Sundry.
//
// DRAFT: technician and supervisor build it; prices may be blank.
// SUBMITTED: every line must be priced (checked on submit).
// APPROVED: supervisor sign-off. MANAGER_APPROVED: the Manager's sign-off,
// after which the creator sends it to the customer.
// ---------------------------------------------------------------------------

export type EstimateLineItemType = 'STORE_PART' | 'EXTERNAL_PART' | 'EXTERNAL_JOB' | 'INTERNAL_JOB' | 'LABOUR' | 'SUNDRY';

/** Line type names for server-side error messages. The UI labels live in
 * the page component and can't be imported into a 'use server' file. */
const ESTIMATE_LINE_TYPE_DISPLAY: Record<EstimateLineItemType, string> = {
  STORE_PART: 'Store Part',
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

export type EstimateLineItemInput = {
  type: EstimateLineItemType;
  description: string;
  quantity: number;
  /** Optional while DRAFT; required by submitEstimateForValidation(). */
  unitPrice?: number;
  /** STORE_PART only: the generic part type requested (e.g. "Fuel Filter"),
   * which Store later matches to a catalogue Part. `description` is filled
   * from the type's name. */
  partTypeId?: string;
  /** Non-STORE_PART lines only. A Store Part's unit is set when Store matches it. */
  unitOfMeasure?: string;
};

/** Who may add to or edit an estimate: the assigned supervisor, the assigned
 * technician, or a Master Administrator. Every line records who entered or
 * last changed it. */
async function requireEstimateContributor(jobCard: {
  supervisorId: string | null;
  assignedTechnicianId: string | null;
}): Promise<{ id: string }> {
  const user = await requireUser();
  if (jobCard.supervisorId === user.id || jobCard.assignedTechnicianId === user.id) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  return refuse('workshop.estimate.edit', 'requireEstimateContributor', 
    'Only the assigned supervisor or the assigned technician can work on this estimate.',
  );
}

/** Who may set the price on a line type. A technician may price only what
 * they sourced outside (EXTERNAL_PART, EXTERNAL_JOB); Store parts, labour
 * and sundry are priced by the supervisor. Checked only when a price is
 * being set. */
async function requirePricingAuthority(
  type: EstimateLineItemType,
  jobCard: { supervisorId: string | null; assignedTechnicianId: string | null },
  userId: string,
): Promise<void> {
  if (await currentUserIsMasterAdmin()) return;
  if (userId === jobCard.supervisorId) return;
  const technicianPriceableTypes: EstimateLineItemType[] = ['EXTERNAL_PART', 'EXTERNAL_JOB'];
  if (userId === jobCard.assignedTechnicianId && technicianPriceableTypes.includes(type)) return;
  return refuse('workshop.estimate.edit', 'requirePricingAuthority', 
    type === 'EXTERNAL_PART' || type === 'EXTERNAL_JOB'
      ? 'Only the assigned technician or supervisor can set a price for an external part or job.'
      : 'Only the assigned supervisor can set a price for this line — the technician can add the description and quantity, but not the price.',
  );
}

export async function getJobCardEstimate(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getJobCardEstimate');
  return prisma.estimate.findUnique({
    where: { jobCardId },
    include: {
      lineItems: {
        orderBy: { createdAt: 'asc' },
        include: {
          enteredBy: { select: { fullName: true } },
          partType: { select: { name: true, category: { select: { name: true } } } },
          matchedPart: { select: { name: true, sellingPrice: true, baseUnitOfMeasure: true } },
        },
      },
      approvedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      matchingRequestedBy: { select: { fullName: true } },
    },
  });
}

/** Adds a line, creating the estimate on first use. Only on a Job Card its
 * supervisor has approved. `amount` is always computed here from
 * quantity × unitPrice (null while the price is blank), never taken from
 * the client. */
export async function addEstimateLineItem(jobCardId: string, input: EstimateLineItemInput): Promise<void> {
  // A Store Part line's description comes from its PartType below, not from
  // the client. Other line types need a non-empty description.
  let description = input.description.trim();
  if (input.type !== 'STORE_PART' && !description) {
    throw new WorkshopActionError('A description is required for this line item.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new WorkshopActionError('Quantity must be a positive number.');
  }
  if (input.unitPrice !== undefined && (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)) {
    throw new WorkshopActionError('Unit price must be zero or a positive number.');
  }

  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, assignedTechnicianId: true, jobNumber: true, approvalStatus: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  if (jobCard.approvalStatus !== 'APPROVED') {
    throw new WorkshopActionError('This Job Card must be approved by its supervisor before an estimate can be started.');
  }
  const contributor = await requireEstimateContributor(jobCard);

  const estimate = await prisma.estimate.upsert({
    where: { jobCardId },
    update: {},
    create: { jobCardId, createdById: contributor.id },
    select: { id: true, status: true, lineItems: { select: { type: true } } },
  });
  if (estimate.status !== 'DRAFT') {
    throw new WorkshopActionError('This estimate has already been submitted and can no longer have lines added — edit an existing line instead.');
  }
  // Only Sundry is limited to one line; Labour can have several (e.g.
  // "Labour for Service" and "Labour for Brake").
  const cappedTypes: EstimateLineItemType[] = ['SUNDRY'];
  if (cappedTypes.includes(input.type) && estimate.lineItems.some((li: { type: string }) => li.type === input.type)) {
    throw new WorkshopActionError(
      `A ${ESTIMATE_LINE_TYPE_DISPLAY[input.type]} line already exists on this estimate — edit it instead of adding another.`,
    );
  }
  if (input.unitPrice !== undefined) {
    // A Store Part price only comes from Store matching
    // (matchEstimateStorePartLine), never typed here, even by a supervisor.
    if (input.type === 'STORE_PART') {
      throw new WorkshopActionError('A Store Part line is priced when Store matches it to a catalogue part, not typed in.');
    }
    await requirePricingAuthority(input.type, jobCard, contributor.id);
  }
  // The part type can't be filled in later the way a price can, so it is
  // required when the line is added.
  if (input.type === 'STORE_PART' && !input.partTypeId) {
    throw new WorkshopActionError('A Store Part line must specify which Part Type is needed.');
  }
  if (input.type === 'STORE_PART' && input.partTypeId) {
    // Description from the PartType, not from the client.
    const partType = await prisma.partType.findUnique({ where: { id: input.partTypeId }, select: { name: true } });
    if (!partType) {
      throw new WorkshopActionError('That Part Type no longer exists.');
    }
    description = partType.name;
  }
  if (input.type === 'STORE_PART' && input.unitOfMeasure) {
    // A Store Part's unit comes from the matched part, never from here.
    throw new WorkshopActionError('A Store Part line\'s unit is set automatically once Store matches it, not entered directly.');
  }

  const amount = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;

  await withEstimateUnchanged(estimate.id, 'DRAFT', (tx) => tx.estimateLineItem.create({
    data: {
      estimateId: estimate.id,
      type: input.type,
      description,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      amount,
      enteredById: contributor.id,
      partTypeId: input.type === 'STORE_PART' ? input.partTypeId : null,
      unitOfMeasure: input.type === 'STORE_PART' ? null : input.unitOfMeasure?.trim() || null,
    },
  }));

  await writeAuditLog({
    userId: contributor.id,
    action: 'estimate.line_item_added',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { type: input.type, description, quantity: input.quantity, unitPrice: input.unitPrice, amount },
  });
}

export type EstimateLineItemUpdateInput = {
  description: string;
  quantity: number;
  unitPrice?: number;
  /** Non-STORE_PART lines only (as in EstimateLineItemInput). */
  unitOfMeasure?: string;
};

/** Edits a line's description, quantity and/or price. Allowed while DRAFT or
 * SUBMITTED (the supervisor may correct a submitted estimate); locked once
 * approved. */
export async function updateEstimateLineItem(lineItemId: string, input: EstimateLineItemUpdateInput): Promise<void> {
  const description = input.description.trim();
  if (!description) {
    throw new WorkshopActionError('A description is required for this line item.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new WorkshopActionError('Quantity must be a positive number.');
  }
  if (input.unitPrice !== undefined && (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)) {
    throw new WorkshopActionError('Unit price must be zero or a positive number.');
  }

  const lineItem = await prisma.estimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      type: true,
      estimateId: true,
      matchedPartId: true,
      matchedPart: { select: { sellingPrice: true, name: true } },
      estimate: {
        select: {
          jobCardId: true,
          status: true,
          jobCard: { select: { supervisorId: true, assignedTechnicianId: true } },
        },
      },
    },
  });
  if (!lineItem) {
    throw new WorkshopActionError('Estimate line item not found.');
  }
  // Once the supervisor has approved it, the Manager decides on exactly what
  // the supervisor saw; no edits in between (same rule as Vehicle Service).
  if (lineItem.estimate.status === 'MANAGER_APPROVED' || lineItem.estimate.status === 'APPROVED') {
    throw new WorkshopActionError(lineItem.estimate.status === 'APPROVED'
      ? 'This estimate has been approved by the supervisor and is waiting for the Manager — it can no longer be edited. Ask the Manager to send it back if it needs changing.'
      : 'This estimate has already been approved by the manager and can no longer be edited.');
  }
  const editor = await requireEstimateContributor(lineItem.estimate.jobCard);
  if (input.unitPrice !== undefined) {
    if (lineItem.type === 'STORE_PART') {
      throw new WorkshopActionError('A Store Part line is priced when Store matches it to a catalogue part, not typed in.');
    }
    await requirePricingAuthority(lineItem.type, lineItem.estimate.jobCard, editor.id);
  }
  if (input.unitOfMeasure !== undefined && lineItem.type === 'STORE_PART') {
    throw new WorkshopActionError('A Store Part line\'s unit is set automatically once Store matches it, not entered directly.');
  }

  // While the estimate is open, a matched Store Part line follows the part's
  // current selling price; changing the quantity reprices without re-matching.
  let unitPrice = input.unitPrice;
  let amount: number | null = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;
  if (lineItem.type === 'STORE_PART' && lineItem.matchedPartId) {
    if (lineItem.matchedPart?.sellingPrice === null || lineItem.matchedPart?.sellingPrice === undefined) {
      throw new WorkshopActionError(`${lineItem.matchedPart?.name ?? 'This Part'} no longer has a selling price set — set one before this line can be updated.`);
    }
    unitPrice = Number(lineItem.matchedPart.sellingPrice);
    amount = Math.round(input.quantity * unitPrice * 100) / 100;
  }

  await withEstimateUnchanged(lineItem.estimateId, lineItem.estimate.status, (tx) => tx.estimateLineItem.update({
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
    action: 'estimate.line_item_updated',
    entityType: 'JobCard',
    entityId: lineItem.estimate.jobCardId,
    metadata: { type: lineItem.type, description, quantity: input.quantity, unitPrice, amount },
  });
}

/** Whoever entered a line, the assigned supervisor, or a Master
 * Administrator may remove it. Locked once approved. */
export async function deleteEstimateLineItem(lineItemId: string): Promise<void> {
  const lineItem = await prisma.estimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      enteredById: true,
      description: true,
      estimateId: true,
      estimate: {
        select: {
          jobCardId: true,
          status: true,
          jobCard: { select: { supervisorId: true } },
        },
      },
    },
  });
  if (!lineItem) {
    throw new WorkshopActionError('Estimate line item not found.');
  }
  // Once the supervisor has approved it, the Manager decides on exactly what
  // the supervisor saw; no edits in between (same rule as Vehicle Service).
  if (lineItem.estimate.status === 'MANAGER_APPROVED' || lineItem.estimate.status === 'APPROVED') {
    throw new WorkshopActionError(lineItem.estimate.status === 'APPROVED'
      ? 'This estimate has been approved by the supervisor and is waiting for the Manager — it can no longer be edited. Ask the Manager to send it back if it needs changing.'
      : 'This estimate has already been approved by the manager and can no longer be edited.');
  }
  const user = await requireUser();
  const isOwnEntry = lineItem.enteredById === user.id;
  const isSupervisor = lineItem.estimate.jobCard.supervisorId === user.id;
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isOwnEntry && !isSupervisor && !isMasterAdmin) {
    return refuse('workshop.estimate.edit', 'deleteEstimateLineItem', 'Only whoever entered this line or the assigned supervisor can remove it.');
  }

  await withEstimateUnchanged(lineItem.estimateId, lineItem.estimate.status, (tx) => tx.estimateLineItem.delete({ where: { id: lineItemId } }));

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.line_item_removed',
    entityType: 'JobCard',
    entityId: lineItem.estimate.jobCardId,
    metadata: { description: lineItem.description },
  });
}

/** An informal "please take a look" email while the estimate is being
 * built. Unlike submitEstimateForValidation() it never changes status.
 * Audited even if the email fails. */
async function sendEstimateNudge(params: {
  jobCardId: string;
  fromRole: 'supervisor' | 'technician';
  fromUserId: string;
  toUserId: string;
  note?: string;
}): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: params.jobCardId },
    select: {
      jobNumber: true,
      customer: { select: { fullName: true } },
      department: { select: { name: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }

  await writeAuditLog({
    userId: params.fromUserId,
    action: params.fromRole === 'supervisor' ? 'estimate.nudge_to_technician' : 'estimate.nudge_to_supervisor',
    entityType: 'JobCard',
    entityId: params.jobCardId,
    metadata: params.note?.trim() ? { notes: params.note.trim() } : undefined,
  });

  try {
    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.fromUserId }, select: { fullName: true } }),
      prisma.user.findUnique({ where: { id: params.toUserId }, select: { fullName: true, email: true } }),
    ]);
    if (!toUser) return;
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      toUser.email,
      `Please look at the estimate — Job Card ${jobCard.jobNumber}`,
      renderEstimateNudgeEmail({
        recipientName: toUser.fullName,
        fromName: fromUser?.fullName ?? 'A team member',
        fromRole: params.fromRole,
        jobNumber: jobCard.jobNumber,
        customerName: jobCard.customer.fullName,
        note: params.note,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${params.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send estimate nudge email', params.jobCardId, err);
  }
}

/** The technician nudges the supervisor to check the estimate. */
export async function notifySupervisorAboutEstimate(jobCardId: string, note?: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, assignedTechnicianId: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (user.id !== jobCard.assignedTechnicianId && !isMasterAdmin) {
    return refuse('workshop.estimate.edit', 'notifySupervisorAboutEstimate', 'Only the assigned technician can notify the supervisor about this estimate.');
  }
  if (!jobCard.supervisorId) {
    throw new WorkshopActionError('This Job Card has no supervisor assigned yet.');
  }
  await sendEstimateNudge({
    jobCardId,
    fromRole: 'technician',
    fromUserId: user.id,
    toUserId: jobCard.supervisorId,
    note,
  });
}

/** The supervisor nudges the technician to review or price the estimate. */
export async function notifyTechnicianAboutEstimate(jobCardId: string, note?: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, assignedTechnicianId: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const user = await requireJobCardApprover(jobCard);
  if (!jobCard.assignedTechnicianId) {
    throw new WorkshopActionError('This Job Card has no technician assigned yet.');
  }
  await sendEstimateNudge({
    jobCardId,
    fromRole: 'supervisor',
    fromUserId: user.id,
    toUserId: jobCard.assignedTechnicianId,
    note,
  });
}

/** Sends the estimate to the supervisor for validation. Every line must be
 * priced from this point. */
export async function submitEstimateForValidation(jobCardId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { jobCardId },
    select: {
      id: true,
      status: true,
      jobCard: {
        select: {
          jobNumber: true,
          supervisorId: true,
          assignedTechnicianId: true,
          department: { select: { name: true } },
          customer: { select: { fullName: true } },
          supervisor: { select: { fullName: true, email: true } },
        },
      },
      lineItems: { select: { id: true, type: true, matchedPartId: true, quantity: true, unitPrice: true, amount: true, billTo: true, description: true, matchedPart: { select: { sellingPrice: true } } } },
    },
  });
  if (!estimate) {
    throw new WorkshopActionError('This Job Card has no estimate yet.');
  }
  if (estimate.status !== 'DRAFT') {
    throw new WorkshopActionError('This estimate has already been submitted.');
  }
  if (estimate.lineItems.length === 0) {
    throw new WorkshopActionError('Add at least one line item before submitting the estimate.');
  }
  // Who may submit is checked before anything is written.
  const user = await requireEstimateContributor(estimate.jobCard);

  // Read, reprice, check and submit as one step with the estimate locked: a
  // line added or changed at the same moment either lands before (and is
  // checked here) or is refused because the estimate is no longer a draft.
  await withEstimateUnchanged(estimate.id, 'DRAFT', async (tx) => {
    const lines = await tx.estimateLineItem.findMany({
      where: { estimateId: estimate.id },
      select: { id: true, type: true, matchedPartId: true, quantity: true, unitPrice: true, amount: true, description: true, matchedPart: { select: { sellingPrice: true } } },
    });
    if (lines.length === 0) {
      throw new WorkshopActionError('Add at least one line item before submitting the estimate.');
    }
    // A matched Store Part line has tracked the current selling price while
    // in draft; submission fixes that price on the estimate.
    for (const li of lines as (typeof lines)[number][]) {
      if (li.type === 'STORE_PART' && li.matchedPartId && li.matchedPart?.sellingPrice !== null && li.matchedPart?.sellingPrice !== undefined) {
        const liveUnitPrice = Number(li.matchedPart.sellingPrice);
        const liveAmount = Math.round(li.quantity * liveUnitPrice * 100) / 100;
        if (Number(li.unitPrice ?? -1) !== liveUnitPrice || Number(li.amount ?? -1) !== liveAmount) {
          await tx.estimateLineItem.update({ where: { id: li.id }, data: { unitPrice: liveUnitPrice, amount: liveAmount } });
        }
        // Also corrected in memory for the "missing prices" check below.
        (li as { unitPrice: unknown }).unitPrice = liveUnitPrice;
      }
    }
    const missingPricesOn = lines.filter((li: { unitPrice: unknown }) => li.unitPrice === null);
    if (missingPricesOn.length > 0) {
      throw new WorkshopActionError(
        `Every line needs a price before submitting — missing on: ${missingPricesOn.map((li: { description: string }) => li.description).join(', ')}.`,
      );
    }
    claimed(await tx.estimate.updateMany({
      where: { id: estimate.id, status: 'DRAFT' },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    }), 'This estimate was just submitted by someone else — refresh the page.');
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.submitted',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Notify the supervisor (fail-soft).
  try {
    if (!estimate.jobCard.supervisor) return;
    // Independent lookups for the email — run together.
    const [submitter, orgContext] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }), getWorkshopOrgContext(estimate.jobCard.department?.name)]);
    const portalUrl = portalBaseUrl();
    const total = customerTotal(estimate.lineItems);
    await sendEmail(
      estimate.jobCard.supervisor.email,
      `Estimate for Job Card ${estimate.jobCard.jobNumber} needs your validation`,
      renderEstimateSubmittedEmail({
        supervisorName: estimate.jobCard.supervisor.fullName,
        jobNumber: estimate.jobCard.jobNumber,
        customerName: estimate.jobCard.customer.fullName,
        submittedByName: submitter?.fullName ?? 'A team member',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send estimate-submitted email to supervisor', jobCardId, err);
  }
}

/** Workshop Managers for the branch (a Manager covers both Passenger and
 * Commercial departments, so eligibility is by branch). Falls back to
 * Master Admins like the supervisor list. */
async function listEligibleManagersForBranchUncached(branchId: string): Promise<EligibleSupervisorResult> {
  await requireUser();
  return managersForBranchShared(branchId);
}

/** Branch managers rarely change, so the list is cached across requests for
 * up to 60 seconds. Only ids, names and emails, which staff already see on
 * the approval screens. */
const managersForBranchShared = unstable_cache(async (branchId: string): Promise<EligibleSupervisorResult> => {
  const branchManagers = await prisma.user.findMany({
    where: {
      branchId,
      isActive: true,
      roles: { some: { role: { slug: 'workshop-manager' } } },
    },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  if (branchManagers.length > 0) {
    return { supervisors: branchManagers, usingFallback: false };
  }
  const masterAdmins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { isSuperAdmin: true } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  return { supervisors: masterAdmins, usingFallback: true };
}, ['branch-managers-v1'], { revalidate: 60, tags: ['org-structure'] });

/** There is no single assigned manager: any eligible manager for the branch
 * (or a Master Admin) may act, and the first to act completes the step. */
type ManagerPermission = 'workshop.close.approve' | 'workshop.estimate.final_approve' | 'store.prs.approve_hod' | 'procurement.epr.approve';

export async function requireEligibleManager(branchId: string, key: ManagerPermission = 'workshop.close.approve'): Promise<{ id: string }> {
  const user = await requireUser();
  // Authorization Catalogue (Workshop Manager by default, plus Roles-page
  // grants; Master Admin always), checked against the record's branch.
  await authorize(key, { branchId, homeBranch: true }, `manager:${key}`, 'Only a Workshop Manager for this branch can approve this.');
  return user;
}

/** The assigned supervisor (or a Master Admin) approves a submitted
 * estimate; it then goes to the branch's Managers. */
export async function approveEstimate(jobCardId: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveEstimate');
  const estimate = await prisma.estimate.findUnique({
    where: { jobCardId },
    select: {
      id: true,
      status: true,
      lineItems: { select: { type: true, matchedPartId: true, description: true } },
      jobCard: {
        select: {
          supervisorId: true,
          branchId: true,
          jobNumber: true,
          customer: { select: { fullName: true } },
          branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (!estimate) {
    throw new WorkshopActionError('This Job Card has no estimate yet.');
  }
  if (estimate.status !== 'SUBMITTED') {
    throw new WorkshopActionError('This estimate has not been submitted for validation yet.');
  }
  // Every Store Part line must be matched (and so priced by Store) before
  // supervisor sign-off.
  const unmatchedStoreParts = estimate.lineItems.filter(
    (li: (typeof estimate.lineItems)[number]) => li.type === 'STORE_PART' && !li.matchedPartId,
  );
  if (unmatchedStoreParts.length > 0) {
    throw new WorkshopActionError(
      `${pluralize(unmatchedStoreParts.length, 'Store Part line')} still ${unmatchedStoreParts.length === 1 ? 'needs' : 'need'} to be matched by Store before this estimate can be approved.`,
    );
  }
  const user = await requireJobCardApprover(estimate.jobCard);
  await authorize('workshop.estimate.approve', { branchId: estimate.jobCard.branchId, assigneeIds: [estimate.jobCard.supervisorId] }, 'approveEstimate');

  claimed(await prisma.estimate.updateMany({
    where: { id: estimate.id, status: 'SUBMITTED' },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  }), 'This estimate was just approved or changed by someone else — refresh the page.');

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.approved',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Notify the branch managers after the approval is committed (fail-soft).
  try {
    const managers = await listEligibleManagersForBranch(estimate.jobCard.branchId);
    if (managers.supervisors.length === 0) return;
    const approver = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const lineItems = await prisma.estimateLineItem.findMany({ where: { estimateId: estimate.id }, select: { amount: true, billTo: true } });
    const total = customerTotal(lineItems);
    const portalUrl = portalBaseUrl();
    const companyName = estimate.jobCard.branch.businessUnit.organisation.name;
    const branchName = estimate.jobCard.branch.name;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Estimate for Job Card ${estimate.jobCard.jobNumber} needs your approval`,
        renderEstimateReadyForManagerEmail({
          managerName: manager.fullName,
          jobNumber: estimate.jobCard.jobNumber,
          customerName: estimate.jobCard.customer.fullName,
          approvedByName: approver?.fullName ?? 'The supervisor',
          totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName,
          branchName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send estimate-ready-for-manager email', jobCardId, err);
  }
}

/** The Workshop Manager's sign-off. The Job Card's creator is then told the
 * estimate is ready; sending it to the customer is a separate, explicit
 * step (notifyCustomerOfApprovedEstimate). */
export async function approveEstimateAsManager(jobCardId: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveEstimateAsManager');
  const estimate = await prisma.estimate.findUnique({
    where: { jobCardId },
    select: {
      id: true,
      status: true,
      approvedById: true,
      jobCard: {
        select: {
          branchId: true,
          jobNumber: true,
          createdBy: { select: { fullName: true, email: true } },
          customer: { select: { fullName: true } },
          branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (!estimate) {
    throw new WorkshopActionError('This Job Card has no estimate yet.');
  }
  if (estimate.status !== 'APPROVED') {
    throw new WorkshopActionError('This estimate has not been approved by its supervisor yet.');
  }
  const user = await requireEligibleManager(estimate.jobCard.branchId, 'workshop.estimate.final_approve');
  await authorize('workshop.estimate.final_approve', { branchId: estimate.jobCard.branchId }, 'approveEstimateAsManager');
  // Segregation of duties: the Manager's approval must come from someone other
  // than the supervisor who approved it.
  if (estimate.approvedById === user.id && !(await currentUserIsMasterAdmin())) {
    throw new WorkshopActionError('You approved this estimate as its supervisor — another Manager gives the final approval.');
  }

  claimed(await prisma.estimate.updateMany({
    where: { id: estimate.id, status: 'APPROVED' },
    data: { status: 'MANAGER_APPROVED', managerApprovedAt: new Date(), managerApprovedById: user.id },
  }), 'This estimate was just approved or changed by someone else — refresh the page.');

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.manager_approved',
    entityType: 'JobCard',
    entityId: jobCardId,
  });
  // Enyo: score its prediction against the approved lines (once; errors only logged).
  scheduleResolution({ kind: 'JOB_CARD', id: jobCardId });

  // Tell the Job Card's creator; they decide when the customer is notified
  // (notifyCustomerOfApprovedEstimate). Fail-soft.
  try {
    const manager = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const lineItems = await prisma.estimateLineItem.findMany({ where: { estimateId: estimate.id }, select: { amount: true, billTo: true } });
    const total = customerTotal(lineItems);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      estimate.jobCard.createdBy.email,
      `Estimate for Job Card ${estimate.jobCard.jobNumber} approved by manager — ready to send`,
      renderEstimateReadyForCustomerNotificationEmail({
        recipientName: estimate.jobCard.createdBy.fullName,
        jobNumber: estimate.jobCard.jobNumber,
        customerName: estimate.jobCard.customer.fullName,
        approvedByManagerName: manager?.fullName ?? 'The manager',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: estimate.jobCard.branch.businessUnit.organisation.name,
        branchName: estimate.jobCard.branch.name,
      }),
    );
  } catch (err) {
    logFailure('Failed to send estimate-ready-for-customer-notification email', jobCardId, err);
  }
}

/**
 * The Manager sends a supervisor-approved estimate back with a reason. It
 * returns to SUBMITTED for edits and needs supervisor approval again, so the
 * Manager always decides on what the supervisor last approved.
 */
export async function returnEstimateForChanges(jobCardId: string, reason: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('returnEstimateForChanges');
  const why = reason.trim().slice(0, 500);
  if (why.length < 3) throw new WorkshopActionError('Say what needs to change.');
  const estimate = await prisma.estimate.findUnique({ where: { jobCardId }, select: { id: true, status: true, jobCard: { select: { branchId: true, jobNumber: true, supervisorId: true, assignedTechnicianId: true } } } });
  if (!estimate) throw new WorkshopActionError('This Job Card has no estimate yet.');
  if (estimate.status !== 'APPROVED') throw new WorkshopActionError('Only an estimate waiting for the Manager can be sent back.');
  const user = await requireEligibleManager(estimate.jobCard.branchId, 'workshop.estimate.final_approve');
  await authorize('workshop.estimate.final_approve', { branchId: estimate.jobCard.branchId }, 'returnEstimateForChanges');
  claimed(await prisma.estimate.updateMany({
    where: { id: estimate.id, status: 'APPROVED' },
    data: { status: 'SUBMITTED', approvedAt: null, approvedById: null },
  }), 'This estimate was just approved or changed by someone else — refresh the page.');
  await writeAuditLog({ userId: user.id, action: 'estimate.returned_for_changes', entityType: 'JobCard', entityId: jobCardId, metadata: { reason: why } });
}

/** Sends the Manager-approved estimate to the customer. Only the Job Card's
 * creator or a Master Admin, and only after Manager approval. Not automatic:
 * approval means the numbers are right, not that the customer should be told yet. */
export async function notifyCustomerOfApprovedEstimate(jobCardId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { jobCardId },
    select: {
      id: true,
      status: true,
      customerNotifiedAt: true,
      jobCard: {
        select: {
          createdById: true,
          jobNumber: true,
          vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } },
          customer: { select: { fullName: true, email: true, address: true } },
          branch: { select: { id: true, name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: { select: { name: true } } } } } },
        },
      },
      lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true, billTo: true, coveringWarranty: { select: { warrantyNumber: true } } } },
    },
  });
  if (!estimate) {
    throw new WorkshopActionError('This Job Card has no estimate yet.');
  }
  if (estimate.status !== 'MANAGER_APPROVED') {
    throw new WorkshopActionError('This estimate has not been approved by the manager yet.');
  }
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (user.id !== estimate.jobCard.createdById && !isMasterAdmin) {
    return refuse('workshop.customer.notify', 'notifyCustomerOfApprovedEstimate', 'Only whoever created this Job Card can notify the customer.');
  }
  if (estimate.customerNotifiedAt) {
    throw new WorkshopActionError('The customer has already been notified about this estimate.');
  }

  await prisma.$transaction(async (tx) => {
    // Exactly once: a second click (or a second person) finds it already
    // notified and stops, so the customer never gets the estimate twice.
    claimed(await tx.estimate.updateMany({
      where: { id: estimate.id, status: 'MANAGER_APPROVED', customerNotifiedAt: null },
      data: { customerNotifiedAt: new Date(), customerNotifiedById: user.id },
    }), 'The customer was just notified about this estimate by someone else — refresh the page.');
    // Notifying the customer moves the Job Card to awaiting approval, unless it
    // was cancelled or finished meanwhile.
    claimed(await tx.jobCard.updateMany({
      where: { id: jobCardId, status: { notIn: [JobCardStatus.CANCELLED, JobCardStatus.CLOSED, JobCardStatus.CHECKED_OUT] } },
      data: { status: JobCardStatus.AWAITING_CUSTOMER_APPROVAL },
    }), 'This Job Card was just cancelled or closed — refresh the page.');
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.customer_notified',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  try {
    // The customer sees three figures: Parts & Services (all parts and work
    // types combined), Labour and Sundry. Never the internal line types.
    const servicesTypes = new Set(['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB']);
    let servicesTotal = 0;
    let labourTotal = 0;
    let sundryTotal = 0;
    for (const li of estimate.lineItems as { type: string; amount: unknown; billTo?: string | null }[]) {
      // Covered lines (warranty, goodwill, internal) are never charged.
      if (!isCustomerLine(li)) continue;
      const amount = Number(li.amount ?? 0);
      if (li.type === 'LABOUR') labourTotal += amount;
      else if (li.type === 'SUNDRY') sundryTotal += amount;
      else if (servicesTypes.has(li.type)) servicesTotal += amount;
    }
    const total = servicesTotal + labourTotal + sundryTotal;
    const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
    const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    // Helvetica (the PDF default) has no ₦ glyph, and embedding a font would make
    // every send depend on fetching it, so the PDF uses "NGN".
    const formatNairaForPdf = (value: number) => `NGN ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const websiteUrl = websiteBaseUrl();
    const vehicleDescription = [estimate.jobCard.vehicle.make, estimate.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const paymentRemarkSuggestion = [estimate.jobCard.jobNumber, vehicleDescription, estimate.jobCard.vehicle.plateNumber]
      .filter(Boolean)
      .join(' ');

    const rawLineItems = estimate.lineItems as { description: string; quantity: number; unitOfMeasure: string | null; amount: unknown; billTo?: string | null; coveringWarranty?: { warrantyNumber: string } | null }[];

    await sendEmail(
      estimate.jobCard.customer.email,
      `Estimate ready for ${estimate.jobCard.jobNumber} — ${[vehicleDescription, estimate.jobCard.vehicle.plateNumber ? `(${estimate.jobCard.vehicle.plateNumber})` : ''].filter(Boolean).join(' ')}`,
      renderCustomerEstimateApprovedEmail({
        customerName: estimate.jobCard.customer.fullName,
        jobNumber: estimate.jobCard.jobNumber,
        vehicleDescription,
        plateNumber: estimate.jobCard.vehicle.plateNumber,
        lineItems: rawLineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitOfMeasure: li.unitOfMeasure,
          amount: isCustomerLine(li) ? formatNaira(Number(li.amount ?? 0)) : coveredLabel(li.billTo, li.coveringWarranty?.warrantyNumber),
        })),
        servicesSubtotal: servicesTotal > 0 ? formatNaira(servicesTotal) : undefined,
        labourSubtotal: labourTotal > 0 ? formatNaira(labourTotal) : undefined,
        sundrySubtotal: sundryTotal > 0 ? formatNaira(sundryTotal) : undefined,
        totalAmount: formatNaira(total),
        minimumDepositAmount: formatNaira(minimumDeposit),
        depositPercent: Math.round(MINIMUM_DEPOSIT_FRACTION * 100),
        ...(await bankDetailsFor(estimate.jobCard.branch.id)),
        paymentRemarkSuggestion,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: estimate.jobCard.branch.businessUnit.organisation.name,
        branchName: estimate.jobCard.branch.name,
      }),
      await (async () => {
        // PDF attachment, using the same Organisation record as the print letterhead.
        try {
          const organisation = await getOrganisation();
          if (!organisation) return undefined;
          const portalUrl = portalBaseUrl();
          const pdfBuffer = await renderToBuffer(
            EstimatePdf({
              organisation: {
                name: organisation.name,
                legalName: organisation.legalName,
                hqAddress: organisation.hqAddress,
                poBox: organisation.poBox,
                rcNumber: organisation.rcNumber,
                hotlines: organisation.hotlines,
                website: organisation.website,
                email: organisation.email,
              },
              branch: {
                name: estimate.jobCard.branch.name,
                address: estimate.jobCard.branch.address,
                hotlines: estimate.jobCard.branch.hotlines,
                email: estimate.jobCard.branch.email,
              },
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              jobNumber: estimate.jobCard.jobNumber,
              customerName: estimate.jobCard.customer.fullName,
              customerAddress: estimate.jobCard.customer.address,
              vehicleDescription,
              plateNumber: estimate.jobCard.vehicle.plateNumber,
              chassisNumber: estimate.jobCard.vehicle.chassisNumber,
              lineItems: rawLineItems.map((li) => ({
                description: li.description,
                quantity: li.quantity,
                unitLabel: li.unitOfMeasure ? pluralizeWord(li.quantity, li.unitOfMeasure) : null,
                amount: isCustomerLine(li) ? formatNairaForPdf(Number(li.amount ?? 0)) : coveredLabel(li.billTo, li.coveringWarranty?.warrantyNumber),
              })),
              servicesSubtotal: servicesTotal > 0 ? formatNairaForPdf(servicesTotal) : null,
              labourSubtotal: labourTotal > 0 ? formatNairaForPdf(labourTotal) : null,
              sundrySubtotal: sundryTotal > 0 ? formatNairaForPdf(sundryTotal) : null,
              totalAmount: formatNairaForPdf(total),
              minimumDepositAmount: formatNairaForPdf(minimumDeposit),
              ...(await bankDetailsFor(estimate.jobCard.branch.id)),
              paymentRemarkSuggestion,
            }),
          );
          return [{ filename: `Estimate-${estimate.jobCard.jobNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
        } catch (pdfErr) {
          // A failed PDF never blocks the email.
          logFailure('Failed to generate estimate PDF attachment', jobCardId, pdfErr);
          return undefined;
        }
      })(),
    );
  } catch (err) {
    logFailure('Failed to send customer estimate-approved email', jobCardId, err);
  }
}


// ---------------------------------------------------------------------------
// PAYMENTS: recorded by Finance from proof of a bank transfer or cash at the
// cashier (who, how much, which method). A Job Card can take several
// payments (deposit, then balance).
// ---------------------------------------------------------------------------

export type PaymentMethod = 'BANK_TRANSFER' | 'CASH';

/** Finance Officers for the branch (with the Master Admin fallback), who may
 * record payments. Branch-scoped like Workshop Managers. */
export async function listEligibleFinanceOfficersForBranch(branchId: string): Promise<EligibleSupervisorResult> {
  await requireUser();
  // Never another organisation's staff list (names and emails).
  if (!(await branchInMyOrganisationOrSystem(branchId))) return { supervisors: [], usingFallback: false };
  const branchFinance = await prisma.user.findMany({
    where: {
      branchId,
      isActive: true,
      roles: { some: { role: { slug: 'finance-officer' } } },
    },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  if (branchFinance.length > 0) {
    return { supervisors: branchFinance, usingFallback: false };
  }
  const masterAdmins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { isSuperAdmin: true } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  return { supervisors: masterAdmins, usingFallback: true };
}

export async function requireEligibleFinanceOfficer(branchId: string, key: 'workshop.payment.record' | 'workshop.refund.record' = 'workshop.payment.record'): Promise<{ id: string }> {
  const user = await requireUser();
  await authorize(key, { branchId, homeBranch: true }, `finance:${key}`, 'Only a Finance Officer for this branch can do this.');
  return user;
}

export async function getJobCardPayments(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getJobCardPayments');
  return prisma.payment.findMany({
    where: { jobCardId },
    orderBy: { recordedAt: 'asc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
}

/** Records one payment toward a Job Card.
 *
 * `amount` is exactly what is recorded; the UI's suggestions (70%, full,
 * remaining balance) only prefill the field. Amounts that would take the
 * total past the estimate are refused. There is no per-payment minimum:
 * what matters is the cumulative total.
 *
 * When the total first reaches the minimum deposit (70%), this call moves
 * the Job Card to IN_PROGRESS and sends the "requirement met" emails; there
 * is no separate approval step. */
export async function recordPayment(
  jobCardId: string,
  amount: number,
  method: PaymentMethod,
  notes?: string,
  idempotencyKey?: string,
): Promise<void> {
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('workshop.payment.record', undefined, 'recordPayment');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new WorkshopActionError('Enter a valid payment amount.');
  }
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      branchId: true,
      status: true,
      jobNumber: true,
      createdById: true,
      supervisorId: true,
      assignedTechnicianId: true,
      workStartedAt: true,
      customer: { select: { fullName: true, email: true } },
      department: { select: { name: true } },
      estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } },
      payments: { select: { amount: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  // Payments are accepted up to the full amount after the deposit has moved
  // the Job Card to IN_PROGRESS: the balance is often settled while parts are
  // awaited, after quality check, or at collection, and close/checkout require
  // full payment. Overpayment is still refused, and the automatic move to
  // IN_PROGRESS only happens from AWAITING_CUSTOMER_APPROVAL.
  const PAYABLE_STATUSES: JobCardStatus[] = [
    JobCardStatus.AWAITING_CUSTOMER_APPROVAL,
    JobCardStatus.IN_PROGRESS,
    JobCardStatus.AWAITING_PARTS,
    JobCardStatus.QUALITY_CHECK,
    JobCardStatus.COMPLETED,
    JobCardStatus.READY_FOR_COLLECTION,
  ];
  if (!PAYABLE_STATUSES.includes(jobCard.status)) {
    throw new WorkshopActionError('Payments can be recorded from the moment the customer is notified until the vehicle is ready for collection.');
  }
  const user = await requireEligibleFinanceOfficer(jobCard.branchId, 'workshop.payment.record');
  // Same form submitted again (e.g. after a dropped connection): if it is the
  // same payment, it is already done; if the key was reused for something
  // different, refuse.
  if (idempotencyKey) {
    const done = await prisma.payment.findUnique({ where: { idempotencyKey }, select: { jobCardId: true, amount: true, method: true } });
    if (done) {
      if (done.jobCardId === jobCardId && Number(done.amount) === amount && done.method === method) return;
      throw new WorkshopActionError('This form was already used for a different payment — refresh the page and enter it again.');
    }
  }
  // Duplicate guard: same amount, method and recorder within 20 seconds is a
  // double click or a resend after a dropped connection.
  if (await prisma.payment.findFirst({ where: { jobCardId, amount, method, recordedById: user.id, recordedAt: { gte: new Date(Date.now() - 20000) } }, select: { id: true } })) {
    throw new WorkshopActionError('This payment was just recorded — check the payments list before recording it again.');
  }

  const total = customerTotal(jobCard.estimate?.lineItems ?? []);
  const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  const alreadyPaid = jobCard.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount ?? 0), 0);
  const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (total > 0 && alreadyPaid >= total) {
    throw new WorkshopActionError('This estimate has already been paid in full — nothing left to record.');
  }

  const roundedAmount = Math.round(amount * 100) / 100;
  const prospectiveTotal = Math.round((alreadyPaid + roundedAmount) * 100) / 100;
  const roundedTotal = Math.round(total * 100) / 100;
  if (prospectiveTotal > roundedTotal) {
    const remaining = Math.round((roundedTotal - alreadyPaid) * 100) / 100;
    throw new WorkshopActionError(
      `This amount exceeds the remaining balance on this estimate. Please review — up to ${formatNaira(remaining)} can be recorded.`,
    );
  }

  // Two cashiers at once: the checks above are only a fast answer. The
  // decision is made again here with the Job Card row locked, against the
  // payments as they are now, so two payments can never both fit into the
  // same remaining balance.
  const settled = await prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'jobCard', [jobCardId], 'This Job Card no longer exists — refresh the page.');
    // The same form, resent while the first was still saving: already recorded.
    if (idempotencyKey && (await tx.payment.findUnique({ where: { idempotencyKey }, select: { id: true } }))) return null;
    const now = await tx.jobCard.findUnique({
      where: { id: jobCardId },
      select: { status: true, workStartedAt: true, estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } }, payments: { select: { amount: true } } },
    });
    if (!now || !PAYABLE_STATUSES.includes(now.status)) {
      throw new WorkshopActionError('This Job Card changed while you were recording the payment — refresh the page.');
    }
    const totalNow = Math.round(customerTotal(now.estimate?.lineItems ?? []) * 100) / 100;
    const paidNow = now.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount ?? 0), 0);
    if (exceedsBalance(paidNow, roundedAmount, totalNow)) {
      const remaining = Math.max(0, Math.round((totalNow - paidNow) * 100) / 100);
      throw new WorkshopActionError(
        `Another payment was recorded on this Job Card just now. Up to ${formatNaira(remaining)} can still be recorded — refresh to see it.`,
      );
    }
    const minimumNow = Math.round(totalNow * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
    const afterNow = Math.round((paidNow + roundedAmount) * 100) / 100;
    const autoApprove = now.status === JobCardStatus.AWAITING_CUSTOMER_APPROVAL
      && ((paidNow < minimumNow && afterNow >= minimumNow) || (paidNow < totalNow && afterNow >= totalNow));
    await tx.payment.create({
      data: {
        idempotencyKey: idempotencyKey || null,
        jobCardId,
        amount: roundedAmount,
        method,
        notes: notes?.trim() || null,
        recordedById: user.id,
      },
    });
    if (autoApprove) {
      // Compare-and-set as well as the lock: only from AWAITING_CUSTOMER_APPROVAL.
      claimed(await tx.jobCard.updateMany({
        where: { id: jobCardId, status: JobCardStatus.AWAITING_CUSTOMER_APPROVAL },
        data: {
          status: JobCardStatus.IN_PROGRESS,
          // Set once. Crossing the deposit is the usual way a Job Card reaches
          // IN_PROGRESS, so it starts the "In Service" clock.
          workStartedAt: now.workStartedAt ?? new Date(),
        },
      }));
    }
    return {
      newTotal: afterNow,
      autoApprove,
      justMetDeposit: paidNow < minimumNow && afterNow >= minimumNow,
      justCompletedFull: paidNow < totalNow && afterNow >= totalNow,
    };
  });
  if (!settled) return;
  const newTotal = settled.newTotal;
  const shouldAutoApprove = settled.autoApprove;
  const { justMetDeposit, justCompletedFull } = settled;
  void minimumDeposit;

  await writeAuditLog({
    userId: user.id,
    action: 'payment.recorded',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { amount: roundedAmount, method, notes: notes?.trim() || undefined },
  });
  if (shouldAutoApprove) {
    await writeAuditLog({
      userId: user.id,
      action: 'payment.approved',
      entityType: 'JobCard',
      entityId: jobCardId,
      metadata: { totalPaid: newTotal },
    });
  }

  // "Payment recorded" goes to Finance and the Manager only. Other parties
  // only hear about the milestones below.
  try {
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = portalBaseUrl();
    const balance = roundedTotal - newTotal;

    const recipientIds = new Set<string>();
    const managers = await listEligibleManagersForBranch(jobCard.branchId);
    for (const m of managers.supervisors) recipientIds.add(m.id);
    const financeOfficers = await listEligibleFinanceOfficersForBranch(jobCard.branchId);
    for (const f of financeOfficers.supervisors) recipientIds.add(f.id);

    const recipients = await prisma.user.findMany({
      where: { id: { in: Array.from(recipientIds) } },
      select: { id: true, fullName: true, email: true },
    });

    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `Payment recorded on Job Card ${jobCard.jobNumber}`,
        renderPaymentRecordedUpdateEmail({
          recipientName: recipient.fullName,
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          amountReceived: formatNaira(roundedAmount),
          totalPaidSoFar: formatNaira(newTotal),
          totalEstimate: formatNaira(roundedTotal),
          balanceRemaining: balance > 0 ? formatNaira(balance) : undefined,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send payment-recorded update emails', jobCardId, err);
  }

  // Milestone emails to every party on the Job Card, sent only by the
  // payment that crosses the line. If one payment crosses both thresholds,
  // only "paid in full" is sent.
  if (justMetDeposit || justCompletedFull) {
    try {
      const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
      const portalUrl = portalBaseUrl();

      const recipientIds = new Set<string>();
      if (jobCard.createdById) recipientIds.add(jobCard.createdById);
      if (jobCard.supervisorId) recipientIds.add(jobCard.supervisorId);
      if (jobCard.assignedTechnicianId) recipientIds.add(jobCard.assignedTechnicianId);
      const managers = await listEligibleManagersForBranch(jobCard.branchId);
      for (const m of managers.supervisors) recipientIds.add(m.id);
      const financeOfficers = await listEligibleFinanceOfficersForBranch(jobCard.branchId);
      for (const f of financeOfficers.supervisors) recipientIds.add(f.id);

      const recipients = await prisma.user.findMany({
        where: { id: { in: Array.from(recipientIds) } },
        select: { id: true, fullName: true, email: true },
      });

      for (const recipient of recipients) {
        if (justCompletedFull) {
          await sendEmail(
            recipient.email,
            `Job Card ${jobCard.jobNumber} paid in full`,
            renderPaymentCompletedInFullEmail({
              recipientName: recipient.fullName,
              jobNumber: jobCard.jobNumber,
              customerName: jobCard.customer.fullName,
              totalPaid: formatNaira(newTotal),
              jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
              logoUrl: `${portalUrl}/images/logo/email-logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        } else {
          await sendEmail(
            recipient.email,
            `Deposit paid, work can start — Job Card ${jobCard.jobNumber}`,
            renderPaymentRequirementMetEmail({
              recipientName: recipient.fullName,
              jobNumber: jobCard.jobNumber,
              customerName: jobCard.customer.fullName,
              totalPaidSoFar: formatNaira(newTotal),
              totalEstimate: formatNaira(roundedTotal),
              jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
              logoUrl: `${portalUrl}/images/logo/email-logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        }
      }
    } catch (err) {
      logFailure('Failed to send payment milestone emails', jobCardId, err);
    }
  }

  try {
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const websiteUrl = websiteBaseUrl();
    const balance = roundedTotal - newTotal;
    await sendEmail(
      jobCard.customer.email,
      `Payment received — Job Card ${jobCard.jobNumber}`,
      renderCustomerPaymentReceivedEmail({
        customerName: jobCard.customer.fullName,
        jobNumber: jobCard.jobNumber,
        amountReceived: formatNaira(roundedAmount),
        totalPaidSoFar: formatNaira(newTotal),
        totalEstimate: formatNaira(roundedTotal),
        balanceRemaining: balance > 0 ? formatNaira(balance) : undefined,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send customer payment-received email', jobCardId, err);
  }
}

// ---------------------------------------------------------------------------
// CANCELLATION: the creator, the assigned supervisor or a Master Admin
// raises a request with a reason (however the customer asked), and a
// Workshop Manager approves or declines it. JobCard.status only changes on
// approval, so a decline has nothing to revert.
// ---------------------------------------------------------------------------

async function requireJobCardCreatorOrSupervisor(jobCard: {
  createdById: string;
  supervisorId: string | null;
}): Promise<{ id: string }> {
  const user = await requireUser();
  if (user.id === jobCard.createdById || user.id === jobCard.supervisorId) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  return refuse('workshop.close.request', 'requireJobCardCreatorOrSupervisor', 
    "Only this Job Card's creator or its assigned supervisor can request cancellation.",
  );
}

export async function getCancellationRequests(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getCancellationRequests');
  return prisma.cancellationRequest.findMany({
    where: { jobCardId },
    orderBy: { requestedAt: 'desc' },
    include: {
      requestedBy: { select: { fullName: true } },
      decidedBy: { select: { fullName: true } },
    },
  });
}

/** Logs the request and notifies the branch's Managers. Status is unchanged. */
export async function requestJobCardCancellation(jobCardId: string, reason: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new WorkshopActionError('A reason is required to request cancellation.');
  }
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      branchId: true,
      jobNumber: true,
      createdById: true,
      supervisorId: true,
      customer: { select: { fullName: true } },
      department: { select: { name: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  if (jobCard.status === JobCardStatus.CANCELLED || jobCard.status === JobCardStatus.CLOSED || jobCard.status === JobCardStatus.CHECKED_OUT) {
    throw new WorkshopActionError('This Job Card is already cancelled, closed or checked out.');
  }
  const user = await requireJobCardCreatorOrSupervisor(jobCard);

  // Checked and created with the Job Card locked, so two people asking at
  // the same moment can't open two pending requests.
  await prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'jobCard', [jobCardId]);
    const existingPending = await tx.cancellationRequest.findFirst({
      where: { jobCardId, status: 'PENDING' },
      select: { id: true },
    });
    if (existingPending) {
      throw new WorkshopActionError('A cancellation request is already pending for this Job Card.');
    }
    await tx.cancellationRequest.create({
      data: { jobCardId, reason: trimmedReason, requestedById: user.id },
    });
  });

  await writeAuditLog({
    userId: user.id,
    action: 'cancellation.requested',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { reason: trimmedReason },
  });

  try {
    // Independent lookups for the email, run in parallel.
    const [requester, orgContext] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }), getWorkshopOrgContext(jobCard.department?.name)]);
    const portalUrl = portalBaseUrl();
    const managers = await listEligibleManagersForBranch(jobCard.branchId);
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Cancellation request needs your decision — Job Card ${jobCard.jobNumber}`,
        renderCancellationRequestedEmail({
          managerName: manager.fullName,
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          requestedByName: requester?.fullName ?? 'A team member',
          reason: trimmedReason,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send cancellation-requested emails', jobCardId, err);
  }
}

/** The Manager approves: the Job Card becomes CANCELLED and staff and the
 * customer are emailed. */
export async function approveCancellationRequest(requestId: string, decisionNotes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveCancellationRequest');
  const request = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestedById: true,
      status: true,
      reason: true,
      jobCardId: true,
      jobCard: {
        select: {
          branchId: true,
          jobNumber: true,
          createdById: true,
          supervisorId: true,
          assignedTechnicianId: true,
          customer: { select: { fullName: true, email: true } },
          vehicle: { select: { make: true, model: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!request) {
    throw new WorkshopActionError('Cancellation request not found.');
  }
  if (request.status !== 'PENDING') {
    throw new WorkshopActionError('This cancellation request has already been decided.');
  }
  // Re-checked at decision time: a Job Card closed or checked out since the
  // request was raised can't be cancelled.
  const current = await prisma.jobCard.findUnique({ where: { id: request.jobCardId }, select: { status: true } });
  if (current?.status === JobCardStatus.CLOSED || current?.status === JobCardStatus.CHECKED_OUT) {
    throw new WorkshopActionError('This Job Card has since been closed or checked out, so it can no longer be cancelled — decline this request.');
  }
  const user = await requireEligibleManager(request.jobCard.branchId, 'workshop.close.approve');
  // Segregation of duties: whoever asked for this cannot also approve it.
  if (request.requestedById === user.id && !(await currentUserIsMasterAdmin())) {
    throw new WorkshopActionError('You asked for this — another Manager decides it.');
  }

  // All-or-nothing, and each step only from the state it was decided on: a
  // close approved at the same moment, or a second click, stops this with
  // nothing changed. A Job Card can never end up both closed and cancelled.
  let withdrawn: Awaited<ReturnType<typeof withdrawOpenSourcing>> | undefined;
  await prisma.$transaction(async (tx) => {
    // Lock the Job Card first so a concurrent close and cancellation queue on
    // it instead of deadlocking on each other's request rows.
    await lockExisting(tx, 'jobCard', [request.jobCardId]);
    claimed(await tx.cancellationRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNotes: decisionNotes?.trim() || null,
      },
    }), 'This cancellation request was just decided by someone else — refresh the page.');
    claimed(await tx.jobCard.updateMany({
      where: { id: request.jobCardId, status: { notIn: [JobCardStatus.CANCELLED, JobCardStatus.CLOSED, JobCardStatus.CHECKED_OUT] } },
      data: { status: JobCardStatus.CANCELLED },
    }), 'This Job Card was just closed or checked out, so it can no longer be cancelled — refresh the page.');
    // A pending close request can no longer happen; resolve it so it doesn't
    // stay in Managers' notifications.
    await tx.closeRequest.updateMany({
      where: { jobCardId: request.jobCardId, status: 'PENDING' },
      data: { status: 'DECLINED', decidedById: user.id, decidedAt: new Date(), decisionNotes: 'Superseded — the Job Card was cancelled.' },
    });
    // Withdraw parts requests and outside purchases still open for it, and
    // return reserved stock to the shelf.
    withdrawn = await withdrawOpenSourcing(tx, { jobCardId: request.jobCardId }, user.id, 'Withdrawn automatically — the Job Card was cancelled.');
  });

  await writeAuditLog({
    userId: user.id,
    action: 'cancellation.approved',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { withdrawn: withdrawn && (withdrawn.slips.length || withdrawn.procurements.length) ? withdrawn : undefined,  reason: request.reason, notes: decisionNotes?.trim() || undefined },
  });

  try {
    // Independent lookups for the email, run in parallel.
    const [approver, orgContext] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }), getWorkshopOrgContext(request.jobCard.department?.name)]);
    const portalUrl = portalBaseUrl();

    const recipientIds = new Set<string>();
    if (request.jobCard.createdById) recipientIds.add(request.jobCard.createdById);
    if (request.jobCard.supervisorId) recipientIds.add(request.jobCard.supervisorId);
    if (request.jobCard.assignedTechnicianId) recipientIds.add(request.jobCard.assignedTechnicianId);
    const managers = await listEligibleManagersForBranch(request.jobCard.branchId);
    for (const m of managers.supervisors) recipientIds.add(m.id);

    const recipients = await prisma.user.findMany({
      where: { id: { in: Array.from(recipientIds) } },
      select: { id: true, fullName: true, email: true },
    });

    for (const recipient of recipients) {
      await sendEmail(
        recipient.email,
        `Job Card ${request.jobCard.jobNumber} cancelled`,
        renderJobCardCancelledStaffEmail({
          recipientName: recipient.fullName,
          jobNumber: request.jobCard.jobNumber,
          customerName: request.jobCard.customer.fullName,
          approvedByName: approver?.fullName ?? 'The manager',
          reason: request.reason,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${request.jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send staff cancellation-broadcast emails', request.jobCardId, err);
  }

  try {
    const orgContext = await getWorkshopOrgContext(request.jobCard.department?.name);
    const websiteUrl = websiteBaseUrl();
    await sendEmail(
      request.jobCard.customer.email,
      `Your Job Card ${request.jobCard.jobNumber} has been cancelled`,
      renderCustomerJobCardCancelledEmail({
        customerName: request.jobCard.customer.fullName,
        jobNumber: request.jobCard.jobNumber,
        vehicleDescription: [request.jobCard.vehicle.make, request.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${request.jobCardId}`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send customer cancellation email', request.jobCardId, err);
  }
}

/** The Manager declines. Status is untouched; only the requester is notified. */
export async function declineCancellationRequest(requestId: string, decisionNotes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('declineCancellationRequest');
  const request = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedById: true,
      jobCardId: true,
      jobCard: {
        select: {
          branchId: true,
          jobNumber: true,
          customer: { select: { fullName: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!request) {
    throw new WorkshopActionError('Cancellation request not found.');
  }
  if (request.status !== 'PENDING') {
    throw new WorkshopActionError('This cancellation request has already been decided.');
  }
  const user = await requireEligibleManager(request.jobCard.branchId, 'workshop.close.approve');

  claimed(await prisma.cancellationRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: {
      status: 'DECLINED',
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNotes: decisionNotes?.trim() || null,
    },
  }), 'This cancellation request was just decided by someone else — refresh the page.');

  await writeAuditLog({
    userId: user.id,
    action: 'cancellation.declined',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { notes: decisionNotes?.trim() || undefined },
  });

  try {
    const [decliner, requester] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
      prisma.user.findUnique({ where: { id: request.requestedById }, select: { fullName: true, email: true } }),
    ]);
    if (!requester) return;
    const orgContext = await getWorkshopOrgContext(request.jobCard.department?.name);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      requester.email,
      `Cancellation request declined — Job Card ${request.jobCard.jobNumber}`,
      renderCancellationDeclinedEmail({
        recipientName: requester.fullName,
        jobNumber: request.jobCard.jobNumber,
        customerName: request.jobCard.customer.fullName,
        declinedByName: decliner?.fullName ?? 'The manager',
        decisionNotes,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${request.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send cancellation-declined email', request.jobCardId, err);
  }
}

export async function getCloseRequests(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getCloseRequests');
  return prisma.closeRequest.findMany({
    where: { jobCardId },
    orderBy: { requestedAt: 'desc' },
    include: {
      requestedBy: { select: { fullName: true } },
      decidedBy: { select: { fullName: true } },
    },
  });
}

/** Logs a close request and notifies the branch's Managers. Status is
 * unchanged until a Manager approves. */
export async function requestJobCardClose(jobCardId: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      branchId: true,
      jobNumber: true,
      createdById: true,
      supervisorId: true,
      customer: { select: { fullName: true } },
      department: { select: { name: true } },
      estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } },
      payments: { select: { amount: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  if (jobCard.status === JobCardStatus.CANCELLED || jobCard.status === JobCardStatus.CLOSED || jobCard.status === JobCardStatus.CHECKED_OUT) {
    throw new WorkshopActionError('This Job Card is already cancelled, closed, or checked out.');
  }
  // Close means the work is finished and handed over, so only from Ready for
  // Collection. A Job Card abandoned earlier is cancelled, not closed.
  if (jobCard.status !== JobCardStatus.READY_FOR_COLLECTION) {
    throw new WorkshopActionError('A close can only be requested once this Job Card is Ready for Collection. To stop a Job Card before then, request a cancellation instead.');
  }
  // Same full-payment rule as checkout, checked now so a request that could
  // never be approved isn't sent to a Manager.
  const totalEstimate = customerTotal(jobCard.estimate?.lineItems ?? []);
  const totalPaid = jobCard.payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);
  if (totalPaid < totalEstimate) {
    throw new WorkshopActionError('Payment must be completed in full before a close can be requested.');
  }
  const user = await requireJobCardCreatorOrSupervisor(jobCard);

  // Checked and created with the Job Card locked: never two pending closes.
  await prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'jobCard', [jobCardId]);
    const existingPending = await tx.closeRequest.findFirst({
      where: { jobCardId, status: 'PENDING' },
      select: { id: true },
    });
    if (existingPending) {
      throw new WorkshopActionError('A close request is already pending for this Job Card.');
    }
    await tx.closeRequest.create({
      data: { jobCardId, requestedById: user.id },
    });
  });

  await writeAuditLog({
    userId: user.id,
    action: 'close.requested',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  try {
    // Independent lookups for the email, run in parallel.
    const [requester, orgContext] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }), getWorkshopOrgContext(jobCard.department?.name)]);
    const portalUrl = portalBaseUrl();
    const managers = await listEligibleManagersForBranch(jobCard.branchId);
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Close request needs your decision — Job Card ${jobCard.jobNumber}`,
        renderCloseRequestedEmail({
          managerName: manager.fullName,
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          requestedByName: requester?.fullName ?? 'A team member',
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send close-requested emails', jobCardId, err);
  }
}

/** The Manager approves: the Job Card becomes CLOSED (set here, since
 * updateJobCardStatus refuses CLOSED) and staff and the customer are emailed. */
export async function approveCloseRequest(requestId: string, decisionNotes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('approveCloseRequest');
  // Catalogue check first (who may attempt this); branch eligibility and
  // workflow state are checked below.
  await authorize('workshop.close.approve', undefined, 'approveCloseRequest');
  const request = await prisma.closeRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestedById: true,
      status: true,
      jobCardId: true,
      jobCard: {
        select: {
          status: true,
          branchId: true,
          jobNumber: true,
          createdById: true,
          supervisorId: true,
          assignedTechnicianId: true,
          customer: { select: { fullName: true, email: true } },
          vehicle: { select: { make: true, model: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!request) {
    throw new WorkshopActionError('Close request not found.');
  }
  if (request.status !== 'PENDING') {
    throw new WorkshopActionError('This close request has already been decided.');
  }
  // Re-checked at decision time: the Job Card may have gone back for rework.
  if (request.jobCard.status !== JobCardStatus.READY_FOR_COLLECTION) {
    throw new WorkshopActionError('This Job Card is no longer Ready for Collection, so it cannot be closed — decline this request.');
  }
  const user = await requireEligibleManager(request.jobCard.branchId, 'workshop.close.approve');
  // Segregation of duties: whoever asked for this cannot also approve it.
  if (request.requestedById === user.id && !(await currentUserIsMasterAdmin())) {
    throw new WorkshopActionError('You asked for this — another Manager decides it.');
  }

  // Same all-or-nothing, compare-and-set shape as approving a cancellation.
  let withdrawn: Awaited<ReturnType<typeof withdrawOpenSourcing>> | undefined;
  await prisma.$transaction(async (tx) => {
    // Lock the Job Card first so a concurrent close and cancellation queue on
    // it instead of deadlocking on each other's request rows.
    await lockExisting(tx, 'jobCard', [request.jobCardId]);
    claimed(await tx.closeRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNotes: decisionNotes?.trim() || null,
      },
    }), 'This close request was just decided by someone else — refresh the page.');
    claimed(await tx.jobCard.updateMany({
      where: { id: request.jobCardId, status: JobCardStatus.READY_FOR_COLLECTION },
      data: { status: JobCardStatus.CLOSED, closedAt: new Date() },
    }), 'This Job Card is no longer Ready for Collection (it was just changed) — refresh the page.');
    // A pending cancellation can no longer happen; resolve it.
    await tx.cancellationRequest.updateMany({
      where: { jobCardId: request.jobCardId, status: 'PENDING' },
      data: { status: 'DECLINED', decidedById: user.id, decidedAt: new Date(), decisionNotes: 'Superseded — the Job Card was closed.' },
    });
    // Withdraw parts requests and outside purchases still open for it, and
    // return reserved stock to the shelf.
    withdrawn = await withdrawOpenSourcing(tx, { jobCardId: request.jobCardId }, user.id, 'Withdrawn automatically — the Job Card was closed.');
  });

  await writeAuditLog({
    userId: user.id,
    action: 'job_card.status_updated',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { withdrawn: withdrawn && (withdrawn.slips.length || withdrawn.procurements.length) ? withdrawn : undefined,  from: 'READY_FOR_COLLECTION', to: 'CLOSED', notes: decisionNotes?.trim() || undefined },
  });

  try {
    // Independent lookups for the email, run in parallel.
    const [approver, orgContext] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }), getWorkshopOrgContext(request.jobCard.department?.name)]);
    const websiteUrl = websiteBaseUrl();
    const portalUrl = portalBaseUrl();
    const vehicleDescription = [request.jobCard.vehicle.make, request.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';

    await sendEmail(
      request.jobCard.customer.email,
      `Your Job Card ${request.jobCard.jobNumber} is closed`,
      renderCustomerJobCardClosedEmail({
        customerName: request.jobCard.customer.fullName,
        jobNumber: request.jobCard.jobNumber,
        vehicleDescription,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard`,
        logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );

    const recipientIds = new Set<string>();
    if (request.jobCard.createdById) recipientIds.add(request.jobCard.createdById);
    if (request.jobCard.supervisorId) recipientIds.add(request.jobCard.supervisorId);
    if (request.jobCard.assignedTechnicianId) recipientIds.add(request.jobCard.assignedTechnicianId);
    const managers = await listEligibleManagersForBranch(request.jobCard.branchId);
    for (const m of managers.supervisors) recipientIds.add(m.id);

    const staffRecipients = await prisma.user.findMany({
      where: { id: { in: Array.from(recipientIds) } },
      select: { id: true, fullName: true, email: true },
    });

    for (const recipient of staffRecipients) {
      await sendEmail(
        recipient.email,
        `Job Card ${request.jobCard.jobNumber} closed`,
        renderJobCardClosedStaffEmail({
          recipientName: recipient.fullName,
          jobNumber: request.jobCard.jobNumber,
          customerName: request.jobCard.customer.fullName,
          closedByName: approver?.fullName ?? 'The manager',
          jobCardUrl: `${portalUrl}/workshop/job-cards/${request.jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send close-approval emails', request.jobCardId, err);
  }
}

/** The Manager declines. Status is untouched; only the requester is notified. */
export async function declineCloseRequest(requestId: string, decisionNotes?: string): Promise<void> {
  // Decisions are never taken during an assisted session (the assistant approves nothing).
  await refuseDuringAssist('declineCloseRequest');
  const request = await prisma.closeRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedById: true,
      jobCardId: true,
      jobCard: {
        select: {
          branchId: true,
          jobNumber: true,
          customer: { select: { fullName: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!request) {
    throw new WorkshopActionError('Close request not found.');
  }
  if (request.status !== 'PENDING') {
    throw new WorkshopActionError('This close request has already been decided.');
  }
  const user = await requireEligibleManager(request.jobCard.branchId, 'workshop.close.approve');

  claimed(await prisma.closeRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: {
      status: 'DECLINED',
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNotes: decisionNotes?.trim() || null,
    },
  }), 'This close request was just decided by someone else — refresh the page.');

  await writeAuditLog({
    userId: user.id,
    action: 'close.declined',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { notes: decisionNotes?.trim() || undefined },
  });

  try {
    const [decliner, requester] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
      prisma.user.findUnique({ where: { id: request.requestedById }, select: { fullName: true, email: true } }),
    ]);
    if (!requester) return;
    const orgContext = await getWorkshopOrgContext(request.jobCard.department?.name);
    const portalUrl = portalBaseUrl();
    await sendEmail(
      requester.email,
      `Close request declined — Job Card ${request.jobCard.jobNumber}`,
      renderCloseRequestDeclinedEmail({
        recipientName: requester.fullName,
        jobNumber: request.jobCard.jobNumber,
        customerName: request.jobCard.customer.fullName,
        declinedByName: decliner?.fullName ?? 'The manager',
        decisionNotes,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${request.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/email-logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    logFailure('Failed to send close-declined email', request.jobCardId, err);
  }
}

// ---------------------------------------------------------------------------
// WORKSHOP CUSTODY: vehicles on site and not checked out, grouped for the
// "Vehicles In Custody" dashboard, plus the approval-deadline and
// collection reminders.
// ---------------------------------------------------------------------------

export type WorkshopCustodyEntry = {
  id: string;
  vehicleId: string;
  vehicleType: string | null;
  jobNumber: string;
  customerId?: string;
  customerName: string;
  vehicleDescription: string;
  status: string;
  /** Working days since the category's anchor: customer notified (awaiting
   * approval), cancellation approved (cancelled), or moved to Ready for
   * Collection. Always 0 for In Service. */
  daysElapsed: number;
  /** Grace period in working days; set for the three action-required categories only. */
  totalGraceWorkingDays?: number;
  /** max(0, totalGraceWorkingDays - daysElapsed). */
  daysRemaining?: number;
  /** Reminders sent so far, counted from the audit trail. */
  remindersSent?: number;
  /** Staged reminder state (lib/custody-reminders): next number, whether it
   * can be sent now or from when, and who sent the last one. */
  reminder?: { sent: number; nextNumber: number; dueNow: boolean; dueFrom: string; lastSentByName: string | null; lastSentAt: string | null };
  /** ISO date the category's clock started (notified / cancelled / ready). */
  anchorAt?: string;
  /** ISO date the deadline falls on (all three action-required categories). */
  dueDate?: string;
  isOverdue: boolean;
  /** Set on an awaiting-approval entry with a cancellation request pending,
   * so a Manager can approve or decline it from the dashboard. */
  pendingCancellationRequest?: { id: string; reason: string; requestedByName: string };
};

const CUSTODY_REMINDER_ACTIONS = ['approval.reminder_sent', 'collection.overdue_notice_sent', 'collection.ready_reminder_sent'] as const;

/** Data for the "Vehicles In Custody" dashboard: awaiting customer
 * approval, cancelled but not collected, and ready but not collected (each
 * with a deadline, days remaining and reminder count), plus In Service for
 * everything else still being worked on. */
export async function getWorkshopCustodySummary(search?: string): Promise<{
  total: number;
  awaitingApproval: WorkshopCustodyEntry[];
  cancelledPendingCollection: WorkshopCustodyEntry[];
  readyForCollection: WorkshopCustodyEntry[];
  inService: WorkshopCustodyEntry[];
}> {
  await requireUser();
  const trimmedSearch = search?.trim();
  const jobCards = await prisma.jobCard.findMany({
    where: {
      // Only CHECKED_OUT means the vehicle has left. CLOSED is an administrative
      // sign-off and the vehicle may still be in the yard.
      status: { not: JobCardStatus.CHECKED_OUT },
      ...(await reachWhere('workshop.job_card.view')),
      ...(trimmedSearch
        ? {
            OR: [
              { jobNumber: { contains: trimmedSearch, mode: 'insensitive' } },
              { customer: { fullName: { contains: trimmedSearch, mode: 'insensitive' } } },
              { vehicle: { plateNumber: { contains: trimmedSearch, mode: 'insensitive' } } },
              { vehicle: { chassisNumber: { contains: trimmedSearch, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      jobNumber: true,
      status: true,
      readyForCollectionAt: true,
      customer: { select: { id: true, fullName: true } },
      vehicle: { select: { id: true, make: true, model: true, vehicleType: true } },
      estimate: { select: { customerNotifiedAt: true } },
      // All requests: gives both the latest approval (cancelled entries) and any
      // pending request (awaiting-approval entries) from one query.
      cancellationRequests: {
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          status: true,
          reason: true,
          decidedAt: true,
          requestedBy: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const awaitingApproval: WorkshopCustodyEntry[] = [];
  const cancelledPendingCollection: WorkshopCustodyEntry[] = [];
  const readyForCollection: WorkshopCustodyEntry[] = [];
  const inService: WorkshopCustodyEntry[] = [];

  for (const jc of jobCards as Array<{
    id: string;
    jobNumber: string;
    status: string;
    readyForCollectionAt: Date | null;
    customer: { id: string; fullName: string };
    vehicle: { id: string; make: string | null; model: string | null; vehicleType: string | null };
    estimate: { customerNotifiedAt: Date | null } | null;
    cancellationRequests: { id: string; status: string; reason: string; decidedAt: Date | null; requestedBy: { fullName: string } }[];
  }>) {
    const vehicleDescription = [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const base = {
      id: jc.id,
      vehicleId: jc.vehicle.id,
      vehicleType: jc.vehicle.vehicleType ?? null,
      jobNumber: jc.jobNumber,
      customerId: jc.customer.id,
      customerName: jc.customer.fullName,
      vehicleDescription,
      status: jc.status,
    };

    if (jc.status === JobCardStatus.AWAITING_CUSTOMER_APPROVAL && jc.estimate?.customerNotifiedAt) {
      const anchor = jc.estimate.customerNotifiedAt;
      const daysElapsed = workingDaysBetween(anchor, now);
      const dueDate = addWorkingDays(anchor, APPROVAL_DEADLINE_WORKING_DAYS);
      const pending = jc.cancellationRequests.find((r) => r.status === 'PENDING');
      awaitingApproval.push({
        anchorAt: anchor ? new Date(anchor).toISOString() : undefined,
        ...base,
        daysElapsed,
        totalGraceWorkingDays: APPROVAL_DEADLINE_WORKING_DAYS,
        daysRemaining: Math.max(0, APPROVAL_DEADLINE_WORKING_DAYS - daysElapsed),
        dueDate: dueDate.toISOString(),
        isOverdue: daysElapsed >= APPROVAL_DEADLINE_WORKING_DAYS,
        pendingCancellationRequest: pending ? { id: pending.id, reason: pending.reason, requestedByName: pending.requestedBy.fullName } : undefined,
      });
    } else if (jc.status === JobCardStatus.CANCELLED) {
      const approved = jc.cancellationRequests.find((r) => r.status === 'APPROVED');
      const anchor = approved?.decidedAt;
      const daysElapsed = anchor ? workingDaysBetween(anchor, now) : 0;
      const dueDate = anchor ? addWorkingDays(anchor, CANCELLED_COLLECTION_GRACE_WORKING_DAYS) : undefined;
      cancelledPendingCollection.push({
        anchorAt: anchor ? new Date(anchor).toISOString() : undefined,
        ...base,
        daysElapsed,
        totalGraceWorkingDays: CANCELLED_COLLECTION_GRACE_WORKING_DAYS,
        daysRemaining: Math.max(0, CANCELLED_COLLECTION_GRACE_WORKING_DAYS - daysElapsed),
        dueDate: dueDate?.toISOString(),
        isOverdue: daysElapsed >= CANCELLED_COLLECTION_GRACE_WORKING_DAYS,
      });
    } else if (jc.status === JobCardStatus.READY_FOR_COLLECTION && jc.readyForCollectionAt) {
      const anchor = jc.readyForCollectionAt;
      const daysElapsed = workingDaysBetween(anchor, now);
      const dueDate = addWorkingDays(anchor, READY_FOR_COLLECTION_GRACE_WORKING_DAYS);
      readyForCollection.push({
        anchorAt: anchor ? new Date(anchor).toISOString() : undefined,
        ...base,
        daysElapsed,
        totalGraceWorkingDays: READY_FOR_COLLECTION_GRACE_WORKING_DAYS,
        daysRemaining: Math.max(0, READY_FOR_COLLECTION_GRACE_WORKING_DAYS - daysElapsed),
        dueDate: dueDate.toISOString(),
        isOverdue: daysElapsed >= READY_FOR_COLLECTION_GRACE_WORKING_DAYS,
      });
    } else {
      inService.push({ ...base, daysElapsed: 0, isOverdue: false });
    }
  }

  // One batched query for every action-required entry's reminder history.
  const actionRequiredIds = [...awaitingApproval, ...cancelledPendingCollection, ...readyForCollection].map((e) => e.id);
  if (actionRequiredIds.length > 0) {
    // Every reminder sent (with who and when); the audit trail is the source of
    // truth for the reminder state.
    const sentLog = await prisma.auditLog.findMany({
      where: { entityId: { in: actionRequiredIds }, action: { in: [...CUSTODY_REMINDER_ACTIONS] } },
      orderBy: { createdAt: 'asc' },
      select: { entityId: true, action: true, createdAt: true, userId: true },
    });
    const senderIds = [...new Set(sentLog.map((l: { userId: string | null }) => l.userId).filter((id: string | null): id is string => Boolean(id)))];
    const senders = senderIds.length ? await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, fullName: true } }) : [];
    const senderName = new Map(senders.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
    const stage = (entries: WorkshopCustodyEntry[], kind: CustodyReminderKind, action: string) => {
      for (const entry of entries) {
        if (!entry.anchorAt) continue;
        const mine = sentLog.filter((l: { entityId: string | null; action: string }) => l.entityId === entry.id && l.action === action);
        const state = custodyReminderState(kind, new Date(entry.anchorAt), mine.map((l: { createdAt: Date }) => l.createdAt), now);
        const last = mine[mine.length - 1];
        entry.reminder = {
          sent: state.sent,
          nextNumber: state.nextNumber,
          dueNow: state.dueNow,
          dueFrom: state.dueFrom.toISOString(),
          lastSentByName: last?.userId ? senderName.get(last.userId) ?? null : null,
          lastSentAt: last ? new Date(last.createdAt).toISOString() : null,
        };
      }
    };
    stage(awaitingApproval, 'APPROVAL', 'approval.reminder_sent');
    stage(cancelledPendingCollection, 'CANCELLED_COLLECTION', 'collection.overdue_notice_sent');
    stage(readyForCollection, 'COLLECTION', 'collection.ready_reminder_sent');
    const counts = await prisma.auditLog.groupBy({
      by: ['entityId'],
      where: { entityId: { in: actionRequiredIds }, action: { in: [...CUSTODY_REMINDER_ACTIONS] } },
      _count: { _all: true },
    });
    // AuditLog.entityId is nullable in the schema, though the where clause
    // above guarantees it here.
    const countByEntityId = new Map<string, number>(
      counts
        .filter((c: { entityId: string | null; _count: { _all: number } }): c is { entityId: string; _count: { _all: number } } => c.entityId !== null)
        .map((c: { entityId: string; _count: { _all: number } }) => [c.entityId, c._count._all]),
    );
    for (const entry of [...awaitingApproval, ...cancelledPendingCollection, ...readyForCollection]) {
      entry.remindersSent = countByEntityId.get(entry.id) ?? 0;
    }
  }

  awaitingApproval.sort((a, b) => b.daysElapsed - a.daysElapsed);
  cancelledPendingCollection.sort((a, b) => b.daysElapsed - a.daysElapsed);
  readyForCollection.sort((a, b) => b.daysElapsed - a.daysElapsed);

  return { total: jobCards.length, awaitingApproval, cancelledPendingCollection, readyForCollection, inService };
}

/** Reminds a customer whose estimate is awaiting approval. Repeatable; each
 * send is audited (`approval.reminder_sent`), which is where the dashboard
 * count comes from. `reminderSentAt` holds the latest send. Used by the
 * front desk (workshop.customer.notify) and by runApprovalDeadlineChecks(). */
export async function sendApprovalReminder(jobCardId: string): Promise<void> {
  await authorizeOnJobCard('workshop.customer.notify', jobCardId, 'sendApprovalReminder');
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      jobNumber: true,
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true } },
      estimate: {
        select: {
          id: true,
          customerNotifiedAt: true,
          lineItems: { select: { amount: true, billTo: true } },
        },
      },
    },
  });
  if (!jobCard || jobCard.status !== JobCardStatus.AWAITING_CUSTOMER_APPROVAL || !jobCard.estimate?.customerNotifiedAt) {
    throw new WorkshopActionError('This Job Card is not currently awaiting customer approval.');
  }

  const total = customerTotal(jobCard.estimate.lineItems);
  const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  const dueDate = addWorkingDays(jobCard.estimate.customerNotifiedAt, APPROVAL_DEADLINE_WORKING_DAYS);
  const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const websiteUrl = websiteBaseUrl();
  const orgContext = await getWorkshopOrgContext();

  await prisma.estimate.update({ where: { id: jobCard.estimate.id }, data: { reminderSentAt: new Date() } });

  // Staged reminders (lib/custody-reminders): refused until due.
  const priorSends = await prisma.auditLog.findMany({ where: { entityId: jobCardId, action: 'approval.reminder_sent' }, select: { createdAt: true } });
  const reminderState = custodyReminderState('APPROVAL', jobCard.estimate.customerNotifiedAt, priorSends.map((r: { createdAt: Date }) => r.createdAt));
  if (!reminderState.dueNow) {
    throw new WorkshopActionError(notDueYetMessage('APPROVAL', reminderState));
  }

  await writeAuditLog({
    userId: user.id,
    action: 'approval.reminder_sent',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Counted after the audit entry above, so this send is included.
  const reminderNumber = await prisma.auditLog.count({
    where: { entityId: jobCardId, action: 'approval.reminder_sent' },
  });

  await sendEmail(
    jobCard.customer.email,
    `Reminder: your estimate is waiting — Job Card ${jobCard.jobNumber}`,
    renderCustomerApprovalReminderEmail({
      customerName: jobCard.customer.fullName,
      jobNumber: jobCard.jobNumber,
      vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      totalEstimate: formatNaira(total),
      minimumDepositAmount: formatNaira(minimumDeposit),
      depositPercent: Math.round(MINIMUM_DEPOSIT_FRACTION * 100),
      dueDate: dueDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' }),
      reminderNumber,
      dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
      logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
      companyName: orgContext.companyName,
      branchName: orgContext.branchName,
    }),
  );
}

/** Master Admin's manual "run today's checks": sends due approval reminders
 * and counts Job Cards past the deadline. Never cancels anything; that
 * stays a Manager-approved cancellation request, so staff can still extend
 * grace when a customer asks. */
export async function runApprovalDeadlineChecks(): Promise<{ remindersSent: number; overdueCount: number }> {
  if (!(await currentUserIsMasterAdmin())) {
    throw new WorkshopActionError('You do not have permission to run this check.');
  }

  const candidates = await prisma.jobCard.findMany({
    where: { status: JobCardStatus.AWAITING_CUSTOMER_APPROVAL },
    select: {
      id: true,
      estimate: { select: { customerNotifiedAt: true, reminderSentAt: true } },
    },
  });

  const now = new Date();
  let remindersSent = 0;
  let overdueCount = 0;

  for (const jc of candidates as Array<{ id: string; estimate: { customerNotifiedAt: Date | null; reminderSentAt: Date | null } | null }>) {
    if (!jc.estimate?.customerNotifiedAt) continue;
    const daysElapsed = workingDaysBetween(jc.estimate.customerNotifiedAt, now);

    // Past the deadline: count it for review, never auto-cancel.
    if (daysElapsed >= APPROVAL_DEADLINE_WORKING_DAYS) {
      overdueCount += 1;
    } else if (daysElapsed >= APPROVAL_REMINDER_WORKING_DAYS && !jc.estimate.reminderSentAt) {
      try {
        await sendApprovalReminder(jc.id);
        remindersSent += 1;
      } catch (err) {
        logFailure('Failed to send approval reminder', jc.id, err);
      }
    }
  }

  return { remindersSent, overdueCount };
}

/** Manually notifies the customer of a cancelled Job Card's uncollected
 * vehicle. Only an eligible Manager (or Master Admin). Never automatic. */
export async function notifyOverdueCancelledVehicle(jobCardId: string, notes?: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      branchId: true,
      jobNumber: true,
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true } },
      cancellationRequests: {
        where: { status: 'APPROVED' },
        orderBy: { decidedAt: 'desc' },
        take: 1,
        select: { decidedAt: true },
      },
    },
  });
  if (!jobCard || jobCard.status !== JobCardStatus.CANCELLED) {
    throw new WorkshopActionError('This Job Card is not currently cancelled.');
  }
  const anchor = jobCard.cancellationRequests[0]?.decidedAt;
  if (!anchor) {
    throw new WorkshopActionError('No cancellation record found for this Job Card.');
  }
  const user = await requireEligibleManager(jobCard.branchId, 'workshop.close.approve');
  // Staged reminders (lib/custody-reminders): refused until due.
  const priorSends = await prisma.auditLog.findMany({ where: { entityId: jobCardId, action: 'collection.overdue_notice_sent' }, select: { createdAt: true } });
  const reminderState = custodyReminderState('CANCELLED_COLLECTION', anchor, priorSends.map((r: { createdAt: Date }) => r.createdAt));
  if (!reminderState.dueNow) {
    throw new WorkshopActionError(notDueYetMessage('CANCELLED_COLLECTION', reminderState));
  }
  const daysElapsed = workingDaysBetween(anchor, new Date());

  await writeAuditLog({
    userId: user.id,
    action: 'collection.overdue_notice_sent',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { daysElapsed, notes: notes?.trim() || undefined },
  });

  // Counted after the audit entry above, so this send is included.
  const reminderNumber = await prisma.auditLog.count({
    where: { entityId: jobCardId, action: 'collection.overdue_notice_sent' },
  });

  const websiteUrl = websiteBaseUrl();
  const orgContext = await getWorkshopOrgContext();
  await sendEmail(
    jobCard.customer.email,
    `Please collect your vehicle — Job Card ${jobCard.jobNumber}`,
    renderCustomerCollectionOverdueEmail({
      customerName: jobCard.customer.fullName,
      jobNumber: jobCard.jobNumber,
      vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      daysSinceCancellationLabel: pluralize(daysElapsed, 'working day'),
      reminderNumber,
      dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
      logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
      companyName: orgContext.companyName,
      branchName: orgContext.branchName,
    }),
  );
}

/** Reminds a customer whose vehicle is ready for collection. Repeatable and
 * audited (`collection.ready_reminder_sent`); front desk
 * (workshop.customer.notify). Reuses the original "ready for collection" email. */
export async function sendReadyForCollectionReminder(jobCardId: string): Promise<void> {
  const user = await requireUser();
  // Telling the customer is front-desk work, on a Job Card within reach.
  await authorizeOnJobCard('workshop.customer.notify', jobCardId, 'sendReadyForCollectionReminder');
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      jobNumber: true,
      readyForCollectionAt: true,
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true } },
    },
  });
  if (!jobCard || jobCard.status !== JobCardStatus.READY_FOR_COLLECTION || !jobCard.readyForCollectionAt) {
    throw new WorkshopActionError('This Job Card is not currently ready for collection.');
  }

  const dueDate = addWorkingDays(jobCard.readyForCollectionAt, READY_FOR_COLLECTION_GRACE_WORKING_DAYS);
  const websiteUrl = websiteBaseUrl();
  const orgContext = await getWorkshopOrgContext();

  // Staged reminders (lib/custody-reminders): refused until due.
  const priorSends = await prisma.auditLog.findMany({ where: { entityId: jobCardId, action: 'collection.ready_reminder_sent' }, select: { createdAt: true } });
  const reminderState = custodyReminderState('COLLECTION', jobCard.readyForCollectionAt, priorSends.map((r: { createdAt: Date }) => r.createdAt));
  if (!reminderState.dueNow) {
    throw new WorkshopActionError(notDueYetMessage('COLLECTION', reminderState));
  }

  await writeAuditLog({
    userId: user.id,
    action: 'collection.ready_reminder_sent',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Counted after the audit entry above, so this send is included.
  const reminderNumber = await prisma.auditLog.count({
    where: { entityId: jobCardId, action: 'collection.ready_reminder_sent' },
  });

  await sendEmail(
    jobCard.customer.email,
    `Reminder: your vehicle is ready for collection — Job Card ${jobCard.jobNumber}`,
    renderCustomerReadyForCollectionEmail({
      customerName: jobCard.customer.fullName,
      jobNumber: jobCard.jobNumber,
      vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      dueDate: dueDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' }),
      reminderNumber,
      dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
      logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
      companyName: orgContext.companyName,
      branchName: orgContext.branchName,
    }),
  );
}


// Cached per request.
const currentUserIsMasterAdminCached = cache(currentUserIsMasterAdminUncached);
export async function currentUserIsMasterAdmin(): Promise<boolean> {
  return currentUserIsMasterAdminCached();
}


// Cached per request.
const listEligibleManagersForBranchCached = cache(listEligibleManagersForBranchUncached);
export async function listEligibleManagersForBranch(branchId: string): Promise<EligibleSupervisorResult> {
  if (!(await branchInMyOrganisationOrSystem(branchId))) return { supervisors: [], usingFallback: false };
  return listEligibleManagersForBranchCached(branchId);
}

/** Only within the person's scope (branch); out of scope behaves as "not found". */
export async function getJobCard(id: string) {
  const rec = await getJobCardUnscoped(id);
  if (!rec) return rec;
  const allowed = await canSeeRecord('workshop.job_card.view', { branchId: (rec as { branchId?: string | null }).branchId ?? null }, `JobCard:${id}`);
  return allowed ? rec : null;
}
