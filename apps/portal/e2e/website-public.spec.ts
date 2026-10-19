import { test, expect, type Page } from '@playwright/test';
import { WEB, websiteUp } from './customer';
import { as, open, uniq, waitOutcome } from './helpers';

/**
 * The public website, as a visitor on a phone and on a desk, and the people
 * behind it: the header stays visible after the menu closes, the brands band
 * stays light in dark mode, every page has real content (no placeholder), the
 * contact form becomes a support request the support team can find, and a
 * story written in the staff portal (News & media) appears on the website.
 */
test.beforeAll(async ({ request }) => {
  const up = await websiteUp(request);
  if (process.env.CI) expect(up, `the website must be running at ${WEB}`).toBe(true);
  else test.skip(!up, `the website is not running at ${WEB}`);
});

const PAGES = ['/', '/about', '/businesses', '/businesses/automotive', '/businesses/automotive/workshop', '/businesses/agriculture', '/products', '/services', '/investors', '/sustainability', '/careers', '/news', '/store', '/contact', '/privacy', '/terms'];

test('every public page has real content, no placeholder, and no sideways scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PAGES) {
    await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1').first(), path).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/under development|coming soon/i), `${path} must not be a placeholder`).toHaveCount(0);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollWidth, inner: window.innerWidth }));
    expect(scroll, `${path}: page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
  }
});

test('on a phone the header, its theme toggle and the menu button stay visible after the menu closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
  const header = page.getByTestId('site-header');
  await expect(header.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(header.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeVisible();
  await header.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Contact' })).toBeVisible();
  // Grouped pages open inside the sheet.
  await menu.getByRole('button', { name: /Show Our Businesses pages/ }).click();
  await expect(menu.getByRole('link', { name: 'Agriculture' })).toBeVisible();
  await menu.getByRole('button', { name: 'Close menu' }).click();
  await expect(menu).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(header.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeVisible();
  // The page behind scrolls again.
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  // Navigating from the menu lands on the page, header still there.
  await header.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(header.getByRole('button', { name: 'Open menu' })).toBeVisible();
});

test('the brands band stays light in dark mode, edge to edge, and the footer badges sit on one row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const band = page.getByTestId('brands-band');
  await band.scrollIntoViewIfNeeded();
  const bg = await band.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');
  const box = await band.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(1279);
  // The logos are shown big (at least 64px tall on a desk).
  const h = await band.locator('img').first().evaluate((el) => (el as HTMLImageElement).getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(60);
  // Footer badges: three, one row, small.
  const badges = page.locator('footer img[alt*="ISO"], footer img[alt*="Five-star"], footer img[alt*="Award"]');
  await expect(badges).toHaveCount(3);
  const tops = await badges.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const heights = await badges.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const hh of heights) expect(hh).toBeLessThanOrEqual(48);
});

test('the contact form becomes a support request the support team finds by its number', async ({ page }) => {
  const tag = uniq();
  await page.goto(`${WEB}/contact?topic=sales`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('What is it about?')).toHaveValue('sales');
  // Validation first: no way to reply.
  await page.getByLabel('Your name').fill(`Visitor ${tag}`);
  await page.getByLabel('Your message').fill('I would like a quote for two SOUEAST S07 SUVs for my company fleet.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#contact-error')).toContainText(/email address or a phone number/);
  await page.getByLabel('Phone').fill('0803 000 1234');
  await page.getByRole('button', { name: 'Send message' }).click();
  const status = page.getByTestId('contact-sent');
  await expect(status).toContainText('Thank you', { timeout: 30_000 });
  const number = (await status.textContent())!.match(/SUP-\d{4}-\d+/)?.[0];
  expect(number, 'a reference number').toBeTruthy();
  await expect(status.getByRole('link', { name: /Follow your request/ })).toBeVisible();

  // The support team sees it, with the topic and the message.
  await as(page, 'customer-care');
  await open(page, `/crm/support?q=${encodeURIComponent(number!)}`);
  const row = page.locator('main').getByRole('link', { name: new RegExp(number!) }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText(`Visitor ${tag}`).first()).toBeVisible();
  await expect(page.getByText(/two SOUEAST S07 SUVs/).first()).toBeVisible();
});

test('the store: a model opens its details, "Add to cart" says checkout is coming and offers reserving, and a referral reaches the support team', async ({ page }) => {
  const tag = uniq();
  await page.goto(`${WEB}/store?c=suvs`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Vehicles, tyres and parts/);
  // Slashed prices with a validity date on every card.
  const list = page.getByRole('list', { name: 'Products' });
  await expect(list.getByRole('listitem').first()).toContainText(/until \d+ \w+ 2026/);
  await expect(list.getByRole('listitem').first().locator('s')).toBeVisible();
  // The pop-up explains the vehicle.
  await page.getByRole('button', { name: 'SOUEAST S07: details' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'SOUEAST S07' })).toBeVisible();
  await expect(dialog).toContainText(/Assembled in Lagos/);
  await expect(dialog).toContainText(/Indicative price/);
  // Add to cart does not add: it says checkout is coming and points to the sales team.
  await dialog.getByRole('button', { name: 'Add SOUEAST S07 to cart' }).click();
  const toast = page.getByTestId('store-toast');
  await expect(toast).toContainText(/Online checkout is coming soon/);
  await expect(toast.getByRole('link', { name: /Reserve with the sales team/ })).toBeVisible();
  await expect(page.getByText(/in your cart/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  // Refer and earn becomes a request for the sales team.
  await page.getByRole('tab', { name: 'Refer a buyer' }).click();
  await page.locator('#r-name').fill(`Referrer ${tag}`);
  await page.locator('#r-phone').fill('0803 000 5678');
  await page.locator('#r-message').fill(`Please call Chidi on 0803 111 2222, he wants a SOUEAST S07 for his company (${tag}).`);
  await page.getByRole('button', { name: 'Send the referral' }).click();
  const sent = page.getByTestId('refer-sent');
  await expect(sent).toContainText('Thank you', { timeout: 30_000 });
  const number = (await sent.textContent())!.match(/SUP-\d{4}-\d+/)?.[0];
  expect(number, 'a reference number').toBeTruthy();
  await as(page, 'customer-care');
  await open(page, `/crm/support?q=${encodeURIComponent(number!)}`);
  const row = page.locator('main').getByRole('link', { name: new RegExp(number!) }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText(`Referrer ${tag}`).first()).toBeVisible();
  await expect(page.getByText(new RegExp(tag)).first()).toBeVisible();
});

async function fillStory(page: Page, title: string) {
  await page.getByLabel('Headline').fill(title);
  await page.getByLabel('Kind of story').selectOption('MILESTONE');
  await page.getByLabel('Business it is about').fill('Automotive');
  await page.getByLabel('Summary — one or two sentences').fill('The first locally assembled SUVs leave the Lagos line — a milestone for the plant and its people.');
  await page.getByLabel('The story', { exact: true }).fill('## The line\n\nTechnicians trained on body, trim and final inspection.\n\n- Jobs\n- Skills\n\n> “We came to build them here.”');
}

test('a story written in the portal is published to the website; a draft is not', async ({ page }) => {
  const title = `Assembly milestone ${uniq()}`;
  // Branch staff do not publish.
  await as(page, 'technician');
  await page.goto('/news');
  await expect(page).toHaveURL(/\/access-denied/);

  await as(page, 'broadcaster');
  await open(page, '/news');
  await expect(page.getByRole('heading', { name: 'News & media', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Write a story' }).click();
  await fillStory(page, title);
  // The live preview follows the text.
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await waitOutcome(page, /\/news\/[^/?]+\?status=saved/);
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  // A draft is not on the website.
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const draftRes = await page.request.get(`${WEB}/news/${slug}`);
  expect(draftRes.status()).toBe(404);

  await page.getByRole('button', { name: 'Save and publish' }).click();
  await waitOutcome(page, /status=published/);
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();

  // On the website: in the list and on its own page.
  await page.goto(`${WEB}/news`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').getByRole('link', { name: new RegExp(title) }).first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`${WEB}/news/${slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The line', level: 2 })).toBeVisible();
  await expect(page.getByText('We came to build them here.')).toBeVisible();

  // Archive: off the website, kept in the portal.
  await as(page, 'broadcaster');
  await open(page, '/news');
  await page.locator('main').getByRole('link', { name: new RegExp(title) }).first().click();
  await page.getByRole('button', { name: 'Archive' }).click();
  await waitOutcome(page, /status=archived/);
  const archivedRes = await page.request.get(`${WEB}/news/${slug}`);
  expect(archivedRes.status()).toBe(404);
});
