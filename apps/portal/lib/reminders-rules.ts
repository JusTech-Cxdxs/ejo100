/**
 * Reminders — the plain rules shared by the pages, the server actions, Enyo's
 * tools and the unit tests. No database, no framework, relative imports only
 * (the unit tests compile this file on its own).
 *
 * Times: people type and read Lagos time (UTC+1 all year, no daylight saving).
 * A `<input type="datetime-local">` value "2026-10-15T09:30" means 9:30 am in
 * Lagos; stored as a UTC instant.
 */

/** Record types a reminder can point at (each has its own page). */
export const REMINDER_RECORD_TYPES = [
  'JobCard', 'VehicleService', 'Customer', 'CustomerVehicle', 'Part', 'Warranty', 'WarrantyClaim',
  'PartRequestSlip', 'ExternalProcurementRequest', 'Appointment',
] as const;
export type ReminderRecordType = (typeof REMINDER_RECORD_TYPES)[number];

export const REMINDER_RECORD_LABEL: Record<ReminderRecordType, string> = {
  JobCard: 'Job Card', VehicleService: 'Vehicle Service', Customer: 'Customer', CustomerVehicle: 'Vehicle', Part: 'Part',
  Warranty: 'Warranty', WarrantyClaim: 'Warranty claim', PartRequestSlip: 'Parts request', ExternalProcurementRequest: 'Outside purchase', Appointment: 'Appointment',
};

export const TITLE_MAX = 160;
export const NOTES_MAX = 2000;
/** Furthest ahead a reminder may be set. */
export const MAX_DAYS_AHEAD = 366 * 2;

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
/** Database ids (cuid / cuid2 / uuid-ish): letters, digits, dashes and underscores only. */
const ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID.test(v);
}

export function isReminderRecordType(v: unknown): v is ReminderRecordType {
  return typeof v === 'string' && (REMINDER_RECORD_TYPES as readonly string[]).includes(v);
}

/** One line, no control characters, at most `max` characters. */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Several lines allowed (notes), control characters removed, at most `max` characters. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').trim().slice(0, max);
}

/**
 * "2026-10-15T09:30" (Lagos wall clock) → the instant. Also accepts a full ISO
 * date-time with a zone ("2026-10-15T09:30:00+01:00", "…Z"), which is what
 * Enyo sends. Anything else (or an impossible date like 31 February) → null.
 */
export function parseLagosLocal(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const m = LOCAL.exec(s);
  if (m) {
    const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    const utc = Date.UTC(y, mo - 1, d, h, mi) - LAGOS_OFFSET_MS;
    const back = new Date(utc + LAGOS_OFFSET_MS);
    // Rejects dates that rolled over (31 February → 3 March).
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return new Date(utc);
  }
  // A full ISO date-time with an explicit zone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
}

/** The instant as a Lagos `datetime-local` value: "2026-10-15T09:30". */
export function lagosLocalInput(d: Date): string {
  const l = new Date(d.getTime() + LAGOS_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${l.getUTCFullYear()}-${p(l.getUTCMonth() + 1)}-${p(l.getUTCDate())}T${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`;
}

/** "Thu 15 Oct, 9:30 am" in Lagos time. */
export function formatLagos(d: Date): string {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(/\s?([ap])m/i, (_, x: string) => ` ${x.toLowerCase()}m`);
  return `${date}, ${time}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export type ReminderDraft = { title: string; notes: string; dueAt: Date; viaEmail: boolean };

/** Checks what a person typed. `now` decides "in the future". */
export function validateReminder(
  input: { title?: unknown; notes?: unknown; dueAt?: unknown; viaEmail?: unknown },
  now: Date = new Date(),
): { ok: true; value: ReminderDraft } | { ok: false; message: string } {
  const title = cleanLine(input.title, TITLE_MAX + 1);
  if (!title) return { ok: false, message: 'Give the reminder a title.' };
  if (title.length > TITLE_MAX) return { ok: false, message: `Keep the title under ${TITLE_MAX} characters.` };
  const notes = cleanText(input.notes, NOTES_MAX + 1);
  if (notes.length > NOTES_MAX) return { ok: false, message: `Keep the notes under ${NOTES_MAX} characters.` };
  const dueAt = input.dueAt instanceof Date ? input.dueAt : parseLagosLocal(input.dueAt);
  if (!dueAt || Number.isNaN(dueAt.getTime())) return { ok: false, message: 'Choose the date and time for the reminder.' };
  // A minute's grace for the time it took to press Save.
  if (dueAt.getTime() < now.getTime() - 60_000) return { ok: false, message: 'Choose a time in the future.' };
  if (dueAt.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, message: 'Choose a time within the next two years.' };
  const viaEmail = input.viaEmail === true || input.viaEmail === 'on' || input.viaEmail === 'true' || input.viaEmail === '1';
  return { ok: true, value: { title, notes, dueAt, viaEmail } };
}

/**
 * Who may set a reminder for `ownerId`: the owner, or a colleague the owner
 * has allowed (a delegate). Both must be in the same organisation — checked
 * by the caller, which only loads grants inside the organisation.
 */
export function mayCreateFor(actorId: string, ownerId: string, ownersWhoGrantedActor: readonly string[]): boolean {
  if (!actorId || !ownerId) return false;
  return actorId === ownerId || ownersWhoGrantedActor.includes(ownerId);
}

/** Only the person reminded edits, cancels, snoozes or completes a reminder. */
export function mayManage(actorId: string, reminder: { ownerId: string }): boolean {
  return Boolean(actorId) && actorId === reminder.ownerId;
}

/** A delegate must be someone else, active, in the same organisation. */
export function delegateRefusal(ownerId: string, delegate: { id: string; isActive: boolean; organisationId: string | null } | null, ownerOrganisationId: string | null): string | null {
  if (!delegate) return 'Choose a colleague from your organisation.';
  if (delegate.id === ownerId) return 'You can always set reminders for yourself.';
  if (!delegate.isActive) return 'That colleague’s account is switched off.';
  if (!ownerOrganisationId || delegate.organisationId !== ownerOrganisationId) return 'Choose a colleague from your organisation.';
  return null;
}

export type SnoozeKind = '1h' | 'tomorrow';

/** Snooze: one hour from now, or 9:00 am Lagos tomorrow. */
export function snoozeUntil(kind: SnoozeKind, now: Date = new Date()): Date {
  if (kind === '1h') return new Date(now.getTime() + 3_600_000);
  const today = lagosLocalInput(now).slice(0, 10);
  const nine = parseLagosLocal(`${today}T09:00`)!;
  return new Date(nine.getTime() + 86_400_000);
}

export type ReminderState = 'PENDING' | 'SENT' | 'DONE' | 'CANCELLED';
export type ReminderBucket = 'overdue' | 'upcoming' | 'done';

/** Where a reminder is listed: due (or delivered) and not done → overdue; later → upcoming; done / cancelled → done. */
export function reminderBucket(r: { status: ReminderState; dueAt: Date }, now: Date = new Date()): ReminderBucket {
  if (r.status === 'DONE' || r.status === 'CANCELLED') return 'done';
  if (r.status === 'SENT' || r.dueAt.getTime() <= now.getTime()) return 'overdue';
  return 'upcoming';
}

export type ReminderPrefill = {
  title?: string;
  notes?: string;
  /** Lagos `datetime-local` value. */
  dueAt?: string;
  recordType?: ReminderRecordType;
  recordId?: string;
  forUserId?: string;
};

/**
 * `/reminders/new?title=…&notes=…&dueAt=…&recordType=…&recordId=…&for=…`
 * Every value is checked and clipped; anything invalid is dropped (never an
 * error page). The form is only filled in — nothing is saved until the person
 * presses Save.
 */
export function parseReminderPrefill(params: Record<string, string | string[] | undefined>, now: Date = new Date()): ReminderPrefill {
  const one = (k: string): string | undefined => {
    const v = params[k];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const out: ReminderPrefill = {};
  const title = cleanLine(one('title'), TITLE_MAX);
  if (title) out.title = title;
  const notes = cleanText(one('notes'), NOTES_MAX);
  if (notes) out.notes = notes;
  const due = parseLagosLocal(one('dueAt'));
  if (due && due.getTime() > now.getTime() - 60_000 && due.getTime() < now.getTime() + MAX_DAYS_AHEAD * 86_400_000) out.dueAt = lagosLocalInput(due);
  const type = one('recordType');
  const id = one('recordId');
  if (isReminderRecordType(type) && isId(id)) {
    out.recordType = type;
    out.recordId = id;
  }
  const forId = one('for');
  if (isId(forId)) out.forUserId = forId;
  return out;
}

/** The `/reminders/new` link for a prefill (what Enyo's draft opens). */
export function reminderPrefillHref(p: ReminderPrefill): string {
  const q = new URLSearchParams();
  if (p.title) q.set('title', p.title);
  if (p.notes) q.set('notes', p.notes);
  if (p.dueAt) q.set('dueAt', p.dueAt);
  if (p.recordType && p.recordId) { q.set('recordType', p.recordType); q.set('recordId', p.recordId); }
  if (p.forUserId) q.set('for', p.forUserId);
  const s = q.toString();
  return `/reminders/new${s ? `?${s}` : ''}`;
}

/** "in 2 hours", "in 3 days", "5 minutes ago", "now" — both directions. */
export function relativeTime(d: Date, now: Date = new Date()): string {
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return 'now';
  const say = (n: number, unit: string) => (diff > 0 ? `in ${plural(n, unit)}` : `${plural(n, unit)} ago`);
  if (mins < 60) return say(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return say(hours, 'hour');
  return say(Math.round(hours / 24), 'day');
}
