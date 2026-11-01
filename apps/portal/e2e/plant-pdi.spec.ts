import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';

/**
 * D1 — the assembly plant's PDI, on screen, end to end:
 *   the inspector scans a new VIN → registers it (model, engine number, SAP
 *   numbers) → the Isuzu checklist → a Not OK needs words → readings and fault
 *   codes → sent to rework → put right → sent for approval → the inspector
 *   cannot approve their own → the supervisor finds it in Approvals, rejects
 *   one item (R) → put right again → accepted (A) → the vehicle is in the
 *   yard; its page shows the PDI; its certificate certifies.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-10);
const VIN = `JAANLR8${STAMP}`;
let pdiId = '';
let pdiNumber = '';

async function answer(page: Page, label: string, result: 'OK' | 'Not OK', note?: string) {
  const row = page.locator('li[data-item]', { has: page.getByRole('group', { name: label, exact: true }) });
  if (note) await row.getByRole('textbox').or(page.getByRole('textbox', { name: `What is wrong: ${label}` })).first().fill(note);
  await row.getByRole('button', { name: result, exact: true }).click();
}

test('the inspector scans a new VIN, registers it with its SAP numbers, and gets the Isuzu checklist', async ({ page }) => {
  await as(page, 'pdi-inspector');
  await open(page, '/plant');
  await expect(page.getByRole('heading', { name: 'Assembly plant', level: 1 })).toBeVisible();
  // A handheld scanner (or a phone reading the QR) gives the label's address: the VIN is taken from it.
  await page.getByLabel('Scan the label or type the VIN').fill(`https://portal.example/v/${VIN}`);
  await page.getByRole('button', { name: 'Start the PDI' }).click();
  const reg = page.getByRole('form', { name: 'Register the vehicle' });
  await expect(reg.getByText(`${VIN} is new to the plant`)).toBeVisible();
  await reg.getByLabel('Model *').selectOption('NQR');
  await reg.getByLabel('Variant (as on the build papers)').fill('NQR 75 cab chassis');
  await reg.getByLabel('Engine number').fill(`4HK1-${STAMP.slice(-6)}`);
  await reg.getByLabel('Production order (AUFNR)').fill(`1000${STAMP.slice(-6)}`);
  await reg.getByLabel('Equipment (EQUNR)').fill(`20${STAMP.slice(-8)}`);
  await reg.getByRole('button', { name: 'Register and start the PDI' }).click();
  await page.waitForURL(/\/plant\/pdi\/[^/]+$/);
  pdiId = page.url().split('/').pop()!;
  const pdi = await db().pdiInspection.findUniqueOrThrow({ where: { id: pdiId }, include: { vehicle: true, items: true } });
  pdiNumber = pdi.number;
  expect(pdi).toMatchObject({ status: 'IN_PROGRESS', templateKey: 'isuzu-n', attempt: 1 });
  expect(pdi.vehicle).toMatchObject({ vinKey: VIN, modelCode: 'NQR', stage: 'PDI', sapProductionOrder: `1000${STAMP.slice(-6)}` });
  expect(pdi.items.length).toBeGreaterThan(40);
  await expect(page.getByRole('heading', { name: 'PDI · NQR 75 cab chassis' })).toBeVisible();
  await expect(page.getByText(`1000${STAMP.slice(-6)}`)).toBeVisible();
  // Scanning the same VIN again goes back to this PDI, never a second one.
  await open(page, '/plant');
  await page.getByLabel('Scan the label or type the VIN').fill(VIN.toLowerCase());
  await page.getByRole('button', { name: 'Start the PDI' }).click();
  await page.waitForURL(new RegExp(`/plant/pdi/${pdiId}$`));
});

test('a Not OK needs words; readings and fault codes; a failure goes to rework, then is put right', async ({ page }) => {
  await as(page, 'pdi-inspector');
  const inspector = (await db().user.findUniqueOrThrow({ where: { email: 'pdi@e2e.test' }, select: { id: true } })).id;
  // Most of the checklist answered OK (as a tablet would, tap by tap); the last two items on screen.
  const items = await db().pdiItem.findMany({ where: { inspectionId: pdiId }, orderBy: { sort: 'asc' } });
  const [paint, horn] = [items.find((i) => i.label === 'Paint and cab panels free of damage')!, items.find((i) => i.label === 'Horn')!];
  await db().pdiItem.updateMany({ where: { inspectionId: pdiId, id: { notIn: [paint.id, horn.id] }, allowNa: false }, data: { result: 'OK', checkedById: inspector, checkedAt: new Date() } });
  await db().pdiItem.updateMany({ where: { inspectionId: pdiId, allowNa: true }, data: { result: 'NA', checkedById: inspector, checkedAt: new Date() } });
  await open(page, `/plant/pdi/${pdiId}`);
  await answer(page, 'Horn', 'OK');
  // Not OK without words: refused, with the reason.
  await page.locator('li[data-item]', { has: page.getByRole('group', { name: 'Paint and cab panels free of damage' }) }).getByRole('button', { name: 'Not OK', exact: true }).click();
  await expect(page.getByText('Say what is wrong with “Paint and cab panels free of damage”, then press Not OK again.')).toBeVisible();
  await page.getByRole('textbox', { name: 'What is wrong: Paint and cab panels free of damage' }).fill('Scratch on the left door');
  await page.locator('li[data-item]', { has: page.getByRole('group', { name: 'Paint and cab panels free of damage' }) }).getByRole('button', { name: 'Not OK', exact: true }).click();
  await expect(page.getByText('Not OK: Scratch on the left door')).toBeVisible();
  // Readings: a fault code found must be cleared before the PDI can go on.
  await page.getByLabel('Odometer (km)').fill('14');
  await page.getByLabel('Battery (V)').fill('12.6');
  await page.getByLabel('Tyres front (psi)').fill('85');
  await page.getByLabel('Tyres rear (psi)').fill('85');
  await page.getByLabel('Diagnostic scan done').check();
  await page.getByLabel('Fault codes found (blank if none)').fill('p0401');
  await expect(page.getByLabel('Still to do')).toContainText('Fault codes were found');
  await page.getByLabel('Cause fixed and codes cleared').check();
  await page.getByRole('button', { name: 'Save the readings' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Send to rework' }).click();
  await expect(page.getByText('Rework', { exact: true }).first()).toBeVisible();
  // Put right: what was done, then rechecked OK.
  await page.getByRole('textbox', { name: 'What was done to put right: Paint and cab panels free of damage' }).fill('Polished out and touched up');
  await page.getByRole('button', { name: 'Rechecked OK' }).click();
  await expect(page.getByText('Put right: Polished out and touched up')).toBeVisible();
  await page.getByRole('button', { name: 'Send for approval again' }).click();
  await expect(page.getByText('Waiting for approval').first()).toBeVisible();
  // The inspector cannot approve their own PDI.
  await expect(page.getByRole('button', { name: /Accept \(A\)/ })).toHaveCount(0);
  const p = await db().pdiInspection.findUniqueOrThrow({ where: { id: pdiId } });
  expect(p).toMatchObject({ status: 'SUBMITTED', faultCodes: ['P0401'], faultCodesCleared: true, odometerKm: 14 });
});

test('the supervisor finds it in Approvals, rejects one item (R), then accepts the recheck (A): the vehicle is in the yard', async ({ page }) => {
  await as(page, 'pdi-supervisor');
  await open(page, '/approvals');
  await page.getByRole('list', { name: 'Plant approvals' }).getByRole('link', { name: new RegExp(`Approve PDI ${pdiNumber}`) }).click();
  await page.waitForURL(new RegExp(`/plant/pdi/${pdiId}$`));
  await expect(page.getByText('Fault codes found and cleared: P0401.')).toBeVisible();
  await page.getByText('Reject back to rework (R)').click();
  await page.getByLabel('What needs putting right').fill('Horn is weak, check the relay');
  await page.getByRole('checkbox', { name: 'Electrical: Horn' }).check();
  await page.getByRole('button', { name: 'Reject (R)' }).click();
  await expect(page.getByText(/Rejected by Peace Pdisupervisor: Horn is weak/)).toBeVisible();
  expect((await db().pdiInspection.findUniqueOrThrow({ where: { id: pdiId } })).sapUsageDecision).toBe('R');

  await as(page, 'pdi-inspector');
  await open(page, `/plant/pdi/${pdiId}`);
  await page.getByRole('textbox', { name: 'What was done to put right: Horn' }).fill('Relay replaced');
  await page.getByRole('button', { name: 'Rechecked OK' }).click();
  await page.getByRole('button', { name: 'Send for approval again' }).click();
  await expect(page.getByText('Waiting for approval').first()).toBeVisible();

  await as(page, 'pdi-supervisor');
  await open(page, `/plant/pdi/${pdiId}`);
  await page.getByRole('button', { name: /Accept \(A\)/ }).click();
  await expect(page.getByText(/Passed\. Approved by Peace Pdisupervisor/)).toBeVisible();
  const p = await db().pdiInspection.findUniqueOrThrow({ where: { id: pdiId }, include: { vehicle: true } });
  expect(p).toMatchObject({ status: 'PASSED', sapUsageDecision: 'A' });
  expect(p.vehicle.stage).toBe('YARD');
  expect(await db().auditLog.count({ where: { entityId: pdiId, action: { in: ['plant.pdi_started', 'plant.pdi_to_rework', 'plant.pdi_submitted', 'plant.pdi_rejected', 'plant.pdi_passed'] } } })).toBeGreaterThanOrEqual(6);
});

test('the vehicle’s page shows the PDI; the certificate certifies; search finds the PDI and the VIN', async ({ page }) => {
  await as(page, 'plant-manager');
  await open(page, `/vehicles/${VIN}`);
  await expect(page.getByText('Not sold yet')).toBeVisible();
  await expect(page.getByText(`1000${STAMP.slice(-6)}`)).toBeVisible();
  const pdiStage = page.locator('li', { hasText: 'Pre-delivery inspection' }).first();
  await expect(pdiStage.getByText('Done')).toBeVisible();
  await expect(pdiStage.getByRole('link', { name: 'PDI checklist' }).last()).toBeVisible();
  await page.goto(`/print/pdi-certificate/${VIN}`);
  await expect(page.getByText(`${VIN} · ${pdiNumber}`)).toBeVisible();
  await expect(page.getByText('This vehicle has passed its pre-delivery inspection')).toBeVisible();
  await expect(page.getByText('NOT A CERTIFICATE')).toHaveCount(0);
  await expect(page.getByText('Pius Pdiinspector')).toHaveCount(0); // the customer's paper names no staff
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(pdiNumber);
  await expect(box.locator('xpath=ancestor::div[2]').getByText(pdiNumber).first()).toBeVisible();
  await open(page, '/plant/vehicles?stage=YARD');
  await expect(page.getByRole('link', { name: VIN })).toBeVisible();
});

test('the workshop floor does not open the plant', async ({ page }) => {
  await as(page, 'technician');
  await open(page, '/plant');
  await expect(page).toHaveURL(/access-denied|\/plant/);
  await expect(page.getByRole('heading', { name: 'Assembly plant', level: 1 })).toHaveCount(0);
});
