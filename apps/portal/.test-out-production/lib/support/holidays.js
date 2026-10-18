"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIsoDay = exports.HOLIDAY_CALENDARS = void 0;
exports.asCalendar = asCalendar;
exports.holidayEntries = holidayEntries;
exports.effectiveHolidays = effectiveHolidays;
/**
 * The Support centre's closed days (pure, tested): the country calendar
 * worked out each year (Nigeria: fixed dates, Easter, the Islamic holidays
 * and the usual Monday off when a fixed holiday falls on a weekend), plus the
 * organisation's own extra closed days, minus any calendar day it chose to
 * open on. Nobody types the public holidays in.
 */
const nigeria_calendar_1 = require("../nigeria-calendar");
exports.HOLIDAY_CALENDARS = { NG: 'Nigeria (public holidays, worked out every year)' };
function asCalendar(v) {
    return v === 'NG' ? 'NG' : null;
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDay = (d) => typeof d === 'string' && ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
exports.isIsoDay = isIsoDay;
/** Every calendar holiday and extra closed day in the given years, by date, with whether the organisation opens anyway. */
function holidayEntries(calendar, custom, openOn, years) {
    const out = new Map();
    const opened = new Set(openOn.filter(exports.isIsoDay));
    if (calendar === 'NG') {
        for (const y of years) {
            for (const [date, h] of (0, nigeria_calendar_1.nigerianHolidays)(y, { observed: true }))
                out.set(date, { date, name: h.name, source: 'calendar', provisional: h.provisional, open: opened.has(date) });
        }
    }
    for (const d of custom.filter(exports.isIsoDay)) {
        if (!years.includes(Number(d.slice(0, 4))))
            continue;
        // The organisation's own closed day wins over a calendar entry on the same date (closed whatever the calendar says).
        const cal = out.get(d);
        out.set(d, { date: d, name: cal ? `${cal.name} (also the organisation’s own closed day)` : 'Closed (the organisation’s own day)', source: 'custom', provisional: false, open: false });
    }
    return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
/** The closed days the targets and opening-hours checks use: around `now` (last year to next year). */
function effectiveHolidays(calendar, custom, openOn, now = new Date()) {
    const y = Number(new Date(now.getTime() + 3_600_000).toISOString().slice(0, 4));
    return holidayEntries(calendar, custom, openOn, [y - 1, y, y + 1]).filter((h) => !h.open).map((h) => h.date);
}
