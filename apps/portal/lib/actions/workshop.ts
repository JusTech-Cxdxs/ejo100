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
import { auth } from '@/lib/auth';

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
    include: { _count: { select: { vehicles: true, jobCards: true } } },
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
  await requireUser();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.fullName.trim()) {
    throw new WorkshopActionError('Customer name and email are required.');
  }

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    return { customer: existing, wasExisting: true };
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
    },
  });
  return { customer, wasExisting: false };
}

// ---------------------------------------------------------------------------
// VEHICLES
// ---------------------------------------------------------------------------

export async function listVehiclesForCustomer(customerId: string) {
  await requireUser();
  return prisma.customerVehicle.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
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
    include: { customer: { select: { fullName: true, email: true } } },
  });
}

export type CreateVehicleInput = {
  customerId: string;
  make?: string;
  model?: string;
  year?: number;
  plateNumber?: string;
  chassisNumber?: string;
  mileage?: number;
};

export async function createVehicle(input: CreateVehicleInput) {
  await requireUser();
  if (!input.customerId) {
    throw new WorkshopActionError('A vehicle must belong to a customer.');
  }
  return prisma.customerVehicle.create({
    data: {
      customerId: input.customerId,
      make: input.make?.trim() || null,
      model: input.model?.trim() || null,
      year: input.year ?? null,
      plateNumber: input.plateNumber?.trim() || null,
      chassisNumber: input.chassisNumber?.trim() || null,
      mileage: input.mileage ?? null,
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

export async function listJobCards(status?: JobCardStatus) {
  await requireUser();
  return prisma.jobCard.findMany({
    where: status ? { status } : undefined,
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
