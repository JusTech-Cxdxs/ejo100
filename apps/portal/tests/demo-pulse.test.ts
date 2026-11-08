/**
 * D3 — the demo lives every day (lib/demo/pulse*.ts) and the platform team's
 * console (lib/actions/demo-console.ts). The pure rules here; the database
 * behaviour (once a day, moving earlier records on, a reset taking it all
 * out, never a real organisation) in e2e/demo-pulse.spec.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PULSE_AGE_OUT_DAYS, PULSE_MODEL, dayRandom, happenedAt, lagosAt, nextWorkingDay, pulseDay, pulseDayId, pulseEnabled, weekdayOf } from '../lib/demo/pulse-core';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('on unless DEMO_DAILY_ACTIVITY=off (any case, spaces); the marker is one per organisation per Lagos day', () => {
  assert.equal(pulseEnabled({}), true);
  assert.equal(pulseEnabled({ DEMO_DAILY_ACTIVITY: 'on' }), true);
  assert.equal(pulseEnabled({ DEMO_DAILY_ACTIVITY: ' OFF ' }), false);
  assert.equal(PULSE_MODEL, 'DemoPulse');
  assert.equal(pulseDayId('org1', '2026-11-03'), 'org1:2026-11-03');
});

test('Lagos time: 08:00 Lagos is 07:00 UTC; weekdays and the next working day skip the weekend; a day key is the Lagos date, not UTC', () => {
  assert.equal(lagosAt('2026-11-03', 8).toISOString(), '2026-11-03T07:00:00.000Z');
  assert.equal(weekdayOf('2026-11-03'), 2);
  assert.equal(nextWorkingDay('2026-11-06'), '2026-11-09');
  assert.equal(nextWorkingDay('2026-11-07'), '2026-11-09');
  assert.equal(nextWorkingDay('2026-11-03'), '2026-11-04');
  assert.equal(pulseDay(new Date('2026-11-03T23:30:00Z')).dayKey, '2026-11-04', '00:30 Lagos is already the next day');
});

test('a busy weekday (Monday with the notice), a half Saturday, a quiet Sunday', () => {
  const mon = pulseDay(new Date('2026-11-09T08:00:00Z'));
  assert.deepEqual([mon.jobCards, mon.servicesToday, mon.servicesBooked, mon.visitors, mon.tickets, mon.meeting, mon.broadcast], [3, 1, 1, 2, 2, true, true]);
  const tue = pulseDay(new Date('2026-11-10T08:00:00Z'));
  assert.equal(tue.broadcast, false); assert.equal(tue.meeting, true);
  const sat = pulseDay(new Date('2026-11-07T08:00:00Z'));
  assert.deepEqual([sat.jobCards, sat.servicesToday, sat.meeting], [1, 0, false]);
  const sun = pulseDay(new Date('2026-11-08T08:00:00Z'));
  assert.deepEqual([sun.jobCards, sun.visitors, sun.tickets, sun.meeting], [0, 0, 1, false]);
});

test('things that already happened are dated through the morning and never after now; the choices are the same all day', () => {
  const day = '2026-11-03';
  const late = new Date('2026-11-03T15:00:00Z');
  const t = [0, 1, 2].map((i) => happenedAt(day, late, i, 3));
  assert.ok(t[0]! >= lagosAt(day, 7, 35) && t[2]! <= lagosAt(day, 11, 30) && t[0]! < t[1]! && t[1]! < t[2]!);
  const early = new Date('2026-11-03T05:00:00Z'); // 06:00 Lagos: before the shift
  for (let i = 0; i < 3; i += 1) assert.ok(happenedAt(day, early, i, 3) < early);
  const a = dayRandom(day, 'x'); const b = dayRandom(day, 'x'); const c = dayRandom('2026-11-04', 'x');
  assert.equal(a(), b()); assert.notEqual(dayRandom(day, 'x')(), c());
  assert.equal(PULSE_AGE_OUT_DAYS, 7);
});

test('the pulse keeps its promises in code: demo only, the switch, the claim first inside one transaction, a second run stops on the unique marker, never money, stock, warranty or email; every record listed for the reset', () => {
  const src = read('apps/portal/lib/demo/pulse.ts');
  assert.match(src, /if \(!pulseEnabled\(env\)\) return result\('off'\)/);
  assert.match(src, /if \(!org\?\.isDemo\) return result\('not-demo'\)/);
  assert.ok(src.indexOf('tx.demoRecord.create({ data: { organisationId, model: PULSE_MODEL') < src.indexOf('tx.jobCard.create('), 'the claim is the first write');
  assert.match(src, /e\.code === 'P2002'\) return result\('already'\)/);
  for (const forbidden of ['payment.', 'partRequestSlip', 'goodsReceipt', 'warrantyClaim', 'sendEmail(', 'sendMail(', 'partStock']) assert.ok(!src.includes(forbidden), `the pulse never touches ${forbidden}`);
  assert.match(src, /sendEmail: false/);
  assert.match(src, /tx\.demoRecord\.createMany\(\{ data: registry/);
  // A fresh load claims its own day, so the pulse adds nothing on top of it.
  assert.match(read('apps/portal/lib/workshop/demo/load.ts'), /model: PULSE_MODEL, recordId: pulseDayId\(organisationId, lagosDayKey\(anchor\)\)/);
  // Where it runs: the daily job, the dashboard (after the page), the deploy.
  assert.match(read('apps/portal/app/api/cron/pricing-alerts/route.ts'), /runDemoPulseForAll\(\)/);
  assert.match(read('apps/portal/app/(app)/dashboard/page.tsx'), /after\(\(\) => ensureDemoPulse\(principal\.organisationId\)\)/);
  assert.match(read('apps/portal/scripts/demo-ensure.ts'), /runDemoPulse\(org\.id\)/);
});

test('the console is the platform team’s only: every action checks the Master Administrator, refuses during an assisted session, takes typed words, is audited; only a demo organisation is loaded or emptied', () => {
  const src = read('apps/portal/lib/actions/demo-console.ts');
  for (const fn of ['getDemoConsoleState', 'setDemoOrganisation', 'refreshDemoNow', 'removeDemoNow']) {
    const start = src.indexOf(`export async function ${fn}(`);
    const next = src.indexOf('\nexport ', start + 10);
    const body = src.slice(start, next === -1 ? undefined : next);
    assert.match(body, /await platformTeam\(/, `${fn} is the platform team's`);
    if (fn !== 'getDemoConsoleState') { assert.match(body, /refuseDuringAssist\(/); assert.match(body, /writeAuditLog\(/); assert.match(body, /confirm/); }
  }
  assert.match(src, /if \(!p\.isSuperAdmin\) return refuse\(/);
  assert.match(src, /if \(!org\.isDemo\) return fail\(/);
  assert.match(read('apps/portal/app/(app)/it/page.tsx'), /\(await getPrincipal\(\)\)\.isSuperAdmin \? await getDemoConsoleState\(\) : null/);
});
