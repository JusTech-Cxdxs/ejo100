"use strict";
/**
 * Warehouse rules without the database: the finished-unit status machine,
 * transfer rules, pick validation and serial-list parsing. Relative imports
 * only — the unit tests compile this file on its own (tests/warehouse.test.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FG_LOCATION_KIND_LABEL = exports.FG_LOCATION_KINDS = exports.DISPATCH_STATUS_LABEL = exports.RELEASE_STATUS_LABEL = exports.RELEASE_TRANSITIONS = exports.TRANSFER_STATUS_LABEL = exports.TRANSFER_TRANSITIONS = exports.UNIT_STATUS_TONE = exports.UNIT_STATUS_LABEL = exports.MOVABLE_STATUSES = exports.ON_HAND_STATUSES = exports.UNIT_TRANSITIONS = exports.UNIT_STATUSES = void 0;
exports.canMoveUnit = canMoveUnit;
exports.parseSerials = parseSerials;
exports.serialProblem = serialProblem;
exports.remainingToReceive = remainingToReceive;
exports.canMoveTransfer = canMoveTransfer;
exports.transferNeedsApproval = transferNeedsApproval;
exports.transferProblem = transferProblem;
exports.canDispatchTransfer = canDispatchTransfer;
exports.pickProblem = pickProblem;
exports.linesLeftToPick = linesLeftToPick;
exports.releaseReadyToRelease = releaseReadyToRelease;
exports.dispatchProblem = dispatchProblem;
exports.inspectionProblem = inspectionProblem;
exports.defectRate = defectRate;
exports.tally = tally;
exports.UNIT_STATUSES = ['IN_STOCK', 'RESERVED', 'PICKED', 'RELEASED', 'DISPATCHED', 'SOLD', 'RETURNED', 'QUARANTINE', 'IN_SERVICE', 'SCRAPPED'];
/** Where a unit may go from each status. A sold unit only comes back as a return or into service. */
exports.UNIT_TRANSITIONS = {
    IN_STOCK: ['RESERVED', 'PICKED', 'QUARANTINE', 'SCRAPPED', 'IN_SERVICE'],
    RESERVED: ['IN_STOCK', 'PICKED', 'QUARANTINE'],
    PICKED: ['IN_STOCK', 'RESERVED', 'RELEASED'],
    RELEASED: ['DISPATCHED', 'PICKED'],
    DISPATCHED: ['SOLD', 'RELEASED'],
    SOLD: ['RETURNED', 'IN_SERVICE'],
    RETURNED: ['QUARANTINE', 'IN_STOCK', 'SCRAPPED'],
    QUARANTINE: ['IN_STOCK', 'SCRAPPED'],
    IN_SERVICE: ['IN_STOCK', 'SOLD', 'SCRAPPED'],
    SCRAPPED: [],
};
function canMoveUnit(from, to) {
    return (exports.UNIT_TRANSITIONS[from] ?? []).includes(to);
}
/** Statuses in which a unit physically sits in a location and counts as stock on hand. */
exports.ON_HAND_STATUSES = ['IN_STOCK', 'RESERVED', 'PICKED', 'RELEASED', 'QUARANTINE'];
/** Statuses a unit can be moved between locations in (not promised to anyone, not gone). */
exports.MOVABLE_STATUSES = ['IN_STOCK', 'QUARANTINE', 'RETURNED'];
exports.UNIT_STATUS_LABEL = {
    IN_STOCK: 'In stock',
    RESERVED: 'Reserved',
    PICKED: 'Picked',
    RELEASED: 'Released',
    DISPATCHED: 'Dispatched',
    SOLD: 'Sold',
    RETURNED: 'Returned',
    QUARANTINE: 'Quarantine',
    IN_SERVICE: 'In service',
    SCRAPPED: 'Scrapped',
};
exports.UNIT_STATUS_TONE = {
    IN_STOCK: 'success',
    RESERVED: 'warning',
    PICKED: 'info',
    RELEASED: 'info',
    DISPATCHED: 'info',
    SOLD: 'neutral',
    RETURNED: 'warning',
    QUARANTINE: 'warning',
    IN_SERVICE: 'info',
    SCRAPPED: 'error',
};
// ── Serial lists ──────────────────────────────────────────────────────────
/** One serial per line (commas, semicolons and spaces also separate); trimmed, de-duplicated, order kept. */
function parseSerials(text) {
    const out = [];
    const seen = new Set();
    for (const raw of text.split(/[\n,;\s]+/)) {
        const s = raw.trim();
        if (!s)
            continue;
        const key = s.toUpperCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(s);
    }
    return out;
}
/** A serial on a label: letters, digits, dashes, dots and slashes; 4–64 characters. */
function serialProblem(serial) {
    if (serial.length < 4)
        return `"${serial}" is too short for a serial number.`;
    if (serial.length > 64)
        return `"${serial.slice(0, 20)}…" is too long for a serial number.`;
    if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(serial))
        return `"${serial}" has characters a serial number cannot have.`;
    return null;
}
/** How many of a purchase-order line may still be received. */
function remainingToReceive(line) {
    return Math.max(0, Math.round((line.quantity - line.receivedQuantity) * 1000) / 1000);
}
exports.TRANSFER_TRANSITIONS = {
    DRAFT: ['DISPATCHED', 'CANCELLED'],
    DISPATCHED: ['RECEIVED', 'CANCELLED'],
    RECEIVED: [],
    CANCELLED: [],
};
function canMoveTransfer(from, to) {
    return (exports.TRANSFER_TRANSITIONS[from] ?? []).includes(to);
}
/** A transfer between two branches needs the Warehouse Manager's approval before it leaves. */
function transferNeedsApproval(from, to) {
    return from.branchId !== to.branchId;
}
function transferProblem(input) {
    if (!input.fromLocationId || !input.toLocationId)
        return 'Choose where the units come from and where they are going.';
    if (input.fromLocationId === input.toLocationId)
        return 'The units are already there — choose a different destination.';
    if (input.unitIds.length === 0)
        return 'Pick at least one unit to move.';
    if (input.fromActive === false)
        return 'The source location has been retired.';
    if (input.toActive === false)
        return 'The destination location has been retired.';
    return null;
}
/** Whether a transfer can be dispatched now: a draft, and approved when it crosses branches. */
function canDispatchTransfer(t) {
    if (t.status !== 'DRAFT')
        return { ok: false, why: 'Only a draft transfer can be dispatched.' };
    if (t.needsApproval && !t.approved)
        return { ok: false, why: 'A transfer to another branch needs the Warehouse Manager\'s approval before it leaves.' };
    return { ok: true };
}
exports.TRANSFER_STATUS_LABEL = { DRAFT: 'Draft', DISPATCHED: 'On the way', RECEIVED: 'Received', CANCELLED: 'Cancelled' };
exports.RELEASE_TRANSITIONS = {
    ISSUED: ['PICKED', 'CANCELLED'],
    PICKED: ['RELEASED', 'ISSUED', 'CANCELLED'],
    RELEASED: [],
    CANCELLED: [],
};
exports.RELEASE_STATUS_LABEL = { ISSUED: 'Waiting to pick', PICKED: 'Picked', RELEASED: 'Released', CANCELLED: 'Cancelled' };
/** Why a unit cannot be picked for a line (null = it can). */
function pickProblem(line, unit, ctx) {
    if (line.finishedUnitId)
        return 'This line already has a unit picked — unpick it first.';
    if (!line.serialised)
        return 'This line is quantity-tracked; nothing to pick by serial.';
    if (unit.productId !== line.productId)
        return 'That unit is a different product from the one ordered.';
    if (line.configurationId && unit.configurationId && unit.configurationId !== line.configurationId)
        return 'That unit is a different configuration from the one ordered.';
    if (unit.branchId !== ctx.branchId)
        return 'That unit is held at another branch.';
    if (unit.status === 'RESERVED')
        return unit.salesOrderId === ctx.salesOrderId ? null : 'That unit is reserved for another order.';
    if (unit.status !== 'IN_STOCK')
        return `That unit is ${exports.UNIT_STATUS_LABEL[unit.status].toLowerCase()}, not in stock.`;
    return null;
}
/** Lines that still need a serial picked (quantity-tracked lines never do). */
function linesLeftToPick(lines) {
    return lines.filter((l) => l.serialised && !l.finishedUnitId).length;
}
function releaseReadyToRelease(lines) {
    return lines.length > 0 && linesLeftToPick(lines) === 0;
}
exports.DISPATCH_STATUS_LABEL = { DISPATCHED: 'On the road', DELIVERED: 'Delivered', FAILED: 'Not delivered' };
function dispatchProblem(input) {
    if (input.hasDispatch)
        return 'This release note has already been dispatched.';
    if (input.releaseStatus !== 'RELEASED')
        return 'Only released goods can be dispatched — release the note first.';
    if (!input.driverName.trim() && !input.carrier.trim())
        return 'Name the driver or the carrier taking the goods.';
    if (input.driverName.trim() && !input.vehiclePlate.trim() && !input.carrier.trim())
        return 'Enter the vehicle plate the driver is using.';
    return null;
}
// ── Incoming QC ───────────────────────────────────────────────────────────
function inspectionProblem(input) {
    if (!Number.isInteger(input.sampleSize) || input.sampleSize < 1)
        return 'Enter how many items were sampled (at least 1).';
    if (!Number.isInteger(input.defects) || input.defects < 0)
        return 'Defects must be a whole number.';
    if (input.defects > input.sampleSize)
        return 'There cannot be more defects than items sampled.';
    return null;
}
/** Defect rate as a percentage, one decimal. */
function defectRate(sampleSize, defects) {
    if (sampleSize <= 0)
        return 0;
    return Math.round((defects / sampleSize) * 1000) / 10;
}
// ── Stock summaries ───────────────────────────────────────────────────────
/** Units in stock, grouped by a key (product family, location …), sorted by count. */
function tally(items) {
    const m = new Map();
    for (const i of items)
        m.set(i.key, (m.get(i.key) ?? 0) + (i.count ?? 1));
    return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}
exports.FG_LOCATION_KINDS = ['WAREHOUSE', 'SHOWROOM', 'CONSIGNMENT', 'TRANSIT', 'SERVICE', 'QUARANTINE'];
exports.FG_LOCATION_KIND_LABEL = {
    WAREHOUSE: 'Warehouse', SHOWROOM: 'Showroom', CONSIGNMENT: 'Consignment (partner)', TRANSIT: 'In transit', SERVICE: 'Service centre', QUARANTINE: 'Quarantine',
};
