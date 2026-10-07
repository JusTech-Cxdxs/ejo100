'use server';

import { lockRows } from '@/lib/integrity';
import { isUniqueClashOn } from '@/lib/integrity-core';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal } from '@/lib/authz/server';
import { scopeFor } from '@/lib/authz/catalogue';
import { auth } from '@/lib/auth';
import { hashPassword } from 'better-auth/crypto';
import { randomBytes } from 'node:crypto';

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

// ── Adding people and switching them off ────────────────────────────────

export type StaffPlacement = { branches: { id: string; name: string }[]; departments: { id: string; name: string; branchId: string }[]; branchLocked: string | null };

/** Where a new person can be placed by this administrator: their
 * organisation's branches (a Branch Administrator: only their own). */
export async function staffPlacementOptions(): Promise<StaffPlacement> {
  await authorize('admin.users.manage', undefined, 'users.placement');
  const { p, organisationId, branchOnly } = await actorOrg();
  const inOrg = p.isSuperAdmin && !organisationId ? {} : { businessUnit: { organisationId: organisationId ?? '__none__' } };
  const branches = await prisma.branch.findMany({ where: { ...inOrg, ...(branchOnly ? { id: branchOnly } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const departments = await prisma.department.findMany({ where: { branchId: { in: branches.map((b: { id: string }) => b.id) } }, orderBy: { name: 'asc' }, select: { id: true, name: true, branchId: true } });
  return { branches, departments, branchLocked: branchOnly };
}

export type NewStaffInput = { fullName: string; email: string; employeeId?: string; phone?: string; branchId: string; departmentId?: string; roleId?: string };

/**
 * An administrator adds a staff member. The account is created with an
 * unusable random password and the person is emailed a link to set their
 * own — no password is ever sent by email or seen by the administrator.
 * Headquarters places people in any branch of the organisation; a Branch
 * Administrator only in their own branch and never with an administrator role.
 */
export async function createStaffMember(input: NewStaffInput): Promise<{ id: string; emailSent: boolean }> {
  await authorize('admin.users.manage', undefined, 'users.create');
  const { p, organisationId, branchOnly } = await actorOrg();
  const fullName = input.fullName.trim().replace(/\s+/g, ' ');
  const email = input.email.trim().toLowerCase();
  const employeeId = input.employeeId?.trim() || null;
  if (fullName.length < 2) throw new Error('Enter the person\'s full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  // The branch must be in this organisation (a Branch Administrator: their own).
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true, businessUnit: { select: { organisationId: true } } } });
  const branchOrg = branch?.businessUnit.organisationId ?? null;
  if (!branch || (!p.isSuperAdmin && branchOrg !== organisationId)) throw new Error('Choose a branch of your organisation.');
  if (branchOnly && branch.id !== branchOnly) throw new Error('You can only add people to your own branch.');
  if (input.departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: input.departmentId, branchId: branch.id }, select: { id: true } });
    if (!dept) throw new Error('That department is not in the chosen branch.');
  }
  let role: { id: string; name: string; slug: string } | null = null;
  if (input.roleId) {
    const r = await prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true, name: true, slug: true, isSuperAdmin: true, organisationId: true } });
    if (!r || r.isSuperAdmin || r.organisationId !== branchOrg) throw new Error('Choose a role of this organisation.');
    if (branchOnly && ADMIN_ROLE_SLUGS.includes(r.slug)) throw new Error('Administrator roles are given by headquarters.');
    role = r;
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new Error('Someone already has that email address.');
  if (employeeId && (await prisma.user.findUnique({ where: { employeeId }, select: { id: true } }))) throw new Error('Someone already has that employee ID.');

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { fullName, email, employeeId, phone: input.phone?.trim() || null, organisationId: branchOrg, branchId: branch.id, departmentId: input.departmentId || null, isActive: true, accountType: 'EMPLOYEE' },
      select: { id: true },
    });
    // Unusable until the person sets their own password from the email link.
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: 'credential', password: await hashPassword(randomBytes(32).toString('hex')) } });
    if (role) await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  });
  await writeAuditLog({ userId: p.userId, action: 'user.created', entityType: 'User', entityId: created.id, metadata: { person: fullName, email, branchId: branch.id, role: role?.name } });
  if (role) await writeAuditLog({ userId: p.userId, action: 'user.role_assigned', entityType: 'User', entityId: created.id, metadata: { person: fullName, role: role.name } });

  // The auth library sends this email in the background and only logs a
  // failure, so "sent" means "handed to the mail service"; the page says so
  // and points to "Forgot password" if it does not arrive.
  let emailSent = false;
  try {
    // Relative, like the forgot-password page: always a trusted origin.
    await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } });
    emailSent = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Could not send the set-your-password email', created.id, err);
  }
  revalidatePath('/users');
  return { id: created.id, emailSent };
}

/**
 * Switch a person off (or back on). Off: they are signed out everywhere at
 * once and cannot sign in; nothing they did is touched. Never yourself, never
 * the platform owner, and never the organisation's last active Administrator.
 */
export async function setStaffActive(userId: string, active: boolean, reason: string): Promise<void> {
  await authorize('admin.users.manage', undefined, active ? 'users.reactivate' : 'users.deactivate');
  const { p, organisationId, branchOnly } = await actorOrg();
  const why = reason.trim();
  if (!active && why.length < 3) throw new Error('Give the reason for switching this account off.');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, email: true, isActive: true, organisationId: true, branchId: true, roles: { select: { role: { select: { id: true, slug: true, isSuperAdmin: true } } } } } });
  if (!user) throw new Error('That person no longer exists — refresh the page.');
  const targetIsPlatform = user.roles.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin);
  if (!p.isSuperAdmin && (targetIsPlatform || user.organisationId !== organisationId)) throw new Error('That person no longer exists — refresh the page.');
  if (branchOnly && user.branchId !== branchOnly) throw new Error('You can only manage the people of your own branch.');
  // Administrators are switched on and off by headquarters, never from a branch.
  if (branchOnly && user.roles.some((r: { role: { slug: string } }) => ADMIN_ROLE_SLUGS.includes(r.role.slug))) throw new Error('Administrators are managed by headquarters.');
  if (userId === p.userId) throw new Error('You cannot switch off your own account.');
  const owner = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (owner && user.email.toLowerCase() === owner) throw new Error("The platform owner's account cannot be switched off.");
  if (user.isActive === active) return;

  await prisma.$transaction(async (tx) => {
    // Never leave the organisation without an active Administrator, nor the
    // platform without a Master Administrator — EVERY such role the person
    // holds is checked, counted under the role locks.
    const guarded = user.roles.filter((r: { role: { slug: string; isSuperAdmin: boolean } }) => r.role.slug === 'administrator' || r.role.isSuperAdmin).map((r: { role: { id: string; isSuperAdmin: boolean } }) => r.role);
    if (!active && guarded.length) {
      await lockRows(tx, 'role', guarded.map((r: { id: string }) => r.id));
      for (const role of guarded) {
        const othersActive = await tx.userRole.count({ where: { roleId: role.id, userId: { not: userId }, user: { isActive: true } } });
        if (othersActive === 0) throw new Error(role.isSuperAdmin ? 'This is the last active Master Administrator.' : 'This is the organisation\'s last active Administrator — give the role to someone else first.');
      }
    }
    await tx.user.update({ where: { id: userId }, data: { isActive: active } });
    // Signed out everywhere, immediately.
    if (!active) await tx.session.deleteMany({ where: { userId } });
  });
  await writeAuditLog({ userId: p.userId, action: active ? 'user.reactivated' : 'user.deactivated', entityType: 'User', entityId: userId, metadata: { person: user.fullName, reason: why || undefined } });
  revalidatePath('/users');
}
