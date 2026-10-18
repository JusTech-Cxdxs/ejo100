/** Production rules: the two stage machines, checklist evaluation, material availability, serial codes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD_ORDER_TRANSITIONS, canMoveBuildOrder, canMoveUnit, checklistFromForm, evaluateChecklist, FAMILY_SERIAL_CODE, familySerialCode,
  materialAvailability, qaPassRate, reworkNeedsApproval, UNIT_STAGE_ORDER, UNIT_STAGE_TRANSITIONS,
} from '../lib/production-core';
import { FAMILIES } from '../lib/catalogue-core';

test('a build order only moves through the planned steps', () => {
  assert.ok(canMoveBuildOrder('PLANNED', 'MATERIALS_CHECKED'));
  assert.ok(canMoveBuildOrder('MATERIALS_CHECKED', 'RELEASED'));
  assert.ok(canMoveBuildOrder('MATERIALS_CHECKED', 'MATERIALS_CHECKED'), 'materials can be re-checked');
  assert.ok(canMoveBuildOrder('RELEASED', 'IN_PROGRESS'));
  assert.ok(canMoveBuildOrder('IN_PROGRESS', 'COMPLETED'));
  assert.ok(canMoveBuildOrder('COMPLETED', 'CLOSED'));
  assert.ok(canMoveBuildOrder('IN_PROGRESS', 'ON_HOLD'));
  assert.ok(canMoveBuildOrder('ON_HOLD', 'IN_PROGRESS'));
  assert.ok(!canMoveBuildOrder('PLANNED', 'RELEASED'), 'never released before materials are checked');
  assert.ok(!canMoveBuildOrder('IN_PROGRESS', 'CANCELLED'), 'an order with units on the line is not cancelled, it is put on hold');
  assert.ok(!canMoveBuildOrder('CLOSED', 'IN_PROGRESS'));
  assert.ok(!canMoveBuildOrder('CANCELLED', 'PLANNED'));
  assert.deepEqual(BUILD_ORDER_TRANSITIONS.CLOSED, []);
  assert.deepEqual(BUILD_ORDER_TRANSITIONS.CANCELLED, []);
});

test('a unit walks the stations in order, fails back to rework, and only leaves the line released or scrapped', () => {
  assert.deepEqual(UNIT_STAGE_ORDER, ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'PACKING', 'RELEASED']);
  for (let i = 0; i < UNIT_STAGE_ORDER.length - 1; i++) assert.ok(canMoveUnit(UNIT_STAGE_ORDER[i]!, UNIT_STAGE_ORDER[i + 1]!), `${UNIT_STAGE_ORDER[i]} → ${UNIT_STAGE_ORDER[i + 1]}`);
  assert.ok(canMoveUnit('LINE_CHECK', 'REWORK'));
  assert.ok(canMoveUnit('QA', 'REWORK'));
  assert.ok(canMoveUnit('REWORK', 'LINE_CHECK'), 'after rework the line checks it again');
  assert.ok(!canMoveUnit('REWORK', 'QA'), 'rework never skips the line check');
  assert.ok(!canMoveUnit('ASSEMBLY', 'QA'));
  assert.ok(!canMoveUnit('ASSEMBLY', 'RELEASED'));
  assert.ok(!canMoveUnit('QA', 'RELEASED'), 'a unit is packed before it is released');
  for (const s of ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'REWORK', 'PACKING'] as const) assert.ok(canMoveUnit(s, 'SCRAPPED'), `${s} can be scrapped`);
  assert.deepEqual(UNIT_STAGE_TRANSITIONS.RELEASED, []);
  assert.deepEqual(UNIT_STAGE_TRANSITIONS.SCRAPPED, []);
});

test('rework needs the Production Manager from the second time on', () => {
  assert.equal(reworkNeedsApproval(0), false);
  assert.equal(reworkNeedsApproval(1), false);
  assert.equal(reworkNeedsApproval(2), true);
  assert.equal(reworkNeedsApproval(5), true);
});

test('a checklist passes only when every answered item passed; NA is ignored', () => {
  const pass = evaluateChecklist([{ item: 'RAM seated', result: 'PASS' }, { item: 'SSD', result: 'PASS' }, { item: 'Touch screen', result: 'NA' }]);
  assert.equal(pass.passed, true);
  assert.deepEqual(pass.failed, []);
  assert.equal(pass.passes, 2);
  assert.equal(pass.notApplicable, 1);
  const fail = evaluateChecklist([{ item: 'RAM seated', result: 'PASS' }, { item: 'Keyboard layout', result: 'FAIL' }, { item: 'BIOS version', result: 'FAIL' }]);
  assert.equal(fail.passed, false);
  assert.deepEqual(fail.failed, ['Keyboard layout', 'BIOS version']);
  assert.equal(evaluateChecklist([{ item: 'x', result: 'NA' }]).passed, true);
  assert.equal(evaluateChecklist([]).passed, true);
});

test('the checklist form refuses an unanswered item and keeps notes', () => {
  const items = ['RAM seated', 'SSD fitted', 'Labels'];
  const bad = checklistFromForm(items, { 'RAM seated': 'PASS', Labels: 'na' });
  assert.deepEqual(bad, { ok: false, missing: ['SSD fitted'] });
  const good = checklistFromForm(items, { 'RAM seated': 'pass', 'SSD fitted': 'FAIL', Labels: 'NA' }, { 'SSD fitted': '  loose connector ' });
  assert.ok(good.ok);
  if (good.ok) {
    assert.deepEqual(good.answers, [
      { item: 'RAM seated', result: 'PASS', note: null },
      { item: 'SSD fitted', result: 'FAIL', note: 'loose connector' },
      { item: 'Labels', result: 'NA', note: null },
    ]);
    assert.equal(evaluateChecklist(good.answers).passed, false);
  }
});

test('material availability is BOM × quantity, net of what was issued, against free stock; optional lines never block', () => {
  const r = materialAvailability([
    { partId: 'mb', name: 'Motherboard', perUnit: 1, isOptional: false, available: 8, issued: 0 },
    { partId: 'ram', name: '8 GB RAM', perUnit: 2, isOptional: false, available: 15, issued: 4 },
    { partId: 'bag', name: 'Carry bag', perUnit: 1, isOptional: true, available: 0, issued: 0 },
    { partId: 'screw', name: 'Screw M2', perUnit: 0.5, isOptional: false, available: 100, issued: 0 },
  ], 10);
  const by = Object.fromEntries(r.lines.map((l) => [l.partId, l]));
  assert.equal(by.mb!.required, 10);
  assert.equal(by.mb!.shortage, 2);
  assert.equal(by.ram!.required, 20);
  assert.equal(by.ram!.outstanding, 16);
  assert.equal(by.ram!.shortage, 1);
  assert.equal(by.bag!.shortage, 10);
  assert.equal(by.screw!.required, 5);
  assert.equal(by.screw!.shortage, 0);
  assert.deepEqual(r.shortages.map((s) => s.partId), ['mb', 'ram']);
  assert.equal(r.ok, false);
  assert.match(r.note ?? '', /Motherboard: short 2 \(need 10, available 8\); 8 GB RAM: short 1/);

  const fine = materialAvailability([{ partId: 'mb', name: 'Motherboard', perUnit: 1, isOptional: false, available: 3, issued: 0 }], 3);
  assert.equal(fine.ok, true);
  assert.equal(fine.note, null);
  assert.equal(materialAvailability([], 5).ok, true, 'no BOM: nothing is short');
  const negative = materialAvailability([{ partId: 'p', name: 'P', perUnit: 1, isOptional: false, available: -2, issued: 0 }], 1);
  assert.equal(negative.shortages[0]!.shortage, 1, 'negative free stock counts as none');
});

test('every family has its two-letter serial code', () => {
  const expected: Record<string, string> = {
    LAPTOP: 'LT', DESKTOP: 'DT', ALL_IN_ONE: 'AI', TABLET: 'TB', MONITOR: 'MN', SMART_BOARD: 'SB', SERVER: 'SV', INVERTER: 'IV', BATTERY: 'BT', SOLAR_PANEL: 'SP', SOLAR_KIT: 'SK',
    GENERATOR: 'GN', TELEVISION: 'TV', FAN: 'FN', STABILISER: 'ST', AIR_CONDITIONER: 'AC', REFRIGERATOR: 'RF', MICROWAVE: 'MW', ACCESSORY: 'AX', OTHER: 'OT',
  };
  for (const f of FAMILIES) assert.equal(familySerialCode(f), expected[f], f);
  assert.equal(new Set(Object.values(FAMILY_SERIAL_CODE)).size, FAMILIES.length, 'codes are unique');
  assert.equal(familySerialCode('SOMETHING_ELSE'), 'OT');
});

test('the QA pass rate ignores untested units', () => {
  assert.equal(qaPassRate([]), null);
  assert.equal(qaPassRate([null, undefined]), null);
  assert.equal(qaPassRate([true, true, false, null]), 66.7);
  assert.equal(qaPassRate([true]), 100);
});
