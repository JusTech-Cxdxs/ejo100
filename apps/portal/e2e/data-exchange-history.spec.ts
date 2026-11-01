import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * Data Exchange A3: SAP history feeding EJO's own pages. A customer's SAP
 * creation date becomes "customer since"; SAP invoices from before EJO load
 * as read-only history that counts in the customer's spend and visits (and
 * the analytics), Finance confirms the totals, and undo voids them (nothing
 * deleted; a reload restores them). The plant's PDI register shows on the
 * vehicle by its VIN.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const kunnr = `00077${T.replace(/\D/g, '7').padEnd(5, '7').slice(0, 5)}`;
const vin = `JAANLR85EL${T.replace(/[IOQ]/g, 'X').padEnd(7, 'X').slice(0, 7)}`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');

async function managerBranch(): Promise<string> {
  const u = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branchId: true } });
  return u.branchId!;
}

async function upload(page: Page, entity: string, name: string, body: string, opts: { branchId?: string; kind?: string } = {}): Promise<string> {
  await open(page, `/data-exchange/new?entity=${entity}`);
  await expect(page.locator('#import-file')).toHaveCount(1);
  if (opts.branchId) await page.locator('#import-branch').selectOption(opts.branchId);
  if (opts.kind) await page.locator('#import-kind').selectOption(opts.kind);
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  return page.url();
}

async function approveAndLoad(page: Page, url: string) {
  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
}

let customerId = '';
let invoicesUrl = '';

test('a customer from SAP: ERDAT becomes “customer since”, years before the import', async ({ page }) => {
  await as(page, 'it-administrator');
  const url = await upload(page, 'customers', `kna1-${T}.csv`, csv([
    ['KUNNR', 'NAME1', 'TELF1', 'STRAS', 'ORT01', 'ERDAT'],
    [kunnr, `Lekki Haulage ${T}`, `0809 ${T.replace(/\D/g, '5').padEnd(3, '5').slice(0, 3)} 4401`, '12 Admiralty Way', 'Lagos', '20140602'],
  ]));
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await approveAndLoad(page, url);
  const c = await db().customer.findFirstOrThrow({ where: { externalId: kunnr.replace(/^0+/, '') }, select: { id: true, customerSince: true } });
  customerId = c.id;
  expect(c.customerSince?.toISOString().slice(0, 10)).toBe('2014-06-02');
  // A vehicle of theirs, registered at the front desk (its VIN links the SAP invoices and the PDI register).
  await db().customerVehicle.create({ data: { customerId, chassisNumber: vin, make: 'Isuzu', model: 'NQR', year: 2024 } });
  await open(page, `/crm/customers/${customerId}`);
  await expect(page.getByText(/Customer since 02\/06\/2014 \(from SAP, customer \d+\)/)).toBeVisible();
});

test('SAP invoices: totals before approval, read-only history in the customer’s spend, Finance confirms', async ({ page }) => {
  const branchId = await managerBranch();
  await as(page, 'it-administrator');
  invoicesUrl = await upload(page, 'invoices', `vbrk-${T}.csv`, csv([
    ['VBELN', 'FKDAT', 'KUNAG', 'NETWR', 'MWSBK', 'WAERK', 'VHVIN', 'FKART', 'ARKTX'],
    [`009${T.replace(/\D/g, '1').padEnd(5, '1').slice(0, 5)}01`, '14.03.2023', kunnr, '400000.00', '30000.00', 'NGN', vin, 'F2', 'Service 40,000 km'],
    [`009${T.replace(/\D/g, '1').padEnd(5, '1').slice(0, 5)}02`, '05.09.2024', kunnr, '250000.00', '', 'NGN', vin, 'F2', 'Brake pads and discs'],
    [`009${T.replace(/\D/g, '1').padEnd(5, '1').slice(0, 5)}03`, '06.09.2024', kunnr, '20000-', '', 'NGN', '', 'G2', 'Credit: discount'],
    ['', '06.09.2024', kunnr, '1000', '', 'NGN', '', 'F2', 'no number'],
    [`009${T.replace(/\D/g, '1').padEnd(5, '1').slice(0, 5)}04`, '06.09.2024', '0009999999', '1000', '', 'NGN', '', 'F2', 'unknown customer'],
    [`009${T.replace(/\D/g, '1').padEnd(5, '1').slice(0, 5)}05`, '06.09.2024', kunnr, '1000', '', 'USD', '', 'F2', 'dollars'],
  ]), { branchId });
  await expect(page.getByText('Invoice number is required (SAP VBELN or BELNR).')).toBeVisible();
  await expect(page.getByText(/The customer was not found/)).toBeVisible();
  await expect(page.getByText(/Only naira invoices are loaded/)).toBeVisible();
  // 430,000 + 250,000 − 20,000 = 660,000 on three invoices, March 2023 to September 2024.
  await expect(page.getByText(/3 invoices · ₦660,000\.00 · dated 14 Mar 2023 to 6 Sept? 2024/)).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await approveAndLoad(page, invoicesUrl);
  await expect(page.getByText(/Invoice history now in EJO 100 from this import: ₦660,000\.00 on 3 invoices/)).toBeVisible();
  const linked = await db().historicalInvoice.count({ where: { customerId, vehicleId: { not: null }, voidedAt: null } });
  expect(linked).toBe(2);
  // Finance confirms the totals (the manager approved, so cannot).
  await expect(page.getByText('Waiting for Finance to confirm the totals.')).toBeVisible();
  await as(page, 'finance-officer');
  await open(page, invoicesUrl);
  await page.getByRole('button', { name: 'Confirm the totals (Finance)' }).click();
  await expect(page.getByText(/Totals confirmed by .* \(Finance\)/)).toBeVisible();
  // The customer: lifetime spend and visits include SAP, marked; the invoices are listed read-only.
  await as(page, 'workshop-manager');
  await open(page, `/crm/customers/${customerId}`);
  await expect(page.getByText('Incl. ₦660,000 from SAP, before EJO')).toBeVisible();
  await open(page, `/crm/customers/${customerId}?tab=jobs`);
  await expect(page.getByRole('heading', { name: 'From SAP, before EJO (3)' })).toBeVisible();
  await expect(page.getByText('From SAP, before EJO').nth(1)).toBeVisible();
});

test('the PDI register shows on the vehicle by its VIN', async ({ page }) => {
  await as(page, 'it-administrator');
  const url = await upload(page, 'registers', `pdi-${T}.csv`, csv([
    ['VIN', 'Date', 'Model', 'Station', 'Result', 'Inspected by', 'Remarks'],
    [vin, '11/03/2024', 'NQR', 'Final inspection', 'OK', 'A. Bello', 'Door seal replaced before release'],
    [vin, '11/03/2024', 'NQR', 'Road test', 'Pass', 'A. Bello', ''],
    ['', '11/03/2024', 'NQR', 'Road test', 'Pass', 'A. Bello', ''],
  ]), { kind: 'PDI' });
  await expect(page.getByText('Chassis number (VIN) is required.')).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await approveAndLoad(page, url);
  const vehicle = await db().customerVehicle.findFirstOrThrow({ where: { chassisNumber: vin }, select: { id: true } });
  await open(page, `/workshop/vehicles/${vehicle.id}/edit`);
  await expect(page.getByRole('heading', { name: 'Before EJO 100' })).toBeVisible();
  await expect(page.getByText('Pre-delivery inspection · Final inspection')).toBeVisible();
  await expect(page.getByText('Door seal replaced before release')).toBeVisible();
  await expect(page.getByText(/Invoices from SAP \(₦680,000\)/)).toBeVisible();
});

test('undo voids the invoice history (spend goes back down); reopening and loading restores it', async ({ page }) => {
  await as(page, 'workshop-manager');
  page.on('dialog', (d) => void d.accept());
  await open(page, invoicesUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect(await db().historicalInvoice.count({ where: { customerId, voidedAt: null } })).toBe(0);
  expect(await db().historicalInvoice.count({ where: { customerId } })).toBe(3);
  await open(page, `/crm/customers/${customerId}`);
  await expect(page.getByText(/from SAP, before EJO/)).toHaveCount(0);
  // Reopen, check and load again: the same three rows come back (never a second copy).
  await as(page, 'it-administrator');
  await open(page, invoicesUrl);
  await page.getByRole('button', { name: /Reopen: check and load this file again/ }).click();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await approveAndLoad(page, invoicesUrl);
  expect(await db().historicalInvoice.count({ where: { customerId, voidedAt: null } })).toBe(3);
  expect(await db().historicalInvoice.count({ where: { customerId } })).toBe(3);
});
