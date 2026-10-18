"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Enyo's brief (lib/brief/core.ts) and learning from conversations (wiring). */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const core_1 = require("../lib/brief/core");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (f) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, f), 'utf8');
(0, node_test_1.test)('greeting and part of the day follow Lagos time', () => {
    strict_1.default.equal((0, core_1.greetingFor)(new Date('2026-10-16T07:30:00Z')), 'Good morning');
    strict_1.default.equal((0, core_1.greetingFor)(new Date('2026-10-16T13:00:00Z')), 'Good afternoon');
    strict_1.default.equal((0, core_1.greetingFor)(new Date('2026-10-16T17:30:00Z')), 'Good evening');
    strict_1.default.equal((0, core_1.partOfDay)(new Date('2026-10-16T07:30:00Z')), '2026-10-16:morning');
});
(0, node_test_1.test)('periods: now, today, since my last brief, this week, chosen dates — anything odd is "now"', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'now' }, now).from, null);
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'today' }, now).from.toISOString(), '2026-10-15T23:00:00.000Z');
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'since_last', since: '2026-10-16T08:00:00Z' }, now).from.toISOString(), '2026-10-16T08:00:00.000Z');
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'since_last', since: '2099-01-01' }, now).from.toISOString(), '2026-10-15T23:00:00.000Z', 'a future "since" falls back to today');
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'custom', from: '2026-10-01', to: '2026-10-10' }, now).scope, 'custom');
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'custom', from: '2026-10-10', to: '2026-10-01' }, now).scope, 'now');
    strict_1.default.equal((0, core_1.briefPeriod)({ scope: 'drop table' }, now).scope, 'now');
});
const data = {
    name: 'Ada', greeting: 'Good morning', periodLabel: 'right now', from: null, to: '2026-10-16T08:00:00Z',
    sections: [
        { key: 'decisions', title: 'Decisions waiting for you', count: 2, overdue: 1, href: '/approvals', items: [{ title: 'Approve estimate JC-2026-000412', href: '/workshop/job-cards/abc', overdue: true }] },
        { key: 'mail', title: 'Unread mail', count: 0, items: [], href: '/mail' },
    ],
};
(0, node_test_1.test)('the plain brief lists what is waiting with links; nothing waiting says so', () => {
    const t = (0, core_1.plainBrief)(data);
    strict_1.default.match(t, /^Good morning, Ada\./);
    strict_1.default.match(t, /\*\*Decisions waiting for you\*\* — 2 \(1 overdue\)/);
    strict_1.default.match(t, /\[Approve estimate JC-2026-000412\]\(\/workshop\/job-cards\/abc\)/);
    strict_1.default.doesNotMatch(t, /Unread mail/);
    strict_1.default.match((0, core_1.plainBrief)({ ...data, sections: [] }), /Nothing is waiting for you right now/);
});
(0, node_test_1.test)('Enyo’s brief keeps only links we gave it', () => {
    const allowed = (0, core_1.allowedLinks)(data);
    const out = (0, core_1.onlyKnownLinks)('Start with [the estimate](/workshop/job-cards/abc), not [this](https://evil.example) or [that](//evil.example).', allowed);
    strict_1.default.equal(out, 'Start with [the estimate](/workshop/job-cards/abc), not this or that.');
});
(0, node_test_1.test)('wiring: brief on the dashboard and in chat; work profile; conversation learning is scrubbed, approved and fenced', () => {
    strict_1.default.match(read('app/(app)/dashboard/page.tsx'), /<EnyoBriefCard userKey=\{me\.id\} \/>/);
    strict_1.default.match(read('lib/enyo/tools/work.ts'), /collectBrief\(period\)/);
    const collect = read('lib/brief/collect.ts');
    strict_1.default.match(collect, /assisting \? Promise\.resolve\(null\) : mailFor/, 'never a colleague’s mail during an assisted session');
    strict_1.default.match(collect, /currentAssist\(\)\.then\(Boolean\)\.catch\(\(\) => true\)/, 'fails closed');
    const route = read('app/api/enyo/chat/route.ts');
    strict_1.default.match(route, /const profile = ctx\.assisted \? null : await workProfile\(userId, organisationId\)/);
    const conv = read('lib/enyo/conversations.ts');
    strict_1.default.match(conv, /status: 'PENDING'/);
    strict_1.default.match(conv, /if \(handedOver\.has\(c\.id\)\) continue;/);
    strict_1.default.match(conv, /!PUBLIC_SAFE_TOOLS\.has/);
    strict_1.default.match(conv, /scrubKeepingLines\(withoutGreeting\(a\.content\), names, 4000\)/);
    strict_1.default.match(conv, /customerNames/);
    strict_1.default.match(conv, /where: \{ organisationId, status: 'APPROVED' \}/);
    const exp = read('app/(app)/enyo/learning/conversations/route.ts');
    strict_1.default.match(exp, /allows\('enyo\.manage'\)/);
    strict_1.default.match(exp, /currentAssist\(\)/);
    strict_1.default.match(exp, /enyo\.conversation_training_exported/);
});
const core_2 = require("../lib/brief/core");
const markdown_1 = require("../lib/enyo/markdown");
(0, node_test_1.test)('a mail subject can never become a link in the brief', () => {
    const evil = 'Verify](https://evil.example/x) now';
    const text = (0, core_1.plainBrief)({ ...data, sections: [{ key: 'mail', title: 'Unread mail', count: 1, href: '/mail', items: [{ title: evil, href: '/mail?m=1' }] }] });
    strict_1.default.match(text, /\[Verify\\\]\\\(https:\/\/evil\.example\/x\\\) now\]\(\/mail\?m=1\)/);
    const blocks = JSON.stringify((0, markdown_1.parseMarkdown)(text));
    strict_1.default.doesNotMatch(blocks, /"href":"https:\/\/evil/);
    strict_1.default.equal((0, core_2.mdText)('a*b_c'), 'a\\*b\\_c');
});
const conversations_core_1 = require("../lib/enyo/conversations-core");
(0, node_test_1.test)('the greeting line with a customer’s name is dropped from learned answers', () => {
    strict_1.default.equal((0, conversations_core_1.withoutGreeting)('Hi Chinedu, our Ikeja branch opens at 8.'), 'our Ikeja branch opens at 8.');
    strict_1.default.equal((0, conversations_core_1.withoutGreeting)('Good morning, Mr Okafor. We open at 8.'), 'We open at 8.');
    strict_1.default.equal((0, conversations_core_1.withoutGreeting)('We open at 8.'), 'We open at 8.');
});
const core_3 = require("../lib/brief/core");
(0, node_test_1.test)('the card: decisions and overdue first, notifications last; the summary is plain text', () => {
    const d = {
        ...data,
        sections: [
            { key: 'activity', title: 'New notifications this week', count: 60, href: '/notifications', items: [] },
            { key: 'mail', title: 'Unread mail', count: 3, href: '/mail', items: [] },
            { key: 'decisions', title: 'Decisions waiting for you', count: 2, overdue: 1, href: '/approvals', items: [] },
        ],
    };
    strict_1.default.deepEqual((0, core_3.orderedSections)(d).map((s) => s.key), ['decisions', 'mail', 'activity']);
    strict_1.default.equal((0, core_3.briefHeadline)(d), '2 decisions waiting for you (1 overdue) · 3 unread mail');
    strict_1.default.match((0, core_3.plainSummary)(d), /1 item is overdue — start with decisions waiting for you/);
    strict_1.default.equal((0, core_3.briefHeadline)({ ...d, sections: [d.sections[0]] }), 'Nothing needs you — only new notifications.');
    // Whatever the model writes, no links, bracketed paths or markdown reach the card.
    strict_1.default.equal((0, core_3.cleanSummary)('Good evening, Ada. **Start** with [the estimate](/workshop/x) (all: [/notifications]) → [/crm/customers/abc].'), 'Good evening, Ada. Start with the estimate.');
    strict_1.default.match(read('lib/brief/core.ts'), /Notifications are information only/);
});
