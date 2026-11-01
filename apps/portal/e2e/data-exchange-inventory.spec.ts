import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * Data Exchange A2: the Store's records from SAP — suppliers, the parts
 * catalogue (material master) and the opening stock with its value, loaded
 * as an opening-balance goods receipt that the inventory figures count.
 * Group IT prepares, the Store Manager approves, Finance confirms the value,
 * and the opening stock can be reversed while nothing has been issued.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');
const pn = (n: number) => `E2E-${T}-${n}`;

async function storeBranchId(): Promise<string> {
  const u = await db().user.findUniqueOrThrow({ where: { email: who('store-manager').email }, select: { branchId: true } });
  return u.branchId!;
}

async function upload(page: Page, entity: string, name: string, body: string, opts: { branchId?: string } = {}): Promise<string> {
  await open(page, `/data-exchange/new?entity=${entity}`);
  // The page settles first (while it is still arriving the picker can briefly appear twice).
  if (opts.branchId) { await expect(page.locator('#import-branch')).toHaveCount(1); await page.locator('#import-branch').selectOption(opts.branchId); }
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  return page.url();
}

async function approveAndLoad(page: Page, url: string) {
  await as(page, 'store-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
}

let stockUrl = '';

test('suppliers from the SAP vendor list: the Store Manager approves; the Suppliers page lists them', async ({ page }) => {
  await as(page, 'it-administrator');
  const url = await upload(page, 'suppliers', `vendors-${T}.csv`, csv([
    ['LIFNR', 'NAME1', 'NAME2', 'TELF1', 'SMTP_ADDR'],
    [`00003${T.replace(/\D/g, '1').slice(0, 4)}1`, `Isuzu Parts ${T}`, 'Africa', '+234 1 270 1000', `parts.${T.toLowerCase()}@example.com`],
    ['', '', '', '', ''],
    [`00003${T.replace(/\D/g, '1').slice(0, 4)}2`, '', '', '', ''],
  ]));
  await expect(page.getByText('Name is required.')).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await approveAndLoad(page, url);
  await open(page, `/inventory/suppliers?q=${encodeURIComponent(`Isuzu Parts ${T}`)}`);
  await expect(page.getByText(`Isuzu Parts ${T} Africa`)).toBeVisible();
});

test('parts from the SAP material master: units translated, batch parts, an alternative unit; the list pages', async ({ page }) => {
  const branchId = await storeBranchId();
  await as(page, 'it-administrator');
  const url = await upload(page, 'parts', `material-master-${T}.csv`, csv([
    ['MATNR', 'MAKTX', 'MATKL', 'MEINS', 'XCHPF', 'VKP', 'MINBE', 'MEINH', 'UMREZ'],
    [pn(1), `Brake pad set ${T}`, 'BRAKES', 'ST', '', '45000', '4', '', ''],
    [pn(2), `Engine oil 15W-40 ${T}`, 'LUBES', 'L', 'X', '4200', '200', 'DR', '208'],
    [pn(3), `Oil filter ${T}`, 'FILTERS', 'EA', '', '6500', '10', '', ''],
    [pn(1), 'Same part twice', '', 'ST', '', '', '', '', ''],
    ['', 'No number', '', 'ST', '', '', '', '', ''],
  ]), { branchId });
  await expect(page.getByText('Part number is required.')).toBeVisible();
  await expect(page.getByText(/Same part number.* as row 2 of the file/)).toBeVisible();
  // Only the Store Manager (or an administrator) approves parts: not Group IT.
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await approveAndLoad(page, url);
  const oil = await db().part.findFirstOrThrow({ where: { branchId, partNumber: pn(2) }, select: { baseUnitOfMeasure: true, trackingType: true, externalSource: true, externalId: true, alternativeUnits: { select: { unitName: true, conversionFactor: true } } } });
  expect(oil).toMatchObject({ baseUnitOfMeasure: 'Litre', trackingType: 'BATCH', externalSource: 'SAP', externalId: pn(2) });
  expect(oil.alternativeUnits.map((u) => [u.unitName, Number(u.conversionFactor)])).toEqual([['Drum', 208]]);
  // The catalogue is paged, and finds the imported parts.
  await open(page, `/inventory/parts?q=${encodeURIComponent(T)}`);
  // (While the page streams in, React holds a hidden copy for a moment: wait for the one that stays.)
  await expect(page.getByText(/Showing 1–3 of 3 parts/)).toHaveCount(1);
  await expect(page.getByText(/Showing 1–3 of 3 parts/)).toBeVisible();
});

test('opening stock: totals before approval, an opening-balance receipt at the cut-over date, the value Finance confirms', async ({ page }) => {
  const branchId = await storeBranchId();
  await as(page, 'it-administrator');
  stockUrl = await upload(page, 'stock', `opening-stock-${T}.csv`, csv([
    ['MATNR', 'LABST', 'MEINS', 'SALK3', 'VERPR', 'CHARG', 'LGORT'],
    [pn(1), 12, 'ST', '540,000.00', '45000', '', '0001'],
    [pn(2), 2, 'DR', '', '873600', 'B-2026-001', '0001'],
    [pn(3), '5-', 'EA', '0', '', '', '0001'],
    ['NOT-IN-CATALOGUE', 4, 'ST', '20000', '', '', '0001'],
    [pn(3), 30, 'EA', '', '', '', '0002'],
  ]), { branchId });
  await expect(page.getByText(/Negative stock/)).toBeVisible();
  await expect(page.getByText(/is not in this branch’s catalogue/)).toBeVisible();
  await expect(page.getByText(/No cost: give the stock value or the unit cost/)).toBeVisible();
  // 12 brake pads for ₦540,000 + 2 drums of oil at ₦873,600 a drum.
  await expect(page.getByText(/To load into .*: 2 stock lines · 14 units · ₦2,287,200\.00/)).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await approveAndLoad(page, stockUrl);
  await expect(page.getByText(/Stock value now in .*: ₦2,287,200\.00/)).toBeVisible();
  await expect(page.getByText('Matches the checked file exactly (₦2,287,200.00).')).toBeVisible();
  const receipt = await db().goodsReceipt.findFirstOrThrow({ where: { isOpeningBalance: true, lines: { some: { part: { partNumber: pn(1), branchId } } } }, select: { referenceNumber: true, supplierName: true, lines: { select: { part: { select: { partNumber: true } }, quantityInBaseUnit: true, unitCost: true, totalCost: true } } } });
  expect(receipt.supplierName).toMatch(/^Opening balance — SAP \(IMP-/);
  const oil = receipt.lines.find((l) => l.part.partNumber === pn(2))!;
  expect([Number(oil.quantityInBaseUnit), Number(oil.unitCost), Number(oil.totalCost)]).toEqual([416, 4200, 1747200]);
  const stock = await db().partStock.findFirstOrThrow({ where: { part: { branchId, partNumber: pn(2) } }, select: { quantityOnHand: true } });
  expect(Number(stock.quantityOnHand)).toBe(416);
  expect(await db().partBatch.count({ where: { part: { branchId, partNumber: pn(2) }, batchNumber: 'B-2026-001' } })).toBe(1);
  // The Store Manager approved it, so cannot confirm the value; Finance does.
  await expect(page.getByText('Waiting for Finance to confirm the value.')).toBeVisible();
  await as(page, 'finance-officer');
  await open(page, stockUrl);
  await page.getByRole('button', { name: 'Confirm the value (Finance)' }).click();
  await expect(page.getByText(/Value confirmed by .* \(Finance\)/)).toBeVisible();
});

test('Finance opens only stock imports; reversing the opening stock takes it back off the shelf', async ({ page }) => {
  const branchId = await storeBranchId();
  // Finance cannot open a customers import (personal data).
  const customers = await db().importJob.findFirst({ where: { entity: 'customers' }, select: { id: true } });
  if (customers) {
    await as(page, 'finance-officer');
    await open(page, `/data-exchange/imports/${customers.id}`);
    await expect(page.getByText(/could not be found|404|not found/i).first()).toBeVisible();
  }
  await as(page, 'store-manager');
  page.on('dialog', (d) => void d.accept());
  await open(page, stockUrl);
  await page.getByRole('button', { name: 'Reverse this opening stock' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  const stock = await db().partStock.findFirstOrThrow({ where: { part: { branchId, partNumber: pn(1) } }, select: { quantityOnHand: true } });
  expect(Number(stock.quantityOnHand)).toBe(0);
  expect(await db().goodsReceiptLine.count({ where: { part: { branchId, partNumber: { in: [pn(1), pn(2), pn(3)] } } } })).toBe(0);
  // The file is still there: it can be reopened, checked and loaded again.
  await as(page, 'it-administrator');
  await open(page, stockUrl);
  await expect(page.getByRole('button', { name: /Reopen: check and load this file again/ })).toBeVisible();
});
