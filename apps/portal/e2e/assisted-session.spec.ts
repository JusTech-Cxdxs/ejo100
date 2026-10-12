import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, OTHER_BRANCH_TECH, who } from './people';
import { as, eventually, open, urlOrExplain } from './helpers';
import { db, freshVehicle } from './db';
import { assignTechnician, openJobCard, supervisorApproves } from './workflows';

/**
 * Assisted sessions: the Branch Assistant helps the seeded technician, who
 * types their own password as consent. Wrong password refused, right one
 * starts the session; the assistant accepts the technician's Job Card AS the
 * technician; the history says "(assisted by …)"; managers can never be
 * assisted; the technician's profile stays closed; ending the session removes
 * the banner and the technician is told what was done.
 */
test.describe.configure({ mode: 'serial' });

const ASSISTANT = who('branch-assistant');
const TECH = who('technician');
const MANAGER = who('workshop-manager');
const S = { url: '' };

const banner = (page: Page) => page.getByRole('region', { name: 'Assisted session' });

async function chooseColleague(page: Page, name: string) {
  await open(page, `/support/assist?q=${encodeURIComponent(name.split(' ')[0]!)}`);
  await page.getByRole('link', { name: `Help ${name}` }).click();
  await expect(page.getByRole('heading', { name: `Start helping ${name}` })).toBeVisible();
}

test.beforeAll(async () => {
  // A clean slate for this assistant: no session left open by an earlier attempt.
  const a = await db().user.findUniqueOrThrow({ where: { email: ASSISTANT.email }, select: { id: true } });
  await db().assistSession.updateMany({ where: { assistantId: a.id, endedAt: null }, data: { endedAt: new Date(), endedReason: 'ended_by_assistant' } });
});

test('a Job Card is assigned to the technician', async ({ page }) => {
  const v = await freshVehicle('AST');
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: v.plate, complaint: 'Clutch slipping on hills' });
  await supervisorApproves(page, S.url);
  await assignTechnician(page, TECH);
});

test('managers are never offered, and the server refuses them when forced', async ({ page }) => {
  await as(page, ASSISTANT);
  await open(page, '/support/assist');
  await expect(page.getByRole('heading', { name: 'Assist a colleague', level: 1 })).toBeVisible();
  const list = page.getByRole('list', { name: 'Colleagues you can assist' });
  await expect(list.getByText(TECH.name)).toBeVisible();
  await expect(list.getByText(MANAGER.name)).toHaveCount(0);
  await expect(list.getByText(who('workshop-supervisor').name)).toHaveCount(0);
  await expect(list.getByText(who('finance-officer').name)).toHaveCount(0);
  // Another branch's technician: not this assistant's branch.
  await expect(list.getByText(OTHER_BRANCH_TECH.name)).toHaveCount(0);

  // Pasting the manager's id into the address: no consent form, a plain refusal.
  const manager = await db().user.findUniqueOrThrow({ where: { email: MANAGER.email }, select: { id: true } });
  await open(page, `/support/assist?colleague=${manager.id}`);
  await expect(page.getByText('This colleague is not someone you can assist.')).toBeVisible();
  await expect(page.locator('#assist-password')).toHaveCount(0);
});

test('a wrong password is refused; the colleague\'s own password starts the session', async ({ page }) => {
  await as(page, ASSISTANT);
  await chooseColleague(page, TECH.name);
  await page.locator('#assist-password').fill('not-the-password');
  await page.getByRole('button', { name: 'Start helping Tunde' }).click();
  await expect(page.getByRole('alert')).toContainText('That password is not right');
  await expect(banner(page)).toHaveCount(0);

  await page.locator('#assist-password').fill(E2E_PASSWORD);
  await page.locator('#assist-reason').fill('Accepting the clutch job together');
  await page.getByRole('button', { name: 'Start helping Tunde' }).click();
  await urlOrExplain(page, /\/dashboard/);
  await expect(banner(page)).toContainText(`You are helping ${TECH.name} (Technician)`);
  await expect(banner(page)).toContainText('Everything you do is recorded as done for Tunde');

  await test.step('the failed attempt is in the audit trail; the password is not', async () => {
    const a = await db().user.findUniqueOrThrow({ where: { email: ASSISTANT.email }, select: { id: true } });
    const rows = await db().auditLog.findMany({ where: { userId: a.id, action: { startsWith: 'assist.' } }, select: { action: true, metadata: true } });
    expect(rows.some((r) => r.action === 'assist.consent_failed')).toBe(true);
    expect(rows.some((r) => r.action === 'assist.started')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(E2E_PASSWORD);
    expect(JSON.stringify(rows)).not.toContain('not-the-password');
  });
});

test('while assisting: the technician\'s Job Card is accepted as the technician, and the history names both', async ({ page }) => {
  await as(page, ASSISTANT);
  // A new sign-in is a new browser session: the earlier assisted session does not follow it.
  await open(page, '/dashboard');
  await expect(banner(page)).toHaveCount(0);

  await chooseColleague(page, TECH.name);
  await page.locator('#assist-password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Start helping Tunde' }).click();
  await urlOrExplain(page, /\/dashboard/);
  await expect(banner(page)).toBeVisible();

  await open(page, S.url);
  await expect(banner(page)).toBeVisible();
  await page.locator('#technician-response').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('#technician-response')).toHaveCount(0);
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
  const entry = page.locator('li').filter({ hasText: 'Technician accepted assignment' });
  await expect(entry).toContainText(`${TECH.name} (assisted by ${ASSISTANT.name})`);

  await test.step('the technician\'s profile and password stay closed', async () => {
    await open(page, '/profile');
    await expect(page.getByText('Not available during an assisted session')).toBeVisible();
    await expect(page.getByText('Change my password')).toHaveCount(0);
    await expect(page.getByText(TECH.email)).toHaveCount(0);
  });

  await test.step('no second session can be started from inside one', async () => {
    await open(page, '/support/assist');
    await expect(page.getByRole('heading', { name: `You are helping ${TECH.name}` })).toBeVisible();
    await expect(page.locator('#assist-password')).toHaveCount(0);
  });

  await test.step('ending the session removes the banner', async () => {
    await banner(page).getByRole('button', { name: 'End session' }).click();
    await urlOrExplain(page, /\/support\/assist\?ended=1/);
    await expect(page.getByText('The assisted session has ended.')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await open(page, '/profile');
    await expect(page.getByText('Not available during an assisted session')).toHaveCount(0);
    await expect(page.getByText(ASSISTANT.email)).toBeVisible();
  });

  await test.step('the assistant\'s history lists the session with its action', async () => {
    await open(page, '/support/assist');
    const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sessions you have held' }) });
    await expect(history).toContainText(TECH.name);
    await expect(history).toContainText('Ended by the assistant');
    await expect(history).toContainText(/[1-9]\d* actions? recorded/);
  });
});

test('the technician is told who helped and what was recorded', async ({ page }) => {
  await as(page, TECH);
  await eventually(page, async () => {
    await open(page, '/notifications');
    await expect(page.getByText(new RegExp(`${ASSISTANT.name} helped you with your work from \\d{2}:\\d{2} to \\d{2}:\\d{2} — [1-9]\\d* actions? recorded`)).first()).toBeVisible({ timeout: 5_000 });
  });
  await open(page, '/profile');
  const held = page.locator('#assisted');
  await expect(held).toContainText(ASSISTANT.name);
  await expect(held).toContainText(/actions? recorded/);
});
