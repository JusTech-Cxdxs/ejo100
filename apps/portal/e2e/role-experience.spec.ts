import { test, expect, type Page } from '@playwright/test';
import { as, expectHealthy, open, waitOutcome } from './helpers';

/**
 * Each role sees its own job (docs/ROLES_AND_ACCESS.md): a technician gets
 * "My exit passes" under Security and never the gate registers; Security
 * gets the whole desk; a decision waits in the approver's Approvals list
 * until it is made; every dashboard shows that person's own numbers.
 */
test.describe.configure({ mode: 'serial' });

const main = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const securityTabs = (page: Page) => page.getByRole('navigation', { name: 'Security' });

test('a technician sees only their own exit passes under Security — never the gate', async ({ page }) => {
  await as(page, 'technician');
  await expect(main(page).getByRole('link', { name: 'My exit passes', exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Security', exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /^Approvals(\s*\d+)?$/ })).toHaveCount(0);

  await open(page, '/security');
  await expect(page).toHaveURL(/\/security\/exit-passes/);
  await expect(page.getByRole('heading', { name: 'My exit passes', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Request an exit pass/ })).toBeVisible();
  for (const tab of ['Gate dashboard', 'Visitors', 'Vehicles leaving', 'Incidents', 'Overdue', 'Register']) {
    await expect(page.getByRole('link', { name: tab, exact: true }), `${tab} is not offered`).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: /^All passes/ })).toHaveCount(0);

  // Typing the gate's addresses does not get round it.
  for (const url of ['/security/register', '/security/visitors', '/security/incidents', '/security/on-premises', '/inventory/pricing', '/inventory/goods-receipts']) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/access-denied/);
  }
});

test('a Security Officer has the whole desk', async ({ page }) => {
  await as(page, 'security-officer');
  await open(page, '/security');
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();
  for (const tab of ['Gate dashboard', 'Visitors', 'Exit passes', 'Vehicles leaving', 'Incidents', 'Register']) {
    await expect(securityTabs(page).getByRole('link', { name: tab, exact: true })).toBeVisible();
  }
});

test('a Workshop Manager approves passes but is not given the gate registers', async ({ page }) => {
  await as(page, 'workshop-manager');
  await expect(main(page).getByRole('link', { name: /^Approvals(\s*\d+)?$/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'My exit passes', exact: true })).toBeVisible();
  await page.goto('/security/register');
  await expect(page).toHaveURL(/\/access-denied/);
});

test('an exit pass waits in each approver’s Approvals list until they decide it', async ({ page }) => {
  await as(page, 'technician');
  await page.goto('/security/exit-passes/new');
  const form = page.locator('form').filter({ has: page.locator('select[name="who"]') }).first();
  await form.locator('select[name="who"]').selectOption('ME');
  await form.locator('textarea[name="reason"]').fill('Collect a part from the dealer');
  await form.locator('select[name="leaveWhen"]').selectOption('NOW');
  await form.locator('select[name="returning"]').selectOption('yes');
  await form.locator('select[name="outHours"]').selectOption('1');
  await form.locator('select[name="outMinutes"]').selectOption('0');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await waitOutcome(page, /\/security\/exit-passes\/[^/?]+\?status=requested/);
  const url = new URL(page.url()).pathname;
  // Their own history lists it.
  await open(page, '/security/exit-passes');
  await expect(page.locator(`main a[href="${url}"]`)).toBeVisible();

  const inApprovals = (p: Page) => p.locator(`main a[href="${url}"]`);

  await as(page, 'department-head');
  await open(page, '/approvals');
  await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible();
  await expect(inApprovals(page)).toBeVisible();
  await inApprovals(page).click();
  await page.getByRole('button', { name: 'Authorise (Department Head)' }).click();
  await waitOutcome(page, /status=approve/);
  await open(page, '/approvals');
  await expect(inApprovals(page), 'decided — no longer waiting for the head').toHaveCount(0);

  await as(page, 'workshop-manager');
  await open(page, '/approvals');
  await expect(inApprovals(page)).toBeVisible();
  // The dashboard points at the same list.
  await open(page, '/dashboard');
  await expect(page.getByRole('link', { name: /waiting for your approval/ })).toBeVisible();
  await open(page, url);
  await page.getByRole('button', { name: 'Approve (Manager)' }).click();
  await waitOutcome(page, /status=approve/);
  await open(page, '/approvals');
  await expect(inApprovals(page), 'decided — gone from the Manager’s list').toHaveCount(0);

  // The requester is told it is ready for the gate.
  await as(page, 'technician');
  await open(page, '/dashboard');
  await expect(page.getByText(/Exit pass approved —/).first()).toBeVisible();
});

const DASHBOARDS: { role: string; tiles: string[]; jobs?: boolean; approvals?: boolean }[] = [
  { role: 'technician', tiles: ['My jobs in progress', 'Completed this month', 'Average time per job', 'My parts requests open'], jobs: true },
  { role: 'workshop-supervisor', tiles: ['Jobs I supervise'], jobs: true, approvals: true },
  { role: 'receptionist', tiles: ['Ready for collection', 'Opened by me this month'] },
  { role: 'workshop-manager', tiles: ['Jobs in the workshop', 'Closed this month'], approvals: true },
  { role: 'store-officer', tiles: ['Parts requests for the Store', 'Parts at or below reorder point'], approvals: true },
  { role: 'finance-officer', tiles: ['Payments I recorded this month', 'Outside purchases with Finance'], approvals: true },
  { role: 'warranty-officer', tiles: ['Warranties awaiting verification', 'Warranty claims open'] },
  { role: 'security-officer', tiles: ['Visitors on site', 'Staff out on passes', 'Vehicles on road test'] },
  { role: 'calendar-user', tiles: ['My exit passes this month'] },
];

for (const d of DASHBOARDS) {
  test(`dashboard — ${d.role} sees their own numbers`, async ({ page }) => {
    await as(page, d.role);
    await open(page, '/dashboard');
    const numbers = page.locator('[aria-label="My numbers"]');
    await expect(numbers).toBeVisible();
    for (const t of d.tiles) await expect(numbers.getByText(t, { exact: true }), t).toBeVisible();
    await expect(page.locator('#my-jobs')).toHaveCount(d.jobs ? 1 : 0);
    if (d.approvals) await expect(page.getByRole('link', { name: /Open Approvals/ })).toBeVisible();
    else await expect(page.getByRole('link', { name: /Open Approvals/ })).toHaveCount(0);
    await expectHealthy(page, `/dashboard (${d.role})`);
  });
}

test('the Roles page explains each role before it is given', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/roles');
  const tech = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Technician', exact: true }) }).first();
  await expect(tech).toContainText('Does the work on the jobs assigned to them');
  await expect(tech).toContainText('can do');
  const mgr = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Workshop Manager', exact: true }) }).first();
  await expect(mgr).toContainText('can approve');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  for (const { role, urls } of [
    { role: 'technician', urls: ['/dashboard', '/security/exit-passes', '/approvals'] },
    { role: 'workshop-manager', urls: ['/dashboard', '/approvals'] },
  ]) {
    test(`${role}: no sideways scroll`, async ({ page }) => {
      await as(page, role);
      for (const url of urls) {
        await page.goto(url);
        await page.locator('main h1').first().waitFor({ timeout: 20_000 });
        await expectHealthy(page, url);
        const { scroll, inner } = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollWidth, inner: window.innerWidth }));
        expect(scroll, `${url}: page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
      }
    });
  }
});
