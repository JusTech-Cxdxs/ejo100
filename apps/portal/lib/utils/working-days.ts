/**
 * Working-day date maths: Saturday and Sunday never count. Used for every
 * approval, reminder and collection deadline.
 */

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday, Saturday
}

/** Whole working days elapsed between two dates. `from` itself is not
 * counted; each weekday after it, up to and including `to`, counts once. */
export function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

/** The calendar date `n` working days after `from` (e.g. a due date in an email). */
export function addWorkingDays(from: Date, n: number): Date {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let added = 0;
  while (added < n) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) added += 1;
  }
  return cursor;
}

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Saturday or Sunday by the calendar in Lagos — not UTC, so a late
 * Friday night in UTC is never mistaken for Saturday. */
export function isLagosWeekend(date: Date): boolean {
  const day = new Date(date.getTime() + LAGOS_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The same moment if it falls on a working day (Mon–Fri, Lagos), otherwise
 * the following Monday at the same time, so reminders and due dates land
 * on days the team is in.
 */
export function onOrAfterWorkingDay(date: Date): Date {
  const d = new Date(date.getTime());
  while (isLagosWeekend(d)) d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  return d;
}
