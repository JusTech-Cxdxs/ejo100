import { test, expect, type Page } from '@playwright/test';
import { as, uniq, visitHealthy, waitOutcome } from './helpers';
import { jcForm, pickSearchable, reveal } from './workflows';

/**
 * Production, A to Z: a planner creates a build order for a catalogue
 * configuration → the Production Manager releases it to the line → an
 * assembler starts a unit and records assembly → the line supervisor passes
 * the line check → the QA inspector passes QA → the Production Manager
 * releases the unit to finished goods; the serial then shows on /production/units.
 * If the catalogue has no product yet, the manager adds one first.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = { productName: `E2E Prestige ${tag}`, sku: `E2E-${tag}`, configName: `16 GB / 512 GB ${tag}`, configCode: '16GB-512', configLabel: '', buildOrderUrl: '', buildOrderNumber: '', unitUrl: '', serial: '' };

/** Pass every checklist item (PASS radios), when the family has items. */
async function passEveryItem(form: ReturnType<typeof jcForm>) {
  const items = form.locator('input[type="hidden"][name^="item_"]');
  const n = await items.count();
  for (let i = 0; i < n; i++) await form.locator(`input[name="result_${i}"][value="PASS"]`).check({ force: true });
}

/** The Production Manager adds a fresh product and configuration for this run (the base seed ships no products). */
async function ensureProduct(page: Page) {
  await as(page, 'production-manager');
  await page.goto('/catalogue/products/new');
  const form = jcForm(page, 'Add product');
  await form.locator('input[name="sku"]').fill(S.sku);
  await form.locator('input[name="name"]').fill(S.productName);
  await form.locator('select[name="family"]').selectOption('LAPTOP');
  await form.locator('select[name="source"]').selectOption('ASSEMBLED');
  await form.locator('textarea[name="specsText"]').fill('Processor: Intel Core i5-1235U\nDisplay: 14.1" FHD touch');
  await form.getByRole('button', { name: 'Add product' }).click();
  await waitOutcome(page, /\/catalogue\/products\/[^/?]+\?status=product_created/);
  await reveal(page, 'Add a configuration');
  const cfg = jcForm(page, 'Add configuration');
  await cfg.locator('input[name="code"]').fill(S.configCode);
  await cfg.locator('input[name="name"]').fill(S.configName);
  await cfg.getByRole('button', { name: 'Add configuration' }).click();
  await waitOutcome(page, /\/configurations\/[^/?]+\?status=configuration_created/);
  S.configLabel = `${S.productName} — ${S.configName}`;
}

test('the Production Manager adds a product with a configuration to the catalogue', async ({ page }) => {
  await ensureProduct(page);
  expect(S.configLabel).not.toEqual('');
  await visitHealthy(page, '/catalogue');
  await visitHealthy(page, '/catalogue/checklists');
});

test('the planner creates a build order for the configuration', async ({ page }) => {
  await as(page, 'production-planner');
  await page.goto('/production/build-orders/new');
  const form = jcForm(page, 'Create build order');
  await pickSearchable(form, page, S.productName.slice(0, 14), new RegExp(S.configLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Search by product, SKU or configuration…');
  await form.locator('input[name="quantity"]').fill('1');
  await form.locator('select[name="purpose"]').selectOption('TO_STOCK');
  await form.locator('textarea[name="instructions"]').fill(`E2E build ${tag}`);
  await form.getByRole('button', { name: 'Create build order' }).click();
  await waitOutcome(page, /\/production\/build-orders\/[^/?]+\?status=build_order_created/);
  S.buildOrderUrl = new URL(page.url()).pathname;
  S.buildOrderNumber = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim() ?? '';
  expect(S.buildOrderNumber).toMatch(/^BLD-/);

  // Planning checks the materials (no BOM lines → nothing short).
  await page.getByRole('button', { name: 'Check materials' }).click();
  await waitOutcome(page, /status=materials_(checked|short)/);
  await expect(page.getByText('Materials checked')).toBeVisible();
});

test('the Production Manager releases it to the line', async ({ page }) => {
  await as(page, 'production-manager');
  await page.goto(S.buildOrderUrl);
  await page.getByRole('button', { name: 'Release to the line' }).click();
  await waitOutcome(page, /status=build_order_released/);
  await expect(page.getByText('Released to the line.')).toBeVisible();
});

test('an assembler starts a unit and records assembly', async ({ page }) => {
  await as(page, 'assembler');
  await page.goto(S.buildOrderUrl);
  await page.getByRole('button', { name: 'Start unit' }).click();
  await waitOutcome(page, /\/production\/units\/[^/?]+\?status=unit_started/);
  S.unitUrl = new URL(page.url()).pathname;
  S.serial = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim() ?? '';
  expect(S.serial).toMatch(/^ZNX\d{2}LT\d{7}$/);
  await page.getByRole('button', { name: 'Mark assembled' }).click();
  await waitOutcome(page, /status=unit_assembled/);
  // The assembler also records the software image.
  await page.getByRole('button', { name: /Software installed/ }).click();
  await waitOutcome(page, /status=software_recorded/);
});

test('the line supervisor passes the line check', async ({ page }) => {
  await as(page, 'line-supervisor');
  await page.goto(S.unitUrl);
  const form = jcForm(page, 'Submit line check');
  await passEveryItem(form);
  await form.getByRole('button', { name: 'Submit line check' }).click();
  await waitOutcome(page, /status=line_check_passed/);
});

test('the QA inspector passes QA', async ({ page }) => {
  await as(page, 'qa-inspector');
  await page.goto(S.unitUrl);
  const form = jcForm(page, 'Submit QA result');
  await passEveryItem(form);
  await form.locator('input[name="burnInHours"]').fill('4');
  await form.getByRole('button', { name: 'Submit QA result' }).click();
  await waitOutcome(page, /status=qa_passed/);
});

test('the Production Manager releases the unit to finished goods and the serial is listed', async ({ page }) => {
  await as(page, 'production-manager');
  await page.goto(S.unitUrl);
  await page.getByRole('button', { name: 'Release to finished goods' }).click();
  await waitOutcome(page, /status=unit_released/);
  await expect(page.getByText('Released to the finished-goods store.')).toBeVisible();

  await page.goto(`/production/units?q=${encodeURIComponent(S.serial)}`);
  await expect(page.getByRole('link', { name: S.serial })).toBeVisible();
  await visitHealthy(page, `/print/unit-traveller${S.unitUrl.replace('/production/units', '')}`);
  await visitHealthy(page, '/production/line');
});

test('an assembler cannot release a build order; a sales officer cannot open Production', async ({ page }) => {
  await as(page, 'assembler');
  await page.goto(S.buildOrderUrl);
  await expect(page.getByRole('button', { name: 'Release to the line' })).toHaveCount(0);
  await as(page, 'sales-officer');
  await page.goto('/production');
  await page.waitForURL(/\/access-denied/);
});
