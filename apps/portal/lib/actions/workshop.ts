'use server';

/**
 * Workshop Server Actions — Customers, Vehicles, Job Cards.
 *
 * Deliberately implemented as Next.js Server Actions calling @ejo/database
 * directly, NOT as calls to the Render API. Reasoning: apps/portal and
 * apps/api are on different origins (vercel.app vs onrender.com), so a
 * client-side fetch from the portal to the API cannot carry the portal's
 * httpOnly Better Auth session cookie cross-origin. apps/portal already
 * has @ejo/database as a direct dependency and already runs Better Auth
 * itself (see lib/auth.ts) — so verifying the session and querying the
 * database can both happen server-side, in-process, with no cross-origin
 * auth-forwarding problem to solve. The Render API's Workshop module
 * remains available for future external consumers (customer portal,
 * mobile) but the portal's own screens use this, matching how
 * apps/portal/app/api/auth/[...all]/route.ts already runs Better Auth
 * in-process rather than proxying to the API for auth either.
 *
 * No new npm dependencies were added for this file — every import below
 * is already a dependency of apps/portal or packages/database.
 */

import { headers } from 'next/headers';
import { prisma, JobCardStatus, Prisma } from '@ejo/database';
import { COMPANY_BANK_DETAILS, MINIMUM_DEPOSIT_FRACTION, APPROVAL_DEADLINE_WORKING_DAYS, APPROVAL_REMINDER_WORKING_DAYS, CANCELLED_COLLECTION_GRACE_WORKING_DAYS, READY_FOR_COLLECTION_GRACE_WORKING_DAYS } from '@/lib/workshop-constants';
import { workingDaysBetween, addWorkingDays } from '@/lib/utils/working-days';
import { pluralize } from '@/lib/utils/pluralize';
import { hashPassword } from 'better-auth/crypto';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { generateSecurePassword } from '@/lib/utils/generate-password';
import { renderCustomerWelcomeEmail } from '@/lib/email-templates/customer-welcome';
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
import { renderCustomerCollectionOverdueEmail } from '@/lib/email-templates/customer-collection-overdue';
import { renderCustomerJobInProgressEmail } from '@/lib/email-templates/customer-job-in-progress';
import { renderCustomerQualityCheckEmail } from '@/lib/email-templates/customer-quality-check';
import { renderCustomerJobCompletedEmail } from '@/lib/email-templates/customer-job-completed';
import { renderCustomerReadyForCollectionEmail } from '@/lib/email-templates/customer-ready-for-collection';

class WorkshopActionError extends Error {}

/** Verifies the current request has a valid employee session and returns
 * just the authenticated user's id. Every action below calls this first —
 * there is no unauthenticated path into any Workshop data.
 *
 * Deliberately typed as only `{ id: string }`, not the full Prisma `User`
 * shape: Better Auth's own session.user type includes a `name` field,
 * while this project's `User` model has `fullName` instead — the same
 * class of field-naming gap already found and fixed once this session
 * (Account.passwordHash vs Better Auth's expected `password`). Since none
 * of the actions below need anything but the id, claiming the full `User`
 * type here would be an unproven, unnecessary assumption — not something
 * this change should guess at. */
export async function requireUser(): Promise<{ id: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new WorkshopActionError('Not authenticated.');
  }
  return { id: session.user.id };
}

/** Whether the current user holds any role with isSuperAdmin=true — the
 * bootstrap Master Administrator role, matching exactly the same check
 * apps/api's PermissionsGuard uses (see permissions.guard.ts). Built
 * natively here rather than calling apps/api, since portal Server
 * Actions query Prisma directly per this project's established
 * architecture (cross-origin cookies make calling the Render API from
 * here impractical — the same reason every other Workshop action
 * already works this way). */
export async function currentUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

export async function currentUserIsMasterAdmin(): Promise<boolean> {
  const user = await requireUser();
  const match = await prisma.userRole.findFirst({
    where: { userId: user.id, role: { isSuperAdmin: true } },
  });
  return Boolean(match);
}

/** Guards any destructive action — deleting a Vehicle or Job Card
 * removes real data permanently (see deleteVehicle/deleteJobCard below),
 * so only a Master Administrator may do it, matching exactly what was
 * asked for: "not all roles can delete... but I'm master admin so I can
 * do everything." */
async function requireMasterAdmin(): Promise<{ id: string }> {
  const user = await requireUser();
  const match = await prisma.userRole.findFirst({
    where: { userId: user.id, role: { isSuperAdmin: true } },
  });
  if (!match) {
    throw new WorkshopActionError('Only a Master Administrator can delete records.');
  }
  return user;
}

/** Writes to the existing AuditLog model — reused exactly as it already
 * is (its own example action string is literally "job_card.approved"),
 * not duplicated with a parallel history mechanism. Deliberately never
 * throws: an audit-log write failing should never block or roll back
 * the real action it's recording, only be logged for someone to notice.
 * `action` follows a `entity.verb` convention (e.g. "job_card.created",
 * "job_card.approved", "job_card.rejected") so a later reporting view
 * can group/filter by entity or by verb consistently. */
export async function writeAuditLog(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        // Prisma's generated type for a Json column (InputJsonValue) is
        // stricter than a plain `Record<string, unknown>` — it needs
        // every value to be provably JSON-safe, which `unknown` can't
        // guarantee at the type level even though every real call site
        // here only ever passes plain strings/objects it just built
        // itself. This sandbox's local verification stubs Prisma as
        // fully permissive, so this specific mismatch could only be
        // caught by a real build — exactly what happened. Narrow,
        // deliberate cast at the one point it's actually needed, not a
        // blanket `any` on the function's own signature.
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log:', params.action, params.entityId, err);
  }
}

/** Only the Job Card's own assigned supervisor, or a Master
 * Administrator, may approve or reject it — matching "approval must be
 * explicit" and giving a real, checkable answer to "who is allowed to
 * sign off on this," not just whoever happens to open the page. */
async function requireJobCardApprover(jobCard: { supervisorId: string | null }): Promise<{ id: string }> {
  const user = await requireUser();
  if (jobCard.supervisorId === user.id) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  throw new WorkshopActionError('Only the assigned supervisor or a Master Administrator can approve or reject this Job Card.');
}

/** Notifies whoever created a Job Card the moment it's approved or
 * rejected — shared by approveJobCard/rejectJobCard below rather than
 * duplicated, since the "fetch context, build the email, send it"
 * logic is identical either way, only the content differs (handled by
 * renderJobCardDecisionEmail's own branching). Fail-soft, matching
 * every other notification in this file: a transient SMTP hiccup is
 * never a reason to undo a real, already-successful approval/rejection. */
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

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
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send Job Card decision email to creator', params.jobNumber, err);
  }
}

/** The Workshop is currently scoped to a single branch (Isolo) per the
 * project's Phase-One rule — found by its Workshop department rather than
 * a hardcoded ID/name, so this keeps working unchanged once more Workshop
 * branches are added later. */
export async function getWorkshopBranchId(): Promise<string> {
  const department = await prisma.department.findFirst({
    where: { slug: 'workshop' },
    select: { branchId: true },
  });
  if (!department) {
    throw new WorkshopActionError(
      'No branch has a Workshop department yet — run the seed script, or create one under Branches.',
    );
  }
  return department.branchId;
}

/** Resolves which of the two Workshop departments (Passenger / Commercial)
 * a vehicle's Job Cards belong to, using CustomerVehicle.vehicleType as
 * the source of truth — never chosen manually, always derived. Kept
 * separate from getWorkshopBranchId() above (which still resolves the
 * original single "workshop" department, unchanged) so nothing that
 * already depends on that function's exact behavior is affected. */
async function getWorkshopDepartmentForVehicleType(
  vehicleType: 'PASSENGER' | 'COMMERCIAL',
): Promise<{ id: string; name: string }> {
  const branchId = await getWorkshopBranchId();
  const slug = vehicleType === 'PASSENGER' ? 'workshop-passenger' : 'workshop-commercial';
  const department = await prisma.department.findUnique({
    where: { branchId_slug: { branchId, slug } },
    select: { id: true, name: true },
  });
  if (!department) {
    const label = vehicleType === 'PASSENGER' ? 'Passenger' : 'Commercial';
    throw new WorkshopActionError(
      `No ${label} Vehicle Workshop department exists yet — run the seed script, or create one under Departments.`,
    );
  }
  return department;
}

export type EligibleSupervisor = { id: string; fullName: string; email: string };
export type EligibleSupervisorResult = {
  supervisors: EligibleSupervisor[];
  // true when no one has actually been placed into this department with
  // the "Workshop Supervisor" role yet, and the list below is Master
  // Administrators standing in instead — see the note on the function
  // itself for why this exists. The UI must show this plainly, not hide
  // it, so nobody mistakes a fallback list for real department staff.
  usingFallback: boolean;
};

/** Users eligible to be the assigned supervisor/HOD for a given vehicle
 * type — must belong to that vehicle type's Workshop department (via
 * User.departmentId) AND hold the "Workshop Supervisor" role (seeded in
 * seed.ts, reused here rather than inventing a separate "HOD" role
 * name). This is what makes it structurally impossible for the Job Card
 * creation picker to even show a Commercial-side supervisor for a
 * Passenger vehicle, or vice versa.
 *
 * Falls back to Master Administrators when the department has nobody
 * placed into it with that role yet — confirmed by inspection that
 * `/users` and `/roles` are currently placeholder pages with zero
 * functionality, so there is genuinely no way for anyone to set a
 * user's department or role through the product yet. Without this
 * fallback, requiring a real eligible supervisor would make Job Card
 * creation completely blocked for both departments until a separate,
 * much larger Users/Roles admin area is built. The fallback is surfaced
 * to the UI explicitly (`usingFallback: true`), never silently. */
/** The actual eligibility query, shared by both entry points below —
 * one takes a vehicle type (creation flow, department not yet known),
 * the other takes a Job Card whose department is already resolved
 * (reassignment flow). Extracted here rather than duplicated so the
 * eligibility rule (and its Master Admin fallback) only ever lives in
 * one place. */
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

/** For the "reassign supervisor" picker on a Job Card whose department
 * is already known (set at creation, from the vehicle's own type) —
 * no need to re-derive it from a vehicle type again. */
export async function listEligibleSupervisorsForJobCard(jobCardId: string): Promise<EligibleSupervisorResult> {
  await requireUser();
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { departmentId: true },
  });
  if (!jobCard?.departmentId) {
    return { supervisors: [], usingFallback: false };
  }
  return listEligibleSupervisorsForDepartmentId(jobCard.departmentId);
}

/** Real Company/Branch/Department names for the branded email layout's
 * organizational context line — e.g. "Kewalram Nigeria · Isolo Branch ·
 * Workshop". Kept separate from getWorkshopBranchId() above rather than
 * changing its return shape, since that function has another caller
 * (createJobCard) that only ever needs the bare id.
 *
 * `departmentNameOverride` lets a caller show the actual routed
 * department (e.g. "Passenger Vehicle Workshop") instead of the generic
 * "Workshop" — the company/branch lookup is identical either way, only
 * the department label in the returned context changes. */
async function getWorkshopOrgContext(departmentNameOverride?: string): Promise<{
  companyName: string;
  branchName: string;
  departmentName: string;
}> {
  const department = await prisma.department.findFirstOrThrow({
    where: { slug: 'workshop' },
    select: {
      name: true,
      branch: {
        select: {
          name: true,
          businessUnit: { select: { company: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    companyName: department.branch.businessUnit.company.name,
    branchName: department.branch.name,
    departmentName: departmentNameOverride ?? department.name,
  };
}

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

export async function listCustomers(search?: string) {
  await requireUser();
  return prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
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
 * Purpose-built for search-as-you-type pickers (SearchableSelect) —
 * deliberately separate from listCustomers() above, not a shared
 * function with an extra flag. listCustomers() powers the full
 * Customers table page: it needs `_count`/`createdBy`, orders by recency,
 * and caps at 100 for a page of rows. A typeahead dropdown wants none of
 * that — it wants the top ~20 real matches for whatever's been typed,
 * as fast and light as possible, queried against the FULL customer
 * table every time (not a pre-loaded, capped snapshot) so search results
 * are always complete regardless of how large the customer base grows.
 * An empty/blank query deliberately returns nothing rather than "the
 * first 20 customers" — a picker should stay empty until the person
 * actually starts typing, not dump an arbitrary slice of the table.
 */
export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  await requireUser();
  const q = query.trim();
  if (!q) return [];
  return prisma.customer.findMany({
    where: {
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

/**
 * The default suggestions shown in a customer picker before anyone
 * types anything — most-recently-registered customers, matching the
 * "recent" convention already used elsewhere in this file (page-list
 * ordering is `createdAt: 'desc'` throughout). A returning customer
 * from earlier today/this week is very likely to be near the top of a
 * "recent" list, saving staff from typing at all for the common case.
 */
export async function listRecentCustomers(): Promise<CustomerSearchResult[]> {
  await requireUser();
  return prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { id: true, fullName: true, email: true, phone: true },
  });
}

export type CreateCustomerInput = {
  customerType: 'INDIVIDUAL' | 'ORGANIZATION';
  fullName: string;
  address?: string;
  email: string;
  phone?: string;
};

/** Finds an existing customer by email first — per the project rule that
 * a returning customer must never get a duplicate record. Only creates a
 * new row when no existing customer has that email. */
export async function findOrCreateCustomer(input: CreateCustomerInput) {
  const currentUser = await requireUser();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.fullName.trim()) {
    throw new WorkshopActionError('Customer name and email are required.');
  }
  const address = input.address?.trim() || null;
  // Enforced, not just a UI hint — kept brief on purpose (like a VIN)
  // so it never stretches the Job Card layout it's displayed on.
  if (address && address.length > 80) {
    throw new WorkshopActionError('Address must be 80 characters or fewer — keep it brief, e.g. "Plot 3, Cheesebrough, Lagos".');
  }

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    return { customer: existing, wasExisting: true, welcomeEmailSent: false };
  }

  const branchId = await getWorkshopBranchId();
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    select: { businessUnit: { select: { companyId: true } } },
  });

  const customer = await prisma.customer.create({
    data: {
      companyId: branch.businessUnit.companyId,
      customerType: input.customerType,
      fullName: input.fullName.trim(),
      address,
      email,
      phone: input.phone?.trim() || null,
      createdById: currentUser.id,
    },
  });

  const orgContext = await getWorkshopOrgContext();
  const welcomeEmailSent = await provisionCustomerAccountAndWelcomeEmail(customer, orgContext);

  return { customer, wasExisting: false, welcomeEmailSent };
}

/** Creates the customer's Better Auth credential row (a random temporary
 * password, hashed the same way seed.ts hashes the Master Administrator's)
 * and emails it via the branded welcome template.
 *
 * Deliberately never throws: a customer record is a real, valuable
 * business outcome on its own — an SMTP hiccup shouldn't roll that back
 * or block the staff member at the counter. Failure is caught, logged,
 * and reported back via the `welcomeEmailSent` flag instead, so the UI
 * can tell staff to relay the details manually if it ever happens. */
async function provisionCustomerAccountAndWelcomeEmail(
  customer: { id: string; fullName: string; email: string },
  orgContext: { companyName: string; branchName: string; departmentName: string },
): Promise<boolean> {
  try {
    const temporaryPassword = generateSecurePassword();
    await prisma.customerAccount.create({
      data: {
        customerId: customer.id,
        accountId: customer.id,
        providerId: 'credential',
        password: await hashPassword(temporaryPassword),
      },
    });

    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    await sendEmail(
      customer.email,
      'Your Kewalram customer account is ready',
      renderCustomerWelcomeEmail({
        customerName: customer.fullName,
        email: customer.email,
        temporaryPassword,
        loginUrl: `${websiteUrl}/customer-portal`,
        logoUrl: `${websiteUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to provision customer account / send welcome email:', err);
    return false;
  }
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
 * Every vehicle belonging to one customer, for the Job Card cascading
 * picker — always scoped to a single customerId (never the whole
 * table), so no search query or debouncing is needed here: a real
 * customer's own vehicle count is inherently small and bounded, unlike
 * "search all customers" or "search all vehicles system-wide". The
 * `take: 50` is a sanity cap, not a real-world limit anyone should hit.
 *
 * Includes vehicleType now — the Job Card creation picker needs to know
 * a selected vehicle's type immediately, to fetch the right department's
 * eligible supervisors without a separate round trip.
 */
export async function listVehiclesForCustomer(customerId: string): Promise<VehicleSearchResult[]> {
  await requireUser();
  if (!customerId) return [];
  return prisma.customerVehicle.findMany({
    where: { customerId },
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
  return prisma.customerVehicle.findUnique({
    where: { id },
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

/** Nigerian plates (2011 format) are 3 letters + 3 digits + 2 letters,
 * commonly written with spaces (e.g. "LAG 123 AA"). Stored normalized —
 * uppercased, spaces collapsed to single spaces — so "lag123aa" and
 * "LAG 123 AA" are correctly treated as the same plate for duplicate
 * detection, rather than silently allowed as two different rows. */
function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** VINs are internationally standardized at exactly 17 characters, no
 * spaces. Stored uppercased for consistent duplicate matching. */
function normalizeChassis(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export async function createVehicle(input: CreateVehicleInput) {
  const currentUser = await requireUser();
  if (!input.customerId) {
    throw new WorkshopActionError('A vehicle must belong to a customer.');
  }

  // Required at the server, not just via the form's `required` attribute
  // — a form's client-side validation can always be bypassed, so this is
  // the actual enforcement. Mileage and engine number stay optional
  // (mileage is also captured per Job Card check-in; engine number is
  // sometimes genuinely unavailable) — Make/Model/Year/Plate/Chassis/
  // Vehicle Type are the fields that make a registration meaningfully
  // identify a real, specific vehicle rather than an empty placeholder
  // row, and correctly place it in one of the Workshop's two sections.
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

  // Friendly, specific error before hitting the database's own unique
  // constraint (which still exists as a safety net for the rare case of
  // two near-simultaneous submissions racing past this check).
  const existingByPlate = await prisma.customerVehicle.findUnique({ where: { plateNumber } });
  if (existingByPlate) {
    throw new WorkshopActionError(`A vehicle with plate number "${plateNumber}" is already registered.`);
  }
  const existingByChassis = await prisma.customerVehicle.findUnique({ where: { chassisNumber } });
  if (existingByChassis) {
    throw new WorkshopActionError(`A vehicle with chassis/VIN "${chassisNumber}" is already registered.`);
  }

  return prisma.customerVehicle.create({
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
};

/** Mirrors createVehicle()'s own validation exactly — same required
 * fields, same normalization, same 17-character VIN check — with the
 * one necessary difference: duplicate plate/chassis checks exclude
 * this vehicle's own current row, so saving a vehicle's existing
 * plate/chassis back unchanged never wrongly flags itself as a
 * duplicate. */
export async function updateVehicle(input: UpdateVehicleInput): Promise<void> {
  const currentUser = await requireUser();
  const existing = await prisma.customerVehicle.findUnique({ where: { id: input.id } });
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

/** The real "who last edited this, and when" — derived from AuditLog,
 * the single source of truth already used everywhere else in this
 * project for counts and history, never a separate updatedBy/updatedAt
 * pair on the entity itself that could silently drift out of sync with
 * what the audit trail actually says happened. Returns null when no
 * matching entry exists yet — an entity that's never been edited since
 * creation genuinely has no "last edited" story to tell. */
export async function getLastEditInfo(entityType: string, entityId: string, action: string): Promise<{ userName: string; at: Date } | null> {
  await requireUser();
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

/** Permanently removes a vehicle and, via schema-level cascades, every
 * Job Card (and each of those Job Cards' complaints) that reference it —
 * exactly "every of their job data... entirely from database" as asked
 * for. Irreversible; the UI must confirm before calling this. */
export async function deleteVehicle(vehicleId: string): Promise<void> {
  await requireMasterAdmin();
  await prisma.customerVehicle.delete({ where: { id: vehicleId } });
}

// ---------------------------------------------------------------------------
// JOB CARDS
// ---------------------------------------------------------------------------

/** JC-<year>-<sequence>, e.g. "JC-2026-000042". Sequence is derived from
 * the count of Job Cards already created this year — simple and readable.
 * Two calls close enough together can read the same count before either
 * insert lands, both producing the same number — this DID happen in
 * production (a real "Unique constraint failed on jobNumber" crash, not
 * just the theoretical risk this comment used to describe). Not fixed
 * here directly — the caller (createJobCard) retries with a fresh call
 * to this function on exactly that collision, which is what actually
 * closes the gap; regenerating the format here alone wouldn't help. */
/** JC-<year>-<sequence>, e.g. "JC-2026-000042".
 *
 * Previously derived the sequence from a row COUNT, which turned out to
 * be the actual bug behind the reported crash: a count only matches the
 * highest sequence in use if every number from 1 upward is still
 * present with no gaps. If even one Job Card was ever deleted directly
 * (the same way other data has been cleared via Supabase before), the
 * count permanently undercounts relative to what's actually been used —
 * and since a FAILED create doesn't add a row, retrying this function
 * after a collision recomputed the exact same wrong number every time,
 * which is exactly what the Vercel logs showed: the identical error,
 * five times in a row, for one request.
 *
 * Fixed by deriving the next number from the MAXIMUM existing jobNumber
 * for this year instead of a count — this is correct regardless of any
 * gaps from deletions. String-descending order on `jobNumber` correctly
 * matches numeric order here specifically because the sequence portion
 * is always zero-padded to a fixed 6 digits (e.g. "000002" sorts before
 * "000010" as a string too, unlike unpadded numbers).
 */
async function generateJobNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JC-${year}-`;
  const latest = await prisma.jobCard.findFirst({
    where: { jobNumber: { startsWith: prefix } },
    orderBy: { jobNumber: 'desc' },
    select: { jobNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.jobNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

export async function listJobCards(status?: JobCardStatus, search?: string, vehicleType?: 'PASSENGER' | 'COMMERCIAL') {
  await requireUser();
  const q = search?.trim();

  return prisma.jobCard.findMany({
    where: {
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
      vehicle: { select: { make: true, model: true, plateNumber: true, vehicleType: true } },
      assignedTechnician: { select: { fullName: true } },
    },
  });
}

export async function getJobCard(id: string) {
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
      branch: { select: { name: true } },
      complaints: { orderBy: { sequenceNumber: 'asc' } },
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

/** The Job Card's own chronological audit trail — reads the same
 * AuditLog rows writeAuditLog() creates, filtered to this one entity,
 * newest first. Nothing here is a separate history mechanism; it's a
 * read view onto the one shared audit log. */
export async function getJobCardAuditTrail(jobCardId: string): Promise<JobCardAuditEntry[]> {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'JobCard', entityId: jobCardId },
    orderBy: { createdAt: 'desc' },
    take: 50,
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
};

/** Re-validates a chosen supervisor server-side — never trusts that the
 * client-side picker's own filtering was followed correctly. Mirrors
 * exactly the two cases listEligibleSupervisorsForVehicleType() can
 * return: a real department supervisor, or (while no one has been
 * placed into the department yet) a Master Administrator standing in. */
async function isEligibleSupervisor(userId: string, departmentId: string): Promise<boolean> {
  const match = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      OR: [
        { departmentId, roles: { some: { role: { slug: 'workshop-supervisor' } } } },
        { roles: { some: { role: { isSuperAdmin: true } } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(match);
}

export async function createJobCard(input: CreateJobCardInput) {
  const user = await requireUser();
  const complaints = input.complaints.map((c) => c.trim()).filter((c) => c.length > 0);
  if (!input.customerId || !input.vehicleId || complaints.length === 0) {
    throw new WorkshopActionError('Customer, vehicle, and at least one complaint are required to open a Job Card.');
  }
  if (!input.supervisorId) {
    throw new WorkshopActionError('A supervisor must be assigned to open a Job Card.');
  }

  // The routed department is derived from the vehicle's own recorded
  // type — never taken from client input — so it's structurally
  // impossible for a Job Card to be routed to the wrong department by a
  // client-side mistake or tampering.
  const vehicle = await prisma.customerVehicle.findUnique({
    where: { id: input.vehicleId },
    select: { vehicleType: true, make: true, model: true, plateNumber: true },
  });
  if (!vehicle) {
    throw new WorkshopActionError('That vehicle could not be found.');
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

  // Retries on a jobNumber collision specifically — now a genuine
  // safety net for true concurrent-request races (two creations landing
  // close enough together to both read the same "latest" number before
  // either insert completes), rather than the primary fix — the actual
  // bug (a permanently wrong number from a row-count/gap mismatch, not
  // a timing race) is fixed in generateJobNumber() itself above. Any
  // other kind of failure (validation, connection issue, etc.) is
  // re-thrown immediately, not retried.
  //
  // Captures the created row into `created` and `break`s on success,
  // rather than returning directly from inside the loop — the
  // supervisor notification email below needs to run exactly once,
  // after a genuinely successful creation, never inside the retry loop
  // itself (which could otherwise fire it multiple times on retries).
  async function attemptCreate(jobNumber: string) {
    return prisma.jobCard.create({
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
  }

  const MAX_ATTEMPTS = 5;
  let created: Awaited<ReturnType<typeof attemptCreate>> | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const jobNumber = await generateJobNumber();
    try {
      created = await attemptCreate(jobNumber);
      break;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      const target = (err as { meta?: { target?: unknown } } | null)?.meta?.target;
      // Prisma's `meta.target` shape for a unique-constraint violation
      // varies slightly by database provider — usually an array of
      // column names on Postgres, but checking for a string too costs
      // nothing and removes any dependency on getting that exactly right.
      const isJobNumberCollision =
        code === 'P2002' &&
        ((Array.isArray(target) && target.includes('jobNumber')) ||
          (typeof target === 'string' && target.includes('jobNumber')));
      if (isJobNumberCollision && attempt < MAX_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new WorkshopActionError('Could not generate a unique Job Card number after several attempts — please try again.');
  }

  // Notify the assigned supervisor — best-effort, fail-soft, matching
  // the exact same pattern already used for the customer welcome email
  // (Phase 3): a transient SMTP hiccup is not a reason to undo a real,
  // already-successful Job Card creation.
  try {
    const orgContext = await getWorkshopOrgContext(department.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send supervisor notification email for Job Card', created.jobNumber, err);
  }

  // Notify the customer too — a genuinely separate try/catch from the
  // supervisor email above, deliberately: one failing (e.g. a bad
  // customer email address) must never prevent the other from sending,
  // and vice versa. Website URL, not portal — the customer's own
  // dashboard lives on apps/website, not apps/portal.
  try {
    const orgContext = await getWorkshopOrgContext(department.name);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    await sendEmail(
      created.customer.email,
      `We've received your vehicle — Job Card ${created.jobNumber}`,
      renderCustomerJobCardAcknowledgmentEmail({
        customerName: created.customer.fullName,
        jobNumber: created.jobNumber,
        vehicleDescription: [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        complaints: created.complaints.map((c: (typeof created.complaints)[number]) => c.description),
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${created.id}`,
        logoUrl: `${websiteUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer acknowledgment email for Job Card', created.jobNumber, err);
  }

  await writeAuditLog({
    userId: user.id,
    action: 'job_card.created',
    entityType: 'JobCard',
    entityId: created.id,
    metadata: { jobNumber: created.jobNumber, departmentId: department.id, supervisorId: input.supervisorId },
  });

  return created;
}

export async function updateJobCardStatus(id: string, status: JobCardStatus) {
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
      department: { select: { name: true } },
      customer: { select: { fullName: true, email: true } },
      vehicle: { select: { make: true, model: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  // Closed is the Manager's own sign-off that a completed job was
  // genuinely collected and confirmed — not a routine status change
  // any staff member should be able to set on their own.
  if (status === JobCardStatus.CLOSED) {
    await requireEligibleManager(jobCard.branchId);
  }
  // A cancelled Job Card is terminal — dead, in the plainest sense.
  // Nothing about it can be edited or re-progressed; the one thing
  // that still legitimately happens to it is the vehicle's eventual
  // physical exit, once whoever finally collects it does.
  if (jobCard.status === JobCardStatus.CANCELLED && status !== JobCardStatus.CHECKED_OUT) {
    throw new WorkshopActionError('This Job Card is cancelled — the only status change available is checking the vehicle out.');
  }
  const priorStatus = jobCard.status;
  const result = await prisma.jobCard.update({
    where: { id },
    data: {
      status,
      closedAt: status === JobCardStatus.CLOSED ? new Date() : undefined,
      readyForCollectionAt: status === JobCardStatus.READY_FOR_COLLECTION ? new Date() : undefined,
      // Only ever set once — the first genuine arrival at each status
      // — never overwritten by a later return to the same status
      // (e.g. IN_PROGRESS after AWAITING_PARTS resolves), so these
      // stay a true "when did this actually start/finish" record.
      workStartedAt: status === JobCardStatus.IN_PROGRESS && !jobCard.workStartedAt ? new Date() : undefined,
      completedAt: status === JobCardStatus.COMPLETED && !jobCard.completedAt ? new Date() : undefined,
      checkedOutAt: status === JobCardStatus.CHECKED_OUT && !jobCard.checkedOutAt ? new Date() : undefined,
    },
  });

  // Fires exactly once, on a real transition into one of these four
  // statuses — never on a no-op re-save of the same status. AWAITING_
  // PARTS deliberately has no customer email at all (internal-only by
  // design — reflects on the portal, notifies the store/finance
  // department once that system exists, not built yet).
  if (priorStatus !== status && (
    status === JobCardStatus.IN_PROGRESS
    || status === JobCardStatus.QUALITY_CHECK
    || status === JobCardStatus.COMPLETED
    || status === JobCardStatus.READY_FOR_COLLECTION
  )) {
    try {
      const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
      const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
      const vehicleDescription = [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
      const dashboardUrl = `${websiteUrl}/customer-portal/dashboard`;
      const logoUrl = `${websiteUrl}/images/logo/logo.png`;
      const shared = {
        customerName: jobCard.customer.fullName,
        jobNumber: jobCard.jobNumber,
        vehicleDescription,
        dashboardUrl,
        logoUrl,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      };

      if (status === JobCardStatus.IN_PROGRESS) {
        await sendEmail(
          jobCard.customer.email,
          `Your vehicle is now in progress — Job Card ${jobCard.jobNumber}`,
          renderCustomerJobInProgressEmail(shared),
        );
      } else if (status === JobCardStatus.QUALITY_CHECK) {
        await sendEmail(
          jobCard.customer.email,
          `Quality assurance in progress — Job Card ${jobCard.jobNumber}`,
          renderCustomerQualityCheckEmail(shared),
        );
      } else if (status === JobCardStatus.COMPLETED) {
        await sendEmail(
          jobCard.customer.email,
          `Quality inspection passed — Job Card ${jobCard.jobNumber}`,
          renderCustomerJobCompletedEmail(shared),
        );
      } else {
        const dueDate = addWorkingDays(new Date(), READY_FOR_COLLECTION_GRACE_WORKING_DAYS);
        await sendEmail(
          jobCard.customer.email,
          `Ready for collection — Job Card ${jobCard.jobNumber}`,
          renderCustomerReadyForCollectionEmail({
            ...shared,
            dueDate: dueDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          }),
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to send status-lifecycle email', id, status, err);
    }
  }

  await writeAuditLog({
    userId: user.id,
    action: 'job_card.status_updated',
    entityType: 'JobCard',
    entityId: id,
    metadata: { from: priorStatus, to: status },
  });

  return result;
}

/** The supervisor (or Master Admin) signs off that the Job Card is
 * correctly opened and ready to proceed — the explicit approval step,
 * separate from and not inferable from `status`. */
export async function approveJobCard(jobCardId: string, notes?: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, jobNumber: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const approver = await requireJobCardApprover(jobCard);

  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: approver.id,
      approvedAt: new Date(),
      rejectionReason: null,
      approvalNotes: notes?.trim() || null,
    },
  });

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

/** Returns the Job Card to the creator for correction — the required
 * short `reason` is what shows in the UI's status badge (e.g.
 * "Rejected — Incomplete vehicle information"); `notes` is optional,
 * longer commentary. */
export async function rejectJobCard(jobCardId: string, reason: string, notes?: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new WorkshopActionError('A reason is required to reject a Job Card.');
  }
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { supervisorId: true, jobNumber: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const approver = await requireJobCardApprover(jobCard);

  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: approver.id,
      approvedAt: new Date(),
      rejectionReason: trimmedReason,
      approvalNotes: notes?.trim() || null,
      // Deliberately cleared, not left pointing at the rejecting
      // supervisor — a rejection means nobody currently owns this Job
      // Card as supervisor, freeing the creator to route it to someone
      // else eligible in the same department. The rejection itself,
      // who made it, and why all stay fully visible via the fields
      // above and the audit log below — clearing this one field only
      // affects "who is currently assigned," never the historical
      // record of what happened.
      supervisorId: null,
    },
  });

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

/** Routes a Job Card to a different supervisor — used after the
 * current one has rejected it (their name is deliberately no longer
 * attached; see rejectJobCard above) and the creator wants to try
 * someone else eligible in the same department. Only the Job Card's
 * own creator, or a Master Administrator, may do this — matching
 * exactly who was asked to be able to.
 *
 * Resets the whole approval dimension back to PENDING and clears the
 * previous decision's fields — a fresh supervisor deserves a fresh
 * decision, not one carried over from someone else. This mirrors
 * exactly how assignTechnician() already resets the acceptance
 * dimension on every (re)assignment; same principle, applied here for
 * consistency. */
export async function reassignSupervisor(jobCardId: string, newSupervisorId: string): Promise<void> {
  const user = await requireUser();
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      createdById: true,
      departmentId: true,
      jobNumber: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true } },
      complaints: { orderBy: { sequenceNumber: 'asc' } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  if (jobCard.createdById !== user.id && !(await currentUserIsMasterAdmin())) {
    throw new WorkshopActionError('Only this Job Card\'s creator or a Master Administrator can reassign the supervisor.');
  }
  if (!jobCard.departmentId) {
    throw new WorkshopActionError('This Job Card has no Workshop department set — cannot validate supervisor eligibility.');
  }
  if (!(await isEligibleSupervisor(newSupervisorId, jobCard.departmentId))) {
    throw new WorkshopActionError('The selected supervisor is not eligible for this Job Card\'s Workshop department.');
  }

  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: {
      supervisorId: newSupervisorId,
      approvalStatus: 'PENDING',
      approvedById: null,
      approvedAt: null,
      rejectionReason: null,
      approvalNotes: null,
    },
  });

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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send supervisor reassignment email for Job Card', jobCard.jobNumber, err);
  }
}

/** Permanently removes a Job Card and, via schema-level cascades, its
 * complaints. Does NOT touch the Customer or Vehicle it belonged to.
 * Irreversible; the UI must confirm before calling this. */
export async function deleteJobCard(jobCardId: string): Promise<void> {
  await requireMasterAdmin();
  await prisma.jobCard.delete({ where: { id: jobCardId } });
}

/** Assigns a technician and resets the acceptance workflow to PENDING —
 * being assigned isn't the same as having agreed to do it (see the
 * technicianAcceptanceStatus field comment on JobCard). Reassigning to
 * someone new correctly clears any previous person's response; their
 * accept/reject has no bearing on a different person's assignment.
 * Notifies the technician — fail-soft, matching every other
 * notification in this file. */
export async function assignTechnician(jobCardId: string, technicianId: string) {
  await requireUser();
  const jobCard = await prisma.jobCard.update({
    where: { id: jobCardId },
    data: {
      assignedTechnicianId: technicianId,
      technicianAcceptanceStatus: 'PENDING',
      technicianRespondedAt: null,
      technicianRejectionReason: null,
    },
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

  try {
    const technician = await prisma.user.findUnique({
      where: { id: technicianId },
      select: { fullName: true, email: true },
    });
    if (!technician) return jobCard;
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      technician.email,
      `You've been assigned to Job Card ${jobCard.jobNumber}`,
      renderTechnicianJobCardAssignedEmail({
        technicianName: technician.fullName,
        jobNumber: jobCard.jobNumber,
        customerName: jobCard.customer.fullName,
        vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        complaints: jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => c.description),
        supervisorName: jobCard.supervisor?.fullName ?? 'Supervisor',
        jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCard.id}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send technician assignment email for Job Card', jobCard.jobNumber, err);
  }

  return jobCard;
}

/** Only the assigned technician, or a Master Administrator, may respond
 * to an assignment — same reasoning and shape as
 * requireJobCardApprover above, applied to a different actor. */
async function requireAssignedTechnician(jobCard: { assignedTechnicianId: string | null }): Promise<{ id: string }> {
  const user = await requireUser();
  if (jobCard.assignedTechnicianId === user.id) {
    return user;
  }
  if (await currentUserIsMasterAdmin()) {
    return user;
  }
  throw new WorkshopActionError('Only the assigned technician or a Master Administrator can respond to this assignment.');
}

/** Notifies the supervisor of a technician's response — shared by
 * acceptTechnicianAssignment/rejectTechnicianAssignment below, same
 * "one shared notify function, template branches internally" pattern
 * as notifyJobCardCreatorOfDecision. */
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

    await sendEmail(
      jobCard.supervisor.email,
      params.response === 'ACCEPTED'
        ? `Assignment accepted on Job Card ${params.jobNumber}`
        : `Assignment rejected on Job Card ${params.jobNumber}`,
      renderTechnicianResponseEmail({
        response: params.response,
        supervisorName: jobCard.supervisor.fullName,
        jobNumber: params.jobNumber,
        customerName: jobCard.customer.fullName,
        technicianName: technician?.fullName ?? 'Technician',
        rejectionReason: params.rejectionReason,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${params.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send technician response email to supervisor', params.jobNumber, err);
  }
}

export async function acceptTechnicianAssignment(jobCardId: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { assignedTechnicianId: true, jobNumber: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const technician = await requireAssignedTechnician(jobCard);

  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: {
      technicianAcceptanceStatus: 'ACCEPTED',
      technicianRespondedAt: new Date(),
      technicianRejectionReason: null,
    },
  });

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
    select: { assignedTechnicianId: true, jobNumber: true },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  const technician = await requireAssignedTechnician(jobCard);

  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: {
      // Fully reset back to the "never assigned" state, not left
      // pointing at the rejecting technician — they said no, so they
      // shouldn't still show as "the assigned technician" while the
      // supervisor picks someone else. The full rejection record (who,
      // when, why) is preserved below in the audit log regardless of
      // these fields being cleared — clearing only affects "who is
      // currently assigned," never the historical record.
      assignedTechnicianId: null,
      technicianAcceptanceStatus: null,
      technicianRespondedAt: null,
      technicianRejectionReason: null,
    },
  });

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

/** Users who can be assigned to a Job Card. Deliberately not filtered by
 * a "Technician" role yet — this project's Roles/Permissions admin UI
 * doesn't have a way to assign roles to users yet, so filtering by role
 * here would just hide every real user until that's built. Showing each
 * user's role name(s) alongside their name lets staff pick correctly in
 * the meantime; narrowing this to a real role filter is a small, natural
 * follow-up once role assignment exists, not a redesign. */
export async function listTechnicianCandidates() {
  await requireUser();
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// DASHBOARD — real counts, replacing the hardcoded 32/7/18/11
// ---------------------------------------------------------------------------

export async function getWorkshopDashboardCounts() {
  await requireUser();
  // Same definitions as getWorkshopCustodySummary() below, so the two
  // pages never quietly disagree about what "active" or "in the
  // workshop" actually means. "Active" — the user's own framing,
  // confirmed directly — is every Job Card that isn't dead
  // (CANCELLED) and hasn't physically left (CHECKED_OUT). "In
  // workshop" is broader: every vehicle still physically present,
  // CANCELLED included, since an uncollected cancelled vehicle is
  // still sitting right there taking up space.
  const [activeJobCards, totalCustomers, totalVehicles, inWorkshop] = await Promise.all([
    prisma.jobCard.count({
      where: { status: { notIn: [JobCardStatus.CANCELLED, JobCardStatus.CHECKED_OUT] } },
    }),
    prisma.customer.count(),
    prisma.customerVehicle.count(),
    prisma.jobCard.count({
      where: { status: { not: JobCardStatus.CHECKED_OUT } },
    }),
  ]);
  return { activeJobCards, totalCustomers, totalVehicles, inWorkshop };
}

// ---------------------------------------------------------------------------
// ESTIMATES — structured line items across four types (Store Part /
// External Job / Labour / Sundry), one Estimate per Job Card for now.
// `version` on Estimate exists for a later phase (revision approval) to
// extend into real versioning without restructuring this — nothing here
// increments it yet.
//
// Lifecycle: DRAFT (technician and supervisor build it up together,
// prices can be left blank — real workshop practice is that different
// people fill in their own portion at different times) → SUBMITTED
// (technician marks it done; every line must have a price by this
// point, enforced right here, not before) → APPROVED (supervisor signs
// off). A Manager-level approval tier above this, and the customer/
// admin-facing hand-off once approved, are a later phase — not modeled
// yet, so this phase's terminal state is the supervisor's own approval.
//
// Deliberately still out of scope here: the cash-advance/receipt
// tracking for EXTERNAL_JOB entries, real store-inventory sync/pricing,
// Part Request/Issue Slips, and photo/evidence attachments — each is
// its own real, separate piece of work, not folded in.
// ---------------------------------------------------------------------------

export type EstimateLineItemType = 'STORE_PART' | 'EXTERNAL_PART' | 'EXTERNAL_JOB' | 'INTERNAL_JOB' | 'LABOUR' | 'SUNDRY';

/** Human-readable names for server-side error messages — a small,
 * separate map from the UI's own display labels (which live in the
 * page component and can't be imported into a 'use server' file, per
 * the export-shape rule that broke a build once already). */
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
  /** Optional while the estimate is still DRAFT — see the lifecycle
   * note above. Required (validated) once submitForValidation() runs. */
  unitPrice?: number;
  /** Only meaningful for a STORE_PART line — which generic kind of
   * part the technician is actually requesting (e.g. "Fuel Filter"),
   * for Store to later match against the real, vehicle-fitting
   * catalog Part. `description` still gets filled in from the chosen
   * PartType's own name for display, but this is the real, structured
   * link Store's matching step depends on. */
  partTypeId?: string;
  /** Only meaningful for a non-STORE_PART line — a STORE_PART line's
   * unit is set automatically once Store matches it, never by
   * whoever adds the line. */
  unitOfMeasure?: string;
};

/** Who can add to or edit a Job Card's estimate — the assigned
 * supervisor, the assigned technician, or a Master Administrator.
 * Deliberately permissive at this stage (the controlled-approval gate
 * is a later phase's job), but every line still records exactly who
 * entered or last touched it. */
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
  throw new WorkshopActionError(
    'Only the assigned supervisor, the assigned technician, or a Master Administrator can work on this estimate.',
  );
}

/** Who's actually allowed to set the PRICE on a given line type — a
 * real, deliberate restriction distinct from requireEstimateContributor
 * above, which only governs adding/editing a line at all. A technician
 * only knows the true cost of what they personally sourced or had done
 * outside the workshop (EXTERNAL_PART/EXTERNAL_JOB) — everything else
 * (Store's own parts, the company's Labour/Sundry charges) is priced
 * by the supervisor, who has broader pricing authority across every
 * type, matching the same supervisor-outranks-technician hierarchy
 * already established everywhere else in this file. Only checked when
 * a price is actually being set — leaving a line unpriced (still
 * allowed while DRAFT) never needs this check at all. */
async function requirePricingAuthority(
  type: EstimateLineItemType,
  jobCard: { supervisorId: string | null; assignedTechnicianId: string | null },
  userId: string,
): Promise<void> {
  if (await currentUserIsMasterAdmin()) return;
  if (userId === jobCard.supervisorId) return;
  const technicianPriceableTypes: EstimateLineItemType[] = ['EXTERNAL_PART', 'EXTERNAL_JOB'];
  if (userId === jobCard.assignedTechnicianId && technicianPriceableTypes.includes(type)) return;
  throw new WorkshopActionError(
    type === 'EXTERNAL_PART' || type === 'EXTERNAL_JOB'
      ? 'Only the assigned technician or supervisor can set a price for an external part or job.'
      : 'Only the assigned supervisor can set a price for this line — the technician can add the description and quantity, but not the price.',
  );
}

export async function getJobCardEstimate(jobCardId: string) {
  await requireUser();
  return prisma.estimate.findUnique({
    where: { jobCardId },
    include: {
      lineItems: {
        orderBy: { createdAt: 'asc' },
        include: {
          enteredBy: { select: { fullName: true } },
          partType: { select: { name: true, category: { select: { name: true } } } },
          matchedPart: { select: { name: true } },
        },
      },
      approvedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      matchingRequestedBy: { select: { fullName: true } },
    },
  });
}

/** Adds one line item, creating the Estimate itself on first use — a
 * Job Card has no estimate until someone actually adds a line, and
 * only once the Job Card itself has been approved by its supervisor
 * (an unapproved Job Card shouldn't have pricing work happening on it
 * yet). `amount` is only ever computed here, server-side, from
 * `quantity * unitPrice` when both are actually known — never taken
 * from client input, and left null when unitPrice is still blank
 * (DRAFT-stage entries are allowed to have no price yet). */
export async function addEstimateLineItem(jobCardId: string, input: EstimateLineItemInput): Promise<void> {
  // A Store Part line's description is never trusted from client input
  // — it's derived server-side from the real PartType's own name below,
  // the same "never trust the client for something authoritative"
  // principle as amount always being computed here, never taken as
  // given. Every other line type still requires a real, non-empty
  // description as before.
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
  // Only Sundry is capped at one line — real evidence (an actual
  // Kewalram paper estimate showing "Labour for Service" and "Labour
  // for Brake" as two separate lines on one job) confirmed Labour
  // needs to support multiple entries too, same as INTERNAL_JOB.
  const cappedTypes: EstimateLineItemType[] = ['SUNDRY'];
  if (cappedTypes.includes(input.type) && estimate.lineItems.some((li: { type: string }) => li.type === input.type)) {
    throw new WorkshopActionError(
      `A ${ESTIMATE_LINE_TYPE_DISPLAY[input.type]} line already exists on this estimate — edit it instead of adding another.`,
    );
  }
  if (input.unitPrice !== undefined) {
    // A Store Part line's price can only ever come from Store's own
    // real match against the catalog (matchEstimateStorePartLine) —
    // never typed directly here, not even by a Supervisor. Allowing
    // it here would silently defeat the entire reason this exists:
    // every store-sourced price staying tied to a real, current
    // Goods Receipt cost, never a guess.
    if (input.type === 'STORE_PART') {
      throw new WorkshopActionError('A Store Part line is priced by Store matching it to a real catalog Part, not typed in directly.');
    }
    await requirePricingAuthority(input.type, jobCard, contributor.id);
  }
  // A Store Part line is meaningless without a real PartType to match
  // against later — this is the one thing that genuinely can't be
  // filled in after the fact the way a price can, so it's enforced
  // right at creation, not left as a gap Store discovers downstream.
  if (input.type === 'STORE_PART' && !input.partTypeId) {
    throw new WorkshopActionError('A Store Part line must specify which Part Type is needed.');
  }
  if (input.type === 'STORE_PART' && input.partTypeId) {
    // The real description, looked up here rather than trusted from
    // whatever the client happened to send — the same principle as
    // amount always being computed server-side below.
    const partType = await prisma.partType.findUnique({ where: { id: input.partTypeId }, select: { name: true } });
    if (!partType) {
      throw new WorkshopActionError('That Part Type no longer exists.');
    }
    description = partType.name;
  }
  if (input.type === 'STORE_PART' && input.unitOfMeasure) {
    // Same principle as price: a Store Part's real unit can only ever
    // come from the matched Part's own baseUnitOfMeasure once Store
    // matches it — never set here, even if something was passed in.
    throw new WorkshopActionError('A Store Part line\'s unit is set automatically once Store matches it, not entered directly.');
  }

  const amount = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;

  await prisma.estimateLineItem.create({
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
  });

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
  /** Only meaningful for a non-STORE_PART line — same reasoning as
   * addEstimateLineItem's own unitOfMeasure field. */
  unitOfMeasure?: string;
};

/** Edits an existing line — description, quantity, and/or price.
 * Allowed while the estimate is DRAFT or SUBMITTED (the supervisor
 * validating a submitted estimate can still correct it, per the
 * workflow this phase implements), locked once APPROVED, matching how
 * a closed Job Card is treated elsewhere in this codebase. */
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
      matchedPartId: true,
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
  if (lineItem.estimate.status === 'MANAGER_APPROVED') {
    throw new WorkshopActionError('This estimate has already been approved by the manager and can no longer be edited.');
  }
  // A quantity change on an already-matched Store Part line would
  // silently leave its price computed against the old, now-wrong
  // quantity — Store's own match is the only path allowed to set
  // quantity and price together, correctly, in one place. Editing
  // description here is still fine; it's purely informational once
  // matched, the real request is the linked PartType/Part.
  if (lineItem.type === 'STORE_PART' && lineItem.matchedPartId && input.quantity !== undefined) {
    throw new WorkshopActionError('This line has already been matched by Store — Store must re-match it to change the quantity, not edit it directly.');
  }
  const editor = await requireEstimateContributor(lineItem.estimate.jobCard);
  if (input.unitPrice !== undefined) {
    if (lineItem.type === 'STORE_PART') {
      throw new WorkshopActionError('A Store Part line is priced by Store matching it to a real catalog Part, not typed in directly.');
    }
    await requirePricingAuthority(lineItem.type, lineItem.estimate.jobCard, editor.id);
  }
  if (input.unitOfMeasure !== undefined && lineItem.type === 'STORE_PART') {
    throw new WorkshopActionError('A Store Part line\'s unit is set automatically once Store matches it, not entered directly.');
  }

  const amount = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;

  await prisma.estimateLineItem.update({
    where: { id: lineItemId },
    data: {
      description,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      amount,
      ...(lineItem.type !== 'STORE_PART' ? { unitOfMeasure: input.unitOfMeasure?.trim() || null } : {}),
    },
  });

  await writeAuditLog({
    userId: editor.id,
    action: 'estimate.line_item_updated',
    entityType: 'JobCard',
    entityId: lineItem.estimate.jobCardId,
    metadata: { type: lineItem.type, description, quantity: input.quantity, unitPrice: input.unitPrice, amount },
  });
}

/** Whoever entered a line, the assigned supervisor, or a Master
 * Administrator may remove it — a technician can correct their own
 * mistake, but can't erase someone else's entry without the
 * supervisor's or an admin's oversight. Locked once APPROVED. */
export async function deleteEstimateLineItem(lineItemId: string): Promise<void> {
  const lineItem = await prisma.estimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      enteredById: true,
      description: true,
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
  if (lineItem.estimate.status === 'MANAGER_APPROVED') {
    throw new WorkshopActionError('This estimate has already been approved by the manager and can no longer be edited.');
  }
  const user = await requireUser();
  const isOwnEntry = lineItem.enteredById === user.id;
  const isSupervisor = lineItem.estimate.jobCard.supervisorId === user.id;
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (!isOwnEntry && !isSupervisor && !isMasterAdmin) {
    throw new WorkshopActionError('Only whoever entered this line, the assigned supervisor, or a Master Administrator can remove it.');
  }

  await prisma.estimateLineItem.delete({ where: { id: lineItemId } });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.line_item_removed',
    entityType: 'JobCard',
    entityId: lineItem.estimate.jobCardId,
    metadata: { description: lineItem.description },
  });
}

/** Technician (or supervisor/admin) marks the estimate done and sends
 * it to the supervisor to validate — this is the one place pricing
 * actually becomes required: every line must have a unit price before
 * this transition is allowed. Draft-stage blanks are fine right up
 * until this point, never before it. */
/** Shared by notifySupervisorAboutEstimate/notifyTechnicianAboutEstimate
 * below — a lightweight, repeatable "please take a look" nudge while
 * the estimate is still being built, genuinely distinct from
 * submitEstimateForValidation()'s one-time, formal, all-prices-required
 * hand-off. This never changes the estimate's status at all — it's
 * just informal communication, which is exactly why it doesn't reuse
 * that function. Records an audit entry either way (even if the email
 * fails) so the back-and-forth itself stays visible in the trail. */
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      toUser.email,
      `A note on the estimate for Job Card ${jobCard.jobNumber}`,
      renderEstimateNudgeEmail({
        recipientName: toUser.fullName,
        fromName: fromUser?.fullName ?? 'A team member',
        fromRole: params.fromRole,
        jobNumber: jobCard.jobNumber,
        customerName: jobCard.customer.fullName,
        note: params.note,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${params.jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate nudge email', params.jobCardId, err);
  }
}

/** The assigned technician nudges the supervisor to check the
 * estimate — the informal counterpart to a formal submission, usable
 * any time while still building it up together. */
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
    throw new WorkshopActionError('Only the assigned technician can notify the supervisor about this estimate.');
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

/** The supervisor nudges the assigned technician to review or price
 * the estimate. */
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
      lineItems: { select: { unitPrice: true, amount: true, description: true } },
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
  const missingPricesOn = estimate.lineItems.filter((li: { unitPrice: unknown }) => li.unitPrice === null);
  if (missingPricesOn.length > 0) {
    throw new WorkshopActionError(
      `Every line needs a price before submitting — missing on: ${missingPricesOn.map((li: { description: string }) => li.description).join(', ')}.`,
    );
  }
  const user = await requireEstimateContributor(estimate.jobCard);

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.submitted',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Notify the supervisor — fail-soft, matching every other
  // notification in this file.
  try {
    if (!estimate.jobCard.supervisor) return;
    const submitter = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const orgContext = await getWorkshopOrgContext(estimate.jobCard.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
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
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-submitted email to supervisor', jobCardId, err);
  }
}

/** The assigned supervisor (or a Master Admin) signs off on a
 * submitted estimate. This phase's terminal state — routing to a
 * Manager tier above this is a later phase, not modeled yet. */
/** A Manager oversees a whole branch — both Passenger and Commercial
 * Workshop departments — unlike a Supervisor, who's scoped to one
 * department. Eligibility is therefore checked by branch, reusing the
 * existing seeded "Workshop Manager" role (confirmed already present
 * in seed.ts, not a role invented for this phase) rather than the
 * department-scoped pattern used for supervisors. Same Master Admin
 * fallback as everywhere else this project checks eligibility — see
 * listEligibleSupervisorsForVehicleType's own comment for why that
 * exists (no admin UI yet to place anyone into a role). */
export async function listEligibleManagersForBranch(branchId: string): Promise<EligibleSupervisorResult> {
  await requireUser();
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
}

/** Any eligible manager for the branch, or a Master Admin, may perform
 * the manager-approval step — there's no single "assigned manager" on
 * a Job Card the way there is a supervisor or technician, since a
 * Manager's oversight spans the whole branch; whichever eligible
 * manager acts first completes the review. */
export async function requireEligibleManager(branchId: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await currentUserIsMasterAdmin()) return user;
  const match = await prisma.user.findFirst({
    where: { id: user.id, branchId, roles: { some: { role: { slug: 'workshop-manager' } } } },
    select: { id: true },
  });
  if (!match) {
    throw new WorkshopActionError('Only a Workshop Manager for this branch, or a Master Administrator, can approve this.');
  }
  return user;
}

export async function approveEstimate(jobCardId: string): Promise<void> {
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
          branch: { select: { name: true, businessUnit: { select: { company: { select: { name: true } } } } } },
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
  // Every Store Part line must have been matched to a real, priced
  // catalog Part by Store before the Supervisor can give final sign-
  // off — the whole reason for this gate: nothing should reach HOD,
  // and nothing should reach the customer, with a store-sourced line
  // still priced on nothing more than a technician's guess.
  const unmatchedStoreParts = estimate.lineItems.filter(
    (li: (typeof estimate.lineItems)[number]) => li.type === 'STORE_PART' && !li.matchedPartId,
  );
  if (unmatchedStoreParts.length > 0) {
    throw new WorkshopActionError(
      `${pluralize(unmatchedStoreParts.length, 'Store Part line')} still ${unmatchedStoreParts.length === 1 ? 'needs' : 'need'} to be matched by Store before this estimate can be approved.`,
    );
  }
  const user = await requireJobCardApprover(estimate.jobCard);

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.approved',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Notify every eligible manager for the branch — fail-soft, matching
  // every other notification in this file. Sent once the approval and
  // audit log are already committed, so a failed send here never
  // undoes the real, already-successful approval.
  try {
    const managers = await listEligibleManagersForBranch(estimate.jobCard.branchId);
    if (managers.supervisors.length === 0) return;
    const approver = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const lineItems = await prisma.estimateLineItem.findMany({ where: { estimateId: estimate.id }, select: { amount: true } });
    const total = lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const companyName = estimate.jobCard.branch.businessUnit.company.name;
    const branchName = estimate.jobCard.branch.name;
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Estimate for Job Card ${estimate.jobCard.jobNumber} ready for your review`,
        renderEstimateReadyForManagerEmail({
          managerName: manager.fullName,
          jobNumber: estimate.jobCard.jobNumber,
          customerName: estimate.jobCard.customer.fullName,
          approvedByName: approver?.fullName ?? 'The supervisor',
          totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName,
          branchName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-ready-for-manager email', jobCardId, err);
  }
}

/** The Workshop Manager's own sign-off — this phase's actual terminal
 * state. The customer is notified the moment this happens, with the
 * unified, type-hidden view (see customer-estimate-approved.ts's own
 * comment for why the internal Store Part/External/Labour/Sundry
 * breakdown must never reach this specific email). Simplified from the
 * fuller "Manager reviews, sends to an Admin block, which then notifies
 * the customer" chain described — a distinct third role beyond Manager
 * and Master Admin wasn't clearly specified, so this step notifies the
 * customer directly rather than guess at what a separate Admin role
 * would add. */
export async function approveEstimateAsManager(jobCardId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { jobCardId },
    select: {
      id: true,
      status: true,
      jobCard: {
        select: {
          branchId: true,
          jobNumber: true,
          createdBy: { select: { fullName: true, email: true } },
          customer: { select: { fullName: true } },
          branch: { select: { name: true, businessUnit: { select: { company: { select: { name: true } } } } } },
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
  const user = await requireEligibleManager(estimate.jobCard.branchId);

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: 'MANAGER_APPROVED', managerApprovedAt: new Date(), managerApprovedById: user.id },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.manager_approved',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Notify whoever created the Job Card — the Manager approving is
  // not the same as anyone deciding the customer should be told. That
  // decision belongs to this person specifically; see
  // notifyCustomerOfApprovedEstimate below for the actual customer
  // hand-off, which this person triggers explicitly, not automatically.
  // Fail-soft, matching every other notification in this file.
  try {
    const manager = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const lineItems = await prisma.estimateLineItem.findMany({ where: { estimateId: estimate.id }, select: { amount: true } });
    const total = lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    await sendEmail(
      estimate.jobCard.createdBy.email,
      `Estimate for Job Card ${estimate.jobCard.jobNumber} approved by manager`,
      renderEstimateReadyForCustomerNotificationEmail({
        recipientName: estimate.jobCard.createdBy.fullName,
        jobNumber: estimate.jobCard.jobNumber,
        customerName: estimate.jobCard.customer.fullName,
        approvedByManagerName: manager?.fullName ?? 'The manager',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: estimate.jobCard.branch.businessUnit.company.name,
        branchName: estimate.jobCard.branch.name,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-ready-for-customer-notification email', jobCardId, err);
  }
}

/** The explicit hand-off to the customer — only the Job Card's own
 * creator, or a Master Admin, may trigger this, and only once the
 * Manager has approved. Deliberately not automatic: the Manager
 * approving means the numbers are right, not that anyone has decided
 * the customer should be told yet. That's this person's call. */
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
          vehicle: { select: { make: true, model: true, plateNumber: true } },
          customer: { select: { fullName: true, email: true } },
          branch: { select: { name: true, businessUnit: { select: { company: { select: { name: true } } } } } },
        },
      },
      lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true } },
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
    throw new WorkshopActionError('Only whoever created this Job Card, or a Master Administrator, can notify the customer.');
  }
  if (estimate.customerNotifiedAt) {
    throw new WorkshopActionError('The customer has already been notified about this estimate.');
  }

  await prisma.$transaction([
    prisma.estimate.update({
      where: { id: estimate.id },
      data: { customerNotifiedAt: new Date(), customerNotifiedById: user.id },
    }),
    // The workshop's own process is done the moment the customer is
    // told — this transition happens right here, not as a separate
    // manual step, matching exactly when it's meant to occur.
    prisma.jobCard.update({
      where: { id: jobCardId },
      data: { status: JobCardStatus.AWAITING_CUSTOMER_APPROVAL },
    }),
  ]);

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.customer_notified',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  try {
    // Combined "Parts & Services" figure — every kind of parts/work
    // sourced or performed, merged into one — versus Labour and
    // Sundry kept separate, exactly the three-way split the customer
    // should see. Never STORE_PART/EXTERNAL_PART/etc individually.
    const servicesTypes = new Set(['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB']);
    let servicesTotal = 0;
    let labourTotal = 0;
    let sundryTotal = 0;
    for (const li of estimate.lineItems as { type: string; amount: unknown }[]) {
      const amount = Number(li.amount ?? 0);
      if (li.type === 'LABOUR') labourTotal += amount;
      else if (li.type === 'SUNDRY') sundryTotal += amount;
      else if (servicesTypes.has(li.type)) servicesTotal += amount;
    }
    const total = servicesTotal + labourTotal + sundryTotal;
    const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
    const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    const vehicleDescription = [estimate.jobCard.vehicle.make, estimate.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const paymentRemarkSuggestion = [estimate.jobCard.jobNumber, vehicleDescription, estimate.jobCard.vehicle.plateNumber]
      .filter(Boolean)
      .join(' — ');

    await sendEmail(
      estimate.jobCard.customer.email,
      `Your estimate for Job Card ${estimate.jobCard.jobNumber} has been approved`,
      renderCustomerEstimateApprovedEmail({
        customerName: estimate.jobCard.customer.fullName,
        jobNumber: estimate.jobCard.jobNumber,
        vehicleDescription,
        lineItems: (estimate.lineItems as { description: string; quantity: number; unitOfMeasure: string | null; amount: unknown }[]).map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitOfMeasure: li.unitOfMeasure,
          amount: formatNaira(Number(li.amount ?? 0)),
        })),
        servicesSubtotal: servicesTotal > 0 ? formatNaira(servicesTotal) : undefined,
        labourSubtotal: labourTotal > 0 ? formatNaira(labourTotal) : undefined,
        sundrySubtotal: sundryTotal > 0 ? formatNaira(sundryTotal) : undefined,
        totalAmount: formatNaira(total),
        minimumDepositAmount: formatNaira(minimumDeposit),
        bankName: COMPANY_BANK_DETAILS.bankName,
        accountName: COMPANY_BANK_DETAILS.accountName,
        accountNumber: COMPANY_BANK_DETAILS.accountNumber,
        paymentRemarkSuggestion,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
        logoUrl: `${websiteUrl}/images/logo/logo.png`,
        companyName: estimate.jobCard.branch.businessUnit.company.name,
        branchName: estimate.jobCard.branch.name,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer estimate-approved email', jobCardId, err);
  }
}


// ---------------------------------------------------------------------------
// PAYMENTS — recorded by Finance after seeing proof of a bank transfer or
// receiving cash at the cashier. A real, minimal audit record (who, how
// much, by what method) rather than a bare "paid" flag. Deliberately
// separate from the approval decision below: recording can happen more
// than once (deposit, then balance), approval is the one deliberate act
// that actually unblocks the workshop's own work.
//
// The customer uploading their own proof directly, and a real payment
// gateway, are both later phases — this is the foundation they'd build
// on, not a substitute for them.
// ---------------------------------------------------------------------------

export type PaymentMethod = 'BANK_TRANSFER' | 'CASH';

/** A Finance Officer for the branch, or a Master Admin, may record or
 * approve payments — same branch-scoped eligibility pattern already
 * used for Workshop Managers (Finance, like Manager, oversees the
 * whole branch, not one department), same Master Admin fallback. */
export async function listEligibleFinanceOfficersForBranch(branchId: string): Promise<EligibleSupervisorResult> {
  await requireUser();
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

async function requireEligibleFinanceOfficer(branchId: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await currentUserIsMasterAdmin()) return user;
  const match = await prisma.user.findFirst({
    where: { id: user.id, branchId, roles: { some: { role: { slug: 'finance-officer' } } } },
    select: { id: true },
  });
  if (!match) {
    throw new WorkshopActionError('Only a Finance Officer for this branch, or a Master Administrator, can do this.');
  }
  return user;
}

export async function getJobCardPayments(jobCardId: string) {
  await requireUser();
  return prisma.payment.findMany({
    where: { jobCardId },
    orderBy: { recordedAt: 'asc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
}

/** Records one payment toward a Job Card — only meaningful once the
 * customer has actually been asked to pay. */
/** Records one payment toward a Job Card — `amount` is always exactly
 * what's recorded, full stop. Any dropdown of suggestions in the UI
 * (70%, full, remaining balance) is purely a convenience that fills
 * this field in before the form is submitted; it is never a separate
 * value the server trusts on its own. This function has no concept of
 * "preset" at all — it only ever sees the final number, which is the
 * actual, correct fix for a real reported bug where a stale dropdown
 * selection silently overrode a manually-typed amount.
 *
 * Rejects any amount that would push the cumulative total past the
 * estimate — recording ₦12,000.01 against a ₦12,000 estimate, or
 * ₦3,700 against a ₦3,600 remaining balance, is refused with a clear
 * message rather than silently accepted.
 *
 * No per-payment minimum otherwise — payments genuinely accumulate
 * over multiple entries (a deposit, then a balance later, in
 * whatever increments the customer actually pays in), and it's the
 * *cumulative* total that matters.
 *
 * Approval is fully automatic: the moment the cumulative total first
 * reaches the 70% minimum deposit, this same call moves the Job Card
 * to IN_PROGRESS and sends the "requirement met" broadcast — there is
 * no separate manual approval step for Finance to remember to click.
 * A customer who pays in several small installments (₦1,000, then
 * ₦2,000, then ₦3,000, and so on) is still recorded correctly every
 * time; approval fires automatically the moment the running total
 * first clears 70%, whichever specific payment that happens to be. */
export async function recordPayment(
  jobCardId: string,
  amount: number,
  method: PaymentMethod,
  notes?: string,
): Promise<void> {
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
      customer: { select: { fullName: true, email: true } },
      department: { select: { name: true } },
      estimate: { select: { lineItems: { select: { amount: true } } } },
      payments: { select: { amount: true } },
    },
  });
  if (!jobCard) {
    throw new WorkshopActionError('Job Card not found.');
  }
  // Payments continue to accumulate even after the 70% deposit has
  // already moved the Job Card to IN_PROGRESS — a customer paying in
  // installments needs to keep recording right up until the full
  // amount is reached, not just during the brief window before work
  // starts.
  if (jobCard.status !== JobCardStatus.AWAITING_CUSTOMER_APPROVAL && jobCard.status !== JobCardStatus.IN_PROGRESS) {
    throw new WorkshopActionError('Payments can only be recorded once the customer has been notified and is awaiting approval, or while work is in progress.');
  }
  const user = await requireEligibleFinanceOfficer(jobCard.branchId);

  const total = (jobCard.estimate?.lineItems ?? []).reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
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

  const newTotal = prospectiveTotal;
  const justMetDeposit = alreadyPaid < minimumDeposit && newTotal >= minimumDeposit;
  const justCompletedFull = alreadyPaid < roundedTotal && newTotal >= roundedTotal;
  const shouldAutoApprove = jobCard.status === JobCardStatus.AWAITING_CUSTOMER_APPROVAL && (justMetDeposit || justCompletedFull);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        jobCardId,
        amount: roundedAmount,
        method,
        notes: notes?.trim() || null,
        recordedById: user.id,
      },
    }),
    ...(shouldAutoApprove
      ? [prisma.jobCard.update({ where: { id: jobCardId }, data: { status: JobCardStatus.IN_PROGRESS } })]
      : []),
  ]);

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

  // "Recorded" — Finance and Manager only, every time, no threshold
  // language at all. The technician, supervisor, and Job Card creator
  // have no financial role and don't need every individual amount;
  // what actually concerns them is the milestone below, not the raw
  // recording event.
  try {
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send payment-recorded update emails', jobCardId, err);
  }

  // The milestone broadcasts — every real party on the Job Card
  // (creator, supervisor, technician, every eligible Manager, every
  // eligible Finance Officer), but only ever ONE of these two, and
  // only on the specific payment that actually crosses the line. If a
  // single payment crosses both thresholds at once (paid in full in
  // one go), only the more complete "paid in full" fact is sent.
  if (justMetDeposit || justCompletedFull) {
    try {
      const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

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
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        } else {
          await sendEmail(
            recipient.email,
            `Deposit requirement met on Job Card ${jobCard.jobNumber}`,
            renderPaymentRequirementMetEmail({
              recipientName: recipient.fullName,
              jobNumber: jobCard.jobNumber,
              customerName: jobCard.customer.fullName,
              totalPaidSoFar: formatNaira(newTotal),
              totalEstimate: formatNaira(roundedTotal),
              jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              companyName: orgContext.companyName,
              branchName: orgContext.branchName,
              departmentName: orgContext.departmentName,
            }),
          );
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to send payment milestone emails', jobCardId, err);
    }
  }

  try {
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
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
        logoUrl: `${websiteUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer payment-received email', jobCardId, err);
  }
}

// ---------------------------------------------------------------------------
// CANCELLATION — a two-step request/decision workflow, same shape as every
// other approval gate in this file: an employee (the creator, the assigned
// supervisor, or a Master Admin) logs a cancellation request with a reason
// — covering a request that arrived by phone, email, in person, or through
// the customer's own dashboard — and a Workshop Manager approves or
// declines it. JobCard.status is never touched until an actual approval
// happens; a declined request needs nothing "reverted" because nothing
// was ever changed in the first place.
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
  throw new WorkshopActionError(
    "Only this Job Card's creator, its assigned supervisor, or a Master Administrator can request cancellation.",
  );
}

export async function getCancellationRequests(jobCardId: string) {
  await requireUser();
  return prisma.cancellationRequest.findMany({
    where: { jobCardId },
    orderBy: { requestedAt: 'desc' },
    include: {
      requestedBy: { select: { fullName: true } },
      decidedBy: { select: { fullName: true } },
    },
  });
}

/** Logs the request and notifies every eligible Manager for the
 * branch — the Job Card's own status is deliberately untouched here. */
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
  if (jobCard.status === JobCardStatus.CANCELLED || jobCard.status === JobCardStatus.CLOSED) {
    throw new WorkshopActionError('This Job Card is already cancelled or closed.');
  }
  const user = await requireJobCardCreatorOrSupervisor(jobCard);

  const existingPending = await prisma.cancellationRequest.findFirst({
    where: { jobCardId, status: 'PENDING' },
    select: { id: true },
  });
  if (existingPending) {
    throw new WorkshopActionError('A cancellation request is already pending for this Job Card.');
  }

  await prisma.cancellationRequest.create({
    data: { jobCardId, reason: trimmedReason, requestedById: user.id },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'cancellation.requested',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { reason: trimmedReason },
  });

  try {
    const requester = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const orgContext = await getWorkshopOrgContext(jobCard.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const managers = await listEligibleManagersForBranch(jobCard.branchId);
    for (const manager of managers.supervisors) {
      await sendEmail(
        manager.email,
        `Cancellation requested — Job Card ${jobCard.jobNumber}`,
        renderCancellationRequestedEmail({
          managerName: manager.fullName,
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          requestedByName: requester?.fullName ?? 'A team member',
          reason: trimmedReason,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send cancellation-requested emails', jobCardId, err);
  }
}

/** The Manager's approval — the one moment JobCard.status actually
 * changes to CANCELLED, and the only moment the full broadcast (every
 * real staff party, plus the customer, each their own appropriately-
 * scoped email) goes out. */
export async function approveCancellationRequest(requestId: string, decisionNotes?: string): Promise<void> {
  const request = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
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
  const user = await requireEligibleManager(request.jobCard.branchId);

  await prisma.$transaction([
    prisma.cancellationRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNotes: decisionNotes?.trim() || null,
      },
    }),
    prisma.jobCard.update({
      where: { id: request.jobCardId },
      data: { status: JobCardStatus.CANCELLED },
    }),
  ]);

  await writeAuditLog({
    userId: user.id,
    action: 'cancellation.approved',
    entityType: 'JobCard',
    entityId: request.jobCardId,
    metadata: { reason: request.reason, notes: decisionNotes?.trim() || undefined },
  });

  try {
    const approver = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const orgContext = await getWorkshopOrgContext(request.jobCard.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

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
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send staff cancellation-broadcast emails', request.jobCardId, err);
  }

  try {
    const orgContext = await getWorkshopOrgContext(request.jobCard.department?.name);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    await sendEmail(
      request.jobCard.customer.email,
      `Job Card ${request.jobCard.jobNumber} cancelled`,
      renderCustomerJobCardCancelledEmail({
        customerName: request.jobCard.customer.fullName,
        jobNumber: request.jobCard.jobNumber,
        vehicleDescription: [request.jobCard.vehicle.make, request.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${request.jobCardId}`,
        logoUrl: `${websiteUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer cancellation email', request.jobCardId, err);
  }
}

/** The Manager's decline — the Job Card's status is never touched,
 * matching how nothing was ever changed by the request itself. Only
 * the original requester is notified. */
export async function declineCancellationRequest(requestId: string, decisionNotes?: string): Promise<void> {
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
  const user = await requireEligibleManager(request.jobCard.branchId);

  await prisma.cancellationRequest.update({
    where: { id: requestId },
    data: {
      status: 'DECLINED',
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNotes: decisionNotes?.trim() || null,
    },
  });

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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send cancellation-declined email', request.jobCardId, err);
  }
}

// ---------------------------------------------------------------------------
// WORKSHOP CUSTODY — vehicles physically present and not yet checked out
// (every Job Card not CLOSED), categorized for the "Vehicles In Custody"
// dashboard, plus the approval-deadline and cancellation-collection-grace
// engine described above each function.
// ---------------------------------------------------------------------------

export type WorkshopCustodyEntry = {
  id: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  status: string;
  /** Working days elapsed since the relevant anchor — customer
   * notification for AWAITING_CUSTOMER_APPROVAL, cancellation approval
   * for CANCELLED, the move to Ready for Collection for that status.
   * Always 0 for In Service entries, which have no deadline of this
   * kind. */
  daysElapsed: number;
  /** The full working-day grace period this category allows — only
   * set for the three action-required categories. */
  totalGraceWorkingDays?: number;
  /** MAX(0, totalGraceWorkingDays - daysElapsed) — never negative,
   * reads naturally as "how much time is genuinely left." */
  daysRemaining?: number;
  /** How many reminder/notice emails have actually gone out for this
   * entry, derived from the audit trail itself — never a separate
   * counter that could drift out of sync with what was really sent. */
  remindersSent?: number;
  /** ISO date string — set for AWAITING_CUSTOMER_APPROVAL, CANCELLED,
   * and READY_FOR_COLLECTION alike, the real calendar date the
   * deadline falls on. */
  dueDate?: string;
  isOverdue: boolean;
  /** Only ever set for an AWAITING_CUSTOMER_APPROVAL entry that
   * currently has a cancellation request awaiting a Manager's
   * decision — lets the dashboard show the exact same pending-request
   * state (and the same Approve/Decline actions) the Job Card detail
   * page already shows, so a Manager can act from either place. */
  pendingCancellationRequest?: { id: string; reason: string; requestedByName: string };
};

const CUSTODY_REMINDER_ACTIONS = ['approval.reminder_sent', 'collection.overdue_notice_sent', 'collection.ready_reminder_sent'] as const;

/** The data behind the "Vehicles In Custody" dashboard — every real
 * vehicle physically present in the workshop and not yet checked out,
 * categorized the way staff actually need to act on them: the three
 * genuinely time-sensitive, action-required categories (awaiting the
 * customer's approval, cancelled but not yet collected, ready for
 * collection but not yet collected — each with a real deadline, a
 * real days-remaining figure, and a real reminder count pulled from
 * the audit trail), and In Service as the simpler catch-all for
 * everything still moving through the workshop's own process. */
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
      // Excludes only CHECKED_OUT — the genuine "physically left the
      // workshop" marker. CLOSED is deliberately still included: it's
      // an administrative sign-off, not confirmation the vehicle has
      // actually gone, so a Job Card can sit CLOSED with its vehicle
      // still in the yard for a moment before check-out.
      status: { not: JobCardStatus.CHECKED_OUT },
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
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true } },
      estimate: { select: { customerNotifiedAt: true } },
      // Every request, not just approved ones — the same array
      // yields both the "most recent approval" anchor for a cancelled
      // entry AND the current pending request (if any) for an
      // awaiting-approval entry, without a second query.
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
    customer: { fullName: string };
    vehicle: { make: string | null; model: string | null };
    estimate: { customerNotifiedAt: Date | null } | null;
    cancellationRequests: { id: string; status: string; reason: string; decidedAt: Date | null; requestedBy: { fullName: string } }[];
  }>) {
    const vehicleDescription = [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const base = {
      id: jc.id,
      jobNumber: jc.jobNumber,
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

  // One batched count query for every action-required entry's real
  // reminder history, rather than one query per entry — the audit
  // trail is the single source of truth for this count, never a
  // separate field that could quietly drift out of sync with what was
  // actually sent.
  const actionRequiredIds = [...awaitingApproval, ...cancelledPendingCollection, ...readyForCollection].map((e) => e.id);
  if (actionRequiredIds.length > 0) {
    const counts = await prisma.auditLog.groupBy({
      by: ['entityId'],
      where: { entityId: { in: actionRequiredIds }, action: { in: [...CUSTODY_REMINDER_ACTIONS] } },
      _count: { _all: true },
    });
    // entityId is nullable on AuditLog in general (some historical
    // actions don't relate to a specific entity), even though every
    // row this specific query returns is guaranteed non-null by the
    // where clause above — the type system doesn't know that, so this
    // filters defensively rather than asserting it.
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

/** Sends the "action required" reminder to a customer whose estimate
 * is awaiting approval — repeatable, not a one-time send, since a
 * single reminder isn't always enough to get a response. Every send
 * is logged to the audit trail (`approval.reminder_sent`), which is
 * also how the real count shown on the dashboard is derived — no
 * separate counter field to keep in sync, the audit trail is the one
 * source of truth. `reminderSentAt` still tracks the most recent send
 * for display. Callable directly by any Workshop staff, and also
 * called automatically by runApprovalDeadlineChecks() below. */
export async function sendApprovalReminder(jobCardId: string): Promise<void> {
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
          lineItems: { select: { amount: true } },
        },
      },
    },
  });
  if (!jobCard || jobCard.status !== JobCardStatus.AWAITING_CUSTOMER_APPROVAL || !jobCard.estimate?.customerNotifiedAt) {
    throw new WorkshopActionError('This Job Card is not currently awaiting customer approval.');
  }

  const total = jobCard.estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
  const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  const dueDate = addWorkingDays(jobCard.estimate.customerNotifiedAt, APPROVAL_DEADLINE_WORKING_DAYS);
  const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
  const orgContext = await getWorkshopOrgContext();

  await prisma.estimate.update({ where: { id: jobCard.estimate.id }, data: { reminderSentAt: new Date() } });

  await writeAuditLog({
    userId: user.id,
    action: 'approval.reminder_sent',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Counted after writing the audit entry above, so this send is
  // itself included — "our 1st reminder" on the very first one, "our
  // 2nd" on the next, and so on, always derived from the real trail.
  const reminderNumber = await prisma.auditLog.count({
    where: { entityId: jobCardId, action: 'approval.reminder_sent' },
  });

  await sendEmail(
    jobCard.customer.email,
    `Action required — Job Card ${jobCard.jobNumber} awaiting your approval`,
    renderCustomerApprovalReminderEmail({
      customerName: jobCard.customer.fullName,
      jobNumber: jobCard.jobNumber,
      vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      totalEstimate: formatNaira(total),
      minimumDepositAmount: formatNaira(minimumDeposit),
      dueDate: dueDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      reminderNumber,
      dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
      logoUrl: `${websiteUrl}/images/logo/logo.png`,
      companyName: orgContext.companyName,
      branchName: orgContext.branchName,
    }),
  );
}

/** Stands in for the future scheduled job until Vercel Cron (or
 * equivalent) is actually wired up — Master Admin only, since this
 * represents "run today's automated checks now," not a normal staff
 * action. Sends the reminder to anyone who's reached the reminder
 * threshold and hasn't been sent one yet. Deliberately never
 * auto-cancels anything, even once the full deadline has passed — a
 * business shouldn't lose the ability to extend genuine grace (a
 * customer who calls to explain, asks for one more day), so a Job
 * Card past its deadline is only counted here, surfaced for a human
 * to review. Actually cancelling it still goes through the normal,
 * Manager-approved cancellation request, the same as any other
 * cancellation — never this function's own decision. */
export async function runApprovalDeadlineChecks(): Promise<{ remindersSent: number; overdueCount: number }> {
  if (!(await currentUserIsMasterAdmin())) {
    throw new WorkshopActionError('Only a Master Administrator can run this check.');
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

    // Deliberately never auto-cancels — a business shouldn't lose the
    // ability to extend grace for a genuine reason (a customer who
    // calls to explain, asks for one more day). Past the deadline,
    // this only counts the Job Card as needing a human decision;
    // actually cancelling it still goes through the normal, Manager-
    // approved cancellation request, same as any other cancellation.
    if (daysElapsed >= APPROVAL_DEADLINE_WORKING_DAYS) {
      overdueCount += 1;
    } else if (daysElapsed >= APPROVAL_REMINDER_WORKING_DAYS && !jc.estimate.reminderSentAt) {
      try {
        await sendApprovalReminder(jc.id);
        remindersSent += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to send approval reminder', jc.id, err);
      }
    }
  }

  return { remindersSent, overdueCount };
}

/** The deliberate, manual step for a cancelled Job Card's uncollected
 * vehicle — never automatic. A Manager or HOD reviews what the
 * dashboard surfaces and decides whether to actually notify the
 * customer; this function is both the review action and the trigger,
 * since only an eligible Manager (or Master Admin) can call it at
 * all. */
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
  const user = await requireEligibleManager(jobCard.branchId);
  const daysElapsed = workingDaysBetween(anchor, new Date());

  await writeAuditLog({
    userId: user.id,
    action: 'collection.overdue_notice_sent',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { daysElapsed, notes: notes?.trim() || undefined },
  });

  // Counted after writing the audit entry above, so this send is
  // itself included.
  const reminderNumber = await prisma.auditLog.count({
    where: { entityId: jobCardId, action: 'collection.overdue_notice_sent' },
  });

  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
  const orgContext = await getWorkshopOrgContext();
  await sendEmail(
    jobCard.customer.email,
    `Please arrange collection — Job Card ${jobCard.jobNumber}`,
    renderCustomerCollectionOverdueEmail({
      customerName: jobCard.customer.fullName,
      jobNumber: jobCard.jobNumber,
      vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      daysSinceCancellationLabel: pluralize(daysElapsed, 'working day'),
      reminderNumber,
      dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
      logoUrl: `${websiteUrl}/images/logo/logo.png`,
      companyName: orgContext.companyName,
      branchName: orgContext.branchName,
    }),
  );
}

/** Sends a reminder to a customer whose vehicle is ready for
 * collection — repeatable, same as the other two reminder actions,
 * every send logged to the audit trail (`collection.ready_reminder_
 * sent`), callable by any Workshop staff at any time this Job Card is
 * READY_FOR_COLLECTION, not gated on being overdue first. Reuses the
 * exact same customer email as the original "ready for collection"
 * notice — the facts haven't changed, just that this is a repeat of
 * them. */
export async function sendReadyForCollectionReminder(jobCardId: string): Promise<void> {
  const user = await requireUser();
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
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
  const orgContext = await getWorkshopOrgContext();

  await writeAuditLog({
    userId: user.id,
    action: 'collection.ready_reminder_sent',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  // Counted after writing the audit entry above, so this send is
  // itself included.
  const reminderNumber = await prisma.auditLog.count({
    where: { entityId: jobCardId, action: 'collection.ready_reminder_sent' },
  });

  await sendEmail(
    jobCard.customer.email,
    `Reminder — ready for collection, Job Card ${jobCard.jobNumber}`,
    renderCustomerReadyForCollectionEmail({
      customerName: jobCard.customer.fullName,
      jobNumber: jobCard.jobNumber,
      vehicleDescription: [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      dueDate: dueDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      reminderNumber,
      dashboardUrl: `${websiteUrl}/customer-portal/dashboard#jobcard-${jobCardId}`,
      logoUrl: `${websiteUrl}/images/logo/logo.png`,
      companyName: orgContext.companyName,
      branchName: orgContext.branchName,
    }),
  );
}
