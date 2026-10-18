"use strict";
/**
 * Reminders — the plain rules shared by the pages, the server actions, Enyo's
 * tools and the unit tests. No database, no framework, relative imports only
 * (the unit tests compile this file on its own).
 *
 * Times: people type and read Lagos time (UTC+1 all year, no daylight saving).
 * A `<input type="datetime-local">` value "2026-10-15T09:30" means 9:30 am in
 * Lagos; stored as a UTC instant.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DAYS_AHEAD = exports.NOTES_MAX = exports.TITLE_MAX = exports.REMINDER_RECORD_LABEL = exports.REMINDER_RECORD_TYPES = void 0;
exports.isId = isId;
exports.isReminderRecordType = isReminderRecordType;
exports.cleanLine = cleanLine;
exports.cleanText = cleanText;
exports.parseLagosLocal = parseLagosLocal;
exports.lagosLocalInput = lagosLocalInput;
exports.formatLagos = formatLagos;
exports.plural = plural;
exports.validateReminder = validateReminder;
exports.mayCreateFor = mayCreateFor;
exports.mayManage = mayManage;
exports.delegateRefusal = delegateRefusal;
exports.snoozeUntil = snoozeUntil;
exports.reminderBucket = reminderBucket;
exports.parseReminderPrefill = parseReminderPrefill;
exports.reminderPrefillHref = reminderPrefillHref;
exports.relativeTime = relativeTime;
/** Record types a reminder can point at (each has its own page). */
exports.REMINDER_RECORD_TYPES = [
    'JobCard', 'VehicleService', 'Customer', 'CustomerVehicle', 'Part', 'Warranty', 'WarrantyClaim',
    'PartRequestSlip', 'ExternalProcurementRequest', 'Appointment',
];
exports.REMINDER_RECORD_LABEL = {
    JobCard: 'Job Card', VehicleService: 'Vehicle Service', Customer: 'Customer', CustomerVehicle: 'Vehicle', Part: 'Part',
    Warranty: 'Warranty', WarrantyClaim: 'Warranty claim', PartRequestSlip: 'Parts request', ExternalProcurementRequest: 'Outside purchase', Appointment: 'Appointment',
};
exports.TITLE_MAX = 160;
exports.NOTES_MAX = 2000;
/** Furthest ahead a reminder may be set. */
exports.MAX_DAYS_AHEAD = 366 * 2;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
/** Database ids (cuid / cuid2 / uuid-ish): letters, digits, dashes and underscores only. */
const ID = /^[A-Za-z0-9_-]{8,64}$/;
function isId(v) {
    return typeof v === 'string' && ID.test(v);
}
function isReminderRecordType(v) {
    return typeof v === 'string' && exports.REMINDER_RECORD_TYPES.includes(v);
}
/** One line, no control characters, at most `max` characters. */
function cleanLine(v, max) {
    if (typeof v !== 'string')
        return '';
    // eslint-disable-next-line no-control-regex
    return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** Several lines allowed (notes), control characters removed, at most `max` characters. */
function cleanText(v, max) {
    if (typeof v !== 'string')
        return '';
    // eslint-disable-next-line no-control-regex
    return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').trim().slice(0, max);
}
/**
 * "2026-10-15T09:30" (Lagos wall clock) → the instant. Also accepts a full ISO
 * date-time with a zone ("2026-10-15T09:30:00+01:00", "…Z"), which is what
 * Enyo sends. Anything else (or an impossible date like 31 February) → null.
 */
function parseLagosLocal(raw) {
    if (typeof raw !== 'string')
        return null;
    const s = raw.trim();
    const m = LOCAL.exec(s);
    if (m) {
        const [y, mo, d, h, mi] = m.slice(1).map(Number);
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59)
            return null;
        const utc = Date.UTC(y, mo - 1, d, h, mi) - LAGOS_OFFSET_MS;
        const back = new Date(utc + LAGOS_OFFSET_MS);
        // Rejects dates that rolled over (31 February → 3 March).
        if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d)
            return null;
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
function lagosLocalInput(d) {
    const l = new Date(d.getTime() + LAGOS_OFFSET_MS);
    const p = (n) => String(n).padStart(2, '0');
    return `${l.getUTCFullYear()}-${p(l.getUTCMonth() + 1)}-${p(l.getUTCDate())}T${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`;
}
/** "Thu 15 Oct, 9:30 am" in Lagos time. */
function formatLagos(d) {
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(/\s?([ap])m/i, (_, x) => ` ${x.toLowerCase()}m`);
    return `${date}, ${time}`;
}
function plural(n, one, many = `${one}s`) {
    return `${n} ${n === 1 ? one : many}`;
}
/** Checks what a person typed. `now` decides "in the future". */
function validateReminder(input, now = new Date()) {
    const title = cleanLine(input.title, exports.TITLE_MAX + 1);
    if (!title)
        return { ok: false, message: 'Give the reminder a title.' };
    if (title.length > exports.TITLE_MAX)
        return { ok: false, message: `Keep the title under ${exports.TITLE_MAX} characters.` };
    const notes = cleanText(input.notes, exports.NOTES_MAX + 1);
    if (notes.length > exports.NOTES_MAX)
        return { ok: false, message: `Keep the notes under ${exports.NOTES_MAX} characters.` };
    const dueAt = input.dueAt instanceof Date ? input.dueAt : parseLagosLocal(input.dueAt);
    if (!dueAt || Number.isNaN(dueAt.getTime()))
        return { ok: false, message: 'Choose the date and time for the reminder.' };
    // A minute's grace for the time it took to press Save.
    if (dueAt.getTime() < now.getTime() - 60_000)
        return { ok: false, message: 'Choose a time in the future.' };
    if (dueAt.getTime() > now.getTime() + exports.MAX_DAYS_AHEAD * 86_400_000)
        return { ok: false, message: 'Choose a time within the next two years.' };
    const viaEmail = input.viaEmail === true || input.viaEmail === 'on' || input.viaEmail === 'true' || input.viaEmail === '1';
    return { ok: true, value: { title, notes, dueAt, viaEmail } };
}
/**
 * Who may set a reminder for `ownerId`: the owner, or a colleague the owner
 * has allowed (a delegate). Both must be in the same organisation — checked
 * by the caller, which only loads grants inside the organisation.
 */
function mayCreateFor(actorId, ownerId, ownersWhoGrantedActor) {
    if (!actorId || !ownerId)
        return false;
    return actorId === ownerId || ownersWhoGrantedActor.includes(ownerId);
}
/** Only the person reminded edits, cancels, snoozes or completes a reminder. */
function mayManage(actorId, reminder) {
    return Boolean(actorId) && actorId === reminder.ownerId;
}
/** A delegate must be someone else, active, in the same organisation. */
function delegateRefusal(ownerId, delegate, ownerOrganisationId) {
    if (!delegate)
        return 'Choose a colleague from your organisation.';
    if (delegate.id === ownerId)
        return 'You can always set reminders for yourself.';
    if (!delegate.isActive)
        return 'That colleague’s account is switched off.';
    if (!ownerOrganisationId || delegate.organisationId !== ownerOrganisationId)
        return 'Choose a colleague from your organisation.';
    return null;
}
/** Snooze: one hour from now, or 9:00 am Lagos tomorrow. */
function snoozeUntil(kind, now = new Date()) {
    if (kind === '1h')
        return new Date(now.getTime() + 3_600_000);
    const today = lagosLocalInput(now).slice(0, 10);
    const nine = parseLagosLocal(`${today}T09:00`);
    return new Date(nine.getTime() + 86_400_000);
}
/** Where a reminder is listed: due (or delivered) and not done → overdue; later → upcoming; done / cancelled → done. */
function reminderBucket(r, now = new Date()) {
    if (r.status === 'DONE' || r.status === 'CANCELLED')
        return 'done';
    if (r.status === 'SENT' || r.dueAt.getTime() <= now.getTime())
        return 'overdue';
    return 'upcoming';
}
/**
 * `/reminders/new?title=…&notes=…&dueAt=…&recordType=…&recordId=…&for=…`
 * Every value is checked and clipped; anything invalid is dropped (never an
 * error page). The form is only filled in — nothing is saved until the person
 * presses Save.
 */
function parseReminderPrefill(params, now = new Date()) {
    const one = (k) => {
        const v = params[k];
        return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
    };
    const out = {};
    const title = cleanLine(one('title'), exports.TITLE_MAX);
    if (title)
        out.title = title;
    const notes = cleanText(one('notes'), exports.NOTES_MAX);
    if (notes)
        out.notes = notes;
    const due = parseLagosLocal(one('dueAt'));
    if (due && due.getTime() > now.getTime() - 60_000 && due.getTime() < now.getTime() + exports.MAX_DAYS_AHEAD * 86_400_000)
        out.dueAt = lagosLocalInput(due);
    const type = one('recordType');
    const id = one('recordId');
    if (isReminderRecordType(type) && isId(id)) {
        out.recordType = type;
        out.recordId = id;
    }
    const forId = one('for');
    if (isId(forId))
        out.forUserId = forId;
    return out;
}
/** The `/reminders/new` link for a prefill (what Enyo's draft opens). */
function reminderPrefillHref(p) {
    const q = new URLSearchParams();
    if (p.title)
        q.set('title', p.title);
    if (p.notes)
        q.set('notes', p.notes);
    if (p.dueAt)
        q.set('dueAt', p.dueAt);
    if (p.recordType && p.recordId) {
        q.set('recordType', p.recordType);
        q.set('recordId', p.recordId);
    }
    if (p.forUserId)
        q.set('for', p.forUserId);
    const s = q.toString();
    return `/reminders/new${s ? `?${s}` : ''}`;
}
/** "in 2 hours", "in 3 days", "5 minutes ago", "now" — both directions. */
function relativeTime(d, now = new Date()) {
    const diff = d.getTime() - now.getTime();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60_000);
    if (mins < 1)
        return 'now';
    const say = (n, unit) => (diff > 0 ? `in ${plural(n, unit)}` : `${plural(n, unit)} ago`);
    if (mins < 60)
        return say(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24)
        return say(hours, 'hour');
    return say(Math.round(hours / 24), 'day');
}
