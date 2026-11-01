/**
 * Data Exchange — calendar days as SAP, Excel and people write them. Pure.
 */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * A calendar day as SAP, Excel and people write it, as "YYYY-MM-DD":
 *  • SAP internal format 20190314 (ERDAT, FKDAT, BUDAT as exported raw);
 *  • ISO 2019-03-14 (and Excel dates, which the reader turns into ISO);
 *  • SAP's German display 14.03.2019; Nigerian 14/03/2019 or 14-03-2019
 *    (day first: a month first, as in the US, is only taken when the day
 *    could not be a month, e.g. 03/14/2019);
 *  • 14 Mar 2019, 14-MAR-19, March 14, 2019.
 * Two-digit years are 19xx above 50, otherwise 20xx. Null when it is not a
 * real day (31 June, 00000000 — SAP's "no date").
 */
export function parseDay(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s || /^0+$/.test(s)) return null;
  const valid = (y: number, m: number, d: number): string | null => {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(y, m, d) : null;
  };
  const year = (y: string) => (y.length === 2 ? (Number(y) > 50 ? 1900 : 2000) + Number(y) : Number(y));
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return valid(+m[1]!, +m[2]!, +m[3]!);
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/))) return valid(+m[1]!, +m[2]!, +m[3]!);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/))) {
    const a = +m[1]!; const b = +m[2]!; const y = year(m[3]!);
    return b > 12 && a <= 12 ? valid(y, a, b) : valid(y, b, a);
  }
  if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-,]+(\d{2}|\d{4})$/))) {
    const mo = MONTHS[m[2]!.slice(0, m[2]!.toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()];
    return mo ? valid(year(m[3]!), mo, +m[1]!) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    return mo ? valid(+m[3]!, mo, +m[2]!) : null;
  }
  return null;
}

/** Today in Lagos as "YYYY-MM-DD" (a date in the file may not be later than this). */
export function lagosToday(now = new Date()): string {
  return new Date(now.getTime() + 3600_000).toISOString().slice(0, 10);
}
