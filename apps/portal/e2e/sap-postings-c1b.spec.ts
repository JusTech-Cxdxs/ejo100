import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { db, freshVehicle } from './db';
import { who, type Person } from './people';

/**
 * C1b — the plant's events and refunds in the postings for SAP:
 *   at the plant (signed off as cut over), a PDI rejected (R) then accepted
 *   (A) gives two usage decisions, in order, with SAP's zeros on the order and
 *   equipment numbers; its vehicle is received into the yard once (movement
 *   101 from its production order), never twice. SAP's answer shows on the
 *   PDI's page under "Sent to SAP".
 *   At the workshop, a refund goes in the refunds file with its reason and
 *   shows on its job card's page, waiting for SAP.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-9);
const ids = { plant: '', pdi: '', vehicle: '', udFile: '', udLines: [] as string[], workshop: '', job: '', refund: '' };

/** Goes live two days ago at the branch (as Data Exchange → Cut-over checklist signs it off), with an SAP plant code. */
async function liveBranch(person: Person['role']) {
  const u = await db().user.findUniqueOrThrow({ where: { email: who(person).email }, select: { id: true, branchId: true, organisationId: true } });
  await db().branch.updateMany({ where: { id: u.branchId!, sapPlant: null }, data: { sapPlant: '9902' } });
  if (!(await db().auditLog.count({ where: { entityType: 'BranchCutover', entityId: u.branchId!, action: 'data_exchange.cutover_signed_off' } }))) {
    await db().auditLog.create({ data: { organisationId: u.organisationId!, userId: u.id, action: 'data_exchange.cutover_signed_off', entityType: 'BranchCutover', entityId: u.branchId!, metadata: { steps: [] }, createdAt: new Date(Date.now() - 2 * 86_400_000) } });
  }
  return u;
}

/** Makes the next file of a kind at the branch: its id, or null when there is nothing to send. */
async function makeFile(page: Page, person: Person['role'], branchId: string, kind: string): Promise<string | null> {
  await as(page, person);
  await open(page, '/data-exchange/sap');
  const form = page.locator(`[data-testid="make-posting-file"][data-scope="${branchId}"]`);
  await form.getByLabel('Kind of posting').selectOption(kind);
  await form.getByLabel('Up to and including').fill(new Date(Date.now() + 3_600_000).toISOString().slice(0, 10));
  await form.getByRole('button', { name: 'Make the file for SAP' }).click();
  const made = /\/data-exchange\/sap\/[^/?]+$/;
  await expect.poll(async () => made.test(page.url()) || (await form.getByRole('status').count()) > 0, { timeout: 60_000 }).toBe(true);
  return made.test(page.url()) ? page.url().split('/').pop()! : null;
}

const cellsOf = (csv: string, id: string) => csv.split('\r\n').filter((l) => l.includes(id)).map((l) => l.slice(1, -1).split('","'));

test('the plant: a PDI rejected then accepted is two usage decisions, R then A, with SAP’s zeros on the order and equipment', async ({ page }) => {
  const pm = await liveBranch('plant-manager');
  ids.plant = pm.branchId!;
  const vin = `JAAE2ESAP${STAMP}`.slice(0, 17);
  const v = await db().plantVehicle.create({ data: { organisationId: pm.organisationId!, branchId: ids.plant, vin, vinKey: vin, make: 'Isuzu', modelCode: 'NQR', modelName: 'NQR 75', stage: 'YARD', sapMaterial: 'NQR75-CAB', sapProductionOrder: '1000234', sapEquipment: '10000077', createdById: pm.id } });
  ids.vehicle = v.id;
  const decided = new Date(Date.now() - 30 * 60_000);
  const pdi = await db().pdiInspection.create({ data: { number: `PDI-E2E-${STAMP}`, organisationId: pm.organisationId!, branchId: ids.plant, plantVehicleId: v.id, templateKey: 'isuzu-n', templateVersion: 1, status: 'PASSED', inspectorId: pm.id, submittedAt: decided, decidedById: pm.id, decidedAt: decided, sapUsageDecision: 'A' } });
  ids.pdi = pdi.id;
  // Rejected back to rework an hour before it passed: that decision lives in its audit entry.
  await db().auditLog.create({ data: { organisationId: pm.organisationId!, userId: pm.id, action: 'plant.pdi_rejected', entityType: 'PdiInspection', entityId: pdi.id, metadata: { number: pdi.number, usageDecision: 'R' }, createdAt: new Date(decided.getTime() - 3_600_000) } });

  ids.udFile = (await makeFile(page, 'plant-manager', ids.plant, 'USAGE_DECISION'))!;
  expect(ids.udFile).toBeTruthy();
  const lines = await db().sapPostingLine.findMany({ where: { fileId: ids.udFile, entityId: pdi.id }, orderBy: { lineNo: 'asc' } });
  expect(lines.map((l) => l.ref.slice(0, 5))).toEqual(['UD:R:', 'UD:A:']);
  ids.udLines = lines.map((l) => l.id);
  const csv = await (await page.request.get(`/data-exchange/sap/${ids.udFile}/download`)).text();
  expect(csv.split('\r\n')[0]).toBe('"ZZ_EJO_LINE","ZZ_EJO_ID","VDATUM","WERKS","MATNR","SERNR","EQUNR","AUFNR","VCODE","ZZ_EJO_REF"');
  const rows = cellsOf(csv, pdi.id);
  expect(rows.map((r) => r[8])).toEqual(['R', 'A']);
  expect(rows[1]!.slice(4, 8)).toEqual(['NQR75-CAB', vin, '000000000010000077', '000001000234']);
});

test('the vehicle is received into the yard once: movement 101 from its order; the next file never has it again', async ({ page }) => {
  const file = (await makeFile(page, 'plant-manager', ids.plant, 'PRODUCTION_RECEIPT'))!;
  expect(file).toBeTruthy();
  const mine = await db().sapPostingLine.findMany({ where: { fileId: file, entityId: ids.vehicle } });
  expect(mine).toHaveLength(1);
  expect((mine[0]!.payload as Record<string, string>)).toMatchObject({ BWART: '101', MENGE: '1', AUFNR: '000001000234', ZZ_EJO_REF: `PDI-E2E-${STAMP}` });
  const again = await makeFile(page, 'plant-manager', ids.plant, 'PRODUCTION_RECEIPT');
  if (again) expect(await db().sapPostingLine.count({ where: { fileId: again, entityId: ids.vehicle } })).toBe(0);
  expect(await db().sapPostingLine.count({ where: { entityId: ids.vehicle, status: { in: ['SENT', 'POSTED'] } } })).toBe(1);
});

test('SAP’s answer shows on the PDI’s page under “Sent to SAP”', async ({ page }) => {
  await as(page, 'plant-manager');
  await open(page, `/data-exchange/sap/${ids.udFile}`);
  const answers = Buffer.from([['ZZ_EJO_LINE', 'STATUS', 'BELNR', 'MESSAGE'], [ids.udLines[0]!, 'S', '', ''], [ids.udLines[1]!, 'S', '30000123', '']].map((r) => r.join(',')).join('\r\n'));
  await page.locator('#sap-answers').setInputFiles({ name: 'sap-return.csv', mimeType: 'text/csv', buffer: answers });
  await expect(page.getByTestId('answer-upload').getByRole('status')).toContainText(/2 posted · 0 rejected/, { timeout: 30_000 });
  await open(page, `/plant/pdi/${ids.pdi}`);
  const trail = page.getByTestId('sap-trail');
  await expect(trail).toBeVisible();
  await expect(trail.getByTestId('sap-trail-line').filter({ hasText: 'PDI usage decisions' }).filter({ hasText: '30000123' })).toHaveAttribute('data-status', 'POSTED');
  await expect(trail.getByTestId('sap-trail-line').filter({ hasText: 'Vehicles to the yard' })).toHaveAttribute('data-status', 'SENT');
});

test('the workshop: a refund goes in the refunds file with its reason, and shows on its job card, waiting for SAP', async ({ page }) => {
  const fin = await liveBranch('finance-officer');
  ids.workshop = fin.branchId!;
  const v = await freshVehicle(`RF${STAMP.slice(-5)}`);
  const { customerId } = await db().customerVehicle.findUniqueOrThrow({ where: { id: v.id }, select: { customerId: true } });
  ids.job = (await db().jobCard.create({ data: { jobNumber: `JC-E2E-RF-${STAMP}`, branchId: ids.workshop, customerId, vehicleId: v.id, createdById: fin.id }, select: { id: true } })).id;
  ids.refund = (await db().refund.create({ data: { referenceNumber: `RF-E2E-${STAMP}`, jobCardId: ids.job, amount: 4500.5, method: 'CASH', paidToName: 'The customer', reason: 'Part not fitted;\nreturned', recordedById: fin.id } })).id;

  const file = (await makeFile(page, 'finance-officer', ids.workshop, 'REFUND'))!;
  expect(file).toBeTruthy();
  const csv = await (await page.request.get(`/data-exchange/sap/${file}/download`)).text();
  expect(csv.split('\r\n')[0]).toBe('"ZZ_EJO_LINE","ZZ_EJO_ID","BUDAT","WERKS","KUNNR","WRBTR","WAERS","ZLSCH","XBLNR","ZZ_EJO_REF","SGTXT"');
  const [row] = cellsOf(csv, ids.refund);
  expect(row!.slice(5)).toEqual(['4500.50', 'NGN', 'C', `RF-E2E-${STAMP}`.slice(0, 16), `JC-E2E-RF-${STAMP}`, 'Part not fitted returned']);

  await as(page, 'workshop-manager');
  await open(page, `/workshop/job-cards/${ids.job}`);
  await expect(page.getByTestId('sap-trail').getByTestId('sap-trail-line').filter({ hasText: 'Refunds' })).toHaveAttribute('data-status', 'SENT');
});

test('“Sent to SAP” is only for the people who send or confirm the postings', async ({ page }) => {
  await as(page, 'receptionist');
  await open(page, `/workshop/job-cards/${ids.job}`);
  await expect(page.getByTestId('sap-trail')).toHaveCount(0);
});

test('SAP’s master data back in: SAP’s own customer file, found by the SAP number only (with SAP’s zeros), every change previewed', async ({ page }) => {
  const { organisationId } = await db().user.findUniqueOrThrow({ where: { email: who('it-administrator').email }, select: { organisationId: true } });
  const kunnr = `77${STAMP.slice(-6)}`;
  const c = await db().customer.create({ data: { organisationId: organisationId!, fullName: `SAP Refresh ${STAMP}`, phone: `0802${STAMP.slice(-7)}`, externalSource: 'SAP', externalId: kunnr }, select: { id: true } });
  const body = [['Customer number (SAP or old system)', 'Name', 'Phone'], [`00${kunnr}`, `SAP Refresh ${STAMP} Ltd`, `0802${STAMP.slice(-7)}`], ['0099999999', 'Not in EJO', '08090004444']].map((r) => r.join(',')).join('\r\n');
  await as(page, 'it-administrator');
  await open(page, '/data-exchange/new?entity=customers');
  await page.locator('#import-file').setInputFiles({ name: `sap-customers-${STAMP}.csv`, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByLabel(/Update customers exported from EJO, or from SAP’s own file/).check();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/No customer in EJO has SAP number 99999999/)).toBeVisible();
  const changes = page.getByTestId('round-trip-changes');
  await expect(changes).toContainText('To change: 1 customer · 1 field');
  await expect(changes).toContainText(`Name: SAP Refresh ${STAMP} → SAP Refresh ${STAMP} Ltd`);
  const row = await db().importRow.findFirstOrThrow({ where: { matchedId: c.id }, select: { matchedBy: true } });
  expect(row.matchedBy).toBe('sap');
});
