import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * A4c3 — scheduled exports, end to end: the Store Manager repeats an export
 * of theirs every Monday; when it is due the morning job records a fresh
 * export for them (the same list and filters), once however often the job
 * runs, and the file downloads as any export does; paused, it is left alone;
 * a schedule whose owner may no longer export the list pauses itself and
 * says why. The job's address needs the scheduler's secret.
 */
test.describe.configure({ mode: 'serial' });

const CRON = { authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` };
const STAMP = String(Date.now()).slice(-8);
const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 3_600_000 - 86_400_000).toISOString().slice(0, 10);
const ids = { owner: '', org: '', exportId: '', schedule: '', orphan: '' };
const params = { q: `No supplier is called ${STAMP}` };

test('the Store Manager repeats an export of theirs every Monday', async ({ page }) => {
  const u = await db().user.findUniqueOrThrow({ where: { email: who('store-manager').email }, select: { id: true, organisationId: true } });
  ids.owner = u.id; ids.org = u.organisationId!;
  ids.exportId = (await db().exportJob.create({ data: { organisationId: ids.org, number: `EXP-E2E-${STAMP}`, kind: 'suppliers', format: 'csv', params, summary: `Search: ${params.q}`, createdById: u.id, expiresAt: new Date(Date.now() + 86_400_000) }, select: { id: true } })).id;
  await as(page, 'store-manager');
  await open(page, `/data-exchange/exports/${ids.exportId}`);
  const form = page.getByTestId('schedule-export');
  await form.getByLabel('How often').selectOption('WEEKLY');
  await form.getByLabel('Day of the week').selectOption('1');
  await form.getByRole('button', { name: 'Repeat this export' }).click();
  await expect(form.getByRole('status')).toContainText('Scheduled: every monday, first on', { timeout: 20_000 });
  const s = await db().exportSchedule.findFirstOrThrow({ where: { ownerId: u.id, kind: 'suppliers', summary: `Search: ${params.q}` } });
  ids.schedule = s.id;
  expect(s).toMatchObject({ status: 'ACTIVE', cadence: 'WEEKLY', dayOfWeek: 1, format: 'csv', params });
  expect(s.nextRunOn > today).toBe(true);
  expect(new Date(`${s.nextRunOn}T00:00:00Z`).getUTCDay()).toBe(1);
  // The same schedule twice is refused.
  await form.getByRole('button', { name: 'Repeat this export' }).click();
  await expect(form.getByRole('alert')).toContainText('already have this export scheduled');
  // It shows on their Exports page.
  await open(page, '/data-exchange/exports');
  await expect(page.getByTestId('export-schedule').filter({ hasText: params.q })).toContainText('Every Monday');
});

test('when it is due the morning job records a fresh export for its owner — once, however often the job runs', async ({ page, request }) => {
  expect((await request.get('/api/cron/export-schedules')).status()).toBe(401);
  await db().exportSchedule.update({ where: { id: ids.schedule }, data: { nextRunOn: yesterday } });
  const before = await db().exportJob.count({ where: { createdById: ids.owner, kind: 'suppliers', summary: `Search: ${params.q}` } });
  const res = await request.get('/api/cron/export-schedules', { headers: CRON });
  expect(res.status()).toBe(200);
  expect((await res.json()).made).toBeGreaterThanOrEqual(1);
  await request.get('/api/cron/export-schedules', { headers: CRON });
  expect(await db().exportJob.count({ where: { createdById: ids.owner, kind: 'suppliers', summary: `Search: ${params.q}` } })).toBe(before + 1);
  const s = await db().exportSchedule.findUniqueOrThrow({ where: { id: ids.schedule } });
  expect(s.runs).toBe(1);
  expect(s.nextRunOn > today).toBe(true);
  const job = await db().exportJob.findUniqueOrThrow({ where: { id: s.lastExportId! } });
  expect(job).toMatchObject({ kind: 'suppliers', format: 'csv', params, createdById: ids.owner });
  expect(job.number).toMatch(/^EXP-20\d{2}-\d{6}$/);
  // The file is built for them when they download it, as any export.
  await as(page, 'store-manager');
  const file = await page.request.get(`/data-exchange/exports/${job.id}/download`);
  expect(file.status()).toBe(200);
  expect(await file.text()).toContain('"# List: Suppliers"');
});

test('paused, it is left alone; resumed, it is due after today', async ({ page, request }) => {
  await as(page, 'store-manager');
  await open(page, '/data-exchange/exports');
  const row = page.getByTestId('export-schedule').filter({ hasText: params.q });
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect(row).toHaveAttribute('data-status', 'PAUSED', { timeout: 20_000 });
  await db().exportSchedule.update({ where: { id: ids.schedule }, data: { nextRunOn: yesterday } });
  await request.get('/api/cron/export-schedules', { headers: CRON });
  expect((await db().exportSchedule.findUniqueOrThrow({ where: { id: ids.schedule } })).runs).toBe(1);
  await row.getByRole('button', { name: 'Resume' }).click();
  await expect(row).toHaveAttribute('data-status', 'ACTIVE', { timeout: 20_000 });
  expect((await db().exportSchedule.findUniqueOrThrow({ where: { id: ids.schedule } })).nextRunOn > today).toBe(true);
  await row.getByRole('button', { name: 'End' }).click();
  await expect(row).toHaveAttribute('data-status', 'ENDED', { timeout: 20_000 });
  expect(await db().exportSchedule.count({ where: { id: ids.schedule } })).toBe(1);
});

test('a schedule whose owner may no longer export the list pauses itself and says why', async ({ request }) => {
  const tech = await db().user.findUniqueOrThrow({ where: { email: who('technician').email }, select: { id: true } });
  ids.orphan = (await db().exportSchedule.create({ data: { organisationId: ids.org, ownerId: tech.id, kind: 'suppliers', format: 'csv', params: {}, cadence: 'DAILY', nextRunOn: yesterday }, select: { id: true } })).id;
  await request.get('/api/cron/export-schedules', { headers: CRON });
  const s = await db().exportSchedule.findUniqueOrThrow({ where: { id: ids.orphan } });
  expect(s.status).toBe('PAUSED');
  expect(s.pausedReason).toContain('may no longer export suppliers');
  expect(s.runs).toBe(0);
  expect(await db().exportJob.count({ where: { createdById: tech.id, createdAt: { gte: new Date(Date.now() - 120_000) } } })).toBe(0);
});
