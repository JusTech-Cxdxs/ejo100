import { test, expect, type Page } from '@playwright/test';
import { PORTAL_CUSTOMER } from './people';
import { as, open, uniq } from './helpers';
import { WEB, customerSignedIn, portal, websiteUp } from './customer';
import { freshVehicle } from './db';
import {
  addLine, jobCardReadyForEstimate, jobNumber, managerApprovesEstimate, notifyCustomer, submitEstimate, supervisorApprovesEstimate,
} from './workflows';

/**
 * The customer portal on a small phone (360 × 780, a Redmi 13C): the header
 * carries the whole brand, the estimate on a Job Card reads cleanly (no line
 * sits on top of another), the profile form saves, and no page scrolls
 * sideways.
 */
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

test.beforeAll(async ({ request }) => {
  const up = await websiteUp(request);
  if (process.env.CI) expect(up, `the website (customer portal) must be running at ${WEB}`).toBe(true);
  else test.skip(!up, `the website is not running at ${WEB}`);
});

async function noSidewaysScroll(page: Page, what: string) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `${what}: the page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

test('phone: the header shows the full brand, and the main pages fit the screen', async ({ page }) => {
  await customerSignedIn(page, PORTAL_CUSTOMER);

  await test.step('brand: logo, first word, green rule and the rest of the name, none of it cut off', async () => {
    const mark = page.getByTestId('portal-wordmark');
    await expect(mark).toBeVisible();
    const box = (await mark.boundingBox())!;
    expect(box.x, 'the wordmark starts on screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'the wordmark ends on screen').toBeLessThanOrEqual(360);
    await expect(mark.locator('img').filter({ visible: true })).toHaveCount(1);
    const rule = mark.getByTestId('wordmark-rule').filter({ visible: true });
    await expect(rule).toHaveCount(1);
    expect((await rule.boundingBox())!.width, 'the green rule has room to show').toBeGreaterThanOrEqual(6);
    // Every line of the name is shown in full (no ellipsis).
    const clipped = await mark.evaluate((el) =>
      [...el.querySelectorAll('span')].filter((s) => s.offsetParent !== null && s.children.length === 0 && s.textContent?.trim() && s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent),
    );
    expect(clipped, 'parts of the name are cut off').toEqual([]);
  });

  for (const path of ['/dashboard', '/dashboard/vehicles', '/dashboard/services', '/dashboard/payments', '/dashboard/warranties', '/dashboard/notifications', '/dashboard/profile', '/dashboard/support']) {
    await test.step(path, async () => {
      await page.goto(portal(path));
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await noSidewaysScroll(page, path);
    });
  }
});

test.describe('a Job Card estimate on a phone', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { url: '', id: '', number: '' };

  test('staff send an estimate with a long line', async ({ page }) => {
    // Staff pages are desktop pages; this part only prepares the data.
    await page.setViewportSize({ width: 1366, height: 860 });
    const { plate } = await freshVehicle('MOB', { customerEmail: PORTAL_CUSTOMER.email, make: 'Toyota', model: 'Land Cruiser Prado' });
    S.url = await jobCardReadyForEstimate(page, { plate, customer: PORTAL_CUSTOMER.name, complaint: 'Phone check: air-conditioning not cooling' });
    S.id = S.url.split('/').pop()!;
    await as(page, 'workshop-supervisor');
    await open(page, S.url);
    S.number = await jobNumber(page);
    await addLine(page, { type: 'LABOUR', description: `Air-conditioning diagnosis, regas, leak test and cabin filter replacement ${uniq()}`, price: 125000 });
    await addLine(page, { type: 'SUNDRY', description: 'Sundry', price: 7000 });
    await submitEstimate(page);
    await supervisorApprovesEstimate(page);
    await as(page, 'workshop-manager');
    await open(page, S.url);
    await managerApprovesEstimate(page);
    await as(page, 'receptionist');
    await open(page, S.url);
    await notifyCustomer(page);
  });

  test('the customer reads it at 360 px: lines, amounts and the total never overlap', async ({ page }) => {
    test.skip(!S.id, 'needs the Job Card from the previous step');
    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal(`/dashboard/services/jc/${S.id}`));
    const estimate = page.getByTestId('customer-estimate');
    await estimate.scrollIntoViewIfNeeded();
    await expect(estimate).toBeVisible();
    await expect(estimate).toContainText('Total estimate');
    await noSidewaysScroll(page, 'Job Card detail');

    const lines = estimate.getByTestId('estimate-line');
    expect(await lines.count()).toBeGreaterThanOrEqual(2);
    const est = (await estimate.boundingBox())!;
    for (let i = 0; i < await lines.count(); i++) {
      // Within one line: its visible pieces (description, kind, quantity, amount) never sit on each other.
      const parts = await lines.nth(i).evaluate((li) =>
        [...li.querySelectorAll('p, span')]
          .filter((el) => el.children.length === 0 && el.textContent?.trim() && (el as HTMLElement).offsetParent !== null)
          .map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent!.trim(), x: r.x, y: r.y, width: r.width, height: r.height }; }),
      );
      for (let a = 0; a < parts.length; a++) {
        const pa = parts[a]!;
        expect(pa.x + pa.width, `"${pa.text}" runs off the estimate`).toBeLessThanOrEqual(est.x + est.width + 1);
        for (let b = a + 1; b < parts.length; b++) {
          const pb = parts[b]!;
          expect(overlaps(pa, pb), `"${pa.text}" overlaps "${pb.text}"`).toBe(false);
        }
      }
      // Consecutive lines are stacked, not drawn over each other.
      if (i > 0) {
        const prev = (await lines.nth(i - 1).boundingBox())!;
        const cur = (await lines.nth(i).boundingBox())!;
        expect(cur.y, `estimate line ${i + 1} starts before line ${i} ends`).toBeGreaterThanOrEqual(prev.y + prev.height - 1);
      }
    }
  });
});

test('phone: the profile form saves', async ({ page }) => {
  const digits = String(Date.now()).slice(-7);
  const phone = `0803 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  await customerSignedIn(page, PORTAL_CUSTOMER);
  await page.goto(portal('/dashboard/profile'));
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible();
  await noSidewaysScroll(page, 'profile');

  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save contact details' }) });
  const field = form.getByLabel('Phone number');
  const fieldBox = (await field.boundingBox())!;
  const formBox = (await form.boundingBox())!;
  expect(fieldBox.width, 'the phone field uses the width of the form').toBeGreaterThanOrEqual(formBox.width * 0.9);
  const save = form.getByRole('button', { name: 'Save contact details' });
  expect((await save.boundingBox())!.height, 'the save button is easy to tap').toBeGreaterThanOrEqual(44);

  await field.fill(phone);
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Your contact details are saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Phone number')).toHaveValue(phone);
});
