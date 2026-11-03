import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { db } from './db';
import { expectSignedIn, gotoSettled, signIn, signOut } from './helpers';
import { DEMO_E2E_PASSWORD } from './people';
import { customerSignedIn, websiteUp } from './customer';
import { DEMO_CUSTOMERS, DEMO_STAFF, demoPerson } from '../lib/demo/people';

/**
 * D1 — the demo people with sign-ins (lib/demo). The CI seed ran
 * `npm run demo:people` once with DEMO_E2E_PASSWORD. Here: every account
 * exists where the list says, with its roles and a sign-in; people sign in
 * and land on their own dashboard; what they must not see is refused; the
 * customer-portal sign-ins work; a second run changes nothing (and no
 * password); RESET_DEMO_PASSWORDS=yes sets them again and signs everyone
 * out; a demo person in an organisation that is not a demo is switched off.
 */
test.describe.configure({ mode: 'serial' });

const ROOT = join(__dirname, '..', '..', '..');
const run = (env: Record<string, string>) => execFileSync('npx', ['tsx', 'apps/portal/scripts/demo-people.ts'], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180_000 });
const staffEmails = DEMO_STAFF.map((s) => s.email);
const demoCustomer = (kind: (typeof DEMO_CUSTOMERS)[number]['kind']) => DEMO_CUSTOMERS.find((c) => c.kind === kind)!;

async function hashes(): Promise<Map<string, string | null>> {
  const rows = await db().account.findMany({ where: { providerId: 'credential', user: { email: { in: staffEmails } } }, select: { password: true, user: { select: { email: true } } } });
  return new Map(rows.map((r) => [r.user.email, r.password]));
}

test('every demo person exists once, on the right branch and department, with their roles, employee number and a sign-in; the organisation is marked as the demo', async () => {
  const org = await db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' }, select: { id: true, isDemo: true } });
  expect(org.isDemo).toBe(true);
  const users = await db().user.findMany({ where: { email: { in: staffEmails } }, select: { email: true, organisationId: true, employeeId: true, fullName: true, isActive: true, emailVerified: true, branch: { select: { type: true, code: true } }, department: { select: { slug: true } }, roles: { select: { role: { select: { slug: true } } } }, accounts: { select: { providerId: true } }, employeeProfile: { select: { jobTitle: true } } } });
  expect(users).toHaveLength(DEMO_STAFF.length);
  for (const s of DEMO_STAFF) {
    const u = users.find((x) => x.email === s.email)!;
    expect(u, s.email).toBeTruthy();
    expect(u.organisationId).toBe(org.id);
    expect(u.fullName).toBe(s.name);
    expect(u.employeeId).toBe(s.employeeId);
    expect(u.isActive && u.emailVerified).toBe(true);
    expect(u.branch?.type ?? 'HQ', s.email).toBe(s.branch === 'HQ' ? 'HQ' : s.branch === 'ISOLO' ? 'WORKSHOP' : 'ASSEMBLY_PLANT');
    expect(u.department?.slug ?? null, s.email).toBe(s.dept);
    for (const role of [s.role, ...(s.alsoRoles ?? [])]) expect(u.roles.map((r) => r.role.slug), `${s.email} has ${role}`).toContain(role);
    expect(u.accounts.map((a) => a.providerId)).toEqual(['credential']);
    expect(u.employeeProfile?.jobTitle).toBe(s.jobTitle);
  }
  // The first release's plant addresses are gone: renamed, not doubled.
  expect(await db().user.count({ where: { email: { endsWith: '@afprint-demo.example' } } })).toBe(0);
  const customers = await db().customer.findMany({ where: { email: { in: DEMO_CUSTOMERS.map((c) => c.email) } }, select: { email: true, organisationId: true, customerType: true, customerCompany: { select: { companyName: true } }, accounts: { select: { providerId: true } } } });
  expect(customers).toHaveLength(4);
  for (const c of customers) { expect(c.organisationId).toBe(org.id); expect(c.accounts.map((a) => a.providerId)).toEqual(['credential']); }
  expect(customers.find((c) => c.email === demoCustomer('FLEET').email)?.customerCompany?.companyName).toBe(demoCustomer('FLEET').company);
  expect(customers.find((c) => c.email === demoCustomer('INDIVIDUAL').email)?.customerType).toBe('INDIVIDUAL');
  // Audited.
  expect(await db().auditLog.count({ where: { organisationId: org.id, action: 'demo.people_loaded' } })).toBeGreaterThanOrEqual(1);
});


test('they sign in: headquarters, the workshop and the plant each land on their own dashboard; a line operator is refused the job cards, a calendar user the plant', async ({ page }) => {
  for (const [person, must, mustNot] of [
    [demoPerson('administrator', 'HQ'), '/users', null],
    [demoPerson('technician', 'ISOLO'), '/workshop/job-cards', '/plant'],
    [demoPerson('line-operator', 'AFPRINT'), '/plant/line', '/workshop/job-cards'],
    [demoPerson('calendar-user', 'HQ'), '/schedule', '/plant'],
  ] as const) {
    await signIn(page, person.email, DEMO_E2E_PASSWORD);
    await expect(page.getByRole('button', { name: 'Account menu' })).toContainText(person.name);
    await gotoSettled(page, must);
    await expect(page, `${person.email} may open ${must}`).not.toHaveURL(/\/access-denied|\/login/);
    if (mustNot) {
      await gotoSettled(page, mustNot);
      await expect(page, `${person.email} must not open ${mustNot}`).toHaveURL(/\/access-denied/);
    }
    await signOut(page);
  }
});

test('the customer-portal sign-ins work: the individual and the fleet company each see their own overview', async ({ page, request }) => {
  test.skip(!(await websiteUp(request)), 'the customer portal (apps/website) is not running');
  for (const kind of ['INDIVIDUAL', 'FLEET'] as const) {
    const c = demoCustomer(kind);
    await customerSignedIn(page, { email: c.email, name: c.name, password: DEMO_E2E_PASSWORD });
    await page.goto(`${process.env.E2E_WEBSITE_URL ?? 'http://localhost:3002'}/customer-portal?error=signed_out`).catch(() => undefined);
    await page.context().clearCookies();
  }
});

test('a second run changes nothing — no new account, no password touched; with RESET_DEMO_PASSWORDS=yes every sign-in is set again and open sessions are signed out', async ({ page }) => {
  const before = await hashes();
  const usersBefore = await db().user.count({ where: { email: { endsWith: '@demo.kewalram.local' } } });
  const out = run({ DEMO_STAFF_PASSWORD: DEMO_E2E_PASSWORD });
  expect(out).toMatch(/0 staff created, 0 renamed, 0 refreshed, 0 staff passwords set, 0 customers created, 0 customer-portal passwords set/);
  expect(await hashes()).toEqual(before);
  expect(await db().user.count({ where: { email: { endsWith: '@demo.kewalram.local' } } })).toBe(usersBefore);
  // Nothing printed that should not be.
  expect(out).not.toContain(DEMO_E2E_PASSWORD);
  // A signed-in demo person…
  const tech = demoPerson('technician', 'ISOLO');
  await signIn(page, tech.email, DEMO_E2E_PASSWORD);
  const reset = run({ DEMO_STAFF_PASSWORD: DEMO_E2E_PASSWORD, RESET_DEMO_PASSWORDS: 'yes' });
  expect(reset).toMatch(new RegExp(`${DEMO_STAFF.length} staff passwords set, 0 customers created, ${DEMO_CUSTOMERS.length} customer-portal passwords set.*RESET_DEMO_PASSWORDS=yes`));
  const after = await hashes();
  for (const [email, hash] of after) expect(hash, email).not.toBe(before.get(email));
  // …is signed out by the reset.
  await page.reload();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  await signIn(page, tech.email, DEMO_E2E_PASSWORD);
  await expectSignedIn(page);
  await signOut(page);
});

test('a demo person in an organisation that is not a demo is switched off and signed out; a short or missing password makes nothing and stops nothing', async () => {
  const slug = `e2e-not-demo-${Date.now().toString(36)}`;
  const other = await db().organisation.create({ data: { name: 'Not A Demo Ltd', slug }, select: { id: true } });
  const stray = await db().user.create({ data: { email: `stray.${Date.now().toString(36)}@demo.kewalram.local`, fullName: 'Stray Demo', organisationId: other.id, accountType: 'EMPLOYEE', isActive: true }, select: { id: true } });
  await db().session.create({ data: { userId: stray.id, token: `e2e-${Date.now()}`, expiresAt: new Date(Date.now() + 3600_000) } });
  const out = run({ DEMO_STAFF_PASSWORD: DEMO_E2E_PASSWORD });
  expect(out).toMatch(/1 stray demo accounts switched off/);
  const after = await db().user.findUniqueOrThrow({ where: { id: stray.id }, select: { isActive: true, sessions: true } });
  expect(after.isActive).toBe(false);
  expect(after.sessions).toHaveLength(0);
  expect(await db().user.count({ where: { organisationId: other.id, email: { in: staffEmails } } })).toBe(0);
  // Too short: skipped, with the reason, nothing made.
  const short = run({ DEMO_STAFF_PASSWORD: 'abc' });
  expect(short).toMatch(/skipped.*needs at least 8/);
  // Not set: skipped.
  const none = run({ DEMO_STAFF_PASSWORD: '' });
  expect(none).toMatch(/skipped.*DEMO_STAFF_PASSWORD is not set/);
  await db().user.delete({ where: { id: stray.id } });
  await db().organisation.delete({ where: { id: other.id } });
});
