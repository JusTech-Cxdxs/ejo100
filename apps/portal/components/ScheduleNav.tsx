import { SubNav } from '@/components/ui/SubNav';
import type { IconName } from '@/components/ui/Icon';

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/schedule', label: 'Dashboard', icon: 'dashboard' },
  { href: '/schedule/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/schedule/appointments', label: 'Appointments', icon: 'list' },
  { href: '/schedule/availability', label: 'Room availability', icon: 'clock' },
  { href: '/schedule/new', label: 'New appointment', icon: 'plus' },
  { href: '/schedule/rooms', label: 'Meeting rooms', icon: 'room' },
  { href: '/schedule/aides', label: 'Aides', icon: 'users' },
];

export function ScheduleNav({ active }: { active: string }) {
  return <SubNav tabs={TABS} active={active} label="Scheduling" />;
}
