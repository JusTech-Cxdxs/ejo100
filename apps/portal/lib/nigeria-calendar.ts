/**
 * Working days and Nigerian public holidays — for the calendar and the
 * booking form. Work runs Monday–Friday, 8 am – 5 pm (Lagos).
 *
 * Fixed-date holidays are exact; Easter holidays are calculated; the
 * Islamic holidays follow the moon and are declared by the Federal
 * Government shortly before — the dates here are the expected ones and are
 * marked "subject to FG declaration".
 */
export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 17;

export type Holiday = { name: string; provisional: boolean };

/** Easter Sunday (Gregorian), anonymous algorithm. */
function easter(year: number): { m: number; d: number } {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const shift = (y: number, m: number, d: number, days: number) => {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

/** Expected Islamic holidays (moon-sighting — confirmed by the FG). */
const ISLAMIC: Record<number, [string, string][]> = {
  2025: [['2025-03-31', 'Eid-el-Fitr'], ['2025-04-01', 'Eid-el-Fitr holiday'], ['2025-06-06', 'Eid-el-Kabir'], ['2025-06-09', 'Eid-el-Kabir holiday'], ['2025-09-05', 'Eid-el-Maulud']],
  2026: [['2026-03-20', 'Eid-el-Fitr'], ['2026-03-23', 'Eid-el-Fitr holiday'], ['2026-05-27', 'Eid-el-Kabir'], ['2026-05-28', 'Eid-el-Kabir holiday'], ['2026-08-26', 'Eid-el-Maulud']],
  2027: [['2027-03-10', 'Eid-el-Fitr'], ['2027-03-11', 'Eid-el-Fitr holiday'], ['2027-05-17', 'Eid-el-Kabir'], ['2027-05-18', 'Eid-el-Kabir holiday'], ['2027-08-16', 'Eid-el-Maulud']],
};

export function nigerianHolidays(year: number): Map<string, Holiday> {
  const out = new Map<string, Holiday>();
  const fixed: [number, number, string][] = [[1, 1, "New Year's Day"], [5, 1, "Workers' Day"], [6, 12, 'Democracy Day'], [10, 1, 'Independence Day'], [12, 25, 'Christmas Day'], [12, 26, 'Boxing Day']];
  for (const [m, d, name] of fixed) out.set(ymd(year, m, d), { name, provisional: false });
  const e = easter(year);
  out.set(shift(year, e.m, e.d, -2), { name: 'Good Friday', provisional: false });
  out.set(shift(year, e.m, e.d, 1), { name: 'Easter Monday', provisional: false });
  for (const [date, name] of ISLAMIC[year] ?? []) out.set(date, { name, provisional: true });
  return out;
}

/** "YYYY-MM-DD" of a moment, in Lagos. */
export function lagosYmd(d: Date): string {
  return new Date(new Date(d).getTime() + 3600000).toISOString().slice(0, 10);
}

export type DayKind = { weekend: boolean; holiday: Holiday | null; working: boolean };

export function dayKind(ymdStr: string): DayKind {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const holiday = nigerianHolidays(y!).get(ymdStr) ?? null;
  return { weekend, holiday, working: !weekend && !holiday };
}

/** Why a time may be a poor choice (weekend, holiday, outside 8–5), or null. */
export function timingNote(start: Date, end: Date): string | null {
  const k = dayKind(lagosYmd(start));
  if (k.holiday) return `${k.holiday.name}${k.holiday.provisional ? ' (date subject to FG declaration)' : ''} is a public holiday.`;
  if (k.weekend) return 'That is a weekend — outside working days.';
  const sh = new Date(start.getTime() + 3600000).getUTCHours() + new Date(start.getTime() + 3600000).getUTCMinutes() / 60;
  const eh = new Date(end.getTime() + 3600000).getUTCHours() + new Date(end.getTime() + 3600000).getUTCMinutes() / 60;
  if (sh < WORK_START_HOUR || eh > WORK_END_HOUR || lagosYmd(end) !== lagosYmd(start)) return 'That is outside working hours (8 am – 5 pm).';
  return null;
}
