import { test, expect, type APIRequestContext } from '@playwright/test';
import { OTHER_PORTAL_CUSTOMER, who } from './people';
import { linkIn } from './helpers';
import { WEB, portal, websiteUp } from './customer';
import { db } from './db';

/**
 * Password links expire. A "forgot password" link lasts one hour (staff and
 * customers); the test makes a real link through the real email, checks it
 * was issued for an hour, then moves its expiry into the past in the test
 * database and opens it: refused, with a way forward. Nobody's password
 * changes here, so these accounts stay usable by the other specs.
 */

const MAIL = process.env.E2E_MAIL_URL ?? 'http://localhost:8025';

/** The newest email to `to` matching `subject` that arrived after `since`. */
async function mailAfter(request: APIRequestContext, to: string, subject: RegExp, since: number): Promise<string> {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const res = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=20`);
    const list = ((await res.json()) as { messages?: { ID: string; Subject: string; Created: string }[] }).messages ?? [];
    const hit = list.filter((m) => subject.test(m.Subject) && +new Date(m.Created) >= since - 2000).sort((a, b) => +new Date(b.Created) - +new Date(a.Created))[0];
    if (hit) return ((await (await request.get(`${MAIL}/api/v1/message/${hit.ID}`)).json()) as { HTML: string }).HTML;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No new email to ${to} matching ${subject}`);
}

const HOUR = 3_600_000;
const issuedForAnHour = (expiresAt: Date, requestedAt: number) => {
  const ms = expiresAt.getTime() - requestedAt;
  expect(ms, `link expiry ${Math.round(ms / 60000)} minutes after the request`).toBeGreaterThan(HOUR - 5 * 60_000);
  expect(ms).toBeLessThan(HOUR + 5 * 60_000);
};

test('staff: an expired "forgot password" link is refused, with a way forward', async ({ page, request }) => {
  const person = who('calendar-user');
  const since = Date.now();
  await page.goto('/forgot-password');
  await page.getByLabel('Work email').fill(person.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists')).toBeVisible();
  const link = linkIn(await mailAfter(request, person.email, /Reset your EJO 100 password/, since), /reset-password/);
  const token = /reset-password\/([^/?#]+)/.exec(link)?.[1];
  expect(token, `a token in ${link}`).toBeTruthy();

  const row = await db().verification.findFirstOrThrow({ where: { identifier: `reset-password:${token}` } });
  issuedForAnHour(row.expiresAt, since);
  const user = await db().user.findUniqueOrThrow({ where: { email: person.email }, select: { id: true } });
  expect(await db().verification.count({ where: { value: user.id, identifier: { startsWith: 'reset-password:' } } }), 'only the newest link exists').toBe(1);

  await db().verification.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible();
  await expect(page.getByText(/1 hour for “forgot password”, 72 hours for a welcome email/)).toBeVisible();
});

test('customer: an expired "forgot password" link is refused, with a way forward', async ({ page, request }) => {
  const up = await websiteUp(request);
  if (process.env.CI) expect(up, `the website (customer portal) must be running at ${WEB}`).toBe(true);
  else test.skip(!up, `the website is not running at ${WEB}`);

  const since = Date.now();
  await page.goto(portal('/forgot-password'));
  await page.getByLabel('Email').fill(OTHER_PORTAL_CUSTOMER.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
  const link = linkIn(await mailAfter(request, OTHER_PORTAL_CUSTOMER.email, /Reset your customer portal password/, since), /\/customer-portal\/reset-password\?token=/);
  const token = new URL(link).searchParams.get('token');
  expect(token).toBeTruthy();

  const row = await db().customerVerification.findFirstOrThrow({ where: { identifier: `reset-password:${token}` } });
  issuedForAnHour(row.expiresAt, since);
  const customer = await db().customer.findUniqueOrThrow({ where: { email: OTHER_PORTAL_CUSTOMER.email }, select: { id: true } });
  expect(await db().customerVerification.count({ where: { value: customer.id, identifier: { startsWith: 'reset-password:' } } }), 'only the newest link exists').toBe(1);

  await db().customerVerification.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await page.goto(link);
  const fresh = 'Never-Used-Pass-2026!';
  await page.getByLabel('New password', { exact: true }).fill(fresh);
  await page.getByLabel('Type it again', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByTestId('reset-link-expired')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send me a new link' })).toBeVisible();
});
