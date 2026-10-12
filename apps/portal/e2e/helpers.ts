import { expect, type Page, type APIRequestContext } from '@playwright/test';

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

type Mail = { id: string; subject: string; html: string };

/** The newest email to `to` (Mailpit), waiting up to `ms`. */
export async function latestMail(request: APIRequestContext, to: string, subject?: RegExp, ms = 20_000): Promise<Mail> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const res = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=20`);
    const list = ((await res.json()) as { messages?: { ID: string; Subject: string; Created: string }[] }).messages ?? [];
    const hit = list.filter((m) => !subject || subject.test(m.Subject)).sort((a, b) => +new Date(b.Created) - +new Date(a.Created))[0];
    if (hit) {
      const full = (await (await request.get(`${MAIL}/api/v1/message/${hit.ID}`)).json()) as { HTML: string; Subject: string };
      return { id: hit.ID, subject: full.Subject, html: full.HTML };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to}${subject ? ` matching ${subject}` : ''}`);
}

/** The first link in an email whose text or URL matches. */
export function linkIn(html: string, match: RegExp): string {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
  const hit = links.find((l) => match.test(l));
  expect(hit, `link matching ${match}`).toBeTruthy();
  return hit!;
}
