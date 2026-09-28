/**
 * Is a warranty covering right now — and if not, exactly why? One rule for
 * every page, print and coverage check. Expiry is COMPUTED (dates and
 * distance), never stored, so it can never be stale or wrong.
 */
export type WarrantyCoverageState = 'COVERED' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'VOID' | 'TRANSFERRED';

export type WarrantyCoverage = {
  state: WarrantyCoverageState;
  /** Plain-language reason — always shown, never a black box. */
  reason: string;
  daysLeft: number | null;
  distanceLeft: number | null;
};

/** "Expiring soon" window. */
export const WARRANTY_EXPIRING_SOON_DAYS = 30;

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 Jan + 1 month → last day of Feb, never 3 March.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}

export function warrantyCoverage(
  w: { status: string; startsAt: Date; endsAt: Date; startReading: number | null; distanceLimit: number | null; statusReason?: string | null },
  currentReading: number | null = null,
  now: Date = new Date(),
): WarrantyCoverage {
  if (w.status === 'PENDING_VERIFICATION') return { state: 'PENDING_VERIFICATION', reason: 'Registered — waiting for a second person to verify it before it covers anything.', daysLeft: null, distanceLeft: null };
  if (w.status === 'SUSPENDED') return { state: 'SUSPENDED', reason: `Suspended${w.statusReason ? ` — ${w.statusReason}` : ''}.`, daysLeft: null, distanceLeft: null };
  if (w.status === 'VOID') return { state: 'VOID', reason: `Void${w.statusReason ? ` — ${w.statusReason}` : ''}.`, daysLeft: null, distanceLeft: null };
  if (w.status === 'TRANSFERRED') return { state: 'TRANSFERRED', reason: `Transferred${w.statusReason ? ` — ${w.statusReason}` : ''}.`, daysLeft: null, distanceLeft: null };

  const endsAt = new Date(w.endsAt);
  const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / 86400000);
  const distanceEnd = w.startReading !== null && w.distanceLimit !== null ? w.startReading + w.distanceLimit : null;
  const distanceLeft = distanceEnd !== null && currentReading !== null ? distanceEnd - currentReading : null;

  if (daysLeft <= 0) return { state: 'EXPIRED', reason: `Expired on ${fmt(endsAt)} (time limit reached).`, daysLeft, distanceLeft };
  if (distanceLeft !== null && distanceLeft <= 0) {
    return { state: 'EXPIRED', reason: `Expired — distance limit reached (${distanceEnd!.toLocaleString('en-NG')} km; now ${currentReading!.toLocaleString('en-NG')} km).`, daysLeft, distanceLeft };
  }
  const until = `Covered until ${fmt(endsAt)}${distanceEnd !== null ? ` or ${distanceEnd.toLocaleString('en-NG')} km, whichever comes first` : ''}.`;
  if (daysLeft <= WARRANTY_EXPIRING_SOON_DAYS) return { state: 'EXPIRING_SOON', reason: `Expiring soon — ${until}`, daysLeft, distanceLeft };
  return { state: 'COVERED', reason: until, daysLeft, distanceLeft };
}

export const WARRANTY_STATE_LABEL: Record<WarrantyCoverageState, string> = {
  COVERED: 'Covered',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: 'Expired',
  PENDING_VERIFICATION: 'Pending verification',
  SUSPENDED: 'Suspended',
  VOID: 'Void',
  TRANSFERRED: 'Transferred',
};

export const WARRANTY_STATE_CLASS: Record<WarrantyCoverageState, string> = {
  COVERED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  EXPIRING_SOON: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  EXPIRED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  PENDING_VERIFICATION: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  SUSPENDED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  VOID: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
  TRANSFERRED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};

/** Policy lists (covered / not covered / conditions) are stored one item
 * per line; older free-text entries simply show as a single item. */
export function splitLines(text: string | null | undefined): string[] {
  return (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

// ── Duration: days, working days or months ───────────────────────────

export type DurationUnit = 'DAYS' | 'WORKING_DAYS' | 'MONTHS';

/** Allowed amounts per unit (validation and form hints). */
export const DURATION_LIMITS: Record<DurationUnit, { min: number; max: number; label: string }> = {
  DAYS: { min: 1, max: 3650, label: 'days' },
  WORKING_DAYS: { min: 1, max: 2600, label: 'working days' },
  MONTHS: { min: 1, max: 240, label: 'months' },
};

/**
 * When cover ends. Months: same date N months on (month-end safe). Days:
 * N × 24 hours on. Working days: the END of the Nth working day after the
 * start (Mon–Fri, Lagos) — so "5 working days" includes all of day 5.
 */
export function warrantyEndDate(start: Date, amount: number, unit: DurationUnit | string | null | undefined): Date {
  if (unit === 'DAYS') return new Date(new Date(start).getTime() + amount * 86400000);
  if (unit === 'WORKING_DAYS') {
    const d = new Date(new Date(start).getTime());
    let added = 0;
    const lagosDay = (x: Date) => new Date(x.getTime() + 3600000).getUTCDay();
    while (added < amount) {
      d.setUTCDate(d.getUTCDate() + 1);
      const wd = lagosDay(d);
      if (wd !== 0 && wd !== 6) added += 1;
    }
    // 23:59:59.999 Lagos (UTC+1) on that working day.
    const lagos = new Date(d.getTime() + 3600000);
    return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate(), 22, 59, 59, 999));
  }
  return addMonths(start, amount);
}

/** "12 months", "1 month", "7 days", "5 working days". */
export function durationLabel(p: { durationMonths: number; durationUnit?: DurationUnit | string | null }): string {
  const n = p.durationMonths;
  const unit = p.durationUnit ?? 'MONTHS';
  const word = unit === 'DAYS' ? 'day' : unit === 'WORKING_DAYS' ? 'working day' : 'month';
  return `${n.toLocaleString('en-NG')} ${n === 1 ? word : `${word}s`}`;
}

/** Compact form for badges: "12 mo", "7 days", "5 working days". */
export function durationShort(p: { durationMonths: number; durationUnit?: DurationUnit | string | null }): string {
  return (p.durationUnit ?? 'MONTHS') === 'MONTHS' ? `${p.durationMonths} mo` : durationLabel(p);
}
