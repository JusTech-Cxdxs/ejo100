import type { ReactNode } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon } from './Icon';

/**
 * Chart colours, one rule everywhere: the brand green for the main series,
 * a lighter green or slate for a second one, and red / amber only where they
 * mean something (losses, overdue, warnings).
 */
export const CHART = {
  primary: 'var(--ejo-primary)',
  primarySoft: '#86efac',
  primaryPale: '#dcfce7',
  neutral: '#94a3b8',
  neutralSoft: '#cbd5e1',
  warning: 'var(--ejo-warning)',
  error: 'var(--ejo-error)',
} as const;

const PRIORITY: Record<number, { chip: string; icon: 'alert' | 'clock' | 'info'; bar: string }> = {
  1: { chip: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)] ring-[var(--ejo-error)]/25', icon: 'alert', bar: 'before:bg-[var(--ejo-error)]' },
  2: { chip: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)] ring-[var(--ejo-warning)]/30', icon: 'clock', bar: 'before:bg-[var(--ejo-warning)]' },
  3: { chip: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-[var(--ejo-primary)]/20', icon: 'info', bar: 'before:bg-[var(--ejo-primary)]' },
};

export type PriorityItem = { priority: number; title: string; detail?: string; href: string; items?: { href: string; label: string }[] };

/** "What to do now" — the prescriptive list on every analytics page. */
export function PriorityActions({ actions, title = 'What to do now', note = 'prescriptive' }: { actions: PriorityItem[]; title?: ReactNode; note?: ReactNode }) {
  if (!actions.length) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="bolt" size={15} /></span>
        {title} {note ? <span className="font-normal text-[var(--ejo-text-muted)]">· {note}</span> : null}
      </h2>
      <div className="ejo-stagger space-y-2">
        {actions.map((x, i) => {
          const p = PRIORITY[x.priority] ?? PRIORITY[3]!;
          return (
            <div key={i} className={`relative flex items-start gap-3 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-1 ${p.bar}`}>
              <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${p.chip}`}><Icon name={p.icon} size={12} strokeWidth={2.2} />P{x.priority}</span>
              <div className="min-w-0 flex-1">
                <LoadingLink href={x.href} className="block text-sm font-medium text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">{x.title}</LoadingLink>
                {x.detail ? <span className="block text-xs text-[var(--ejo-text-muted)]">{x.detail}</span> : null}
                {x.items?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {x.items.map((it) => <LoadingLink key={it.href + it.label} href={it.href} className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-0.5 text-[11px] text-[var(--ejo-primary)] transition-colors hover:border-[var(--ejo-primary)]/50">{it.label} →</LoadingLink>)}
                  </div>
                ) : null}
              </div>
              {x.items && x.items.length > 1 ? <LoadingLink href={x.href} className="hidden shrink-0 text-xs font-medium text-[var(--ejo-primary)] hover:underline sm:inline">Open the list →</LoadingLink> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** One labelled horizontal bar (rankings, mixes). Green by default. */
export function BarRow({ label, value, max, note, colour = CHART.primary, labelWidth = '9rem' }: { label: ReactNode; value: number; max: number; note?: ReactNode; colour?: string; labelWidth?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: `minmax(0,${labelWidth}) 1fr auto` }}>
      <span className="truncate text-[var(--ejo-text)]" title={typeof label === 'string' ? label : undefined}>{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--ejo-bg)] ring-1 ring-inset ring-[var(--ejo-border)]">
        <div className="ejo-grow h-full rounded-full" style={{ width: `${w}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${colour} 70%, transparent), ${colour})` }} />
      </div>
      {note !== undefined ? <span className="whitespace-nowrap tabular-nums text-[var(--ejo-text-muted)]">{note}</span> : null}
    </div>
  );
}

/** A small "label · value" row for breakdown lists. */
export function DataRow({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${strong ? 'border-t border-[var(--ejo-border)] pt-1.5 font-medium' : ''}`}>
      <dt className={strong ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-text-muted)]'}>{label}</dt>
      <dd className="text-right tabular-nums text-[var(--ejo-text)]">{value}</dd>
    </div>
  );
}

/** Period pills (Today, This month…) — the active one green. */
export function PeriodPills({ periods, active, hrefFor }: { periods: [string, string][]; active: string; hrefFor: (key: string) => string }) {
  return (
    <>
      {periods.map(([k, l]) => (
        <LoadingLink key={k} href={hrefFor(k)} aria-current={active === k ? 'true' : undefined} className={`ejo-press rounded-full px-3 py-1 text-xs font-medium transition-colors ${active === k ? 'bg-[var(--ejo-primary)] text-white shadow-sm shadow-[var(--ejo-primary)]/25' : 'border border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50'}`}>{l}</LoadingLink>
      ))}
    </>
  );
}
