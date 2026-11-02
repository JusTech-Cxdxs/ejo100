import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { PLANT_BRANCH } from './people';
import { db } from './db';

/**
 * P1 — the assembly plant is its own branch (kind ASSEMBLY_PLANT):
 *   the plant team's pages name the plant; a workshop person with plant
 *   rights but no plant branch sees an explanation, never the plant's
 *   records; an administrator looking at the workshop through the branch
 *   lens is told the plant is elsewhere and switches with one tap; the
 *   branch pages show each branch's kind, and a branch holding records of
 *   its kind keeps that kind; Headquarters lists both branches.
 */

test('the plant team works at the assembly plant: the plant pages name it, and its vehicles are there', async ({ page }) => {
  await as(page, 'plant-manager');
  await open(page, '/plant');
  await expect(page.getByRole('heading', { name: 'Assembly plant', level: 1 })).toBeVisible();
  await expect(page.getByText(`${PLANT_BRANCH} · SAP plant 1100`)).toBeVisible();
  await expect(page.getByTestId('plant-reach')).toHaveCount(0);
  const plant = await db().branch.findFirstOrThrow({ where: { name: PLANT_BRANCH } });
  expect(plant.type).toBe('ASSEMBLY_PLANT');
  // Every plant record of the organisation is on an assembly-plant branch.
  expect(await db().plantVehicle.count({ where: { branch: { type: { not: 'ASSEMBLY_PLANT' } } } })).toBe(0);
  expect(await db().plantKit.count({ where: { branch: { type: { not: 'ASSEMBLY_PLANT' } } } })).toBe(0);
});

test('a branch administrator of the workshop has plant rights but no plant branch: an explanation, and none of the plant’s records', async ({ page }) => {
  await as(page, 'branch-administrator');
  await open(page, '/plant');
  await expect(page.getByRole('heading', { name: 'Assembly plant', level: 1 })).toBeVisible();
  await expect(page.getByTestId('plant-reach')).toContainText('No assembly plant is in your reach.');
  await expect(page.getByTestId('plant-reach')).toContainText('ask an administrator to move you to the plant’s branch');
  await expect(page.getByRole('link', { name: /^KIT-/ })).toHaveCount(0);
  await open(page, '/plant/kits');
  await expect(page.getByTestId('plant-reach')).toBeVisible();
  await expect(page.locator('li[data-kit]')).toHaveCount(0);
  await open(page, '/plant/vehicles');
  await expect(page.getByTestId('plant-reach')).toBeVisible();
});

test('an administrator looking at the workshop through the lens is told the plant is elsewhere, and switches with one tap', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/plant');
  // All branches: the plant shows.
  await expect(page.getByTestId('plant-reach')).toHaveCount(0);
  await page.getByTestId('branch-lens').getByRole('button', { name: /^Isolo Branch/ }).click();
  await expect(page.getByTestId('branch-lens').getByRole('status')).toContainText('Isolo Branch only');
  await expect(page.getByTestId('plant-reach')).toContainText('You are looking at a branch that is not an assembly plant.');
  await page.getByRole('button', { name: `Look at ${PLANT_BRANCH}` }).click();
  await expect(page.getByTestId('plant-reach')).toHaveCount(0);
  await expect(page.getByText(`${PLANT_BRANCH} · SAP plant 1100`)).toBeVisible();
  // Back to the whole organisation for the other tests.
  await page.getByTestId('branch-lens').getByRole('button', { name: /^All branches/ }).click();
  await expect(page.getByTestId('branch-lens').getByRole('status')).toContainText('whole organisation');
});

test('branches show their kind; the plant keeps its kind while it holds plant records; opening a plant needs its SAP code', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/branches');
  await expect(page.getByText('Assembly plant · SAP 1100')).toBeVisible();
  await expect(page.getByText('Plant records on a branch that is not an assembly plant')).toHaveCount(0);
  const plant = await db().branch.findFirstOrThrow({ where: { name: PLANT_BRANCH }, include: { businessUnit: { select: { organisationId: true } } } });
  // The plant holds a record (a vehicle registered there), so its kind cannot change — on a fresh database as much as a full one.
  const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@e2e.test' }, select: { id: true } });
  const vin = `JAANLR85P1${String(Date.now()).slice(-7)}`;
  await db().plantVehicle.create({ data: { organisationId: plant.businessUnit.organisationId, branchId: plant.id, vin, vinKey: vin, make: 'Isuzu', modelCode: 'NQR', modelName: 'Isuzu NQR', stage: 'LINE', sapPlant: plant.sapPlant, createdById: admin.id } });
  await open(page, `/branches/${plant.id}?edit=true`);
  await expect(page.getByLabel('What kind of place')).toHaveValue('ASSEMBLY_PLANT');
  await page.getByLabel('What kind of place').selectOption('WORKSHOP');
  await page.getByRole('button', { name: 'Save Branch Details' }).click();
  await expect(page.getByText(/holds \d+ plant records, so it stays assembly plant/)).toBeVisible();
  expect((await db().branch.findUniqueOrThrow({ where: { id: plant.id } })).type).toBe('ASSEMBLY_PLANT');
  // Opening a second plant without its SAP plant code is refused.
  await open(page, '/structure');
  await page.getByText('+ Open a new branch').click();
  await page.locator('#bu').selectOption({ index: 1 });
  await page.locator('#bn').fill(`E2E Plant ${Date.now()}`);
  await page.locator('#btype').selectOption('ASSEMBLY_PLANT');
  await page.locator('#bcity').fill('Ikeja');
  await page.locator('#bstate').fill('Lagos State');
  await page.getByRole('button', { name: 'Open branch' }).click();
  await expect(page.getByText(/An assembly plant needs its SAP plant code/)).toBeVisible();
});

test('Headquarters lists the workshop and the assembly plant, each with its own figures', async ({ page }) => {
  await as(page, 'executive');
  await open(page, '/headquarters');
  await expect(page.getByRole('rowheader', { name: /Isolo Branch/ })).toBeVisible();
  const plantRow = page.getByRole('rowheader', { name: new RegExp(PLANT_BRANCH) });
  await expect(plantRow).toBeVisible();
  await expect(plantRow).toContainText('Assembly plant');
  await expect(plantRow).toContainText(/\d+ on the line · \d+ at PDI · \d+ in the yard/);
});
