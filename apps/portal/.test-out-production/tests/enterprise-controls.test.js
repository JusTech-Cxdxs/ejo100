"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Enterprise controls (Stage 1): separation of duties on parts and outside
 * purchases, the append-only audit trail, and request ids in error logs.
 * Static checks: each rule is in the code where the step happens, so a later
 * edit that drops one fails here before it reaches a review.
 */
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
/** The body of one exported function, up to the next top-level export. */
function body(src, name) {
    const start = src.indexOf(`export async function ${name}(`);
    strict_1.default.ok(start >= 0, `${name} exists`);
    const next = src.indexOf('\nexport ', start + 10);
    return src.slice(start, next < 0 ? undefined : next);
}
const SOD = [
    { fn: 'approvePartRequestSlipByHod', perm: 'store.prs.approve_hod', refused: ['slip.requestedById'] },
    { fn: 'approvePartRequestSlipByStore', perm: 'store.prs.release', refused: ['slip.requestedById', 'slip.hodApprovedById'] },
    { fn: 'sendExternalProcurementToManager', perm: 'procurement.epr.review', refused: ['request.requestedById'] },
    { fn: 'approveExternalProcurementRequest', perm: 'procurement.epr.approve', refused: ['request.requestedById', 'request.financeReviewedById'] },
    { fn: 'disburseExternalProcurementRequest', perm: 'procurement.epr.disburse', refused: ['request.requestedById', 'request.managerApprovedById'] },
];
(0, node_test_1.test)('separation of duties: nobody approves, reviews or pays out a request they raised or already approved', () => {
    const src = read('lib/actions/sourcing.ts');
    for (const s of SOD) {
        const b = body(src, s.fn);
        for (const r of s.refused) {
            const field = r.split('.')[1];
            strict_1.default.match(b, new RegExp(`${field}: true`), `${s.fn} reads ${field}`);
            strict_1.default.match(b, new RegExp(`user\\.id === ${r.replace('.', '\\.')}`), `${s.fn} compares the person with ${r}`);
        }
        strict_1.default.match(b, new RegExp(`await refuse\\('${s.perm.replace(/\./g, '\\.')}', '${s.fn}'`), `${s.fn} refuses through refuse() (audited)`);
        // The refusal comes before the compare-and-set claim, so nothing changes first.
        const refuseAt = b.indexOf('await refuse(');
        const claimAt = b.search(/\.updateMany\(|\$transaction\(/);
        if (claimAt >= 0)
            strict_1.default.ok(refuseAt < claimAt, `${s.fn} refuses before changing anything`);
    }
});
(0, node_test_1.test)('the integrity watch flags the same Finance colleague reviewing and paying out', () => {
    const scan = read('lib/integrity/scan.ts');
    strict_1.default.match(scan, /spa:epr-review-pay:/);
});
(0, node_test_1.test)('the audit trail is append-only in the database (postdeploy 0005)', () => {
    const sql = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, '..', '..', 'scripts', 'postdeploy', '0005-audit-log-append-only.sql'), 'utf8');
    strict_1.default.match(sql, /CREATE OR REPLACE FUNCTION\s+(public\.)?ejo_audit_logs_append_only\(\)/i);
    strict_1.default.match(sql, /BEFORE UPDATE OR DELETE ON "?(public\.)?audit_logs"?\s+FOR EACH ROW/i);
    strict_1.default.match(sql, /BEFORE TRUNCATE ON "?(public\.)?audit_logs"?/i);
    strict_1.default.match(sql, /RAISE EXCEPTION/i);
    strict_1.default.match(sql, /ejo\.audit_maintenance/, 'a deliberate, named maintenance switch for retention only');
    strict_1.default.match(sql, /to_regclass\('public\.audit_logs'\)/, 'safe on a database without the table');
    strict_1.default.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|^\s*TRUNCATE\b/im, 'never removes data');
});
(0, node_test_1.test)('the audit retention job, if any, switches maintenance on for its own transaction only', () => {
    const sql = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, '..', '..', 'scripts', 'postdeploy', '0005-audit-log-append-only.sql'), 'utf8');
    // set_config(..., true) / SET LOCAL is transaction-scoped; a session-wide switch would leave the trail open.
    strict_1.default.doesNotMatch(sql, /set_config\('ejo\.audit_maintenance',\s*'on',\s*false\)/i);
});
(0, node_test_1.test)('error references are tied to the request id in the logs', () => {
    const ev = read('lib/error-events.ts');
    strict_1.default.match(ev, /h\?\.get\('x-request-id'\)/);
    strict_1.default.match(ev, /message: 'Error reference', ref: r\.ref/);
    const mw = read('middleware.ts');
    strict_1.default.match(mw, /forwarded\.set\('x-request-id', requestId\)/);
    strict_1.default.match(mw, /res\.headers\.set\('x-request-id', requestId\)/);
});
(0, node_test_1.test)('the person whose step it now is gets an email, end to end', () => {
    const src = read('lib/actions/sourcing.ts');
    // Finance hears when an outside purchase is ready to pay out; the reviewer hears when the manager turns it down.
    strict_1.default.match(body(src, 'approveExternalProcurementRequest'), /where: 'external_procurement\.approved'/);
    strict_1.default.match(body(src, 'rejectExternalProcurementRequest'), /if \(stage === 'MANAGER_APPROVAL'\)[\s\S]*financeReviewedById/);
    // Whoever raised a parts request or outside purchase hears every outcome; a Store rejection also tells the HOD.
    strict_1.default.match(src, /slip\?\.requestedById, kind === 'rejected' && slip\?\.rejectionStage === 'STORE' \? slip\.hodApprovedById/);
    strict_1.default.match(src, /jobCard\.assignedTechnicianId, req\?\.requestedById/);
    // After the response: a slow mail server never delays approve, reject or rework.
    strict_1.default.doesNotMatch(src, /await emailColleagues\(/);
    const ws = read('lib/actions/workshop.ts');
    strict_1.default.doesNotMatch(ws, /await emailColleagues\(/);
    strict_1.default.match(ws, /where: 'job_card\.quality_check'/);
    strict_1.default.match(ws, /where: 'job_card\.rework'/);
    strict_1.default.match(body(ws, 'returnEstimateForChanges'), /where: 'estimate\.returned_for_changes'/);
    strict_1.default.match(body(ws, 'reassignSupervisor'), /where: 'job_card\.supervisor_reassigned'/);
    const sup = read('lib/actions/support.ts');
    strict_1.default.match(body(sup, 'moveSupportTicket'), /nextAssignee\(t\.organisationId, target\.id\)/);
    strict_1.default.match(body(sup, 'moveSupportTicket'), /nobody_free_alerted/);
    strict_1.default.match(sup, /where: 'support\.reassigned'/);
    strict_1.default.match(read('lib/actions/security.ts'), /Department Head authorised/);
    strict_1.default.match(read('lib/actions/users-admin.ts'), /if \(active\) after\(\(\) => tellReactivated\(user\.id\)\)/);
    strict_1.default.match(read('lib/auth.ts'), /onPasswordReset: async/);
    strict_1.default.match(read('lib/auth.ts'), /ctx\.path === '\/change-password'[\s\S]*sendPasswordChangedNotice/);
    // One helper: never the person who acted, active colleagues of the same organisation only, never throws.
    const h = read('lib/workflow-notify.ts');
    strict_1.default.match(h, /x !== o\.exceptUserId/);
    strict_1.default.match(h, /organisationId, isActive: true/);
    strict_1.default.match(h, /catch \(err\)/);
});
