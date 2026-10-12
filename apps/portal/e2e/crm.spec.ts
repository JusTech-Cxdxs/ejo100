import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_ORG_ADMIN, who } from './people';
import { signIn, signOut, latestMail, linkIn } from './helpers';

/**
 * Customers (CRM): the hub, the customer 360 page, registering (primary
 * address and phone required, a set-password link — never a password),
 * editing with an audit trail, notes, and the fences (role and organisation).
 */
test.describe.configure({ mode: 'serial' });

let adaUrl = '';

async function openAda(page: Page) {
  await page.goto('/crm?q=Ada%20Customer');
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await page.getByRole('list', { name: 'Customers' }).getByRole('link', { name: 'Ada Customer' }).first().click();
  await page.waitForURL(/\/crm\/customers\/[^/?]+/);
  adaUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: 'Ada Customer' })).toBeVisible();
}

test('front desk: the hub, then Ada\'s 360 page with her vehicles', async ({ page }) => {
  await signIn(page, who('receptionist').email, E2E_PASSWORD);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers', exact: true })).toBeVisible();
  await openAda(page);
  await expect(page.getByText('Lifetime spend')).toBeVisible();
  await page.getByRole('navigation', { name: 'Customer sections' }).getByRole('link', { name: /Vehicles/ }).click();
  await expect(page.getByText('E2E-001-AA').first()).toBeVisible();
  await expect(page.getByText('E2E-002-BB').first()).toBeVisible();
  // The old address leads to the hub.
  await page.goto('/workshop/customers');
  await expect(page).toHaveURL(/\/crm/);
});

test('front desk: edit details (audited) and add a note', async ({ page }) => {
  test.skip(!adaUrl, 'needs Ada\'s page from the first step');
  await signIn(page, who('receptionist').email, E2E_PASSWORD);
  await page.goto(`${adaUrl}?edit=1`);
  const form = page.getByRole('form', { name: 'Edit customer' });
  await form.getByLabel('Second phone').fill('0809 555 0101');
  await form.getByLabel('Tags').fill('VIP, Fleet');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Changes saved' })).toBeVisible();
  await expect(page.getByText('0809 555 0101').first()).toBeVisible();

  await page.goto(`${adaUrl}?tab=notes`);
  await page.getByLabel('New note').fill('Prefers calls after 4 pm.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Prefers calls after 4 pm.')).toBeVisible();

  await page.goto(`${adaUrl}?tab=activity`);
  await expect(page.getByText('Details updated').first()).toBeVisible();
  await expect(page.getByText(/Second phone: empty → 0809 555 0101/)).toBeVisible();
  await expect(page.getByText('Note added').first()).toBeVisible();
});

test('front desk: register a customer — welcome email with a set-password link, no password', async ({ page, request }) => {
  const email = `crm.customer.${Date.now()}@e2e.test`;
  await signIn(page, who('receptionist').email, E2E_PASSWORD);
  await page.goto('/crm?register=1');
  const form = page.locator('#register');
  await form.getByLabel('Full name').fill('Chidi Newcustomer');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Primary phone').fill('0803 111 2222');
  await form.getByLabel('Primary address').fill('12 Allen Avenue, Ikeja');
  await form.getByRole('button', { name: 'Register customer' }).click();
  await page.waitForURL(/\/crm\/customers\/[^/?]+\?status=registered/);
  await expect(page.getByRole('heading', { name: 'Chidi Newcustomer' })).toBeVisible();
  const mail = await latestMail(request, email, /Welcome/);
  expect(mail.html).toContain('Set my password');
  expect(mail.html).not.toMatch(/temporary password/i);
  linkIn(mail.html, /\/customer-portal\/reset-password\?token=/);
});

test('a supervisor sees customers but cannot edit; a technician cannot open the CRM', async ({ page }) => {
  test.skip(!adaUrl, 'needs Ada\'s page from the first step');
  await signIn(page, who('workshop-supervisor').email, E2E_PASSWORD);
  await page.goto(adaUrl);
  await expect(page.getByRole('heading', { name: 'Ada Customer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit details' })).toHaveCount(0);
  await signOut(page);
  await signIn(page, who('technician').email, E2E_PASSWORD);
  await page.goto('/crm');
  await expect(page).toHaveURL(/access-denied/);
});

test('another organisation can never open this customer', async ({ page }) => {
  test.skip(!adaUrl, 'needs Ada\'s page from the first step');
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  await page.goto(adaUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Plot 3, Isolo')).toHaveCount(0);
});
