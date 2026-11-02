/**
 * D3 the line: routes and their text form, checks against limits, defects,
 * the gate rule (never with an open A or B defect), times and first-time-
 * through, the QA audit score, and the wiring.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_DEMERITS, DEFAULT_ROUTES, DEFECT_CAUSES, DEFECT_LOCATIONS, DEFECT_TYPES, auditScore, defectWords, defectsPerUnit, firstTimeThrough, gateVerdict, judgeCheck, minutesBetween, parseRouteText, routeToText, stationBlockers, stationTimes } from '../lib/plant/line';
import { APPROVAL_PERMISSIONS, PERMISSIONS, ROLE_GRANTS, ROLE_LABELS } from '../lib/authz/catalogue';
import { approvalArea } from '../lib/approvals';
import { REFERENCE_TYPES } from '../lib/search-plan';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

test('two default routes from a real CKD/SKD line: the truck route has the chassis, axles, powertrain, cab, wheels, tests, road test and a gate; the SUV route its own; every code unique', () => {
  const truck = DEFAULT_ROUTES['isuzu-n'];
  assert.deepEqual(truck.stations.map((s) => s.code), ['C1', 'C2', 'C3', 'T1', 'T2', 'T3', 'F1', 'E1', 'R1', 'G1']);
  assert.equal(truck.stations.at(-1)!.kind, 'GATE');
  assert.ok(truck.stations.find((s) => s.code === 'F1')!.checks.some((c) => c.type === 'MEASURE' && c.unit === 'N·m' && c.min === 540 && c.max === 600), 'wheel-nut torque with limits');
  assert.ok(truck.stations.find((s) => s.code === 'E1')!.checks.some((c) => /Shower/.test(c.label)), 'the water-leak test');
  const suv = DEFAULT_ROUTES['soueast-s07'];
  assert.deepEqual(suv.stations.map((s) => s.code), ['B1', 'T1', 'M1', 'F1', 'E1', 'W1', 'R1', 'G1']);
  assert.ok(suv.stations.find((s) => s.code === 'E1')!.checks.some((c) => /ADAS/.test(c.label)));
  for (const r of Object.values(DEFAULT_ROUTES)) {
    for (const s of r.stations) { const codes = s.checks.map((c) => c.code); assert.equal(new Set(codes).size, codes.length, `${r.key} ${s.code}: unique check codes`); assert.ok(s.checks.length >= 2); assert.ok(s.standardMinutes >= 20); }
    // Round trip through the text the manager edits.
    const back = parseRouteText(routeToText(r.stations));
    assert.deepEqual(back.problems, []);
    assert.deepEqual(back.stations, r.stations, `${r.key}: text → route → text is lossless`);
  }
  // About 45 minutes of takt on the truck line.
  const total = truck.stations.filter((s) => s.kind === 'STATION').reduce((n, s) => n + s.standardMinutes, 0) / truck.stations.filter((s) => s.kind === 'STATION').length;
  assert.ok(total >= 40 && total <= 50, `truck station standard averages ${total} min`);
});

test('route text: every problem named with its line; a route ends with a gate; nothing saved while a problem remains', () => {
  const r = parseRouteText('# C1 | Chassis | STATION | 45 min\nC1-01 | Frame on stands\nC1-02 | Bolt torque | N·m | 180 | 220\n# C1 | Again | STATION | 10\n# X | | TEST | 5\n# T1 | Trim | BENCH | 30\n# T2 | Trim | STATION | 0\nT9-01 | A check with no station?\n# G1 | Gate | GATE | 30\nG1-01 | Walk-round\nG1-01 | Twice\nG1-02 | Bad measure | mm | 5 | 1');
  assert.deepEqual(r.stations.map((s) => s.code), ['C1', 'G1']);
  assert.equal(r.stations[0]!.checks[1]!.type, 'MEASURE');
  assert.deepEqual(r.problems, [
    'Line 4: station C1 is listed twice.',
    'Line 5: station X needs a name.',
    'Line 6: the kind must be STATION, TEST or GATE.',
    'Line 7: give the standard time in minutes (1 to 600).',
    'Line 8: a check before any station (start a station with "# CODE | Name | STATION | minutes").',
    'Line 11: check G1-01 is listed twice in G1.',
    'Line 12: a measurement needs its unit, minimum and maximum (minimum not above maximum).',
  ]);
  assert.match(parseRouteText('# C1 | Chassis | STATION | 45\nC1-01 | x').problems[0]!, /ends with a quality gate/);
  assert.match(parseRouteText('# G1 | Gate | GATE | 30').problems[0]!, /has no checks/);
});

test('a measurement is judged against its limits; a pass/fail as recorded; a station finishes only when every check is in', () => {
  const torque = DEFAULT_ROUTES['isuzu-n'].stations.find((s) => s.code === 'F1')!.checks[0]!;
  assert.deepEqual(judgeCheck(torque, { value: '570' }), { pass: true, value: 570, why: null });
  assert.deepEqual(judgeCheck(torque, { value: '520,5' }), { pass: false, value: 520.5, why: '520.5 N·m is outside 540–600 N·m.' });
  assert.equal(judgeCheck(torque, { value: '' }).why, 'Record the measurement (N·m).');
  const pf = { code: 'X', label: 'x', type: 'PASS_FAIL' as const };
  assert.equal(judgeCheck(pf, { pass: true }).pass, true);
  assert.equal(judgeCheck(pf, { pass: false }).why, 'Marked as failed.');
  assert.deepEqual(stationBlockers([pf, torque], [{ code: 'X', pass: true }]), ['1 check is not recorded yet.']);
  assert.deepEqual(stationBlockers([pf], [{ code: 'X', pass: false }]), []);
});

test('the gate: never with an unfinished station, an open A or B defect, or a failed gate check; a C defect or a closed one does not stop it', () => {
  const stations = [{ code: 'C1', kind: 'STATION' as const, status: 'PASSED' as const }, { code: 'G1', kind: 'GATE' as const, status: 'DONE' as const }];
  assert.deepEqual(gateVerdict({ stations, defects: [], gateResults: [{ code: 'G1-01', pass: true }] }), { ok: true });
  assert.deepEqual(gateVerdict({ stations, defects: [{ severity: 'C', status: 'OPEN' }, { severity: 'A', status: 'CLOSED' }], gateResults: [] }), { ok: true });
  const v = gateVerdict({ stations: [{ code: 'C1', kind: 'STATION', status: 'IN_PROGRESS' }, ...stations.slice(1)], defects: [{ severity: 'A', status: 'REWORKED' }, { severity: 'B', status: 'OPEN' }], gateResults: [{ code: 'G1-01', pass: false }] });
  assert.equal(v.ok, false);
  if (!v.ok) assert.deepEqual(v.why, ['1 station is not finished: C1.', '1 A-defect is open: a vehicle never passes the gate with one.', '1 B-defect is open: fix before the gate.', '1 gate check failed.']);
});

test('the defect catalogue reads as words and keeps stable codes; audit scoring: A fails outright, 20 demerits fail', () => {
  assert.equal(defectWords('CB', 'WATER', 'SEAL'), 'Cab / body · Water leak · Seal not seated');
  for (const list of [DEFECT_LOCATIONS, DEFECT_TYPES, DEFECT_CAUSES]) assert.equal(new Set(list.map((x) => x.code)).size, list.length);
  assert.deepEqual(AUDIT_DEMERITS, { A: 10, B: 5, C: 1 });
  assert.deepEqual(auditScore([]), { demerits: 0, a: 0, b: 0, c: 0, result: 'PASS' });
  assert.equal(auditScore([{ section: 'EXT', severity: 'C', description: 'scratch' }, { section: 'INT', severity: 'B', description: 'loose trim' }]).result, 'PASS');
  assert.equal(auditScore([{ section: 'ENG', severity: 'A', description: 'fuel leak' }]).result, 'FAIL');
  assert.deepEqual(auditScore(Array(4).fill({ section: 'EXT', severity: 'B', description: 'x' })), { demerits: 20, a: 0, b: 4, c: 0, result: 'FAIL' });
});

test('times: median per station against the standard; first-time-through and defects per unit', () => {
  assert.equal(minutesBetween(new Date('2026-11-02T08:00:00Z'), new Date('2026-11-02T08:47:30Z')), 48);
  assert.equal(minutesBetween(null, new Date()), null);
  const t = stationTimes([{ code: 'C1', name: 'Chassis', standardMinutes: 45, minutes: 40 }, { code: 'C1', name: 'Chassis', standardMinutes: 45, minutes: 60 }, { code: 'C1', name: 'Chassis', standardMinutes: 45, minutes: 50 }, { code: 'C2', name: 'Axles', standardMinutes: 45, minutes: null }]);
  assert.deepEqual(t, [{ code: 'C1', name: 'Chassis', n: 3, median: 50, standard: 45, over: 5 }, { code: 'C2', name: 'Axles', n: 0, median: null, standard: 45, over: 0 }]);
  assert.deepEqual(firstTimeThrough([{ passedGate: true, defects: 0 }, { passedGate: true, defects: 2 }, { passedGate: false, defects: 0 }]), { passed: 2, clean: 1, ftt: 50 });
  assert.equal(defectsPerUnit(7, 4), 1.75);
  assert.equal(defectsPerUnit(7, 0), null);
});

test('roles and permissions: operators work the line, quality passes the gate (an approval), QA audits, supervisors edit routes; DEF and QAA numbers open their pages', () => {
  for (const k of ['plant.line.operate', 'plant.quality.gate', 'plant.qa.audit', 'plant.route.manage'] as const) assert.ok(PERMISSIONS[k], k);
  assert.ok(APPROVAL_PERMISSIONS.includes('plant.quality.gate'));
  assert.ok(ROLE_GRANTS['line-operator']!['plant.line.operate'] && !ROLE_GRANTS['line-operator']!['plant.quality.gate']);
  assert.ok(ROLE_GRANTS['qc-inspector']!['plant.quality.gate']);
  assert.ok(ROLE_GRANTS['qa-auditor']!['plant.qa.audit'] && !ROLE_GRANTS['qa-auditor']!['plant.line.operate']);
  assert.ok(ROLE_GRANTS['production-supervisor']!['plant.route.manage'] && !ROLE_GRANTS['production-supervisor']!['plant.quality.gate'], 'production does not pass its own gate');
  assert.ok(ROLE_GRANTS['plant-manager']!['plant.quality.gate'] && ROLE_GRANTS['quality-supervisor']!['plant.route.manage']);
  for (const r of ['production-supervisor', 'line-operator', 'qc-inspector', 'qa-auditor']) assert.ok(ROLE_LABELS[r], r);
  assert.equal(approvalArea({ id: 'gate-pass-x', title: 'Pass the gate' }), 'Plant');
  assert.equal(approvalArea({ id: 'defect-verify-x', title: 'Verify rework' }), 'Plant');
  assert.equal(REFERENCE_TYPES.find((t) => t.prefix === 'DEF')!.path('v1'), '/plant/line/v1');
  assert.equal(REFERENCE_TYPES.find((t) => t.prefix === 'QAA')!.path('a1'), '/plant/qa/a1');
  assert.match(read('../../packages/database/prisma/seed.ts'), /'Production Supervisor', 'Line Operator', 'QC Inspector', 'QA Auditor'\]/);
});

test('wired in: stations in order, failed checks need a defect, the gate and verification by a second person, refused during assisted sessions, nothing deleted; a kit release starts the build; PDI waits for the gate', () => {
  const a = read('lib/actions/plant-line.ts');
  const body = (name: string) => { const i = a.indexOf(`export async function ${name}(`); return a.slice(i, a.indexOf('\nexport async function', i + 10)); };
  assert.match(body('recordCheck'), /the line runs in order/);
  assert.match(body('finishStation'), /raise the defect \(what, where, why\) before finishing the station/);
  for (const fn of ['passGate', 'verifyDefect']) { assert.match(body(fn), /refuseDuringAssist\(/, fn); assert.match(body(fn), /authorize\('plant\.quality\.gate'/, fn); }
  assert.match(body('passGate'), /gateVisit\.operatorId === me\.userId\) return fail/);
  assert.match(body('verifyDefect'), /d\.raisedById === me\.userId \|\| d\.reworkedById === me\.userId\) return fail/);
  assert.match(body('saveAudit'), /score\.result === 'FAIL'/);
  assert.doesNotMatch(a, /\.delete\(|\.deleteMany\(/);
  assert.doesNotMatch(a, /^export async function startBuildFor/m, 'the shared build start is not a server action');
  assert.match(read('lib/actions/plant-kits.ts'), /await startBuildFor\(\{ vehicleId: out\.vehicleId/);
  assert.match(read('lib/actions/plant.ts'), /it reaches PDI once it passes the final quality gate/);
  for (const m of a.matchAll(/prisma\.plant(StationVisit|Defect|QaAudit|Route)\.find(First|Many)\(\{ where: \{([^}]*)/g)) assert.match(m[3]!, /organisationId|branchId|plantVehicleId|routeId|\.\.\.where|\.\.\.base/, m[0]);
  for (const f of ['../../scripts/predeploy/0013-plant-line.sql', '../../scripts/v-d3-line.sql']) { const sql = read(f); assert.match(sql, /CREATE TABLE IF NOT EXISTS "plant_routes"/); assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE) /im, `${f}: deletes nothing`); }
});
