"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDOVER_REASON_LABEL = exports.REPLY_ABOVE = exports.TICKET_NUMBER = exports.DEFAULT_HOURS = exports.DEFAULT_TARGETS = exports.AI_MODE_LABEL = exports.AI_MODES = exports.QUEUE_KIND_LABEL = exports.QUEUE_KINDS = exports.CHANNEL_LABEL = exports.PRIORITY_RANK = exports.PRIORITY_LABEL = exports.PRIORITIES = void 0;
exports.asPriority = asPriority;
exports.asQueueKind = asQueueKind;
exports.asAiMode = asAiMode;
exports.readTargets = readTargets;
exports.readHours = readHours;
exports.lagosParts = lagosParts;
exports.isOpen = isOpen;
exports.addBusinessMinutes = addBusinessMinutes;
exports.dueDates = dueDates;
exports.promiseLabel = promiseLabel;
exports.slaState = slaState;
exports.dueLabel = dueLabel;
exports.loopGuard = loopGuard;
exports.autoReplyHeaders = autoReplyHeaders;
exports.senderAuthenticated = senderAuthenticated;
exports.taggedSubject = taggedSubject;
exports.ticketNumberIn = ticketNumberIn;
exports.referencedIds = referencedIds;
exports.newMessageId = newMessageId;
exports.newText = newText;
exports.extractEntities = extractEntities;
exports.sensitiveReasons = sensitiveReasons;
exports.priorityFromText = priorityFromText;
exports.aiDecision = aiDecision;
exports.reasonLabels = reasonLabels;
exports.measures = measures;
exports.minutesLabel = minutesLabel;
exports.pickAssignee = pickAssignee;
exports.recipientMailbox = recipientMailbox;
exports.unknownContacts = unknownContacts;
exports.unknownSpecifics = unknownSpecifics;
exports.intlDigits = intlDigits;
// ─────────────────────────────────────────────────────────── priorities
exports.PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
exports.PRIORITY_LABEL = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' };
exports.PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
function asPriority(v) {
    return typeof v === 'string' && exports.PRIORITIES.includes(v) ? v : 'NORMAL';
}
exports.CHANNEL_LABEL = { EMAIL: 'Email', CUSTOMER_PORTAL: 'Customer portal', WEBSITE: 'Website enquiry', STAFF: 'Opened by a colleague', HELP: 'A colleague’s own request' };
exports.QUEUE_KINDS = ['general', 'warranty', 'technical', 'customer_care', 'parts', 'sales', 'internal', 'hr', 'other'];
exports.QUEUE_KIND_LABEL = {
    general: 'General support', warranty: 'Warranty & recalls', technical: 'Technical / workshop', customer_care: 'Customer care & complaints', parts: 'Parts', sales: 'Vehicle sales', internal: 'Staff help (colleagues’ own requests)', hr: 'HR & people (colleagues’ HR questions)', other: 'Other',
};
function asQueueKind(v) {
    return typeof v === 'string' && exports.QUEUE_KINDS.includes(v) ? v : 'general';
}
exports.AI_MODES = ['OFF', 'SUGGEST', 'AUTO'];
exports.AI_MODE_LABEL = {
    OFF: { label: 'People only', help: 'Enyo stays out of this queue. People write every reply.' },
    SUGGEST: { label: 'Enyo drafts, people send', help: 'Enyo prepares a reply for the colleague to check, change and send. Nothing goes out by itself.' },
    AUTO: { label: 'Enyo answers general questions', help: 'Enyo answers general questions by itself when it is sure, labelled as the AI assistant, with "Solved" and "Talk to a person" buttons. Anything about a customer’s own records, money, complaints, safety or the law always goes to a person.' },
};
function asAiMode(v) {
    return typeof v === 'string' && exports.AI_MODES.includes(v) ? v : 'SUGGEST';
}
exports.DEFAULT_TARGETS = {
    URGENT: { first: 30, resolve: 8 * 60 },
    HIGH: { first: 2 * 60, resolve: 2 * 9 * 60 },
    NORMAL: { first: 8 * 60, resolve: 5 * 9 * 60 },
    LOW: { first: 9 * 60, resolve: 10 * 9 * 60 },
};
/** Stored targets (JSON) → complete, sane targets (each between 5 minutes and 60 days). */
function readTargets(json) {
    const out = JSON.parse(JSON.stringify(exports.DEFAULT_TARGETS));
    if (!json || typeof json !== 'object')
        return out;
    for (const p of exports.PRIORITIES) {
        const v = json[p];
        if (!v || typeof v !== 'object')
            continue;
        for (const k of ['first', 'resolve']) {
            const n = Number(v[k]);
            if (Number.isFinite(n) && n >= 5 && n <= 60 * 24 * 60)
                out[p][k] = Math.round(n);
        }
    }
    return out;
}
exports.DEFAULT_HOURS = { 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['09:00', '13:00'] };
/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MIN = 60;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (hhmm) => { const m = HHMM.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
function readHours(json) {
    if (!json || typeof json !== 'object')
        return { ...exports.DEFAULT_HOURS };
    const out = {};
    for (const d of ['1', '2', '3', '4', '5', '6', '7']) {
        const v = json[d];
        if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') {
            const a = toMin(v[0]);
            const b = toMin(v[1]);
            if (Number.isFinite(a) && Number.isFinite(b) && b > a)
                out[d] = [v[0], v[1]];
        }
    }
    return Object.keys(out).length ? out : { ...exports.DEFAULT_HOURS };
}
/** Lagos calendar day "YYYY-MM-DD", weekday 1–7 and minute of the day for an instant. */
function lagosParts(at) {
    const local = new Date(at.getTime() + LAGOS_OFFSET_MIN * 60_000);
    const wd = local.getUTCDay();
    return { day: local.toISOString().slice(0, 10), weekday: wd === 0 ? 7 : wd, minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
/** The instant at a Lagos day + minute. */
function lagosInstant(day, minute) {
    return new Date(Date.parse(`${day}T00:00:00Z`) + (minute - LAGOS_OFFSET_MIN) * 60_000);
}
function nextDay(day) {
    return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
/** Is the desk open at this instant? */
function isOpen(at, hours, holidays = []) {
    const p = lagosParts(at);
    if (holidays.includes(p.day))
        return false;
    const h = hours[String(p.weekday)];
    if (!h)
        return false;
    return p.minute >= toMin(h[0]) && p.minute < toMin(h[1]);
}
/**
 * The instant `minutes` of open time after `from` (business hours, holidays
 * skipped). Looks at most 60 days ahead; with no open hours at all it counts
 * plain time so a target is never lost.
 */
function addBusinessMinutes(from, minutes, hours, holidays = []) {
    let left = Math.max(0, Math.round(minutes));
    const start = lagosParts(from);
    let day = start.day;
    let minute = start.minute;
    let weekday = start.weekday;
    for (let i = 0; i < 60; i += 1) {
        const h = holidays.includes(day) ? undefined : hours[String(weekday)];
        if (h) {
            const open = toMin(h[0]);
            const close = toMin(h[1]);
            const at = Math.max(minute, open);
            if (at < close) {
                const room = close - at;
                if (left <= room)
                    return lagosInstant(day, at + left);
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
function dueDates(openedAt, priority, targets, hours, holidays = []) {
    const t = targets[priority];
    if (priority === 'URGENT')
        return { first: new Date(openedAt.getTime() + t.first * 60_000), resolve: new Date(openedAt.getTime() + t.resolve * 60_000) };
    return { first: addBusinessMinutes(openedAt, t.first, hours, holidays), resolve: addBusinessMinutes(openedAt, t.resolve, hours, holidays) };
}
/** "by 10:00 tomorrow", "by 3:30 pm today", "by Monday 9:00 am" — for the acknowledgement email (Lagos time). */
function promiseLabel(due, now = new Date()) {
    const d = lagosParts(due);
    const n = lagosParts(now);
    const h24 = Math.floor(d.minute / 60);
    const mm = String(d.minute % 60).padStart(2, '0');
    const time = `${((h24 + 11) % 12) + 1}:${mm} ${h24 < 12 ? 'am' : 'pm'}`;
    if (d.day === n.day)
        return `by ${time} today`;
    if (d.day === nextDay(n.day))
        return `by ${time} tomorrow`;
    const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const within = (Date.parse(`${d.day}T00:00:00Z`) - Date.parse(`${n.day}T00:00:00Z`)) / 86_400_000;
    if (within > 0 && within < 7)
        return `by ${days[d.weekday]} ${time}`;
    return `by ${d.day.slice(8, 10)}/${d.day.slice(5, 7)} ${time}`;
}
function slaState(t, now = new Date(), soonMinutes = 60) {
    if (!t.dueFirstResponseAt)
        return 'none';
    if (t.firstResponseAt)
        return t.firstResponseAt <= t.dueFirstResponseAt ? 'met' : 'breached';
    if (t.status === 'RESOLVED' || t.status === 'CLOSED')
        return 'none';
    const left = t.dueFirstResponseAt.getTime() - now.getTime();
    if (left < 0)
        return 'breached';
    return left <= soonMinutes * 60_000 ? 'due_soon' : 'on_track';
}
/** "3 h 20 min left", "45 min late". */
function dueLabel(due, now = new Date()) {
    const diff = Math.round((due.getTime() - now.getTime()) / 60_000);
    const abs = Math.abs(diff);
    const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}` : `${Math.round(abs / 1440)} days`;
    return diff >= 0 ? `${text} left` : `${text} late`;
}
const header = (h, name) => {
    const v = h[name.toLowerCase()];
    return (Array.isArray(v) ? v.join(' ') : v ?? '').toString().trim();
};
const ROBOT_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|donotreply|bounces?|notifications?|alerts?|owner-[^@]+|[^@]+-request|[^@]+-bounces?)@/i;
/**
 * Should this email get no automatic reply at all (acknowledgement, AI answer)?
 * And should it be kept out of the queues altogether (bounces, our own mail)?
 */
function loopGuard(o) {
    const from = o.from.trim().toLowerCase();
    const own = o.ownAddresses.map((a) => a.trim().toLowerCase());
    if (!from)
        return { autoReply: false, keep: false, reason: 'no_sender' };
    if (own.includes(from))
        return { autoReply: false, keep: false, reason: 'own_address' };
    if (/^(mailer-daemon|postmaster)@/i.test(from))
        return { autoReply: false, keep: false, reason: 'bounce' };
    const auto = header(o.headers, 'auto-submitted').toLowerCase();
    if (auto && auto !== 'no')
        return { autoReply: false, keep: true, reason: 'auto_submitted' };
    if (/^(bulk|list|junk)$/i.test(header(o.headers, 'precedence')))
        return { autoReply: false, keep: true, reason: 'bulk' };
    if (header(o.headers, 'list-id') || header(o.headers, 'list-unsubscribe'))
        return { autoReply: false, keep: true, reason: 'mailing_list' };
    if (header(o.headers, 'x-autoreply') || header(o.headers, 'x-autorespond') || /\b(oof|autoreply|all)\b/i.test(header(o.headers, 'x-auto-response-suppress')))
        return { autoReply: false, keep: true, reason: 'auto_reply' };
    if (header(o.headers, 'return-path') === '<>')
        return { autoReply: false, keep: true, reason: 'null_return_path' };
    if (ROBOT_SENDER.test(from))
        return { autoReply: false, keep: true, reason: 'robot_sender' };
    return { autoReply: true, keep: true, reason: null };
}
/** The headers every automatic email from the Support centre carries (RFC 3834 + Exchange). */
function autoReplyHeaders(inReplyTo, references) {
    return {
        'Auto-Submitted': 'auto-replied',
        'X-Auto-Response-Suppress': 'All',
        ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
        ...(references?.length ? { References: references.slice(-10).join(' ') } : inReplyTo ? { References: inReplyTo } : {}),
    };
}
/** Did the sender's domain prove the email is really from them (DMARC pass, or SPF and DKIM pass)? */
function senderAuthenticated(headers) {
    const ar = header(headers, 'authentication-results').toLowerCase();
    if (!ar)
        return false;
    if (/\bdmarc=pass\b/.test(ar))
        return true;
    return /\bspf=pass\b/.test(ar) && /\bdkim=pass\b/.test(ar);
}
// ─────────────────────────────────────────────────────────── threading
exports.TICKET_NUMBER = /\bSUP-\d{4}-\d{6}\b/;
/** "[#SUP-2026-000123] Brake noise" — the tag stays when people reply. */
function taggedSubject(number, subject) {
    const clean = subject.replace(/\[#SUP-\d{4}-\d{6}\]\s*/g, '').trim() || 'Your request';
    return `[#${number}] ${clean}`.slice(0, 300);
}
/** The ticket number in a subject (or, failing that, in the first lines of the body). */
function ticketNumberIn(subject, body = '') {
    const s = /\[#(SUP-\d{4}-\d{6})\]/.exec(subject)?.[1] ?? exports.TICKET_NUMBER.exec(subject)?.[0];
    if (s)
        return s;
    return exports.TICKET_NUMBER.exec(body.slice(0, 4000))?.[0] ?? null;
}
/** Every Message-ID this email points at (In-Reply-To first, then References newest first). */
function referencedIds(inReplyTo, references) {
    const refs = (Array.isArray(references) ? references.join(' ') : references ?? '').match(/<[^<>\s]+>/g) ?? [];
    const irt = (inReplyTo ?? '').match(/<[^<>\s]+>/g) ?? [];
    return [...new Set([...irt, ...refs.reverse()])].slice(0, 20);
}
/** A Message-ID for an email the Support centre sends. */
function newMessageId(ticketId, domain, random) {
    const d = domain.replace(/[^A-Za-z0-9.-]/g, '') || 'support.local';
    return `<${ticketId}.${random}@${d}>`;
}
/**
 * The customer's new words: everything above the quoted history ("On … wrote:",
 * "-----Original Message-----", Outlook's From/Sent block, "> " lines, our
 * own "reply above this line" marker).
 */
exports.REPLY_ABOVE = '— Please reply above this line —';
function newText(body, max = 8000) {
    const lines = body.replace(/\r\n?/g, '\n').split('\n');
    const cut = lines.findIndex((l, i) => {
        const t = l.trim();
        if (t.includes(exports.REPLY_ABOVE.slice(2, 30)))
            return true;
        if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}$/i.test(t))
            return true;
        if (/^On\s.{4,200}\swrote:$/i.test(t))
            return true;
        if (/^On\s.{4,200}$/i.test(t) && /wrote:$/i.test((lines[i + 1] ?? '').trim()))
            return true;
        if (/^From:\s.+/i.test(t) && /^(Sent|Date):\s.+/i.test((lines[i + 1] ?? '').trim()))
            return true;
        if (/^_{10,}$/.test(t) && /^From:/i.test((lines[i + 1] ?? '').trim()))
            return true;
        if (t.startsWith('>') && lines.slice(i).every((x) => !x.trim() || x.trim().startsWith('>')))
            return true;
        return false;
    });
    const own = (cut < 0 ? lines : lines.slice(0, cut)).join('\n');
    // "Sent from my iPhone" and similar footers add nothing.
    return own.replace(/\n\s*(Sent from my [^\n]{2,40}|Get Outlook for [^\n]{2,30})\s*$/i, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
/** Nigerian plates (ABC-123DE today; AB123-CDE before 2011), VINs (17 characters, no I/O/Q) and record numbers. */
function extractEntities(text) {
    const t = text.toUpperCase();
    const plates = new Set();
    for (const m of t.matchAll(/\b([A-Z]{3})[-\s]?(\d{3})[-\s]?([A-Z]{2})\b/g))
        plates.add(`${m[1]}-${m[2]}${m[3]}`);
    for (const m of t.matchAll(/\b([A-Z]{2})[-\s]?(\d{3})[-\s]?([A-Z]{3})\b/g))
        plates.add(`${m[1]}${m[2]}-${m[3]}`);
    const vins = new Set();
    for (const m of t.matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/g))
        if (/\d/.test(m[0]) && /[A-Z]/.test(m[0]))
            vins.add(m[0]);
    const records = new Set();
    for (const m of t.matchAll(/\b(JC|SV|SUP|EST|INV|WC|RF|GRN|EP|PRS|APT)-\d{4}-\d{4,6}\b/g))
        records.add(m[0]);
    return { plates: [...plates].slice(0, 5), vins: [...vins].slice(0, 5), records: [...records].slice(0, 10) };
}
// ─────────────────────────────────────────────────────────── when Enyo may answer
/** Words that always need a person: the law, money disputes, safety, complaints, or asking for a human. */
const SENSITIVE = [
    [/\b(lawyer|solicitor|legal action|court|sue|suing|fccpc|consumer protection|police|petition)\b/i, 'legal'],
    [/\b(refund|chargeback|compensation|money back|reimburse|overcharg|double.?charg|fraud|scam)\w*/i, 'money'],
    [/\b(accident|crash|injur\w*|fire|smoke|brake (fail|failure|not working)|airbag|stranded|broke(n)? down|car (has )?broken down|towing|unsafe|dangerous)\b/i, 'safety'],
    [/\b(complain\w*|disappoint\w*|terrible|worst|unacceptable|angry|furious|disgust\w*|never again|social media|journalist|go viral)\b/i, 'complaint'],
    [/\b(talk|speak|chat) (to|with) (a |an )?(human|person|someone|manager|agent|representative)\b|\b(real person|customer care agent)\b/i, 'customer_asked'],
];
function sensitiveReasons(text) {
    return [...new Set(SENSITIVE.filter(([re]) => re.test(text)).map(([, why]) => why))];
}
/** Urgent when safety words appear; high for complaints and legal; otherwise what triage says. */
function priorityFromText(text, suggested) {
    const why = sensitiveReasons(text);
    if (why.includes('safety'))
        return 'URGENT';
    if (why.includes('legal') || why.includes('complaint') || why.includes('money'))
        return exports.PRIORITY_RANK[asPriority(suggested)] < exports.PRIORITY_RANK.HIGH ? asPriority(suggested) : 'HIGH';
    return asPriority(suggested);
}
/**
 * Enyo answers by itself only when ALL hold: the queue allows it (AUTO), the
 * question is general (needs nobody's records), nothing sensitive is said,
 * the mood is not negative, an approved source was found, Enyo is at least
 * as sure as the organisation asks, and the customer has not already come
 * back on this ticket. Otherwise: a draft for a person (SUGGEST/AUTO), or
 * nothing (OFF). The reasons are kept on the ticket ("why a person").
 */
function aiDecision(o) {
    if (o.mode === 'OFF')
        return { action: 'none', reasons: [] };
    const reasons = sensitiveReasons(o.text);
    if (!o.triage)
        reasons.push('triage_failed');
    else {
        if (o.triage.needsRecords && !o.recordsReady)
            reasons.push('needs_records');
        if (o.triage.sentiment === 'negative')
            reasons.push('negative_mood');
        if (o.triage.priority === 'URGENT')
            reasons.push('urgent');
    }
    if (!o.hasSources)
        reasons.push('no_knowledge');
    if (o.answerConfidence === null || o.answerConfidence < o.threshold)
        reasons.push('low_confidence');
    if (o.repeatContact)
        reasons.push('repeat_contact');
    if (!o.autoReplyAllowed)
        reasons.push('automated_sender');
    if (o.senderVerified === false)
        reasons.push('unverified_sender');
    if (o.personOnly)
        reasons.push(o.personOnly);
    const unique = [...new Set(reasons)];
    if (o.mode === 'AUTO' && unique.length === 0)
        return { action: 'answer', reasons: [] };
    return { action: o.autoReplyAllowed ? 'draft' : 'none', reasons: unique };
}
exports.HANDOVER_REASON_LABEL = {
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
    access_off: 'Their portal access is switched off — a person decides',
    deactivated: 'Their staff account is deactivated — an administrator decides',
    no_account: 'No account matches the sender — a person checks',
    staff_help: 'A colleague asked for help',
};
function reasonLabels(reason) {
    return String(reason ?? '').split(',').map((r) => r.trim()).filter(Boolean).map((r) => exports.HANDOVER_REASON_LABEL[r] ?? r);
}
const median = (xs) => {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const pct = (xs, p) => {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const ratio = (a, b) => (b ? a / b : null);
/** Every control-centre measure from a set of tickets. */
function measures(rows, now = new Date()) {
    const minutes = (a, b) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
    const frt = rows.filter((r) => r.firstResponseAt).map((r) => minutes(r.createdAt, r.firstResponseAt));
    const res = rows.filter((r) => r.resolvedAt).map((r) => minutes(r.createdAt, r.resolvedAt));
    let slaMet = 0;
    let slaBreached = 0;
    for (const r of rows) {
        const s = slaState(r, now);
        if (s === 'met')
            slaMet += 1;
        else if (s === 'breached')
            slaBreached += 1;
    }
    const ai = (o) => rows.filter((r) => r.aiOutcome === o).length;
    const aiConfirmed = ai('CONFIRMED');
    const aiAssumed = ai('ASSUMED');
    const aiEscalated = ai('ESCALATED');
    const aiAnswered = ai('ANSWERED') + aiConfirmed + aiAssumed + aiEscalated;
    const reasons = new Map();
    for (const r of rows)
        for (const why of String(r.handoverReason ?? '').split(',').map((x) => x.trim()).filter(Boolean))
            reasons.set(why, (reasons.get(why) ?? 0) + 1);
    const csatRows = rows.filter((r) => r.csatScore !== null);
    const csatGood = csatRows.filter((r) => (r.csatScore ?? 0) >= 4).length;
    const resolvedRows = rows.filter((r) => r.status === 'RESOLVED' || r.status === 'CLOSED');
    const backlog = { under1d: 0, d1to3: 0, d3to7: 0, over7d: 0 };
    for (const r of rows) {
        if (r.status === 'RESOLVED' || r.status === 'CLOSED')
            continue;
        const days = (now.getTime() - r.createdAt.getTime()) / 86_400_000;
        if (days < 1)
            backlog.under1d += 1;
        else if (days < 3)
            backlog.d1to3 += 1;
        else if (days < 7)
            backlog.d3to7 += 1;
        else
            backlog.over7d += 1;
    }
    const count = (key) => rows.reduce((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
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
        handovers: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, label: exports.HANDOVER_REASON_LABEL[reason] ?? reason, count: n })),
        reopenRate: ratio(rows.filter((r) => r.reopenCount > 0).length, resolvedRows.length),
        csatResponses: csatRows.length, csatGood, csat: ratio(csatGood, csatRows.length),
        backlog,
        byChannel: count((r) => r.channel), byPriority: count((r) => r.priority),
        byTopic: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic, n]) => ({ topic, count: n })),
    };
}
/** "45 min", "3 h 10 min", "2.5 days" for a duration in minutes. */
function minutesLabel(m) {
    if (m === null)
        return '—';
    if (m < 60)
        return `${m} min`;
    if (m < 48 * 60)
        return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
    return `${(m / 1440).toFixed(1).replace(/\.0$/, '')} days`;
}
// ─────────────────────────────────────────────────────────── assignment
/**
 * Who gets the next ticket in a queue: among members who are not away and
 * under their capacity, the one with the fewest open tickets; ties go to whoever
 * waited longest since their last ticket. Null when everyone is full or away.
 */
function pickAssignee(members) {
    const free = members.filter((m) => !m.away && m.open < Math.max(1, m.capacity));
    if (!free.length)
        return null;
    free.sort((a, b) => a.open - b.open || (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0));
    return free[0].userId;
}
/** Which queue an email belongs to: the support address it was sent to (Delivered-To / X-Original-To / To / Cc). */
function recipientMailbox(headers, to, cc, mailboxes) {
    const norm = (a) => a.trim().toLowerCase().replace(/\+[^@]*@/, '@');
    const known = new Map(mailboxes.map((m) => [norm(m.address), m.id]));
    const chain = ['delivered-to', 'x-original-to', 'x-forwarded-to', 'x-forwarded-for', 'x-delivered-to'].flatMap((h) => (header(headers, h).match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []));
    for (const a of [...chain, ...to, ...cc]) {
        const hit = known.get(norm(a));
        if (hit)
            return hit;
    }
    return null;
}
/**
 * Links, email addresses and phone numbers in a reply that are NOT in the
 * organisation's own details: an AI reply that names any is never sent by
 * itself (an injected email could otherwise make Enyo send a stranger's link
 * or number in the organisation's letterhead).
 */
function unknownContacts(reply, facts) {
    const known = facts.toLowerCase();
    const allDigits = facts.replace(/\D/g, '');
    const out = [];
    // Email addresses first (their domains are then not checked again as links).
    const emails = [...reply.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0]);
    for (const e of emails)
        if (!known.includes(e.toLowerCase()))
            out.push(e);
    const withoutEmails = emails.reduce((t, e) => t.split(e).join(' '), reply);
    for (const m of withoutEmails.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>()"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ng|net|org|io|co|info|biz|xyz|app|link|ly)\b(?:\/[^\s<>()"']*)?/gi)) {
        const host = m[0].toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/\.+$/, '');
        if (!known.includes(host))
            out.push(m[0]);
    }
    for (const m of reply.matchAll(/\+?\d[\d\s()-]{6,}\d/g)) {
        const core = m[0].replace(/\D/g, '').replace(/^234/, '0').replace(/^0/, '');
        if (core.length >= 7 && !allDigits.includes(core))
            out.push(m[0].trim());
    }
    return [...new Set(out)];
}
/**
 * v37: links to OUR OWN sites must be exactly ones Enyo was given (a made-up
 * path on our domain is still made up), and every record number it writes
 * (JC-…, SV-…, SUP-…) must be in the facts. Returns what does not fit.
 */
function unknownSpecifics(reply, allowedUrls, facts) {
    const norm = (u) => u.trim().replace(/[).,;:!?'"\]]+$/, '').replace(/\/+$/, '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const allowed = new Set(allowedUrls.map(norm));
    const hostOf = (u) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    const ours = new Set(allowedUrls.map(hostOf).filter(Boolean));
    const out = [];
    for (const m of reply.matchAll(/\bhttps?:\/\/[^\s<>()"']+/gi)) {
        if (ours.has(hostOf(m[0])) && !allowed.has(norm(m[0])))
            out.push(m[0]);
    }
    const known = new Set(extractEntities(facts).records);
    const factsUpper = facts.toUpperCase();
    for (const r of extractEntities(reply).records)
        if (!known.has(r) && !factsUpper.includes(r))
            out.push(r);
    return [...new Set(out)];
}
/**
 * A phone number as international digits for tel: and WhatsApp links
 * (Nigerian numbers written 0803… become 234803…). Null when it is not a
 * plausible phone number.
 */
function intlDigits(phone) {
    const raw = String(phone ?? '').trim();
    let d = raw.replace(/[^\d]/g, '');
    if (!d)
        return null;
    if (raw.startsWith('+')) { /* already international */ }
    else if (d.startsWith('00'))
        d = d.slice(2);
    else if (d.startsWith('0') && d.length === 11)
        d = `234${d.slice(1)}`;
    return d.length >= 10 && d.length <= 15 ? d : null;
}
