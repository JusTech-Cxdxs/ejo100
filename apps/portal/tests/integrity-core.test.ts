/**
 * The pure half of the concurrency primitives (lib/integrity-core.ts) —
 * compare-and-set results, the row-lock SQL, money comparison in whole kobo,
 * and the reference-number retry. No database needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimed, StaleStateError, STALE_MESSAGE, lockStatement, lockIds, LOCKABLE, exceedsBalance, toMinor, isUniqueClashOn, retryOnNumberClash,
} from '../lib/integrity-core';

test('claimed: exactly one row moved passes; none (lost the race) refuses with a plain message', () => {
  assert.doesNotThrow(() => claimed({ count: 1 }));
  assert.throws(() => claimed({ count: 0 }), (e: unknown) => e instanceof StaleStateError && (e as Error).message === STALE_MESSAGE);
  assert.throws(() => claimed({ count: 0 }, 'Custom.'), /Custom\./);
  // More rows than expected is also a refusal — never "close enough".
  assert.throws(() => claimed({ count: 2 }), StaleStateError);
  assert.doesNotThrow(() => claimed({ count: 3 }, undefined, 3));
});

test('the stale message is plain words (it is shown to people as-is)', () => {
  assert.ok(STALE_MESSAGE.length < 300 && !STALE_MESSAGE.includes('\n'));
  assert.doesNotMatch(STALE_MESSAGE, /prisma|invocation|Error|undefined/i);
});

test('lockStatement: SELECT … FOR UPDATE, ordered, one array parameter', () => {
  const s = lockStatement('job_cards', 'id');
  assert.equal(s.before + '$1' + s.after, 'SELECT "id" FROM "job_cards" WHERE "id" = ANY($1::text[]) ORDER BY "id" FOR UPDATE');
});

test('lockIds: unique, no blanks, one fixed order whatever order they were given in', () => {
  assert.deepEqual(lockIds(['p-b', 'p-a', 'p-b', '']), ['p-a', 'p-b']);
  assert.deepEqual(lockIds(['p-a', 'p-b']), lockIds(['p-b', 'p-a']));
  assert.deepEqual(lockIds([]), []);
});

test('lockStatement refuses anything that is not a plain identifier', () => {
  for (const bad of ['job_cards"; DROP TABLE users; --', 'a b', '1abc', '"x"', 'x;y', '']) {
    assert.throws(() => lockStatement(bad, 'id'), /invalid identifier/);
    assert.throws(() => lockStatement('job_cards', bad), /invalid identifier/);
  }
});

test('every lockable target is a valid identifier pair', () => {
  for (const [name, { table, column }] of Object.entries(LOCKABLE)) {
    assert.doesNotThrow(() => lockStatement(table, column), name);
  }
});

test('money is compared in whole kobo — float drift never lets an overpayment through', () => {
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(exceedsBalance(0.1, 0.2, 0.3), false);         // 0.1 + 0.2 is exactly the balance
  assert.equal(exceedsBalance(11999.99, 0.01, 12000), false);  // pays it off exactly
  assert.equal(exceedsBalance(11999.99, 0.02, 12000), true);   // one kobo over
  assert.equal(exceedsBalance(0, 12000.01, 12000), true);
  assert.equal(exceedsBalance(8400, 3600, 12000), false);
  assert.equal(exceedsBalance(8400, 3700, 12000), true);
});

test('isUniqueClashOn: only a P2002 on the named column', () => {
  assert.equal(isUniqueClashOn({ code: 'P2002', meta: { target: ['referenceNumber'] } }, 'referenceNumber'), true);
  assert.equal(isUniqueClashOn({ code: 'P2002', meta: { target: 'refunds_referenceNumber_key' } }, 'referenceNumber'), true);
  assert.equal(isUniqueClashOn({ code: 'P2002', meta: { target: ['idempotencyKey'] } }, 'referenceNumber'), false);
  assert.equal(isUniqueClashOn({ code: 'P2025' }, 'referenceNumber'), false);
  assert.equal(isUniqueClashOn(new Error('x'), 'referenceNumber'), false);
  assert.equal(isUniqueClashOn(null, 'referenceNumber'), false);
});

test('retryOnNumberClash: retries a number clash, then succeeds with the next attempt', async () => {
  let calls = 0;
  const out = await retryOnNumberClash('referenceNumber', async () => {
    calls++;
    if (calls < 3) throw { code: 'P2002', meta: { target: ['referenceNumber'] } };
    return 'RF-2026-000003';
  });
  assert.equal(out, 'RF-2026-000003');
  assert.equal(calls, 3);
});

test('retryOnNumberClash: never retries anything else (a duplicate payment is not a number clash)', async () => {
  let calls = 0;
  await assert.rejects(retryOnNumberClash('referenceNumber', async () => {
    calls++;
    throw { code: 'P2002', meta: { target: ['idempotencyKey'] } };
  }), (e: unknown) => (e as { meta: { target: string[] } }).meta.target[0] === 'idempotencyKey');
  assert.equal(calls, 1);
  await assert.rejects(retryOnNumberClash('referenceNumber', async () => { throw new StaleStateError(); }), StaleStateError);
});

test('retryOnNumberClash: gives up after the limit and reports the clash', async () => {
  let calls = 0;
  await assert.rejects(retryOnNumberClash('referenceNumber', async () => {
    calls++;
    throw { code: 'P2002', meta: { target: ['referenceNumber'] } };
  }, 4), (e: unknown) => (e as { code: string }).code === 'P2002');
  assert.equal(calls, 4);
});
