import { cache } from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { decide, type Decision, type PermissionKey, type Principal, type RecordContext, PERMISSIONS } from './catalogue';

/**
 * Server-side enforcement of the Authorization Catalogue. Server-only (NOT a
 * 'use server' file — nothing here is callable from outside the server).
 */

/** The signed-in person, loaded once per request. */
export const getPrincipal = cache(async (): Promise<Principal> => {
  const user = await requireUser();
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true, isSuperAdmin: true, permissions: { select: { permission: { select: { key: true } } } } } } } } },
  });
  const roles = u?.roles ?? [];
  // Database grants can ADD permissions the catalogue defines (scope: branch).
  const extra: Partial<Record<PermissionKey, 'BRANCH'>> = {};
  for (const r of roles) for (const rp of r.role.permissions) if (rp.permission.key in PERMISSIONS) extra[rp.permission.key as PermissionKey] = 'BRANCH';
  return {
    userId: user.id,
    isSuperAdmin: roles.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin),
    roleSlugs: roles.map((r: { role: { slug: string } }) => r.role.slug),
    branchId: u?.branchId ?? null,
    departmentId: u?.departmentId ?? null,
    extraGrants: extra,
  };
});

export async function can(key: PermissionKey, record?: RecordContext): Promise<Decision> {
  return decide(await getPrincipal(), key, record);
}

/** Record a refusal in the audit trail — a security signal, never noise for users. */
async function logDenied(userId: string, key: PermissionKey, where: string, reason: string) {
  await writeAuditLog({ userId, action: 'access.denied', entityType: 'Access', entityId: where.slice(0, 120), metadata: { permission: key, reason } }).catch(() => undefined);
}

/** Pages / layouts: refuse on the SERVER (pasted links included). */
export async function guardPage(key: PermissionKey, where: string): Promise<void> {
  const p = await getPrincipal();
  const d = decide(p, key);
  if (!d.allowed) {
    await logDenied(p.userId, key, where, d.reason);
    redirect(`/access-denied?area=${encodeURIComponent(PERMISSIONS[key].label)}`);
  }
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
export async function reachWhere(key: PermissionKey): Promise<{ branchId?: string }> {
  const p = await getPrincipal();
  const d = decide(p, key);
  if (!d.allowed) return { branchId: '__no_access__' };
  return d.scope === 'BRANCH' && p.branchId ? { branchId: p.branchId } : {};
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

/** Assignment-aware check on a Vehicle Service, using the record itself (never the browser's word). */
export async function authorizeOnService(key: PermissionKey, serviceId: string, where: string): Promise<void> {
  const v = await prisma.vehicleService.findUnique({ where: { id: serviceId }, select: { branchId: true, supervisorId: true, assignedTechnicianId: true, createdById: true } });
  if (!v) throw new Error('This record no longer exists — refresh the page.');
  await authorize(key, { branchId: v.branchId, assigneeIds: [v.supervisorId, v.assignedTechnicianId], ownerIds: [v.createdById] }, where);
}

/** Assignment-aware check on a Job Card, using the record itself. */
export async function authorizeOnJobCard(key: PermissionKey, jobCardId: string, where: string): Promise<void> {
  const j = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { branchId: true, supervisorId: true, assignedTechnicianId: true, createdById: true } });
  if (!j) throw new Error('This record no longer exists — refresh the page.');
  await authorize(key, { branchId: j.branchId, assigneeIds: [j.supervisorId, j.assignedTechnicianId], ownerIds: [j.createdById] }, where);
}
