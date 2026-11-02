import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { PLANT_BRANCH } from './people';
import { db } from './db';

/**
 * D3 — the line, end to end: a vehicle released from its kit is on the line
 * with the Isuzu route's stations → the operator works C1 in order (a torque
 * outside its limits fails, a defect is raised, the station is failed) →
 * rework recorded → the QC inspector verifies (never the operator) → the
 * check re-recorded, the station passed → the remaining stations → the gate
 * checks are recorded by the operator, so the operator cannot pass it; the
 * QC inspector can, but not while a B-defect is open → passed: ready for
 * PDI → the QA auditor audits it; an A finding fails the audit and sends it
 * back to the line → the board, the vehicle page, search and the exports.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-8);
const VIN = `JAANLR85L${STAMP}`;
let vehicleId = '';
let defectNumber = '';

/** A select wrapped in a label whose text starts with `name` (the label's text also carries the options). */
const field = (page: Page, name: string) => page.locator('label').filter({ hasText: new RegExp(`^${name}`) }).locator('select');

/** Opens a station's panel (the current station is open already; a click would close it). */
async function show(page: Page, code: string) {
  const b = page.locator(`button[data-station="${code}"]`);
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await expect(b).toHaveAttribute('aria-expanded', 'true');
}

async function passAll(page: Page, station: string, except: string[] = []) {
  const v = await db().plantStationVisit.findFirstOrThrow({ where: { plantVehicleId: vehicleId, code: station } });
  const checks = v.checks as { code: string; type: string; min?: number; max?: number }[];
  for (const c of checks) {
    if (except.includes(c.code)) continue;
    const row = page.locator(`li[data-check="${c.code}"]`);
    if (c.type === 'MEASURE') {
      await row.getByRole('textbox').fill(String(((c.min ?? 0) + (c.max ?? 0)) / 2));
      await row.getByRole('button', { name: 'Record' }).click();
      await expect(row.getByText(/^Pass · /)).toBeVisible();
    } else {
      await row.getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(row.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
  }
}

test('a vehicle on the line has the Isuzu route; the board shows it at C1', async ({ page }) => {
  const plant = await db().branch.findFirstOrThrow({ where: { name: PLANT_BRANCH }, include: { businessUnit: true } });
  const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@e2e.test' } });
  const v = await db().plantVehicle.create({ data: { organisationId: plant.businessUnit.organisationId, branchId: plant.id, vin: VIN, vinKey: VIN, make: 'Isuzu', modelCode: 'NQR', modelName: 'Isuzu NQR', engineNumber: `4HK1-${STAMP.slice(-6)}`, stage: 'LINE', sapPlant: plant.sapPlant, createdById: admin.id } });
  vehicleId = v.id;
  await as(page, 'production-supervisor');
  await open(page, '/plant/line');
  await expect(page.getByRole('heading', { name: 'The line', level: 1 })).toBeVisible();
  // Not started yet: the supervisor starts its build; the live route becomes its stations.
  const row = page.locator('li', { hasText: VIN }).first();
  await row.getByRole('button', { name: 'Start the build' }).click();
  await page.waitForURL(new RegExp(`/plant/line/${vehicleId}$`));
  await expect(page.getByRole('heading', { name: 'Build · Isuzu NQR (medium truck)' })).toBeVisible();
  const visits = await db().plantStationVisit.findMany({ where: { plantVehicleId: vehicleId }, orderBy: { sort: 'asc' } });
  expect(visits.map((x) => x.code)).toEqual(['C1', 'C2', 'C3', 'T1', 'T2', 'T3', 'F1', 'E1', 'R1', 'G1']);
  await open(page, '/plant/line');
  await expect(page.locator('section[data-column="C1"]').locator(`a[data-vin="${VIN}"]`)).toBeVisible();
});

test('the operator works C1: a torque outside its limits fails and needs a defect; stations run in order', async ({ page }) => {
  await as(page, 'line-operator');
  await open(page, `/plant/line/${vehicleId}`);
  // C2 before C1 is refused.
  await show(page, 'C2');
  await page.locator('li[data-check="C2-01"]').getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Finish C1 first: the line runs in order.');
  await show(page, 'C1');
  await passAll(page, 'C1', ['C1-03']);
  const torque = page.locator('li[data-check="C1-03"]');
  await torque.getByRole('textbox').fill('150');
  await torque.getByRole('button', { name: 'Record' }).click();
  await expect(torque.getByText('Fail · 150 N·m')).toBeVisible();
  // Finishing with a failed check and no defect is refused.
  await page.getByRole('button', { name: 'Finish the station' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('1 check failed: raise the defect');
  await page.getByText('Raise a defect').click();
  await field(page, 'Where').selectOption('FR');
  await field(page, 'What').selectOption('LOOSE');
  await field(page, 'Cause').selectOption('TQ');
  await page.locator('label').filter({ hasText: /^Describe it/ }).locator('input').fill('Cross-member bolts at 150 N·m, below the 180 minimum');
  await page.getByRole('button', { name: 'Raise it' }).click();
  await expect(page.getByText(/DEF-\d{4}-\d{6}/).first()).toBeVisible();
  defectNumber = (await db().plantDefect.findFirstOrThrow({ where: { plantVehicleId: vehicleId }, orderBy: { raisedAt: 'desc' } })).number;
  await expect(page.locator(`li[data-defect="${defectNumber}"]`)).toContainText('A · safety');
  await expect(page.locator(`li[data-defect="${defectNumber}"]`)).toContainText('Open');
  // The station is now failed (in rework). The operator records the rework; cannot verify it.
  expect((await db().plantStationVisit.findFirstOrThrow({ where: { plantVehicleId: vehicleId, code: 'C1' } })).status).toBe('FAILED');
  await page.getByLabel(`What was done to put right ${defectNumber}`).fill('Bolts re-torqued to 200 N·m with the calibrated wrench');
  await page.locator(`li[data-defect="${defectNumber}"]`).getByRole('button', { name: 'Reworked' }).click();
  await expect(page.locator(`li[data-defect="${defectNumber}"]`)).toContainText('Reworked, waiting for verification');
  await expect(page.getByRole('button', { name: 'Verified: close' })).toHaveCount(0);
});

test('the QC inspector verifies the rework from Approvals; the operator re-records the torque and passes C1; then the line to the gate', async ({ page }) => {
  await as(page, 'qc-inspector');
  await open(page, '/approvals');
  await page.getByRole('list', { name: 'Plant approvals' }).getByRole('link', { name: new RegExp(`Verify rework ${defectNumber}`) }).click();
  await page.waitForURL(new RegExp(`/plant/line/${vehicleId}$`));
  await page.locator(`li[data-defect="${defectNumber}"]`).getByRole('button', { name: 'Verified: close' }).click();
  await expect(page.locator(`li[data-defect="${defectNumber}"]`)).toContainText('Closed');

  await as(page, 'line-operator');
  await open(page, `/plant/line/${vehicleId}`);
  await show(page, 'C1');
  const torque = page.locator('li[data-check="C1-03"]');
  await torque.getByRole('textbox').fill('200');
  await torque.getByRole('button', { name: 'Record' }).click();
  await expect(torque.getByText('Pass · 200 N·m')).toBeVisible();
  await page.getByRole('button', { name: 'Finish the station' }).click();
  await expect(page.locator('button[data-station="C1"]')).toContainText('Passed');
  // The rest of the stations up to the gate, passing everything.
  for (const code of ['C2', 'C3', 'T1', 'T2', 'T3', 'F1', 'E1', 'R1']) {
    await show(page, code);
    await passAll(page, code);
    await page.getByRole('button', { name: 'Finish the station' }).click();
    await expect(page.locator(`button[data-station="${code}"]`)).toContainText('Passed');
  }
  // A cosmetic defect found at the gate stays open (it does not stop the gate); a B-defect does.
  // Found on the walk-round, not at a station, so the gate's own checks can still be finished.
  await page.getByText('Raise a defect').click();
  await field(page, 'Station').selectOption('');
  await field(page, 'Where').selectOption('PA');
  await field(page, 'What').selectOption('SCR');
  await field(page, 'Cause').selectOption('DMG');
  await page.locator('label').filter({ hasText: /^Describe it/ }).locator('input').fill('Light scratch on the left door');
  await page.getByRole('button', { name: 'Raise it' }).click();
  await expect(page.locator('li[data-defect]')).toHaveCount(2);
  await field(page, 'Where').selectOption('EL');
  await field(page, 'What').selectOption('MISS');
  await field(page, 'Cause').selectOption('KIT');
  await page.locator('label').filter({ hasText: /^Describe it/ }).locator('input').fill('Reverse lamp bulb missing');
  await page.getByRole('button', { name: 'Raise it' }).click();
  await expect(page.locator('li[data-defect]')).toHaveCount(3);
  // The gate checks, recorded by the operator.
  await show(page, 'G1');
  await passAll(page, 'G1');
  await page.getByRole('button', { name: 'Finish the gate checks' }).click();
  await expect(page.locator('button[data-station="G1"]')).toContainText('Done, waiting for the gate');
  await expect(page.getByRole('button', { name: /Pass the gate/ })).toHaveCount(0);
  await expect(page.getByText(/1 B-defect is open: fix before the gate/)).toBeVisible();
});

test('the gate: not the operator, not with the B-defect open; the QC inspector passes it once the B is closed; the C stays open', async ({ page }) => {
  const b = await db().plantDefect.findFirstOrThrow({ where: { plantVehicleId: vehicleId, severity: 'B' } });
  // Rework by the operator, verification by quality.
  await as(page, 'line-operator');
  await open(page, `/plant/line/${vehicleId}`);
  await page.getByLabel(`What was done to put right ${b.number}`).fill('Bulb fitted from the plant store');
  await page.locator(`li[data-defect="${b.number}"]`).getByRole('button', { name: 'Reworked' }).click();
  await expect(page.locator(`li[data-defect="${b.number}"]`)).toContainText('Reworked, waiting for verification');
  await as(page, 'qc-inspector');
  await open(page, `/plant/line/${vehicleId}`);
  await expect(page.getByRole('button', { name: /Pass the gate/ })).toHaveCount(0);
  await expect(page.getByText(/1 B-defect is open: fix before the gate/)).toBeVisible();
  await page.locator(`li[data-defect="${b.number}"]`).getByRole('button', { name: 'Verified: close' }).click();
  await expect(page.locator(`li[data-defect="${b.number}"]`)).toContainText('Closed');
  await show(page, 'G1');
  await expect(page.getByText('Every station passed, no open A or B defect, every gate check passed.')).toBeVisible();
  await page.getByRole('button', { name: /Pass the gate/ }).click();
  await expect(page.getByRole('button', { name: /Pass the gate/ })).toHaveCount(0);
  await expect(page.locator('button[data-station="G1"]')).toContainText('Passed');
  const v = await db().plantVehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  expect(v.stage).toBe('QA');
  expect(v.gatePassedAt).not.toBeNull();
  expect(await db().plantDefect.count({ where: { plantVehicleId: vehicleId, status: 'OPEN', severity: 'C' } })).toBe(1);
  expect(await db().auditLog.count({ where: { entityId: vehicleId, action: { in: ['plant.build_started', 'plant.check_failed', 'plant.defect_raised', 'plant.defect_reworked', 'plant.defect_closed', 'plant.station_passed', 'plant.gate_passed'] } } })).toBeGreaterThanOrEqual(15);
});

test('the QA auditor audits it: an A finding fails the audit and sends the vehicle back to the line; the board, the vehicle page, search and exports', async ({ page }) => {
  await as(page, 'qa-auditor');
  await open(page, '/plant/qa');
  await page.locator('li', { hasText: VIN }).getByRole('button', { name: 'Audit' }).click();
  await page.waitForURL(/\/plant\/qa\/[^/]+$/);
  await field(page, 'Section').selectOption('ENG');
  await field(page, 'Severity').selectOption('A');
  await page.locator('label', { hasText: 'Finding' }).getByRole('textbox').fill('Fuel return line weeping at the union');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Would fail')).toBeVisible();
  await page.getByRole('button', { name: /Finish: audit failed/ }).click();
  await expect(page.getByText(/Failed · 10 demerits/)).toBeVisible();
  const v = await db().plantVehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  expect(v.stage).toBe('LINE');
  expect(v.gatePassedAt).toBeNull();
  expect(await db().plantDefect.count({ where: { plantVehicleId: vehicleId, severity: 'A', status: 'OPEN', description: { startsWith: 'QA audit' } } })).toBe(1);

  await as(page, 'plant-manager');
  await open(page, '/plant/line');
  await expect(page.locator('section[data-column="G1"]').locator(`a[data-vin="${VIN}"]`)).toContainText('1 A');
  await open(page, `/vehicles/${VIN}`);
  await expect(page.getByText('QA audit', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('C1 Chassis frame dress').first()).toBeVisible();
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(defectNumber);
  await expect(box.locator('xpath=ancestor::div[2]').getByText(defectNumber).first()).toBeVisible();
  await open(page, '/plant/routes');
  await expect(page.getByRole('heading', { name: 'Isuzu N/Q-series truck line (CKD)' })).toBeVisible();
});

test('the routes: the production supervisor saves a new version with a problem refused first; vehicles on the line keep their stations', async ({ page }) => {
  await as(page, 'production-supervisor');
  await open(page, '/plant/routes');
  await page.getByRole('button', { name: 'Edit this route' }).first().click();
  const card = page.locator('[data-route-editor="isuzu-n"]');
  await expect(card).toBeVisible();
  const box = card.getByRole('textbox', { name: /Stations and checks/ });
  const text = await box.inputValue();
  await box.fill(`${text}\n\n# X9 | Extra station with no checks | STATION | 10`);
  await expect(card.getByText('Station X9 (Extra station with no checks) has no checks.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Save as a new version' })).toBeDisabled();
  await box.fill(text.replace('# C1 | Chassis frame dress | STATION | 45 min', '# C1 | Chassis frame dress | STATION | 50 min'));
  await card.getByRole('button', { name: 'Save as a new version' }).click();
  await expect(card.getByText('Saved as version 1.')).toBeVisible();
  const route = await db().plantRoute.findFirstOrThrow({ where: { familyKey: 'isuzu-n', isActive: true }, orderBy: { version: 'desc' } });
  expect((route.stations as { code: string; standardMinutes: number }[])[0]).toMatchObject({ code: 'C1', standardMinutes: 50 });
  expect((await db().plantStationVisit.findFirstOrThrow({ where: { plantVehicleId: vehicleId, code: 'C1' } })).standardMinutes).toBe(45);
});

test('a QA auditor cannot work the line, and an operator cannot edit routes', async ({ page }) => {
  await as(page, 'qa-auditor');
  await open(page, `/plant/line/${vehicleId}`);
  await expect(page.getByRole('button', { name: 'Pass', exact: true })).toHaveCount(0);
  await as(page, 'line-operator');
  await open(page, '/plant/routes');
  await expect(page.getByRole('button', { name: 'Edit this route' })).toHaveCount(0);
});
