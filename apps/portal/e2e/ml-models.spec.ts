import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { as, open, uniq, waitOutcome } from './helpers';
import { db } from './db';

/**
 * Enyo's machine learning, end to end without Python: the trainer's machine
 * door (/api/ml) refuses anyone without the token, hands out de-identified
 * datasets, and takes a trained model (one of the parity fixtures from
 * ml/fixtures) as a CANDIDATE that nothing uses. An administrator then
 * chooses it on the Enyo models page, the capability shows, and retiring it
 * hides it again. Everything this spec changes is put back.
 */
test.describe.configure({ mode: 'serial' });

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const TOKEN = process.env.ML_SERVICE_TOKEN ?? '';
const auth = { authorization: `Bearer ${TOKEN}` };
const VERSION = `complaint-themes-tfidf-kmeans-e2e-${uniq('m').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
const fixture = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'ml', 'fixtures', 'complaint_themes.json'), 'utf8')) as { artifact: { themes: { label: string }[] } };
let levelsBefore: unknown = null;

test.beforeAll(async () => {
  test.skip(TOKEN.length < 32, 'ML_SERVICE_TOKEN is not set for this run');
  const org = await db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  levelsBefore = (await db().enyoSetting.findUnique({ where: { organisationId: org.id }, select: { capabilityLevels: true } }))?.capabilityLevels ?? null;
});

test.afterAll(async () => {
  const org = await db().organisation.findUnique({ where: { slug: 'kewalram-nigeria' } });
  if (!org) return;
  await db().enyoModel.deleteMany({ where: { organisationId: org.id, version: { startsWith: 'complaint-themes-tfidf-kmeans-e2e-' } } });
  if (levelsBefore === null) await db().$executeRaw`UPDATE enyo_settings SET "capabilityLevels" = NULL WHERE "organisationId" = ${org.id}`;
  else await db().enyoSetting.updateMany({ where: { organisationId: org.id }, data: { capabilityLevels: levelsBefore as object } });
});

test('the trainer\'s door: no token, a wrong token or a token in the address are all refused', async ({ request }) => {
  for (const [what, res] of [
    ['none', await request.get(`${BASE}/api/ml/datasets/jobs?organisation=kewalram-nigeria`)],
    ['wrong', await request.get(`${BASE}/api/ml/datasets/jobs?organisation=kewalram-nigeria`, { headers: { authorization: 'Bearer wrong-token-wrong-token-wrong-token' } })],
    ['address', await request.get(`${BASE}/api/ml/datasets/jobs?organisation=kewalram-nigeria&token=${encodeURIComponent(TOKEN)}`)],
    ['upload', await request.post(`${BASE}/api/ml/models`, { data: { organisation: 'kewalram-nigeria' } })],
  ] as const) expect(res.status(), what).toBe(401);
  expect((await request.get(`${BASE}/api/ml/datasets/everything?organisation=kewalram-nigeria`, { headers: auth })).status()).toBe(404);
  expect((await request.get(`${BASE}/api/ml/datasets/jobs?organisation=no-such-org`, { headers: auth })).status()).toBe(404);
});

test('datasets come out de-identified, in the shape the trainer reads', async ({ request }) => {
  const jobs = await request.get(`${BASE}/api/ml/datasets/jobs?organisation=kewalram-nigeria`, { headers: auth });
  expect(jobs.status()).toBe(200);
  expect(jobs.headers()['content-type']).toContain('application/x-ndjson');
  expect(jobs.headers()['cache-control']).toContain('no-store');
  const rows = (await jobs.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
  for (const r of rows.slice(0, 50)) {
    for (const k of ['row_id', 'opened_on', 'complaint_tokens', 'feature_tokens', 'work_numbers', 'turnaround_hours', 'lines']) expect(r, k).toHaveProperty(k);
    const text = JSON.stringify(r);
    for (const bad of ['@e2e.test', 'customerId', 'plateNumber', 'jobNumber', 'JC-20']) expect(text).not.toContain(bad);
  }
  const parts = await request.get(`${BASE}/api/ml/datasets/parts?organisation=kewalram-nigeria`, { headers: auth });
  expect(parts.status()).toBe(200);
  const first = (await parts.text()).trim().split('\n')[0];
  if (first) {
    const p = JSON.parse(first) as { part_id: string; weekly: number[]; as_of: string };
    expect(p.weekly).toHaveLength(104);
    expect(p.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});

test('a trained model arrives as a candidate; a broken one or a repeat is refused', async ({ request }) => {
  const body = {
    organisation: 'kewalram-nigeria', task: 'COMPLAINT_THEMES', version: VERSION, algorithm: 'tfidf-kmeans', metrics: { rows: 600, themes: fixture.artifact.themes.length, silhouette: 0.5 },
    baseline: null, gate: { passed: true, reasons: ['E2E fixture.'] }, artifact: fixture.artifact, rows: 600, dataFrom: '2024-01-08', dataTo: '2025-10-01', trainer: 'ejo-ml e2e', trainedAt: new Date().toISOString(),
  };
  const ok = await request.post(`${BASE}/api/ml/models`, { headers: auth, data: body });
  expect(ok.status(), await ok.text()).toBe(201);
  expect(((await ok.json()) as { status: string }).status).toBe('CANDIDATE');
  expect((await request.post(`${BASE}/api/ml/models`, { headers: auth, data: body })).status()).toBe(409);
  const broken = await request.post(`${BASE}/api/ml/models`, { headers: auth, data: { ...body, version: `${VERSION}-x`, artifact: { ...fixture.artifact, format: 'other' } } });
  expect(broken.status()).toBe(422);
  expect(((await broken.json()) as { error: string }).error).toMatch(/not valid/);
});

test('an administrator chooses the model; the themes show; retiring hides them', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/enyo/models');
  await expect(page.getByRole('heading', { level: 1, name: /models/ })).toBeVisible();
  // Nothing is used until a person chooses it.
  await expect(page.getByRole('heading', { name: 'What customers bring their vehicles in for' })).toHaveCount(0);
  const row = page.locator('li').filter({ hasText: VERSION });
  await expect(row.getByText('Ready to use', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Use this model' }).click();
  await waitOutcome(page, /status=model_in_use/);
  await expect(page.locator('li').filter({ hasText: VERSION }).getByText('In use', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What customers bring their vehicles in for' })).toBeVisible();
  await expect(page.getByText(fixture.artifact.themes[0]!.label, { exact: true }).first()).toBeVisible();

  // Switching the capability off hides it, whatever model is in use.
  const card = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Complaint themes', level: 3 }) }).last();
  await card.getByLabel('Level').selectOption('OFF');
  await card.getByRole('button', { name: 'Save level' }).click();
  await waitOutcome(page, /status=level_saved/);
  await expect(page.getByRole('heading', { name: 'What customers bring their vehicles in for' })).toHaveCount(0);
  const back = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Complaint themes', level: 3 }) }).last();
  await back.getByLabel('Level').selectOption('ASSIST');
  await back.getByRole('button', { name: 'Save level' }).click();
  await waitOutcome(page, /status=level_saved/);

  await page.locator('li').filter({ hasText: VERSION }).getByRole('button', { name: 'Retire' }).click();
  await waitOutcome(page, /status=model_retired/);
  await expect(page.getByRole('heading', { name: 'What customers bring their vehicles in for' })).toHaveCount(0);
  const audit = await db().auditLog.count({ where: { action: { in: ['enyo.model_promoted', 'enyo.model_retired', 'enyo.capability_level_changed'] } } });
  expect(audit).toBeGreaterThanOrEqual(3);
});

test('a technician cannot open the models page or the reorder suggestions', async ({ page }) => {
  await as(page, 'technician');
  await open(page, '/enyo/models');
  await expect(page.getByRole('heading', { level: 1, name: /models/ })).toHaveCount(0);
  await open(page, '/inventory/reorder');
  await expect(page.getByRole('heading', { level: 1, name: 'Reorder suggestions' })).toHaveCount(0);
});
