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

/** Type into the header search (desktop) and return its results popup once the answer is in. */
async function search(page: Page, q: string) {
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(q);
  // The field's wrapper holds the field and, once results arrive, the popup.
  const panel = box.locator('xpath=ancestor::div[2]');
  const answered = panel.getByRole('listbox', { name: 'Search results' }).or(panel.getByText(/^Nothing found for/)).or(panel.getByText(/Search isn’t available/));
  await expect(answered.first()).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Searching' })).toHaveCount(0);
  await expect(panel, 'the search must answer, not fail').not.toContainText('Search isn’t available');
  return panel;
}

test.beforeAll(async () => { S.plate = (await freshVehicle('SRC', { make: 'Mazda', model: 'CX-5' })).plate; });

test('front desk finds the Job Card, the customer, the vehicle; Store finds the part', async ({ page }) => {
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: S.plate, complaint: 'Search me' });
  S.number = await jobNumber(page);

  let panel = await search(page, S.number);
  await expect(panel.getByRole('option', { name: new RegExp(S.number) })).toBeVisible();
  await panel.getByRole('option', { name: new RegExp(S.number) }).first().click();
  await page.waitForURL(new RegExp(S.url));

  panel = await search(page, CUSTOMER.name);
  await expect(panel.getByRole('option', { name: new RegExp(CUSTOMER.name) }).first()).toBeVisible();

  panel = await search(page, S.plate);
  await expect(panel.getByRole('option', { name: /Mazda CX-5/ }).first()).toBeVisible();
  await panel.getByRole('option', { name: /Mazda CX-5/ }).first().click();
  await page.waitForURL(/\/workshop\/vehicles\/[^/]+\/edit/);
  await expectHealthy(page);

  await as(page, 'store-manager');
  panel = await search(page, SEED_PARTS.brakePads.name);
  await expect(panel.getByRole('option', { name: new RegExp(SEED_PARTS.brakePads.number) }).first()).toBeVisible();
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
