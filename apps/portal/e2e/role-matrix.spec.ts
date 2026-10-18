import { test, expect } from '@playwright/test';
import { decide, STORE_COST_PERMISSIONS, type PermissionKey, type Principal } from '../lib/authz/catalogue';
import { E2E_PASSWORD, MASTER, PEOPLE, SUPERMANAGER, SWITCHABLE } from './people';
import { expectHealthy, gotoSettled, menuLinks, signIn, watchServerErrors } from './helpers';

/**
 * Every role × every page: the menu's pages all open cleanly, and the
 * protected areas obey the Authorization Catalogue (the documented,
 * version-controlled policy) — open when the role grants the permission,
 * "Access denied" when it does not. Typing the address never gets round it.
 */

/** Protected areas and the permission(s) any of which opens them (from each page's guard). */
const AREAS: { url: string; needs: PermissionKey[] }[] = [
  { url: '/users', needs: ['admin.users.manage'] },
  { url: '/roles', needs: ['admin.roles.manage'] },
  { url: '/permissions', needs: ['admin.roles.manage'] },
  { url: '/settings', needs: ['admin.settings.manage'] },
  { url: '/organisation', needs: ['admin.organisation.manage'] },
  { url: '/structure', needs: ['admin.structure.manage'] },
  { url: '/branches', needs: ['admin.structure.manage'] },
  { url: '/audit-logs', needs: ['audit.view'] },
  { url: '/recycle-bin', needs: ['admin.recycle_bin.manage'] },
  { url: '/analytics', needs: ['analytics.business.view'] },
  { url: '/workshop', needs: ['workshop.view'] },
  { url: '/workshop/job-cards', needs: ['workshop.view'] },
  { url: '/workshop/vehicle-service', needs: ['workshop.view'] },
  { url: '/workshop/customers', needs: ['workshop.view'] },
  { url: '/workshop/custody', needs: ['workshop.view'] },
  { url: '/workshop/refunds', needs: ['workshop.view'] },
  { url: '/workshop/parts-requests', needs: ['workshop.view'] },
  { url: '/workshop/external-procurement', needs: ['workshop.view'] },
  { url: '/inventory', needs: ['store.view'] },
  { url: '/inventory/parts', needs: ['store.view'] },
  // Delivery costs and margins: the Store, Finance, management and Warranty — not the workshop floor.
  { url: '/inventory/goods-receipts', needs: STORE_COST_PERMISSIONS },
  { url: '/inventory/pricing', needs: STORE_COST_PERMISSIONS },
  { url: '/inventory/estimate-matching', needs: ['store.view'] },
  { url: '/inventory/analytics', needs: ['analytics.inventory.view'] },
  { url: '/warranty', needs: ['warranty.view'] },
  { url: '/warranty/claims', needs: ['warranty.view'] },
  { url: '/warranty/analytics', needs: ['analytics.warranty.view'] },
  { url: '/security/visitors', needs: ['security.view'] },
  { url: '/security/incidents', needs: ['security.view'] },
  { url: '/security/on-premises', needs: ['security.view'] },
  { url: '/security/deliveries', needs: ['security.view', 'store.grn.record'] },
  { url: '/security/contractors', needs: ['security.view', 'security.pass.approve'] },
  { url: '/security/road-tests', needs: ['security.view', 'workshop.job_card.view'] },
  { url: '/schedule', needs: ['schedule.view', 'schedule.manage'] },
  { url: '/schedule/rooms', needs: ['schedule.view', 'schedule.manage'] },
  { url: '/notifications/broadcasts/analytics', needs: ['notifications.broadcast.send'] },
  // Zinox edition
  { url: '/catalogue', needs: ['catalogue.view'] },
  { url: '/catalogue/products', needs: ['catalogue.view'] },
  { url: '/production', needs: ['production.view'] },
  { url: '/production/build-orders', needs: ['production.view'] },
  { url: '/production/units', needs: ['production.view'] },
  { url: '/warehouse', needs: ['warehouse.view'] },
  { url: '/warehouse/finished-goods', needs: ['warehouse.view'] },
  { url: '/warehouse/releases', needs: ['warehouse.view'] },
  { url: '/procurement', needs: ['procurement.view'] },
  { url: '/procurement/orders', needs: ['procurement.view'] },
  { url: '/sales', needs: ['sales.view'] },
  { url: '/sales/orders', needs: ['sales.view'] },
  { url: '/sales/price-lists', needs: ['sales.view'] },
  { url: '/service', needs: ['service.view'] },
  { url: '/service/jobs', needs: ['service.view'] },
  { url: '/projects', needs: ['projects.view'] },
  { url: '/service/warranties', needs: ['service.view'] },
  { url: '/service/claims', needs: ['service.view'] },
  { url: '/service/ledger', needs: ['warranty.claim.approve', 'service.manage'] },
  { url: '/projects/new', needs: ['projects.view'] },
  { url: '/sales/quotations', needs: ['sales.view'] },
  { url: '/sales/payments', needs: ['sales.view'] },
  { url: '/sales/dealers', needs: ['sales.view'] },
];
/** Everyone signed in may open these. */
const EVERYONE = ['/dashboard', '/approvals', '/profile', '/notifications', '/security/exit-passes', '/roadmap'];

const principalFor = (roles: string[]): Principal => ({ userId: 'x', isSuperAdmin: false, roleSlugs: roles, branchId: 'b', departmentId: null });
const mayOpen = (roles: string[], needs: PermissionKey[]) => needs.some((k) => decide(principalFor(roles), k).allowed);

// Each role is independent — spread them over the workers.
test.describe.configure({ mode: 'parallel' });

const ACCOUNTS = [
  ...PEOPLE.filter((p) => p !== SWITCHABLE).map((p) => ({ label: p === SUPERMANAGER ? 'workshop-supervisor + workshop-manager' : p.role, email: p.email, password: E2E_PASSWORD, roles: [p.role, ...(p.extraRoles ?? [])] })),
  { label: 'master-administrator', email: MASTER.email, password: MASTER.password, roles: [] as string[], master: true },
];

for (const acct of ACCOUNTS) {
  test(`role matrix — ${acct.label}`, async ({ page }) => {
    test.setTimeout(180_000);
    const serverErrors = watchServerErrors(page);
    await signIn(page, acct.email, acct.password);

    const menu = menuLinks(page);
    await expect(menu.first()).toBeVisible();
    const hrefs = [...new Set(await menu.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '')))];
    expect(hrefs.length, 'menu entries').toBeGreaterThan(1);

    // Each address is opened once: protected areas (menu or forbidden) are checked in the last step.
    const areaUrls = new Set(AREAS.map((a) => a.url));
    await test.step('every menu page opens cleanly', async () => {
      for (const href of hrefs.filter((h) => !areaUrls.has(h))) {
        const res = await gotoSettled(page, href);
        expect(res?.status() ?? 0, `${href} status`).toBeLessThan(500);
        await expect(page, `${href} is in the menu, so it must not be refused`).not.toHaveURL(/\/access-denied/);
        await expectHealthy(page, href);
      }
    });

    await test.step('pages for everyone open cleanly', async () => {
      for (const url of EVERYONE.filter((u) => !hrefs.includes(u))) {
        const res = await gotoSettled(page, url);
        expect(res?.status() ?? 0, `${url} status`).toBeLessThan(500);
        await expect(page, url).not.toHaveURL(/\/access-denied|\/login/);
        await expectHealthy(page, url);
      }
    });

    await test.step('menu pages that are protected areas open (the catalogue grants them)', async () => {
      const problems: string[] = [];
      for (const area of AREAS.filter((a) => hrefs.includes(a.url))) {
        const allowed = 'master' in acct || mayOpen(acct.roles, area.needs);
        if (!allowed) problems.push(`${area.url}: in the menu but not permitted (${area.needs.join(' / ')})`);
        const res = await gotoSettled(page, area.url);
        if ((res?.status() ?? 0) >= 500) { problems.push(`${area.url}: HTTP ${res?.status()}`); continue; }
        if (/\/access-denied/.test(page.url())) problems.push(`${area.url}: in the menu, but refused when opened`);
        else await expectHealthy(page, area.url);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });

    const forbidden = AREAS.filter((a) => !('master' in acct) && !mayOpen(acct.roles, a.needs));
    await test.step(`${forbidden.length} forbidden addresses typed in are refused`, async () => {
      // The page itself, once, in the browser: the friendly "Access denied".
      if (forbidden[0]) {
        await gotoSettled(page, forbidden[0].url);
        await expect(page, forbidden[0].url).toHaveURL(/\/access-denied/);
        await expect(page.getByRole('heading', { name: /don.t have access/ })).toBeVisible();
      }
      // Every one of them over HTTP with the same session (fast): the server
      // answers with the redirect to Access denied and never the page.
      const problems: string[] = [];
      for (const area of forbidden) {
        const res = await page.request.get(area.url);
        const body = await res.text();
        if (res.status() >= 500) { problems.push(`${area.url}: HTTP ${res.status()}`); continue; }
        if (!/\/access-denied/.test(res.url()) && !body.includes('/access-denied')) problems.push(`${area.url}: opened, but the role has none of ${area.needs.join(', ')}`);
        if (/\/login/.test(res.url())) problems.push(`${area.url}: sent to sign in (session lost?)`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });

    expect(serverErrors(), 'document responses ≥ 500').toEqual([]);
  });
}
