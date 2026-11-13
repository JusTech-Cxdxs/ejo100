/**
 * Writes the demo people (./people.ts) into a demo organisation, with their
 * sign-ins. Used by `npm run demo:people`, by `npm run demo:reset`, by the
 * production build (scripts/db-push-if-vercel.js) and later by the platform
 * team's console; the callers decide when.
 *
 * Rules, every one of them tested:
 *   • Only an organisation marked as a demo (organisations.isDemo) gets demo
 *     people. A demo person found in any other organisation is switched off.
 *   • No password in code, ever. Staff sign-ins exist only while
 *     DEMO_STAFF_PASSWORD is set (8 characters or more); customer-portal
 *     sign-ins use DEMO_CUSTOMER_PASSWORD, or the staff password when that is
 *     not set. Too short: no account is made, nothing stops, the log says why.
 *   • Idempotent. A second run adds nothing; it keeps names, branches,
 *     departments, roles and employee numbers right. A password already set is
 *     NEVER changed, and an account an administrator switched off is never
 *     switched back on — unless RESET_DEMO_PASSWORDS=yes is set for that run
 *     (then every demo sign-in gets the password again and its open sessions
 *     are signed out). Set it for one run and take it away again.
 *   • Nothing is emailed: the addresses are on a reserved name.
 *   • Every run leaves one audit entry (demo.people_loaded) with counts.
 *
 * Takes the Prisma client it should use, so the deploy script (its own
 * client, like the seed) and the portal (the shared, journaled client) call
 * the same code. No '@/…' imports: tsx runs this file outside Next.
 */
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../authz/catalogue';
import { DEMO_CUSTOMERS, DEMO_DOMAIN, DEMO_PASSWORD_MIN, DEMO_STAFF, type DemoBranch, type DemoStaff } from './people';

export type DemoPeopleEnv = Record<string, string | undefined>;

export type DemoPeopleResult = {
  organisation: string;
  /** Why nothing was done (null when the load ran). */
  skipped: string | null;
  staffCreated: number;
  staffRenamed: number;
  staffRefreshed: number;
  passwordsSet: number;
  customersCreated: number;
  customerPasswordsSet: number;
  /** Demo people found in organisations that are not demos, switched off. */
  strayDisabled: number;
  reset: boolean;
  notes: string[];
};

/** Source marker on the demo customers (the workshop demo adds their records under the same mark). */
export const DEMO_SOURCE = 'EJO-DEMO';

const resetAsked = (env: DemoPeopleEnv) => env.RESET_DEMO_PASSWORDS === 'yes';

/** The passwords the environment offers, checked; a problem is a message, never a throw. */
export function demoPasswords(env: DemoPeopleEnv): { staff: string | null; customer: string | null; problems: string[] } {
  const problems: string[] = [];
  const staffRaw = (env.DEMO_STAFF_PASSWORD ?? '').trim();
  const customerRaw = (env.DEMO_CUSTOMER_PASSWORD ?? '').trim() || staffRaw;
  let staff: string | null = null;
  let customer: string | null = null;
  if (!staffRaw) problems.push('DEMO_STAFF_PASSWORD is not set: no staff sign-ins.');
  else if (staffRaw.length < DEMO_PASSWORD_MIN) problems.push(`DEMO_STAFF_PASSWORD has ${staffRaw.length} characters; it needs at least ${DEMO_PASSWORD_MIN}. No staff sign-ins.`);
  else staff = staffRaw;
  if (!customerRaw) problems.push('No customer password (DEMO_CUSTOMER_PASSWORD or DEMO_STAFF_PASSWORD): no customer-portal sign-ins.');
  else if (customerRaw.length < DEMO_PASSWORD_MIN) problems.push(`The customer-portal password needs at least ${DEMO_PASSWORD_MIN} characters. No customer-portal sign-ins.`);
  else customer = customerRaw;
  return { staff, customer, problems };
}

const roleName = (slug: string) => (ROLE_LABELS[slug] ?? slug).replace(/\s*\(.*\)\s*$/, '');

/** Every role the demo people hold exists for the organisation (missing ones are added as system roles; existing ones are never changed). */
async function ensureRoles(prisma: PrismaClient, organisationId: string): Promise<Map<string, string>> {
  const slugs = [...new Set(DEMO_STAFF.flatMap((s) => [s.role, ...(s.alsoRoles ?? [])]))];
  for (const slug of slugs) {
    await prisma.role.upsert({
      where: { organisationId_slug: { organisationId, slug } },
      update: {},
      create: { organisationId, slug, name: roleName(slug), description: ROLE_DESCRIPTIONS[slug] ?? null, isSystem: true },
    });
  }
  return new Map((await prisma.role.findMany({ where: { organisationId, slug: { in: slugs } }, select: { id: true, slug: true } })).map((r) => [r.slug, r.id]));
}

/** Isolo (the first workshop branch) and Afprint (the first assembly plant) of the organisation. */
async function demoBranches(prisma: PrismaClient, organisationId: string): Promise<Record<Exclude<DemoBranch, 'HQ'>, { id: string; name: string }>> {
  const branches = await prisma.branch.findMany({ where: { businessUnit: { organisationId } }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, code: true, type: true } });
  const isolo = branches.find((b) => b.code === 'KWL-WS') ?? branches.find((b) => b.type === 'WORKSHOP');
  const afprint = branches.find((b) => b.code === 'KWL-AP') ?? branches.find((b) => b.type === 'ASSEMBLY_PLANT');
  if (!isolo) throw new Error('Demo people: the organisation has no workshop branch yet — run the base seed first.');
  if (!afprint) throw new Error('Demo people: the organisation has no assembly plant yet. Open it first (Assembly plant → Open the assembly plant now) and run again.');
  return { ISOLO: { id: isolo.id, name: isolo.name }, AFPRINT: { id: afprint.id, name: afprint.name } };
}

/**
 * Demo people in organisations that are NOT demos are switched off (and
 * signed out) — never deleted, so an administrator can see what happened.
 * Runs on every load, for every organisation.
 */
export async function disableStrayDemoPeople(prisma: PrismaClient): Promise<number> {
  const stray = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` }, isActive: true, OR: [{ organisationId: null }, { organisation: { isDemo: false } }] },
    select: { id: true },
  });
  if (!stray.length) return 0;
  const ids = stray.map((u) => u.id);
  await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  const strayCustomers = await prisma.customer.findMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` }, isActive: true, organisation: { isDemo: false } }, select: { id: true } });
  if (strayCustomers.length) {
    const cids = strayCustomers.map((c) => c.id);
    await prisma.customer.updateMany({ where: { id: { in: cids } }, data: { isActive: false } });
    await prisma.customerSession.deleteMany({ where: { customerId: { in: cids } } });
  }
  return ids.length + strayCustomers.length;
}

/** Marks an organisation as the demo (platform team or the reset command; audited by the caller). */
export async function markDemoOrganisation(prisma: PrismaClient, organisationId: string, isDemo: boolean): Promise<void> {
  await prisma.organisation.update({ where: { id: organisationId }, data: { isDemo } });
}

async function placeStaff(prisma: PrismaClient, organisationId: string, s: DemoStaff, branches: Awaited<ReturnType<typeof demoBranches>>, roles: Map<string, string>, hash: string, reset: boolean, r: DemoPeopleResult): Promise<string> {
  const branchId = s.branch === 'HQ' ? null : branches[s.branch].id;
  const dept = s.dept && branchId ? await prisma.department.findUnique({ where: { branchId_slug: { branchId, slug: s.dept } }, select: { id: true } }) : null;
  if (s.dept && !dept) r.notes.push(`${s.email}: the department ${s.dept} does not exist on ${s.branch}; placed without one.`);
  const select = { id: true, email: true, organisationId: true, fullName: true, branchId: true, departmentId: true, isActive: true, employeeId: true } as const;
  let existing = await prisma.user.findUnique({ where: { email: s.email }, select });
  if (!existing && s.previousEmail) {
    const old = await prisma.user.findUnique({ where: { email: s.previousEmail }, select });
    if (old && (!old.organisationId || old.organisationId === organisationId)) {
      existing = await prisma.user.update({ where: { id: old.id }, data: { email: s.email, emailVerified: true }, select });
      r.staffRenamed += 1;
    }
  }
  if (existing && existing.organisationId && existing.organisationId !== organisationId) throw new Error(`Demo people: ${s.email} belongs to another organisation.`);
  // The employee number, unless another account already carries it (an older database): then that one keeps it.
  const holder = await prisma.user.findUnique({ where: { employeeId: s.employeeId }, select: { id: true } });
  const employeeId = !holder || holder.id === existing?.id ? s.employeeId : null;
  if (!employeeId) r.notes.push(`${s.email}: the employee number ${s.employeeId} is held by another account; left as it is.`);
  let userId: string;
  if (!existing) {
    const made = await prisma.user.create({
      data: { email: s.email, fullName: s.name, organisationId, branchId, departmentId: dept?.id ?? null, accountType: 'EMPLOYEE', emailVerified: true, isActive: true, employeeId },
      select: { id: true },
    });
    userId = made.id;
    r.staffCreated += 1;
  } else {
    // Keep the demo account right (a run after someone moved it puts it back). An account an
    // administrator switched off STAYS off (every production deploy runs this): only a reset switches it back on.
    const want = { fullName: s.name, organisationId, branchId, departmentId: dept?.id ?? null, isActive: existing.isActive || reset, ...(employeeId && existing.employeeId !== employeeId ? { employeeId } : {}) };
    const changed = existing.fullName !== want.fullName || existing.organisationId !== want.organisationId || existing.branchId !== want.branchId || existing.departmentId !== want.departmentId || existing.isActive !== want.isActive || 'employeeId' in want;
    if (changed) { await prisma.user.update({ where: { id: existing.id }, data: want }); r.staffRefreshed += 1; }
    userId = existing.id;
  }
  const wanted: string[] = [];
  for (const slug of [s.role, ...(s.alsoRoles ?? [])]) {
    const roleId = roles.get(slug);
    if (!roleId) throw new Error(`Demo people: the role ${slug} is missing.`);
    await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId } }, update: {}, create: { userId, roleId } });
    wanted.push(roleId);
  }
  // Keep the demo account right: a role this demo person no longer has in the demo (their job changed) comes off, so what they are shown matches their tour.
  await prisma.userRole.deleteMany({ where: { userId, roleId: { notIn: wanted } } });
  const account = await prisma.account.findFirst({ where: { userId, providerId: 'credential' }, select: { id: true } });
  if (!account) {
    await prisma.account.create({ data: { userId, accountId: userId, providerId: 'credential', password: hash } });
    r.passwordsSet += 1;
  } else if (reset) {
    await prisma.account.update({ where: { id: account.id }, data: { password: hash } });
    await prisma.session.deleteMany({ where: { userId } });
    r.passwordsSet += 1;
  }
  return userId;
}

/** Job title and reporting line, set once (an HR change made in the portal is kept). */
async function placeProfiles(prisma: PrismaClient, ids: Map<string, string>): Promise<void> {
  for (const s of DEMO_STAFF) {
    const userId = ids.get(s.email);
    if (!userId || (await prisma.employeeProfile.findUnique({ where: { userId }, select: { id: true } }))) continue;
    await prisma.employeeProfile.create({
      data: {
        userId, jobTitle: s.jobTitle, employmentType: 'Full-time', employmentStatus: 'Active',
        dateEmployed: new Date(Date.UTC(2015 + (s.email.length % 9), s.name.length % 12, 1 + (s.email.length % 27))),
        reportingManagerId: s.reportsTo ? ids.get(s.reportsTo) ?? null : null,
        emergencyContactName: 'Next of kin (demo)', emergencyContactRelationship: 'Spouse', emergencyContactPhone: '0800 000 0000',
      },
    });
  }
}

async function placeCustomers(prisma: PrismaClient, organisationId: string, createdById: string | null, hash: string | null, reset: boolean, r: DemoPeopleResult): Promise<void> {
  for (const c of DEMO_CUSTOMERS) {
    let customer = await prisma.customer.findUnique({ where: { email: c.email }, select: { id: true, organisationId: true, isActive: true } });
    if (customer && customer.organisationId !== organisationId) { r.notes.push(`${c.email} is a customer of another organisation; left alone.`); continue; }
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          organisationId, fullName: c.name, email: c.email, emailVerified: true, phone: c.phone, address: c.address,
          customerType: c.company ? 'ORGANIZATION' : 'INDIVIDUAL', externalSource: DEMO_SOURCE, externalId: c.email.split('@')[0]!,
          createdById, tags: ['demo'],
          ...(c.company ? { customerCompany: { create: { companyName: c.company } } } : {}),
        },
        select: { id: true, organisationId: true, isActive: true },
      });
      r.customersCreated += 1;
    } else if (!customer.isActive) {
      if (!reset) continue; // switched off by the organisation: stays off
      await prisma.customer.update({ where: { id: customer.id }, data: { isActive: true } });
    }
    if (!hash) continue;
    const account = await prisma.customerAccount.findFirst({ where: { customerId: customer.id, providerId: 'credential' }, select: { id: true } });
    if (!account) {
      await prisma.customerAccount.create({ data: { customerId: customer.id, accountId: customer.id, providerId: 'credential', password: hash } });
      r.customerPasswordsSet += 1;
    } else if (reset) {
      await prisma.customerAccount.update({ where: { id: account.id }, data: { password: hash } });
      await prisma.customerSession.deleteMany({ where: { customerId: customer.id } });
      r.customerPasswordsSet += 1;
    }
  }
}

/**
 * Loads the demo people into one organisation. Refuses (returns `skipped`)
 * when the organisation is not marked as a demo or no usable password is
 * set. `actorId` is the person who asked (null for the deploy).
 */
export async function loadDemoPeople(prisma: PrismaClient, organisationId: string, env: DemoPeopleEnv = process.env, actorId: string | null = null): Promise<DemoPeopleResult> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, isDemo: true } });
  if (!org) throw new Error('Demo people: no such organisation.');
  const reset = resetAsked(env);
  const r: DemoPeopleResult = { organisation: org.name, skipped: null, staffCreated: 0, staffRenamed: 0, staffRefreshed: 0, passwordsSet: 0, customersCreated: 0, customerPasswordsSet: 0, strayDisabled: 0, reset, notes: [] };
  r.strayDisabled = await disableStrayDemoPeople(prisma);
  if (!org.isDemo) { r.skipped = `${org.name} is not marked as a demo organisation; no demo people are made for it.`; return r; }
  const passwords = demoPasswords(env);
  r.notes.push(...passwords.problems);
  if (!passwords.staff && !passwords.customer) { r.skipped = 'No usable demo password is set.'; return r; }
  const ids = new Map<string, string>();
  if (passwords.staff) {
    const [hash, branches, roles] = await Promise.all([hashPassword(passwords.staff), demoBranches(prisma, organisationId), ensureRoles(prisma, organisationId)]);
    for (const s of DEMO_STAFF) ids.set(s.email, await placeStaff(prisma, organisationId, s, branches, roles, hash, reset, r));
    await placeProfiles(prisma, ids);
  }
  const customerHash = passwords.customer ? await hashPassword(passwords.customer) : null;
  await placeCustomers(prisma, organisationId, ids.get(DEMO_STAFF[0]!.email) ?? actorId, customerHash, reset, r);
  await prisma.auditLog.create({
    data: {
      organisationId, userId: actorId, action: 'demo.people_loaded', entityType: 'Organisation', entityId: organisationId,
      metadata: { staffCreated: r.staffCreated, staffRenamed: r.staffRenamed, staffRefreshed: r.staffRefreshed, passwordsSet: r.passwordsSet, customersCreated: r.customersCreated, customerPasswordsSet: r.customerPasswordsSet, strayDisabled: r.strayDisabled, reset, notes: r.notes },
    },
  });
  return r;
}

/** One line for a log, never a secret. */
export function describeDemoPeople(r: DemoPeopleResult): string {
  if (r.skipped) return `Demo people (${r.organisation}): skipped — ${r.skipped}${r.notes.length ? ` ${r.notes.join(' ')}` : ''}`;
  return `Demo people (${r.organisation}): ${r.staffCreated} staff created, ${r.staffRenamed} renamed, ${r.staffRefreshed} refreshed, ${r.passwordsSet} staff passwords set, ${r.customersCreated} customers created, ${r.customerPasswordsSet} customer-portal passwords set, ${r.strayDisabled} stray demo accounts switched off${r.reset ? ' (RESET_DEMO_PASSWORDS=yes)' : ''}.${r.notes.length ? ` Notes: ${r.notes.join(' ')}` : ''}`;
}
