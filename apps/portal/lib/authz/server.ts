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

/** Server actions: throw a plain message when not allowed. */
export async function authorize(key: PermissionKey, record?: RecordContext, where = 'action'): Promise<void> {
  const p = await getPrincipal();
  const d = decide(p, key, record);
  if (!d.allowed) {
    await logDenied(p.userId, key, where, d.reason);
    throw new Error('You do not have permission to do this.');
  }
}

/** Records: out of scope behaves exactly like "not found" (no existence leak). */
export async function canSeeRecord(key: PermissionKey, record: RecordContext, where: string): Promise<boolean> {
  const p = await getPrincipal();
  const d = decide(p, key, record);
  if (!d.allowed) await logDenied(p.userId, key, where, d.reason);
  return d.allowed;
}
