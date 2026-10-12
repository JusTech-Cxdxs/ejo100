import { test, expect } from '@playwright/test';
import { CUSTOMER, SEED_PARTS } from './people';
import { as, expectNoUrlError, latestMail, readStock, waitOutcome } from './helpers';
import { freshVehicle, idOfPart } from './db';
import { card, expectStatus, jcForm, jobCardInProgress, openJobCard } from './workflows';

/**
 * A paid Job Card is cancelled while Store is holding parts for it:
 * the open parts request is withdrawn and the reserved stock goes back,
 * the deposit becomes a refund owed, Finance refunds it (receipt emailed),
 * and only then can the front desk hand the vehicle back. The vehicle can
 * then come in again on a new Job Card.
 */
test.describe.configure({ mode: 'serial' });

const S = { url: '', id: '', number: '', plate: '', partUrl: '', before: { onHand: 0, reserved: 0 }, prsUrl: '', refund: '' };

test.beforeAll(async () => {
  S.plate = (await freshVehicle('CXL')).plate;
  S.partUrl = `/inventory/parts/${await idOfPart(SEED_PARTS.oilFilter.number)}`;
});

test('a Job Card is paid (70%) and Store reserves its parts', async ({ page }) => {
  test.setTimeout(240_000);
  const jc = await jobCardInProgress(page, {
    plate: S.plate,
    complaint: 'Service light on, oil leak',
    lines: [{ type: 'STORE_PART', partType: SEED_PARTS.oilFilter.type, qty: 3 }, { type: 'LABOUR', description: 'Oil leak diagnosis', price: 5000 }],
  });
  Object.assign(S, jc);
  await as(page, 'store-manager');
  S.before = await readStock(page, S.partUrl);

  await as(page, 'technician');
  await page.goto(`${S.url}/request-parts`);
  await page.getByRole('button', { name: 'Raise Parts Request' }).click();
  await waitOutcome(page, /status=parts_requested/);
  await page.getByRole('link', { name: /^PRS-/ }).first().click();
  await page.waitForURL(/\/workshop\/parts-requests\//);
  S.prsUrl = new URL(page.url()).pathname;

  await as(page, 'workshop-manager');
  await page.goto(S.prsUrl);
  await page.getByRole('heading', { name: 'Workshop HOD Approval' }).locator('..').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved — now awaiting Store.')).toBeVisible();
  await as(page, 'store-manager');
  await page.goto(S.prsUrl);
  await page.getByRole('button', { name: 'Approve & Reserve' }).click();
  await expect(page.getByText('Approved and stock reserved — now ready for release.')).toBeVisible();
  const reserved = await readStock(page, S.partUrl);
  expect(reserved.reserved).toBe(S.before.reserved + 3);
  expect(reserved.onHand).toBe(S.before.onHand);
});

test('front desk asks to cancel; the Manager sees the refund it authorises and approves', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto(S.url);
  const req = jcForm(page, 'Request cancellation');
  await req.locator('textarea[name="reason"]').fill('Customer decided to repair elsewhere');
  await req.getByRole('button', { name: 'Request cancellation' }).click();
  await expect(page.getByRole('button', { name: 'Request cancellation' })).toHaveCount(0);
  await expect(card(page, 'Cancellation history')).toContainText('Awaiting Manager Decision');

  await as(page, 'workshop-manager');
  await page.goto(S.url);
  const box = page.locator('#cancellation-request');
  await expect(box).toContainText('Customer decided to repair elsewhere');
  await expect(box).toContainText(/has paid ₦[\d,]+\.\d\d\. Approving this cancellation also authorises a full refund/);
  await box.getByRole('button', { name: 'Approve cancellation' }).click();
  await expectStatus(page, 'Cancelled');
  expectNoUrlError(page);
  await expect(page.getByText('Cancelled — Refund Due').first()).toBeVisible();
});

test('the open parts request is withdrawn and the reserved stock is back on the shelf', async ({ page }) => {
  await as(page, 'store-manager');
  const after = await readStock(page, S.partUrl);
  expect(after.reserved, 'reserved stock returned').toBe(S.before.reserved);
  expect(after.onHand, 'nothing left the Store').toBe(S.before.onHand);
  await page.goto(S.prsUrl);
  await expect(page.getByText('Rejected', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release', exact: true })).toHaveCount(0);
});

test('the vehicle cannot be handed back until Finance refunds the deposit', async ({ page, request }) => {
  await as(page, 'receptionist');
  await page.goto(S.url);
  await expect(page.locator('#status-panel')).toContainText(/must be refunded \(see Refunds\) before the vehicle can be handed back/);
  await expect(page.getByRole('button', { name: 'Hand vehicle back' })).toHaveCount(0);
  // Front desk cannot record the refund itself.
  await expect(page.getByRole('button', { name: 'Record refund' })).toHaveCount(0);

  await as(page, 'finance-officer');
  await page.goto(S.url);
  const refunds = page.locator('#refunds');
  await expect(refunds).toContainText('Refund due');
  const form = jcForm(page, 'Record refund');
  await expect(form.locator('input[name="paidToName"]')).toHaveValue(CUSTOMER.name);
  await form.locator('select[name="method"]').selectOption('BANK_TRANSFER');
  await form.locator('input[name="notes"]').fill('TRF-E2E-REFUND');
  await form.getByRole('button', { name: 'Record refund' }).click();
  await waitOutcome(page, /status=refund_recorded/);
  S.refund = new URL(page.url()).searchParams.get('ref') ?? '';
  expect(S.refund).toMatch(/^RF-/);
  await expect(page.getByText('Refund recorded — the customer has been emailed their receipt.')).toBeVisible();
  await expect(page.locator('#refunds')).toContainText('Fully refunded');
  await expect(page.getByText('Cancelled — Refunded').first()).toBeVisible();
  await latestMail(request, CUSTOMER.email, /refund/i);

  await page.goto(`/workshop/refunds?q=${encodeURIComponent(S.refund)}`);
  await expect(page.getByText(S.refund).first()).toBeVisible();
  await expect(page.getByText(S.number).first()).toBeVisible();
});

test('front desk hands the vehicle back; it can come in again on a new Job Card', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto(S.url);
  const handBack = jcForm(page, 'Hand vehicle back');
  await handBack.locator('input[name="collectedByName"]').fill('Ada Customer (driver)');
  await handBack.getByRole('button', { name: 'Hand vehicle back' }).click();
  await expectStatus(page, 'Checked Out');
  await expect(page.getByText(/collected by Ada Customer \(driver\)/)).toBeVisible();

  // The "one open Job Card per vehicle" rule only counts OPEN Job Cards.
  const again = await openJobCard(page, { plate: S.plate, complaint: 'Came back for the oil leak after all' });
  expect(again).not.toBe(S.url);
});
