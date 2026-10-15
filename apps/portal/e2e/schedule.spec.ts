import { test, expect } from '@playwright/test';
import { who } from './people';
import { as, open, expectNoUrlError, latestMail, uniq, visitHealthy, waitOutcome } from './helpers';
import { jcForm, pickSearchable, reveal } from './workflows';

/**
 * Scheduling: the scheduling admin sets up a meeting room → a calendar user
 * books a meeting in it with a colleague (who is emailed) → adds an outside
 * visitor (Security then expects them) → reschedules → cancels. The
 * calendar, rooms, availability and appointments pages all open.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const lagosDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const S = { room: `E2E Boardroom ${tag}`, title: `Supplier review ${tag}`, url: '', visitor: `Guest ${tag}` };

test('the scheduling admin adds a meeting room', async ({ page }) => {
  await as(page, 'scheduling-admin');
  await page.goto('/schedule/rooms');
  await reveal(page, 'Add a room');
  const form = jcForm(page, 'Add room');
  await form.locator('input[name="name"]').fill(S.room);
  await form.locator('input[name="location"]').fill('Admin block, 1st floor');
  await form.locator('input[name="capacity"]').fill('8');
  await form.getByRole('button', { name: 'Add room' }).click();
  await waitOutcome(page, /status=room_saved/);
  await expect(page.getByText(S.room).first()).toBeVisible();
});

test('a calendar user books the room with a colleague, who is emailed', async ({ page, request }) => {
  await as(page, 'calendar-user');
  await page.goto('/schedule/new');
  const form = jcForm(page, 'Book appointment');
  await form.locator('input[name="title"]').fill(S.title);
  await form.locator('textarea[name="agenda"]').fill('Quarterly parts pricing');
  await form.locator('input[name="date"]').fill(lagosDay(2));
  await form.locator('input[name="time"]').fill('10:00');
  await form.locator('select[name="duration"]').selectOption('60');
  await form.locator('select[name="where"]').selectOption('ROOM');
  const room = await form.locator('select[name="roomId"] option', { hasText: S.room }).first().getAttribute('value');
  await form.locator('select[name="roomId"]').selectOption(room!);
  await form.getByRole('button', { name: '+ Add a staff member' }).click();
  await pickSearchable(form, page, 'Mary', new RegExp(who('workshop-manager').name), 'Search staff by name…');
  await form.locator('select[name="hasVisitors"]').selectOption('no');
  await form.getByRole('button', { name: 'Book appointment' }).click();
  await waitOutcome(page, /\/schedule\/[^/?]+\?status=created/);
  S.url = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: S.title, level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText(S.room);
  await expect(page.locator('main')).toContainText(who('workshop-manager').name);
  const mail = await latestMail(request, who('workshop-manager').email, new RegExp(tag));
  expect(mail.html).toContain(S.title);
});

test('an outside visitor is added — Security will expect them', async ({ page }) => {
  await as(page, 'calendar-user');
  await open(page, S.url);
  await page.getByRole('link', { name: '+ Add visitors' }).click();
  await page.waitForURL(/\/visitors\/new/);
  const form = jcForm(page, 'Add visitors');
  await form.locator('select[name="party"]').selectOption('ONE');
  await form.locator('select[name="affiliation"]').selectOption('ORGANISATION');
  await form.locator('input[name="company"]').fill('ABC Motors Ltd');
  await form.locator('input[name="visitorName"]').fill(S.visitor);
  await form.locator('input[name="phone"]').fill('08035550000');
  await form.locator('input[name="purpose"]').fill('Meeting');
  await form.getByRole('button', { name: 'Add visitors' }).click();
  await waitOutcome(page, /status=visitors_added/);
  await expect(page.getByRole('link', { name: /^VIS-/ }).first()).toBeVisible();

  await as(page, 'security-officer');
  await page.goto(`/security/visitors?q=${encodeURIComponent(S.visitor)}`);
  await expect(page.getByRole('link', { name: S.visitor }).first()).toBeVisible();
});

test('the meeting is rescheduled, then cancelled', async ({ page }) => {
  await as(page, 'calendar-user');
  await open(page, S.url);
  await page.getByRole('link', { name: 'Change', exact: true }).first().click();
  await page.waitForURL(/\/edit/);
  const form = jcForm(page, 'Save changes');
  await form.locator('input[name="time"]').fill('14:30');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await waitOutcome(page, /status=changed/);
  await expect(page.locator('main')).toContainText(/2:30|14:30/);

  const cancel = jcForm(page, 'Cancel appointment');
  await cancel.locator('input[name="reason"]').fill('Supplier postponed');
  await cancel.getByRole('button', { name: 'Cancel appointment' }).click();
  await waitOutcome(page, /status=cancel/);
  await expect(page.getByText('Appointment cancelled — everyone involved has been emailed.')).toBeVisible();
  expectNoUrlError(page);
});

test('calendar, rooms, availability, aides and appointments open', async ({ page }) => {
  await as(page, 'scheduling-admin');
  for (const url of ['/schedule', '/schedule/calendar', '/schedule/rooms', '/schedule/availability', '/schedule/aides', '/schedule/appointments']) {
    await visitHealthy(page, url);
  }
});
