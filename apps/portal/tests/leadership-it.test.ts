import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasBranchLens, type Principal } from '../lib/authz/catalogue';
import { navigationFor } from '../lib/authz/navigation';
import { summariseTeam, STANDARDS, type Handled } from '../lib/team-core';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
const h = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 3_600_000);

test('the branch lens: headquarters roles get it; branch staff keep their own branch', () => {
  for (const r of ['executive', 'administrator', 'it-administrator']) assert.equal(hasBranchLens(who([r])), true, r);
  for (const r of ['technician', 'workshop-manager', 'finance-officer', 'receptionist', 'branch-administrator']) assert.equal(hasBranchLens(who([r])), false, r);
  assert.equal(hasBranchLens(who([], { isSuperAdmin: true })), true);
});

test('the lens narrows, never widens, and is never a permission', () => {
  const server = read('lib/authz/server.ts');
  // Only for organisation-wide scope, and only a branch of the person's own organisation.
  assert.match(server, /if \(d\.scope === 'ALL' && p\.lensBranchId && opts\.lens !== false\) return \{ branchId: p\.lensBranchId \};/);
  // Only an active branch, never while working for a colleague.
  assert.match(server, /where: \{ id: lens, isActive: true \}/);
  assert.match(server, /signedInContext\(\)\.then\(\(c\) => Boolean\(c\?\.assist\)\)/);
  // One record, a write, or a person's own work: never hidden by the lens.
  const support = read('lib/actions/support.ts');
  for (const fn of ['getSupportTicket', 'replyToSupportTicket', 'assignSupportTicket', 'moveSupportTicket', 'setSupportTicketStatus']) {
    const body = support.split(`export async function ${fn}(`)[1]!.split('\nexport ')[0]!;
    assert.match(body, /reachWhere\([^)]*\{ lens: false \}\)/, fn);
  }
  for (const f of ['lib/actions/search.ts', 'lib/actions/my-work.ts', 'lib/actions/workflow-actions.ts', 'lib/reminders.ts', 'lib/enyo/tools/records.ts']) assert.match(read(f), /\{ lens: false \}/, f);
  assert.match(server, /\(p\.orgBranchIds \?\? \[\]\)\.includes\(lens\)/);
  // decide() never reads it.
  assert.doesNotMatch(read('lib/authz/catalogue.ts').split('export function decide')[1]!.split('\nexport ')[0]!, /lensBranchId/);
  const action = read('lib/actions/branch-lens.ts');
  assert.match(action, /inMyOrganisation\(b\.businessUnit\.organisationId\)/);
  assert.match(action, /httpOnly: true, sameSite: 'lax'/);
  // Logs follow the lens by who acted; a quoted error reference is always found.
  assert.match(read('lib/actions/audit-logs.ts'), /f\.userId \? \{ userId: f\.userId \} : await lensPeopleWhere\(\)/);
  assert.match(read('lib/actions/error-log.ts'), /ref \? \{ ref \} : await lensPeopleWhere\(\)/);
  assert.match(read('app/(app)/layout.tsx'), /assist \? null : await getBranchLensOptions\(\)/);
});

test('team performance: counts, speed against the standard, rework, rating', () => {
  const people = [{ id: 't1', name: 'Tunde', roles: 'Technician', branch: 'Ikeja' }, { id: 't2', name: 'Ada', roles: 'Technician', branch: 'Ikeja' }, { id: 'm', name: 'Musa', roles: 'Workshop Manager', branch: 'Ikeja' }, { id: 'q', name: 'Quiet', roles: 'Store Officer', branch: 'Ikeja' }];
  const items: Handled[] = [
    ...[10, 20, 30, 40, 50].map((x) => ({ userId: 't1', kind: 'job' as const, from: h(0), to: h(x), value: 1000 })),
    ...[100, 120, 10].map((x, i) => ({ userId: 't2', kind: 'job' as const, from: h(0), to: h(x), rework: i < 2 })),
    ...[2, 3, 30].map((x) => ({ userId: 'm', kind: 'estimateFinal' as const, from: h(0), to: h(x) })),
  ];
  const rows = summariseTeam(items, people, new Map([['t2', 4]]));
  const t1 = rows.find((r) => r.userId === 't1')!;
  assert.equal(t1.handled, 5);
  assert.equal(t1.value, 5000);
  assert.equal(t1.withinPct, 100);
  assert.equal(t1.medianHours, 30);
  assert.equal(t1.rating, 'strong');
  const t2 = rows.find((r) => r.userId === 't2')!;
  assert.equal(t2.rework, 2);
  assert.equal(t2.openNow, 4);
  assert.equal(t2.rating, 'attention', 'two of three jobs reworked and slow');
  const m = rows.find((r) => r.userId === 'm')!;
  assert.equal(m.steps[0]!.label, STANDARDS.estimateFinal.label);
  assert.equal(m.withinPct, 67);
  assert.equal(rows.find((r) => r.userId === 'q')!.rating, 'quiet');
  assert.equal(rows[0]!.userId, 't1', 'most work first');
});

test('Headquarters tabs, IT control room and Enyo briefings are wired, guarded and in the menu', () => {
  assert.ok(navigationFor(who(['it-administrator'])).some((i) => i.key === 'it'));
  assert.ok(navigationFor(who(['administrator'])).some((i) => i.key === 'it'));
  assert.ok(!navigationFor(who(['executive'])).some((i) => i.key === 'it'), 'directors: no audit trail');
  assert.ok(!navigationFor(who(['technician'])).some((i) => i.key === 'it'));
  assert.match(read('app/(app)/it/page.tsx'), /guardPage\('audit\.view', '\/it'\)/);
  assert.match(read('lib/actions/it.ts'), /await authorize\('audit\.view'/);
  assert.match(read('app/(app)/headquarters/team/page.tsx'), /guardPage\('analytics\.business\.view'/);
  assert.match(read('lib/actions/team.ts'), /await authorize\('analytics\.business\.view'/);
  const tools = read('lib/enyo/tools/leadership.ts');
  assert.match(tools, /name: 'branch_briefing'/);
  assert.match(tools, /if \(!\(await allows\('analytics\.business\.view'\)\)\) return refused/);
  assert.match(tools, /name: 'explain_error'/);
  assert.match(tools, /if \(!\(await allows\('audit\.view'\)\)\) return refused/);
  assert.match(tools, /where: \{ \.\.\.fence, ref \}/, 'an error is looked up inside the organisation only');
  assert.match(read('lib/enyo/tools/index.ts'), /\.\.\.leadershipTools/);
  // Briefing buttons ask straight away and read the answer aloud.
  assert.match(read('components/enyo/EnyoPanel.tsx'), /prefsRef\.current\.speak \|\| opts\.speak/);
  assert.match(read('app/(app)/headquarters/page.tsx'), /<AskEnyoButton variant="solid" send speak/);
  assert.match(read('app/(app)/audit-logs/errors/page.tsx'), /Explain with Enyo/);
});

test('sign-in pages tell staff and customers what the platform does, truthfully', () => {
  const staff = read('components/AuthShell.tsx');
  for (const t of ['Workshop', 'Headquarters & analytics', 'IT & audit', 'Enyo, the assistant', 'Nobody approves their own request']) assert.ok(staff.includes(t), t);
  const cust = read('../website/components/customer/CustomerAuthShell.tsx');
  for (const t of ['Follow every step', 'Ask Enyo, any time', 'Talk to a person', 'Your visit, step by step']) assert.ok(cust.includes(t), t);
});
