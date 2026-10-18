"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Warehouse rules (lib/warehouse-core.ts): the unit status machine, transfer
 * rules, pick validation, serial parsing and incoming QC checks.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const warehouse_core_1 = require("../lib/warehouse-core");
(0, node_test_1.test)('every unit status has transitions, a label and a tone', () => {
    for (const s of warehouse_core_1.UNIT_STATUSES) {
        strict_1.default.ok(Array.isArray(warehouse_core_1.UNIT_TRANSITIONS[s]), s);
        strict_1.default.ok(warehouse_core_1.UNIT_STATUS_LABEL[s].length > 2, s);
        strict_1.default.ok(warehouse_core_1.UNIT_STATUS_TONE[s], s);
    }
    for (const k of warehouse_core_1.FG_LOCATION_KINDS)
        strict_1.default.ok(warehouse_core_1.FG_LOCATION_KIND_LABEL[k]);
});
(0, node_test_1.test)('a unit follows the sale: in stock → picked → released → dispatched → sold, and never back from scrapped', () => {
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('IN_STOCK', 'PICKED'));
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('RESERVED', 'PICKED'));
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('PICKED', 'RELEASED'));
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('RELEASED', 'DISPATCHED'));
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('DISPATCHED', 'SOLD'));
    strict_1.default.ok(!(0, warehouse_core_1.canMoveUnit)('IN_STOCK', 'SOLD'), 'nothing is sold straight off the shelf');
    strict_1.default.ok(!(0, warehouse_core_1.canMoveUnit)('SOLD', 'IN_STOCK'), 'a sold unit only comes back as a return');
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('SOLD', 'RETURNED'));
    strict_1.default.equal(warehouse_core_1.UNIT_TRANSITIONS.SCRAPPED.length, 0);
    strict_1.default.ok((0, warehouse_core_1.canMoveUnit)('QUARANTINE', 'IN_STOCK') && (0, warehouse_core_1.canMoveUnit)('QUARANTINE', 'SCRAPPED'));
});
(0, node_test_1.test)('serial lists: one per line or comma-separated, trimmed, de-duplicated regardless of case', () => {
    strict_1.default.deepEqual((0, warehouse_core_1.parseSerials)('ZNX26LP0000001\n ZNX26LP0000002 , znx26lp0000001;ZNX26LP0000003\n\n'), ['ZNX26LP0000001', 'ZNX26LP0000002', 'ZNX26LP0000003']);
    strict_1.default.deepEqual((0, warehouse_core_1.parseSerials)(''), []);
    strict_1.default.equal((0, warehouse_core_1.serialProblem)('ZNX26LP0000001'), null);
    strict_1.default.equal((0, warehouse_core_1.serialProblem)('AB-12/3.4_x'), null);
    strict_1.default.match((0, warehouse_core_1.serialProblem)('AB1') ?? '', /too short/);
    strict_1.default.match((0, warehouse_core_1.serialProblem)('A'.repeat(65)) ?? '', /too long/);
    strict_1.default.match((0, warehouse_core_1.serialProblem)('ZNX 001') ?? '', /characters/);
    strict_1.default.match((0, warehouse_core_1.serialProblem)('-ZNX001') ?? '', /characters/);
});
(0, node_test_1.test)('what is left to receive on a purchase order line never goes below zero', () => {
    strict_1.default.equal((0, warehouse_core_1.remainingToReceive)({ quantity: 10, receivedQuantity: 4 }), 6);
    strict_1.default.equal((0, warehouse_core_1.remainingToReceive)({ quantity: 10, receivedQuantity: 12 }), 0);
    strict_1.default.equal((0, warehouse_core_1.remainingToReceive)({ quantity: 2.5, receivedQuantity: 1.25 }), 1.25);
});
(0, node_test_1.test)('transfers: draft → dispatched → received; a cross-branch transfer waits for approval', () => {
    strict_1.default.ok((0, warehouse_core_1.canMoveTransfer)('DRAFT', 'DISPATCHED'));
    strict_1.default.ok((0, warehouse_core_1.canMoveTransfer)('DISPATCHED', 'RECEIVED'));
    strict_1.default.ok(!(0, warehouse_core_1.canMoveTransfer)('RECEIVED', 'DISPATCHED'));
    strict_1.default.ok(!(0, warehouse_core_1.canMoveTransfer)('CANCELLED', 'DISPATCHED'));
    strict_1.default.equal((0, warehouse_core_1.transferNeedsApproval)({ branchId: 'b1' }, { branchId: 'b1' }), false);
    strict_1.default.equal((0, warehouse_core_1.transferNeedsApproval)({ branchId: 'b1' }, { branchId: 'b2' }), true);
    strict_1.default.deepEqual((0, warehouse_core_1.canDispatchTransfer)({ status: 'DRAFT', needsApproval: true, approved: false }), { ok: false, why: "A transfer to another branch needs the Warehouse Manager's approval before it leaves." });
    strict_1.default.deepEqual((0, warehouse_core_1.canDispatchTransfer)({ status: 'DRAFT', needsApproval: true, approved: true }), { ok: true });
    strict_1.default.deepEqual((0, warehouse_core_1.canDispatchTransfer)({ status: 'DRAFT', needsApproval: false, approved: false }), { ok: true });
    strict_1.default.equal((0, warehouse_core_1.canDispatchTransfer)({ status: 'DISPATCHED', needsApproval: false, approved: false }).ok, false);
});
(0, node_test_1.test)('a transfer needs two different, active locations and at least one unit', () => {
    strict_1.default.match((0, warehouse_core_1.transferProblem)({ fromLocationId: '', toLocationId: 'b', unitIds: ['u'] }) ?? '', /Choose where/);
    strict_1.default.match((0, warehouse_core_1.transferProblem)({ fromLocationId: 'a', toLocationId: 'a', unitIds: ['u'] }) ?? '', /already there/);
    strict_1.default.match((0, warehouse_core_1.transferProblem)({ fromLocationId: 'a', toLocationId: 'b', unitIds: [] }) ?? '', /at least one unit/);
    strict_1.default.match((0, warehouse_core_1.transferProblem)({ fromLocationId: 'a', toLocationId: 'b', unitIds: ['u'], toActive: false }) ?? '', /destination location has been retired/);
    strict_1.default.equal((0, warehouse_core_1.transferProblem)({ fromLocationId: 'a', toLocationId: 'b', unitIds: ['u'], fromActive: true, toActive: true }), null);
});
const line = (over = {}) => ({ id: 'l1', productId: 'p1', configurationId: 'c1', serialised: true, finishedUnitId: null, ...over });
const unit = (over = {}) => ({ id: 'u1', productId: 'p1', configurationId: 'c1', status: 'IN_STOCK', branchId: 'b1', salesOrderId: null, ...over });
const ctx = { branchId: 'b1', salesOrderId: 'so1' };
(0, node_test_1.test)('picking: the right product and configuration, in stock at this branch, or reserved for this very order', () => {
    strict_1.default.equal((0, warehouse_core_1.pickProblem)(line(), unit(), ctx), null);
    strict_1.default.equal((0, warehouse_core_1.pickProblem)(line({ configurationId: null }), unit({ configurationId: 'c9' }), ctx), null, 'a line with no configuration takes any');
    strict_1.default.equal((0, warehouse_core_1.pickProblem)(line(), unit({ configurationId: null }), ctx), null, 'a unit with no configuration recorded is accepted');
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line(), unit({ productId: 'p2' }), ctx) ?? '', /different product/);
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line(), unit({ configurationId: 'c2' }), ctx) ?? '', /different configuration/);
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line(), unit({ branchId: 'b2' }), ctx) ?? '', /another branch/);
    strict_1.default.equal((0, warehouse_core_1.pickProblem)(line(), unit({ status: 'RESERVED', salesOrderId: 'so1' }), ctx), null);
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line(), unit({ status: 'RESERVED', salesOrderId: 'so2' }), ctx) ?? '', /another order/);
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line(), unit({ status: 'SOLD' }), ctx) ?? '', /sold, not in stock/);
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line({ finishedUnitId: 'u0' }), unit(), ctx) ?? '', /already has a unit/);
    strict_1.default.match((0, warehouse_core_1.pickProblem)(line({ serialised: false }), unit(), ctx) ?? '', /quantity-tracked/);
});
(0, node_test_1.test)('a release note is ready once every serialised line has its unit', () => {
    const lines = [line({ id: 'a' }), line({ id: 'b', finishedUnitId: 'u2' }), line({ id: 'c', serialised: false })];
    strict_1.default.equal((0, warehouse_core_1.linesLeftToPick)(lines), 1);
    strict_1.default.equal((0, warehouse_core_1.releaseReadyToRelease)(lines), false);
    strict_1.default.equal((0, warehouse_core_1.releaseReadyToRelease)([line({ finishedUnitId: 'u1' }), line({ id: 'c', serialised: false })]), true);
    strict_1.default.equal((0, warehouse_core_1.releaseReadyToRelease)([]), false);
});
(0, node_test_1.test)('dispatch: only released goods, once, with a driver and plate or a carrier', () => {
    strict_1.default.equal((0, warehouse_core_1.dispatchProblem)({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: 'Musa', vehiclePlate: 'LAG-123', carrier: '' }), null);
    strict_1.default.equal((0, warehouse_core_1.dispatchProblem)({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: '', vehiclePlate: '', carrier: 'GIG Logistics' }), null);
    strict_1.default.match((0, warehouse_core_1.dispatchProblem)({ releaseStatus: 'PICKED', hasDispatch: false, driverName: 'Musa', vehiclePlate: 'X', carrier: '' }) ?? '', /release the note first/);
    strict_1.default.match((0, warehouse_core_1.dispatchProblem)({ releaseStatus: 'RELEASED', hasDispatch: true, driverName: 'Musa', vehiclePlate: 'X', carrier: '' }) ?? '', /already been dispatched/);
    strict_1.default.match((0, warehouse_core_1.dispatchProblem)({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: '', vehiclePlate: '', carrier: '' }) ?? '', /driver or the carrier/);
    strict_1.default.match((0, warehouse_core_1.dispatchProblem)({ releaseStatus: 'RELEASED', hasDispatch: false, driverName: 'Musa', vehiclePlate: '', carrier: '' }) ?? '', /vehicle plate/);
});
(0, node_test_1.test)('incoming QC: a sample of at least one, defects never above the sample, rate to one decimal', () => {
    strict_1.default.equal((0, warehouse_core_1.inspectionProblem)({ sampleSize: 10, defects: 0 }), null);
    strict_1.default.match((0, warehouse_core_1.inspectionProblem)({ sampleSize: 0, defects: 0 }) ?? '', /at least 1/);
    strict_1.default.match((0, warehouse_core_1.inspectionProblem)({ sampleSize: 5, defects: 6 }) ?? '', /more defects/);
    strict_1.default.match((0, warehouse_core_1.inspectionProblem)({ sampleSize: 5, defects: -1 }) ?? '', /whole number/);
    strict_1.default.equal((0, warehouse_core_1.defectRate)(30, 2), 6.7);
    strict_1.default.equal((0, warehouse_core_1.defectRate)(0, 0), 0);
});
(0, node_test_1.test)('tally groups and sorts by count then name', () => {
    strict_1.default.deepEqual((0, warehouse_core_1.tally)([{ key: 'LAPTOP' }, { key: 'TABLET' }, { key: 'LAPTOP' }, { key: 'DESKTOP', count: 2 }]), [
        { key: 'DESKTOP', count: 2 }, { key: 'LAPTOP', count: 2 }, { key: 'TABLET', count: 1 },
    ]);
});
