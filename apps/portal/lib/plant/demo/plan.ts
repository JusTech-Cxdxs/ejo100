/**
 * The plant demo, planned: six weeks of the Afprint assembly plant as a
 * story that is the same on every run (a seeded generator), with nothing
 * taken from a real person or vehicle.
 *
 * It is a simulation, cut at "now": kits arrive in shipments and are
 * checked and released; the two lines start the released kits at their
 * takt (two Isuzu trucks and one Soueast S07 a working day), one vehicle at
 * a station at a time; each station takes about its standard time; some
 * checks fail and raise defects that the line reworks and quality
 * verifies; the gate is passed by quality; QA audits a sample; PDI follows
 * a day later and the vehicle reaches the yard. Whatever has not happened
 * by "now" has not happened: so the plant is left with kits being checked,
 * vehicles at their stations, one in rework, some waiting for PDI, PDIs in
 * progress and a yard — every stage, with realistic takt, first-time-through
 * and defects per unit, and figures that look right on every page.
 *
 * Pure: no database here. `loadPlantDemo` (./load.ts) writes a plan, and
 * scripts/demo-files.ts writes the same plan as the plant's demo files.
 */
import { PLANT_DEMO_STAFF } from '../../demo/people';
import { DEFAULT_ROUTES, DEFECT_TYPES, type AuditFinding, type CheckResult, type RouteStation, type Severity, type StationCheck, type StationKind } from '../line';
import { PDI_TEMPLATES, PLANT_MODELS, type PdiFamily } from '../pdi';
import { DEFAULT_KIT_TYPE, KIT_TEMPLATES, type KitType } from '../kits';

export const DEMO_SOURCE = 'EJO-DEMO';

// ── Randomness that is the same every run ───────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
const chance = (r: Rng, p: number) => r() < p;

// ── Working time in Lagos (UTC+1): 07:30–16:30, Monday to Friday ────────
const SHIFT_START_UTC_MIN = 6 * 60 + 30;
const SHIFT_MIN = 9 * 60;
const DAY = 86_400_000;
const isWorkDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** The start of the shift on a day (UTC midnight in). */
const shiftStart = (day: Date) => new Date(day.getTime() + SHIFT_START_UTC_MIN * 60_000);
/** Moves forward over the working calendar: whatever does not fit before 16:30 continues at 07:30 on the next working day. */
export function addWorkingMinutes(from: Date, minutes: number): Date {
  let t = from;
  let left = minutes;
  for (let guard = 0; guard < 2000; guard += 1) {
    const day = utcMidnight(t);
    const start = shiftStart(day);
    const end = new Date(start.getTime() + SHIFT_MIN * 60_000);
    if (!isWorkDay(day) || t >= end) { t = shiftStart(nextWorkDay(day)); continue; }
    if (t < start) t = start;
    const room = (end.getTime() - t.getTime()) / 60_000;
    if (left <= room) return new Date(t.getTime() + left * 60_000);
    left -= room;
    t = shiftStart(nextWorkDay(day));
  }
  return t;
}
function nextWorkDay(day: Date): Date {
  let d = new Date(day.getTime() + DAY);
  while (!isWorkDay(d)) d = new Date(d.getTime() + DAY);
  return d;
}
/** The last `n` working days up to and including `anchor`'s day (when it is one), oldest first. */
export function workingDays(anchor: Date, n: number): Date[] {
  const out: Date[] = [];
  let d = utcMidnight(anchor);
  while (out.length < n) { if (isWorkDay(d)) out.unshift(d); d = new Date(d.getTime() - DAY); }
  return out;
}
const later = (a: Date, b: Date) => (a > b ? a : b);
const plusMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

// ── The people (invented) ──────────────────────────────────────────────
export type DemoPerson = { key: string; fullName: string; employeeId: string; email: string; previousEmail?: string; role: string; department: string };
/**
 * The plant's people are the demo organisation's people (lib/demo/people.ts,
 * the ones with a plantKey): the same accounts the sign-ins are made for, so
 * loading the plant demo never makes a second set.
 */
export const DEMO_PEOPLE: DemoPerson[] = PLANT_DEMO_STAFF.map((s) => ({ key: s.plantKey!, fullName: s.name, employeeId: s.employeeId, email: s.email, previousEmail: s.previousEmail, role: s.role, department: s.dept ?? 'plant-production' }));
const OPERATORS = ['op1', 'op2', 'op3', 'op4'] as const;

// ── What the plan holds ─────────────────────────────────────────────────
export type DemoCheck = { code: string; section: string; label: string; sort: number; allowNa: boolean; result: 'OK' | 'NOT_OK' | 'NA' | null; note: string | null; checkedBy: string | null; checkedAt: Date | null };
export type DemoIssue = { kind: 'SHORTAGE' | 'DAMAGE' | 'WRONG_PART' | 'EXCESS'; partNumber: string | null; description: string; caseNumber: string | null; quantity: number; stopsLine: boolean; status: 'OPEN' | 'CLAIMED' | 'RESOLVED'; claimReference: string | null; resolution: string | null; raisedBy: string; raisedAt: Date; claimedAt: Date | null; resolvedBy: string | null; resolvedAt: Date | null };
export type DemoKit = {
  key: string; seq: number; vin: string; engineNumber: string; modelCode: string; lotNumber: string; kitType: KitType; casesExpected: number; casesReceived: number | null;
  templateKey: PdiFamily; templateVersion: number; status: 'ARRIVED' | 'INSPECTING' | 'SUBMITTED' | 'ON_HOLD' | 'RELEASED' | 'REJECTED';
  inspector: string | null; startedAt: Date | null; submittedAt: Date | null; decidedBy: string | null; decidedAt: Date | null; decisionNote: string | null; releasedWithShortages: boolean;
  sapUsageDecision: 'A' | 'R' | null; sapInspectionLot: string; sapMaterialDocument: string; notes: string | null; checks: DemoCheck[]; issues: DemoIssue[]; vehicleKey: string | null;
};
export type DemoShipment = { key: string; seq: number; supplier: string; origin: string; billOfLading: string; vessel: string; containers: string[]; arrivedAt: Date; sapPurchaseOrder: string; sapInboundDelivery: string; notes: string; kits: DemoKit[] };
export type DemoVisit = { code: string; name: string; kind: StationKind; sort: number; standardMinutes: number; checks: StationCheck[]; results: CheckResult[]; status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'PASSED'; operator: string | null; startedAt: Date | null; finishedAt: Date | null; passedBy: string | null; passedAt: Date | null; notes: string | null };
export type DemoDefect = { seq: number; stationCode: string | null; checkCode: string | null; location: string; type: string; cause: string; severity: Severity; description: string; status: 'OPEN' | 'REWORKED' | 'CLOSED'; raisedBy: string; raisedAt: Date; reworkNote: string | null; reworkedBy: string | null; reworkedAt: Date | null; verifiedBy: string | null; verifiedAt: Date | null; verifyNote: string | null };
export type DemoAudit = { seq: number; auditor: string; findings: AuditFinding[]; demerits: number; result: 'PASS' | 'FAIL' | null; notes: string | null; startedAt: Date; finishedAt: Date | null };
export type DemoPdiItem = { code: string; section: string; label: string; sort: number; allowNa: boolean; result: 'OK' | 'NOT_OK' | 'NA' | null; defect: string | null; reworkNote: string | null; reworkedAt: Date | null; reworkedBy: string | null; checkedBy: string | null; checkedAt: Date | null };
export type DemoPdi = { seq: number; attempt: number; templateKey: PdiFamily; templateVersion: number; status: 'IN_PROGRESS' | 'REWORK' | 'SUBMITTED' | 'PASSED' | 'CANCELLED'; odometerKm: number; batteryVolts: number; tyreFrontPsi: number; tyreRearPsi: number; faultScanDone: boolean; faultCodes: string[]; faultCodesCleared: boolean; notes: string | null; inspector: string; startedAt: Date; submittedAt: Date | null; decidedBy: string | null; decidedAt: Date | null; decisionNote: string | null; sapUsageDecision: 'A' | 'R' | null; items: DemoPdiItem[] };
export type DemoVehicle = {
  key: string; vin: string; make: string; modelCode: string; modelName: string; engineNumber: string; colour: string; modelYear: number; stage: 'LINE' | 'QA' | 'PDI' | 'YARD';
  sapMaterial: string; sapProductionOrder: string; sapEquipment: string | null; family: PdiFamily; currentStation: string | null; lineStartedAt: Date; gatePassedAt: Date | null;
  createdAt: Date; visits: DemoVisit[]; defects: DemoDefect[]; audits: DemoAudit[]; pdis: DemoPdi[];
};
export type PlantDemoPlan = { anchor: Date; people: DemoPerson[]; shipments: DemoShipment[]; vehicles: DemoVehicle[]; figures: { kits: number; vehicles: number; byStage: Record<string, number>; defects: number; ftt: number; dpu: number; audits: number; pdis: number } };

// ── Catalogue bits used by the story ───────────────────────────────────
const ISUZU_MODELS = ['NQR', 'NQR', 'NQR', 'NPR', 'NPR', 'QMR', 'QLR'] as const;
const COLOURS: Record<PdiFamily, string[]> = { 'isuzu-n': ['Arctic White', 'Arctic White', 'Arctic White', 'Sapphire Blue'], 'soueast-s07': ['Pearl White', 'Starry Black', 'Titanium Grey', 'Flame Red'] };
const SAP_MATERIAL: Record<string, string> = { NQR: 'ISZ-NQR75L-CKD', NPR: 'ISZ-NPR71-CKD', QMR: 'ISZ-QMR55-CKD', QLR: 'ISZ-QLR55-CKD', S07: 'SEM-S07-SKD' };
/** Parts a kit can be short of or damaged in, with the case they travel in. */
const KIT_PARTS: Record<PdiFamily, [string, string, string][]> = {
  'isuzu-n': [['8-97366-430-0', 'Front axle hub, left', 'C07'], ['8-98023-115-1', 'Mirror bracket, right', 'C11'], ['8-97310-645-2', 'Headlamp assembly, left', 'C10'], ['1-53215-078-0', 'Leaf spring, rear', 'C05'], ['8-98156-321-0', 'Door glass regulator, right', 'C09'], ['8-97372-122-3', 'Radiator hose, upper', 'C06'], ['1-09170-033-0', 'Cab mounting bolt set', 'C12']],
  'soueast-s07': [['S07-3501100', 'Front brake disc', 'S2'], ['S07-5206100', 'Windscreen', 'S1'], ['S07-3718100', 'Tail lamp, right', 'S3'], ['S07-6102100', 'Front door trim panel, left', 'S3'], ['S07-1301100', 'Radiator', 'S2']],
};
/** The defects a station tends to produce: which check fails, where, what, why, and how it reads. */
type DefectSeed = { check: string; location: string; type: string; cause: string; text: string; rework: string };
const DEFECT_SEEDS: Record<PdiFamily, Record<string, DefectSeed[]>> = {
  'isuzu-n': {
    C1: [{ check: 'C1-03', location: 'AX', type: 'LOOSE', cause: 'TQ', text: 'Rear U-bolt nuts under torque as delivered', rework: 'Torqued to 220 N·m in sequence' }, { check: 'C1-06', location: 'BR', type: 'ROUTE', cause: 'OP', text: 'Brake line unclipped behind the second cross-member', rework: 'Clipped and routed to the drawing' }, { check: 'C1-05', location: 'WH', type: 'LOOSE', cause: 'TQ', text: 'Two wheel nuts on the rear left below 540 N·m', rework: 'All nuts torqued and marked' }],
    C2: [{ check: 'C2-02', location: 'CB', type: 'LOOSE', cause: 'TQ', text: 'Cab mounting bolt at 70 N·m, limit 90', rework: 'Torqued to 100 N·m' }, { check: 'C2-04', location: 'EL', type: 'ROUTE', cause: 'OP', text: 'Cab harness pinched under the dash bracket', rework: 'Harness re-routed over the bracket, insulation checked' }, { check: 'C2-05', location: 'DR', type: 'FUNC', cause: 'PART', text: 'Right door regulator binds halfway', rework: 'Regulator replaced from the claim stock' }],
    C3: [{ check: 'C3-01', location: 'FL', type: 'LEAK', cause: 'SEAL', text: 'Coolant weep at the lower radiator hose clip', rework: 'Clip repositioned and tightened; no weep after warm-up' }, { check: 'C3-04', location: 'EL', type: 'LOOSE', cause: 'OP', text: 'Battery positive terminal loose', rework: 'Terminal tightened and greased' }],
    E1: [{ check: 'E1-02', location: 'EL', type: 'ALIGN', cause: 'OP', text: 'Left headlamp aim 0.2% high', rework: 'Aim adjusted on the beam setter' }, { check: 'E1-03', location: 'BR', type: 'ALIGN', cause: 'UNK', text: 'Front brake imbalance 24%', rework: 'Left caliper slide pins freed and greased; re-tested at 8%' }],
    R1: [{ check: 'R1-05', location: 'PT', type: 'NOISE', cause: 'OP', text: 'Rattle from the exhaust heat shield over bumps', rework: 'Heat shield bolt fitted with a spring washer' }],
    G1: [{ check: 'G1-03', location: 'PA', type: 'SCR', cause: 'DMG', text: 'Light scratch on the left door below the handle', rework: 'Polished out' }],
  },
  'soueast-s07': {
    B1: [{ check: 'B1-02', location: 'PA', type: 'SCR', cause: 'DMG', text: 'Scuff on the rear bumper corner from transport', rework: 'Polished and touched in' }],
    T1: [{ check: 'T1-04', location: 'DR', type: 'FIT', cause: 'SEAL', text: 'Rear quarter glass bead lifted', rework: 'Re-bedded' }, { check: 'T1-03', location: 'EL', type: 'FUNC', cause: 'PART', text: 'Infotainment unit does not power up', rework: 'Unit replaced from the claim stock' }],
    M1: [{ check: 'M1-03', location: 'FR', type: 'LOOSE', cause: 'TQ', text: 'Front subframe bolt below 110 N·m', rework: 'Torqued to 120 N·m in sequence' }],
    F1: [{ check: 'F1-04', location: 'FL', type: 'LEAK', cause: 'SEAL', text: 'Oil weep at the filter housing', rework: 'Filter re-seated with a new O-ring' }],
    E1: [{ check: 'E1-04', location: 'EL', type: 'FUNC', cause: 'INST', text: 'Front camera calibration failed on the first attempt', rework: 'Target re-positioned and calibration passed' }, { check: 'E1-01', location: 'WH', type: 'ALIGN', cause: 'OP', text: 'Toe-in 2.6 mm', rework: 'Set to 1.0 mm' }],
    W1: [{ check: 'W1-01', location: 'DR', type: 'WATER', cause: 'SEAL', text: 'Damp carpet behind the right rear door', rework: 'Door seal re-seated; dry on the second test' }],
    R1: [{ check: 'R1-06', location: 'PT', type: 'NOISE', cause: 'UNK', text: 'Ticking from the dash at idle', rework: 'Loose clip behind the glovebox fixed' }],
    G1: [{ check: 'G1-03', location: 'CB', type: 'FIT', cause: 'OP', text: 'Bonnet gap uneven, 2 mm wider on the right', rework: 'Hinge adjusted' }],
  },
};
const PDI_FAULTS = ['P0101 mass air flow (cleared)', 'U0100 lost communication, stored (cleared)', 'C1234 wheel speed sensor, stored (cleared)'];
const AUDIT_FINDINGS: [string, Severity, string][] = [['EXT', 'C', 'Transport film residue on the right mirror'], ['INT', 'C', 'Fingerprints on the headlining above the driver'], ['DOC', 'B', 'Build card missing the engine number entry'], ['ENG', 'C', 'Coolant overflow bottle filled above MAX'], ['UND', 'C', 'Brake line clip rotated, line secure'], ['ELE', 'B', 'Right reverse lamp dim: bulb seating'], ['ENG', 'A', 'Fuel return line weeping at the union']];

const fam = (modelCode: string): PdiFamily => (PLANT_MODELS.find((m) => m.code === modelCode)?.family ?? 'isuzu-n');

// ── The plan ────────────────────────────────────────────────────────────
/**
 * Plans six weeks of the plant up to `anchor` (the moment "now"), the same
 * for the same anchor day. Pass the day you want the story to end on.
 */
export function planPlantDemo(anchor: Date): PlantDemoPlan {
  const r = mulberry32(20261102);
  const now = anchor;
  const days = workingDays(anchor, 30); // the window: the last 30 working days, W0 … W29
  const W = (i: number) => (i >= 0 ? days[Math.min(i, days.length - 1)]! : new Date(days[0]!.getTime() - Math.ceil(-i * 7 / 5) * DAY));
  const at = (day: Date, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return new Date(day.getTime() + ((h! - 1) * 60 + m!) * 60_000); }; // Lagos clock → UTC

  // Shipments: four Isuzu CKD and three Soueast SKD over the six weeks; the last Isuzu one landed a week ago and its kits are the receiving bay's work today.
  const shipmentSeeds: { fam: PdiFamily; day: Date; kits: number; vessel: string; origin: string; containers: number }[] = [
    { fam: 'isuzu-n', day: W(-4), kits: 14, vessel: 'MV Hoegh Trident', origin: 'Yokohama, Japan', containers: 3 },
    { fam: 'soueast-s07', day: W(-2), kits: 8, vessel: 'MV Cosco Shipping Taurus', origin: 'Xiamen, China', containers: 2 },
    { fam: 'isuzu-n', day: W(6), kits: 14, vessel: 'MV Maersk Cabinda', origin: 'Yokohama, Japan', containers: 3 },
    { fam: 'soueast-s07', day: W(13), kits: 8, vessel: 'MV OOCL Lagos', origin: 'Xiamen, China', containers: 2 },
    { fam: 'isuzu-n', day: W(15), kits: 14, vessel: 'MV MSC Francesca', origin: 'Yokohama, Japan', containers: 3 },
    { fam: 'soueast-s07', day: W(22), kits: 8, vessel: 'MV Evergreen Ever Lotus', origin: 'Xiamen, China', containers: 2 },
    { fam: 'isuzu-n', day: W(27), kits: 14, vessel: 'MV Grande Lagos', origin: 'Yokohama, Japan', containers: 3 },
  ];
  const shipments: DemoShipment[] = [];
  let kitSeq = 0;
  let isuzuVin = 0;
  let s07Vin = 0;
  let lot = 0;
  shipmentSeeds.forEach((s, si) => {
    const arrivedAt = at(s.day, '08:30');
    const containers = Array.from({ length: s.containers }, (_, k) => `${s.fam === 'isuzu-n' ? 'MSKU' : 'OOLU'}${String(4_100_000 + si * 37 + k * 11).slice(-7)}${k}`);
    const sh: DemoShipment = {
      key: `shp${si + 1}`, seq: si + 1, supplier: s.fam === 'isuzu-n' ? 'Isuzu Motors Ltd' : 'Soueast Motor Co., Ltd', origin: s.origin, billOfLading: `${s.fam === 'isuzu-n' ? 'MAEU' : 'COSU'}${String(620_300_000 + si * 1_337).slice(-9)}`, vessel: s.vessel,
      containers, arrivedAt, sapPurchaseOrder: String(4_500_018_200 + si * 7), sapInboundDelivery: String(180_004_410 + si * 3).padStart(10, '0'),
      notes: `${s.containers} × 40 ft via Apapa; customs released ${s.fam === 'isuzu-n' ? 'form M and PAAR on file' : 'SONCAP certificate on file'}.`, kits: [],
    };
    lot += 1;
    for (let k = 0; k < s.kits; k += 1) {
      kitSeq += 1;
      const modelCode = s.fam === 'isuzu-n' ? pick(r, ISUZU_MODELS) : 'S07';
      const vin = s.fam === 'isuzu-n' ? `JAANLR85EL7${String(230_000 + (isuzuVin += 1)).slice(-6)}` : `LVVDB21B8RD0${String(20_100 + (s07Vin += 1)).slice(-5)}`;
      const engine = s.fam === 'isuzu-n' ? `4HK1-${String(640_000 + isuzuVin * 3)}` : `SQRE4T15C-${String(81_000 + s07Vin * 2)}`;
      const casesExpected = s.fam === 'isuzu-n' ? (modelCode === 'NQR' ? 14 : modelCode === 'NPR' ? 12 : 11) : 3;
      const tpl = KIT_TEMPLATES[s.fam];
      sh.kits.push({
        key: `kit${kitSeq}`, seq: kitSeq, vin, engineNumber: engine, modelCode, lotNumber: `${s.fam === 'isuzu-n' ? 'LOT' : 'SE'}-26${String(lot).padStart(2, '0')}-${String(k + 1).padStart(2, '0')}`, kitType: DEFAULT_KIT_TYPE[s.fam], casesExpected, casesReceived: null,
        templateKey: tpl.key, templateVersion: tpl.version, status: 'ARRIVED', inspector: null, startedAt: null, submittedAt: null, decidedBy: null, decidedAt: null, decisionNote: null, releasedWithShortages: false,
        sapUsageDecision: null, sapInspectionLot: String(10_000_000_000 + kitSeq * 13).padStart(12, '0'), sapMaterialDocument: String(5_000_221_000 + kitSeq), notes: null,
        checks: tpl.items.map((it, i) => ({ code: it.code, section: it.section, label: it.label, sort: i, allowNa: !!it.allowNa, result: null, note: null, checkedBy: null, checkedAt: null })), issues: [], vehicleKey: null,
      });
    }
    shipments.push(sh);
  });

  // The receiving bay: two inspectors, a kit each about every two hours from the morning after arrival; quality decides within a few hours.
  const released: { kit: DemoKit; fam: PdiFamily; at: Date }[] = [];
  for (const sh of shipments) {
    let clock = addWorkingMinutes(at(utcMidnight(sh.arrivedAt), '16:30'), 1); // the next morning
    sh.kits.forEach((kit, idx) => {
      const famKey = kit.templateKey;
      const inspector = idx % 2 === 0 ? 'kit1' : 'kit2';
      const startedAt = idx % 2 === 0 ? clock : plusMin(clock, 25);
      if (idx % 2 === 1) clock = addWorkingMinutes(clock, Math.round(between(r, 190, 230)));
      if (startedAt > now) return; // still waiting on the bay floor
      kit.inspector = inspector; kit.startedAt = startedAt; kit.status = 'INSPECTING';
      const checkedAt = addWorkingMinutes(startedAt, Math.round(between(r, 120, 170)));
      // Checks: everything OK, apart from the kits with a problem.
      const problem = kit.seq % 9 === 4 ? 'shortage' : kit.seq % 14 === 6 ? 'damage' : kit.seq === 44 ? 'rejected' : null;
      kit.casesReceived = problem === 'shortage' ? kit.casesExpected - 1 : kit.casesExpected;
      kit.checks.forEach((c, i) => {
        const when = plusMin(startedAt, Math.round(((i + 1) / kit.checks.length) * ((checkedAt.getTime() - startedAt.getTime()) / 60_000)));
        if (when > now) return; // not reached yet
        c.checkedBy = inspector; c.checkedAt = when;
        c.result = c.allowNa && c.code === 'CS01' && kit.seq % 3 === 0 ? 'NA' : 'OK';
        if (problem === 'shortage' && c.code === 'CS02') { c.result = 'NOT_OK'; c.note = `Case ${kit.casesExpected === 3 ? 'S3' : `C${String(kit.casesExpected).padStart(2, '0')}`} missing from the container`; }
        if (problem === 'damage' && (c.code === 'CB01' || c.code === 'BD01')) { c.result = 'NOT_OK'; c.note = 'Dent in the right door skin, 40 mm, from a shifted case'; }
        if (problem === 'rejected' && (c.code === 'CB01' || c.code === 'BD01')) { c.result = 'NOT_OK'; c.note = 'Cab roof and A-pillar crushed: case fell in the container'; }
      });
      if (checkedAt > now) return; // mid-inspection
      const parts = KIT_PARTS[famKey];
      if (problem === 'shortage') {
        const [pn, name, caseNo] = parts[kit.seq % parts.length]!;
        const stops = [4, 40, 67].includes(kit.seq);
        kit.issues.push({ kind: 'SHORTAGE', partNumber: pn, description: `${name} not in the case`, caseNumber: caseNo, quantity: pn.startsWith('8-97366') ? 2 : 1, stopsLine: stops, status: 'OPEN', claimReference: null, resolution: null, raisedBy: inspector, raisedAt: checkedAt, claimedAt: null, resolvedBy: null, resolvedAt: null });
      }
      if (problem === 'damage') {
        const [pn, name, caseNo] = parts[(kit.seq + 3) % parts.length]!;
        kit.issues.push({ kind: 'DAMAGE', partNumber: pn, description: `${name} dented in transit`, caseNumber: caseNo, quantity: 1, stopsLine: false, status: 'OPEN', claimReference: null, resolution: null, raisedBy: inspector, raisedAt: checkedAt, claimedAt: null, resolvedBy: null, resolvedAt: null });
      }
      kit.submittedAt = plusMin(checkedAt, 5); kit.status = 'SUBMITTED';
      if (kit.submittedAt > now) { kit.status = 'INSPECTING'; kit.submittedAt = null; return; }
      const decidedAt = addWorkingMinutes(kit.submittedAt, Math.round(between(r, 60, 240)));
      if (problem === 'rejected') {
        if (decidedAt > now) return;
        kit.status = 'REJECTED'; kit.decidedBy = 'qs'; kit.decidedAt = decidedAt; kit.sapUsageDecision = 'R'; kit.decisionNote = 'Cab crushed in transit: not built. Marine insurance claim opened; supplier to ship a replacement cab.';
        return;
      }
      const stopping = kit.issues.find((i) => i.stopsLine);
      if (stopping) {
        // Held until the part is claimed and flown in; then released with a concession for anything still open.
        if (decidedAt > now) return;
        kit.status = 'ON_HOLD'; kit.decidedBy = 'qs'; kit.decidedAt = decidedAt; kit.decisionNote = 'Held: the line cannot build without the hubs. Claim raised with Isuzu.';
        const claimedAt = addWorkingMinutes(decidedAt, 90);
        if (claimedAt <= now) { stopping.status = 'CLAIMED'; stopping.claimReference = `Q2-${String(300_120 + kit.seq)}`; stopping.claimedAt = claimedAt; }
        const resolvedAt = addWorkingMinutes(claimedAt, 3 * SHIFT_MIN);
        if (resolvedAt > now) return;
        stopping.status = 'RESOLVED'; stopping.resolution = 'Arrived by air freight, checked and matched to the kit'; stopping.resolvedBy = 'kit1'; stopping.resolvedAt = resolvedAt;
        kit.submittedAt = plusMin(resolvedAt, 20); kit.status = 'SUBMITTED';
        const again = addWorkingMinutes(kit.submittedAt, 60);
        if (again > now) return;
        kit.status = 'RELEASED'; kit.decidedAt = again; kit.sapUsageDecision = 'A'; kit.decisionNote = 'Released after the hubs arrived.';
        released.push({ kit, fam: famKey, at: again });
        return;
      }
      if (decidedAt > now) return;
      kit.status = 'RELEASED'; kit.decidedBy = 'qs'; kit.decidedAt = decidedAt; kit.sapUsageDecision = 'A';
      const open = kit.issues.filter((i) => i.status !== 'RESOLVED');
      if (open.length) {
        kit.releasedWithShortages = true;
        kit.decisionNote = open[0]!.kind === 'DAMAGE' ? 'Released: the dented panel is replaced at the trim station from the claim stock.' : 'Released: the part is fitted at the trim station when it arrives.';
        for (const i of open) { i.status = 'CLAIMED'; i.claimReference = `Q2-${String(300_120 + kit.seq)}`; i.claimedAt = addWorkingMinutes(decidedAt, 45); }
        // Older claims have been settled.
        for (const i of open) { const done = addWorkingMinutes(i.claimedAt!, 6 * SHIFT_MIN); if (done <= now) { i.status = 'RESOLVED'; i.resolution = i.kind === 'DAMAGE' ? 'Replacement panel received, credited by the supplier' : 'Part received and fitted; credited by the supplier'; i.resolvedBy = 'kit2'; i.resolvedAt = done; } }
      } else kit.decisionNote = null;
      released.push({ kit, fam: famKey, at: decidedAt });
    });
  }

  // The two lines: slots at takt (Isuzu 07:30 and 11:30; Soueast 08:00), from W0, each taking the next released kit of its family.
  const vehicles: DemoVehicle[] = [];
  const queue: Record<PdiFamily, { kit: DemoKit; at: Date }[]> = { 'isuzu-n': [], 'soueast-s07': [] };
  for (const x of released.sort((a, b) => a.at.getTime() - b.at.getTime())) queue[x.fam].push({ kit: x.kit, at: x.at });
  const stationFree: Record<PdiFamily, Map<string, Date>> = { 'isuzu-n': new Map(), 'soueast-s07': new Map() };
  let defectSeq = 0; let auditSeq = 0; let pdiSeq = 0; let vehicleSeq = 0;
  const auditedSoFar: DemoVehicle[] = [];
  const pdiFree = { at: new Date(0) };
  for (const day of days) {
    // Isuzu: every morning, and a second truck on Monday, Wednesday and Friday; Soueast: one a day.
    const isuzuSlots = [1, 3, 5].includes(day.getUTCDay()) ? ['07:30', '11:30'] : ['07:30'];
    for (const [famKey, slots] of [['isuzu-n', isuzuSlots], ['soueast-s07', ['08:00']]] as [PdiFamily, string[]][]) {
      for (const slot of slots) {
        const slotAt = at(day, slot);
        if (slotAt > now) continue;
        const next = queue[famKey].find((q) => q.at <= plusMin(slotAt, -90));
        if (!next) continue; // the line waits for a kit
        queue[famKey].splice(queue[famKey].indexOf(next), 1);
        vehicleSeq += 1;
        const kit = next.kit;
        const v = buildVehicle({ r, now, famKey, kit, slotAt, seq: vehicleSeq, stationFree: stationFree[famKey], nextDefect: () => (defectSeq += 1), nextAudit: () => (auditSeq += 1), nextPdi: () => (pdiSeq += 1), auditedSoFar, pdiFree });
        kit.vehicleKey = v.key;
        vehicles.push(v);
      }
    }
  }

  const byStage: Record<string, number> = {};
  for (const v of vehicles) byStage[v.stage] = (byStage[v.stage] ?? 0) + 1;
  const gated = vehicles.filter((v) => v.gatePassedAt);
  const defects = vehicles.reduce((n, v) => n + v.defects.length, 0);
  return {
    anchor, people: DEMO_PEOPLE, shipments, vehicles,
    figures: {
      kits: kitSeq, vehicles: vehicles.length, byStage, defects,
      ftt: gated.length ? Math.round((gated.filter((v) => !v.defects.some((d) => d.stationCode && d.stationCode !== 'G1')).length / gated.length) * 100) : 0,
      dpu: gated.length ? Math.round((gated.reduce((n, v) => n + v.defects.length, 0) / gated.length) * 100) / 100 : 0,
      audits: vehicles.reduce((n, v) => n + v.audits.length, 0), pdis: vehicles.reduce((n, v) => n + v.pdis.length, 0),
    },
  };
}

type BuildInput = { r: Rng; now: Date; famKey: PdiFamily; kit: DemoKit; slotAt: Date; seq: number; stationFree: Map<string, Date>; nextDefect: () => number; nextAudit: () => number; nextPdi: () => number; auditedSoFar: DemoVehicle[]; pdiFree: { at: Date } };

/** One vehicle down its line, then QA, then PDI — every event with a time; then cut at now. */
function buildVehicle(input: BuildInput): DemoVehicle {
  const { r, now, famKey, kit, slotAt, seq, stationFree } = input;
  const route = DEFAULT_ROUTES[famKey];
  const model = PLANT_MODELS.find((m) => m.code === kit.modelCode)!;
  const v: DemoVehicle = {
    key: `veh${seq}`, vin: kit.vin, make: model.make, modelCode: kit.modelCode, modelName: model.name, engineNumber: kit.engineNumber, colour: pick(r, COLOURS[famKey]), modelYear: slotAt.getUTCFullYear(), stage: 'LINE',
    sapMaterial: SAP_MATERIAL[kit.modelCode] ?? kit.modelCode, sapProductionOrder: String(1_000_420 + seq).padStart(12, '0'), sapEquipment: null, family: famKey, currentStation: route.stations[0]!.code, lineStartedAt: slotAt, gatePassedAt: null,
    createdAt: kit.decidedAt ?? slotAt, visits: [], defects: [], audits: [], pdis: [],
  };
  const operator = OPERATORS[seq % OPERATORS.length]!;
  let t = slotAt;
  let gateRecorder: string | null = null;
  const seeds = DEFECT_SEEDS[famKey];
  for (let i = 0; i < route.stations.length; i += 1) {
    const s: RouteStation = route.stations[i]!;
    // One vehicle at a station at a time: wait for the vehicle ahead, then a few minutes to move.
    const start = plusMin(later(t, stationFree.get(s.code) ?? new Date(0)), i === 0 ? 0 : Math.round(between(r, 20, 60))); // parts picked, crane, the move
    const startedAt = addWorkingMinutes(start, 0);
    const slow = s.code === 'C2' || s.code === 'M1' ? 1.12 : 1; // the bottleneck (the cab on the Isuzu line, the marriage on the S07 line)
    let minutes = Math.round(s.standardMinutes * slow * between(r, 0.9, 1.4));
    const visit: DemoVisit = { code: s.code, name: s.name, kind: s.kind, sort: i, standardMinutes: s.standardMinutes, checks: s.checks, results: [], status: 'PENDING', operator: null, startedAt: null, finishedAt: null, passedBy: null, passedAt: null, notes: null };
    v.visits.push(visit);
    if (startedAt > now) break;
    const who = s.kind === 'GATE' ? operator : s.kind === 'TEST' ? OPERATORS[(seq + 1) % OPERATORS.length]! : operator;
    visit.operator = who; visit.startedAt = startedAt; visit.status = 'IN_PROGRESS';
    if (s.kind === 'GATE') gateRecorder = who;
    // A defect here? Roughly 0.35 per vehicle over the route, more at the bottleneck and the tests.
    const p = (s.code === 'C2' || s.code === 'M1' || s.kind === 'TEST' ? 0.045 : 0.022) * (seq % 5 === 0 ? 1.6 : 1);
    const seedList = seeds[s.code] ?? [];
    const defectHere = seedList.length && chance(r, p) ? pick(r, seedList) : null;
    const checkAt = (k: number) => plusMin(startedAt, Math.round(((k + 1) / s.checks.length) * minutes * 0.85));
    const results: CheckResult[] = s.checks.map((c) => ({ code: c.code, pass: true, value: c.type === 'MEASURE' ? measured(r, c) : null, note: null }));
    let finishedAt = addWorkingMinutes(startedAt, minutes);
    if (defectHere) {
      const k = s.checks.findIndex((c) => c.code === defectHere.check);
      const failAt = checkAt(Math.max(0, k));
      const type = DEFECT_TYPES.find((x) => x.code === defectHere.type)!;
      const severity: Severity = type.defaultSeverity;
      const d: DemoDefect = { seq: input.nextDefect(), stationCode: s.code, checkCode: defectHere.check, location: defectHere.location, type: defectHere.type, cause: defectHere.cause, severity, description: defectHere.text, status: 'OPEN', raisedBy: who, raisedAt: plusMin(failAt, 4), reworkNote: null, reworkedBy: null, reworkedAt: null, verifiedBy: null, verifiedAt: null, verifyNote: null };
      v.defects.push(d);
      const failed: CheckResult = { code: defectHere.check, pass: false, value: s.checks[k]?.type === 'MEASURE' ? outOfLimits(r, s.checks[k]!) : null, note: null };
      if (d.raisedAt > now) { // failed just now, not yet raised
        v.defects.pop();
        visit.results = results.slice(0, Math.max(1, k)).concat([failed]);
        v.currentStation = s.code;
        break;
      }
      // Rework by the line, verification by quality (never the same person), the check recorded again.
      const reworkedAt = addWorkingMinutes(d.raisedAt, Math.round(between(r, 25, 80)));
      const verifiedAt = addWorkingMinutes(reworkedAt, Math.round(between(r, 15, 60)));
      if (reworkedAt > now || verifiedAt > now) {
        if (reworkedAt <= now) { d.status = 'REWORKED'; d.reworkNote = defectHere.rework; d.reworkedBy = who; d.reworkedAt = reworkedAt; }
        visit.status = 'FAILED'; visit.results = results.slice(0, Math.max(1, k)).concat([failed]);
        v.currentStation = s.code;
        break;
      }
      d.status = 'CLOSED'; d.reworkNote = defectHere.rework; d.reworkedBy = who; d.reworkedAt = reworkedAt; d.verifiedBy = 'qc'; d.verifiedAt = verifiedAt;
      if (severity === 'C' && s.kind === 'GATE') { d.status = 'OPEN'; d.reworkNote = null; d.reworkedBy = null; d.reworkedAt = null; d.verifiedBy = null; d.verifiedAt = null; } // cosmetic, left for the yard to polish
      results[k]!.note = d.status === 'CLOSED' ? `Re-recorded after DEF ${d.seq} was put right` : null;
      minutes += Math.round((verifiedAt.getTime() - failAt.getTime()) / 60_000);
      finishedAt = later(addWorkingMinutes(startedAt, minutes), plusMin(verifiedAt, 10));
    }
    if (finishedAt > now) { // at this station now, some checks recorded
      const doneChecks = Math.max(0, Math.floor(((now.getTime() - startedAt.getTime()) / (finishedAt.getTime() - startedAt.getTime())) * s.checks.length) - 1);
      visit.results = results.slice(0, doneChecks);
      v.currentStation = s.code;
      break;
    }
    visit.results = results; visit.finishedAt = finishedAt;
    stationFree.set(s.code, finishedAt);
    if (s.kind === 'GATE') {
      visit.status = 'DONE';
      const passedAt = addWorkingMinutes(finishedAt, Math.round(between(r, 15, 50)));
      if (passedAt > now) { v.currentStation = s.code; break; }
      visit.status = 'PASSED'; visit.passedBy = gateRecorder === 'qc' ? 'qs' : 'qc'; visit.passedAt = passedAt;
      v.gatePassedAt = passedAt; v.stage = 'QA'; v.currentStation = s.code;
      v.sapEquipment = String(100_000_030_000 + seq);
      afterGate(input, v, passedAt);
      break;
    }
    visit.status = 'PASSED'; visit.passedBy = who; visit.passedAt = finishedAt;
    t = finishedAt;
    v.currentStation = route.stations[i + 1]?.code ?? s.code;
  }
  return v;
}

const measured = (r: Rng, c: StationCheck) => Math.round(((c.min ?? 0) + ((c.max ?? 0) - (c.min ?? 0)) * between(r, 0.3, 0.75)) * 10) / 10;
const outOfLimits = (r: Rng, c: StationCheck) => Math.round(((c.min ?? 0) - ((c.max ?? 1) - (c.min ?? 0)) * between(r, 0.2, 0.8)) * 10) / 10;

/** QA audit of a sample (one in three), then PDI the next working day; one audit in the story fails and sends its vehicle back. */
function afterGate(input: BuildInput, v: DemoVehicle, passedAt: Date) {
  const { r, now, seq } = input;
  // QA audit on every third gated vehicle, within two hours of the gate.
  if (seq % 3 === 0) {
    const startedAt = addWorkingMinutes(passedAt, Math.round(between(r, 30, 120)));
    if (startedAt <= now) {
      const findings: AuditFinding[] = [];
      const n = seq % 9 === 0 ? 2 : seq % 6 === 0 ? 1 : 0;
      for (let i = 0; i < n; i += 1) { const [section, severity, description] = AUDIT_FINDINGS[(seq + i * 2) % 6]!; findings.push({ section, severity, description }); }
      const fails = seq === 27; // the one that fails: an A finding
      if (fails) { const [section, severity, description] = AUDIT_FINDINGS[6]!; findings.push({ section, severity, description }); }
      const demerits = findings.reduce((d, f) => d + (f.severity === 'A' ? 10 : f.severity === 'B' ? 5 : 1), 0);
      const finishedAt = addWorkingMinutes(startedAt, Math.round(between(r, 40, 70)));
      const audit: DemoAudit = { seq: input.nextAudit(), auditor: 'qa', findings, demerits, result: null, notes: null, startedAt, finishedAt: null };
      v.audits.push(audit);
      if (finishedAt > now) return; // being audited now
      audit.finishedAt = finishedAt; audit.result = fails || demerits >= 20 ? 'FAIL' : 'PASS';
      audit.notes = audit.result === 'PASS' ? (findings.length ? 'Findings polished out in the yard.' : 'Clean.') : 'Fuel return union weeping under pressure: back to the line for the union and a pressure test.';
      if (audit.result === 'FAIL') {
        // Back to the line: the gate is failed, the findings are defects; the vehicle sits at G1 in rework now.
        const gate = v.visits.find((x) => x.kind === 'GATE')!;
        gate.status = 'FAILED'; gate.passedBy = null; gate.passedAt = null; gate.finishedAt = null;
        v.stage = 'LINE'; v.gatePassedAt = null; v.sapEquipment = null; v.currentStation = gate.code;
        for (const f of findings) {
          const d: DemoDefect = { seq: input.nextDefect(), stationCode: gate.code, checkCode: null, location: f.section === 'ENG' ? 'PT' : f.section === 'INT' ? 'IN' : f.section === 'ELE' ? 'EL' : f.section === 'UND' ? 'FR' : 'CB', type: 'FUNC', cause: 'UNK', severity: f.severity, description: `QA audit QAA ${audit.seq}: ${f.description}`, status: 'OPEN', raisedBy: 'qa', raisedAt: finishedAt, reworkNote: null, reworkedBy: null, reworkedAt: null, verifiedBy: null, verifiedAt: null, verifyNote: null };
          const reworkedAt = addWorkingMinutes(finishedAt, 120);
          if (f.severity !== 'A' && reworkedAt <= now) { d.status = 'REWORKED'; d.reworkNote = 'Put right at the gate'; d.reworkedBy = 'op2'; d.reworkedAt = reworkedAt; }
          v.defects.push(d);
        }
        return;
      }
    }
  }
  // PDI: the bay takes one vehicle at a time from the next working morning; about three hours; one in seven needs rework; one in nine is rejected once.
  const tpl = PDI_TEMPLATES[v.family];
  const bayAt = addWorkingMinutes(later(addWorkingMinutes(passedAt, 6 * 60), input.pdiFree.at), 0);
  const startedAt = bayAt;
  if (startedAt > now) return; // waiting for PDI
  const inspector = 'pdi1';
  const makeItems = (): DemoPdiItem[] => tpl.items.map((it, i) => ({ code: it.code, section: it.section, label: it.label, sort: i, allowNa: !!it.allowNa, result: null, defect: null, reworkNote: null, reworkedAt: null, reworkedBy: null, checkedBy: null, checkedAt: null }));
  const readings = { odometerKm: 8 + (seq % 20), batteryVolts: Math.round(between(r, 12.5, 12.9) * 10) / 10, tyreFrontPsi: v.family === 'isuzu-n' ? 85 : 35, tyreRearPsi: v.family === 'isuzu-n' ? 95 : 33 };
  const faults = seq % 4 === 0 ? [PDI_FAULTS[seq % PDI_FAULTS.length]!] : [];
  const pdi: DemoPdi = { seq: input.nextPdi(), attempt: 1, templateKey: tpl.key, templateVersion: tpl.version, status: 'IN_PROGRESS', ...readings, faultScanDone: true, faultCodes: faults, faultCodesCleared: faults.length > 0, notes: null, inspector, startedAt, submittedAt: null, decidedBy: null, decidedAt: null, decisionNote: null, sapUsageDecision: null, items: makeItems() };
  v.pdis.push(pdi);
  v.stage = 'PDI';
  const minutes = Math.round(between(r, 150, 200));
  const doneAt = addWorkingMinutes(startedAt, minutes);
  const rework = seq % 7 === 3;
  pdi.items.forEach((it, i) => {
    const checkedAt = plusMin(startedAt, Math.round(((i + 1) / pdi.items.length) * minutes));
    if (checkedAt > now) return;
    it.checkedBy = inspector; it.checkedAt = checkedAt; it.result = it.allowNa && i % 11 === 5 ? 'NA' : 'OK';
    if (rework && it.code.startsWith('EL') && i % 5 === 2) { it.result = 'NOT_OK'; it.defect = 'Right indicator lamp not flashing'; }
  });
  input.pdiFree.at = doneAt;
  if (doneAt > now) return;
  let ready = doneAt;
  if (rework) {
    pdi.status = 'REWORK';
    const fixedAt = addWorkingMinutes(doneAt, 95);
    if (fixedAt > now) return;
    for (const it of pdi.items) if (it.result === 'NOT_OK') { it.result = 'OK'; it.reworkNote = 'Bulb holder re-seated; flashes'; it.reworkedAt = fixedAt; it.reworkedBy = inspector; }
    ready = fixedAt;
  }
  const submittedAt = addWorkingMinutes(ready, 5);
  if (submittedAt > now) return;
  pdi.status = 'SUBMITTED'; pdi.submittedAt = submittedAt;
  const decidedAt = addWorkingMinutes(submittedAt, Math.round(between(r, 40, 150)));
  if (decidedAt > now) return;
  pdi.decidedBy = 'pdi2'; pdi.decidedAt = decidedAt;
  if (seq % 9 === 5) {
    // Rejected once (usage decision R): the inspector puts it right and sends it again; then accepted.
    pdi.status = 'REWORK'; pdi.sapUsageDecision = 'R'; pdi.decisionNote = 'Rejected: the handover film was not removed and the fuel is below delivery level. Re-inspect.';
    const again = addWorkingMinutes(decidedAt, 60);
    if (again > now) return;
    for (const it of pdi.items) if (it.code.startsWith('HO')) { it.reworkNote = 'Film removed, fuel topped to delivery level'; it.reworkedAt = again; it.reworkedBy = inspector; }
    pdi.status = 'SUBMITTED'; pdi.submittedAt = again; pdi.decidedBy = null; pdi.decidedAt = null; pdi.sapUsageDecision = null;
    const second = addWorkingMinutes(again, 45);
    if (second > now) return;
    pdi.decidedBy = 'pdi2'; pdi.decidedAt = second; pdi.decisionNote = 'Accepted on the second inspection.';
  }
  pdi.status = 'PASSED'; pdi.sapUsageDecision = 'A';
  v.stage = 'YARD';
}
