import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, MASTER, who } from './people';
import { signIn } from './helpers';

/** What each role is shown — and that typing the address is refused just the same. */
const CASES: { role: string; sees: string[]; hidden: string[]; refused: string[] }[] = [
  { role: 'technician', sees: ['Dashboard', 'Workshop'], hidden: ['Users', 'Roles', 'Business Analytics', 'Settings'], refused: ['/users', '/roles', '/analytics', '/settings'] },
  { role: 'receptionist', sees: ['Dashboard', 'Workshop'], hidden: ['Users', 'Roles', 'Settings'], refused: ['/users', '/permissions'] },
  { role: 'store-manager', sees: ['Inventory'], hidden: ['Users', 'Roles'], refused: ['/users'] },
  { role: 'administrator', sees: ['Users', 'Roles', 'Permissions', 'Organisation', 'Branches'], hidden: [], refused: [] },
];

for (const c of CASES) {
  test(`${c.role}: menu and direct addresses agree`, async ({ page }) => {
    await signIn(page, who(c.role).email, E2E_PASSWORD);
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const s of c.sees) await expect(nav.getByRole('link', { name: s, exact: true })).toBeVisible();
    for (const h of c.hidden) await expect(nav.getByRole('link', { name: h, exact: true })).toHaveCount(0);
    for (const url of c.refused) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/access-denied/);
      await expect(page.getByRole('heading', { name: /don.t have access/ })).toBeVisible();
    }
  });
}

test('the Master Administrator signs in and sees the platform', async ({ page }) => {
  await signIn(page, MASTER.email, MASTER.password);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users', exact: true })).toBeVisible();
});
