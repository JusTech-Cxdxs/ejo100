/**
 * Enyo on the website — the pure rules (no database, no framework), so the
 * unit tests run them directly (apps/website/tests). Relative imports only.
 *
 *  - ownership: a customer only ever finds their own Job Cards and Vehicle
 *    Services; another customer's number reads exactly like "not found";
 *  - message size, rate limits and the visitor cookie;
 *  - support ticket numbers SUP-<Lagos year>-<6 digits>;
 *  - the hand-over contact check;
 *  - which links a chat answer may carry.
 */

/** Longest message a customer or visitor may send. */
export const MESSAGE_MAX = 2000;

/** The words used whenever a number is not one of the customer's own — the same for "does not exist" and "someone else's". */
export const NOT_FOUND_MESSAGE = 'No Job Card or service with that number was found on this customer\'s account. Ask them to check the number, or offer to list their jobs.';

// ── References and ownership ────────────────────────────────────────────

/**
 * "jc 2026 412", "JC-2026-000412", " sv-2026-12 " → "JC-2026-000412" / "SV-2026-000012".
 * Anything that is not a Job Card or Vehicle Service number → null.
 */
export function normaliseJobNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase().replace(/[\s_./]+/g, '-').replace(/-+/g, '-');
  const m = /^(JC|SV)-?(\d{4})-?(\d{1,6})$/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]!.padStart(6, '0')}`;
}

/**
 * The customer's own record with that number, or null. `items` must already
 * be the signed-in customer's own list (loaded by their id); this never
 * looks anywhere else, so a number that belongs to someone else is simply
 * not in the list and is reported exactly like a number that does not exist.
 */
export function findOwnJob<T extends { number: string }>(items: readonly T[], raw: unknown): T | null {
  const wanted = normaliseJobNumber(raw);
  if (!wanted) return null;
  return items.find((i) => i.number.toUpperCase() === wanted) ?? null;
}

/** What happens next on a job, in the customer's words. */
export function nextStepFor(i: { kind: 'jc' | 'vs'; status: string; awaitingApproval: boolean; waitingForCollection: boolean; balance: number | null; estimateReady: boolean }): string {
  if (i.status === 'CANCELLED') return 'Nothing more is needed. If you paid anything, the branch will talk to you about a refund.';
  if (i.status === 'ESCALATED') return 'This visit continues as a Job Card; follow that one instead.';
  if (i.awaitingApproval) return 'Your estimate is ready. Paying the minimum deposit approves the work so we can start.';
  if (i.waitingForCollection) return (i.balance ?? 0) > 0 ? 'Settle the balance, then come and collect your vehicle.' : 'Your vehicle is ready. Come and collect it.';
  if (['CHECKED_OUT', 'COLLECTED'].includes(i.status)) return 'Nothing more is needed. Thank you for choosing us.';
  if (i.status === 'SCHEDULED') return 'Bring your vehicle in at the booked time.';
  if (!i.estimateReady && (i.status === 'CHECKED_IN')) return 'Nothing is needed from you yet. We will send your estimate as soon as it is ready.';
  return 'Nothing is needed from you right now. We will let you know when it is ready.';
}

// ── Messages, rate limits, visitors ─────────────────────────────────────

export type Limits = {
  customerPerMinute: number;
  publicPerMinute: number;
  publicPerDay: number;
  ipPerMinute: number;
  ipPerDay: number;
};

const envInt = (v: string | undefined, fallback: number, min = 1, max = 10_000): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/** Limits per customer, per visitor and per internet address (hashed). Tunable from the environment. */
export function readLimits(env: Record<string, string | undefined> = process.env): Limits {
  return {
    customerPerMinute: envInt(env.ENYO_CUSTOMER_PER_MINUTE, 12),
    publicPerMinute: envInt(env.ENYO_PUBLIC_PER_MINUTE, 6),
    publicPerDay: envInt(env.ENYO_PUBLIC_PER_DAY, 60),
    ipPerMinute: envInt(env.ENYO_PUBLIC_IP_PER_MINUTE, 20),
    ipPerDay: envInt(env.ENYO_PUBLIC_IP_PER_DAY, 200),
  };
}

export type RateCounts = { perMinute: number; perDay?: number; ipPerMinute?: number; ipPerDay?: number };

/** null = go ahead; otherwise the calm words to show. Counts are the messages already sent in each window. */
export function rateVerdict(mode: 'CUSTOMER' | 'PUBLIC', c: RateCounts, l: Limits): string | null {
  const minute = 'You are sending messages quickly. Please wait a minute, then try again.';
  const day = 'You have reached today’s limit for the chat. Please call or email us, and we will gladly help.';
  if (mode === 'CUSTOMER') return c.perMinute >= l.customerPerMinute ? minute : null;
  if ((c.perDay ?? 0) >= l.publicPerDay || (c.ipPerDay ?? 0) >= l.ipPerDay) return day;
  if (c.perMinute >= l.publicPerMinute || (c.ipPerMinute ?? 0) >= l.ipPerMinute) return minute;
  return null;
}

/** The anonymous visitor cookie: random, no personal data. */
export const VISITOR_COOKIE = 'enyo_visitor';
export const VISITOR_COOKIE_DAYS = 90;
const VISITOR_KEY = /^v1\.[A-Za-z0-9_-]{32}$/;

export function isVisitorKey(v: unknown): v is string {
  return typeof v === 'string' && VISITOR_KEY.test(v);
}

export function newVisitorKey(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `v1.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/** Ids we create (cuid) or receive back from the browser: a short, plain token. */
export function isPlainId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}

/**
 * CSRF: a chat POST must come from this website. `origin` is the request's
 * Origin header; `allowed` are this site's own origins (configured address
 * and the host the request arrived on).
 */
export function originAllowed(origin: string | null | undefined, allowed: (string | null | undefined)[]): boolean {
  if (!origin || origin === 'null') return false;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  return allowed.some((a) => {
    if (!a) return false;
    try {
      const u = new URL(a.includes('://') ? a : `https://${a}`);
      return u.host.toLowerCase() === o.host.toLowerCase() && (a.includes('://') ? u.protocol === o.protocol : true);
    } catch {
      return false;
    }
  });
}

// ── Support ticket numbers ──────────────────────────────────────────────

/** The calendar year in Lagos (a ticket opened at 00:30 on 1 January Lagos time is next year's). */
export function lagosYear(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(d));
}

export const TICKET_PATTERN = /^SUP-\d{4}-\d{6}$/;

export function ticketPrefix(year: number): string {
  return `SUP-${year}-`;
}

/** "latest + 1" for the year: null → SUP-2026-000001. A latest from another year never counts. */
export function nextTicketNumber(latest: string | null | undefined, year: number): string {
  const prefix = ticketPrefix(year);
  const seq = latest && latest.startsWith(prefix) ? Number.parseInt(latest.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(seq) && seq > 0 ? seq + 1 : 1;
  if (next > 999_999) throw new Error('Support ticket numbers for this year are used up.');
  return `${prefix}${String(next).padStart(6, '0')}`;
}

/** Was this error a unique-constraint clash on the given column? (Same rule as the portal's lib/integrity-core.ts.) */
export function isUniqueClashOn(err: unknown, column: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).includes(column));
  return typeof target === 'string' && target.includes(column);
}

/**
 * Two hand-overs at the same instant can pick the same "latest + 1"; the
 * unique constraint keeps the data right and this re-runs the attempt
 * (number included) so the second simply gets the next number.
 */
export async function retryOnNumberClash<T>(column: string, attempt: () => Promise<T>, tries = 10, pause: (i: number) => Promise<void> = defaultPause): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i < tries && isUniqueClashOn(err, column)) {
        await pause(i);
        continue;
      }
      throw err;
    }
  }
}

function defaultPause(attempt: number): Promise<void> {
  const ms = Math.round(Math.random() * 40 * Math.min(attempt, 6)) + 5;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Hand-over contact details ───────────────────────────────────────────

export type HandoverContact = { name: string; phone: string | null; email: string | null };

/** Cleans and checks a visitor's contact details; a name and a phone number or email are required. */
export function checkHandoverContact(input: { name?: unknown; phone?: unknown; email?: unknown }): { ok: true; contact: HandoverContact } | { ok: false; message: string } {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const name = str(input.name, 80);
  const phone = str(input.phone, 30);
  const email = str(input.email, 120).toLowerCase();
  if (name.length < 2) return { ok: false, message: 'A name is needed. Ask the visitor for their name.' };
  if (!phone && !email) return { ok: false, message: 'A phone number or an email address is needed so the team can reply. Ask the visitor for one.' };
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[0-9][0-9 ()-]*$/.test(phone) || digits.length < 7 || digits.length > 15) return { ok: false, message: 'That phone number does not look right. Ask the visitor to check it.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: 'That email address does not look right. Ask the visitor to check it.' };
  return { ok: true, contact: { name, phone: phone || null, email: email || null } };
}

// ── Links in answers ────────────────────────────────────────────────────

/** Only links within this site ("/customer-portal/…") or https links are ever made clickable. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^\/(?!\/)/.test(h) && !/[\s<>"'\\]/.test(h)) return h;
  try {
    const u = new URL(h);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "1 vehicle" / "2 vehicles". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
