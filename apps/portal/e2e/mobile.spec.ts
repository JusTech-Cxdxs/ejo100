import { test, expect, type Page } from '@playwright/test';
import { as, expectHealthy } from './helpers';

/**
 * Phone (375 × 812) smoke of the pages people use on the move: they render,
 * nothing scrolls sideways, the content gets the screen (the menu is a
 * drawer that opens on demand, not a fixed 256 px column).
 */
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const PAGES: { role: string; urls: string[] }[] = [
  { role: 'receptionist', urls: ['/dashboard', '/workshop/job-cards', '/workshop/vehicle-service', '/security/visitors', '/notifications'] },
  { role: 'technician', urls: ['/dashboard', '/workshop/job-cards', '/security/exit-passes/new'] },
  { role: 'security-officer', urls: ['/security', '/security/on-premises', '/security/deliveries/new'] },
  { role: 'store-manager', urls: ['/inventory', '/inventory/parts'] },
];

async function noSidewaysScroll(page: Page, url: string) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `${url}: page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
}

for (const { role, urls } of PAGES) {
  test(`phone: ${role} — pages render without sideways scroll`, async ({ page }) => {
    await as(page, role);
    for (const url of urls) {
      await page.goto(url);
      await page.locator('main h1').first().waitFor({ timeout: 20_000 });
      await expectHealthy(page, url);
      await noSidewaysScroll(page, url);
    }
  });
}

test('phone: the menu is a drawer — content gets the screen, the menu opens on demand', async ({ page }) => {
  await as(page, 'receptionist');
  await page.goto('/workshop/job-cards');
  await page.locator('main h1').first().waitFor();
  const mainBox = await page.locator('main').boundingBox();
  expect(mainBox!.width, 'main content width on a phone').toBeGreaterThanOrEqual(375 * 0.9);
  const menuButton = page.getByRole('button', { name: 'Open menu', exact: true });
  await menuButton.click();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workshop', exact: true })).toBeVisible();
});
