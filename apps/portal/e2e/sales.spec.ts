import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_ORG_ADMIN, PORTAL_CUSTOMER, who } from './people';
import { as, open, signIn, uniq, visitHealthy, waitOutcome } from './helpers';
import { jcForm, pickSearchable, reveal } from './workflows';

/**
 * Sales, order to cash: the Commercial Director creates and activates a
 * Tier 1 dealer price list with one product → onboards the seeded portal
 * customer as a Tier 1 dealer → a sales officer quotes, sends, accepts and
 * converts → Billing issues the pro-forma and records the full payment →
 * the Finance Manager confirms it and clears the order → the goods release
 * note is linked on the order for the warehouse. Plus a refused role and a
 * person from another organisation.
 *
 * The catalogue is not seeded here: the first product the picker offers is
 * used, and the whole flow is skipped when the catalogue is empty.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = { noProduct: false, listUrl: '', quoteUrl: '', orderUrl: '' };

/** Open a SearchableSelect by its placeholder and return its first option (null when the list is empty). */
async function firstOption(page: Page, placeholder: string, hasText?: RegExp) {
  const box = page.getByPlaceholder(placeholder).first();
  await box.click();
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 15_000 });
  await expect(listbox.getByText('Loading…')).toHaveCount(0, { timeout: 15_000 });
  const options = hasText ? page.locator('button[role="option"]').filter({ hasText }) : page.locator('button[role="option"]');
  return (await options.count()) ? options.first() : null;
}

test('the Commercial Director creates and activates a Tier 1 dealer price list with one product', async ({ page }) => {
  await as(page, 'commercial-director');
  await page.goto('/sales/price-lists/new');
  const form = jcForm(page, 'Create price list');
  await form.locator('input[name="name"]').fill(`E2E Dealer Tier 1 ${tag}`);
  await form.locator('select[name="channel"]').selectOption('DEALER');
  await form.locator('select[name="tier"]').selectOption('TIER_1');
  await form.getByRole('button', { name: 'Create price list' }).click();
  await waitOutcome(page, /\/sales\/price-lists\/[^/?]+\?status=created/);
  S.listUrl = new URL(page.url()).pathname;

  await reveal(page, 'Add or re-price a product');
  const option = await firstOption(page, 'Search products…');
  if (!option) {
    S.noProduct = true;
    test.skip(true, 'No product in the catalogue — the Catalogue seed is not here; the order-to-cash flow is skipped.');
    return;
  }
  await option.click();
  const item = jcForm(page, 'Save price');
  await item.locator('input[name="unitPrice"]').fill('250000');
  await item.getByRole('button', { name: 'Save price' }).click();
  await waitOutcome(page, /status=item_saved/);
  await expect(page.getByText('₦250,000.00')).toBeVisible();

  await page.getByRole('button', { name: 'Activate price list' }).click();
  await waitOutcome(page, /status=activated/);
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
});

test('the Commercial Director onboards the portal customer as a Tier 1 dealer', async ({ page }) => {
  test.skip(S.noProduct, 'no product in the catalogue');
  await as(page, 'commercial-director');
  await open(page, '/sales/dealers');
  if (await page.getByRole('link', { name: PORTAL_CUSTOMER.name }).count()) return; // already a dealer from an earlier run
  await reveal(page, 'Onboard a dealer');
  const form = jcForm(page, 'Onboard dealer');
  await pickSearchable(form, page, 'Kemi', new RegExp(PORTAL_CUSTOMER.name), 'Search customers…');
  await form.locator('select[name="channel"]').selectOption('DEALER');
  await form.locator('select[name="tier"]').selectOption('TIER_1');
  await form.locator('input[name="territory"]').fill('Computer Village, Ikeja');
  await form.getByRole('button', { name: 'Onboard dealer' }).click();
  await waitOutcome(page, /\/sales\/dealers\/[^/?]+\?status=onboarded/);
  await expect(page.getByRole('heading', { level: 1, name: PORTAL_CUSTOMER.name })).toBeVisible();
});

test('a sales officer quotes the dealer from the Tier 1 list, sends, accepts and converts to a sales order', async ({ page }) => {
  test.skip(S.noProduct, 'no product in the catalogue');
  await as(page, 'sales-officer');
  await page.goto('/sales/quotations/new');
  const form = jcForm(page, 'Save draft quotation');
  await pickSearchable(form, page, 'Kemi', new RegExp(PORTAL_CUSTOMER.name), 'Search customers…');
  // The price list prefills the unit price: pick the first priced product.
  const priced = await firstOption(page, 'Search products…', /₦/);
  expect(priced, 'a product priced on the active Tier 1 list').not.toBeNull();
  await priced!.click();
  await expect(form.locator('input[name="line_1_unitPrice"]')).toHaveValue(/\d/);
  await form.locator('input[name="line_1_quantity"]').fill('2');
  await form.getByRole('button', { name: 'Save draft quotation' }).click();
  await waitOutcome(page, /\/sales\/quotations\/[^/?]+\?status=created/);
  S.quoteUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/^QTE-/);

  await page.getByRole('button', { name: 'Send to customer' }).click();
  await waitOutcome(page, /status=sent/);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await waitOutcome(page, /status=accepted/);
  await page.getByRole('button', { name: 'Convert to sales order' }).click();
  await waitOutcome(page, /\/sales\/orders\/[^/?]+\?status=confirmed/);
  S.orderUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/^SO-/);
  await expect(page.getByText('Prepaid').first()).toBeVisible();
});

test('Billing issues the pro-forma invoice and records the full payment', async ({ page }) => {
  test.skip(S.noProduct || !S.orderUrl, 'needs the sales order');
  await as(page, 'billing-officer');
  await open(page, S.orderUrl);
  await reveal(page, 'Issue pro-forma invoice');
  await jcForm(page, 'Issue pro-forma invoice').getByRole('button', { name: 'Issue pro-forma invoice' }).click();
  await waitOutcome(page, /status=pro_forma_issued/);
  await expect(page.getByText(/PFI-\d{4}-\d{6}/).first()).toBeVisible();
  await expect(page.getByText('Awaiting payment').first()).toBeVisible();

  await reveal(page, 'Record payment');
  const pay = jcForm(page, 'Record payment');
  await expect(pay.locator('input[name="amount"]')).toHaveValue(/\d/); // prefilled with the balance
  await pay.locator('select[name="method"]').selectOption('BANK_TRANSFER');
  await pay.locator('input[name="reference"]').fill(`TRF-${tag}`);
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await waitOutcome(page, /status=payment_recorded/);
  // Billing recorded it, so Billing is not offered the confirmation (it has no finance.payment.confirm anyway).
  await expect(page.getByRole('button', { name: 'Confirm payment' })).toHaveCount(0);
});

test('the Finance Manager confirms the payment and clears the order: a goods release note is linked', async ({ page }) => {
  test.skip(S.noProduct || !S.orderUrl, 'needs the sales order');
  await as(page, 'finance-manager');
  await open(page, S.orderUrl);
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await waitOutcome(page, /status=payment_confirmed/);
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear for release' }).click();
  await waitOutcome(page, /status=cleared/);
  const release = page.getByRole('link', { name: /REL-\d{4}-\d{6}/ });
  await expect(release).toBeVisible();
  expect(await release.getAttribute('href')).toMatch(/^\/warehouse\/releases\//);
  await expect(page.getByText(/Ready for release|In production/).first()).toBeVisible();
});

test('the payments list shows the confirmed payment and Finance can export it', async ({ page }) => {
  test.skip(S.noProduct || !S.orderUrl, 'needs the sales order');
  await as(page, 'finance-manager');
  await visitHealthy(page, '/sales/payments?show=CONFIRMED');
  await expect(page.getByText(`TRF-${tag}`)).toBeVisible();
  const res = await page.request.get('/sales/payments/export');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(await res.text()).toContain(`TRF-${tag}`);
});

test('every Sales page renders for the Finance Manager', async ({ page }) => {
  await as(page, 'finance-manager');
  for (const url of ['/sales', '/sales/quotations', '/sales/orders', '/sales/payments', '/sales/returns', '/sales/dealers', '/sales/price-lists']) await visitHealthy(page, url);
});

test('a technician is refused, and another organisation never sees the order', async ({ page }) => {
  await signIn(page, who('technician').email, E2E_PASSWORD);
  await page.goto('/sales');
  await expect(page).toHaveURL(/access-denied/);
  test.skip(S.noProduct || !S.orderUrl, 'needs the sales order for the cross-organisation check');
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  await page.goto(S.orderUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto(S.quoteUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const csv = await page.request.get('/sales/payments/export');
  expect(csv.status()).toBe(403);
});
