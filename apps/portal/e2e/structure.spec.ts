import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, who } from './people';
import { signIn } from './helpers';

test('organisation structure: departments are real, added and protected', async ({ page }) => {
  await signIn(page, who('administrator').email, E2E_PASSWORD);
  await page.goto('/structure');
  await expect(page.getByRole('heading', { name: 'Organisation structure' })).toBeVisible();
  await expect(page.getByText('Passenger Vehicle Workshop').first()).toBeVisible();
  const name = `Customer Care ${Date.now() % 10000}`;
  await page.getByRole('textbox', { name: /New department in/ }).first().fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(page.getByText('Department added.')).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  // A system department cannot be switched off (no button at all on the branch page).
  await page.getByRole('link', { name: 'Manage →' }).first().click();
  const store = page.getByRole('listitem').filter({ hasText: /^Store/ });
  await expect(store.getByRole('button', { name: 'Switch off' })).toHaveCount(0);
});

test('roadmap: every signed-in person sees what is coming next', async ({ page }) => {
  await signIn(page, who('technician').email, E2E_PASSWORD);
  await page.getByRole('link', { name: /HR & People/ }).click();
  await expect(page.getByRole('heading', { name: 'HR & People' })).toBeVisible();
  await expect(page.getByText(/Clock in, clock out/)).toBeVisible();
  await page.goto('/payroll');
  await expect(page).toHaveURL(/\/roadmap\/payroll/);
});
