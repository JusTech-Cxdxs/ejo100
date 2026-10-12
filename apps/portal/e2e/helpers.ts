import { expect, test, type Page, type APIRequestContext, type Locator } from '@playwright/test';
import { E2E_PASSWORD, who, type Person } from './people';

const MAIL = process.env.E2E_MAIL_URL ?? 'http://localhost:8025';

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);
}

/** Become someone else in the same browser: drop the session, sign in as them. */
export async function as(page: Page, roleOrPerson: string | Person) {
  const p = typeof roleOrPerson === 'string' ? who(roleOrPerson) : roleOrPerson;
  await test.step(`sign in as ${p.name} (${p.role})`, async () => {
    await page.context().clearCookies();
    await signIn(page, p.email, E2E_PASSWORD);
  });
}

/** A short unique tag for this run (names, plates, titles never collide between runs or retries). */
export function uniq(prefix = ''): string {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
}

/** Text that only ever appears when a page has failed. */
export const BROKEN_PAGE_TEXT = [
  'Something went wrong on this page',
  'EJO 100 is having a problem right now',
  'Application error',
  'Internal Server Error',
  'Unhandled Runtime Error',
  'This page could not be found',
];

/**
 * Watches every document (page) response for this page and fails the
 * test if any came back ≥ 500 — call once per page, right after creating it.
 */
export function watchServerErrors(page: Page): () => string[] {
  const bad: string[] = [];
  page.on('response', (res) => {
    if (res.request().resourceType() === 'document' && res.status() >= 500) bad.push(`${res.status()} ${res.url()}`);
  });
  return () => bad;
}

/** The page rendered: no error boundary, no Next error overlay, no raw server error. */
export async function expectHealthy(page: Page, where = page.url()) {
  const body = page.locator('body');
  for (const t of BROKEN_PAGE_TEXT) {
    await expect(body, `${where}: must not show "${t}"`).not.toContainText(t, { timeout: 1_000 });
  }
  await expect(page.locator('nextjs-portal'), `${where}: Next.js error overlay`).toHaveCount(0);
}

/** Open a page and check it rendered properly (status < 500, no error text). */
export async function visitHealthy(page: Page, url: string) {
  const res = await page.goto(url);
  expect(res?.status() ?? 0, `${url} answered ${res?.status()}`).toBeLessThan(500);
  await page.waitForLoadState('domcontentloaded');
  await expectHealthy(page, url);
}

/** The red error banner a server action redirects back with (?error=…). */
export function errorBanner(page: Page): Locator {
  return page.locator('div.mb-6.rounded-\\[var\\(--ejo-radius-md\\)\\].border').filter({ hasText: /./ }).first();
}

/** Where a server action put us back, with its ?error= message (or null). */
export function urlError(page: Page): string | null {
  return new URL(page.url()).searchParams.get('error');
}

/** Fails with the server's own message if the last action redirected with ?error=. */
export function expectNoUrlError(page: Page) {
  expect(urlError(page), 'the action reported an error').toBeNull();
}

/** Submit a form by its button and wait for the server action round-trip to settle. */
export async function submit(page: Page, button: Locator) {
  await button.click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** The bell's panel text (opens and closes it). */
export async function bellText(page: Page): Promise<string> {
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await bell.click();
  const panel = page.getByRole('link', { name: 'Open the Notification Center →' }).locator('..');
  await expect(panel).toBeVisible();
  const text = (await panel.textContent()) ?? '';
  await bell.click();
  return text;
}

/** Audit Logs (as whoever is signed in — an administrator) has at least one entry for `q`. */
export async function expectAuditEntry(page: Page, q: string, mustContain?: RegExp) {
  await page.goto(`/audit-logs?q=${encodeURIComponent(q)}`);
  await expect(page.getByRole('heading', { name: 'Audit Logs', level: 1 })).toBeVisible();
  await expect(page.getByText('Nothing matches.')).toHaveCount(0);
  const entries = page.locator('section li');
  expect(await entries.count(), `audit entries for ${q}`).toBeGreaterThan(0);
  if (mustContain) await expect(page.locator('section').first()).toContainText(mustContain);
}

/** On Hand / reserved figures from a part's page. */
export async function readStock(page: Page, partUrl: string): Promise<{ onHand: number; reserved: number }> {
  await page.goto(partUrl);
  const card = page.getByText('On Hand', { exact: true }).locator('..');
  await expect(card).toBeVisible();
  const text = (await card.textContent()) ?? '';
  const num = (s: string | undefined) => Number((s ?? '0').replace(/,/g, ''));
  const onHand = num(/On Hand\s*([\d,.]+)/.exec(text)?.[1]);
  const reserved = num(/([\d,.]+)\s*reserved/.exec(text)?.[1]);
  return { onHand, reserved };
}

type Mail = { id: string; subject: string; html: string; to: string[] };

/** The newest email to `to` (Mailpit), waiting up to `ms`. */
export async function latestMail(request: APIRequestContext, to: string, subject?: RegExp, ms = 20_000): Promise<Mail> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const res = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
    const list = ((await res.json()) as { messages?: { ID: string; Subject: string; Created: string; To?: { Address: string }[] }[] }).messages ?? [];
    const hit = list.filter((m) => !subject || subject.test(m.Subject)).sort((a, b) => +new Date(b.Created) - +new Date(a.Created))[0];
    if (hit) {
      const full = (await (await request.get(`${MAIL}/api/v1/message/${hit.ID}`)).json()) as { HTML: string; Subject: string; To?: { Address: string }[] };
      return { id: hit.ID, subject: full.Subject, html: full.HTML, to: (full.To ?? []).map((t) => t.Address) };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to}${subject ? ` matching ${subject}` : ''}`);
}

/** How many emails to `to` match `subject` right now (no waiting). */
export async function countMail(request: APIRequestContext, to: string, subject: RegExp): Promise<number> {
  const res = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=200`);
  const list = ((await res.json()) as { messages?: { Subject: string }[] }).messages ?? [];
  return list.filter((m) => subject.test(m.Subject)).length;
}

/** The first link in an email whose text or URL matches. */
export function linkIn(html: string, match: RegExp): string {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
  const hit = links.find((l) => match.test(l));
  expect(hit, `link matching ${match}`).toBeTruthy();
  return hit!;
}
