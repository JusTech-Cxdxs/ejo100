import { randomBytes } from 'node:crypto';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { PERMISSIONS, type PermissionKey, type Principal } from '@/lib/authz/catalogue';
import { describeAccess, roleLabel } from '@/lib/authz/describe-access';
import { renderStaffAccessEmail } from '@/lib/email-templates/staff-access';
import { formatEmployeeId, uniqueBranchPrefixes } from '@/lib/employee-id';
import { portalConfig } from '@/lib/site-config';

/**
 * Server-only (NOT a 'use server' file): staff onboarding — employee IDs,
 * the one-time set-password link, and the welcome / access-changed emails.
 */

const SET_PASSWORD_HOURS = 72;

function portalUrl(): string {
  return (process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

/** The next free employee ID for a branch (ORG-BRANCH-NNNN). The column is
 * unique, so two administrators adding people at the same moment can never
 * get the same number — the caller retries on a clash. */
export async function nextEmployeeId(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true, organisation: { select: { name: true } } } } } });
  if (!branch) throw new Error('That branch no longer exists.');
  // Every branch of the organisation, oldest first: two branches whose names
  // give the same code ("Isolo", "Isolo Workshop") are told apart — the newer
  // one gets a digit (ISO, ISO2) — and an existing branch's code never changes.
  const siblings = await prisma.branch.findMany({ where: { businessUnit: { organisationId: branch.businessUnit.organisationId } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, name: true, code: true } });
  const prefix = uniqueBranchPrefixes(branch.businessUnit.organisation.name, siblings).get(branchId)!;
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("employeeId" FROM '([0-9]{1,9})$') AS INTEGER)) AS max
    FROM "users" WHERE "employeeId" ~ ${`^${prefix}-[0-9]{1,9}$`}`;
  return formatEmployeeId(prefix, Number(rows[0]?.max ?? 0) + 1);
}

/** A one-time link to set (or reset) the password, through the auth library's
 * own verification store and its standard /reset-password/:token route. */
export async function issueSetPasswordLink(userId: string, hours = SET_PASSWORD_HOURS): Promise<string> {
  const ctx = await auth.$context;
  // Only the newest link works: any earlier, unused set-password link for this person is withdrawn.
  await prisma.verification.deleteMany({ where: { value: userId, identifier: { startsWith: 'reset-password:' } } });
  const token = randomBytes(18).toString('base64url');
  await ctx.internalAdapter.createVerificationValue({ value: userId, identifier: `reset-password:${token}`, expiresAt: new Date(Date.now() + hours * 3600_000) });
  return `${ctx.baseURL}/reset-password/${token}?callbackURL=${encodeURIComponent('/reset-password')}`;
}

/** Everything the email needs about a person, built from the same catalogue the system enforces. */
async function accessOf(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, fullName: true, email: true, employeeId: true, isActive: true, branchId: true, departmentId: true,
      organisation: { select: { name: true } }, branch: { select: { name: true } }, department: { select: { name: true } },
      roles: { select: { role: { select: { name: true, slug: true, isSuperAdmin: true, permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  if (!u) return null;
  const roles = u.roles.map((r: (typeof u.roles)[number]) => r.role);
  const extra: Partial<Record<PermissionKey, 'BRANCH'>> = {};
  for (const r of roles) for (const rp of r.permissions) if (rp.permission.key in PERMISSIONS) extra[rp.permission.key as PermissionKey] = 'BRANCH';
  const p: Principal = { userId: u.id, isSuperAdmin: roles.some((r: { isSuperAdmin: boolean }) => r.isSuperAdmin), roleSlugs: roles.map((r: { slug: string }) => r.slug), branchId: u.branchId, departmentId: u.departmentId, extraGrants: extra };
  return {
    user: u,
    isPlatformTeam: p.isSuperAdmin,
    roles: roles.map((r: { slug: string; name: string }) => roleLabel(r.slug, r.name)),
    access: describeAccess(p),
  };
}

/** Welcome email (with the set-password link) or access-changed email. Returns
 * whether the mail server accepted it; never throws. */
export async function sendStaffAccessEmail(userId: string, kind: 'welcome' | 'updated', changeNote?: string): Promise<boolean> {
  try {
    const a = await accessOf(userId);
    if (!a || !a.user.isActive) return false;
    const setPasswordUrl = kind === 'welcome' ? await issueSetPasswordLink(userId) : undefined;
    const base = portalUrl();
    const { subject, html } = renderStaffAccessEmail({
      kind,
      fullName: a.user.fullName,
      email: a.user.email,
      employeeId: a.user.employeeId,
      companyName: a.user.organisation?.name ?? portalConfig.companyName,
      branchName: a.user.branch?.name ?? null,
      departmentName: a.user.department?.name ?? null,
      roles: a.roles,
      isPlatformTeam: a.isPlatformTeam,
      access: a.access,
      setPasswordUrl,
      setPasswordHours: SET_PASSWORD_HOURS,
      signInUrl: `${base}/login`,
      logoUrl: `${base}/images/logo/logo.png`,
      changeNote,
    });
    await sendEmail(a.user.email, subject, html);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Staff access email failed', userId, kind, err);
    return false;
  }
}

/** Tell everyone who holds a role that its permissions changed (a few at a time). */
export async function emailHoldersOfRole(roleId: string, changeNote: string): Promise<void> {
  const holders = await prisma.userRole.findMany({ where: { roleId, user: { isActive: true } }, select: { userId: true }, take: 500 });
  const ids = holders.map((h: { userId: string }) => h.userId);
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.allSettled(ids.slice(i, i + 5).map((id: string) => sendStaffAccessEmail(id, 'updated', changeNote)));
  }
}
