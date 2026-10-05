'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal } from '@/lib/authz/server';

export type AdminUserRow = { id: string; fullName: string; email: string; employeeId: string | null; isActive: boolean; branch: string | null; department: string | null; roles: { id: string; name: string; isPlatform: boolean }[] };
export type AssignableRole = { id: string; name: string; isPlatform: boolean };

async function actorOrg() {
  const p = await getPrincipal();
  const me = await prisma.user.findUnique({ where: { id: p.userId }, select: { organisationId: true } });
  return { p, organisationId: me?.organisationId ?? null };
}

/** Users of the person's organisation (search by name, email or employee ID). */
export async function listUsersForAdmin(q?: string): Promise<{ users: AdminUserRow[]; roles: AssignableRole[]; isPlatformTeam: boolean; me: string }> {
  await authorize('admin.users.manage', undefined, 'users.list');
  const { p, organisationId } = await actorOrg();
  const term = q?.trim().slice(0, 80);
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { ...(organisationId ? { organisationId } : {}), ...(term ? { OR: [{ fullName: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }, { employeeId: { contains: term, mode: 'insensitive' } }] } : {}) },
      orderBy: { fullName: 'asc' },
      take: 300,
      select: { id: true, fullName: true, email: true, employeeId: true, isActive: true, branch: { select: { name: true } }, department: { select: { name: true } }, roles: { select: { role: { select: { id: true, name: true, isSuperAdmin: true } } } } },
    }),
    prisma.role.findMany({ where: organisationId ? { organisationId } : {}, orderBy: { name: 'asc' }, select: { id: true, name: true, isSuperAdmin: true } }),
  ]);
  return {
    me: p.userId,
    isPlatformTeam: p.isSuperAdmin,
    users: users.map((u: (typeof users)[number]) => ({ id: u.id, fullName: u.fullName, email: u.email, employeeId: u.employeeId, isActive: u.isActive, branch: u.branch?.name ?? null, department: u.department?.name ?? null, roles: u.roles.map((r: { role: { id: string; name: string; isSuperAdmin: boolean } }) => ({ id: r.role.id, name: r.role.name, isPlatform: r.role.isSuperAdmin })) })),
    // Organisation administrators never see the platform role as an option.
    roles: roles.filter((r: { isSuperAdmin: boolean }) => p.isSuperAdmin || !r.isSuperAdmin).map((r: { id: string; name: string; isSuperAdmin: boolean }) => ({ id: r.id, name: r.name, isPlatform: r.isSuperAdmin })),
  };
}

async function checkPair(userId: string, roleId: string) {
  const { p, organisationId } = await actorOrg();
  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, organisationId: true } }),
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, isSuperAdmin: true, organisationId: true } }),
  ]);
  if (!user || !role) throw new Error('That person or role no longer exists — refresh the page.');
  if (!p.isSuperAdmin && (user.organisationId !== organisationId || role.organisationId !== organisationId)) throw new Error('You can only manage people and roles in your own organisation.');
  if (role.isSuperAdmin && !p.isSuperAdmin) throw new Error('Only the platform team can grant or remove the Master Administrator role.');
  if (userId === p.userId) throw new Error('You cannot change your own roles — ask another administrator.');
  return { p, user, role };
}

/** Give a person a role. The Master role needs the platform team AND the database marker (v22). */
export async function assignRole(userId: string, roleId: string): Promise<void> {
  await authorize('admin.users.manage', undefined, 'users.assignRole');
  const { p, user, role } = await checkPair(userId, roleId);
  const exists = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } }, select: { id: true } });
  if (exists) return;
  if (role.isSuperAdmin) {
    // Verified platform team → set the database's platform-owner marker for this one transaction.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ejo.platform_owner_grant = 'on'`;
      await tx.userRole.create({ data: { userId, roleId } });
    });
  } else {
    await prisma.userRole.create({ data: { userId, roleId } });
  }
  await writeAuditLog({ userId: p.userId, action: 'user.role_assigned', entityType: 'User', entityId: userId, metadata: { person: user.fullName, role: role.name } });
  revalidatePath('/users');
}

/** Remove a role from a person. The last platform-team member can never be removed. */
export async function removeRole(userId: string, roleId: string): Promise<void> {
  await authorize('admin.users.manage', undefined, 'users.removeRole');
  const { p, user, role } = await checkPair(userId, roleId);
  if (role.isSuperAdmin && (await prisma.userRole.count({ where: { roleId } })) <= 1) throw new Error('This is the last Master Administrator — the platform must always have one.');
  await prisma.userRole.deleteMany({ where: { userId, roleId } });
  await writeAuditLog({ userId: p.userId, action: 'user.role_removed', entityType: 'User', entityId: userId, metadata: { person: user.fullName, role: role.name } });
  revalidatePath('/users');
}
