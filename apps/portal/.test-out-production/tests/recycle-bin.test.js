"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Recycle bin: who may delete what, what makes a record ineligible, the
 * snapshot order a restore relies on, retention, and restore-number clashes.
 * Pure rules (lib/recycle-bin/rules.ts) plus source checks on the server half.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const rules_1 = require("../lib/recycle-bin/rules");
const data_inventory_1 = require("../lib/governance/data-inventory");
const catalogue_1 = require("../lib/authz/catalogue");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
const freshJob = {
    status: 'CHECKED_IN', payments: 0, refunds: 0, estimateStatus: null, partRequests: 0, outsidePurchases: 0, estimateLinesInUse: 0,
    warranties: 0, warrantyClaims: 0, gateExit: false, roadTests: 0, escalatedFromService: false, closeRequests: 0, approvalDecided: false, technicianAssigned: false,
};
const freshService = {
    status: 'SCHEDULED', payments: 0, refunds: 0, estimateStatus: null, partRequests: 0, estimateLinesInUse: 0, inspectionStatus: null,
    primaryServiceRecorded: false, escalatedToJobCard: false, warranties: 0, warrantyClaims: 0, gateExit: false, roadTests: 0, closeRequests: 0, approvalDecided: false, technicianAssigned: false,
};
(0, node_test_1.test)('a Job Card opened by mistake is eligible; a draft estimate does not stop it', () => {
    strict_1.default.equal((0, rules_1.jobCardEligibility)(freshJob).eligible, true);
    strict_1.default.equal((0, rules_1.jobCardEligibility)({ ...freshJob, estimateStatus: 'DRAFT' }).eligible, true);
});
(0, node_test_1.test)('anything of consequence makes a Job Card ineligible, with the cancel route named', () => {
    const paid = (0, rules_1.jobCardEligibility)({ ...freshJob, payments: 1 });
    strict_1.default.equal(paid.eligible, false);
    strict_1.default.equal(paid.message, "This Job Card has a payment recorded, so it can't be deleted. Ask for it to be cancelled instead.");
    const cases = [
        { refunds: 1 }, { status: 'IN_PROGRESS' }, { status: 'CANCELLED' }, { estimateStatus: 'SUBMITTED' }, { estimateStatus: 'MANAGER_APPROVED' },
        { partRequests: 1 }, { outsidePurchases: 2 }, { estimateLinesInUse: 1 }, { warranties: 1 }, { warrantyClaims: 1 }, { gateExit: true },
        { roadTests: 1 }, { escalatedFromService: true }, { closeRequests: 1 }, { approvalDecided: true }, { technicianAssigned: true },
    ];
    for (const c of cases)
        strict_1.default.equal((0, rules_1.jobCardEligibility)({ ...freshJob, ...c }).eligible, false, JSON.stringify(c));
    // Several reasons read as one sentence, with plurals right.
    strict_1.default.match((0, rules_1.jobCardEligibility)({ ...freshJob, payments: 2, partRequests: 1 }).message, /has 2 payments recorded and has a parts request, so it can't be deleted/);
    // However much happened, the message stays short enough to be shown as it is (friendlyError's limit).
    const everything = (0, rules_1.jobCardEligibility)({ ...freshJob, payments: 3, refunds: 1, status: 'CLOSED', estimateStatus: 'MANAGER_APPROVED', partRequests: 2, outsidePurchases: 1, warranties: 2, warrantyClaims: 1, gateExit: true, roadTests: 1, escalatedFromService: true, closeRequests: 1 });
    strict_1.default.ok(everything.message.length <= 300, everything.message);
    strict_1.default.match(everything.message, /other things recorded/);
    strict_1.default.equal(everything.finished, true);
});
(0, node_test_1.test)('Vehicle Services: scheduled or checked in, nothing paid, not handed over', () => {
    strict_1.default.equal((0, rules_1.vehicleServiceEligibility)(freshService).eligible, true);
    strict_1.default.equal((0, rules_1.vehicleServiceEligibility)({ ...freshService, status: 'CHECKED_IN', inspectionStatus: 'IN_PROGRESS' }).eligible, true);
    for (const c of [{ status: 'IN_SERVICE' }, { payments: 1 }, { escalatedToJobCard: true, status: 'ESCALATED' }, { estimateStatus: 'APPROVED' }, { inspectionStatus: 'COMPLETED' }, { primaryServiceRecorded: true }, { gateExit: true }, { approvalDecided: true }, { technicianAssigned: true }]) {
        strict_1.default.equal((0, rules_1.vehicleServiceEligibility)({ ...freshService, ...c }).eligible, false, JSON.stringify(c));
    }
    strict_1.default.match((0, rules_1.vehicleServiceEligibility)({ ...freshService, escalatedToJobCard: true, status: 'ESCALATED' }).message, /handed over to a Job Card/);
});
(0, node_test_1.test)('customers, vehicles and parts: only when nothing hangs off them', () => {
    const none = { jobCards: 0, vehicleServices: 0, warranties: 0, warrantyClaims: 0, gateExits: 0, roadTests: 0 };
    strict_1.default.equal((0, rules_1.vehicleEligibility)(none).eligible, true);
    strict_1.default.match((0, rules_1.vehicleEligibility)({ ...none, jobCards: 1 }).message, /This vehicle has a Job Card, so it can't be deleted/);
    strict_1.default.equal((0, rules_1.customerEligibility)({ ...none, signedIn: false }).eligible, true);
    strict_1.default.equal((0, rules_1.customerEligibility)({ ...none, signedIn: true }).eligible, false);
    strict_1.default.equal((0, rules_1.customerEligibility)({ ...none, vehicleServices: 3, signedIn: false }).eligible, false);
    const part = { goodsReceiptLines: 0, batches: 0, serials: 0, consumptions: 0, requestLines: 0, estimateMatches: 0, warranties: 0, pricingAlerts: 0, stockOnHand: 0, stockReserved: 0 };
    strict_1.default.equal((0, rules_1.partEligibility)(part).eligible, true);
    for (const k of Object.keys(part))
        strict_1.default.equal((0, rules_1.partEligibility)({ ...part, [k]: 1 }).eligible, false, k);
});
(0, node_test_1.test)('who may delete a Job Card: the opener within 24 hours, a Manager or an administrator any time', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    const rec = { createdById: 'fd', createdAt: new Date('2026-10-13T08:00:00Z') };
    const frontDesk = { userId: 'fd', isSuperAdmin: false, manageBin: false, ownerRight: false, openJobs: true };
    strict_1.default.equal((0, rules_1.mayDeleteJob)(frontDesk, rec, now), true);
    strict_1.default.equal((0, rules_1.mayDeleteJob)(frontDesk, { ...rec, createdAt: new Date('2026-10-12T11:59:00Z') }, now), false, 'after 24 hours');
    strict_1.default.equal((0, rules_1.mayDeleteJob)({ ...frontDesk, userId: 'someone-else' }, rec, now), false, 'another front desk');
    strict_1.default.equal((0, rules_1.mayDeleteJob)({ ...frontDesk, openJobs: false }, rec, now), false, 'opened it but may no longer open jobs');
    strict_1.default.equal((0, rules_1.mayDeleteJob)({ ...frontDesk, userId: 'mgr', openJobs: false, ownerRight: true }, { ...rec, createdAt: new Date('2026-01-01') }, now), true);
    strict_1.default.equal((0, rules_1.mayDeleteJob)({ ...frontDesk, userId: 'adm', openJobs: false, manageBin: true }, rec, now), true);
    strict_1.default.equal((0, rules_1.mayDeleteOther)({ userId: 'x', isSuperAdmin: false, manageBin: false, ownerRight: false }), false);
    strict_1.default.equal((0, rules_1.mayDeleteOther)({ userId: 'x', isSuperAdmin: false, manageBin: false, ownerRight: true }), true);
});
(0, node_test_1.test)('the Recycle bin permission: administrators (and their branch), never the departments', () => {
    const who = (roles, branchId = 'b1') => ({ userId: 'u', isSuperAdmin: false, roleSlugs: roles, branchId, departmentId: null, organisationId: 'o1', orgBranchIds: ['b1', 'b2'] });
    strict_1.default.equal(catalogue_1.ROLE_GRANTS.administrator['admin.recycle_bin.manage'], 'ALL');
    strict_1.default.equal(catalogue_1.ROLE_GRANTS['branch-administrator']['admin.recycle_bin.manage'], 'BRANCH');
    strict_1.default.equal((0, catalogue_1.decide)(who(['branch-administrator']), 'admin.recycle_bin.manage', { branchId: 'b2' }).allowed, false, 'another branch');
    strict_1.default.equal((0, catalogue_1.decide)(who(['administrator']), 'admin.recycle_bin.manage', { branchId: 'b-other-org' }).allowed, false, 'another organisation');
    for (const [slug, grants] of Object.entries(catalogue_1.ROLE_GRANTS)) {
        if (slug === 'administrator' || slug === 'branch-administrator')
            continue;
        strict_1.default.equal(grants['admin.recycle_bin.manage'], undefined, slug);
    }
});
(0, node_test_1.test)('snapshot: parents first, stable within a table, nothing foreign, exactly one root', () => {
    const rows = [
        { model: 'estimateLineItem', data: { id: 'l2' } },
        { model: 'jobCardComplaint', data: { id: 'c1' } },
        { model: 'estimateLineItem', data: { id: 'l1' } },
        { model: 'estimate', data: { id: 'e' } },
        { model: 'jobCard', data: { id: 'jc' } },
        { model: 'cancellationRequest', data: { id: 'cr' } },
    ];
    const s = (0, rules_1.orderedSnapshot)('JobCard', rows);
    strict_1.default.deepEqual(s.rows.map((r) => r.data.id), ['jc', 'c1', 'e', 'l2', 'l1', 'cr']);
    strict_1.default.throws(() => (0, rules_1.orderedSnapshot)('JobCard', [...rows, { model: 'payment', data: { id: 'p' } }]), /cannot hold payment/);
    strict_1.default.throws(() => (0, rules_1.orderedSnapshot)('JobCard', rows.filter((r) => r.model !== 'jobCard')), /exactly one jobCard/);
    // Every kind starts with its own table, and no money table is ever snapshotted (money is never deletable).
    for (const e of rules_1.BIN_ENTITIES) {
        strict_1.default.ok(rules_1.SNAPSHOT_ORDER[e].length >= 1);
        for (const m of rules_1.SNAPSHOT_ORDER[e])
            strict_1.default.doesNotMatch(m, /^(payment|refund|goodsReceipt|auditLog|warranty)/i, `${e}: ${m}`);
    }
    // Round trip through storage.
    strict_1.default.deepEqual((0, rules_1.parseSnapshot)(JSON.parse(JSON.stringify(s))), s);
    strict_1.default.equal((0, rules_1.parseSnapshot)({ v: 2, entity: 'JobCard', rows: [] }), null);
    strict_1.default.equal((0, rules_1.parseSnapshot)({ v: 1, entity: 'Payment', rows: [] }), null);
    strict_1.default.equal((0, rules_1.parseSnapshot)(null), null);
});
(0, node_test_1.test)('stored rows are plain JSON that Prisma accepts back (dates and decimals as text, no relations)', () => {
    const when = new Date('2026-10-13T09:30:00.000Z');
    const decimal = { toJSON: () => '1500.00' };
    const row = (0, rules_1.plainRow)({ id: 'x', createdAt: when, amount: decimal, tags: ['Fleet'], note: null, customer: { id: 'c' } });
    strict_1.default.deepEqual(row, { id: 'x', createdAt: '2026-10-13T09:30:00.000Z', amount: '1500.00', tags: ['Fleet'], note: null });
});
(0, node_test_1.test)('restore: the original number when free; the next number when it was reused', () => {
    strict_1.default.equal((0, rules_1.nextReference)('JC-2026-', 'JC-2026-000130'), 'JC-2026-000131');
    strict_1.default.equal((0, rules_1.nextReference)('JC-2026-', null), 'JC-2026-000001');
    strict_1.default.equal((0, rules_1.nextReference)('SV-2026-', 'JC-2026-000009'), 'SV-2026-000001');
    strict_1.default.deepEqual((0, rules_1.restoredReference)('JC-2026-000123', false, 'JC-2026-', 'JC-2026-000130'), { reference: 'JC-2026-000123', changed: false });
    strict_1.default.deepEqual((0, rules_1.restoredReference)('JC-2026-000123', true, 'JC-2026-', 'JC-2026-000130'), { reference: 'JC-2026-000131', changed: true });
});
(0, node_test_1.test)('retention: 30 days by default, kept between 7 and 90; days left never negative', () => {
    strict_1.default.equal((0, rules_1.retentionDays)(undefined), 30);
    strict_1.default.equal((0, rules_1.retentionDays)(''), 30);
    strict_1.default.equal((0, rules_1.retentionDays)('abc'), 30);
    strict_1.default.equal((0, rules_1.retentionDays)('1'), 7);
    strict_1.default.equal((0, rules_1.retentionDays)('365'), 90);
    strict_1.default.equal((0, rules_1.retentionDays)('45'), 45);
    const at = new Date('2026-10-01T10:00:00Z');
    const until = (0, rules_1.purgeAfterFrom)(at, 30);
    strict_1.default.equal(until.toISOString(), '2026-10-31T10:00:00.000Z');
    strict_1.default.equal((0, rules_1.daysLeft)(until, new Date('2026-10-30T11:00:00Z')), 1);
    strict_1.default.equal((0, rules_1.daysLeft)(until, new Date('2026-11-05T00:00:00Z')), 0);
    strict_1.default.equal((0, rules_1.binState)({ purgeAfter: until, restoredAt: null, purgedAt: null }, new Date('2026-10-05')), 'IN_BIN');
    strict_1.default.equal((0, rules_1.binState)({ purgeAfter: until, restoredAt: null, purgedAt: null }, new Date('2026-11-05')), 'EXPIRED');
    strict_1.default.equal((0, rules_1.binState)({ purgeAfter: until, restoredAt: at, purgedAt: null }), 'RESTORED');
});
(0, node_test_1.test)('a reason is required, trimmed and bounded; labels skip blanks', () => {
    strict_1.default.equal((0, rules_1.cleanReason)('   ').ok, false);
    strict_1.default.equal((0, rules_1.cleanReason)('oops').ok, false);
    strict_1.default.deepEqual((0, rules_1.cleanReason)('  Opened on the   wrong vehicle '), { ok: true, reason: 'Opened on the wrong vehicle' });
    strict_1.default.equal((0, rules_1.cleanReason)('x'.repeat(301)).ok, false);
    strict_1.default.equal((0, rules_1.binLabel)(['JC-2026-000123', 'Toyota Hilux KJA-219-XY', null, ' Ada Okafor ']), 'JC-2026-000123 · Toyota Hilux KJA-219-XY · Ada Okafor');
});
(0, node_test_1.test)('data inventory: exactly the bin kinds are marked, money and audit never are', () => {
    const marked = Object.entries(data_inventory_1.DATA_INVENTORY).filter(([, e]) => e.recycleBin).map(([k]) => k).sort();
    strict_1.default.deepEqual(marked, [...rules_1.BIN_ENTITIES].sort());
    strict_1.default.equal(data_inventory_1.DATA_INVENTORY.RecycleBinItem?.ai, 'NEVER');
    strict_1.default.equal(data_inventory_1.DATA_INVENTORY.RecycleBinItem?.lifecycle, 'EXPIRES');
    for (const m of ['Payment', 'Refund', 'AuditLog', 'GoodsReceipt', 'Warranty', 'WarrantyClaim'])
        strict_1.default.equal(data_inventory_1.DATA_INVENTORY[m]?.recycleBin, undefined, m);
});
(0, node_test_1.test)('server half: locks, checks again under the lock, snapshots and deletes in ONE transaction', () => {
    const src = read('lib/recycle-bin/server.ts');
    const move = src.slice(src.indexOf('export async function moveToBin('), src.indexOf('// ── Restore'));
    strict_1.default.match(move, /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*lockExisting\(tx, LOCK\[entity\][\s\S]*eligibilityOf\(entity, id, tx\)[\s\S]*if \(!check\.eligible\) throw[\s\S]*snapshotRows\(tx, entity, id\)[\s\S]*recycleBinItem\.create[\s\S]*deleteRoot\(tx, entity, id\)/);
    const restore = src.slice(src.indexOf('export async function restoreFromBin('), src.indexOf('// ── Purge'));
    strict_1.default.match(restore, /updateMany\(\{ where: \{ id: itemId, restoredAt: null, purgedAt: null \}/, 'claims the item before restoring (no double restore)');
    strict_1.default.match(restore, /purgeAfter\.getTime\(\) <= now\.getTime\(\)/, 'only within the retention period');
    // Restored and purged items do not keep a copy of the data.
    strict_1.default.match(restore, /snapshot: Prisma\.DbNull/);
    strict_1.default.match(src, /export async function purgeItems[\s\S]*snapshot: Prisma\.DbNull/);
    // The snapshot never holds sign-in secrets.
    strict_1.default.doesNotMatch(src, /customerAccount\.findMany|customerSession\.findMany|customerVerification\.findMany/);
    strict_1.default.ok(read('../../packages/database/src/audit-journal.ts').includes("'RecycleBinItem',"), 'the snapshot is not copied again into the journal');
});
(0, node_test_1.test)('actions: refused during an assisted session; restore needs the bin permission; purge is platform-only', () => {
    const src = read('lib/actions/recycle-bin.ts');
    for (const fn of ['moveToRecycleBin', 'restoreFromRecycleBin', 'purgeRecycleBinItems', 'purgeExpiredRecycleBinItems']) {
        const body = src.slice(src.indexOf(`export async function ${fn}(`), src.indexOf('\nexport ', src.indexOf(`export async function ${fn}(`) + 10));
        strict_1.default.match(body, new RegExp(`refuseDuringAssist\\('${fn}'\\)`), fn);
    }
    strict_1.default.match(src, /export async function restoreFromRecycleBin[\s\S]{0,700}inMyOrganisation\(item\.organisationId\)[\s\S]{0,300}authorize\('admin\.recycle_bin\.manage', \{ branchId: item\.branchId \}/);
    for (const fn of ['purgeRecycleBinItems', 'purgeExpiredRecycleBinItems'])
        strict_1.default.match(src, new RegExp(`export async function ${fn}[\\s\\S]{0,300}if \\(!p\\.isSuperAdmin\\) return refuse\\(`), fn);
    // The old platform-only hard deletes are gone.
    for (const f of ['lib/actions/workshop.ts', 'lib/actions/vehicle-service.ts'])
        strict_1.default.doesNotMatch(read(f), /export async function delete(JobCard|Vehicle|VehicleService)\(/, f);
});
(0, node_test_1.test)('Binned Job Card and Vehicle Service numbers stay reserved', () => {
    const { highestSequence } = require('../lib/recycle-bin/numbers');
    strict_1.default.equal(highestSequence('JC-2026-', ['JC-2026-000041', 'JC-2026-000043']), 43, 'a binned 43 beats a live 41');
    strict_1.default.equal(highestSequence('JC-2026-', [null, undefined]), 0);
    strict_1.default.equal(highestSequence('JC-2026-', ['JC-2025-000900', 'SV-2026-000050']), 0, 'other years and kinds are ignored');
});
