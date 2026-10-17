import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { intlDigits } from '../lib/support/core';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('phone numbers become international for Call and WhatsApp', () => {
  assert.equal(intlDigits('0803 123 4567'), '2348031234567');
  assert.equal(intlDigits('+234 803 123 4567'), '2348031234567');
  assert.equal(intlDigits('00447700900123'), '447700900123');
  assert.equal(intlDigits('12345'), null);
  assert.equal(intlDigits(null), null);
});

test('colleagues are emailed: new owner, nobody free (leads), late (owner and leads)', () => {
  const n = read('lib/support/notify.ts');
  for (const f of ['export async function emailAssignee', 'export async function alertNobodyFree', 'export async function emailLate', 'export async function announceRouted']) assert.ok(n.includes(f), f);
  assert.match(n, /isLead: true/);
  assert.match(n, /nobody_free_alerted/, 'told once per request');
  assert.match(read('lib/support/intake.ts'), /await announceRouted\(created\.id\)/);
  assert.match(read('lib/support/automations.ts'), /if \(done\.count\) await announceRouted\(t\.id\)/);
  assert.match(read('lib/support/automations.ts'), /await emailLate\(t\.id\)/);
  assert.match(read('lib/actions/support.ts'), /if \(target && target !== me\.id\) announceLater\(t\.id, me\.id\)/);
  assert.match(read('lib/actions/help.ts'), /announceLater\(created\.id\)/);
});

test('settings are read first and edited on purpose', () => {
  for (const page of ['hours/page.tsx', 'enyo/page.tsx', 'follow-ups/page.tsx', 'teams/[id]/page.tsx', 'teams/page.tsx']) {
    const src = read(`app/(app)/settings/support/${page}`);
    assert.match(src, /<EditableSection /, page);
  }
  assert.match(read('lib/actions/support-form-handlers.ts'), /&edit=\$\{edit\}/, 'a failed save comes back open');
  assert.match(read('components/enyo/EnyoSettingsForm.tsx'), /Edit settings/);
  assert.match(read('app/(app)/organisation/people/page.tsx'), /\+ Add a person/);
});

test('each team has its own automatic reply text, plain words only', () => {
  const admin = read('lib/actions/support-admin.ts');
  assert.match(admin, /function cleanAck/);
  assert.match(admin, /no links or HTML/);
  assert.match(read('lib/support/intake.ts'), /teamMessage: own\?\.ackMessage \?\? null/);
});
