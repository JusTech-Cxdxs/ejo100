import { SubNav } from '@/components/ui/SubNav';
import type { IconName } from '@/components/ui/Icon';

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/security', label: 'Gate dashboard', icon: 'dashboard' },
  { href: '/security/visitors', label: 'Visitors', icon: 'badge' },
  { href: '/security/exit-passes', label: 'Exit passes', icon: 'exit' },
  { href: '/security/vehicles', label: 'Vehicles leaving', icon: 'car' },
  { href: '/security/road-tests', label: 'Road tests', icon: 'road' },
  { href: '/security/deliveries', label: 'Deliveries', icon: 'truck' },
  { href: '/security/contractors', label: 'Contractors', icon: 'hardhat' },
  { href: '/security/incidents', label: 'Incidents', icon: 'alert' },
  { href: '/security/overdue', label: 'Overdue', icon: 'clock' },
  { href: '/security/register', label: 'Register', icon: 'list' },
];

export function SecurityNav({ active }: { active: string }) {
  return <SubNav tabs={TABS} active={active} label="Security" />;
}
