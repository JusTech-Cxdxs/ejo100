"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lastCompleteWeek = lastCompleteWeek;
exports.completeWeeksSince = completeWeeksSince;
exports.weeklySeries = weeklySeries;
/**
 * Shaping the parts training set: consumption events → one weekly series per
 * part (Lagos weeks, Monday first, oldest first). Pure: tested in
 * tests/enyo-ml.test.ts.
 */
const learning_core_1 = require("../predict/learning-core");
const WEEK = 7 * 86_400_000;
const LAGOS = 3_600_000;
/** The Monday (Lagos date) of the last COMPLETE week before `now`. */
function lastCompleteWeek(now) {
    return new Date((0, learning_core_1.lagosWeekStart)(now).getTime() - WEEK);
}
/**
 * How many complete Lagos weeks (Monday to Sunday) lie wholly on or after
 * `since`, up to the last complete week before `now`. 0 when none yet.
 */
function completeWeeksSince(since, now) {
    const start = (0, learning_core_1.lagosWeekStart)(since).getTime();
    const firstFull = start === since.getTime() ? start : start + WEEK;
    const last = lastCompleteWeek(now).getTime();
    return last < firstFull ? 0 : Math.round((last - firstFull) / WEEK) + 1;
}
/**
 * `weeks` complete weeks ending with the last complete one. Every part in
 * `partIds` gets a series (zeros when never used); events outside the window
 * or for other parts are ignored.
 */
function weeklySeries(partIds, events, weeks, now) {
    const last = lastCompleteWeek(now).getTime();
    const first = last - (weeks - 1) * WEEK;
    const series = new Map(partIds.map((id) => [id, new Array(weeks).fill(0)]));
    for (const e of events) {
        const s = series.get(e.partId);
        if (!s || !(e.quantity > 0))
            continue;
        const w = (0, learning_core_1.lagosWeekStart)(e.at).getTime();
        if (w < first || w > last)
            continue;
        const i = Math.round((w - first) / WEEK);
        s[i] = Math.round((s[i] + e.quantity) * 10_000) / 10_000;
    }
    const asOf = new Date(last + LAGOS).toISOString().slice(0, 10);
    return [...series.entries()].map(([id, weekly]) => ({ part_id: id, weekly, as_of: asOf }));
}
