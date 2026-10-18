// Quick visual survey: sign in as a role and screenshot pages (for planning the video scenes).
import { chromium } from '@playwright/test';
const [,, out, role, ...urls] = process.argv;
const PASS = 'E2e-Test-Pass-2026!';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const mobile = process.env.MOBILE === '1';
const ctx = await browser.newContext(mobile ? { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3001/login');
await page.getByLabel('Work email').fill(`${process.env.EMAIL ?? role}@e2e.test`);
await page.getByLabel('Password', { exact: true }).fill(PASS);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/dashboard/, { timeout: 30000 });
await page.waitForLoadState('networkidle').catch(() => {});
let i = 0;
for (const u of urls) {
  await page.goto('http://localhost:3001' + u);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${role}-${String(i++).padStart(2, '0')}-${u.replace(/[^a-z0-9]+/gi, '_')}.jpg`, type: 'jpeg', quality: 70 });
  console.log(u, '->', page.url().replace('http://localhost:3001', ''));
}
await browser.close();
