/** Enyo's brief (lib/brief/core.ts) and learning from conversations (wiring). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allowedLinks, briefPeriod, greetingFor, onlyKnownLinks, partOfDay, plainBrief, type BriefData } from '../lib/brief/core';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

test('greeting and part of the day follow Lagos time', () => {
  assert.equal(greetingFor(new Date('2026-10-16T07:30:00Z')), 'Good morning');
  assert.equal(greetingFor(new Date('2026-10-16T13:00:00Z')), 'Good afternoon');
  assert.equal(greetingFor(new Date('2026-10-16T17:30:00Z')), 'Good evening');
  assert.equal(partOfDay(new Date('2026-10-16T07:30:00Z')), '2026-10-16:morning');
});

test('periods: now, today, since my last brief, this week, chosen dates — anything odd is "now"', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  assert.equal(briefPeriod({ scope: 'now' }, now).from, null);
  assert.equal(briefPeriod({ scope: 'today' }, now).from!.toISOString(), '2026-10-15T23:00:00.000Z');
  assert.equal(briefPeriod({ scope: 'since_last', since: '2026-10-16T08:00:00Z' }, now).from!.toISOString(), '2026-10-16T08:00:00.000Z');
  assert.equal(briefPeriod({ scope: 'since_last', since: '2099-01-01' }, now).from!.toISOString(), '2026-10-15T23:00:00.000Z', 'a future "since" falls back to today');
  assert.equal(briefPeriod({ scope: 'custom', from: '2026-10-01', to: '2026-10-10' }, now).scope, 'custom');
  assert.equal(briefPeriod({ scope: 'custom', from: '2026-10-10', to: '2026-10-01' }, now).scope, 'now');
  assert.equal(briefPeriod({ scope: 'drop table' }, now).scope, 'now');
});

const data: BriefData = {
  name: 'Ada', greeting: 'Good morning', periodLabel: 'right now', from: null, to: '2026-10-16T08:00:00Z',
  sections: [
    { key: 'decisions', title: 'Decisions waiting for you', count: 2, overdue: 1, href: '/approvals', items: [{ title: 'Approve estimate JC-2026-000412', href: '/workshop/job-cards/abc', overdue: true }] },
    { key: 'mail', title: 'Unread mail', count: 0, items: [], href: '/mail' },
  ],
};

test('the plain brief lists what is waiting with links; nothing waiting says so', () => {
  const t = plainBrief(data);
  assert.match(t, /^Good morning, Ada\./);
  assert.match(t, /\*\*Decisions waiting for you\*\* — 2 \(1 overdue\)/);
  assert.match(t, /\[Approve estimate JC-2026-000412\]\(\/workshop\/job-cards\/abc\)/);
  assert.doesNotMatch(t, /Unread mail/);
  assert.match(plainBrief({ ...data, sections: [] }), /Nothing is waiting for you right now/);
});

test('Enyo’s brief keeps only links we gave it', () => {
  const allowed = allowedLinks(data);
  const out = onlyKnownLinks('Start with [the estimate](/workshop/job-cards/abc), not [this](https://evil.example) or [that](//evil.example).', allowed);
  assert.equal(out, 'Start with [the estimate](/workshop/job-cards/abc), not this or that.');
});

test('wiring: brief on the dashboard and in chat; work profile; conversation learning is scrubbed, approved and fenced', () => {
  assert.match(read('app/(app)/dashboard/page.tsx'), /<EnyoBriefCard \/>/);
  assert.match(read('lib/enyo/tools/work.ts'), /collectBrief\(period\)/);
  const collect = read('lib/brief/collect.ts');
  assert.match(collect, /assisting \? Promise\.resolve\(null\) : mailFor/, 'never a colleague’s mail during an assisted session');
  const route = read('app/api/enyo/chat/route.ts');
  assert.match(route, /const profile = ctx\.assisted \? null : await workProfile\(userId, organisationId\)/);
  const conv = read('lib/enyo/conversations.ts');
  assert.match(conv, /status: 'PENDING'/);
  assert.match(conv, /if \(handedOver\.has\(c\.id\)\) continue;/);
  assert.match(conv, /!PUBLIC_SAFE_TOOLS\.has/);
  assert.match(conv, /scrubKeepingLines\(a\.content, staff, 4000\)/);
  assert.match(conv, /where: \{ organisationId, status: 'APPROVED' \}/);
  const exp = read('app/(app)/enyo/learning/conversations/route.ts');
  assert.match(exp, /allows\('enyo\.manage'\)/);
  assert.match(exp, /currentAssist\(\)/);
  assert.match(exp, /enyo\.conversation_training_exported/);
});
