"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The pure half of the concurrency primitives (lib/integrity-core.ts) —
 * compare-and-set results, the row-lock SQL, money comparison in whole kobo,
 * and the reference-number retry. No database needed.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const integrity_core_1 = require("../lib/integrity-core");
(0, node_test_1.test)('claimed: exactly one row moved passes; none (lost the race) refuses with a plain message', () => {
    strict_1.default.doesNotThrow(() => (0, integrity_core_1.claimed)({ count: 1 }));
    strict_1.default.throws(() => (0, integrity_core_1.claimed)({ count: 0 }), (e) => e instanceof integrity_core_1.StaleStateError && e.message === integrity_core_1.STALE_MESSAGE);
    strict_1.default.throws(() => (0, integrity_core_1.claimed)({ count: 0 }, 'Custom.'), /Custom\./);
    // More rows than expected is also a refusal — never "close enough".
    strict_1.default.throws(() => (0, integrity_core_1.claimed)({ count: 2 }), integrity_core_1.StaleStateError);
    strict_1.default.doesNotThrow(() => (0, integrity_core_1.claimed)({ count: 3 }, undefined, 3));
});
(0, node_test_1.test)('the stale message is plain words (it is shown to people as-is)', () => {
    strict_1.default.ok(integrity_core_1.STALE_MESSAGE.length < 300 && !integrity_core_1.STALE_MESSAGE.includes('\n'));
    strict_1.default.doesNotMatch(integrity_core_1.STALE_MESSAGE, /prisma|invocation|Error|undefined/i);
});
(0, node_test_1.test)('lockStatement: SELECT … FOR UPDATE, ordered, one array parameter', () => {
    const s = (0, integrity_core_1.lockStatement)('job_cards', 'id');
    strict_1.default.equal(s.before + '$1' + s.after, 'SELECT "id" FROM "job_cards" WHERE "id" = ANY($1::text[]) ORDER BY "id" FOR UPDATE');
});
(0, node_test_1.test)('lockIds: unique, no blanks, one fixed order whatever order they were given in', () => {
    strict_1.default.deepEqual((0, integrity_core_1.lockIds)(['p-b', 'p-a', 'p-b', '']), ['p-a', 'p-b']);
    strict_1.default.deepEqual((0, integrity_core_1.lockIds)(['p-a', 'p-b']), (0, integrity_core_1.lockIds)(['p-b', 'p-a']));
    strict_1.default.deepEqual((0, integrity_core_1.lockIds)([]), []);
});
(0, node_test_1.test)('lockStatement refuses anything that is not a plain identifier', () => {
    for (const bad of ['job_cards"; DROP TABLE users; --', 'a b', '1abc', '"x"', 'x;y', '']) {
        strict_1.default.throws(() => (0, integrity_core_1.lockStatement)(bad, 'id'), /invalid identifier/);
        strict_1.default.throws(() => (0, integrity_core_1.lockStatement)('job_cards', bad), /invalid identifier/);
    }
});
(0, node_test_1.test)('every lockable target is a valid identifier pair', () => {
    for (const [name, { table, column }] of Object.entries(integrity_core_1.LOCKABLE)) {
        strict_1.default.doesNotThrow(() => (0, integrity_core_1.lockStatement)(table, column), name);
    }
});
(0, node_test_1.test)('money is compared in whole kobo — float drift never lets an overpayment through', () => {
    strict_1.default.equal((0, integrity_core_1.toMinor)(0.1 + 0.2), 30);
    strict_1.default.equal((0, integrity_core_1.exceedsBalance)(0.1, 0.2, 0.3), false); // 0.1 + 0.2 is exactly the balance
    strict_1.default.equal((0, integrity_core_1.exceedsBalance)(11999.99, 0.01, 12000), false); // pays it off exactly
    strict_1.default.equal((0, integrity_core_1.exceedsBalance)(11999.99, 0.02, 12000), true); // one kobo over
    strict_1.default.equal((0, integrity_core_1.exceedsBalance)(0, 12000.01, 12000), true);
    strict_1.default.equal((0, integrity_core_1.exceedsBalance)(8400, 3600, 12000), false);
    strict_1.default.equal((0, integrity_core_1.exceedsBalance)(8400, 3700, 12000), true);
});
(0, node_test_1.test)('isUniqueClashOn: only a P2002 on the named column', () => {
    strict_1.default.equal((0, integrity_core_1.isUniqueClashOn)({ code: 'P2002', meta: { target: ['referenceNumber'] } }, 'referenceNumber'), true);
    strict_1.default.equal((0, integrity_core_1.isUniqueClashOn)({ code: 'P2002', meta: { target: 'refunds_referenceNumber_key' } }, 'referenceNumber'), true);
    strict_1.default.equal((0, integrity_core_1.isUniqueClashOn)({ code: 'P2002', meta: { target: ['idempotencyKey'] } }, 'referenceNumber'), false);
    strict_1.default.equal((0, integrity_core_1.isUniqueClashOn)({ code: 'P2025' }, 'referenceNumber'), false);
    strict_1.default.equal((0, integrity_core_1.isUniqueClashOn)(new Error('x'), 'referenceNumber'), false);
    strict_1.default.equal((0, integrity_core_1.isUniqueClashOn)(null, 'referenceNumber'), false);
});
(0, node_test_1.test)('retryOnNumberClash: retries a number clash, then succeeds with the next attempt', async () => {
    let calls = 0;
    const out = await (0, integrity_core_1.retryOnNumberClash)('referenceNumber', async () => {
        calls++;
        if (calls < 3)
            throw { code: 'P2002', meta: { target: ['referenceNumber'] } };
        return 'RF-2026-000003';
    });
    strict_1.default.equal(out, 'RF-2026-000003');
    strict_1.default.equal(calls, 3);
});
(0, node_test_1.test)('retryOnNumberClash: never retries anything else (a duplicate payment is not a number clash)', async () => {
    let calls = 0;
    await strict_1.default.rejects((0, integrity_core_1.retryOnNumberClash)('referenceNumber', async () => {
        calls++;
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] } };
    }), (e) => e.meta.target[0] === 'idempotencyKey');
    strict_1.default.equal(calls, 1);
    await strict_1.default.rejects((0, integrity_core_1.retryOnNumberClash)('referenceNumber', async () => { throw new integrity_core_1.StaleStateError(); }), integrity_core_1.StaleStateError);
});
(0, node_test_1.test)('retryOnNumberClash: gives up after the limit and reports the clash', async () => {
    let calls = 0;
    await strict_1.default.rejects((0, integrity_core_1.retryOnNumberClash)('referenceNumber', async () => {
        calls++;
        throw { code: 'P2002', meta: { target: ['referenceNumber'] } };
    }, 4), (e) => e.code === 'P2002');
    strict_1.default.equal(calls, 4);
});
