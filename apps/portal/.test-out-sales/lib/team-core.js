"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATING_LABEL = exports.STANDARDS = void 0;
exports.summariseTeam = summariseTeam;
/**
 * Team performance (pure, tested): how each person handles the steps that
 * wait on them — how many, how fast (median hours from the moment it reached
 * them), the share done within the standard, and the money involved.
 */
const hq_core_1 = require("./hq-core");
/** The service standard for each kind of step, in working-clock hours. */
exports.STANDARDS = {
    job: { label: 'Job, work started to finished', hours: 72 },
    estimateCheck: { label: 'Estimate checked by the supervisor', hours: 24 },
    estimateFinal: { label: 'Estimate final approval', hours: 24 },
    partsHod: { label: 'Parts request, manager approval', hours: 8 },
    partsStore: { label: 'Parts request, Store approval', hours: 8 },
    partsRelease: { label: 'Parts released after approval', hours: 8 },
    eprReview: { label: 'Outside purchase, Finance review', hours: 24 },
    eprApprove: { label: 'Outside purchase, manager approval', hours: 24 },
    eprPay: { label: 'Outside purchase, paid out after approval', hours: 24 },
};
const hours = (a, b) => (a ? Math.max(0, (b.getTime() - a.getTime()) / 3_600_000) : null);
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
/**
 * Per person: totals across every kind of step, and each kind on its own.
 * Rating: "attention" when under 60% within the standard (with at least three
 * steps) or rework on more than a fifth of finished jobs; "strong" when 90%
 * or more within the standard on at least five; "quiet" when nothing handled.
 */
function summariseTeam(items, people, openNow = new Map()) {
    const byUser = new Map();
    for (const h of items)
        if (h.userId)
            byUser.set(h.userId, [...(byUser.get(h.userId) ?? []), h]);
    return people.map((p) => {
        const mine = byUser.get(p.id) ?? [];
        const kinds = [...new Set(mine.map((h) => h.kind))];
        const steps = kinds.map((k) => {
            const xs = mine.filter((h) => h.kind === k);
            const hs = xs.map((h) => hours(h.from, h.to)).filter((v) => v !== null);
            const within = hs.filter((v) => v <= exports.STANDARDS[k].hours).length;
            return { kind: k, label: exports.STANDARDS[k].label, count: xs.length, medianHours: round1((0, hq_core_1.median)(hs)), withinPct: hs.length ? Math.round((within / hs.length) * 100) : null, standardHours: exports.STANDARDS[k].hours };
        }).sort((a, b) => b.count - a.count);
        const all = [];
        for (const h of mine) {
            const v = hours(h.from, h.to);
            if (v !== null)
                all.push({ h: v, std: exports.STANDARDS[h.kind].hours });
        }
        const withinPct = all.length ? Math.round((all.filter((x) => x.h <= x.std).length / all.length) * 100) : null;
        const jobs = mine.filter((h) => h.kind === 'job');
        const rework = jobs.filter((h) => h.rework).length;
        const rating = !mine.length ? 'quiet'
            : (withinPct !== null && all.length >= 3 && withinPct < 60) || (jobs.length >= 3 && rework / jobs.length > 0.2) ? 'attention'
                : withinPct !== null && all.length >= 5 && withinPct >= 90 ? 'strong' : 'steady';
        return {
            userId: p.id, name: p.name, roles: p.roles, branch: p.branch,
            handled: mine.length, value: Math.round(mine.reduce((n, h) => n + (h.value ?? 0), 0)), rework, openNow: openNow.get(p.id) ?? 0,
            medianHours: round1((0, hq_core_1.median)(all.map((x) => x.h))), withinPct, steps, rating,
        };
    }).sort((a, b) => b.handled - a.handled || a.name.localeCompare(b.name));
}
exports.RATING_LABEL = { strong: 'Strong', steady: 'Steady', attention: 'Needs attention', quiet: 'Nothing this period' };
