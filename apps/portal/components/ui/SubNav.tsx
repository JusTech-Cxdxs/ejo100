import { LoadingLink } from '@/components/LoadingLink';
import { Icon, type IconName } from './Icon';

/**
 * A module's own tabs (Security, Scheduling…): icons, the current one in
 * green; on phones it scrolls sideways inside itself (never the page).
 */
export function SubNav({ tabs, active, label }: { tabs: { href: string; label: string; icon: IconName }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="ejo-scroll -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-max gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 sm:flex sm:min-w-0 sm:flex-wrap sm:rounded-[var(--ejo-radius-lg)]">
        {tabs.map((t) => {
          const on = active === t.href;
          return (
            <LoadingLink
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? 'bg-[var(--ejo-primary)] text-white shadow-sm shadow-[var(--ejo-primary)]/25' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </LoadingLink>
          );
        })}
      </div>
    </nav>
  );
}
