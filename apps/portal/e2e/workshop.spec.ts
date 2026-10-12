import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_ORG_ADMIN, who } from './people';
import { signIn, signOut } from './helpers';

/**
 * A Job Card across roles, the way the workshop really works:
 * front desk opens it → supervisor approves and assigns → technician accepts
 * → a second Job Card for the same vehicle is refused → front desk asks to
 * cancel → the Manager approves → it is cancelled. And another organisation
 * can never open it.
 */
test.describe.configure({ mode: 'serial' });

let jobUrl = '';

async function openJobCard(page: Page, plate: string) {
  await page.goto('/workshop/job-cards');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Open Job Card' }) });
  await form.getByPlaceholder('Search by name, email, or phone…').fill('Ada Customer');
  await page.getByRole('option', { name: /Ada Customer/ }).first().click();
  const vehicle = form.locator('select[name="vehicleId"]');
  await expect(vehicle).toBeVisible();
  const value = await vehicle.locator('option', { hasText: plate }).first().getAttribute('value');
  await vehicle.selectOption(value!);
  const supervisor = form.locator('select[name="supervisorId"]');
  await expect(supervisor).toBeVisible();
  await supervisor.selectOption({ label: who('workshop-supervisor').name });
  await form.locator('input[name="mileageAtCheckIn"]').fill('42100');
  await form.locator('input[name="complaints"]').first().fill('Brakes squeal when stopping');
  await form.getByRole('button', { name: 'Open Job Card' }).click();
}

test('front desk opens a Job Card', async ({ page }) => {
  await signIn(page, who('receptionist').email, E2E_PASSWORD);
  await openJobCard(page, 'E2E-001-AA');
  await page.waitForURL(/\/workshop\/job-cards\/[^/?]+\?status=job_card_created/);
  jobUrl = new URL(page.url()).pathname;
  await expect(page.getByText(/E2E-001-AA/).first()).toBeVisible();
});

test('a second open Job Card for the same vehicle is refused', async ({ page }) => {
  await signIn(page, who('receptionist').email, E2E_PASSWORD);
  await openJobCard(page, 'E2E-001-AA');
  await page.waitForURL(/\/workshop\/job-cards\?error=/);
  await expect(page.getByText(/already has an open Job Card/)).toBeVisible();
});

test('supervisor approves and assigns; technician accepts', async ({ page }) => {
  test.skip(!jobUrl, 'needs the Job Card from the first step');
  await signIn(page, who('workshop-supervisor').email, E2E_PASSWORD);
  await page.goto(jobUrl);
  await page.locator('#review-approval').getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('#review-approval')).toHaveCount(0);
  const assign = page.locator('form').filter({ has: page.locator('select[name="technicianId"]') });
  const tech = assign.locator('select[name="technicianId"]');
  const value = await tech.locator('option', { hasText: who('technician').name }).first().getAttribute('value');
  await tech.selectOption(value!);
  await assign.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByText(`Currently: ${who('technician').name}`)).toBeVisible();
  await signOut(page);

  await signIn(page, who('technician').email, E2E_PASSWORD);
  await page.goto(jobUrl);
  await page.locator('#technician-response').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('#technician-response')).toHaveCount(0);
});

test('another organisation can never open this Job Card', async ({ page }) => {
  test.skip(!jobUrl, 'needs the Job Card from the first step');
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  await page.goto(jobUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Brakes squeal')).toHaveCount(0);
});

test('cancellation: front desk asks, the Manager approves', async ({ page }) => {
  test.skip(!jobUrl, 'needs the Job Card from the first step');
  await signIn(page, who('receptionist').email, E2E_PASSWORD);
  await page.goto(jobUrl);
  const req = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request cancellation' }) });
  await req.locator('textarea[name="reason"]').fill('Customer called to cancel');
  await req.getByRole('button', { name: 'Request cancellation' }).click();
  await expect(page.getByRole('button', { name: 'Request cancellation' })).toHaveCount(0);
  await signOut(page);

  await signIn(page, who('workshop-manager').email, E2E_PASSWORD);
  await page.goto(jobUrl);
  await page.getByRole('button', { name: 'Approve cancellation' }).click();
  await expect(page.getByText('Cancelled').first()).toBeVisible();
});
