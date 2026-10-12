import { test, expect, type Page } from '@playwright/test';
import { CUSTOMER, SEED_PARTS, who } from './people';
import { as, expectNoUrlError, latestMail, readStock, waitOutcome } from './helpers';
import { freshVehicle, idOfPart } from './db';
import { card, jcForm, pickSearchable } from './workflows';

/**
 * Vehicle Service (routine maintenance), by the people who do it:
 * book → check in (front desk only) → supervisor approves, assigns →
 * technician accepts, inspects (skips with a reason) → normal service
 * estimate (Store part + labour) → Store matches → approvals → customer
 * notified (email) → 70% deposit moves it In Service → completed → ready →
 * balance → close approved → collected. Also: a cancelled booking is
 * handed back, and a service that turns into a repair is escalated to a
 * Job Card.
 */

const vsStatus = (page: Page) => page.getByRole('heading', { level: 1 }).locator('xpath=following-sibling::span[1]');

async function bookService(page: Page, plate: string, reason: string): Promise<{ url: string; number: string }> {
  return test.step(`front desk books ${plate} in for service`, async () => {
    await as(page, 'receptionist');
    await page.goto('/workshop/vehicle-service');
    const form = jcForm(page, 'Open Vehicle Service');
    await form.getByPlaceholder('Search by name, email, or phone…').fill(CUSTOMER.name);
    await page.getByRole('option', { name: new RegExp(CUSTOMER.name) }).first().click();
    const vehicle = form.locator('select[name="vehicleId"]');
    await vehicle.selectOption((await vehicle.locator('option', { hasText: plate }).first().getAttribute('value'))!);
    await form.locator('select[name="supervisorId"]').selectOption({ label: who('workshop-supervisor').name });
    await form.locator('input[name="mileageAtCheckIn"]').fill('61000');
    await form.locator('input[name="customerComplaints"]').first().fill(reason);
    await form.getByRole('button', { name: 'Open Vehicle Service' }).click();
    await page.waitForURL(/\/workshop\/vehicle-service\/[^/?]+$/);
    await expect(vsStatus(page)).toHaveText('Scheduled');
    const number = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim();
    return { url: new URL(page.url()).pathname, number };
  });
}

async function checkIn(page: Page, url: string) {
  await test.step('front desk checks the vehicle in', async () => {
    await page.goto(url);
    const form = jcForm(page, 'Check In Vehicle');
    await form.getByRole('button', { name: 'Check In Vehicle' }).click();
    await expect(vsStatus(page)).toHaveText('Checked In');
    expectNoUrlError(page);
  });
}

async function approveAssignAccept(page: Page, url: string) {
  await as(page, 'workshop-supervisor');
  await page.goto(url);
  await page.locator('#review-approval').getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('#review-approval')).toHaveCount(0);
  const assign = page.locator('form').filter({ has: page.locator('select[name="technicianId"]') });
  const sel = assign.locator('select[name="technicianId"]');
  await sel.selectOption((await sel.locator('option', { hasText: who('technician').name }).first().getAttribute('value'))!);
  await assign.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByText(`Currently: ${who('technician').name}`)).toBeVisible();
  await as(page, 'technician');
  await page.goto(url);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await waitOutcome(page, /status=assignment_accepted/);
}

async function skipInspection(page: Page, url: string) {
  await page.goto(`${url}/inspection`);
  await page.locator('input[name="reason"]').fill('Routine service — customer declined a full inspection');
  await page.getByRole('button', { name: 'Skip Inspection' }).click();
  await waitOutcome(page, /status=skipped|\/vehicle-service\/[^/]+(\?|$)/);
  expectNoUrlError(page);
}

test.describe('Vehicle Service — the full visit', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { url: '', id: '', number: '', plate: '', partUrl: '' };
  test.beforeAll(async () => {
    S.plate = (await freshVehicle('VSL', { make: 'Honda', model: 'Civic' })).plate;
    S.partUrl = `/inventory/parts/${await idOfPart(SEED_PARTS.sparkPlug.number)}`;
  });

  test('booked, and only the front desk can check it in', async ({ page }) => {
    const b = await bookService(page, S.plate, 'Routine 10,000 km service');
    Object.assign(S, b);
    S.id = S.url.split('/').pop()!;
    await as(page, 'technician');
    await page.goto(S.url);
    await expect(page.getByRole('button', { name: 'Check In Vehicle' })).toHaveCount(0);
    await as(page, 'receptionist');
    await checkIn(page, S.url);
  });

  test('approved, assigned, accepted; inspection skipped with a reason; a normal service estimate', async ({ page }) => {
    await approveAssignAccept(page, S.url);
    await skipInspection(page, S.url);
    await page.goto(S.url);
    await page.getByRole('button', { name: 'Continue with Normal Service' }).click();
    await waitOutcome(page, /status=estimate_started/);

    const form = page.locator('form').filter({ has: page.locator('select[name="type"]') });
    await form.locator('select[name="type"]').selectOption('STORE_PART');
    await pickSearchable(form, page, SEED_PARTS.sparkPlug.type, new RegExp(SEED_PARTS.sparkPlug.type), 'Search Part Types…');
    await form.locator('input[name="quantity"]').fill('4');
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await waitOutcome(page, /status=line_added/);

    await as(page, 'workshop-supervisor');
    await page.goto(S.url);
    const f2 = page.locator('form').filter({ has: page.locator('select[name="type"]') });
    await f2.locator('select[name="type"]').selectOption('LABOUR');
    await f2.locator('input[name="description"]').fill('Service labour');
    await f2.locator('input[name="unitPrice"]').fill('6000');
    await f2.getByRole('button', { name: 'Add', exact: true }).click();
    await waitOutcome(page, /status=line_added/);
    await page.getByRole('button', { name: /Request Store Matching/ }).click();
    await waitOutcome(page, /status=matching_requested/);

    await as(page, 'store-manager');
    await page.goto(`/inventory/service-estimate-matching/${S.id}`);
    await page.getByRole('button', { name: 'Match', exact: true }).first().click();
    await waitOutcome(page, /status=line_matched/);
    await page.goto(`/inventory/service-estimate-matching/${S.id}`);
    await expect(page.getByText('Every requested line for this Vehicle Service is matched.')).toBeVisible();
  });

  test('approvals, the customer is told, the deposit starts the service', async ({ page, request }) => {
    await as(page, 'workshop-supervisor');
    await page.goto(S.url);
    // 4 × 2,500 + 6,000 = 16,000
    await expect(card(page, 'Service Estimate')).toContainText('₦16,000.00');
    await page.getByRole('button', { name: 'Submit for validation' }).click();
    await waitOutcome(page, /status=estimate_submitted/);
    await page.getByRole('button', { name: 'Approve estimate' }).click();
    await waitOutcome(page, /status=estimate_approved/);

    await as(page, 'workshop-manager');
    await page.goto(S.url);
    await page.getByRole('button', { name: 'Approve as manager' }).click();
    await waitOutcome(page, /status=estimate_manager_approved/);

    await as(page, 'receptionist');
    await page.goto(S.url);
    await page.getByRole('button', { name: 'Notify customer' }).click();
    await waitOutcome(page, /status=customer_notified/);
    await latestMail(request, CUSTOMER.email, new RegExp(`Your estimate for Vehicle Service ${S.number} has been approved`));

    await as(page, 'finance-officer');
    await page.goto(S.url);
    const pay = jcForm(page, 'Record payment');
    await pay.locator('select').first().selectOption('SEVENTY_PERCENT');
    await pay.getByRole('button', { name: 'Record payment' }).click();
    await expect(vsStatus(page)).toHaveText('In Service');
    expectNoUrlError(page);
  });

  test('completed, ready, paid, closed and collected', async ({ page }) => {
    await as(page, 'workshop-supervisor');
    await page.goto(S.url);
    const complete = jcForm(page, 'Complete Service');
    await complete.locator('textarea[name="technicianNotes"]').fill('Replaced 4 spark plugs; general check OK');
    await complete.getByRole('button', { name: 'Complete Service' }).click();
    await expect(vsStatus(page)).toHaveText('Completed');
    await jcForm(page, 'Mark Ready for Collection').getByRole('button', { name: 'Mark Ready for Collection' }).click();
    await expect(vsStatus(page)).toHaveText('Ready for Collection');
    await expect(page.getByRole('heading', { name: 'Technician Notes' })).toBeVisible();

    await as(page, 'finance-officer');
    await page.goto(S.url);
    const pay = jcForm(page, 'Record payment');
    await pay.locator('select').first().selectOption('REMAINING');
    await pay.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText('Paid in full — nothing further to record.')).toBeVisible();

    await as(page, 'receptionist');
    await page.goto(S.url);
    await page.getByRole('button', { name: 'Request close' }).click();
    await waitOutcome(page, /status=close_requested/);

    await as(page, 'workshop-manager');
    await page.goto(S.url);
    await page.getByRole('button', { name: 'Approve close' }).click();
    await waitOutcome(page, /status=close_approved/);
    await expect(vsStatus(page)).toHaveText('Closed');

    await as(page, 'workshop-supervisor');
    await page.goto(S.url);
    const out = jcForm(page, 'Check Out Vehicle');
    await expect(out.locator('input[name="collectedByName"]')).toHaveValue(CUSTOMER.name);
    await out.getByRole('button', { name: 'Check Out Vehicle' }).click();
    await waitOutcome(page, /status=checked_out/);
    await expect(vsStatus(page)).toHaveText('Checked Out');
    await expect(page.getByRole('heading', { name: 'Checked out' })).toBeVisible();
  });

  test('the service tracker and custody pages list the vehicle', async ({ page }) => {
    await as(page, 'workshop-manager');
    await page.goto('/workshop/service-tracker');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto(`/workshop/vehicle-service?q=${encodeURIComponent(S.number)}`);
    await expect(page.getByRole('link', { name: S.number })).toBeVisible();
    const stock = await readStock(page, S.partUrl);
    expect(stock.onHand).toBeGreaterThan(0);
  });
});

test.describe('Vehicle Service — cancelled and escalated', () => {
  test('a booking cancelled before work is handed back', async ({ page }) => {
    const plate = (await freshVehicle('VSC')).plate;
    const { url } = await bookService(page, plate, 'Air-con check');
    await checkIn(page, url);
    await page.locator('summary', { hasText: 'Request cancellation' }).click();
    const cancel = jcForm(page, 'Request cancellation');
    await cancel.locator('textarea[name="reason"]').fill('Customer rescheduled to next month');
    await cancel.getByRole('button', { name: 'Request cancellation' }).click();
    await waitOutcome(page, /status=cancellation_requested/);

    await as(page, 'workshop-manager');
    await page.goto(url);
    await page.locator('#cancellation-request').getByRole('button', { name: 'Approve cancellation' }).click();
    await waitOutcome(page, /status=cancellation_approved/);
    await expect(vsStatus(page)).toHaveText('Cancelled');

    await as(page, 'receptionist');
    await page.goto(url);
    await page.getByRole('button', { name: 'Hand vehicle back' }).click();
    await waitOutcome(page, /status=handed_back/);
  });

  test('a service that turns into a repair becomes a Job Card', async ({ page }) => {
    const plate = (await freshVehicle('VSE')).plate;
    const { url, number } = await bookService(page, plate, 'Service and odd knocking');
    await checkIn(page, url);
    await approveAssignAccept(page, url);
    await skipInspection(page, url);
    await as(page, 'workshop-supervisor');
    await page.goto(url);
    await page.locator('textarea[name="additionalComplaint"], input[name="additionalComplaint"]').fill('Knocking from the front suspension');
    await page.getByRole('button', { name: 'Create Job Card & Estimate' }).click();
    await page.waitForURL(/\/workshop\/job-cards\/[^/?]+/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^JC-/);
    await expect(page.getByText('Knocking from the front suspension')).toBeVisible();
    const trail = page.getByRole('heading', { name: 'Audit trail' }).locator('..');
    await expect(trail.getByText('Created from Vehicle Service')).toBeVisible();
    await expect(trail).toContainText(number);

    await page.goto(url);
    await expect(vsStatus(page)).toHaveText('Escalated');
    await expect(page.getByRole('link', { name: /^Job Card JC-/ })).toBeVisible();
  });
});
