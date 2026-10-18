"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Production rules: the two stage machines, checklist evaluation, material availability, serial codes. */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const production_core_1 = require("../lib/production-core");
const catalogue_core_1 = require("../lib/catalogue-core");
(0, node_test_1.test)('a build order only moves through the planned steps', () => {
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('PLANNED', 'MATERIALS_CHECKED'));
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('MATERIALS_CHECKED', 'RELEASED'));
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('MATERIALS_CHECKED', 'MATERIALS_CHECKED'), 'materials can be re-checked');
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('RELEASED', 'IN_PROGRESS'));
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('IN_PROGRESS', 'COMPLETED'));
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('COMPLETED', 'CLOSED'));
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('IN_PROGRESS', 'ON_HOLD'));
    strict_1.default.ok((0, production_core_1.canMoveBuildOrder)('ON_HOLD', 'IN_PROGRESS'));
    strict_1.default.ok(!(0, production_core_1.canMoveBuildOrder)('PLANNED', 'RELEASED'), 'never released before materials are checked');
    strict_1.default.ok(!(0, production_core_1.canMoveBuildOrder)('IN_PROGRESS', 'CANCELLED'), 'an order with units on the line is not cancelled, it is put on hold');
    strict_1.default.ok(!(0, production_core_1.canMoveBuildOrder)('CLOSED', 'IN_PROGRESS'));
    strict_1.default.ok(!(0, production_core_1.canMoveBuildOrder)('CANCELLED', 'PLANNED'));
    strict_1.default.deepEqual(production_core_1.BUILD_ORDER_TRANSITIONS.CLOSED, []);
    strict_1.default.deepEqual(production_core_1.BUILD_ORDER_TRANSITIONS.CANCELLED, []);
});
(0, node_test_1.test)('a unit walks the stations in order, fails back to rework, and only leaves the line released or scrapped', () => {
    strict_1.default.deepEqual(production_core_1.UNIT_STAGE_ORDER, ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'PACKING', 'RELEASED']);
    for (let i = 0; i < production_core_1.UNIT_STAGE_ORDER.length - 1; i++)
        strict_1.default.ok((0, production_core_1.canMoveUnit)(production_core_1.UNIT_STAGE_ORDER[i], production_core_1.UNIT_STAGE_ORDER[i + 1]), `${production_core_1.UNIT_STAGE_ORDER[i]} → ${production_core_1.UNIT_STAGE_ORDER[i + 1]}`);
    strict_1.default.ok((0, production_core_1.canMoveUnit)('LINE_CHECK', 'REWORK'));
    strict_1.default.ok((0, production_core_1.canMoveUnit)('QA', 'REWORK'));
    strict_1.default.ok((0, production_core_1.canMoveUnit)('REWORK', 'LINE_CHECK'), 'after rework the line checks it again');
    strict_1.default.ok(!(0, production_core_1.canMoveUnit)('REWORK', 'QA'), 'rework never skips the line check');
    strict_1.default.ok(!(0, production_core_1.canMoveUnit)('ASSEMBLY', 'QA'));
    strict_1.default.ok(!(0, production_core_1.canMoveUnit)('ASSEMBLY', 'RELEASED'));
    strict_1.default.ok(!(0, production_core_1.canMoveUnit)('QA', 'RELEASED'), 'a unit is packed before it is released');
    for (const s of ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'REWORK', 'PACKING'])
        strict_1.default.ok((0, production_core_1.canMoveUnit)(s, 'SCRAPPED'), `${s} can be scrapped`);
    strict_1.default.deepEqual(production_core_1.UNIT_STAGE_TRANSITIONS.RELEASED, []);
    strict_1.default.deepEqual(production_core_1.UNIT_STAGE_TRANSITIONS.SCRAPPED, []);
});
(0, node_test_1.test)('rework needs the Production Manager from the second time on', () => {
    strict_1.default.equal((0, production_core_1.reworkNeedsApproval)(0), false);
    strict_1.default.equal((0, production_core_1.reworkNeedsApproval)(1), false);
    strict_1.default.equal((0, production_core_1.reworkNeedsApproval)(2), true);
    strict_1.default.equal((0, production_core_1.reworkNeedsApproval)(5), true);
});
(0, node_test_1.test)('a checklist passes only when every answered item passed; NA is ignored', () => {
    const pass = (0, production_core_1.evaluateChecklist)([{ item: 'RAM seated', result: 'PASS' }, { item: 'SSD', result: 'PASS' }, { item: 'Touch screen', result: 'NA' }]);
    strict_1.default.equal(pass.passed, true);
    strict_1.default.deepEqual(pass.failed, []);
    strict_1.default.equal(pass.passes, 2);
    strict_1.default.equal(pass.notApplicable, 1);
    const fail = (0, production_core_1.evaluateChecklist)([{ item: 'RAM seated', result: 'PASS' }, { item: 'Keyboard layout', result: 'FAIL' }, { item: 'BIOS version', result: 'FAIL' }]);
    strict_1.default.equal(fail.passed, false);
    strict_1.default.deepEqual(fail.failed, ['Keyboard layout', 'BIOS version']);
    strict_1.default.equal((0, production_core_1.evaluateChecklist)([{ item: 'x', result: 'NA' }]).passed, true);
    strict_1.default.equal((0, production_core_1.evaluateChecklist)([]).passed, true);
});
(0, node_test_1.test)('the checklist form refuses an unanswered item and keeps notes', () => {
    const items = ['RAM seated', 'SSD fitted', 'Labels'];
    const bad = (0, production_core_1.checklistFromForm)(items, { 'RAM seated': 'PASS', Labels: 'na' });
    strict_1.default.deepEqual(bad, { ok: false, missing: ['SSD fitted'] });
    const good = (0, production_core_1.checklistFromForm)(items, { 'RAM seated': 'pass', 'SSD fitted': 'FAIL', Labels: 'NA' }, { 'SSD fitted': '  loose connector ' });
    strict_1.default.ok(good.ok);
    if (good.ok) {
        strict_1.default.deepEqual(good.answers, [
            { item: 'RAM seated', result: 'PASS', note: null },
            { item: 'SSD fitted', result: 'FAIL', note: 'loose connector' },
            { item: 'Labels', result: 'NA', note: null },
        ]);
        strict_1.default.equal((0, production_core_1.evaluateChecklist)(good.answers).passed, false);
    }
});
(0, node_test_1.test)('material availability is BOM × quantity, net of what was issued, against free stock; optional lines never block', () => {
    const r = (0, production_core_1.materialAvailability)([
        { partId: 'mb', name: 'Motherboard', perUnit: 1, isOptional: false, available: 8, issued: 0 },
        { partId: 'ram', name: '8 GB RAM', perUnit: 2, isOptional: false, available: 15, issued: 4 },
        { partId: 'bag', name: 'Carry bag', perUnit: 1, isOptional: true, available: 0, issued: 0 },
        { partId: 'screw', name: 'Screw M2', perUnit: 0.5, isOptional: false, available: 100, issued: 0 },
    ], 10);
    const by = Object.fromEntries(r.lines.map((l) => [l.partId, l]));
    strict_1.default.equal(by.mb.required, 10);
    strict_1.default.equal(by.mb.shortage, 2);
    strict_1.default.equal(by.ram.required, 20);
    strict_1.default.equal(by.ram.outstanding, 16);
    strict_1.default.equal(by.ram.shortage, 1);
    strict_1.default.equal(by.bag.shortage, 10);
    strict_1.default.equal(by.screw.required, 5);
    strict_1.default.equal(by.screw.shortage, 0);
    strict_1.default.deepEqual(r.shortages.map((s) => s.partId), ['mb', 'ram']);
    strict_1.default.equal(r.ok, false);
    strict_1.default.match(r.note ?? '', /Motherboard: short 2 \(need 10, available 8\); 8 GB RAM: short 1/);
    const fine = (0, production_core_1.materialAvailability)([{ partId: 'mb', name: 'Motherboard', perUnit: 1, isOptional: false, available: 3, issued: 0 }], 3);
    strict_1.default.equal(fine.ok, true);
    strict_1.default.equal(fine.note, null);
    strict_1.default.equal((0, production_core_1.materialAvailability)([], 5).ok, true, 'no BOM: nothing is short');
    const negative = (0, production_core_1.materialAvailability)([{ partId: 'p', name: 'P', perUnit: 1, isOptional: false, available: -2, issued: 0 }], 1);
    strict_1.default.equal(negative.shortages[0].shortage, 1, 'negative free stock counts as none');
});
(0, node_test_1.test)('every family has its two-letter serial code', () => {
    const expected = {
        LAPTOP: 'LT', DESKTOP: 'DT', ALL_IN_ONE: 'AI', TABLET: 'TB', MONITOR: 'MN', SMART_BOARD: 'SB', SERVER: 'SV', INVERTER: 'IV', BATTERY: 'BT', SOLAR_PANEL: 'SP', SOLAR_KIT: 'SK',
        GENERATOR: 'GN', TELEVISION: 'TV', FAN: 'FN', STABILISER: 'ST', AIR_CONDITIONER: 'AC', REFRIGERATOR: 'RF', MICROWAVE: 'MW', ACCESSORY: 'AX', OTHER: 'OT',
    };
    for (const f of catalogue_core_1.FAMILIES)
        strict_1.default.equal((0, production_core_1.familySerialCode)(f), expected[f], f);
    strict_1.default.equal(new Set(Object.values(production_core_1.FAMILY_SERIAL_CODE)).size, catalogue_core_1.FAMILIES.length, 'codes are unique');
    strict_1.default.equal((0, production_core_1.familySerialCode)('SOMETHING_ELSE'), 'OT');
});
(0, node_test_1.test)('the QA pass rate ignores untested units', () => {
    strict_1.default.equal((0, production_core_1.qaPassRate)([]), null);
    strict_1.default.equal((0, production_core_1.qaPassRate)([null, undefined]), null);
    strict_1.default.equal((0, production_core_1.qaPassRate)([true, true, false, null]), 66.7);
    strict_1.default.equal((0, production_core_1.qaPassRate)([true]), 100);
});
