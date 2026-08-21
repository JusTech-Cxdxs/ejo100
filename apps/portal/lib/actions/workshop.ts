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
import { prisma, JobCardStatus } from '@ejo/database';
import { hashPassword } from 'better-auth/crypto';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { generateSecurePassword } from '@/lib/utils/generate-password';
import { renderCustomerWelcomeEmail } from '@/lib/email-templates/customer-welcome';

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

  const welcomeEmailSent = await provisionCustomerAccountAndWelcomeEmail(customer);

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
async function provisionCustomerAccountAndWelcomeEmail(customer: {
  id: string;
  fullName: string;
  email: string;
}): Promise<boolean> {
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
};

/**
 * Every vehicle belonging to one customer, for the Job Card cascading
 * picker — always scoped to a single customerId (never the whole
 * table), so no search query or debouncing is needed here: a real
 * customer's own vehicle count is inherently small and bounded, unlike
 * "search all customers" or "search all vehicles system-wide". The
 * `take: 50` is a sanity cap, not a real-world limit anyone should hit.
 */
export async function listVehiclesForCustomer(customerId: string): Promise<VehicleSearchResult[]> {
  await requireUser();
  if (!customerId) return [];
  return prisma.customerVehicle.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, plateNumber: true, chassisNumber: true, make: true, model: true, year: true },
  });
}

export async function listAllVehicles(search?: string) {
  await requireUser();
  return prisma.customerVehicle.findMany({
    where: search
      ? {
          OR: [
            { plateNumber: { contains: search, mode: 'insensitive' } },
            { chassisNumber: { contains: search, mode: 'insensitive' } },
            { make: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
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
  // sometimes genuinely unavailable) — Make/Model/Year/Plate/Chassis are
  // the fields that make a registration meaningfully identify a real,
  // specific vehicle rather than an empty placeholder row.
  const make = input.make?.trim();
  const model = input.model?.trim();
  const plateNumberRaw = input.plateNumber?.trim();
  const chassisNumberRaw = input.chassisNumber?.trim();
  if (!make || !model || !input.year || !plateNumberRaw || !chassisNumberRaw) {
    throw new WorkshopActionError('Make, model, year, plate number, and chassis/VIN are all required to register a vehicle.');
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
      year: input.year,
      plateNumber,
      chassisNumber,
      engineNumber: input.engineNumber?.trim() || null,
      mileage: input.mileage ?? null,
      createdById: currentUser.id,
    },
  });
}

// ---------------------------------------------------------------------------
// JOB CARDS
// ---------------------------------------------------------------------------

/** JC-<year>-<sequence>, e.g. "JC-2026-000042". Sequence is derived from
 * the count of Job Cards already created this year — simple and readable,
 * with a known limitation: two Job Cards created in the same instant could
 * theoretically race to the same number under concurrent load. Acceptable
 * for this phase's usage pattern (one branch, staff-paced data entry); a
 * DB-level sequence is the natural follow-up if that ever becomes real.
 */
async function generateJobNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const count = await prisma.jobCard.count({ where: { createdAt: { gte: startOfYear } } });
  return `JC-${year}-${String(count + 1).padStart(6, '0')}`;
}

export async function listJobCards(status?: JobCardStatus, search?: string) {
  await requireUser();
  const q = search?.trim();

  return prisma.jobCard.findMany({
    where: {
      ...(status ? { status } : {}),
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
      vehicle: { select: { make: true, model: true, plateNumber: true } },
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
      createdBy: { select: { id: true, fullName: true } },
      branch: { select: { name: true } },
    },
  });
}

export type CreateJobCardInput = {
  customerId: string;
  vehicleId: string;
  complaint: string;
  mileageAtCheckIn?: number;
};

export async function createJobCard(input: CreateJobCardInput) {
  const user = await requireUser();
  if (!input.customerId || !input.vehicleId || !input.complaint.trim()) {
    throw new WorkshopActionError('Customer, vehicle, and complaint are all required to open a Job Card.');
  }
  const branchId = await getWorkshopBranchId();
  const jobNumber = await generateJobNumber();

  return prisma.jobCard.create({
    data: {
      jobNumber,
      branchId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      complaint: input.complaint.trim(),
      mileageAtCheckIn: input.mileageAtCheckIn ?? null,
      createdById: user.id,
      status: JobCardStatus.CHECKED_IN,
    },
  });
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

export async function assignTechnician(jobCardId: string, technicianId: string) {
  await requireUser();
  return prisma.jobCard.update({
    where: { id: jobCardId },
    data: { assignedTechnicianId: technicianId },
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
