import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { after } from 'next/server';
import { prisma, type Prisma } from '@ejo/database';
import { announceChange } from '@/lib/realtime-ping';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Server-only Workshop core — the audit writer and the organisation /
 * branch / department / supervisor lookups that every module uses.
 *
 * SECURITY: this file is deliberately NOT a 'use server' file. Everything
 * exported from a 'use server' file is a public endpoint that anyone could
 * call directly; these are internal building blocks, so they live here and
 * can only ever be called by code running on the server.
 */
class WorkshopActionError extends Error {}

/**
 * The OPERATING branch — where a person's Workshop / Store / Security work
 * happens. Resolved for the signed-in person, so every organisation on the
 * platform works in its own branch (never another organisation's):
 *   1. their own branch, when it runs a Workshop;
 *   2. otherwise the Workshop branch of their organisation;
 *   3. otherwise (the platform team, background jobs) the first Workshop branch.
 * The lookup is shared across requests for five minutes per (branch, organisation).
 */
const workshopDepartmentShared = unstable_cache(
  async (branchId: string | null, organisationId: string | null) => {
    const sel = { branchId: true } as const;
    if (branchId) {
      const own = await prisma.department.findFirst({ where: { slug: 'workshop', branchId }, select: sel });
      if (own) return own;
    }
    if (organisationId) {
      const inOrg = await prisma.department.findFirst({ where: { slug: 'workshop', branch: { businessUnit: { organisationId } } }, orderBy: { createdAt: 'asc' }, select: sel });
      if (inOrg) return inOrg;
      // A person who belongs to an organisation never falls through to another organisation's branch.
      return null;
    }
    return prisma.department.findFirst({ where: { slug: 'workshop' }, orderBy: { createdAt: 'asc' }, select: sel });
  },
  ['workshop-branch-v2'],
  { revalidate: 300, tags: ['org-structure'] },
);

/** The signed-in person's branch and organisation (null outside a request, e.g. cron). */
const whereIWork = cache(async (): Promise<{ branchId: string | null; organisationId: string | null }> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const id = session?.user?.id;
    if (!id) return { branchId: null, organisationId: null };
    const u = await prisma.user.findUnique({ where: { id }, select: { branchId: true, organisationId: true } });
    return { branchId: u?.branchId ?? null, organisationId: u?.organisationId ?? null };
  } catch {
    return { branchId: null, organisationId: null };
  }
});

/** Writes to the existing AuditLog model — reused exactly as it already
 * is (its own example action string is literally "job_card.approved"),
 * not duplicated with a parallel history mechanism. Deliberately never
 * throws: an audit-log write failing should never block or roll back
 * the real action it's recording, only be logged for someone to notice.
 * `action` follows a `entity.verb` convention (e.g. "job_card.created",
 * "job_card.approved", "job_card.rejected") so a later reporting view
 * can group/filter by entity or by verb consistently. */
export async function writeAuditLog(params: {
  userId: string | null;
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
    // Tell every open browser "something changed" — sent after the response,
    // so it never slows the action down.
    try {
      after(() => announceChange());
    } catch {
      void announceChange();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log:', params.action, params.entityId, err);
  }
}

/** Real Organisation/Branch/Department names for the branded email layout's
 * organizational context line — e.g. "Kewalram Nigeria · Isolo Branch ·
 * Workshop". Kept separate from getWorkshopBranchId() above rather than
 * changing its return shape, since that function has another caller
 * (createJobCard) that only ever needs the bare id.
 *
 * `departmentNameOverride` lets a caller show the actual routed
 * department (e.g. "Passenger Vehicle Workshop") instead of the generic
 * "Workshop" — the organisation/branch lookup is identical either way, only
 * the department label in the returned context changes. */
export async function getWorkshopOrgContext(departmentNameOverride?: string): Promise<{
  companyName: string;
  branchName: string;
  departmentName: string;
}> {
  // The operating branch's Workshop — this organisation's own names on its emails.
  const department = await prisma.department.findFirstOrThrow({
    where: { slug: 'workshop', branchId: await getWorkshopBranchId() },
    select: {
      name: true,
      branch: {
        select: {
          name: true,
          businessUnit: { select: { organisation: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    companyName: department.branch.businessUnit.organisation.name,
    branchName: department.branch.name,
    departmentName: departmentNameOverride ?? department.name,
  };
}

/** Resolves which of the two Workshop departments (Passenger / Commercial)
 * a vehicle's Job Cards belong to, using CustomerVehicle.vehicleType as
 * the source of truth — never chosen manually, always derived. Kept
 * separate from getWorkshopBranchId() above (which still resolves the
 * original single "workshop" department, unchanged) so nothing that
 * already depends on that function's exact behavior is affected. */
export async function getWorkshopDepartmentForVehicleType(
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

/** Re-validates a chosen supervisor server-side — never trusts that the
 * client-side picker's own filtering was followed correctly. Mirrors
 * exactly the two cases listEligibleSupervisorsForVehicleType() can
 * return: a real department supervisor, or (while no one has been
 * placed into the department yet) a Master Administrator standing in. */
export async function isEligibleSupervisor(userId: string, departmentId: string): Promise<boolean> {
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

async function getWorkshopBranchIdUncached(): Promise<string> {
  const me = await whereIWork();
  const department = await workshopDepartmentShared(me.branchId, me.organisationId);
  if (!department) {
    throw new WorkshopActionError(
      'No branch has a Workshop department yet — run the seed script, or create one under Branches.',
    );
  }
  return department.branchId;
}

// Once per request: repeated calls during one page load reuse the answer.
const getWorkshopBranchIdCached = cache(getWorkshopBranchIdUncached);
export async function getWorkshopBranchId(): Promise<string> {
  return getWorkshopBranchIdCached();
}

/**
 * The bank account customers pay into, for this branch. Never shows a made-up
 * number: if the branch's details are not filled in yet, documents say
 * "ask the branch" instead.
 */
export async function bankDetailsFor(branchId: string | null | undefined): Promise<{ bankName: string; accountName: string; accountNumber: string }> {
  const b = branchId ? await prisma.branch.findUnique({ where: { id: branchId }, select: { bankName: true, bankAccountName: true, bankAccountNumber: true } }).catch(() => null) : null;
  if (b?.bankName && b.bankAccountName && b.bankAccountNumber) return { bankName: b.bankName, accountName: b.bankAccountName, accountNumber: b.bankAccountNumber };
  return { bankName: 'Please ask the branch', accountName: '—', accountNumber: 'Ask the branch for the account number' };
}
