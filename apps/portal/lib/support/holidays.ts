/**
 * The Support centre's closed days (pure, tested): the country calendar
 * worked out each year (Nigeria: fixed dates, Easter, the Islamic holidays
 * and the usual Monday off when a fixed holiday falls on a weekend), plus the
 * organisation's own extra closed days, minus any calendar day it chose to
 * open on. Nobody types the public holidays in.
 */
import { nigerianHolidays } from '../nigeria-calendar';

export const HOLIDAY_CALENDARS = { NG: 'Nigeria (public holidays, worked out every year)' } as const;
export type HolidayCalendar = keyof typeof HOLIDAY_CALENDARS;

export function asCalendar(v: unknown): HolidayCalendar | null {
  return v === 'NG' ? 'NG' : null;
}

export type HolidayEntry = { date: string; name: string; source: 'calendar' | 'custom'; provisional: boolean; open: boolean };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDay = (d: unknown): d is string => typeof d === 'string' && ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Every calendar holiday and extra closed day in the given years, by date, with whether the organisation opens anyway. */
export function holidayEntries(calendar: HolidayCalendar | null, custom: string[], openOn: string[], years: number[]): HolidayEntry[] {
  const out = new Map<string, HolidayEntry>();
  const opened = new Set(openOn.filter(isIsoDay));
  if (calendar === 'NG') {
    for (const y of years) {
      for (const [date, h] of nigerianHolidays(y, { observed: true })) out.set(date, { date, name: h.name, source: 'calendar', provisional: h.provisional, open: opened.has(date) });
    }
  }
  for (const d of custom.filter(isIsoDay)) {
    if (!years.includes(Number(d.slice(0, 4)))) continue;
    if (!out.has(d)) out.set(d, { date: d, name: 'Closed (the organisation’s own day)', source: 'custom', provisional: false, open: false });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The closed days the targets and opening-hours checks use: around `now` (last year to next year). */
export function effectiveHolidays(calendar: HolidayCalendar | null, custom: string[], openOn: string[], now: Date = new Date()): string[] {
  const y = Number(new Date(now.getTime() + 3_600_000).toISOString().slice(0, 4));
  return holidayEntries(calendar, custom, openOn, [y - 1, y, y + 1]).filter((h) => !h.open).map((h) => h.date);
}
