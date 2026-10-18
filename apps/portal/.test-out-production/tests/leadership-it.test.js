"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const catalogue_1 = require("../lib/authz/catalogue");
const navigation_1 = require("../lib/authz/navigation");
const team_core_1 = require("../lib/team-core");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
const h = (n) => new Date(Date.UTC(2026, 9, 1) + n * 3_600_000);
(0, node_test_1.test)('the branch lens: headquarters roles get it; branch staff keep their own branch', () => {
    for (const r of ['executive', 'administrator', 'it-administrator'])
        strict_1.default.equal((0, catalogue_1.hasBranchLens)(who([r])), true, r);
    for (const r of ['technician', 'workshop-manager', 'finance-officer', 'receptionist', 'branch-administrator'])
        strict_1.default.equal((0, catalogue_1.hasBranchLens)(who([r])), false, r);
    strict_1.default.equal((0, catalogue_1.hasBranchLens)(who([], { isSuperAdmin: true })), true);
});
(0, node_test_1.test)('the lens narrows, never widens, and is never a permission', () => {
    const server = read('lib/authz/server.ts');
    // Only for organisation-wide scope, and only a branch of the person's own organisation.
    strict_1.default.match(server, /if \(d\.scope === 'ALL' && p\.lensBranchId && opts\.lens !== false\) return \{ branchId: p\.lensBranchId \};/);
    // Only an active branch, never while working for a colleague.
    strict_1.default.match(server, /where: \{ id: lens, isActive: true \}/);
    strict_1.default.match(server, /signedInContext\(\)\.then\(\(c\) => Boolean\(c\?\.assist\)\)/);
    // One record, a write, or a person's own work: never hidden by the lens.
    const support = read('lib/actions/support.ts');
    for (const fn of ['getSupportTicket', 'replyToSupportTicket', 'assignSupportTicket', 'moveSupportTicket', 'setSupportTicketStatus']) {
        const body = support.split(`export async function ${fn}(`)[1].split('\nexport ')[0];
        strict_1.default.match(body, /reachWhere\([^)]*\{ lens: false \}\)/, fn);
    }
    for (const f of ['lib/actions/search.ts', 'lib/actions/my-work.ts', 'lib/actions/workflow-actions.ts', 'lib/reminders.ts', 'lib/enyo/tools/records.ts'])
        strict_1.default.match(read(f), /\{ lens: false \}/, f);
    strict_1.default.match(server, /\(p\.orgBranchIds \?\? \[\]\)\.includes\(lens\)/);
    // decide() never reads it.
    strict_1.default.doesNotMatch(read('lib/authz/catalogue.ts').split('export function decide')[1].split('\nexport ')[0], /lensBranchId/);
    const action = read('lib/actions/branch-lens.ts');
    strict_1.default.match(action, /inMyOrganisation\(b\.businessUnit\.organisationId\)/);
    strict_1.default.match(action, /httpOnly: true, sameSite: 'lax'/);
    // Logs follow the lens by who acted; a quoted error reference is always found.
    strict_1.default.match(read('lib/actions/audit-logs.ts'), /f\.userId \? \{ userId: f\.userId \} : await lensPeopleWhere\(\)/);
    strict_1.default.match(read('lib/actions/error-log.ts'), /ref \? \{ ref \} : await lensPeopleWhere\(\)/);
    strict_1.default.match(read('app/(app)/layout.tsx'), /assist \? null : await getBranchLensOptions\(\)/);
});
(0, node_test_1.test)('team performance: counts, speed against the standard, rework, rating', () => {
    const people = [{ id: 't1', name: 'Tunde', roles: 'Technician', branch: 'Ikeja' }, { id: 't2', name: 'Ada', roles: 'Technician', branch: 'Ikeja' }, { id: 'm', name: 'Musa', roles: 'Workshop Manager', branch: 'Ikeja' }, { id: 'q', name: 'Quiet', roles: 'Store Officer', branch: 'Ikeja' }];
    const items = [
        ...[10, 20, 30, 40, 50].map((x) => ({ userId: 't1', kind: 'job', from: h(0), to: h(x), value: 1000 })),
        ...[100, 120, 10].map((x, i) => ({ userId: 't2', kind: 'job', from: h(0), to: h(x), rework: i < 2 })),
        ...[2, 3, 30].map((x) => ({ userId: 'm', kind: 'estimateFinal', from: h(0), to: h(x) })),
    ];
    const rows = (0, team_core_1.summariseTeam)(items, people, new Map([['t2', 4]]));
    const t1 = rows.find((r) => r.userId === 't1');
    strict_1.default.equal(t1.handled, 5);
    strict_1.default.equal(t1.value, 5000);
    strict_1.default.equal(t1.withinPct, 100);
    strict_1.default.equal(t1.medianHours, 30);
    strict_1.default.equal(t1.rating, 'strong');
    const t2 = rows.find((r) => r.userId === 't2');
    strict_1.default.equal(t2.rework, 2);
    strict_1.default.equal(t2.openNow, 4);
    strict_1.default.equal(t2.rating, 'attention', 'two of three jobs reworked and slow');
    const m = rows.find((r) => r.userId === 'm');
    strict_1.default.equal(m.steps[0].label, team_core_1.STANDARDS.estimateFinal.label);
    strict_1.default.equal(m.withinPct, 67);
    strict_1.default.equal(rows.find((r) => r.userId === 'q').rating, 'quiet');
    strict_1.default.equal(rows[0].userId, 't1', 'most work first');
});
(0, node_test_1.test)('Headquarters tabs, IT control room and Enyo briefings are wired, guarded and in the menu', () => {
    strict_1.default.ok((0, navigation_1.navigationFor)(who(['it-administrator'])).some((i) => i.key === 'it'));
    strict_1.default.ok((0, navigation_1.navigationFor)(who(['administrator'])).some((i) => i.key === 'it'));
    strict_1.default.ok(!(0, navigation_1.navigationFor)(who(['executive'])).some((i) => i.key === 'it'), 'directors: no audit trail');
    strict_1.default.ok(!(0, navigation_1.navigationFor)(who(['technician'])).some((i) => i.key === 'it'));
    strict_1.default.match(read('app/(app)/it/page.tsx'), /guardPage\('audit\.view', '\/it'\)/);
    strict_1.default.match(read('lib/actions/it.ts'), /await authorize\('audit\.view'/);
    strict_1.default.match(read('app/(app)/headquarters/team/page.tsx'), /guardPage\('analytics\.business\.view'/);
    strict_1.default.match(read('lib/actions/team.ts'), /await authorize\('analytics\.business\.view'/);
    const tools = read('lib/enyo/tools/leadership.ts');
    strict_1.default.match(tools, /name: 'branch_briefing'/);
    strict_1.default.match(tools, /if \(!\(await allows\('analytics\.business\.view'\)\)\) return refused/);
    strict_1.default.match(tools, /name: 'explain_error'/);
    strict_1.default.match(tools, /if \(!\(await allows\('audit\.view'\)\)\) return refused/);
    strict_1.default.match(tools, /where: \{ \.\.\.fence, ref \}/, 'an error is looked up inside the organisation only');
    strict_1.default.match(read('lib/enyo/tools/index.ts'), /\.\.\.leadershipTools/);
    // Briefing buttons ask straight away and read the answer aloud.
    strict_1.default.match(read('components/enyo/EnyoPanel.tsx'), /prefsRef\.current\.speak \|\| opts\.speak/);
    strict_1.default.match(read('app/(app)/headquarters/page.tsx'), /<AskEnyoButton variant="solid" send speak/);
    strict_1.default.match(read('app/(app)/audit-logs/errors/page.tsx'), /Explain with Enyo/);
});
(0, node_test_1.test)('sign-in pages tell staff and customers what the platform does, truthfully', () => {
    const staff = read('components/AuthShell.tsx');
    for (const t of ['Workshop', 'Headquarters & analytics', 'IT & audit', 'Enyo, the assistant', 'Nobody approves their own request'])
        strict_1.default.ok(staff.includes(t), t);
    const cust = read('../website/components/customer/CustomerAuthShell.tsx');
    for (const t of ['Follow every step', 'Ask Enyo, any time', 'Talk to a person', 'Your visit, step by step'])
        strict_1.default.ok(cust.includes(t), t);
});
