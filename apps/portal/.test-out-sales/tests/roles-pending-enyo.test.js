"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Roles shown as people know them ("Justice Enefola (Manager)", "You
 * (Manager)"), "Waiting on others" for every role, exit passes that go UP
 * (a manager never approves their own; IT's goes to the executive), the
 * master-admin observer copy, support action items only for support staff,
 * headquarters-only overviews, Enyo's small requests (tool selection) and its
 * staff directory, the website report and IT trends.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const catalogue_1 = require("../lib/authz/catalogue");
const tool_select_1 = require("../lib/enyo/tool-select");
const it_trends_core_1 = require("../lib/it-trends-core");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
(0, node_test_1.test)('"Manager", not "Workshop Manager"; names carry their role, the reader is "You"', () => {
    strict_1.default.equal(catalogue_1.ROLE_LABELS['workshop-manager'], 'Manager');
    strict_1.default.equal((0, catalogue_1.primaryRoleLabel)(['technician', 'workshop-manager']), 'Manager');
    strict_1.default.equal((0, catalogue_1.primaryRoleLabel)([], true), 'Master Administrator');
    // Short form inside brackets: no "Executive (director / general manager)".
    strict_1.default.equal((0, catalogue_1.nameWithRole)('Sudeep Mittal', ['executive']), 'Sudeep Mittal (Executive)');
    strict_1.default.equal((0, catalogue_1.nameWithRole)('Justice Enefola', ['workshop-manager'], { isMe: true }), 'You (Manager)');
    strict_1.default.equal((0, catalogue_1.nameWithRole)('Ada', ['receptionist']), 'Ada (Front Desk)');
    strict_1.default.equal((0, catalogue_1.nameWithRole)('No Role', []), 'No Role');
    strict_1.default.equal((0, catalogue_1.isHqRole)(['it-administrator']), true);
    strict_1.default.equal((0, catalogue_1.isHqRole)(['workshop-manager']), false);
    // The database name follows (additive: a rename, never a delete).
    strict_1.default.match(read('../../scripts/postdeploy/0006-manager-role-name.sql'), /UPDATE "roles" SET "name" = 'Manager' WHERE "slug" = 'workshop-manager'/);
    strict_1.default.doesNotMatch(read('../../scripts/postdeploy/0006-manager-role-name.sql'), /\b(DROP|DELETE|TRUNCATE)\b/i);
});
(0, node_test_1.test)('activity and the audit trail show "Name (Role)"', () => {
    for (const f of ['lib/actions/notifications.ts', 'lib/actions/audit-logs.ts'])
        strict_1.default.match(read(f), /nameWithRole\(/, f);
    strict_1.default.match(read('lib/notification-rules.ts'), /'access\.denied'/);
});
(0, node_test_1.test)('passes: the Manager and the Executive approve their own on the spot; IT and administrators go to the Executive', () => {
    const src = read('lib/actions/security.ts');
    // Who approves their own: the platform team, the Executive, the branch's Manager.
    const own = src.slice(src.indexOf('async function ownApproverRole'), src.indexOf('/** Request a pass for yourself'));
    strict_1.default.match(own, /if \(isMaster\) return 'Master Administrator';/);
    // Never during an assisted session (the assistant approves nothing).
    const onSpot = own.slice(own.indexOf('async function approvesOwn'));
    strict_1.default.ok(onSpot.indexOf('currentAssist()') > -1 && onSpot.indexOf('currentAssist()') < onSpot.indexOf('ownApproverRole('));
    // A request prepared in an assisted session (or made earlier) waits for its owner — never a peer.
    strict_1.default.match(src, /if \(excludeId && \(await ownApproverRole\(excludeId, branch\)\)\)/);
    // A Manager books on the spot only for their own branch's staff; a Branch Administrator needs no head step.
    strict_1.default.match(src, /works at another branch — their own branch books their pass/);
    strict_1.default.match(src, /slugs\.includes\('branch-administrator'\)/);
    // The head step is decided by the pass's branch, not the viewer's.
    strict_1.default.doesNotMatch(src, /headApproversFor\(p\.requestedById\)/);
    // Numbered only after every check (no gaps).
    const create = src.slice(src.indexOf('export async function createExitPass'));
    strict_1.default.ok(create.indexOf("nextNumber('EP')") > create.indexOf('works at another branch'));
    // No head of their own department: a head of THEIR branch, else the branch's Managers — never another branch's head.
    strict_1.default.match(src, /usersWithSlugs\(\['department-head'\], \{ \.\.\.\(org \? \{ organisationId: org \} : \{\}\), branchId \}\)/);
    strict_1.default.match(own, /if \(slugs\.includes\('executive'\)\) return 'Executive';/);
    strict_1.default.match(own, /slugs\.includes\('workshop-manager'\)/);
    // Exit pass, road test, contractor pass: approved at once when the requester approves their own.
    strict_1.default.match(src, /status: own \? 'APPROVED' : requesterIsHead \|\| hq \? 'PENDING_MANAGER' : 'PENDING_HEAD'/);
    strict_1.default.equal((src.match(/status: 'APPROVED' as const, managerApprovedById: user\.id/g) ?? []).length, 2, 'road test and contractor pass');
    strict_1.default.equal((src.match(/onRequest: true, as: own/g) ?? []).length >= 4, true, 'every on-the-spot approval is audited by name and role');
    // A Department Head has authorised their own step; it still goes to the Manager.
    strict_1.default.match(src, /requesterIsHead \? \{ headApprovedById: user\.id, headApprovedAt: now \}/);
    // Headquarters people below the Executive: the Executive decides (same organisation as the record).
    strict_1.default.deepEqual(catalogue_1.SENIOR_REQUESTER_SLUGS, ['administrator', 'it-administrator']);
    strict_1.default.match(src, /if \(excludeId && \(await isSeniorRequester\(excludeId\)\)\) return seniorApprovers\(excludeId, org\);/);
    strict_1.default.match(src, /usersWithSlugs\(\['executive'\], org\)\)\.filter\(\(x\) => x\.id !== excludeId\)/);
    // Everyone else still never approves their own.
    strict_1.default.match(src, /if \(p\.requestedById === user\.id && !own\) throw new SecurityError\('You cannot approve your own exit pass\.'\);/);
    strict_1.default.match(src, /if \(p\.requestedById === user\.id && !own\) throw new SecurityError\('You cannot approve your own road test\.'\);/);
    strict_1.default.match(src, /if \(p\.requestedById === user\.id && !own\) throw new SecurityError\('You cannot approve your own request\.'\);/);
    // "Is a Manager" never comes from the fallback list; page, Approvals list and decision share one approver list.
    strict_1.default.match(src, /!branchManagers\.usingFallback/);
    strict_1.default.match(src, /finalDecidable\(rows, user\.id, roles\.isMaster\)/);
    const body = src.slice(src.indexOf('async function seniorApprovers'));
    strict_1.default.ok(body.indexOf("'executive'") < body.indexOf("'administrator'") && body.indexOf("'administrator'") < body.indexOf('masterAdmins()'));
    // The form says "approved", not "requested", when it was approved on the spot.
    strict_1.default.equal((read('lib/actions/security-form-handlers.ts').match(/done = 'approved_now'/g) ?? []).length, 3);
    for (const f of ['exit-passes', 'road-tests', 'contractors'])
        strict_1.default.match(read(`app/(app)/security/${f}/[id]/page.tsx`), /approved_now:/, f);
});
(0, node_test_1.test)('the master admin gets an observer copy of every email (switchable off), never twice', async () => {
    const src = read('lib/email.ts');
    strict_1.default.match(src, /bcc/i);
    strict_1.default.match(src, /MAIL_OBSERVER_BCC/);
    // Staff workflow mail only: never sign-in links, password or account emails, never customers.
    strict_1.default.match(src, /options\.observer === false \? \[\] : await staffOnly\(to\)/);
    strict_1.default.match(src, /accountType: 'EMPLOYEE'/);
    strict_1.default.equal((read('lib/auth.ts').match(/observer: false/g) ?? []).length, 3, 'reset, verification and password-changed emails');
    for (const f of ['lib/staff-onboarding.ts', 'lib/customer-access.ts', 'lib/actions/users-admin.ts'])
        strict_1.default.match(read(f), /observer: false/, f);
    // The rule itself (copied from lib/email.ts to keep nodemailer out of the test).
    const fn = src.slice(src.indexOf('export function observerCopies'), src.indexOf('\n}\n', src.indexOf('export function observerCopies')) + 2);
    const observerCopies = new Function(`${fn.replace('export function', 'return function').replace(/: Record<string, string \| undefined> = process\.env\): string\[\]/, ')').replace(/\(to: string, env/, '(to, env')}`)();
    strict_1.default.deepEqual(observerCopies('a@x.com', { PLATFORM_OWNER_EMAIL: 'owner@x.com' }), ['owner@x.com']);
    strict_1.default.deepEqual(observerCopies('owner@x.com', { PLATFORM_OWNER_EMAIL: 'owner@x.com' }), []);
    strict_1.default.deepEqual(observerCopies('a@x.com', { MAIL_OBSERVER_BCC: 'off', PLATFORM_OWNER_EMAIL: 'owner@x.com' }), []);
    strict_1.default.deepEqual(observerCopies('a@x.com', { MAIL_OBSERVER_BCC: 'it@x.com, not-an-email' }), ['it@x.com']);
});
(0, node_test_1.test)('support action items belong to the support team, not to managers', () => {
    const src = read('lib/actions/my-work.ts');
    strict_1.default.match(src, /customer-care/);
    strict_1.default.match(src, /supportQueueMember/);
});
(0, node_test_1.test)('only headquarters gets the overviews; a manager keeps the branch dashboard', () => {
    const lead = read('lib/actions/leadership.ts');
    strict_1.default.match(lead, /scopeFor\(p, k\) === 'ALL'/);
    strict_1.default.match(lead, /leadership: orgWide\('analytics\.business\.view'\)/);
    const dash = read('app/(app)/dashboard/page.tsx');
    strict_1.default.match(dash, /overviews\.leadership \?/);
    strict_1.default.match(dash, /overviews\.it \?/);
    strict_1.default.match(dash, /'Your branch at a glance'/);
});
(0, node_test_1.test)('"Waiting on others" covers every workflow, names who has it, and is on Approvals, the dashboard, the brief and Enyo', () => {
    const src = read('lib/actions/pending.ts');
    for (const m of ['jobCard', 'vehicleService', 'estimate', 'serviceEstimate', 'partRequestSlip', 'externalProcurementRequest', 'exitPass', 'warrantyClaim', 'closeRequest', 'cancellationRequest', 'vehicleServiceCloseRequest', 'vehicleServiceCancellationRequest', 'roadTestPermit', 'supportTicket', 'contractorPass']) {
        strict_1.default.ok(src.includes(`prisma.${m}.findMany`), m);
    }
    // Only the person's own requests.
    for (const k of ['createdById: mine', 'requestedById: mine', 'requesterUserId: mine'])
        strict_1.default.ok(src.includes(k), k);
    strict_1.default.match(src, /organisationId: p\.organisationId, requesterUserId: mine/);
    strict_1.default.match(src, /'Manager', 'the Manager'/);
    strict_1.default.match(src, /\(Executive\)/);
    strict_1.default.match(read('app/(app)/approvals/page.tsx'), /<WaitingOnOthers items=\{waiting\} \/>/);
    strict_1.default.match(read('app/(app)/dashboard/page.tsx'), /<WaitingOnOthers items=\{waiting\} limit=\{5\} compact \/>/);
    strict_1.default.match(read('lib/brief/collect.ts'), /key: 'waiting'/);
    // Every link opens a page that exists.
    for (const url of src.matchAll(/url: `(\/[a-z/-]+)\/\$\{/g))
        strict_1.default.ok(read(`app/(app)${url[1]}/[id]/page.tsx`).length > 0, url[1]);
});
(0, node_test_1.test)('Enyo offers only the tools a question needs, so "hi" fits the free model tier', () => {
    const dir = (0, node_path_1.join)(ROOT, 'lib', 'enyo', 'tools');
    const all = new Set((0, node_fs_1.readdirSync)(dir).filter((f) => f.endsWith('.ts')).flatMap((f) => [...(0, node_fs_1.readFileSync)((0, node_path_1.join)(dir, f), 'utf8').matchAll(/^\s{4}name: '([a-z_]+)'/gm)].map((m) => m[1])));
    for (const t of tool_select_1.CORE_TOOLS)
        strict_1.default.ok(all.has(t), `core tool ${t} exists`);
    for (const t of ['my_pending', 'staff_directory', 'website_traffic', 'branch_briefing', 'explain_error'])
        strict_1.default.ok(all.has(t), t);
    const hi = (0, tool_select_1.selectToolNames)('hi');
    strict_1.default.ok(hi.names.length <= 12, `hi offers ${hi.names.length}`);
    strict_1.default.ok(hi.names.includes('daily_brief') && hi.names.includes('my_pending'));
    strict_1.default.equal(hi.web, false);
    strict_1.default.ok((0, tool_select_1.selectToolNames)('who is Bhushan Salgar').names.includes('staff_directory'));
    strict_1.default.ok((0, tool_select_1.selectToolNames)('brief me on Isolo branch').names.includes('branch_briefing'));
    strict_1.default.ok((0, tool_select_1.selectToolNames)('explain error 1914370005').names.includes('explain_error'));
    strict_1.default.ok((0, tool_select_1.selectToolNames)('how many website visitors this week').names.includes('website_traffic'));
    strict_1.default.ok((0, tool_select_1.selectToolNames)('has my PRS been approved?').names.includes('my_pending'));
    // A follow-up keeps the previous question's tools.
    strict_1.default.ok((0, tool_select_1.selectToolNames)('and last month?', 'what was revenue this month').names.includes('business_summary'));
    strict_1.default.ok((0, tool_select_1.selectToolNames)('x'.repeat(10), '', 16).names.length <= 16);
    strict_1.default.ok((0, tool_select_1.slimToolNames)('brief me').length <= 9);
    // Every selectable name is a real tool (a typo would silently drop it).
    const src = read('lib/enyo/tool-select.ts');
    for (const m of src.matchAll(/'([a-z_]+)'/g))
        if (m[1].includes('_'))
            strict_1.default.ok(all.has(m[1]), `tool-select names ${m[1]}`);
});
(0, node_test_1.test)('the chat route sends a small request and retries smaller when the model server says it is too big or busy', () => {
    const portal = read('app/api/enyo/chat/route.ts');
    strict_1.default.match(portal, /staffToolsFor\(/);
    strict_1.default.match(portal, /retrySmaller:/);
    strict_1.default.match(portal, /trimHistory\(/);
    strict_1.default.match(read('../website/app/api/enyo/chat/route.ts'), /retrySmaller:/);
    // A failed answer offers "Try again" and "New chat".
    const ui = read('components/enyo/EnyoMessages.tsx');
    strict_1.default.match(ui, /Try again/);
    strict_1.default.match(ui, /New chat/);
    strict_1.default.match(read('components/enyo/EnyoPanel.tsx'), /onRetry=\{/);
});
(0, node_test_1.test)('the staff directory stays inside the organisation and shares only work details', () => {
    const src = read('lib/enyo/tools/people.ts');
    strict_1.default.match(src, /organisationId: org/);
    strict_1.default.match(src, /accountType: 'EMPLOYEE'/);
    const select = src.slice(src.indexOf('select: { fullName'), src.indexOf('});', src.indexOf('select: { fullName')));
    for (const never of ['phone', 'password', 'employeeProfile', 'image'])
        strict_1.default.ok(!select.includes(never), never);
});
(0, node_test_1.test)('IT trends and the website report are computed in code', () => {
    const days = (0, it_trends_core_1.lastDays)(3, new Date('2026-10-17T10:00:00Z'));
    strict_1.default.deepEqual(days, ['2026-10-15', '2026-10-16', '2026-10-17']);
    strict_1.default.equal((0, it_trends_core_1.dayLabel)('2026-10-17'), 'Sat 17');
    strict_1.default.deepEqual((0, it_trends_core_1.perDay)([new Date('2026-10-16T23:30:00Z'), new Date('2026-10-15T10:00:00Z')], days), [1, 0, 1]);
    strict_1.default.deepEqual((0, it_trends_core_1.trendOf)([1, 1, 2, 2]), { change: 100, direction: 'up' });
    strict_1.default.deepEqual((0, it_trends_core_1.trendOf)([0, 0]), { change: null, direction: 'flat' });
    strict_1.default.equal((0, it_trends_core_1.secondsText)(65), '1m 05s');
    strict_1.default.equal((0, it_trends_core_1.secondsText)(0), '—');
    const d = (ymd) => new Date(`${ymd}T00:00:00Z`);
    const row = (o) => ({ day: d('2026-10-17'), visitorHash: 'a', sessionId: 's1', path: '/', durationSec: 0, chatted: false, device: 'mobile', referrerHost: null, ...o });
    const r = (0, it_trends_core_1.summariseVisits)([
        row({ durationSec: 30 }), row({ path: '/services', durationSec: 90, chatted: true }),
        row({ visitorHash: 'b', sessionId: 's2', device: 'desktop', referrerHost: 'google.com' }),
        row({ visitorHash: 'c', sessionId: 's3', day: d('2026-10-16'), durationSec: 0 }),
        row({ visitorHash: 'z', day: d('2026-09-01') }),
    ], days);
    strict_1.default.deepEqual(r.days.map((x) => x.visitors), [0, 1, 2]);
    strict_1.default.equal(r.totals.visitors, 3);
    strict_1.default.equal(r.totals.views, 4);
    strict_1.default.equal(r.totals.chatted, 1);
    strict_1.default.equal(r.totals.browsedOnly, 2);
    strict_1.default.equal(r.totals.chattedPct, 33);
    strict_1.default.equal(r.totals.avgSeconds, 60); // unknown times are left out, not counted as 0
    strict_1.default.equal(r.totals.singlePagePct, 67);
    strict_1.default.equal(r.topPages[0].path, '/');
    strict_1.default.deepEqual(r.referrers, [{ host: 'google.com', views: 1 }]);
});
(0, node_test_1.test)('IT trends and the website report are organisation-wide IT (and leadership for the website), counts only', () => {
    const src = read('lib/actions/it-trends.ts');
    strict_1.default.match(src, /scopeFor\(me, 'audit\.view'\) === 'ALL'/);
    strict_1.default.match(src, /refuse\('audit\.view'/);
    strict_1.default.match(src, /organisationId: org/);
    strict_1.default.match(read('app/(app)/it/page.tsx'), /<WebsiteSection \/>/);
    strict_1.default.match(read('lib/schema-health-core.ts'), /site_visits/);
    strict_1.default.match(read('app/api/cron/pricing-alerts/route.ts'), /purgeOldSiteVisits\(400\)/);
});
