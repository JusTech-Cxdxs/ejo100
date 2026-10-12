import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, who } from './people';
import { signIn, latestMail, linkIn } from './helpers';

test.describe('Sign-in', () => {
  test('the sign-in page: wordmark, theme switch, password eye, security headers', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.headers()['x-frame-options']).toBe('SAMEORIGIN');
    expect(res?.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Chanrai Group').first()).toBeVisible();
    const pw = page.getByLabel('Password', { exact: true });
    await pw.fill('secret-value');
    await expect(pw).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(pw).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(pw).toHaveAttribute('type', 'password');
    // Theme: Light → Dark, remembered after reload.
    const toggle = page.getByRole('button', { name: /^Theme:/ });
    for (let i = 0; i < 3; i++) {
      if ((await page.locator('html').getAttribute('data-theme')) === 'dark') break;
      await toggle.click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('wrong password: a clear message, no account details revealed', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(who('technician').email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('don’t match');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a protected page sends you to sign in, then back to it', async ({ page }) => {
    await page.goto('/workshop');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fworkshop/);
    await page.getByLabel('Work email').fill(who('receptionist').email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/workshop/);
  });

  test('forgot password: email arrives, link sets a new password once, old link is dead', async ({ page, request }) => {
    const email = who('calendar-user').email;
    await page.goto('/forgot-password');
    await page.getByLabel('Work email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists')).toBeVisible();
    const mail = await latestMail(request, email, /new EJO 100 password/);
    const link = linkIn(mail.html, /reset-password/);
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
    const fresh = 'New-Reset-Pass-2026!';
    await page.getByLabel('New password').fill(fresh);
    await page.getByLabel('Type it again').fill(fresh);
    await page.getByRole('button', { name: 'Set password' }).click();
    await page.waitForURL(/\/login\?reset=done/);
    await signIn(page, email, fresh);
    // The same link a second time: refused, with a way forward.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible();
  });

  test('forgot password for an unknown email reads exactly the same', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Work email').fill('nobody-here@e2e.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists')).toBeVisible();
  });

  test('the live check refuses anyone signed out', async ({ request }) => {
    const res = await request.get('/api/live/pulse', { maxRedirects: 0 });
    expect([307, 308, 401]).toContain(res.status());
  });
});
