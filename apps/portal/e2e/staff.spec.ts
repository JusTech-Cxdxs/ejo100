import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, who } from './people';
import { signIn, signOut, latestMail, linkIn } from './helpers';

/**
 * The whole onboarding journey, for real: an administrator adds a person →
 * the welcome email arrives (employee ID, role, access, rules, link) → the
 * new person sets a password from the link → signs in → sees their profile.
 */
test('add a staff member, welcome email, set password, first sign-in', async ({ page, request }) => {
  const email = `new.starter.${Date.now()}@e2e.test`;
  await signIn(page, who('administrator').email, E2E_PASSWORD);
  await page.goto('/users/new');
  const form = page.locator('#add-staff');
  await form.getByLabel('Full name').fill('Nkechi Newstarter');
  await form.getByLabel('Work email').fill(email);
  await form.getByRole('textbox', { name: 'Branch' }).click();
  await page.getByRole('option').first().click();
  await form.getByRole('textbox', { name: 'First role' }).fill('Technician');
  await page.getByRole('option', { name: 'Technician' }).first().click();
  await form.getByRole('button', { name: 'Add and send the welcome email' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Staff member added' })).toBeVisible();
  const idText = (await page.getByRole('status').filter({ hasText: 'employee ID' }).textContent()) ?? '';
  const employeeId = /employee ID ([A-Z0-9]+-[A-Z0-9]+-\d{4})/.exec(idText)?.[1];
  expect(employeeId, 'an employee ID was issued').toMatch(/^[A-Z0-9]+-[A-Z0-9]+-\d{4}$/);
  await expect(page.getByRole('listitem', { name: 'Nkechi Newstarter' })).toContainText(employeeId!);

  const mail = await latestMail(request, email, /Welcome to EJO 100/);
  expect(mail.html).toContain(employeeId!);
  expect(mail.html).toContain('Technician');
  expect(mail.html).toContain('The rules');
  expect(mail.html).toContain('on work assigned to you');
  const link = linkIn(mail.html, /reset-password/);

  await signOut(page);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  const pw = 'Starter-Pass-2026!';
  await page.getByLabel('New password').fill(pw);
  await page.getByLabel('Type it again').fill(pw);
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.waitForURL(/\/login\?reset=done/);
  await signIn(page, email, pw);
  await page.goto('/profile');
  await expect(page.getByText(employeeId!)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What I can do' })).toBeVisible();
});

test('a duplicate email is refused and what was typed stays', async ({ page }) => {
  await signIn(page, who('administrator').email, E2E_PASSWORD);
  await page.goto('/users/new');
  const form = page.locator('#add-staff');
  await form.getByLabel('Full name').fill('Duplicate Person');
  await form.getByLabel('Work email').fill(who('technician').email);
  await form.getByRole('textbox', { name: 'Branch' }).click();
  await page.getByRole('option').first().click();
  await form.getByRole('button', { name: 'Add and send the welcome email' }).click();
  await expect(form.getByRole('alert')).toContainText('already has that email');
  await expect(form.getByLabel('Full name')).toHaveValue('Duplicate Person');
});

test('a technician cannot add staff, even by calling the page directly', async ({ page }) => {
  await signIn(page, who('technician').email, E2E_PASSWORD);
  await page.goto('/users');
  await expect(page).toHaveURL(/access-denied/);
});
