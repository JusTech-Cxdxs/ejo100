/**
 * Reminders — the pure rules (lib/reminders-rules.ts): Lagos times, the
 * form's checks, the pre-fill Enyo opens, who may set a reminder for whom,
 * snoozing and where a reminder is listed. No database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  delegateRefusal, lagosLocalInput, mayCreateFor, mayManage, parseLagosLocal, parseReminderPrefill, reminderBucket, reminderPrefillHref,
  relativeTime, snoozeUntil, validateReminder,
} from '../lib/reminders-rules';

const NOW = new Date('2026-10-14T17:00:00Z'); // 6 pm Lagos

test('Lagos wall-clock times (UTC+1, no daylight saving)', () => {
  assert.equal(parseLagosLocal('2026-10-15T09:30')?.toISOString(), '2026-10-15T08:30:00.000Z');
  assert.equal(parseLagosLocal('2026-10-15T09:30:00+01:00')?.toISOString(), '2026-10-15T08:30:00.000Z', 'ISO with the offset (Enyo)');
  assert.equal(parseLagosLocal('2026-10-15T08:30:00Z')?.toISOString(), '2026-10-15T08:30:00.000Z');
  assert.equal(lagosLocalInput(new Date('2026-10-15T08:30:00Z')), '2026-10-15T09:30');
  assert.equal(lagosLocalInput(new Date('2026-12-31T23:30:00Z')), '2027-01-01T00:30', 'crosses midnight into the new year');
  for (const bad of ['2026-02-31T09:00', '2026-13-01T09:00', '2026-10-15T24:00', '15/10/2026 09:30', 'tomorrow', '', '2026-10-15', '2026-10-15T09:30:00']) {
    assert.equal(parseLagosLocal(bad), null, bad);
  }
  assert.equal(parseLagosLocal(42), null);
});

test('the form: title, notes, a future time within two years', () => {
  const ok = validateReminder({ title: '  Call   Mr Okafor\n', notes: 'Line 1\r\nLine 2', dueAt: '2026-10-15T09:00', viaEmail: 'on' }, NOW);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.title, 'Call Mr Okafor');
    assert.equal(ok.value.notes, 'Line 1\nLine 2');
    assert.equal(ok.value.viaEmail, true);
  }
  assert.deepEqual(validateReminder({ title: '', dueAt: '2026-10-15T09:00' }, NOW), { ok: false, message: 'Give the reminder a title.' });
  assert.equal((validateReminder({ title: 'x'.repeat(161), dueAt: '2026-10-15T09:00' }, NOW) as { message: string }).message, 'Keep the title under 160 characters.');
  assert.equal((validateReminder({ title: 'x', dueAt: '2026-10-14T17:00' }, NOW) as { message: string }).message, 'Choose a time in the future.');
  assert.equal((validateReminder({ title: 'x', dueAt: 'soon' }, NOW) as { message: string }).message, 'Choose the date and time for the reminder.');
  assert.equal((validateReminder({ title: 'x', dueAt: '2029-01-01T09:00' }, NOW) as { message: string }).message, 'Choose a time within the next two years.');
  assert.ok(validateReminder({ title: 'x', dueAt: '2026-10-14T17:59:30' + '' }, NOW).ok === false, 'seconds without a zone are not accepted');
  assert.equal(validateReminder({ title: 'x', dueAt: '2026-10-14T18:01' }, NOW).ok, true, 'a minute ahead is fine');
  assert.equal((validateReminder({ title: 'x', dueAt: '2026-10-15T09:00' }, NOW) as { value: { viaEmail: boolean } }).value.viaEmail, false, 'email only when ticked');
});

test('pre-fill: every value checked and clipped, invalid ones dropped, never an error', () => {
  const p = parseReminderPrefill({
    title: `Call back\u0000${'x'.repeat(300)}`, notes: 'n', dueAt: '2026-10-15T10:00:00+01:00', recordType: 'JobCard', recordId: 'ckabc12345678', for: 'user_123456789',
  }, NOW);
  assert.equal(p.title?.length, 160);
  assert.ok(!p.title?.includes('\u0000'));
  assert.equal(p.dueAt, '2026-10-15T10:00');
  assert.deepEqual([p.recordType, p.recordId, p.forUserId], ['JobCard', 'ckabc12345678', 'user_123456789']);
  assert.deepEqual(parseReminderPrefill({ dueAt: '2020-01-01T09:00' }, NOW), {}, 'a past time is dropped');
  assert.deepEqual(parseReminderPrefill({ recordType: 'User', recordId: 'ckabc12345678' }, NOW), {}, 'only record types with a page');
  assert.deepEqual(parseReminderPrefill({ recordType: 'JobCard', recordId: '../../x' }, NOW), {}, 'ids are ids');
  assert.deepEqual(parseReminderPrefill({ for: '<script>' }, NOW), {});
  assert.deepEqual(parseReminderPrefill({ title: ['a', 'b'] }, NOW), { title: 'a' }, 'repeated parameter: the first');
  const href = reminderPrefillHref({ title: 'Call & check', dueAt: '2026-10-15T10:00', recordType: 'JobCard', recordId: 'ckabc12345678' });
  assert.equal(href, '/reminders/new?title=Call+%26+check&dueAt=2026-10-15T10%3A00&recordType=JobCard&recordId=ckabc12345678');
  assert.deepEqual(parseReminderPrefill(Object.fromEntries(new URL(`http://x${href}`).searchParams), NOW), { title: 'Call & check', dueAt: '2026-10-15T10:00', recordType: 'JobCard', recordId: 'ckabc12345678' }, 'round trip');
});

test('who may set a reminder for whom', () => {
  assert.equal(mayCreateFor('me', 'me', []), true, 'always for yourself');
  assert.equal(mayCreateFor('pa', 'boss', ['boss']), true, 'a delegate the owner allowed');
  assert.equal(mayCreateFor('pa', 'boss', []), false, 'not without the grant');
  assert.equal(mayCreateFor('pa', 'boss', ['someone-else']), false);
  assert.equal(mayCreateFor('', 'boss', ['boss']), false);
  assert.equal(mayManage('boss', { ownerId: 'boss' }), true);
  assert.equal(mayManage('pa', { ownerId: 'boss' }), false, 'the delegate who set it cannot change or close it');
  const colleague = { id: 'c', isActive: true, organisationId: 'org-1' };
  assert.equal(delegateRefusal('me', colleague, 'org-1'), null);
  assert.match(delegateRefusal('me', { ...colleague, organisationId: 'org-2' }, 'org-1')!, /your organisation/);
  assert.match(delegateRefusal('me', { ...colleague, isActive: false }, 'org-1')!, /switched off/);
  assert.match(delegateRefusal('c', colleague, 'org-1')!, /yourself/);
  assert.match(delegateRefusal('me', null, 'org-1')!, /colleague/);
  assert.match(delegateRefusal('me', colleague, null)!, /your organisation/);
});

test('snooze: an hour, or 9 am Lagos tomorrow', () => {
  assert.equal(snoozeUntil('1h', NOW).toISOString(), '2026-10-14T18:00:00.000Z');
  assert.equal(snoozeUntil('tomorrow', NOW).toISOString(), '2026-10-15T08:00:00.000Z');
  // 00:30 Lagos is already "today" in Lagos (still yesterday in UTC).
  assert.equal(snoozeUntil('tomorrow', new Date('2026-10-14T23:30:00Z')).toISOString(), '2026-10-16T08:00:00.000Z');
});

test('where a reminder is listed, and relative times', () => {
  assert.equal(reminderBucket({ status: 'PENDING', dueAt: new Date('2026-10-15T00:00:00Z') }, NOW), 'upcoming');
  assert.equal(reminderBucket({ status: 'PENDING', dueAt: new Date('2026-10-14T16:00:00Z') }, NOW), 'overdue');
  assert.equal(reminderBucket({ status: 'SENT', dueAt: new Date('2026-10-14T16:00:00Z') }, NOW), 'overdue');
  assert.equal(reminderBucket({ status: 'DONE', dueAt: new Date('2026-10-14T16:00:00Z') }, NOW), 'done');
  assert.equal(reminderBucket({ status: 'CANCELLED', dueAt: new Date('2026-10-20T16:00:00Z') }, NOW), 'done');
  assert.equal(relativeTime(new Date(NOW.getTime() + 2 * 3600_000), NOW), 'in 2 hours');
  assert.equal(relativeTime(new Date(NOW.getTime() - 60_000), NOW), '1 minute ago');
  assert.equal(relativeTime(new Date(NOW.getTime() + 3 * 86_400_000), NOW), 'in 3 days');
  assert.equal(relativeTime(NOW, NOW), 'now');
});

test('the server actions apply the rules (source check)', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'lib', 'actions', 'reminders.ts'), 'utf8');
  const body = (fn: string) => { const i = src.indexOf(`export async function ${fn}(`); return src.slice(i, src.indexOf('\nexport ', i + 10)); };
  assert.match(body('createReminder'), /mayCreateFor\(m\.id, ownerId, granted/);
  assert.match(body('createReminder'), /recordVisibleToMe|linkFor\(/, 'a linked record must be one the setter may open');
  for (const fn of ['updateReminder', 'completeReminder', 'cancelReminder', 'snoozeReminder']) assert.match(body(fn), /ownReminder\(m, id\)/, `${fn}: the owner's own reminder`);
  assert.match(src, /async function ownReminder[\s\S]{0,300}organisationId: m\.organisationId, ownerId: m\.id/);
  for (const fn of ['grantReminderDelegate', 'withdrawReminderDelegate']) assert.match(body(fn), /refuseDuringAssist\(/, `${fn}: not during an assisted session`);
  for (const [fn, action] of [['createReminder', 'reminder.created'], ['cancelReminder', 'reminder.cancelled'], ['completeReminder', 'reminder.done'], ['grantReminderDelegate', 'reminder.delegate_granted'], ['withdrawReminderDelegate', 'reminder.delegate_withdrawn']]) {
    assert.match(body(fn!), new RegExp(`writeAuditLog\\([^)]*'${action!.replace('.', '\\.')}'`), `${fn} is audited`);
  }
  const delivery = readFileSync(join(__dirname, '..', '..', 'lib', 'reminders.ts'), 'utf8');
  assert.match(delivery, /updateMany\(\{ where: \{ id: r\.id, status: 'PENDING'[\s\S]{0,60}data: \{ status: 'SENT'/, 'claimed atomically before anything is sent');
});
