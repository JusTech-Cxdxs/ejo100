/**
 * The integrity watch (pure parts, tested): the checks, their severities and
 * the statistics they use — modified z-scores on the median and MAD
 * (Iglewicz & Hoaglin: |M| > 3.5 is unusual), Benford's first-digit test
 * (Nigrini's MAD bands, only on 1,000 or more amounts), and the patterns
 * internal-control and dealer-warranty audits look for (the same person
 * asking and approving, refunds above what was paid, purchases split to stay
 * small, repeat warranty claims on one vehicle, gate exits with work still
 * open, password guessing, out-of-hours money).
 *
 * A flag is a reason for a person to look — never proof, never an automatic
 * decision about anyone (NDPA 2023 s.37). Alerts about a colleague are never
 * shown to that colleague, and nobody reviews an alert about themselves.
 */

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const ALERT_STATUSES = ['NEW', 'REVIEWING', 'CONFIRMED', 'DISMISSED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = { NEW: 'New', REVIEWING: 'Being looked at', CONFIRMED: 'Confirmed — action taken', DISMISSED: 'Dismissed — nothing wrong' };

export type RuleKey =
  | 'same_person_approval' | 'refund_exceeds_paid' | 'refund_after_cash' | 'refund_other_name' | 'split_purchases' | 'epr_over_estimate'
  | 'warranty_repeat_vehicle' | 'warranty_near_expiry' | 'warranty_self_created_approved' | 'gate_exit_open_work' | 'gate_exit_after_hours'
  | 'money_after_hours' | 'password_guessing' | 'activity_spike' | 'bank_details_changed' | 'admin_role_given' | 'own_vehicle_work'
  | 'benford_payments' | 'speak_up';

export type RuleInfo = { label: string; area: 'Money' | 'Parts & purchases' | 'Warranty' | 'Gate' | 'Access' | 'People' | 'Reports'; why: string };

export const RULES: Record<RuleKey, RuleInfo> = {
  same_person_approval: { label: 'Same person asked and approved', area: 'People', why: 'Segregation of duties: one person both raised and approved a request (parts slip, outside purchase, cancellation or warranty claim).' },
  refund_exceeds_paid: { label: 'Refunds above what was paid', area: 'Money', why: 'More was refunded on a job than the customer paid on it.' },
  refund_after_cash: { label: 'Refund soon after a cash payment', area: 'Money', why: 'A refund within 24 hours of a cash payment on the same job — a known pattern for taking cash out.' },
  refund_other_name: { label: 'Refund paid to a different name', area: 'Money', why: 'The refund was paid to a name that does not match the customer.' },
  split_purchases: { label: 'Purchases split into smaller ones', area: 'Parts & purchases', why: 'Several outside purchases by one person within 48 hours that together are much larger than usual — splitting keeps each one small.' },
  epr_over_estimate: { label: 'Paid out more than approved', area: 'Parts & purchases', why: 'An outside purchase was paid out above the approved total.' },
  warranty_repeat_vehicle: { label: 'Repeat warranty claims on one vehicle', area: 'Warranty', why: 'Two or more claims on the same vehicle within 90 days.' },
  warranty_near_expiry: { label: 'Claim just before the warranty ended', area: 'Warranty', why: 'The failure was dated in the last 14 days of the warranty — check the evidence.' },
  warranty_self_created_approved: { label: 'Claim approved by its author', area: 'Warranty', why: 'The person who wrote the claim also approved it.' },
  gate_exit_open_work: { label: 'Vehicle left with work still open', area: 'Gate', why: 'A vehicle went out of the gate while its Job Card or service was not closed.' },
  gate_exit_after_hours: { label: 'Vehicle left out of hours', area: 'Gate', why: 'A gate exit outside opening hours.' },
  money_after_hours: { label: 'Money recorded out of hours', area: 'Money', why: 'A payment, refund or cash payout recorded outside opening hours.' },
  password_guessing: { label: 'Many failed sign-ins', area: 'Access', why: 'Ten or more failed sign-ins on one account within a day — someone may be guessing the password.' },
  activity_spike: { label: 'Unusual amount of activity', area: 'People', why: 'Far more sensitive actions (refunds, approvals, payouts, overrides) in a day than this person usually does (modified z-score above 3.5).' },
  bank_details_changed: { label: 'Bank details changed', area: 'Money', why: 'A branch’s bank details changed — confirm it was expected before money is sent to them.' },
  admin_role_given: { label: 'Administrator access given', area: 'Access', why: 'Someone was given an administrator role.' },
  own_vehicle_work: { label: 'Colleague handled their own job', area: 'People', why: 'A colleague who is also a customer recorded money or approved work on their own Job Card or service (conflict of interest).' },
  benford_payments: { label: 'Payment amounts look unnatural', area: 'Money', why: 'The first digits of payment amounts do not follow the natural (Benford) pattern — a hint, not proof, that amounts may be made up.' },
  speak_up: { label: 'Concern raised by a colleague', area: 'Reports', why: 'A colleague raised a concern through Speak up.' },
};

export const RULE_KEYS = Object.keys(RULES) as RuleKey[];

export function asSeverity(v: unknown): Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v) ? (v as Severity) : 'LOW';
}
export function asAlertStatus(v: unknown): AlertStatus | null {
  return typeof v === 'string' && (ALERT_STATUSES as readonly string[]).includes(v) ? (v as AlertStatus) : null;
}

// ─────────────────────────────────────────────────────────── statistics

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Median absolute deviation. */
export function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Modified z-score of x against a baseline (Iglewicz & Hoaglin):
 * 0.6745·(x − median)/MAD. When MAD is 0 (a very regular baseline) the mean
 * absolute deviation stands in (×1.2533), and when that is 0 too any value
 * above the median scores high only if it is clearly above it.
 */
export function modifiedZ(x: number, baseline: number[]): number {
  if (!baseline.length) return 0;
  const m = median(baseline);
  const d = mad(baseline);
  if (d > 0) return (0.6745 * (x - m)) / d;
  const meanAbs = baseline.reduce((a, b) => a + Math.abs(b - m), 0) / baseline.length;
  if (meanAbs > 0) return (x - m) / (1.2533 * meanAbs);
  return x > m ? (x - m >= 3 ? 10 : 0) : 0;
}

export const Z_LIMIT = 3.5;

/** Daily counts for the last `days` days (oldest first), zeros included. */
export function dailySeries(dates: Date[], days: number, now = new Date()): number[] {
  const out = new Array<number>(days).fill(0);
  const end = now.getTime();
  for (const d of dates) {
    const age = Math.floor((end - d.getTime()) / 86_400_000);
    if (age >= 0 && age < days) out[days - 1 - age]! += 1;
  }
  return out;
}

/**
 * A spike: today's count against this person's own last 60 days (and, when
 * given, their role's daily counts). Only when today is at least `min` (a
 * few actions are never a spike) and the score passes Z_LIMIT.
 */
export function spike(today: number, ownHistory: number[], peers: number[] = [], min = 5): { spike: boolean; z: number; usual: number } {
  if (today < min) return { spike: false, z: 0, usual: median(ownHistory) };
  const zOwn = modifiedZ(today, ownHistory);
  const zPeers = peers.length >= 5 ? modifiedZ(today, peers) : zOwn;
  const z = Math.min(zOwn, zPeers);
  return { spike: z > Z_LIMIT, z: Math.round(z * 10) / 10, usual: median(ownHistory) };
}

// ─────────────────────────────────────────────────────────── Benford

const BENFORD = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => Math.log10(1 + 1 / d));

export function firstDigit(n: number): number | null {
  const a = Math.abs(n);
  if (!Number.isFinite(a) || a < 1) return null;
  return Number(String(Math.floor(a))[0]);
}

/**
 * First-digit Benford test. Returns the mean absolute deviation and Nigrini's
 * band (close < 0.006, acceptable < 0.012, marginal < 0.015, nonconformity
 * above). Null under 1,000 amounts — too few to say anything.
 */
export function benford(amounts: number[]): { n: number; mad: number; band: 'close' | 'acceptable' | 'marginal' | 'nonconformity'; observed: number[]; expected: number[] } | null {
  const digits = amounts.map(firstDigit).filter((d): d is number => d !== null);
  if (digits.length < 1000) return null;
  const counts = new Array<number>(9).fill(0);
  for (const d of digits) counts[d - 1]! += 1;
  const observed = counts.map((c) => c / digits.length);
  const m = observed.reduce((a, p, i) => a + Math.abs(p - BENFORD[i]!), 0) / 9;
  const band = m < 0.006 ? 'close' : m < 0.012 ? 'acceptable' : m < 0.015 ? 'marginal' : 'nonconformity';
  return { n: digits.length, mad: Math.round(m * 10000) / 10000, band, observed, expected: BENFORD };
}

// ─────────────────────────────────────────────────────────── patterns

/** Do two names plausibly name the same person? (word overlap; titles and initials ignored) */
export function sameName(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().replace(/\b(mr|mrs|ms|miss|dr|chief|alhaji|engr|prof|sir|madam|ltd|limited|plc|nig|nigeria|enterprises?|ventures?|and|&)\b/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return true; // nothing to compare: not a finding
  for (const w of x) if (y.has(w)) return true;
  return false;
}

/**
 * Split purchases: groups of a person's purchases within `windowH` hours
 * whose total is above `limit` while each one is below it. Returns each group
 * (ids and total) once.
 */
export function splitGroups(rows: { id: string; at: Date; amount: number; by: string }[], limit: number, windowH = 48, minCount = 3): { by: string; ids: string[]; total: number; from: Date; to: Date }[] {
  const out: { by: string; ids: string[]; total: number; from: Date; to: Date }[] = [];
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.by, [...(byPerson.get(r.by) ?? []), r]);
  for (const [by, list] of byPerson) {
    const s = [...list].filter((r) => r.amount > 0 && r.amount < limit).sort((a, b) => a.at.getTime() - b.at.getTime());
    let i = 0;
    while (i < s.length) {
      let j = i;
      while (j + 1 < s.length && s[j + 1]!.at.getTime() - s[i]!.at.getTime() <= windowH * 3_600_000) j += 1;
      const group = s.slice(i, j + 1);
      const total = group.reduce((a, r) => a + r.amount, 0);
      if (group.length >= minCount && total > limit) {
        out.push({ by, ids: group.map((r) => r.id), total, from: group[0]!.at, to: group[group.length - 1]!.at });
        i = j + 1;
      } else i += 1;
    }
  }
  return out;
}

/** Outside opening hours (Lagos time). `hours`: ISO weekday "1".."7" → [open, close] "HH:MM". */
export function afterHours(at: Date, hours: Partial<Record<string, [string, string]>>, holidays: string[] = []): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  if (holidays.includes(date)) return true;
  const h = hours[String(day)];
  if (!h) return true;
  const hhmm = `${get('hour').replace('24', '00')}:${get('minute')}`;
  // An hour of grace either side: closing up and early starts are normal.
  const shift = (t: string, m: number) => { const [a, b] = t.split(':').map(Number); const v = Math.max(0, Math.min(1439, a! * 60 + b! + m)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
  return hhmm < shift(h[0], -60) || hhmm > shift(h[1], 60);
}

/** Money severity: HIGH from ₦1,000,000, MEDIUM from ₦100,000 (or the given floor), else LOW. */
export function moneySeverity(amount: number, base: Severity = 'LOW'): Severity {
  const s: Severity = amount >= 1_000_000 ? 'HIGH' : amount >= 100_000 ? 'MEDIUM' : 'LOW';
  return SEVERITY_RANK[s] < SEVERITY_RANK[base] ? s : base;
}

export const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** One finding of a check — what the scan upserts as an alert. */
export type Finding = {
  rule: RuleKey; severity: Severity; title: string; evidence: Record<string, unknown>;
  entityType?: string | null; entityId?: string | null; subjectUserId?: string | null; branchId?: string | null; score?: number | null;
  /** Stable per rule and record: the scan runs again and only updates it. */
  fingerprint: string;
};
