import { test, expect } from '@playwright/test';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { who } from './people';
import { as, open, uniq, waitOutcome } from './helpers';
import { db } from './db';

/**
 * The work mailbox against a real IMAP/SMTP server: the test mail server
 * (e2e/mail-test-server.cjs, started by .github/workflows/e2e.yml) with one
 * known user. A seeded member of staff connects it (a wrong password first), allows
 * Enyo, receives mail (plain and HTML-only), reads it as text with Enyo's
 * brief (the stand-in model), replies through SMTP, and disconnects — which
 * deletes everything stored. Another person can never open it.
 *
 * Skipped when the test mail server is not running (start it locally with
 * `node apps/portal/e2e/mail-test-server.cjs`).
 */
test.describe.configure({ mode: 'serial' });

const HOST = process.env.E2E_IMAP_HOST ?? 'localhost';
const IMAP_PORT = Number(process.env.E2E_IMAP_PORT ?? 3143);
const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 3025);
const BOX = { address: 'wura@mail.e2e.test', username: 'wura@mail.e2e.test', password: 'wura-mail-pass' };
const OWNER = who('warranty-officer'); // Wura Warrantyofficer
const tag = uniq();
const SUBJECT = `Brake noise again ${tag}`;
const HTML_SUBJECT = `Newsletter ${tag}`;
const SUMMARY = `Ada asks for an update on her brake noise ${tag}`;
let messageUrl = '';

async function mailServerUp(): Promise<boolean> {
  const client = new ImapFlow({ host: HOST, port: IMAP_PORT, secure: false, doSTARTTLS: false, auth: { user: BOX.username, pass: BOX.password }, logger: false });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch {
    return false;
  }
}

/** Mail arriving from outside: straight into the test server over SMTP. */
async function deliver(opts: { subject: string; text?: string; html?: string; from?: string }) {
  const t = nodemailer.createTransport({ host: HOST, port: SMTP_PORT, secure: false, ignoreTLS: true });
  await t.sendMail({ from: opts.from ?? 'Ada Customer <customer@e2e.test>', to: BOX.address, subject: opts.subject, text: opts.text, html: opts.html });
  t.close();
}

test.beforeAll(async () => {
  test.skip(!(await mailServerUp()), 'The test mail server (IMAP/SMTP) is not running');
});

test('connect: a wrong password is refused with a plain message; the right one connects', async ({ page }) => {
  await as(page, OWNER);
  // Start clean on a retry.
  const me = await db().user.findUniqueOrThrow({ where: { email: OWNER.email }, select: { id: true } });
  await db().mailAccount.deleteMany({ where: { userId: me.id } });
  await open(page, '/mail');
  await expect(page.getByRole('heading', { name: 'Mail', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Connect mailbox' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your mailbox', level: 1 })).toBeVisible();
  const fill = async (password: string) => {
    await page.getByLabel('Your mail provider').selectOption('custom');
    await page.getByLabel('Work email address').fill(BOX.address);
    await page.getByLabel('Name on your emails (optional)').fill('Wura W.');
    await page.getByLabel('Username (usually your email address)').fill(BOX.username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Incoming server (IMAP)').fill(HOST);
    await page.getByLabel('Port').first().fill(String(IMAP_PORT));
    await page.getByLabel('Security').first().selectOption('none');
    await page.getByLabel('Outgoing server (SMTP)').fill(HOST);
    await page.getByLabel('Port').nth(1).fill(String(SMTP_PORT));
    await page.getByLabel('Security').nth(1).selectOption('none');
    await page.getByRole('button', { name: 'Check and connect' }).click();
  };
  await fill('wrong-password');
  await page.waitForURL(/\/mail\/connect\?.*error=/);
  await expect(page.getByText(/did not accept the username or password/)).toBeVisible();
  await expect(page.getByLabel('Work email address')).toHaveValue(BOX.address);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await fill(BOX.password);
  await waitOutcome(page, /\/mail\/consent/);
  await expect(page.getByText('Allow Enyo to read, sort and summarise your email? It never sends anything without you.')).toBeVisible();
  // The password is stored encrypted, never in clear.
  const row = await db().mailAccount.findFirstOrThrow({ where: { userId: me.id }, select: { secret: true } });
  expect(row.secret).toMatch(/^v1:/);
  expect(row.secret).not.toContain(BOX.password);
});

test('consent: mail arrives, and the person allows Enyo', async ({ page }) => {
  // The stand-in model answers the brief with the JSON after "say:" (the email itself is wrapped as untrusted data).
  const brief = JSON.stringify({ summary: SUMMARY, category: 'customer', priority: 1, actions: [{ kind: 'reply', label: 'Reply to Ada' }] });
  await deliver({ subject: SUBJECT, text: `Good morning,\nThe brake noise is back on my car. Can you check it?\n[[say:${brief}]]\nAda` });
  await deliver({ subject: HTML_SUBJECT, html: `<p>Hello <b>bold ${tag}</b></p><img src="http://tracker.invalid/pixel.png" alt="pixel"><script>window.__pwned = 1</script>` });
  await as(page, OWNER);
  await open(page, '/mail/consent');
  await page.getByRole('button', { name: 'Yes, allow Enyo' }).click();
  await waitOutcome(page, /\/mail\?status=consent_given/);
});

test('new mail is fetched when Mail opens; read as plain text, with Enyo\'s brief', async ({ page }) => {
  test.setTimeout(180_000);
  await as(page, OWNER);
  await open(page, '/mail');
  const list = page.getByRole('region', { name: 'Messages' });
  const row = list.getByRole('link', { name: new RegExp(SUBJECT) });
  // Fetched when Mail opens (at most once a minute) — or with Refresh.
  for (let i = 0; i < 6 && !(await row.isVisible()); i += 1) {
    await page.waitForTimeout(16_000);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await row.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  }
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(/\/mail\?.*m=/);
  messageUrl = page.url();
  const article = page.locator('article');
  await expect(article.getByRole('heading', { name: SUBJECT })).toBeVisible();
  await expect(article).toContainText('The brake noise is back on my car.');
  const aside = page.getByRole('complementary', { name: "Enyo's brief" });
  await expect(aside).toContainText(SUMMARY);
  await expect(aside).toContainText('Customer');
  await expect(aside).toContainText('Needs you today');
  await expect(aside.getByRole('link', { name: 'Reply to Ada' })).toBeVisible();

  // HTML-only mail: shown as text; no remote image, no script.
  await list.getByRole('link', { name: new RegExp(HTML_SUBJECT) }).click();
  await expect(page.locator('article')).toContainText(`bold ${tag}`);
  await expect(page.locator('img[src*="tracker.invalid"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('nobody else can open it — administrators included', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, messageUrl.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByText(SUBJECT)).toHaveCount(0);
  await expect(page.getByText('The brake noise is back on my car.')).toHaveCount(0);
});

test('reply goes out through the person\'s own SMTP; the original is marked answered', async ({ page }) => {
  await as(page, OWNER);
  await open(page, messageUrl.replace(/^https?:\/\/[^/]+/, ''));
  await page.locator('article').getByRole('link', { name: 'Reply', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reply', level: 1 })).toBeVisible();
  await expect(page.getByLabel('To')).toHaveValue('customer@e2e.test');
  await expect(page.getByLabel('Subject')).toHaveValue(`Re: ${SUBJECT}`);
  await expect(page.getByLabel('Message')).toHaveValue(/wrote:\n> Good morning,/);
  await page.getByLabel('Message').press('Control+Home');
  await page.getByLabel('Message').pressSequentially(`Thank you, Ada. Bring it in tomorrow. ${tag}`);
  await page.getByRole('button', { name: 'Send' }).click();
  await waitOutcome(page, /\/mail\?status=sent/);
  await expect(page.getByText('Sent.')).toBeVisible();
  // The server copy of the original carries \Answered (set in the background after sending).
  await expect.poll(async () => {
    const c = new ImapFlow({ host: HOST, port: IMAP_PORT, secure: false, doSTARTTLS: false, auth: { user: BOX.username, pass: BOX.password }, logger: false });
    c.on('error', () => undefined);
    await c.connect();
    const lock = await c.getMailboxLock('INBOX');
    try {
      const uids = await c.search({ subject: SUBJECT }, { uid: true });
      const found = Array.isArray(uids) && uids.length ? await c.fetchOne(String(uids[0]), { flags: true }, { uid: true }) : false;
      return found && found.flags ? found.flags.has('\\Answered') : false;
    } finally {
      lock.release();
      await c.logout();
    }
  }, { timeout: 30_000 }).toBe(true);
});

test('flag, mark unread, search', async ({ page }) => {
  await as(page, OWNER);
  await open(page, messageUrl.replace(/^https?:\/\/[^/]+/, ''));
  await page.locator('article').getByRole('button', { name: 'Flag', exact: true }).click();
  await expect(page.locator('article').getByRole('button', { name: 'Remove flag' })).toBeVisible();
  await page.locator('article').getByRole('button', { name: 'Mark unread' }).click();
  await page.waitForURL((u) => !u.searchParams.has('m'));
  await open(page, `/mail?q=${encodeURIComponent(tag)}&view=flagged`);
  const list = page.getByRole('region', { name: 'Messages' });
  await expect(list.getByRole('link', { name: new RegExp(SUBJECT) })).toBeVisible();
  await expect(list.getByRole('link', { name: new RegExp(HTML_SUBJECT) })).toHaveCount(0);
});

test('disconnect deletes the mailbox settings and every stored copy', async ({ page }) => {
  await as(page, OWNER);
  await open(page, '/mail/settings');
  await page.getByLabel(`Yes, disconnect ${BOX.address}`).check();
  await page.getByRole('button', { name: 'Disconnect mailbox' }).click();
  await waitOutcome(page, /\/mail\?status=disconnected/);
  const me = await db().user.findUniqueOrThrow({ where: { email: OWNER.email }, select: { id: true } });
  expect(await db().mailAccount.count({ where: { userId: me.id } })).toBe(0);
  expect(await db().mailMessage.count({ where: { account: { userId: me.id } } })).toBe(0);
  await expect(page.getByRole('link', { name: 'Connect mailbox' })).toBeVisible();
});
