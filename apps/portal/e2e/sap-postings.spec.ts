import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { as, open } from './helpers';
import { db, freshVehicle } from './db';
import { who } from './people';

/**
 * C1a — the daily postings for SAP, end to end at a workshop signed off as
 * cut over: Finance makes the payments file (everything since the sign-off
 * not yet in a file), downloads it — line 1 the header, the same SHA-256 the
 * page shows, SAP's day and amount formats — and the Manager loads SAP's
 * return file: one line posted with its document number, the same answer
 * twice changing nothing, a line of no file left out. A posting SAP rejects
 * goes again only once sent again, then in the next file in place of the old.
 * A payment is in one file at a time, never two.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Number(String(Date.now()).slice(-5));
const amounts = [1000 + STAMP / 100, 2000 + STAMP / 100];
const ids: { branch: string; pay: string[]; file: string; line: string[] } = { branch: '', pay: [], file: '', line: [] };

const csvOf = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(',')).join('\r\n'));

/** Makes the next payments file at the branch: its id, or null when there is nothing to send. */
async function makeFile(page: import('@playwright/test').Page): Promise<string | null> {
  await as(page, 'finance-officer');
  await open(page, '/data-exchange/sap');
  const form = page.locator(`[data-testid="make-posting-file"][data-scope="${ids.branch}"]`);
  await form.getByLabel('Kind of posting').selectOption('PAYMENT');
  await form.getByLabel('Up to and including').fill(new Date(Date.now() + 3_600_000).toISOString().slice(0, 10));
  await form.getByRole('button', { name: 'Make the file for SAP' }).click();
  const made = /\/data-exchange\/sap\/[^/?]+$/;
  await expect.poll(async () => made.test(page.url()) || (await form.getByRole('status').count()) > 0, { timeout: 60_000 }).toBe(true);
  return made.test(page.url()) ? page.url().split('/').pop()! : null;
}

test('Finance makes the payments file: everything since the cut-over not in a file yet, with its checksum; the download is the same bytes', async ({ page }) => {
  const finance = await db().user.findUniqueOrThrow({ where: { email: who('finance-officer').email }, select: { id: true, branchId: true, organisationId: true } });
  ids.branch = finance.branchId!;
  await db().branch.updateMany({ where: { id: ids.branch, sapPlant: null }, data: { sapPlant: '9901' } });
  // The branch went live (signed off as cut over) two days ago.
  if (!(await db().auditLog.count({ where: { entityType: 'BranchCutover', entityId: ids.branch, action: 'data_exchange.cutover_signed_off' } }))) {
    await db().auditLog.create({ data: { organisationId: finance.organisationId!, userId: finance.id, action: 'data_exchange.cutover_signed_off', entityType: 'BranchCutover', entityId: ids.branch, metadata: { steps: [] }, createdAt: new Date(Date.now() - 2 * 86_400_000) } });
  }
  const v = await freshVehicle(`SAP${STAMP}`);
  const { customerId } = await db().customerVehicle.findUniqueOrThrow({ where: { id: v.id }, select: { customerId: true } });
  const job = await db().jobCard.create({ data: { jobNumber: `JC-E2E-SAP-${STAMP}`, branchId: ids.branch, customerId, vehicleId: v.id, createdById: finance.id }, select: { id: true } });
  for (const amount of amounts) ids.pay.push((await db().payment.create({ data: { jobCardId: job.id, amount, method: 'BANK_TRANSFER', recordedById: finance.id } })).id);

  ids.file = (await makeFile(page))!;
  expect(ids.file).toBeTruthy();
  const lines = await db().sapPostingLine.findMany({ where: { fileId: ids.file, entityId: { in: ids.pay } }, orderBy: { lineNo: 'asc' } });
  expect(lines.map((l) => l.ref)).toEqual(ids.pay.map((p) => `PY:${p}`));
  ids.line = lines.map((l) => l.id);
  const file = await db().sapPostingFile.findUniqueOrThrow({ where: { id: ids.file } });
  await expect(page.getByTestId('posting-checksum')).toHaveText(file.checksum);

  const res = await page.request.get(`/data-exchange/sap/${ids.file}/download`);
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(createHash('sha256').update(body, 'utf8').digest('hex')).toBe(file.checksum);
  expect(res.headers()['x-checksum-sha256']).toBe(file.checksum);
  expect(body.split('\r\n')[0]).toBe('"ZZ_EJO_LINE","ZZ_EJO_ID","BUDAT","WERKS","KUNNR","WRBTR","WAERS","ZLSCH","XBLNR"');
  const mine = body.split('\r\n').find((l) => l.includes(ids.pay[0]!))!;
  expect(mine).toContain(`"${amounts[0]!.toFixed(2)}","NGN","T"`);
  const { sapPlant } = await db().branch.findUniqueOrThrow({ where: { id: ids.branch }, select: { sapPlant: true } });
  expect(mine).toMatch(new RegExp(`"20\\d{6}","${sapPlant}"`));
  expect((await db().sapPostingFile.findUniqueOrThrow({ where: { id: ids.file } })).downloadedAt).not.toBeNull();
});

test('the Manager loads SAP’s return file: posted with its document, rejected with its message; the same answer twice changes nothing', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, `/data-exchange/sap/${ids.file}`);
  const answers = csvOf([['ZZ_EJO_LINE', 'STATUS', 'BELNR', 'MESSAGE'], [ids.line[0]!, 'S', '1400000123', ''], [ids.line[1]!, 'E', '', 'Customer account blocked for posting'], ['cnotalineofthisfile00000', 'S', '1400000999', '']]);
  await page.locator('#sap-answers').setInputFiles({ name: 'sap-return.csv', mimeType: 'text/csv', buffer: answers });
  await expect(page.getByTestId('answer-upload').getByRole('status')).toContainText(/1 posted · 1 rejected · 1 not lines of this file/, { timeout: 30_000 });
  const [a, b] = await Promise.all(ids.line.map((id) => db().sapPostingLine.findUniqueOrThrow({ where: { id } })));
  expect([a!.status, a!.sapDocument, b!.status, b!.message]).toEqual(['POSTED', '1400000123', 'REJECTED', 'Customer account blocked for posting']);
  await page.locator('#sap-answers').setInputFiles({ name: 'sap-return.csv', mimeType: 'text/csv', buffer: answers });
  await expect(page.getByTestId('answer-upload').getByRole('status')).toContainText(/0 posted · 0 rejected · 2 already recorded/, { timeout: 30_000 });
  expect(await db().auditLog.count({ where: { entityType: 'SapPostingFile', entityId: ids.file, action: 'sap.postings_answered' } })).toBe(1);
});

test('a rejected posting goes again only once sent again, then in the next file in place of the old; a payment is never in two files', async ({ page }) => {
  // Not sent again yet: the next file leaves it out.
  const second = await makeFile(page);
  if (second) expect(await db().sapPostingLine.count({ where: { fileId: second, entityId: { in: ids.pay } } })).toBe(0);
  await as(page, 'workshop-manager');
  await open(page, `/data-exchange/sap/${ids.file}?status=REJECTED`);
  await page.getByTestId('posting-line').filter({ hasText: 'Customer account blocked for posting' }).getByRole('button', { name: 'Send again' }).click();
  await expect.poll(async () => (await db().sapPostingLine.findUniqueOrThrow({ where: { id: ids.line[1]! } })).status).toBe('RESEND');
  const third = await makeFile(page);
  expect(third).toBeTruthy();
  const again = await db().sapPostingLine.findFirstOrThrow({ where: { fileId: third!, entityId: ids.pay[1]! } });
  expect(again.retryOf).toBe(ids.line[1]);
  expect((await db().sapPostingLine.findUniqueOrThrow({ where: { id: ids.line[1]! } })).status).toBe('SUPERSEDED');
  expect(await db().sapPostingLine.count({ where: { entityId: ids.pay[0]!, status: { in: ['SENT', 'POSTED'] } } })).toBe(1);
});
