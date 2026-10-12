import type { ReactNode } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon, type IconName } from './Icon';
import { TONE_TILE, type Tone } from './tones';

/**
 * A titled block of a page: icon + title (an <h2>) + optional description
 * and actions, then the content. `flush` drops the inner padding (tables).
 */
export function SectionCard({
  icon,
  title,
  description,
  actions,
  children,
  flush = false,
  tone = 'brand',
  className = '',
  id,
  as: Heading = 'h2',
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  tone?: Tone;
  className?: string;
  id?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <section id={id} className={`min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] ${className}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${flush ? 'border-b border-[var(--ejo-border)] px-4 py-3 sm:px-5' : 'px-4 pt-4 sm:px-5 sm:pt-5'}`}>
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <span className={`mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${TONE_TILE[tone]}`}><Icon name={icon} size={16} /></span> : null}
          <div className="min-w-0">
            <Heading className="text-sm font-semibold leading-8 text-[var(--ejo-text)]">{title}</Heading>
            {description ? <div className="-mt-1 text-xs text-[var(--ejo-text-muted)]">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 text-xs">{actions}</div> : null}
      </div>
      <div className={flush ? '' : 'px-4 pb-4 pt-3 sm:px-5 sm:pb-5'}>{children}</div>
    </section>
  );
}

/** Nothing to show yet — said kindly, with what to do next. */
export function EmptyState({ icon = 'inbox', title, children, action, compact = false }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}>
      <span className="relative mb-3 flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 rounded-2xl bg-[var(--ejo-primary)]/10" aria-hidden="true" />
        <span className="ejo-float relative text-[var(--ejo-primary)]"><Icon name={icon} size={22} /></span>
      </span>
      <p className="text-sm font-semibold text-[var(--ejo-text)]">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-[var(--ejo-text-muted)]">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * A door to a part of a module (module home pages): icon, name, one line,
 * and an optional count. Lifts on hover; the arrow slides.
 */
export function NavCard({ href, icon, title, description, badge, tone = 'brand', style }: { href: string; icon: IconName; title: ReactNode; description?: ReactNode; badge?: ReactNode; tone?: Tone; style?: React.CSSProperties }) {
  return (
    <LoadingLink href={href} style={style} className="ejo-lift group flex min-w-0 flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 hover:border-[var(--ejo-primary)]/50">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105 ${TONE_TILE[tone]}`}><Icon name={icon} size={20} /></span>
        {badge !== undefined && badge !== null ? <span className="rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--ejo-text)] ring-1 ring-[var(--ejo-border)]">{badge}</span> : null}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-[var(--ejo-text)]">{title}</h3>
      {description ? <p className="mt-1 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{description}</p> : null}
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-[var(--ejo-primary)]">
        Open <span className="transition-transform group-hover:translate-x-1" aria-hidden="true"><Icon name="arrow-right" size={14} /></span>
      </span>
    </LoadingLink>
  );
}

/** A grid wrapper whose children rise in one after another. */
export function RiseGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ejo-stagger grid gap-4 ${className}`}>{children}</div>;
}
