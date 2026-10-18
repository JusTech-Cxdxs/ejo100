"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Regression tests for defects found by the independent test programme
 * (E2E-07, LOG-01, CONC-01). Pure: no database.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const warranty_claim_readiness_1 = require("../lib/warranty-claim-readiness");
const log_1 = require("../lib/log");
const integrity_core_1 = require("../lib/integrity-core");
(0, node_test_1.test)('E2E-07: a failure dated today (stored at 12:00 UTC) is not "in the future" at 08:00 Lagos', () => {
    const r = (0, warranty_claim_readiness_1.claimReadiness)({ complaint: 'Gearbox whine in third gear', cause: 'Synchro ring worn out', correction: 'Replaced the synchro ring', causalPart: 'Synchro ring', causalPartNumber: 'SR-1', failureDate: new Date('2026-10-12T12:00:00Z'), failureReading: 900, labourAmount: 10000, partsAmount: 0, otherAmount: 0, deadlineAt: null, jobCardId: null, vehicleServiceId: null }, { status: 'ACTIVE', startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), startReading: 0, distanceLimit: 100000, isSamplePolicy: false }, new Date('2026-10-12T07:00:00Z'));
    const item = r.items.find((i) => i.key === 'failureDate');
    strict_1.default.ok(item?.ok, 'today is never in the future');
    const tomorrow = (0, warranty_claim_readiness_1.claimReadiness)({ complaint: 'Gearbox whine in third gear', cause: 'Synchro ring worn out', correction: 'Replaced the synchro ring', causalPart: 'Synchro ring', causalPartNumber: 'SR-1', failureDate: new Date('2026-10-13T12:00:00Z'), failureReading: 900, labourAmount: 10000, partsAmount: 0, otherAmount: 0, deadlineAt: null, jobCardId: null, vehicleServiceId: null }, { status: 'ACTIVE', startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), startReading: 0, distanceLimit: 100000, isSamplePolicy: false }, new Date('2026-10-12T22:00:00Z'));
    strict_1.default.equal(tomorrow.items.find((i) => i.key === 'failureDate')?.ok, false, 'tomorrow still is');
});
(0, node_test_1.test)('LOG-01: failure logs are one JSON line with emails masked and secrets removed', () => {
    const lines = [];
    const original = console.error;
    console.error = (line) => { lines.push(line); };
    try {
        (0, log_1.logFailure)('Email failed for ada.customer@example.com', new Error('auth failed password=hunter2 for postgres://u:p@db.host/x'), { to: 'boss@example.com' });
    }
    finally {
        console.error = original;
    }
    strict_1.default.equal(lines.length, 1);
    const out = JSON.parse(lines[0]);
    const text = JSON.stringify(out);
    strict_1.default.equal(out.level, 'error');
    strict_1.default.ok(!text.includes('ada.customer@example.com') && text.includes('a***@example.com'));
    strict_1.default.ok(!text.includes('boss@example.com'));
    strict_1.default.ok(!text.includes('hunter2') && !text.includes('u:p@'));
});
(0, node_test_1.test)('CONC-01: number clashes are retried with a short random pause, then succeed', async () => {
    strict_1.default.ok(integrity_core_1.NUMBER_CLASH_TRIES >= 10);
    const t = Date.now();
    await (0, integrity_core_1.numberClashPause)(1);
    strict_1.default.ok(Date.now() - t < 500);
    let calls = 0;
    const value = await (0, integrity_core_1.retryOnNumberClash)('jobNumber', async () => {
        calls += 1;
        if (calls < 4)
            throw Object.assign(new Error('Unique constraint'), { code: 'P2002', meta: { target: ['jobNumber'] } });
        return 'JC-2026-000004';
    });
    strict_1.default.equal(value, 'JC-2026-000004');
    strict_1.default.equal(calls, 4);
});
(0, node_test_1.test)('SEC-01c: the seed never replaces an existing Master Admin password unless explicitly asked', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'packages', 'database', 'prisma', 'seed.ts'), 'utf8');
    const update = src.indexOf('prisma.account.update(');
    strict_1.default.ok(update > 0, 'the reset path exists');
    const guard = src.lastIndexOf("RESET_MASTER_ADMIN_PASSWORD === 'yes'", update);
    strict_1.default.ok(guard > 0, 'the only password update sits behind RESET_MASTER_ADMIN_PASSWORD=yes');
    strict_1.default.equal(src.split('prisma.account.update(').length - 1, 1, 'no other path updates the password');
    strict_1.default.ok(!/password:\s*requireEnv\('MASTER_ADMIN_PASSWORD'\)/.test(src), 'the password is not required on every run');
});
