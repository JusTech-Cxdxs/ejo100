import { test, expect } from '@playwright/test';
import { SUPERMANAGER, who } from './people';
import { as, expectNoUrlError, latestMail, waitOutcome } from './helpers';
import { freshVehicle } from './db';
import { addLine, assignTechnician, card, jcForm, jobNumber, openJobCard, submitEstimate, supervisorApprovesEstimate } from './workflows';

/**
 * The "no" paths of a Job Card: a supervisor turns it down (with a reason)
 * and the front desk routes it to another supervisor; a technician turns
 * down the assignment; the Manager sends an estimate back for changes; a
 * cancellation request is declined; and the vehicle can never have two open
 * Job Cards.
 */
test.describe.configure({ mode: 'serial' });

const S = { url: '', number: '', plate: '' };
test.beforeAll(async () => { S.plate = (await freshVehicle('REJ')).plate; });

test('a supervisor rejects the Job Card; the front desk routes it to another supervisor', async ({ page, request }) => {
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: S.plate, complaint: 'Steering pulls to the left' });
  S.number = await jobNumber(page);

  await test.step('a second open Job Card for the same vehicle is refused', async () => {
    await page.goto('/workshop/job-cards');
    const form = jcForm(page, 'Open Job Card');
    await form.getByPlaceholder('Search by name, email, or phone…').fill('Ada Customer');
    await page.getByRole('option', { name: /Ada Customer/ }).first().click();
    const vehicle = form.locator('select[name="vehicleId"]');
    await vehicle.selectOption((await vehicle.locator('option', { hasText: S.plate }).first().getAttribute('value'))!);
    await form.locator('select[name="supervisorId"]').selectOption({ label: who('workshop-supervisor').name });
    await form.locator('input[name="complaints"]').first().fill('Duplicate attempt');
    await form.getByRole('button', { name: 'Open Job Card' }).click();
    await page.waitForURL(/\/workshop\/job-cards\?error=/);
    await expect(page.getByText(/already has an open Job Card/)).toBeVisible();
  });

  await as(page, 'workshop-supervisor');
  await page.goto(S.url);
  const review = page.locator('#review-approval');
  await review.locator('input[name="reason"]').fill('Fully booked this week');
  await review.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected — Fully booked this week').first()).toBeVisible();
  await latestMail(request, who('receptionist').email, new RegExp(`Job Card ${S.number} returned for correction`));

  await as(page, 'receptionist');
  await page.goto(S.url);
  const reassign = jcForm(page, 'Reassign');
  await expect(page.getByRole('heading', { name: 'Reassign supervisor' })).toBeVisible();
  await reassign.locator('select[name="supervisorId"]').selectOption({ label: SUPERMANAGER.name });
  await reassign.getByRole('button', { name: 'Reassign' }).click();
  await expect(page.getByText('Awaiting Supervisor Approval').first()).toBeVisible();
  expectNoUrlError(page);

  await as(page, SUPERMANAGER);
  await page.goto(S.url);
  await page.locator('#review-approval').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(`Approved by ${SUPERMANAGER.name}`)).toBeVisible();
});

test('a technician turns the assignment down; it is reassigned and accepted', async ({ page }) => {
  await as(page, SUPERMANAGER);
  await page.goto(S.url);
  await assignTechnician(page);

  await as(page, 'technician');
  await page.goto(S.url);
  const respond = page.locator('#technician-response');
  await respond.locator('input[name="reason"]').fill('On leave tomorrow');
  await respond.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('#technician-response')).toHaveCount(0);
  // The assignment is handed back (the reason is kept on the trail).
  await expect(page.getByText('Assigned technician').locator('..')).toContainText('Unassigned');
  const trail = page.getByRole('heading', { name: 'Audit trail' }).locator('..');
  await expect(trail).toContainText('Technician rejected assignment');
  await expect(trail).toContainText('Reason: On leave tomorrow');

  await as(page, SUPERMANAGER);
  await page.goto(S.url);
  await assignTechnician(page);
  await as(page, 'technician');
  await page.goto(S.url);
  await page.locator('#technician-response').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('#technician-response')).toHaveCount(0);
});

test('the Manager sends the estimate back for changes; the supervisor fixes and re-approves', async ({ page }) => {
  await as(page, SUPERMANAGER);
  await page.goto(S.url);
  await addLine(page, { type: 'LABOUR', description: 'Wheel alignment', price: 12000 });
  await submitEstimate(page);
  await supervisorApprovesEstimate(page);

  await as(page, 'workshop-manager');
  await page.goto(S.url);
  await page.getByText('Needs changes? Send it back to the supervisor…').click();
  const back = jcForm(page, 'Send back');
  await back.locator('input[name="reason"]').fill('Add the tyre rotation as agreed');
  await back.getByRole('button', { name: 'Send back' }).click();
  await waitOutcome(page, /status=estimate_returned/);
  await expect(page.getByText(/Sent back to the supervisor/)).toBeVisible();
  await expect(card(page, 'Estimate')).toContainText('Awaiting supervisor validation');
  await expect(page.getByRole('button', { name: 'Approve as Manager' })).toHaveCount(0);

  await as(page, SUPERMANAGER);
  await page.goto(S.url);
  // The supervisor can correct a submitted estimate.
  await card(page, 'Estimate').getByRole('link', { name: 'Edit' }).first().click();
  const edit = page.locator('form').filter({ has: page.locator('input[name="lineItemId"]') });
  await edit.locator('input[name="description"]').fill('Wheel alignment and tyre rotation');
  await edit.locator('input[name="unitPrice"]').fill('15000');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Estimate').getByRole('cell', { name: 'Wheel alignment and tyre rotation' })).toBeVisible();
  await expect(page.getByText('Total Estimate').locator('..')).toContainText('₦15,000.00');
  await supervisorApprovesEstimate(page);

  await as(page, 'workshop-manager');
  await page.goto(S.url);
  await page.getByRole('button', { name: 'Approve as Manager' }).click();
  await expect(page.getByRole('button', { name: 'Approve as Manager' })).toHaveCount(0);
  expectNoUrlError(page);
});

test('a cancellation request can be declined; the Job Card carries on', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto(S.url);
  const req = jcForm(page, 'Request cancellation');
  await req.locator('textarea[name="reason"]').fill('Customer unsure about the cost');
  await req.getByRole('button', { name: 'Request cancellation' }).click();
  await expect(card(page, 'Cancellation history')).toContainText('Awaiting Manager Decision');

  await as(page, 'workshop-manager');
  await page.goto(S.url);
  const box = page.locator('#cancellation-request');
  await box.locator('form').filter({ has: page.getByRole('button', { name: 'Decline' }) }).locator('input[name="decisionNotes"]').fill('Customer confirmed by phone — go ahead');
  await box.getByRole('button', { name: 'Decline' }).click();
  await expect(card(page, 'Cancellation history')).toContainText('Declined');
  await expect(card(page, 'Cancellation history')).toContainText('Customer confirmed by phone — go ahead');
  await expect(page.locator('#status-panel')).not.toContainText('Cancelled');

  // The front desk can ask again later (the declined request is history).
  await as(page, 'receptionist');
  await page.goto(S.url);
  await expect(page.getByRole('button', { name: 'Request cancellation' })).toBeVisible();
});
