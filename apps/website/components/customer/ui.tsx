import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './Icon';
import { TONE_BADGE, type Tone } from '@/lib/customer-portal/status';
import { fmtDate } from '@/lib/customer-portal/format';

/** Shared building blocks for the customer portal pages (server-safe). */

export function PageHero({ eyebrow, title, subtitle, icon, children }: { eyebrow?: string; title: string; subtitle?: string; icon?: IconName; children?: ReactNode }) {
  return (
    <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-6 sm:p-8">
      <div className="ejo-orb pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
      <div className="ejo-orb-slow pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex items-start gap-4">
        {icon ? (
          <span className="relative hidden h-14 w-14 shrink-0 items-center justify-center sm:flex">
            <span className="ejo-glow absolute inset-1 rounded-full bg-[var(--ejo-primary)]/25 blur-md" aria-hidden="true" />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-bg)] text-[var(--ejo-primary)] shadow-sm ring-1 ring-[var(--ejo-border)]"><Icon name={icon} size={24} /></span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-primary)]">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">{subtitle}</p> : null}
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function Card({ children, className = '', delay, as = 'section' }: { children: ReactNode; className?: string; delay?: number; as?: 'section' | 'div' | 'article' }) {
  const Tag = as;
  return (
    <Tag className={`ejo-rise rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ icon, title, action, id }: { icon: IconName; title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-[var(--ejo-text)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={icon} size={15} /></span>
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_BADGE[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="ejo-rise flex flex-col items-center rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={icon} size={22} /></span>
      <p className="mt-3 text-sm font-semibold text-[var(--ejo-text)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[var(--ejo-text-muted)]">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">
      <Icon name="arrowLeft" size={15} /> {children}
    </Link>
  );
}

/** Horizontal stepper: done steps green-ticked, the current one pulsing. */
export function Stepper({ steps, current, compact = false, cancelled = false }: { steps: readonly string[]; current: number; compact?: boolean; cancelled?: boolean }) {
  if (cancelled || current < 0) {
    return (
      <p className="flex items-center gap-2 text-xs font-medium text-[var(--ejo-error)]"><Icon name="ban" size={14} /> This visit was cancelled</p>
    );
  }
  return (
    <ol className="flex w-full items-start" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center text-center" aria-current={now ? 'step' : undefined}>
            {i > 0 ? (
              <span className="absolute right-1/2 top-[11px] h-0.5 w-full -translate-y-1/2 bg-[var(--ejo-border)]" aria-hidden="true">
                <span className={`ejo-grow-x block h-full bg-[var(--ejo-primary)] ${i <= current ? 'w-full' : 'w-0'}`} style={{ animationDelay: `${i * 90}ms` }} />
              </span>
            ) : null}
            <span className={`relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
              done ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white' : now ? 'ejo-pulse-ring border-[var(--ejo-primary)] bg-[var(--ejo-bg)] text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]'
            }`}>
              {done ? <Icon name="check" size={12} strokeWidth={3} /> : now ? <span className="h-2 w-2 rounded-full bg-[var(--ejo-primary)]" /> : null}
            </span>
            {!compact ? (
              <span className={`mt-1.5 hidden px-0.5 text-[11px] leading-tight sm:block ${now ? 'font-semibold text-[var(--ejo-text)]' : done ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-text-muted)]'}`}>{s}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export type TimelineEntry = { label: string; at: Date | null; text?: string; icon: IconName; tone?: 'done' | 'current' | 'danger' | 'upcoming' };

/** Vertical timeline built from a record's own dates. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-[var(--ejo-border)] pl-6">
      {entries.map((e, i) => {
        const tone = e.tone ?? (e.at ? 'done' : 'upcoming');
        const dot = tone === 'danger' ? 'border-[var(--ejo-error)] bg-[var(--ejo-error)] text-white'
          : tone === 'current' ? 'ejo-pulse-ring border-[var(--ejo-primary)] bg-[var(--ejo-bg)] text-[var(--ejo-primary)]'
          : tone === 'done' ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white'
          : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]';
        return (
          <li key={`${e.label}-${i}`} className="ejo-rise relative" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 ${dot}`} aria-hidden="true"><Icon name={e.icon} size={12} strokeWidth={2.4} /></span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className={`text-sm font-semibold ${tone === 'upcoming' ? 'text-[var(--ejo-text-muted)]' : 'text-[var(--ejo-text)]'}`}>{e.label}</p>
              <p className="text-xs text-[var(--ejo-text-muted)]">{e.at ? fmtDate(e.at) : tone === 'current' ? 'Now' : 'Coming up'}</p>
            </div>
            {e.text ? <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">{e.text}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--ejo-text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-[var(--ejo-text)]">{children}</dd>
    </div>
  );
}

/** A big, friendly alert row for the "needs your attention" list. */
export function AttentionCard({ icon, tone, title, text, href, cta, delay, children }: { icon: IconName; tone: Tone; title: string; text: ReactNode; href?: string; cta?: string; delay?: number; children?: ReactNode }) {
  const ring: Record<Tone, string> = {
    attention: 'bg-[var(--ejo-warning)]/15 text-[#b45309] dark:text-[var(--ejo-warning)]',
    success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]',
    danger: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]',
    info: 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)]',
    progress: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]',
    neutral: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]',
  };
  const border: Partial<Record<Tone, string>> = { attention: 'border-l-[var(--ejo-warning)]', success: 'border-l-[var(--ejo-success)]', danger: 'border-l-[var(--ejo-error)]', info: 'border-l-[var(--ejo-info)]' };
  const body = (
    <div className="flex gap-3.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ring[tone]}`}><Icon name={icon} size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ejo-text)]">{title}</p>
        <div className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">{text}</div>
        {children}
        {href && cta ? <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--ejo-primary)]">{cta} <Icon name="arrowRight" size={14} /></p> : null}
      </div>
    </div>
  );
  const cls = `ejo-rise ejo-lift block rounded-[var(--ejo-radius-lg)] border border-l-4 border-[var(--ejo-border)] ${border[tone] ?? 'border-l-[var(--ejo-primary)]'} bg-[var(--ejo-bg)] p-4`;
  return href ? (
    <Link href={href} className={cls} style={delay ? { animationDelay: `${delay}ms` } : undefined}>{body}</Link>
  ) : (
    <div className={cls} style={delay ? { animationDelay: `${delay}ms` } : undefined}>{body}</div>
  );
}

export function Notice({ tone, icon, children }: { tone: 'info' | 'attention' | 'success' | 'danger'; icon: IconName; children: ReactNode }) {
  const cls = {
    info: 'border-[var(--ejo-info)]/25 bg-[var(--ejo-info)]/[0.06]',
    attention: 'border-[var(--ejo-warning)]/35 bg-[var(--ejo-warning)]/[0.08]',
    success: 'border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/[0.07]',
    danger: 'border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/[0.06]',
  }[tone];
  const ic = { info: 'text-[var(--ejo-info)]', attention: 'text-[#b45309] dark:text-[var(--ejo-warning)]', success: 'text-[var(--ejo-success)]', danger: 'text-[var(--ejo-error)]' }[tone];
  return (
    <div className={`flex gap-3 rounded-[var(--ejo-radius-md)] border p-3.5 text-sm text-[var(--ejo-text)] ${cls}`}>
      <span className={`mt-0.5 shrink-0 ${ic}`}><Icon name={icon} size={17} /></span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}
