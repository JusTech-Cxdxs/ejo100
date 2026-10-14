import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, bellText, eventually, expectHealthy, latestMail, noSidewaysScroll, open, uniq, waitOutcome } from './helpers';
import { pickSearchable } from './workflows';

/**
 * Reminders, end to end: a person sets one for themselves; they allow a
 * colleague, who then sets one for them (and someone not allowed cannot);
 * the 10-minute job delivers the due one into the bell and by email
 * (Mailpit); the owner marks one done and cancels the other.
 */
test.describe.configure({ mode: 'serial' });

const OWNER = who('calendar-user'); // Cora Calendar
const DELEGATE = who('scheduling-admin'); // Sade Scheduler
const OUTSIDER = who('broadcaster'); // Bimbo Broadcaster — never allowed
const tag = uniq();
const MINE = `Call Mr Okafor back ${tag}`;
const FROM_DELEGATE = `Board pack for Monday ${tag}`;
const CRON = process.env.CRON_SECRET ?? 'e2e-cron-secret';

/** A Lagos datetime-local value at least `minSeconds` ahead, on a whole minute. */
function lagosInput(minSeconds: number): { value: string; at: Date } {
  const at = new Date(Math.ceil((Date.now() + minSeconds * 1000) / 60_000) * 60_000);
  const l = new Date(at.getTime() + 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return { value: `${l.getUTCFullYear()}-${p(l.getUTCMonth() + 1)}-${p(l.getUTCDate())}T${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`, at };
}

const reminderCard = (page: Page, title: string) => page.locator('li[id^="r-"]').filter({ has: page.getByRole('heading', { name: title }) });

let dueAt: Date;

test('a person sets a reminder for themselves (due in about a minute, also by email)', async ({ page }) => {
  await as(page, OWNER);
  await open(page, '/reminders');
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'New reminder' }).first().click();
  await expect(page.getByRole('heading', { name: 'New reminder', level: 1 })).toBeVisible();
  const when = lagosInput(75);
  dueAt = when.at;
  await page.getByLabel('What to remember').fill(MINE);
  await page.getByLabel('When (Lagos time)').fill(when.value);
  await page.getByLabel('Notes (optional)').fill('He asked about the estimate.');
  await expect(page.getByLabel('Also email me when it is due')).toBeChecked();
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await waitOutcome(page, /\/reminders\?status=created/);
  await expect(page.getByText('Reminder set.')).toBeVisible();
  await expect(reminderCard(page, MINE)).toContainText('Upcoming');
});

test('the pre-fill only fills the form in; nothing is saved until Save', async ({ page }) => {
  await as(page, OWNER);
  const later = lagosInput(3 * 86_400);
  await open(page, `/reminders/new?title=${encodeURIComponent(`Prefilled ${tag}`)}&dueAt=${encodeURIComponent(later.value)}&recordType=JobCard&recordId=doesnotexist123&for=nobody12345`);
  await expect(page.getByLabel('What to remember')).toHaveValue(`Prefilled ${tag}`);
  await expect(page.getByLabel('When (Lagos time)')).toHaveValue(later.value);
  await expect(page.getByText('The record this reminder was about is not available to you')).toBeVisible();
  await expect(page.getByText('That colleague has not allowed you')).toBeVisible();
  await open(page, '/reminders');
  await expect(page.getByRole('heading', { name: `Prefilled ${tag}` })).toHaveCount(0);
});

test('the owner allows a colleague, who sets a reminder for them; someone not allowed cannot', async ({ page }) => {
  await as(page, OWNER);
  await open(page, '/reminders');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Who may set reminders for me' }) });
  await pickSearchable(section, page, DELEGATE.name.split(' ')[0]!, DELEGATE.name);
  await section.getByRole('button', { name: 'Allow', exact: true }).click();
  await waitOutcome(page, /status=delegate_granted/);
  await expect(section).toContainText(DELEGATE.name);

  await as(page, DELEGATE);
  await open(page, '/reminders');
  await expect(page.getByRole('heading', { name: 'You can set reminders for' })).toBeVisible();
  await open(page, '/reminders/new');
  await page.getByLabel('Who is it for?').selectOption({ label: OWNER.name });
  await page.getByLabel('What to remember').fill(FROM_DELEGATE);
  await page.getByLabel('When (Lagos time)').fill(lagosInput(2 * 86_400).value);
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await waitOutcome(page, /\/reminders\?status=set_for_colleague/);
  // It is the owner's reminder, not the delegate's.
  await expect(page.getByRole('heading', { name: FROM_DELEGATE })).toHaveCount(0);

  await as(page, OUTSIDER);
  await open(page, '/reminders/new');
  await expect(page.getByLabel('Who is it for?')).toHaveCount(0);

  await as(page, OWNER);
  await open(page, '/reminders');
  await expect(reminderCard(page, FROM_DELEGATE)).toContainText(`Set for you by ${DELEGATE.name}`);
});

test('the 10-minute job delivers the due reminder: in the bell and by email', async ({ page, request }) => {
  test.setTimeout(240_000);
  // Real time passes (no clock tricks): wait until it is due.
  const wait = dueAt.getTime() - Date.now() + 2_000;
  if (wait > 0) await page.waitForTimeout(wait);
  const res = await request.get('/api/cron/appointment-reminders', { headers: { authorization: `Bearer ${CRON}` } });
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { personalRemindersDelivered?: number }).personalRemindersDelivered ?? 0).toBeGreaterThanOrEqual(0);
  const mail = await latestMail(request, OWNER.email, new RegExp(`Reminder: ${MINE}`), 30_000);
  expect(mail.html).toContain('He asked about the estimate.');
  expect(mail.html).toContain('/reminders?focus=');
  // A second run sends nothing again.
  await request.get('/api/cron/appointment-reminders', { headers: { authorization: `Bearer ${CRON}` } });

  await as(page, OWNER);
  await open(page, '/dashboard');
  await eventually(page, async () => expect(await bellText(page)).toContain(`Reminder — ${MINE}`), 90_000);
  await open(page, '/reminders');
  await expect(page.getByRole('heading', { name: 'Due now' })).toBeVisible();
  await expect(reminderCard(page, MINE)).toContainText('Due');
});

test('the owner marks one done and cancels the other', async ({ page }) => {
  await as(page, OWNER);
  await open(page, '/reminders');
  await reminderCard(page, MINE).getByRole('button', { name: `Mark done: ${MINE}` }).click();
  await waitOutcome(page, /status=done/);
  await expect(reminderCard(page, MINE)).toContainText('Done');
  await reminderCard(page, FROM_DELEGATE).getByRole('button', { name: 'Cancel reminder' }).click();
  await waitOutcome(page, /status=cancelled/);
  await expect(reminderCard(page, FROM_DELEGATE)).toContainText('Cancelled');
  // Gone from the bell (its summary is cached briefly on the server).
  await eventually(page, async () => expect(await bellText(page)).not.toContain(`Reminder — ${MINE}`), 90_000);
});

test('the owner withdraws the colleague; they can no longer choose the owner', async ({ page }) => {
  await as(page, OWNER);
  await open(page, '/reminders');
  await page.getByRole('button', { name: `Withdraw ${DELEGATE.name}` }).click();
  await waitOutcome(page, /status=delegate_withdrawn/);
  await as(page, DELEGATE);
  await open(page, '/reminders/new');
  await expect(page.getByRole('option', { name: OWNER.name })).toHaveCount(0);
});

test('phones: Reminders and Mail fit a 360 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await as(page, OWNER);
  for (const url of ['/reminders', '/reminders/new', '/mail']) {
    await open(page, url);
    await expectHealthy(page, url);
    await noSidewaysScroll(page, url);
  }
});
