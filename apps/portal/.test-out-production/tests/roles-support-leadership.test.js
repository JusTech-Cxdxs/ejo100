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
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const catalogue_1 = require("../lib/authz/catalogue");
const rules_1 = require("../lib/assist/rules");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
const who = (roles) => ({ userId: 'u', isSuperAdmin: false, roleSlugs: roles, branchId: 'b1', departmentId: null, organisationId: 'o1', orgBranchIds: ['b1', 'b2'] });
(0, node_test_1.test)('customer care works support requests, never the set-up', () => {
    const p = who(['customer-care']);
    strict_1.default.ok((0, catalogue_1.decide)(p, 'support.tickets.manage', { branchId: 'b1' }).allowed);
    strict_1.default.equal((0, catalogue_1.decide)(p, 'support.tickets.manage', { branchId: 'b2' }).allowed, false, 'own branch only');
    strict_1.default.equal((0, catalogue_1.decide)(p, 'support.manage').allowed, false);
    strict_1.default.equal((0, catalogue_1.decide)(p, 'crm.manage', { branchId: 'b1' }).allowed, false, 'read-only outside the Support centre');
    strict_1.default.ok((0, catalogue_1.decide)(who(['customer-care-lead']), 'support.tickets.manage', { branchId: 'b2' }).allowed, 'the lead sees every branch');
    strict_1.default.equal((0, catalogue_1.decide)(who(['customer-care-lead']), 'support.manage').allowed, false);
});
(0, node_test_1.test)('executive: everything read-only with analytics, approves nothing but their own department’s passes', () => {
    const g = catalogue_1.ROLE_GRANTS.executive;
    for (const k of ['analytics.business.view', 'workshop.view', 'store.view', 'warranty.view', 'security.view', 'crm.view'])
        strict_1.default.equal(g[k], 'ALL', k);
    for (const k of Object.keys(g))
        if (/approve|record|manage|create|release|disburse|operate/.test(k))
            strict_1.default.equal(k, 'security.pass.approve', k);
    strict_1.default.equal(g['security.pass.approve'], 'DEPARTMENT');
    // Leadership can send a notice to the whole organisation.
    strict_1.default.equal(g['notifications.broadcast.send'], 'ALL');
});
(0, node_test_1.test)('IT administrator: people, roles, settings, audit and Enyo — no transactions, no Recycle bin, no money', () => {
    const g = catalogue_1.ROLE_GRANTS['it-administrator'];
    for (const k of ['admin.users.manage', 'admin.roles.manage', 'admin.settings.manage', 'audit.view', 'enyo.manage', 'notifications.broadcast.send'])
        strict_1.default.equal(g[k], 'ALL', k);
    for (const k of Object.keys(g))
        strict_1.default.doesNotMatch(k, /^(workshop|store|procurement|warranty|analytics)\.|recycle|payment|refund/, k);
    // Nobody widens their own access, and only an Organisation Administrator gives the Administrator role.
    strict_1.default.match(read('lib/actions/roles.ts'), /You cannot change a role you hold yourself/);
    strict_1.default.match(read('lib/actions/users-admin.ts'), /Only an Organisation Administrator can give or remove the Administrator role/);
    // Never assisted (a Branch Assistant cannot work as them).
    strict_1.default.ok((0, rules_1.sensitivePermissionsOf)(who(['it-administrator'])).length > 0);
    strict_1.default.ok((0, rules_1.sensitivePermissionsOf)(who(['executive'])).length > 0);
});
(0, node_test_1.test)('the new roles have labels, descriptions and are created for every organisation', () => {
    const sql = read('../../scripts/postdeploy/0004-support-leadership-it-roles.sql');
    for (const slug of ['customer-care', 'customer-care-lead', 'executive', 'it-administrator']) {
        strict_1.default.ok(catalogue_1.ROLE_LABELS[slug], slug);
        strict_1.default.ok(catalogue_1.ROLE_DESCRIPTIONS[slug], slug);
        strict_1.default.match(sql, new RegExp(`'${slug}'`), slug);
        strict_1.default.match(read('../../scripts/v24-roles.sql'), new RegExp(`'${slug}'`), slug);
    }
    strict_1.default.match(sql, /ON CONFLICT \("organisationId", "slug"\) DO NOTHING/);
    strict_1.default.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
});
(0, node_test_1.test)('complaints and HR questions reach the right team; the customer portal opens requests itself', () => {
    const help = read('lib/actions/help.ts');
    strict_1.default.match(help, /about === 'complaint' \? 'customer_care' : about === 'hr' \? 'hr'/);
    strict_1.default.match(help, /routeHelp\(m\.organisationId, about\)/);
    const auto = read('lib/support/automations.ts');
    strict_1.default.match(auto, /tags: \{ has: 'portal_request' \}/);
    strict_1.default.match(auto, /tags\.includes\('complaint'\) \? 'customer_care'/);
    const portal = read('../website/lib/customer-portal/support.ts');
    strict_1.default.match(portal, /export async function openSupportRequest/);
    strict_1.default.match(portal, /customerId: me\.id, contactName: me\.fullName/);
    strict_1.default.match(portal, /tags: \['portal_request', \.\.\.kind\.tags\]/);
});
(0, node_test_1.test)('System health says when the database is behind this release', async () => {
    const { schemaVerdict, SCHEMA_MARKERS } = await Promise.resolve().then(() => __importStar(require('../lib/schema-health-core')));
    const all = new Set(SCHEMA_MARKERS.map((m) => `${m.table}.${m.column}`));
    strict_1.default.equal(schemaVerdict(all).state, 'current');
    const v37 = new Set(['support_tickets.token', 'support_tickets.requesterUserId']);
    const r = schemaVerdict(v37);
    strict_1.default.equal(r.state, 'behind');
    strict_1.default.equal(r.at, 'v37');
    strict_1.default.equal(r.expected, 'v40');
    strict_1.default.equal(r.missing.length, 5);
    strict_1.default.equal(schemaVerdict(new Set()).at, 'older than v36');
    strict_1.default.match(read('app/(app)/settings/page.tsx'), /schemaHealth\(\)/);
});
(0, node_test_1.test)('every dropdown can be searched; features guide and Ask Enyo everywhere', () => {
    const ss = read('components/SelectSearch.tsx');
    strict_1.default.match(ss, /const MIN = 6/);
    strict_1.default.match(ss, /sel\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
    strict_1.default.match(ss, /data-plain/);
    strict_1.default.match(read('app/(app)/layout.tsx'), /<SelectSearch \/>/);
    const fs = read('components/FilterSelect.tsx');
    strict_1.default.match(fs, /const settle = \(\) =>/, 'unpicked text never looks chosen');
    strict_1.default.match(read('components/Topbar.tsx'), /href="\/support\/help"/);
    strict_1.default.match(read('components/enyo/EnyoPanel.tsx'), /window\.addEventListener\(ENYO_ASK_EVENT, onAsk\)/);
    strict_1.default.match(read('app/api/enyo/refine/route.ts'), /decision: 'a clear decision note/);
});
(0, node_test_1.test)('features guide: each person sees only what their role opens', async () => {
    const { highlightsFor, guideFor } = await Promise.resolve().then(() => __importStar(require('../lib/help/features')));
    const tech = highlightsFor(who(['technician'])).map((h) => h.id);
    strict_1.default.ok(tech.includes('enyo') && tech.includes('likely-ready'));
    strict_1.default.ok(!tech.includes('analytics') && !tech.includes('integrity') && !tech.includes('users'));
    const exec = highlightsFor(who(['executive'])).map((h) => h.id);
    strict_1.default.ok(exec.includes('analytics') && exec.includes('workflows'));
    strict_1.default.ok(!exec.includes('users'));
    const it = highlightsFor(who(['it-administrator'])).map((h) => h.id);
    strict_1.default.ok(it.includes('users') && it.includes('errors') && !it.includes('analytics'));
    const areas = guideFor(who(['technician'])).map((g) => g.area);
    strict_1.default.ok(areas.includes('Workshop'));
    strict_1.default.ok(!guideFor(who(['technician'])).flatMap((g) => g.entries).some((e) => e.href.startsWith('/users')));
});
(0, node_test_1.test)('review fixes: no escalation through new accounts, role grants or switching administrators off; holidays never lost', () => {
    const users = read('lib/actions/users-admin.ts');
    strict_1.default.match(users, /Only an Organisation Administrator can give the Administrator role\./);
    strict_1.default.match(users, /Only an Organisation Administrator can switch another Administrator on or off\./);
    const roles = read('lib/actions/roles.ts');
    strict_1.default.match(roles, /You can only add a permission you hold yourself/);
    strict_1.default.match(roles, /Only an Organisation Administrator can change the administrator roles\./);
    const hours = read('app/(app)/settings/support/hours/page.tsx');
    strict_1.default.match(hours, /keepCustom\.map/);
    strict_1.default.match(hours, /keepOpen\.map/);
    strict_1.default.match(read('lib/support/server.ts'), /select: base \}\)/);
    strict_1.default.match(read('components/SelectSearch.tsx'), /!el\.closest\('dialog\[open\]'\)/);
});
(0, node_test_1.test)('an own closed day on a calendar holiday is kept as the organisation’s own', async () => {
    const { holidayEntries } = await Promise.resolve().then(() => __importStar(require('../lib/support/holidays')));
    const e = holidayEntries('NG', ['2026-12-25'], [], [2026]).find((x) => x.date === '2026-12-25');
    strict_1.default.equal(e.source, 'custom');
    strict_1.default.equal(holidayEntries(null, ['2026-12-25'], [], [2026]).length, 1);
    const { stripCitationMarks } = await Promise.resolve().then(() => __importStar(require('../lib/enyo/citations')));
    strict_1.default.equal(stripCitationMarks('【标题】 正文'), '【标题】 正文');
});
