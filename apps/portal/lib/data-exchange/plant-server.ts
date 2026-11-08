/**
 * Data Exchange — the assembly plant's records at the cut-over (P8): kit
 * shipments, the vehicles already being built or past the line, the kits of
 * the packing lists and the issues raised against them. Server only (never a
 * 'use server' file): lib/actions/data-exchange.ts checks who is asking,
 * locks the import and calls these inside its transactions.
 *
 * Load them in this order (each file names what the one before brought in):
 *   1. shipments — each becomes an EJO shipment (SHP number), its old reference kept;
 *   2. plant vehicles — on the line they take the plant's live route, the stations
 *      before their current one done before EJO; past the line, the gate passed before EJO;
 *   3. kits — on their shipment, with their model's arrival checklist; one decided
 *      before EJO has its checks recorded as done before EJO, and a released kit is
 *      linked to its vehicle (from step 2) or waits for its slot on the line;
 *   4. kit issues — on their kit, as they stood (open, claimed or resolved).
 * Nothing is emailed and no history is written on the records themselves: any
 * audited step since (on the desk or the line) means someone has used them.
 * Undo moves only what nobody has touched since to the Recycle bin; a record
 * something else now hangs on (a shipment with kits, a kit with issues, a
 * vehicle a kit is linked to) is kept and reported: undo the later file first.
 */
import { prisma, type Prisma } from '@ejo/database';
import {
  checkPlantKitIssueRow, checkPlantKitRow, checkPlantShipmentRow, checkPlantVehicleRow, momentDate,
  type PlantKitIssueValues, type PlantKitValues, type PlantShipmentValues, type PlantVehicleValues,
} from './check-plant';
import type { Checked, Issue } from './check';
import type { Mapping } from './fields';
import { STAFF_AWAITING_INVITATION } from './check-staff';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';
import { highestSequence } from '../recycle-bin/numbers';
import { lagosYear } from '../utils/format-date';
import { modelByCode } from '../plant/pdi';
import { kitTemplateFor } from '../plant/kits';
import { DEFAULT_ROUTES, type RouteStation } from '../plant/line';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type PlantImportJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; createdById: string; approvedById: string | null };
export type PlantEntity = 'plantShipments' | 'plantVehicles' | 'plantKits' | 'plantKitIssues';
export const PLANT_ENTITIES: PlantEntity[] = ['plantShipments', 'plantVehicles', 'plantKits', 'plantKitIssues'];
export const isPlantEntity = (e: string): e is PlantEntity => (PLANT_ENTITIES as string[]).includes(e);

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
const at = (m: { day: string; time: string } | null) => (m ? momentDate(m) : null);
const from = (job: PlantImportJob) => (src(job.sourceSystem) === 'LEGACY' ? 'the plant’s registers' : 'SAP');

type Branch = { name: string; sapPlant: string | null; organisationId: string } | null;
type Person = { id: string; fullName: string };
type Common = { branch: Branch; staff: Map<string, Person>; staffByName: Map<string, Person> };

async function common(db: Db, job: PlantImportJob, people: (string | null)[]): Promise<Common> {
  const keys = [...new Set(people.filter((p): p is string => Boolean(p)))];
  const [branch, staff] = await Promise.all([
    job.branchId ? db.branch.findUnique({ where: { id: job.branchId }, select: { name: true, sapPlant: true, businessUnit: { select: { organisationId: true } } } }) : null,
    keys.length ? db.user.findMany({ where: { organisationId: job.organisationId, AND: [{ OR: [{ isActive: true }, STAFF_AWAITING_INVITATION] }, { OR: [{ employeeId: { in: keys.map((k) => k.toUpperCase()) } }, { fullName: { in: keys, mode: 'insensitive' } }] }] }, select: { id: true, employeeId: true, fullName: true } }) : [],
  ]);
  return {
    branch: branch ? { name: branch.name, sapPlant: branch.sapPlant, organisationId: branch.businessUnit.organisationId } : null,
    staff: new Map(staff.filter((u) => u.employeeId).map((u) => [norm(u.employeeId!), { id: u.id, fullName: u.fullName }])),
    staffByName: new Map(staff.map((u) => [norm(u.fullName), { id: u.id, fullName: u.fullName }])),
  };
}

/** The branch a row names (its name or SAP plant) must be the plant the import loads into. */
function branchProblems(named: string | null, C: Common, job: PlantImportJob, errors: string[], notes: string[]) {
  if (!job.branchId || !C.branch || C.branch.organisationId !== job.organisationId) { errors.push('Choose the assembly plant this import loads into.'); return; }
  if (!named) return;
  const plantCode = /^\d{1,4}$/.test(named.trim());
  if (plantCode && !C.branch.sapPlant) notes.push(`SAP plant ${named.trim()} could not be checked against ${C.branch.name}: the plant has no SAP plant code yet.`);
  else if (!(norm(named) === norm(C.branch.name) || (C.branch.sapPlant ? named.trim().replace(/^0+/, '') === C.branch.sapPlant.replace(/^0+/, '') : false) || norm(C.branch.name).includes(norm(named)))) errors.push(`This row is for “${named}”, but this import loads into ${C.branch.name}. Import it into its own plant.`);
}

function person(C: Common, key: string | null, what: string, notes: string[]): Person | null {
  if (!key) return null;
  const hit = C.staff.get(norm(key)) ?? C.staffByName.get(norm(key)) ?? null;
  if (!hit) notes.push(`${what} “${key}” was not found by employee ID or name; left out.`);
  return hit;
}

/** Turns a checked row and the server's findings into what the check page shows. */
function rowUpdate(id: string, c: Checked<unknown>, found: { errors: string[]; notes: string[]; matchedId?: string | null; matched?: string | null; field: string }): RowUpdate {
  const issues: Issue[] = [...c.issues];
  let status: string = c.status;
  if (status !== 'REJECTED') {
    if (found.matchedId) {
      issues.push({ field: found.field, level: 'warning', message: found.matched ?? 'Already in EJO; left as it is.' });
      return { id, status: 'WARNING', issues, matchedId: found.matchedId, matchedBy: 'existing', keys: c.keys };
    }
    for (const e of found.errors) issues.push({ field: found.field, level: 'error', message: e });
    for (const n of found.notes) issues.push({ field: found.field, level: 'warning', message: n });
    if (found.errors.length) status = 'REJECTED';
    else if (status === 'GOOD' && issues.length) status = 'WARNING';
  }
  return { id, status, issues, matchedId: null, matchedBy: null, keys: c.keys };
}

/** The next SHP or KIT numbers, counting from the highest in use or binned this year (the same rule as the desk). */
export async function nextPlantNumbers(tx: Db, word: 'SHP' | 'KIT', count: number): Promise<string[]> {
  if (!count) return [];
  const prefix = `${word}-${lagosYear()}-`;
  const [latest, binned] = await Promise.all([
    word === 'SHP'
      ? tx.plantShipment.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } })
      : tx.plantKit.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } }),
    tx.recycleBinItem.findFirst({ where: { entityType: word === 'SHP' ? 'PlantShipment' : 'PlantKit', reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } }),
  ]);
  const top = highestSequence(prefix, [latest?.number, binned?.reference]);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(top + 1 + i).padStart(6, '0')}`);
}

// ── Shipments ─────────────────────────────────────────────────────────

type ShipmentLookups = Common & { byRef: Map<string, { id: string; number: string }>; byBl: Map<string, { id: string; number: string }> };

async function shipmentLookups(db: Db, job: PlantImportJob, vals: PlantShipmentValues[]): Promise<ShipmentLookups> {
  const refs = [...new Set(vals.map((v) => v.shipmentRef))];
  const bls = [...new Set(vals.map((v) => v.billOfLading).filter((b): b is string => Boolean(b)))];
  const [C, byRef, byBl] = await Promise.all([
    common(db, job, []),
    refs.length ? db.plantShipment.findMany({ where: { organisationId: job.organisationId, OR: [{ externalSource: src(job.sourceSystem), externalId: { in: refs } }, { number: { in: refs } }] }, select: { id: true, number: true, externalId: true } }) : [],
    bls.length ? db.plantShipment.findMany({ where: { organisationId: job.organisationId, billOfLading: { in: bls } }, select: { id: true, number: true, billOfLading: true } }) : [],
  ]);
  const ref = new Map<string, { id: string; number: string }>();
  for (const s of byRef) { if (s.externalId) ref.set(s.externalId.toUpperCase(), { id: s.id, number: s.number }); ref.set(s.number, { id: s.id, number: s.number }); }
  return { ...C, byRef: ref, byBl: new Map(byBl.map((s) => [String(s.billOfLading).toUpperCase(), { id: s.id, number: s.number }])) };
}

function resolveShipment(v: PlantShipmentValues, L: ShipmentLookups, job: PlantImportJob) {
  const errors: string[] = []; const notes: string[] = [];
  branchProblems(v.branch, L, job, errors, notes);
  const hit = L.byRef.get(v.shipmentRef) ?? null;
  const bl = v.billOfLading ? L.byBl.get(v.billOfLading) ?? null : null;
  if (!hit && bl) errors.push(`Bill of lading ${v.billOfLading} is already on ${bl.number} in EJO: the same B/L is the same shipment.`);
  return { errors, notes, hit };
}

export async function checkPlantShipmentRows(job: PlantImportJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkPlantShipmentRow(r.cells as unknown[], mapping) }));
  const L = await shipmentLookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is PlantShipmentValues => Boolean(v)));
  return checked.map(({ r, c }) => {
    if (!c.values) return rowUpdate(r.id, c, { errors: [], notes: [], field: 'shipmentRef' });
    const res = resolveShipment(c.values, L, job);
    return rowUpdate(r.id, c, { ...res, field: 'shipmentRef', matchedId: res.hit?.id ?? null, matched: res.hit ? `Already brought into EJO as ${res.hit.number}; left as it is.` : null });
  });
}

export async function loadPlantShipmentRows(tx: Tx, job: PlantImportJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkPlantShipmentRow(r.cells as unknown[], mapping) }));
  const L = await shipmentLookups(tx, job, checked.map((x) => x.c.values).filter((v): v is PlantShipmentValues => Boolean(v)));
  const results: Result[] = [];
  const todo: { r: LoadRow; v: PlantShipmentValues; notes: string[] }[] = [];
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const res = resolveShipment(v, L, job);
    if (res.hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: res.hit.id, note: `Already brought into EJO as ${res.hit.number}; left as it is.` }); continue; }
    if (res.errors.length) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] }); continue; }
    todo.push({ r, v, notes: res.notes });
  }
  const numbers = await nextPlantNumbers(tx, 'SHP', todo.length);
  const actor = job.approvedById ?? job.createdById;
  for (const [i, { r, v, notes }] of todo.entries()) {
    const id = newId();
    await tx.plantShipment.create({
      data: {
        id, number: numbers[i]!, organisationId: job.organisationId, branchId: job.branchId!, supplier: v.supplier, origin: v.origin, billOfLading: v.billOfLading, vessel: v.vessel, containers: v.containers,
        arrivedAt: momentDate(v.arrivedAt), sapPurchaseOrder: v.sapPurchaseOrder, sapInboundDelivery: v.sapInboundDelivery,
        notes: [`Brought in from ${from(job)} (shipment ${v.shipmentRef}) by import ${job.number}.`, v.notes].filter(Boolean).join('\n'),
        externalSource: src(job.sourceSystem), externalId: v.shipmentRef, importJobId: job.id, createdById: actor, createdAt: momentDate(v.arrivedAt),
      },
    });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: notes.length ? notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Plant vehicles ────────────────────────────────────────────────────

type VehicleLookups = Common & { existing: Map<string, { id: string; stage: string }>; routes: Map<string, { id: string | null; version: number; stations: RouteStation[] }> };

async function vehicleLookups(db: Db, job: PlantImportJob, vals: PlantVehicleValues[]): Promise<VehicleLookups> {
  const vins = [...new Set(vals.map((v) => v.vinKey))];
  const families = [...new Set(vals.map((v) => modelByCode(v.modelCode)?.family).filter((f): f is NonNullable<typeof f> => Boolean(f)))];
  const [C, existing, routes] = await Promise.all([
    common(db, job, []),
    vins.length ? db.plantVehicle.findMany({ where: { organisationId: job.organisationId, vinKey: { in: vins } }, select: { id: true, vinKey: true, stage: true } }) : [],
    job.branchId && families.length ? db.plantRoute.findMany({ where: { branchId: job.branchId, familyKey: { in: families }, isActive: true }, orderBy: { version: 'desc' } }) : [],
  ]);
  const route = new Map<string, { id: string | null; version: number; stations: RouteStation[] }>();
  for (const f of families) {
    const live = routes.find((r) => r.familyKey === f);
    const stations = live && Array.isArray(live.stations) && (live.stations as unknown[]).length ? (live.stations as unknown as RouteStation[]) : DEFAULT_ROUTES[f].stations;
    route.set(f, { id: live?.id ?? null, version: live?.version ?? 0, stations });
  }
  return { ...C, existing: new Map(existing.map((v) => [v.vinKey, { id: v.id, stage: v.stage }])), routes: route };
}

function resolveVehicle(v: PlantVehicleValues, L: VehicleLookups, job: PlantImportJob) {
  const errors: string[] = []; const notes: string[] = [];
  branchProblems(v.branch, L, job, errors, notes);
  const hit = L.existing.get(v.vinKey) ?? null;
  const route = L.routes.get(modelByCode(v.modelCode)!.family) ?? null;
  let current = 0;
  if (route && v.stage === 'LINE') {
    if (v.currentStation) {
      current = route.stations.findIndex((s) => s.code.toUpperCase() === v.currentStation);
      if (current < 0) errors.push(`Station “${v.currentStation}” is not on the ${modelByCode(v.modelCode)!.make} route at this plant (its stations: ${route.stations.map((s) => s.code).join(', ')}).`);
    } else notes.push(`No current station: it starts at the first, ${route.stations[0]?.code ?? 'the first station'}.`);
  }
  if (route && !route.stations.length) errors.push('The plant’s route for this model has no stations yet: set the route up on the line board first.');
  return { errors, notes, hit, route, current: Math.max(0, current) };
}

export async function checkPlantVehicleRows(job: PlantImportJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkPlantVehicleRow(r.cells as unknown[], mapping) }));
  const L = await vehicleLookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is PlantVehicleValues => Boolean(v)));
  return checked.map(({ r, c }) => {
    if (!c.values) return rowUpdate(r.id, c, { errors: [], notes: [], field: 'vin' });
    const res = resolveVehicle(c.values, L, job);
    return rowUpdate(r.id, c, { ...res, field: 'vin', matchedId: res.hit?.id ?? null, matched: res.hit ? `This VIN is already in the plant in EJO (${res.hit.stage}); left as it is.` : null });
  });
}

export async function loadPlantVehicleRows(tx: Tx, job: PlantImportJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkPlantVehicleRow(r.cells as unknown[], mapping) }));
  const L = await vehicleLookups(tx, job, checked.map((x) => x.c.values).filter((v): v is PlantVehicleValues => Boolean(v)));
  const results: Result[] = [];
  const actor = job.approvedById ?? job.createdById;
  const now = new Date();
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const res = resolveVehicle(v, L, job);
    if (res.hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: res.hit.id, note: `This VIN is already in the plant in EJO (${res.hit.stage}); left as it is.` }); continue; }
    if (res.errors.length || !res.route) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'There is no route for this model.' }); continue; }
    if (seen.has(v.vinKey)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Another row of this file already brought in this VIN.' }); continue; }
    seen.add(v.vinKey);
    const id = newId();
    const onLine = v.stage === 'LINE';
    const stations = res.route.stations;
    const gateAt = at(v.gatePassedAt);
    const lineAt = at(v.lineStartedAt) ?? (onLine ? null : gateAt);
    await tx.plantVehicle.create({
      data: {
        id, organisationId: job.organisationId, branchId: job.branchId!, vin: v.vin, vinKey: v.vinKey, make: v.make, modelCode: v.modelCode, modelName: v.modelName, engineNumber: v.engineNumber, colour: v.colour, modelYear: v.modelYear,
        stage: v.stage, sapPlant: L.branch?.sapPlant ?? null, sapMaterial: v.sapMaterial, sapProductionOrder: v.sapProductionOrder, sapEquipment: v.sapEquipment,
        routeId: res.route.id, routeVersion: res.route.version, currentStation: onLine ? stations[res.current]!.code : stations[stations.length - 1]!.code,
        lineStartedAt: lineAt, gatePassedAt: onLine ? null : gateAt,
        externalSource: src(job.sourceSystem), externalId: v.vin, importJobId: job.id, createdById: actor, createdAt: lineAt ?? now,
      },
    });
    // The route as its stations: before the current one done before EJO, the current one under way, the rest to come;
    // past the line, all of them done and the gate passed before EJO (nobody in EJO passed it, so nobody is named).
    await tx.plantStationVisit.createMany({
      data: stations.map((s, i) => {
        const done = !onLine || i < res.current;
        const isCurrent = onLine && i === res.current;
        return {
          organisationId: job.organisationId, branchId: job.branchId!, plantVehicleId: id, code: s.code, name: s.name, kind: s.kind, sort: i, standardMinutes: s.standardMinutes, checks: s.checks as unknown as Prisma.InputJsonValue,
          status: done ? 'PASSED' : isCurrent ? 'IN_PROGRESS' : 'PENDING', startedAt: isCurrent ? now : null,
          finishedAt: done && s.kind === 'GATE' ? gateAt : null, passedAt: done && s.kind === 'GATE' ? gateAt : null,
          notes: done ? `Done before EJO (import ${job.number}).` : isCurrent ? `At this station when the plant started using EJO (import ${job.number}).` : null,
        };
      }),
    });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Kits ──────────────────────────────────────────────────────────────

type KitLookups = Common & { shipments: Map<string, { id: string; number: string }>; existing: Map<string, { id: string; number: string }>; vehicles: Map<string, { id: string; branchId: string; linked: boolean }> };

async function kitLookups(db: Db, job: PlantImportJob, vals: PlantKitValues[]): Promise<KitLookups> {
  const refs = [...new Set(vals.map((v) => v.shipmentRef))];
  const vins = [...new Set(vals.map((v) => v.vinKey))];
  const [C, shipments, existing, vehicles] = await Promise.all([
    common(db, job, vals.flatMap((v) => [v.inspector, v.decidedBy])),
    refs.length && job.branchId ? db.plantShipment.findMany({ where: { organisationId: job.organisationId, branchId: job.branchId, OR: [{ externalId: { in: refs } }, { number: { in: refs } }] }, select: { id: true, number: true, externalId: true } }) : [],
    vins.length ? db.plantKit.findMany({ where: { organisationId: job.organisationId, vinKey: { in: vins }, status: { not: 'CANCELLED' } }, select: { id: true, number: true, vinKey: true } }) : [],
    vins.length ? db.plantVehicle.findMany({ where: { organisationId: job.organisationId, vinKey: { in: vins } }, select: { id: true, vinKey: true, branchId: true, _count: { select: { kits: true } } } }) : [],
  ]);
  const ship = new Map<string, { id: string; number: string }>();
  for (const s of shipments) { if (s.externalId) ship.set(s.externalId.toUpperCase(), { id: s.id, number: s.number }); ship.set(s.number, { id: s.id, number: s.number }); }
  return {
    ...C, shipments: ship,
    existing: new Map(existing.map((k) => [k.vinKey, { id: k.id, number: k.number }])),
    vehicles: new Map(vehicles.map((v) => [v.vinKey, { id: v.id, branchId: v.branchId, linked: v._count.kits > 0 }])),
  };
}

function resolveKit(v: PlantKitValues, L: KitLookups, job: PlantImportJob) {
  const errors: string[] = []; const notes: string[] = [];
  branchProblems(v.branch, L, job, errors, notes);
  const shipment = L.shipments.get(v.shipmentRef) ?? null;
  if (!shipment) errors.push(`Shipment “${v.shipmentRef}” is not at this plant in EJO. Import the shipments file first, or give the kit’s SHP number.`);
  const hit = L.existing.get(v.vinKey) ?? null;
  let vehicle: { id: string } | null = null;
  if (v.status === 'RELEASED') {
    const pv = L.vehicles.get(v.vinKey);
    if (!pv) notes.push('Released, with no vehicle in the plant yet: it waits for its slot on the line, where its build starts. If it is already being built, import the plant vehicles file first.');
    else if (pv.branchId !== job.branchId) errors.push('The vehicle with this VIN is at another plant in EJO.');
    else if (pv.linked) errors.push('The vehicle with this VIN already has its kit in EJO.');
    else vehicle = { id: pv.id };
  } else if (L.vehicles.has(v.vinKey)) errors.push(`A vehicle with this VIN is already in the plant, so its kit was released: give the kit’s status as RELEASED.`);
  const inspector = person(L, v.inspector, 'Inspector', notes);
  const decider = ['RELEASED', 'REJECTED', 'ON_HOLD'].includes(v.status) ? person(L, v.decidedBy, 'Decided by', notes) : null;
  if (inspector && decider && inspector.id === decider.id) notes.push('The inspector and the decider are the same person (before EJO): EJO never allows that from now on.');
  if (!kitTemplateFor(v.modelCode)) errors.push(`There is no arrival checklist for the model ${v.modelCode}.`);
  return { errors, notes, hit, shipment, vehicle, inspector, decider };
}

export async function checkPlantKitRows(job: PlantImportJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkPlantKitRow(r.cells as unknown[], mapping) }));
  const L = await kitLookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is PlantKitValues => Boolean(v)));
  return checked.map(({ r, c }) => {
    if (!c.values) return rowUpdate(r.id, c, { errors: [], notes: [], field: 'vin' });
    const res = resolveKit(c.values, L, job);
    return rowUpdate(r.id, c, { ...res, field: 'vin', matchedId: res.hit?.id ?? null, matched: res.hit ? `This VIN already has its kit in EJO (${res.hit.number}); left as it is.` : null });
  });
}

export async function loadPlantKitRows(tx: Tx, job: PlantImportJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkPlantKitRow(r.cells as unknown[], mapping) }));
  const L = await kitLookups(tx, job, checked.map((x) => x.c.values).filter((v): v is PlantKitValues => Boolean(v)));
  const results: Result[] = [];
  const todo: { r: LoadRow; v: PlantKitValues; res: ReturnType<typeof resolveKit> }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const res = resolveKit(v, L, job);
    if (res.hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: res.hit.id, note: `This VIN already has its kit in EJO (${res.hit.number}); left as it is.` }); continue; }
    if (res.errors.length || !res.shipment) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'Its shipment is not in EJO.' }); continue; }
    if (seen.has(v.vinKey)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Another row of this file already brought in this VIN.' }); continue; }
    seen.add(v.vinKey);
    todo.push({ r, v, res });
  }
  const numbers = await nextPlantNumbers(tx, 'KIT', todo.length);
  const actor = job.approvedById ?? job.createdById;
  const now = new Date();
  for (const [i, { r, v, res }] of todo.entries()) {
    const template = kitTemplateFor(v.modelCode)!;
    const decided = ['SUBMITTED', 'ON_HOLD', 'RELEASED', 'REJECTED'].includes(v.status);
    const started = at(v.startedAt) ?? (v.status !== 'ARRIVED' ? at(v.submittedAt) : null);
    const submitted = decided ? at(v.submittedAt) ?? at(v.decidedAt) ?? started : null;
    const decidedAt = ['ON_HOLD', 'RELEASED', 'REJECTED'].includes(v.status) ? at(v.decidedAt) ?? submitted ?? now : null;
    const id = newId();
    await tx.plantKit.create({
      data: {
        id, number: numbers[i]!, organisationId: job.organisationId, branchId: job.branchId!, shipmentId: res.shipment!.id, vin: v.vin, vinKey: v.vinKey, engineNumber: v.engineNumber, modelCode: v.modelCode, lotNumber: v.lotNumber, kitType: v.kitType,
        casesExpected: v.casesExpected, casesReceived: v.casesReceived, templateKey: template.key, templateVersion: template.version, status: v.status,
        inspectorId: res.inspector?.id ?? null, startedAt: started, submittedAt: submitted, decidedById: res.decider?.id ?? null, decidedAt,
        decisionNote: decidedAt ? v.decisionNote ?? 'Decided before EJO.' : v.decisionNote, releasedWithShortages: v.releasedWithShortages,
        sapUsageDecision: v.status === 'RELEASED' || v.status === 'REJECTED' ? v.sapUsageDecision : null, sapInspectionLot: v.sapInspectionLot, sapMaterialDocument: v.sapMaterialDocument,
        notes: `Brought in from ${from(job)} by import ${job.number}.`, plantVehicleId: res.vehicle?.id ?? null,
        externalSource: src(job.sourceSystem), externalId: v.vin, importJobId: job.id, createdById: actor,
        // Its checklist as the model's template: a kit checked before EJO has every check recorded as done then (nobody in EJO answered them).
        checks: { create: template.items.map((it, k) => ({ code: it.code, section: it.section, label: it.label, sort: k, allowNa: Boolean(it.allowNa), result: decided ? 'OK' : null, note: decided ? 'Checked before EJO.' : null, checkedAt: decided ? submitted : null })) },
      },
    });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Kit issues ────────────────────────────────────────────────────────

const issueKey = (kitId: string, kind: string, part: string | null, description: string) => `${kitId}|${kind}|${part ?? ''}|${description.toLowerCase().replace(/\s+/g, ' ').trim()}`;
type IssueLookups = Common & { kits: Map<string, { id: string; number: string; status: string }>; existing: Map<string, string> };

async function issueLookups(db: Db, job: PlantImportJob, vals: PlantKitIssueValues[]): Promise<IssueLookups> {
  const vins = [...new Set(vals.map((v) => v.kitVinKey))];
  const [C, kits] = await Promise.all([
    common(db, job, vals.map((v) => v.raisedBy)),
    vins.length && job.branchId ? db.plantKit.findMany({ where: { organisationId: job.organisationId, branchId: job.branchId, vinKey: { in: vins }, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, vinKey: true, status: true } }) : [],
  ]);
  const byVin = new Map<string, { id: string; number: string; status: string }>();
  for (const k of kits) if (!byVin.has(k.vinKey)) byVin.set(k.vinKey, { id: k.id, number: k.number, status: k.status });
  const existing = byVin.size ? await db.plantKitIssue.findMany({ where: { kitId: { in: [...byVin.values()].map((k) => k.id) } }, select: { id: true, kitId: true, kind: true, partNumber: true, description: true } }) : [];
  return { ...C, kits: byVin, existing: new Map(existing.map((x) => [issueKey(x.kitId, x.kind, x.partNumber, x.description), x.id])) };
}

function resolveIssue(v: PlantKitIssueValues, L: IssueLookups, job: PlantImportJob) {
  const errors: string[] = []; const notes: string[] = [];
  branchProblems(v.branch, L, job, errors, notes);
  const kit = L.kits.get(v.kitVinKey) ?? null;
  if (!kit) errors.push('This VIN has no kit at this plant in EJO. Import the kits file first, or check the VIN.');
  const hit = kit ? L.existing.get(issueKey(kit.id, v.kind, v.partNumber, v.description)) ?? null : null;
  if (kit && kit.status === 'REJECTED' && v.status !== 'RESOLVED') notes.push(`${kit.number} was rejected: an issue still open on it goes back to the supplier with the kit.`);
  const raisedBy = person(L, v.raisedBy, 'Raised by', notes);
  if (!v.raisedBy) notes.push('No one named as raising it: it is recorded as raised by the person who approves this import.');
  return { errors, notes, hit, kit, raisedBy };
}

export async function checkPlantKitIssueRows(job: PlantImportJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkPlantKitIssueRow(r.cells as unknown[], mapping) }));
  const L = await issueLookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is PlantKitIssueValues => Boolean(v)));
  return checked.map(({ r, c }) => {
    if (!c.values) return rowUpdate(r.id, c, { errors: [], notes: [], field: 'kitVin' });
    const res = resolveIssue(c.values, L, job);
    return rowUpdate(r.id, c, { ...res, field: 'kitVin', matchedId: res.hit, matched: res.hit ? `Already raised on ${res.kit!.number} in EJO; left as it is.` : null });
  });
}

export async function loadPlantKitIssueRows(tx: Tx, job: PlantImportJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkPlantKitIssueRow(r.cells as unknown[], mapping) }));
  const L = await issueLookups(tx, job, checked.map((x) => x.c.values).filter((v): v is PlantKitIssueValues => Boolean(v)));
  const results: Result[] = [];
  const actor = job.approvedById ?? job.createdById;
  const now = new Date();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const res = resolveIssue(v, L, job);
    if (res.hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: res.hit, note: `Already raised on ${res.kit!.number} in EJO; left as it is.` }); continue; }
    if (res.errors.length || !res.kit) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'Its kit is not in EJO.' }); continue; }
    const raisedAt = at(v.raisedAt) ?? now;
    const id = newId();
    await tx.plantKitIssue.create({
      data: {
        id, organisationId: job.organisationId, kitId: res.kit.id, kind: v.kind, partNumber: v.partNumber, description: v.description, caseNumber: v.caseNumber, quantity: v.quantity, stopsLine: v.stopsLine,
        status: v.status, claimReference: v.claimReference, resolution: v.status === 'RESOLVED' ? v.resolution ?? 'Resolved before EJO.' : v.resolution,
        raisedById: res.raisedBy?.id ?? actor, raisedAt, claimedAt: v.status !== 'OPEN' && (v.claimReference || v.status === 'CLAIMED') ? raisedAt : null, resolvedAt: v.status === 'RESOLVED' ? raisedAt : null,
        importJobId: job.id,
      },
    });
    // So a second identical row in the same batch is not raised twice.
    L.existing.set(issueKey(res.kit.id, v.kind, v.partNumber, v.description), id);
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Totals: what will load, and what did ──────────────────────────────

export type PlantTotals = { lines: number; quantity: number; value: number; counts: Record<string, number>; from: string | null; to: string | null };

/** What will load, counted by stage (vehicles), status (kits, issues) or line-stoppers, with the dates it spans. */
export async function plantTotalsOfRows(entity: PlantEntity, jobId: string, mapping: Mapping, statuses: string[]): Promise<PlantTotals> {
  let after = 0; let lines = 0; let first: string | null = null; let last: string | null = null;
  const counts: Record<string, number> = {};
  const add = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const span = (d: string | null | undefined) => { if (!d) return; if (!first || d < first) first = d; if (!last || d > last) last = d; };
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const cells = r.cells as unknown[];
      if (entity === 'plantShipments') { const v = checkPlantShipmentRow(cells, mapping).values; if (!v) continue; lines += 1; span(v.arrivedAt.day); }
      else if (entity === 'plantVehicles') { const v = checkPlantVehicleRow(cells, mapping).values; if (!v) continue; lines += 1; add(v.stage); span(v.lineStartedAt?.day ?? v.gatePassedAt?.day); }
      else if (entity === 'plantKits') { const v = checkPlantKitRow(cells, mapping).values; if (!v) continue; lines += 1; add(v.status); }
      else { const v = checkPlantKitIssueRow(cells, mapping).values; if (!v) continue; lines += 1; add(v.status); if (v.stopsLine && v.status !== 'RESOLVED') add('STOPS_LINE'); }
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: 0, counts, from: first, to: last };
}

export async function plantTotalsLoaded(entity: PlantEntity, jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  const where = { importJobId: jobId };
  const lines = entity === 'plantShipments' ? await prisma.plantShipment.count({ where }) : entity === 'plantVehicles' ? await prisma.plantVehicle.count({ where }) : entity === 'plantKits' ? await prisma.plantKit.count({ where }) : await prisma.plantKitIssue.count({ where });
  return { lines, quantity: 0, value: 0 };
}

// ── Undo: to the Recycle bin, only what nobody has touched since ──────

const audited = async (db: Db, entityType: string, entityId: string) => (await db.auditLog.count({ where: { entityType, entityId } })) > 0;

/**
 * Imported plant records nobody has used since the import. Nothing is written
 * on them at load, so any audited step on them (on the desk or the line) is
 * use, however soon after; a later change shows in updatedAt; and anything
 * that hangs on them now keeps them (undo the later file first).
 */
export async function plantUntouchedSinceImport(db: Db, entity: PlantEntity, id: string, jobId: string, loadedAt: Date): Promise<boolean> {
  if (entity === 'plantShipments') {
    const s = await db.plantShipment.findFirst({ where: { id, importJobId: jobId }, select: { updatedAt: true, _count: { select: { kits: true } } } });
    return Boolean(s) && !s!._count.kits && s!.updatedAt <= loadedAt && !(await audited(db, 'PlantShipment', id));
  }
  if (entity === 'plantVehicles') {
    const v = await db.plantVehicle.findFirst({ where: { id, importJobId: jobId }, select: { updatedAt: true, customerVehicleId: true, _count: { select: { kits: true, pdis: true, defects: true, qaAudits: true } } } });
    if (!v || v.customerVehicleId || v.updatedAt > loadedAt) return false;
    const c = v._count;
    if (c.kits || c.pdis || c.defects || c.qaAudits) return false;
    if (await db.plantStationVisit.count({ where: { plantVehicleId: id, OR: [{ updatedAt: { gt: loadedAt } }, { operatorId: { not: null } }, { passedById: { not: null } }] } })) return false;
    return !(await audited(db, 'PlantVehicle', id));
  }
  if (entity === 'plantKits') {
    const k = await db.plantKit.findFirst({ where: { id, importJobId: jobId }, select: { updatedAt: true, _count: { select: { issues: true } } } });
    if (!k || k._count.issues || k.updatedAt > loadedAt) return false;
    if (await db.plantKitCheck.count({ where: { kitId: id, checkedById: { not: null } } })) return false;
    return !(await audited(db, 'PlantKit', id));
  }
  const i = await db.plantKitIssue.findFirst({ where: { id, importJobId: jobId }, select: { kitId: true, resolvedById: true } });
  if (!i || i.resolvedById) return false;
  // Claims and resolutions are audited on the kit: one since the load may be about this issue.
  return (await db.auditLog.count({ where: { entityType: 'PlantKit', entityId: i.kitId, action: { startsWith: 'plant.kit_issue' }, createdAt: { gt: loadedAt } } })) === 0;
}
