import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_BRANCH_TECH, SWITCHABLE, who } from './people';
import { db, freshVehicle, journalDiagnosis } from './db';
import { openJobCard, suggestion } from './workflows';
import { as, open, expectAuditEntry, signIn, urlOrExplain, visibleOrExplain, visitHealthy, waitOutcome } from './helpers';

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
  // Fixture: a retry starts from an active account even if the first attempt stopped half-way.
  await db().user.update({ where: { email: SWITCHABLE.email }, data: { isActive: true } });
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

  await test.step('the switched-off person is out at once: their open page notices by itself, or their next click does', async () => {
    // The open page's live check sends them to /signed-out → /login?error=… with the reason. Clicking while that
    // happens would race it (the cookie is already gone → a plain /login), so the click only comes if it has not.
    const byItself = await sola.waitForURL(/\/login\?error=/, { timeout: 30_000 }).then(() => true).catch(() => false);
    if (!byItself) await sola.goto('/notifications');
    await urlOrExplain(sola, /\/login\?error=/);
    await visibleOrExplain(sola, sola.getByText(/switched off|session ended/i).first(), 'a message saying why they were signed out');
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

test('Audit Logs: each tab shows only its kind of entry', async ({ page }) => {
  await as(page, 'administrator');
  const TABS = [['business', 'Business'], ['data', 'Data change'], ['api', 'API'], ['system', 'System job']] as const;
  for (const [kind, chip] of TABS) {
    await page.goto(`/audit-logs?kind=${kind}`);
    await expect(page.getByRole('heading', { name: 'Audit Logs', level: 1 })).toBeVisible();
    const chips = await page.locator('section li span').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()).filter((t) => ['Business', 'Data change', 'API', 'System job'].includes(t)));
    expect([...new Set(chips)].filter((c) => c !== chip), `${kind}: only "${chip}" entries`).toEqual([]);
    if (kind === 'business') expect(chips.length, 'business events are listed').toBeGreaterThan(0);
  }
});

test('Audit Logs: an organisation administrator sees the data-change journal', async ({ page }) => {
  test.fail(true, 'E2E-09: no data-change row is ever attributed — apps/portal/lib/actions/workshop.ts:119 sets the actor with AsyncLocalStorage.enterWith inside requireUser() after an await, which does not reach the caller\'s later Prisma calls, so packages/database/src/audit-journal.ts:214 sees no store and every journal row has userId NULL, source "unknown"/"unattributed"; stampOrganisation (:83-101) then falls back to the sole organisation, which is NULL once a second organisation exists — organisation administrators see no data changes, and nobody sees who made one');
  await as(page, 'administrator');
  await page.goto('/audit-logs?kind=data');
  await expect(page.getByRole('heading', { name: 'Audit Logs', level: 1 })).toBeVisible();
  const chips = await page.locator('section li span').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()).filter((t) => t === 'Data change'));
  expect(chips.length, `data-change entries shown${chips.length ? '' : ` — ${await journalDiagnosis(who('administrator').email)}`}`).toBeGreaterThan(0);
});
