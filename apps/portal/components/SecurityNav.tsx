import { SubNav } from '@/components/ui/SubNav';
import type { IconName } from '@/components/ui/Icon';
import { decide, type PermissionKey } from '@/lib/authz/catalogue';
import { getPrincipal } from '@/lib/authz/server';

/** Each tab and the permissions (any of) its page needs — the same rule as the page guards. */
const TABS: { href: string; label: string; icon: IconName; needs: PermissionKey[] | 'everyone' | 'off-desk'; offDesk?: PermissionKey[] }[] = [
  { href: '/security', label: 'Gate dashboard', icon: 'dashboard', needs: ['security.view'] },
  { href: '/security/visitors', label: 'Visitors', icon: 'badge', needs: ['security.view'] },
  { href: '/security/exit-passes', label: 'Exit passes', icon: 'exit', needs: 'everyone' },
  { href: '/security/my-visitors', label: 'My visitors', icon: 'badge', needs: 'off-desk' },
  { href: '/security/vehicles', label: 'Vehicles leaving', icon: 'car', needs: ['security.view'] },
  { href: '/security/road-tests', label: 'Road tests', icon: 'road', needs: ['security.view', 'workshop.job_card.view'], offDesk: ['security.pass.approve'] },
  { href: '/security/deliveries', label: 'Deliveries', icon: 'truck', needs: ['security.view', 'store.grn.record'] },
  { href: '/security/contractors', label: 'Contractors', icon: 'hardhat', needs: ['security.view', 'security.pass.approve'] },
  { href: '/security/incidents', label: 'Incidents', icon: 'alert', needs: ['security.view'] },
  { href: '/security/overdue', label: 'Overdue', icon: 'clock', needs: ['security.view'] },
  { href: '/security/register', label: 'Register', icon: 'list', needs: ['security.view'] },
];

/**
 * The Security tabs THIS person can open. Someone who is not on the
 * Security desk sees their own exit passes and their own visitors, plus the
 * deliveries, road tests or contractor passes they receive or approve; never
 * the gate registers. With a single tab there is nothing to switch between,
 * so no bar is shown.
 */
export async function SecurityNav({ active }: { active: string }) {
  const p = await getPrincipal();
  const desk = decide(p, 'security.view').allowed;
  const can = (k: PermissionKey) => decide(p, k).allowed;
  const tabs = TABS.filter((t) => {
    if (t.needs === 'everyone') return true;
    if (t.needs === 'off-desk') return !desk;
    // Off the desk, a technician driving a road test follows it on the job, not here.
    if (!desk && t.offDesk) return t.offDesk.some(can);
    return t.needs.some(can);
  }).map(({ href, label, icon }) => ({ href, icon, label: href === '/security/exit-passes' && !desk ? 'My exit passes' : label }));
  if (tabs.length < 2) return null;
  return <SubNav tabs={tabs} active={active} label="Security" />;
}
