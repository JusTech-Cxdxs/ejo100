import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { as, open } from './helpers';
import { db, freshVehicle } from './db';
import { who } from './people';

/**
 * A4c1 — a customer's data request (NDPA 2023), end to end:
 *   the Customer Care Lead records a request for a copy of a customer's data
 *   from their page; they cannot confirm who is asking themselves; the
 *   Administrator confirms it (refused with an ID number in it); the copy is a
 *   zip with the customer's records — their payment among them — and none of
 *   the staff who handled them, its SHA-256 as the request keeps it; the
 *   request is closed as answered. The front desk never sees any of it.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-8);
const ids = { customer: '', request: '', payment: '' };

test('the Customer Care Lead records the request from the customer’s page', async ({ page }) => {
  const finance = await db().user.findUniqueOrThrow({ where: { email: who('finance-officer').email }, select: { id: true, branchId: true } });
  const v = await freshVehicle(`DR${STAMP.slice(-5)}`);
  const { customerId } = await db().customerVehicle.findUniqueOrThrow({ where: { id: v.id }, select: { customerId: true } });
  ids.customer = customerId;
  const job = await db().jobCard.create({ data: { jobNumber: `JC-E2E-DR-${STAMP}`, branchId: finance.branchId!, customerId, vehicleId: v.id, createdById: finance.id }, select: { id: true } });
  ids.payment = (await db().payment.create({ data: { jobCardId: job.id, amount: 12345.67, method: 'CASH', recordedById: finance.id } })).id;
  await db().customerNote.create({ data: { customerId, authorId: finance.id, body: `Prefers calls after 4pm ${STAMP}` } });

  await as(page, 'customer-care-lead');
  await open(page, `/crm/customers/${customerId}`);
  await page.getByTestId('record-data-request').click();
  await page.waitForURL(/\/data-requests\/new\?customer=/);
  const form = page.getByTestId('new-data-request');
  await expect(form.getByTestId('chosen-customer')).toBeVisible();
  await form.getByLabel(/A copy of their data/).check();
  await form.getByLabel('How it came in').selectOption('EMAIL');
  await form.getByLabel(/What they asked/).fill(`Please send me everything you hold about me. ${STAMP}`);
  await form.getByRole('button', { name: 'Record the request' }).click();
  await page.waitForURL(/\/data-requests\/[^/?]+$/, { timeout: 30_000 });
  ids.request = page.url().split('/').pop()!;
  const r = await db().dataRequest.findUniqueOrThrow({ where: { id: ids.request } });
  expect([r.kind, r.status, r.customerId]).toEqual(['ACCESS', 'RECEIVED', customerId]);
  expect(r.number).toMatch(/^DR-20\d{2}-\d{6}$/);
  await expect(page.getByTestId('verify-by-colleague')).toBeVisible();
  // No copy before identity is confirmed.
  expect((await page.request.get(`/data-requests/${ids.request}/copy`)).status()).toBe(409);
});

test('the Administrator confirms who is asking — in words, never an ID number', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, `/data-requests/${ids.request}`);
  const form = page.getByTestId('verify-request');
  await form.getByLabel('How you confirmed it is them').fill('NIN 12345678901 checked');
  await form.getByRole('button', { name: 'Confirm who is asking' }).click();
  await expect(form.getByRole('alert')).toContainText('never the document’s number');
  await form.getByLabel('How you confirmed it is them').fill('Called back on the phone number on the record; details matched');
  await form.getByRole('button', { name: 'Confirm who is asking' }).click();
  await expect(page.getByTestId('verified')).toContainText('Called back on the phone number on the record');
  expect((await db().dataRequest.findUniqueOrThrow({ where: { id: ids.request } })).status).toBe('VERIFIED');
});

test('the copy: their records, their payment among them, none of the staff; the checksum the request keeps', async ({ page }) => {
  await as(page, 'administrator');
  const res = await page.request.get(`/data-requests/${ids.request}/copy`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/zip');
  const bytes = await res.body();
  const sum = createHash('sha256').update(bytes).digest('hex');
  expect(res.headers()['x-checksum-sha256']).toBe(sum);
  const files = unzipSync(new Uint8Array(bytes));
  for (const f of ['README.txt', 'customer.csv', 'vehicles.csv', 'job-cards.csv', 'payments.csv', 'notes.csv', 'data.json']) expect(Object.keys(files)).toContain(f);
  const payments = strFromU8(files['payments.csv']!);
  expect(payments).toContain(ids.payment);
  expect(payments).toContain('12345.67');
  expect(payments).not.toContain('recordedById');
  expect(strFromU8(files['notes.csv']!)).toContain(`Prefers calls after 4pm ${STAMP}`);
  const everything = Object.values(files).map((f) => strFromU8(f)).join('\n');
  for (const staff of [who('finance-officer').name, who('finance-officer').email, 'authorId', 'createdById', 'password']) expect(everything).not.toContain(staff);
  const r = await db().dataRequest.findUniqueOrThrow({ where: { id: ids.request } });
  expect([r.packChecksum, r.packDownloads]).toEqual([sum, 1]);
  expect(await db().auditLog.count({ where: { entityType: 'DataRequest', entityId: ids.request, action: 'privacy.copy_downloaded' } })).toBe(1);
});

test('closed as answered, with what was done; the front desk sees none of it', async ({ page }) => {
  await as(page, 'customer-care-lead');
  await open(page, `/data-requests/${ids.request}`);
  await expect(page.getByTestId('copy-checksum')).toBeVisible();
  const form = page.getByTestId('close-request');
  await form.getByLabel(/What was done/).fill('Sent by email to the address on the record, the zip protected with a password given by phone.');
  await form.getByRole('button', { name: 'Close the request' }).click();
  await expect(page.getByTestId('closed')).toContainText('Answered');
  expect((await db().dataRequest.findUniqueOrThrow({ where: { id: ids.request } })).status).toBe('FULFILLED');

  await as(page, 'receptionist');
  expect((await page.request.get(`/data-requests/${ids.request}/copy`)).status()).toBe(403);
  await open(page, `/crm/customers/${ids.customer}`);
  await expect(page.getByTestId('record-data-request')).toHaveCount(0);
});
