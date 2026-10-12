/**
 * Money, dates and small calculations for the customer portal. Pure — no
 * database — so the same rules apply on every page.
 */
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-payment-constants';

export function naira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** Compact money for charts and tiles: ₦1.2m, ₦85k. */
export function nairaShort(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000) return `₦${(value / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}m`;
  if (v >= 1_000) return `₦${Math.round(value / 1_000)}k`;
  return `₦${Math.round(value)}`;
}

export const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n: number): number => Math.round(n * 100) / 100;

const TZ = 'Africa/Lagos';
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}
export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function timeAgo(d: Date, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtDate(d);
}

export const DAY_MS = 86_400_000;
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}
/** The calendar date `n` working days (Mon–Fri) after `from` — the same rule
 * as the staff portal's lib/utils/working-days.ts. */
export function addWorkingDays(from: Date, n: number): Date {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let added = 0;
  while (added < n) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) added += 1;
  }
  return cursor;
}

/** Mirrors apps/portal/lib/workshop-constants.ts — keep in step. */
export const APPROVAL_DEADLINE_WORKING_DAYS = 5;
export const READY_FOR_COLLECTION_GRACE_WORKING_DAYS = 7;
/** After this many days waiting at the workshop, a ready vehicle shows a
 * gentle reminder about collection and possible storage charges. */
export const COLLECTION_FRIENDLY_NOTICE_DAYS = 3;

export type Money = {
  /** null until the customer has been sent an estimate. */
  estimateTotal: number | null;
  paid: number;
  refunded: number;
  netPaid: number;
  /** What is still owed (never negative); null with no estimate. */
  balance: number | null;
  minDeposit: number | null;
  /** How much more is needed to reach the minimum deposit. */
  depositDue: number | null;
};

/**
 * One job's money picture. `lines` must already be only what the CUSTOMER
 * pays (billTo CUSTOMER on Job Cards) and only from an estimate the
 * customer has been notified of — the callers enforce both.
 */
export function moneyFor(o: { notified: boolean; lines: { amount: unknown }[]; payments: { amount: unknown }[]; refunds: { amount: unknown }[] }): Money {
  const paid = round2(o.payments.reduce((s, p) => s + num(p.amount), 0));
  const refunded = round2(o.refunds.reduce((s, r) => s + num(r.amount), 0));
  const netPaid = round2(paid - refunded);
  if (!o.notified) return { estimateTotal: null, paid, refunded, netPaid, balance: null, minDeposit: null, depositDue: null };
  const total = round2(o.lines.reduce((s, l) => s + num(l.amount), 0));
  const minDeposit = round2(total * MINIMUM_DEPOSIT_FRACTION);
  return {
    estimateTotal: total,
    paid,
    refunded,
    netPaid,
    balance: Math.max(0, round2(total - netPaid)),
    minDeposit,
    depositDue: Math.max(0, round2(minDeposit - netPaid)),
  };
}

export function vehicleLabel(v: { make: string | null; model: string | null; year?: number | null }): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Your vehicle';
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '•';
}
