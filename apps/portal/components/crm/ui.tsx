import type { ReactNode } from 'react';
import Link from 'next/link';
import { CrmIcon, type CrmIconName } from './CrmIcon';
import { CountUp } from './CountUp';
import type { Tone } from '@/lib/crm';

/** Small building blocks shared by the Customers (CRM) pages. */

export const TONE_CHIP: Record<Tone, string> = {
  success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]',
  warning: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  error: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]',
  info: 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)]',
  muted: 'bg-[var(--ejo-text-muted)]/12 text-[var(--ejo-text-muted)]',
  brand: 'bg-[var(--ejo-primary)]/12 text-[var(--ejo-primary)]',
};

export function Chip({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TONE_CHIP[tone]} ${className ?? ''}`}>{children}</span>;
}

export function Kpi({ icon, label, value, format = 'number', hint, tone, href, delay = 0 }: { icon: CrmIconName; label: string; value: number | null; format?: 'number' | 'naira' | 'days'; hint?: ReactNode; tone?: Tone; href?: string; delay?: number }) {
  const colour = tone === 'warning' ? 'text-[var(--ejo-warning)]' : tone === 'error' ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-primary)]';
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-bg)] ${colour}`}><CrmIcon name={icon} size={16} /></span>
      </div>
      <div className="@container mt-1"><p className="break-words text-[clamp(0.875rem,12.5cqi,1.5rem)] font-bold text-[var(--ejo-text)]">
        {value === null ? '—' : format === 'days' ? <><CountUp value={value} /> <span className="text-sm font-medium text-[var(--ejo-text-muted)]">{value === 1 ? 'day' : 'days'}</span></> : <CountUp value={value} format={format === 'naira' ? 'naira' : 'number'} />}
      </p></div>
      {hint ? <p className="mt-0.5 break-words text-xs text-[var(--ejo-text-muted)]">{hint}</p> : null}
    </>
  );
  const cls = 'ejo-rise block min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none';
  return href ? <Link href={href} prefetch={false} className={`${cls} hover:border-[var(--ejo-primary)]/50`} style={{ animationDelay: `${delay}ms` }}>{body}</Link> : <div className={cls} style={{ animationDelay: `${delay}ms` }}>{body}</div>;
}

export function Section({ icon, title, subtitle, action, children, id, className }: { icon: CrmIconName; title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`ejo-rise min-w-0 scroll-mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-5 ${className ?? ''}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><CrmIcon name={icon} size={18} /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{title}</h2>
            {subtitle ? <p className="text-xs text-[var(--ejo-text-muted)]">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export type Notice = { kind: 'success' | 'warning' | 'error'; title: string; text?: ReactNode };

export function NoticeBox({ n }: { n: Notice }) {
  const tone = n.kind === 'success' ? 'var(--ejo-success)' : n.kind === 'warning' ? 'var(--ejo-warning)' : 'var(--ejo-error)';
  return (
    <div role={n.kind === 'error' ? 'alert' : 'status'} className="ejo-rise mt-4 flex items-start gap-3 rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] px-4 py-3" style={{ borderColor: `color-mix(in oklab, ${tone} 40%, transparent)` }}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: tone }} aria-hidden="true">{n.kind === 'success' ? '✓' : '!'}</span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-[var(--ejo-text)]">{n.title}</p>
        {n.text ? <p className="mt-0.5 text-[var(--ejo-text-muted)]">{n.text}</p> : null}
      </div>
    </div>
  );
}

export function Empty({ icon, title, text }: { icon: CrmIconName; title: string; text?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]"><CrmIcon name={icon} size={18} /></span>
      <p className="mt-2 text-sm font-medium text-[var(--ejo-text)]">{title}</p>
      {text ? <p className="mt-1 max-w-md text-sm text-[var(--ejo-text-muted)]">{text}</p> : null}
    </div>
  );
}
