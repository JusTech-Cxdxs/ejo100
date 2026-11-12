/**
 * A4c3 — scheduled exports. Pure, with no imports (the form uses it): how
 * often, which day, and the next day one is due — whole days in Lagos, which
 * keeps no daylight-saving time, so a day is a day.
 */
export const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Cadence = (typeof CADENCES)[number];
export const isCadence = (c: unknown): c is Cadence => typeof c === 'string' && (CADENCES as readonly string[]).includes(c);
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Schedules one person may keep running. */
export const MAX_SCHEDULES = 10;

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
/** "Every Monday" · "Every day" · "On the 1st of every month". */
export function cadenceWords(c: { cadence: string; dayOfWeek: number | null; dayOfMonth: number | null }): string {
  if (c.cadence === 'WEEKLY') return `Every ${WEEKDAYS[(c.dayOfWeek ?? 1) - 1] ?? 'Monday'}`;
  if (c.cadence === 'MONTHLY') return `On the ${ordinal(c.dayOfMonth ?? 1)} of every month`;
  return 'Every day';
}

/** The day choice a cadence needs: a weekday 1–7, a day of the month 1–28 (every month has one), or none. */
export function checkWhen(cadence: unknown, dayOfWeek: unknown, dayOfMonth: unknown): { ok: true; cadence: Cadence; dayOfWeek: number | null; dayOfMonth: number | null } | { ok: false; error: string } {
  if (!isCadence(cadence)) return { ok: false, error: 'Choose how often.' };
  if (cadence === 'WEEKLY') {
    const d = Number(dayOfWeek);
    return Number.isInteger(d) && d >= 1 && d <= 7 ? { ok: true, cadence, dayOfWeek: d, dayOfMonth: null } : { ok: false, error: 'Choose the day of the week.' };
  }
  if (cadence === 'MONTHLY') {
    const d = Number(dayOfMonth);
    return Number.isInteger(d) && d >= 1 && d <= 28 ? { ok: true, cadence, dayOfWeek: null, dayOfMonth: d } : { ok: false, error: 'Choose a day of the month from 1 to 28 (every month has those).' };
  }
  return { ok: true, cadence, dayOfWeek: null, dayOfMonth: null };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const plus = (day: string, n: number) => iso(new Date(at(day).getTime() + n * 86_400_000));

/**
 * The first day strictly after `after` (YYYY-MM-DD) on which the schedule is
 * due: tomorrow; the next such weekday; the next such day of a month.
 */
export function nextRunAfter(c: { cadence: string; dayOfWeek: number | null; dayOfMonth: number | null }, after: string): string {
  if (c.cadence === 'WEEKLY') {
    const want = c.dayOfWeek ?? 1;
    for (let i = 1; i <= 7; i++) { const d = plus(after, i); if ((at(d).getUTCDay() || 7) === want) return d; }
  }
  if (c.cadence === 'MONTHLY') {
    const want = String(c.dayOfMonth ?? 1).padStart(2, '0');
    const thisMonth = `${after.slice(0, 8)}${want}`;
    if (thisMonth > after) return thisMonth;
    const a = at(after);
    return `${iso(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1))).slice(0, 8)}${want}`;
  }
  return plus(after, 1);
}
