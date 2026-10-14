/**
 * Enyo panel (staff portal): the safe Markdown reader, the greeting, starter
 * questions, and static guarantees about the panel's code (no raw HTML, only
 * the browser-safe engine import, microphone for this site only, Refine
 * buttons pointing at real fields).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseInline, parseMarkdown, plainText, safeHref, type Inline } from '../lib/enyo/markdown';
import { firstName, greetingText, lagosDay, lagosHour, starterPrompts } from '../lib/enyo/greeting';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const links = (nodes: Inline[]): string[] => nodes.flatMap((n) => (n.t === 'a' ? [n.href, ...links(n.c)] : n.t === 'b' || n.t === 'i' ? links(n.c) : []));
const text = (nodes: Inline[]): string => nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : text(n.c))).join('');

// ------------------------------------------------------------ links

test('links: portal paths and https only', () => {
  assert.deepEqual(safeHref('/approvals'), { href: '/approvals', internal: true });
  assert.deepEqual(safeHref('/workshop/job-cards?prefill=1&complaint=Brakes'), { href: '/workshop/job-cards?prefill=1&complaint=Brakes', internal: true });
  assert.equal(safeHref('https://example.com/a')?.internal, false);
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', ' javascript:x', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.example/x', '/\\evil.example', 'http://example.com', 'https://user:pw@example.com', 'mailto:a@b.c', '', 'approvals']) {
    assert.equal(safeHref(bad), null, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('markdown: a refused link keeps its words as plain text', () => {
  const out = parseInline('Click [here](javascript:alert(1)) now');
  assert.deepEqual(links(out), []);
  assert.equal(text(out), 'Click here now');
  assert.deepEqual(links(parseInline('[Approvals](/approvals) and [docs](https://example.com/x)')), ['/approvals', 'https://example.com/x']);
  assert.deepEqual(links(parseInline('[part](/inventory/parts?q=filter(oil))')), ['/inventory/parts?q=filter(oil)']);
});

test('markdown: HTML is only ever text', () => {
  const blocks = parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.type, 'p');
  assert.equal(text((blocks[0] as { c: Inline[] }).c), '<script>alert(1)</script> <img src=x onerror=alert(1)>');
});

test('markdown: bold, italics, code, lists, headings', () => {
  const b = parseMarkdown('You have **3 approvals** waiting:\n\n- Estimate *JC-1*\n- Parts `PR-2`\n\n1. First\n2. Second\n\n## Next');
  assert.deepEqual(b.map((x) => x.type), ['p', 'ul', 'ol', 'h']);
  const p = b[0] as { c: Inline[] };
  assert.equal(p.c[1]!.t, 'b');
  const ul = b[1] as { items: Inline[][] };
  assert.equal(ul.items.length, 2);
  assert.equal(ul.items[0]![1]!.t, 'i');
  assert.equal(ul.items[1]![1]!.t, 'code');
});

test('markdown: snake_case and lone marks stay as typed; half-streamed text is safe', () => {
  assert.equal(text(parseInline('use part_lookup_tool now')), 'use part_lookup_tool now');
  assert.ok(parseInline('use part_lookup_tool now').every((n) => n.t === 'text'));
  assert.equal(text(parseInline('2 * 3 = 6')), '2 * 3 = 6');
  // Streaming: an unfinished bold or link must not throw or swallow text.
  assert.equal(text(parseInline('Total: **₦18')), 'Total: **₦18');
  assert.equal(text(parseInline('Open [the page](/appro')), 'Open [the page](/appro');
  assert.doesNotThrow(() => parseMarkdown('*'.repeat(5000)));
});

test('plainText drops the marks (for copying and reading aloud)', () => {
  assert.equal(plainText('You have **3** waiting:\n\n- [Approvals](/approvals)'), 'You have 3 waiting:\n\nApprovals');
});

// ------------------------------------------------------------ greeting

test('greeting: time of day in Lagos, correct plurals', () => {
  assert.equal(greetingText({ name: 'Ada', hour: 8, approvals: 3 }), 'Good morning, Ada. 3 approvals are waiting.');
  assert.equal(greetingText({ name: 'Ada', hour: 13, approvals: 1 }), 'Good afternoon, Ada. 1 approval is waiting.');
  assert.equal(greetingText({ name: 'Ada', hour: 19, approvals: 0 }), 'Good evening, Ada. Nothing is waiting for your approval.');
  assert.equal(greetingText({ name: '', hour: 9, approvals: null }), 'Good morning. Ask me anything about your work.');
  // 23:30 UTC is 00:30 the next day in Lagos.
  assert.equal(lagosHour(new Date('2026-10-14T23:30:00Z')), 0);
  assert.equal(lagosDay(new Date('2026-10-14T23:30:00Z')), '2026-10-15');
  assert.equal(firstName('  Ada   Okafor '), 'Ada');
});

test('starter questions suit the role, at most four, always "What\'s waiting for me?"', () => {
  for (const role of ['Administrator', 'Technician', 'Finance Officer', 'Store Manager', 'Security Officer', '']) {
    const s = starterPrompts(role);
    assert.ok(s.length >= 2 && s.length <= 4, role);
    assert.equal(s[0], "What's waiting for me?");
    assert.equal(new Set(s).size, s.length);
  }
  assert.ok(starterPrompts('Finance Officer').includes("Today's takings"));
  assert.ok(starterPrompts('Store Manager').includes('Price of an oil filter'));
  assert.ok(starterPrompts('Workshop Supervisor').includes('How do I open a Job Card?'));
});

// ------------------------------------------------------------ static guarantees

const enyoFiles = readdirSync(join(ROOT, 'components/enyo')).filter((f) => /\.tsx?$/.test(f)).map((f) => `components/enyo/${f}`);

test('panel code: no raw HTML, browser-safe engine import only, no secrets', () => {
  assert.ok(enyoFiles.length >= 8);
  for (const f of enyoFiles) {
    const src = read(f);
    assert.ok(!/dangerouslySetInnerHTML|innerHTML\s*=/.test(src), `${f} must not inject HTML`);
    assert.ok(!/from '@ejo\/enyo'/.test(src), `${f} must import only '@ejo/enyo/src/protocol' in the browser`);
    assert.ok(!/process\.env/.test(src), `${f} must not read server settings`);
    assert.ok(!/https?:\/\/(?!example)/.test(src.replace(/\/\/.*$/gm, '')), `${f} must not call other sites`);
  }
});

test('avatar: decorative, and still when motion is reduced', () => {
  const src = read('../../packages/enyo/src/ui/EnyoAvatar.tsx');
  assert.match(src, /aria-hidden="true"/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  for (const mood of ['idle', 'wave', 'listening', 'thinking', 'speaking', 'happy']) assert.ok(src.includes(`'${mood}'`), mood);
});

test('microphone allowed for this site only; camera and location still off', () => {
  const src = read('lib/security-headers.ts');
  assert.match(src, /'microphone=\(self\)'/);
  assert.ok(!/'microphone=\(\)'/.test(src));
  for (const off of ['camera=()', 'geolocation=()', 'display-capture=()', 'payment=()']) assert.ok(src.includes(`'${off}'`), off);
  // No new outside origins for Enyo in the content policy.
  assert.match(src, /"connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co"/);
});

test('every Refine button points at a field with that id in the same file', () => {
  const files = [
    'app/(app)/workshop/job-cards/[id]/page.tsx', 'app/(app)/workshop/vehicle-service/[id]/page.tsx', 'app/(app)/crm/customers/[id]/page.tsx',
    'app/(app)/security/incidents/new/page.tsx', 'app/(app)/security/incidents/[id]/page.tsx', 'app/(app)/warranty/claims/[id]/page.tsx', 'app/(app)/warranty/[id]/page.tsx',
    'components/BroadcastForm.tsx', 'components/JobCardStatusForm.tsx', 'components/ComplaintListInput.tsx', 'components/ServiceComplaintListInput.tsx',
  ];
  let total = 0;
  for (const f of files) {
    const src = read(f);
    const targets = [...src.matchAll(/<RefineTextButton targetId=(?:"([^"]+)"|\{`([^`]+)`\})/g)].map((m) => m[1] ?? m[2]!);
    assert.ok(targets.length > 0, `${f} has a Refine button`);
    for (const t of targets) {
      const id = t.startsWith('complaint-') || t.startsWith('service-complaint-') ? `id={\`${t}\`}` : `id="${t}"`;
      assert.ok(src.includes(id), `${f}: no field with ${id}`);
      total += 1;
    }
  }
  assert.ok(total >= 24);
});

test('the panel is mounted in the signed-in layout and the settings page is guarded by enyo.manage', () => {
  assert.match(read('app/(app)/layout.tsx'), /<EnyoPanel[\s\S]*canManage=\{decide\(principal, 'enyo\.manage'\)\.allowed\}/);
  assert.match(read('app/(app)/settings/enyo/page.tsx'), /guardPage\('enyo\.manage', '\/settings\/enyo'\)/);
  assert.match(read('app/(app)/profile/enyo/page.tsx'), /currentAssist\(\)/);
});
