import { test, expect } from '@playwright/test';
import { CUSTOMER, SEED_PARTS, SUPERMANAGER, who } from './people';
import { as, open, eventually, bellText, countMail, expectAuditEntry, expectNoUrlError, latestMail, readStock, urlError, waitOutcome } from './helpers';
import { db, freshVehicle, idOfPart, journalDiagnosis, paymentsOn } from './db';
import {
  addLine, assignTechnician, expectStatus, jobNumber, jcForm, nextStep, notifyCustomer, openJobCard, recordPayment,
  requestStoreMatching, statusPanel, storeMatchesAll, submitEstimate, supervisorApproves, supervisorApprovesEstimate, technicianAccepts,
} from './workflows';

/**
 * One Job Card, A to Z, by the people who really do each step:
 * front desk opens → supervisor (who is ALSO a Manager) approves and assigns
 * → technician accepts and drafts the estimate (Store Part + outside part)
 * → supervisor prices labour + sundry → Store matches the part → submitted,
 * approved by the supervisor → the same person may NOT give the Manager's
 * final approval (segregation of duties) → another Manager does → front desk
 * notifies the customer (email in Mailpit) → Finance records the 70% deposit
 * (a double click records ONE payment) → In Progress → parts request: HOD →
 * Store reserves → Store releases (stock moves, part warranty issued) →
 * outside purchase: Finance review → Manager → Finance disburses → quality
 * check → completed → ready → balance paid → close requested → Manager
 * approves → checked out. Audit trail and notifications checked on the way.
 */
test.describe.configure({ mode: 'serial' });

const S = { url: '', id: '', number: '', plate: '', partUrl: '', stockBefore: { onHand: 0, reserved: 0 }, prsUrl: '', eprUrl: '' };

test.beforeAll(async () => {
  const v = await freshVehicle('JCL');
  S.plate = v.plate;
  S.partUrl = `/inventory/parts/${await idOfPart(SEED_PARTS.brakePads.number)}`;
});

test('front desk opens the Job Card; the supervisor approves and assigns; the technician accepts', async ({ page }) => {
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate: S.plate, supervisor: SUPERMANAGER, complaint: 'Grinding noise from the front brakes' });
  S.id = S.url.split('/').pop()!;
  S.number = await jobNumber(page);
  await expect(page.getByText('Awaiting Supervisor Approval').first()).toBeVisible();
  await expect(page.getByText('Grinding noise from the front brakes')).toBeVisible();

  await supervisorApproves(page, S.url, SUPERMANAGER);
  await assignTechnician(page);
  await test.step('the technician sees the assignment in the bell', async () => {
    await as(page, 'technician');
    // The bell's summary is refreshed on a timer (and shared by every tab of this person).
    await eventually(page, async () => expect(await bellText(page)).toContain(S.number));
  });
  await technicianAccepts(page, S.url);
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
});

test('the estimate is drafted by the technician and the supervisor, and Store prices the part', async ({ page }) => {
  await as(page, 'technician');
  await open(page, S.url);
  await test.step('a technician cannot price labour (the supervisor does)', async () => {
    const form = page.locator('form').filter({ has: page.locator('select[name="type"]') });
    await form.locator('select[name="type"]').selectOption('LABOUR');
    await expect(form.locator('input[name="unitPrice"]')).toHaveCount(0);
    await expect(form.getByText('Priced by supervisor')).toBeVisible();
  });
  await addLine(page, { type: 'STORE_PART', partType: SEED_PARTS.brakePads.type, qty: 2 });
  await addLine(page, { type: 'EXTERNAL_PART', description: 'Brake disc skimming (outside machine shop)', price: 8000 });
  await expect(page.getByText('Awaiting Store match')).toBeVisible();
  // Submission is held until Store has priced the part.
  await expect(page.getByRole('button', { name: 'Submit for validation' })).toHaveCount(0);

  await as(page, SUPERMANAGER);
  await open(page, S.url);
  await addLine(page, { type: 'LABOUR', description: 'Front brake overhaul', price: 20000 });
  await addLine(page, { type: 'SUNDRY', description: 'Brake cleaner and consumables', price: 1500 });
  await test.step('only one Sundry line is allowed', async () => {
    const form = page.locator('form').filter({ has: page.locator('select[name="type"]') });
    await expect(form.locator('select[name="type"] option[value="SUNDRY"]')).toHaveCount(0);
  });
  await requestStoreMatching(page);
  await storeMatchesAll(page, S.id, who('store-officer'));

  await as(page, SUPERMANAGER);
  await open(page, S.url);
  await expect(page.getByText(`Matched: ${SEED_PARTS.brakePads.name}`).first()).toBeVisible();
  // 2 × 15,000 + 8,000 + 20,000 + 1,500 = 59,500
  await expect(page.getByText('Total Estimate').locator('..')).toContainText('₦59,500.00');
});

test('approvals respect segregation of duties; the customer is notified by email', async ({ page, request }) => {
  await as(page, SUPERMANAGER);
  await open(page, S.url);
  await submitEstimate(page);
  await supervisorApprovesEstimate(page);
  await test.step('the supervisor who approved may not also give the Manager’s final approval', async () => {
    await page.getByRole('button', { name: 'Approve as Manager' }).click();
    await page.waitForURL(/error=/);
    expect(urlError(page)).toMatch(/approved this estimate as its supervisor/);
    await expect(page.getByText(/approved this estimate as its supervisor/)).toBeVisible();
    await expect(page.getByText('Awaiting manager review').first()).toBeVisible();
  });
  await test.step('another Manager gives the final approval', async () => {
    await as(page, 'workshop-manager');
    await open(page, S.url);
    await page.getByRole('button', { name: 'Approve as Manager' }).click();
    await expect(page.getByRole('button', { name: 'Approve as Manager' })).toHaveCount(0);
    expectNoUrlError(page);
  });
  const toFrontDesk = await latestMail(request, who('receptionist').email, new RegExp(`${S.number} approved by manager`));
  expect(toFrontDesk.subject).toContain(S.number);

  await as(page, 'receptionist');
  await open(page, S.url);
  await notifyCustomer(page);
  const mail = await latestMail(request, CUSTOMER.email, new RegExp(`Estimate ready for ${S.number}`));
  expect(mail.html).toContain(S.number);
  // The customer sees one combined figure — never the internal line types.
  expect(mail.html).not.toContain('STORE_PART');
  // Notified exactly once — the button is gone.
  await expect(page.getByRole('button', { name: 'Notify customer' })).toHaveCount(0);
});

test('Finance records the 70% deposit — a double click records ONE payment — and work starts', async ({ page, request }) => {
  await as(page, 'finance-officer');
  await open(page, S.url);
  await expectStatus(page, 'Awaiting Customer Approval');
  const form = jcForm(page, 'Record payment');
  await form.locator('select').first().selectOption('SEVENTY_PERCENT');
  await form.getByRole('button', { name: 'Record payment' }).dblclick();
  await expectStatus(page, 'In Progress');
  await page.reload();
  await expect(page.getByText('Minimum Met — Balance Pending').first()).toBeVisible();
  expect(await paymentsOn(S.id), 'payments recorded for one deposit').toBe(1);
  await latestMail(request, CUSTOMER.email, new RegExp(`Payment received — Job Card ${S.number}`));
  // Refresh after the submit does not record it again.
  await page.reload();
  expect(await paymentsOn(S.id)).toBe(1);
});

test('parts: technician requests → HOD approves → Store reserves → Store releases (stock moves, warranty issued)', async ({ page }) => {
  await as(page, 'store-manager');
  S.stockBefore = await readStock(page, S.partUrl);

  await as(page, 'technician');
  await open(page, S.url);
  await page.getByRole('link', { name: '+ Request Store Parts' }).click();
  await expect(page.getByRole('heading', { name: 'Request Store Parts' })).toBeVisible();
  await page.getByRole('button', { name: 'Raise Parts Request' }).click();
  await waitOutcome(page, /status=parts_requested/);
  await expectStatus(page, 'Awaiting Parts');
  await page.getByRole('link', { name: /^PRS-/ }).first().click();
  await page.waitForURL(/\/workshop\/parts-requests\//);
  S.prsUrl = new URL(page.url()).pathname;

  await test.step('the Workshop HOD (Manager) approves', async () => {
    await as(page, 'workshop-manager');
    await open(page, S.prsUrl);
    await page.getByRole('heading', { name: 'Workshop HOD Approval' }).locator('..').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved — now awaiting Store.')).toBeVisible();
  });
  await test.step('Store approves and reserves the stock', async () => {
    await as(page, 'store-manager');
    await open(page, S.prsUrl);
    await page.getByRole('button', { name: 'Approve & Reserve' }).click();
    await expect(page.getByText('Approved and stock reserved — now ready for release.')).toBeVisible();
    const s = await readStock(page, S.partUrl);
    expect(s.onHand).toBe(S.stockBefore.onHand);
    expect(s.reserved).toBe(S.stockBefore.reserved + 2);
  });
  await test.step('Store releases to the technician', async () => {
    await open(page, S.prsUrl);
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await expect(page.getByText('Released.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Warranties issued with this release/)).toBeVisible();
    const s = await readStock(page, S.partUrl);
    expect(s.onHand).toBe(S.stockBefore.onHand - 2);
    expect(s.reserved).toBe(S.stockBefore.reserved);
  });
  await test.step('the Job Card resumes and lists the part warranty', async () => {
    await open(page, S.url);
    await expectStatus(page, 'In Progress');
    await expect(page.getByRole('heading', { name: 'Warranties issued' })).toBeVisible();
  });
});

test('the data-change journal records the part warranty issued with the release', async () => {
  const warranties = await db().warranty.findMany({ where: { jobCardId: S.id }, select: { id: true } });
  expect(warranties.length, 'a part warranty was issued').toBeGreaterThan(0);
  const rows = await db().auditLog.count({ where: { entityType: 'db:Warranty', action: 'data.create', metadata: { path: ['after', 'jobCardId'], equals: S.id } } });
  expect(rows, `journal rows for the warranties created for this Job Card${rows ? '' : ` — ${await journalDiagnosis(who('administrator').email)}`}`).toBe(warranties.length);
});

test('each journal row names the record it changed (the issued warranty)', async () => {
  const warranties = await db().warranty.findMany({ where: { jobCardId: S.id }, select: { id: true } });
  const linked = await db().auditLog.count({ where: { entityType: 'db:Warranty', entityId: { in: warranties.map((w) => w.id) } } });
  expect(linked, 'journal rows that name the issued warranties').toBe(warranties.length);
});

test('outside purchase: technician requests → Finance reviews → Manager approves → Finance disburses', async ({ page }) => {
  await as(page, 'technician');
  await open(page, S.url);
  await expect(page.getByRole('link', { name: '+ Request Procurement' })).toHaveAttribute('href', `${S.url}/request-procurement`);
  await page.goto(`${S.url}/request-procurement`);
  await expect(page.getByRole('heading', { name: 'Request External Procurement' })).toBeVisible();
  await page.getByRole('button', { name: 'Raise Procurement Request' }).click();
  await waitOutcome(page, /status=procurement_requested/);
  await expectStatus(page, 'Awaiting Parts');
  await page.getByRole('link', { name: /^EPR-/ }).first().click();
  await page.waitForURL(/\/workshop\/external-procurement\//);
  S.eprUrl = new URL(page.url()).pathname;

  await as(page, 'finance-officer');
  await open(page, S.eprUrl);
  await expect(page.getByRole('heading', { name: 'Finance Review' })).toBeVisible();
  await page.getByRole('button', { name: 'Send to Manager' }).click();
  await expect(page.getByText('Sent to the Manager for approval.')).toBeVisible();

  await as(page, 'workshop-manager');
  await open(page, S.eprUrl);
  await page.getByRole('heading', { name: 'Manager Approval' }).locator('..').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved — now awaiting Finance disbursement.')).toBeVisible();

  await as(page, 'finance-officer');
  await open(page, S.eprUrl);
  await page.locator('input[name="paymentMethod"]').fill('Cash');
  await page.locator('textarea[name="disbursementNotes"]').fill('Cash advance to the technician');
  await page.getByRole('button', { name: 'Disburse' }).click();
  await expect(page.getByText('Disbursed.', { exact: true })).toBeVisible();

  await open(page, S.url);
  await expectStatus(page, 'In Progress');
});

test('quality check → completed → ready; balance paid; close approved; vehicle checked out', async ({ page, request }) => {
  await as(page, 'technician');
  await open(page, S.url);
  await nextStep(page, 'Work done — send to quality check', 'Quality Check');
  // The technician cannot sign off their own work.
  await expect(page.locator('#status-panel').getByRole('button', { name: /Passed quality check/ })).toHaveCount(0);

  await as(page, SUPERMANAGER);
  await open(page, S.url);
  await nextStep(page, 'Passed quality check — mark Completed', 'Completed');
  await nextStep(page, 'Mark Ready for Collection', 'Ready for Collection');
  await expect(page.getByText(/Next: collect the balance/)).toBeVisible();

  await as(page, 'finance-officer');
  await open(page, S.url);
  await recordPayment(page, 'REMAINING', 'CASH', 'Balance at collection');
  await expect(page.getByText('Paid in full — nothing further to record.')).toBeVisible();
  await expect(page.getByText('Payment Completed').first()).toBeVisible();
  expect(await paymentsOn(S.id)).toBe(2);
  await latestMail(request, CUSTOMER.email, new RegExp(`Payment received — Job Card ${S.number}`));

  await as(page, 'receptionist');
  await open(page, S.url);
  await page.getByRole('button', { name: 'Request close' }).click();
  await expect(page.getByText(/Close requested — waiting on a Manager.s approval\./)).toBeVisible();

  await as(page, 'workshop-manager');
  await open(page, S.url);
  await page.locator('#close-request').getByRole('button', { name: 'Approve close' }).click();
  await expectStatus(page, 'Closed');

  // Collection: the supervisor, technician or a Manager checks the vehicle out
  // (WAITING_ON.CLOSED on the Job Card page) — here the Manager at the counter.
  // Re-open (not reload) so the form is hydrated before the click.
  await open(page, S.url);
  const checkout = jcForm(page, 'Check out vehicle');
  await expect(checkout.locator('input[name="collectedByName"]')).toHaveValue(CUSTOMER.name);
  await checkout.getByRole('button', { name: 'Check out vehicle' }).click();
  await expect(statusPanel(page).locator('span').first()).toHaveText('Checked Out', { timeout: 30_000 });
  await expect(page.getByText(`collected by ${CUSTOMER.name}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vehicle Collection Receipt' })).toBeVisible();
  // Nothing left to do on a checked-out Job Card.
  await expect(page.getByRole('button', { name: 'Request cancellation' })).toHaveCount(0);
});

test('Security lets the collected vehicle out through the gate', async ({ page }) => {
  await as(page, 'security-officer');
  await page.goto(`/security/vehicles?q=${encodeURIComponent(S.plate)}`);
  await expect(page.getByRole('heading', { name: 'Vehicles cleared to leave' })).toBeVisible();
  await page.getByRole('row').filter({ hasText: S.plate }).getByRole('link', { name: 'Confirm exit' }).click();
  await page.waitForURL(/\/security\/vehicles\/release\/job-card\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(S.plate);
  await expect(page.locator('input[name="collectedBy"]')).toHaveValue(CUSTOMER.name);
  await page.locator('input[name="notes"]').fill('Plate and VIN checked');
  await page.getByRole('button', { name: 'Confirm exit' }).click();
  await waitOutcome(page, /\/security\/vehicles\/exits\/[^/?]+\?status=vehicle_out/);
  await expect(page.getByText(/Exit recorded/)).toBeVisible();
});

test('the whole story is on the audit trail and in the Audit Logs', async ({ page }) => {
  await as(page, 'workshop-manager');
  await open(page, S.url);
  const trail = page.getByRole('heading', { name: 'Audit trail' }).locator('..');
  await trail.getByRole('button', { name: /^Show all/ }).click();
  for (const label of ['Job Card created', 'Job Card approved', 'Technician accepted assignment', 'Estimate submitted for validation', 'Estimate approved by manager', 'Customer notified of approved estimate', 'Payment recorded', 'Parts request released', 'Close requested', 'Left through the gate']) {
    await expect(trail.getByText(label).first(), label).toBeVisible();
  }
  await as(page, 'administrator');
  await expectAuditEntry(page, S.number);
  // The printable estimate opens for the customer copy.
  const res = await page.goto(`/print/job-cards/${S.id}/estimate?variant=client`);
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByText(S.number).first()).toBeVisible();
  expect(await db().jobCard.count({ where: { id: S.id, status: 'CHECKED_OUT' } })).toBe(1);
  expect(await countMail(page.request, CUSTOMER.email, new RegExp(`Estimate ready for ${S.number}`))).toBe(1);
});
