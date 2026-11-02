/**
 * The plant demo (lib/plant/demo/plan.ts): six invented weeks of the
 * assembly plant, the same every run, cut at "now", with every stage
 * present and the plant's own rules holding throughout — so the demo never
 * shows a thing EJO itself would refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_PEOPLE, planPlantDemo, addWorkingMinutes, workingDays } from '../lib/plant/demo/plan';
import { isVin } from '../lib/vin';
import { gateVerdict, type DefectStatus, type Severity } from '../lib/plant/line';

const NOON_MONDAY = new Date('2026-11-02T11:00:00Z');

test('working time: minutes run 07:30–16:30 Lagos on weekdays and roll over nights and weekends', () => {
  const fri = new Date('2026-10-30T14:30:00Z'); // 15:30 Lagos, Friday
  assert.equal(addWorkingMinutes(fri, 30).toISOString(), '2026-10-30T15:00:00.000Z');
  assert.equal(addWorkingMinutes(fri, 90).toISOString(), '2026-11-02T07:00:00.000Z'); // 07:30 + 30 on Monday
  assert.equal(workingDays(NOON_MONDAY, 5).map((d) => d.getUTCDay()).join(''), '23451');
});

test('the plan is the same every run, and reads as a real plant: about sixty vehicles, every stage, kits at every step, realistic FTT and DPU', () => {
  const a = planPlantDemo(NOON_MONDAY);
  const b = planPlantDemo(NOON_MONDAY);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.vehicles.length >= 55 && a.vehicles.length <= 75, `${a.vehicles.length} vehicles`);
  const kits = a.shipments.flatMap((s) => s.kits);
  assert.ok(kits.length > a.vehicles.length);
  for (const stage of ['LINE', 'QA', 'PDI', 'YARD']) assert.ok(a.figures.byStage[stage], `a vehicle ${stage}`);
  for (const status of ['ARRIVED', 'SUBMITTED', 'ON_HOLD', 'REJECTED', 'RELEASED']) assert.ok(kits.some((k) => k.status === status), `a kit ${status}`);
  assert.ok(kits.some((k) => k.releasedWithShortages), 'a kit released with shortages');
  assert.ok(kits.some((k) => k.issues.some((i) => i.stopsLine && i.status === 'CLAIMED')), 'a line-stopping shortage claimed now');
  assert.ok(a.figures.ftt >= 60 && a.figures.ftt <= 92, `FTT ${a.figures.ftt}%`);
  assert.ok(a.figures.dpu >= 0.15 && a.figures.dpu <= 0.7, `DPU ${a.figures.dpu}`);
  assert.ok(a.vehicles.some((v) => v.audits.some((x) => x.result === 'FAIL')), 'a failed QA audit');
  assert.ok(a.vehicles.some((v) => v.pdis.some((p) => p.sapUsageDecision === 'R' || p.decisionNote?.includes('second'))), 'a PDI rejected once');
  assert.ok(a.vehicles.some((v) => v.stage === 'LINE' && v.visits.some((x) => x.status === 'FAILED')), 'a vehicle in rework now');
});

test('nothing in the story happens after now, VINs are real-shaped and unique, and no one is a real person', () => {
  const p = planPlantDemo(NOON_MONDAY);
  const vins = new Set<string>();
  for (const k of p.shipments.flatMap((s) => s.kits)) { assert.ok(isVin(k.vin), k.vin); assert.ok(!vins.has(k.vin)); vins.add(k.vin); }
  const all: (Date | null)[] = [];
  for (const s of p.shipments) { all.push(s.arrivedAt); for (const k of s.kits) { all.push(k.startedAt, k.submittedAt, k.decidedAt); for (const i of k.issues) all.push(i.raisedAt, i.claimedAt, i.resolvedAt); for (const c of k.checks) all.push(c.checkedAt); } }
  for (const v of p.vehicles) { all.push(v.lineStartedAt, v.gatePassedAt); for (const x of v.visits) all.push(x.startedAt, x.finishedAt, x.passedAt); for (const d of v.defects) all.push(d.raisedAt, d.reworkedAt, d.verifiedAt); for (const a of v.audits) all.push(a.startedAt, a.finishedAt); for (const q of v.pdis) { all.push(q.startedAt, q.submittedAt, q.decidedAt); for (const it of q.items) all.push(it.checkedAt, it.reworkedAt); } }
  for (const d of all) if (d) assert.ok(d <= NOON_MONDAY, `${d.toISOString()} is after now`);
  // The plant's people are the demo organisation's people (lib/demo/people.ts): reserved domain, demo numbers, one account each.
  for (const person of DEMO_PEOPLE) { assert.match(person.email, /@demo\.kewalram\.local$/); assert.match(person.employeeId, /^DEMO-AP-\d{3}$/); assert.match(person.previousEmail ?? '', /@afprint-demo\.example$/); }
  assert.equal(new Set(DEMO_PEOPLE.map((x) => x.key)).size, DEMO_PEOPLE.length);
});

test('the plant’s rules hold in the demo: stations in order, rework and verification by different people, the gate never passed by its recorder or with an open A/B defect, kits never released by their inspector', () => {
  const p = planPlantDemo(NOON_MONDAY);
  for (const v of p.vehicles) {
    let seenOpen = false;
    for (const x of v.visits) {
      if (seenOpen) assert.equal(x.status, 'PENDING', `${v.vin}: ${x.code} after an unfinished station`);
      if (x.status !== 'PASSED') seenOpen = true;
      if (x.startedAt && x.finishedAt) assert.ok(x.finishedAt >= x.startedAt);
    }
    for (const d of v.defects) if (d.reworkedBy && d.verifiedBy) assert.notEqual(d.reworkedBy, d.verifiedBy, `${v.vin}: ${d.description} verified by its reworker`);
    const gate = v.visits.find((x) => x.kind === 'GATE');
    if (gate?.status === 'PASSED') {
      assert.notEqual(gate.passedBy, gate.operator, `${v.vin}: the gate passed by whoever recorded it`);
      const verdict = gateVerdict({ stations: v.visits.map((x) => ({ code: x.code, kind: x.kind, status: x.status })), defects: v.defects.filter((d) => d.raisedAt <= gate.passedAt!).map((d) => ({ severity: d.severity as Severity, status: d.status as DefectStatus })), gateResults: gate.results });
      assert.ok(verdict.ok, `${v.vin}: ${JSON.stringify(verdict)}`);
      assert.ok(v.gatePassedAt || v.stage === 'LINE');
    }
    if (v.stage === 'YARD') assert.ok(v.pdis.some((q) => q.status === 'PASSED' && q.sapUsageDecision === 'A'), `${v.vin} in the yard without a passed PDI`);
    if (v.stage !== 'LINE') assert.ok(v.visits.every((x) => x.status === 'PASSED'), `${v.vin} is ${v.stage} with a station not passed`);
  }
  for (const k of p.shipments.flatMap((s) => s.kits)) {
    if (k.status === 'RELEASED' || k.status === 'REJECTED') assert.notEqual(k.decidedBy, k.inspector, `${k.vin} decided by its inspector`);
    if (k.status === 'RELEASED') assert.ok(!k.issues.some((i) => i.stopsLine && i.status !== 'RESOLVED'), `${k.vin} released with a line-stopping shortage open`);
    if (k.vehicleKey) assert.equal(k.status, 'RELEASED');
  }
});

test('docs/demo/correct has the plant’s six weeks as files, from the same plan', () => {
  const dir = join(__dirname, '..', '..', '..', '..', 'docs', 'demo', 'correct');
  for (const f of ['10_plant_shipments_demo.csv', '11_plant_kits_demo.csv', '12_plant_kit_issues_demo.csv', '13_plant_vehicles_demo.csv']) assert.ok(existsSync(join(dir, f)), f);
  const plan = planPlantDemo(new Date('2026-10-30T15:00:00Z'));
  const rows = (f: string) => readFileSync(join(dir, f), 'utf8').trim().split('\n').length - 1;
  assert.equal(rows('10_plant_shipments_demo.csv'), plan.shipments.length);
  assert.equal(rows('11_plant_kits_demo.csv'), plan.shipments.reduce((n, s) => n + s.kits.length, 0));
  assert.equal(rows('13_plant_vehicles_demo.csv'), plan.vehicles.length);
  assert.ok(readFileSync(join(dir, '13_plant_vehicles_demo.csv'), 'utf8').includes('"Branch","VIN"'));
});

test('npm run demo:reset refuses a hosted database unless the confirmation is given, and deletes only EJO-DEMO records', () => {
  const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'demo-reset.ts'), 'utf8');
  assert.match(script, /supabase/);
  assert.match(script, /DEMO_RESET_CONFIRM/);
  const load = readFileSync(join(__dirname, '..', '..', 'lib', 'plant', 'demo', 'load.ts'), 'utf8');
  for (const m of load.matchAll(/deleteMany\(\{ where: \{([^}]*)\}/g)) assert.match(m[1]!, /externalSource: DEMO_SOURCE/);
  assert.match(readFileSync(join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'), /"demo:reset"/);
});
