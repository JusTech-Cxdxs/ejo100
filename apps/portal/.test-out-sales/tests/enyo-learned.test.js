"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Enyo learns from answers people mark helpful (lib/enyo/learned*.ts). */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const learned_core_1 = require("../lib/enyo/learned-core");
const text_1 = require("../lib/enyo/predict/text");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const row = (id, question, daysAgo = 1) => ({ id, question, answer: `A for ${question}`, tokens: (0, text_1.tokenise)(question), createdAt: new Date(Date.now() - daysAgo * 86_400_000) });
(0, node_test_1.test)('the closest helpful answers come back; unrelated ones do not', () => {
    const rows = [row('a', 'How do I open a Job Card?'), row('b', 'How do I record a payment on an estimate?'), row('c', 'How do I add a meeting room?')];
    const m = (0, learned_core_1.learnedMatches)(rows, (0, text_1.tokenise)('how can I open a new job card'), 2);
    strict_1.default.equal(m[0].id, 'a');
    strict_1.default.ok(m.every((x) => x.id !== 'c'));
    strict_1.default.deepEqual((0, learned_core_1.learnedMatches)(rows, (0, text_1.tokenise)('weather in Lagos today'), 2), []);
});
(0, node_test_1.test)('reused without a model call only when practically the same question, recent and not too short', () => {
    const rows = [row('a', 'How do I open a Job Card?')];
    const same = (0, learned_core_1.learnedMatches)(rows, (0, text_1.tokenise)('How do I open a Job Card'), 1)[0];
    strict_1.default.ok((0, learned_core_1.canReuse)(same, (0, text_1.tokenise)('How do I open a Job Card')));
    const old = (0, learned_core_1.learnedMatches)([row('a', 'How do I open a Job Card?', learned_core_1.REUSE_MAX_AGE_DAYS + 1)], (0, text_1.tokenise)('How do I open a Job Card'), 1)[0];
    strict_1.default.equal((0, learned_core_1.canReuse)(old, (0, text_1.tokenise)('How do I open a Job Card')), false);
    strict_1.default.equal((0, learned_core_1.canReuse)((0, learned_core_1.learnedMatches)(rows, (0, text_1.tokenise)('job card'), 1)[0], (0, text_1.tokenise)('job card')), false);
});
(0, node_test_1.test)('only answers that read nobody\'s records are learned; one organisation never learns from another', () => {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib/enyo/learned.ts'), 'utf8');
    strict_1.default.match(src, /LEARNABLE_TOOLS = new Set\(\['guide_search', 'web_lookup', 'organisation_info'\]\)/);
    strict_1.default.match(src, /if \(tools\.some\(\(t\) => !LEARNABLE_TOOLS\.has/);
    strict_1.default.match(src, /scrubText\(question\.content, names\)/);
    strict_1.default.match(src, /where: \{ organisationId, channel: \{ in: channels \}, status: 'APPROVED' \}/);
    strict_1.default.match(src, /conversation: \{ userId: o\.userId, organisationId: o\.organisationId \}/);
    const route = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'app/api/enyo/chat/route.ts'), 'utf8');
    strict_1.default.match(route, /findLearned\(organisationId,/);
    strict_1.default.match(route, /model: route\.model/);
});
(0, node_test_1.test)('learning is safe: first turn only, no memories, never from a reused answer, approval before use', () => {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib/enyo/learned.ts'), 'utf8');
    strict_1.default.match(src, /users\.length !== 1 \|\| earlierAnswers > 0/);
    strict_1.default.match(src, /enyoMemory\.count/);
    strict_1.default.match(src, /learnedFrom !== undefined \|\| answer\.model === 'learned'/);
    strict_1.default.match(src, /status: 'PENDING'/);
    strict_1.default.match(src, /createdAt: \{ gte: question\.createdAt, lte: answer\.createdAt \}/);
    const actions = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib/actions/enyo.ts'), 'utf8');
    strict_1.default.match(actions, /export async function approveLearnedAnswer/);
    strict_1.default.doesNotMatch(actions.slice(actions.indexOf('export type LearnedAnswerRow')), /myEnyoOrg/);
});
(0, node_test_1.test)('a learned answer is given verbatim only for a general first question, never in context', () => {
    const base = { question: 'How do I open a Job Card?', historyLength: 0, assisted: false, page: '/dashboard' };
    strict_1.default.equal((0, learned_core_1.reuseAllowed)(base), true);
    strict_1.default.equal((0, learned_core_1.reuseAllowed)({ ...base, assisted: true }), false);
    strict_1.default.equal((0, learned_core_1.reuseAllowed)({ ...base, historyLength: 2 }), false);
    strict_1.default.equal((0, learned_core_1.reuseAllowed)({ ...base, page: '/job-cards/cm9x0abcdefghijklmnopqrs' }), false);
    strict_1.default.equal((0, learned_core_1.reuseAllowed)({ ...base, question: 'How do I close this job?' }), false);
    strict_1.default.equal((0, learned_core_1.reuseAllowed)({ ...base, question: 'Where are my reminders?' }), false);
});
(0, node_test_1.test)('a learned answer keeps its lines, loses personal details', () => {
    const out = (0, learned_core_1.scrubKeepingLines)('Steps:\n\n1. Call Ada Obi on 08031234567\n2. Email ada@example.com\n\n\n\n| a | b |', ['Ada Obi'], 4000);
    strict_1.default.match(out, /^Steps:\n\n1\. Call \[name\] \[name\] on \[phone\]\n2\. Email \[email\]\n\n\| a \| b \|$/);
    strict_1.default.ok((0, learned_core_1.scrubKeepingLines)('x\n'.repeat(5000), [], 4000).length <= 4000);
});
