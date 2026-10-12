import { test, expect } from '@playwright/test';
import { as, expectHealthy, expectNoUrlError, readStock, uniq, visitHealthy, waitOutcome } from './helpers';
import { jcForm, pickSearchable } from './workflows';

/**
 * The Store's own day: a new category and part type, a new part in the
 * catalog, a goods receipt with its cost (stock goes up), a selling price,
 * and the pricing, matching and analytics pages a store manager watches.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = {
  category: `E2E Cat ${tag}`,
  code: `Q${tag.replace(/[^A-Z]/g, '').slice(0, 3)}${tag.slice(-2)}`.replace(/[^A-Z0-9]/g, ''),
  type: `E2E Type ${tag}`,
  part: `E2E Wiper Blade ${tag}`,
  partUrl: '',
  grn: '',
};

test('a store manager adds a category, a part type and a part', async ({ page }) => {
  await as(page, 'store-manager');
  await page.goto('/inventory/part-types');
  const cat = jcForm(page, 'Add Category');
  await cat.locator('input[name="name"]').fill(S.category);
  await cat.locator('input[name="code"]').fill(S.code);
  await cat.getByRole('button', { name: 'Add Category' }).click();
  await waitOutcome(page, /status=category_created/);
  await expect(page.getByText('Part Category created.')).toBeVisible();

  const type = jcForm(page, 'Add Type');
  await pickSearchable(type, page, S.category, new RegExp(S.category), 'Search Categories…');
  await type.locator('input[name="name"]').fill(S.type);
  await type.getByRole('button', { name: 'Add Type' }).click();
  await waitOutcome(page, /status=type_created/);
  await expect(page.getByText(S.type)).toBeVisible();

  await page.goto('/inventory/parts');
  const part = jcForm(page, 'Add Part');
  await part.locator('input[name="name"]').fill(S.part);
  await pickSearchable(part, page, S.type, new RegExp(S.type), 'Search Part Types…');
  await part.locator('select[name="trackingType"]').selectOption('QUANTITY');
  await part.locator('select[name="warrantyChoice"]').selectOption('NO');
  await part.locator('input[name="baseUnitOfMeasure"]').fill('Piece');
  await part.locator('input[name="reorderPoint"]').fill('5');
  await part.getByRole('button', { name: 'Add Part' }).click();
  await waitOutcome(page, /status=part_created/);
  expectNoUrlError(page);
  await page.goto(`/inventory/parts?q=${encodeURIComponent(S.part)}`);
  await page.getByRole('link', { name: S.part }).first().click();
  await page.waitForURL(/\/inventory\/parts\/[^/?]+$/);
  S.partUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: S.part, level: 1 })).toBeVisible();
  // Its part number comes from the category code.
  await expect(page.getByText(new RegExp(`^${S.code}-\\d+`)).first()).toBeVisible();
  const stock = await readStock(page, S.partUrl);
  expect(stock.onHand).toBe(0);
});

test('a goods receipt with its cost puts the stock on the shelf', async ({ page }) => {
  await as(page, 'store-manager');
  await page.goto('/inventory/goods-receipts/new');
  const form = jcForm(page, 'Record Goods Receipt');
  await form.locator('input[name="supplierName"]').fill('E2E Wipers Ltd');
  await pickSearchable(form, page, S.part, new RegExp(S.part), 'Search Parts…');
  await form.locator('input[name="quantityReceivedInUnit"]').fill('12');
  await form.locator('input[name="unitUsed"]').fill('Piece');
  await form.locator('input[name="totalCost"]').fill('36000');
  await form.locator('textarea[name="notes"]').fill('Delivery note DN-E2E-1');
  await form.getByRole('button', { name: 'Record Goods Receipt' }).click();
  await waitOutcome(page, /\/inventory\/goods-receipts\?status=receipt_recorded/);
  expectNoUrlError(page);
  await expect(page.getByText('E2E Wipers Ltd').first()).toBeVisible();

  const stock = await readStock(page, S.partUrl);
  expect(stock.onHand).toBe(12);
  // The receipt is traceable from the part.
  await expect(page.getByRole('link', { name: /^GRN-/ }).first()).toBeVisible();
  await page.getByRole('link', { name: /^GRN-/ }).first().click();
  await page.waitForURL(/\/inventory\/goods-receipts\/[^/?]+/);
  await expectHealthy(page);
  await expect(page.getByText('₦3,000').first()).toBeVisible();
});

test('the selling price is set; pricing, matching and analytics pages show real figures', async ({ page }) => {
  await as(page, 'store-manager');
  await page.goto(S.partUrl);
  const price = jcForm(page, /^(Set|Save)$/).filter({ has: page.locator('input[name="sellingPrice"]') });
  await price.locator('input[name="sellingPrice"]').fill('4500');
  await price.getByRole('button', { name: 'Set' }).click();
  await waitOutcome(page, /status=selling_price_set/);
  await expect(page.getByText('Selling price updated.')).toBeVisible();
  await expect(page.getByText('₦4,500.00').first()).toBeVisible();

  await visitHealthy(page, '/inventory/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing Command Center' })).toBeVisible();
  await visitHealthy(page, '/inventory/estimate-matching');
  await expect(page.getByRole('heading', { name: 'Estimate Matching' })).toBeVisible();
  await visitHealthy(page, '/inventory/analytics');
  await expect(page.getByRole('heading', { name: 'Inventory analytics' })).toBeVisible();
  await expect(page.locator('main')).toContainText(/₦[\d,]+/);
  await visitHealthy(page, '/inventory');
  await visitHealthy(page, '/inventory/goods-receipts');
});

test('read-only Store viewers are not offered the Store’s forms', async ({ page }) => {
  await as(page, 'technician');
  await page.goto('/inventory/parts');
  await expect(page.getByRole('heading', { name: 'Parts Catalog' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Part' })).toHaveCount(0);
  await page.goto('/inventory/goods-receipts/new');
  await expect(page.getByRole('heading', { name: 'Record Goods Receipt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record Goods Receipt' })).toHaveCount(0);
});
