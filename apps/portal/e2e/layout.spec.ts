import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { as, open, visitHealthy } from './helpers';

/**
 * Layout, in a real browser: no page scrolls sideways, and every searchable
 * dropdown opens ABOVE everything else (the topmost thing where it is drawn
 * is the list itself — not a card, a table or the next form). Screenshots
 * (closed, and with each list open) go into the report for a person to look at.
 */
const SHOTS = join(__dirname, 'report', 'screens');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }).catch(() => undefined);

async function noSidewaysScroll(page: Page, where: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${where}: page wider than the screen`).toBeLessThanOrEqual(1);
}

/** Opens each searchable field on the page (up to `max`) and checks its list is on top and on screen. */
async function listsFloatOnTop(page: Page, name: string, max = 3) {
  const fields = page.locator('input[aria-autocomplete="list"]:visible');
  const n = Math.min(await fields.count(), max);
  for (let i = 0; i < n; i += 1) {
    const f = fields.nth(i);
    await f.scrollIntoViewIfNeeded();
    await f.click();
    const list = page.locator('[data-floating]').last();
    const opened = await list.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
    if (!opened) { await page.keyboard.press('Escape'); continue; } // nothing to list (e.g. waits for typing)
    const verdict = await list.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const points = [[r.left + r.width / 2, r.top + 12], [r.left + r.width / 2, r.top + Math.min(r.height - 6, 60)], [r.left + 12, r.top + r.height / 2]];
      const covered = points.filter(([x, y]) => { const hit = document.elementFromPoint(x!, y!); return !hit || !el.contains(hit); }).length;
      const onScreen = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
      return { covered, onScreen, h: r.height };
    });
    expect(verdict.covered, `${name}: list ${i + 1} is drawn over by something`).toBe(0);
    expect(verdict.onScreen, `${name}: list ${i + 1} runs off the screen`).toBe(true);
    await shot(page, `${name}--list-${i + 1}`);
    await page.keyboard.press('Escape');
    await page.locator('h1').first().click({ position: { x: 2, y: 2 } }).catch(() => undefined);
  }
}

test('administrator pages: no sideways scroll; dropdowns open above everything', async ({ page }) => {
  await as(page, 'administrator');
  const pages: [string, string][] = [
    ['/users', 'users'],
    ['/users/new', 'users-new'],
    ['/roles', 'roles'],
    ['/audit-logs', 'audit-logs'],
    ['/organisation/people?add=1', 'people-add'],
    ['/structure', 'structure'],
    ['/settings/support/teams?edit=new', 'support-teams-new'],
    ['/headquarters', 'headquarters'],
  ];
  for (const [url, name] of pages) {
    await visitHealthy(page, url);
    await noSidewaysScroll(page, url);
    await shot(page, name);
    await listsFloatOnTop(page, name);
  }
  // One role's own page, with its permissions open for change.
  await open(page, '/roles');
  await page.getByRole('link', { name: /^Technician: open$/ }).click();
  await page.waitForURL(/\/roles\/[a-z0-9]+$/i);
  await expect(page.getByRole('heading', { name: 'Included by default — can do' })).toBeVisible();
  await page.getByTestId('edit-perms').click();
  await page.waitForURL(/edit=perms/);
  await noSidewaysScroll(page, 'role page');
  await shot(page, 'role-edit');
  await listsFloatOnTop(page, 'role-edit', 1);
});

test('adding a person has its own page; the department list follows the branch', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/users?add=1');
  await expect(page).toHaveURL(/\/users\/new$/);
  const form = page.locator('#add-staff');
  await expect(form.getByText('Who they are')).toBeVisible();
  await expect(form.getByText('Where they work')).toBeVisible();
  await expect(form.getByText('What they may do')).toBeVisible();
  await expect(form.getByRole('textbox', { name: 'Department' })).toHaveAttribute('placeholder', 'Choose the branch first');
  await form.getByRole('textbox', { name: 'First role' }).fill('Technician');
  await page.getByRole('option', { name: 'Technician' }).first().click();
  await expect(form).toContainText('Does the work on the jobs assigned to them');
});

test('an executive gets Headquarters, can export it and send a notice; a technician cannot', async ({ page }) => {
  await as(page, 'executive');
  await visitHealthy(page, '/headquarters');
  await expect(page.getByTestId('headquarters').getByRole('heading', { name: 'Headquarters', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Branches side by side' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a notice' }).first()).toBeVisible();
  await noSidewaysScroll(page, '/headquarters (executive)');
  await shot(page, 'headquarters-executive');
  const csv = await page.request.get('/headquarters/export?period=this_year');
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(csv.headers()['cache-control']).toContain('no-store');
  expect(await csv.text()).toMatch(/^\uFEFF"Branch","Health"/);

  await as(page, 'technician');
  await page.goto('/headquarters');
  await expect(page).toHaveURL(/access-denied/);
  const denied = await page.request.get('/headquarters/export');
  expect(denied.status()).toBe(403);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('Users, Add a staff member, Roles and Headquarters fit the screen', async ({ page }) => {
    await as(page, 'administrator');
    for (const [url, name] of [['/users', 'm-users'], ['/users/new', 'm-users-new'], ['/roles', 'm-roles'], ['/headquarters', 'm-headquarters']] as const) {
      await visitHealthy(page, url);
      await noSidewaysScroll(page, url);
      await shot(page, name);
    }
  });
});
