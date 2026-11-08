import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { PLANT_BRANCH } from './people';

/**
 * P8 — the assembly plant's records at the cut-over, end to end, in their
 * order: shipments (SHP numbers, old references kept) → the vehicles already
 * in the plant (on the line at their station, the ones before done before
 * EJO; past the line with the gate passed before EJO) → the kits on the
 * packing lists (checked before EJO, released and linked to their vehicle,
 * or still to check) → the issues raised on them. Each file is prepared by
 * the IT Administrator and approved by the Plant Manager; refusals are said
 * in plain words; nobody is emailed. Undo goes in reverse: a kit with an
 * issue on it stays (reported) until the issues are undone; then the kits go
 * to the Recycle bin and one comes back whole, checklist and all.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-8);
const vin = (n: number) => `JAANLR85P${STAMP}`.slice(0, 16) + String(n);
const ref = (n: number) => `E2E-SHP-${STAMP}-${n}`;
const BL = `E2EBL${STAMP}`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');
/** A Lagos moment n days ago, as the plant's registers write it. */
const ago = (n: number, time = '08:30') => `${new Date(Date.now() + 3_600_000 - n * 86_400_000).toISOString().slice(0, 10)} ${time}`;
const url: Record<string, string> = {};
let plantId = '';

async function load(page: Page, entity: string, name: string, body: string, expectOnCheck: (page: Page) => Promise<void>): Promise<string> {
  await as(page, 'it-administrator');
  await open(page, `/data-exchange/new?entity=${entity}`);
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-branch').selectOption(plantId);
  await page.locator('#import-file').setInputFiles({ name: `${name}-${STAMP}.csv`, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  const at = page.url();
  await expectOnCheck(page);
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'plant-manager');
  await open(page, at);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  return at;
}

test('shipments: refusals in plain words, the totals, approved by the Plant Manager — each an SHP shipment with its old reference', async ({ page }) => {
  plantId = (await db().branch.findFirstOrThrow({ where: { name: PLANT_BRANCH }, select: { id: true } })).id;
  url.shipments = await load(page, 'plantShipments', 'shipments', csv([
    ['Shipment ref', 'Supplier', 'Origin', 'Bill of lading', 'Vessel', 'Containers', 'Arrived', 'EBELN', 'Branch'],
    [ref(1), 'Isuzu Motors Ltd', 'Yokohama, Japan', BL, 'MV Hoegh Trident', `MSKU${STAMP}1; MSKU${STAMP}2`, ago(20), '4500099001', PLANT_BRANCH],
    [ref(2), 'Soueast Motor', 'Fuzhou, China', '', 'MV Grande Lagos', '', ago(12, '14:00'), '', ''],
    [ref(3), '', 'Yokohama, Japan', '', '', '', ago(5), '', ''],
    [ref(4), 'Isuzu Motors Ltd', '', '', '', '', ago(5), '', 'Isolo Branch'],
  ]), async (p) => {
    await expect(p.getByText('Say who shipped the kits (the supplier).')).toBeVisible();
    await expect(p.getByText(new RegExp(`This row is for “Isolo Branch”, but this import loads into ${PLANT_BRANCH}`))).toBeVisible();
    await expect(p.getByTestId('plant-import-totals')).toContainText('2 shipments');
  });
  const s = await db().plantShipment.findMany({ where: { externalId: { in: [ref(1), ref(2)] } }, orderBy: { externalId: 'asc' } });
  expect(s.map((x) => [x.externalId, x.number.startsWith('SHP-'), x.branchId === plantId, Boolean(x.importJobId)])).toEqual([[ref(1), true, true, true], [ref(2), true, true, true]]);
  expect(s[0]!.containers).toEqual([`MSKU${STAMP}1`, `MSKU${STAMP}2`]);
  expect(s[0]!.arrivedAt.toISOString()).toBe(new Date(`${ago(20).replace(' ', 'T')}:00+01:00`).toISOString());
});

test('plant vehicles: on the line at its station (the ones before done before EJO), in the yard with the gate passed before EJO; a sold vehicle refused', async ({ page }) => {
  const route = await db().plantRoute.findFirst({ where: { branchId: plantId, familyKey: 'isuzu-n', isActive: true }, orderBy: { version: 'desc' } });
  const stations = (route?.stations as { code: string }[] | undefined) ?? null;
  const second = stations?.[1]?.code ?? 'C1';
  url.vehicles = await load(page, 'plantVehicles', 'vehicles', csv([
    ['VIN', 'Model', 'Engine number', 'Colour', 'Model year', 'Stage', 'Current station', 'Line started', 'Gate passed', 'AUFNR'],
    [vin(1), 'NQR', `4HK1-${STAMP}1`, 'White', '2026', 'On the line', second, ago(1, '07:30'), '', '000001099101'],
    [vin(2), 'NPR', `4HK1-${STAMP}2`, 'Arctic White', '2026', 'YARD', '', ago(9, '07:30'), ago(9, '16:10'), '000001099102'],
    [vin(3), 'NQR', '', '', '', 'Sold', '', '', '', ''],
  ]), async (p) => {
    await expect(p.getByText(/A sold vehicle is the customer’s/)).toBeVisible();
    await expect(p.getByTestId('plant-import-totals')).toContainText('2 vehicles');
    await expect(p.getByTestId('plant-import-totals')).toContainText('1 on the line');
  });
  const [v1, v2] = await Promise.all([vin(1), vin(2)].map((v) => db().plantVehicle.findFirstOrThrow({ where: { vinKey: v }, include: { stationVisits: { orderBy: { sort: 'asc' } } } })));
  expect([v1!.stage, v1!.currentStation, v2!.stage]).toEqual(['LINE', second, 'YARD']);
  expect(v1!.stationVisits.map((x) => x.status).slice(0, 3)).toEqual(['PASSED', 'IN_PROGRESS', 'PENDING']);
  expect(v2!.stationVisits.every((x) => x.status === 'PASSED' && !x.passedById)).toBe(true);
  expect(v2!.gatePassedAt?.toISOString()).toBe(new Date(`${ago(9, '16:10').replace(' ', 'T')}:00+01:00`).toISOString());
  // The line board shows it at its station.
  await open(page, `/plant/line/${v1!.id}`);
  await expect(page.getByText(vin(1)).first()).toBeVisible();
});

test('kits: on their shipments — released to its vehicle, checked and waiting for release, still to check; an unknown shipment refused', async ({ page }) => {
  url.kits = await load(page, 'plantKits', 'kits', csv([
    ['Shipment ref', 'VIN', 'Engine number', 'Model', 'Lot', 'Cases expected', 'Cases received', 'Status', 'Inspector', 'Submitted', 'Decided by', 'Decided', 'Usage decision'],
    [ref(1), vin(2), `4HK1-${STAMP}2`, 'NPR', 'LOT-E2E-1', '12', '12', 'RELEASED', 'Kemi Kitinspector', ago(10, '10:00'), 'Quincy Qualitysupervisor', ago(10, '11:00'), 'A'],
    [ref(1), vin(4), `4HK1-${STAMP}4`, 'NQR', 'LOT-E2E-2', '14', '14', 'Submitted', 'Kemi Kitinspector', ago(2, '10:00'), '', '', ''],
    [ref(1), vin(5), '', 'NQR', 'LOT-E2E-3', '14', '', 'ARRIVED', '', '', '', '', ''],
    ['SHP-NOWHERE', vin(6), '', 'NQR', '', '', '', 'ARRIVED', '', '', '', '', ''],
  ]), async (p) => {
    await expect(p.getByText('Shipment “SHP-NOWHERE” is not at this plant in EJO. Import the shipments file first, or give the kit’s SHP number.')).toBeVisible();
    await expect(p.getByTestId('plant-import-totals')).toContainText('3 kits');
  });
  const kits = await db().plantKit.findMany({ where: { vinKey: { in: [vin(2), vin(4), vin(5)] } }, orderBy: { vinKey: 'asc' }, include: { checks: true } });
  expect(kits.map((k) => k.status)).toEqual(['RELEASED', 'SUBMITTED', 'ARRIVED']);
  const v2 = await db().plantVehicle.findFirstOrThrow({ where: { vinKey: vin(2) }, select: { id: true } });
  expect(kits[0]!.plantVehicleId).toBe(v2.id);
  expect(kits[1]!.checks.length).toBeGreaterThan(0);
  expect(kits[1]!.checks.every((c) => c.result === 'OK' && c.note === 'Checked before EJO.' && !c.checkedById)).toBe(true);
  expect(kits[2]!.checks.every((c) => c.result === null)).toBe(true);
  expect(kits.every((k) => k.number.startsWith('KIT-') && k.importJobId)).toBe(true);
});

test('kit issues: on their kits as they stood; then undo in reverse — a kit with an issue stays until the issues are undone, then the kits go to the bin and one comes back whole', async ({ page }) => {
  url.issues = await load(page, 'plantKitIssues', 'issues', csv([
    ['Kit VIN', 'Kind', 'Part number', 'Description', 'Case', 'Quantity', 'Stops the line', 'Status', 'Claim reference', 'Raised'],
    [vin(4), 'Shortage', '8-98156-321-0', 'Door glass regulator, right not in the case', 'C09', '1', 'Yes', 'OPEN', '', ago(2, '09:30')],
    [vin(5), 'DAMAGE', '', 'Bonnet dented in transit', 'C01', '1', 'No', 'CLAIMED', `Q2-${STAMP}`, ago(1)],
    [vin(9), 'DAMAGE', '', 'A kit that never came', '', '', '', '', '', ''],
  ]), async (p) => {
    await expect(p.getByText('This VIN has no kit at this plant in EJO. Import the kits file first, or check the VIN.')).toBeVisible();
  });
  const issues = await db().plantKitIssue.findMany({ where: { kit: { vinKey: { in: [vin(4), vin(5)] } } }, orderBy: { description: 'asc' } });
  expect(issues.map((i) => [i.status, i.stopsLine])).toEqual([['CLAIMED', false], ['OPEN', true]]);

  page.on('dialog', (d) => void d.accept());
  // The kits first: the two with issues stay (kept), the released one goes.
  await as(page, 'plant-manager');
  await open(page, url.kits!);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect((await db().plantKit.findMany({ where: { vinKey: { in: [vin(2), vin(4), vin(5)] } }, select: { vinKey: true } })).map((k) => k.vinKey).sort()).toEqual([vin(4), vin(5)]);
  // The issues: both to the bin (the two kits they were on stay in EJO, as the kits undo reported).
  await open(page, url.issues!);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect(await db().plantKitIssue.count({ where: { kit: { vinKey: { in: [vin(4), vin(5)] } } } })).toBe(0);
  const binned = await db().recycleBinItem.findFirstOrThrow({ where: { entityType: 'PlantKit', restoredAt: null, label: { contains: vin(2) } }, select: { reference: true, entityId: true } });
  await as(page, 'administrator');
  await open(page, '/recycle-bin?type=PlantKit');
  await page.getByTestId('bin-row').filter({ hasText: binned.reference }).first().getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  const back = await db().plantKit.findUniqueOrThrow({ where: { id: binned.entityId }, include: { checks: true } });
  expect(back.number).toBe(binned.reference);
  expect(back.status).toBe('RELEASED');
  expect(back.checks.length).toBeGreaterThan(0);
  // A shipment its kits still hang on stays; the other (no kits) goes to the bin.
  await as(page, 'plant-manager');
  await open(page, url.shipments!);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect((await db().plantShipment.findMany({ where: { externalId: { in: [ref(1), ref(2)] } }, select: { externalId: true } })).map((s) => s.externalId)).toEqual([ref(1)]);
});
