import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, expectHealthy, noSidewaysScroll, open, uniq, waitOutcome } from './helpers';
import { pickSearchable } from './workflows';

/**
 * An employee who is not on the Security desk sees only their own side of
 * Security (docs/ROLES_AND_ACCESS.md): My exit passes and My visitors. The
 * front desk books their visitors; Security lets them in; the host sees
 * them and nobody else does.
 */
test.describe.configure({ mode: 'serial' });

const main = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const securityTabs = (page: Page) => page.getByRole('navigation', { name: 'Security' });
const TECH = who('technician');

/** Lagos wall-clock time, n hours from now, as a datetime-local value. */
function lagosLocal(hoursAhead: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(Date.now() + hoursAhead * 3600000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

const S = { booked: `Booked ${uniq()}`, walkIn: `Walkin ${uniq()}`, bookedUrl: '', walkInUrl: '' };

test('a technician has exactly My exit passes and My visitors under Security', async ({ page }) => {
  await as(page, 'technician');
  await expect(main(page).getByRole('link', { name: 'My exit passes', exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'My visitors', exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Security', exact: true })).toHaveCount(0);

  await open(page, '/security/my-visitors');
  await expect(page.getByRole('heading', { name: 'My visitors', level: 1 })).toBeVisible();
  await expect(page.getByText('Ask the front desk or Security to register them.')).toBeVisible();
  const tabs = securityTabs(page).getByRole('link');
  await expect(tabs).toHaveCount(2);
  await expect(securityTabs(page).getByRole('link', { name: 'My exit passes', exact: true })).toBeVisible();
  await expect(securityTabs(page).getByRole('link', { name: 'My visitors', exact: true })).toBeVisible();
  // No way to book a visitor themselves.
  await expect(page.getByRole('button', { name: 'Book the visit' })).toHaveCount(0);
  await expectHealthy(page, '/security/my-visitors');

  await open(page, '/security/exit-passes');
  await expect(securityTabs(page).getByRole('link')).toHaveCount(2);

  for (const url of ['/security/visitors', '/security/register', '/security/on-premises', '/security/incidents']) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/access-denied/);
  }
});

test('the front desk books a visitor for the technician; Security lets another one in', async ({ page }) => {
  await as(page, 'receptionist');
  await open(page, '/security/visitors');
  const book = page.locator('form').filter({ has: page.locator('select[name="party"]') }).first();
  await book.locator('select[name="party"]').selectOption('ONE');
  await book.locator('select[name="affiliation"]').selectOption('INDIVIDUAL');
  await book.locator('input[name="visitorName"]').fill(S.booked);
  await book.locator('input[name="purpose"]').fill('Meeting');
  await pickSearchable(book, page, TECH.name.split(' ')[0]!, new RegExp(TECH.name), 'Search staff by name or ID…');
  await book.locator('input[name="expectedAt"]').fill(lagosLocal(2));
  await book.locator('select[name="expectedMinutes"]').selectOption('60');
  await book.getByRole('button', { name: 'Book the visit' }).click();
  await waitOutcome(page, /\/security\/visitors\/[^/?]+\?status=registered/);
  S.bookedUrl = new URL(page.url()).pathname;

  await as(page, 'security-officer');
  await open(page, '/security/visitors');
  const gate = page.locator('form').filter({ has: page.locator('select[name="mode"]') }).first();
  await gate.locator('select[name="mode"]').selectOption('ARRIVED');
  await gate.locator('select[name="party"]').selectOption('ONE');
  await gate.locator('select[name="affiliation"]').selectOption('INDIVIDUAL');
  await gate.locator('input[name="visitorName"]').fill(S.walkIn);
  await gate.locator('input[name="phone"]').fill('08031234567');
  await gate.locator('select[name="idType"]').selectOption("Driver's licence");
  await gate.locator('input[name="idNumber"]').fill('LAG12345AA67');
  await gate.locator('select[name="vehicleType"]').selectOption('ON_FOOT');
  await gate.locator('input[name="purpose"]').fill('Delivery of documents');
  await pickSearchable(gate, page, TECH.name.split(' ')[0]!, new RegExp(TECH.name), 'Search staff by name or ID…');
  await gate.locator('select[name="expectedMinutes"]').selectOption('60');
  await gate.getByRole('button', { name: 'Register and issue pass' }).click();
  await waitOutcome(page, /\/security\/visitors\/[^/?]+\?status=arrived/);
  S.walkInUrl = new URL(page.url()).pathname;
});

test('the technician sees both visitors, opens one, and is told when they arrive', async ({ page }) => {
  await as(page, 'technician');
  await open(page, '/security/my-visitors');
  const expected = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Expected/ }) });
  const onSite = page.locator('section').filter({ has: page.getByRole('heading', { name: /^On site now/ }) });
  await expect(expected.getByRole('link', { name: new RegExp(S.booked) })).toBeVisible();
  await expect(onSite.getByRole('link', { name: new RegExp(S.walkIn) })).toBeVisible();

  await onSite.getByRole('link', { name: new RegExp(S.walkIn) }).click();
  await expect(page).toHaveURL(new RegExp(S.walkInUrl));
  await expect(page.getByRole('heading', { name: S.walkIn, level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to My visitors' })).toBeVisible();
  // The desk's buttons are not theirs.
  for (const name of ['Check out', 'Received at reception — tell the host', 'Extend stay']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }

  await open(page, '/dashboard');
  await expect(page.getByText(`Your visitor has arrived — ${S.walkIn}`).first()).toBeVisible();
});

test('someone else does not see the technician’s visitors, even by address', async ({ page }) => {
  await as(page, 'workshop-supervisor');
  await open(page, '/security/my-visitors');
  await expect(page.getByText(S.booked)).toHaveCount(0);
  await expect(page.getByText(S.walkIn)).toHaveCount(0);
  for (const url of [S.bookedUrl, S.walkInUrl]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: new RegExp(`${S.booked}|${S.walkIn}`) }), url).toHaveCount(0);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  test('My visitors and My exit passes: no sideways scroll', async ({ page }) => {
    await as(page, 'technician');
    for (const url of ['/security/my-visitors', '/security/exit-passes', '/security/exit-passes/new']) {
      await page.goto(url);
      await page.locator('main h1').first().waitFor({ timeout: 20_000 });
      await expectHealthy(page, url);
      await noSidewaysScroll(page, url);
    }
  });
});
