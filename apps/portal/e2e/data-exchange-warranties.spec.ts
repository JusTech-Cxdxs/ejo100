import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * P6 — the warranties sold before EJO and the warranty claims still open on
 * the cut-over day. Warranties: under the organisation's policies (named, or
 * found from the months, km and provider), old number kept and searchable,
 * active from the day they started — the person who ran the import registers
 * them and the Warranty HOD who approved it verifies them. Claims: live EJO
 * claims at their stage, the steps before EJO dated and not replayed, and the
 * workflow carries on (the HOD approves one). Settled claims, unknown
 * policies, vehicles EJO does not have are refused; one warranty per vehicle
 * and policy. Undo bins only what nobody has used since; a warranty and its
 * claim restore from the bin.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
// Digits that differ every run (the clock): a second run never meets the last run's numbers.
const D = String(Date.now()).slice(-7);
const vin = (n: number) => `JAANLR85EW${T.replace(/[IOQ]/g, 'X').padEnd(6, 'X').slice(0, 6)}${n}`;
const W = (n: number) => `W-${D}-${n}`;
const C = (n: number) => `C-${D}-${n}`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');
const PROVIDER = `P6 Warranty Co ${T}`;
const VEH_POLICY = `P6-VEH-${T}`;
const PART_POLICY = `P6-PART-${T}`;
const PART_NO = `P6-${D}-BAT`;

async function upload(page: Page, entity: 'warranties' | 'claims', name: string, body: string): Promise<string> {
  await open(page, `/data-exchange/new?entity=${entity}`);
  await expect(page.locator('#import-file')).toHaveCount(1);
  await expect(page.locator('#import-branch')).toHaveCount(0); // organisation-wide: no branch to choose
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  return page.url();
}

async function approveAndLoad(page: Page, url: string) {
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'warranty-hod');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
}

let warrantiesUrl = '';
let claimsUrl = '';
let customerId = '';

test('warranties: refusals, the totals, the Warranty HOD approves — EJO warranties under their policies, old numbers kept, registered and verified by the import’s two people', async ({ page }) => {
  const manager = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branchId: true } });
  const org = await db().branch.findUniqueOrThrow({ where: { id: manager.branchId! }, select: { businessUnit: { select: { organisationId: true } } } });
  const organisationId = org.businessUnit.organisationId;
  const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@e2e.test' }, select: { id: true } });
  const provider = await db().warrantyProvider.create({ data: { name: PROVIDER, type: 'MANUFACTURER', organisationId, claimSubmissionDays: 30, partRetentionDays: 30, createdById: admin.id } });
  await db().warrantyPolicy.create({ data: { code: VEH_POLICY, name: `P6 vehicle ${T}`, kind: 'ASSET', providerId: provider.id, durationMonths: 36, durationUnit: 'MONTHS', distanceLimit: 100000, coverageSummary: 'Complete vehicle', organisationId, createdById: admin.id } });
  await db().warrantyPolicy.create({ data: { code: PART_POLICY, name: `P6 battery ${T}`, kind: 'PART', providerId: provider.id, durationMonths: 12, durationUnit: 'MONTHS', coverageSummary: 'Battery failing a load test', defaultRemedy: 'REPLACEMENT', organisationId, createdById: admin.id } });
  await db().part.create({ data: { branchId: manager.branchId!, partNumber: PART_NO, name: `Battery 12V ${T}`, baseUnitOfMeasure: 'ST', createdById: admin.id } });
  const customer = await db().customer.create({ data: { organisationId, fullName: `Warranty Cutover ${T}`, phone: `0809 ${D.slice(-7, -4)} ${D.slice(-4)}`, createdById: admin.id } });
  customerId = customer.id;
  for (const n of [1, 2, 3]) await db().customerVehicle.create({ data: { customerId, chassisNumber: vin(n), make: 'Isuzu', model: 'NQR', year: 2024, vehicleType: 'COMMERCIAL', mileage: 20000 + n * 1000, createdById: admin.id } });

  await as(page, 'it-administrator');
  warrantiesUrl = await upload(page, 'warranties', `wty-${T}.csv`, csv([
    ['MGANR', 'Covers', 'VHVIN', 'Policy', 'Provider', 'Months', 'Km', 'GWLDT', 'Start km', 'MATNR', 'SERNR', 'Evidence', 'Status', 'Notes'],
    [W(1), 'Vehicle', vin(1), VEH_POLICY, '', '', '', '01.06.2026', '25', '', '', 'Invoice 9001', 'Active', ''],
    [W(2), 'Vehicle', vin(2), '', PROVIDER, '36', '100000', '15.03.2025', '40', '', '', 'Invoice 9002', 'Suspended', 'Engine tampered with'],
    [W(3), 'Part', vin(3), PART_POLICY, '', '', '', '01.10.2026', '', PART_NO, `SN-${D}`, 'Job card 483001', '', ''],
    [W(4), 'Vehicle', vin(1), VEH_POLICY, '', '', '', '02.06.2026', '25', '', '', 'The same vehicle and policy again', '', ''],
    ['', 'Vehicle', vin(2), VEH_POLICY, '', '', '', '01.06.2026', '', '', '', '', '', ''],
    [W(6), 'Vehicle', vin(2), 'NO-SUCH-POLICY', '', '', '', '01.06.2026', '', '', '', '', '', ''],
    [W(7), 'Vehicle', 'JAANLR85EL7999999', VEH_POLICY, '', '', '', '01.06.2026', '', '', '', '', '', ''],
  ]));
  await expect(page.getByText(/Warranty number is required/)).toBeVisible();
  await expect(page.getByText(/There is no warranty policy “NO-SUCH-POLICY” in EJO/)).toBeVisible();
  await expect(page.getByText(/The vehicle is not in EJO\. Import the vehicles file first \(a vehicle warranty/)).toBeVisible();
  await expect(page.getByText(new RegExp(`No policy named: ${VEH_POLICY}`))).toBeVisible();
  await expect(page.getByTestId('warranty-import-totals')).toContainText('To bring in: 4 warranties (3 on vehicles, 1 on parts) · 1 suspended, void or transferred · started 15 Mar 2025 to 1 Oct 2026');
  await approveAndLoad(page, warrantiesUrl);

  const it = await db().user.findUniqueOrThrow({ where: { email: who('it-administrator').email }, select: { id: true } });
  const hod = await db().user.findUniqueOrThrow({ where: { email: who('warranty-hod').email }, select: { id: true } });
  const ws = await db().warranty.findMany({ where: { customerId }, orderBy: { externalId: 'asc' }, include: { policy: { select: { code: true } } } });
  expect(ws.map((w) => w.externalId)).toEqual([W(1), W(2), W(3)]); // W(4): the vehicle already has its warranty under that policy
  expect(ws.every((w) => w.warrantyNumber.startsWith('WR-') && w.externalSource === 'SAP' && w.origin === 'IMPORT' && w.importJobId)).toBe(true);
  expect(ws.every((w) => w.issuedById === it.id && w.verifiedById === hod.id && w.verifiedAt)).toBe(true);
  expect(ws.map((w) => [w.kind, w.status, w.policy.code])).toEqual([['ASSET', 'ACTIVE', VEH_POLICY], ['ASSET', 'SUSPENDED', VEH_POLICY], ['PART', 'ACTIVE', PART_POLICY]]);
  expect(ws[0]!.startsAt.toISOString().slice(0, 10)).toBe('2026-06-01');
  expect(ws[0]!.endsAt.toISOString().slice(0, 7)).toBe('2029-06');
  expect(ws[0]!.distanceLimit).toBe(100000);
  expect(ws[0]!.evidenceNote).toMatch(/Invoice 9001 · Brought into EJO from SAP \(warranty .*\) by import/);
  expect(ws[1]!.statusReason).toBe('Engine tampered with');
  expect(ws[2]!.partId).not.toBeNull();
  expect(ws[2]!.subjectDescription).toContain(`serial SN-${D}`);
  // Nobody was emailed or told: no notification audit names them.
  expect(await db().auditLog.count({ where: { action: { contains: 'notif' }, entityId: { in: ws.map((w) => w.id) } } })).toBe(0);
});

test('the warranty page says where it came from; search finds it by its old number', async ({ page }) => {
  const w = await db().warranty.findFirstOrThrow({ where: { customerId, externalId: W(1) } });
  await as(page, 'warranty-hod');
  await open(page, `/warranty/${w.id}`);
  await expect(page.getByTestId('warranty-origin')).toContainText(`Brought in from SAP as warranty ${W(1)}.`);
  await expect(page.getByTestId('warranty-origin')).toContainText('verified by the one who approved it');
  await expect(page.getByText(/Brought in at the cut-over \(SAP/)).toBeVisible();
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(W(1));
  await expect(box.locator('xpath=ancestor::div[2]').getByText(`SAP warranty ${W(1)} → ${w.warrantyNumber}`)).toBeVisible();
});

test('open claims: settled ones and impossible dates refused; live claims at their stage, steps before EJO dated; the HOD carries one on', async ({ page }) => {
  await as(page, 'it-administrator');
  claimsUrl = await upload(page, 'claims', `claims-${T}.csv`, csv([
    ['CLMNO', 'MGANR', 'VHVIN', 'Stage', 'REPDA', 'Odometer', 'Complaint', 'Cause', 'Correction', 'Causal part', 'Labour', 'Parts', 'Accepted amount', 'Provider reference', 'Submitted on', 'Decided on', 'Part return', 'Notes'],
    [C(1), W(1), '', 'Submitted', '20.10.2026', '24100', 'Water pump leaking', 'Seal failed', 'Pump replaced', 'Water pump', '35000', '96000', '', 'PRV-1', '22.10.2026', '', 'Sent', ''],
    [C(2), W(3), '', 'With the Warranty HOD', '25.10.2026', '', 'Battery will not hold a charge', 'Cell short-circuited', 'Battery replaced', 'Battery', '5000', '170000', '', '', '', '', '', ''],
    [C(3), '', vin(1), 'Accepted', '01.10.2026', '23000', 'Headlamp condensation', 'Seal defective', 'Headlamp replaced', 'Headlamp', '12000', '88000', '90000', 'PRV-2', '03.10.2026', '10.10.2026', '', 'Credit note to follow'],
    [C(4), W(1), '', 'Settled', '01.09.2026', '', 'Paid already', '', '', '', '', '', '', '', '', '', '', ''],
    [C(5), W(3), '', 'Draft', '01.08.2026', '', 'Failed before it was fitted', '', '', '', '', '', '', '', '', '', '', ''],
  ]));
  await expect(page.getByText(/a settled or cancelled claim is history/)).toBeVisible();
  await expect(page.getByText(/The failure on 2026-08-01 is before WR-/)).toBeVisible();
  await expect(page.getByText(/No warranty number given: WR-.* is the vehicle’s warranty on 2026-10-01/)).toBeVisible();
  await expect(page.getByTestId('claim-import-totals')).toContainText('To bring in: 3 open claims · ₦406,000.00 claimed · ₦90,000.00 accepted by providers, not yet settled · 1 with the provider');
  await approveAndLoad(page, claimsUrl);

  const it = await db().user.findUniqueOrThrow({ where: { email: who('it-administrator').email }, select: { id: true } });
  const cs = await db().warrantyClaim.findMany({ where: { customerId }, orderBy: { externalId: 'asc' }, include: { warranty: { select: { externalId: true } } } });
  expect(cs.map((c) => [c.externalId, c.status, c.warranty.externalId])).toEqual([[C(1), 'SUBMITTED', W(1)], [C(2), 'PENDING_HOD', W(3)], [C(3), 'ACCEPTED', W(1)]]);
  expect(cs.every((c) => c.claimNumber.startsWith('WC-') && c.externalSource === 'SAP' && c.createdById === it.id && c.importJobId)).toBe(true);
  const [sub, hodStep, acc] = cs as [typeof cs[number], typeof cs[number], typeof cs[number]];
  expect(Number(sub.claimedAmount)).toBe(131000);
  expect(sub.providerReference).toBe('PRV-1');
  expect(sub.submittedAt?.toISOString().slice(0, 10)).toBe('2026-10-22');
  expect(sub.hodApprovedAt).not.toBeNull();
  expect(sub.hodApprovedById).toBeNull(); // before EJO: dated, by nobody in EJO
  expect(sub.partReturnStatus).toBe('SENT');
  expect(sub.deadlineAt?.toISOString().slice(0, 10)).toBe('2026-11-19'); // the provider's 30 days from the failure
  expect(hodStep.reviewRequestedAt).not.toBeNull();
  expect(hodStep.hodApprovedAt).toBeNull();
  expect(hodStep.remedy).toBe('REPLACEMENT'); // the part policy's usual remedy
  expect(hodStep.partReturnStatus).toBe('AWAITING'); // the provider keeps failed parts 30 days
  expect(Number(acc.approvedAmount)).toBe(90000);
  expect(acc.decidedAt?.toISOString().slice(0, 10)).toBe('2026-10-10');

  // The claim page says where it came from, the chain shows "before EJO", and the HOD approves the one waiting on them.
  await open(page, `/warranty/claims/${sub.id}`);
  await expect(page.getByTestId('claim-origin')).toContainText(`Brought in from SAP as claim ${C(1)}`);
  await expect(page.getByText('before EJO').first()).toBeVisible();
  await open(page, `/warranty/claims/${hodStep.id}`);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.waitForURL(/status=/);
  expect((await db().warrantyClaim.findUniqueOrThrow({ where: { id: hodStep.id } })).status).toBe('PENDING_MANAGER');
});

test('undo: a claim worked on since stays, and so does its warranty; the rest go to the Recycle bin; a warranty and its claim restore', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await as(page, 'warranty-hod');
  await open(page, claimsUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  expect((await db().warrantyClaim.findMany({ where: { customerId }, select: { externalId: true } })).map((c) => c.externalId)).toEqual([C(2)]);
  await open(page, warrantiesUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  // W(3) carries C(2), which the HOD approved: it stays. W(1) and W(2) are in the bin, numbers kept.
  expect((await db().warranty.findMany({ where: { customerId }, select: { externalId: true } })).map((w) => w.externalId)).toEqual([W(3)]);
  const items = await db().recycleBinItem.findMany({ where: { entityType: { in: ['Warranty', 'WarrantyClaim'] }, restoredAt: null, label: { contains: `Warranty Cutover ${T}` } }, select: { id: true, entityType: true, reference: true, entityId: true } });
  expect(items.filter((i) => i.entityType === 'Warranty').length).toBe(2);
  expect(items.filter((i) => i.entityType === 'WarrantyClaim').length).toBe(2);
  // Restore W(1), then its claim C(1): both back as they were.
  const w1Row = await db().recycleBinItem.findFirstOrThrow({ where: { entityType: 'Warranty', restoredAt: null, label: { contains: `Warranty Cutover ${T}` }, snapshot: { path: ['rows', '0', 'data', 'externalId'], equals: W(1) } }, select: { reference: true, entityId: true } });
  await as(page, 'administrator');
  await open(page, '/recycle-bin?type=Warranty');
  await page.getByTestId('bin-row').filter({ hasText: w1Row.reference }).first().getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  const back = await db().warranty.findUniqueOrThrow({ where: { id: w1Row.entityId } });
  expect(back.externalId).toBe(W(1));
  expect(back.warrantyNumber).toBe(w1Row.reference);
  const c1Row = await db().recycleBinItem.findFirstOrThrow({ where: { entityType: 'WarrantyClaim', restoredAt: null, snapshot: { path: ['rows', '0', 'data', 'externalId'], equals: C(1) } }, select: { reference: true, entityId: true } });
  await open(page, '/recycle-bin?type=WarrantyClaim');
  await page.getByTestId('bin-row').filter({ hasText: c1Row.reference }).first().getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  expect((await db().warrantyClaim.findUniqueOrThrow({ where: { id: c1Row.entityId } })).status).toBe('SUBMITTED');
});
