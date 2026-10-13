import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, MASTER, OTHER_ORG_ADMIN, who } from './people';
import { as, expectHealthy, open, signIn, waitOutcome } from './helpers';
import { db, freshVehicle, jobCardIdFromUrl } from './db';
import { jobNumber, openJobCard } from './workflows';

/**
 * Recycle bin: the front desk opens a Job Card by mistake and deletes it with
 * a reason; it is gone from lists and search; the organisation's
 * administrator restores it from the Recycle bin; another organisation never
 * sees it; a Job Card with a payment can't be deleted (no button, and the
 * server refuses a form sent anyway); the platform team removes an expired
 * item for good.
 */
test.describe.configure({ mode: 'serial' });

const S = { url: '', id: '', number: '', paidUrl: '', paidId: '', paymentId: '', purgeNumber: '' };

async function search(page: Page, q: string) {
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(q);
  const panel = box.locator('xpath=ancestor::div[2]');
  const answered = panel.getByRole('listbox', { name: 'Search results' }).or(panel.getByText(/^Nothing found for/)).or(panel.getByText(/Search isn’t available/));
  await expect(answered.first()).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Searching' })).toHaveCount(0);
  return panel;
}

/** Opens the "Delete (created by mistake)" panel, gives the reason and confirms. */
async function moveToBin(page: Page, reason: string) {
  await page.getByText('Delete (created by mistake)').click();
  await page.getByLabel('What was the mistake?').fill(reason);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Move to Recycle bin' }).click();
}

const binRow = (page: Page, text: string) => page.getByTestId('bin-row').filter({ hasText: text });

test.afterAll(async () => {
  // The payment was a fixture: take it away so totals elsewhere are untouched.
  if (S.paymentId) await db().payment.deleteMany({ where: { id: S.paymentId } });
});

test('front desk deletes a Job Card opened by mistake; it disappears from lists and search', async ({ page }) => {
  const { plate } = await freshVehicle('BIN');
  await as(page, 'receptionist');
  S.url = await openJobCard(page, { plate, complaint: 'Opened on the wrong car' });
  S.id = await jobCardIdFromUrl(S.url);
  S.number = await jobNumber(page);

  await moveToBin(page, 'Opened on the wrong vehicle');
  await waitOutcome(page, /\/workshop\/job-cards\?binned=/);
  await expect(page.getByText(`${S.number} moved to the Recycle bin.`)).toBeVisible();

  await open(page, `/workshop/job-cards?q=${encodeURIComponent(S.number)}`);
  await expect(page.getByText(`No Job Cards match "${S.number}".`)).toBeVisible();
  const panel = await search(page, S.number);
  await expect(panel).toContainText('Nothing found for');
  await page.goto(S.url);
  await expect(page.getByRole('heading', { name: 'Page not found' }), 'the Job Card page is gone').toBeVisible();
  expect(await db().jobCard.count({ where: { id: S.id } })).toBe(0);
});

test('another organisation never sees it in its Recycle bin', async ({ page }) => {
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  await open(page, `/recycle-bin?q=${encodeURIComponent(S.number)}&state=all`);
  await expect(page.getByRole('heading', { name: 'Recycle bin', level: 1 })).toBeVisible();
  await expect(binRow(page, S.number)).toHaveCount(0);
  await expect(page.getByText('Nothing matches')).toBeVisible();
});

test('the administrator finds it with its reason and restores it', async ({ page }) => {
  await as(page, 'administrator');
  await open(page, '/recycle-bin');
  const row = binRow(page, S.number);
  await expect(row).toContainText('Opened on the wrong vehicle');
  await expect(row).toContainText(`Deleted by ${who('receptionist').name}`);
  await expect(row).toContainText(/\d+ days left/);
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Restore' }).click();
  await waitOutcome(page, /\/recycle-bin\?restored=/);
  const url = new URL(page.url());
  const restoredAs = url.searchParams.get('restored')!;
  if (url.searchParams.get('was')) {
    // Another spec opened a Job Card meanwhile and was given the free number: it comes back under the next one.
    expect(url.searchParams.get('was')).toBe(S.number);
    await expect(page.getByText(`Restored as ${restoredAs}.`)).toBeVisible();
    await expect(page.getByText(`Its old number ${S.number} had been given to another Job Card`)).toBeVisible();
  } else {
    expect(restoredAs, 'same number').toBe(S.number);
    await expect(page.getByText(`${S.number} restored.`)).toBeVisible();
  }
  await page.getByRole('link', { name: `Open ${restoredAs}` }).click();
  await page.waitForURL(new RegExp(S.url));
  await expect(page.getByRole('heading', { level: 1, name: restoredAs })).toBeVisible();
  await expect(page.getByText('Restored from the Recycle bin').first()).toBeVisible();
  await expectHealthy(page);
  expect(await db().jobCardComplaint.count({ where: { jobCardId: S.id } }), 'its complaint came back too').toBe(1);
});

test('a Job Card with a payment can’t be deleted: the server refuses, and the button goes away', async ({ page }) => {
  const { plate } = await freshVehicle('BIP');
  await as(page, 'receptionist');
  S.paidUrl = await openJobCard(page, { plate, complaint: 'Paid already' });
  S.paidId = await jobCardIdFromUrl(S.paidUrl);
  await page.getByText('Delete (created by mistake)').click();
  await page.getByLabel('What was the mistake?').fill('Trying to delete a paid job');
  // Fixture: a payment recorded meanwhile, while this page is still open (Finance's own screen is covered elsewhere).
  const fd = await db().user.findUniqueOrThrow({ where: { email: who('receptionist').email }, select: { id: true } });
  S.paymentId = (await db().payment.create({ data: { jobCardId: S.paidId, amount: 1000, method: 'CASH', recordedById: fd.id, notes: 'e2e recycle-bin fixture' }, select: { id: true } })).id;
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Move to Recycle bin' }).click();
  await page.waitForURL((u) => u.searchParams.has('error'));
  await expect(page.getByText("This Job Card has a payment recorded, so it can't be deleted. Ask for it to be cancelled instead.").first()).toBeVisible();
  expect(await db().jobCard.count({ where: { id: S.paidId } }), 'still there').toBe(1);

  await open(page, S.paidUrl);
  await expect(page.getByText('Delete (created by mistake)')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move to Recycle bin' })).toHaveCount(0);

  // The Manager is told why, and which way to go instead.
  await as(page, 'workshop-manager');
  await open(page, S.paidUrl);
  await expect(page.getByText('Created by mistake?')).toBeVisible();
  await expect(page.getByText(/has a payment recorded, so it can't be deleted\. Ask for it to be cancelled instead\./)).toBeVisible();
});

test('the platform team removes an expired item for good', async ({ page }) => {
  const { plate } = await freshVehicle('BPG');
  await as(page, 'receptionist');
  await openJobCard(page, { plate, complaint: 'Duplicate visit' });
  S.purgeNumber = await jobNumber(page);
  await moveToBin(page, 'Duplicate of another Job Card');
  await waitOutcome(page, /\/workshop\/job-cards\?binned=/);
  // Fixture: the restore period has ended.
  const item = await db().recycleBinItem.findFirstOrThrow({ where: { reference: S.purgeNumber, restoredAt: null }, orderBy: { deletedAt: 'desc' } });
  await db().recycleBinItem.update({ where: { id: item.id }, data: { purgeAfter: new Date(Date.now() - 60_000) } });

  await signIn(page, MASTER.email, MASTER.password);
  await open(page, `/recycle-bin?state=expired&q=${encodeURIComponent(S.purgeNumber)}`);
  const row = binRow(page, S.purgeNumber);
  await expect(row).toContainText('Time ran out');
  await expect(row.getByRole('button', { name: 'Restore' })).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Remove for good' }).click();
  await waitOutcome(page, /\/recycle-bin\?state=purged&purged=1/);
  await expect(page.getByText('1 item removed for good.')).toBeVisible();
  const after = await db().recycleBinItem.findUniqueOrThrow({ where: { id: item.id } });
  expect(after.purgedAt).not.toBeNull();
  expect(after.snapshot, 'the saved copy is gone').toBeNull();

  // The organisation can no longer restore it.
  await as(page, 'administrator');
  await open(page, `/recycle-bin?state=all&q=${encodeURIComponent(S.purgeNumber)}`);
  const gone = binRow(page, S.purgeNumber);
  await expect(gone).toContainText('Removed for good');
  await expect(gone.getByRole('button', { name: 'Restore' })).toHaveCount(0);
});
