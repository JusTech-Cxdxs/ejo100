import { LoadingLink } from '@/components/LoadingLink';

const TABS = [
  { href: '/schedule', label: 'Dashboard' },
  { href: '/schedule/calendar', label: 'Calendar' },
  { href: '/schedule/appointments', label: 'Appointments' },
  { href: '/schedule/availability', label: 'Room availability' },
  { href: '/schedule/new', label: 'New appointment' },
  { href: '/schedule/rooms', label: 'Meeting rooms' },
  { href: '/schedule/aides', label: 'Aides' },
];

export function ScheduleNav({ active }: { active: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <LoadingLink key={t.href} href={t.href} className={`rounded-full px-4 py-1.5 text-sm font-medium ${active === t.href ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>{t.label}</LoadingLink>
      ))}
    </div>
  );
}
