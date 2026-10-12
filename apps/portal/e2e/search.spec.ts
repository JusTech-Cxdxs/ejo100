import { test, expect, type Page } from '@playwright/test';
import { CUSTOMER, E2E_PASSWORD, OTHER_ORG_ADMIN, SEED_PARTS } from './people';
import { as, expectHealthy, signIn } from './helpers';
import { freshVehicle } from './db';
import { jobNumber, openJobCard } from './workflows';

/**
 * The header search finds a Job Card by number, a customer by name, a
 * vehicle by plate and a part — and another organisation's administrator
 * searching the very same words finds none of them.
 */
test.describe.configure({ mode: 'serial' });

const S = { plate: '', number: '', url: '' };

async function search(page: Page, q: string) {
  const box = page.getByRole('searchbox', { name: 'Search everything' }).or(page.getByLabel('Search everything')).first();
  await box.fill(q);
  const panel = box.locator('xpath=following-sibling::div[1]');
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText(/Searching…/);
  return panel;
}

test.beforeAll(async () => { S.plate = (await freshVehicle('SRC', { make: 'Mazda', model: 'CX-5' })).plate; });

test('front desk finds the Job Card, the customer, the vehicle; Store finds the part', async ({ page }) => {
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: S.plate, complaint: 'Search me' });
  S.number = await jobNumber(page);

  let panel = await search(page, S.number);
  await expect(panel.getByRole('button', { name: new RegExp(S.number) })).toBeVisible();
  await panel.getByRole('button', { name: new RegExp(S.number) }).first().click();
  await page.waitForURL(new RegExp(S.url));

  panel = await search(page, CUSTOMER.name);
  await expect(panel.getByRole('button', { name: new RegExp(CUSTOMER.name) }).first()).toBeVisible();

  panel = await search(page, S.plate);
  await expect(panel.getByRole('button', { name: /Mazda CX-5/ }).first()).toBeVisible();
  await panel.getByRole('button', { name: /Mazda CX-5/ }).first().click();
  await page.waitForURL(/\/workshop\/vehicles\/[^/]+\/edit/);
  await expectHealthy(page);

  await as(page, 'store-manager');
  panel = await search(page, SEED_PARTS.brakePads.name);
  await expect(panel.getByRole('button', { name: new RegExp(SEED_PARTS.brakePads.number) }).first()).toBeVisible();
});

test('special characters and emoji in the search never break it', async ({ page }) => {
  await as(page, 'receptionist');
  for (const q of [`Ünïcødé 🚗 '"<script>alert(1)</script>`, '%_\\', 'a'.repeat(300)]) {
    const panel = await search(page, q);
    await expect(panel).toContainText(/Nothing found for|Pages|Job Cards/);
  }
  await expectHealthy(page);
});

test('another organisation’s administrator finds none of it', async ({ page }) => {
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  for (const q of [S.number, CUSTOMER.name, S.plate, SEED_PARTS.brakePads.number, SEED_PARTS.brakePads.name]) {
    const panel = await search(page, q);
    await expect(panel, `"${q}" must not be found by another organisation`).toContainText('Nothing found for');
  }
});
