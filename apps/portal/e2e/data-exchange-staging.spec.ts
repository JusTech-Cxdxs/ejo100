import { test, expect } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';

/**
 * The staged copy of an import's file: its size is shown, the administrator
 * sets how long finished imports keep it, and an approver can release it
 * early. Releasing keeps the summary, every row's outcome and the rejected
 * rows (the "to fix in Excel" file still downloads); the import can no
 * longer be reopened from it.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const STAMP = String(Date.now()).slice(-7);
const csv = [
  ['KUNNR', 'NAME1', 'TELF1', 'STRAS', 'ORT01'],
  [`8${STAMP}1`, `Staged One ${T}`, `0812 ${STAMP.slice(0, 3)} ${STAMP.slice(3, 7)}`, '1 Marina', 'Lagos'],
  [`8${STAMP}2`, `Staged Two ${T}`, `0813 ${STAMP.slice(0, 3)} ${STAMP.slice(3, 7)}`, '2 Marina', 'Lagos'],
  [`8${STAMP}3`, '', '', '', ''],
].map((r) => r.join(',')).join('\r\n');

let url = '';

test('the administrator sets how long finished imports keep their file; the hub shows the space used', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/data-exchange');
  await expect(page.getByRole('heading', { name: 'Space used by staged files' })).toBeVisible();
  await page.getByLabel('Release a finished import’s file after (days)').fill('45');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByText(/the copy is released after 45 days/)).toBeVisible();
  // Back to the default for the other tests.
  await page.getByLabel('Release a finished import’s file after (days)').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/the copy is released after 30 days/)).toBeVisible();
});

test('a finished import: released early by an approver; outcomes and rejected rows are kept', async ({ page }) => {
  await as(page, 'it-administrator');
  await open(page, '/data-exchange/new?entity=customers');
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-file').setInputFiles({ name: `staged-${T}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  url = page.url();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  // While in progress the file is kept, with its size shown.
  await expect(page.getByRole('heading', { name: /Staged file \d/ })).toBeVisible();
  await expect(page.getByText(/Kept while the import is in progress/)).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'workshop-manager');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Released automatically on .* \(30 days after it finished\)/)).toBeVisible();
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Release it now' }).click();
  await expect(page.getByText(/Released .* by .*\. The summary, every row’s outcome/)).toBeVisible({ timeout: 30_000 });
  const jobId = url.split('/').pop()!;
  const rows = await db().importRow.findMany({ where: { jobId }, orderBy: { rowNumber: 'asc' }, select: { status: true, cells: true, resultId: true } });
  expect(rows.map((r) => [r.status, (r.cells as unknown[]).length > 0])).toEqual([['CREATED', false], ['CREATED', false], ['REJECTED', true]]);
  expect(rows.filter((r) => r.status === 'CREATED').every((r) => r.resultId)).toBe(true);
  const job = await db().importJob.findUniqueOrThrow({ where: { id: jobId }, select: { rowsReleasedAt: true, stagedBytes: true, createdRows: true } });
  expect(job.rowsReleasedAt).not.toBeNull();
  expect(job.createdRows).toBe(2);
  // The rejected rows still download to fix in Excel.
  const res = await page.request.get(`${url}/rows?kind=rejects`);
  expect(res.ok()).toBe(true);
  expect(await res.text()).toMatch(new RegExp(`8${STAMP}3`));
});

test('after release, undo still works and the file cannot be reopened', async ({ page }) => {
  await as(page, 'workshop-manager');
  page.on('dialog', (d) => void d.accept());
  await open(page, url);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  await as(page, 'it-administrator');
  await open(page, url);
  await expect(page.getByRole('button', { name: /Reopen: check and load this file again/ })).toHaveCount(0);
  await expect(page.getByText('Its staged file was released, so to load it again, start a new import with the same file.')).toBeVisible();
});
