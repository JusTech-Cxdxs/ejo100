/**
 * The customer portal (apps/website) from a customer's side: its address,
 * signing in and out. Shared by the customer-portal and CRM specs.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { urlOrExplain } from './helpers';

export const WEB = process.env.E2E_WEBSITE_URL ?? 'http://localhost:3002';
export const portal = (path = '') => `${WEB}/customer-portal${path}`;
export type Customer = { email: string; name: string; password: string };
export const firstName = (c: Customer) => c.name.split(' ')[0]!;

/** True when the website answers. In CI it must (the customer portal is part of the product). */
export async function websiteUp(request: APIRequestContext): Promise<boolean> {
  return request.get(portal(), { timeout: 10_000 }).then((r) => r.status() < 500).catch(() => false);
}

/** Fill and send the sign-in form (whatever the outcome). */
export async function submitSignIn(page: Page, email: string, password: string) {
  const form = page.getByTestId('customer-sign-in-form');
  await expect(form).toBeVisible();
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
}

/** Signed in and on the overview. */
export async function customerSignedIn(page: Page, c: Customer, password = c.password) {
  await page.goto(portal());
  await submitSignIn(page, c.email, password);
  await urlOrExplain(page, /\/customer-portal\/dashboard/);
  await expect(page.getByRole('heading', { level: 1, name: `Welcome back, ${firstName(c)}` })).toBeVisible();
}

export async function customerSignOut(page: Page) {
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(/\/customer-portal\?error=signed_out/);
}
