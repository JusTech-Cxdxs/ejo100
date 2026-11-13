import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { OTHER_ORG_ADMIN, PLANT_BRANCH } from './people';
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
  // All branches: the plant shows, and on the plant's pages the bar offers only branches with a line — never the workshop.
  await expect(page.getByTestId('plant-reach')).toHaveCount(0);
  await expect(page.getByTestId('branch-lens').getByRole('button', { name: /^Isolo Branch/ })).toHaveCount(0);
  // The workshop is chosen on a page every branch has.
  await open(page, '/dashboard');
  await page.getByTestId('branch-lens').getByRole('button', { name: /^Isolo Branch/ }).click();
  await expect(page.getByTestId('branch-lens').getByRole('status')).toContainText('Isolo Branch only');
  await open(page, '/plant');
  await expect(page.getByTestId('plant-reach')).toContainText('You are looking at a branch that is not an assembly plant.');
  await page.getByRole('button', { name: `Look at ${PLANT_BRANCH}` }).click();
  await expect(page.getByTestId('plant-reach')).toHaveCount(0);
  await expect(page.getByText(`${PLANT_BRANCH} · SAP plant 1100`)).toBeVisible();
  // Back to the whole organisation for the other tests.
  await page.getByTestId('branch-lens').getByRole('button', { name: /^All branches/ }).click();
  await expect(page.getByTestId('branch-lens').getByRole('button', { name: /^All branches/ })).toHaveAttribute('aria-pressed', 'true');
  await open(page, '/dashboard');
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

test('an organisation with no assembly plant yet: its administrator opens one from the plant page in one tap, and the plant team moves onto it', async ({ page }) => {
  // Other Motors has a workshop and nobody at a plant.
  await as(page, { ...OTHER_ORG_ADMIN, role: 'administrator' });
  const org = await db().organisation.findFirstOrThrow({ where: { users: { some: { email: OTHER_ORG_ADMIN.email } } } });
  await db().branch.deleteMany({ where: { businessUnit: { organisationId: org.id }, type: 'ASSEMBLY_PLANT', plantVehicles: { none: {} }, plantKits: { none: {} } } });
  await open(page, '/plant');
  await expect(page.getByTestId('plant-reach')).toContainText('No assembly plant is in your reach.');
  await page.getByRole('button', { name: 'Open the assembly plant now' }).click();
  await expect(page.getByTestId('plant-reach')).toHaveCount(0);
  await expect(page.getByText(`${PLANT_BRANCH} · SAP plant 1100`)).toBeVisible();
  const plant = await db().branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id }, type: 'ASSEMBLY_PLANT' }, include: { departments: true } });
  expect(plant.sapPlant).toBe('1100');
  expect(plant.departments.map((d) => d.slug).sort()).toEqual(['plant-kit-receiving', 'plant-maintenance', 'plant-pdi', 'plant-production', 'plant-quality', 'plant-yard']);
  // Pressing it again is refused: the plant exists.
  expect(await db().branch.count({ where: { businessUnit: { organisationId: org.id }, type: 'ASSEMBLY_PLANT' } })).toBe(1);
});

test('a pasted link to an area the plant does not have explains itself; the workshop and leadership open theirs as before', async ({ page }) => {
  // The plant manager may view warranties at their branch, but the plant has no Warranty desk, store or workshop.
  await as(page, 'plant-manager');
  await open(page, '/warranty');
  const notice = page.getByTestId('area-not-here');
  await expect(notice).toContainText(`${PLANT_BRANCH} has no Warranty.`);
  await expect(notice).toContainText('ask an administrator to move your account');
  await expect(page.getByRole('heading', { name: 'Warranty', level: 1 })).toHaveCount(0);
  await open(page, '/warranty/claims');
  await expect(page.getByTestId('area-not-here')).toBeVisible();
  await page.getByTestId('area-not-here').getByRole('link', { name: 'Go to the assembly plant' }).click();
  await expect(page.getByRole('heading', { name: 'Assembly plant', level: 1 })).toBeVisible();
  // Without the permission at all it is the ordinary refusal, as before.
  await open(page, '/inventory');
  await expect(page.getByRole('heading', { name: /You don.t have access to this/ })).toBeVisible();
  // The workshop's own people, and leadership whatever their branch: the pages themselves.
  await as(page, 'workshop-manager');
  await open(page, '/warranty');
  await expect(page.getByTestId('area-not-here')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Warranty', level: 1 })).toBeVisible();
  await as(page, 'administrator');
  for (const path of ['/workshop', '/inventory', '/warranty']) {
    await open(page, path);
    await expect(page.getByTestId('area-not-here')).toHaveCount(0);
  }
});
