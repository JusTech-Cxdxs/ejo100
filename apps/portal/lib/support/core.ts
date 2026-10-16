/**
 * The Support centre's rules — plain functions shared by the intake, the
 * scheduled automations, the server actions, the pages and the unit tests.
 * No database, no framework, no network.
 *
 *  - Priorities and service targets (first response / resolution), counted
 *    in the organisation's business hours (Lagos time, no daylight saving).
 *  - Mail-loop protection (RFC 3834): never answer robots, lists or ourselves.
 *  - Threading: the [#SUP-2026-000123] tag, Message-ID references.
 *  - What the email says: the new words above the quoted history.
 *  - Vehicle-aware details: plates, VINs, record numbers.
 *  - When Enyo may answer by itself, and when a person must.
 *  - The measures on the control centre (first response, SLA, AI resolution,
 *    reopen rate, satisfaction, backlog age).
 */

// ─────────────────────────────────────────────────────────── priorities

export const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' };
export const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export function asPriority(v: unknown): Priority {
  return typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v) ? (v as Priority) : 'NORMAL';
}

export const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'Email', CUSTOMER_PORTAL: 'Customer portal', WEBSITE: 'Website enquiry', STAFF: 'Opened by a colleague' };

export const QUEUE_KINDS = ['general', 'warranty', 'technical', 'customer_care', 'parts', 'sales', 'other'] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];
export const QUEUE_KIND_LABEL: Record<QueueKind, string> = {
  general: 'General support', warranty: 'Warranty & recalls', technical: 'Technical / workshop', customer_care: 'Customer care & complaints', parts: 'Parts', sales: 'Vehicle sales', other: 'Other',
};
export function asQueueKind(v: unknown): QueueKind {
  return typeof v === 'string' && (QUEUE_KINDS as readonly string[]).includes(v) ? (v as QueueKind) : 'general';
}

export const AI_MODES = ['OFF', 'SUGGEST', 'AUTO'] as const;
export type AiMode = (typeof AI_MODES)[number];
export const AI_MODE_LABEL: Record<AiMode, { label: string; help: string }> = {
  OFF: { label: 'People only', help: 'Enyo stays out of this queue. People write every reply.' },
  SUGGEST: { label: 'Enyo drafts, people send', help: 'Enyo prepares a reply for the colleague to check, change and send. Nothing goes out by itself.' },
  AUTO: { label: 'Enyo answers general questions', help: 'Enyo answers general questions by itself when it is sure, labelled as the AI assistant, with "Solved" and "Talk to a person" buttons. Anything about a customer’s own records, money, complaints, safety or the law always goes to a person.' },
};
export function asAiMode(v: unknown): AiMode {
  return typeof v === 'string' && (AI_MODES as readonly string[]).includes(v) ? (v as AiMode) : 'SUGGEST';
}

/** Service targets in minutes: first response and resolution, per priority. URGENT counts every hour, the rest business hours only. */
export type Targets = Record<Priority, { first: number; resolve: number }>;
export const DEFAULT_TARGETS: Targets = {
  URGENT: { first: 30, resolve: 8 * 60 },
  HIGH: { first: 2 * 60, resolve: 2 * 9 * 60 },
  NORMAL: { first: 8 * 60, resolve: 5 * 9 * 60 },
  LOW: { first: 9 * 60, resolve: 10 * 9 * 60 },
};

/** Stored targets (JSON) → complete, sane targets (each between 5 minutes and 60 days). */
export function readTargets(json: unknown): Targets {
  const out: Targets = JSON.parse(JSON.stringify(DEFAULT_TARGETS)) as Targets;
  if (!json || typeof json !== 'object') return out;
  for (const p of PRIORITIES) {
    const v = (json as Record<string, unknown>)[p];
    if (!v || typeof v !== 'object') continue;
    for (const k of ['first', 'resolve'] as const) {
      const n = Number((v as Record<string, unknown>)[k]);
      if (Number.isFinite(n) && n >= 5 && n <= 60 * 24 * 60) out[p][k] = Math.round(n);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── business hours

/** Opening hours per weekday (1 = Monday … 7 = Sunday): [open, close] as "HH:MM", Lagos time. */
export type Hours = Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', [string, string]>>;
export const DEFAULT_HOURS: Hours = { 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['09:00', '13:00'] };
/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MIN = 60;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (hhmm: string) => { const m = HHMM.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

export function readHours(json: unknown): Hours {
  if (!json || typeof json !== 'object') return { ...DEFAULT_HOURS };
  const out: Hours = {};
  for (const d of ['1', '2', '3', '4', '5', '6', '7'] as const) {
    const v = (json as Record<string, unknown>)[d];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') {
      const a = toMin(v[0]);
      const b = toMin(v[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) out[d] = [v[0], v[1]];
    }
  }
  return Object.keys(out).length ? out : { ...DEFAULT_HOURS };
}

/** Lagos calendar day "YYYY-MM-DD", weekday 1–7 and minute of the day for an instant. */
export function lagosParts(at: Date): { day: string; weekday: number; minute: number } {
  const local = new Date(at.getTime() + LAGOS_OFFSET_MIN * 60_000);
  const wd = local.getUTCDay();
  return { day: local.toISOString().slice(0, 10), weekday: wd === 0 ? 7 : wd, minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** The instant at a Lagos day + minute. */
function lagosInstant(day: string, minute: number): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (minute - LAGOS_OFFSET_MIN) * 60_000);
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Is the desk open at this instant? */
export function isOpen(at: Date, hours: Hours, holidays: string[] = []): boolean {
  const p = lagosParts(at);
  if (holidays.includes(p.day)) return false;
  const h = hours[String(p.weekday) as keyof Hours];
  if (!h) return false;
  return p.minute >= toMin(h[0]) && p.minute < toMin(h[1]);
}

/**
 * The instant `minutes` of open time after `from` (business hours, holidays
 * skipped). Looks at most 60 days ahead; with no open hours at all it counts
 * plain time so a target is never lost.
 */
export function addBusinessMinutes(from: Date, minutes: number, hours: Hours, holidays: string[] = []): Date {
  let left = Math.max(0, Math.round(minutes));
  const start = lagosParts(from);
  let day = start.day;
  let minute = start.minute;
  let weekday = start.weekday;
  for (let i = 0; i < 60; i += 1) {
    const h = holidays.includes(day) ? undefined : hours[String(weekday) as keyof Hours];
    if (h) {
      const open = toMin(h[0]);
      const close = toMin(h[1]);
      const at = Math.max(minute, open);
      if (at < close) {
        const room = close - at;
        if (left <= room) return lagosInstant(day, at + left);
        left -= room;
      }
    }
    day = nextDay(day);
    minute = 0;
    weekday = weekday === 7 ? 1 : weekday + 1;
  }
  return new Date(from.getTime() + minutes * 60_000);
}

/** When the first answer and the resolution are due. URGENT counts plain time (24/7). */
export function dueDates(openedAt: Date, priority: Priority, targets: Targets, hours: Hours, holidays: string[] = []): { first: Date; resolve: Date } {
  const t = targets[priority];
  if (priority === 'URGENT') return { first: new Date(openedAt.getTime() + t.first * 60_000), resolve: new Date(openedAt.getTime() + t.resolve * 60_000) };
  return { first: addBusinessMinutes(openedAt, t.first, hours, holidays), resolve: addBusinessMinutes(openedAt, t.resolve, hours, holidays) };
}

/** "by 10:00 tomorrow", "by 3:30 pm today", "by Monday 9:00 am" — for the acknowledgement email (Lagos time). */
export function promiseLabel(due: Date, now = new Date()): string {
  const d = lagosParts(due);
  const n = lagosParts(now);
  const h24 = Math.floor(d.minute / 60);
  const mm = String(d.minute % 60).padStart(2, '0');
  const time = `${((h24 + 11) % 12) + 1}:${mm} ${h24 < 12 ? 'am' : 'pm'}`;
  if (d.day === n.day) return `by ${time} today`;
  if (d.day === nextDay(n.day)) return `by ${time} tomorrow`;
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const within = (Date.parse(`${d.day}T00:00:00Z`) - Date.parse(`${n.day}T00:00:00Z`)) / 86_400_000;
  if (within > 0 && within < 7) return `by ${days[d.weekday]} ${time}`;
  return `by ${d.day.slice(8, 10)}/${d.day.slice(5, 7)} ${time}`;
}

/** Where a ticket stands against its first-response target. */
export type SlaState = 'met' | 'breached' | 'due_soon' | 'on_track' | 'none';
export function slaState(t: { dueFirstResponseAt: Date | null; firstResponseAt: Date | null; status: string }, now = new Date(), soonMinutes = 60): SlaState {
  if (!t.dueFirstResponseAt) return 'none';
  if (t.firstResponseAt) return t.firstResponseAt <= t.dueFirstResponseAt ? 'met' : 'breached';
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') return 'none';
  const left = t.dueFirstResponseAt.getTime() - now.getTime();
  if (left < 0) return 'breached';
  return left <= soonMinutes * 60_000 ? 'due_soon' : 'on_track';
}

/** "3 h 20 min left", "45 min late". */
export function dueLabel(due: Date, now = new Date()): string {
  const diff = Math.round((due.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diff);
  const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}` : `${Math.round(abs / 1440)} days`;
  return diff >= 0 ? `${text} left` : `${text} late`;
}

// ─────────────────────────────────────────────────────────── mail-loop protection

export type HeaderBag = Record<string, string | string[] | undefined>;
const header = (h: HeaderBag, name: string): string => {
  const v = h[name.toLowerCase()];
  return (Array.isArray(v) ? v.join(' ') : v ?? '').toString().trim();
};

const ROBOT_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|donotreply|bounces?|notifications?|alerts?|owner-[^@]+|[^@]+-request|[^@]+-bounces?)@/i;

/**
 * Should this email get no automatic reply at all (acknowledgement, AI answer)?
 * And should it be kept out of the queues altogether (bounces, our own mail)?
 */
export function loopGuard(o: { headers: HeaderBag; from: string; ownAddresses: string[] }): { autoReply: boolean; keep: boolean; reason: string | null } {
  const from = o.from.trim().toLowerCase();
  const own = o.ownAddresses.map((a) => a.trim().toLowerCase());
  if (!from) return { autoReply: false, keep: false, reason: 'no_sender' };
  if (own.includes(from)) return { autoReply: false, keep: false, reason: 'own_address' };
  if (/^(mailer-daemon|postmaster)@/i.test(from)) return { autoReply: false, keep: false, reason: 'bounce' };
  const auto = header(o.headers, 'auto-submitted').toLowerCase();
  if (auto && auto !== 'no') return { autoReply: false, keep: true, reason: 'auto_submitted' };
  if (/^(bulk|list|junk)$/i.test(header(o.headers, 'precedence'))) return { autoReply: false, keep: true, reason: 'bulk' };
  if (header(o.headers, 'list-id') || header(o.headers, 'list-unsubscribe')) return { autoReply: false, keep: true, reason: 'mailing_list' };
  if (header(o.headers, 'x-autoreply') || header(o.headers, 'x-autorespond') || /\b(oof|autoreply|all)\b/i.test(header(o.headers, 'x-auto-response-suppress'))) return { autoReply: false, keep: true, reason: 'auto_reply' };
  if (header(o.headers, 'return-path') === '<>') return { autoReply: false, keep: true, reason: 'null_return_path' };
  if (ROBOT_SENDER.test(from)) return { autoReply: false, keep: true, reason: 'robot_sender' };
  return { autoReply: true, keep: true, reason: null };
}

/** The headers every automatic email from the Support centre carries (RFC 3834 + Exchange). */
export function autoReplyHeaders(inReplyTo?: string | null, references?: string[]): Record<string, string> {
  return {
    'Auto-Submitted': 'auto-replied',
    'X-Auto-Response-Suppress': 'All',
    ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
    ...(references?.length ? { References: references.slice(-10).join(' ') } : inReplyTo ? { References: inReplyTo } : {}),
  };
}

/** Did the sender's domain prove the email is really from them (DMARC pass, or SPF and DKIM pass)? */
export function senderAuthenticated(headers: HeaderBag): boolean {
  const ar = header(headers, 'authentication-results').toLowerCase();
  if (!ar) return false;
  if (/\bdmarc=pass\b/.test(ar)) return true;
  return /\bspf=pass\b/.test(ar) && /\bdkim=pass\b/.test(ar);
}

// ─────────────────────────────────────────────────────────── threading

export const TICKET_NUMBER = /\bSUP-\d{4}-\d{6}\b/;

/** "[#SUP-2026-000123] Brake noise" — the tag stays when people reply. */
export function taggedSubject(number: string, subject: string): string {
  const clean = subject.replace(/\[#SUP-\d{4}-\d{6}\]\s*/g, '').trim() || 'Your request';
  return `[#${number}] ${clean}`.slice(0, 300);
}

/** The ticket number in a subject (or, failing that, in the first lines of the body). */
export function ticketNumberIn(subject: string, body = ''): string | null {
  const s = /\[#(SUP-\d{4}-\d{6})\]/.exec(subject)?.[1] ?? TICKET_NUMBER.exec(subject)?.[0];
  if (s) return s;
  return TICKET_NUMBER.exec(body.slice(0, 4000))?.[0] ?? null;
}

/** Every Message-ID this email points at (In-Reply-To first, then References newest first). */
export function referencedIds(inReplyTo: string | null | undefined, references: string | string[] | null | undefined): string[] {
  const refs = (Array.isArray(references) ? references.join(' ') : references ?? '').match(/<[^<>\s]+>/g) ?? [];
  const irt = (inReplyTo ?? '').match(/<[^<>\s]+>/g) ?? [];
  return [...new Set([...irt, ...refs.reverse()])].slice(0, 20);
}

/** A Message-ID for an email the Support centre sends. */
export function newMessageId(ticketId: string, domain: string, random: string): string {
  const d = domain.replace(/[^A-Za-z0-9.-]/g, '') || 'support.local';
  return `<${ticketId}.${random}@${d}>`;
}

/**
 * The customer's new words: everything above the quoted history ("On … wrote:",
 * "-----Original Message-----", Outlook's From/Sent block, "> " lines, our
 * own "reply above this line" marker).
 */
export const REPLY_ABOVE = '— Please reply above this line —';
export function newText(body: string, max = 8000): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const cut = lines.findIndex((l, i) => {
    const t = l.trim();
    if (t.includes(REPLY_ABOVE.slice(2, 30))) return true;
    if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}$/i.test(t)) return true;
    if (/^On\s.{4,200}\swrote:$/i.test(t)) return true;
    if (/^On\s.{4,200}$/i.test(t) && /wrote:$/i.test((lines[i + 1] ?? '').trim())) return true;
    if (/^From:\s.+/i.test(t) && /^(Sent|Date):\s.+/i.test((lines[i + 1] ?? '').trim())) return true;
    if (/^_{10,}$/.test(t) && /^From:/i.test((lines[i + 1] ?? '').trim())) return true;
    if (t.startsWith('>') && lines.slice(i).every((x) => !x.trim() || x.trim().startsWith('>'))) return true;
    return false;
  });
  const own = (cut < 0 ? lines : lines.slice(0, cut)).join('\n');
  // "Sent from my iPhone" and similar footers add nothing.
  return own.replace(/\n\s*(Sent from my [^\n]{2,40}|Get Outlook for [^\n]{2,30})\s*$/i, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// ─────────────────────────────────────────────────────────── vehicle-aware details

export type Entities = { plates: string[]; vins: string[]; records: string[] };

/** Nigerian plates (ABC-123DE today; AB123-CDE before 2011), VINs (17 characters, no I/O/Q) and record numbers. */
export function extractEntities(text: string): Entities {
  const t = text.toUpperCase();
  const plates = new Set<string>();
  for (const m of t.matchAll(/\b([A-Z]{3})[-\s]?(\d{3})[-\s]?([A-Z]{2})\b/g)) plates.add(`${m[1]}-${m[2]}${m[3]}`);
  for (const m of t.matchAll(/\b([A-Z]{2})[-\s]?(\d{3})[-\s]?([A-Z]{3})\b/g)) plates.add(`${m[1]}${m[2]}-${m[3]}`);
  const vins = new Set<string>();
  for (const m of t.matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/g)) if (/\d/.test(m[0]) && /[A-Z]/.test(m[0])) vins.add(m[0]);
  const records = new Set<string>();
  for (const m of t.matchAll(/\b(JC|SV|SUP|EST|INV|WC|RF|GRN|EP|PRS|APT)-\d{4}-\d{4,6}\b/g)) records.add(m[0]);
  return { plates: [...plates].slice(0, 5), vins: [...vins].slice(0, 5), records: [...records].slice(0, 10) };
}

// ─────────────────────────────────────────────────────────── when Enyo may answer

/** Words that always need a person: the law, money disputes, safety, complaints, or asking for a human. */
const SENSITIVE: [RegExp, string][] = [
  [/\b(lawyer|solicitor|legal action|court|sue|suing|fccpc|consumer protection|police|petition)\b/i, 'legal'],
  [/\b(refund|chargeback|compensation|money back|reimburse|overcharg|double.?charg|fraud|scam)\w*/i, 'money'],
  [/\b(accident|crash|injur\w*|fire|smoke|brake (fail|failure|not working)|airbag|stranded|broke(n)? down|car (has )?broken down|towing|unsafe|dangerous)\b/i, 'safety'],
  [/\b(complain\w*|disappoint\w*|terrible|worst|unacceptable|angry|furious|disgust\w*|never again|social media|journalist|go viral)\b/i, 'complaint'],
  [/\b(talk|speak|chat) (to|with) (a |an )?(human|person|someone|manager|agent|representative)\b|\b(real person|customer care agent)\b/i, 'customer_asked'],
];

export function sensitiveReasons(text: string): string[] {
  return [...new Set(SENSITIVE.filter(([re]) => re.test(text)).map(([, why]) => why))];
}

/** Urgent when safety words appear; high for complaints and legal; otherwise what triage says. */
export function priorityFromText(text: string, suggested?: string | null): Priority {
  const why = sensitiveReasons(text);
  if (why.includes('safety')) return 'URGENT';
  if (why.includes('legal') || why.includes('complaint') || why.includes('money')) return PRIORITY_RANK[asPriority(suggested)] < PRIORITY_RANK.HIGH ? asPriority(suggested) : 'HIGH';
  return asPriority(suggested);
}

export type Triage = { topic: string; priority: Priority; sentiment: 'negative' | 'neutral' | 'positive'; language: string; needsRecords: boolean; confidence: number; summary: string };

/**
 * Enyo answers by itself only when ALL hold: the queue allows it (AUTO), the
 * question is general (needs nobody's records), nothing sensitive is said,
 * the mood is not negative, an approved source was found, Enyo is at least
 * as sure as the organisation asks, and the customer has not already come
 * back on this ticket. Otherwise: a draft for a person (SUGGEST/AUTO), or
 * nothing (OFF). The reasons are kept on the ticket ("why a person").
 */
export function aiDecision(o: {
  mode: AiMode; triage: Triage | null; text: string; threshold: number; answerConfidence: number | null; hasSources: boolean; repeatContact: boolean; autoReplyAllowed: boolean;
  /** The sender's address is proven (DMARC) — or not an email at all. Default true. */
  senderVerified?: boolean;
}): { action: 'answer' | 'draft' | 'none'; reasons: string[] } {
  if (o.mode === 'OFF') return { action: 'none', reasons: [] };
  const reasons = sensitiveReasons(o.text);
  if (!o.triage) reasons.push('triage_failed');
  else {
    if (o.triage.needsRecords) reasons.push('needs_records');
    if (o.triage.sentiment === 'negative') reasons.push('negative_mood');
    if (o.triage.priority === 'URGENT') reasons.push('urgent');
  }
  if (!o.hasSources) reasons.push('no_knowledge');
  if (o.answerConfidence === null || o.answerConfidence < o.threshold) reasons.push('low_confidence');
  if (o.repeatContact) reasons.push('repeat_contact');
  if (!o.autoReplyAllowed) reasons.push('automated_sender');
  if (o.senderVerified === false) reasons.push('unverified_sender');
  const unique = [...new Set(reasons)];
  if (o.mode === 'AUTO' && unique.length === 0) return { action: 'answer', reasons: [] };
  return { action: o.autoReplyAllowed ? 'draft' : 'none', reasons: unique };
}

export const HANDOVER_REASON_LABEL: Record<string, string> = {
  customer_asked: 'The customer asked for a person',
  legal: 'Mentions the law or a complaint body',
  money: 'About money: refunds, charges or disputes',
  safety: 'Safety: accident, breakdown, brakes, fire',
  complaint: 'A complaint or an unhappy customer',
  needs_records: 'Needs the customer’s own records',
  negative_mood: 'The customer sounds upset',
  urgent: 'Urgent',
  no_knowledge: 'Nothing approved to answer from',
  low_confidence: 'Enyo was not sure enough',
  repeat_contact: 'The customer came back on this request',
  automated_sender: 'Sent by a robot or a mailing list',
  unverified_sender: 'The sender’s email address could not be proven',
  unknown_contacts: 'Enyo’s reply named a link, phone or email not in our details',
  triage_failed: 'Enyo could not read it',
  queue_off: 'Enyo is off for this queue',
  chat_handover: 'Handed over from a chat with Enyo',
};

export function reasonLabels(reason: string | null | undefined): string[] {
  return String(reason ?? '').split(',').map((r) => r.trim()).filter(Boolean).map((r) => HANDOVER_REASON_LABEL[r] ?? r);
}

// ─────────────────────────────────────────────────────────── measures

export type MeasureRow = {
  createdAt: Date; firstResponseAt: Date | null; resolvedAt: Date | null; dueFirstResponseAt: Date | null; status: string; channel: string; queueId: string | null;
  priority: string; aiOutcome: string | null; handoverReason: string | null; reopenCount: number; csatScore: number | null; assignedToId: string | null; topic: string | null;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};
const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
const ratio = (a: number, b: number) => (b ? a / b : null);

export type Measures = {
  total: number; open: number; waiting: number; onHold: number; resolved: number;
  firstResponseMedianMin: number | null; firstResponseP90Min: number | null; resolutionMedianMin: number | null;
  slaMet: number; slaBreached: number; slaAttainment: number | null;
  aiAnswered: number; aiConfirmed: number; aiAssumed: number; aiEscalated: number; aiResolutionRate: number | null;
  handovers: { reason: string; label: string; count: number }[];
  reopenRate: number | null; csatResponses: number; csatGood: number; csat: number | null;
  backlog: { under1d: number; d1to3: number; d3to7: number; over7d: number };
  byChannel: Record<string, number>; byPriority: Record<string, number>; byTopic: { topic: string; count: number }[];
};

/** Every control-centre measure from a set of tickets. */
export function measures(rows: MeasureRow[], now = new Date()): Measures {
  const minutes = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
  const frt = rows.filter((r) => r.firstResponseAt).map((r) => minutes(r.createdAt, r.firstResponseAt!));
  const res = rows.filter((r) => r.resolvedAt).map((r) => minutes(r.createdAt, r.resolvedAt!));
  let slaMet = 0;
  let slaBreached = 0;
  for (const r of rows) {
    const s = slaState(r, now);
    if (s === 'met') slaMet += 1;
    else if (s === 'breached') slaBreached += 1;
  }
  const ai = (o: string) => rows.filter((r) => r.aiOutcome === o).length;
  const aiConfirmed = ai('CONFIRMED');
  const aiAssumed = ai('ASSUMED');
  const aiEscalated = ai('ESCALATED');
  const aiAnswered = ai('ANSWERED') + aiConfirmed + aiAssumed + aiEscalated;
  const reasons = new Map<string, number>();
  for (const r of rows) for (const why of String(r.handoverReason ?? '').split(',').map((x) => x.trim()).filter(Boolean)) reasons.set(why, (reasons.get(why) ?? 0) + 1);
  const csatRows = rows.filter((r) => r.csatScore !== null);
  const csatGood = csatRows.filter((r) => (r.csatScore ?? 0) >= 4).length;
  const resolvedRows = rows.filter((r) => r.status === 'RESOLVED' || r.status === 'CLOSED');
  const backlog = { under1d: 0, d1to3: 0, d3to7: 0, over7d: 0 };
  for (const r of rows) {
    if (r.status === 'RESOLVED' || r.status === 'CLOSED') continue;
    const days = (now.getTime() - r.createdAt.getTime()) / 86_400_000;
    if (days < 1) backlog.under1d += 1; else if (days < 3) backlog.d1to3 += 1; else if (days < 7) backlog.d3to7 += 1; else backlog.over7d += 1;
  }
  const count = (key: (r: MeasureRow) => string) => rows.reduce<Record<string, number>>((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const topics = count((r) => r.topic || 'other');
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === 'OPEN').length,
    waiting: rows.filter((r) => r.status === 'WAITING_ON_CUSTOMER').length,
    onHold: rows.filter((r) => r.status === 'ON_HOLD').length,
    resolved: resolvedRows.length,
    firstResponseMedianMin: median(frt), firstResponseP90Min: pct(frt, 90), resolutionMedianMin: median(res),
    slaMet, slaBreached, slaAttainment: ratio(slaMet, slaMet + slaBreached),
    aiAnswered, aiConfirmed, aiAssumed, aiEscalated, aiResolutionRate: ratio(aiConfirmed + aiAssumed, aiAnswered),
    handovers: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, label: HANDOVER_REASON_LABEL[reason] ?? reason, count: n })),
    reopenRate: ratio(rows.filter((r) => r.reopenCount > 0).length, resolvedRows.length),
    csatResponses: csatRows.length, csatGood, csat: ratio(csatGood, csatRows.length),
    backlog,
    byChannel: count((r) => r.channel), byPriority: count((r) => r.priority),
    byTopic: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic, n]) => ({ topic, count: n })),
  };
}

/** "45 min", "3 h 10 min", "2.5 days" for a duration in minutes. */
export function minutesLabel(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${(m / 1440).toFixed(1).replace(/\.0$/, '')} days`;
}

// ─────────────────────────────────────────────────────────── assignment

/**
 * Who gets the next ticket in a queue: among members who are not away and
 * under their capacity, the one with the fewest open tickets; ties go to whoever
 * waited longest since their last ticket. Null when everyone is full or away.
 */
export function pickAssignee(members: { userId: string; capacity: number; away: boolean; lastAssignedAt: Date | null; open: number }[]): string | null {
  const free = members.filter((m) => !m.away && m.open < Math.max(1, m.capacity));
  if (!free.length) return null;
  free.sort((a, b) => a.open - b.open || (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0));
  return free[0]!.userId;
}

/** Which queue an email belongs to: the support address it was sent to (Delivered-To / X-Original-To / To / Cc). */
export function recipientMailbox(headers: HeaderBag, to: string[], cc: string[], mailboxes: { id: string; address: string }[]): string | null {
  const norm = (a: string) => a.trim().toLowerCase().replace(/\+[^@]*@/, '@');
  const known = new Map(mailboxes.map((m) => [norm(m.address), m.id]));
  const chain = ['delivered-to', 'x-original-to', 'x-forwarded-to', 'x-forwarded-for', 'x-delivered-to'].flatMap((h) => (header(headers, h).match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []));
  for (const a of [...chain, ...to, ...cc]) {
    const hit = known.get(norm(a));
    if (hit) return hit;
  }
  return null;
}

/**
 * Links, email addresses and phone numbers in a reply that are NOT in the
 * organisation's own details: an AI reply that names any is never sent by
 * itself (an injected email could otherwise make Enyo send a stranger's link
 * or number in the organisation's letterhead).
 */
export function unknownContacts(reply: string, facts: string): string[] {
  const known = facts.toLowerCase();
  const allDigits = facts.replace(/\D/g, '');
  const out: string[] = [];
  // Email addresses first (their domains are then not checked again as links).
  const emails = [...reply.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0]);
  for (const e of emails) if (!known.includes(e.toLowerCase())) out.push(e);
  const withoutEmails = emails.reduce((t, e) => t.split(e).join(' '), reply);
  for (const m of withoutEmails.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>()"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ng|net|org|io|co|info|biz|xyz|app|link|ly)\b(?:\/[^\s<>()"']*)?/gi)) {
    const host = m[0].toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]!.replace(/\.+$/, '');
    if (!known.includes(host)) out.push(m[0]);
  }
  for (const m of reply.matchAll(/\+?\d[\d\s()-]{6,}\d/g)) {
    const core = m[0].replace(/\D/g, '').replace(/^234/, '0').replace(/^0/, '');
    if (core.length >= 7 && !allDigits.includes(core)) out.push(m[0].trim());
  }
  return [...new Set(out)];
}
