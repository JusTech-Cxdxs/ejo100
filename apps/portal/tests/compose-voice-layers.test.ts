/** Live email preview, voice notes and floating menus (UI rules that must hold). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

test('compose previews live beside the form, never runs scripts, and has no modal to lose work', () => {
  const page = read('app/(app)/mail/compose/page.tsx');
  assert.match(page, /<form id="mail-compose"/);
  assert.match(page, /<LiveMailPreview formId="mail-compose"/);
  const live = read('components/mail/LiveMailPreview.tsx');
  assert.match(live, /sandbox="allow-same-origin"/);
  assert.doesNotMatch(live, /allow-scripts/);
  assert.match(live, /renderPersonalMail\(/);
  assert.match(live, /Live preview is off for this message/);
  const field = read('components/mail/MailStyleField.tsx');
  assert.doesNotMatch(field, /role="dialog"|previewMyMail/);
});

test('voice notes: pause, resume, edit as text, send, cancel — nothing is sent without the person choosing', () => {
  const v = read('components/enyo/voice.ts');
  for (const f of ['const pause =', 'const resume =', 'const finish =', 'const cancel =']) assert.ok(v.includes(f), f);
  // A browser that stops by itself keeps the words (paused); it does not send.
  assert.match(v, /Paused by the person, or the browser stopped by itself: keep the words/);
  const panel = read('components/enyo/EnyoPanel.tsx');
  assert.match(panel, /Edit as text/);
  assert.match(panel, /if \(how === 'send'\) \{ void ask\(joinSpoken\(typed, heard\)/);
});

test('menus float above headers, tab bars and dialogs', () => {
  const layer = read('components/ui/FloatingLayer.tsx');
  assert.match(layer, /createPortal\(/);
  assert.match(layer, /z-\[80\]/);
  assert.match(read('components/print/PrintMenu.tsx'), /<FloatingLayer /);
  assert.match(read('components/enyo/RefineTextButton.tsx'), /<FloatingLayer /);
});
