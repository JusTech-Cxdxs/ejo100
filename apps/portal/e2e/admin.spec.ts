import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_BRANCH_TECH, SWITCHABLE } from './people';
import { freshVehicle } from './db';
import { openJobCard, suggestion } from './workflows';
import { as, open, expectAuditEntry, signIn, visitHealthy, waitOutcome } from './helpers';

/**
 * Administration: give and take away a role (the person's menu follows),
 * switch an account off (they are signed out at once and cannot sign back
 * in) and on again, and every administration page opens cleanly — with the
 * Audit Logs filters working.
 */
// Each test stands alone (no cascade of skips when one fails).

const card = (page: Page) => page.getByRole('listitem', { name: SWITCHABLE.name });

test('an administrator gives a role; the person’s menu follows; the role is taken away again', async ({ page }) => {
  await as(page, 'administrator');
  await page.goto(`/users?q=${encodeURIComponent(SWITCHABLE.email)}`);
  await expect(card(page)).toBeVisible();
  await card(page).getByRole('textbox', { name: `Give ${SWITCHABLE.name} a role` }).click();
  await card(page).getByRole('textbox', { name: `Give ${SWITCHABLE.name} a role` }).fill('Technician');
  await suggestion(page, 'Technician').click();
  await card(page).getByRole('button', { name: 'Give' }).click();
  await waitOutcome(page, /status=saved/);
  await expect(card(page).getByRole('button', { name: `Remove the role Technician from ${SWITCHABLE.name}` })).toBeVisible();

  await as(page, SWITCHABLE);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workshop', exact: true })).toBeVisible();

  await as(page, 'administrator');
  await page.goto(`/users?q=${encodeURIComponent(SWITCHABLE.email)}`);
  await card(page).getByRole('button', { name: `Remove the role Technician from ${SWITCHABLE.name}` }).click();
  await waitOutcome(page, /status=/);
  await expect(card(page).getByRole('button', { name: `Remove the role Technician from ${SWITCHABLE.name}` })).toHaveCount(0);
});

test('switching an account off signs the person out at once; switching on lets them back in', async ({ page, browser }) => {
  const other = await browser.newContext();
  const sola = await other.newPage();
  await signIn(sola, SWITCHABLE.email, E2E_PASSWORD);

  await as(page, 'administrator');
  await open(page, `/users?q=${encodeURIComponent(SWITCHABLE.email)}`);
  await card(page).getByText('More actions…').click();
  await card(page).getByRole('textbox', { name: 'Reason for switching off' }).fill('Left the company (E2E)');
  await card(page).getByRole('button', { name: 'Switch off and sign out' }).click();
  await waitOutcome(page, /status=/);
  await expect(card(page)).toContainText('Switched off');

  await test.step('the switched-off person is out on their next click', async () => {
    await sola.goto('/notifications');
    await sola.waitForURL(/\/login/);
    await expect(sola.getByText(/switched off|session ended/i)).toBeVisible();
  });
  await test.step('and cannot sign back in', async () => {
    await sola.getByLabel('Work email').fill(SWITCHABLE.email);
    await sola.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await sola.getByRole('button', { name: 'Sign in' }).click();
    await expect(sola).toHaveURL(/\/login/);
    await expect(sola.getByRole('alert').first()).toBeVisible();
  });

  // Fresh page (no ?status= left over from switching off), then switch back on.
  await open(page, `/users?q=${encodeURIComponent(SWITCHABLE.email)}`);
  await card(page).getByText('More actions…').click();
  await card(page).getByRole('button', { name: 'Switch on' }).click();
  await waitOutcome(page, /status=/);
  await expect(card(page)).not.toContainText('Switched off');
  await signIn(sola, SWITCHABLE.email, E2E_PASSWORD);
  await other.close();
  await expectAuditEntry(page, 'user.deactivated');
  await expectAuditEntry(page, 'user.reactivated');
});

test('every administration page opens cleanly', async ({ page }) => {
  await as(page, 'administrator');
  for (const url of ['/users', '/roles', '/permissions', '/structure', '/branches', '/organisation', '/settings', '/analytics', '/audit-logs', '/profile']) {
    await visitHealthy(page, url);
  }
  await page.goto('/branches');
  await page.locator('main a[href^="/branches/"]').first().click();
  await page.waitForURL(/\/branches\/[^/]+/);
  await expect(page.locator('main h1').first()).toBeVisible();
});

test('Audit Logs: kinds, search and dates filter the trail', async ({ page }) => {
  await as(page, 'administrator');
  await page.goto('/audit-logs');
  for (const kind of ['Business events', 'Data changes', 'API requests', 'Scheduled jobs', 'Everything']) {
    await page.getByRole('link', { name: kind, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Audit Logs', level: 1 })).toBeVisible();
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  await page.goto(`/audit-logs?from=${today}&to=${today}`);
  await expect(page.getByText(/entr(y|ies) on this page/)).toBeVisible();
  await expect(page.locator('section li').first()).toBeVisible();
  await page.goto('/audit-logs?q=zz-nothing-matches-this-zz');
  await expect(page.getByText('Nothing matches.')).toBeVisible();
  // Only administrators see the full trail.
  await as(page, 'workshop-manager');
  await page.goto('/audit-logs');
  await expect(page).toHaveURL(/access-denied/);
});

test('branch fences: a branch administrator manages only their branch; another branch cannot open our Job Cards', async ({ page }) => {
  await as(page, 'branch-administrator');
  await page.goto(`/users?q=${encodeURIComponent(OTHER_BRANCH_TECH.email)}`);
  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  await expect(page.getByRole('listitem', { name: OTHER_BRANCH_TECH.name })).toHaveCount(0);
  await as(page, 'administrator');
  await page.goto(`/users?q=${encodeURIComponent(OTHER_BRANCH_TECH.email)}`);
  await expect(page.getByRole('listitem', { name: OTHER_BRANCH_TECH.name })).toBeVisible();

  const plate = (await freshVehicle('BRF')).plate;
  await as(page, 'receptionist');
  const url = await openJobCard(page, { plate, complaint: 'Branch fence check' });
  await as(page, OTHER_BRANCH_TECH);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Branch fence check')).toHaveCount(0);
  await page.goto('/workshop/job-cards');
  await expect(page.getByText(plate)).toHaveCount(0);
});

test('Audit Logs: the Data changes and API requests tabs show only their kind', async ({ page }) => {
  await as(page, 'administrator');
  for (const [kind, chip] of [['data', 'Data change'], ['api', 'API']] as const) {
    await page.goto(`/audit-logs?kind=${kind}`);
    const chips = await page.locator('section li span').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()).filter((t) => ['Business', 'Data change', 'API', 'System job'].includes(t)));
    expect(chips.length, `${kind}: entries shown`).toBeGreaterThan(0);
    expect(new Set(chips), `${kind}: only "${chip}" entries`).toEqual(new Set([chip]));
  }
});
