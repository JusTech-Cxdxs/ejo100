import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_ORG_ADMIN, OTHER_PORTAL_CUSTOMER, SWITCH_CUSTOMER, who } from './people';
import { as, bellText, signIn, signOut, latestMail, linkIn, uniq, urlOrExplain } from './helpers';
import { WEB, customerSignedIn, portal, submitSignIn, websiteUp } from './customer';
import { resetCustomerAccount } from './db';
import { publishBroadcast } from './workflows';

/**
 * Customers (CRM): the hub, the customer 360 page, registering (primary
 * address and phone required, a set-password link — never a password — that
 * the customer uses on the website to sign in), editing with an audit trail,
 * notes, sending a set-password link, switching portal access off (the
 * customer is out at once) and on, a broadcast to all customers (seen on the
 * customer portal, never by staff), and the fences (role and organisation).
 */
const websiteRunning = async (request: Parameters<typeof websiteUp>[0]) => {
  const up = await websiteUp(request);
  if (process.env.CI) expect(up, `the website (customer portal) must be running at ${WEB}`).toBe(true);
  return up;
};

/** Set a password from an emailed link on the website; ends on the sign-in page with "reset=done". */
async function setPasswordFromLink(page: Page, link: string, password: string) {
  expect(link.startsWith(WEB), `the link points at the customer portal (${link})`).toBe(true);
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Set your password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Type it again', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set password' }).click();
  await urlOrExplain(page, /\/customer-portal\?reset=done/);
}

/** A customer's CRM page, found through the hub's search. */
async function openCustomer(page: Page, name: string): Promise<string> {
  await page.goto(`/crm?q=${encodeURIComponent(name)}`);
  await page.getByRole('list', { name: 'Customers' }).getByRole('link', { name }).first().click();
  await page.waitForURL(/\/crm\/customers\/[^/?]+/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return new URL(page.url()).pathname;
}

test('register: primary phone and address are required — by the form and by the server', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto('/crm?register=1');
  const form = page.locator('#register');
  await form.getByLabel('Full name').fill('Nkem Noaddress');
  await form.getByLabel('Email').fill(`crm.noaddress.${uniq().toLowerCase()}@e2e.test`);
  await form.getByRole('button', { name: 'Register customer' }).click();
  // The browser refuses first…
  for (const label of ['Primary phone', 'Primary address']) {
    expect(await form.getByLabel(label).evaluate((el) => (el as HTMLInputElement).validity.valueMissing), `${label} is required`).toBe(true);
  }
  // …and the server refuses too, if the browser's check is bypassed.
  await form.locator('form').first().evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
  await form.getByRole('button', { name: 'Register customer' }).click();
  await expect(form.getByRole('alert')).toContainText('Not registered');
  await expect(page).not.toHaveURL(/\/crm\/customers\//);
});

test('register a customer: welcome email with a set-password link (no password); they set it on the website and sign in', async ({ page, request }) => {
  const email = `crm.customer.${Date.now()}@e2e.test`;
  await as(page, 'receptionist');
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
  const link = linkIn(mail.html, /\/customer-portal\/reset-password\?token=/);

  if (!(await websiteRunning(request))) return;
  const password = `Welcome-${uniq()}-Pw!`;
  await setPasswordFromLink(page, link, password);
  await customerSignedIn(page, { email, name: 'Chidi Newcustomer', password });
});

test.describe('portal access, from the front desk', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => { await resetCustomerAccount(SWITCH_CUSTOMER.email, SWITCH_CUSTOMER.password); });
  const S = { url: '', password: SWITCH_CUSTOMER.password };

  test('"Send set-password link": the email arrives; the customer sets a password and signs in', async ({ page, request }) => {
    await as(page, 'receptionist');
    S.url = await openCustomer(page, SWITCH_CUSTOMER.name);
    await page.getByRole('button', { name: 'Send set-password link' }).click();
    await urlOrExplain(page, /status=link_sent/);
    await expect(page.getByText('Set-password link sent').first()).toBeVisible();
    const mail = await latestMail(request, SWITCH_CUSTOMER.email, /set your customer portal password/);
    const link = linkIn(mail.html, /\/customer-portal\/reset-password\?token=/);
    if (!(await websiteRunning(request))) return;
    S.password = `Link-${uniq()}-Pw!`;
    await setPasswordFromLink(page, link, S.password);
    await customerSignedIn(page, SWITCH_CUSTOMER, S.password);
  });

  test('switching portal access off signs the customer out at once; switching it on lets them back in', async ({ page, browser, request }) => {
    test.skip(!S.url, 'needs the customer page from the previous step');
    const up = await websiteRunning(request);
    const other = await browser.newContext();
    const customer = await other.newPage();
    if (up) await customerSignedIn(customer, SWITCH_CUSTOMER, S.password);

    await as(page, 'receptionist');
    await page.goto(S.url);
    await page.getByText('Switch portal access off…').click();
    await page.getByRole('textbox', { name: 'Reason for switching off' }).fill('Asked to close the account (E2E)');
    await page.getByRole('button', { name: 'Switch off and sign out' }).click();
    await urlOrExplain(page, /status=access_off/);
    await expect(page.getByText('Portal access switched off').first()).toBeVisible();

    if (up) {
      await test.step('the customer is out on their next click, and cannot sign back in', async () => {
        await customer.goto(portal('/dashboard/services'));
        await urlOrExplain(customer, /\/customer-portal\?error=(inactive|expired)/);
        await submitSignIn(customer, SWITCH_CUSTOMER.email, S.password);
        await expect(customer.getByTestId('customer-sign-in-form').getByRole('alert')).toBeVisible();
        await expect(customer).not.toHaveURL(/\/customer-portal\/dashboard/);
      });
    }

    await page.getByText('Switch portal access on…').click();
    await page.getByRole('button', { name: 'Switch on' }).click();
    await urlOrExplain(page, /status=access_on/);
    await expect(page.getByText('Portal access switched on').first()).toBeVisible();
    if (up) await customerSignedIn(customer, SWITCH_CUSTOMER, S.password);
    await other.close();
  });
});

test('a broadcast to all customers reaches the customer portal — and never the staff', async ({ page, request }) => {
  const title = `Customer notice ${uniq()}`;
  await as(page, 'administrator');
  await publishBroadcast(page, { category: /Important/, title, message: 'Our workshop closes early on Friday.', audience: 'CUSTOMERS_ALL', email: false });

  await test.step('staff never see it', async () => {
    await as(page, 'technician');
    await page.goto('/notifications?tab=broadcasts');
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
    expect(await bellText(page)).not.toContain(title);
  });

  if (!(await websiteRunning(request))) return;
  await test.step('a customer sees it in their notifications', async () => {
    await customerSignedIn(page, OTHER_PORTAL_CUSTOMER);
    await page.goto(portal('/dashboard/notifications'));
    await expect(page.getByTestId('notification-list')).toContainText(title);
  });
});

test.describe('Ada, a long-standing customer', () => {
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
});
