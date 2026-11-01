import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * One label per vehicle, tied to its VIN: a QR code that opens the vehicle's
 * page and a Code 128 barcode of the VIN. Scanning either (or typing the VIN
 * in search) opens the one vehicle page — kit arrival to latest visit —
 * signed in and permission-checked. The label, traveller sheet and PDI
 * certificate print with the same codes; every print is recorded.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-10);
const PLANT = `JALFRR9${STAMP}`; // still in the plant: register rows only, no customer
const SOLD = `LNBSCB3${STAMP.slice(0, 9)}7`; // sold: a customer's vehicle
const FAILING = `MPATFS8${STAMP.slice(0, 9)}5`; // PDI failed and not passed since

test('set up: a vehicle in the plant, one sold, one with a failed PDI', async () => {
  const organisationId = (await db().user.findUniqueOrThrow({ where: { email: who('administrator').email }, select: { organisationId: true } })).organisationId!;
  const row = (vin: string, kind: string, date: string, stage: string, result: string) => ({ organisationId, vin, vinKey: vin, kind, eventDate: new Date(`${date}T00:00:00Z`), stage, result, inspector: 'Plant Inspector', model: 'Isuzu NQR 75', dedupeKey: `${vin}|${kind}|${stage}|${date}` });
  await db().vehicleHistoryRecord.createMany({ data: [
    row(PLANT, 'PRODUCTION', '2026-09-01', 'Kit arrival — case check', 'PASS'),
    row(PLANT, 'PRODUCTION', '2026-09-03', 'Chassis line', 'PASS'),
    row(PLANT, 'QC', '2026-09-05', 'Final QA gate', 'FAIL'),
    row(PLANT, 'QC', '2026-09-06', 'Final QA gate', 'PASS'),
    row(PLANT, 'PDI', '2026-09-08', 'Brakes', 'PASS'),
    row(PLANT, 'PDI', '2026-09-08', 'Electrics', 'PASS'),
    row(SOLD, 'PDI', '2026-08-02', 'Brakes', 'PASS'),
    row(FAILING, 'PDI', '2026-09-10', 'Electrics', 'FAIL'),
  ] });
  const customer = await db().customer.create({ data: { organisationId, fullName: `Label Haulage ${STAMP}`, phone: `0802${STAMP.slice(-7)}` } });
  await db().customerVehicle.create({ data: { customerId: customer.id, make: 'Isuzu', model: 'NPR', year: 2026, plateNumber: `LND${STAMP.slice(-3)}KJ`, chassisNumber: SOLD } });
});

test('scanning the QR code (signed out → sign in → back) opens the vehicle’s one page', async ({ page }) => {
  // Signed out: the address sends the person to sign in, and back here after.
  await page.context().clearCookies();
  await page.goto(`/v/${PLANT.toLowerCase()}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?redirect=%2Fv%2F${PLANT.toLowerCase()}`));
  await as(page, 'workshop-manager');
  await open(page, `/v/${PLANT.toLowerCase()}`);
  await expect(page).toHaveURL(new RegExp(`/vehicles/${PLANT}$`));
  await expect(page.getByRole('heading', { name: PLANT, level: 1 })).toBeVisible();
  await expect(page.getByText('Isuzu NQR 75').first()).toBeVisible();
  await expect(page.getByRole('img', { name: `QR code: opens the page of vehicle ${PLANT}` })).toBeVisible();
  await expect(page.getByRole('img', { name: `Barcode of the VIN ${PLANT}` })).toBeVisible();
  // Every stage, in order; the QA failure was passed since; nothing sold yet.
  const life = page.locator('li', { hasText: 'Quality audit' }).first();
  await expect(life.getByText('Done')).toBeVisible();
  await expect(page.locator('li', { hasText: 'Kit arrival and QC' }).first().getByText('Kit arrival — case check')).toBeVisible();
  await expect(page.locator('li', { hasText: 'Pre-delivery inspection' }).first().getByText('Electrics')).toBeVisible();
  await expect(page.getByText('Not sold yet')).toBeVisible();
});

test('a typed or scanned VIN in search opens the same page — even before results arrive', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(PLANT);
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/vehicles/${PLANT}$`));
  // The results list names it too, first, as not sold yet.
  await open(page, '/dashboard');
  await box.fill(SOLD.toLowerCase());
  const panel = box.locator('xpath=ancestor::div[2]');
  await expect(panel.getByText(`VIN ${SOLD}`)).toBeVisible();
  await expect(panel.getByText(/Isuzu NPR/).first()).toBeVisible();
});

test('the label, traveller sheet and PDI certificate print with the same codes; each print is counted', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, `/vehicles/${PLANT}`);
  await expect(page.getByText('Label and papers not printed yet.')).toBeVisible();
  for (const size of ['windscreen', 'door-jamb']) {
    await page.goto(`/print/vehicle-label/${PLANT}?size=${size}`);
    await expect(page.locator(`[data-label="${size}"]`)).toBeVisible();
    await expect(page.getByRole('img', { name: `QR code: opens the page of vehicle ${PLANT}` })).toBeVisible();
    await expect(page.getByRole('img', { name: `Barcode of the VIN ${PLANT}` })).toBeVisible();
  }
  await page.goto(`/print/vehicle-traveller/${PLANT}`);
  await expect(page.getByText('Vehicle Traveller Sheet')).toBeVisible();
  await expect(page.getByText('Chassis line')).toBeVisible();
  await expect(page.getByText('Plant Inspector').first()).toBeVisible();
  await page.goto(`/print/pdi-certificate/${PLANT}`);
  await expect(page.getByText('Pre-Delivery Inspection Certificate')).toBeVisible();
  await expect(page.getByText('This vehicle has passed its pre-delivery inspection')).toBeVisible();
  await expect(page.getByText('NOT A CERTIFICATE')).toHaveCount(0);
  await expect(page.getByText('Plant Inspector')).toHaveCount(0); // the customer's paper names no staff
  await page.goto(`/print/pdi-certificate/${FAILING}`);
  await expect(page.getByText(/NOT A CERTIFICATE/)).toBeVisible();
  expect(await db().auditLog.count({ where: { action: 'vehicle.label_printed', entityId: PLANT } })).toBe(4);
  await open(page, `/vehicles/${PLANT}`);
  await expect(page.getByText(/Label and papers printed 4 times/)).toBeVisible();
  // Each paper counts its own reprints: the windscreen label printed once more says "reprint 1".
  await page.goto(`/print/vehicle-label/${PLANT}?size=windscreen`);
  await expect(page.locator('[data-label="windscreen"]').getByText(/reprint 1$/)).toBeVisible();
});

test('only the people who label vehicles print; each part of the page for those who may see it', async ({ page }) => {
  // A technician opens the vehicle but prints nothing.
  await as(page, 'technician');
  await open(page, `/vehicles/${PLANT}`);
  await expect(page.getByRole('heading', { name: PLANT, level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Windscreen label' })).toHaveCount(0);
  await page.goto(`/print/vehicle-label/${PLANT}`);
  await expect(page.getByText('Printing vehicle labels is not part of your role.')).toBeVisible();
  // Security at the gate opens it too; the customer's name is for the CRM.
  await as(page, 'security-officer');
  await open(page, `/vehicles/${SOLD}`);
  await expect(page.getByText('Sold (customer details are for the CRM)')).toBeVisible();
  await expect(page.getByText(`Label Haulage ${STAMP}`)).toHaveCount(0);
  // The workshop manager sees the customer, and the way to the workshop record.
  await as(page, 'workshop-manager');
  await open(page, `/vehicles/${SOLD}`);
  await expect(page.getByRole('link', { name: `Label Haulage ${STAMP}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Registered to Label Haulage ${STAMP}` })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Workshop record' })).toBeVisible();
  await page.getByRole('link', { name: 'Workshop record' }).click();
  await expect(page.getByRole('link', { name: 'Vehicle page and label' })).toBeVisible();
  // A VIN EJO has never seen.
  await open(page, '/vehicles/ZZZZZZ12345678901');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
