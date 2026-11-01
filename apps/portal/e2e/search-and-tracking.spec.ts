import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * Search and tracking: a record is found by the number SAP gave it, every
 * match labelled with its kind (and, for SAP documents, its year — SAP reuses
 * numbers across fiscal years); each record says where it came from; the
 * lists filter by source, import and dates; Data Exchange shows its days;
 * dashboards can leave the history from before EJO out.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const STAMP = String(Date.now()).slice(-7);
const kunnr = `7${STAMP}`; // a fresh SAP customer number for this run
const belnr = `5${STAMP.slice(-6)}`; // an SAP document number reused in two fiscal years
const NAME = `Tracked Haulage ${T}`;
const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\r\n');

async function importFile(page: Page, entity: string, name: string, body: string, opts: { branchId?: string } = {}): Promise<string> {
  await as(page, 'it-administrator');
  await open(page, `/data-exchange/new?entity=${entity}`);
  await expect(page.locator('#import-file')).toHaveCount(1);
  if (opts.branchId) await page.locator('#import-branch').selectOption(opts.branchId);
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  const url = page.url();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  return url;
}

async function search(page: Page, q: string) {
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(q);
  const panel = box.locator('xpath=ancestor::div[2]');
  await expect(panel.getByRole('listbox', { name: 'Search results' }).or(panel.getByText(/^Nothing found for/)).first()).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Searching' })).toHaveCount(0);
  return panel;
}

let customerId = '';
let importNumber = '';

test('imported from SAP: the customer and two invoices with the same SAP number in different years', async ({ page }) => {
  const url = await importFile(page, 'customers', `kna1-${T}.csv`, csv([
    ['KUNNR', 'NAME1', 'TELF1', 'STRAS', 'ORT01', 'ERDAT'],
    [`000${kunnr}`, NAME, `0815 ${STAMP.slice(0, 3)} ${STAMP.slice(3, 7)}`, '4 Creek Road', 'Apapa', '20110915'],
  ]));
  const job = await db().importJob.findUniqueOrThrow({ where: { id: url.split('/').pop()! }, select: { number: true } });
  importNumber = job.number;
  customerId = (await db().customer.findFirstOrThrow({ where: { externalId: kunnr }, select: { id: true } })).id;
  const branchId = (await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branchId: true } })).branchId!;
  await importFile(page, 'invoices', `bsid-${T}.csv`, csv([
    ['BELNR', 'BUKRS', 'GJAHR', 'BUDAT', 'KUNNR', 'DMBTR', 'SGTXT'],
    [belnr, '1000', '2024', '10.05.2024', kunnr, '125000.00', 'Service 20,000 km'],
    [belnr, '1000', '2025', '12.06.2025', kunnr, '98000.00', 'Brake pads'],
  ]), { branchId });
  expect(await db().historicalInvoice.count({ where: { invoiceNumber: belnr, customerId, voidedAt: null } })).toBe(2);
});

test('search by the SAP number: every match labelled; a year narrows it; SAP’s zeros are understood', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, '/dashboard');
  let panel = await search(page, `000${kunnr}`);
  await expect(panel.getByText(`SAP customer ${kunnr}`)).toBeVisible();
  await expect(panel.getByText(NAME).first()).toBeVisible();
  panel = await search(page, belnr);
  await expect(panel.getByText(`SAP invoice ${belnr} · 2025`)).toBeVisible();
  await expect(panel.getByText(`SAP invoice ${belnr} · 2024`)).toBeVisible();
  panel = await search(page, `${belnr} 2025`);
  await expect(panel.getByText(`SAP invoice ${belnr} · 2025`)).toBeVisible();
  await expect(panel.getByText(`SAP invoice ${belnr} · 2024`)).toHaveCount(0);
  // The front desk without the CRM still finds the customer; the invoices are for the CRM.
  await as(page, 'receptionist');
  await open(page, '/dashboard');
  panel = await search(page, kunnr);
  await expect(panel.getByText(`SAP customer ${kunnr}`)).toBeVisible();
  await expect(panel.getByText(`SAP invoice ${belnr}`)).toHaveCount(0);
});

test('the customer page says where it came from: imported from SAP by IMP-…, with its SAP number and customer-since date', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, `/crm/customers/${customerId}`);
  const box = page.getByRole('region', { name: 'Where this came from' }).or(page.locator('section[aria-labelledby="provenance"]'));
  await expect(box.getByText('Imported from SAP')).toBeVisible();
  await expect(box.getByRole('link', { name: importNumber })).toBeVisible();
  await expect(box.getByText(kunnr)).toBeVisible();
  await expect(box.getByText('15/09/2011')).toBeVisible();
});

test('the customer list filters by source, import, and both dates', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, `/crm?source=sap&imp=${encodeURIComponent(importNumber.toLowerCase())}&originalTo=2012-12-31`);
  await expect(page.getByText(NAME)).toBeVisible();
  await open(page, `/crm?source=ejo&q=${encodeURIComponent(NAME)}`);
  await expect(page.getByText(NAME)).toHaveCount(0);
  await open(page, `/crm?source=sap&originalFrom=2015-01-01&q=${encodeURIComponent(NAME)}`);
  await expect(page.getByText(NAME)).toHaveCount(0);
});

test('Data Exchange, day by day; dashboards with or without the history from before EJO', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/data-exchange/timeline');
  await expect(page.getByRole('link', { name: importNumber }).first()).toBeVisible();
  await open(page, '/headquarters?period=this_year');
  await expect(page.getByRole('link', { name: 'EJO only' })).toBeVisible();
  await page.getByRole('link', { name: 'EJO only' }).click();
  await expect(page).toHaveURL(/history=exclude/);
  await expect(page.getByText(/Invoiced in SAP before EJO 100, dated in this period/)).toHaveCount(0);
});
