import { test, expect } from '@playwright/test';
import { CUSTOMER, who } from './people';
import { as, open, uniq, visitHealthy, waitOutcome } from './helpers';
import { jcForm, pickSearchable, reveal } from './workflows';

/**
 * Service Centre and Projects, as the people do them: the supervisor opens a
 * service job for a serial the system does not know (typed product), assigns
 * the technician; the technician records the diagnosis and the resolution;
 * the supervisor passes the quality check and returns the unit. Then a
 * Project Manager records a project for the seeded customer and adds a
 * milestone. Plus the fences: the technician cannot pass their own QA, and a
 * sales officer cannot open the Service Centre.
 *
 * Needs the service-supervisor, service-technician and project-manager
 * accounts in e2e/people.ts (seeded by e2e/seed.ts).
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = { serial: `E2E-SVC-${tag}`, jobUrl: '', jobNumber: '', projectUrl: '' };
const lagosDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

test('the Service Centre supervisor opens a job for a typed serial and assigns the technician', async ({ page }) => {
  await as(page, 'service-supervisor');
  await visitHealthy(page, '/service');
  await expect(page.getByRole('heading', { level: 1, name: 'Service Centre' })).toBeVisible();
  await open(page, `/service/jobs/new?serial=${encodeURIComponent(S.serial)}`);
  await expect(page.getByText('is not in the system')).toBeVisible();
  const form = jcForm(page, 'Open service job');
  await form.locator('input[name="productName"]').fill('Zinox Prestige Pro2 laptop (E2E)');
  await form.locator('textarea[name="fault"]').fill('Does not power on; charger light flickers.');
  await form.locator('select[name="kind"]').selectOption('PAID');
  await form.getByRole('button', { name: 'Open service job' }).click();
  await waitOutcome(page, /\/service\/jobs\/[^/?]+\?status=opened/);
  S.jobUrl = new URL(page.url()).pathname;
  S.jobNumber = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim();
  expect(S.jobNumber).toMatch(/^SVC-\d{4}-\d{6}$/);
  await expect(page.getByText('Open — to assign')).toBeVisible();

  const assign = jcForm(page, 'Assign');
  const tech = who('service-technician');
  await pickSearchable(assign, page, tech.name.split(' ')[0]!, new RegExp(tech.name), 'Search technicians…');
  await assign.getByRole('button', { name: 'Assign' }).click();
  await waitOutcome(page, /status=assigned/);
  await expect(page.getByText(tech.name).first()).toBeVisible();
});

test('the technician records the diagnosis and the resolution; they cannot pass their own quality check', async ({ page }) => {
  await as(page, 'service-technician');
  await open(page, S.jobUrl);
  const diag = jcForm(page, 'Record diagnosis');
  await diag.locator('textarea[name="diagnosis"]').fill('Charging port loose on the board; battery healthy.');
  await diag.getByRole('button', { name: 'Record diagnosis' }).click();
  await waitOutcome(page, /status=diagnosed/);

  const done = jcForm(page, 'Repair done — send for quality check');
  await done.locator('textarea[name="resolution"]').fill('Re-soldered the charging port, 2-hour charge and discharge test passed.');
  await done.getByRole('button', { name: 'Repair done — send for quality check' }).click();
  await waitOutcome(page, /status=sent_to_qa/);
  await expect(page.getByText('Quality check', { exact: true }).first()).toBeVisible();
  // The technician sees no pass/fail buttons on their own repair.
  await expect(page.getByRole('button', { name: 'Pass — ready for collection' })).toHaveCount(0);
});

test('the supervisor quotes the paid repair, records payment, passes QA and returns the unit', async ({ page }) => {
  await as(page, 'service-supervisor');
  await open(page, S.jobUrl);
  const qa = jcForm(page, 'Pass — ready for collection');
  await qa.locator('input[name="note"]').fill('Keyboard, display, ports, battery and Wi-Fi all pass.');
  await qa.getByRole('button', { name: 'Pass — ready for collection' }).click();
  await waitOutcome(page, /status=qa_passed/);
  await expect(page.getByText('Ready for collection').first()).toBeVisible();

  // A paid repair cannot go back until it is quoted and paid.
  await expect(page.getByText('Quote the repair before returning the unit.')).toBeVisible();
  const quote = jcForm(page, 'Quote');
  await quote.locator('input[name="amount"]').fill('25000');
  await quote.getByRole('button', { name: 'Quote' }).click();
  await waitOutcome(page, /status=quoted/);
  const pay = jcForm(page, 'Record payment');
  await pay.locator('input[name="amount"]').fill('25000');
  await pay.locator('input[name="reference"]').fill(`POS-${tag}`);
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await waitOutcome(page, /status=payment_recorded/);

  const ret = jcForm(page, 'Unit returned');
  await ret.locator('input[name="collectedBy"]').fill('Ada Customer');
  await ret.getByRole('button', { name: 'Unit returned' }).click();
  await waitOutcome(page, /status=returned/);
  await expect(page.getByText('Returned to customer').first()).toBeVisible();
  await visitHealthy(page, `/print/service-job${S.jobUrl.replace('/service/jobs', '')}`);
  await expect(page.getByText(S.jobNumber).first()).toBeVisible();
});

test('a Project Manager records a project for the seeded customer and adds a milestone', async ({ page }) => {
  await as(page, 'project-manager');
  await visitHealthy(page, '/projects');
  await open(page, '/projects/new');
  const form = jcForm(page, 'Create project');
  await form.locator('input[name="name"]').fill(`E2E Schools laptops ${tag}`);
  await pickSearchable(form, page, CUSTOMER.name.slice(0, 6), new RegExp(CUSTOMER.name), 'Search customers (ministry, company, school)…');
  await form.locator('select[name="kind"]').selectOption('EDUCATION');
  await form.locator('input[name="tenderReference"]').fill(`TND-${tag}`);
  await form.locator('input[name="contractValue"]').fill('125000000');
  await form.locator('input[name="startDate"]').fill(lagosDay(0));
  const pm = who('project-manager');
  await pickSearchable(form, page, pm.name.split(' ')[0]!, new RegExp(pm.name), 'Search people…');
  await form.locator('select[name="status"]').selectOption('AWARDED');
  await form.getByRole('button', { name: 'Create project' }).click();
  await waitOutcome(page, /\/projects\/[^/?]+\?status=created/);
  S.projectUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/PRJ-\d{4}-\d{6}/);

  await reveal(page, 'Add a milestone');
  const ms = jcForm(page, 'Add milestone');
  await ms.locator('input[name="name"]').fill('Site survey — 40 schools');
  await ms.locator('input[name="dueDate"]').fill(lagosDay(5));
  await ms.getByRole('button', { name: 'Add milestone' }).click();
  await waitOutcome(page, /status=milestone_added/);
  await expect(page.getByText('Site survey — 40 schools')).toBeVisible();
  await expect(page.getByText('Due soon')).toBeVisible();
  await page.getByRole('button', { name: 'Mark done' }).first().click();
  await waitOutcome(page, /status=milestone_completed/);
});

test('fences: a sales officer cannot open the Service Centre; a technician cannot open Projects', async ({ page }) => {
  await as(page, 'sales-officer');
  await page.goto('/service');
  await expect(page).toHaveURL(/\/access-denied/);
  await as(page, 'service-technician');
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/access-denied/);
});
