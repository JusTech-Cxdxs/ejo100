/**
 * Exports — how values are written into CSV and Excel files. Pure.
 *
 *  • Dates are real dates (Excel date cells; CSV "YYYY-MM-DD", or with the
 *    time "YYYY-MM-DD HH:MM"), in Lagos time — a moment never shifts a day.
 *  • Money is a number, with the currency in its own column.
 *  • Record numbers are text (SAP's leading zeros are kept).
 *  • Yes / No, never true / false.
 *  • Text that starts with = + - @ (or a tab / carriage return) cannot run as
 *    a formula: in CSV it gets a leading apostrophe; Excel cells are always
 *    plain text, so nothing typed into EJO runs when the file is opened.
 */

/** day: a calendar date stored as such (customer since, invoice date); date: the Lagos day of a moment; datetime: the moment, to the minute. */
export type ColumnType = 'text' | 'code' | 'int' | 'number' | 'money' | 'day' | 'date' | 'datetime' | 'bool' | 'link';

export type ExportColumn<R> = {
  header: string;
  type: ColumnType;
  /** Width in characters (Excel). */
  width?: number;
  get: (r: R) => unknown;
};

export type Cell = string | number | Date | boolean | null | undefined;

/** Neutralises a text cell for CSV (a leading apostrophe before = + - @ tab CR). */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

const LAGOS_MS = 3_600_000;
/** "YYYY-MM-DD" in Lagos for a moment (a "YYYY-MM-DD" string or a date-only value is taken as the day itself). */
export function lagosDay(v: Date | string): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v.getTime() + LAGOS_MS).toISOString().slice(0, 10);
}
export function lagosDateTime(v: Date): string {
  return new Date(v.getTime() + LAGOS_MS).toISOString().slice(0, 16).replace('T', ' ');
}
/** The Excel serial day of a Lagos moment (1900 system). */
export function excelSerial(v: Date, withTime: boolean): number {
  const local = v.getTime() + LAGOS_MS;
  const days = local / 86_400_000 + 25569;
  return withTime ? Math.round(days * 86_400) / 86_400 : Math.floor(days);
}
/** A date-only value (stored at UTC midnight) as its Excel serial day. */
export function excelDaySerial(v: Date): number {
  return Math.floor(v.getTime() / 86_400_000) + 25569;
}

const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) { const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
};
const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
};

/** A value as it goes into a CSV cell (already neutralised; quoting is the writer's). */
export function csvValue(type: ColumnType, v: unknown): string {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'int': case 'number': { const n = asNumber(v); return n === null ? '' : String(type === 'int' ? Math.round(n) : n); }
    case 'money': { const n = asNumber(v); return n === null ? '' : n.toFixed(2); }
    case 'day': { const d = asDate(v); return d ? d.toISOString().slice(0, 10) : ''; }
    case 'date': { const d = asDate(v); return d ? (typeof v === 'string' ? d.toISOString().slice(0, 10) : lagosDay(d)) : ''; }
    case 'datetime': { const d = asDate(v); return d ? lagosDateTime(d) : ''; }
    case 'bool': return v ? 'Yes' : 'No';
    default: return safeText(String(v));
  }
}

export function csvLine(cells: string[]): string {
  return `${cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')}\r\n`;
}

/** Excel's row limit (with the header row). */
export const EXCEL_MAX_DATA_ROWS = 1_048_575;

/** A file name: "EJO-customers-2026-11-01-EXP-2026-000012.xlsx". */
export function exportFileName(kind: string, number: string, format: 'xlsx' | 'csv', now = new Date()): string {
  return `EJO-${kind}-${lagosDay(now)}-${number}.${format}`;
}
