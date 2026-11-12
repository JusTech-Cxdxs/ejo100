/**
 * A4c3 — scheduled exports: the days (whole days in Lagos; weekly, monthly
 * 1–28, daily), the words, and the wiring: a schedule keeps filters, never
 * data; the morning job claims each schedule before making its export (never
 * two), checks its owner may still export the list (or pauses it, saying
 * why), and tells them — nothing attached; a schedule is its owner's alone;
 * ended schedules are kept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cadenceWords, checkWhen, MAX_SCHEDULES, nextRunAfter } from '../lib/exports/schedule';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('how often: daily, a weekday 1–7, a day of the month 1–28', () => {
  assert.deepEqual(checkWhen('DAILY', 3, 9), { ok: true, cadence: 'DAILY', dayOfWeek: null, dayOfMonth: null });
  assert.deepEqual(checkWhen('WEEKLY', 5, undefined), { ok: true, cadence: 'WEEKLY', dayOfWeek: 5, dayOfMonth: null });
  assert.deepEqual(checkWhen('MONTHLY', undefined, 28), { ok: true, cadence: 'MONTHLY', dayOfWeek: null, dayOfMonth: 28 });
  for (const bad of [['HOURLY', 1, 1], ['WEEKLY', 0, 1], ['WEEKLY', 8, 1], ['WEEKLY', 1.5, 1], ['MONTHLY', 1, 29], ['MONTHLY', 1, 0], ['MONTHLY', 1, undefined]] as const) assert.equal(checkWhen(bad[0], bad[1], bad[2]).ok, false, bad.join(' '));
  assert.equal(MAX_SCHEDULES, 10);
});

test('the words', () => {
  assert.equal(cadenceWords({ cadence: 'DAILY', dayOfWeek: null, dayOfMonth: null }), 'Every day');
  assert.equal(cadenceWords({ cadence: 'WEEKLY', dayOfWeek: 1, dayOfMonth: null }), 'Every Monday');
  assert.equal(cadenceWords({ cadence: 'WEEKLY', dayOfWeek: 7, dayOfMonth: null }), 'Every Sunday');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map((d) => cadenceWords({ cadence: 'MONTHLY', dayOfWeek: null, dayOfMonth: d }).split(' ')[2]), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '28th']);
});

test('the next day due: always after today, never a backlog', () => {
  const daily = { cadence: 'DAILY', dayOfWeek: null, dayOfMonth: null };
  assert.equal(nextRunAfter(daily, '2026-11-12'), '2026-11-13');
  assert.equal(nextRunAfter(daily, '2026-12-31'), '2027-01-01');
  assert.equal(nextRunAfter(daily, '2028-02-28'), '2028-02-29', 'a leap year');
  // 2026-11-12 is a Thursday (4).
  const weekly = (d: number) => ({ cadence: 'WEEKLY', dayOfWeek: d, dayOfMonth: null });
  assert.equal(nextRunAfter(weekly(5), '2026-11-12'), '2026-11-13');
  assert.equal(nextRunAfter(weekly(4), '2026-11-12'), '2026-11-19', 'the same weekday is next week');
  assert.equal(nextRunAfter(weekly(1), '2026-11-12'), '2026-11-16');
  assert.equal(nextRunAfter(weekly(7), '2026-11-12'), '2026-11-15');
  const monthly = (d: number) => ({ cadence: 'MONTHLY', dayOfWeek: null, dayOfMonth: d });
  assert.equal(nextRunAfter(monthly(28), '2026-11-12'), '2026-11-28');
  assert.equal(nextRunAfter(monthly(12), '2026-11-12'), '2026-12-12', 'the same day is next month');
  assert.equal(nextRunAfter(monthly(1), '2026-12-15'), '2027-01-01');
  assert.equal(nextRunAfter(monthly(28), '2027-01-31'), '2027-02-28');
  // A job that missed a fortnight runs once, then is due after today — not fourteen times.
  assert.equal(nextRunAfter(daily, '2026-11-26'), '2026-11-27');
});

test('wired in: filters never data; claimed before made; the owner checked; told, nothing attached; the owner’s alone; kept', () => {
  const run = read('lib/exports/schedule-server.ts');
  assert.match(run, /where: \{ status: 'ACTIVE', nextRunOn: \{ lte: today \} \}/);
  assert.match(run, /updateMany\(\{ where: \{ id: s\.id, status: 'ACTIVE', nextRunOn: s\.nextRunOn \}, data: \{ nextRunOn: next \} \}\)/, 'claimed by moving its due day on: two runs never make two exports');
  assert.ok(run.indexOf('if (!claimed.count) continue;') < run.indexOf('await recordExport(s)'));
  assert.match(run, /where: \{ id: s\.ownerId, organisationId: s\.organisationId, isActive: true \}/, 'its owner: an active account of the same organisation');
  assert.match(run, /decide\(p, 'dataexchange\.export\.run'\)/);
  assert.match(run, /kind\.sensitive && !decide\(p, 'dataexchange\.export\.sensitive'\)\.allowed/);
  assert.match(run, /data: \{ status: 'PAUSED', pausedReason: why \}/);
  assert.match(run, /action: 'data_exchange\.export_schedule_paused'/);
  assert.match(run, /createdById: s\.ownerId/, 'the export is its owner’s: the file is built for them at download');
  assert.match(run, /nothing is attached to this email/);
  assert.doesNotMatch(run, /attachments|renderToBuffer|runExport|buildFile/, 'the job never builds a file');
  const a = read('lib/actions/export-schedules.ts');
  assert.match(a, /where: \{ id: String\(exportId\)\.slice\(0, 40\), organisationId, createdById: userId \}/, 'only your own export is repeated');
  assert.match(a, /const job = await myExportOf\(organisationId, userId, exportId\)/);
  assert.match(a, /where: \{ id: String\(id\)\.slice\(0, 40\), organisationId, ownerId: userId \}/, 'only your own schedule is changed');
  assert.match(a, /if \(params\.customerId\) return fail/);
  assert.match(a, /updateMany\(\{ where: \{ id: s\.id, status: s\.status \}/);
  assert.doesNotMatch(a, /exportSchedule\.delete/, 'ended, never deleted');
  for (const fn of ['scheduleExport', 'changeExportSchedule']) assert.match(a, new RegExp(`refuseDuringAssist\\('${fn}'\\)`));
  for (const act of ['export_scheduled', 'export_schedule_resumed', 'export_schedule_paused', 'export_schedule_ended']) assert.match(a, new RegExp(`data_exchange\\.${act}'`));
  for (const f of ['app/api/cron/export-schedules/route.ts', 'app/api/cron/pricing-alerts/route.ts']) assert.match(read(f), /runDueExportSchedules\(\)/, f);
  assert.match(read('app/api/cron/export-schedules/route.ts'), /if \(!isCronRequest\(request\.headers\.get\('authorization'\)\)\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/);
  assert.doesNotMatch(read('lib/exports/schedule.ts'), /^import /m, 'the form’s shared module pulls in nothing');
  assert.equal(DATA_INVENTORY.ExportSchedule?.ai, 'NEVER');
  for (const f of ['scripts/predeploy/0026-export-schedules.sql', 'scripts/v-a4c3-export-schedules.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "export_schedules"/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE|RENAME)\b/i, 'additive only');
  }
});
