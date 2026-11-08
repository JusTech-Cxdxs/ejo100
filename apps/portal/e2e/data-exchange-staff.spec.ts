import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open, signIn, signOut, latestMail, linkIn, countMail } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * P7 — the organisation's people from SAP HR: each becomes an EJO account in
 * its branch and department with its roles, switched OFF and emailed nothing,
 * until an Organisation Administrator sends the invitations; then each person
 * gets the welcome with a one-time set-password link, signs in, and sees
 * their own dashboard. Administrator roles, unknown branches, departments and
 * roles, an address already in use elsewhere are refused; an address already
 * in this organisation is left as it is. Undo bins only those never invited.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Za-z0-9]/g, '').slice(-6).toLowerCase();
const D = String(Date.now()).slice(-6);
const mail = (n: number) => `p7.${T}.${n}@staff.example.com`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');
let importUrl = '';

async function upload(page: Page, body: string): Promise<string> {
  await open(page, '/data-exchange/new?entity=staff');
  await expect(page.locator('#import-file')).toHaveCount(1);
  await expect(page.locator('#import-branch')).toHaveCount(0); // a branch per row
  await page.locator('#import-file').setInputFiles({ name: `hr-${T}.csv`, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  return page.url();
}

test('the staff file: refusals and the totals; the Organisation Administrator approves; accounts switched off, roles given, nobody emailed', async ({ page, request }) => {
  const manager = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branch: { select: { id: true, name: true } } } });
  const branch = manager.branch!;
  const dept = await db().department.findFirstOrThrow({ where: { branchId: branch.id, slug: 'workshop-commercial' }, select: { id: true, name: true } });
  await as(page, 'it-administrator');
  importUrl = await upload(page, csv([
    ['PERNR', 'ENAME', 'Work email', 'Employee ID', 'Branch', 'Department', 'Roles'],
    [`0001${D}1`, `Ada Import ${T}`, mail(1), `P7-${D}-1`, branch.name, dept.name, 'Technician'],
    [`0001${D}2`, `Bayo Import ${T}`, mail(2), '', branch.name, '', 'Front Desk; Customer Care'],
    [`0001${D}3`, `Chika Import ${T}`, mail(3), '', branch.name, '', ''],
    [`0001${D}4`, `Ada Again ${T}`, mail(1), '', branch.name, '', 'Technician'],
    [`0001${D}5`, `Existing ${T}`, who('workshop-manager').email, '', branch.name, '', 'Technician'],
    [`0001${D}6`, `Admin Try ${T}`, mail(6), '', branch.name, '', 'Administrator'],
    [`0001${D}7`, `Nowhere ${T}`, mail(7), '', 'Lekki Branch', '', 'Technician'],
    [`0001${D}8`, `No Dept ${T}`, mail(8), '', branch.name, 'Canteen', 'Technician'],
    [`0001${D}9`, `No Role ${T}`, mail(9), '', branch.name, '', 'Chief Cook'],
  ]));
  await expect(page.getByText('Same email as row 2 of the file; only the first is loaded.')).toBeVisible();
  await expect(page.getByText(/Already in EJO \(/)).toBeVisible();
  await expect(page.getByText(/the organisation’s administrators are added by hand on the Users page, never by a file/).first()).toBeVisible();
  await expect(page.getByText(/There is no branch “Lekki Branch” in this organisation/)).toBeVisible();
  await expect(page.getByText(new RegExp(`${branch.name} has no department “Canteen”`))).toBeVisible();
  await expect(page.getByText(/There is no role “Chief Cook” in this organisation/)).toBeVisible();
  await expect(page.getByTestId('staff-import-totals')).toContainText('To bring in: 3 people in 1 branch · 1 with no role yet');
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'administrator');
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('staff-invitations')).toContainText('3 accounts from this import · 0 invited · 3 waiting for their invitation');

  const people = await db().user.findMany({ where: { email: { in: [mail(1), mail(2), mail(3)] } }, orderBy: { email: 'asc' }, include: { roles: { include: { role: { select: { slug: true } } } }, accounts: { select: { providerId: true, password: true } } } });
  expect(people.map((u) => u.email)).toEqual([mail(1), mail(2), mail(3)]);
  expect(people.every((u) => !u.isActive && !u.invitedAt && u.importJobId && u.branchId === branch.id && u.externalSource === 'SAP')).toBe(true);
  expect(people[0]!.employeeId).toBe(`P7-${D}-1`);
  expect(people[0]!.departmentId).toBe(dept.id);
  expect(people[1]!.employeeId).toMatch(/^[A-Z0-9]+-[A-Z0-9]+-\d{4}$/); // issued by EJO for the branch
  expect(people[0]!.roles.map((r) => r.role.slug)).toEqual(['technician']);
  expect(people[1]!.roles.map((r) => r.role.slug).sort()).toEqual(['customer-care', 'receptionist']);
  expect(people[2]!.roles).toEqual([]);
  expect(people.every((u) => u.accounts.length === 1 && u.accounts[0]!.providerId === 'credential' && u.accounts[0]!.password)).toBe(true);
  for (const n of [1, 2, 3]) expect(await countMail(request, mail(n), /./)).toBe(0); // nobody emailed at load
  // A switched-off account cannot sign in, whatever it tries.
  await signOut(page);
  await page.goto('/login');
  await page.getByLabel('Work email').fill(mail(1));
  await page.getByLabel('Password', { exact: true }).fill('Anything-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/dashboard/);
});

test('only an administrator of the whole organisation sends the invitations; each person gets the welcome once, sets a password and signs in to their own view', async ({ page, request }) => {
  // A Branch Administrator manages people of one branch only: the file reaches every branch, so no button (and the server refuses).
  await as(page, 'branch-administrator');
  await open(page, importUrl);
  await expect(page.getByTestId('staff-invitations')).toContainText('Waiting for an administrator of the whole organisation');
  await expect(page.getByRole('button', { name: 'Send the invitations' })).toHaveCount(0);
  await as(page, 'administrator');
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Send the invitations' }).click();
  await expect(page.getByTestId('staff-invitations')).toContainText('Everyone from this import has been invited.', { timeout: 60_000 });
  await expect(page.getByTestId('staff-invitations')).toContainText('3 accounts from this import · 3 invited · 0 waiting');
  const ada = await db().user.findUniqueOrThrow({ where: { email: mail(1) }, select: { id: true, isActive: true, invitedAt: true, employeeId: true } });
  expect(ada.isActive).toBe(true);
  expect(ada.invitedAt).not.toBeNull();
  expect(await db().auditLog.count({ where: { action: 'user.invited', entityId: ada.id } })).toBe(1);
  const welcome = await latestMail(request, mail(1), /Welcome to EJO 100/);
  expect(welcome.html).toContain(ada.employeeId!);
  expect(welcome.html).toContain('Technician');
  const link = linkIn(welcome.html, /reset-password/);
  await signOut(page);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  const pw = 'Imported-Pass-2026!';
  await page.getByLabel('New password').fill(pw);
  await page.getByLabel('Type it again').fill(pw);
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.waitForURL(/\/login\?reset=done/);
  await signIn(page, mail(1), pw);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('button', { name: 'Account menu' })).toContainText(`Ada Import ${T}`);
  // Sending again invites nobody twice.
  expect(await countMail(request, mail(1), /Welcome to EJO 100/)).toBe(1);
});

test('undo: everyone invited stays (reported); a second import of one not yet invited goes to the Recycle bin and restores switched off', async ({ page }) => {
  const manager = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branch: { select: { name: true } } } });
  await as(page, 'it-administrator');
  const second = await upload(page, csv([['ENAME', 'Work email', 'Branch', 'Roles'], [`Dayo Import ${T}`, mail(10), manager.branch!.name, 'Technician']]));
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'administrator');
  await open(page, second);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  page.on('dialog', (d) => void d.accept());
  // The first import: everyone was invited, so nobody goes.
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect(await db().user.count({ where: { email: { in: [mail(1), mail(2), mail(3)] } } })).toBe(3);
  // The second: Dayo was never invited — to the bin, no password kept.
  await open(page, second);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect(await db().user.count({ where: { email: mail(10) } })).toBe(0);
  const item = await db().recycleBinItem.findFirstOrThrow({ where: { entityType: 'User', restoredAt: null, label: { contains: mail(10) } }, select: { reference: true, entityId: true, snapshot: true } });
  expect(JSON.stringify(item.snapshot)).not.toMatch(/password|providerId/);
  await open(page, '/recycle-bin?type=User');
  await page.getByTestId('bin-row').filter({ hasText: mail(10) }).first().getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  const back = await db().user.findUniqueOrThrow({ where: { id: item.entityId }, include: { accounts: true, roles: true } });
  expect(back.isActive).toBe(false);
  expect(back.accounts.length).toBe(1);
  expect(back.roles.length).toBe(1);
});
