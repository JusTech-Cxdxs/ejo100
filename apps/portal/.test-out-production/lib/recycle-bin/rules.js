"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNAPSHOT_ORDER = exports.JOB_DELETE_REFUSED = exports.CREATOR_WINDOW_HOURS = exports.SERVICE_DELETABLE_STATUSES = exports.JOB_CARD_DELETABLE_STATUSES = exports.REASON_MAX = exports.REASON_MIN = exports.MAX_RETENTION_DAYS = exports.MIN_RETENTION_DAYS = exports.DEFAULT_RETENTION_DAYS = exports.BIN_KIND = exports.BIN_ENTITIES = void 0;
exports.binHref = binHref;
exports.isBinEntity = isBinEntity;
exports.retentionDays = retentionDays;
exports.purgeAfterFrom = purgeAfterFrom;
exports.daysLeft = daysLeft;
exports.binState = binState;
exports.cleanReason = cleanReason;
exports.jobCardEligibility = jobCardEligibility;
exports.vehicleServiceEligibility = vehicleServiceEligibility;
exports.vehicleEligibility = vehicleEligibility;
exports.customerEligibility = customerEligibility;
exports.partEligibility = partEligibility;
exports.mayDeleteJob = mayDeleteJob;
exports.mayDeleteOther = mayDeleteOther;
exports.orderedSnapshot = orderedSnapshot;
exports.parseSnapshot = parseSnapshot;
exports.plainRow = plainRow;
exports.nextReference = nextReference;
exports.restoredReference = restoredReference;
exports.binLabel = binLabel;
/**
 * Recycle bin rules — pure, no database (unit-tested in tests/recycle-bin.test.ts).
 *
 * A record created by mistake can be moved to the Recycle bin only while
 * nothing of consequence has happened to it. Anything with money, approvals,
 * parts, warranties or gate movements keeps its own route (cancel, close,
 * switch off), because that history must never disappear.
 */
const pluralize_1 = require("../utils/pluralize");
exports.BIN_ENTITIES = ['JobCard', 'VehicleService', 'Customer', 'CustomerVehicle', 'Part'];
/** How each kind is named to people, and the verb prefix of its audit entries. */
exports.BIN_KIND = {
    JobCard: { noun: 'Job Card', plural: 'Job Cards', audit: 'job_card', icon: 'clipboard' },
    VehicleService: { noun: 'Vehicle Service', plural: 'Vehicle Services', audit: 'vehicle_service', icon: 'droplet' },
    Customer: { noun: 'Customer', plural: 'Customers', audit: 'customer', icon: 'user' },
    CustomerVehicle: { noun: 'Vehicle', plural: 'Vehicles', audit: 'vehicle', icon: 'car' },
    Part: { noun: 'Part', plural: 'Parts', audit: 'part', icon: 'boxes' },
};
/** The record's own page. */
function binHref(entity, id) {
    switch (entity) {
        case 'JobCard': return `/workshop/job-cards/${id}`;
        case 'VehicleService': return `/workshop/vehicle-service/${id}`;
        case 'Customer': return `/crm/customers/${id}`;
        case 'CustomerVehicle': return `/workshop/vehicles/${id}/edit`;
        case 'Part': return `/inventory/parts/${id}`;
    }
}
function isBinEntity(v) {
    return typeof v === 'string' && exports.BIN_ENTITIES.includes(v);
}
// ── Retention ─────────────────────────────────────────────────────────
exports.DEFAULT_RETENTION_DAYS = 30;
exports.MIN_RETENTION_DAYS = 7;
exports.MAX_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
/** RECYCLE_BIN_DAYS, kept between 7 and 90 days (30 when unset or not a number). */
function retentionDays(raw) {
    const n = raw === undefined || raw === null || raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(n))
        return exports.DEFAULT_RETENTION_DAYS;
    return Math.min(exports.MAX_RETENTION_DAYS, Math.max(exports.MIN_RETENTION_DAYS, Math.round(n)));
}
function purgeAfterFrom(deletedAt, days) {
    return new Date(deletedAt.getTime() + days * DAY_MS);
}
/** Whole days left before the item can be purged (0 on the last day and after). */
function daysLeft(purgeAfter, now = new Date()) {
    return Math.max(0, Math.ceil((purgeAfter.getTime() - now.getTime()) / DAY_MS));
}
function binState(item, now = new Date()) {
    if (item.purgedAt)
        return 'PURGED';
    if (item.restoredAt)
        return 'RESTORED';
    return item.purgeAfter.getTime() <= now.getTime() ? 'EXPIRED' : 'IN_BIN';
}
// ── Reason ────────────────────────────────────────────────────────────
exports.REASON_MIN = 5;
exports.REASON_MAX = 300;
/** The reason is required: a few words on what the mistake was. */
function cleanReason(raw) {
    const reason = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
    if (reason.length < exports.REASON_MIN)
        return { ok: false, message: 'Say in a few words why this was created by mistake (at least 5 characters).' };
    if (reason.length > exports.REASON_MAX)
        return { ok: false, message: `Keep the reason under ${exports.REASON_MAX} characters.` };
    return { ok: true, reason };
}
function verdict(noun, blockers, advice) {
    if (blockers.length === 0)
        return { eligible: true, blockers, message: '', advice };
    // At most three reasons are named, so the sentence stays short enough to show as it is.
    const named = blockers.length > 3 ? [...blockers.slice(0, 2), `has ${blockers.length - 2} other things recorded`] : blockers;
    const what = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
    return { eligible: false, blockers, message: `This ${noun} ${what}, so it can't be deleted. ${advice}`, advice };
}
const some = (n, singular, plural) => (n === 1 ? `a ${singular}` : (0, pluralize_1.pluralize)(n, singular, plural));
/** Job Card statuses at the very start of its life. */
exports.JOB_CARD_DELETABLE_STATUSES = ['CHECKED_IN'];
function jobCardEligibility(f) {
    const b = [];
    if (f.payments > 0)
        b.push(`has ${some(f.payments, 'payment')} recorded`);
    if (f.refunds > 0)
        b.push(`has ${some(f.refunds, 'refund')} recorded`);
    if (!exports.JOB_CARD_DELETABLE_STATUSES.includes(f.status))
        b.push('has moved past check-in');
    if (f.estimateStatus && f.estimateStatus !== 'DRAFT')
        b.push('has an estimate that was submitted for approval');
    if (f.partRequests > 0)
        b.push(`has ${some(f.partRequests, 'parts request')}`);
    if (f.outsidePurchases > 0)
        b.push(`has ${some(f.outsidePurchases, 'outside purchase')}`);
    if (f.estimateLinesInUse > 0 && f.partRequests === 0 && f.outsidePurchases === 0)
        b.push('has estimate lines used by a parts request');
    if (f.warranties > 0)
        b.push(`has ${some(f.warranties, 'warranty', 'warranties')} linked to it`);
    if (f.warrantyClaims > 0)
        b.push(`has ${some(f.warrantyClaims, 'warranty claim')} linked to it`);
    if (f.gateExit)
        b.push('has a gate exit recorded');
    if (f.roadTests > 0)
        b.push(`has ${some(f.roadTests, 'road test')}`);
    if (f.escalatedFromService)
        b.push('was handed over from a Vehicle Service');
    if (f.closeRequests > 0)
        b.push('has a close request');
    if (f.approvalDecided)
        b.push('has been approved or rejected by a supervisor');
    if (f.technicianAssigned)
        b.push('has a technician assigned');
    return { ...verdict('Job Card', b, 'Ask for it to be cancelled instead.'), finished: ['CLOSED', 'CHECKED_OUT', 'CANCELLED'].includes(f.status) };
}
exports.SERVICE_DELETABLE_STATUSES = ['SCHEDULED', 'CHECKED_IN'];
function vehicleServiceEligibility(f) {
    const b = [];
    if (f.payments > 0)
        b.push(`has ${some(f.payments, 'payment')} recorded`);
    if (f.refunds > 0)
        b.push(`has ${some(f.refunds, 'refund')} recorded`);
    if (f.escalatedToJobCard)
        b.push('was handed over to a Job Card');
    else if (!exports.SERVICE_DELETABLE_STATUSES.includes(f.status))
        b.push('has moved past check-in');
    if (f.estimateStatus && f.estimateStatus !== 'DRAFT')
        b.push('has an estimate that was submitted for approval');
    if (f.partRequests > 0)
        b.push(`has ${some(f.partRequests, 'parts request')}`);
    if (f.estimateLinesInUse > 0 && f.partRequests === 0)
        b.push('has estimate lines used by a parts request');
    if (f.inspectionStatus === 'COMPLETED' || f.inspectionStatus === 'SKIPPED')
        b.push('has a finished inspection');
    if (f.primaryServiceRecorded)
        b.push('has a primary service recorded');
    if (f.warranties > 0)
        b.push(`has ${some(f.warranties, 'warranty', 'warranties')} linked to it`);
    if (f.warrantyClaims > 0)
        b.push(`has ${some(f.warrantyClaims, 'warranty claim')} linked to it`);
    if (f.gateExit)
        b.push('has a gate exit recorded');
    if (f.roadTests > 0)
        b.push(`has ${some(f.roadTests, 'road test')}`);
    if (f.closeRequests > 0)
        b.push('has a close request');
    if (f.approvalDecided)
        b.push('has been approved or rejected by a supervisor');
    if (f.technicianAssigned)
        b.push('has a technician assigned');
    return { ...verdict('Vehicle Service', b, 'Ask for it to be cancelled instead.'), finished: f.escalatedToJobCard || ['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'].includes(f.status) };
}
function vehicleBlockers(f) {
    const b = [];
    if (f.jobCards > 0)
        b.push(`has ${some(f.jobCards, 'Job Card')}`);
    if (f.vehicleServices > 0)
        b.push(`has ${some(f.vehicleServices, 'Vehicle Service')}`);
    if (f.warranties > 0)
        b.push(`has ${some(f.warranties, 'warranty', 'warranties')}`);
    if (f.warrantyClaims > 0)
        b.push(`has ${some(f.warrantyClaims, 'warranty claim')}`);
    if (f.gateExits > 0)
        b.push('has gate exits recorded');
    if (f.roadTests > 0)
        b.push(`has ${some(f.roadTests, 'road test')}`);
    return b;
}
function vehicleEligibility(f) {
    return verdict('vehicle', vehicleBlockers(f), 'Its history must stay. Correct its details with Edit instead.');
}
function customerEligibility(f) {
    const b = vehicleBlockers(f);
    if (f.signedIn)
        b.push('has signed in to the customer portal');
    return verdict('customer', b, 'Their history must stay. Correct the details, or switch off their portal access, instead.');
}
function partEligibility(f) {
    const b = [];
    if (f.goodsReceiptLines > 0 || f.batches > 0 || f.serials > 0)
        b.push('has been received into stock');
    if (f.stockOnHand !== 0 || f.stockReserved !== 0)
        b.push('has stock on hand or reserved');
    if (f.consumptions > 0)
        b.push('has been issued to a job');
    if (f.requestLines > 0)
        b.push(`is on ${some(f.requestLines, 'parts request line')}`);
    if (f.estimateMatches > 0)
        b.push('has been matched on an estimate');
    if (f.warranties > 0)
        b.push(`has ${some(f.warranties, 'warranty', 'warranties')}`);
    if (f.pricingAlerts > 0)
        b.push('has pricing alerts');
    return verdict('part', b, 'Switch it off (inactive) on its edit page instead.');
}
// ── Who may move a record to the bin ──────────────────────────────────
exports.CREATOR_WINDOW_HOURS = 24;
/** Job Cards and Vehicle Services: the person who opened it (front desk)
 * within 24 hours, or a Manager / administrator while it is eligible. */
function mayDeleteJob(r, rec, now = new Date()) {
    if (r.isSuperAdmin || r.manageBin || r.ownerRight)
        return true;
    const fresh = now.getTime() - rec.createdAt.getTime() <= exports.CREATOR_WINDOW_HOURS * 3_600_000;
    return Boolean(r.openJobs) && rec.createdById === r.userId && fresh;
}
exports.JOB_DELETE_REFUSED = `Only the person who opened it (within ${exports.CREATOR_WINDOW_HOURS} hours), a Manager or an administrator can delete it.`;
/** Customers, vehicles and parts: whoever manages them, or an administrator. */
function mayDeleteOther(r) {
    return r.isSuperAdmin || r.manageBin || r.ownerRight;
}
// ── Snapshot ──────────────────────────────────────────────────────────
/** Every model a snapshot may hold, in the order rows are re-inserted (parents first). */
exports.SNAPSHOT_ORDER = {
    JobCard: ['jobCard', 'jobCardComplaint', 'estimate', 'estimateLineItem', 'cancellationRequest', 'closeRequest'],
    VehicleService: ['vehicleService', 'vehicleServiceComplaint', 'vehicleInspection', 'vehicleInspectionItem', 'serviceEstimate', 'serviceEstimateLineItem', 'vehicleServiceCancellationRequest', 'vehicleServiceCloseRequest'],
    Customer: ['customer', 'customerCompany', 'customerAddress', 'customerContact', 'customerNote', 'customerNotificationRead', 'customerVehicle', 'serviceReminderLog'],
    CustomerVehicle: ['customerVehicle', 'serviceReminderLog'],
    Part: ['part', 'partUnitOfMeasure', 'partStock', 'partFitment'],
};
/** Rows in re-insert order (stable within a model). Refuses a model that does
 * not belong to this kind of record, or anything but exactly one root row. */
function orderedSnapshot(entity, rows) {
    const order = exports.SNAPSHOT_ORDER[entity];
    for (const r of rows)
        if (!order.includes(r.model))
            throw new Error(`Snapshot of ${entity} cannot hold ${r.model}`);
    const roots = rows.filter((r) => r.model === order[0]).length;
    if (roots !== 1)
        throw new Error(`Snapshot of ${entity} needs exactly one ${order[0]} row`);
    const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => order.indexOf(a.r.model) - order.indexOf(b.r.model) || a.i - b.i).map((x) => x.r);
    return { v: 1, entity, rows: sorted };
}
/** A stored snapshot read back — or null when it is missing or malformed. */
function parseSnapshot(json) {
    if (!json || typeof json !== 'object')
        return null;
    const s = json;
    if (s.v !== 1 || !isBinEntity(s.entity) || !Array.isArray(s.rows))
        return null;
    const rows = s.rows.filter((r) => Boolean(r) && typeof r.model === 'string' && typeof r.data === 'object' && r.data !== null);
    if (rows.length !== s.rows.length)
        return null;
    try {
        return orderedSnapshot(s.entity, rows);
    }
    catch {
        return null;
    }
}
/** Plain JSON for storage: dates as ISO text, decimals as text (both are
 * accepted back by Prisma on create), relation objects left out. */
function plainRow(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        if (v instanceof Date)
            out[k] = v.toISOString();
        else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            const maybe = v;
            if (typeof maybe.toJSON === 'function')
                out[k] = maybe.toJSON();
            // Any other object is a loaded relation, never a column of these tables.
        }
        else
            out[k] = v;
    }
    return out;
}
// ── Reference numbers ─────────────────────────────────────────────────
/** "JC-2026-" + the next 6-digit sequence after the latest number this year. */
function nextReference(prefix, latest) {
    const seq = latest && latest.startsWith(prefix) ? parseInt(latest.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(6, '0')}`;
}
/** On restore: the original number when it is still free, else the next one. */
function restoredReference(original, originalTaken, prefix, latest) {
    if (!originalTaken)
        return { reference: original, changed: false };
    return { reference: nextReference(prefix, latest), changed: true };
}
/** "JC-2026-000123 · Toyota Hilux KJA-219-XY · Ada Okafor" */
function binLabel(parts) {
    return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(' · ').slice(0, 200);
}
