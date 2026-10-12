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
  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu, 'no menu column on a phone until asked for').toHaveCount(0);

  const menuButton = page.getByRole('button', { name: 'Open menu', exact: true });
  await menuButton.click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workshop', exact: true })).toBeVisible();

  await test.step('"Close menu" closes it; Esc closes it too', async () => {
    await drawer.getByRole('button', { name: 'Close menu' }).click();
    await expect(drawer).toHaveCount(0);
    await menuButton.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  await test.step('a menu link navigates and the drawer closes behind it', async () => {
    await menuButton.click();
    await drawer.getByRole('link', { name: 'Notifications', exact: true }).click();
    await page.waitForURL(/\/notifications/);
    await expect(drawer).toHaveCount(0);
  });

  await test.step('below 1024 px, Sign out lives in the account menu', async () => {
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);
  });
});
