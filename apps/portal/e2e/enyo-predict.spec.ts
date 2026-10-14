import { expect, test, type Page } from '@playwright/test';
import { as, open, uniq, expectNoUrlError } from './helpers';
import { OTHER_BRANCH_TECH, who } from './people';
import { db, freshVehicle, predictionFor, predictionsMode, seedPastBrakeJobs, setPredictionsMode, PREDICT_PART } from './db';
import { card, jobCardReadyForEstimate, managerApprovesEstimate, requestStoreMatching, storeMatchesAll, submitEstimate, supervisorApprovesEstimate } from './workflows';

/**
 * Enyo's first learning loop, end to end:
 *  • a few finished Job Cards with approved estimates (fixtures), all for the
 *    same kind of complaint — five in this branch, two in the second branch;
 *  • the front desk opens a new Job Card with a similar complaint → a
 *    prediction is stored in SHADOW, and nobody sees anything;
 *  • the organisation moves to SUGGEST → the estimate page shows "Likely lines
 *    from similar jobs"; Add fills in the normal form (nothing is saved until
 *    the person presses the form's own Add); "Why?" lists only the jobs this
 *    person may open;
 *  • the Manager's final approval resolves the prediction (precision, recall);
 *  • the Learning page shows the numbers;
 *  • a technician of the other branch never sees this branch's jobs through
 *    Enyo's similar_past_jobs tool.
 * The organisation's mode is put back as it was, whatever happens.
 */
test.describe.configure({ mode: 'serial' });

const TAG = uniq('Q').toLowerCase().replace(/[^a-z0-9]/g, '');
const COMPLAINT = `Brake pads squealing and grinding when braking ${TAG}`;
const S = { url: '', id: '', plate: '', main: [] as string[], other: [] as string[], modeBefore: null as string | null };

const likely = (page: Page) => page.getByRole('heading', { name: 'Likely lines from similar jobs' });
const addForm = (page: Page) => page.locator('form').filter({ has: page.locator('select[name="type"]') });

test.beforeAll(async () => {
  S.modeBefore = await predictionsMode();
  await setPredictionsMode('SHADOW');
  const seeded = await seedPastBrakeJobs(TAG, { main: 5, other: 2 });
  S.main = seeded.main;
  S.other = seeded.other;
  S.plate = (await freshVehicle('PRD', { make: 'Toyota', model: 'Hilux', year: 2019 })).plate;
});

test.afterAll(async () => {
  // Leave the organisation as it was for every other spec.
  if (S.modeBefore === 'SHADOW' || S.modeBefore === 'SUGGEST' || S.modeBefore === 'OFF') await setPredictionsMode(S.modeBefore);
  else {
    const org = await db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
    await db().enyoSetting.updateMany({ where: { organisationId: org.id }, data: { predictionsMode: 'SHADOW' } });
  }
});

test('a new Job Card gets a shadow prediction from similar finished jobs, and nobody sees it', async ({ page }) => {
  S.url = await jobCardReadyForEstimate(page, { plate: S.plate, complaint: COMPLAINT });
  S.id = S.url.split('/').pop()!;

  const p = await predictionFor(S.id);
  expect(p.status).toBe('SHADOW');
  expect(p.modelVersion).toBe('knn-tfidf-1');
  const out = p.output as { ok: boolean; lines: { key: string; support: number; of: number }[]; neighbours: { number: string }[] };
  expect(out.ok, JSON.stringify(out).slice(0, 400)).toBe(true);
  const keys = out.lines.map((l) => l.key);
  expect(keys).toContain(`STORE_PART:${PREDICT_PART.type.toLowerCase()}`);
  expect(keys).toContain('LABOUR:brake');
  // The seeded jobs (both branches) are the closest matches.
  const neighbours = out.neighbours.map((n) => n.number);
  for (const n of [...S.main, ...S.other]) expect(neighbours).toContain(n);
  // No customer details in what was stored.
  expect(JSON.stringify(p.input)).not.toContain(S.plate);

  // Shadow mode: the technician working on the estimate sees nothing from Enyo.
  await open(page, S.url);
  await expect(addForm(page)).toBeVisible();
  await expect(likely(page)).toHaveCount(0);
});

test('in Suggest mode the estimate shows likely lines; Add fills in the normal form; Why? lists only jobs this person can open', async ({ page }) => {
  await setPredictionsMode('SUGGEST');
  try {
    await test.step('the technician adds the Store part from the card', async () => {
      await as(page, 'technician');
      await open(page, S.url);
      await expect(likely(page)).toBeVisible();
      const section = page.getByTestId('likely-lines');
      await expect(section.getByText(PREDICT_PART.type, { exact: true })).toBeVisible();
      await expect(section).toContainText(/\d+ of \d+ similar jobs/);
      // Priced from today's Store selling price, never from history.
      await expect(section).toContainText(`₦${PREDICT_PART.price.toLocaleString('en-NG')} each today`);

      const rowsBefore = await card(page, 'Estimate').locator('table tbody tr').count();
      await section.getByRole('button', { name: `Add ${PREDICT_PART.type} to the form` }).click();
      const form = addForm(page);
      await expect(form.locator('select[name="type"]')).toHaveValue('STORE_PART');
      await expect(form.getByPlaceholder('Search Part Types…')).toHaveValue(PREDICT_PART.type);
      await expect(form.locator('input[name="quantity"]')).toHaveValue('2');
      // Nothing was written by pressing Add on the card.
      expect(await db().estimateLineItem.count({ where: { estimate: { jobCardId: S.id } } })).toBe(0);

      await form.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(card(page, 'Estimate').locator('table tbody tr')).toHaveCount(rowsBefore + 1);
      expectNoUrlError(page);
      // It now shows as already on the estimate.
      await expect(page.getByTestId('likely-lines')).toContainText('Already on the estimate');
    });

    await test.step('Why? shows the similar jobs of this branch only', async () => {
      const section = page.getByTestId('likely-lines');
      await section.getByText('Why?', { exact: true }).click();
      for (const n of S.main) await expect(section.getByRole('link', { name: n })).toBeVisible();
      for (const n of S.other) await expect(section).not.toContainText(n);
      await expect(section).toContainText(/2 similar jobs are from a branch you cannot open/);
    });

    await test.step('the supervisor adds the labour line from the card, priced from what similar jobs charged', async () => {
      await as(page, 'workshop-supervisor');
      await open(page, S.url);
      const section = page.getByTestId('likely-lines');
      await expect(section).toBeVisible();
      await section.getByRole('button', { name: 'Add Labour for brake to the form' }).click();
      const form = addForm(page);
      await expect(form.locator('select[name="type"]')).toHaveValue('LABOUR');
      await expect(form.locator('input[name="description"]')).toHaveValue('Labour for brake');
      await expect(form.locator('input[name="unitPrice"]')).toHaveValue('15000');
      await form.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(card(page, 'Estimate').locator('table tbody tr')).toHaveCount(2);
      expectNoUrlError(page);
    });

    const p = await predictionFor(S.id);
    expect(p.status).toBe('SHOWN');
  } finally {
    await setPredictionsMode('SHADOW');
  }
  // Back in Shadow mode: the card is gone.
  await page.reload();
  await expect(addForm(page)).toBeVisible();
  await expect(likely(page)).toHaveCount(0);
});

test('the Manager\'s final approval resolves the prediction with precision and recall', async ({ page }) => {
  await as(page, 'workshop-supervisor');
  await open(page, S.url);
  await requestStoreMatching(page);
  await storeMatchesAll(page, S.id);
  await as(page, 'workshop-supervisor');
  await open(page, S.url);
  await submitEstimate(page);
  await supervisorApprovesEstimate(page);
  await as(page, 'workshop-manager');
  await open(page, S.url);
  await managerApprovesEstimate(page);

  const p = await predictionFor(S.id, (x) => x.status === 'RESOLVED');
  expect(p.resolvedAt).not.toBeNull();
  // Both approved lines were predicted.
  expect(p.recall).toBe(1);
  expect(p.precision ?? 0).toBeGreaterThanOrEqual(0.5);
  const outcome = p.outcome as { kept: string[]; previousStatus: string; labour: { error: number | null } };
  expect(outcome.kept.sort()).toEqual(['LABOUR:brake', `STORE_PART:${PREDICT_PART.type.toLowerCase()}`].sort());
  expect(outcome.previousStatus).toBe('SHOWN');
  expect(outcome.labour.error).toBe(0);
});

test('the Learning page shows how Enyo is doing', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/enyo/learning');
  await expect(page.getByRole('heading', { level: 1, name: /learning$/ })).toBeVisible();
  await expect(page.getByText('Current mode:')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready for Suggest?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accuracy by week' })).toBeVisible();
  await expect(page.getByText('Checked', { exact: true }).first()).toBeVisible();
  // At least the prediction resolved above is counted.
  await expect(page.getByRole('progressbar', { name: 'Checked predictions toward the rule' })).toHaveAttribute('aria-valuenow', /^[1-9]\d*$/);
  await expect(page.getByRole('link', { name: 'Training data (CSV)' })).toBeVisible();

  await test.step('the training data has no personal details', async () => {
    const res = await page.request.get('/enyo/learning/export?format=jsonl');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(TAG);
    for (const bad of [S.plate, 'customer@e2e.test', 'Ada Customer', ...S.main, S.id]) expect(body).not.toContain(bad);
  });

  await test.step('people without Enyo or Business Analytics are refused', async () => {
    await as(page, 'technician');
    await page.goto('/enyo/learning');
    await page.waitForURL(/access-denied/);
    const res = await page.request.get('/enyo/learning/export?format=csv');
    expect(res.status()).toBe(403);
  });
});

test('a technician of another branch never sees this branch\'s similar jobs through Enyo', async ({ page }) => {
  await as(page, OTHER_BRANCH_TECH);
  const status = await page.request.get('/api/enyo/status');
  test.skip(status.status() !== 200 || !(await status.json().catch(() => ({ ready: false }))).ready, 'Enyo chat is not available in this build');
  const res = await page.request.post('/api/enyo/chat', {
    data: { message: `[[tool:similar_past_jobs {"complaint":"${COMPLAINT}","make":"Toyota","model":"Hilux"}]]` },
    headers: { origin: process.env.E2E_BASE_URL ?? 'http://localhost:3001' },
    timeout: 60_000,
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  // Their own branch's jobs, never the first branch's.
  for (const n of S.other) expect(body).toContain(n);
  for (const n of S.main) expect(body).not.toContain(n);

  // And the main branch's technician sees the main branch's jobs, not the other branch's.
  await as(page, who('technician'));
  const mine = await page.request.post('/api/enyo/chat', {
    data: { message: `[[tool:similar_past_jobs {"complaint":"${COMPLAINT}"}]]` },
    headers: { origin: process.env.E2E_BASE_URL ?? 'http://localhost:3001' },
    timeout: 60_000,
  });
  const mineBody = await mine.text();
  expect(mineBody).toContain(S.main[0]!);
  for (const n of S.other) expect(mineBody).not.toContain(n);
});
