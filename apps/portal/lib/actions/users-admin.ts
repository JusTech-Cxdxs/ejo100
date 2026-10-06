'use server';

import { lockRows } from '@/lib/integrity';
import { isUniqueClashOn } from '@/lib/integrity-core';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal } from '@/lib/authz/server';
import { scopeFor } from '@/lib/authz/catalogue';

export type AdminUserRow = { id: string; fullName: string; email: string; employeeId: string | null; isActive: boolean; branch: string | null; department: string | null; roles: { id: string; name: string; isPlatform: boolean }[] };
export type AssignableRole = { id: string; name: string; isPlatform: boolean };

async function actorOrg() {
  const p = await getPrincipal();
  const me = await prisma.user.findUnique({ where: { id: p.userId }, select: { organisationId: true } });
  // Headquarters administrators manage the whole organisation; a Branch
  // Administrator only the people of their own branch.
  const branchOnly = !p.isSuperAdmin && p.roleSlugs.includes('branch-administrator') && scopeFor(p, 'admin.users.manage') === 'BRANCH' ? (p.branchId ?? '__no_branch__') : null;
  return { p, organisationId: me?.organisationId ?? null, branchOnly };
}

/** Roles only headquarters (or the platform team) may hand out — no one can make themselves or a colleague an administrator from a branch. */
const ADMIN_ROLE_SLUGS = ['administrator', 'branch-administrator'];

/** Users of the person's organisation (search by name, email or employee ID). */
export async function listUsersForAdmin(q?: string): Promise<{ users: AdminUserRow[]; roles: AssignableRole[]; isPlatformTeam: boolean; me: string }> {
  await authorize('admin.users.manage', undefined, 'users.list');
  const { p, organisationId, branchOnly } = await actorOrg();
  const term = q?.trim().slice(0, 80);
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      // The platform team is invisible to organisations.
      where: { ...(organisationId ? { organisationId } : {}), ...(branchOnly ? { branchId: branchOnly } : {}), ...(p.isSuperAdmin ? {} : { NOT: { roles: { some: { role: { isSuperAdmin: true } } } } }), ...(term ? { OR: [{ fullName: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }, { employeeId: { contains: term, mode: 'insensitive' } }] } : {}) },
      orderBy: { fullName: 'asc' },
      take: 300,
      select: { id: true, fullName: true, email: true, employeeId: true, isActive: true, branch: { select: { name: true } }, department: { select: { name: true } }, roles: { select: { role: { select: { id: true, name: true, isSuperAdmin: true } } } } },
    }),
    prisma.role.findMany({ where: { ...(organisationId ? { organisationId } : {}), ...(branchOnly ? { slug: { notIn: ADMIN_ROLE_SLUGS } } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true, isSuperAdmin: true } }),
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
  const { p, organisationId, branchOnly } = await actorOrg();
  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, email: true, organisationId: true, branchId: true, roles: { select: { role: { select: { isSuperAdmin: true } } } } } }),
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, slug: true, isSuperAdmin: true, organisationId: true } }),
  ]);
  if (!user || !role) throw new Error('That person or role no longer exists — refresh the page.');
  if (!p.isSuperAdmin && (user.organisationId !== organisationId || role.organisationId !== organisationId)) throw new Error('You can only manage people and roles in your own organisation.');
  if (role.isSuperAdmin && !p.isSuperAdmin) throw new Error('Only the platform team can grant or remove the Master Administrator role.');
  if (branchOnly && user.branchId !== branchOnly) throw new Error('You can only manage the people of your own branch.');
  if (branchOnly && ADMIN_ROLE_SLUGS.includes(role.slug)) throw new Error('Administrator roles are given by headquarters.');
  if (userId === p.userId) throw new Error('You cannot change your own roles — ask another administrator.');
  const targetIsPlatform = user.roles.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin);
  if (targetIsPlatform && !p.isSuperAdmin) throw new Error('That person no longer exists — refresh the page.');
  // The platform OWNER (PLATFORM_OWNER_EMAIL) can only be changed by the owner — not even by other platform-team members.
  const owner = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (owner && user.email.toLowerCase() === owner) {
    const actor = await prisma.user.findUnique({ where: { id: p.userId }, select: { email: true } });
    if (actor?.email.toLowerCase() !== owner) throw new Error("The platform owner's account can only be changed by the owner.");
  }
  return { p, user, role };
}

/** Give a person a role. The Master role needs the platform team AND the database marker (v22). */
export async function assignRole(userId: string, roleId: string): Promise<void> {
  await authorize('admin.users.manage', undefined, 'users.assignRole');
  const { p, user, role } = await checkPair(userId, roleId);
  const exists = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } }, select: { id: true } });
  if (exists) return;
  try {
    if (role.isSuperAdmin) {
      // Verified platform team → set the database's platform-owner marker for this one transaction.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ejo.platform_owner_grant = 'on'`;
        await tx.userRole.create({ data: { userId, roleId } });
      });
    } else {
      await prisma.userRole.create({ data: { userId, roleId } });
    }
  } catch (err) {
    // Two administrators gave the same role at the same moment: it is given — done.
    if (isUniqueClashOn(err, 'userId') || isUniqueClashOn(err, 'roleId')) return;
    throw err;
  }
  await writeAuditLog({ userId: p.userId, action: 'user.role_assigned', entityType: 'User', entityId: userId, metadata: { person: user.fullName, role: role.name } });
  revalidatePath('/users');
}

/** Remove a role from a person. The last platform-team member can never be removed. */
export async function removeRole(userId: string, roleId: string): Promise<void> {
  await authorize('admin.users.manage', undefined, 'users.removeRole');
  const { p, user, role } = await checkPair(userId, roleId);
  // Counted and removed with the role locked: two administrators removing
  // each other at the same moment can never leave the platform with no
  // Master Administrator, or an organisation with no Administrator.
  const removed = await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'role', [roleId]);
    if (role.isSuperAdmin && (await tx.userRole.count({ where: { roleId } })) <= 1) throw new Error('This is the last Master Administrator — the platform must always have one.');
    // Only when it would leave no ACTIVE Administrator: taking the role from a
    // deactivated former administrator is always fine.
    if (role.slug === 'administrator') {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
      const othersActive = await tx.userRole.count({ where: { roleId, userId: { not: userId }, user: { isActive: true } } });
      if (target?.isActive && othersActive === 0) {
        throw new Error('This is the organisation\'s last active Administrator — give the role to someone else first.');
      }
    }
    return (await tx.userRole.deleteMany({ where: { userId, roleId } })).count;
  });
  if (removed === 0) return;
  await writeAuditLog({ userId: p.userId, action: 'user.role_removed', entityType: 'User', entityId: userId, metadata: { person: user.fullName, role: role.name } });
  revalidatePath('/users');
}
