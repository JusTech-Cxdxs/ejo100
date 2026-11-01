import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * Exports: any list to Excel or CSV, exactly as it is filtered, for the
 * person downloading it. The link works 24 hours and once per person; a long
 * list arrives in parts (CI runs exports in tiny blocks: EXPORT_BLOCK_ROWS=2,
 * EXPORT_PART_MAX_ROWS=5), each part carrying on exactly where the last
 * stopped; contact details need their own permission; every export is in
 * Data Exchange → Exports, in search, and in the audit trail.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const CUSTOMER = `Export Customer ${T}`;
const SUPPLIER = `Export Supplier ${T}`;
let orgId = '';

async function orgOf(email: string): Promise<string> {
  return (await db().user.findUniqueOrThrow({ where: { email }, select: { organisationId: true } })).organisationId!;
}
/** Starts an export from the list's own Export button; returns the export's id and the downloaded file. */
async function exportFromButton(page: Page, format: 'Excel (.xlsx)' | 'CSV'): Promise<{ id: string; file: Buffer; name: string }> {
  const button = page.getByRole('button', { name: /^Export/ }).first();
  await expect(button).toHaveCount(1);
  await button.click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: new RegExp(format.replace(/[().]/g, '\\$&')) }).click();
  const d = await download;
  const link = page.getByRole('status').getByRole('link', { name: /^EXP-\d{4}-\d{6}$/ });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  return { id: href!.split('/').pop()!, file: readFileSync((await d.path())!), name: d.suggestedFilename() };
}
const csvRows = (text: string) => text.replace(/^﻿/, '').split('\r\n').filter(Boolean);

test('set up: a customer and seven suppliers of our own', async () => {
  orgId = await orgOf(who('administrator').email);
  const adminId = (await db().user.findUniqueOrThrow({ where: { email: who('administrator').email }, select: { id: true } })).id;
  await db().customer.create({ data: { organisationId: orgId, fullName: CUSTOMER, phone: `0803${String(Date.now()).slice(-7)}`, email: `export-${T.toLowerCase()}@example.test` } });
  for (let i = 1; i <= 7; i++) await db().supplier.create({ data: { organisationId: orgId, createdById: adminId, name: `${SUPPLIER} ${i}`, email: `s${i}-${T.toLowerCase()}@example.test` } });
});

test('Customers → Excel: the filtered list, an About sheet first, real cells, a link back', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, `/crm?q=${encodeURIComponent(CUSTOMER)}`);
  const { id, file, name } = await exportFromButton(page, 'Excel (.xlsx)');
  expect(name).toMatch(/^EJO-customers-\d{4}-\d{2}-\d{2}-EXP-\d{4}-\d{6}\.xlsx$/);
  const files = unzipSync(new Uint8Array(file));
  const wb = strFromU8(files['xl/workbook.xml']!);
  expect(wb).toMatch(/<sheet name="About this file"[^>]*\/><sheet name="Customers"/);
  const about = strFromU8(files['xl/worksheets/sheet1.xml']!);
  expect(about).toContain(`Search: ${CUSTOMER}`);
  expect(about).toContain('Hannah Admin');
  const data = strFromU8(files['xl/worksheets/sheet2.xml']!);
  expect((data.match(/<row /g) ?? []).length).toBe(2); // the header and our one customer
  expect(data).toContain(CUSTOMER);
  expect(data).toMatch(/\/crm\/customers\/[a-z0-9]+/);
  // Recorded: the export, and this person's finished download.
  const job = await db().exportJob.findUniqueOrThrow({ where: { id }, include: { downloads: true } });
  expect(job).toMatchObject({ kind: 'customers', format: 'xlsx', sensitive: true, rowCount: 1 });
  expect(job.downloads).toHaveLength(1);
  expect(job.downloads[0]!.finishedAt).not.toBeNull();
  expect(await db().auditLog.count({ where: { action: 'data_exchange.exported', entityId: id } })).toBe(1);
  // Once per person: the same link now says so.
  const again = await page.request.get(`/data-exchange/exports/${id}/download`);
  expect(again.status()).toBe(410);
  expect(await again.text()).toContain('already downloaded this export');
  // The export's page shows who downloaded it; search finds it by its number.
  await open(page, `/data-exchange/exports/${id}`);
  await expect(page.getByText('You have downloaded this export: 1 row.')).toBeVisible();
  await open(page, '/data-exchange/exports');
  await expect(page.getByRole('link', { name: job.number })).toBeVisible();
});

test('a long list comes in parts: each a complete file, carrying on exactly where the last stopped', async ({ page }) => {
  await as(page, 'store-manager');
  await open(page, `/inventory/suppliers?q=${encodeURIComponent(SUPPLIER)}`);
  const first = await exportFromButton(page, 'CSV');
  const part1 = csvRows(first.file.toString('utf8'));
  expect(part1[0]).toBe('"# List: Suppliers"');
  const header = part1.findIndex((l) => l.startsWith('"Supplier number (SAP)"'));
  const names1 = part1.slice(header + 1).map((l) => l.split('","')[1]);
  expect(names1).toEqual([1, 2, 3, 4, 5, 6].map((i) => `${SUPPLIER} ${i}`));
  // The button offers the next part.
  const next = page.getByRole('button', { name: 'Download part 2' });
  await expect(next).toBeVisible({ timeout: 20_000 });
  const second = await page.request.get(`/data-exchange/exports/${first.id}/download`);
  expect(second.status()).toBe(200);
  expect(second.headers()['content-disposition']).toMatch(/-part2\.csv"/);
  const part2 = csvRows(await second.text());
  expect(part2.some((l) => l.startsWith('"# Part: 2'))).toBe(true);
  const names2 = part2.slice(part2.findIndex((l) => l.startsWith('"Supplier number (SAP)"')) + 1).map((l) => l.split('","')[1]);
  expect(names2).toEqual([`${SUPPLIER} 7`]);
  const dl = await db().exportDownload.findFirstOrThrow({ where: { exportJobId: first.id } });
  expect(dl).toMatchObject({ parts: 2, rowCount: 7, resumeFrom: null });
  expect(dl.finishedAt).not.toBeNull();
  expect((await page.request.get(`/data-exchange/exports/${first.id}/download`)).status()).toBe(410);
});

test('contact details need their own permission; no permission, no file; a day later, no link', async ({ page }) => {
  // The branch administrator exports lists, but not customers' contact details.
  await as(page, 'branch-administrator');
  await open(page, '/crm');
  await expect(page.getByRole('heading', { name: 'Customers', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(0);
  await open(page, '/workshop/vehicles');
  await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(1);
  // Someone else's export link: refused for a person who may not export that list.
  const job = await db().exportJob.findFirstOrThrow({ where: { organisationId: orgId, kind: 'customers' }, orderBy: { createdAt: 'desc' } });
  const refused = await page.request.get(`/data-exchange/exports/${job.id}/download`);
  expect(refused.status()).toBe(403);
  // A technician exports nothing at all.
  await as(page, 'technician');
  await open(page, '/workshop/job-cards');
  await expect(page.getByRole('heading', { name: 'Job Cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(0);
  expect((await page.request.get(`/data-exchange/exports/${job.id}/download`)).status()).toBe(403);
  // An expired link stops working for everyone.
  await db().exportJob.update({ where: { id: job.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await as(page, 'workshop-manager');
  const expired = await page.request.get(`/data-exchange/exports/${job.id}/download`);
  expect(expired.status()).toBe(410);
  expect(await expired.text()).toContain('expired');
});
