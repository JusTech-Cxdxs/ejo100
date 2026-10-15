import { test, expect, type Locator, type Page } from '@playwright/test';
import { CUSTOMER, SUPERMANAGER } from './people';
import { as, open, expectHealthy, noSidewaysScroll } from './helpers';
import { db, freshVehicle } from './db';
import { addLine, assignTechnician, card, jcForm, managerApprovesEstimate, notifyCustomer, openJobCard, recordPayment, submitEstimate, supervisorApproves, supervisorApprovesEstimate, technicianAccepts } from './workflows';

/**
 * Phone layout regressions the owner reported, on a small Android phone
 * (360 × 780): the header shows the whole wordmark, estimate lines never
 * overlap, an estimate line can be added on a phone, and the busy pages do
 * not scroll sideways.
 */
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
test.describe.configure({ mode: 'serial' });

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;

/** Nothing inside cut off with an ellipsis or spilling out of its own box. */
async function notClipped(locator: Locator, what: string) {
  const { scroll, client } = await locator.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll, `${what} is cut off (${scroll} > ${client})`).toBeLessThanOrEqual(client + 1);
}

/** Each estimate line: the visible cells never overlap and stay inside their line. */
async function estimateLinesReadable(page: Page) {
  const rows = card(page, 'Estimate').locator('table tbody tr');
  const count = await rows.count();
  expect(count, 'estimate lines on the page').toBeGreaterThan(0);
  for (let r = 0; r < count; r++) {
    const row = rows.nth(r);
    const rowBox = (await row.boundingBox())!;
    const cells: { name: string; box: Box }[] = [];
    for (const cell of await row.locator(':scope > td').all()) {
      if (!(await cell.isVisible())) continue;
      const box = await cell.boundingBox();
      if (!box || box.width === 0 || box.height === 0) continue;
      const name = (await cell.getAttribute('data-cell')) ?? 'cell';
      expect(inside(box, rowBox), `line ${r + 1}: ${name} spills out of its line`).toBe(true);
      await notClipped(cell, `line ${r + 1}: ${name}`);
      cells.push({ name, box });
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        expect(overlaps(cells[i]!.box, cells[j]!.box), `line ${r + 1}: ${cells[i]!.name} overlaps ${cells[j]!.name}`).toBe(false);
      }
    }
  }
}

const S = { url: '', plate: '' };

test('header: the full wordmark (logo, both name lines) fits beside search, bell and account', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto('/dashboard');
  await page.locator('main h1').first().waitFor();
  const header = page.locator('header').first();
  const headerBox = (await header.boundingBox())!;
  const brand = header.getByRole('link', { name: /: dashboard$/ });
  await expect(brand).toBeVisible();
  const name = (await brand.locator('[title]').first().getAttribute('title'))!.trim();
  const [top, ...rest] = name.split(/\s+/);
  const lines = [header.getByText(top!, { exact: true }).first()];
  if (rest.length) lines.push(header.getByText(rest.join(' '), { exact: true }).first());
  for (const line of lines) {
    await expect(line).toBeVisible();
    const box = (await line.boundingBox())!;
    expect(inside(box, headerBox), `"${await line.textContent()}" sits inside the header`).toBe(true);
    expect(box.x + box.width, 'wordmark inside the screen').toBeLessThanOrEqual(360);
    await notClipped(line, `"${await line.textContent()}" in the header`);
  }
  if (lines.length === 2) {
    const [a, b] = [(await lines[0]!.boundingBox())!, (await lines[1]!.boundingBox())!];
    expect(b.y, 'the second name line sits under the first').toBeGreaterThanOrEqual(a.y + a.height - 1);
  }
  // The wordmark never runs under the buttons on the right.
  const brandBox = (await brand.boundingBox())!;
  const account = (await header.getByRole('button', { name: 'Account menu' }).boundingBox())!;
  expect(brandBox.x + brandBox.width, 'wordmark clear of the account button').toBeLessThanOrEqual(account.x);
  await noSidewaysScroll(page, '/dashboard');
});

test('estimate on a phone: lines are added on the phone and each line reads without overlap', async ({ page }) => {
  S.plate = (await freshVehicle('MOB')).plate;
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: S.plate, supervisor: SUPERMANAGER, complaint: 'AC not cooling and an oil leak under the engine' });
  await supervisorApproves(page, S.url, SUPERMANAGER);
  await assignTechnician(page);
  await technicianAccepts(page, S.url);

  await as(page, 'technician');
  await open(page, S.url);
  await addLine(page, { type: 'EXTERNAL_PART', description: 'Differential overhaul at the outside machine shop, including new bearings and seals', price: 1215000, qty: 2 });
  await as(page, SUPERMANAGER);
  await open(page, S.url);
  await addLine(page, { type: 'LABOUR', description: 'Labour', price: 80000 });
  await addLine(page, { type: 'SUNDRY', description: 'Sundry', price: 7000 });

  await estimateLinesReadable(page);
  // 2 × 1,215,000 + 80,000 + 7,000
  await expect(page.getByText('Total Estimate').locator('..')).toContainText('₦2,517,000.00');
  await test.step('Edit and Remove are thumb-sized', async () => {
    const line = card(page, 'Estimate').locator('table tbody tr').filter({ has: page.getByRole('link', { name: 'Edit', exact: true }) }).first();
    for (const name of ['Edit', 'Remove']) {
      const box = (await line.getByRole(name === 'Edit' ? 'link' : 'button', { name, exact: true }).boundingBox())!;
      expect(box.height, `${name} button height`).toBeGreaterThanOrEqual(38);
    }
  });
  await noSidewaysScroll(page, S.url);
});

/** Every visible control of a form: inside the screen, clear of the others, and thumb-sized. */
async function formFitsPhone(form: Locator, what: string) {
  const controls: { name: string; box: Box }[] = [];
  for (const el of await form.locator('input:not([type="hidden"]), select, textarea, button').all()) {
    if (!(await el.isVisible())) continue;
    const box = (await el.boundingBox())!;
    const name = (await el.getAttribute('name')) ?? (await el.getAttribute('aria-label')) ?? ((await el.textContent()) ?? '').trim().slice(0, 30);
    expect(box.x, `${what}: ${name} starts off the screen`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${what}: ${name} is wider than the screen`).toBeLessThanOrEqual(361);
    expect(box.height, `${what}: ${name} is too small to tap`).toBeGreaterThanOrEqual(38);
    controls.push({ name, box });
  }
  expect(controls.length, `${what}: controls on the form`).toBeGreaterThan(1);
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      expect(overlaps(controls[i]!.box, controls[j]!.box), `${what}: ${controls[i]!.name} overlaps ${controls[j]!.name}`).toBe(false);
    }
  }
}

test('opening a Job Card on a phone: the form fits and nothing overlaps', async ({ page }) => {
  await as(page, 'receptionist');
  await open(page, '/workshop/job-cards');
  const form = jcForm(page, 'Open Job Card');
  await form.getByRole('button', { name: '+ Add another complaint' }).click();
  await formFitsPhone(form, 'Open Job Card');
  await noSidewaysScroll(page, '/workshop/job-cards');
});

test('approving the estimate and recording a payment on a phone', async ({ page }) => {
  test.skip(!S.url, 'needs the Job Card from the estimate test');
  await as(page, SUPERMANAGER);
  await open(page, S.url);
  await submitEstimate(page);
  await supervisorApprovesEstimate(page);
  await as(page, 'workshop-manager');
  await open(page, S.url);
  await managerApprovesEstimate(page);
  await as(page, 'receptionist');
  await open(page, S.url);
  await notifyCustomer(page);

  await as(page, 'finance-officer');
  await open(page, S.url);
  const pay = jcForm(page, 'Record payment');
  await pay.scrollIntoViewIfNeeded();
  await formFitsPhone(pay, 'Record payment');
  // Typing an amount shows one more field; it fits too.
  await pay.locator('select').first().selectOption('OTHER');
  await formFitsPhone(pay, 'Record payment (other amount)');
  await pay.locator('select').first().selectOption('SEVENTY_PERCENT');
  await recordPayment(page, 'SEVENTY_PERCENT');
  await noSidewaysScroll(page, S.url);
});

test('busy pages do not scroll sideways on a phone', async ({ page }) => {
  const customer = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true } });
  const visits: { who: string; urls: string[] }[] = [
    { who: 'receptionist', urls: ['/reminders', '/mail', '/workshop/job-cards', '/workshop/vehicle-service', '/workshop/customers', '/workshop/vehicles', '/crm', `/crm/customers/${customer.id}`, `/crm/customers/${customer.id}?tab=jobs`, '/notifications'] },
    { who: 'workshop-manager', urls: ['/workshop/refunds', '/workshop/external-procurement', '/workshop/parts-requests', '/analytics'] },
    { who: 'store-manager', urls: ['/inventory/parts', '/inventory/goods-receipts'] },
    { who: 'warranty-hod', urls: ['/warranty', '/warranty/claims'] },
    { who: 'administrator', urls: ['/settings', '/settings/enyo', '/enyo/learning', '/enyo/models', '/users', '/roles', '/structure', '/audit-logs'] },
  ];
  if (S.url) visits[0]!.urls.unshift(S.url);
  for (const { who: role, urls } of visits) {
    await as(page, role);
    for (const url of urls) {
      await page.goto(url);
      await page.locator('main h1').first().waitFor({ timeout: 20_000 });
      await expectHealthy(page, url);
      expect(page.url(), `${role} opens ${url}`).not.toMatch(/access-denied/);
      await noSidewaysScroll(page, url);
    }
  }
});
