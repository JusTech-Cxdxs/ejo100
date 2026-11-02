/**
 * The everyday Workshop steps, done through the browser exactly as each
 * person does them (selectors read from the pages' own TSX). Specs compose
 * these; every step asserts its visible outcome so a failure says WHICH step
 * of the business broke.
 */
import { expect, test, type Page, type Locator } from '@playwright/test';
import { as, expectNoUrlError, open, waitOutcome } from './helpers';
import { CUSTOMER, who, type Person } from './people';
import { db } from './db';

export const jcForm = (page: Page, button: string | RegExp): Locator =>
  page.locator('form').filter({ has: page.getByRole('button', { name: button }) });

/** Opens a form kept behind a button (RevealPanel: "Add a provider"…), if it is not open already. */
export async function reveal(page: Page, label: string): Promise<void> {
  const panel = page.locator('details[data-reveal]').filter({ has: page.locator('summary', { hasText: label }) }).first();
  const isOpen = () => panel.evaluate((d) => (d as HTMLDetailsElement).open);
  // A click that lands while the page is still hydrating can be undone by it: open it until it stays open.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await isOpen())) await panel.locator('summary').click();
    await page.waitForTimeout(300);
    if (await isOpen()) return;
  }
  await expect.poll(isOpen, { message: `"${label}" stays open` }).toBe(true);
}

/** A Job Card page section (the bordered card around an h2). */
export const card = (page: Page, heading: string): Locator =>
  page.getByRole('heading', { name: heading, exact: true }).locator('xpath=ancestor::div[contains(@class,"p-6") or contains(@class,"p-5")][1]');

const estimateRows = (page: Page) => card(page, 'Estimate').locator('table tbody tr');
const paymentRows = (page: Page) => card(page, 'Payments').getByText(/— (Bank Transfer|Cash)$/);

/** Pick from a SearchableSelect (role=combobox + role=option buttons). */
export async function pickSearchable(scope: Locator | Page, page: Page, text: string, option: RegExp | string, placeholder?: string) {
  const box = placeholder ? scope.getByPlaceholder(placeholder) : scope.getByRole('combobox').first();
  const picked = option instanceof RegExp ? option : new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for (let attempt = 1; ; attempt++) {
    await box.click();
    await box.fill(text);
    // The dropdown's own <button role="option"> — never a native <option> of
    // some other <select> on the page (e.g. a multi-select of staff).
    await suggestion(page, option).click();
    // Picked = the field now shows the option's label (a late re-render can drop it: pick again once).
    try {
      await expect(box).toHaveValue(picked, { timeout: 5_000 });
      return;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

/** A suggestion in a SearchableSelect / FilterSelect dropdown. */
export const suggestion = (page: Page, option: RegExp | string): Locator =>
  page.locator('button[role="option"]').filter({ hasText: option }).first();

/** Front desk opens a Job Card for a vehicle; returns its path. */
export async function openJobCard(page: Page, opts: { plate: string; customer?: string; supervisor?: Person; complaint?: string; mileage?: number }): Promise<string> {
  return test.step(`front desk opens a Job Card for ${opts.plate}`, async () => {
    await page.goto('/workshop/job-cards');
    const form = jcForm(page, 'Open Job Card');
    await form.getByPlaceholder('Search by name, email, or phone…').fill(opts.customer ?? CUSTOMER.name);
    await page.getByRole('option', { name: new RegExp(opts.customer ?? CUSTOMER.name) }).first().click();
    const vehicle = form.locator('select[name="vehicleId"]');
    await expect(vehicle.locator('option', { hasText: opts.plate })).toHaveCount(1);
    const value = await vehicle.locator('option', { hasText: opts.plate }).first().getAttribute('value');
    await vehicle.selectOption(value!);
    const supervisor = form.locator('select[name="supervisorId"]');
    await expect(supervisor.locator('option', { hasText: (opts.supervisor ?? who('workshop-supervisor')).name })).toHaveCount(1);
    await supervisor.selectOption({ label: (opts.supervisor ?? who('workshop-supervisor')).name });
    await form.locator('input[name="mileageAtCheckIn"]').fill(String(opts.mileage ?? 50100));
    await form.locator('input[name="complaints"]').first().fill(opts.complaint ?? 'Brakes squeal when stopping');
    await form.getByRole('button', { name: 'Open Job Card' }).click();
    await waitOutcome(page, /\/workshop\/job-cards\/[^/?]+\?status=job_card_created/);
    await expect(page.getByText('Job Card successfully created.')).toBeVisible();
    return new URL(page.url()).pathname;
  });
}

export async function jobNumber(page: Page): Promise<string> {
  const h = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim() ?? '';
  expect(h).toMatch(/^JC-/);
  return h;
}

/** The status badge in the Status panel. */
export function statusPanel(page: Page): Locator {
  return page.locator('#status-panel');
}

export async function expectStatus(page: Page, label: string) {
  await expect(statusPanel(page).locator('span').first()).toHaveText(label);
}

export async function supervisorApproves(page: Page, url: string, supervisor: Person = who('workshop-supervisor')) {
  await test.step('supervisor approves the Job Card', async () => {
    await as(page, supervisor);
    await open(page, url);
    await page.locator('#review-approval').getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('#review-approval')).toHaveCount(0);
    await expect(page.getByText(`Approved by ${supervisor.name}`)).toBeVisible();
  });
}

export async function assignTechnician(page: Page, tech: Person = who('technician')) {
  await test.step(`supervisor assigns ${tech.name}`, async () => {
    const assign = page.locator('form').filter({ has: page.locator('select[name="technicianId"]') });
    const select = assign.locator('select[name="technicianId"]');
    const value = await select.locator('option', { hasText: tech.name }).first().getAttribute('value');
    await select.selectOption(value!);
    await assign.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText(`Currently: ${tech.name}`)).toBeVisible();
  });
}

export async function technicianAccepts(page: Page, url: string, tech: Person = who('technician')) {
  await test.step('technician accepts the assignment', async () => {
    await as(page, tech);
    await open(page, url);
    await page.locator('#technician-response').getByRole('button', { name: 'Accept' }).click();
    await expect(page.locator('#technician-response')).toHaveCount(0);
  });
}

type Line =
  | { type: 'STORE_PART'; partType: string; qty?: number }
  | { type: 'LABOUR' | 'SUNDRY' | 'INTERNAL_JOB' | 'EXTERNAL_PART' | 'EXTERNAL_JOB'; description: string; qty?: number; price?: number };

/** Add one estimate line as whoever is signed in (supervisor or technician). */
export async function addLine(page: Page, line: Line) {
  await test.step(`add estimate line ${line.type}`, async () => {
    const form = page.locator('form').filter({ has: page.locator('select[name="type"]') });
    const before = await estimateRows(page).count();
    await form.locator('select[name="type"]').selectOption(line.type);
    if (line.type === 'STORE_PART') {
      await pickSearchable(form, page, line.partType, new RegExp(line.partType), 'Search Part Types…');
    } else {
      await form.locator('input[name="description"]').fill(line.description);
      if (line.price !== undefined) await form.locator('input[name="unitPrice"]').fill(String(line.price));
    }
    if (line.qty) await form.locator('input[name="quantity"]').fill(String(line.qty));
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    try {
      await expect(estimateRows(page)).toHaveCount(before + 1);
    } catch (e) {
      // Say exactly what is on the page and in the database (a duplicate line is a product bug).
      const rows = await estimateRows(page).allInnerTexts();
      const id = /\/workshop\/job-cards\/([^/?#]+)/.exec(page.url())?.[1];
      const inDb = id ? await db().estimateLineItem.findMany({ where: { estimate: { jobCardId: id } }, select: { type: true, description: true, createdAt: true } }) : [];
      throw new Error(`estimate rows ${before} → ${rows.length} (expected ${before + 1}); page: ${JSON.stringify(rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 60)))}; database: ${JSON.stringify(inDb)}`);
    }
    expectNoUrlError(page);
  });
}

export async function requestStoreMatching(page: Page) {
  await test.step('request Store matching', async () => {
    await page.getByRole('button', { name: /Request Store Matching/ }).click();
    await waitOutcome(page, /status=matching_requested/);
  });
}

/** Store matches every requested line of this Job Card (first fitting part each). */
export async function storeMatchesAll(page: Page, jobCardId: string, matcher: Person = who('store-manager')) {
  await test.step('Store matches the Store Part lines', async () => {
    await as(page, matcher);
    await open(page, `/inventory/estimate-matching/${jobCardId}`);
    const done = page.getByText('Every requested line for this Job Card is matched.').first();
    for (let i = 0; i < 5; i++) {
      const match = page.getByRole('button', { name: 'Match', exact: true });
      // The page streams in: wait until it shows either a line to match or "all matched".
      await expect(match.first().or(done)).toBeVisible();
      if ((await match.count()) === 0) break;
      await match.first().click();
      await waitOutcome(page, /status=line_matched|error=/);
      expectNoUrlError(page);
      if (!/estimate-matching\//.test(page.url())) break;
    }
    await page.goto(`/inventory/estimate-matching/${jobCardId}`);
    await expect(page.getByText('Every requested line for this Job Card is matched.').first()).toBeVisible();
  });
}

export async function submitEstimate(page: Page) {
  await test.step('submit the estimate for validation', async () => {
    await page.getByRole('button', { name: 'Submit for validation' }).click();
    await expect(page.getByText('Awaiting supervisor validation').first()).toBeVisible();
    expectNoUrlError(page);
  });
}

export async function supervisorApprovesEstimate(page: Page) {
  await test.step('supervisor approves the estimate', async () => {
    await page.getByRole('button', { name: 'Approve estimate' }).click();
    await expect(page.getByText('Awaiting manager review').first()).toBeVisible();
    expectNoUrlError(page);
  });
}

export async function managerApprovesEstimate(page: Page) {
  await test.step('manager gives the final approval', async () => {
    await page.getByRole('button', { name: 'Approve as Manager' }).click();
    await expect(page.getByRole('button', { name: 'Approve as Manager' })).toHaveCount(0);
    await expect(card(page, 'Estimate').getByText('Approved', { exact: true })).toBeVisible();
    expectNoUrlError(page);
  });
}

export async function notifyCustomer(page: Page) {
  await test.step('front desk notifies the customer', async () => {
    await page.getByRole('button', { name: 'Notify customer' }).click();
    await expect(page.getByText(/^Customer notified on /)).toBeVisible();
    await expectStatus(page, 'Awaiting Customer Approval');
  });
}

/** Finance records a payment using the amount picker (an option key or a typed amount). */
export async function recordPayment(page: Page, amount: 'SEVENTY_PERCENT' | 'FULL' | 'REMAINING' | number, method: 'BANK_TRANSFER' | 'CASH' = 'BANK_TRANSFER', notes?: string) {
  await test.step(`finance records a payment (${amount})`, async () => {
    const form = jcForm(page, 'Record payment');
    const picker = form.locator('select').first();
    if (typeof amount === 'number') {
      await picker.selectOption('OTHER');
      await form.getByPlaceholder('Enter amount').fill(String(amount));
    } else {
      await picker.selectOption(amount);
    }
    await form.locator('select[name="method"]').selectOption(method);
    if (notes) await form.locator('input[name="notes"]').fill(notes);
    const rowsBefore = await paymentRows(page).count();
    await form.getByRole('button', { name: 'Record payment' }).click();
    await expect(paymentRows(page)).toHaveCount(rowsBefore + 1);
    expectNoUrlError(page);
  });
}

/** Press one of the Status panel's forward-step buttons. */
export async function nextStep(page: Page, label: string | RegExp, expectLabel?: string) {
  await test.step(`status: ${label}`, async () => {
    await statusPanel(page).getByRole('button', { name: label }).click();
    if (expectLabel) await expectStatus(page, expectLabel);
    expectNoUrlError(page);
  });
}

/** Opens a Job Card, approves it, assigns and accepts — ready for the estimate. */
export async function jobCardReadyForEstimate(page: Page, opts: { plate: string; customer?: string; supervisor?: Person; complaint?: string }): Promise<string> {
  await as(page, 'receptionist');
  const url = await openJobCard(page, opts);
  await supervisorApproves(page, url, opts.supervisor);
  await assignTechnician(page);
  await technicianAccepts(page, url);
  return url;
}

/**
 * The whole estimate → approval → customer → 70% deposit path, so a spec
 * about something later (cancellation, parts, procurement) starts from a Job
 * Card that is In Progress.
 */
export async function jobCardInProgress(page: Page, opts: { plate: string; lines: Line[]; complaint?: string }): Promise<{ url: string; id: string; number: string }> {
  const url = await jobCardReadyForEstimate(page, opts);
  const id = url.split('/').pop()!;
  // Technician adds Store Part / External lines; supervisor adds priced lines.
  const techLines = opts.lines.filter((l) => l.type === 'STORE_PART' || l.type === 'EXTERNAL_PART' || l.type === 'EXTERNAL_JOB');
  const supLines = opts.lines.filter((l) => !techLines.includes(l));
  await open(page, url);
  for (const l of techLines) await addLine(page, l);
  await as(page, 'workshop-supervisor');
  await open(page, url);
  for (const l of supLines) await addLine(page, l);
  if (opts.lines.some((l) => l.type === 'STORE_PART')) {
    await requestStoreMatching(page);
    await storeMatchesAll(page, id);
    await as(page, 'workshop-supervisor');
    await open(page, url);
  }
  await submitEstimate(page);
  await supervisorApprovesEstimate(page);
  await as(page, 'workshop-manager');
  await open(page, url);
  await managerApprovesEstimate(page);
  await as(page, 'receptionist');
  await open(page, url);
  await notifyCustomer(page);
  const number = await jobNumber(page);
  await as(page, 'finance-officer');
  await open(page, url);
  await recordPayment(page, 'SEVENTY_PERCENT');
  await expectStatus(page, 'In Progress');
  return { url, id, number };
}

/** Publish a broadcast now, for 4 hours (as whoever is signed in — an administrator or broadcaster). */
export async function publishBroadcast(page: Page, opts: { category: RegExp; title: string; message: string; audience: 'ALL' | 'ROLE' | 'CUSTOMERS_ALL'; role?: string; email: boolean }): Promise<string> {
  await page.goto('/notifications/broadcasts/new');
  await page.getByRole('button', { name: opts.category }).click();
  const form = jcForm(page, 'Publish broadcast');
  await form.locator('input[name="title"]').fill(opts.title);
  await form.locator('textarea[name="message"]').fill(opts.message);
  await form.locator('select[name="audience"]').selectOption(opts.audience);
  if (opts.role) await form.getByRole('checkbox', { name: opts.role, exact: true }).check();
  await form.locator('select[name="when"]').selectOption('NOW');
  await form.locator('select[name="duration"]').selectOption('h4');
  await form.locator('select[name="sendEmail"]').selectOption(opts.email ? 'yes' : 'no');
  await form.getByRole('button', { name: 'Publish broadcast' }).click();
  await waitOutcome(page, /\/notifications\/broadcasts\/[^/?]+\?status=created/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^BC-/);
  return new URL(page.url()).pathname;
}
