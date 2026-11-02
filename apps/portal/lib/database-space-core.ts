/**
 * Database space against the hosting plan's limit — the rules, with no
 * database access (lib/database-space.ts reads the size).
 *
 * The free database plan (Supabase Free) allows 500 MB; past it the database
 * turns read-only and nothing can be saved until space is freed or the plan
 * grows. EJO therefore watches its own size: imports that would not fit are
 * refused before they start, a load that runs the database close to full
 * pauses (it can be resumed once there is room), and administrators are told
 * well before the limit.
 *
 * DATABASE_SPACE_LIMIT_MB sets the limit (default 500, the free plan).
 * Set it to 0 on a plan with no practical limit to switch the checks off.
 */

export const DEFAULT_LIMIT_MB = 500;
const MB = 1024 * 1024;

/** Above this share of the limit administrators are warned. */
export const WARN_AT = 0.8;
/** An import must leave the database below this share of the limit. */
export const IMPORT_CEILING = 0.95;
/** A load in progress pauses at this share (the last few per cent are kept for daily work). */
export const PAUSE_AT = 0.97;

/**
 * Bytes one loaded record takes, including its audit-journal entry and its
 * indexes (the journal is append-only, so this space never comes back).
 * Measured on Postgres 16 with 50,000 SAP parts: about 1.7 KB a part; the
 * others are set from how many rows each record writes, rounded up.
 */
export const BYTES_PER_RECORD: Record<string, number> = {
  customers: 2_500,
  vehicles: 2_500,
  parts: 2_000,
  suppliers: 2_000,
  stock: 5_000, // goods-receipt line, batch, movement, each journaled
  invoices: 4_000, // invoice and its lines
  registers: 3_000,
};
/** Bytes one staged row of an uploaded file takes (measured: about 400 B for an 8-column SAP line; wide files more). */
export const BYTES_PER_STAGED_ROW = 600;

/** The plan's limit in bytes, or null when no limit is set. */
export function spaceLimitBytes(raw: string | undefined = process.env.DATABASE_SPACE_LIMIT_MB): number | null {
  const text = String(raw ?? '').trim();
  if (text === '') return DEFAULT_LIMIT_MB * MB;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LIMIT_MB * MB;
  if (n === 0) return null;
  return Math.round(n * MB);
}

export type SpaceLevel = 'ok' | 'warn' | 'full' | 'unlimited';

export type Space = { usedBytes: number; limitBytes: number | null; share: number | null; level: SpaceLevel; freeBytes: number | null };

export function spaceOf(usedBytes: number, limitBytes: number | null): Space {
  const used = Math.max(0, Math.round(usedBytes));
  if (!limitBytes) return { usedBytes: used, limitBytes: null, share: null, level: 'unlimited', freeBytes: null };
  const share = used / limitBytes;
  return { usedBytes: used, limitBytes, share, level: share >= IMPORT_CEILING ? 'full' : share >= WARN_AT ? 'warn' : 'ok', freeBytes: Math.max(0, limitBytes - used) };
}

export function mb(bytes: number): string {
  const v = bytes / MB;
  return `${v >= 100 ? Math.round(v).toLocaleString('en-NG') : v.toFixed(v >= 10 ? 0 : 1)} MB`;
}

/** How many more records of a kind fit below the import ceiling. */
export function recordsThatFit(space: Space, entity: string): number | null {
  if (!space.limitBytes) return null;
  const room = space.limitBytes * IMPORT_CEILING - space.usedBytes;
  return Math.max(0, Math.floor(room / (BYTES_PER_RECORD[entity] ?? 3_000)));
}

/** The space an import of `rows` records needs once loaded. */
export function importNeedsBytes(entity: string, rows: number): number {
  return Math.max(0, Math.round(rows)) * (BYTES_PER_RECORD[entity] ?? 3_000);
}

/**
 * Whether loading `rows` records of `entity` leaves the database below the
 * ceiling. The message says what to do, in plain words.
 */
export function importFits(space: Space, entity: string, rows: number, plural = 'records'): { ok: true } | { ok: false; message: string } {
  if (!space.limitBytes) return { ok: true };
  const need = importNeedsBytes(entity, rows);
  if (space.usedBytes + need <= space.limitBytes * IMPORT_CEILING) return { ok: true };
  const fit = recordsThatFit(space, entity) ?? 0;
  return {
    ok: false,
    message: `Not enough database space. Loading ${rows.toLocaleString('en-NG')} ${plural} needs about ${mb(need)}, and the database has ${mb(space.usedBytes)} of its ${mb(space.limitBytes)} plan in use`
      + ` (about ${fit.toLocaleString('en-NG')} more ${plural} fit). Load a smaller file, release finished imports’ staged files, or move the database to a bigger plan first.`,
  };
}

/** Whether another block of staged rows may be taken in (the upload refuses when the database is nearly full). */
export function stagingFits(space: Space, rows: number): { ok: true } | { ok: false; message: string } {
  if (!space.limitBytes) return { ok: true };
  if (space.usedBytes + rows * BYTES_PER_STAGED_ROW <= space.limitBytes * IMPORT_CEILING) return { ok: true };
  return { ok: false, message: `The database is nearly full (${mb(space.usedBytes)} of its ${mb(space.limitBytes)} plan), so the file cannot be taken in. Release finished imports’ staged files or move the database to a bigger plan, then upload it again.` };
}

/** Whether a load in progress should pause now. */
export function shouldPauseLoad(space: Space): boolean {
  return !!space.limitBytes && space.usedBytes >= space.limitBytes * PAUSE_AT;
}

export const PAUSED_FOR_SPACE = 'Paused: the database is nearly full.';
