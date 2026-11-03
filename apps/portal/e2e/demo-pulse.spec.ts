import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { db } from './db';
import { as, gotoSettled, signIn } from './helpers';
import { MASTER } from './people';

/**
 * D3 — the demo lives every day (lib/demo/pulse.ts) and the platform team's
 * console (IT control room → Demo organisation). The CI seed loaded the demo
 * today, so today's pulse has nothing to add; a later day adds its working
 * day once, moves the earlier one on, and stops on the switch. Only the
 * platform team sees the console; marking an organisation as a demo and back
 * takes its short name typed and is audited. The full "refresh the demo"
 * reload is the same code as `npm run demo:reset` (workshop-demo.spec runs
 * against it) and is not pressed here, so the other specs keep their demo.
 */
test.describe.configure({ mode: 'serial' });

const ROOT = join(__dirname, '..', '..', '..');
const pulse = (at?: string, env: Record<string, string> = {}) => execFileSync('npx', ['tsx', 'apps/portal/scripts/demo-pulse.ts', ...(at ? ['--at', at] : [])], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180_000 });
// Far enough ahead that no other run of this spec on the same database has used the day.
const DAY = 86_400_000;
const WEEK = Math.floor(Date.now() / 60_000) % 900; // chosen once per run
const later = (days: number) => { const d = new Date(Date.UTC(2030, 0, 7) + WEEK * 7 * DAY + days * DAY); d.setUTCHours(9, 0, 0, 0); return d.toISOString(); };

async function demoOrg() {
  return db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' }, select: { id: true, isDemo: true } });
}

test('today is already in the story (the load claimed it); a later Monday adds its working day once, the Tuesday moves Monday’s check-ins on; the switch stops it; a real organisation never gets one', async () => {
  test.setTimeout(600_000); // six runs of the script, each starting its own process
  const org = await demoOrg();
  expect(org.isDemo).toBe(true);
  expect(pulse()).toMatch(/: already/);
  const monday = later(0); // 2030-01-07 + whole weeks: a Monday
  const out = pulse(monday);
  expect(out).toMatch(/: added .*"jobCards":3.*"broadcasts":1/);
  expect(pulse(monday)).toMatch(/: already/);
  const dayKey = monday.slice(0, 10);
  const marker = await db().demoRecord.findUnique({ where: { model_recordId: { model: 'DemoPulse', recordId: `${org.id}:${dayKey}` } } });
  expect(marker).not.toBeNull();
  const jobs = await db().demoRecord.findMany({ where: { organisationId: org.id, model: 'PulseJobCard' }, select: { recordId: true } });
  const monJobs = await db().jobCard.findMany({ where: { id: { in: jobs.map((j) => j.recordId) }, createdAt: { gte: new Date(`${dayKey}T00:00:00Z`), lt: new Date(new Date(`${dayKey}T00:00:00Z`).getTime() + DAY) } }, select: { id: true, status: true, technicianAcceptanceStatus: true, jobNumber: true } });
  expect(monJobs).toHaveLength(3);
  for (const j of monJobs) { expect(j.status).toBe('CHECKED_IN'); expect(j.jobNumber).toMatch(new RegExp(`^JC-${dayKey.slice(0, 4)}-\\d{6}$`)); }
  // Every record it made is listed for the reset.
  for (const j of monJobs) expect(await db().demoRecord.count({ where: { model: 'JobCard', recordId: j.id } })).toBe(1);
  // Monday's notice: to Isolo only, never emailed.
  const notice = await db().broadcast.findFirstOrThrow({ where: { organisationId: org.id, title: 'This week in the workshop', startsAt: { gte: new Date(`${dayKey}T00:00:00Z`) } }, orderBy: { startsAt: 'asc' }, select: { sendEmail: true, audience: true } });
  expect(notice).toEqual({ sendEmail: false, audience: 'BRANCH' });
  // Tuesday: Monday's check-ins accepted and estimated (no money, no stock).
  expect(pulse(later(1))).toMatch(/: added .*"estimatesWritten":3/);
  const moved = await db().jobCard.findMany({ where: { id: { in: monJobs.map((j) => j.id) } }, select: { technicianAcceptanceStatus: true, status: true, payments: { select: { id: true } }, partRequestSlips: { select: { id: true } }, estimate: { select: { status: true } } } });
  for (const j of moved) { expect(j.technicianAcceptanceStatus).toBe('ACCEPTED'); expect(j.status).toBe('CHECKED_IN'); expect(j.estimate?.status).toBe('SUBMITTED'); expect(j.payments).toHaveLength(0); expect(j.partRequestSlips).toHaveLength(0); }
  // Switched off: nothing.
  expect(pulse(later(2), { DEMO_DAILY_ACTIVITY: 'off' })).toMatch(/off/);
  expect(await db().demoRecord.count({ where: { model: 'DemoPulse', recordId: `${org.id}:${later(2).slice(0, 10)}` } })).toBe(0);
  // Never a real organisation.
  const other = await db().organisation.findUniqueOrThrow({ where: { slug: 'other-org-e2e' }, select: { id: true, isDemo: true } });
  expect(other.isDemo).toBe(false);
  expect(await db().demoRecord.count({ where: { organisationId: other.id } })).toBe(0);
});

const consoleCard = (page: Page) => page.getByTestId('demo-console');

test('the console is the platform team’s: the Master Administrator sees the demo organisation and its figures; the IT Administrator and the organisation’s Administrator do not', async ({ page }) => {
  await signIn(page, MASTER.email, MASTER.password);
  await gotoSettled(page, '/it');
  await expect(consoleCard(page)).toBeVisible();
  const demo = consoleCard(page).locator('li[data-org="kewalram-nigeria"]');
  await expect(demo).toContainText('Demo');
  await expect(demo).toContainText(/workshop demo records/);
  await expect(demo.getByRole('button', { name: 'Load / refresh the demo now' })).toBeDisabled();
  await demo.getByRole('textbox').fill('refresh');
  await expect(demo.getByRole('button', { name: 'Load / refresh the demo now' })).toBeDisabled();
  await expect(demo.getByRole('button', { name: 'Remove the demo records' })).toBeDisabled();
  await as(page, 'it-administrator');
  await gotoSettled(page, '/it');
  await expect(page.getByTestId('it-control-room')).toBeVisible();
  await expect(consoleCard(page)).toHaveCount(0);
  await as(page, 'administrator');
  await gotoSettled(page, '/it');
  await expect(consoleCard(page)).toHaveCount(0);
});

test('making another organisation the demo takes its short name typed, and back again; both are audited, and its people are never touched', async ({ page }) => {
  const other = await db().organisation.findUniqueOrThrow({ where: { slug: 'other-org-e2e' }, select: { id: true } });
  const peopleBefore = await db().user.count({ where: { organisationId: other.id, isActive: true } });
  await signIn(page, MASTER.email, MASTER.password);
  await gotoSettled(page, '/it');
  const row = consoleCard(page).locator('li[data-org="other-org-e2e"]');
  await expect(row).toContainText('Real organisation');
  await row.getByRole('textbox').fill('other-org');
  await expect(row.getByRole('button', { name: 'Make it the demo' })).toBeDisabled();
  await row.getByRole('textbox').fill('other-org-e2e');
  await row.getByRole('button', { name: 'Make it the demo' }).click();
  await expect(consoleCard(page).getByRole('status')).toContainText('is now the demo organisation');
  expect((await db().organisation.findUniqueOrThrow({ where: { id: other.id }, select: { isDemo: true } })).isDemo).toBe(true);
  await row.getByRole('textbox').fill('other-org-e2e');
  await row.getByRole('button', { name: 'Not a demo' }).click();
  await expect(consoleCard(page).getByRole('status')).toContainText('is no longer a demo');
  expect((await db().organisation.findUniqueOrThrow({ where: { id: other.id }, select: { isDemo: true } })).isDemo).toBe(false);
  expect(await db().user.count({ where: { organisationId: other.id, isActive: true } })).toBe(peopleBefore);
  for (const action of ['demo.organisation_marked', 'demo.organisation_unmarked']) expect(await db().auditLog.count({ where: { organisationId: other.id, action } })).toBeGreaterThanOrEqual(1);
});
