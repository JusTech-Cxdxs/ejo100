import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, OTHER_ORG_ADMIN, who } from './people';
import { as, gotoSettled, signIn } from './helpers';
import { db } from './db';

/**
 * Error references end to end: the number a person quotes is found on Audit
 * Logs → Error log by an administrator of their organisation, with what
 * happened, where, when and to whom; another organisation never sees it; a
 * failure in the browser is stored under the reference its screen shows;
 * and a missing record gets the calm, branded "Page not found".
 *
 * No test-only routes: the stored error is a fixture row written straight to
 * the throwaway test database, exactly as the error handler writes it.
 */

const tenDigits = () => String(1_000_000_000 + Math.floor(Math.random() * 8_999_999_999));

async function fixtureError(opts: { kind?: string; message?: string; path?: string } = {}) {
  const prisma = db();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: who('administrator').email }, select: { organisationId: true } });
  const frontDesk = await prisma.user.findUniqueOrThrow({ where: { email: who('receptionist').email }, select: { id: true } });
  const ref = tenDigits();
  await prisma.errorEvent.create({
    data: {
      ref, app: 'portal', organisationId: admin.organisationId, userId: frontDesk.id, method: 'GET',
      path: opts.path ?? '/workshop/job-cards/e2e-missing', route: '/workshop/job-cards/[id]', kind: opts.kind ?? 'render',
      name: 'TypeError', message: opts.message ?? "Cannot read properties of undefined (reading 'vehicle')", stack: 'TypeError: e2e fixture\n    at Page (page.js:1:1)',
    },
  });
  return ref;
}

test.describe('Error log', () => {
  test('an administrator finds a quoted reference: what, where, when, who, and what to do', async ({ page }) => {
    const ref = await fixtureError();
    await as(page, 'administrator');
    await gotoSettled(page, '/audit-logs');
    await page.getByRole('link', { name: 'Error log' }).click();
    await page.waitForURL(/\/audit-logs\/errors/);
    await expect(page.getByRole('heading', { level: 1, name: 'Error log' })).toBeVisible();
    await page.getByLabel('Reference').fill(`Reference: ${ref}`);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL(new RegExp(`ref=`));
    const row = page.locator('li').filter({ has: page.getByTestId('error-ref').filter({ hasText: ref }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Page failed to load').first()).toBeVisible();
    await expect(row.getByText('/workshop/job-cards/e2e-missing').first()).toBeVisible();
    await expect(row.getByRole('link', { name: who('receptionist').name })).toBeVisible();
    await expect(row.getByText('What to do')).toBeVisible();
    await expect(row.getByRole('button', { name: `Copy reference ${ref}` })).toBeVisible();
    await expect(row.getByText('(Lagos time)')).toBeVisible();
  });

  test('another organisation cannot see it, and a role without the audit trail is refused', async ({ page }) => {
    const ref = await fixtureError();
    await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
    await gotoSettled(page, `/audit-logs/errors?ref=${ref}`);
    await expect(page.getByRole('status').filter({ hasText: `No error with reference ${ref}` })).toBeVisible();
    await expect(page.getByTestId('error-ref')).toHaveCount(0);

    await as(page, 'technician');
    await gotoSettled(page, '/audit-logs/errors');
    await expect(page).toHaveURL(/access-denied/);
  });

  test('a failure in the browser is stored under the reference its screen shows', async ({ page }) => {
    await as(page, 'administrator');
    await gotoSettled(page, '/dashboard');
    const ref = tenDigits();
    // What ErrorScreen sends when a page fails in the browser with no server digest.
    const status = await page.evaluate(async (r) => (await fetch('/api/error-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: r, name: 'TypeError', message: 'Failed to fetch', path: '/workshop' }),
    })).status, ref);
    expect(status).toBe(204);
    await expect.poll(async () => db().errorEvent.count({ where: { ref } }), { timeout: 15_000 }).toBe(1);
    await gotoSettled(page, `/audit-logs/errors?ref=${ref}`);
    const row = page.locator('li').filter({ has: page.getByTestId('error-ref').filter({ hasText: ref }) });
    await expect(row.getByText('Connection').first()).toBeVisible();
    await expect(row.getByRole('link', { name: who('administrator').name })).toBeVisible();
  });

  test('a report from another site is ignored', async ({ request }) => {
    const ref = tenDigits();
    const res = await request.post('/api/error-report', { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, data: { ref, message: 'spam' } });
    expect(res.status()).toBe(204);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await db().errorEvent.count({ where: { ref } })).toBe(0);
  });
});

test('a missing record shows the branded "Page not found", never an error screen', async ({ page }) => {
  await as(page, 'administrator');
  await page.goto('/workshop/job-cards/this-job-card-does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the dashboard' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Something went wrong');
  await page.getByRole('link', { name: 'Back to the dashboard' }).click();
  await page.waitForURL(/\/dashboard/);
});
