/**
 * Roles shown as people know them ("Justice Enefola (Manager)", "You
 * (Manager)"), "Waiting on others" for every role, exit passes that go UP
 * (a manager never approves their own; IT's goes to the executive), the
 * master-admin observer copy, support action items only for support staff,
 * headquarters-only overviews, Enyo's small requests (tool selection) and its
 * staff directory, the website report and IT trends.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_LABELS, SENIOR_REQUESTER_SLUGS, isHqRole, nameWithRole, primaryRoleLabel } from '../lib/authz/catalogue';
import { CORE_TOOLS, selectToolNames, slimToolNames } from '../lib/enyo/tool-select';
import { dayLabel, lastDays, perDay, secondsText, summariseVisits, trendOf, type VisitRow } from '../lib/it-trends-core';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('"Manager", not "Workshop Manager"; names carry their role, the reader is "You"', () => {
  assert.equal(ROLE_LABELS['workshop-manager'], 'Manager');
  assert.equal(primaryRoleLabel(['technician', 'workshop-manager']), 'Manager');
  assert.equal(primaryRoleLabel([], true), 'Master Administrator');
  // Short form inside brackets: no "Executive (director / general manager)".
  assert.equal(nameWithRole('Sudeep Mittal', ['executive']), 'Sudeep Mittal (Executive)');
  assert.equal(nameWithRole('Justice Enefola', ['workshop-manager'], { isMe: true }), 'You (Manager)');
  assert.equal(nameWithRole('Ada', ['receptionist']), 'Ada (Front Desk)');
  assert.equal(nameWithRole('No Role', []), 'No Role');
  assert.equal(isHqRole(['it-administrator']), true);
  assert.equal(isHqRole(['workshop-manager']), false);
  // The database name follows (additive: a rename, never a delete).
  assert.match(read('../../scripts/postdeploy/0006-manager-role-name.sql'), /UPDATE "roles" SET "name" = 'Manager' WHERE "slug" = 'workshop-manager'/);
  assert.doesNotMatch(read('../../scripts/postdeploy/0006-manager-role-name.sql'), /\b(DROP|DELETE|TRUNCATE)\b/i);
});

test('activity and the audit trail show "Name (Role)"', () => {
  for (const f of ['lib/actions/notifications.ts', 'lib/actions/audit-logs.ts']) assert.match(read(f), /nameWithRole\(/, f);
  assert.match(read('lib/notification-rules.ts'), /'access\.denied'/);
});

test('passes: the Manager and the Executive approve their own on the spot; IT and administrators go to the Executive', () => {
  const src = read('lib/actions/security.ts');
  // Who approves their own: the platform team, the Executive, the branch's Manager.
  const own = src.slice(src.indexOf('async function approvesOwn'), src.indexOf('/** Request a pass for yourself'));
  assert.match(own, /if \(isMaster\) return 'Master Administrator';/);
  // Never during an assisted session (the assistant approves nothing).
  assert.ok(own.indexOf('currentAssist()') > -1 && own.indexOf('currentAssist()') < own.indexOf('slugsOf(userId)'));
  // No head of their own department: a head of THEIR branch, else the branch's Managers — never another branch's head.
  assert.match(src, /usersWithSlugs\(\['department-head'\], \{ \.\.\.\(org \? \{ organisationId: org \} : \{\}\), branchId \}\)/);
  assert.match(own, /if \(slugs\.includes\('executive'\)\) return 'Executive';/);
  assert.match(own, /slugs\.includes\('workshop-manager'\)/);
  // Exit pass, road test, contractor pass: approved at once when the requester approves their own.
  assert.match(src, /status: own \? 'APPROVED' : requesterIsHead \|\| hq \? 'PENDING_MANAGER' : 'PENDING_HEAD'/);
  assert.equal((src.match(/status: 'APPROVED' as const, managerApprovedById: user\.id/g) ?? []).length, 2, 'road test and contractor pass');
  assert.equal((src.match(/onRequest: true, as: own/g) ?? []).length >= 4, true, 'every on-the-spot approval is audited by name and role');
  // A Department Head has authorised their own step; it still goes to the Manager.
  assert.match(src, /requesterIsHead \? \{ headApprovedById: user\.id, headApprovedAt: now \}/);
  // Headquarters people below the Executive: the Executive decides (same organisation as the record).
  assert.deepEqual(SENIOR_REQUESTER_SLUGS, ['administrator', 'it-administrator']);
  assert.match(src, /if \(excludeId && \(await isSeniorRequester\(excludeId\)\)\) return seniorApprovers\(excludeId, org\);/);
  assert.match(src, /usersWithSlugs\(\['executive'\], org\)\)\.filter\(\(x\) => x\.id !== excludeId\)/);
  // Everyone else still never approves their own.
  assert.match(src, /if \(p\.requestedById === user\.id && !own\) throw new SecurityError\('You cannot approve your own exit pass\.'\);/);
  assert.match(src, /if \(p\.requestedById === user\.id && !own\) throw new SecurityError\('You cannot approve your own road test\.'\);/);
  assert.match(src, /if \(p\.requestedById === user\.id && !own\) throw new SecurityError\('You cannot approve your own request\.'\);/);
  // "Is a Manager" never comes from the fallback list; page, Approvals list and decision share one approver list.
  assert.match(src, /!branchManagers\.usingFallback/);
  assert.match(src, /finalDecidable\(rows, user\.id, roles\.isMaster\)/);
  const body = src.slice(src.indexOf('async function seniorApprovers'));
  assert.ok(body.indexOf("'executive'") < body.indexOf("'administrator'") && body.indexOf("'administrator'") < body.indexOf('masterAdmins()'));
  // The form says "approved", not "requested", when it was approved on the spot.
  assert.equal((read('lib/actions/security-form-handlers.ts').match(/done = 'approved_now'/g) ?? []).length, 3);
  for (const f of ['exit-passes', 'road-tests', 'contractors']) assert.match(read(`app/(app)/security/${f}/[id]/page.tsx`), /approved_now:/, f);
});

test('the master admin gets an observer copy of every email (switchable off), never twice', async () => {
  const src = read('lib/email.ts');
  assert.match(src, /bcc/i);
  assert.match(src, /MAIL_OBSERVER_BCC/);
  // Staff workflow mail only: never sign-in links, password or account emails, never customers.
  assert.match(src, /options\.observer === false \? \[\] : await staffOnly\(to\)/);
  assert.match(src, /accountType: 'EMPLOYEE'/);
  assert.equal((read('lib/auth.ts').match(/observer: false/g) ?? []).length, 3, 'reset, verification and password-changed emails');
  for (const f of ['lib/staff-onboarding.ts', 'lib/customer-access.ts', 'lib/actions/users-admin.ts']) assert.match(read(f), /observer: false/, f);
  // The rule itself (copied from lib/email.ts to keep nodemailer out of the test).
  const fn = src.slice(src.indexOf('export function observerCopies'), src.indexOf('\n}\n', src.indexOf('export function observerCopies')) + 2);
  const observerCopies = new Function(`${fn.replace('export function', 'return function').replace(/: Record<string, string \| undefined> = process\.env\): string\[\]/, ')').replace(/\(to: string, env/, '(to, env')}`)() as (to: string, env: Record<string, string>) => string[];
  assert.deepEqual(observerCopies('a@x.com', { PLATFORM_OWNER_EMAIL: 'owner@x.com' }), ['owner@x.com']);
  assert.deepEqual(observerCopies('owner@x.com', { PLATFORM_OWNER_EMAIL: 'owner@x.com' }), []);
  assert.deepEqual(observerCopies('a@x.com', { MAIL_OBSERVER_BCC: 'off', PLATFORM_OWNER_EMAIL: 'owner@x.com' }), []);
  assert.deepEqual(observerCopies('a@x.com', { MAIL_OBSERVER_BCC: 'it@x.com, not-an-email' }), ['it@x.com']);
});

test('support action items belong to the support team, not to managers', () => {
  const src = read('lib/actions/my-work.ts');
  assert.match(src, /customer-care/);
  assert.match(src, /supportQueueMember/);
});

test('only headquarters gets the overviews; a manager keeps the branch dashboard', () => {
  const lead = read('lib/actions/leadership.ts');
  assert.match(lead, /scopeFor\(p, k\) === 'ALL'/);
  assert.match(lead, /leadership: orgWide\('analytics\.business\.view'\)/);
  const dash = read('app/(app)/dashboard/page.tsx');
  assert.match(dash, /overviews\.leadership \?/);
  assert.match(dash, /overviews\.it \?/);
  assert.match(dash, /'Your branch at a glance'/);
});

test('"Waiting on others" covers every workflow, names who has it, and is on Approvals, the dashboard, the brief and Enyo', () => {
  const src = read('lib/actions/pending.ts');
  for (const m of ['jobCard', 'vehicleService', 'estimate', 'serviceEstimate', 'partRequestSlip', 'externalProcurementRequest', 'exitPass', 'warrantyClaim', 'closeRequest', 'cancellationRequest', 'vehicleServiceCloseRequest', 'vehicleServiceCancellationRequest', 'roadTestPermit', 'supportTicket', 'contractorPass']) {
    assert.ok(src.includes(`prisma.${m}.findMany`), m);
  }
  // Only the person's own requests.
  for (const k of ['createdById: mine', 'requestedById: mine', 'requesterUserId: mine']) assert.ok(src.includes(k), k);
  assert.match(src, /organisationId: p\.organisationId, requesterUserId: mine/);
  assert.match(src, /'Manager', 'the Manager'/);
  assert.match(src, /\(Executive\)/);
  assert.match(read('app/(app)/approvals/page.tsx'), /<WaitingOnOthers items=\{waiting\} \/>/);
  assert.match(read('app/(app)/dashboard/page.tsx'), /<WaitingOnOthers items=\{waiting\} limit=\{5\} compact \/>/);
  assert.match(read('lib/brief/collect.ts'), /key: 'waiting'/);
  // Every link opens a page that exists.
  for (const url of src.matchAll(/url: `(\/[a-z/-]+)\/\$\{/g)) assert.ok(read(`app/(app)${url[1]}/[id]/page.tsx`).length > 0, url[1]);
});

test('Enyo offers only the tools a question needs, so "hi" fits the free model tier', () => {
  const dir = join(ROOT, 'lib', 'enyo', 'tools');
  const all = new Set(readdirSync(dir).filter((f) => f.endsWith('.ts')).flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/^\s{4}name: '([a-z_]+)'/gm)].map((m) => m[1]!)));
  for (const t of CORE_TOOLS) assert.ok(all.has(t), `core tool ${t} exists`);
  for (const t of ['my_pending', 'staff_directory', 'website_traffic', 'branch_briefing', 'explain_error']) assert.ok(all.has(t), t);
  const hi = selectToolNames('hi');
  assert.ok(hi.names.length <= 12, `hi offers ${hi.names.length}`);
  assert.ok(hi.names.includes('daily_brief') && hi.names.includes('my_pending'));
  assert.equal(hi.web, false);
  assert.ok(selectToolNames('who is Bhushan Salgar').names.includes('staff_directory'));
  assert.ok(selectToolNames('brief me on Isolo branch').names.includes('branch_briefing'));
  assert.ok(selectToolNames('explain error 1914370005').names.includes('explain_error'));
  assert.ok(selectToolNames('how many website visitors this week').names.includes('website_traffic'));
  assert.ok(selectToolNames('has my PRS been approved?').names.includes('my_pending'));
  // A follow-up keeps the previous question's tools.
  assert.ok(selectToolNames('and last month?', 'what was revenue this month').names.includes('business_summary'));
  assert.ok(selectToolNames('x'.repeat(10), '', 16).names.length <= 16);
  assert.ok(slimToolNames('brief me').length <= 9);
  // Every selectable name is a real tool (a typo would silently drop it).
  const src = read('lib/enyo/tool-select.ts');
  for (const m of src.matchAll(/'([a-z_]+)'/g)) if (m[1]!.includes('_')) assert.ok(all.has(m[1]!), `tool-select names ${m[1]}`);
});

test('the chat route sends a small request and retries smaller when the model server says it is too big or busy', () => {
  const portal = read('app/api/enyo/chat/route.ts');
  assert.match(portal, /staffToolsFor\(/);
  assert.match(portal, /retrySmaller:/);
  assert.match(portal, /trimHistory\(/);
  assert.match(read('../website/app/api/enyo/chat/route.ts'), /retrySmaller:/);
  // A failed answer offers "Try again" and "New chat".
  const ui = read('components/enyo/EnyoMessages.tsx');
  assert.match(ui, /Try again/);
  assert.match(ui, /New chat/);
  assert.match(read('components/enyo/EnyoPanel.tsx'), /onRetry=\{/);
});

test('the staff directory stays inside the organisation and shares only work details', () => {
  const src = read('lib/enyo/tools/people.ts');
  assert.match(src, /organisationId: org/);
  assert.match(src, /accountType: 'EMPLOYEE'/);
  const select = src.slice(src.indexOf('select: { fullName'), src.indexOf('});', src.indexOf('select: { fullName')));
  for (const never of ['phone', 'password', 'employeeProfile', 'image']) assert.ok(!select.includes(never), never);
});

test('IT trends and the website report are computed in code', () => {
  const days = lastDays(3, new Date('2026-10-17T10:00:00Z'));
  assert.deepEqual(days, ['2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(dayLabel('2026-10-17'), 'Sat 17');
  assert.deepEqual(perDay([new Date('2026-10-16T23:30:00Z'), new Date('2026-10-15T10:00:00Z')], days), [1, 0, 1]);
  assert.deepEqual(trendOf([1, 1, 2, 2]), { change: 100, direction: 'up' });
  assert.deepEqual(trendOf([0, 0]), { change: null, direction: 'flat' });
  assert.equal(secondsText(65), '1m 05s');
  assert.equal(secondsText(0), '—');
  const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  const row = (o: Partial<VisitRow>): VisitRow => ({ day: d('2026-10-17'), visitorHash: 'a', sessionId: 's1', path: '/', durationSec: 0, chatted: false, device: 'mobile', referrerHost: null, ...o });
  const r = summariseVisits([
    row({ durationSec: 30 }), row({ path: '/services', durationSec: 90, chatted: true }),
    row({ visitorHash: 'b', sessionId: 's2', device: 'desktop', referrerHost: 'google.com' }),
    row({ visitorHash: 'c', sessionId: 's3', day: d('2026-10-16'), durationSec: 0 }),
    row({ visitorHash: 'z', day: d('2026-09-01') }),
  ], days);
  assert.deepEqual(r.days.map((x) => x.visitors), [0, 1, 2]);
  assert.equal(r.totals.visitors, 3);
  assert.equal(r.totals.views, 4);
  assert.equal(r.totals.chatted, 1);
  assert.equal(r.totals.browsedOnly, 2);
  assert.equal(r.totals.chattedPct, 33);
  assert.equal(r.totals.avgSeconds, 60); // unknown times are left out, not counted as 0
  assert.equal(r.totals.singlePagePct, 67);
  assert.equal(r.topPages[0]!.path, '/');
  assert.deepEqual(r.referrers, [{ host: 'google.com', views: 1 }]);
});

test('IT trends and the website report are organisation-wide IT (and leadership for the website), counts only', () => {
  const src = read('lib/actions/it-trends.ts');
  assert.match(src, /scopeFor\(me, 'audit\.view'\) === 'ALL'/);
  assert.match(src, /refuse\('audit\.view'/);
  assert.match(src, /organisationId: org/);
  assert.match(read('app/(app)/it/page.tsx'), /<WebsiteSection \/>/);
  assert.match(read('lib/schema-health-core.ts'), /site_visits/);
  assert.match(read('app/api/cron/pricing-alerts/route.ts'), /purgeOldSiteVisits\(400\)/);
});
