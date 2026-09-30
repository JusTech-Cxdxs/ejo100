import { LoadingLink } from '@/components/LoadingLink';

const TABS = [
  { href: '/security', label: 'Gate dashboard' },
  { href: '/security/visitors', label: 'Visitors' },
  { href: '/security/exit-passes', label: 'Exit passes' },
  { href: '/security/vehicles', label: 'Vehicles leaving' },
];

export function SecurityNav({ active }: { active: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <LoadingLink key={t.href} href={t.href} className={`rounded-full px-4 py-1.5 text-sm font-medium ${active === t.href ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>
          {t.label}
        </LoadingLink>
      ))}
    </div>
  );
}
