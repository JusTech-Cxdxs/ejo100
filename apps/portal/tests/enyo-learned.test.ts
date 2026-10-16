/** Enyo learns from answers people mark helpful (lib/enyo/learned*.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canReuse, learnedMatches, reuseAllowed, scrubKeepingLines, REUSE_MAX_AGE_DAYS } from '../lib/enyo/learned-core';
import { tokenise } from '../lib/enyo/predict/text';

const ROOT = join(__dirname, '..', '..');
const row = (id: string, question: string, daysAgo = 1) => ({ id, question, answer: `A for ${question}`, tokens: tokenise(question), createdAt: new Date(Date.now() - daysAgo * 86_400_000) });

test('the closest helpful answers come back; unrelated ones do not', () => {
  const rows = [row('a', 'How do I open a Job Card?'), row('b', 'How do I record a payment on an estimate?'), row('c', 'How do I add a meeting room?')];
  const m = learnedMatches(rows, tokenise('how can I open a new job card'), 2);
  assert.equal(m[0]!.id, 'a');
  assert.ok(m.every((x) => x.id !== 'c'));
  assert.deepEqual(learnedMatches(rows, tokenise('weather in Lagos today'), 2), []);
});

test('reused without a model call only when practically the same question, recent and not too short', () => {
  const rows = [row('a', 'How do I open a Job Card?')];
  const same = learnedMatches(rows, tokenise('How do I open a Job Card'), 1)[0];
  assert.ok(canReuse(same, tokenise('How do I open a Job Card')));
  const old = learnedMatches([row('a', 'How do I open a Job Card?', REUSE_MAX_AGE_DAYS + 1)], tokenise('How do I open a Job Card'), 1)[0];
  assert.equal(canReuse(old, tokenise('How do I open a Job Card')), false);
  assert.equal(canReuse(learnedMatches(rows, tokenise('job card'), 1)[0], tokenise('job card')), false);
});

test('only answers that read nobody\'s records are learned; one organisation never learns from another', () => {
  const src = readFileSync(join(ROOT, 'lib/enyo/learned.ts'), 'utf8');
  assert.match(src, /LEARNABLE_TOOLS = new Set\(\['guide_search', 'web_lookup', 'organisation_info'\]\)/);
  assert.match(src, /if \(tools\.some\(\(t\) => !LEARNABLE_TOOLS\.has/);
  assert.match(src, /scrubText\(question\.content, names\)/);
  assert.match(src, /where: \{ organisationId, channel: \{ in: channels \}, status: 'APPROVED' \}/);
  assert.match(src, /conversation: \{ userId: o\.userId, organisationId: o\.organisationId \}/);
  const route = readFileSync(join(ROOT, 'app/api/enyo/chat/route.ts'), 'utf8');
  assert.match(route, /findLearned\(organisationId,/);
  assert.match(route, /model: route\.model/);
});

test('learning is safe: first turn only, no memories, never from a reused answer, approval before use', () => {
  const src = readFileSync(join(ROOT, 'lib/enyo/learned.ts'), 'utf8');
  assert.match(src, /users\.length !== 1 \|\| earlierAnswers > 0/);
  assert.match(src, /enyoMemory\.count/);
  assert.match(src, /learnedFrom !== undefined \|\| answer\.model === 'learned'/);
  assert.match(src, /status: 'PENDING'/);
  assert.match(src, /createdAt: \{ gte: question\.createdAt, lte: answer\.createdAt \}/);
  const actions = readFileSync(join(ROOT, 'lib/actions/enyo.ts'), 'utf8');
  assert.match(actions, /export async function approveLearnedAnswer/);
  assert.doesNotMatch(actions.slice(actions.indexOf('export type LearnedAnswerRow')), /myEnyoOrg/);
});

test('a learned answer is given verbatim only for a general first question, never in context', () => {
  const base = { question: 'How do I open a Job Card?', historyLength: 0, assisted: false, page: '/dashboard' };
  assert.equal(reuseAllowed(base), true);
  assert.equal(reuseAllowed({ ...base, assisted: true }), false);
  assert.equal(reuseAllowed({ ...base, historyLength: 2 }), false);
  assert.equal(reuseAllowed({ ...base, page: '/job-cards/cm9x0abcdefghijklmnopqrs' }), false);
  assert.equal(reuseAllowed({ ...base, question: 'How do I close this job?' }), false);
  assert.equal(reuseAllowed({ ...base, question: 'Where are my reminders?' }), false);
});

test('a learned answer keeps its lines, loses personal details', () => {
  const out = scrubKeepingLines('Steps:\n\n1. Call Ada Obi on 08031234567\n2. Email ada@example.com\n\n\n\n| a | b |', ['Ada Obi'], 4000);
  assert.match(out, /^Steps:\n\n1\. Call \[name\] \[name\] on \[phone\]\n2\. Email \[email\]\n\n\| a \| b \|$/);
  assert.ok(scrubKeepingLines('x\n'.repeat(5000), [], 4000).length <= 4000);
});
