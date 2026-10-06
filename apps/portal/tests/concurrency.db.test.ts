/**
 * "Two users at once" — against a REAL PostgreSQL, with real parallel
 * connections. Runs when TEST_DATABASE_URL is set (CI starts a Postgres
 * service for it); skipped otherwise so `npm test` works without a database.
 *
 * It exercises the exact SQL the app uses: the row-lock statement built by
 * lib/integrity-core.ts (lockStatement), and the compare-and-set shape that
 * Prisma's updateMany produces (UPDATE … WHERE id = $1 AND status = $2).
 * A pg_sleep between "check" and "write" forces the worst interleaving, so
 * each test would fail without the protection — the first test proves it.
 *
 * Everything happens in a throwaway schema that is dropped afterwards.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, type PoolClient } from 'pg';
import { lockStatement, lockIds, LOCKABLE } from '../lib/integrity-core';

const URL = process.env.TEST_DATABASE_URL;
const skip = !URL;
const SCHEMA = `itest_${process.pid}_${Date.now()}`;
let pool: Pool;

const lockSql = (target: keyof typeof LOCKABLE) => {
  const { table, column } = LOCKABLE[target];
  const s = lockStatement(table, column);
  return `${s.before}$1${s.after}`;
};

/** Run fn in its own transaction on its own connection (one "user"). */
async function asUser<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`SET search_path TO ${SCHEMA}`);
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: URL, max: 30 });
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
  await pool.query(`
    SET search_path TO ${SCHEMA};
    CREATE TABLE job_cards (id text PRIMARY KEY, status text NOT NULL, total numeric NOT NULL);
    CREATE TABLE payments (id serial PRIMARY KEY, "jobCardId" text NOT NULL, amount numeric NOT NULL);
    CREATE TABLE part_stock ("partId" text PRIMARY KEY, "quantityOnHand" numeric NOT NULL, "quantityReserved" numeric NOT NULL DEFAULT 0);
    CREATE TABLE meeting_rooms (id text PRIMARY KEY);
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE appointments (id serial PRIMARY KEY, "roomId" text, "ownerId" text, "startsAt" timestamptz, "endsAt" timestamptz, status text NOT NULL DEFAULT 'SCHEDULED');
  `);
});

after(async () => {
  if (skip) return;
  await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await pool.end();
});

/** Record a payment the way recordPayment does: lock (optionally), re-read, check, insert. */
async function pay(jobCardId: string, amount: number, withLock: boolean): Promise<boolean> {
  return asUser(async (c) => {
    if (withLock) await c.query(lockSql('jobCard'), [[jobCardId]]);
    const { rows } = await c.query('SELECT j.total, COALESCE((SELECT sum(amount) FROM payments WHERE "jobCardId" = j.id), 0) AS paid FROM job_cards j WHERE j.id = $1', [jobCardId]);
    const total = Math.round(Number(rows[0].total) * 100);
    const paid = Math.round(Number(rows[0].paid) * 100);
    await c.query('SELECT pg_sleep(0.05)'); // the worst moment for a second cashier to arrive
    if (paid + Math.round(amount * 100) > total) return false;
    await c.query('INSERT INTO payments ("jobCardId", amount) VALUES ($1, $2)', [jobCardId, amount]);
    return true;
  });
}

test('control: WITHOUT the lock, ten cashiers at once overpay (proves the test can see the race)', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.job_cards VALUES ('jc-race', 'IN_PROGRESS', 12000)`);
  await Promise.all(Array.from({ length: 10 }, () => pay('jc-race', 5000, false)));
  const { rows } = await pool.query(`SELECT sum(amount) AS s FROM ${SCHEMA}.payments WHERE "jobCardId" = 'jc-race'`);
  assert.ok(Number(rows[0].s) > 12000, `expected an overpayment without the lock, got ${rows[0].s}`);
});

test('payments: WITH the lock, ten cashiers at once can never exceed the estimate', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.job_cards VALUES ('jc-1', 'IN_PROGRESS', 12000)`);
  const results = await Promise.all(Array.from({ length: 10 }, () => pay('jc-1', 5000, true)));
  const { rows } = await pool.query(`SELECT sum(amount) AS s, count(*) AS n FROM ${SCHEMA}.payments WHERE "jobCardId" = 'jc-1'`);
  assert.equal(Number(rows[0].s), 10000);
  assert.equal(Number(rows[0].n), 2);
  assert.equal(results.filter(Boolean).length, 2);
});

test('compare-and-set: ten people approving at once — exactly one wins', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.job_cards VALUES ('jc-2', 'PENDING', 0)`);
  const counts = await Promise.all(Array.from({ length: 10 }, (_, i) => asUser(async (c) => {
    await c.query('SELECT pg_sleep(0.01)');
    const r = await c.query(`UPDATE job_cards SET status = $3 WHERE id = $1 AND status = $2`, ['jc-2', 'PENDING', `APPROVED_BY_${i}`]);
    return r.rowCount ?? 0;
  })));
  assert.equal(counts.reduce((a, b) => a + b, 0), 1);
});

test('compare-and-set: a close and a cancellation at once — the record ends in exactly one of them', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.job_cards VALUES ('jc-3', 'READY_FOR_COLLECTION', 0)`);
  const [close, cancel] = await Promise.all([
    asUser(async (c) => (await c.query(`UPDATE job_cards SET status = 'CLOSED' WHERE id = $1 AND status = 'READY_FOR_COLLECTION'`, ['jc-3'])).rowCount),
    asUser(async (c) => (await c.query(`UPDATE job_cards SET status = 'CANCELLED' WHERE id = $1 AND status NOT IN ('CANCELLED','CLOSED','CHECKED_OUT')`, ['jc-3'])).rowCount),
  ]);
  assert.equal((close ?? 0) + (cancel ?? 0), 1);
  const { rows } = await pool.query(`SELECT status FROM ${SCHEMA}.job_cards WHERE id = 'jc-3'`);
  assert.ok(['CLOSED', 'CANCELLED'].includes(rows[0].status));
});

test('stock: storekeepers approving requests at once can never reserve more than is on hand', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.part_stock VALUES ('part-1', 10, 0)`);
  const reserve = (qty: number) => asUser(async (c) => {
    await c.query(lockSql('partStockByPart'), [['part-1']]);
    const { rows } = await c.query('SELECT "quantityOnHand" - "quantityReserved" AS avail FROM part_stock WHERE "partId" = $1', ['part-1']);
    await c.query('SELECT pg_sleep(0.03)');
    if (Number(rows[0].avail) < qty) return false;
    await c.query('UPDATE part_stock SET "quantityReserved" = "quantityReserved" + $2 WHERE "partId" = $1', ['part-1', qty]);
    return true;
  });
  const ok = await Promise.all(Array.from({ length: 8 }, () => reserve(4)));
  const { rows } = await pool.query(`SELECT "quantityReserved" AS r FROM ${SCHEMA}.part_stock WHERE "partId" = 'part-1'`);
  assert.equal(Number(rows[0].r), 8);
  assert.equal(ok.filter(Boolean).length, 2);
});

test('two requests for the same parts, listed in opposite orders, never deadlock (lockIds + ORDER BY)', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.part_stock VALUES ('p-a', 1, 0), ('p-b', 1, 0)`);
  // The order lockRows uses (lockIds), one row at a time with a pause between
  // — the worst case for a deadlock — still completes.
  const lockOneByOne = (c: PoolClient, ids: string[]) => lockIds(ids).reduce(
    (p, id) => p.then(() => c.query(lockSql('partStockByPart'), [[id]])).then(() => c.query('SELECT pg_sleep(0.05)')).then(() => undefined),
    Promise.resolve(),
  );
  await Promise.all([
    asUser((c) => lockOneByOne(c, ['p-a', 'p-b'])),
    asUser((c) => lockOneByOne(c, ['p-b', 'p-a'])),
  ]);
});

test('control: the same two requests locking in the order they were listed DO deadlock', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.part_stock VALUES ('q-a', 1, 0), ('q-b', 1, 0)`);
  const lockAsListed = (c: PoolClient, ids: string[]) => ids.reduce(
    (p, id) => p.then(() => c.query(lockSql('partStockByPart'), [[id]])).then(() => c.query('SELECT pg_sleep(0.2)')).then(() => undefined),
    Promise.resolve(),
  );
  const outcomes = await Promise.allSettled([
    asUser((c) => lockAsListed(c, ['q-a', 'q-b'])),
    asUser((c) => lockAsListed(c, ['q-b', 'q-a'])),
  ]);
  assert.ok(outcomes.some((o) => o.status === 'rejected' && /deadlock/i.test(String((o as PromiseRejectedResult).reason))), 'expected Postgres to report a deadlock');
});

test('bookings: two people booking the same room for overlapping times — exactly one booking', { skip }, async () => {
  await pool.query(`INSERT INTO ${SCHEMA}.meeting_rooms VALUES ('room-1'); INSERT INTO ${SCHEMA}.users VALUES ('host-a'), ('host-b')`);
  const book = (owner: string, startMin: number) => asUser(async (c) => {
    await c.query(lockSql('meetingRoom'), [['room-1']]);
    await c.query(lockSql('user'), [[owner]]);
    const s = new Date(Date.UTC(2030, 0, 1, 9, startMin)), e = new Date(s.getTime() + 60 * 60000);
    const clash = await c.query(`SELECT 1 FROM appointments WHERE status = 'SCHEDULED' AND "roomId" = $1 AND "startsAt" < $3 AND "endsAt" > $2`, ['room-1', s, e]);
    await c.query('SELECT pg_sleep(0.03)');
    if (clash.rowCount) return false;
    await c.query(`INSERT INTO appointments ("roomId", "ownerId", "startsAt", "endsAt") VALUES ($1, $2, $3, $4)`, ['room-1', owner, s, e]);
    return true;
  });
  const ok = await Promise.all([book('host-a', 0), book('host-b', 30), book('host-a', 15), book('host-b', 45)]);
  assert.equal(ok.filter(Boolean).length, 1);
  const { rows } = await pool.query(`SELECT count(*) AS n FROM ${SCHEMA}.appointments`);
  assert.equal(Number(rows[0].n), 1);
});
