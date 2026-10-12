import { test, expect } from '@playwright/test';
import { SEED_WARRANTY } from './people';
import { as, expectNoUrlError, uniq, visitHealthy, waitOutcome } from './helpers';
import { freshVehicle } from './db';
import { jcForm, pickSearchable } from './workflows';

/**
 * Warranty, A to Z: the HOD sets up a provider and a vehicle policy → an
 * officer registers a vehicle's warranty (with evidence) → someone ELSE
 * verifies it → a claim is drafted (3C + amounts), sent for approval, the
 * HOD and then the Branch Manager approve, it is submitted to the provider,
 * the provider's decision is recorded and the money settled. Analytics and
 * the part warranty issued automatically by the Store are visible too.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const lagosDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const S = { provider: `E2E Motors OEM ${tag}`, code: `E2E-VEH-${tag}`, policy: `E2E vehicle warranty ${tag}`, plate: '', warrantyUrl: '', warrantyNumber: '', claimUrl: '' };

test.beforeAll(async () => { S.plate = (await freshVehicle('WTY', { make: 'Toyota', model: 'Hilux', year: 2026 })).plate; });

test('the Warranty HOD adds a provider and a vehicle policy', async ({ page }) => {
  await as(page, 'warranty-hod');
  await page.goto('/warranty/providers');
  const prov = jcForm(page, 'Add provider');
  await prov.locator('input[name="name"]').fill(S.provider);
  await prov.locator('select[name="type"]').selectOption('MANUFACTURER');
  await prov.locator('input[name="contactName"]').fill('Claims Desk');
  await prov.locator('input[name="email"]').fill('claims@oem.e2e.test');
  await prov.locator('input[name="claimSubmissionDays"]').fill('30');
  await prov.getByRole('button', { name: 'Add provider' }).click();
  await waitOutcome(page, /status=provider_created/);
  await expect(page.getByRole('link', { name: S.provider })).toBeVisible();

  await page.goto('/warranty/policies');
  const pol = jcForm(page, 'Add policy');
  await pol.locator('input[name="code"]').fill(S.code);
  await pol.locator('select[name="kind"]').selectOption('ASSET');
  await pol.locator('input[name="name"]').fill(S.policy);
  await pickSearchable(pol, page, S.provider.slice(0, 12), new RegExp(S.provider), 'Search providers…');
  await pol.locator('input[name="brand"]').fill('Toyota');
  await pol.locator('input[name="durationMonths"]').fill('24');
  await pol.locator('select[name="durationUnit"]').selectOption('MONTHS');
  await pol.locator('input[name="distanceLimit"]').fill('100000');
  await pol.locator('input[name="coverageItem"]').first().fill('Engine and gearbox');
  await pol.locator('select[name="defaultRemedy"]').selectOption('REPAIR');
  await pol.getByRole('button', { name: 'Add policy' }).click();
  await waitOutcome(page, /status=policy_created/);
  await expect(page.getByRole('link', { name: S.policy })).toBeVisible();
});

test('a Warranty Officer registers the vehicle warranty; the HOD verifies it', async ({ page }) => {
  await as(page, 'warranty-officer');
  await page.goto(`/warranty/register?q=${encodeURIComponent(S.plate)}`);
  await page.getByRole('link', { name: new RegExp(S.plate) }).first().click();
  await page.waitForURL(/vehicleId=/);
  const form = jcForm(page, 'Register warranty');
  const policyValue = await form.locator('select[name="policyId"] option', { hasText: S.policy }).first().getAttribute('value');
  await form.locator('select[name="policyId"]').selectOption(policyValue!);
  await form.locator('input[name="startsAt"]').fill(lagosDay(-10));
  await form.locator('input[name="startReading"]').fill('12');
  await form.locator('textarea[name="evidenceNote"]').fill('Sales invoice INV-E2E-0098; delivery note DN-0431');
  await form.getByRole('button', { name: 'Register warranty' }).click();
  await waitOutcome(page, /\/warranty\/[^/?]+\?status=registered/);
  S.warrantyUrl = new URL(page.url()).pathname;
  S.warrantyNumber = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim();
  await expect(page.getByText('Claims can be started once the warranty is active.')).toBeVisible();
  // The person who registered it cannot verify it — refused by the server.
  const verify = page.getByRole('button', { name: 'Evidence checked — verify' });
  if (await verify.count()) {
    await verify.click();
    await page.waitForURL(/error=/);
    await expect(page.getByText(/someone other than the person who registered it|Only the Warranty HOD/)).toBeVisible();
  }

  await as(page, 'warranty-hod');
  await page.goto(S.warrantyUrl);
  await page.getByRole('button', { name: 'Evidence checked — verify' }).click();
  await waitOutcome(page, /status=verified/);
  expectNoUrlError(page);
});

test('a claim is drafted, approved by the HOD and the Branch Manager, submitted, decided and settled', async ({ page }) => {
  await as(page, 'warranty-officer');
  await page.goto(S.warrantyUrl);
  await page.getByRole('link', { name: 'Start a claim' }).click();
  await page.waitForURL(/\/warranty\/claims\/new\?warrantyId=/);
  const form = jcForm(page, 'Save draft claim');
  await form.locator('textarea[name="complaint"]').fill('Engine overheats after twenty minutes of driving');
  await form.locator('textarea[name="cause"]').fill('Water pump impeller cracked — coolant not circulating');
  await form.locator('textarea[name="correction"]').fill('Replaced the water pump and coolant; road tested OK');
  await form.locator('input[name="causalPart"]').fill('Water pump');
  await form.locator('input[name="causalPartNumber"]').fill('WP-16100');
  await form.locator('input[name="failureReading"]').fill('900');
  await form.locator('input[name="labourAmount"]').fill('15000');
  await form.locator('input[name="partsAmount"]').fill('45000');
  await form.getByRole('button', { name: 'Save draft claim' }).click();
  await waitOutcome(page, /\/warranty\/claims\/[^/?]+\?status=created/);
  S.claimUrl = new URL(page.url()).pathname;
  const readiness = (await page.getByRole('heading', { name: 'Readiness' }).locator('..').textContent()) ?? '';
  await expect(page.getByRole('button', { name: 'Send for approval' }), `claim not ready — ${readiness.replace(/\s+/g, ' ').slice(0, 600)}`).toBeVisible();
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await waitOutcome(page, /status=sent_for_approval/);
  await expect(page.getByText('Waiting on the Warranty HOD.')).toBeVisible();

  await as(page, 'warranty-hod');
  await page.goto(S.claimUrl);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await waitOutcome(page, /status=approved/);
  await expect(page.getByText('Waiting on the Branch Manager.')).toBeVisible();

  await as(page, 'workshop-manager');
  await page.goto(S.claimUrl);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await waitOutcome(page, /status=approved/);

  await as(page, 'warranty-officer');
  await page.goto(S.claimUrl);
  await page.locator('input[name="providerReference"]').fill(`OEM-${tag}`);
  await page.getByRole('button', { name: 'Record as submitted' }).click();
  await waitOutcome(page, /status=submitted/);

  await as(page, 'warranty-hod');
  await page.goto(S.claimUrl);
  await page.locator('select[name="decision"]').selectOption('ACCEPTED');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await waitOutcome(page, /status=decision_recorded/);
  await page.locator('input[name="reference"]').fill(`CN-${tag}`);
  await page.getByRole('button', { name: 'Record settlement' }).click();
  await waitOutcome(page, /status=settled/);
  await expect(page.getByText('Settlement recorded — the claim is closed.')).toBeVisible();
});

test('the register, claims, analytics and part warranties are all visible', async ({ page }) => {
  await as(page, 'warranty-hod');
  await page.goto(`/warranty?q=${encodeURIComponent(S.warrantyNumber)}`);
  await expect(page.getByRole('link', { name: S.warrantyNumber })).toBeVisible();
  await visitHealthy(page, '/warranty/claims');
  await visitHealthy(page, '/warranty/analytics');
  await expect(page.locator('main')).toContainText(/₦[\d,]+/);
  // The seeded part policy is on the policy list (parts carry it to the customer on release).
  await page.goto(`/warranty/policies?q=${encodeURIComponent(SEED_WARRANTY.policyCode)}`);
  await expect(page.getByRole('link', { name: SEED_WARRANTY.policyName })).toBeVisible();
});

test('the person who registered a warranty is not offered the Verify button', async ({ page }) => {
  test.fail(true, 'E2E-05: app/(app)/warranty/[id]/page.tsx:268 shows "Evidence checked — verify" to everyone on a pending warranty (the registrar and Warranty Officers included); only verifyWarranty() refuses');
  const plate = (await freshVehicle('WTV', { make: 'Toyota', model: 'Hilux', year: 2026 })).plate;
  await as(page, 'warranty-officer');
  await page.goto(`/warranty/register?q=${encodeURIComponent(plate)}`);
  await page.getByRole('link', { name: new RegExp(plate) }).first().click();
  await page.waitForURL(/vehicleId=/);
  const form = jcForm(page, 'Register warranty');
  const policyValue = await form.locator('select[name="policyId"] option', { hasText: S.policy }).first().getAttribute('value');
  await form.locator('select[name="policyId"]').selectOption(policyValue!);
  await form.locator('input[name="startsAt"]').fill(lagosDay(-3));
  await form.locator('textarea[name="evidenceNote"]').fill('Sales invoice INV-E2E-0099');
  await form.getByRole('button', { name: 'Register warranty' }).click();
  await waitOutcome(page, /\/warranty\/[^/?]+\?status=registered/);
  await expect(page.getByRole('button', { name: 'Evidence checked — verify' })).toHaveCount(0);
});
