import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, OTHER_ORG_ADMIN } from './people';
import { as, open, signIn, expectNoUrlError } from './helpers';
import { freshVehicle } from './db';
import { assignTechnician, expectStatus, jcForm, openJobCard, supervisorApproves, technicianAccepts } from './workflows';

/**
 * A Job Card across roles, the way the workshop really works:
 * front desk opens it → a second Job Card for the same vehicle is refused →
 * supervisor approves and assigns → technician accepts → front desk asks to
 * cancel → the Manager approves → it is cancelled. And another organisation
 * can never open it.
 *
 * Each run (and each retry) uses its own new vehicle, so a retry never meets
 * the Job Card a failed attempt left open.
 */
test.describe.configure({ mode: 'serial' });

const S = { plate: '', url: '' };

test.beforeAll(async () => {
  S.plate = (await freshVehicle('WSP')).plate;
});

test('front desk opens a Job Card', async ({ page }) => {
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: S.plate, complaint: 'Brakes squeal when stopping' });
  await expect(page.getByText(S.plate).first()).toBeVisible();
});

test('a second open Job Card for the same vehicle is refused', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto('/workshop/job-cards');
  const form = jcForm(page, 'Open Job Card');
  await form.getByPlaceholder('Search by name, email, or phone…').fill('Ada Customer');
  await page.getByRole('option', { name: /Ada Customer/ }).first().click();
  const vehicle = form.locator('select[name="vehicleId"]');
  await expect(vehicle.locator('option', { hasText: S.plate })).toHaveCount(1);
  await vehicle.selectOption((await vehicle.locator('option', { hasText: S.plate }).first().getAttribute('value'))!);
  await form.locator('select[name="supervisorId"]').selectOption({ index: 1 });
  await form.locator('input[name="mileageAtCheckIn"]').fill('50200');
  await form.locator('input[name="complaints"]').first().fill('Second visit, same vehicle');
  await form.getByRole('button', { name: 'Open Job Card' }).click();
  await page.waitForURL(/\/workshop\/job-cards\?error=/);
  await expect(page.getByText(/already has an open Job Card/)).toBeVisible();
});

test('supervisor approves and assigns; technician accepts', async ({ page }) => {
  await supervisorApproves(page, S.url);
  await assignTechnician(page);
  await technicianAccepts(page, S.url);
});

test('another organisation can never open this Job Card', async ({ page }) => {
  await page.goto('about:blank');
  await page.context().clearCookies();
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  await page.goto(S.url);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Brakes squeal')).toHaveCount(0);
});

test('cancellation: front desk asks, the Manager approves', async ({ page }) => {
  await as(page, 'receptionist');
  await open(page, S.url);
  const req = jcForm(page, 'Request cancellation');
  await req.locator('textarea[name="reason"]').fill('Customer called to cancel');
  await req.getByRole('button', { name: 'Request cancellation' }).click();
  await expect(page.getByRole('button', { name: 'Request cancellation' })).toHaveCount(0);

  await as(page, 'workshop-manager');
  await open(page, S.url);
  const box = page.locator('#cancellation-request');
  await expect(box).toContainText('Customer called to cancel');
  await box.getByRole('button', { name: 'Approve cancellation' }).click();
  await expectStatus(page, 'Cancelled');
  expectNoUrlError(page);
});
