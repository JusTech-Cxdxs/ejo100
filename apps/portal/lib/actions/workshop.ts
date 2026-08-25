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
async function requireUser(): Promise<{ id: string }> {
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
async function writeAuditLog(params: {
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
async function getWorkshopBranchId(): Promise<string> {
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
  fullName: string;
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
      fullName: input.fullName.trim(),
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

export type CreateVehicleInput = {
  customerId: string;
  make?: string;
  model?: string;
  vehicleType?: 'PASSENGER' | 'COMMERCIAL';
  year?: number;
  plateNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
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
      mileage: input.mileage ?? null,
      createdById: currentUser.id,
    },
  });
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
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard`,
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
  await requireUser();
  return prisma.jobCard.update({
    where: { id },
    data: {
      status,
      closedAt: status === JobCardStatus.CLOSED ? new Date() : undefined,
    },
  });
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
  const [activeJobCards, totalCustomers, totalVehicles, inWorkshop] = await Promise.all([
    prisma.jobCard.count({
      where: { status: { notIn: [JobCardStatus.CLOSED, JobCardStatus.CANCELLED] } },
    }),
    prisma.customer.count(),
    prisma.customerVehicle.count(),
    prisma.jobCard.count({
      where: { status: { in: [JobCardStatus.CHECKED_IN, JobCardStatus.IN_PROGRESS, JobCardStatus.AWAITING_PARTS, JobCardStatus.QUALITY_CHECK] } },
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

export type EstimateLineItemType = 'STORE_PART' | 'EXTERNAL_PART' | 'EXTERNAL_JOB' | 'LABOUR' | 'SUNDRY';

export type EstimateLineItemInput = {
  type: EstimateLineItemType;
  description: string;
  quantity: number;
  /** Optional while the estimate is still DRAFT — see the lifecycle
   * note above. Required (validated) once submitForValidation() runs. */
  unitPrice?: number;
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
        include: { enteredBy: { select: { fullName: true } } },
      },
      approvedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
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
  // Only Sundry is capped at one line — Labour genuinely needs to
  // support several distinct entries on one Job Card (wheel alignment
  // AND an AC gas refill AND injector servicing can all be needed on
  // the same vehicle at once), so it's no longer restricted here.
  if (input.type === 'SUNDRY' && estimate.lineItems.some((li: { type: string }) => li.type === 'SUNDRY')) {
    throw new WorkshopActionError('A Sundry line already exists on this estimate — edit it instead of adding another.');
  }
  if (input.unitPrice !== undefined) {
    await requirePricingAuthority(input.type, jobCard, contributor.id);
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
  const editor = await requireEstimateContributor(lineItem.estimate.jobCard);
  if (input.unitPrice !== undefined) {
    await requirePricingAuthority(lineItem.type, lineItem.estimate.jobCard, editor.id);
  }

  const amount = input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice * 100) / 100 : null;

  await prisma.estimateLineItem.update({
    where: { id: lineItemId },
    data: {
      description,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      amount,
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
async function requireEligibleManager(branchId: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await currentUserIsMasterAdmin()) return user;
  const match = await prisma.user.findFirst({
    where: { id: user.id, branchId, roles: { some: { role: { slug: 'workshop-manager' } } } },
    select: { id: true },
  });
  if (!match) {
    throw new WorkshopActionError('Only a Workshop Manager for this branch, or a Master Administrator, can approve this estimate.');
  }
  return user;
}

export async function approveEstimate(jobCardId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { jobCardId },
    select: {
      id: true,
      status: true,
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
          vehicle: { select: { make: true, model: true } },
          customer: { select: { fullName: true, email: true } },
          branch: { select: { name: true, businessUnit: { select: { company: { select: { name: true } } } } } },
        },
      },
      lineItems: { orderBy: { createdAt: 'asc' }, select: { description: true, quantity: true, amount: true } },
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

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { customerNotifiedAt: new Date(), customerNotifiedById: user.id },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.customer_notified',
    entityType: 'JobCard',
    entityId: jobCardId,
  });

  try {
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
    await sendEmail(
      estimate.jobCard.customer.email,
      `Your estimate for Job Card ${estimate.jobCard.jobNumber} has been approved`,
      renderCustomerEstimateApprovedEmail({
        customerName: estimate.jobCard.customer.fullName,
        jobNumber: estimate.jobCard.jobNumber,
        vehicleDescription: [estimate.jobCard.vehicle.make, estimate.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        lineItems: estimate.lineItems.map((li: { description: string; quantity: number; amount: unknown }) => ({
          description: li.description,
          quantity: li.quantity,
          amount: `₦${Number(li.amount ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        })),
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        dashboardUrl: `${websiteUrl}/customer-portal/dashboard`,
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

