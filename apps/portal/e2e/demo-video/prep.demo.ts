/**
 * Fills the demo database with the records the product video shows:
 * three Job Cards in different states, a visitor on the premises, a
 * delivery, an exit pass awaiting approval, a booked meeting room and
 * appointment, and a support request. Runs through the real UI with the
 * same helpers the e2e specs use.
 */
import { test, expect } from '@playwright/test';
import { as, waitOutcome } from '../helpers';
import { who, PEOPLE, CUSTOMER } from '../people';

/** The demo database carries real-looking names (set by the video pipeline); keep the catalogue in step. */
const DEMO_NAMES: Record<string, string> = {
  'frontdesk@e2e.test': 'Funmi Adeyemi', 'supervisor@e2e.test': 'Samuel Okafor', 'tech@e2e.test': 'Tunde Bakare', 'manager@e2e.test': 'Mary Eze',
  'finance@e2e.test': 'Femi Olawale', 'store@e2e.test': 'Stella Nwosu', 'security@e2e.test': 'Suleiman Bello', 'scheduler@e2e.test': 'Sade Balogun',
  'care@e2e.test': 'Chidi Okeke', 'executive@e2e.test': 'Emeka Obi', 'admin@e2e.test': 'Hannah Ibrahim', 'depthead@e2e.test': 'Dayo Adebayo',
  'storeofficer@e2e.test': 'Oscar Umeh', 'calendar@e2e.test': 'Cora Danjuma',
};
for (const p of PEOPLE) if (DEMO_NAMES[p.email]) (p as { name: string }).name = DEMO_NAMES[p.email]!;
(CUSTOMER as { name: string }).name = 'Adaeze Nwachukwu';
import { jobCardInProgress, jobCardReadyForEstimate, openJobCard, pickSearchable, reveal, jcForm } from '../workflows';

test.describe.configure({ mode: 'serial' });
const lagosDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

test('job card in progress (brakes)', async ({ page }) => {
  await jobCardInProgress(page, {
    plate: 'LND-452-KJ',
    customer: 'Adaeze Nwachukwu',
    complaint: 'Brakes squeal when stopping; pedal feels soft',
    lines: [
      { type: 'STORE_PART', partType: 'Brake Pads', qty: 1 },
      { type: 'LABOUR', description: 'Replace front brake pads and bleed the brake lines', price: 18000 },
      { type: 'SUNDRY', description: 'Brake fluid DOT 4 (1 litre)', price: 6500 },
    ],
  } as never);
});

test('job card ready for estimate (engine light)', async ({ page }) => {
  await jobCardReadyForEstimate(page, { plate: 'KJA-318-GX', customer: 'Adaeze Nwachukwu', complaint: 'Engine warning light on; rough idle at traffic lights' });
});

test('job card just opened (air conditioning)', async ({ page }) => {
  await as(page, 'receptionist');
  await openJobCard(page, { plate: 'LSR-907-FD', customer: 'Kemi Oyelaran', complaint: 'Air conditioning not cooling after the last service', mileage: 38420 });
});

test('a visitor is on the premises', async ({ page }) => {
  await as(page, 'security-officer');
  await page.goto('/security/visitors');
  const form = page.locator('form').filter({ has: page.locator('select[name="mode"]') }).first();
  await form.locator('select[name="mode"]').selectOption('ARRIVED');
  await form.locator('select[name="party"]').selectOption('ONE');
  await form.locator('select[name="affiliation"]').selectOption('INDIVIDUAL');
  await form.locator('input[name="visitorName"]').fill('Ngozi Chukwu');
  await form.locator('input[name="phone"]').fill('08031234567');
  await form.locator('select[name="idType"]').selectOption("Driver's licence");
  await form.locator('input[name="idNumber"]').fill('LAG12345AA67');
  await form.locator('select[name="vehicleType"]').selectOption('ON_FOOT');
  await form.locator('input[name="purpose"]').fill('Fleet maintenance contract meeting');
  await pickSearchable(form, page, 'Mary', new RegExp(who('workshop-manager').name), 'Search staff by name or ID…');
  await form.locator('select[name="expectedMinutes"]').selectOption('60');
  await form.getByRole('button', { name: 'Register and issue pass' }).click();
  await waitOutcome(page, /\/security\/visitors\/[^/?]+\?status=arrived/);
  await page.getByRole('button', { name: 'Received at reception — tell the host' }).click();
  await waitOutcome(page, /status=receive/);
});

test('a delivery has arrived at the gate', async ({ page }) => {
  await as(page, 'security-officer');
  await page.goto('/security/deliveries/new');
  const form = page.locator('form').filter({ has: page.locator('select[name="mode"]') }).first();
  await form.locator('select[name="mode"]').selectOption('ARRIVED');
  await form.locator('input[name="supplierName"]').fill('Autoparts Direct Ltd');
  await form.locator('input[name="reference"]').fill('PO-2026-0418');
  await form.locator('textarea[name="items"]').fill('12 cartons of brake pads, 6 cartons of oil filters');
  await form.locator('input[name="driverName"]').fill('Musa Abdullahi');
  await form.locator('select[name="vehicleType"]').selectOption('TRUCK');
  await form.locator('input[name="vehiclePlate"]').fill('KJA453GX');
  await form.getByRole('button', { name: 'Record arrival — tell the Store' }).click();
  await waitOutcome(page, /\/security\/deliveries\/[^/?]+/);
});

test('an exit pass awaits approval', async ({ page }) => {
  await as(page, 'technician');
  await page.goto('/security/exit-passes/new');
  const form = page.locator('form').filter({ has: page.locator('select[name="who"]') }).first();
  await form.locator('select[name="who"]').selectOption('ME');
  await form.locator('textarea[name="reason"]').fill('Collect special-order sensor from the supplier in Apapa');
  await form.locator('select[name="leaveWhen"]').selectOption('NOW');
  await form.locator('select[name="returning"]').selectOption('yes');
  await form.locator('select[name="outHours"]').selectOption('2');
  await form.locator('select[name="outMinutes"]').selectOption('0');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await waitOutcome(page, /\/security\/exit-passes\/[^/?]+\?status=requested/);
});

test('a meeting room and an appointment', async ({ page }) => {
  await as(page, 'scheduling-admin');
  await page.goto('/schedule/rooms');
  await reveal(page, 'Add a room');
  const room = jcForm(page, 'Add room');
  await room.locator('input[name="name"]').fill('Boardroom A');
  await room.locator('input[name="location"]').fill('Admin block, 1st floor');
  await room.locator('input[name="capacity"]').fill('10');
  await room.getByRole('button', { name: 'Add room' }).click();
  await waitOutcome(page, /status=room_saved/);

  await as(page, 'calendar-user');
  await page.goto('/schedule/new');
  const form = jcForm(page, 'Book appointment');
  await form.locator('input[name="title"]').fill('Supplier pricing review');
  await form.locator('textarea[name="agenda"]').fill('Quarterly parts pricing with Autoparts Direct');
  await form.locator('input[name="date"]').fill(lagosDay(1));
  await form.locator('input[name="time"]').fill('10:00');
  await form.locator('select[name="duration"]').selectOption('60');
  await form.locator('select[name="where"]').selectOption('ROOM');
  const roomId = await form.locator('select[name="roomId"] option', { hasText: 'Boardroom A' }).first().getAttribute('value');
  await form.locator('select[name="roomId"]').selectOption(roomId!);
  await form.getByRole('button', { name: '+ Add a staff member' }).click();
  await pickSearchable(form, page, 'Mary', new RegExp(who('workshop-manager').name), 'Search staff by name…');
  await form.locator('select[name="hasVisitors"]').selectOption('no');
  await form.getByRole('button', { name: 'Book appointment' }).click();
  await waitOutcome(page, /\/schedule\/[^/?]+\?status=created/);
});

test('a support request', async ({ page }) => {
  await as(page, 'customer-care');
  await page.goto('/crm/support/new');
  await page.locator('input[name="contactName"]').first().fill('Kemi Oyelaran');
  await page.locator('input[name="contactPhone"]').first().fill('08039876543');
  await page.locator('input[name="subject"]').first().fill('AC still not cooling after service');
  await page.locator('textarea[name="body"]').first().fill('Customer called: the air conditioning was serviced last week and is blowing warm again. Would like a technician to look at it this Friday.');
  await page.locator('select[name="priority"]').first().selectOption('HIGH').catch(() => undefined);
  await page.getByRole('button', { name: 'Open the request' }).first().click();
  await waitOutcome(page, /\/crm\/support\/[^/?]+/);
  await expect(page.locator('main')).toContainText('AC still not cooling');
});
