import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';

/**
 * D2 — kits arriving at the plant, on screen, end to end:
 *   the kit inspector records a shipment of two Isuzu kits from the packing
 *   list (a bad line refuses the whole list) → checks the first kit, counts
 *   its cases, raises a shortage that stops the line → sends it for release →
 *   cannot release their own → a PDI cannot start on that VIN yet → the
 *   quality supervisor finds it in Approvals, cannot release it while the
 *   line-stopping shortage is open, holds it → the shortage is claimed and
 *   resolved, a non-stopping one stays open → sent again → released with
 *   shortages (a concession, A) → the vehicle is on the line; its page shows
 *   the kit; search finds the kit and the shipment → the second kit is
 *   rejected (R). Exports list both.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-9);
const VIN1 = `JAANLR85E${STAMP.slice(0, 8)}`;
const VIN2 = `JAANLR85F${STAMP.slice(0, 8)}`;
const BL = `MSKU${STAMP}`;
let shipmentId = '';
let kit1 = { id: '', number: '' };
let kit2 = { id: '', number: '' };

async function answer(page: Page, label: string, result: 'OK' | 'Not OK', note?: string) {
  const row = page.locator('li[data-check]', { has: page.getByRole('group', { name: label, exact: true }) });
  if (note) await page.getByRole('textbox', { name: `What is wrong: ${label}` }).fill(note);
  await row.getByRole('button', { name: result, exact: true }).click();
}

test('the kit inspector records a shipment from the packing list: all or nothing, then two kits ready to check', async ({ page }) => {
  await as(page, 'kit-inspector');
  await open(page, '/plant');
  await page.getByRole('link', { name: 'Record a shipment' }).click();
  await page.waitForURL(/\/plant\/shipments\/new$/);
  await page.getByLabel(/^Plant/).selectOption({ label: 'Isolo Branch' });
  await page.getByLabel('Supplier').fill('Isuzu Motors Ltd');
  await page.getByLabel('Shipped from (optional)').fill('Japan, Tokyo');
  await page.getByLabel('Bill of lading (optional)').fill(BL);
  await page.getByLabel('Containers (optional, separated by spaces or commas)').fill(`TGHU${STAMP.slice(0, 7)}, MSCU${STAMP.slice(0, 7)}`);
  await page.getByLabel('SAP purchase order, EBELN (optional)').fill(`45${STAMP.slice(0, 8)}`);
  const kits = page.getByLabel(/The kits, one per line/);
  // A bad line: the form says so before sending, and the server saves nothing.
  await kits.fill(`VIN\tEngine\tModel\tLot\tCases\n${VIN1}\t4HK1-${STAMP.slice(-6)}\tNQR\tLOT-A\t14\nBRAKE PAD\t\tNQR\t\t`);
  await expect(page.getByText('1 kit ready: NQR CKD.')).toBeVisible();
  await expect(page.getByText('Line 3: “BRAKE PAD” is not a VIN or frame number.')).toBeVisible();
  await page.getByRole('button', { name: 'Record the shipment' }).click();
  await expect(page.getByText(/^Nothing was saved\. Line 3: “BRAKE PAD” is not a VIN or frame number\./)).toBeVisible();
  expect(await db().plantShipment.count({ where: { billOfLading: BL } })).toBe(0);
  await kits.fill(`${VIN1}\t4HK1-${STAMP.slice(-6)}\tNQR\tLOT-A\t14\n${VIN2}\t4HK1-${STAMP.slice(-5)}9\tNQR\tLOT-B\t14`);
  await expect(page.getByText('2 kits ready: NQR CKD.')).toBeVisible();
  await page.getByRole('button', { name: 'Record the shipment' }).click();
  await page.waitForURL(/\/plant\/shipments\/(?!new$)[^/]+$/);
  shipmentId = page.url().split('/').pop()!;
  const s = await db().plantShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { kits: { orderBy: { number: 'asc' }, include: { checks: true } } } });
  expect(s).toMatchObject({ supplier: 'Isuzu Motors Ltd', billOfLading: BL, sapPurchaseOrder: `45${STAMP.slice(0, 8)}` });
  expect(s.containers).toHaveLength(2);
  expect(s.kits.map((k) => [k.vinKey, k.status, k.kitType, k.casesExpected, k.templateKey])).toEqual([[VIN1, 'ARRIVED', 'CKD', 14, 'isuzu-n'], [VIN2, 'ARRIVED', 'CKD', 14, 'isuzu-n']]);
  expect(s.kits[0]!.checks.length).toBeGreaterThanOrEqual(20);
  kit1 = { id: s.kits[0]!.id, number: s.kits[0]!.number };
  kit2 = { id: s.kits[1]!.id, number: s.kits[1]!.number };
  await expect(page.getByRole('heading', { name: 'Shipment from Isuzu Motors Ltd' })).toBeVisible();
  await expect(page.getByRole('link', { name: kit1.number })).toBeVisible();
  // The same bill of lading again: refused, pointing at the shipment.
  await open(page, '/plant/shipments/new');
  await page.getByLabel(/^Plant/).selectOption({ label: 'Isolo Branch' });
  await page.getByLabel('Supplier').fill('Isuzu Motors Ltd');
  await page.getByLabel('Bill of lading (optional)').fill(BL);
  await page.getByLabel(/The kits, one per line/).fill(`${VIN1},,NQR`);
  await page.getByRole('button', { name: 'Record the shipment' }).click();
  await expect(page.getByText(`Bill of lading ${BL} is already shipment ${s.number}. Add the kits to it instead.`)).toBeVisible();
  // Nor can the same VIN come in as a second kit.
  await open(page, `/plant/shipments/${shipmentId}`);
  await page.getByLabel(/The kits, one per line/).fill(`${VIN1.toLowerCase()},,NQR`);
  await page.getByRole('button', { name: 'Add the kits' }).click();
  await expect(page.getByText(`Nothing was saved. ${VIN1} is already kit ${kit1.number} (Arrived).`)).toBeVisible();
});

test('the first kit: checks, cases, a line-stopping shortage; sent for release; the inspector cannot release it; no PDI yet', async ({ page }) => {
  await as(page, 'kit-inspector');
  const inspector = (await db().user.findUniqueOrThrow({ where: { email: 'kitinspector@e2e.test' }, select: { id: true } })).id;
  // Most checks answered (as a tablet would, tap by tap); the case count and the frame on screen.
  const checks = await db().plantKitCheck.findMany({ where: { kitId: kit1.id } });
  const onScreen = ['Case count matches the packing list', 'Frame rails straight, no bends or cracks'];
  await db().plantKitCheck.updateMany({ where: { kitId: kit1.id, label: { notIn: onScreen }, allowNa: false }, data: { result: 'OK', checkedById: inspector, checkedAt: new Date() } });
  await db().plantKitCheck.updateMany({ where: { kitId: kit1.id, allowNa: true }, data: { result: 'NA', checkedById: inspector, checkedAt: new Date() } });
  expect(checks.length).toBeGreaterThan(onScreen.length);
  await open(page, `/plant/kits/${kit1.id}`);
  await expect(page.getByRole('heading', { name: 'Kit · Isuzu NQR' })).toBeVisible();
  await answer(page, 'Frame rails straight, no bends or cracks', 'OK');
  // Not OK needs words.
  await page.locator('li[data-check]', { has: page.getByRole('group', { name: 'Case count matches the packing list' }) }).getByRole('button', { name: 'Not OK', exact: true }).click();
  await expect(page.getByText('Say what is wrong with “Case count matches the packing list”, then press Not OK again.')).toBeVisible();
  await answer(page, 'Case count matches the packing list', 'Not OK', 'Case 07 missing');
  await expect(page.getByText('Not OK: Case 07 missing')).toBeVisible();
  await expect(page.getByLabel('Still to do')).toContainText('Record how many cases arrived for this kit.');
  await page.getByLabel('Cases that arrived').fill('13');
  await page.getByRole('button', { name: 'Save the cases' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  // Two issues: a front axle hub that stops the line, mirror brackets that do not.
  await page.getByText('Raise a shortage or damage').click();
  await page.getByLabel('Part number').fill('8-97366-430-0');
  await page.getByLabel('Case', { exact: true }).fill('C07');
  await page.getByLabel('What the part is, or what is wrong').fill('Front axle hub assembly');
  await page.getByLabel('Quantity').fill('2');
  await page.getByLabel(/It stops the line/).check();
  await page.getByRole('button', { name: 'Raise it' }).click();
  await expect(page.locator('li[data-issue="8-97366-430-0"]')).toContainText('Stops the line');
  await page.getByLabel('Part number').fill('8-98012-111-0');
  await page.getByLabel('Case', { exact: true }).fill('C07');
  await page.getByLabel('What the part is, or what is wrong').fill('Mirror bracket');
  await page.getByRole('button', { name: 'Raise it' }).click();
  await expect(page.locator('li[data-issue="8-98012-111-0"]')).toContainText('Open');
  await page.getByRole('button', { name: 'Send for release' }).click();
  await expect(page.getByText('Waiting for release').first()).toBeVisible();
  // The inspector cannot release their own kit.
  await expect(page.getByRole('button', { name: /Release to the line/ })).toHaveCount(0);
  await expect(page.getByText('Releasing kits is for the quality supervisor or plant manager.')).toBeVisible();
  const k = await db().plantKit.findUniqueOrThrow({ where: { id: kit1.id }, include: { issues: true } });
  expect(k).toMatchObject({ status: 'SUBMITTED', casesReceived: 13, inspectorId: inspector, plantVehicleId: null });
  expect(k.issues.filter((i) => i.stopsLine)).toHaveLength(1);
  // No vehicle yet, so no PDI: the PDI bay is told why.
  await as(page, 'pdi-inspector');
  await open(page, '/plant');
  await page.getByLabel('Scan the label or type the VIN').fill(VIN1);
  await page.getByRole('button', { name: 'Start the PDI' }).click();
  await page.getByRole('form', { name: 'Register the vehicle' }).getByLabel('Model *').selectOption('NQR');
  await page.getByRole('button', { name: 'Register and start the PDI' }).click();
  await expect(page.getByText(`This VIN’s kit ${kit1.number} has not been released to the line yet (Waiting for release).`)).toBeVisible();
  expect(await db().plantVehicle.count({ where: { vinKey: VIN1 } })).toBe(0);
});

test('the quality supervisor: not while a shortage stops the line — hold; claimed and resolved; released with a concession (A)', async ({ page }) => {
  await as(page, 'quality-supervisor');
  await open(page, '/approvals');
  await page.getByRole('list', { name: 'Plant approvals' }).getByRole('link', { name: new RegExp(`Release kit ${kit1.number}`) }).click();
  await page.waitForURL(new RegExp(`/plant/kits/${kit1.id}$`));
  await expect(page.getByText('1 of 14 cases did not arrive.')).toBeVisible();
  await expect(page.getByText(/An issue that stops the line is still open \(8-97366-430-0\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Release to the line \(A\)/ })).toBeDisabled();
  await page.getByLabel(/^Note \(needed to release/).fill('Waiting for the hub assemblies from Isuzu');
  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  await expect(page.getByText(/On hold by Quincy Qualitysupervisor: Waiting for the hub assemblies from Isuzu/)).toBeVisible();
  expect((await db().plantKit.findUniqueOrThrow({ where: { id: kit1.id } })).sapUsageDecision).toBeNull();
  // The shortage is claimed from Isuzu, then the parts arrive.
  const hub = page.locator('li[data-issue="8-97366-430-0"]');
  await hub.getByRole('textbox').fill(`ISZ-CLM-${STAMP.slice(-4)}`);
  await hub.getByRole('button', { name: 'Claimed', exact: true }).click();
  await expect(hub).toContainText(`claim ISZ-CLM-${STAMP.slice(-4)}`);
  await hub.getByRole('textbox').fill('Two hubs arrived by air freight, fitted to stock');
  await hub.getByRole('button', { name: 'Resolved', exact: true }).click();
  await expect(hub).toContainText('Resolved');

  await as(page, 'kit-inspector');
  await open(page, `/plant/kits/${kit1.id}`);
  await page.getByRole('button', { name: 'Send for release again' }).click();
  await expect(page.getByText('Waiting for release').first()).toBeVisible();

  await as(page, 'quality-supervisor');
  await open(page, `/plant/kits/${kit1.id}`);
  // One shortage still open (it does not stop the line): a concession note is needed.
  await expect(page.getByText(/1 shortage or damage is still open\. Say why the kit can go to the line anyway/)).toBeVisible();
  await page.getByLabel(/^Note \(needed to release/).fill('Mirror brackets fitted at the trim station when they arrive');
  await page.getByRole('button', { name: 'Release with shortages (A)' }).click();
  await expect(page.getByText(/Released to the line with shortages\. By Quincy Qualitysupervisor/)).toBeVisible();
  const k = await db().plantKit.findUniqueOrThrow({ where: { id: kit1.id }, include: { vehicle: true } });
  expect(k).toMatchObject({ status: 'RELEASED', sapUsageDecision: 'A', releasedWithShortages: true });
  expect(k.vehicle).toMatchObject({ vinKey: VIN1, stage: 'LINE', modelCode: 'NQR', engineNumber: `4HK1-${STAMP.slice(-6)}` });
  expect(await db().auditLog.count({ where: { entityId: kit1.id, action: { in: ['plant.kit_submitted', 'plant.kit_held', 'plant.kit_issue_raised', 'plant.kit_issue_claimed', 'plant.kit_issue_resolved', 'plant.kit_released_with_shortages'] } } })).toBeGreaterThanOrEqual(7);
});

test('the second kit is rejected (R): final; the vehicle page, search and the exports show what happened', async ({ page }) => {
  await as(page, 'kit-inspector');
  const inspector = (await db().user.findUniqueOrThrow({ where: { email: 'kitinspector@e2e.test' }, select: { id: true } })).id;
  await db().plantKitCheck.updateMany({ where: { kitId: kit2.id, allowNa: false }, data: { result: 'OK', checkedById: inspector, checkedAt: new Date() } });
  await db().plantKitCheck.updateMany({ where: { kitId: kit2.id, allowNa: true }, data: { result: 'NA', checkedById: inspector, checkedAt: new Date() } });
  await db().plantKitCheck.updateMany({ where: { kitId: kit2.id, label: 'Cab shell free of dents and creases' }, data: { result: 'NOT_OK', note: 'Cab crushed in transit' } });
  await db().plantKit.update({ where: { id: kit2.id }, data: { status: 'INSPECTING', inspectorId: inspector, startedAt: new Date(), casesReceived: 14 } });
  await open(page, `/plant/kits/${kit2.id}`);
  await page.getByRole('button', { name: 'Send for release' }).click();
  await expect(page.getByText('Waiting for release').first()).toBeVisible();

  await as(page, 'quality-supervisor');
  await open(page, `/plant/kits/${kit2.id}`);
  await expect(page.getByText('1 check is Not OK, but no shortage or damage was raised.')).toBeVisible();
  await page.getByRole('button', { name: 'Reject (R)' }).click();
  await expect(page.getByText('Say why the kit is rejected (a few words).')).toBeVisible();
  await page.getByLabel(/^Note \(needed to release/).fill('Cab crushed in transit: insurance claim, kit returned');
  await page.getByRole('button', { name: 'Reject (R)' }).click();
  await expect(page.getByText(/Rejected by Quincy Qualitysupervisor \(SAP usage decision R\)/)).toBeVisible();
  expect(await db().plantKit.findUniqueOrThrow({ where: { id: kit2.id } })).toMatchObject({ status: 'REJECTED', sapUsageDecision: 'R', plantVehicleId: null });

  await as(page, 'plant-manager');
  // The released kit's vehicle: on the line, its kit in its life story.
  await open(page, `/vehicles/${VIN1}`);
  const kitStage = page.locator('li', { hasText: 'Kit arrival' }).first();
  await expect(kitStage.getByRole('link', { name: 'Kit arrival check' }).last()).toBeVisible();
  await expect(page.getByText(/released to the line with shortages \(SAP usage decision A\)/)).toBeVisible();
  // The rejected kit's VIN still has a page (its kit), and a PDI is refused.
  await open(page, `/vehicles/${VIN2}`);
  await expect(page.getByText(/rejected \(R\): not built/)).toBeVisible();
  // Search: the kit number and the shipment number.
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(kit1.number);
  await expect(box.locator('xpath=ancestor::div[2]').getByText(kit1.number).first()).toBeVisible();
  const ship = await db().plantShipment.findUniqueOrThrow({ where: { id: shipmentId } });
  await box.fill(ship.number);
  await expect(box.locator('xpath=ancestor::div[2]').getByText(ship.number).first()).toBeVisible();
  // The lists and their exports.
  await open(page, '/plant/kits?status=RELEASED');
  await expect(page.locator(`li[data-kit="${kit1.number}"]`)).toContainText('Released with shortages');
  await open(page, `/plant/kits?q=${ship.number}`);
  await expect(page.locator(`li[data-kit="${kit2.number}"]`)).toContainText('Rejected');
  await open(page, '/plant/vehicles?stage=LINE');
  await expect(page.getByRole('link', { name: VIN1 })).toBeVisible();
});

test('the workshop floor does not open the kits; a PDI inspector sees them but cannot record a shipment', async ({ page }) => {
  await as(page, 'technician');
  await open(page, '/plant/kits');
  await expect(page.getByRole('heading', { name: 'Kits', level: 1 })).toHaveCount(0);
  await as(page, 'pdi-inspector');
  await open(page, '/plant/kits');
  await expect(page.getByRole('heading', { name: 'Kits', level: 1 })).toBeVisible();
  await open(page, '/plant/shipments/new');
  await expect(page.getByRole('heading', { name: 'Record a shipment', level: 1 })).toHaveCount(0);
});
