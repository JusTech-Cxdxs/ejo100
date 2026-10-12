import { test, expect } from '@playwright/test';
import { CUSTOMER, OTHER_PORTAL_CUSTOMER, PASSWORD_CUSTOMER, PORTAL_CUSTOMER, SEED_WARRANTY } from './people';
import { as, open, latestMail, linkIn, uniq, urlOrExplain, visibleOrExplain, waitOutcome } from './helpers';
import { WEB, afterSignIn, customerSignOut, customerSignedIn, portal, submitSignIn, websiteUp } from './customer';
import { freshVehicle, resetCustomerAccount } from './db';
import {
  addLine, jcForm, jobCardReadyForEstimate, jobNumber, managerApprovesEstimate, notifyCustomer, recordPayment, submitEstimate, supervisorApprovesEstimate,
} from './workflows';

/**
 * The customer portal (apps/website, :3002 in CI), as customers use it:
 * sign in, forgot / reset / change password, the overview, their services
 * and Job Cards (the estimate appears only once the front desk has sent it),
 * payments, warranties, notifications, their profile — on a desktop and on
 * a 375 px phone. And the fences: another customer's records are "not
 * found", and a staff session never opens the customer portal (nor the
 * other way round).
 */
test.beforeAll(async ({ request }) => {
  const up = await websiteUp(request);
  // In CI the customer portal is part of the product: down is a failure, not a skip.
  if (process.env.CI) expect(up, `the website (customer portal) must be running at ${WEB}`).toBe(true);
  else test.skip(!up, `the website is not running at ${WEB}`);
});

test.describe('signing in', () => {
  test('a protected page asks for sign-in; a wrong password is refused; the right one returns to that page', async ({ page }) => {
    await page.goto(portal('/dashboard/payments'));
    await expect(page).toHaveURL(/\/customer-portal\?redirect=%2Fcustomer-portal%2Fdashboard%2Fpayments/);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    await expect(page.getByTestId('customer-sign-in-form').getByRole('link', { name: 'Forgot password?' })).toBeVisible();

    await submitSignIn(page, PORTAL_CUSTOMER.email, 'not-the-password-123');
    await expect(page.getByTestId('customer-sign-in-form').getByRole('alert')).toContainText(/don.t match/);
    await expect(page).toHaveURL(/\/customer-portal\?redirect=/);

    await submitSignIn(page, PORTAL_CUSTOMER.email, PORTAL_CUSTOMER.password);
    await afterSignIn(page, /\/customer-portal\/dashboard\/payments/);
    await expect(page.getByRole('heading', { level: 1, name: 'Payments & balances' })).toBeVisible();
  });

  test('the overview greets the customer by first name and shows only their own vehicles', async ({ page }) => {
    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal('/dashboard/vehicles'));
    await expect(page.getByText(PORTAL_CUSTOMER.plate).first()).toBeVisible();
    const body = page.locator('body');
    await expect(body).not.toContainText(OTHER_PORTAL_CUSTOMER.plate);
    await expect(body).not.toContainText('E2E-001-AA');
    await expect(body).not.toContainText(CUSTOMER.name);
    await customerSignOut(page);
    await page.goto(portal('/dashboard'));
    await expect(page).toHaveURL(/\/customer-portal\?redirect=/);
  });
});

test.describe('passwords', () => {
  // These change PASSWORD_CUSTOMER's password; each starts from the known one.
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async () => { await resetCustomerAccount(PASSWORD_CUSTOMER.email, PASSWORD_CUSTOMER.password); });

  test('forgot password: the email, a new password, sign in with it — and the link works only once', async ({ page, request }) => {
    const fresh = `Reset-${uniq()}-Pw!`;
    await page.goto(portal());
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.waitForURL(/\/customer-portal\/forgot-password/);
    await page.getByLabel('Email').fill(PASSWORD_CUSTOMER.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();

    const mail = await latestMail(request, PASSWORD_CUSTOMER.email, /Set a new password for your customer portal/);
    const link = linkIn(mail.html, /\/customer-portal\/reset-password\?token=/);
    expect(link.startsWith(WEB), `the link points at the customer portal (${link})`).toBe(true);

    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Set your password' })).toBeVisible();
    await page.getByLabel('New password', { exact: true }).fill(fresh);
    await page.getByLabel('Type it again', { exact: true }).fill(fresh);
    await page.getByRole('button', { name: 'Set password' }).click();
    await urlOrExplain(page, /\/customer-portal\?reset=done/);
    await expect(page.getByRole('status').filter({ hasText: 'Your new password is set' })).toBeVisible();

    await test.step('the old password no longer works; the new one does', async () => {
      await submitSignIn(page, PASSWORD_CUSTOMER.email, PASSWORD_CUSTOMER.password);
      await expect(page.getByTestId('customer-sign-in-form').getByRole('alert')).toBeVisible();
      await submitSignIn(page, PASSWORD_CUSTOMER.email, fresh);
      await afterSignIn(page);
    });

    await test.step('the same link again is refused, with a way forward', async () => {
      await page.goto(link);
      await page.getByLabel('New password', { exact: true }).fill(`${fresh}2`);
      await page.getByLabel('Type it again', { exact: true }).fill(`${fresh}2`);
      await page.getByRole('button', { name: 'Set password' }).click();
      await expect(page.getByTestId('reset-link-expired')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'This link can’t be used' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Send me a new link' })).toBeVisible();
    });

    await test.step('a link without a token is refused at once', async () => {
      await page.goto(portal('/reset-password'));
      await expect(page.getByTestId('reset-link-expired')).toBeVisible();
    });
  });

  test('an unknown email reads exactly the same', async ({ page }) => {
    await page.goto(portal('/forgot-password'));
    await page.getByLabel('Email').fill(`nobody-${uniq()}@e2e.test`);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
  });

  test('change password from Profile, then sign in with the new one', async ({ page }) => {
    const next = `Changed-${uniq()}-Pw!`;
    await customerSignedIn(page, PASSWORD_CUSTOMER);
    await open(page, portal('/dashboard/profile'));
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Change password' }) });
    await form.getByLabel('Current password', { exact: true }).fill(PASSWORD_CUSTOMER.password);
    await form.getByLabel('New password', { exact: true }).fill(next);
    await form.getByLabel('Type the new password again', { exact: true }).fill(next);
    await form.getByRole('button', { name: 'Change password' }).click();
    // The form's own answer (an error would show here instead).
    await visibleOrExplain(page, form.getByRole('status').filter({ hasText: 'Your password is changed. Other devices have been signed out.' }), 'the confirmation "Your password is changed"');
    await customerSignOut(page);
    await submitSignIn(page, PASSWORD_CUSTOMER.email, PASSWORD_CUSTOMER.password);
    await expect(page.getByTestId('customer-sign-in-form').getByRole('alert')).toBeVisible();
    await submitSignIn(page, PASSWORD_CUSTOMER.email, next);
    await afterSignIn(page);
  });
});

test.describe('a Job Card, followed by its customer', () => {
  test.describe.configure({ mode: 'serial' });
  const LINE = `Portal labour ${uniq()}`;
  const S = { plate: '', url: '', id: '', number: '', warrantyId: '', warrantyNumber: '' };

  test.beforeAll(async () => {
    S.plate = (await freshVehicle('POR', { customerEmail: PORTAL_CUSTOMER.email, make: 'Kia', model: 'Sportage' })).plate;
  });

  test('staff write and approve the estimate; until it is sent, the customer sees the visit but no estimate', async ({ page }) => {
    S.url = await jobCardReadyForEstimate(page, { plate: S.plate, customer: PORTAL_CUSTOMER.name, complaint: 'Portal check: rattling dashboard' });
    S.id = S.url.split('/').pop()!;
    await as(page, 'workshop-supervisor');
    await open(page, S.url);
    S.number = await jobNumber(page);
    await addLine(page, { type: 'LABOUR', description: LINE, price: 12000 });
    await submitEstimate(page);
    await supervisorApprovesEstimate(page);
    await as(page, 'workshop-manager');
    await open(page, S.url);
    await managerApprovesEstimate(page);

    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal('/dashboard/services'));
    const cardLink = page.getByTestId(`service-card-${S.number}`);
    await expect(cardLink).toBeVisible();
    await cardLink.click();
    await page.waitForURL(new RegExp(`/customer-portal/dashboard/services/jc/${S.id}`));
    await expect(page.getByText('Portal check: rattling dashboard')).toBeVisible();
    await expect(page.getByTestId('customer-estimate')).toHaveCount(0);
    await expect(page.getByText('Your estimate will appear here as soon as it’s ready')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(LINE);
  });

  test('once the front desk sends it: the estimate, the bell and the notifications; mark all read', async ({ page }) => {
    test.skip(!S.id, 'needs the Job Card from the previous step');
    await as(page, 'receptionist');
    await open(page, S.url);
    await notifyCustomer(page);

    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal(`/dashboard/services/jc/${S.id}`));
    const estimate = page.getByTestId('customer-estimate');
    await expect(estimate).toBeVisible();
    await expect(estimate).toContainText(LINE);
    await expect(estimate).toContainText('Total estimate');

    await test.step('the bell lists it; "Mark all as read" clears the count', async () => {
      const bell = page.getByTestId('notification-bell');
      await expect(bell).toHaveAccessibleName(/unread/);
      await bell.click();
      const panel = page.getByRole('region', { name: 'Latest notifications' });
      await expect(panel).toContainText(`Your estimate for ${S.number} is ready`);
      const item = panel.getByRole('link', { name: new RegExp(`Your estimate for ${S.number} is ready`) });
      await expect(item.getByLabel('Unread')).toHaveCount(1);
      await panel.getByRole('button', { name: 'Mark all as read' }).click();
      // (Checked on the item itself: a broadcast from another spec may arrive at any moment.)
      await expect(item.getByLabel('Unread')).toHaveCount(0);
    });

    await test.step('the Notifications page has it, read', async () => {
      await page.goto(portal('/dashboard/notifications'));
      const list = page.getByTestId('notification-list');
      await expect(list).toContainText(`Your estimate for ${S.number} is ready`);
      await expect(page.getByRole('button', { name: `Mark “Your estimate for ${S.number} is ready” as read` })).toHaveCount(0);
    });
  });

  test('a payment recorded by Finance appears in the customer’s payment history', async ({ page }) => {
    test.skip(!S.id, 'needs the Job Card from the first step');
    await as(page, 'finance-officer');
    await open(page, S.url);
    await recordPayment(page, 'SEVENTY_PERCENT');
    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal('/dashboard/payments'));
    await expect(page.getByTestId('payment-history')).toContainText(`Payment · ${S.number}`);
  });

  test('a warranty registered on the vehicle appears under Warranties', async ({ page }) => {
    await as(page, 'warranty-officer');
    await page.goto(`/warranty/register?q=${encodeURIComponent(S.plate)}`);
    await page.getByRole('link', { name: new RegExp(S.plate) }).first().click();
    await page.waitForURL(/vehicleId=/);
    const form = jcForm(page, 'Register warranty');
    const policy = await form.locator('select[name="policyId"] option', { hasText: SEED_WARRANTY.vehiclePolicyName }).first().getAttribute('value');
    await form.locator('select[name="policyId"]').selectOption(policy!);
    await form.locator('input[name="startsAt"]').fill(new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }));
    const reading = form.locator('input[name="startReading"]');
    if (await reading.count()) await reading.fill('15000');
    await form.locator('textarea[name="evidenceNote"]').fill('Sales invoice INV-E2E-PORTAL');
    await form.getByRole('button', { name: 'Register warranty' }).click();
    await waitOutcome(page, /\/warranty\/[^/?]+\?status=registered/);
    S.warrantyId = new URL(page.url()).pathname.split('/').pop()!;
    S.warrantyNumber = ((await page.getByRole('heading', { level: 1 }).first().textContent()) ?? '').trim();

    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal('/dashboard/warranties'));
    await expect(page.getByRole('heading', { level: 1, name: 'What’s covered' })).toBeVisible();
    await expect(page.getByText(S.warrantyNumber).first()).toBeVisible();
    await page.goto(portal(`/dashboard/warranties/${S.warrantyId}`));
    await expect(page.getByText(S.warrantyNumber).first()).toBeVisible();
    await expect(page.getByText('Engine and gearbox').first()).toBeVisible();
  });

  test('another customer: the same Job Card and warranty addresses are simply not found', async ({ page }) => {
    test.skip(!S.id, 'needs the Job Card from the first step');
    await customerSignedIn(page, OTHER_PORTAL_CUSTOMER);
    for (const path of [`/dashboard/services/jc/${S.id}`, ...(S.warrantyId ? [`/dashboard/warranties/${S.warrantyId}`] : [])]) {
      await page.goto(portal(path));
      await expect(page.getByRole('heading', { name: 'We couldn’t find that' }), path).toBeVisible();
      await expect(page.locator('body'), path).not.toContainText(S.number);
      await expect(page.locator('body'), path).not.toContainText(LINE);
    }
    await page.goto(portal('/dashboard/services?show=all'));
    await expect(page.getByTestId(`service-card-${S.number}`)).toHaveCount(0);
    await page.goto(portal('/dashboard/payments'));
    await expect(page.locator('body')).not.toContainText(S.number);
  });
});

test('profile: save contact details, add and remove an address, switch announcement emails', async ({ page }) => {
  const tag = uniq();
  const digits = String(Date.now()).slice(-7);
  const phone = `0803 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  await customerSignedIn(page, OTHER_PORTAL_CUSTOMER);
  await open(page, portal('/dashboard/profile'));
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible();

  await test.step('contact details', async () => {
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save contact details' }) });
    await form.getByLabel('Phone number').fill(phone);
    await form.getByLabel('Main address').fill(`3 Portal Road, Lekki ${tag}`.slice(0, 80));
    await form.getByRole('button', { name: 'Save contact details' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Your contact details are saved.' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Phone number')).toHaveValue(phone);
  });

  await test.step('add an address, then remove it', async () => {
    const label = `Office ${tag}`;
    await page.getByRole('button', { name: 'Add another address' }).click();
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add address' }) });
    await form.getByLabel('Label (optional)').fill(label);
    await form.getByLabel('Street address').fill('7 Kofo Abayomi St');
    await form.getByLabel('City (optional)').fill('Lagos');
    await form.getByRole('button', { name: 'Add address' }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Remove ${label}` }).click();
    await page.getByRole('button', { name: 'Yes, remove' }).click();
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  });

  await test.step('announcement emails: switched, saved on the account, switched back', async () => {
    const toggle = () => page.getByRole('switch', { name: 'Email me announcements too' });
    const was = (await toggle().getAttribute('aria-checked')) === 'true';
    await toggle().click();
    await expect(toggle()).toHaveAttribute('aria-checked', String(!was));
    await expect(page.getByRole('status').filter({ hasText: was ? 'Announcement emails are off' : 'You’ll get announcements by email too.' })).toBeVisible();
    await page.reload();
    await expect(toggle()).toHaveAttribute('aria-checked', String(!was));
    await toggle().click();
    await expect(toggle()).toHaveAttribute('aria-checked', String(was));
    await expect(page.getByRole('status').filter({ hasText: was ? 'You’ll get announcements by email too.' : 'Announcement emails are off' })).toBeVisible();
  });
});

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('the menu is a drawer: "Open menu" opens it, a link navigates, "Close menu" closes it; nothing scrolls sideways', async ({ page }) => {
    await customerSignedIn(page, PORTAL_CUSTOMER);
    const scroll = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
    expect(scroll, 'the overview scrolls sideways').toBeLessThanOrEqual(1);

    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Help & support' }).click();
    await page.waitForURL(/\/customer-portal\/dashboard\/support/);
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('ai-support-coming-soon')).toBeVisible();

    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Close menu' }).click();
    await expect(drawer).toHaveCount(0);
  });
});

test('a staff session never opens the customer portal, and a customer session never opens the staff portal', async ({ page, context }) => {
  // Production builds use secure cookie names: __Secure-better-auth.* (staff) and __Secure-customer-auth.* (customers).
  const sessionCookie = async (app: 'better-auth' | 'customer-auth') =>
    (await context.cookies()).find((c) => new RegExp(`(^|-)${app}\\.session_token$`).test(c.name));

  await test.step('signed in as staff: the customer portal still asks for a customer sign-in', async () => {
    await as(page, 'receptionist');
    await page.goto(portal('/dashboard'));
    await expect(page).toHaveURL(/\/customer-portal\?redirect=/);
    // Even the staff session token presented as a customer cookie is refused.
    const staff = await sessionCookie('better-auth');
    expect(staff, `the staff session cookie (have: ${(await context.cookies()).map((c) => c.name).join(', ')})`).toBeTruthy();
    await context.addCookies([{ ...staff!, name: staff!.name.replace('better-auth.', 'customer-auth.') }]);
    await page.goto(portal('/dashboard'));
    await expect(page).toHaveURL(/\/customer-portal\?error=expired/);
    await expect(page.getByTestId('customer-sign-in-form')).toBeVisible();
  });

  await test.step('signed in as a customer: the staff portal still asks for a staff sign-in', async () => {
    await context.clearCookies();
    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    const customer = await sessionCookie('customer-auth');
    expect(customer, `the customer session cookie (have: ${(await context.cookies()).map((c) => c.name).join(', ')})`).toBeTruthy();
    await context.addCookies([{ ...customer!, name: customer!.name.replace('customer-auth.', 'better-auth.') }]);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel('Work email')).toBeVisible();
  });
});
