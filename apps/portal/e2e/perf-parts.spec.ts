import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { as } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * The measured speed run (docs/DATA_MIGRATION.md): a full SAP material master
 * through the real screens — upload, check, approval, load — timed per step.
 * Not part of CI: run with PERF_FILE=/path/SAP_parts_800000.csv (and
 * PERF_OUT for the timings) against a throwaway database.
 */
test.skip(!process.env.PERF_FILE, 'Speed run only: set PERF_FILE');
test.setTimeout(4 * 60 * 60 * 1000);

test('a full SAP material master: upload, check, approve, load', async ({ page }) => {
  const branchId = (await db().user.findUniqueOrThrow({ where: { email: who('store-manager').email }, select: { branchId: true } })).branchId!;
  const t: Record<string, number> = {};
  const mark = (k: string, from: number) => { t[k] = Math.round((Date.now() - from) / 100) / 10; };
  await as(page, 'it-administrator');
  await page.goto('/data-exchange/new?entity=parts');
  await expect(page.locator('#import-branch')).toHaveCount(1);
  await page.locator('#import-branch').selectOption(branchId);
  let s = Date.now();
  await page.locator('#import-file').setInputFiles(process.env.PERF_FILE!);
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 3_600_000 });
  mark('uploadSeconds', s);
  const url = page.url();
  s = Date.now();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 3_600_000 });
  mark('checkSeconds', s);
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'store-manager');
  await page.goto(url);
  await page.getByRole('button', { name: 'Approve' }).click();
  s = Date.now();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 4 * 3_600_000 });
  mark('loadSeconds', s);
  const job = await db().importJob.findFirstOrThrow({ where: { id: url.split('/').pop()! }, select: { number: true, fileRows: true, createdRows: true, rejectedRows: true, duplicateRows: true } });
  s = Date.now();
  await page.goto(`/inventory/parts?q=${encodeURIComponent('Brake pad')}`);
  await expect(page.getByText(/Showing 1–50 of/)).toBeVisible({ timeout: 120_000 });
  mark('partsSearchSeconds', s);
  const out = { ...job, ...t, at: new Date().toISOString() };
  console.log('SPEED RUN', JSON.stringify(out));
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(out, null, 2));
  expect(job.createdRows).toBe(job.fileRows - job.rejectedRows - job.duplicateRows);
});
