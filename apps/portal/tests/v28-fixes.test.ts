/**
 * Regression tests for defects found by the independent test programme
 * (E2E-07, LOG-01, CONC-01). Pure: no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimReadiness } from '../lib/warranty-claim-readiness';
import { logFailure } from '../lib/log';
import { NUMBER_CLASH_TRIES, numberClashPause, retryOnNumberClash } from '../lib/integrity-core';

test('E2E-07: a failure dated today (stored at 12:00 UTC) is not "in the future" at 08:00 Lagos', () => {
  const r = claimReadiness(
    { complaint: 'Gearbox whine in third gear', cause: 'Synchro ring worn out', correction: 'Replaced the synchro ring', causalPart: 'Synchro ring', causalPartNumber: 'SR-1', failureDate: new Date('2026-10-12T12:00:00Z'), failureReading: 900, labourAmount: 10000, partsAmount: 0, otherAmount: 0, deadlineAt: null, jobCardId: null, vehicleServiceId: null },
    { status: 'ACTIVE', startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), startReading: 0, distanceLimit: 100000, isSamplePolicy: false },
    new Date('2026-10-12T07:00:00Z'),
  );
  const item = r.items.find((i: { key: string }) => i.key === 'failureDate');
  assert.ok(item?.ok, 'today is never in the future');
  const tomorrow = claimReadiness(
    { complaint: 'Gearbox whine in third gear', cause: 'Synchro ring worn out', correction: 'Replaced the synchro ring', causalPart: 'Synchro ring', causalPartNumber: 'SR-1', failureDate: new Date('2026-10-13T12:00:00Z'), failureReading: 900, labourAmount: 10000, partsAmount: 0, otherAmount: 0, deadlineAt: null, jobCardId: null, vehicleServiceId: null },
    { status: 'ACTIVE', startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), startReading: 0, distanceLimit: 100000, isSamplePolicy: false },
    new Date('2026-10-12T22:00:00Z'),
  );
  assert.equal(tomorrow.items.find((i: { key: string }) => i.key === 'failureDate')?.ok, false, 'tomorrow still is');
});

test('LOG-01: failure logs are one JSON line with emails masked and secrets removed', () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => { lines.push(line); };
  try {
    logFailure('Email failed for ada.customer@example.com', new Error('auth failed password=hunter2 for postgres://u:p@db.host/x'), { to: 'boss@example.com' });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  const out = JSON.parse(lines[0]!);
  const text = JSON.stringify(out);
  assert.equal(out.level, 'error');
  assert.ok(!text.includes('ada.customer@example.com') && text.includes('a***@example.com'));
  assert.ok(!text.includes('boss@example.com'));
  assert.ok(!text.includes('hunter2') && !text.includes('u:p@'));
});

test('CONC-01: number clashes are retried with a short random pause, then succeed', async () => {
  assert.ok(NUMBER_CLASH_TRIES >= 10);
  const t = Date.now();
  await numberClashPause(1);
  assert.ok(Date.now() - t < 500);
  let calls = 0;
  const value = await retryOnNumberClash('jobNumber', async () => {
    calls += 1;
    if (calls < 4) throw Object.assign(new Error('Unique constraint'), { code: 'P2002', meta: { target: ['jobNumber'] } });
    return 'JC-2026-000004';
  });
  assert.equal(value, 'JC-2026-000004');
  assert.equal(calls, 4);
});
