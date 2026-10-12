import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, open, eventually, expectHealthy, expectNoUrlError, uniq, waitOutcome } from './helpers';
import { freshVehicle } from './db';
import { jcForm, openJobCard, pickSearchable } from './workflows';

/**
 * The gate and reception, as Security, the front desk, Store and the
 * approvers really use them: visitors in and out, a contractor team on a
 * pass, a delivery handed to the Store, an employee's exit pass, a road test
 * out and back, an incident reported and closed — and the live boards.
 */

const lagosDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const lagosNow = () => {
  const d = new Date(Date.now() - 10 * 60000);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
};

async function pickStaff(page: Page, scope: ReturnType<Page['locator']>, name: string) {
  await pickSearchable(scope, page, name.split(' ')[0]!, new RegExp(name), 'Search staff by name or ID…');
}

test('a visitor arrives at the gate, is received, appears on the boards and is checked out', async ({ page }) => {
  const name = `Visitor ${uniq()}`;
  await as(page, 'security-officer');
  await page.goto('/security/visitors');
  const form = page.locator('form').filter({ has: page.locator('select[name="mode"]') }).first();
  await form.locator('select[name="mode"]').selectOption('ARRIVED');
  await form.locator('select[name="party"]').selectOption('ONE');
  await form.locator('select[name="affiliation"]').selectOption('INDIVIDUAL');
  await form.locator('input[name="visitorName"]').fill(name);
  await form.locator('input[name="phone"]').fill('08031234567');
  await form.locator('select[name="idType"]').selectOption("Driver's licence");
  await form.locator('input[name="idNumber"]').fill('LAG12345AA67');
  await form.locator('select[name="vehicleType"]').selectOption('ON_FOOT');
  await form.locator('input[name="purpose"]').fill('Meeting');
  await pickStaff(page, form, who('workshop-manager').name);
  await form.locator('select[name="expectedMinutes"]').selectOption('60');
  await form.getByRole('button', { name: 'Register and issue pass' }).click();
  await waitOutcome(page, /\/security\/visitors\/[^/?]+\?status=arrived/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const visitUrl = new URL(page.url()).pathname;

  await page.getByRole('button', { name: 'Received at reception — tell the host' }).click();
  await waitOutcome(page, /status=receive/);

  for (const board of ['/security/on-premises', '/security/register', '/security']) {
    await page.goto(board);
    await expectHealthy(page, board);
    await expect(page.getByText(name).first(), `${board} lists the visitor`).toBeVisible();
  }
  await page.goto(visitUrl);
  await page.getByRole('button', { name: 'Check out', exact: true }).click();
  await waitOutcome(page, /status=check_out/);
  await expect(page.getByText('Checked out.', { exact: true })).toBeVisible();
  await page.goto('/security/on-premises');
  await expect(page.getByText(name)).toHaveCount(0);
});

test('a contractor team: requested, approved by the Manager, signed in and out at the gate', async ({ page }) => {
  const company = `Bright Electricals ${uniq()}`;
  await as(page, 'receptionist');
  await page.goto('/security/contractors/new');
  const form = page.locator('form').filter({ has: page.locator('input[name="company"]') }).first();
  await form.locator('input[name="company"]').fill(company);
  await form.locator('textarea[name="work"]').fill('Rewire workshop bay 2');
  await form.locator('input[name="workArea"]').fill('Workshop bay 2');
  await form.locator('select[name="party"]').selectOption('ONE');
  await form.locator('input[name="leadName"]').fill('Chinedu Okeke');
  await form.locator('input[name="phone"]').fill('08030000000');
  await form.locator('input[name="validFrom"]').fill(lagosDay());
  await form.locator('input[name="validUntil"]').fill(lagosDay(2));
  await pickStaff(page, form, who('workshop-supervisor').name);
  await form.getByRole('button', { name: "Submit for the Manager's approval" }).click();
  await waitOutcome(page, /\/security\/contractors\/[^/?]+\?status=requested/);
  const url = new URL(page.url()).pathname;

  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve pass' }).click();
  await waitOutcome(page, /status=approve/);

  await as(page, 'security-officer');
  await open(page, url);
  await page.locator('select[name="workersPresent"]').selectOption('1');
  await page.getByRole('button', { name: 'Sign team in' }).click();
  await waitOutcome(page, /status=sign_in/);
  // The contractors board, "On site" tab, searched by company.
  await open(page, `/security/contractors?tab=on_site&q=${encodeURIComponent(company)}`);
  await eventually(page, async () => expect(page.locator('main').getByText(company).first()).toBeVisible({ timeout: 5_000 }), 30_000);
  await open(page, url);
  await page.getByRole('button', { name: 'Sign team out' }).click();
  await waitOutcome(page, /status=sign_out/);
  expectNoUrlError(page);
});

test('a delivery at the gate is received by the Store and the vehicle leaves', async ({ page }) => {
  const supplier = `ABC Auto Parts ${uniq()}`;
  await as(page, 'security-officer');
  await page.goto('/security/deliveries/new');
  const form = page.locator('form').filter({ has: page.locator('select[name="mode"]') }).first();
  await form.locator('select[name="mode"]').selectOption('ARRIVED');
  await form.locator('input[name="supplierName"]').fill(supplier);
  await form.locator('input[name="reference"]').fill('PO-E2E-0031');
  await form.locator('textarea[name="items"]').fill('5 cartons of brake pads');
  await form.locator('input[name="driverName"]').fill('Musa Driver');
  await form.locator('select[name="vehicleType"]').selectOption('TRUCK');
  await form.locator('input[name="vehiclePlate"]').fill('KJA453GX');
  await form.getByRole('button', { name: 'Record arrival — tell the Store' }).click();
  await waitOutcome(page, /\/security\/deliveries\/[^/?]+\?status=arrived/);
  const url = new URL(page.url()).pathname;
  await page.goto('/security/vehicles-inside');
  await expectHealthy(page);

  // The Store receives it (Store's menu has Deliveries without the Security desk).
  await as(page, 'store-manager');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Deliveries', exact: true })).toBeVisible();
  await open(page, url);
  await page.locator('input[name="note"]').first().fill('All 5 cartons counted');
  await page.getByRole('button', { name: 'Confirm received by the Store' }).click();
  await waitOutcome(page, /status=receive/);

  await as(page, 'security-officer');
  await open(page, url);
  await page.getByRole('button', { name: 'Record vehicle leaving' }).click();
  await waitOutcome(page, /status=left/);
  await expect(page.getByText('Delivery vehicle recorded leaving.')).toBeVisible();
});

test('an exit pass: requested, authorised by the Department Head, approved by the Manager, out and back', async ({ page }) => {
  await as(page, 'technician');
  await page.goto('/security/exit-passes/new');
  const form = page.locator('form').filter({ has: page.locator('select[name="who"]') }).first();
  await form.locator('select[name="who"]').selectOption('ME');
  await form.locator('textarea[name="reason"]').fill('Bank errand for the workshop');
  await form.locator('select[name="leaveWhen"]').selectOption('NOW');
  await form.locator('select[name="returning"]').selectOption('yes');
  await form.locator('select[name="outHours"]').selectOption('1');
  await form.locator('select[name="outMinutes"]').selectOption('0');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await waitOutcome(page, /\/security\/exit-passes\/[^/?]+\?status=requested/);
  const url = new URL(page.url()).pathname;
  // Nobody approves their own pass.
  await expect(page.getByRole('button', { name: /Authorise|Approve \(Manager\)/ })).toHaveCount(0);

  await as(page, 'department-head');
  await open(page, url);
  await page.getByRole('button', { name: 'Authorise (Department Head)' }).click();
  await waitOutcome(page, /status=approve/);
  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve (Manager)' }).click();
  await waitOutcome(page, /status=approve/);

  await as(page, 'security-officer');
  await open(page, url);
  await page.getByRole('button', { name: 'Record time out' }).click();
  await waitOutcome(page, /status=gate_out/);
  await page.goto('/security/people-out');
  await expect(page.getByText(who('technician').name).first()).toBeVisible();
  await page.goto('/security/overdue');
  await expectHealthy(page);
  await open(page, url);
  await page.getByRole('button', { name: 'Record time in' }).click();
  await waitOutcome(page, /status=gate_in/);
  await expect(page.getByText('Time in recorded — welcome back.')).toBeVisible();
});

test('a road test permit: requested on a Job Card, approved, out and back with the odometer', async ({ page }) => {
  const plate = (await freshVehicle('RDT')).plate;
  await as(page, 'receptionist');
  const jcUrl = await openJobCard(page, { plate, complaint: 'Vibration at speed' });
  const jcId = jcUrl.split('/').pop()!;
  await page.goto(`/security/road-tests/new?jobCardId=${jcId}`);
  await expect(page.getByRole('heading', { name: 'Request a road test' })).toBeVisible();
  const form = jcForm(page, 'Request approval');
  await pickStaff(page, form, who('technician').name);
  await form.locator('input[name="purpose"]').fill('Vibration at 80 km/h');
  await form.locator('input[name="route"]').fill('Isolo → Oshodi and back');
  await form.locator('select[name="expectedMinutes"]').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Request approval' }).click();
  await waitOutcome(page, /\/security\/road-tests\/[^/?]+\?status=requested/);
  const url = new URL(page.url()).pathname;

  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve road test' }).click();
  await waitOutcome(page, /status=approve/);

  await as(page, 'security-officer');
  await open(page, url);
  await page.getByRole('textbox', { name: 'Odometer reading now (km)' }).or(page.locator('input[name="odometer"]')).first().fill('50000');
  await page.getByRole('button', { name: 'Record time out' }).click();
  await waitOutcome(page, /status=gate_out/);
  await page.locator('input[name="odometer"]').fill('50012');
  await page.getByRole('button', { name: 'Record time in' }).click();
  await waitOutcome(page, /status=gate_in/);
  expectNoUrlError(page);

  await as(page, 'workshop-manager');
  await page.goto(jcUrl);
  const trail = page.getByRole('heading', { name: 'Audit trail' }).locator('..');
  await expect(trail.getByText('Back from road test')).toBeVisible();
});

test('an incident is reported by Security and closed by the Chief Security Officer', async ({ page }) => {
  await as(page, 'security-officer');
  await page.goto('/security/incidents/new');
  const form = jcForm(page, 'Report incident');
  await form.locator('select[name="type"]').selectOption('Lost visitor pass');
  await form.locator('select[name="severity"]').selectOption('LOW');
  await form.locator('input[name="occurredAt"]').fill(lagosNow());
  await form.locator('input[name="location"]').fill('Main gate');
  await form.locator('textarea[name="description"]').fill('Visitor left without returning pass VP-123');
  await form.getByRole('button', { name: 'Report incident' }).click();
  await waitOutcome(page, /\/security\/incidents\/[^/?]+\?status=reported/);
  const url = new URL(page.url()).pathname;
  // A Security Officer cannot close it.
  await expect(page.getByRole('button', { name: 'Close incident' })).toHaveCount(0);

  await as(page, 'chief-security-officer');
  await open(page, url);
  const assign = jcForm(page, 'Assign');
  await assign.locator('select[name="assigneeId"]').selectOption({ index: 1 });
  await assign.getByRole('button', { name: 'Assign' }).click();
  await waitOutcome(page, /status=assign/);
  await page.locator('textarea[name="resolution"]').fill('Pass recovered from the visitor the next day');
  await page.getByRole('button', { name: 'Close incident' }).click();
  await waitOutcome(page, /status=close/);
  await expect(page.getByText('Incident closed.')).toBeVisible();
});
