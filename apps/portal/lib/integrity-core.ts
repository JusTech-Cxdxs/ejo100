/**
 * Pure, database-free half of lib/integrity.ts — kept separate so it can be
 * unit-tested in CI without a database or the Prisma client.
 */

export const STALE_MESSAGE = 'Someone else changed this just now — refresh the page to see the latest, then try again.';

/** A workflow step lost a race (or was clicked twice): nothing was written. */
export class StaleStateError extends Error {
  constructor(message: string = STALE_MESSAGE) {
    super(message);
    this.name = 'StaleStateError';
  }
}

/** Compare-and-set result check: exactly the rows we expected must have moved. */
export function claimed(result: { count: number }, message?: string, expected = 1): void {
  if (result.count !== expected) throw new StaleStateError(message);
}

/** The only tables/columns lockRows may name. Values are literal SQL identifiers. */
export const LOCKABLE = {
  jobCard: { table: 'job_cards', column: 'id' },
  vehicleService: { table: 'vehicle_services', column: 'id' },
  partStockByPart: { table: 'part_stock', column: 'partId' },
  warrantyClaim: { table: 'warranty_claims', column: 'id' },
  user: { table: 'users', column: 'id' },
  meetingRoom: { table: 'meeting_rooms', column: 'id' },
  role: { table: 'roles', column: 'id' },
  partRequestSlip: { table: 'part_request_slips', column: 'id' },
  customerVehicle: { table: 'customer_vehicles', column: 'id' },
} as const;
export type LockTarget = keyof typeof LOCKABLE;

const IDENT = /^[a-z_][a-zA-Z0-9_]*$/;

/** The ids a lock statement is given: unique, non-empty, in one fixed order —
 * two transactions locking the same rows always queue, never deadlock. */
export function lockIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean))).sort();
}

/** SELECT … FOR UPDATE text around a single array parameter (ids). Identifiers
 * are validated even though they only ever come from LOCKABLE. */
export function lockStatement(table: string, column: string): { before: string; after: string } {
  if (!IDENT.test(table) || !IDENT.test(column)) throw new Error('lockRows: invalid identifier');
  return {
    before: `SELECT "${column}" FROM "${table}" WHERE "${column}" = ANY(`,
    after: `::text[]) ORDER BY "${column}" FOR UPDATE`,
  };
}

/** Was this error a unique-constraint clash on the given column? */
export function isUniqueClashOn(err: unknown, column: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).includes(column));
  return typeof target === 'string' && target.includes(column);
}

/** Human reference numbers (RF-2026-000123 …) are "latest + 1": two people
 * saving at the same instant can pick the same one. The unique constraint
 * keeps the data correct; this re-runs the whole attempt (number included)
 * so the second person simply gets the next number instead of an error. */
export async function retryOnNumberClash<T>(column: string, attempt: () => Promise<T>, tries = NUMBER_CLASH_TRIES): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i < tries && isUniqueClashOn(err, column)) {
        await numberClashPause(i);
        continue;
      }
      throw err;
    }
  }
}

/** A burst of people saving at once (CONC-01: 15 at the same instant) would
 * otherwise all re-read the same "latest" number again and clash again. A
 * short, growing, random pause spreads the retries out, so everyone gets a
 * number instead of an error. */
export const NUMBER_CLASH_TRIES = 10;
export function numberClashPause(attempt: number): Promise<void> {
  const ms = Math.round(Math.random() * 40 * Math.min(attempt, 6)) + 5;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Money is compared in whole kobo/cents so float drift never lets ₦0.01 through. */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

/** Would adding `amount` to what is already paid exceed the total? (minor units) */
export function exceedsBalance(alreadyPaid: number, amount: number, total: number): boolean {
  return toMinor(alreadyPaid) + toMinor(amount) > toMinor(total);
}
