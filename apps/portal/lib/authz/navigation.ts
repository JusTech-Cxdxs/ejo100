import { platformModules } from '../modules';
import { APPROVAL_PERMISSIONS, decide, PAGE_PERMISSIONS, scopeFor, type PermissionKey, type Principal } from './catalogue';

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
const EVERYONE = new Set(['dashboard', 'notifications', 'security']);

/**
 * The menu for one person — the same rule the pages enforce, so nobody is
 * shown a door they cannot open. Security: the desk for security staff and
 * reception; for everyone else, their own exit passes and visitors. Modules not
 * yet live are not shown at all (version 1 scope).
 */
export function navigationFor(p: Principal): NavItem[] {
  const can = (k: PermissionKey) => decide(p, k).allowed;
  const out: NavItem[] = [];
  for (const m of platformModules) {
    // Version 1: modules not yet live are not shown to anyone (next version).
    if (m.status !== 'LIVE') continue;
    if (m.key === 'dashboard') {
      out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
      // Leadership with the whole organisation in view: every branch side by side.
      if (p.isSuperAdmin || scopeFor(p, 'analytics.business.view') === 'ALL') out.push({ key: 'headquarters', name: 'Headquarters', href: '/headquarters', status: m.status });
      // People who decide things get one list of everything waiting for them.
      if (p.isSuperAdmin || APPROVAL_PERMISSIONS.some(can)) out.push({ key: 'approvals', name: 'Approvals', href: '/approvals', status: m.status });
      continue;
    }
    if (m.key === 'security') {
      if (can('security.view')) out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
      else {
        // Not on the Security desk: their own exit passes and visitors, and (Store) the deliveries they receive.
        out.push({ key: 'exit-passes', name: 'My exit passes', href: '/security/exit-passes', status: m.status });
        out.push({ key: 'my-visitors', name: 'My visitors', href: '/security/my-visitors', status: m.status });
        if (can('store.grn.record')) out.push({ key: 'deliveries', name: 'Deliveries', href: '/security/deliveries', status: m.status });
      }
      continue;
    }
    if (EVERYONE.has(m.key)) { out.push({ key: m.key, name: m.name, href: m.href, status: m.status }); continue; }
    const needs = MODULE_NEEDS[m.key];
    if (!needs || needs.some(can)) out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
    // Customers handed over by Enyo, right under Customers.
    if (m.key === 'crm' && can('support.tickets.manage')) out.push({ key: 'support-inbox', name: 'Support centre', href: '/crm/support', status: m.status });
  }
  // Everyone's own: reminders, and their work mailbox (the layout hides Mail during an assisted session).
  out.push({ key: 'reminders', name: 'Reminders', href: '/reminders', status: 'LIVE' });
  out.push({ key: 'mail', name: 'Mail', href: '/mail', status: 'LIVE' });
  // Everyone in an organisation can ask for help (the platform team answers, it does not ask).
  if (!p.isSuperAdmin) out.push({ key: 'get-help', name: 'Get help', href: '/support/help', status: 'LIVE' });
  // The integrity watch: reviewers only.
  if (can('integrity.review')) out.push({ key: 'integrity', name: 'Integrity watch', href: '/integrity', status: 'LIVE' });
  // Assisted sessions: the Branch Assistant starts them; user administrators review them.
  if (!p.isSuperAdmin && can('support.assist')) out.push({ key: 'assist', name: 'Assist a colleague', href: '/support/assist', status: 'LIVE' });
  else if (can('admin.users.manage')) out.push({ key: 'assist', name: 'Assisted sessions', href: '/support/assist', status: 'LIVE' });
  return out;
}
