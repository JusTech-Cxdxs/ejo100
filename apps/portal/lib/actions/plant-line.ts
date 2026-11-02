'use server';

/**
 * The assembly plant, D3: the line.
 *
 *   a vehicle released from its kit (or registered at the plant) starts its
 *   build: the live route for its model family is snapshotted into station
 *   visits → at each station the operator records the checks (pass/fail, or
 *   a measurement against limits) and the time; a failed check raises a
 *   defect from the catalogue (severity A/B/C) → defects are reworked and
 *   then verified by a second person → the final gate (quality, never the
 *   person who recorded its checks) passes the vehicle: never with an open
 *   A- or B-defect → the vehicle is ready for PDI; a sample is audited and
 *   scored by QA, a failed audit goes back to rework.
 *
 * Rules: lib/plant/line.ts. Every read and write is fenced to the person's
 * organisation and the assembly-plant branches in their reach; every change
 * compares status before writing; nothing is deleted.
 */
import { prisma, Prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, refuseDuringAssist, typedReach, type TypedReach } from '@/lib/authz/server';
import { AREA_BRANCH_TYPES } from '@/lib/branch-types';
import { writeAuditLog } from '@/lib/workshop-core';
import { liveRoute, startBuildFor } from '@/lib/plant/build-server';
import { lagosYear } from '@/lib/utils/format-date';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { modelByCode, PLANT_STAGE_WORDS, type PdiFamily, type PlantStage } from '@/lib/plant/pdi';
import {
  AUDIT_SECTIONS, DEFAULT_ROUTES, DEFECT_CAUSES, DEFECT_LOCATIONS, DEFECT_TYPES, DEFECT_UNRESOLVED, auditScore, defectWords, defectsPerUnit, firstTimeThrough, gateVerdict, isSeverity, judgeCheck, minutesBetween, parseRouteText, stationBlockers, stationTimes,
  type AuditFinding, type CheckResult, type DefectStatus, type RouteStation, type Severity, type StationCheck, type StationKind, type VisitStatus,
} from '@/lib/plant/line';

export type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const clean = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const OPERATE_ONLY = 'Working the line is for the plant’s production and quality teams.';
const GATE_ONLY = 'The quality gate is for the QC inspector, the quality supervisor or the plant manager.';

async function lineFence(): Promise<{ organisationId: string; branch: TypedReach['where']; reach: TypedReach }> {
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new Error('The assembly plant belongs to an organisation: you are not in one.');
  const reach = await typedReach('plant.view', AREA_BRANCH_TYPES.plant);
  return { organisationId, branch: reach.where, reach };
}

/** One vehicle in the plant, inside the person's organisation and plant reach, with its visits and defects. */
async function myBuild(vehicleId: string) {
  const f = await lineFence();
  return prisma.plantVehicle.findFirst({
    where: { id: String(vehicleId ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch },
    include: { stationVisits: { orderBy: { sort: 'asc' } }, defects: { orderBy: { raisedAt: 'asc' } }, branch: { select: { name: true, sapPlant: true } }, qaAudits: { orderBy: { startedAt: 'desc' }, take: 5 } },
  });
}

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!u.length) return new Map();
  return new Map((await prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, fullName: true } })).map((x) => [x.id, x.fullName]));
}

async function nextNumber(prefixWord: 'DEF' | 'QAA', tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const prefix = `${prefixWord}-${lagosYear()}-`;
  const rows = prefixWord === 'DEF'
    ? await tx.plantDefect.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 })
    : await tx.plantQaAudit.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 });
  return `${prefix}${String(highestSequence(prefix, rows.map((r) => r.number)) + 1).padStart(6, '0')}`;
}

const asStations = (j: unknown): RouteStation[] => (Array.isArray(j) ? (j as RouteStation[]) : []);
const asChecks = (j: unknown): StationCheck[] => (Array.isArray(j) ? (j as StationCheck[]) : []);
const asResults = (j: unknown): CheckResult[] => (Array.isArray(j) ? (j as CheckResult[]) : []);
const familyOf = (modelCode: string): PdiFamily | null => modelByCode(modelCode)?.family ?? null;

// ── Routes ──────────────────────────────────────────────────────────────

export type RouteView = { id: string | null; familyKey: PdiFamily; name: string; version: number; stations: RouteStation[]; text: string; isDefault: boolean; updatedAt: Date | null; vehiclesOnIt: number };


/** The routes of the plant in reach (one per model family), with the text the manager edits. */
export async function listRoutes(): Promise<{ plant: { id: string; name: string } | null; routes: RouteView[]; may: { manage: boolean } }> {
  await authorize('plant.view', undefined, 'listRoutes', 'The assembly plant is for the plant team.');
  const f = await lineFence();
  const plant = f.reach.branches[0] ?? null;
  const manage = await allows('plant.route.manage');
  if (!plant) return { plant: null, routes: [], may: { manage } };
  const routes: RouteView[] = [];
  for (const key of Object.keys(DEFAULT_ROUTES) as PdiFamily[]) {
    const r = await liveRoute(plant.id, key);
    const stations = r ? asStations(r.stations) : DEFAULT_ROUTES[key].stations;
    const vehiclesOnIt = r ? await prisma.plantVehicle.count({ where: { routeId: r.id, stage: { in: ['LINE', 'QA'] } } }) : 0;
    routes.push({ id: r?.id ?? null, familyKey: key, name: r?.name ?? DEFAULT_ROUTES[key].name, version: r?.version ?? 0, stations, text: routeToTextSafe(stations), isDefault: !r, updatedAt: r?.updatedAt ?? null, vehiclesOnIt });
  }
  return { plant: { id: plant.id, name: plant.name }, routes, may: { manage } };
}
function routeToTextSafe(stations: RouteStation[]): string {
  return stations.map((s) => [`# ${s.code} | ${s.name} | ${s.kind} | ${s.standardMinutes} min`, ...s.checks.map((c) => (c.type === 'MEASURE' ? `${c.code} | ${c.label} | ${c.unit ?? ''} | ${c.min ?? ''} | ${c.max ?? ''}` : `${c.code} | ${c.label}`))].join('\n')).join('\n\n');
}

/** Saves a route as a new version (the old one is kept; vehicles already on the line keep their stations). Checked line by line first. */
export async function saveRoute(familyKey: string, name: string, text: string): Promise<Done<{ version: number; problems?: string[] }>> {
  await authorize('plant.route.manage', undefined, 'saveRoute', 'Editing routes is for the production supervisor, quality supervisor or plant manager.');
  try { await refuseDuringAssist('saveRoute'); } catch (e) { return fail((e as Error).message); }
  const me = await getPrincipal();
  const f = await lineFence();
  const plants = (await typedReach('plant.route.manage', AREA_BRANCH_TYPES.plant, { lens: false })).branches;
  const plant = f.reach.branches[0] ?? plants[0];
  if (!plant) return fail('No assembly plant is in your reach.');
  if (!(familyKey in DEFAULT_ROUTES)) return fail('Choose the model family.');
  const key = familyKey as PdiFamily;
  const parsed = parseRouteText(text);
  if (parsed.problems.length) return { ok: false, error: `Nothing was saved. ${parsed.problems.slice(0, 5).join(' ')}${parsed.problems.length > 5 ? ` And ${parsed.problems.length - 5} more.` : ''}` };
  const routeName = clean(name, 80) ?? DEFAULT_ROUTES[key].name;
  const saved = await prisma.$transaction(async (tx) => {
    const latest = await tx.plantRoute.findFirst({ where: { branchId: plant.id, familyKey: key }, orderBy: { version: 'desc' }, select: { version: true } });
    await tx.plantRoute.updateMany({ where: { branchId: plant.id, familyKey: key, isActive: true }, data: { isActive: false } });
    return tx.plantRoute.create({ data: { organisationId: f.organisationId, branchId: plant.id, familyKey: key, version: (latest?.version ?? 0) + 1, name: routeName, stations: parsed.stations as unknown as Prisma.InputJsonValue, createdById: me.userId }, select: { id: true, version: true } });
  });
  await writeAuditLog({ userId: me.userId, action: 'plant.route_saved', entityType: 'PlantRoute', entityId: saved.id, metadata: { family: key, version: saved.version, stations: parsed.stations.length, checks: parsed.stations.reduce((n, s) => n + s.checks.length, 0) } });
  return { ok: true, version: saved.version };
}

// ── Starting a build ────────────────────────────────────────────────────

/**
 * Starts (or resumes) a vehicle's build: the live route for its family is
 * snapshotted into station visits. Called when a kit is released, and from
 * the line board for a vehicle registered at the plant without a kit.
 */
export async function startBuild(vehicleId: string): Promise<Done<{ stations: number; reused?: boolean }>> {
  await authorize('plant.line.operate', undefined, 'startBuild', OPERATE_ONLY);
  const v = await myBuild(vehicleId);
  if (!v) return fail('This vehicle is not available.');
  const me = await getPrincipal();
  return startBuildFor({ vehicleId: v.id, branchId: v.branchId, organisationId: v.organisationId, modelCode: v.modelCode, vin: v.vin, stage: v.stage as PlantStage, existingVisits: v.stationVisits.length, userId: me.userId });
}

// ── Reading ─────────────────────────────────────────────────────────────

export type BoardVehicle = { id: string; vin: string; modelCode: string; station: string | null; stationName: string | null; status: VisitStatus | null; minutesHere: number | null; openDefects: number; aDefects: number; lineStartedAt: Date | null };
export type LineBoard = {
  plant: { id: string; name: string } | null;
  stations: { code: string; name: string; kind: StationKind; standardMinutes: number; vehicles: BoardVehicle[]; median: number | null }[];
  unstarted: { id: string; vin: string; modelCode: string }[];
  readyForPdi: BoardVehicle[];
  figures: { onLine: number; inRework: number; passedToday: number; ftt: number | null; dpu: number | null; openA: number; topDefects: { words: string; count: number }[] };
  may: { operate: boolean; gate: boolean; audit: boolean; manage: boolean };
};

/** The line board: every vehicle at its station, with its defects and time there; the plant's figures for the last 30 days. */
export async function getLineBoard(): Promise<LineBoard> {
  await authorize('plant.view', undefined, 'getLineBoard', 'The assembly plant is for the plant team.');
  const f = await lineFence();
  const plant = f.reach.branches[0] ?? null;
  const [operate, gate, audit, manage] = await Promise.all([allows('plant.line.operate'), allows('plant.quality.gate'), allows('plant.qa.audit'), allows('plant.route.manage')]);
  const may = { operate, gate, audit, manage };
  if (!plant) return { plant: null, stations: [], unstarted: [], readyForPdi: [], figures: { onLine: 0, inRework: 0, passedToday: 0, ftt: null, dpu: null, openA: 0, topDefects: [] }, may };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [vehicles, defects30, built30, visits30] = await Promise.all([
    prisma.plantVehicle.findMany({ where: { organisationId: f.organisationId, ...f.branch, stage: { in: ['LINE', 'QA'] } }, orderBy: { lineStartedAt: 'asc' }, include: { stationVisits: { orderBy: { sort: 'asc' } }, defects: { where: { status: { in: DEFECT_UNRESOLVED } }, select: { severity: true } } } }),
    prisma.plantDefect.findMany({ where: { organisationId: f.organisationId, ...f.branch, raisedAt: { gte: since } }, select: { location: true, type: true, cause: true, plantVehicleId: true } }),
    prisma.plantVehicle.findMany({ where: { organisationId: f.organisationId, ...f.branch, gatePassedAt: { gte: since } }, select: { id: true, gatePassedAt: true, _count: { select: { defects: true } } } }),
    prisma.plantStationVisit.findMany({ where: { organisationId: f.organisationId, ...f.branch, finishedAt: { gte: since } }, select: { code: true, name: true, standardMinutes: true, startedAt: true, finishedAt: true } }),
  ]);
  // The station columns: the live route of the family with the most vehicles (the board is per line; mixed families show the union).
  const columns = new Map<string, { code: string; name: string; kind: StationKind; standardMinutes: number; vehicles: BoardVehicle[] }>();
  for (const key of Object.keys(DEFAULT_ROUTES) as PdiFamily[]) {
    const r = await liveRoute(plant.id, key);
    for (const s of r ? asStations(r.stations) : DEFAULT_ROUTES[key].stations) if (!columns.has(s.code)) columns.set(s.code, { code: s.code, name: s.name, kind: s.kind, standardMinutes: s.standardMinutes, vehicles: [] });
  }
  const unstarted: LineBoard['unstarted'] = [];
  const readyForPdi: BoardVehicle[] = [];
  let inRework = 0;
  for (const v of vehicles) {
    if (!v.stationVisits.length) { unstarted.push({ id: v.id, vin: v.vin, modelCode: v.modelCode }); continue; }
    const current = v.stationVisits.find((x) => x.code === v.currentStation) ?? v.stationVisits.find((x) => x.status !== 'PASSED') ?? v.stationVisits[v.stationVisits.length - 1]!;
    const row: BoardVehicle = { id: v.id, vin: v.vin, modelCode: v.modelCode, station: current.code, stationName: current.name, status: current.status as VisitStatus, minutesHere: minutesBetween(current.startedAt ?? (v.stationVisits.find((x) => x.sort === current.sort - 1)?.finishedAt ?? v.lineStartedAt), new Date()), openDefects: v.defects.length, aDefects: v.defects.filter((d) => d.severity === 'A').length, lineStartedAt: v.lineStartedAt };
    if (v.defects.length && (current.status === 'FAILED' || row.aDefects)) inRework += 1;
    if (v.gatePassedAt || v.stage === 'QA') { readyForPdi.push(row); continue; }
    const col = columns.get(current.code) ?? (() => { const c = { code: current.code, name: current.name, kind: current.kind as StationKind, standardMinutes: current.standardMinutes, vehicles: [] as BoardVehicle[] }; columns.set(current.code, c); return c; })();
    col.vehicles.push(row);
  }
  const times = stationTimes(visits30.map((x) => ({ code: x.code, name: x.name, standardMinutes: x.standardMinutes, minutes: minutesBetween(x.startedAt, x.finishedAt) })));
  const byDefect = new Map<string, number>();
  for (const d of defects30) byDefect.set(defectWords(d.location, d.type, d.cause), (byDefect.get(defectWords(d.location, d.type, d.cause)) ?? 0) + 1);
  const ftt = firstTimeThrough(built30.map((b) => ({ passedGate: true, defects: b._count.defects })));
  return {
    plant: { id: plant.id, name: plant.name },
    stations: [...columns.values()].map((c) => ({ ...c, median: times.find((t) => t.code === c.code)?.median ?? null })),
    unstarted, readyForPdi,
    figures: {
      onLine: vehicles.filter((v) => v.stationVisits.length && !v.gatePassedAt && v.stage === 'LINE').length, inRework,
      passedToday: built30.filter((b) => b.gatePassedAt && b.gatePassedAt >= dayStart).length,
      ftt: ftt.ftt, dpu: defectsPerUnit(defects30.length, built30.length || vehicles.length), openA: vehicles.reduce((n, v) => n + v.defects.filter((d) => d.severity === 'A').length, 0),
      topDefects: [...byDefect.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([words, count]) => ({ words, count })),
    },
    may,
  };
}

export type BuildView = {
  vehicle: { id: string; vin: string; modelCode: string; modelName: string; engineNumber: string | null; stage: PlantStage; stageWords: string; branch: string; sapPlant: string | null; route: string; lineStartedAt: Date | null; gatePassedAt: Date | null; currentStation: string | null };
  stations: { id: string; code: string; name: string; kind: StationKind; sort: number; standardMinutes: number; status: VisitStatus; checks: StationCheck[]; results: CheckResult[]; operator: string | null; startedAt: Date | null; finishedAt: Date | null; minutes: number | null; passedBy: string | null; passedAt: Date | null; notes: string | null; blockers: string[]; defects: number }[];
  defects: { id: string; number: string; stationCode: string | null; checkCode: string | null; words: string; code: string; severity: Severity; description: string; status: DefectStatus; raisedBy: string; raisedAt: Date; reworkNote: string | null; reworkedBy: string | null; reworkedAt: Date | null; verifiedBy: string | null; verifiedAt: Date | null; verifyNote: string | null }[];
  audits: { id: string; number: string; auditor: string; result: string | null; demerits: number; startedAt: Date; finishedAt: Date | null }[];
  gate: { ok: boolean; why: string[]; mayPass: boolean; why_not: string | null };
  catalogue: { locations: typeof DEFECT_LOCATIONS; types: typeof DEFECT_TYPES; causes: typeof DEFECT_CAUSES };
  may: { operate: boolean; gate: boolean; audit: boolean };
};

/** One vehicle's build: every station with its checks and results, its defects, its audits, and what this person may do. */
export async function getBuild(vehicleId: string): Promise<BuildView | null> {
  await authorize('plant.view', undefined, 'getBuild', 'The assembly plant is for the plant team.');
  const v = await myBuild(vehicleId);
  if (!v) return null;
  const me = await getPrincipal();
  const [operate, gate, audit] = await Promise.all([allows('plant.line.operate'), allows('plant.quality.gate'), allows('plant.qa.audit')]);
  const names = await userNames([...v.stationVisits.flatMap((s) => [s.operatorId, s.passedById]), ...v.defects.flatMap((d) => [d.raisedById, d.reworkedById, d.verifiedById]), ...v.qaAudits.map((a) => a.auditorId)]);
  const model = modelByCode(v.modelCode);
  const stations = v.stationVisits.map((s) => {
    const checks = asChecks(s.checks); const results = asResults(s.results);
    return { id: s.id, code: s.code, name: s.name, kind: s.kind as StationKind, sort: s.sort, standardMinutes: s.standardMinutes, status: s.status as VisitStatus, checks, results, operator: s.operatorId ? names.get(s.operatorId) ?? null : null, startedAt: s.startedAt, finishedAt: s.finishedAt, minutes: minutesBetween(s.startedAt, s.finishedAt), passedBy: s.passedById ? names.get(s.passedById) ?? null : null, passedAt: s.passedAt, notes: s.notes, blockers: ['PENDING', 'IN_PROGRESS', 'FAILED'].includes(s.status) ? stationBlockers(checks, results) : [], defects: v.defects.filter((d) => d.visitId === s.id).length };
  });
  const gateVisit = v.stationVisits.find((s) => s.kind === 'GATE');
  const verdict = gateVerdict({ stations: stations.map((s) => ({ code: s.code, kind: s.kind, status: s.status })), defects: v.defects.map((d) => ({ severity: d.severity as Severity, status: d.status as DefectStatus })), gateResults: gateVisit ? asResults(gateVisit.results) : [] });
  const recordedGate = gateVisit?.operatorId === me.userId;
  const route = v.routeId ? await prisma.plantRoute.findUnique({ where: { id: v.routeId }, select: { name: true, version: true } }) : null;
  return {
    vehicle: { id: v.id, vin: v.vin, modelCode: v.modelCode, modelName: model?.name ?? v.modelCode, engineNumber: v.engineNumber, stage: v.stage as PlantStage, stageWords: PLANT_STAGE_WORDS[v.stage as PlantStage] ?? v.stage, branch: v.branch.name, sapPlant: v.branch.sapPlant, route: route ? `${route.name} (version ${route.version})` : model ? `${DEFAULT_ROUTES[model.family].name} (default)` : '—', lineStartedAt: v.lineStartedAt, gatePassedAt: v.gatePassedAt, currentStation: v.currentStation },
    stations,
    defects: v.defects.map((d) => ({ id: d.id, number: d.number, stationCode: d.stationCode, checkCode: d.checkCode, words: defectWords(d.location, d.type, d.cause), code: `${d.location}-${d.type}-${d.cause}`, severity: d.severity as Severity, description: d.description, status: d.status as DefectStatus, raisedBy: names.get(d.raisedById) ?? 'Someone', raisedAt: d.raisedAt, reworkNote: d.reworkNote, reworkedBy: d.reworkedById ? names.get(d.reworkedById) ?? null : null, reworkedAt: d.reworkedAt, verifiedBy: d.verifiedById ? names.get(d.verifiedById) ?? null : null, verifiedAt: d.verifiedAt, verifyNote: d.verifyNote })),
    audits: v.qaAudits.map((a) => ({ id: a.id, number: a.number, auditor: names.get(a.auditorId) ?? 'Someone', result: a.result, demerits: a.demerits, startedAt: a.startedAt, finishedAt: a.finishedAt })),
    gate: { ok: verdict.ok, why: verdict.ok ? [] : verdict.why, mayPass: gate && !recordedGate && !v.gatePassedAt && verdict.ok, why_not: v.gatePassedAt ? null : !gate ? GATE_ONLY : recordedGate ? 'You recorded the gate’s checks, so another inspector passes it.' : null },
    catalogue: { locations: DEFECT_LOCATIONS, types: DEFECT_TYPES, causes: DEFECT_CAUSES },
    may: { operate: operate && !v.gatePassedAt, gate, audit },
  };
}

// ── At a station ────────────────────────────────────────────────────────

/** One check's result at a station: pass/fail, or a measurement judged against its limits. The first result starts the station's clock. */
export async function recordCheck(vehicleId: string, stationCode: string, checkCode: string, input: { pass?: boolean; value?: number | string | null; note?: string }): Promise<Done<{ pass: boolean; why: string | null }>> {
  await authorize('plant.line.operate', undefined, 'recordCheck', OPERATE_ONLY);
  const v = await myBuild(vehicleId);
  if (!v) return fail('This vehicle is not available.');
  const me = await getPrincipal();
  const s = v.stationVisits.find((x) => x.code === stationCode);
  if (!s) return fail('That station is not on this vehicle’s route.');
  if (s.status === 'PASSED') return fail('This station is already passed.');
  if (v.gatePassedAt) return fail('This vehicle has passed the gate: its build is finished.');
  // Stations are worked in order: the one before must be done.
  const before = v.stationVisits.filter((x) => x.sort < s.sort && !['DONE', 'PASSED'].includes(x.status));
  if (before.length) return fail(`Finish ${before.map((x) => x.code).join(', ')} first: the line runs in order.`);
  const check = asChecks(s.checks).find((c) => c.code === checkCode);
  if (!check) return fail('That check is not at this station.');
  const judged = judgeCheck(check, input);
  if (check.type === 'MEASURE' && judged.value === null) return fail(judged.why ?? 'Record the measurement.');
  const note = clean(input.note, 300);
  const results = asResults(s.results).filter((r) => r.code !== check.code);
  results.push({ code: check.code, pass: judged.pass, value: judged.value, note });
  const res = await prisma.plantStationVisit.updateMany({
    where: { id: s.id, status: { in: ['PENDING', 'IN_PROGRESS', 'FAILED'] } },
    data: { results: results as unknown as Prisma.InputJsonValue, operatorId: s.operatorId ?? me.userId, startedAt: s.startedAt ?? new Date(), status: s.status === 'FAILED' && judged.pass ? 'IN_PROGRESS' : s.status === 'PENDING' ? 'IN_PROGRESS' : undefined },
  });
  if (!res.count) return fail('This station changed meanwhile. Refresh the page.');
  await prisma.plantVehicle.updateMany({ where: { id: v.id, currentStation: { not: s.code } }, data: { currentStation: s.code } });
  if (!judged.pass) await writeAuditLog({ userId: me.userId, action: 'plant.check_failed', entityType: 'PlantVehicle', entityId: v.id, metadata: { vin: v.vin, station: s.code, check: check.label, value: judged.value, why: judged.why, note } });
  return { ok: true, pass: judged.pass, why: judged.why };
}

/** Finishes a station: every check recorded. Any failed check leaves it FAILED (in rework) until the defect is closed and the check re-recorded; a gate waits for quality. */
export async function finishStation(vehicleId: string, stationCode: string, notes?: string): Promise<Done<{ status: VisitStatus; next: string | null }>> {
  await authorize('plant.line.operate', undefined, 'finishStation', OPERATE_ONLY);
  const v = await myBuild(vehicleId);
  if (!v) return fail('This vehicle is not available.');
  const me = await getPrincipal();
  const s = v.stationVisits.find((x) => x.code === stationCode);
  if (!s) return fail('That station is not on this vehicle’s route.');
  if (!['IN_PROGRESS', 'FAILED'].includes(s.status)) return fail(s.status === 'PENDING' ? 'Record the checks first.' : 'This station is already finished.');
  const checks = asChecks(s.checks); const results = asResults(s.results);
  const blockers = stationBlockers(checks, results);
  if (blockers.length) return fail(blockers.join(' '));
  const failed = results.filter((r) => !r.pass);
  const openHere = v.defects.filter((d) => d.visitId === s.id && DEFECT_UNRESOLVED.includes(d.status as DefectStatus));
  if (failed.length && !v.defects.some((d) => d.visitId === s.id)) return fail(`${failed.length} ${failed.length === 1 ? 'check' : 'checks'} failed: raise the defect (what, where, why) before finishing the station.`);
  let status: VisitStatus;
  if (failed.length || openHere.length) status = 'FAILED';
  else status = s.kind === 'GATE' ? 'DONE' : 'PASSED';
  const next = status === 'PASSED' ? v.stationVisits.find((x) => x.sort > s.sort) ?? null : null;
  const res = await prisma.plantStationVisit.updateMany({ where: { id: s.id, status: { in: ['IN_PROGRESS', 'FAILED'] } }, data: { status, finishedAt: status === 'FAILED' ? null : new Date(), notes: notes === undefined ? s.notes : clean(notes, 500) } });
  if (!res.count) return fail('This station changed meanwhile. Refresh the page.');
  if (next) await prisma.plantVehicle.update({ where: { id: v.id }, data: { currentStation: next.code } });
  await writeAuditLog({ userId: me.userId, action: status === 'FAILED' ? 'plant.station_failed' : 'plant.station_passed', entityType: 'PlantVehicle', entityId: v.id, metadata: { vin: v.vin, station: s.code, name: s.name, minutes: minutesBetween(s.startedAt, new Date()), standard: s.standardMinutes, ...(failed.length ? { failed: failed.map((r) => r.code) } : {}) } });
  return { ok: true, status, next: next?.code ?? null };
}

// ── Defects ─────────────────────────────────────────────────────────────

/** Raises a defect from the catalogue at a station (and, where it came from a check, against that check). */
export async function raiseDefect(vehicleId: string, input: { stationCode?: string; checkCode?: string; location?: string; type?: string; cause?: string; severity?: string; description?: string }): Promise<Done<{ id: string; number: string }>> {
  await authorize('plant.line.operate', undefined, 'raiseDefect', OPERATE_ONLY);
  const v = await myBuild(vehicleId);
  if (!v) return fail('This vehicle is not available.');
  const me = await getPrincipal();
  if (['YARD', 'SOLD'].includes(v.stage)) return fail('This vehicle has left the plant: defects after that are workshop or warranty matters.');
  const s = input.stationCode ? v.stationVisits.find((x) => x.code === input.stationCode) : null;
  if (input.stationCode && !s) return fail('That station is not on this vehicle’s route.');
  const loc = DEFECT_LOCATIONS.find((x) => x.code === input.location); const type = DEFECT_TYPES.find((x) => x.code === input.type); const cause = DEFECT_CAUSES.find((x) => x.code === input.cause);
  if (!loc) return fail('Choose where the defect is.');
  if (!type) return fail('Choose what kind of defect it is.');
  if (!cause) return fail('Choose the cause (or “Under investigation”).');
  const severity: Severity = isSeverity(input.severity) ? input.severity : type.defaultSeverity;
  const description = clean(input.description, 300);
  if (!description) return fail('Describe the defect in a few words.');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const d = await prisma.plantDefect.create({
        data: { number: await nextNumber('DEF'), organisationId: v.organisationId, branchId: v.branchId, plantVehicleId: v.id, visitId: s?.id ?? null, stationCode: s?.code ?? null, checkCode: s && input.checkCode && asChecks(s.checks).some((c) => c.code === input.checkCode) ? input.checkCode : null, location: loc.code, type: type.code, cause: cause.code, severity, description, raisedById: me.userId },
        select: { id: true, number: true },
      });
      if (s && s.status !== 'PASSED') await prisma.plantStationVisit.updateMany({ where: { id: s.id, status: { in: ['IN_PROGRESS', 'DONE'] } }, data: { status: 'FAILED', finishedAt: null } });
      await writeAuditLog({ userId: me.userId, action: 'plant.defect_raised', entityType: 'PlantVehicle', entityId: v.id, metadata: { number: d.number, vin: v.vin, station: s?.code ?? null, defect: defectWords(loc.code, type.code, cause.code), severity, description } });
      return { ok: true, id: d.id, number: d.number };
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return fail('EJO is busy numbering defects. Try again.');
}

/** Records the rework done on a defect (by the line); it then waits for a second person to verify it. */
export async function reworkDefect(defectId: string, note: string): Promise<Done> {
  await authorize('plant.line.operate', undefined, 'reworkDefect', OPERATE_ONLY);
  const f = await lineFence();
  const d = await prisma.plantDefect.findFirst({ where: { id: String(defectId ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch }, include: { vehicle: { select: { id: true, vin: true } } } });
  if (!d) return fail('This defect is not available.');
  const me = await getPrincipal();
  const what = clean(note, 500);
  if (!what || what.length < 3) return fail('Say what was done to put it right.');
  const res = await prisma.plantDefect.updateMany({ where: { id: d.id, status: 'OPEN' }, data: { status: 'REWORKED', reworkNote: what, reworkedById: me.userId, reworkedAt: new Date() } });
  if (!res.count) return fail('Only an open defect can be reworked. Refresh the page.');
  await writeAuditLog({ userId: me.userId, action: 'plant.defect_reworked', entityType: 'PlantVehicle', entityId: d.vehicle.id, metadata: { number: d.number, vin: d.vehicle.vin, rework: what } });
  return { ok: true };
}

/** Verifies (closes) a reworked defect, or sends it back to rework — by a second person, never the one who raised or reworked it. Closing the last defect at a failed station lets the operator re-record its checks. */
export async function verifyDefect(defectId: string, decision: 'close' | 'reopen', note?: string): Promise<Done> {
  try { await refuseDuringAssist('verifyDefect'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.quality.gate', undefined, 'verifyDefect', GATE_ONLY);
  const f = await lineFence();
  const d = await prisma.plantDefect.findFirst({ where: { id: String(defectId ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch }, include: { vehicle: { select: { id: true, vin: true } } } });
  if (!d) return fail('This defect is not available.');
  const me = await getPrincipal();
  if (d.raisedById === me.userId || d.reworkedById === me.userId) return fail('You raised or reworked this defect, so another inspector verifies it.');
  const words = clean(note, 300);
  if (decision === 'reopen') {
    if (!words) return fail('Say what is still wrong.');
    const res = await prisma.plantDefect.updateMany({ where: { id: d.id, status: 'REWORKED' }, data: { status: 'OPEN', verifyNote: words, reworkNote: null, reworkedById: null, reworkedAt: null } });
    if (!res.count) return fail('Only a reworked defect can be sent back. Refresh the page.');
    await writeAuditLog({ userId: me.userId, action: 'plant.defect_reopened', entityType: 'PlantVehicle', entityId: d.vehicle.id, metadata: { number: d.number, vin: d.vehicle.vin, why: words } });
    return { ok: true };
  }
  const res = await prisma.plantDefect.updateMany({ where: { id: d.id, status: 'REWORKED' }, data: { status: 'CLOSED', verifiedById: me.userId, verifiedAt: new Date(), verifyNote: words } });
  if (!res.count) return fail('Only a reworked defect can be verified. Refresh the page.');
  await writeAuditLog({ userId: me.userId, action: 'plant.defect_closed', entityType: 'PlantVehicle', entityId: d.vehicle.id, metadata: { number: d.number, vin: d.vehicle.vin, reworkedById: d.reworkedById, note: words } });
  return { ok: true };
}

// ── The gate ────────────────────────────────────────────────────────────

/** Passes the vehicle through the final gate: never with an open A- or B-defect, a failed check or an unfinished station; never by the person who recorded the gate's checks. The vehicle is ready for PDI (stage QA: a sample is audited). */
export async function passGate(vehicleId: string, note?: string): Promise<Done> {
  try { await refuseDuringAssist('passGate'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.quality.gate', undefined, 'passGate', GATE_ONLY);
  const v = await myBuild(vehicleId);
  if (!v) return fail('This vehicle is not available.');
  const me = await getPrincipal();
  if (v.gatePassedAt) return fail('This vehicle has already passed the gate.');
  const gateVisit = v.stationVisits.find((s) => s.kind === 'GATE');
  if (!gateVisit) return fail('This route has no quality gate.');
  if (gateVisit.operatorId === me.userId) return fail('You recorded the gate’s checks, so another inspector passes it.');
  if (gateVisit.status !== 'DONE') return fail('The gate’s checks are not all recorded and finished yet.');
  const verdict = gateVerdict({ stations: v.stationVisits.map((s) => ({ code: s.code, kind: s.kind as StationKind, status: s.status as VisitStatus })), defects: v.defects.map((d) => ({ severity: d.severity as Severity, status: d.status as DefectStatus })), gateResults: asResults(gateVisit.results) });
  if (!verdict.ok) return fail(verdict.why.join(' '));
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const r = await tx.plantStationVisit.updateMany({ where: { id: gateVisit.id, status: 'DONE' }, data: { status: 'PASSED', passedById: me.userId, passedAt: now, notes: clean(note, 500) ?? gateVisit.notes } });
    if (!r.count) return false;
    await tx.plantVehicle.updateMany({ where: { id: v.id, stage: 'LINE' }, data: { stage: 'QA', gatePassedAt: now, currentStation: gateVisit.code } });
    return true;
  });
  if (!done) return fail('The gate changed meanwhile. Refresh the page.');
  await writeAuditLog({ userId: me.userId, action: 'plant.gate_passed', entityType: 'PlantVehicle', entityId: v.id, metadata: { vin: v.vin, model: v.modelCode, minutesOnLine: minutesBetween(v.lineStartedAt, now), defects: v.defects.length, operatorId: gateVisit.operatorId } });
  return { ok: true };
}

// ── QA audit ────────────────────────────────────────────────────────────

/** Starts an audit of a finished vehicle (past the gate, not yet sold). */
export async function startAudit(vehicleId: string): Promise<Done<{ id: string; number: string }>> {
  await authorize('plant.qa.audit', undefined, 'startAudit', 'QA audits are for the QA auditor, quality supervisor or plant manager.');
  const v = await myBuild(vehicleId);
  if (!v) return fail('This vehicle is not available.');
  const me = await getPrincipal();
  if (!v.gatePassedAt) return fail('Only a vehicle that has passed the final gate is audited.');
  const open = v.qaAudits.find((a) => !a.finishedAt);
  if (open) return { ok: true, id: open.id, number: open.number };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const a = await prisma.plantQaAudit.create({ data: { number: await nextNumber('QAA'), organisationId: v.organisationId, branchId: v.branchId, plantVehicleId: v.id, auditorId: me.userId }, select: { id: true, number: true } });
      await writeAuditLog({ userId: me.userId, action: 'plant.audit_started', entityType: 'PlantVehicle', entityId: v.id, metadata: { number: a.number, vin: v.vin } });
      return { ok: true, id: a.id, number: a.number };
    } catch (e) { if ((e as { code?: string }).code !== 'P2002') throw e; }
  }
  return fail('EJO is busy numbering audits. Try again.');
}

export type AuditView = { id: string; number: string; vehicle: { id: string; vin: string; modelCode: string }; auditor: string; findings: AuditFinding[]; demerits: number; result: string | null; notes: string | null; startedAt: Date; finishedAt: Date | null; sections: typeof AUDIT_SECTIONS; may: { edit: boolean } };

export async function getAudit(id: string): Promise<AuditView | null> {
  await authorize('plant.view', undefined, 'getAudit', 'The assembly plant is for the plant team.');
  const f = await lineFence();
  const a = await prisma.plantQaAudit.findFirst({ where: { id: String(id ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch }, include: { vehicle: { select: { id: true, vin: true, modelCode: true } } } });
  if (!a) return null;
  const names = await userNames([a.auditorId]);
  return { id: a.id, number: a.number, vehicle: a.vehicle, auditor: names.get(a.auditorId) ?? 'Someone', findings: (Array.isArray(a.findings) ? a.findings : []) as AuditFinding[], demerits: a.demerits, result: a.result, notes: a.notes, startedAt: a.startedAt, finishedAt: a.finishedAt, sections: AUDIT_SECTIONS, may: { edit: !a.finishedAt && (await allows('plant.qa.audit')) } };
}

/** Saves the audit's findings (replacing the list) and, when finishing, scores it: an A finding or 20 demerits fails; a failed audit raises each finding as a defect and sends the vehicle back to the line. */
export async function saveAudit(id: string, findings: AuditFinding[], finish: boolean, notes?: string): Promise<Done<{ result: string | null; demerits: number }>> {
  await authorize('plant.qa.audit', undefined, 'saveAudit', 'QA audits are for the QA auditor, quality supervisor or plant manager.');
  const f = await lineFence();
  const a = await prisma.plantQaAudit.findFirst({ where: { id: String(id ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch }, include: { vehicle: true } });
  if (!a) return fail('This audit is not available.');
  const me = await getPrincipal();
  if (a.finishedAt) return fail('This audit is finished.');
  const list: AuditFinding[] = (Array.isArray(findings) ? findings : []).slice(0, 100).map((x) => ({ section: AUDIT_SECTIONS.some((s) => s.code === x.section) ? x.section : 'EXT', severity: isSeverity(x.severity) ? x.severity : 'C', description: clean(x.description, 300) ?? '' })).filter((x) => x.description);
  const score = auditScore(list);
  const res = await prisma.plantQaAudit.updateMany({ where: { id: a.id, finishedAt: null }, data: { findings: list as unknown as Prisma.InputJsonValue, demerits: score.demerits, notes: notes === undefined ? a.notes : clean(notes, 1000), ...(finish ? { result: score.result, finishedAt: new Date() } : {}) } });
  if (!res.count) return fail('This audit changed meanwhile. Refresh the page.');
  if (finish) {
    if (score.result === 'FAIL') {
      // Back to the line: each finding becomes a defect to rework and verify; the gate must be passed again.
      const gate = await prisma.plantStationVisit.findFirst({ where: { plantVehicleId: a.vehicle.id, kind: 'GATE' } });
      await prisma.$transaction(async (tx) => {
        for (const x of list) {
          await tx.plantDefect.create({ data: { number: await nextNumber('DEF', tx), organisationId: a.organisationId, branchId: a.branchId, plantVehicleId: a.vehicle.id, visitId: gate?.id ?? null, stationCode: gate?.code ?? null, location: x.section === 'ENG' ? 'PT' : x.section === 'INT' ? 'IN' : x.section === 'ELE' ? 'EL' : x.section === 'UND' ? 'FR' : 'CB', type: 'FUNC', cause: 'UNK', severity: x.severity, description: `QA audit ${a.number}: ${x.description}`, raisedById: me.userId } });
        }
        if (gate) await tx.plantStationVisit.updateMany({ where: { id: gate.id }, data: { status: 'FAILED', passedById: null, passedAt: null, finishedAt: null } });
        await tx.plantVehicle.updateMany({ where: { id: a.vehicle.id, stage: 'QA' }, data: { stage: 'LINE', gatePassedAt: null, currentStation: gate?.code ?? null } });
      });
    }
    await writeAuditLog({ userId: me.userId, action: score.result === 'FAIL' ? 'plant.audit_failed' : 'plant.audit_passed', entityType: 'PlantVehicle', entityId: a.vehicle.id, metadata: { number: a.number, vin: a.vehicle.vin, demerits: score.demerits, a: score.a, b: score.b, c: score.c } });
  }
  return { ok: true, result: finish ? score.result : null, demerits: score.demerits };
}

/** The plant's audits, newest first, and the finished vehicles not yet audited (today's sample candidates). */
export async function listAudits(): Promise<{ audits: { id: string; number: string; vin: string; modelCode: string; auditor: string; result: string | null; demerits: number; startedAt: Date }[]; candidates: { id: string; vin: string; modelCode: string; gatePassedAt: Date | null }[]; may: { audit: boolean } }> {
  await authorize('plant.view', undefined, 'listAudits', 'The assembly plant is for the plant team.');
  const f = await lineFence();
  const [audits, candidates, may] = await Promise.all([
    prisma.plantQaAudit.findMany({ where: { organisationId: f.organisationId, ...f.branch }, orderBy: { startedAt: 'desc' }, take: 100, include: { vehicle: { select: { vin: true, modelCode: true } } } }),
    prisma.plantVehicle.findMany({ where: { organisationId: f.organisationId, ...f.branch, stage: 'QA', gatePassedAt: { not: null }, qaAudits: { none: {} } }, orderBy: { gatePassedAt: 'desc' }, take: 50, select: { id: true, vin: true, modelCode: true, gatePassedAt: true } }),
    allows('plant.qa.audit'),
  ]);
  const names = await userNames(audits.map((a) => a.auditorId));
  return { audits: audits.map((a) => ({ id: a.id, number: a.number, vin: a.vehicle.vin, modelCode: a.vehicle.modelCode, auditor: names.get(a.auditorId) ?? 'Someone', result: a.result, demerits: a.demerits, startedAt: a.startedAt })), candidates, may: { audit: may } };
}

/** For the dashboard and Approvals: gates waiting for this inspector (never one whose checks they recorded), reworked defects to verify, and the line's own A-defects open. */
export async function getLineDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const [operate, gate] = await Promise.all([allows('plant.line.operate'), allows('plant.quality.gate')]);
  if (!operate && !gate) return [];
  const me = await getPrincipal();
  const f = await lineFence();
  const base = { organisationId: f.organisationId, ...f.branch } as Prisma.PlantStationVisitWhereInput;
  const [gates, reworked, aOpen] = await Promise.all([
    gate ? prisma.plantStationVisit.findMany({ where: { ...base, kind: 'GATE', status: 'DONE', NOT: { operatorId: me.userId } }, take: 20, orderBy: { updatedAt: 'asc' }, include: { vehicle: { select: { id: true, vin: true, modelCode: true } } } }) : [],
    gate ? prisma.plantDefect.findMany({ where: { organisationId: f.organisationId, ...f.branch, status: 'REWORKED', NOT: { OR: [{ raisedById: me.userId }, { reworkedById: me.userId }] } }, take: 20, orderBy: { reworkedAt: 'asc' }, include: { vehicle: { select: { id: true, vin: true } } } }) : [],
    operate ? prisma.plantDefect.findMany({ where: { organisationId: f.organisationId, ...f.branch, status: 'OPEN', severity: 'A' }, take: 20, orderBy: { raisedAt: 'asc' }, include: { vehicle: { select: { id: true, vin: true } } } }) : [],
  ]);
  return [
    ...gates.map((g) => ({ id: `gate-pass-${g.id}`, title: `Pass the gate: ${g.vehicle.vin}`, detail: `${g.vehicle.modelCode} · final inspection recorded`, url: `/plant/line/${g.vehicle.id}`, createdAt: g.updatedAt })),
    ...reworked.map((d) => ({ id: `defect-verify-${d.id}`, title: `Verify rework ${d.number}`, detail: `${d.vehicle.vin} · ${defectWords(d.location, d.type, d.cause)}`, url: `/plant/line/${d.vehicle.id}`, createdAt: d.reworkedAt ?? d.updatedAt })),
    ...aOpen.map((d) => ({ id: `defect-a-${d.id}`, title: `A-defect open ${d.number}`, detail: `${d.vehicle.vin} · ${defectWords(d.location, d.type, d.cause)}`, url: `/plant/line/${d.vehicle.id}`, createdAt: d.raisedAt })),
  ];
}
