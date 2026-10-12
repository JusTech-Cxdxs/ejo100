import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, eventually, bellText, countMail, latestMail, uniq, visitHealthy, waitOutcome } from './helpers';
import { jcForm } from './workflows';

/**
 * Broadcasts reach exactly the people they are for: one to everyone, one
 * only to Workshop Managers (also emailed). People mark them read; the
 * analytics count the reads. A broadcast meant for others is never shown.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = { all: `Fire drill at 2 pm ${tag}`, role: `Managers: budget review ${tag}`, allUrl: '', roleUrl: '' };

async function publish(page: Page, opts: { category: RegExp; title: string; message: string; audience: 'ALL' | 'ROLE'; role?: string; email: boolean }): Promise<string> {
  await page.goto('/notifications/broadcasts/new');
  await page.getByRole('button', { name: opts.category }).click();
  const form = jcForm(page, 'Publish broadcast');
  await form.locator('input[name="title"]').fill(opts.title);
  await form.locator('textarea[name="message"]').fill(opts.message);
  await form.locator('select[name="audience"]').selectOption(opts.audience);
  if (opts.role) await form.getByRole('checkbox', { name: opts.role, exact: true }).check();
  await form.locator('select[name="when"]').selectOption('NOW');
  await form.locator('select[name="duration"]').selectOption('h4');
  await form.locator('select[name="sendEmail"]').selectOption(opts.email ? 'yes' : 'no');
  await form.getByRole('button', { name: 'Publish broadcast' }).click();
  await waitOutcome(page, /\/notifications\/broadcasts\/[^/?]+\?status=created/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^BC-/);
  return new URL(page.url()).pathname;
}

test('an administrator publishes one broadcast to everyone and one to Workshop Managers', async ({ page, request }) => {
  await as(page, 'administrator');
  S.allUrl = await publish(page, { category: /Security alert/, title: S.all, message: 'Assemble at the car park.', audience: 'ALL', email: false });
  S.roleUrl = await publish(page, { category: /Important/, title: S.role, message: 'Bring the Q3 workshop figures.', audience: 'ROLE', role: 'Workshop Manager', email: true });
  const mail = await latestMail(request, who('workshop-manager').email, new RegExp(tag));
  expect(mail.html).toContain('Bring the Q3 workshop figures.');
  // Not emailed to someone it is not for.
  expect(await countMail(request, who('technician').email, new RegExp(tag))).toBe(0);
});

test('a technician sees the one for everyone — never the managers’ one', async ({ page }) => {
  await as(page, 'technician');
  await eventually(page, async () => expect(await bellText(page)).toContain(S.all));
  expect(await bellText(page)).not.toContain(S.role);
  await page.goto('/notifications?tab=broadcasts');
  await expect(page.getByRole('heading', { name: S.all })).toBeVisible();
  await expect(page.getByRole('heading', { name: S.role })).toHaveCount(0);
});

test('a Workshop Manager sees both and marks one read', async ({ page }) => {
  await as(page, 'workshop-manager');
  await page.goto('/notifications?tab=broadcasts');
  await eventually(page, async () => {
    await expect(page.getByRole('heading', { name: S.all })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: S.role })).toBeVisible({ timeout: 5_000 });
  });
  const cardOf = (title: string) => page.locator('div[id]').filter({ has: page.getByRole('heading', { name: title }) }).first();
  await cardOf(S.role).getByRole('button', { name: 'Mark read' }).click();
  await expect(cardOf(S.role).getByRole('button', { name: 'Mark unread' })).toBeVisible();
  await page.reload();
  await expect(cardOf(S.role).getByRole('button', { name: 'Mark unread' })).toBeVisible();
  const bell = await bellText(page);
  expect(bell).not.toContain(S.role);
});

test('the reads are counted; broadcast analytics open', async ({ page }) => {
  await as(page, 'administrator');
  await page.goto(S.roleUrl);
  await expect(page.locator('main')).toContainText(/Read by\s*1 person/);
  await visitHealthy(page, '/notifications/broadcasts/analytics');
  await expect(page.getByRole('heading', { name: 'Broadcast analytics' })).toBeVisible();
  await visitHealthy(page, '/notifications/broadcasts?tab=all');
  await expect(page.getByText(S.role).first()).toBeVisible();
});

test('a broadcast meant for managers stays hidden from a technician everywhere', async ({ page }) => {
  test.fail(true, 'E2E-03: /notifications/broadcasts (list) and /notifications/broadcasts/[id] (no guard) show every organisation broadcast — role/branch-targeted ones included — to any staff member (lib/actions/notifications.ts listBroadcasts/getBroadcast filter by organisation only)');
  await as(page, 'technician');
  await page.goto('/notifications/broadcasts?tab=all');
  await expect(page.getByText(S.role)).toHaveCount(0);
  await page.goto(S.roleUrl);
  await expect(page.getByText('Bring the Q3 workshop figures.')).toHaveCount(0);
});
