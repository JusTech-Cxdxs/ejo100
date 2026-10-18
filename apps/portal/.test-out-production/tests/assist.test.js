"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Assisted sessions — who may be assisted, by whom, and the signed cookie.
 * Pure: no database, no network.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const catalogue_1 = require("../lib/authz/catalogue");
const rules_1 = require("../lib/assist/rules");
const token_1 = require("../lib/assist/token");
const party = (userId, roleSlugs, extra = {}) => ({
    userId, isActive: true, isSuperAdmin: false, organisationId: 'org-1', branchId: 'branch-a', departmentId: null, roleSlugs, ...extra,
});
const assistant = party('ada', ['branch-assistant']);
(0, node_test_1.test)('the Branch Assistant role holds only support.assist', () => {
    strict_1.default.deepEqual(Object.keys(catalogue_1.ROLE_GRANTS['branch-assistant']), ['support.assist']);
    strict_1.default.equal(catalogue_1.ROLE_GRANTS['branch-assistant']['support.assist'], 'BRANCH');
    strict_1.default.ok(catalogue_1.ROLE_LABELS['branch-assistant']);
    strict_1.default.ok('support.assist' in catalogue_1.PERMISSIONS);
});
(0, node_test_1.test)('sensitive permissions: approvals, money, administration and the rest', () => {
    for (const k of ['workshop.estimate.approve', 'workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod', 'security.pass.approve', 'warranty.claim.approve',
        'workshop.payment.record', 'workshop.refund.record', 'procurement.epr.review', 'procurement.epr.disburse', 'procurement.epr.approve',
        'admin.users.manage', 'admin.roles.manage', 'audit.view', 'analytics.business.view', 'analytics.inventory.view', 'notifications.broadcast.send',
        'security.incident.manage', 'support.assist', 'store.parts.manage'])
        strict_1.default.equal((0, rules_1.isSensitivePermission)(k), true, k);
    for (const k of ['workshop.view', 'workshop.job_card.view', 'workshop.job.work', 'workshop.estimate.edit', 'workshop.inspection.perform', 'sourcing.request', 'store.view', 'security.exit_pass.request', 'schedule.view', 'workshop.job_card.create']) {
        strict_1.default.equal((0, rules_1.isSensitivePermission)(k), false, k);
    }
});
(0, node_test_1.test)('technicians and front desk can be assisted; no role with approvals or money can', () => {
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('musa', ['technician'])), null);
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('funmi', ['receptionist'])), null);
    for (const role of ['workshop-manager', 'workshop-supervisor', 'finance-officer', 'administrator', 'branch-administrator', 'store-manager', 'store-officer', 'warranty-hod', 'department-head', 'chief-security-officer', 'broadcaster', 'branch-assistant']) {
        strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('x', [role]))?.code, 'SENSITIVE', role);
    }
    // Every role that holds any approval is refused, whatever it is called.
    for (const [slug, grants] of Object.entries(catalogue_1.ROLE_GRANTS)) {
        if (Object.keys(grants).some((k) => /approve/.test(k)))
            strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('x', [slug]))?.code, 'SENSITIVE', slug);
    }
});
(0, node_test_1.test)('an added grant (Roles page) or a second role counts too', () => {
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('musa', ['technician'], { extraGrants: { 'workshop.payment.record': 'BRANCH' } }))?.code, 'SENSITIVE');
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('musa', ['technician', 'workshop-manager']))?.code, 'SENSITIVE');
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('root', [], { isSuperAdmin: true }))?.code, 'SENSITIVE');
    strict_1.default.deepEqual((0, rules_1.sensitivePermissionsOf)(party('musa', ['technician'])), []);
});
(0, node_test_1.test)('same organisation, same branch, active, not yourself', () => {
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('ada', ['technician']))?.code, 'SELF');
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('musa', ['technician'], { organisationId: 'org-2' }))?.code, 'OUT_OF_REACH');
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('musa', ['technician'], { branchId: 'branch-b' }))?.code, 'OUT_OF_REACH');
    strict_1.default.equal((0, rules_1.assistRefusal)(assistant, party('musa', ['technician'], { isActive: false }))?.code, 'COLLEAGUE_INACTIVE');
    strict_1.default.equal((0, rules_1.assistRefusal)({ ...assistant, organisationId: null }, party('musa', ['technician'], { organisationId: null }))?.code, 'OUT_OF_REACH');
});
(0, node_test_1.test)('the assistant must hold support.assist, be active, have a branch and not be the platform team', () => {
    const musa = party('musa', ['technician']);
    strict_1.default.equal((0, rules_1.assistRefusal)(party('t2', ['technician']), musa)?.code, 'NOT_ALLOWED');
    strict_1.default.equal((0, rules_1.assistRefusal)({ ...assistant, isActive: false }, musa)?.code, 'ASSISTANT_INACTIVE');
    strict_1.default.equal((0, rules_1.assistRefusal)({ ...assistant, branchId: null }, musa)?.code, 'NO_BRANCH');
    strict_1.default.equal((0, rules_1.assistRefusal)(party('root', [], { isSuperAdmin: true }), musa)?.code, 'PLATFORM_TEAM');
    // Granted on the Roles page to another role: still branch-scoped.
    strict_1.default.equal((0, rules_1.assistRefusal)(party('rita', ['calendar-user'], { extraGrants: { 'support.assist': 'BRANCH' } }), musa), null);
});
(0, node_test_1.test)('session length: 30 minutes by default, between 5 and 120', () => {
    strict_1.default.equal((0, rules_1.assistMinutes)(undefined), 30);
    strict_1.default.equal((0, rules_1.assistMinutes)(''), 30);
    strict_1.default.equal((0, rules_1.assistMinutes)('abc'), 30);
    strict_1.default.equal((0, rules_1.assistMinutes)('-5'), 30);
    strict_1.default.equal((0, rules_1.assistMinutes)('45'), 45);
    strict_1.default.equal((0, rules_1.assistMinutes)('1'), 5);
    strict_1.default.equal((0, rules_1.assistMinutes)('9999'), 120);
});
const SECRET = 'test-secret-at-least-32-characters-long';
(0, node_test_1.test)('the cookie is signed, bound to the sign-in, and refuses tampering', () => {
    const token = (0, token_1.signAssistToken)('ckassist123', 'auth-session-1', SECRET);
    strict_1.default.equal((0, token_1.verifyAssistToken)(token, 'auth-session-1', SECRET), 'ckassist123');
    // Another sign-in (signed out and back in, or another browser).
    strict_1.default.equal((0, token_1.verifyAssistToken)(token, 'auth-session-2', SECRET), null);
    strict_1.default.equal((0, token_1.signedAssistId)(token, SECRET), 'ckassist123', 'still recognised as ours, to end it');
    // Another secret.
    strict_1.default.equal((0, token_1.verifyAssistToken)(token, 'auth-session-1', 'another-secret-at-least-32-characters'), null);
    // A different session id with the old signature.
    const [v, , bind, sig] = token.split('.');
    strict_1.default.equal((0, token_1.verifyAssistToken)(`${v}.ckother456.${bind}.${sig}`, 'auth-session-1', SECRET), null);
    // A binding swapped in from another sign-in.
    strict_1.default.equal((0, token_1.verifyAssistToken)(`${v}.ckassist123.${(0, token_1.sessionBinding)('auth-session-2')}.${sig}`, 'auth-session-2', SECRET), null);
    for (const bad of ['', 'v1', 'v1.a.b', 'v2.ckassist123.x.y', `${token}x`, 'v1.../...', 'x'.repeat(400)])
        strict_1.default.equal((0, token_1.verifyAssistToken)(bad, 'auth-session-1', SECRET), null, bad);
    strict_1.default.equal((0, token_1.verifyAssistToken)(null, 'auth-session-1', SECRET), null);
    strict_1.default.throws(() => (0, token_1.signAssistToken)('ckassist123', 'auth-session-1', 'short'));
    strict_1.default.throws(() => (0, token_1.signAssistToken)('bad id!', 'auth-session-1', SECRET));
    strict_1.default.ok(!token.includes('auth-session-1'), 'the sign-in id itself is never in the cookie');
});
(0, node_test_1.test)('audit wording names both people', () => {
    strict_1.default.equal((0, rules_1.actorLabel)('Musa Ibrahim', { assistedBy: { id: 'a', name: 'Ada Okafor' }, assistSessionId: 's' }), 'Musa Ibrahim (assisted by Ada Okafor)');
    strict_1.default.equal((0, rules_1.actorLabel)('Musa Ibrahim', { reason: 'x' }), 'Musa Ibrahim');
    strict_1.default.equal((0, rules_1.actorLabel)(null, null), null);
    strict_1.default.equal((0, rules_1.actorLabel)('Musa Ibrahim', { assistedBy: { id: 'a' } }), 'Musa Ibrahim');
    strict_1.default.equal((0, rules_1.assistSummary)('Ada Okafor', '14:05', '14:31', 6), 'Ada Okafor helped you with your work from 14:05 to 14:31 — 6 actions recorded.');
    strict_1.default.equal((0, rules_1.assistSummary)('Ada Okafor', '14:05', '14:06', 1), 'Ada Okafor helped you with your work from 14:05 to 14:06 — 1 action recorded.');
    strict_1.default.equal((0, rules_1.assistSummary)('Ada Okafor', '14:05', '14:06', 0), 'Ada Okafor helped you with your work from 14:05 to 14:06 — no actions recorded.');
});
(0, node_test_1.test)('the wiring: business rules run as the colleague, every audit row names the assistant, own-account pages refuse', () => {
    const root = (0, node_path_1.join)(__dirname, '..', '..');
    const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(root, rel), 'utf8');
    const ws = read('lib/actions/workshop.ts');
    strict_1.default.match(ws, /export async function requireUser\(\)[\s\S]{0,400}setAuditActor\(acting\.id, 'portal', acting\.organisationId, acting\.assist \?/);
    strict_1.default.match(ws, /const actingForRequest = cache\([\s\S]{0,600}activeAssistFor\(session\.user\.id, session\.session\.id\)/);
    strict_1.default.match(read('lib/authz/server.ts'), /export const getPrincipal = cache\(async \(\): Promise<Principal> => \{\s*const user = await requireUser\(\);/);
    strict_1.default.match(read('lib/workshop-core.ts'), /actor\?\.assistedBy && actor\.userId === params\.userId/);
    strict_1.default.match(read('app/(app)/profile/page.tsx'), /Not available during an assisted session/);
    strict_1.default.match(read('lib/actions/notifications.ts'), /export async function setNotificationsMuted[\s\S]{0,120}refuseDuringAssist/);
    strict_1.default.match(read('app/(app)/layout.tsx'), /<AssistBanner /);
    // The lookup path never writes: the audit journal resolves "who is acting" through it.
    const server = read('lib/assist/server.ts');
    const lookup = server.slice(server.indexOf('export const activeAssistFor'), server.indexOf('export const signedInContext'));
    strict_1.default.doesNotMatch(lookup, /\.(create|update|updateMany|upsert|delete|deleteMany)\(/);
    strict_1.default.doesNotMatch(lookup, /writeAuditLog\(/);
    // The password is checked with Better Auth's own verifier and never written anywhere.
    const actions = read('lib/actions/assist.ts');
    strict_1.default.match(actions, /authCtx\.password\.verify\(\{ hash: account\.password, password \}\)/);
    strict_1.default.doesNotMatch(actions, /metadata: \{[^}]*password/);
    strict_1.default.match(actions, /httpOnly: true,\s*sameSite: 'lax',\s*secure: process\.env\.NODE_ENV === 'production'/);
});
(0, node_test_1.test)('every decision or cost permission in the catalogue makes a person non-assistable', async () => {
    const { APPROVAL_PERMISSIONS, STORE_COST_PERMISSIONS } = await Promise.resolve().then(() => __importStar(require('../lib/authz/catalogue')));
    for (const k of [...APPROVAL_PERMISSIONS, ...STORE_COST_PERMISSIONS.filter((x) => x !== 'warranty.view'), 'workshop.technician.assign', 'warranty.manage']) {
        strict_1.default.equal((0, rules_1.isSensitivePermission)(k), true, `${k} must be sensitive`);
    }
    // A technician given release or supervise rights by a database grant can no longer be assisted.
    const t = party('tech-x', ['technician'], { extraGrants: { 'store.prs.release': 'BRANCH', 'workshop.job.supervise': 'BRANCH' } });
    strict_1.default.ok((0, rules_1.sensitivePermissionsOf)(t).length > 0);
});
(0, node_test_1.test)('no decision is taken during an assisted session: every approve/decide/decline/release/verify action refuses', () => {
    const { readdirSync } = require('node:fs');
    const dir = (0, node_path_1.join)(__dirname, '..', '..', 'lib', 'actions');
    const missing = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
        const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(dir, f), 'utf8');
        const re = /export async function ((?:approve|decide|decline|disburse|release|verify|reject|returnEstimate)[A-Za-z]*)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
        for (const m of src.matchAll(re)) {
            const name = m[1];
            if (name.endsWith('FormAction') || name.includes('TechnicianAssignment'))
                continue;
            if (!m[2].includes('refuseDuringAssist('))
                missing.push(`${f}:${name}`);
        }
    }
    strict_1.default.deepEqual(missing, []);
});
