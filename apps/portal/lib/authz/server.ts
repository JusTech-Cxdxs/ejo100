import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { decide, hasBranchLens, type Decision, type PermissionKey, type Principal, type RecordContext, PERMISSIONS } from './catalogue';
import { signedInContext, type ActiveAssist } from '@/lib/assist/server';

/**
 * Server-side enforcement of the Authorization Catalogue. Server-only (NOT a
 * 'use server' file — nothing here is callable from outside the server).
 */

/** An organisation's branches — shared across requests for five minutes
 * (branches are rarely added; a new one is reachable within minutes). */
const branchesOfOrganisation = unstable_cache(
  async (organisationId: string): Promise<string[]> =>
    (await prisma.branch.findMany({ where: { businessUnit: { organisationId } }, select: { id: true } })).map((b: { id: string }) => b.id),
  ['org-branches-v1'],
  { revalidate: 300, tags: ['org-structure'] },
);

const soleOrganisationId = unstable_cache(
  async (): Promise<string | null> => {
    const orgs = await prisma.organisation.findMany({ select: { id: true }, take: 2 });
    return orgs.length === 1 ? orgs[0]!.id : null;
  },
  ['sole-organisation-v1'],
  { revalidate: 300, tags: ['org-structure'] },
);

/** A person's principal, loaded once per request. */
const principalFor = cache(async (userId: string): Promise<Principal> => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, branchId: true, departmentId: true, organisationId: true, roles: { select: { role: { select: { slug: true, isSuperAdmin: true, permissions: { select: { permission: { select: { key: true } } } } } } } } },
  });
  const isSuperAdmin = (u?.roles ?? []).some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin);
  // The tenant fence: every branch of this person's organisation.
  // A staff account not yet placed in an organisation, while the platform has
  // exactly one: it belongs to that one (the v23 SQL makes this permanent).
  const organisationId = u?.organisationId ?? (isSuperAdmin ? null : await soleOrganisationId());
  // Fails CLOSED: a staff account with no organisation (once there is more than
  // one organisation) reaches no branch at all — never "every branch".
  const orgBranchIds = isSuperAdmin ? undefined : organisationId ? await branchesOfOrganisation(organisationId) : [];
  const roles = u?.roles ?? [];
  // Database grants can ADD permissions the catalogue defines (scope: branch).
  const extra: Partial<Record<PermissionKey, 'BRANCH'>> = {};
  for (const r of roles) for (const rp of r.role.permissions) if (rp.permission.key in PERMISSIONS) extra[rp.permission.key as PermissionKey] = 'BRANCH';
  return {
    userId,
    isSuperAdmin,
    organisationId,
    orgBranchIds,
    roleSlugs: roles.map((r: { role: { slug: string } }) => r.role.slug),
    branchId: u?.branchId ?? null,
    departmentId: u?.departmentId ?? null,
    extraGrants: extra,
  };
});

/**
 * Another colleague's principal — ONLY to tailor what is shown to that
 * colleague (the how-to guides that fit their own permissions in a help
 * request). Never use it to authorise the signed-in person.
 */
export async function colleaguePrincipal(userId: string): Promise<Principal> {
  return principalFor(userId);
}

/**
 * The person the business rules run as, loaded once per request. During an
 * assisted session this is the colleague being helped (see requireUser), so
 * every check below applies the colleague's own permissions, never more.
 */
export const getPrincipal = cache(async (): Promise<Principal> => {
  const user = await requireUser();
  const p = await principalFor(user.id);
  // The branch lens (headquarters roles): one branch of their own organisation, for now.
  const lens = await readBranchLens();
  if (!lens || !hasBranchLens(p)) return p;
  // Not while working for a colleague (their view is theirs), and only an active branch of the person's own organisation.
  if (await signedInContext().then((c) => Boolean(c?.assist)).catch(() => true)) return p;
  if (!p.isSuperAdmin && !(p.orgBranchIds ?? []).includes(lens)) return p;
  if (await prisma.branch.count({ where: { id: lens, isActive: true } })) return { ...p, lensBranchId: lens };
  return p;
});

/**
 * Logs follow the branch lens by WHO acted: with one branch chosen, only the
 * entries of that branch's people (logs have no branch of their own).
 * Organisation-wide view: no filter.
 */
export async function lensPeopleWhere(): Promise<{ userId?: { in: string[] } }> {
  const p = await getPrincipal();
  if (!p.lensBranchId) return {};
  const people = await prisma.user.findMany({ where: { branchId: p.lensBranchId, ...(p.organisationId ? { organisationId: p.organisationId } : {}) }, select: { id: true }, take: 5000 });
  return { userId: { in: people.map((u: { id: string }) => u.id) } };
}

/** The cookie holding the branch lens (a branch id; empty = all branches). */
export const LENS_COOKIE = 'ejo-branch-lens';

/** The lens cookie for this request; none outside a request (scheduled jobs, after()). */
async function readBranchLens(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers');
    const v = (await cookies()).get(LENS_COOKIE)?.value ?? '';
    return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The person who actually signed in — the assistant during an assisted
 * session. Only for starting, ending and listing assisted sessions.
 */
export const getSignedInPrincipal = cache(async (): Promise<Principal> => {
  const ctx = await signedInContext();
  if (!ctx) throw new Error('Not authenticated.');
  return principalFor(ctx.userId);
});

/** authorize(), checked against the signed-in person rather than the colleague being assisted. */
export async function authorizeAsSignedIn(key: PermissionKey, record: RecordContext | undefined, where: string, message = 'You do not have permission to do this.'): Promise<Principal> {
  const p = await getSignedInPrincipal();
  const d = decide(p, key, record);
  if (!d.allowed) {
    await logDenied(p.userId, key, where, d.reason);
    throw new Error(message);
  }
  return p;
}

/** The assisted session running in this browser, if any (null when working alone). */
export async function currentAssist(): Promise<ActiveAssist | null> {
  return (await signedInContext())?.assist ?? null;
}

/** Pages and actions that only make sense for one's own account (password,
 * profile, notification settings) refuse during an assisted session. */
export const NOT_DURING_ASSIST = 'This is not available during an assisted session. End the session first.';
export async function refuseDuringAssist(where: string): Promise<void> {
  const a = await currentAssist();
  if (a) {
    await writeAuditLog({ userId: a.subject.id, action: 'access.denied', entityType: 'Access', entityId: where.slice(0, 120), metadata: { reason: 'Not available during an assisted session' } }).catch(() => undefined);
    throw new Error(NOT_DURING_ASSIST);
  }
}

export async function can(key: PermissionKey, record?: RecordContext): Promise<Decision> {
  return decide(await getPrincipal(), key, record);
}

/** Record a refusal in the audit trail — a security signal, never noise for users. */
// Once per request: a page and its layout both guard, and render together.
const logDenied = cache(async (userId: string, key: PermissionKey, where: string, reason: string) => {
  await writeAuditLog({ userId, action: 'access.denied', entityType: 'Access', entityId: where.slice(0, 120), metadata: { permission: key, reason } }).catch(() => undefined);
});

/** Pages / layouts: refuse on the SERVER (pasted links included). */
export async function guardPage(key: PermissionKey, where: string): Promise<void> {
  const p = await getPrincipal();
  const d = decide(p, key);
  if (!d.allowed) {
    await logDenied(p.userId, key, where, d.reason);
    redirect(`/access-denied?area=${encodeURIComponent(PERMISSIONS[key].label)}`);
  }
}

/** Pages open to people with ANY of several permissions (e.g. Deliveries:
 * the gate or the Store). Refuses on the server like guardPage. */
export async function guardAnyPage(keys: PermissionKey[], where: string): Promise<void> {
  const p = await getPrincipal();
  if (keys.some((k) => decide(p, k).allowed)) return;
  await logDenied(p.userId, keys[0]!, where, 'No role grants any of the permissions this page needs');
  redirect(`/access-denied?area=${encodeURIComponent(PERMISSIONS[keys[0]!].label)}`);
}

/** The reach of the FIRST permission this person holds — for lists shared by
 * two departments (Deliveries: the gate and the Store). */
export async function firstReach(keys: PermissionKey[]): Promise<{ branchId?: string | { in: string[] } }> {
  const p = await getPrincipal();
  const k = keys.find((x) => decide(p, x).allowed);
  return k ? reachWhere(k) : { branchId: '__no_access__' };
}

/** Server actions: throw a plain message when not allowed. A module may pass
 * its own wording (e.g. "Only Store staff can record a goods receipt."). */
export async function authorize(key: PermissionKey, record?: RecordContext, where = 'action', message = 'You do not have permission to do this.'): Promise<void> {
  const p = await getPrincipal();
  const d = decide(p, key, record);
  if (!d.allowed) {
    await logDenied(p.userId, key, where, d.reason);
    throw new Error(message);
  }
}

/**
 * Workflow helpers that check ASSIGNMENT (the job's own supervisor, the
 * branch's manager for this step…) call this when they refuse, so every
 * refusal — catalogue or workflow — lands in the audit trail as
 * access.denied with the permission it was about. Always throws.
 */
export async function refuse(key: PermissionKey, where: string, message: string): Promise<never> {
  const p = await getPrincipal().catch(() => null);
  if (p) await logDenied(p.userId, key, where, 'Not the person this step is waiting on');
  throw new Error(message);
}

/** Quiet yes/no for showing or hiding a button — the SAME rule the action
 * enforces, so the screen never offers what the server would refuse. */
export async function allows(key: PermissionKey, record?: RecordContext): Promise<boolean> {
  return decide(await getPrincipal(), key, record).allowed;
}

/** Records: out of scope behaves exactly like "not found" (no existence leak). */
export async function canSeeRecord(key: PermissionKey, record: RecordContext, where: string): Promise<boolean> {
  const p = await getPrincipal();
  const d = decide(p, key, record);
  if (!d.allowed) await logDenied(p.userId, key, where, d.reason);
  return d.allowed;
}

/**
 * Lists, search and exports: turn the person's reach into a database filter,
 * so a list can never show more than the record pages would. Branch-scoped
 * people get their branch; organisation-wide people get no extra filter.
 */
/**
 * `lens: false` for one record, a write, or a person's own work: the branch
 * lens is a way of LOOKING at lists and analytics, so a record opened from a
 * link (or acted on) is never hidden by it.
 */
export async function reachWhere(key: PermissionKey, opts: { lens?: boolean } = {}): Promise<{ branchId?: string | { in: string[] } }> {
  const p = await getPrincipal();
  const d = decide(p, key);
  if (!d.allowed) return { branchId: '__no_access__' };
  if (d.scope === 'BRANCH' && p.branchId) return { branchId: p.branchId };
  // Organisation-wide, looking at one branch for now (the branch lens): that branch only.
  if (d.scope === 'ALL' && p.lensBranchId && opts.lens !== false) return { branchId: p.lensBranchId };
  // Organisation-wide (or a person with no branch): every branch of THEIR
  // organisation — never another organisation's. The platform team: all.
  return p.orgBranchIds ? { branchId: { in: p.orgBranchIds } } : {};
}

/** Records owned by an organisation directly (customers, staff, roles,
 * broadcasts, warranty providers and policies): the person's own
 * organisation; the platform team sees all. */
export async function orgWhere(): Promise<{ organisationId?: string }> {
  const p = await getPrincipal();
  if (p.isSuperAdmin) return {};
  return { organisationId: p.organisationId ?? '__no_organisation__' };
}

/** Organisation-owned reference data that existed before multi-organisation
 * support (warranty providers and policies): the person's organisation, or
 * not yet assigned (filled in by the v23 SQL — no row stays unassigned once a
 * second organisation exists). Wrapped in AND so it never clashes with a
 * query's own OR. */
export async function orgOwned(): Promise<{ AND?: { OR: ({ organisationId: string } | { organisationId: null })[] }[] }> {
  const p = await getPrincipal();
  if (p.isSuperAdmin) return {};
  return { AND: [{ OR: [{ organisationId: p.organisationId ?? '__no_organisation__' }, { organisationId: null }] }] };
}

/** The organisation a new record belongs to: the person's own (for the
 * platform team, the organisation of the branch they are working in). */
export async function myOrganisationId(): Promise<string | null> {
  const p = await getPrincipal();
  if (p.organisationId) return p.organisationId;
  const { getWorkshopBranchId } = await import('@/lib/workshop-core');
  const b = await prisma.branch.findUnique({ where: { id: await getWorkshopBranchId() }, select: { businessUnit: { select: { organisationId: true } } } }).catch(() => null);
  return b?.businessUnit.organisationId ?? null;
}

/** People of the organisation this person is ACTING for — their own; for
 * the platform team, the organisation of the branch they are working in.
 * Used for "who gets told" (gate staff, heads), never to widen what is seen. */
export async function actingOrgWhere(): Promise<{ organisationId?: string }> {
  const org = await myOrganisationId();
  return org ? { organisationId: org } : {};
}

/** Whether a directly-owned record belongs to the person's organisation. */
export async function inMyOrganisation(organisationId: string | null | undefined): Promise<boolean> {
  const p = await getPrincipal();
  return p.isSuperAdmin || (Boolean(organisationId) && organisationId === p.organisationId);
}

/** A record (with its branch) — or null when it is outside this person's reach. */
export async function seeOrNull<T extends { branchId?: string | null }>(key: PermissionKey, rec: T | null, where: string): Promise<T | null> {
  if (!rec) return null;
  return (await canSeeRecord(key, { branchId: rec.branchId ?? null }, where)) ? rec : null;
}

/** A list asked for one branch: honoured only when that branch is within
 * reach — a branch-scoped person asking for another branch gets nothing. */
export async function branchWithinReach(key: PermissionKey, branchId: string): Promise<string> {
  return decide(await getPrincipal(), key, { branchId }).allowed ? branchId : '__no_access__';
}

/** The parent record's branch and people — read once per request, however
 * many panels of a page check it (a Job Card page asks ~10 times). */
const jobCardParent = cache(async (id: string) => prisma.jobCard.findUnique({ where: { id }, select: { branchId: true, supervisorId: true, assignedTechnicianId: true, createdById: true } }));
const serviceParent = cache(async (id: string) => prisma.vehicleService.findUnique({ where: { id }, select: { branchId: true, supervisorId: true, assignedTechnicianId: true, createdById: true } }));

/** Assignment-aware check on a Vehicle Service, using the record itself (never the browser's word). */
export async function authorizeOnService(key: PermissionKey, serviceId: string, where: string): Promise<void> {
  const v = await serviceParent(serviceId);
  if (!v) throw new Error('This record no longer exists — refresh the page.');
  await authorize(key, { branchId: v.branchId, assigneeIds: [v.supervisorId, v.assignedTechnicianId], ownerIds: [v.createdById] }, where);
}

/** Assignment-aware check on a Job Card, using the record itself. */
export async function authorizeOnJobCard(key: PermissionKey, jobCardId: string, where: string): Promise<void> {
  const j = await jobCardParent(jobCardId);
  if (!j) throw new Error('This record no longer exists — refresh the page.');
  await authorize(key, { branchId: j.branchId, assigneeIds: [j.supervisorId, j.assignedTechnicianId], ownerIds: [j.createdById] }, where);
}

/** The message for a record the person may not see. Deliberately the same
 * as "not found": it never confirms that someone else's record exists. */
export const NOT_AVAILABLE = 'This record is not available — it may have been removed, or it is outside what you can see.';

/**
 * Reads of anything that hangs off a Job Card / Vehicle Service (payments,
 * refunds, estimates, requests, audit trails …) check the PARENT record:
 * its branch must be within the person's reach for `key` (default: viewing
 * Job Cards / Vehicle Services). Refusals are audited as access.denied.
 */
export async function seeJobCard(jobCardId: string, where: string, key: PermissionKey = 'workshop.job_card.view'): Promise<void> {
  const j = jobCardId ? await jobCardParent(jobCardId) : null;
  if (!j || !(await canSeeRecord(key, { branchId: j.branchId }, where))) throw new Error(NOT_AVAILABLE);
}

export async function seeService(serviceId: string, where: string, key: PermissionKey = 'workshop.job_card.view'): Promise<void> {
  const v = serviceId ? await serviceParent(serviceId) : null;
  if (!v || !(await canSeeRecord(key, { branchId: v.branchId }, where))) throw new Error(NOT_AVAILABLE);
}

/** Records that belong to a branch directly (parts, goods receipts, slips …). */
export async function seeBranch(key: PermissionKey, branchId: string | null | undefined, where: string): Promise<void> {
  if (!(await canSeeRecord(key, { branchId: branchId ?? null }, where))) throw new Error(NOT_AVAILABLE);
}

/** A list of things that hang off Job Cards OR Vehicle Services, fenced to
 * the person's reach (e.g. the refunds register). */
type Reach = { branchId?: string | { in: string[] } };
export async function jobOrServiceReach(key: PermissionKey = 'workshop.job_card.view'): Promise<{ OR: [{ jobCard: Reach }, { vehicleService: Reach }] }> {
  const reach = await reachWhere(key);
  return { OR: [{ jobCard: reach }, { vehicleService: reach }] };
}

/** A customer's vehicle: the customer must belong to the person's organisation. */
export async function seeVehicle(vehicleId: string, where: string): Promise<void> {
  const v = vehicleId ? await prisma.customerVehicle.findUnique({ where: { id: vehicleId }, select: { customer: { select: { organisationId: true } } } }) : null;
  if (!v || !(await inMyOrganisation(v.customer.organisationId))) {
    if (v) await logDenied((await getPrincipal()).userId, 'workshop.view', where, 'outside organisation');
    throw new Error(NOT_AVAILABLE);
  }
}

/** A Store part: its branch must be within reach for viewing the Store. */
export async function seePart(partId: string, where: string): Promise<void> {
  const p = partId ? await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true } }) : null;
  if (!p) throw new Error(NOT_AVAILABLE);
  await seeBranch('store.view', p.branchId, where);
}

/** Records more than one department legitimately opens (a parts request: the
 * workshop and the Store; an outside purchase: the workshop, Store and
 * Finance) — visible when ANY of the keys reaches its branch. */
export async function seeBranchAnyOf(keys: PermissionKey[], branchId: string | null | undefined, where: string): Promise<void> {
  for (const key of keys.slice(0, -1)) if (await allows(key, { branchId: branchId ?? null })) return;
  await seeBranch(keys[keys.length - 1]!, branchId, where);
}

/** Branch-owned records (parts, rooms, goods receipts …) of the person's own
 * organisation; the platform team: all. */
export async function partsOfMyOrganisation(): Promise<{ branch?: { businessUnit: { organisationId: string } } }> {
  const p = await getPrincipal();
  if (p.isSuperAdmin) return {};
  return { branch: { businessUnit: { organisationId: p.organisationId ?? '__no_organisation__' } } };
}

/** Same filter, named for what it is when it is not about parts. */
export const branchOwnedByMyOrganisation = partsOfMyOrganisation;

/** For pages: is this Job Card / Vehicle Service there AND within reach?
 * Lets a page show "not found" up front for a stale, mistyped or
 * out-of-reach id, before loading its parts (each of which checks again). */
export async function jobCardVisible(id: string, where: string): Promise<boolean> {
  const j = id ? await jobCardParent(id) : null;
  return Boolean(j) && canSeeRecord('workshop.job_card.view', { branchId: j!.branchId }, where);
}

export async function serviceVisible(id: string, where: string): Promise<boolean> {
  const v = id ? await serviceParent(id) : null;
  return Boolean(v) && canSeeRecord('workshop.job_card.view', { branchId: v!.branchId }, where);
}
