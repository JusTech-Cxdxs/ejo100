import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { DEMO_PEOPLE } from '../lib/plant/demo/plan';

/**
 * P3 — the plant demo: an administrator loads six invented weeks into the
 * assembly plant from the plant page (typed words confirm it), every plant
 * page fills, the demo is marked and replaceable, and it can be taken out
 * again without touching anything else. Not for anyone below administrator.
 */
test.describe.configure({ mode: 'serial' });

test('the administrator loads the demo: the plant, the line, the kits, QA, Headquarters and a vehicle’s page all fill', async ({ page }) => {
  const accountsBefore = await db().account.count({ where: { user: { email: { in: DEMO_PEOPLE.map((p) => p.email) } } } });
  await as(page, 'administrator');
  await open(page, '/plant');
  const card = page.getByTestId('plant-demo');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Load the plant demo|Reload or remove the demo/ }).click();
  await card.getByRole('textbox').fill('load the demo');
  await card.getByRole('button', { name: 'Load the demo as of now' }).click();
  await expect(card.getByRole('status')).toContainText(/Loaded: 7 shipments, 80 kits, \d+ vehicles/, { timeout: 90_000 });
  await expect(card.getByRole('status')).toContainText(/First-time-through \d+%/);
  const org = await db().organisation.findFirstOrThrow({ where: { users: { some: { email: 'admin@e2e.test' } } } });
  const vehicles = await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } });
  expect(vehicles).toBeGreaterThanOrEqual(55);
  expect(await db().plantKit.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } })).toBe(80);
  // The plant's people are the demo organisation's people (lib/demo/people.ts): one account each, on the plant branch,
  // and the plant demo makes no sign-in of its own (the demo-people step does; a load adds none).
  const plantPeople = await db().user.findMany({ where: { email: { in: DEMO_PEOPLE.map((p) => p.email) } }, select: { organisationId: true, branch: { select: { type: true } } } });
  expect(plantPeople).toHaveLength(DEMO_PEOPLE.length);
  for (const p of plantPeople) { expect(p.organisationId).toBe(org.id); expect(p.branch?.type).toBe('ASSEMBLY_PLANT'); }
  expect(await db().account.count({ where: { user: { email: { in: DEMO_PEOPLE.map((p) => p.email) } } } })).toBe(accountsBefore);
  // The plant page: vehicles by stage, with the yard and the line filled.
  await expect(page.getByTestId('plant-demo')).toContainText(/\d+ demo vehicles and 7 demo shipments/);
  await expect(page.getByRole('list', { name: 'Vehicles by stage' })).toContainText('In the yard');
  expect(await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO', stage: 'YARD' } })).toBeGreaterThan(10);
  // The line board shows vehicles at stations and figures.
  await open(page, '/plant/line');
  await expect(page.locator('a[data-vin^="JAANLR85EL7"], a[data-vin^="LVVDB21B8RD0"]').first()).toBeVisible();
  const ftt = page.getByRole('list', { name: 'Line figures' }).locator('li', { hasText: 'First-time-through' });
  await expect(ftt).toContainText(/\d+%/);
  await expect(page.getByText('Top defects (30 days)')).toBeVisible();
  // Kits: shipments with containers and SAP purchase orders; one kit on hold.
  await open(page, '/plant/kits');
  await expect(page.locator('li[data-kit]').first()).toBeVisible();
  await expect(page.getByText('On hold').first()).toBeVisible();
  await open(page, '/plant/shipments');
  await expect(page.getByText(/B\/L MAEU\d+/).first()).toBeVisible();
  // QA audits exist, one failed.
  await open(page, '/plant/qa');
  await expect(page.locator('li[data-audit]').first()).toBeVisible();
  await expect(page.getByText(/Failed · \d+ demerits/).first()).toBeVisible();
  // Headquarters shows the plant's figures.
  await open(page, '/headquarters');
  await expect(page.getByRole('rowheader', { name: /Afprint Assembly Plant/ })).toContainText(/\d+ on the line · \d+ at PDI · \d+ in the yard/);
  // A demo vehicle's page: its kit, its stations, its PDI.
  const yard = await db().plantVehicle.findFirstOrThrow({ where: { organisationId: org.id, externalSource: 'EJO-DEMO', stage: 'YARD' }, select: { vin: true } });
  await open(page, `/vehicles/${yard.vin}`);
  await expect(page.getByText('C1 Chassis frame dress').or(page.getByText('B1 Body receiving')).first()).toBeVisible();
  await expect(page.locator('li', { hasText: 'Pre-delivery inspection' }).first().getByText('Done')).toBeVisible();
});

test('loading again replaces the demo (never doubles it); a record a person made is untouched', async ({ page }) => {
  const org = await db().organisation.findFirstOrThrow({ where: { users: { some: { email: 'admin@e2e.test' } } } });
  const before = await db().plantVehicle.count({ where: { organisationId: org.id } });
  const demoBefore = await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } });
  const ownBefore = await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: null } });
  await as(page, 'administrator');
  await open(page, '/plant');
  const card = page.getByTestId('plant-demo');
  await card.getByRole('button', { name: 'Reload or remove the demo' }).click();
  await card.getByRole('textbox').fill('load the demo');
  await card.getByRole('button', { name: 'Load the demo as of now' }).click();
  await expect(card.getByRole('status')).toContainText(/Loaded:/, { timeout: 90_000 });
  expect(await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } })).toBeGreaterThanOrEqual(demoBefore - 3);
  expect(await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } })).toBeLessThanOrEqual(demoBefore + 3);
  expect(await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: null } })).toBe(ownBefore);
  expect(await db().plantVehicle.count({ where: { organisationId: org.id } })).toBeLessThanOrEqual(before + 3);
  expect(await db().auditLog.count({ where: { organisationId: org.id, action: 'demo.plant_loaded' } })).toBeGreaterThanOrEqual(2);
});

test('only an administrator sees the card; the plant manager and the workshop do not', async ({ page }) => {
  await as(page, 'plant-manager');
  await open(page, '/plant');
  await expect(page.getByTestId('plant-demo')).toHaveCount(0);
});

test('the demo can be taken out again: only the EJO-DEMO records go', async ({ page }) => {
  const org = await db().organisation.findFirstOrThrow({ where: { users: { some: { email: 'admin@e2e.test' } } } });
  const ownBefore = await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: null } });
  await as(page, 'administrator');
  await open(page, '/plant');
  const card = page.getByTestId('plant-demo');
  await card.getByRole('button', { name: 'Reload or remove the demo' }).click();
  await card.getByRole('textbox').fill('remove the demo');
  await card.getByRole('button', { name: 'Remove the demo' }).click();
  await expect(card.getByRole('status')).toContainText(/Removed \d+ demo vehicles and 7 demo shipments/, { timeout: 60_000 });
  expect(await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } })).toBe(0);
  expect(await db().plantShipment.count({ where: { organisationId: org.id, externalSource: 'EJO-DEMO' } })).toBe(0);
  expect(await db().plantVehicle.count({ where: { organisationId: org.id, externalSource: null } })).toBe(ownBefore);
  // The people stay (they are staff on the plant).
  expect(await db().user.count({ where: { organisationId: org.id, email: { in: DEMO_PEOPLE.map((p) => p.email) } } })).toBe(DEMO_PEOPLE.length);
});
