import { test, expect, type Page } from '@playwright/test';
import { CUSTOMER, OTHER_PORTAL_CUSTOMER, PORTAL_CUSTOMER } from './people';
import { as } from './helpers';
import { jobNumber, openJobCard } from './workflows';

/**
 * Customer portal (apps/website on :3002 in CI) — what exists TODAY:
 * sign in at /customer-portal, the dashboard shows the customer's own
 * vehicles and the Job Card staff just opened for them; a wrong password
 * gets a clear error; another customer's data never appears.
 *
 * The customer-portal workstream is rebuilding this app on another branch —
 * extend this file after merging it (addresses, notifications, payments …).
 * Every test skips when the website is not running.
 */
const WEB = process.env.E2E_WEBSITE_URL ?? 'http://localhost:3002';
test.describe.configure({ mode: 'serial' });

const S = { number: '' };

test.beforeAll(async ({ request }) => {
  const up = await request.get(`${WEB}/customer-portal`, { timeout: 10_000 }).then((r) => r.status() < 500).catch(() => false);
  test.skip(!up, `the website is not running at ${WEB}`);
});

async function customerSignIn(page: Page, email: string, password: string) {
  await page.goto(`${WEB}/customer-portal`);
  await expect(page.getByRole('heading', { name: 'Customer Portal' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test('staff open a Job Card for the portal customer', async ({ page }) => {
  await as(page, 'receptionist');
  await openJobCard(page, { plate: PORTAL_CUSTOMER.plate, customer: PORTAL_CUSTOMER.name, complaint: 'Portal check: rattling dashboard' });
  S.number = await jobNumber(page);
});

test('the customer signs in and sees their own vehicle and Job Card', async ({ page }) => {
  await customerSignIn(page, PORTAL_CUSTOMER.email, PORTAL_CUSTOMER.password);
  await page.waitForURL(/\/customer-portal\/dashboard/);
  await expect(page.getByRole('heading', { name: `Welcome back, ${PORTAL_CUSTOMER.name}` })).toBeVisible();
  await expect(page.getByText(PORTAL_CUSTOMER.plate).first()).toBeVisible();
  if (S.number) await expect(page.getByText(S.number)).toBeVisible();
  await test.step('never another customer’s vehicles or jobs', async () => {
    const body = page.locator('body');
    await expect(body).not.toContainText(OTHER_PORTAL_CUSTOMER.plate);
    await expect(body).not.toContainText('E2E-001-AA');
    await expect(body).not.toContainText(CUSTOMER.name);
  });
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await customerSignIn(page, PORTAL_CUSTOMER.email, 'not-the-password-123');
  await expect(page.locator('form p').filter({ hasText: /invalid|incorrect|wrong/i }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/customer-portal$/);
});

test('another customer sees only their own record', async ({ page }) => {
  await customerSignIn(page, OTHER_PORTAL_CUSTOMER.email, OTHER_PORTAL_CUSTOMER.password);
  await page.waitForURL(/\/customer-portal\/dashboard/);
  await expect(page.getByText(OTHER_PORTAL_CUSTOMER.plate).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(PORTAL_CUSTOMER.plate);
  if (S.number) await expect(page.locator('body')).not.toContainText(S.number);
});

test('the dashboard needs a customer session', async ({ page }) => {
  await page.goto(`${WEB}/customer-portal/dashboard`);
  await expect(page).toHaveURL(/\/customer-portal\?redirect=/);
  await expect(page.getByRole('heading', { name: 'Customer Portal' })).toBeVisible();
});
