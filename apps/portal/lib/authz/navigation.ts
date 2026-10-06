import { platformModules } from '@/lib/modules';
import { decide, PAGE_PERMISSIONS, type PermissionKey, type Principal } from './catalogue';

export type NavItem = { key: string; name: string; href: string; status: string };

/** What each module needs to appear in the menu (the pages enforce the same). */
const MODULE_NEEDS: Record<string, PermissionKey[]> = {
  ...Object.fromEntries(Object.entries(PAGE_PERMISSIONS).map(([k, v]) => [k, [v]])),
  workshop: ['workshop.view'],
  inventory: ['store.view'],
  warranty: ['warranty.view'],
  scheduling: ['schedule.view', 'schedule.manage'],
};
/** Areas everyone signed in uses. */
const EVERYONE = new Set(['dashboard', 'notifications', 'help', 'security']);

/**
 * The menu for one person — the same rule the pages enforce, so nobody is
 * shown a door they cannot open. Security: the desk for security staff and
 * reception; for everyone else it opens their own exit passes. Modules not
 * yet live are shown only to the platform team and administrators.
 */
export function navigationFor(p: Principal): NavItem[] {
  const can = (k: PermissionKey) => decide(p, k).allowed;
  const out: NavItem[] = [];
  for (const m of platformModules) {
    if (m.status !== 'LIVE') {
      if (p.isSuperAdmin || can('admin.settings.manage')) out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
      continue;
    }
    if (m.key === 'security') {
      if (can('security.view')) out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
      else {
        // Not on the Security desk: their own exit passes, and (Store) the deliveries they receive.
        out.push({ key: 'exit-passes', name: 'Exit Passes', href: '/security/exit-passes', status: m.status });
        if (can('store.grn.record')) out.push({ key: 'deliveries', name: 'Deliveries', href: '/security/deliveries', status: m.status });
      }
      continue;
    }
    if (EVERYONE.has(m.key)) { out.push({ key: m.key, name: m.name, href: m.href, status: m.status }); continue; }
    const needs = MODULE_NEEDS[m.key];
    if (!needs || needs.some(can)) out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
  }
  return out;
}
