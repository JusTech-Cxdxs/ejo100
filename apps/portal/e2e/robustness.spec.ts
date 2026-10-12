import { test, expect, type Page } from '@playwright/test';
import { as, expectHealthy, uniq, waitOutcome } from './helpers';
import { db } from './db';
import { jcForm, suggestion } from './workflows';

/**
 * How it behaves when people are people: double clicks, Back / Refresh
 * after saving, a session that expires while a form is open, very long
 * input, accents/emoji/markup in names — nothing duplicates, nothing
 * crashes, nothing is injected.
 */

const lagosNow = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(Date.now() - 15 * 60000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
};

async function fillIncident(page: Page, location: string, description = 'Gate barrier arm stuck half-open after a power cut') {
  await page.goto('/security/incidents/new');
  const form = jcForm(page, 'Report incident');
  await form.locator('select[name="type"]').selectOption('Property damage');
  await form.locator('select[name="severity"]').selectOption('MEDIUM');
  await form.locator('input[name="occurredAt"]').fill(lagosNow());
  await form.locator('input[name="location"]').fill(location);
  await form.locator('textarea[name="description"]').fill(description);
  return form;
}
const incidentsAt = (location: string) => db().securityIncident.count({ where: { location } });

test('a double click on a submit button records ONE incident', async ({ page }) => {
  const location = `Gate ${uniq()}`;
  await as(page, 'security-officer');
  const form = await fillIncident(page, location);
  await form.getByRole('button', { name: 'Report incident' }).dblclick();
  await waitOutcome(page, /\/security\/incidents\/[^/?]+\?status=reported/);
  await page.waitForTimeout(1500);
  expect(await incidentsAt(location)).toBe(1);
});

test('Back and Refresh after saving never save it again', async ({ page }) => {
  const location = `Yard ${uniq()}`;
  await as(page, 'security-officer');
  const form = await fillIncident(page, location);
  await form.getByRole('button', { name: 'Report incident' }).click();
  await waitOutcome(page, /status=reported/);
  await page.reload();
  await expectHealthy(page);
  await page.goBack();
  await page.waitForLoadState('domcontentloaded');
  await expectHealthy(page);
  await page.goForward();
  await page.waitForLoadState('domcontentloaded');
  await page.reload();
  await expectHealthy(page);
  expect(await incidentsAt(location)).toBe(1);
});

test('a session that expires while a form is open: sent to sign in, nothing saved', async ({ page }) => {
  const location = `Fence ${uniq()}`;
  await as(page, 'security-officer');
  const form = await fillIncident(page, location);
  await page.context().clearCookies();
  await form.getByRole('button', { name: 'Report incident' }).click();
  await page.waitForURL(/\/login|\/signed-out/, { timeout: 20_000 }).catch(() => undefined);
  if (!/\/login/.test(page.url())) {
    // The action may be refused in place; the next click must land on sign-in.
    await page.goto('/security/incidents');
  }
  await expect(page).toHaveURL(/\/login/);
  await expectHealthy(page);
  expect(await incidentsAt(location), 'nothing created without a session').toBe(0);
});

test('very long input is either saved whole or refused politely — never a crash', async ({ page }) => {
  const location = `Car park ${uniq()}`;
  await as(page, 'security-officer');
  const form = await fillIncident(page, location, `Long report. ${'The barrier failed again and again. '.repeat(250)}`);
  await form.locator('input[name="peopleInvolved"]').fill('X'.repeat(2000));
  await form.getByRole('button', { name: 'Report incident' }).click();
  await page.waitForURL(/status=reported|error=/);
  await expectHealthy(page);
  const error = new URL(page.url()).searchParams.get('error');
  if (error) {
    expect(error, 'a plain message, not a stack trace').not.toMatch(/prisma|stack|at \w+ \(|invalid `/i);
    expect(await incidentsAt(location)).toBe(0);
  } else {
    expect(await incidentsAt(location)).toBe(1);
  }
});

test('accents, emoji and markup in a name are kept as typed and never run', async ({ page }) => {
  const name = `Ọlá Àdébáyọ̀ 🚗 <b>bold</b> ${uniq()}`;
  await as(page, 'security-officer');
  await page.goto('/security/visitors');
  const form = page.locator('form').filter({ has: page.locator('select[name="mode"]') });
  await form.locator('select[name="mode"]').selectOption('EXPECTED');
  await form.locator('select[name="party"]').selectOption('ONE');
  await form.locator('select[name="affiliation"]').selectOption('INDIVIDUAL');
  await form.locator('input[name="visitorName"]').fill(name);
  await form.locator('input[name="purpose"]').fill('Delivery of documents');
  await form.getByPlaceholder('Search staff by name or ID…').click();
  await form.getByPlaceholder('Search staff by name or ID…').fill('Mary');
  await suggestion(page, 'Mary Manager').click();
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  await form.locator('input[name="expectedAt"]').fill(`${tomorrow}T10:00`);
  await form.locator('select[name="expectedMinutes"]').selectOption('60');
  await form.getByRole('button', { name: 'Book the visit' }).click();
  await waitOutcome(page, /\/security\/visitors\/[^/?]+\?status=registered/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page.locator('main b', { hasText: 'bold' })).toHaveCount(0);
  await page.goto(`/security/visitors?q=${encodeURIComponent('Àdébáyọ̀')}`);
  await expect(page.getByRole('link', { name }).first()).toBeVisible();
});
