/**
 * Working-day date math — Saturday and Sunday never count, matching
 * "use working days, not calendar days" for every deadline in the
 * approval-reminder and cancellation-collection-grace engine. Kept as
 * one small, dependency-free utility rather than pulling in a date
 * library for what's genuinely a two-function need.
 */

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday, Saturday
}

/** Number of whole working days that have elapsed between two dates —
 * `from` itself is never counted (a deadline set "today" hasn't had
 * any working days elapse yet), each subsequent weekday up to and
 * including `to`'s date is counted once. */
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

/** The calendar date `n` working days after `from` — used to show a
 * real due date, not just a day count, e.g. on a reminder email. */
export function addWorkingDays(from: Date, n: number): Date {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let added = 0;
  while (added < n) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) added += 1;
  }
  return cursor;
}
