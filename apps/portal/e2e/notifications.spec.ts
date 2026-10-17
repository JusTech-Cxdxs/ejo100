import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, open, eventually, bellText, countMail, latestMail, uniq, visitHealthy, waitOutcome } from './helpers';
import { publishBroadcast } from './workflows';

/**
 * Broadcasts reach exactly the people they are for: one to everyone, one
 * only to Workshop Managers (also emailed). People mark them read; the
 * analytics count the reads. A broadcast meant for others is never shown.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = { all: `Fire drill at 2 pm ${tag}`, role: `Managers: budget review ${tag}`, allUrl: '', roleUrl: '' };

const publish = publishBroadcast;

test('an administrator publishes one broadcast to everyone and one to Workshop Managers', async ({ page, request }) => {
  await as(page, 'administrator');
  S.allUrl = await publish(page, { category: /Security alert/, title: S.all, message: 'Assemble at the car park.', audience: 'ALL', email: false });
  S.roleUrl = await publish(page, { category: /Important/, title: S.role, message: 'Bring the Q3 workshop figures.', audience: 'ROLE', role: 'Manager', email: true });
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
  await open(page, '/notifications?tab=broadcasts');
  await eventually(page, async () => {
    await expect(page.getByRole('heading', { name: S.all })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: S.role })).toBeVisible({ timeout: 5_000 });
  });
  const cardOf = (title: string) => page.locator('div[id]').filter({ has: page.getByRole('heading', { name: title }) }).first();
  await cardOf(S.role).getByRole('button', { name: 'Mark read' }).click();
  await expect(cardOf(S.role).getByRole('button', { name: 'Mark unread' })).toBeVisible();
  await page.reload();
  await expect(cardOf(S.role).getByRole('button', { name: 'Mark unread' })).toBeVisible();
  // The bell follows (its summary is cached briefly on the server).
  await eventually(page, async () => expect(await bellText(page)).not.toContain(S.role), 75_000);
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
  await as(page, 'technician');
  await page.goto('/notifications/broadcasts?tab=all');
  await expect(page.getByText(S.role)).toHaveCount(0);
  await page.goto(S.roleUrl);
  await expect(page.getByText('Bring the Q3 workshop figures.')).toHaveCount(0);
});
