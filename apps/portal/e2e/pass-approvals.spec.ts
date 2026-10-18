import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, open, uniq, waitOutcome, expectNoUrlError } from './helpers';
import { pickSearchable } from './workflows';

/**
 * Who approves a pass — every case, end to end, as the people really use it:
 *
 *  - a technician's own pass: Department Head, then Manager;
 *  - a Department Head's own pass (or one they book): already authorised, then the Manager;
 *  - a Manager's own pass, or one they book for anyone: approved on the spot — go now;
 *  - the Executive's own pass: approved on the spot;
 *  - IT's own pass: the Executive decides (not a Manager);
 *  - a Manager's own contractor pass: approved on the spot;
 *  - nobody else ever approves their own, and the gate sees an approved pass at once.
 */

const lagosDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

async function newPass(page: Page, opts: { who: 'ME' | 'OTHERS' | 'WITH_OTHERS'; staff?: string[]; outsiders?: string[]; reason: string }): Promise<{ url: string; status: string }> {
  await page.goto('/security/exit-passes/new');
  const form = page.locator('form').filter({ has: page.locator('select[name="who"]') }).first();
  await form.locator('select[name="who"]').selectOption(opts.who);
  for (const name of opts.staff ?? []) {
    await form.getByRole('button', { name: '+ Add a staff member' }).click();
    await pickSearchable(form, page, name.split(' ')[0]!, new RegExp(name), 'Search staff by name or ID…');
  }
  for (const name of opts.outsiders ?? []) {
    await form.getByRole('button', { name: '+ Add someone not on staff' }).click();
    await form.locator('input[name="otherName"]').last().fill(name);
  }
  await form.locator('textarea[name="reason"]').fill(opts.reason);
  await form.locator('select[name="leaveWhen"]').selectOption('NOW');
  await form.locator('select[name="returning"]').selectOption('yes');
  await form.locator('select[name="outHours"]').selectOption('1');
  await form.locator('select[name="outMinutes"]').selectOption('0');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await waitOutcome(page, /\/security\/exit-passes\/[^/?]+\?status=(requested|approved_now)/);
  const u = new URL(page.url());
  return { url: u.pathname, status: u.searchParams.get('status') ?? '' };
}

const approveButtons = (page: Page) => page.getByRole('button', { name: /^(Approve|Authorise)/ });

async function gateCanLetOut(page: Page, url: string) {
  await as(page, 'security-officer');
  await open(page, url);
  await expect(page.getByText('Approved — may leave').first()).toBeVisible();
  await page.getByRole('button', { name: 'Record time out' }).click();
  await waitOutcome(page, /status=gate_out/);
  expectNoUrlError(page);
}

test.describe.configure({ mode: 'serial' });

test('a Manager’s own pass is approved on the spot — go now', async ({ page }) => {
  await as(page, 'workshop-manager');
  const { url, status } = await newPass(page, { who: 'ME', reason: `Bank errand ${uniq()}` });
  expect(status, 'approved on the spot, not "requested"').toBe('approved_now');
  await expect(page.getByText(/your own request is approved on the spot/)).toBeVisible();
  await expect(page.getByText('Approved — may leave').first()).toBeVisible();
  await expect(page.getByText('Approved on request by')).toBeVisible();
  await expect(approveButtons(page)).toHaveCount(0);
  // Nothing waits on anyone: not in the Manager's "Waiting on others", not in the Executive's Approvals.
  await open(page, '/approvals');
  await expect(page.getByRole('list', { name: 'Waiting on others' }).locator(`a[href="${url}"]`)).toHaveCount(0);
  await as(page, 'executive');
  await open(page, '/approvals');
  await expect(page.locator(`main a[href="${url}"]`)).toHaveCount(0);
  await gateCanLetOut(page, url);
});

test('a Manager books a pass for a technician and someone not on staff — approved on the spot; the technician sees it', async ({ page }) => {
  await as(page, 'workshop-manager');
  const visitor = `Intern ${uniq()}`;
  const { url, status } = await newPass(page, { who: 'OTHERS', staff: [who('technician').name], outsiders: [visitor], reason: 'Collect parts from the dealer' });
  expect(status).toBe('approved_now');
  await expect(page.getByText(who('technician').name).first()).toBeVisible();
  await expect(page.getByText(visitor).first()).toBeVisible();
  // The technician on it sees it in their own exit passes, already approved, and cannot approve anything.
  await as(page, 'technician');
  await open(page, '/security/exit-passes');
  await expect(page.locator(`main a[href="${url}"]`)).toBeVisible();
  await open(page, url);
  await expect(page.getByText('Approved — may leave').first()).toBeVisible();
  await expect(approveButtons(page)).toHaveCount(0);
  await gateCanLetOut(page, url);
});

test('a Department Head’s own pass is already authorised by them and goes to the Manager', async ({ page }) => {
  await as(page, 'department-head');
  const { url, status } = await newPass(page, { who: 'ME', reason: 'Visit a supplier' });
  expect(status).toBe('requested');
  await expect(page.getByText('Awaiting Manager').first()).toBeVisible();
  await expect(page.getByText(`${who('department-head').name} ·`).first()).toBeVisible(); // Authorised by (Department Head)
  await expect(approveButtons(page)).toHaveCount(0);
  await open(page, '/approvals');
  await expect(page.getByRole('list', { name: 'Waiting on others' }).locator(`a[href="${url}"]`)).toContainText(/\(Manager\)/);
  // The technician (not a Manager) is never asked.
  await as(page, 'technician');
  await open(page, url);
  await expect(approveButtons(page)).toHaveCount(0);
  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve (Manager)' }).click();
  await waitOutcome(page, /status=approve/);
  await expect(page.getByText('Approved — may leave').first()).toBeVisible();
});

test('a Department Head books a pass for a technician: authorised by them, the Manager approves', async ({ page }) => {
  await as(page, 'department-head');
  const { url, status } = await newPass(page, { who: 'OTHERS', staff: [who('technician').name], reason: 'Road call to a stranded customer' });
  expect(status).toBe('requested');
  await expect(page.getByText('Awaiting Manager').first()).toBeVisible();
  await as(page, 'workshop-manager');
  await open(page, '/approvals');
  await expect(page.locator(`main ul[aria-label$="approvals"] a[href="${url}"]`)).toBeVisible();
  await open(page, url);
  await page.getByRole('button', { name: 'Approve (Manager)' }).click();
  await waitOutcome(page, /status=approve/);
});

test('a technician’s own pass: the Department Head, then the Manager — and never their own approval', async ({ page }) => {
  await as(page, 'technician');
  const { url, status } = await newPass(page, { who: 'ME', reason: 'Clinic appointment' });
  expect(status).toBe('requested');
  await expect(page.getByText('Awaiting Department Head').first()).toBeVisible();
  await expect(approveButtons(page)).toHaveCount(0);
  // The Manager is not asked before the head.
  await as(page, 'workshop-manager');
  await open(page, url);
  await expect(page.getByRole('button', { name: 'Approve (Manager)' })).toHaveCount(0);
  await as(page, 'department-head');
  await open(page, url);
  await page.getByRole('button', { name: 'Authorise (Department Head)' }).click();
  await waitOutcome(page, /status=approve/);
  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve (Manager)' }).click();
  await waitOutcome(page, /status=approve/);
  await gateCanLetOut(page, url);
});

test('the Executive’s own pass is approved on the spot', async ({ page }) => {
  await as(page, 'executive');
  const { url, status } = await newPass(page, { who: 'ME', reason: 'Meeting at the bank' });
  expect(status).toBe('approved_now');
  await expect(page.getByText('Approved — may leave').first()).toBeVisible();
  await gateCanLetOut(page, url);
});

test('IT’s own pass goes to the Executive — a Manager cannot approve it', async ({ page }) => {
  await as(page, 'it-administrator');
  const { url, status } = await newPass(page, { who: 'ME', reason: 'Collect a network switch' });
  expect(status).toBe('requested');
  await expect(page.getByText('Awaiting Executive').first()).toBeVisible();
  await open(page, '/approvals');
  await expect(page.getByRole('list', { name: 'Waiting on others' }).locator(`a[href="${url}"]`)).toContainText(/\(Executive\)/);
  await as(page, 'workshop-manager');
  await open(page, url);
  await expect(approveButtons(page)).toHaveCount(0);
  await as(page, 'executive');
  await open(page, '/approvals');
  await expect(page.locator(`main ul[aria-label$="approvals"] a[href="${url}"]`)).toBeVisible();
  await open(page, url);
  await page.getByRole('button', { name: 'Approve (Executive)' }).click();
  await waitOutcome(page, /status=approve/);
  await expect(page.getByText('Approved — may leave').first()).toBeVisible();
});

test('a Manager’s own contractor pass is approved on the spot', async ({ page }) => {
  const company = `Cool Air Services ${uniq()}`;
  await as(page, 'workshop-manager');
  await page.goto('/security/contractors/new');
  const form = page.locator('form').filter({ has: page.locator('input[name="company"]') }).first();
  await form.locator('input[name="company"]').fill(company);
  await form.locator('textarea[name="work"]').fill('Service the office air conditioners');
  await form.locator('input[name="workArea"]').fill('Front office');
  await form.locator('select[name="party"]').selectOption('ONE');
  await form.locator('input[name="leadName"]').fill('Musa Bello');
  await form.locator('input[name="phone"]').fill('08030000001');
  await form.locator('input[name="validFrom"]').fill(lagosDay());
  await form.locator('input[name="validUntil"]').fill(lagosDay(1));
  await form.getByRole('button', { name: /Submit/ }).click();
  await waitOutcome(page, /\/security\/contractors\/[^/?]+\?status=approved_now/);
  await expect(page.getByText(/approved on the spot/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve pass' })).toHaveCount(0);
});
