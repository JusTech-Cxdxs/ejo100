import { test, expect, type Page } from '@playwright/test';
import { as, uniq } from './helpers';
import { db } from './db';
import { writeXlsx } from '../lib/data-exchange/xlsx-writer';

/**
 * Data Exchange (v-A1): existing customers and vehicles brought in from SAP
 * and spreadsheets — read in the browser, staged, checked (nothing live
 * changes), approved by a second person, loaded in batches, reported,
 * and undone. The person who prepares an import cannot approve it, the
 * front desk cannot open it, and nothing is ever duplicated.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq().toLowerCase();
const T = tag.replace(/[^a-z0-9]/g, '').slice(-6).toUpperCase();
// SAP-style customer numbers, unique to this run (from the clock), never reused by a later run.
const STAMP = String(Date.now()).slice(-8);
const kunnr = (n: number) => `9${STAMP}${n}`;
// Phones unique to this run too (a phone already on file makes a row a possible duplicate, held back by design).
const phone = (n: number) => `080${n} ${STAMP.slice(1, 4)} ${STAMP.slice(4, 8)}`;
const ADA = `Ada Importa ${T}`;
const MUSA = `Musa Noemail ${T}`;

/** A customers file as SAP writes it: SAP field names, leading zeros, a rejected row and a duplicate. */
function customersCsv(): string {
  const rows = [
    ['KUNNR', 'NAME1', 'NAME2', 'TELF1', 'SMTP_ADDR', 'STRAS', 'ORT01'],
    [`000${kunnr(1)}`, ADA, '', phone(1), `ada.${tag}@e2e.test`, 'Plot 3, Cheesebrough Road', 'Isolo'],
    [kunnr(2), MUSA, '', phone(2), '', 'Oshodi Road', 'Lagos'],
    [kunnr(3), '', '', phone(3), '', '', ''],
    [kunnr(1), `${ADA} again`, '', '', '', '', ''],
    [kunnr(4), `Fleet Co ${T}`, 'Logistics Ltd', phone(4), `fleet.${tag}@e2e.test`, 'Apapa Wharf', 'Lagos'],
  ];
  return rows.map((r) => r.map((c) => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
}

/** A vehicles workbook (.xlsx) linked to the customers by their SAP numbers. */
function vehiclesXlsx(): Buffer {
  const vin = (n: number) => `JAANLR85EL${T.replace(/[IOQ]/g, 'X').padEnd(6, 'X').slice(0, 6)}${n}`.slice(0, 17).padEnd(17, '0');
  return Buffer.from(writeXlsx([{
    name: 'Vehicles',
    header: true,
    rows: [
      ['Customer number', 'VIN', 'Plate', 'Make', 'Model', 'Year', 'Mileage'],
      [kunnr(1), vin(1), `IMP ${T.slice(0, 3)} 1A`, 'Isuzu', 'NQR 71', 2024, 45200],
      [kunnr(2), vin(2), '', 'Soueast', 'S07', 2025, 1200],
      ['99999999', vin(3), '', 'Isuzu', 'NPR', 2023, ''],
    ],
  }]));
}

async function startImport(page: Page, entity: 'customers' | 'vehicles', file: { name: string; mimeType: string; buffer: Buffer }): Promise<string> {
  await page.goto(`/data-exchange/new?entity=${entity}`);
  await expect(page.getByRole('heading', { name: `Import ${entity}` })).toBeVisible();
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-file').setInputFiles(file);
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  return page.url();
}

async function checkFile(page: Page) {
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
}

async function loadAndReport(page: Page) {
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
}

let customersUrl = '';
let vehiclesUrl = '';

test('customers from an SAP export: columns match themselves, the check rejects what is wrong, nothing live changes yet', async ({ page }) => {
  await as(page, 'it-administrator');
  customersUrl = await startImport(page, 'customers', { name: `sap-customers-${T}.csv`, mimeType: 'text/csv', buffer: Buffer.from(customersCsv()) });
  // SAP field names were matched on upload.
  await expect(page.locator('#map-externalId')).toHaveValue('0');
  await expect(page.locator('#map-fullName')).toHaveValue('1');
  await expect(page.locator('#map-name2')).toHaveValue('2');
  await expect(page.locator('#map-phone')).toHaveValue('3');
  await expect(page.locator('#map-email')).toHaveValue('4');
  await checkFile(page);
  await expect(page.getByText('Name is required.')).toBeVisible();
  await expect(page.getByText('Same customer number as row 2 of the file; only the first is loaded.')).toBeVisible();
  await expect(page.locator('body')).toContainText('Ready to load');
  // Nothing is in the customer records yet.
  expect(await db().customer.count({ where: { fullName: { startsWith: ADA } } })).toBe(0);
  // The rejects file: the file's own columns plus the problem, to fix in Excel.
  const href = await page.getByRole('link', { name: /Rejected rows/ }).getAttribute('href');
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('Problem or note');
  expect(text).toContain('Name is required.');
  expect(text).toContain(`${ADA} again`);
  expect(text).not.toContain(MUSA);
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await expect(page.getByRole('heading', { name: 'Approval' })).toBeVisible();
  // Group IT prepares; it does not approve.
  await expect(page.getByText(/the person who prepared an import cannot approve it/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('the front desk cannot open Data Exchange; the manager approves, it loads, and the report adds up', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto('/data-exchange');
  await expect(page).toHaveURL(/access-denied/);
  await expect(page.getByRole('link', { name: 'Data Exchange' })).toHaveCount(0);

  await as(page, 'workshop-manager');
  await page.goto(customersUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('heading', { name: 'Load' })).toBeVisible();
  await loadAndReport(page);
  await expect(page.getByText('5 rows in the file = 3 added + 0 filled in + 0 not added + 2 rejected.')).toBeVisible();
  const ada = await db().customer.findFirst({ where: { fullName: ADA }, select: { email: true, externalSource: true, externalId: true, address: true, importJobId: true } });
  expect(ada).toMatchObject({ email: `ada.${tag}@e2e.test`, externalSource: 'SAP', externalId: kunnr(1), address: 'Plot 3, Cheesebrough Road, Isolo' });
  expect(ada?.importJobId).toBeTruthy();
  // A customer with no email is a full record — and never given a made-up address.
  const musa = await db().customer.findFirst({ where: { fullName: MUSA }, select: { email: true, phone: true } });
  expect(musa).toEqual({ email: null, phone: phone(2) });
  // The organisation keeps its company details.
  const fleet = await db().customer.findFirst({ where: { externalId: kunnr(4) }, select: { fullName: true, customerType: true } });
  expect(fleet?.fullName).toBe(`Fleet Co ${T} Logistics Ltd`);
});

test('the same file again adds nothing twice', async ({ page }) => {
  await as(page, 'it-administrator');
  await startImport(page, 'customers', { name: `sap-customers-${T}-again.csv`, mimeType: 'text/csv', buffer: Buffer.from(customersCsv()) });
  await expect(page.getByText(/The same file was imported before as IMP-/)).toBeVisible();
  await checkFile(page);
  // Every loadable row is recognised as an existing customer.
  await expect(page.getByText(`Already a customer`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel this import' }).click();
  await expect(page.getByText('This import was cancelled. Nothing from it was loaded.')).toBeVisible();
  expect(await db().customer.count({ where: { fullName: ADA } })).toBe(1);
});

test('vehicles from an Excel workbook link to their customers; an unknown customer is rejected', async ({ page }) => {
  await as(page, 'it-administrator');
  vehiclesUrl = await startImport(page, 'vehicles', { name: `vehicles-${T}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: vehiclesXlsx() });
  await checkFile(page);
  await expect(page.getByText('The customer was not found. Import the customers file first, or check the customer number, email or phone.')).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();

  await as(page, 'workshop-manager');
  await page.goto(vehiclesUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  await loadAndReport(page);
  const nqr = await db().customerVehicle.findFirst({ where: { customer: { externalId: kunnr(1) } }, select: { model: true, year: true, mileage: true, vehicleType: true } });
  expect(nqr).toEqual({ model: 'NQR 71', year: 2024, mileage: 45200, vehicleType: 'COMMERCIAL' });
  const s07 = await db().customerVehicle.findFirst({ where: { customer: { externalId: kunnr(2) } }, select: { vehicleType: true } });
  expect(s07?.vehicleType).toBe('PASSENGER');
});

test('undo moves exactly what each import added to the Recycle bin (vehicles first, then customers)', async ({ page }) => {
  await as(page, 'workshop-manager');
  page.on('dialog', (d) => void d.accept());
  // The vehicles first (their own import), then the customers they belonged to.
  await page.goto(vehiclesUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect(await db().customerVehicle.count({ where: { customer: { externalId: { in: [kunnr(1), kunnr(2)] } } } })).toBe(0);
  await page.goto(customersUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect(await db().customer.count({ where: { externalId: { in: [kunnr(1), kunnr(2), kunnr(4)] } } })).toBe(0);
  // Nothing is lost: each record is its own Recycle bin item, with the import named as the reason.
  const number = (await page.getByRole('heading', { level: 1 }).first().textContent())!.split(' ')[0]!;
  const items = await db().recycleBinItem.findMany({ where: { reason: `Undo of import ${number}`, restoredAt: null }, select: { reference: true } });
  expect(items.map((i) => i.reference).sort()).toEqual([ADA, `Fleet Co ${T} Logistics Ltd`, MUSA].sort());
  // …and the administrator restores one from the bin, with its SAP number back.
  await as(page, 'administrator');
  await page.goto('/recycle-bin');
  const row = page.getByTestId('bin-row').filter({ hasText: MUSA }).first();
  await expect(row).toContainText(`Undo of import ${number}`);
  // (the confirmation is accepted by the dialog handler set at the start of this test)
  await row.getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  expect(await db().customer.findFirst({ where: { fullName: MUSA }, select: { externalId: true, email: true } })).toEqual({ externalId: kunnr(2), email: null });
});

test('templates download as Excel (with instructions) and CSV', async ({ page }) => {
  await as(page, 'it-administrator');
  const xlsx = await page.request.get('/data-exchange/templates/customers');
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
  const bytes = await xlsx.body();
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  const csv = await page.request.get('/data-exchange/templates/vehicles?format=csv');
  expect(await csv.text()).toContain('Chassis number (VIN)');
});
