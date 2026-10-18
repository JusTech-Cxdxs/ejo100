"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitHours = exports.STEP_INFO = exports.STEPS = void 0;
exports.reasonKey = reasonKey;
exports.readiness = readiness;
exports.stepPictures = stepPictures;
exports.featureNames = featureNames;
exports.trainingRow = trainingRow;
exports.decisionFeatures = decisionFeatures;
/**
 * How decisions are made here (pure, tested): every approval step of every
 * workflow — parts slips, outside purchases, Job Card and service approvals,
 * cancellations, estimates, warranty claims at the provider — as one decision
 * log (who asked, which role decided, how long it waited, approved or sent
 * back, and why). From it: the process picture (volume, approval rate, wait,
 * the reasons things are sent back, by role), the readiness of each step for
 * Enyo's help, and the de-identified training rows for the decision model.
 *
 * Nothing here decides anything. "Ready for Enyo" means a person could be
 * shown a suggestion first (shadow, then assist) — never that Enyo approves.
 */
const catalogue_1 = require("../authz/catalogue");
exports.STEPS = [
    'prs_hod', 'prs_store', 'epr_finance', 'epr_manager', 'job_card_approval', 'service_approval', 'job_cancellation', 'estimate_manager', 'warranty_provider',
];
exports.STEP_INFO = {
    prs_hod: { workflow: 'Parts requests', label: 'Head of department approval', href: '/workshop/parts-requests' },
    prs_store: { workflow: 'Parts requests', label: 'Store approval', href: '/workshop/parts-requests' },
    epr_finance: { workflow: 'Outside purchases', label: 'Finance review', href: '/workshop/external-procurement' },
    epr_manager: { workflow: 'Outside purchases', label: 'Manager approval', href: '/workshop/external-procurement' },
    job_card_approval: { workflow: 'Job Cards', label: 'Supervisor approval', href: '/approvals' },
    service_approval: { workflow: 'Vehicle services', label: 'Supervisor approval', href: '/approvals' },
    job_cancellation: { workflow: 'Job Cards', label: 'Cancellation decision', href: '/approvals' },
    estimate_manager: { workflow: 'Estimates', label: 'Manager approval', href: '/approvals' },
    warranty_provider: { workflow: 'Warranty claims', label: 'Provider’s decision', href: '/warranty/claims' },
};
const median = (xs) => {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p90 = (xs) => {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
};
const waitHours = (r) => (r.arrivedAt ? Math.max(0, (r.at.getTime() - r.arrivedAt.getTime()) / 3_600_000) : null);
exports.waitHours = waitHours;
/** A reason's gist for grouping: lower case, no punctuation or numbers, the first six words. */
function reasonKey(reason) {
    return reason.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'for', 'was', 'not', 'please', 'this', 'that', 'with'].includes(w)).slice(0, 6).join(' ');
}
const roleName = (r) => (r ? catalogue_1.ROLE_LABELS[r] ?? r : 'No role');
/** What Enyo could do for a step, from how it is decided today. */
function readiness(total, rejectionRate, medianWaitH, topReason) {
    if (total < 50 || rejectionRate === null)
        return { level: 'too_few', text: `Only ${total} decision${total === 1 ? '' : 's'} so far — Enyo keeps learning before suggesting anything.` };
    if (total >= 200 && rejectionRate <= 0.05 && (medianWaitH ?? 0) >= 4) {
        return { level: 'suggest', text: `Almost always approved (${Math.round((1 - rejectionRate) * 100)}%) yet waits ${Math.round(medianWaitH ?? 0)} h: Enyo could prepare these for a one-press approval — shown as a suggestion first, the decision stays with a person.` };
    }
    if (rejectionRate >= 0.2) {
        return { level: 'guide', text: `${Math.round(rejectionRate * 100)}% are sent back${topReason ? ` — most often “${topReason}”` : ''}: Enyo could check requests for this before they are sent, so fewer come back.` };
    }
    return { level: 'watch', text: 'Decided as usual — Enyo watches how it goes (shadow) before offering help.' };
}
function stepPictures(rows) {
    const out = [];
    for (const step of exports.STEPS) {
        const list = rows.filter((r) => r.step === step);
        if (!list.length)
            continue;
        const rejected = list.filter((r) => r.rejected).length;
        const waits = list.map(exports.waitHours).filter((w) => w !== null);
        const reasons = new Map();
        for (const r of list) {
            if (!r.rejected || !r.reason)
                continue;
            const k = reasonKey(r.reason);
            if (!k)
                continue;
            const e = reasons.get(k);
            if (e)
                e.count += 1;
            else
                reasons.set(k, { reason: r.reason.replace(/\s+/g, ' ').trim().slice(0, 120), count: 1 });
        }
        const group = (key) => {
            const m = new Map();
            for (const r of list) {
                const k = roleName(key(r));
                const e = m.get(k) ?? { n: 0, rej: 0 };
                e.n += 1;
                if (r.rejected)
                    e.rej += 1;
                m.set(k, e);
            }
            return [...m.entries()].map(([role, e]) => ({ role, count: e.n, rejectionRate: e.n ? e.rej / e.n : null })).sort((a, b) => b.count - a.count).slice(0, 6);
        };
        const rate = list.length ? rejected / list.length : null;
        const top = [...reasons.values()].sort((a, b) => b.count - a.count).slice(0, 5);
        const mw = median(waits);
        out.push({
            step, ...exports.STEP_INFO[step], total: list.length, rejected, rejectionRate: rate,
            medianWaitH: mw === null ? null : Math.round(mw * 10) / 10, p90WaitH: p90(waits) === null ? null : Math.round(p90(waits) * 10) / 10,
            reasons: top, byDecider: group((r) => r.deciderRole), byRequester: group((r) => r.requesterRole),
            readiness: readiness(list.length, rate, mw, top[0]?.reason ?? null),
        });
    }
    return out;
}
// ─────────────────────────────────────────────────────────── the model's rows and features
/**
 * The decision model's features, in order, for the steps and roles the model
 * was trained with (both are stored in the model, so the portal builds the
 * same vector the trainer did). Only what is known when a request ARRIVES at
 * the step — never the decider, the wait or the reason: the step, the
 * requester's role ("other" for a role the model has not seen), the amount,
 * the number of lines, and when it arrived (Lagos hour and weekday).
 */
function featureNames(steps, roles) {
    return [...steps.map((s) => `step:${s}`), ...roles.map((r) => `requester:${r}`), 'requester:other', 'log_amount', 'lines', 'hour', 'weekday', 'has_amount'];
}
const lagosParts = (d) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => p.find((x) => x.type === t)?.value ?? '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour').replace('24', '0')), weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1 };
};
/** De-identified: no names, no record ids or numbers, no reasons — the row id is a one-way hash made by the caller. */
function trainingRow(r, rowId) {
    const when = lagosParts(r.arrivedAt ?? r.at);
    const w = (0, exports.waitHours)(r);
    return {
        row_id: rowId, on: lagosParts(r.at).date, step: r.step, rejected: r.rejected ? 1 : 0, amount: Math.round(r.amount * 100) / 100, lines: r.lines,
        hour: when.hour, weekday: when.weekday, requester_role: r.requesterRole, decider_role: r.deciderRole, wait_hours: w === null ? null : Math.round(w * 100) / 100,
    };
}
/** The feature vector for one request arriving at a step (same order as featureNames). */
function decisionFeatures(x, steps, roles) {
    const v = new Array(featureNames(steps, roles).length).fill(0);
    const s = steps.indexOf(x.step);
    if (s >= 0)
        v[s] = 1;
    const r = x.requester_role ? roles.indexOf(x.requester_role) : -1;
    v[steps.length + (r >= 0 ? r : roles.length)] = 1;
    const base = steps.length + roles.length + 1;
    v[base] = Math.log1p(Math.max(0, x.amount));
    v[base + 1] = x.lines;
    v[base + 2] = x.hour;
    v[base + 3] = x.weekday;
    v[base + 4] = x.amount > 0 ? 1 : 0;
    return v;
}
