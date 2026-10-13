import { signedInSession } from '@/lib/assist/server';
import { logFailure } from '@/lib/log';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { after } from 'next/server';
import { prisma, currentAuditActor, type Prisma } from '@ejo/database';
import { announceChange } from '@/lib/realtime-ping';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Server-only Workshop core: the audit writer and the organisation, branch,
 * department and supervisor lookups every module uses.
 *
 * SECURITY: not a 'use server' file. Every export of a 'use server' file is
 * a public endpoint; these are internal helpers and must stay server-only.
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
const departmentBranchShared = unstable_cache(
  async (slug: 'workshop' | 'store', branchId: string | null, organisationId: string | null) => {
    const sel = { branchId: true } as const;
    if (branchId) {
      const own = await prisma.department.findFirst({ where: { slug, branchId }, select: sel });
      if (own) return own;
    }
    if (organisationId) {
      const inOrg = await prisma.department.findFirst({ where: { slug, branch: { businessUnit: { organisationId } } }, orderBy: { createdAt: 'asc' }, select: sel });
      if (inOrg) return inOrg;
      // A person who belongs to an organisation never falls through to another organisation's branch.
      return null;
    }
    return prisma.department.findFirst({ where: { slug }, orderBy: { createdAt: 'asc' }, select: sel });
  },
  ['department-branch-v1'],
  { revalidate: 300, tags: ['org-structure'] },
);

/** The signed-in person's branch and organisation (null outside a request, e.g. cron). */
const whereIWork = cache(async (): Promise<{ branchId: string | null; organisationId: string | null; isPlatformTeam: boolean }> => {
  try {
    const session = await signedInSession();
    const id = session?.user?.id;
    if (!id) return { branchId: null, organisationId: null, isPlatformTeam: false };
    const u = await prisma.user.findUnique({ where: { id }, select: { branchId: true, organisationId: true, roles: { where: { role: { isSuperAdmin: true } }, select: { roleId: true }, take: 1 } } });
    return { branchId: u?.branchId ?? null, organisationId: u?.organisationId ?? null, isPlatformTeam: Boolean(u?.roles.length) };
  } catch {
    return { branchId: null, organisationId: null, isPlatformTeam: false };
  }
});

/** Writes an AuditLog row. Never throws: a failed audit write is logged but
 * never blocks or rolls back the action it records. `action` follows
 * `entity.verb` (e.g. "job_card.created", "job_card.approved"). */
export async function writeAuditLog(params: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  /** The organisation whose history this is (e.g. a customer's own
   * organisation) — otherwise stamped from the person acting. */
  organisationId?: string | null;
}): Promise<void> {
  try {
    // During an assisted session the entry is the colleague's, with the
    // assistant named beside it ("Musa Ibrahim (assisted by Ada Okafor)").
    const actor = params.userId ? await currentAuditActor().catch(() => null) : null;
    const assisted = actor?.assistedBy && actor.userId === params.userId ? { assistedBy: actor.assistedBy, assistSessionId: actor.assistSessionId ?? null } : null;
    const metadata = assisted ? { ...(params.metadata ?? {}), ...assisted } : params.metadata;
    await prisma.auditLog.create({
      data: {
        ...(params.organisationId ? { organisationId: params.organisationId } : {}),
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        // Prisma's InputJsonValue is stricter than Record<string, unknown>; every
        // caller passes plain JSON it just built, so cast here rather than widen
        // the signature.
        metadata: metadata as Prisma.InputJsonValue | undefined,
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
    logFailure('Failed to write audit log:', params.action, params.entityId, err);
  }
}

/** Organisation, branch and department names for the email header line,
 * e.g. "Kewalram Nigeria · Isolo Branch · Workshop".
 * `departmentNameOverride` shows the routed department (e.g. "Passenger
 * Vehicle Workshop") instead of "Workshop". */
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

/** The Workshop department (Passenger / Commercial) for a vehicle type.
 * Always derived from CustomerVehicle.vehicleType, never chosen. */
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

/** Re-checks a chosen supervisor server-side: a supervisor in the
 * department, or a Master Administrator standing in while the department
 * has none (the same two cases the picker offers). */
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
  const department = await departmentBranchShared('workshop', me.branchId, me.organisationId);
  if (!department) {
    throw new WorkshopActionError(
      'No branch has a Workshop department yet — run the seed script, or create one under Branches.',
    );
  }
  return department.branchId;
}

/** A branch id passed in from a request is usable only if it belongs to the
 * signed-in person's organisation. Background jobs (no one signed in) and
 * the platform team (no organisation) are not limited. */
export const branchInMyOrganisationOrSystem = cache(async (branchId: string): Promise<boolean> => {
  const me = await whereIWork();
  if (!me.organisationId || me.isPlatformTeam) return true;
  const b = await prisma.branch.findFirst({ where: { id: branchId, businessUnit: { organisationId: me.organisationId } }, select: { id: true } });
  return Boolean(b);
});

/** The Store's operating branch for the signed-in person — same rules as the
 * Workshop's (own branch → own organisation → never another organisation's). */
export const getStoreBranchIdForMe = cache(async (): Promise<string | null> => {
  const me = await whereIWork();
  return (await departmentBranchShared('store', me.branchId, me.organisationId))?.branchId ?? null;
});

// Cached per request.
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
