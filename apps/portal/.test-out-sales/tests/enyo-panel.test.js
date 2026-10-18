"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Enyo panel (staff portal): the safe Markdown reader, the greeting, starter
 * questions, and static guarantees about the panel's code (no raw HTML, only
 * the browser-safe engine import, microphone for this site only, Refine
 * buttons pointing at real fields).
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const markdown_1 = require("../lib/enyo/markdown");
const voice_text_1 = require("../components/enyo/voice-text");
const greeting_1 = require("../lib/enyo/greeting");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (p) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, p), 'utf8');
const links = (nodes) => nodes.flatMap((n) => (n.t === 'a' ? [n.href, ...links(n.c)] : n.t === 'b' || n.t === 'i' ? links(n.c) : []));
const text = (nodes) => nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : text(n.c))).join('');
// ------------------------------------------------------------ links
(0, node_test_1.test)('links: portal paths and https only', () => {
    strict_1.default.deepEqual((0, markdown_1.safeHref)('/approvals'), { href: '/approvals', internal: true });
    strict_1.default.deepEqual((0, markdown_1.safeHref)('/workshop/job-cards?prefill=1&complaint=Brakes'), { href: '/workshop/job-cards?prefill=1&complaint=Brakes', internal: true });
    strict_1.default.equal((0, markdown_1.safeHref)('https://example.com/a')?.internal, false);
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', ' javascript:x', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.example/x', '/\\evil.example', 'http://example.com', 'https://user:pw@example.com', 'mailto:a@b.c', '', 'approvals']) {
        strict_1.default.equal((0, markdown_1.safeHref)(bad), null, `should refuse ${JSON.stringify(bad)}`);
    }
});
(0, node_test_1.test)('markdown: a refused link keeps its words as plain text', () => {
    const out = (0, markdown_1.parseInline)('Click [here](javascript:alert(1)) now');
    strict_1.default.deepEqual(links(out), []);
    strict_1.default.equal(text(out), 'Click here now');
    strict_1.default.deepEqual(links((0, markdown_1.parseInline)('[Approvals](/approvals) and [docs](https://example.com/x)')), ['/approvals', 'https://example.com/x']);
    strict_1.default.deepEqual(links((0, markdown_1.parseInline)('[part](/inventory/parts?q=filter(oil))')), ['/inventory/parts?q=filter(oil)']);
});
(0, node_test_1.test)('markdown: HTML is only ever text', () => {
    const blocks = (0, markdown_1.parseMarkdown)('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    strict_1.default.equal(blocks.length, 1);
    strict_1.default.equal(blocks[0].type, 'p');
    strict_1.default.equal(text(blocks[0].c), '<script>alert(1)</script> <img src=x onerror=alert(1)>');
});
(0, node_test_1.test)('markdown: bold, italics, code, lists, headings', () => {
    const b = (0, markdown_1.parseMarkdown)('You have **3 approvals** waiting:\n\n- Estimate *JC-1*\n- Parts `PR-2`\n\n1. First\n2. Second\n\n## Next');
    strict_1.default.deepEqual(b.map((x) => x.type), ['p', 'ul', 'ol', 'h']);
    const p = b[0];
    strict_1.default.equal(p.c[1].t, 'b');
    const ul = b[1];
    strict_1.default.equal(ul.items.length, 2);
    strict_1.default.equal(ul.items[0][1].t, 'i');
    strict_1.default.equal(ul.items[1][1].t, 'code');
});
(0, node_test_1.test)('markdown: snake_case and lone marks stay as typed; half-streamed text is safe', () => {
    strict_1.default.equal(text((0, markdown_1.parseInline)('use part_lookup_tool now')), 'use part_lookup_tool now');
    strict_1.default.ok((0, markdown_1.parseInline)('use part_lookup_tool now').every((n) => n.t === 'text'));
    strict_1.default.equal(text((0, markdown_1.parseInline)('2 * 3 = 6')), '2 * 3 = 6');
    // Streaming: an unfinished bold or link must not throw or swallow text.
    strict_1.default.equal(text((0, markdown_1.parseInline)('Total: **₦18')), 'Total: **₦18');
    strict_1.default.equal(text((0, markdown_1.parseInline)('Open [the page](/appro')), 'Open [the page](/appro');
    strict_1.default.doesNotThrow(() => (0, markdown_1.parseMarkdown)('*'.repeat(5000)));
});
(0, node_test_1.test)('plainText drops the marks (for copying and reading aloud)', () => {
    strict_1.default.equal((0, markdown_1.plainText)('You have **3** waiting:\n\n- [Approvals](/approvals)'), 'You have 3 waiting:\n\nApprovals');
});
// ------------------------------------------------------------ greeting
(0, node_test_1.test)('greeting: time of day in Lagos, correct plurals', () => {
    strict_1.default.equal((0, greeting_1.greetingText)({ name: 'Ada', hour: 8, approvals: 3 }), 'Good morning, Ada. 3 approvals are waiting.');
    strict_1.default.equal((0, greeting_1.greetingText)({ name: 'Ada', hour: 13, approvals: 1 }), 'Good afternoon, Ada. 1 approval is waiting.');
    strict_1.default.equal((0, greeting_1.greetingText)({ name: 'Ada', hour: 19, approvals: 0 }), 'Good evening, Ada. Nothing is waiting for your approval.');
    strict_1.default.equal((0, greeting_1.greetingText)({ name: '', hour: 9, approvals: null }), 'Good morning. Ask me anything about your work.');
    // 23:30 UTC is 00:30 the next day in Lagos.
    strict_1.default.equal((0, greeting_1.lagosHour)(new Date('2026-10-14T23:30:00Z')), 0);
    strict_1.default.equal((0, greeting_1.lagosDay)(new Date('2026-10-14T23:30:00Z')), '2026-10-15');
    strict_1.default.equal((0, greeting_1.firstName)('  Ada   Okafor '), 'Ada');
});
(0, node_test_1.test)('starter questions suit the role, at most four, always "What\'s waiting for me?"', () => {
    for (const role of ['Administrator', 'Technician', 'Finance Officer', 'Store Manager', 'Security Officer', '']) {
        const s = (0, greeting_1.starterPrompts)(role);
        strict_1.default.ok(s.length >= 2 && s.length <= 4, role);
        strict_1.default.equal(s[0], "What's waiting for me?");
        strict_1.default.equal(new Set(s).size, s.length);
    }
    strict_1.default.ok((0, greeting_1.starterPrompts)('Finance Officer').includes("Today's takings"));
    strict_1.default.ok((0, greeting_1.starterPrompts)('Store Manager').includes('Which parts are out of stock or below their reorder point?'));
    strict_1.default.ok((0, greeting_1.starterPrompts)('Workshop Supervisor').includes('How do I open a Job Card?'));
    for (const role of ['Administrator', 'Store Manager', 'Technician'])
        strict_1.default.ok(!(0, greeting_1.starterPrompts)(role).some((q) => /oil filter/i.test(q)), role);
});
(0, node_test_1.test)('starter questions follow the page: a Job Card page asks about this Job Card', () => {
    const s = (0, greeting_1.starterPrompts)('Technician', '/workshop/job-cards/abc123');
    strict_1.default.equal(s[0], "What's waiting for me?");
    strict_1.default.equal(s[1], 'Summarise this Job Card and what happens next');
    strict_1.default.ok((0, greeting_1.starterPrompts)('Clerk', '/mail?m=1').includes('Anything important in my email?'));
    strict_1.default.ok((0, greeting_1.starterPrompts)('Administrator', '/dashboard').includes('How is this month going compared with last month?'));
    for (const page of ['/workshop/job-cards/x', '/inventory', '/reminders', '/settings/enyo', '/whatever'])
        strict_1.default.equal(new Set((0, greeting_1.starterPrompts)('Store Manager', page)).size, (0, greeting_1.starterPrompts)('Store Manager', page).length);
});
// ------------------------------------------------------------ static guarantees
const enyoFiles = (0, node_fs_1.readdirSync)((0, node_path_1.join)(ROOT, 'components/enyo')).filter((f) => /\.tsx?$/.test(f)).map((f) => `components/enyo/${f}`);
(0, node_test_1.test)('panel code: no raw HTML, browser-safe engine import only, no secrets', () => {
    strict_1.default.ok(enyoFiles.length >= 8);
    for (const f of enyoFiles) {
        const src = read(f);
        strict_1.default.ok(!/dangerouslySetInnerHTML|innerHTML\s*=/.test(src), `${f} must not inject HTML`);
        strict_1.default.ok(!/from '@ejo\/enyo'/.test(src), `${f} must import only '@ejo/enyo/src/protocol' in the browser`);
        strict_1.default.ok(!/process\.env/.test(src), `${f} must not read server settings`);
        strict_1.default.ok(!/https?:\/\/(?!example)/.test(src.replace(/\/\/.*$/gm, '')), `${f} must not call other sites`);
    }
});
(0, node_test_1.test)('avatar: decorative, and still when motion is reduced', () => {
    const src = read('../../packages/enyo/src/ui/EnyoAvatar.tsx');
    strict_1.default.match(src, /aria-hidden="true"/);
    strict_1.default.match(src, /prefers-reduced-motion: reduce/);
    for (const mood of ['idle', 'wave', 'listening', 'thinking', 'speaking', 'happy'])
        strict_1.default.ok(src.includes(`'${mood}'`), mood);
});
(0, node_test_1.test)('microphone allowed for this site only; camera and location still off', () => {
    const src = read('lib/security-headers.ts');
    strict_1.default.match(src, /'microphone=\(self\)'/);
    strict_1.default.ok(!/'microphone=\(\)'/.test(src));
    for (const off of ['camera=()', 'geolocation=()', 'display-capture=()', 'payment=()'])
        strict_1.default.ok(src.includes(`'${off}'`), off);
    // No new outside origins for Enyo in the content policy.
    strict_1.default.match(src, /"connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co"/);
});
(0, node_test_1.test)('every Refine button points at a field with that id in the same file', () => {
    const files = [
        'app/(app)/workshop/job-cards/[id]/page.tsx', 'app/(app)/workshop/vehicle-service/[id]/page.tsx', 'app/(app)/crm/customers/[id]/page.tsx',
        'app/(app)/security/incidents/new/page.tsx', 'app/(app)/security/incidents/[id]/page.tsx', 'app/(app)/warranty/claims/[id]/page.tsx', 'app/(app)/warranty/[id]/page.tsx',
        'components/BroadcastForm.tsx', 'components/JobCardStatusForm.tsx', 'components/ComplaintListInput.tsx', 'components/ServiceComplaintListInput.tsx',
    ];
    let total = 0;
    for (const f of files) {
        const src = read(f);
        const targets = [...src.matchAll(/<RefineTextButton targetId=(?:"([^"]+)"|\{`([^`]+)`\})/g)].map((m) => m[1] ?? m[2]);
        strict_1.default.ok(targets.length > 0, `${f} has a Refine button`);
        for (const t of targets) {
            const id = t.startsWith('complaint-') || t.startsWith('service-complaint-') ? `id={\`${t}\`}` : `id="${t}"`;
            strict_1.default.ok(src.includes(id), `${f}: no field with ${id}`);
            total += 1;
        }
    }
    strict_1.default.ok(total >= 24);
});
(0, node_test_1.test)('the panel is mounted in the signed-in layout and the settings page is guarded by enyo.manage', () => {
    strict_1.default.match(read('app/(app)/layout.tsx'), /<EnyoPanel[\s\S]*canManage=\{decide\(principal, 'enyo\.manage'\)\.allowed\}/);
    strict_1.default.match(read('app/(app)/settings/enyo/page.tsx'), /guardPage\('enyo\.manage', '\/settings\/enyo'\)/);
    strict_1.default.match(read('app/(app)/profile/enyo/page.tsx'), /currentAssist\(\)/);
});
(0, node_test_1.test)('answers with a table render as a table; a half-streamed table stays text until its separator arrives', () => {
    const md = 'What is on your plate:\n\n| Category | Items |\n|---|---:|\n| Decisions waiting | 0 |\n| Other steps | 2 |\n\nAnything else?';
    const blocks = (0, markdown_1.parseMarkdown)(md);
    strict_1.default.deepEqual(blocks.map((b) => b.type), ['p', 'table', 'p']);
    const t = blocks[1];
    strict_1.default.equal(t.rows.length, 2);
    strict_1.default.deepEqual(t.align, ['left', 'right']);
    strict_1.default.deepEqual((0, markdown_1.parseMarkdown)('| Category | Items |').map((b) => b.type), ['p']);
    strict_1.default.match((0, markdown_1.plainText)(md), /Category: Other steps, Items: 2\./);
});
(0, node_test_1.test)('reading aloud: gentle pieces, no links or symbols, record numbers read short', () => {
    strict_1.default.equal((0, voice_text_1.speakable)('See [JC-2026-000412](/x) — ₦12,500 at https://x.y/z **now**'), 'See [JC 412](/x) — naira 12,500 at now');
    const pieces = (0, voice_text_1.speechChunks)(`${'This is one sentence. '.repeat(30)}`, 100);
    strict_1.default.ok(pieces.length > 3 && pieces.every((p) => p.length <= 100));
    strict_1.default.deepEqual((0, voice_text_1.speechChunks)(''), []);
});
(0, node_test_1.test)('the table reader is the same in the portal and the website', () => {
    const a = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib/enyo/markdown-table.ts'), 'utf8');
    const b = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, '..', 'website', 'lib/enyo/markdown-table.ts'), 'utf8');
    strict_1.default.equal(a, b);
});
