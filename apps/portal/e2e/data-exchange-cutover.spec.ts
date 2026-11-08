import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { PLANT_BRANCH } from './people';

/**
 * P9 — the cut-over checklist: every branch with how far it has come; a
 * branch's files in load order with their state worked out from the imports;
 * the Plant Manager marks a step not needed (a reason is required), and needed
 * again; each mark is in the audit trail; the sign-off waits until every step
 * is settled. Someone who only prepares files sees the checklist but cannot
 * mark it; another organisation's branch, or one that is not a branch at all,
 * is not found.
 */
test.describe.configure({ mode: 'serial' });

test('the Plant Manager: the plant’s checklist in order, a step marked not needed with its reason and needed again, the sign-off waiting', async ({ page }) => {
  const plant = await db().branch.findFirstOrThrow({ where: { name: PLANT_BRANCH }, select: { id: true } });
  await as(page, 'plant-manager');
  await open(page, '/data-exchange');
  await page.getByRole('link', { name: 'Cut-over checklist' }).click();
  await page.waitForURL(/\/data-exchange\/cutover$/);
  await expect(page.getByTestId('cutover-branch').filter({ hasText: PLANT_BRANCH })).toContainText(/Assembly plant · \d+ of 5 steps settled/i);
  await page.getByRole('link', { name: PLANT_BRANCH, exact: true }).click();
  await page.waitForURL(new RegExp(`/data-exchange/cutover/${plant.id}$`));
  await expect(page.getByTestId('cutover-step')).toHaveCount(5);
  expect(await page.getByTestId('cutover-step').evaluateAll((els) => els.map((e) => e.getAttribute('data-entity')))).toEqual(['staff', 'plantShipments', 'plantVehicles', 'plantKits', 'plantKitIssues']);

  const issues = page.locator('[data-testid="cutover-step"][data-entity="plantKitIssues"]');
  const before = await issues.getAttribute('data-state');
  test.skip(before === 'DONE' || before === 'AWAITING_APPROVAL' || before === 'IN_PROGRESS', 'kit issues are loaded or under way on this database');
  if (before === 'NOT_NEEDED') { await issues.getByRole('button', { name: 'Needed after all' }).click(); await expect(issues).not.toHaveAttribute('data-state', 'NOT_NEEDED'); }
  await issues.getByRole('button', { name: 'Not needed here' }).click();
  await issues.getByLabel(/Why does this branch have no plant kit issues/).fill('n/a');
  await issues.getByRole('button', { name: 'Mark as not needed' }).click();
  await expect(issues.getByRole('alert')).toContainText('Say why this branch has none');
  await issues.getByLabel(/Why does this branch have no plant kit issues/).fill('No open shortages on the day of the cut-over');
  await issues.getByRole('button', { name: 'Mark as not needed' }).click();
  await expect(issues).toHaveAttribute('data-state', 'NOT_NEEDED');
  await expect(issues).toContainText('Not needed: “No open shortages on the day of the cut-over”');
  await expect(page.getByText(/Marked not needed: Plant kit issues/).first()).toBeVisible();
  expect(await db().auditLog.count({ where: { entityType: 'BranchCutover', entityId: plant.id, action: 'data_exchange.cutover_step_not_needed' } })).toBeGreaterThan(0);
  // The sign-off waits for every step.
  const signOff = page.getByRole('button', { name: `Sign off ${PLANT_BRANCH} as cut over` });
  const settled = await page.getByTestId('cutover-step').evaluateAll((els) => els.filter((e) => ['DONE', 'NOT_NEEDED'].includes(e.getAttribute('data-state') ?? '')).length);
  if (settled < 5) await expect(signOff).toBeDisabled();
  // Needed again.
  await issues.getByRole('button', { name: 'Needed after all' }).click();
  await expect(issues).not.toHaveAttribute('data-state', 'NOT_NEEDED');
});

test('someone who only prepares files sees the checklist but cannot mark it; a branch of nowhere is not found', async ({ page }) => {
  const plant = await db().branch.findFirstOrThrow({ where: { name: PLANT_BRANCH }, select: { id: true } });
  await as(page, 'it-administrator');
  await open(page, `/data-exchange/cutover/${plant.id}`);
  await expect(page.getByTestId('cutover-step')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Not needed here' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sign off/ })).toHaveCount(0);
  await page.goto('/data-exchange/cutover/not-a-branch');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
