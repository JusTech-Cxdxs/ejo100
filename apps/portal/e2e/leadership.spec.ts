import { test, expect } from '@playwright/test';
import { as, menuLinks, open, visitHealthy } from './helpers';
import { PLANT_BRANCH } from './people';

/**
 * Headquarters roles in a real browser: the branch bar on every page (all
 * branches, or one), Headquarters and Team performance following it, the IT
 * control room, Enyo's briefing buttons, and branch staff seeing none of it.
 */
test.describe.configure({ mode: 'serial' });

test('an executive chooses a branch in the bar; every page follows; All branches puts it back', async ({ page }) => {
  await as(page, 'executive');
  await visitHealthy(page, '/dashboard');
  const bar = page.getByTestId('branch-lens');
  await expect(bar).toBeVisible();
  const all = bar.getByRole('button', { name: /All branches/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  const branch = bar.getByRole('button').nth(1);
  const name = ((await branch.textContent()) ?? '').trim();
  await branch.click();
  await expect(branch).toHaveAttribute('aria-pressed', 'true');
  await expect(bar).toContainText('only');

  await visitHealthy(page, '/headquarters');
  await expect(page.getByRole('status').filter({ hasText: 'only' }).first()).toBeVisible();
  await expect(page.getByTestId('branch-lens').getByRole('button', { pressed: true })).toContainText(name.slice(0, 6));
  await visitHealthy(page, '/headquarters/team');
  await expect(page.getByRole('heading', { name: 'Team performance', level: 1 })).toBeVisible();
  await visitHealthy(page, '/analytics');
  await visitHealthy(page, '/workshop');

  // Every branch in the bar can be chosen (whatever its id looks like) — on a page every branch has.
  await visitHealthy(page, '/dashboard');
  const chips = page.getByTestId('branch-lens').getByRole('button');
  const n = await chips.count();
  for (let i = 1; i < Math.min(n, 5); i += 1) {
    await chips.nth(i).click();
    await expect(chips.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('branch-lens').getByRole('button', { name: /All branches/ }).click();
  await expect(page.getByTestId('branch-lens').getByRole('button', { name: /All branches/ })).toHaveAttribute('aria-pressed', 'true');
  await open(page, '/headquarters');
  await expect(page.getByRole('status').filter({ hasText: /Showing .* only/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Brief me' }).first()).toBeVisible();
});

const area = (page: import('@playwright/test').Page, name: string) => menuLinks(page).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });

test('the branch bar and the menu follow the kind of branch: the plant is not a choice under Inventory, and has no Inventory of its own', async ({ page }) => {
  await as(page, 'executive');
  // A director oversees every branch: Workshop, Inventory and the Assembly plant are all in the menu.
  await visitHealthy(page, '/dashboard');
  const bar = page.getByTestId('branch-lens');
  const everywhere = await bar.getByRole('button').count();
  for (const name of ['Workshop', 'Inventory', 'Assembly plant']) await expect(area(page, name), name).toHaveCount(1);

  // Under Inventory the bar offers only branches with a store: never the plant.
  await visitHealthy(page, '/inventory');
  await expect(bar.getByRole('button', { name: new RegExp(PLANT_BRANCH) })).toHaveCount(0);
  expect(await bar.getByRole('button').count()).toBeLessThan(everywhere);
  // On the line it offers the plant, and not the workshop.
  await visitHealthy(page, '/plant');
  await expect(bar.getByRole('button', { name: new RegExp(PLANT_BRANCH) })).toHaveCount(1);
  expect(await bar.getByRole('button').count()).toBeLessThan(everywhere);

  // Looking at the plant alone: its menu has the line, and neither Workshop nor Inventory.
  await bar.getByRole('button', { name: new RegExp(PLANT_BRANCH) }).click();
  await expect(bar.getByRole('button', { name: new RegExp(PLANT_BRANCH) })).toHaveAttribute('aria-pressed', 'true');
  await visitHealthy(page, '/dashboard');
  await expect(area(page, 'Assembly plant')).toHaveCount(1);
  for (const name of ['Workshop', 'Inventory']) await expect(area(page, name), name).toHaveCount(0);
  // Typing Inventory's address explains why there is nothing, and offers the branches that have a store.
  await open(page, '/inventory');
  await expect(page.getByTestId('branch-lens-elsewhere')).toContainText(`${PLANT_BRANCH}, which does not have a store`);

  // All branches again: everything is back.
  await page.getByTestId('branch-lens').getByRole('button', { name: /All branches/ }).click();
  await expect(page.getByTestId('branch-lens-elsewhere')).toHaveCount(0);
  await visitHealthy(page, '/dashboard');
  for (const name of ['Workshop', 'Inventory', 'Assembly plant']) await expect(area(page, name), name).toHaveCount(1);
});

test('the plant’s people are not offered Workshop or Inventory; the workshop’s people are not offered the Assembly plant', async ({ page }) => {
  await as(page, 'plant-manager');
  await visitHealthy(page, '/dashboard');
  await expect(area(page, 'Assembly plant')).toHaveCount(1);
  for (const name of ['Workshop', 'Inventory']) await expect(area(page, name), name).toHaveCount(0);
  await as(page, 'workshop-manager');
  await visitHealthy(page, '/dashboard');
  await expect(area(page, 'Workshop')).toHaveCount(1);
  await expect(area(page, 'Assembly plant')).toHaveCount(0);
  await as(page, 'store-manager');
  await visitHealthy(page, '/dashboard');
  await expect(area(page, 'Inventory')).toHaveCount(1);
  await expect(area(page, 'Assembly plant')).toHaveCount(0);
});

test('an IT administrator has the IT control room; the branch bar too', async ({ page }) => {
  await as(page, 'it-administrator');
  await visitHealthy(page, '/it');
  const room = page.getByTestId('it-control-room');
  await expect(room.getByRole('heading', { name: 'IT control room', level: 1 })).toBeVisible();
  for (const h of ['Health checks', 'Sign-ins, last seven days', 'People per branch', 'Roles in use', 'Errors', 'Access changes', 'Scheduled jobs']) {
    await expect(room.getByRole('heading', { name: h, exact: true }).first(), h).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Brief me on IT' })).toBeVisible();
  await expect(page.getByTestId('branch-lens')).toBeVisible();
  await visitHealthy(page, '/audit-logs/errors');
});

test('branch staff see their own branch: no bar, no Headquarters, no IT control room', async ({ page }) => {
  await as(page, 'technician');
  await visitHealthy(page, '/dashboard');
  await expect(page.getByTestId('branch-lens')).toHaveCount(0);
  for (const url of ['/it', '/headquarters', '/headquarters/team']) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/access-denied/);
  }
  await as(page, 'workshop-manager');
  await visitHealthy(page, '/dashboard');
  await expect(page.getByTestId('branch-lens')).toHaveCount(0);
});

test('the staff sign-in page says what the platform does', async ({ page }) => {
  await page.goto('/login');
  const panel = page.locator('main section').first();
  await expect(panel.getByText('One platform for every branch, every department, every role.')).toBeVisible();
  await expect(panel.getByText('Headquarters & analytics')).toBeVisible();
  await expect(panel.getByText('Nobody approves their own request')).toBeVisible();
});
