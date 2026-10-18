"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Reminders — the pure rules (lib/reminders-rules.ts): Lagos times, the
 * form's checks, the pre-fill Enyo opens, who may set a reminder for whom,
 * snoozing and where a reminder is listed. No database.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const reminders_rules_1 = require("../lib/reminders-rules");
const NOW = new Date('2026-10-14T17:00:00Z'); // 6 pm Lagos
(0, node_test_1.test)('Lagos wall-clock times (UTC+1, no daylight saving)', () => {
    strict_1.default.equal((0, reminders_rules_1.parseLagosLocal)('2026-10-15T09:30')?.toISOString(), '2026-10-15T08:30:00.000Z');
    strict_1.default.equal((0, reminders_rules_1.parseLagosLocal)('2026-10-15T09:30:00+01:00')?.toISOString(), '2026-10-15T08:30:00.000Z', 'ISO with the offset (Enyo)');
    strict_1.default.equal((0, reminders_rules_1.parseLagosLocal)('2026-10-15T08:30:00Z')?.toISOString(), '2026-10-15T08:30:00.000Z');
    strict_1.default.equal((0, reminders_rules_1.lagosLocalInput)(new Date('2026-10-15T08:30:00Z')), '2026-10-15T09:30');
    strict_1.default.equal((0, reminders_rules_1.lagosLocalInput)(new Date('2026-12-31T23:30:00Z')), '2027-01-01T00:30', 'crosses midnight into the new year');
    for (const bad of ['2026-02-31T09:00', '2026-13-01T09:00', '2026-10-15T24:00', '15/10/2026 09:30', 'tomorrow', '', '2026-10-15', '2026-10-15T09:30:00']) {
        strict_1.default.equal((0, reminders_rules_1.parseLagosLocal)(bad), null, bad);
    }
    strict_1.default.equal((0, reminders_rules_1.parseLagosLocal)(42), null);
});
(0, node_test_1.test)('the form: title, notes, a future time within two years', () => {
    const ok = (0, reminders_rules_1.validateReminder)({ title: '  Call   Mr Okafor\n', notes: 'Line 1\r\nLine 2', dueAt: '2026-10-15T09:00', viaEmail: 'on' }, NOW);
    strict_1.default.ok(ok.ok);
    if (ok.ok) {
        strict_1.default.equal(ok.value.title, 'Call Mr Okafor');
        strict_1.default.equal(ok.value.notes, 'Line 1\nLine 2');
        strict_1.default.equal(ok.value.viaEmail, true);
    }
    strict_1.default.deepEqual((0, reminders_rules_1.validateReminder)({ title: '', dueAt: '2026-10-15T09:00' }, NOW), { ok: false, message: 'Give the reminder a title.' });
    strict_1.default.equal((0, reminders_rules_1.validateReminder)({ title: 'x'.repeat(161), dueAt: '2026-10-15T09:00' }, NOW).message, 'Keep the title under 160 characters.');
    strict_1.default.equal((0, reminders_rules_1.validateReminder)({ title: 'x', dueAt: '2026-10-14T17:00' }, NOW).message, 'Choose a time in the future.');
    strict_1.default.equal((0, reminders_rules_1.validateReminder)({ title: 'x', dueAt: 'soon' }, NOW).message, 'Choose the date and time for the reminder.');
    strict_1.default.equal((0, reminders_rules_1.validateReminder)({ title: 'x', dueAt: '2029-01-01T09:00' }, NOW).message, 'Choose a time within the next two years.');
    strict_1.default.ok((0, reminders_rules_1.validateReminder)({ title: 'x', dueAt: '2026-10-14T17:59:30' + '' }, NOW).ok === false, 'seconds without a zone are not accepted');
    strict_1.default.equal((0, reminders_rules_1.validateReminder)({ title: 'x', dueAt: '2026-10-14T18:01' }, NOW).ok, true, 'a minute ahead is fine');
    strict_1.default.equal((0, reminders_rules_1.validateReminder)({ title: 'x', dueAt: '2026-10-15T09:00' }, NOW).value.viaEmail, false, 'email only when ticked');
});
(0, node_test_1.test)('pre-fill: every value checked and clipped, invalid ones dropped, never an error', () => {
    const p = (0, reminders_rules_1.parseReminderPrefill)({
        title: `Call back\u0000${'x'.repeat(300)}`, notes: 'n', dueAt: '2026-10-15T10:00:00+01:00', recordType: 'JobCard', recordId: 'ckabc12345678', for: 'user_123456789',
    }, NOW);
    strict_1.default.equal(p.title?.length, 160);
    strict_1.default.ok(!p.title?.includes('\u0000'));
    strict_1.default.equal(p.dueAt, '2026-10-15T10:00');
    strict_1.default.deepEqual([p.recordType, p.recordId, p.forUserId], ['JobCard', 'ckabc12345678', 'user_123456789']);
    strict_1.default.deepEqual((0, reminders_rules_1.parseReminderPrefill)({ dueAt: '2020-01-01T09:00' }, NOW), {}, 'a past time is dropped');
    strict_1.default.deepEqual((0, reminders_rules_1.parseReminderPrefill)({ recordType: 'User', recordId: 'ckabc12345678' }, NOW), {}, 'only record types with a page');
    strict_1.default.deepEqual((0, reminders_rules_1.parseReminderPrefill)({ recordType: 'JobCard', recordId: '../../x' }, NOW), {}, 'ids are ids');
    strict_1.default.deepEqual((0, reminders_rules_1.parseReminderPrefill)({ for: '<script>' }, NOW), {});
    strict_1.default.deepEqual((0, reminders_rules_1.parseReminderPrefill)({ title: ['a', 'b'] }, NOW), { title: 'a' }, 'repeated parameter: the first');
    const href = (0, reminders_rules_1.reminderPrefillHref)({ title: 'Call & check', dueAt: '2026-10-15T10:00', recordType: 'JobCard', recordId: 'ckabc12345678' });
    strict_1.default.equal(href, '/reminders/new?title=Call+%26+check&dueAt=2026-10-15T10%3A00&recordType=JobCard&recordId=ckabc12345678');
    strict_1.default.deepEqual((0, reminders_rules_1.parseReminderPrefill)(Object.fromEntries(new URL(`http://x${href}`).searchParams), NOW), { title: 'Call & check', dueAt: '2026-10-15T10:00', recordType: 'JobCard', recordId: 'ckabc12345678' }, 'round trip');
});
(0, node_test_1.test)('who may set a reminder for whom', () => {
    strict_1.default.equal((0, reminders_rules_1.mayCreateFor)('me', 'me', []), true, 'always for yourself');
    strict_1.default.equal((0, reminders_rules_1.mayCreateFor)('pa', 'boss', ['boss']), true, 'a delegate the owner allowed');
    strict_1.default.equal((0, reminders_rules_1.mayCreateFor)('pa', 'boss', []), false, 'not without the grant');
    strict_1.default.equal((0, reminders_rules_1.mayCreateFor)('pa', 'boss', ['someone-else']), false);
    strict_1.default.equal((0, reminders_rules_1.mayCreateFor)('', 'boss', ['boss']), false);
    strict_1.default.equal((0, reminders_rules_1.mayManage)('boss', { ownerId: 'boss' }), true);
    strict_1.default.equal((0, reminders_rules_1.mayManage)('pa', { ownerId: 'boss' }), false, 'the delegate who set it cannot change or close it');
    const colleague = { id: 'c', isActive: true, organisationId: 'org-1' };
    strict_1.default.equal((0, reminders_rules_1.delegateRefusal)('me', colleague, 'org-1'), null);
    strict_1.default.match((0, reminders_rules_1.delegateRefusal)('me', { ...colleague, organisationId: 'org-2' }, 'org-1'), /your organisation/);
    strict_1.default.match((0, reminders_rules_1.delegateRefusal)('me', { ...colleague, isActive: false }, 'org-1'), /switched off/);
    strict_1.default.match((0, reminders_rules_1.delegateRefusal)('c', colleague, 'org-1'), /yourself/);
    strict_1.default.match((0, reminders_rules_1.delegateRefusal)('me', null, 'org-1'), /colleague/);
    strict_1.default.match((0, reminders_rules_1.delegateRefusal)('me', colleague, null), /your organisation/);
});
(0, node_test_1.test)('snooze: an hour, or 9 am Lagos tomorrow', () => {
    strict_1.default.equal((0, reminders_rules_1.snoozeUntil)('1h', NOW).toISOString(), '2026-10-14T18:00:00.000Z');
    strict_1.default.equal((0, reminders_rules_1.snoozeUntil)('tomorrow', NOW).toISOString(), '2026-10-15T08:00:00.000Z');
    // 00:30 Lagos is already "today" in Lagos (still yesterday in UTC).
    strict_1.default.equal((0, reminders_rules_1.snoozeUntil)('tomorrow', new Date('2026-10-14T23:30:00Z')).toISOString(), '2026-10-16T08:00:00.000Z');
});
(0, node_test_1.test)('where a reminder is listed, and relative times', () => {
    strict_1.default.equal((0, reminders_rules_1.reminderBucket)({ status: 'PENDING', dueAt: new Date('2026-10-15T00:00:00Z') }, NOW), 'upcoming');
    strict_1.default.equal((0, reminders_rules_1.reminderBucket)({ status: 'PENDING', dueAt: new Date('2026-10-14T16:00:00Z') }, NOW), 'overdue');
    strict_1.default.equal((0, reminders_rules_1.reminderBucket)({ status: 'SENT', dueAt: new Date('2026-10-14T16:00:00Z') }, NOW), 'overdue');
    strict_1.default.equal((0, reminders_rules_1.reminderBucket)({ status: 'DONE', dueAt: new Date('2026-10-14T16:00:00Z') }, NOW), 'done');
    strict_1.default.equal((0, reminders_rules_1.reminderBucket)({ status: 'CANCELLED', dueAt: new Date('2026-10-20T16:00:00Z') }, NOW), 'done');
    strict_1.default.equal((0, reminders_rules_1.relativeTime)(new Date(NOW.getTime() + 2 * 3600_000), NOW), 'in 2 hours');
    strict_1.default.equal((0, reminders_rules_1.relativeTime)(new Date(NOW.getTime() - 60_000), NOW), '1 minute ago');
    strict_1.default.equal((0, reminders_rules_1.relativeTime)(new Date(NOW.getTime() + 3 * 86_400_000), NOW), 'in 3 days');
    strict_1.default.equal((0, reminders_rules_1.relativeTime)(NOW, NOW), 'now');
});
(0, node_test_1.test)('the server actions apply the rules (source check)', () => {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', 'lib', 'actions', 'reminders.ts'), 'utf8');
    const body = (fn) => { const i = src.indexOf(`export async function ${fn}(`); return src.slice(i, src.indexOf('\nexport ', i + 10)); };
    strict_1.default.match(body('createReminder'), /mayCreateFor\(m\.id, ownerId, granted/);
    strict_1.default.match(body('createReminder'), /recordVisibleToMe|linkFor\(/, 'a linked record must be one the setter may open');
    for (const fn of ['updateReminder', 'completeReminder', 'cancelReminder', 'snoozeReminder'])
        strict_1.default.match(body(fn), /ownReminder\(m, id\)/, `${fn}: the owner's own reminder`);
    strict_1.default.match(src, /async function ownReminder[\s\S]{0,300}organisationId: m\.organisationId, ownerId: m\.id/);
    for (const fn of ['grantReminderDelegate', 'withdrawReminderDelegate'])
        strict_1.default.match(body(fn), /refuseDuringAssist\(/, `${fn}: not during an assisted session`);
    for (const [fn, action] of [['createReminder', 'reminder.created'], ['cancelReminder', 'reminder.cancelled'], ['completeReminder', 'reminder.done'], ['grantReminderDelegate', 'reminder.delegate_granted'], ['withdrawReminderDelegate', 'reminder.delegate_withdrawn']]) {
        strict_1.default.match(body(fn), new RegExp(`writeAuditLog\\([^)]*'${action.replace('.', '\\.')}'`), `${fn} is audited`);
    }
    const delivery = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', 'lib', 'reminders.ts'), 'utf8');
    strict_1.default.match(delivery, /updateMany\(\{ where: \{ id: r\.id, status: 'PENDING'[\s\S]{0,60}data: \{ status: 'SENT'/, 'claimed atomically before anything is sent');
});
