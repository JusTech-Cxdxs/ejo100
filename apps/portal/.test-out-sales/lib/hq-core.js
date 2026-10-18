"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HQ_PERIODS = void 0;
exports.hqPeriod = hqPeriod;
exports.median = median;
exports.branchHealth = branchHealth;
exports.csvCell = csvCell;
exports.toCsv = toCsv;
/**
 * Headquarters (pure, tested): the reporting periods, how a branch's health is
 * judged, and the CSV export. No database access here.
 */
const nigeria_calendar_1 = require("./nigeria-calendar");
exports.HQ_PERIODS = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_quarter', label: 'This quarter' },
    { key: 'this_year', label: 'This year' },
];
/** The period as Lagos calendar dates: [from, to). Unknown keys mean this month. */
function hqPeriod(key, now = new Date()) {
    const k = (exports.HQ_PERIODS.some((p) => p.key === key) ? key : 'this_month');
    const ymd = (0, nigeria_calendar_1.lagosYmd)(now);
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(5, 7));
    const at = (yy, mm) => new Date(`${yy}-${String(mm).padStart(2, '0')}-01T00:00:00+01:00`);
    const tomorrow = new Date(new Date(`${ymd}T00:00:00+01:00`).getTime() + 86_400_000);
    const month = (d) => d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' });
    if (k === 'last_month') {
        const ly = m === 1 ? y - 1 : y;
        const lm = m === 1 ? 12 : m - 1;
        return { key: k, from: at(ly, lm), to: at(y, m), label: month(at(ly, lm)) };
    }
    if (k === 'this_quarter') {
        const qm = Math.floor((m - 1) / 3) * 3 + 1;
        return { key: k, from: at(y, qm), to: tomorrow, label: `Q${Math.floor((m - 1) / 3) + 1} ${y} to date` };
    }
    if (k === 'this_year')
        return { key: k, from: at(y, 1), to: tomorrow, label: `${y} to date` };
    return { key: k, from: at(y, m), to: tomorrow, label: `${month(at(y, m))} to date` };
}
function median(xs) {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/**
 * A branch needs action when a decision has waited two days or more, or a
 * customer request is past its target; it needs watching when vehicles are
 * piling up ready to collect or jobs take more than three days door to door.
 */
function branchHealth(b) {
    const act = [];
    const watch = [];
    if ((b.oldestWaitingHours ?? 0) >= 48)
        act.push(`a decision has waited ${Math.round((b.oldestWaitingHours ?? 0) / 24)} days`);
    if (b.supportLate > 0)
        act.push(`${b.supportLate} customer ${b.supportLate === 1 ? 'request' : 'requests'} past target`);
    if (b.ready >= 5)
        watch.push(`${b.ready} vehicles waiting to be collected`);
    if ((b.turnaroundHours ?? 0) > 72)
        watch.push(`jobs take ${Math.round((b.turnaroundHours ?? 0) / 24)} days door to door`);
    if (act.length)
        return { tone: 'act', label: 'Needs action', reasons: [...act, ...watch] };
    if (watch.length)
        return { tone: 'watch', label: 'Watch', reasons: watch };
    return { tone: 'good', label: 'On track', reasons: [] };
}
/**
 * A CSV cell, quoted, with spreadsheet formulas neutralised: a value starting
 * with = + - @ (or a tab / carriage return) is prefixed with ' so a name
 * typed into the system can never run as a formula in Excel.
 */
function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))
        s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}
function toCsv(header, rows) {
    // A byte-order mark so Excel opens ₦ and accented names correctly.
    return `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
