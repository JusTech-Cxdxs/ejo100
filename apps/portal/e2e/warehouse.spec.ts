import { test, expect } from '@playwright/test';
import { as, expectNoUrlError, uniq, waitOutcome } from './helpers';
import { jcForm, pickSearchable, reveal } from './workflows';
import { who } from './people';
import { db } from './db';

/**
 * Procure-to-stock for a finished imported product, done by the people who
 * do it: a procurement officer adds the supplier and raises a requisition,
 * the Head of Procurement approves it, the officer orders it, the head
 * approves the order, the finished goods officer receives two serials into a
 * location, and the Warehouse Manager moves them to a second location with a
 * stock transfer (raised, dispatched, received).
 *
 * Needs the Zinox roles in e2e/people.ts: procurement-officer, procurement-head,
 * fg-warehouse-officer, warehouse-manager.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = {
  supplier: `E2E Panel Co ${tag}`,
  product: `E2E Tablet ${tag}`,
  sku: `E2E-TAB-${tag}`,
  locationA: `E2E Store A ${tag}`,
  locationB: `E2E Store B ${tag}`,
  serials: [`E2ETAB${tag}001`, `E2ETAB${tag}002`],
  requisitionUrl: '',
  orderUrl: '',
  orderId: '',
  transferUrl: '',
};

/** Pick a native <select> option by (part of) its label. */
async function selectByLabel(select: import('@playwright/test').Locator, text: string) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  if (!value) throw new Error(`No option containing "${text}"`);
  await select.selectOption(value);
}

test.beforeAll(async () => {
  // A finished imported product to buy and receive (the catalogue is not what this spec tests).
  const prisma = db();
  const officer = await prisma.user.findUniqueOrThrow({ where: { email: who('procurement-officer').email }, select: { id: true, organisationId: true } });
  await prisma.product.upsert({
    where: { organisationId_sku: { organisationId: officer.organisationId!, sku: S.sku } },
    update: {},
    create: { organisationId: officer.organisationId!, sku: S.sku, name: S.product, family: 'TABLET', subBrand: 'ZINOX', source: 'FINISHED_IMPORT', serialised: true, createdById: officer.id },
  });
});

test('a procurement officer adds a supplier and raises a requisition for a finished product', async ({ page }) => {
  await as(page, 'procurement-officer');
  await page.goto('/procurement/suppliers/new');
  const sup = jcForm(page, 'Add supplier');
  await sup.locator('input[name="name"]').fill(S.supplier);
  await sup.locator('input[name="country"]').fill('China');
  await sup.locator('select[name="currency"]').selectOption('USD');
  await sup.locator('input[name="leadTimeDays"]').fill('45');
  await sup.getByRole('button', { name: 'Add supplier' }).click();
  await waitOutcome(page, /\/procurement\/suppliers\/[^/?]+\?status=created/);
  await expect(page.getByRole('heading', { name: S.supplier, level: 1 })).toBeVisible();

  await page.goto('/procurement/requisitions/new');
  const form = jcForm(page, 'Submit for approval');
  await form.locator('input[name="reason"]').fill(`E2E tablets for the showroom ${tag}`);
  await form.getByLabel('Line 1 item kind').selectOption('product');
  await pickSearchable(form, page, S.product, new RegExp(S.product), 'Search products…');
  await form.locator('input[name="line_0_quantity"]').fill('2');
  await form.locator('input[name="line_0_unitCost"]').fill('150');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await waitOutcome(page, /\/procurement\/requisitions\/[^/?]+\?status=submitted/);
  expectNoUrlError(page);
  S.requisitionUrl = new URL(page.url()).pathname;
  await expect(page.getByText('Awaiting approval').first()).toBeVisible();
});

test('the Head of Procurement approves the requisition; the officer orders it; the head approves and sends the order', async ({ page }) => {
  await as(page, 'procurement-head');
  await page.goto(S.requisitionUrl);
  await page.getByRole('button', { name: 'Approve requisition' }).click();
  await waitOutcome(page, /status=approved/);
  await expect(page.getByRole('link', { name: 'Create purchase order' })).toBeVisible();

  // The officer raises the order from the approved requisition (the person who raises an order never approves it).
  await as(page, 'procurement-officer');
  await page.goto(S.requisitionUrl);
  await page.getByRole('link', { name: 'Create purchase order' }).click();
  await page.waitForURL(/\/procurement\/orders\/new\?requisition=/);
  const form = jcForm(page, 'Create purchase order');
  await pickSearchable(form, page, S.supplier, new RegExp(S.supplier), 'Search suppliers…');
  await form.locator('select[name="currency"]').selectOption('USD');
  await form.locator('input[name="exchangeRate"]').fill('1500');
  // The requisition's product line came along with its quantity and estimate.
  await expect(form.locator('input[name="line_0_quantity"]')).toHaveValue('2');
  await form.locator('input[name="line_0_unitCost"]').fill('150');
  await form.getByRole('button', { name: 'Create purchase order' }).click();
  await waitOutcome(page, /\/procurement\/orders\/[^/?]+\?status=created/);
  expectNoUrlError(page);
  S.orderUrl = new URL(page.url()).pathname;
  S.orderId = S.orderUrl.split('/').pop()!;
  await expect(page.getByText('USD 300.00').first()).toBeVisible();

  await as(page, 'procurement-head');
  await page.goto(S.orderUrl);
  await page.getByRole('button', { name: 'Approve purchase order' }).click();
  await waitOutcome(page, /status=approved/);
  await page.getByRole('button', { name: 'Mark as sent' }).click();
  await waitOutcome(page, /status=sent/);
  await expect(page.getByText('Sent to supplier').first()).toBeVisible();
});

test('the Warehouse Manager sets up two finished goods locations', async ({ page }) => {
  await as(page, 'warehouse-manager');
  for (const name of [S.locationA, S.locationB]) {
    await page.goto('/warehouse/locations');
    await reveal(page, 'Add a location');
    const form = jcForm(page, 'Add location');
    await form.locator('input[name="name"]').fill(name);
    await form.locator('select[name="kind"]').selectOption('WAREHOUSE');
    await form.getByRole('button', { name: 'Add location' }).click();
    await waitOutcome(page, /status=location_created/);
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
});

test('the finished goods officer receives two serials against the order and sees them in finished goods', async ({ page }) => {
  await as(page, 'fg-warehouse-officer');
  await page.goto(`/warehouse/receive?order=${S.orderId}`);
  const form = jcForm(page, 'Receive units');
  await selectByLabel(form.locator('select[name="locationId"]'), S.locationA);
  await form.locator('textarea[name="serials"]').fill(S.serials.join('\n'));
  await form.getByRole('button', { name: 'Receive units' }).click();
  await waitOutcome(page, /status=received/);
  expectNoUrlError(page);
  await expect(page.getByText('2 units received into stock.')).toBeVisible();

  await page.goto(`/warehouse/finished-goods?q=${encodeURIComponent(`E2ETAB${tag}`)}`);
  for (const serial of S.serials) await expect(page.getByRole('link', { name: serial })).toBeVisible();
  await expect(page.locator('table').getByText('In stock').first()).toBeVisible();

  // The order now shows both units received.
  await page.goto(S.orderUrl);
  await expect(page.getByText('Received').first()).toBeVisible();
});

test('the Warehouse Manager moves the units to the second location with a transfer', async ({ page }) => {
  await as(page, 'warehouse-manager');
  await page.goto('/warehouse/transfers/new');
  const form = jcForm(page, 'Create transfer');
  await selectByLabel(form.locator('select[name="fromLocationId"]'), S.locationA);
  await selectByLabel(form.locator('select[name="toLocationId"]'), S.locationB);
  await pickSearchable(form, page, S.product, new RegExp(S.product), 'Search products…');
  const boxes = form.locator('input[name="unitIds"]');
  await expect(boxes).toHaveCount(2);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await form.locator('input[name="reason"]').fill('E2E replenishment');
  await form.getByRole('button', { name: 'Create transfer' }).click();
  await waitOutcome(page, /\/warehouse\/transfers\/[^/?]+\?status=created/);
  expectNoUrlError(page);
  S.transferUrl = new URL(page.url()).pathname;
  for (const serial of S.serials) await expect(page.getByRole('link', { name: serial })).toBeVisible();

  await page.getByRole('button', { name: 'Dispatch transfer' }).click();
  await waitOutcome(page, /status=dispatched/);
  await page.getByRole('button', { name: 'Receive transfer' }).click();
  await waitOutcome(page, /status=received/);
  await expect(page.getByText('Received', { exact: true }).first()).toBeVisible();

  const prisma = db();
  const units = await prisma.finishedUnit.findMany({ where: { serialNumber: { in: S.serials } }, select: { status: true, location: { select: { name: true } } } });
  expect(units).toHaveLength(2);
  for (const u of units) {
    expect(u.status).toBe('IN_STOCK');
    expect(u.location.name).toBe(S.locationB);
  }
});

test('people outside the warehouses are refused', async ({ page }) => {
  await as(page, 'calendar-user');
  await page.goto('/warehouse');
  await page.waitForURL(/\/access-denied/);
  await page.goto('/procurement/orders');
  await page.waitForURL(/\/access-denied/);
});
