import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * P6b — the routine services still in the workshop on the cut-over day and
 * the bookings already in the diary become EJO Vehicle Services: a booking
 * waits for its customer on its day and time (Lagos), a service carries on at
 * its stage, accepted before EJO; old numbers kept and searchable; nobody
 * emailed. A vehicle with an open job card, a collected service, a booking
 * without its day are refused; one open visit per vehicle. The front desk
 * checks a booking in; undo keeps that one and bins the rest, whole.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const D = String(Date.now()).slice(-7);
const vin = (n: number) => `JAANLR85ES${T.replace(/[IOQ]/g, 'X').padEnd(6, 'X').slice(0, 6)}${n}`;
const plate = (n: number) => `BKS ${D.slice(-5)} A${String.fromCharCode(65 + n)}`;
const bk = (n: number) => `BK-${D}-${n}`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');
/** A Lagos calendar day n days from now, as SAP writes it (dd.mm.yyyy), and as ISO. */
const lagosDay = (n: number) => new Date(Date.now() + 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
const sap = (iso: string) => iso.split('-').reverse().join('.');

let importUrl = '';
let customerId = '';

async function upload(page: Page, body: string, branchId: string): Promise<string> {
  await open(page, '/data-exchange/new?entity=openServices');
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-branch').selectOption(branchId);
  await page.locator('#import-file').setInputFiles({ name: `diary-${T}.csv`, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  return page.url();
}

test('the diary and the open services: refusals, the totals, approval and load — bookings on their day and time, services at their stage, old numbers kept', async ({ page }) => {
  const manager = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branchId: true } });
  const branchId = manager.branchId!;
  const org = await db().branch.findUniqueOrThrow({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } });
  const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@e2e.test' }, select: { id: true } });
  const customer = await db().customer.create({ data: { organisationId: org.businessUnit.organisationId, fullName: `Diary Cutover ${T}`, phone: `0806 ${D.slice(-7, -4)} ${D.slice(-4)}`, createdById: admin.id } });
  customerId = customer.id;
  const vehicles: string[] = [];
  for (const n of [1, 2, 3, 4]) vehicles.push((await db().customerVehicle.create({ data: { customerId, chassisNumber: vin(n), plateNumber: plate(n), make: 'Soueast', model: 'S07', year: 2025, vehicleType: 'PASSENGER', mileage: 9000 + n * 500, createdById: admin.id } })).id);
  // Vehicle 4 already has an open job card in EJO.
  const jc = await db().jobCard.create({ data: { jobNumber: `JC-E2E-${D}`, branchId, customerId, vehicleId: vehicles[3]!, createdById: admin.id } });
  const tech = await db().user.findUniqueOrThrow({ where: { email: who('technician').email }, select: { id: true, employeeId: true, fullName: true } });

  await as(page, 'it-administrator');
  importUrl = await upload(page, csv([
    ['Booking number', 'KUNUM', 'VHVIN', 'LICENSE_NUM', 'Stage', 'Booked for', 'Time', 'Checked in on', 'RECDV', 'Work requested', 'Technician', 'Notes', 'Branch'],
    [bk(1), '', vin(1), '', 'Booked', sap(lagosDay(5)), '10:30', '', '', 'Service 10,000 km; check the brakes', '', 'Customer will wait', 'Isolo Branch'],
    [bk(2), '', '', plate(2), '', sap(lagosDay(6)), '', '', '', 'Service 20,000 km', '', '', 'Isolo Branch'],
    [bk(3), '', vin(3), '', 'In service', '', '', sap(lagosDay(-2)), '10,900', 'Service; replace the wiper blades', tech.employeeId ?? tech.fullName, '', 'Isolo Branch'],
    [bk(4), '', vin(4), '', 'Booked', sap(lagosDay(7)), '09:00', '', '', 'Service', '', '', 'Isolo Branch'],
    [bk(5), '', vin(2), '', 'Collected', '', '', sap(lagosDay(-9)), '', 'Done last week', '', '', 'Isolo Branch'],
    [bk(6), '', vin(3), '', 'Booked', '', '', '', '', 'No day', '', '', 'Isolo Branch'],
    [bk(7), '', vin(1), '', 'Booked', sap(lagosDay(9)), '', '', '', 'The same vehicle again', '', '', 'Isolo Branch'],
  ]), branchId);
  await expect(page.getByText(new RegExp(`This vehicle already has an open visit in EJO \\(${jc.jobNumber}\\)`))).toBeVisible();
  await expect(page.getByText(/Stage “Collected”: a closed, collected or cancelled service is history/)).toBeVisible();
  await expect(page.getByText(/A booking needs its day \(Booked for\)/)).toBeVisible();
  await expect(page.getByText(/Same chassis number as row 2 of the file/)).toBeVisible();
  await expect(page.getByTestId('service-import-totals')).toContainText('2 bookings');
  await expect(page.getByTestId('service-import-totals')).toContainText('1 service already in the workshop');
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'workshop-manager');
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });

  const svcs = await db().vehicleService.findMany({ where: { customerId }, orderBy: { externalId: 'asc' }, include: { complaints: { orderBy: { sequenceNumber: 'asc' } } } });
  expect(svcs.map((s) => [s.externalId, s.status])).toEqual([[bk(1), 'SCHEDULED'], [bk(2), 'SCHEDULED'], [bk(3), 'IN_SERVICE']]);
  expect(svcs.every((s) => s.serviceNumber.startsWith('SV-') && s.externalSource === 'SAP' && s.importJobId && s.branchId === branchId)).toBe(true);
  const [b1, b2, s3] = svcs as [typeof svcs[number], typeof svcs[number], typeof svcs[number]];
  // 10:30 in Lagos is 09:30 UTC; no time is 09:00 Lagos.
  expect(b1.bookedFor?.toISOString()).toBe(`${lagosDay(5)}T09:30:00.000Z`);
  expect(b2.bookedFor?.toISOString()).toBe(`${lagosDay(6)}T08:00:00.000Z`);
  expect(b1.approvalStatus).toBe('PENDING');
  expect(b1.checkedInAt).toBeNull();
  expect(b1.complaints.map((c) => c.description)).toEqual(['Service 10,000 km', 'check the brakes']);
  expect(b1.approvalNotes).toMatch(/Booked before EJO: brought in from SAP \(booking .*\) by import .*\nCustomer will wait/);
  expect(s3.approvalStatus).toBe('APPROVED');
  expect(s3.assignedTechnicianId).toBe(tech.id);
  expect(s3.checkedInAt?.toISOString().slice(0, 10)).toBe(lagosDay(-2));
  expect(s3.workStartedAt).not.toBeNull();
  expect(s3.odometerAtService).toBe(10900);
  expect(await db().auditLog.count({ where: { action: { contains: 'notif' }, entityId: { in: svcs.map((s) => s.id) } } })).toBe(0);
});

test('the booking page says when the customer is expected and where it came from; the list shows the day; search finds the old number; the front desk checks it in', async ({ page }) => {
  const b1 = await db().vehicleService.findFirstOrThrow({ where: { customerId, externalId: bk(1) } });
  await as(page, 'receptionist');
  await open(page, `/workshop/vehicle-service/${b1.id}`);
  await expect(page.getByTestId('service-booking')).toContainText('Booked for');
  await expect(page.getByTestId('service-booking')).toContainText('Check the vehicle in when it arrives.');
  await expect(page.getByTestId('service-origin')).toContainText(`Brought in from SAP as booking ${bk(1)}.`);
  await open(page, `/workshop/vehicle-service?q=${encodeURIComponent(bk(1))}`);
  await expect(page.getByText(/^Booked /).first()).toBeVisible();
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(bk(1));
  await expect(box.locator('xpath=ancestor::div[2]').getByText(`SAP booking ${bk(1)} → ${b1.serviceNumber}`)).toBeVisible();
  // The customer arrives: the front desk checks the booking in.
  await open(page, `/workshop/vehicle-service/${b1.id}`);
  const odometer = page.locator('input[name="odometerAtService"]');
  if (await odometer.isVisible()) await odometer.fill('10120');
  await page.getByRole('button', { name: 'Check In Vehicle' }).click();
  await expect.poll(async () => (await db().vehicleService.findUniqueOrThrow({ where: { id: b1.id } })).status, { timeout: 20_000 }).toBe('CHECKED_IN');
});

test('undo: the booking checked in since stays (reported); the others go to the Recycle bin and one is restored whole', async ({ page }) => {
  await as(page, 'workshop-manager');
  page.on('dialog', (d) => void d.accept());
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  const left = await db().vehicleService.findMany({ where: { customerId }, select: { externalId: true } });
  expect(left.map((s) => s.externalId)).toEqual([bk(1)]);
  const binned = await db().recycleBinItem.findFirstOrThrow({ where: { entityType: 'VehicleService', restoredAt: null, label: { contains: `Diary Cutover ${T}` }, snapshot: { path: ['rows', '0', 'data', 'externalId'], equals: bk(2) } }, select: { reference: true, entityId: true } });
  await as(page, 'administrator');
  await open(page, '/recycle-bin?type=VehicleService');
  await page.getByTestId('bin-row').filter({ hasText: binned.reference }).first().getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  const back = await db().vehicleService.findUniqueOrThrow({ where: { id: binned.entityId }, include: { complaints: true } });
  expect(back.externalId).toBe(bk(2));
  expect(back.bookedFor?.toISOString()).toBe(`${lagosDay(6)}T08:00:00.000Z`);
  expect(back.complaints.length).toBe(1);
});
