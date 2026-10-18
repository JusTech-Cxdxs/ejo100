/**
 * Warehouse rules (lib/warehouse-core.ts): the unit status machine, transfer
 * rules, pick validation, serial parsing and incoming QC checks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIT_STATUSES, UNIT_TRANSITIONS, UNIT_STATUS_LABEL, UNIT_STATUS_TONE, canMoveUnit, parseSerials, serialProblem, remainingToReceive,
  canMoveTransfer, transferNeedsApproval, transferProblem, canDispatchTransfer, pickProblem, linesLeftToPick, releaseReadyToRelease,
  dispatchProblem, inspectionProblem, defectRate, tally, FG_LOCATION_KINDS, FG_LOCATION_KIND_LABEL, type PickLine, type PickUnit,
} from '../lib/warehouse-core';

test('every unit status has transitions, a label and a tone', () => {
  for (const s of UNIT_STATUSES) {
    assert.ok(Array.isArray(UNIT_TRANSITIONS[s]), s);
    assert.ok(UNIT_STATUS_LABEL[s].length > 2, s);
    assert.ok(UNIT_STATUS_TONE[s], s);
  }
  for (const k of FG_LOCATION_KINDS) assert.ok(FG_LOCATION_KIND_LABEL[k]);
});

test('a unit follows the sale: in stock → picked → released → dispatched → sold, and never back from scrapped', () => {
  assert.ok(canMoveUnit('IN_STOCK', 'PICKED'));
  assert.ok(canMoveUnit('RESERVED', 'PICKED'));
  assert.ok(canMoveUnit('PICKED', 'RELEASED'));
  assert.ok(canMoveUnit('RELEASED', 'DISPATCHED'));
  assert.ok(canMoveUnit('DISPATCHED', 'SOLD'));
  assert.ok(!canMoveUnit('IN_STOCK', 'SOLD'), 'nothing is sold straight off the shelf');
  assert.ok(!canMoveUnit('SOLD', 'IN_STOCK'), 'a sold unit only comes back as a return');
  assert.ok(canMoveUnit('SOLD', 'RETURNED'));
  assert.equal(UNIT_TRANSITIONS.SCRAPPED.length, 0);
  assert.ok(canMoveUnit('QUARANTINE', 'IN_STOCK') && canMoveUnit('QUARANTINE', 'SCRAPPED'));
});

test('serial lists: one per line or comma-separated, trimmed, de-duplicated regardless of case', () => {
  assert.deepEqual(parseSerials('ZNX26LP0000001\n ZNX26LP0000002 , znx26lp0000001;ZNX26LP0000003\n\n'), ['ZNX26LP0000001', 'ZNX26LP0000002', 'ZNX26LP0000003']);
  assert.deepEqual(parseSerials(''), []);
  assert.equal(serialProblem('ZNX26LP0000001'), null);
  assert.equal(serialProblem('AB-12/3.4_x'), null);
  assert.match(serialProblem('AB1') ?? '', /too short/);
  assert.match(serialProblem('A'.repeat(65)) ?? '', /too long/);
  assert.match(serialProblem('ZNX 001') ?? '', /characters/);
  assert.match(serialProblem('-ZNX001') ?? '', /characters/);
});

test('what is left to receive on a purchase order line never goes below zero', () => {
  assert.equal(remainingToReceive({ quantity: 10, receivedQuantity: 4 }), 6);
  assert.equal(remainingToReceive({ quantity: 10, receivedQuantity: 12 }), 0);
  assert.equal(remainingToReceive({ quantity: 2.5, receivedQuantity: 1.25 }), 1.25);
});

test('transfers: draft → dispatched → received; a cross-branch transfer waits for approval', () => {
  assert.ok(canMoveTransfer('DRAFT', 'DISPATCHED'));
  assert.ok(canMoveTransfer('DISPATCHED', 'RECEIVED'));
  assert.ok(!canMoveTransfer('RECEIVED', 'DISPATCHED'));
  assert.ok(!canMoveTransfer('CANCELLED', 'DISPATCHED'));
  assert.equal(transferNeedsApproval({ branchId: 'b1' }, { branchId: 'b1' }), false);
  assert.equal(transferNeedsApproval({ branchId: 'b1' }, { branchId: 'b2' }), true);
  assert.deepEqual(canDispatchTransfer({ status: 'DRAFT', needsApproval: true, approved: false }), { ok: false, why: "A transfer to another branch needs the Warehouse Manager's approval before it leaves." });
  assert.deepEqual(canDispatchTransfer({ status: 'DRAFT', needsApproval: true, approved: true }), { ok: true });
  assert.deepEqual(canDispatchTransfer({ status: 'DRAFT', needsApproval: false, approved: false }), { ok: true });
  assert.equal(canDispatchTransfer({ status: 'DISPATCHED', needsApproval: false, approved: false }).ok, false);
});

test('a transfer needs two different, active locations and at least one unit', () => {
  assert.match(transferProblem({ fromLocationId: '', toLocationId: 'b', unitIds: ['u'] }) ?? '', /Choose where/);
  assert.match(transferProblem({ fromLocationId: 'a', toLocationId: 'a', unitIds: ['u'] }) ?? '', /already there/);
  assert.match(transferProblem({ fromLocationId: 'a', toLocationId: 'b', unitIds: [] }) ?? '', /at least one unit/);
  assert.match(transferProblem({ fromLocationId: 'a', toLocationId: 'b', unitIds: ['u'], toActive: false }) ?? '', /destination location has been retired/);
  assert.equal(transferProblem({ fromLocationId: 'a', toLocationId: 'b', unitIds: ['u'], fromActive: true, toActive: true }), null);
});

const line = (over: Partial<PickLine> = {}): PickLine => ({ id: 'l1', productId: 'p1', configurationId: 'c1', serialised: true, finishedUnitId: null, ...over });
const unit = (over: Partial<PickUnit> = {}): PickUnit => ({ id: 'u1', productId: 'p1', configurationId: 'c1', status: 'IN_STOCK', branchId: 'b1', salesOrderId: null, ...over });
const ctx = { branchId: 'b1', salesOrderId: 'so1' };

test('picking: the right product and configuration, in stock at this branch, or reserved for this very order', () => {
  assert.equal(pickProblem(line(), unit(), ctx), null);
  assert.equal(pickProblem(line({ configurationId: null }), unit({ configurationId: 'c9' }), ctx), null, 'a line with no configuration takes any');
  assert.equal(pickProblem(line(), unit({ configurationId: null }), ctx), null, 'a unit with no configuration recorded is accepted');
  assert.match(pickProblem(line(), unit({ productId: 'p2' }), ctx) ?? '', /different product/);
  assert.match(pickProblem(line(), unit({ configurationId: 'c2' }), ctx) ?? '', /different configuration/);
  assert.match(pickProblem(line(), unit({ branchId: 'b2' }), ctx) ?? '', /another branch/);
  assert.equal(pickProblem(line(), unit({ status: 'RESERVED', salesOrderId: 'so1' }), ctx), null);
  assert.match(pickProblem(line(), unit({ status: 'RESERVED', salesOrderId: 'so2' }), ctx) ?? '', /another order/);
  assert.match(pickProblem(line(), unit({ status: 'SOLD' }), ctx) ?? '', /sold, not in stock/);
  assert.match(pickProblem(line({ finishedUnitId: 'u0' }), unit(), ctx) ?? '', /already has a unit/);
  assert.match(pickProblem(line({ serialised: false }), unit(), ctx) ?? '', /quantity-tracked/);
});

test('a release note is ready once every serialised line has its unit', () => {
  const lines = [line({ id: 'a' }), line({ id: 'b', finishedUnitId: 'u2' }), line({ id: 'c', serialised: false })];
  assert.equal(linesLeftToPick(lines), 1);
  assert.equal(releaseReadyToRelease(lines), false);
  assert.equal(releaseReadyToRelease([line({ finishedUnitId: 'u1' }), line({ id: 'c', serialised: false })]), true);
  assert.equal(releaseReadyToRelease([]), false);
});

test('dispatch: only released goods, once, with a driver and plate or a carrier', () => {
  assert.equal(dispatchProblem({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: 'Musa', vehiclePlate: 'LAG-123', carrier: '' }), null);
  assert.equal(dispatchProblem({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: '', vehiclePlate: '', carrier: 'GIG Logistics' }), null);
  assert.match(dispatchProblem({ releaseStatus: 'PICKED', hasDispatch: false, driverName: 'Musa', vehiclePlate: 'X', carrier: '' }) ?? '', /release the note first/);
  assert.match(dispatchProblem({ releaseStatus: 'RELEASED', hasDispatch: true, driverName: 'Musa', vehiclePlate: 'X', carrier: '' }) ?? '', /already been dispatched/);
  assert.match(dispatchProblem({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: '', vehiclePlate: '', carrier: '' }) ?? '', /driver or the carrier/);
  assert.match(dispatchProblem({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: 'Musa', vehiclePlate: '', carrier: '' }) ?? '', /vehicle plate/);
});

test('incoming QC: a sample of at least one, defects never above the sample, rate to one decimal', () => {
  assert.equal(inspectionProblem({ sampleSize: 10, defects: 0 }), null);
  assert.match(inspectionProblem({ sampleSize: 0, defects: 0 }) ?? '', /at least 1/);
  assert.match(inspectionProblem({ sampleSize: 5, defects: 6 }) ?? '', /more defects/);
  assert.match(inspectionProblem({ sampleSize: 5, defects: -1 }) ?? '', /whole number/);
  assert.equal(defectRate(30, 2), 6.7);
  assert.equal(defectRate(0, 0), 0);
});

test('tally groups and sorts by count then name', () => {
  assert.deepEqual(tally([{ key: 'LAPTOP' }, { key: 'TABLET' }, { key: 'LAPTOP' }, { key: 'DESKTOP', count: 2 }]), [
    { key: 'DESKTOP', count: 2 }, { key: 'LAPTOP', count: 2 }, { key: 'TABLET', count: 1 },
  ]);
});
