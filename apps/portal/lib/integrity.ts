/**
 * Integrity under concurrency — the two primitives every state change uses.
 *
 * 1. Compare-and-set (`claimed`): a workflow step only happens if the record
 *    is STILL in the state the person saw. Written as
 *      claimed(await prisma.x.updateMany({ where: { id, status: 'EXPECTED' }, data }))
 *    If two people act at once, the database lets exactly one through; the
 *    other gets a plain "someone else changed this" message and nothing is
 *    written twice.
 *
 * 2. Row locks (`lockRows`): for totals that are checked and then added to
 *    (money paid against an estimate, stock reserved against what is on
 *    hand), the parent row is locked inside the transaction and the total is
 *    re-read under that lock — so two cashiers or two storekeepers cannot
 *    both pass the same check.
 *
 * Pure helpers live in ./integrity-core (unit-tested without a database).
 */
import { Prisma } from '@ejo/database';
import { LOCKABLE, lockStatement, StaleStateError, type LockTarget } from './integrity-core';

export { claimed, StaleStateError, STALE_MESSAGE } from './integrity-core';

type RawTx = { $queryRaw: (query: Prisma.Sql) => Promise<unknown> };

/** Lock rows (in a stable order, so two transactions never deadlock each other)
 * until the surrounding interactive transaction ends. Only whitelisted
 * table/column pairs can be named — nothing user-supplied reaches the SQL text. */
export async function lockRows(tx: RawTx, target: LockTarget, ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();
  if (unique.length === 0) return;
  const { table, column } = LOCKABLE[target];
  const sql = lockStatement(table, column);
  await tx.$queryRaw(Prisma.sql([sql.before, sql.after], unique));
}

/** Locks rows that must exist (a parent record): refuses if any are gone. */
export async function lockExisting(tx: RawTx, target: LockTarget, ids: string[], message?: string): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();
  if (unique.length === 0) return;
  const { table, column } = LOCKABLE[target];
  const sql = lockStatement(table, column);
  const rows = (await tx.$queryRaw(Prisma.sql([sql.before, sql.after], unique))) as unknown[];
  if (rows.length !== unique.length) throw new StaleStateError(message);
}
