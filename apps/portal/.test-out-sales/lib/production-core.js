"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAMILY_SERIAL_CODE = exports.REWORK_APPROVAL_THRESHOLD = exports.UNIT_ON_LINE = exports.UNIT_STAGE_TRANSITIONS = exports.UNIT_STAGE_ORDER = exports.UNIT_STAGE_LABEL = exports.BUILD_FINAL = exports.BUILD_OPEN_FOR_ISSUE = exports.BUILD_OPEN_FOR_UNITS = exports.BUILD_ORDER_TRANSITIONS = exports.BUILD_STATUS_LABEL = void 0;
exports.canMoveBuildOrder = canMoveBuildOrder;
exports.canMoveUnit = canMoveUnit;
exports.reworkNeedsApproval = reworkNeedsApproval;
exports.evaluateChecklist = evaluateChecklist;
exports.checklistFromForm = checklistFromForm;
exports.materialAvailability = materialAvailability;
exports.familySerialCode = familySerialCode;
exports.qaPassRate = qaPassRate;
exports.BUILD_STATUS_LABEL = {
    PLANNED: 'Planned', MATERIALS_CHECKED: 'Materials checked', RELEASED: 'Released to the line', IN_PROGRESS: 'In progress', QA: 'At QA',
    ON_HOLD: 'On hold', COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
/** Where a build order may go from each status. */
exports.BUILD_ORDER_TRANSITIONS = {
    PLANNED: ['MATERIALS_CHECKED', 'CANCELLED'],
    MATERIALS_CHECKED: ['MATERIALS_CHECKED', 'RELEASED', 'CANCELLED'],
    RELEASED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    IN_PROGRESS: ['QA', 'ON_HOLD', 'COMPLETED'],
    QA: ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'],
    ON_HOLD: ['RELEASED', 'IN_PROGRESS', 'CANCELLED'],
    COMPLETED: ['CLOSED'],
    CLOSED: [],
    CANCELLED: [],
};
function canMoveBuildOrder(from, to) {
    return (exports.BUILD_ORDER_TRANSITIONS[from] ?? []).includes(to);
}
/** Statuses in which the line may still start units. */
exports.BUILD_OPEN_FOR_UNITS = ['RELEASED', 'IN_PROGRESS', 'QA'];
/** Statuses in which the parts warehouse may issue materials. */
exports.BUILD_OPEN_FOR_ISSUE = ['RELEASED', 'IN_PROGRESS', 'QA'];
exports.BUILD_FINAL = ['CLOSED', 'CANCELLED'];
exports.UNIT_STAGE_LABEL = {
    ASSEMBLY: 'Assembly', SOFTWARE: 'Software', LINE_CHECK: 'Line check', QA: 'QA test', REWORK: 'Rework', PACKING: 'Packing', RELEASED: 'Released to store', SCRAPPED: 'Scrapped',
};
/** The stations in order, for the traveller's stage strip. */
exports.UNIT_STAGE_ORDER = ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'PACKING', 'RELEASED'];
exports.UNIT_STAGE_TRANSITIONS = {
    ASSEMBLY: ['SOFTWARE', 'SCRAPPED'],
    SOFTWARE: ['LINE_CHECK', 'SCRAPPED'],
    LINE_CHECK: ['QA', 'REWORK', 'SCRAPPED'],
    QA: ['PACKING', 'REWORK', 'SCRAPPED'],
    REWORK: ['LINE_CHECK', 'SCRAPPED'],
    PACKING: ['RELEASED', 'SCRAPPED'],
    RELEASED: [],
    SCRAPPED: [],
};
function canMoveUnit(from, to) {
    return (exports.UNIT_STAGE_TRANSITIONS[from] ?? []).includes(to);
}
/** A unit still on the line (not yet in the store, not scrapped). */
exports.UNIT_ON_LINE = ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'REWORK', 'PACKING'];
/** How many times a unit may be sent to rework before the Production Manager must approve the next attempt. */
exports.REWORK_APPROVAL_THRESHOLD = 2;
function reworkNeedsApproval(reworkCount) {
    return reworkCount >= exports.REWORK_APPROVAL_THRESHOLD;
}
/**
 * One submit of a checklist: every PASS → the unit passes; any FAIL → it
 * fails (and the failed items are the rework note); NA items are ignored.
 */
function evaluateChecklist(answers) {
    const failed = answers.filter((a) => a.result === 'FAIL').map((a) => a.item);
    const passes = answers.filter((a) => a.result === 'PASS').length;
    const notApplicable = answers.filter((a) => a.result === 'NA').length;
    return { passed: failed.length === 0, failed, passes, notApplicable };
}
/** Answers typed on a form (item → PASS/FAIL/NA) against the template's items; an unanswered item is refused. */
function checklistFromForm(items, answers, notes = {}) {
    const out = [];
    const missing = [];
    for (const item of items) {
        const r = (answers[item] ?? '').toUpperCase();
        if (r !== 'PASS' && r !== 'FAIL' && r !== 'NA') {
            missing.push(item);
            continue;
        }
        const note = (notes[item] ?? '').trim();
        out.push({ item, result: r, note: note ? note.slice(0, 300) : null });
    }
    return missing.length ? { ok: false, missing } : { ok: true, answers: out };
}
/**
 * BOM × quantity against what the parts warehouse has (on hand minus
 * reserved), net of what was already issued to this build order. Optional
 * lines are shown but never block a release.
 */
function materialAvailability(lines, quantity) {
    const qty = Math.max(0, Math.floor(quantity));
    const out = lines.map((l) => {
        const required = round3(l.perUnit * qty);
        const outstanding = Math.max(0, round3(required - l.issued));
        const shortage = Math.max(0, round3(outstanding - Math.max(0, l.available)));
        return { ...l, required, outstanding, shortage };
    });
    const shortages = out.filter((l) => l.shortage > 0 && !l.isOptional);
    const note = shortages.length ? shortages.map((s) => `${s.name}: short ${trim3(s.shortage)} (need ${trim3(s.outstanding)}, available ${trim3(Math.max(0, s.available))})`).join('; ') : null;
    return { lines: out, shortages, ok: shortages.length === 0, note };
}
const round3 = (n) => Math.round(n * 1000) / 1000;
const trim3 = (n) => String(round3(n));
// ── Serial numbers ─────────────────────────────────────────────────────────
/** The two-letter family code inside a Zinox serial (ZNX26LT0000123). */
exports.FAMILY_SERIAL_CODE = {
    LAPTOP: 'LT', DESKTOP: 'DT', ALL_IN_ONE: 'AI', TABLET: 'TB', MONITOR: 'MN', SMART_BOARD: 'SB', SERVER: 'SV',
    INVERTER: 'IV', BATTERY: 'BT', SOLAR_PANEL: 'SP', SOLAR_KIT: 'SK',
    GENERATOR: 'GN', TELEVISION: 'TV', FAN: 'FN', STABILISER: 'ST', AIR_CONDITIONER: 'AC', REFRIGERATOR: 'RF', MICROWAVE: 'MW',
    ACCESSORY: 'AX', OTHER: 'OT',
};
function familySerialCode(family) {
    return exports.FAMILY_SERIAL_CODE[family] ?? 'OT';
}
// ── Figures ────────────────────────────────────────────────────────────────
/** QA pass rate over a set of QA results (null when nothing was tested). */
function qaPassRate(results) {
    const tested = results.filter((r) => typeof r === 'boolean');
    if (tested.length === 0)
        return null;
    return Math.round((tested.filter(Boolean).length / tested.length) * 1000) / 10;
}
