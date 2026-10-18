import type { ReactNode } from 'react';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

/** Shared form and detail-page primitives for the Warehouse and Procurement pages (server components). */

export const INPUT = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
export const LABEL = 'block text-xs font-medium text-[var(--ejo-text-muted)]';
export const BTN = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
export const BTN_LINE = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
export const BTN_DANGER = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5';
export const CARD = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6';
export const LINK = 'text-[var(--ejo-primary)] hover:underline';
export const TH = 'px-4 py-2 text-left text-xs font-medium text-[var(--ejo-text-muted)]';
export const TD = 'px-4 py-2 text-sm text-[var(--ejo-text)]';
export const TD_MUTED = 'px-4 py-2 text-sm text-[var(--ejo-text-muted)]';
export const TABLE_WRAP = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';

/** The ?status= / ?error= outcome banners every page shows after a form. */
export function Banners({ status, error, map, className = 'mb-6 max-w-2xl' }: { status?: string; error?: string; map: Record<string, string>; className?: string }) {
  if (!status && !error) return null;
  return (
    <div className={`${className} space-y-2`}>
      {status && map[status] ? <FormFeedbackBanner kind="success" message={map[status]!} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
      <div className="text-sm text-[var(--ejo-text)]">{children ?? '—'}</div>
    </div>
  );
}

/** The step strip on record pages: who did what, when. */
export function Steps({ steps }: { steps: { label: string; done: boolean; who?: string | null; at?: Date | null; hint?: string }[] }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${s.done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
          <p className="font-medium text-[var(--ejo-text)]">{s.done ? '✓' : `${i + 1}.`} {s.label}</p>
          {s.done && s.who ? <p className="text-[var(--ejo-text-muted)]">{s.who}</p> : null}
          {s.done && s.at ? <p className="text-[var(--ejo-text-muted)]">{formatDateOnly(s.at)}</p> : null}
          {!s.done && s.hint ? <p className="text-[var(--ejo-text-muted)]">{s.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export const when = (d: Date | string | null | undefined): string => (d ? formatDateTime(new Date(d)) : '—');
export const day = (d: Date | string | null | undefined): string => (d ? formatDateOnly(new Date(d)) : '—');

/** An amount in the record's own currency (naira through formatCurrency elsewhere). */
export function amount(value: unknown, currency = 'NGN'): string {
  const n = Number(value ?? 0);
  if (currency === 'NGN') return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${currency} ${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const humanise = (s: string): string => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Today as the value of a <input type="date"> in Lagos. */
export const todayValue = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
