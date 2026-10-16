'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal } from '@/lib/authz/server';
import { PERMISSIONS, ROLE_GRANTS, type PermissionKey } from '@/lib/authz/catalogue';

export type RoleForEditor = { id: string; name: string; slug: string; isPlatform: boolean; users: number; defaults: PermissionKey[]; added: PermissionKey[] };

/** Roles of the person's organisation, with default and added permissions. */
export async function listRolesForEditor(): Promise<RoleForEditor[]> {
  await authorize('admin.roles.manage', undefined, 'roles.list');
  const me = await prisma.user.findUnique({ where: { id: (await getPrincipal()).userId }, select: { organisationId: true } });
  const roles = await prisma.role.findMany({
    where: { ...(me?.organisationId ? { organisationId: me.organisationId } : {}), ...((await getPrincipal()).isSuperAdmin ? {} : { isSuperAdmin: false }) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, isSuperAdmin: true, _count: { select: { users: true } }, permissions: { select: { permission: { select: { key: true } } } } },
  });
  return roles.map((r: (typeof roles)[number]) => ({
    id: r.id, name: r.name, slug: r.slug, isPlatform: r.isSuperAdmin, users: r._count.users,
    defaults: Object.keys(ROLE_GRANTS[r.slug] ?? {}) as PermissionKey[],
    added: r.permissions.map((p: { permission: { key: string } }) => p.permission.key).filter((k: string): k is PermissionKey => k in PERMISSIONS),
  }));
}

async function editableRole(roleId: string) {
  const p = await getPrincipal();
  const [me, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: p.userId }, select: { organisationId: true } }),
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, slug: true, isSuperAdmin: true, organisationId: true } }),
  ]);
  if (!role) throw new Error('That role no longer exists — refresh the page.');
  if (role.isSuperAdmin) throw new Error('The Master Administrator role belongs to the platform team and already holds everything.');
  if (!p.isSuperAdmin && role.organisationId !== me?.organisationId) throw new Error('You can only change roles in your own organisation.');
  // Nobody widens their own access: a role you hold is changed by another administrator.
  if (!p.isSuperAdmin && p.roleSlugs.includes(role.slug)) throw new Error('You cannot change a role you hold yourself — ask another administrator.');
  return { p, role };
}

/** Add a catalogue permission to a role (database grant). */
export async function grantRolePermission(roleId: string, key: string): Promise<void> {
  await authorize('admin.roles.manage', undefined, 'roles.grant');
  if (!(key in PERMISSIONS)) throw new Error('That permission does not exist.');
  const { p, role } = await editableRole(roleId);
  if (key in (ROLE_GRANTS[role.slug] ?? {})) throw new Error('This role already includes that permission by default.');
  const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: PERMISSIONS[key as PermissionKey].label } });
  await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: perm.id } }, update: {}, create: { roleId, permissionId: perm.id } });
  await writeAuditLog({ userId: p.userId, action: 'role.permission_granted', entityType: 'Role', entityId: roleId, metadata: { role: role.name, permission: PERMISSIONS[key as PermissionKey].label } });
  // Everyone holding the role is emailed their full, current access by the
  // 10-minute job — one email for a batch of changes (lib/access-notices.ts).
  revalidatePath('/roles');
  revalidatePath('/permissions');
}

/** Remove an added permission from a role (defaults cannot be removed here). */
export async function revokeRolePermission(roleId: string, key: string): Promise<void> {
  await authorize('admin.roles.manage', undefined, 'roles.revoke');
  const { p, role } = await editableRole(roleId);
  const perm = await prisma.permission.findUnique({ where: { key }, select: { id: true } });
  const removed = perm ? (await prisma.rolePermission.deleteMany({ where: { roleId, permissionId: perm.id } })).count : 0;
  // Nothing was added, so nothing changed: no audit entry, no access-changed email.
  if (removed === 0) return;
  await writeAuditLog({ userId: p.userId, action: 'role.permission_revoked', entityType: 'Role', entityId: roleId, metadata: { role: role.name, permission: PERMISSIONS[key as PermissionKey]?.label ?? key } });
  revalidatePath('/roles');
  revalidatePath('/permissions');
}
