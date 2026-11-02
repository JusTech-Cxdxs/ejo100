/**
 * The assembly line: routes, stations, checks, defects and the quality
 * gates. Pure (no database).
 *
 * A **route** is the list of stations a model family passes through, kept in
 * versions: the plant manager edits the live route, and a vehicle keeps the
 * station list it started with. Two default routes, from how a CKD/SKD truck
 * line runs (docs/DEMO_WALKTHROUGH.md §12):
 *
 *  Isuzu N/Q-series (CKD): kit receiving (D2) → chassis frame dress → axles
 *  and suspension → powertrain → cab line → cab mounting → wheels, fluids and
 *  first start → end-of-line tests → road test → final inspection (gate) →
 *  QA audit (a sample) → PDI (D1) → yard → dispatch.
 *
 *  Soueast S07 (SKD): body receiving → trim and glazing → chassis and
 *  powertrain marriage → wheels and fluids → end-of-line (alignment,
 *  headlamps, brakes, ADAS) → water test → road test → final inspection →
 *  QA audit → PDI → yard → dispatch.
 *
 * Each station has **checks**: pass/fail, or a measured value with limits
 * (a wheel-nut torque in N·m, toe-in in mm). A failed check raises a
 * **defect** from the catalogue (location × type × cause), severity A/B/C,
 * reworked and then verified by a second person. A **gate** (final
 * inspection) cannot pass while an A-defect is open or a check failed.
 * Station times feed takt and bottlenecks.
 */

import type { PdiFamily } from './pdi';

export type CheckType = 'PASS_FAIL' | 'MEASURE';
export type StationCheck = { code: string; label: string; type: CheckType; unit?: string; min?: number; max?: number };
export type StationKind = 'STATION' | 'TEST' | 'GATE';
export const STATION_KIND_WORDS: Record<StationKind, string> = { STATION: 'Assembly station', TEST: 'Test', GATE: 'Quality gate' };
export type RouteStation = { code: string; name: string; kind: StationKind; standardMinutes: number; checks: StationCheck[] };
export type RouteTemplate = { key: PdiFamily; name: string; stations: RouteStation[] };

const pf = (code: string, label: string): StationCheck => ({ code, label, type: 'PASS_FAIL' });
const m = (code: string, label: string, unit: string, min: number, max: number): StationCheck => ({ code, label, type: 'MEASURE', unit, min, max });

export const DEFAULT_ROUTES: Record<PdiFamily, RouteTemplate> = {
  'isuzu-n': {
    key: 'isuzu-n', name: 'Isuzu N/Q-series truck line (CKD)',
    stations: [
      { code: 'C1', name: 'Chassis frame dress', kind: 'STATION', standardMinutes: 45, checks: [pf('C1-01', 'Frame on stands, level, identity label matches the kit'), pf('C1-02', 'Cross-members fitted'), m('C1-03', 'Cross-member bolts torque', 'N·m', 180, 220), pf('C1-04', 'Brake lines routed and clipped, no kinks'), pf('C1-05', 'Fuel lines routed and clipped'), pf('C1-06', 'Main wiring harness routed, connectors clipped')] },
      { code: 'C2', name: 'Axles and suspension', kind: 'STATION', standardMinutes: 45, checks: [pf('C2-01', 'Front axle fitted'), pf('C2-02', 'Rear axle fitted'), m('C2-03', 'Spring U-bolt torque', 'N·m', 200, 240), pf('C2-04', 'Leaf springs and shackles fitted, pins greased'), pf('C2-05', 'Shock absorbers fitted'), m('C2-06', 'Shock absorber mounting torque', 'N·m', 80, 100)] },
      { code: 'C3', name: 'Powertrain', kind: 'STATION', standardMinutes: 50, checks: [pf('C3-01', 'Engine and transmission married'), m('C3-02', 'Engine mounting torque', 'N·m', 60, 80), pf('C3-03', 'Propeller shaft fitted, phased'), m('C3-04', 'Propeller shaft flange torque', 'N·m', 85, 105), pf('C3-05', 'Exhaust fitted and hangers in place'), pf('C3-06', 'Fuel tank fitted and strapped'), pf('C3-07', 'Batteries fitted and terminals tight')] },
      { code: 'T1', name: 'Cab trim and wiring', kind: 'STATION', standardMinutes: 45, checks: [pf('T1-01', 'Cab wiring harness routed and connected'), pf('T1-02', 'Dashboard fitted'), pf('T1-03', 'Pedals and steering column fitted'), pf('T1-04', 'Headlining and trim panels fitted')] },
      { code: 'T2', name: 'Cab glass and seats', kind: 'STATION', standardMinutes: 40, checks: [pf('T2-01', 'Windscreen bonded and seated'), pf('T2-02', 'Door glass and regulators work'), pf('T2-03', 'Seats and seat belts fitted'), m('T2-04', 'Seat-belt anchor torque', 'N·m', 40, 55)] },
      { code: 'T3', name: 'Cab mounting', kind: 'STATION', standardMinutes: 45, checks: [pf('T3-01', 'Cab lowered onto mounts, tilt lock engages'), m('T3-02', 'Cab mounting bolt torque', 'N·m', 90, 110), pf('T3-03', 'Steering shaft connected and pinned'), pf('T3-04', 'Cab-to-chassis harness and hoses connected')] },
      { code: 'F1', name: 'Wheels, fluids and first start', kind: 'STATION', standardMinutes: 45, checks: [m('F1-01', 'Wheel nut torque', 'N·m', 540, 600), pf('F1-02', 'Coolant filled and bled'), pf('F1-03', 'Brake and clutch fluid filled and bled'), pf('F1-04', 'Engine, gearbox and axle oils filled'), pf('F1-05', 'Fuel added'), pf('F1-06', 'First start: engine runs, no leaks, no warning lamps')] },
      { code: 'E1', name: 'End-of-line tests', kind: 'TEST', standardMinutes: 40, checks: [m('E1-01', 'Side-slip (front)', 'm/km', -3, 3), m('E1-02', 'Headlamp aim (dip, left)', '%', -1.5, -0.5), m('E1-03', 'Roller brake imbalance (front axle)', '%', 0, 20), m('E1-04', 'Speedometer at 60 km/h reads', 'km/h', 60, 66), pf('E1-05', 'Under-body inspection on the pit: no leaks, all clips'), pf('E1-06', 'Shower (water-leak) test: cab dry')] },
      { code: 'R1', name: 'Road test', kind: 'TEST', standardMinutes: 30, checks: [pf('R1-01', 'Starts and idles'), pf('R1-02', 'Clutch and all gears'), pf('R1-03', 'Steering centred, no pull'), pf('R1-04', 'Brakes, ABS, parking brake'), pf('R1-05', 'No abnormal noise or vibration'), pf('R1-06', 'No leaks after the test')] },
      { code: 'G1', name: 'Final inspection', kind: 'GATE', standardMinutes: 30, checks: [pf('G1-01', 'Every station passed and signed'), pf('G1-02', 'No open A or B defect'), pf('G1-03', 'Fit and finish walk-round: paint, gaps, labels'), pf('G1-04', 'Build papers complete (VIN, engine, build date)')] },
    ],
  },
  'soueast-s07': {
    key: 'soueast-s07', name: 'Soueast S07 SUV line (SKD)',
    stations: [
      { code: 'B1', name: 'Body receiving', kind: 'STATION', standardMinutes: 30, checks: [pf('B1-01', 'Painted body on the carrier, VIN matches the kit'), pf('B1-02', 'Paint and panels undamaged after transport'), pf('B1-03', 'Protective film in place')] },
      { code: 'T1', name: 'Trim and glazing', kind: 'STATION', standardMinutes: 60, checks: [pf('T1-01', 'Wiring harnesses routed and connected'), pf('T1-02', 'Headlining, pillars and carpets fitted'), pf('T1-03', 'Instrument panel and infotainment fitted'), pf('T1-04', 'Glass bonded and seated'), pf('T1-05', 'Seats and seat belts fitted'), m('T1-06', 'Seat-belt anchor torque', 'N·m', 40, 55)] },
      { code: 'M1', name: 'Chassis and powertrain marriage', kind: 'STATION', standardMinutes: 60, checks: [pf('M1-01', 'Front module (engine, transmission, suspension) raised and aligned'), pf('M1-02', 'Rear suspension module fitted'), m('M1-03', 'Subframe bolt torque', 'N·m', 110, 130), pf('M1-04', 'Driveshafts, brake lines and harnesses connected'), pf('M1-05', 'Exhaust and heat shields fitted')] },
      { code: 'F1', name: 'Wheels and fluids', kind: 'STATION', standardMinutes: 40, checks: [m('F1-01', 'Wheel nut torque', 'N·m', 120, 140), pf('F1-02', 'Coolant, brake fluid and oils filled'), pf('F1-03', 'Fuel added'), pf('F1-04', 'First start: no leaks, no warning lamps')] },
      { code: 'E1', name: 'End-of-line tests', kind: 'TEST', standardMinutes: 45, checks: [m('E1-01', 'Front toe-in (total)', 'mm', 0, 2), m('E1-02', 'Headlamp aim (dip, left)', '%', -1.5, -0.5), m('E1-03', 'Roller brake imbalance (front axle)', '%', 0, 20), pf('E1-04', 'ADAS and camera calibration passed'), pf('E1-05', 'Electrical check: every lamp, window and lock'), pf('E1-06', 'Under-body inspection: no leaks, all clips')] },
      { code: 'W1', name: 'Water test', kind: 'TEST', standardMinutes: 20, checks: [pf('W1-01', 'Shower test: cabin and boot dry'), pf('W1-02', 'Door and tailgate seals seated')] },
      { code: 'R1', name: 'Road test', kind: 'TEST', standardMinutes: 30, checks: [pf('R1-01', 'Starts and idles'), pf('R1-02', 'Transmission shifts in all modes'), pf('R1-03', 'Steering centred, no pull'), pf('R1-04', 'Brakes and ABS'), pf('R1-05', 'No abnormal noise or vibration'), pf('R1-06', 'No leaks after the test')] },
      { code: 'G1', name: 'Final inspection', kind: 'GATE', standardMinutes: 30, checks: [pf('G1-01', 'Every station passed and signed'), pf('G1-02', 'No open A or B defect'), pf('G1-03', 'Fit and finish walk-round: paint, gaps, labels'), pf('G1-04', 'Build papers complete (VIN, engine, build date)')] },
    ],
  },
};

// ── Routes as text (the plant manager edits them) ───────────────────────

/** A route as the manager types it: one station per line, its checks below it. */
export function routeToText(stations: RouteStation[]): string {
  return stations.map((s) => [`# ${s.code} | ${s.name} | ${s.kind} | ${s.standardMinutes} min`, ...s.checks.map((c) => (c.type === 'MEASURE' ? `${c.code} | ${c.label} | ${c.unit ?? ''} | ${c.min ?? ''} | ${c.max ?? ''}` : `${c.code} | ${c.label}`))].join('\n')).join('\n\n');
}

/** Back from text. Every problem is listed with its line; nothing is saved while one remains. */
export function parseRouteText(raw: string | null | undefined): { stations: RouteStation[]; problems: string[] } {
  const stations: RouteStation[] = [];
  const problems: string[] = [];
  const codes = new Set<string>();
  let current: RouteStation | null = null;
  String(raw ?? '').split(/\r?\n/).forEach((text, i) => {
    const line = i + 1;
    const t = text.trim();
    if (!t) return;
    const cells = t.replace(/^#\s*/, '').split('|').map((c) => c.trim());
    if (t.startsWith('#')) {
      const [code, name, kind, mins] = cells;
      const k = String(kind ?? 'STATION').toUpperCase() as StationKind;
      const minutes = Number(String(mins ?? '').replace(/[^\d.]/g, ''));
      if (!code || !/^[A-Z][A-Z0-9]{0,5}$/i.test(code)) { problems.push(`Line ${line}: a station needs a short code (e.g. C1).`); current = null; return; }
      if (codes.has(code.toUpperCase())) { problems.push(`Line ${line}: station ${code.toUpperCase()} is listed twice.`); current = null; return; }
      if (!name) { problems.push(`Line ${line}: station ${code} needs a name.`); current = null; return; }
      if (!(k in STATION_KIND_WORDS)) { problems.push(`Line ${line}: the kind must be STATION, TEST or GATE.`); current = null; return; }
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) { problems.push(`Line ${line}: give the standard time in minutes (1 to 600).`); current = null; return; }
      current = { code: code.toUpperCase(), name: name.slice(0, 80), kind: k, standardMinutes: Math.round(minutes), checks: [] };
      codes.add(current.code);
      stations.push(current);
      return;
    }
    if (!current) { problems.push(`Line ${line}: a check before any station (start a station with "# CODE | Name | STATION | minutes").`); return; }
    const [code, label, unit, min, max] = cells;
    if (!code || !label) { problems.push(`Line ${line}: a check is "CODE | What is checked" (add "| unit | min | max" for a measurement).`); return; }
    if (current.checks.some((c) => c.code === code.toUpperCase())) { problems.push(`Line ${line}: check ${code.toUpperCase()} is listed twice in ${current.code}.`); return; }
    if (unit !== undefined && (unit || min || max)) {
      const lo = Number(min); const hi = Number(max);
      if (!unit || !Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) { problems.push(`Line ${line}: a measurement needs its unit, minimum and maximum (minimum not above maximum).`); return; }
      current.checks.push({ code: code.toUpperCase(), label: label.slice(0, 120), type: 'MEASURE', unit: unit.slice(0, 12), min: lo, max: hi });
    } else {
      current.checks.push({ code: code.toUpperCase(), label: label.slice(0, 120), type: 'PASS_FAIL' });
    }
  });
  for (const s of stations) if (!s.checks.length) problems.push(`Station ${s.code} (${s.name}) has no checks.`);
  if (stations.length && !stations.some((s) => s.kind === 'GATE')) problems.push('A route ends with a quality gate (kind GATE): add one.');
  if (stations.length > 40) problems.push(`A route holds at most 40 stations; this has ${stations.length}.`);
  return { stations, problems };
}

// ── Checks and their results ────────────────────────────────────────────

export type CheckResult = { code: string; pass: boolean; value?: number | null; note?: string | null };

/** A measured value against its limits; a pass/fail as recorded. */
export function judgeCheck(check: StationCheck, input: { pass?: boolean; value?: number | string | null }): { pass: boolean; value: number | null; why: string | null } {
  if (check.type === 'MEASURE') {
    const v = input.value === null || input.value === undefined || input.value === '' ? NaN : Number(String(input.value).replace(',', '.'));
    if (!Number.isFinite(v)) return { pass: false, value: null, why: `Record the measurement (${check.unit}).` };
    const lo = check.min ?? -Infinity; const hi = check.max ?? Infinity;
    if (v < lo || v > hi) return { pass: false, value: v, why: `${v} ${check.unit} is outside ${lo}–${hi} ${check.unit}.` };
    return { pass: true, value: v, why: null };
  }
  return { pass: Boolean(input.pass), value: null, why: input.pass ? null : 'Marked as failed.' };
}

export type VisitStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'PASSED';
export const VISIT_STATUS_WORDS: Record<VisitStatus, string> = { PENDING: 'Waiting', IN_PROGRESS: 'In progress', DONE: 'Done, waiting for the gate', FAILED: 'Failed, in rework', PASSED: 'Passed' };

/** What stands between a station and being finished (one line per problem). */
export function stationBlockers(checks: StationCheck[], results: CheckResult[]): string[] {
  const out: string[] = [];
  const missing = checks.filter((c) => !results.some((r) => r.code === c.code));
  if (missing.length) out.push(`${missing.length} ${missing.length === 1 ? 'check is' : 'checks are'} not recorded yet.`);
  return out;
}

// ── Defects ─────────────────────────────────────────────────────────────

export type Severity = 'A' | 'B' | 'C';
export const SEVERITY_WORDS: Record<Severity, string> = { A: 'A — safety or function: stops the vehicle', B: 'B — must be fixed before the gate', C: 'C — cosmetic, fix when convenient' };
export const SEVERITY_SHORT: Record<Severity, string> = { A: 'A · safety', B: 'B · major', C: 'C · minor' };
export type DefectStatus = 'OPEN' | 'REWORKED' | 'CLOSED';
export const DEFECT_STATUS_WORDS: Record<DefectStatus, string> = { OPEN: 'Open', REWORKED: 'Reworked, waiting for verification', CLOSED: 'Closed' };
/** Still counts against the vehicle. */
export const DEFECT_UNRESOLVED: DefectStatus[] = ['OPEN', 'REWORKED'];

/** The defect catalogue: location × type × cause, each with a stable code. The description is "Cab · Water leak · Seal not seated". */
export const DEFECT_LOCATIONS: { code: string; name: string }[] = [
  { code: 'FR', name: 'Frame and chassis' }, { code: 'AX', name: 'Axles and suspension' }, { code: 'PT', name: 'Powertrain' }, { code: 'CB', name: 'Cab / body' },
  { code: 'DR', name: 'Doors and glass' }, { code: 'EL', name: 'Electrical' }, { code: 'IN', name: 'Interior' }, { code: 'WH', name: 'Wheels and tyres' }, { code: 'BR', name: 'Brakes' }, { code: 'FL', name: 'Fluids and leaks' }, { code: 'PA', name: 'Paint' },
];
export const DEFECT_TYPES: { code: string; name: string; defaultSeverity: Severity }[] = [
  { code: 'MISS', name: 'Missing part', defaultSeverity: 'B' }, { code: 'LOOSE', name: 'Loose / under torque', defaultSeverity: 'A' }, { code: 'OVER', name: 'Over torque', defaultSeverity: 'B' },
  { code: 'LEAK', name: 'Leak', defaultSeverity: 'A' }, { code: 'WATER', name: 'Water leak', defaultSeverity: 'B' }, { code: 'NOISE', name: 'Noise / vibration', defaultSeverity: 'B' },
  { code: 'FUNC', name: 'Does not work', defaultSeverity: 'A' }, { code: 'FIT', name: 'Poor fit / gap', defaultSeverity: 'C' }, { code: 'SCR', name: 'Scratch / dent', defaultSeverity: 'C' },
  { code: 'WRONG', name: 'Wrong part', defaultSeverity: 'B' }, { code: 'ROUTE', name: 'Routing / clipping', defaultSeverity: 'B' }, { code: 'ALIGN', name: 'Out of alignment / limits', defaultSeverity: 'B' },
];
export const DEFECT_CAUSES: { code: string; name: string }[] = [
  { code: 'OP', name: 'Operator: step missed' }, { code: 'TQ', name: 'Tool: torque setting' }, { code: 'PART', name: 'Part: supplied defective' }, { code: 'SEAL', name: 'Seal not seated' },
  { code: 'DMG', name: 'Damaged in handling' }, { code: 'KIT', name: 'Kit shortage / wrong part' }, { code: 'INST', name: 'Instruction unclear' }, { code: 'UNK', name: 'Under investigation' },
];
export const defectCode = (location: string, type: string, cause: string) => `${location}-${type}-${cause}`;
export function defectWords(location: string, type: string, cause: string): string {
  const l = DEFECT_LOCATIONS.find((x) => x.code === location)?.name ?? location;
  const t = DEFECT_TYPES.find((x) => x.code === type)?.name ?? type;
  const c = DEFECT_CAUSES.find((x) => x.code === cause)?.name ?? cause;
  return `${l} · ${t} · ${c}`;
}
export const isSeverity = (s: unknown): s is Severity => s === 'A' || s === 'B' || s === 'C';

// ── The gate ────────────────────────────────────────────────────────────

export type GateInput = {
  stations: { code: string; kind: StationKind; status: VisitStatus }[];
  defects: { severity: Severity; status: DefectStatus }[];
  gateResults: CheckResult[];
};

/** Whether the vehicle may pass the final gate now, and if not why (one line per reason). */
export function gateVerdict(g: GateInput): { ok: true } | { ok: false; why: string[] } {
  const why: string[] = [];
  const notDone = g.stations.filter((s) => s.kind !== 'GATE' && s.status !== 'PASSED' && s.status !== 'DONE');
  if (notDone.length) why.push(`${notDone.length} ${notDone.length === 1 ? 'station is' : 'stations are'} not finished: ${notDone.map((s) => s.code).join(', ')}.`);
  const open = g.defects.filter((d) => DEFECT_UNRESOLVED.includes(d.status));
  const a = open.filter((d) => d.severity === 'A').length;
  const b = open.filter((d) => d.severity === 'B').length;
  if (a) why.push(`${a} A-${a === 1 ? 'defect is' : 'defects are'} open: a vehicle never passes the gate with one.`);
  if (b) why.push(`${b} B-${b === 1 ? 'defect is' : 'defects are'} open: fix before the gate.`);
  const failed = g.gateResults.filter((r) => !r.pass);
  if (failed.length) why.push(`${failed.length} gate ${failed.length === 1 ? 'check' : 'checks'} failed.`);
  return why.length ? { ok: false, why } : { ok: true };
}

// ── Times, takt and first-time-through ──────────────────────────────────

/** Minutes between two moments (null while unfinished). */
export function minutesBetween(start: Date | null | undefined, end: Date | null | undefined): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** Per station: how many vehicles, median minutes, and against the standard; the slowest is the bottleneck. */
export function stationTimes(visits: { code: string; name: string; standardMinutes: number; minutes: number | null }[]): { code: string; name: string; n: number; median: number | null; standard: number; over: number }[] {
  const by = new Map<string, { name: string; standard: number; mins: number[] }>();
  for (const v of visits) {
    const e = by.get(v.code) ?? { name: v.name, standard: v.standardMinutes, mins: [] };
    if (v.minutes !== null) e.mins.push(v.minutes);
    by.set(v.code, e);
  }
  return [...by.entries()].map(([code, e]) => {
    const s = [...e.mins].sort((a, b) => a - b);
    const median = s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : Math.round((s[s.length / 2 - 1]! + s[s.length / 2]!) / 2)) : null;
    return { code, name: e.name, n: s.length, median, standard: e.standard, over: median === null ? 0 : Math.max(0, median - e.standard) };
  });
}

/** First-time-through: vehicles that passed the gate with no defect raised at any station. */
export function firstTimeThrough(vehicles: { passedGate: boolean; defects: number }[]): { passed: number; clean: number; ftt: number | null } {
  const passed = vehicles.filter((v) => v.passedGate);
  const clean = passed.filter((v) => v.defects === 0).length;
  return { passed: passed.length, clean, ftt: passed.length ? Math.round((clean / passed.length) * 1000) / 10 : null };
}

/** Defects per unit, over the vehicles built. */
export function defectsPerUnit(defects: number, vehicles: number): number | null {
  return vehicles ? Math.round((defects / vehicles) * 100) / 100 : null;
}

// ── QA audit ────────────────────────────────────────────────────────────

/** The daily audit: a sample of finished vehicles re-inspected and scored. Demerits by severity (the usual 10 / 5 / 1 weighting). */
export const AUDIT_DEMERITS: Record<Severity, number> = { A: 10, B: 5, C: 1 };
export const AUDIT_SECTIONS: { code: string; name: string }[] = [
  { code: 'EXT', name: 'Exterior: paint, panels, gaps, glass' }, { code: 'INT', name: 'Interior: trim, seats, controls, cleanliness' }, { code: 'ENG', name: 'Engine bay: fluids, leaks, routing, labels' },
  { code: 'UND', name: 'Under-body: fasteners, lines, leaks' }, { code: 'ELE', name: 'Electrical: every lamp and function' }, { code: 'DOC', name: 'Documents: build papers, labels, VIN plates' },
];
export type AuditFinding = { section: string; severity: Severity; description: string };
export function auditScore(findings: AuditFinding[]): { demerits: number; a: number; b: number; c: number; result: 'PASS' | 'FAIL' } {
  const a = findings.filter((f) => f.severity === 'A').length; const b = findings.filter((f) => f.severity === 'B').length; const c = findings.filter((f) => f.severity === 'C').length;
  const demerits = a * AUDIT_DEMERITS.A + b * AUDIT_DEMERITS.B + c * AUDIT_DEMERITS.C;
  // An A finding fails the audit outright; otherwise 20 demerits or more.
  return { demerits, a, b, c, result: a > 0 || demerits >= 20 ? 'FAIL' : 'PASS' };
}
