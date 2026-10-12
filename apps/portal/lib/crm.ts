/**
 * Customers (CRM) — pure rules shared by the server actions, the pages and
 * the tests. No database, no framework imports (relative imports only).
 *
 *  • Registration: a primary address (one short line, ≤ 80 characters — it is
 *    printed on Job Cards) and a primary phone are required from v28 on.
 *    Older customers without them still work everywhere; the CRM flags them
 *    as "profile gaps".
 *  • Money: what the CUSTOMER paid or owes — never warranty / goodwill /
 *    internal lines. Paid = payments − refunds. Owed = customer-billed lines
 *    of finished, not-cancelled jobs − what was paid on those jobs.
 *  • Audit: every change is recorded as { field: { from, to } } — never a
 *    password or a token.
 */

export const PRIMARY_ADDRESS_MAX = 80;
export const TAG_MAX_LENGTH = 30;
export const TAGS_MAX = 12;

export class CrmInputError extends Error {}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Nigerian-friendly phone check: digits, spaces and an optional leading +,
 * 7–20 characters, at least 7 digits. Returns the tidied number (or null when
 * optional and empty); throws a plain message otherwise. */
export function cleanPhone(raw: string | null | undefined, opts: { required: boolean; label?: string } = { required: true }): string | null {
  const label = opts.label ?? 'Phone number';
  const v = squash(String(raw ?? ''));
  if (!v) {
    if (opts.required) throw new CrmInputError(`${label} is required.`);
    return null;
  }
  if (!/^\+?[0-9 ]+$/.test(v)) throw new CrmInputError(`${label} can only contain digits, spaces and a leading + (e.g. 0803 123 4567 or +234 803 123 4567).`);
  if (v.length < 7 || v.length > 20) throw new CrmInputError(`${label} must be between 7 and 20 characters.`);
  if (v.replace(/\D/g, '').length < 7) throw new CrmInputError(`${label} needs at least 7 digits.`);
  return v;
}

/** The primary address: one short line, required, ≤ 80 characters. */
export function cleanPrimaryAddress(raw: string | null | undefined): string {
  const v = squash(String(raw ?? ''));
  if (!v) throw new CrmInputError('Primary address is required — e.g. "Plot 3, Cheesebrough, Lagos".');
  if (v.length > PRIMARY_ADDRESS_MAX) throw new CrmInputError(`Primary address must be ${PRIMARY_ADDRESS_MAX} characters or fewer — keep it brief, e.g. "Plot 3, Cheesebrough, Lagos".`);
  return v;
}

export function cleanEmail(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) throw new CrmInputError('Email is required.');
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new CrmInputError('Enter a valid email address, e.g. name@example.com.');
  return v;
}

export function cleanName(raw: string | null | undefined, label = 'Name'): string {
  const v = squash(String(raw ?? ''));
  if (!v) throw new CrmInputError(`${label} is required.`);
  if (v.length > 120) throw new CrmInputError(`${label} must be 120 characters or fewer.`);
  return v;
}

/** Optional free text, tidied and capped (null when empty). */
export function cleanOptional(raw: string | null | undefined, max: number, label: string): string | null {
  const v = squash(String(raw ?? ''));
  if (!v) return null;
  if (v.length > max) throw new CrmInputError(`${label} must be ${max} characters or fewer.`);
  return v;
}

/** Tags from "Fleet, VIP" or a list: trimmed, de-duplicated (case-insensitive,
 * first spelling kept), each ≤ 30 characters, at most 12. */
export function normaliseTags(input: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(input) ? input : String(input ?? '').split(',')).map((t) => squash(String(t))).filter(Boolean);
  const out: string[] = [];
  for (const t of parts) {
    if (t.length > TAG_MAX_LENGTH) throw new CrmInputError(`A tag can be at most ${TAG_MAX_LENGTH} characters ("${t.slice(0, 12)}…").`);
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > TAGS_MAX) throw new CrmInputError(`At most ${TAGS_MAX} tags per customer.`);
  return out;
}

/** Never written to the audit trail, whatever a caller passes. */
const SECRET_FIELD = /password|token|secret|hash/i;

export type FieldChange = { from: unknown; to: unknown };

/** The fields that changed, as { field: { from, to } } (arrays compared by value). */
export function diffChanges<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields?: (keyof T)[]): Record<string, FieldChange> {
  const keys = (fields ?? (Object.keys(after) as (keyof T)[])).filter((k) => !SECRET_FIELD.test(String(k)));
  const out: Record<string, FieldChange> = {};
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[String(k)] = { from: a, to: b };
  }
  return out;
}

export const FIELD_LABEL: Record<string, string> = {
  fullName: 'Name', customerType: 'Type', email: 'Email', phone: 'Phone', altPhone: 'Second phone', address: 'Primary address',
  tags: 'Tags', isActive: 'Portal access', notifyByEmail: 'Email updates', companyName: 'Company name', taxId: 'Tax ID',
  label: 'Label', line1: 'Address', line2: 'Address line 2', city: 'City', state: 'State', country: 'Country', name: 'Name', role: 'Role',
};

function showValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'empty';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (typeof v === 'boolean') return field === 'isActive' ? (v ? 'on' : 'off') : v ? 'yes' : 'no';
  if (field === 'customerType') return v === 'ORGANIZATION' ? 'Organisation' : 'Individual';
  return String(v);
}

/** "Phone: 0803… → 0805…" lines for the activity feed. */
export function describeChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== 'object') return [];
  return Object.entries(changes as Record<string, FieldChange>).filter(([k]) => !SECRET_FIELD.test(k)).map(([k, c]) => `${FIELD_LABEL[k] ?? k}: ${showValue(k, c?.from)} → ${showValue(k, c?.to)}`);
}

/** Plain-English names for customer audit actions (staff and the customer's own). */
export const CUSTOMER_ACTION_LABEL: Record<string, string> = {
  'customer.created': 'Customer registered',
  'customer.updated': 'Details updated',
  'customer.switched_off': 'Portal access switched off',
  'customer.switched_on': 'Portal access switched on',
  'customer.welcome_sent': 'Welcome email sent (set-password link)',
  'customer.welcome_failed': 'Welcome email could not be sent',
  'customer.set_password_link_sent': 'Set-password link emailed',
  'customer.set_password_link_failed': 'Set-password link could not be emailed',
  'customer.note_added': 'Note added',
  'customer.note_pinned': 'Note pinned',
  'customer.note_unpinned': 'Note unpinned',
  'customer.note_deleted': 'Note deleted',
  'customer.contact_added': 'Contact person added',
  'customer.contact_updated': 'Contact person updated',
  'customer.contact_removed': 'Contact person removed',
  'customer.address_added': 'Address added',
  'customer.address_updated': 'Address updated',
  'customer.address_removed': 'Address removed',
  'customer.signed_in': 'Signed in to the customer portal',
  'customer.profile_updated': 'Updated their own profile',
  'customer.password_changed': 'Changed their password',
  'customer.password_reset_requested': 'Asked for a password reset link',
  'customer.password_reset': 'Set a new password',
  'customer.preferences_updated': 'Changed their notification preferences',
};

export function customerActionLabel(action: string): string {
  if (CUSTOMER_ACTION_LABEL[action]) return CUSTOMER_ACTION_LABEL[action]!;
  const tail = action.split('.').pop() ?? action;
  const words = tail.replace(/[_.-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
}

/** What is missing from an older customer's profile (registration now requires both). */
export function profileGaps(c: { address: string | null; phone: string | null }): string[] {
  const gaps: string[] = [];
  if (!c.address?.trim()) gaps.push('primary address');
  if (!c.phone?.trim()) gaps.push('phone');
  return gaps;
}

// ── Money ──────────────────────────────────────────────────────────────

export type CrmJob = {
  kind: 'JC' | 'SV';
  id: string;
  /** When the work was received (JC opened / service checked in); null = only booked. */
  receivedAt: Date | null;
  finishedAt: Date | null;
  cancelled: boolean;
  /** Customer-billed lines only (CUSTOMER / no bill-to). */
  customerBilled: number;
  payments: { at: Date; amount: number }[];
  refunds: { at: Date; amount: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const total = (xs: { amount: number }[]) => xs.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0);
const DAY = 86400000;

/** The Lagos (UTC+1) calendar month of a moment, "YYYY-MM". */
export function lagosMonthKey(d: Date): string {
  return new Date(new Date(d).getTime() + 3600000).toISOString().slice(0, 7);
}

/** Midnight Lagos time on the 1st of January of the year containing `now`. */
export function lagosYearStart(now: Date): Date {
  const y = lagosMonthKey(now).slice(0, 4);
  return new Date(`${y}-01-01T00:00:00+01:00`);
}

/** Midnight Lagos time on the 1st of the month containing `now`. */
export function lagosMonthStart(now: Date): Date {
  return new Date(`${lagosMonthKey(now)}-01T00:00:00+01:00`);
}

export function customerMoney(jobs: CrmJob[], now: Date = new Date()) {
  const payments = jobs.flatMap((j) => j.payments);
  const refunds = jobs.flatMap((j) => j.refunds);
  const paidIn = r2(total(payments));
  const refunded = r2(total(refunds));
  const finished = jobs.filter((j) => !j.cancelled && j.finishedAt);
  const billed = r2(finished.reduce((s, j) => s + j.customerBilled, 0));
  // Owed per finished job (an over-payment on one job never hides a debt on another).
  const outstanding = r2(finished.reduce((s, j) => s + Math.max(0, j.customerBilled - (total(j.payments) - total(j.refunds))), 0));
  const visitsList = jobs.filter((j) => j.receivedAt);
  const turnarounds = finished.filter((j) => j.receivedAt && j.finishedAt && +j.finishedAt >= +j.receivedAt).map((j) => (+j.finishedAt! - +j.receivedAt!) / DAY);
  const yearStart = lagosYearStart(now);
  const inYear = (x: { at: Date }) => +x.at >= +yearStart && +x.at <= +now;
  const lastVisit = visitsList.reduce<Date | null>((m, j) => (!m || +j.receivedAt! > +m ? j.receivedAt : m), null);
  return {
    paidIn,
    refunded,
    netPaid: r2(paidIn - refunded),
    billed,
    outstanding,
    visits: visitsList.length,
    finishedJobs: finished.length,
    averageJob: finished.length ? r2(billed / finished.length) : null,
    averageTurnaroundDays: turnarounds.length ? Math.round((turnarounds.reduce((s, x) => s + x, 0) / turnarounds.length) * 10) / 10 : null,
    netPaidThisYear: r2(total(payments.filter(inYear)) - total(refunds.filter(inYear))),
    lastVisit,
  };
}

export type SpendMonth = { key: string; label: string; paid: number; refunds: number; net: number; billed: number };

/** The last `months` Lagos calendar months (oldest first): money paid and
 * refunded in each month, and customer-billed work finished in it. */
export function monthlySpend(jobs: CrmJob[], now: Date = new Date(), months = 12): SpendMonth[] {
  const nowL = new Date(now.getTime() + 3600000);
  const out: SpendMonth[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(nowL.getUTCFullYear(), nowL.getUTCMonth() - i, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit', timeZone: 'UTC' }), paid: 0, refunds: 0, net: 0, billed: 0 });
  }
  const at = new Map(out.map((m) => [m.key, m]));
  for (const j of jobs) {
    for (const p of j.payments) { const m = at.get(lagosMonthKey(p.at)); if (m) m.paid += p.amount; }
    for (const r of j.refunds) { const m = at.get(lagosMonthKey(r.at)); if (m) m.refunds += r.amount; }
    if (!j.cancelled && j.finishedAt) { const m = at.get(lagosMonthKey(j.finishedAt)); if (m) m.billed += j.customerBilled; }
  }
  for (const m of out) { m.paid = r2(m.paid); m.refunds = r2(m.refunds); m.billed = r2(m.billed); m.net = r2(m.paid - m.refunds); }
  return out;
}

/** ₦12,345 (no kobo unless there are some). */
export function naira(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const hasKobo = Math.round(n * 100) % 100 !== 0;
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: hasKobo ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** ₦1.2m / ₦350k for tight tiles and chart axes. */
export function nairaShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `₦${(n / 1e9).toFixed(1).replace(/\.0$/, '')}bn`;
  if (a >= 1e6) return `₦${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`;
  if (a >= 1e3) return `₦${(n / 1e3).toFixed(0)}k`;
  return `₦${Math.round(n)}`;
}

// ── Hub filters ────────────────────────────────────────────────────────

export const CRM_SORTS = ['recent', 'name', 'spend', 'last_visit'] as const;
export type CrmSort = (typeof CRM_SORTS)[number];

export type CrmRow = {
  id: string; fullName: string; customerType: string; tags: string[]; isActive: boolean; createdAt: Date;
  address: string | null; phone: string | null; hasPortalAccount: boolean; lastLoginAt: Date | null;
  vehicles: number; openJobs: number; netPaid: number; lastVisit: Date | null;
};

export type CrmFilter = { type?: string; tag?: string; status?: string; open?: string; portal?: string; gaps?: string };

/** The list filters (search is applied separately, in the database). */
export function applyCrmFilters<T extends CrmRow>(rows: T[], f: CrmFilter): T[] {
  return rows.filter((r) => {
    if (f.type === 'INDIVIDUAL' || f.type === 'ORGANIZATION') { if (r.customerType !== f.type) return false; }
    if (f.tag && !r.tags.some((t) => t.toLowerCase() === f.tag!.toLowerCase())) return false;
    if (f.status === 'active' && !r.isActive) return false;
    if (f.status === 'off' && r.isActive) return false;
    if (f.open === 'yes' && r.openJobs === 0) return false;
    if (f.open === 'no' && r.openJobs > 0) return false;
    if (f.portal === 'signed_in' && !r.lastLoginAt) return false;
    if (f.portal === 'never' && (r.lastLoginAt || !r.isActive)) return false;
    if (f.portal === 'off' && r.isActive) return false;
    if (f.gaps === 'yes' && profileGaps(r).length === 0) return false;
    return true;
  });
}

export function sortCrmRows<T extends CrmRow>(rows: T[], sort: string | undefined): T[] {
  const s = (CRM_SORTS as readonly string[]).includes(sort ?? '') ? (sort as CrmSort) : 'recent';
  const copy = [...rows];
  if (s === 'name') copy.sort((a, b) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }));
  else if (s === 'spend') copy.sort((a, b) => b.netPaid - a.netPaid || a.fullName.localeCompare(b.fullName));
  else if (s === 'last_visit') copy.sort((a, b) => (+(b.lastVisit ?? 0)) - (+(a.lastVisit ?? 0)) || a.fullName.localeCompare(b.fullName));
  else copy.sort((a, b) => +b.createdAt - +a.createdAt);
  return copy;
}

export const CRM_PAGE_SIZE = 24;

export function paginate<T>(rows: T[], page: number | string | undefined, size = CRM_PAGE_SIZE): { items: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
  return { items: rows.slice((p - 1) * size, p * size), page: p, pages, total: rows.length };
}

// ── Status chips ───────────────────────────────────────────────────────

export const JOB_STATUS_LABEL: Record<'JC' | 'SV', Record<string, string>> = {
  JC: {
    CHECKED_IN: 'Checked in', AWAITING_CUSTOMER_APPROVAL: 'Awaiting approval', IN_PROGRESS: 'In progress', AWAITING_PARTS: 'Awaiting parts',
    QUALITY_CHECK: 'Quality check', COMPLETED: 'Completed', READY_FOR_COLLECTION: 'Ready for collection', CLOSED: 'Closed', CHECKED_OUT: 'Checked out', CANCELLED: 'Cancelled',
  },
  SV: {
    SCHEDULED: 'Booked', CHECKED_IN: 'Checked in', IN_SERVICE: 'In service', COMPLETED: 'Completed', READY_FOR_COLLECTION: 'Ready for collection',
    CLOSED: 'Closed', COLLECTED: 'Checked out', CANCELLED: 'Cancelled', ESCALATED: 'Moved to a Job Card',
  },
};

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'muted' | 'brand';

/** Done = green, needs the customer / waiting = amber, cancelled = red, in the workshop = brand. */
export function jobTone(kind: 'JC' | 'SV', status: string): Tone {
  if (status === 'CANCELLED') return 'error';
  if (['CHECKED_OUT', 'COLLECTED', 'CLOSED'].includes(status)) return 'muted';
  if (['COMPLETED', 'READY_FOR_COLLECTION'].includes(status)) return 'success';
  if (['AWAITING_CUSTOMER_APPROVAL', 'AWAITING_PARTS'].includes(status)) return 'warning';
  if (status === 'SCHEDULED' || status === 'ESCALATED') return 'info';
  return kind === 'JC' || kind === 'SV' ? 'brand' : 'muted';
}

/** Open = in the workshop now (not a booking, not finished, not cancelled). */
export function isOpenJob(kind: 'JC' | 'SV', status: string): boolean {
  return kind === 'JC' ? !['CLOSED', 'CHECKED_OUT', 'CANCELLED'].includes(status) : !['SCHEDULED', 'CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'].includes(status);
}

export const WARRANTY_STATUS_LABEL: Record<string, string> = { PENDING_VERIFICATION: 'Awaiting verification', ACTIVE: 'Active', SUSPENDED: 'Suspended', VOID: 'Void', TRANSFERRED: 'Transferred' };
