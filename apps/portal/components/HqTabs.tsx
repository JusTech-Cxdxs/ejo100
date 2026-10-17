import { LoadingLink } from '@/components/LoadingLink';
import { Icon, type IconName } from '@/components/ui';

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/headquarters', label: 'Overview', icon: 'building' },
  { href: '/headquarters/team', label: 'Team performance', icon: 'users' },
];

/** Headquarters' own tabs, keeping the chosen period. */
export function HqTabs({ active, period }: { active: string; period: string }) {
  return (
    <nav aria-label="Headquarters" className="flex flex-wrap gap-1 border-b border-[var(--ejo-border)]">
      {TABS.map((t) => {
        const on = t.href === active;
        return (
          <LoadingLink key={t.href} href={period === 'this_month' ? t.href : `${t.href}?period=${period}`} aria-current={on ? 'page' : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${on ? 'border-[var(--ejo-primary)] text-[var(--ejo-primary)]' : 'border-transparent text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </LoadingLink>
        );
      })}
    </nav>
  );
}
