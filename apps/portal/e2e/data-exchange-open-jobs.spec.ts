import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * P5 — the job cards still open on the cut-over day become live EJO job
 * cards: at their stage, old number kept and searchable, the estimate marked
 * approved before EJO with the parts already issued, the deposit as an
 * opening payment Finance confirms, the technician matched by employee ID,
 * nobody emailed. Closed ones, unknown stages and a vehicle EJO does not
 * have are refused; one open job card per vehicle. Undo bins only the job
 * cards nobody has worked on since, with their estimate and payments.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const kunnr = (n: number) => `0007${T.replace(/\D/g, '3').padEnd(4, '3').slice(0, 4)}${n}`;
const vin = (n: number) => `JAANLR85EL${T.replace(/[IOQ]/g, 'X').padEnd(6, 'X').slice(0, 6)}${n}`;
const plate = (n: number) => `OPJ ${T.replace(/\D/g, '2').padEnd(3, '2').slice(0, 3)} A${String.fromCharCode(65 + n)}`;
const jobNo = (n: number) => `48${T.replace(/\D/g, '5').padEnd(3, '5').slice(0, 3)}${n}`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n');

async function managerBranch(): Promise<string> {
  const u = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { branchId: true } });
  return u.branchId!;
}

async function upload(page: Page, name: string, body: string, branchId: string): Promise<string> {
  await open(page, '/data-exchange/new?entity=openJobs');
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-branch').selectOption(branchId);
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  return page.url();
}

let importUrl = '';
let customerId = '';
const vehicleIds: string[] = [];

test('the file: refusals, the totals, approval and load — live job cards at their stage, old numbers kept, estimates approved before EJO, deposits as opening payments', async ({ page }) => {
  const branchId = await managerBranch();
  const org = await db().branch.findUniqueOrThrow({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } });
  const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@e2e.test' }, select: { id: true } });
  const customer = await db().customer.create({ data: { organisationId: org.businessUnit.organisationId, fullName: `Opening Jobs ${T}`, phone: `0807 ${T.replace(/\D/g, '6').padEnd(3, '6').slice(0, 3)} 7701`, externalSource: 'SAP', externalId: kunnr(0).replace(/^0+/, ''), createdById: admin.id } });
  customerId = customer.id;
  for (const n of [1, 2, 3]) {
    const v = await db().customerVehicle.create({ data: { customerId, chassisNumber: vin(n), plateNumber: plate(n), make: 'Isuzu', model: 'NQR', year: 2024, vehicleType: 'COMMERCIAL', mileage: 20000 + n * 1000, createdById: admin.id } });
    vehicleIds.push(v.id);
  }
  const tech = await db().user.findUniqueOrThrow({ where: { email: who('technician').email }, select: { id: true, employeeId: true, fullName: true } });
  const part = await db().part.findFirst({ where: { branchId }, select: { partNumber: true, name: true, id: true } });
  await as(page, 'it-administrator');
  importUrl = await upload(page, `iw38-${T}.csv`, csv([
    ['AUFNR', 'KUNUM', 'VHVIN', 'LICENSE_NUM', 'ERDAT', 'STAT', 'RECDV', 'KTEXT', 'LTXA1', 'Technician', 'Labour', 'Parts', 'Estimate approved', 'Parts issued', 'Paid', 'Payment method', 'Receipt', 'Branch'],
    [jobNo(1), kunnr(0), vin(1), '', '30.10.2026', 'CRTD', '21000', 'Carry out service', '', '', '', '', '', '', '', '', '', 'Isolo Branch'],
    [jobNo(2), '', '', plate(2), '28.10.2026', 'REL', '22000', 'Brakes squeal; steering pulls left', 'Front pads worn to the metal', tech.employeeId ?? tech.fullName, '45000', '112200', 'Yes', `${part?.partNumber ?? 'Brake pad set'} x1 @45000; Tie rod end x2 @33600`, '60000', 'Bank transfer', 'RCPT-1041', 'Isolo Branch'],
    [jobNo(3), kunnr(0), vin(3), '', '25.10.2026', 'TECO', '23000', 'A/C not cooling', 'System recharged', '', '25000', '38000', 'Yes', '', '63000', 'Cash', 'RCPT-1030', 'Isolo Branch'],
    [jobNo(4), kunnr(0), vin(1), '', '31.10.2026', 'CRTD', '', 'Same vehicle again', '', '', '', '', '', '', '', '', '', 'Isolo Branch'],
    [jobNo(5), kunnr(0), vin(2), '', '20.10.2026', 'CLSD', '', 'Closed already', '', '', '', '', '', '', '', '', '', 'Isolo Branch'],
    [jobNo(6), kunnr(0), '', '', '20.10.2026', 'REL', '', 'No vehicle', '', '', '', '', '', '', '', '', '', 'Isolo Branch'],
    [jobNo(7), '0009999999', 'JAANLR85EL7999999', '', '20.10.2026', 'REL', '', 'Unknown vehicle', '', '', '', '', '', '', '', '', '', 'Isolo Branch'],
  ]), branchId);
  await expect(page.getByText(/Stage “CLSD”: a closed, checked-out or cancelled job card belongs in the job card history file/)).toBeVisible();
  await expect(page.getByText(/Which vehicle is it\?/)).toBeVisible();
  await expect(page.getByText(/The vehicle is not in EJO\. Import the vehicles file first/)).toBeVisible();
  await expect(page.getByText(/3 job cards · estimates ₦220,200\.00 · ₦123,000\.00 already paid · opened 25 Oct 2026 to 30 Oct 2026/)).toBeVisible();
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'workshop-manager');
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Opening payments now on the 3 job cards this import opened/)).toBeVisible();
  await expect(page.getByText(/₦123,000\.00/).first()).toBeVisible();
  const jobs = await db().jobCard.findMany({ where: { customerId }, orderBy: { externalId: 'asc' }, include: { complaints: true, estimate: { include: { lineItems: true } }, payments: true, assignedTechnician: { select: { id: true } } } });
  expect(jobs.map((j) => j.externalId)).toEqual([jobNo(1), jobNo(2), jobNo(3)]);
  expect(jobs.map((j) => j.status)).toEqual(['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED']);
  expect(jobs.every((j) => j.jobNumber.startsWith('JC-') && j.externalSource === 'SAP' && j.importJobId)).toBe(true);
  expect(jobs[0]!.createdAt.toISOString().slice(0, 10)).toBe('2026-10-30');
  expect(jobs[0]!.approvalStatus).toBe('PENDING');
  expect(jobs[0]!.estimate).toBeNull();
  const second = jobs[1]!;
  expect(second.complaints.map((c) => c.description)).toEqual(['Brakes squeal', 'steering pulls left']);
  expect(second.assignedTechnician?.id).toBe(tech.id);
  expect(second.approvalStatus).toBe('APPROVED');
  expect(second.approvalNotes).toMatch(/approved before EJO/);
  expect(second.estimate?.status).toBe('APPROVED');
  expect(second.estimate!.lineItems.map((l) => [l.type, Number(l.amount)])).toEqual([['LABOUR', 45000], ['STORE_PART', 45000], ['STORE_PART', 67200]]);
  expect(second.estimate!.lineItems.filter((l) => l.type === 'STORE_PART').every((l) => l.billToNote?.includes('Issued from the store before EJO'))).toBe(true);
  if (part) expect(second.estimate!.lineItems.find((l) => l.description.includes(part.partNumber!))?.matchedPartId).toBe(part.id);
  expect(second.payments.map((p) => [Number(p.amount), p.method])).toEqual([[60000, 'BANK_TRANSFER']]);
  expect(second.payments[0]!.notes).toMatch(/Paid before EJO \(receipt RCPT-1041\)/);
  expect(jobs[2]!.payments[0]!.method).toBe('CASH');
  expect(jobs[2]!.completedAt).not.toBeNull();
  // Nobody was emailed or notified about the new job cards: no audit entry of a notification names them.
  expect(await db().auditLog.count({ where: { action: { contains: 'notif' }, metadata: { path: ['jobNumber'], string_contains: 'JC-' }, entityId: { in: jobs.map((j) => j.id) } } })).toBe(0);
});

test('the job card page carries its origin; search finds it by the SAP number; Finance confirms the opening payments', async ({ page }) => {
  const second = await db().jobCard.findFirstOrThrow({ where: { customerId, externalId: jobNo(2) } });
  await as(page, 'workshop-manager');
  await open(page, `/workshop/job-cards/${second.id}`);
  await expect(page.getByTestId('job-card-origin')).toContainText(`Brought in from SAP as job card ${jobNo(2)}.`);
  await expect(page.getByTestId('job-card-origin')).toContainText('The estimate was approved before EJO');
  await expect(page.getByTestId('job-card-origin')).toContainText('Paid before EJO');
  await expect(page.getByRole('heading', { name: second.jobNumber })).toBeVisible();
  await open(page, '/dashboard');
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(jobNo(2));
  await expect(box.locator('xpath=ancestor::div[2]').getByText(`SAP job card ${jobNo(2)} → ${second.jobNumber}`)).toBeVisible();
  // Finance confirms the totals (the manager approved, so cannot).
  await open(page, importUrl);
  await expect(page.getByText('Waiting for Finance to confirm the totals.')).toBeVisible();
  await as(page, 'finance-officer');
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Confirm the totals (Finance)' }).click();
  await expect(page.getByText(/Totals confirmed by .* \(Finance\)/)).toBeVisible();
});

test('undo: a job card worked on since stays (reported); the others go to the Recycle bin with their estimate and opening payment, and one is restored whole', async ({ page }) => {
  const jobs = await db().jobCard.findMany({ where: { customerId }, orderBy: { externalId: 'asc' }, select: { id: true, jobNumber: true, externalId: true } });
  const manager = await db().user.findUniqueOrThrow({ where: { email: who('workshop-manager').email }, select: { id: true } });
  // The desk records a new payment on the third job card after the import: that one has been worked on.
  await db().payment.create({ data: { jobCardId: jobs[2]!.id, amount: 5000, method: 'CASH', recordedById: manager.id, notes: 'Balance' } });
  await as(page, 'workshop-manager');
  page.on('dialog', (d) => void d.accept());
  await open(page, importUrl);
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  const left = await db().jobCard.findMany({ where: { customerId }, select: { externalId: true } });
  expect(left.map((j) => j.externalId)).toEqual([jobNo(3)]);
  const number = (await page.getByRole('heading', { level: 1 }).first().textContent())!.split(' ')[0]!;
  const items = await db().recycleBinItem.findMany({ where: { reason: `Undo of import ${number}`, restoredAt: null }, select: { reference: true, snapshot: true } });
  expect(items.map((i) => i.reference).sort()).toEqual([jobs[0]!.jobNumber, jobs[1]!.jobNumber].sort());
  const snap = items.find((i) => i.reference === jobs[1]!.jobNumber)!.snapshot as { rows: { model: string }[] };
  expect(snap.rows.map((r) => r.model)).toEqual(expect.arrayContaining(['jobCard', 'jobCardComplaint', 'estimate', 'estimateLineItem', 'payment']));
  // Restore the second from the bin: the job card, its estimate and its opening payment are back.
  await as(page, 'administrator');
  await open(page, '/recycle-bin');
  const row = page.getByTestId('bin-row').filter({ hasText: jobs[1]!.jobNumber }).first();
  await row.getByRole('button', { name: 'Restore' }).click();
  await page.waitForURL(/\/recycle-bin\?restored=/);
  const back = await db().jobCard.findUniqueOrThrow({ where: { id: jobs[1]!.id }, include: { payments: true, estimate: { include: { lineItems: true } } } });
  expect(back.externalId).toBe(jobNo(2));
  expect(back.payments.length).toBe(1);
  expect(back.estimate?.lineItems.length).toBe(3);
});
