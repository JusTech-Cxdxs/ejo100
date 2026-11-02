'use server';

/**
 * The assembly plant: vehicles in the plant, and their pre-delivery
 * inspections (PDI), recorded on a tablet as they happen.
 *
 *   scan or type the VIN → (register the vehicle: model, engine number, SAP
 *   numbers) → the checklist for its model → readings, diagnostic scan and
 *   fault codes → submit → any Not OK: rework, recheck, submit again →
 *   a second person approves (SAP usage decision A) or rejects back to
 *   rework (R) → the vehicle moves to the yard; its page, label and PDI
 *   certificate show the result.
 *
 * Every change is checked against the person's permission and branch (the
 * plant), compares the inspection's status before writing (two tablets
 * never overwrite each other), and is in the audit trail. The approver is
 * never the inspector, nor anyone who checked an item.
 */
import { prisma, Prisma } from '@ejo/database';
import { allows, authorize, branchWithinReach, getPrincipal, myOrganisationId, reachWhere, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { lagosYear } from '@/lib/utils/format-date';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { isChassisLike, normaliseVin } from '@/lib/vin';
import { KIT_OPEN, KIT_STATUS_WORDS, type KitStatus } from '@/lib/plant/kits';
import {
  EDITABLE, PLANT_STAGES, afterSubmit, isPdiResult, modelByCode, parseFaultCodes, pdiBlockers, pdiWarnings, templateFor, PDI_TEMPLATES,
  type PdiFamily, type PdiItemState, type PdiReadings, type PdiStatus, type PlantStage,
} from '@/lib/plant/pdi';

export type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const clean = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const code = (v: unknown, max = 40) => { const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9\-/.]/g, '').slice(0, max); return s || null; };

async function nextPdiNumber(): Promise<string> {
  const prefix = `PDI-${lagosYear()}-`;
  const rows = await prisma.pdiInspection.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 });
  return `${prefix}${String(highestSequence(prefix, rows.map((r) => r.number)) + 1).padStart(6, '0')}`;
}

/** The plant's records this person may see: their organisation and branch reach. */
async function plantFence(): Promise<{ organisationId: string; branch: Awaited<ReturnType<typeof reachWhere>> }> {
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new Error('The assembly plant belongs to an organisation: you are not in one.');
  return { organisationId, branch: await reachWhere('plant.view') };
}

/** One PDI, inside the person's organisation and plant reach (null otherwise). */
async function myPdi(id: string) {
  const f = await plantFence();
  return prisma.pdiInspection.findFirst({
    where: { id: String(id).slice(0, 40), organisationId: f.organisationId, ...f.branch },
    include: { vehicle: true, items: { orderBy: { sort: 'asc' } } },
  });
}

// ── Reading ─────────────────────────────────────────────────────────────

export type PlantOverview = {
  stages: { stage: PlantStage; count: number }[];
  queue: { id: string; number: string; status: PdiStatus; vin: string; model: string; inspector: string; at: Date; attempt: number }[];
  passed: { id: string; number: string; vin: string; model: string; at: Date }[];
  may: { perform: boolean; approve: boolean; register: boolean };
};

/** The plant at a glance: vehicles by stage, the PDI queue (in progress, rework, waiting for approval) and the latest passed. */
export async function getPlantOverview(): Promise<PlantOverview> {
  await authorize('plant.view', undefined, 'getPlantOverview', 'The assembly plant is for the plant team.');
  const f = await plantFence();
  const [byStage, openKits, open, passed, perform, approve, register] = await Promise.all([
    prisma.plantVehicle.groupBy({ by: ['stage'], where: { organisationId: f.organisationId, ...f.branch }, _count: { _all: true } }),
    // Kits not yet released are the plant's KIT stage (their vehicle is created on release).
    prisma.plantKit.count({ where: { organisationId: f.organisationId, ...f.branch, status: { in: KIT_OPEN } } as Prisma.PlantKitWhereInput }),
    prisma.pdiInspection.findMany({ where: { organisationId: f.organisationId, ...f.branch, status: { in: ['IN_PROGRESS', 'REWORK', 'SUBMITTED'] } }, orderBy: { updatedAt: 'desc' }, take: 200, include: { vehicle: { select: { vin: true, modelCode: true, modelName: true } } } }),
    prisma.pdiInspection.findMany({ where: { organisationId: f.organisationId, ...f.branch, status: 'PASSED' }, orderBy: { decidedAt: 'desc' }, take: 15, include: { vehicle: { select: { vin: true, modelCode: true, modelName: true } } } }),
    allows('plant.pdi.perform'), allows('plant.pdi.approve'), allows('plant.vehicle.register'),
  ]);
  const names = await userNames(open.map((p) => p.inspectorId));
  return {
    stages: PLANT_STAGES.map((stage) => ({ stage, count: (byStage.find((b) => b.stage === stage)?._count._all ?? 0) + (stage === 'KIT' ? openKits : 0) })),
    queue: open.map((p) => ({ id: p.id, number: p.number, status: p.status as PdiStatus, vin: p.vehicle.vin, model: p.vehicle.modelName ?? p.vehicle.modelCode, inspector: names.get(p.inspectorId) ?? 'Someone', at: p.updatedAt, attempt: p.attempt })),
    passed: passed.map((p) => ({ id: p.id, number: p.number, vin: p.vehicle.vin, model: p.vehicle.modelName ?? p.vehicle.modelCode, at: p.decidedAt ?? p.updatedAt })),
    may: { perform, approve, register },
  };
}

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!u.length) return new Map();
  return new Map((await prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, fullName: true } })).map((x) => [x.id, x.fullName]));
}

export type PlantVehicleRow = { id: string; vin: string; model: string; modelCode: string; engineNumber: string | null; colour: string | null; stage: PlantStage; branch: string; sapProductionOrder: string | null; sapEquipment: string | null; createdAt: Date; lastPdi: { id: string; number: string; status: PdiStatus } | null };

/** Vehicles in the plant, newest first: search by VIN, model, engine number or an SAP number; filter by stage. */
export async function listPlantVehicles(q?: string, stage?: string): Promise<PlantVehicleRow[]> {
  await authorize('plant.view', undefined, 'listPlantVehicles', 'The assembly plant is for the plant team.');
  const f = await plantFence();
  const t = clean(q, 60);
  const st = PLANT_STAGES.includes(String(stage) as PlantStage) ? String(stage) : undefined;
  const rows = await prisma.plantVehicle.findMany({
    where: {
      organisationId: f.organisationId, ...f.branch, ...(st ? { stage: st } : {}),
      ...(t ? { OR: [{ vinKey: { contains: normaliseVin(t) } }, { modelCode: { contains: t, mode: 'insensitive' } }, { modelName: { contains: t, mode: 'insensitive' } }, { engineNumber: { contains: t, mode: 'insensitive' } }, { sapProductionOrder: { contains: t } }, { sapEquipment: { contains: t } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 300,
    include: { branch: { select: { name: true } }, pdis: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, number: true, status: true } } },
  });
  return rows.map((v) => ({ id: v.id, vin: v.vin, model: v.modelName ?? v.modelCode, modelCode: v.modelCode, engineNumber: v.engineNumber, colour: v.colour, stage: v.stage as PlantStage, branch: v.branch.name, sapProductionOrder: v.sapProductionOrder, sapEquipment: v.sapEquipment, createdAt: v.createdAt, lastPdi: v.pdis[0] ? { id: v.pdis[0].id, number: v.pdis[0].number, status: v.pdis[0].status as PdiStatus } : null }));
}

/** The plants this person may register a vehicle in (their branch, or every branch for organisation-wide roles). */
export async function listPlantBranches(): Promise<{ id: string; name: string; sapPlant: string | null }[]> {
  await authorize('plant.view', undefined, 'listPlantBranches');
  const f = await plantFence();
  return prisma.branch.findMany({ where: { ...('branchId' in f.branch && f.branch.branchId ? { id: f.branch.branchId as never } : {}), businessUnit: { organisationId: f.organisationId } }, orderBy: { name: 'asc' }, select: { id: true, name: true, sapPlant: true } });
}

/** A vehicle already in the plant, by VIN (for the start-a-PDI screen). */
export async function findPlantVehicle(vin: string): Promise<{ id: string; vin: string; model: string; modelCode: string; engineNumber: string | null; stage: PlantStage; openPdi: { id: string; number: string } | null; passed: { number: string; at: Date | null } | null } | null> {
  await authorize('plant.view', undefined, 'findPlantVehicle');
  const f = await plantFence();
  const v = await prisma.plantVehicle.findFirst({ where: { organisationId: f.organisationId, ...f.branch, vinKey: normaliseVin(vin) }, include: { pdis: { orderBy: { createdAt: 'desc' }, take: 5 } } });
  if (!v) return null;
  const open = v.pdis.find((p) => EDITABLE.includes(p.status as PdiStatus) || p.status === 'SUBMITTED');
  const passed = v.pdis.find((p) => p.status === 'PASSED');
  return { id: v.id, vin: v.vin, model: v.modelName ?? v.modelCode, modelCode: v.modelCode, engineNumber: v.engineNumber, stage: v.stage as PlantStage, openPdi: open ? { id: open.id, number: open.number } : null, passed: passed ? { number: passed.number, at: passed.decidedAt } : null };
}

export type PdiView = {
  id: string; number: string; status: PdiStatus; attempt: number; templateName: string; family: PdiFamily | null;
  vehicle: { id: string; vin: string; model: string; modelCode: string; engineNumber: string | null; colour: string | null; branch: string; sapPlant: string | null; sapMaterial: string | null; sapProductionOrder: string | null; sapEquipment: string | null };
  items: (PdiItemState & { reworkNote: string | null; checkedBy: string | null })[];
  readings: PdiReadings; notes: string | null;
  inspector: string; startedAt: Date; submittedAt: Date | null;
  decision: { by: string | null; at: Date | null; note: string | null; usage: string | null };
  blockers: string[]; warnings: string[];
  may: { edit: boolean; approve: boolean; approveWhy: string | null; cancel: boolean };
};

/** One PDI, with what this person may do with it now. */
export async function getPdi(id: string): Promise<PdiView | null> {
  await authorize('plant.view', undefined, 'getPdi', 'The assembly plant is for the plant team.');
  const p = await myPdi(id);
  if (!p) return null;
  const me = await getPrincipal();
  const [perform, approve] = await Promise.all([allows('plant.pdi.perform'), allows('plant.pdi.approve')]);
  const names = await userNames([p.inspectorId, p.decidedById, ...p.items.map((i) => i.checkedById)]);
  const branch = await prisma.branch.findUnique({ where: { id: p.branchId }, select: { name: true } });
  const items = p.items.map((i) => ({ code: i.code, label: i.label, section: i.section, allowNa: i.allowNa, result: isPdiResult(i.result) ? i.result : null, defect: i.defect, reworkedAt: i.reworkedAt, reworkNote: i.reworkNote, checkedBy: i.checkedById ? names.get(i.checkedById) ?? null : null }));
  const readings: PdiReadings = { odometerKm: p.odometerKm, batteryVolts: p.batteryVolts, tyreFrontPsi: p.tyreFrontPsi, tyreRearPsi: p.tyreRearPsi, faultScanDone: p.faultScanDone, faultCodes: p.faultCodes, faultCodesCleared: p.faultCodesCleared };
  const family = (p.templateKey in PDI_TEMPLATES ? p.templateKey : null) as PdiFamily | null;
  const status = p.status as PdiStatus;
  const checkedByMe = p.inspectorId === me.userId || p.items.some((i) => i.checkedById === me.userId);
  const approveWhy = status !== 'SUBMITTED' ? null : !approve ? 'Approving PDIs is for the PDI supervisor or plant manager.' : checkedByMe ? 'You inspected this vehicle, so another supervisor must approve it.' : null;
  return {
    id: p.id, number: p.number, status, attempt: p.attempt, templateName: family ? PDI_TEMPLATES[family].name : p.templateKey, family,
    vehicle: { id: p.vehicle.id, vin: p.vehicle.vin, model: p.vehicle.modelName ?? p.vehicle.modelCode, modelCode: p.vehicle.modelCode, engineNumber: p.vehicle.engineNumber, colour: p.vehicle.colour, branch: branch?.name ?? '', sapPlant: p.vehicle.sapPlant, sapMaterial: p.vehicle.sapMaterial, sapProductionOrder: p.vehicle.sapProductionOrder, sapEquipment: p.vehicle.sapEquipment },
    items, readings, notes: p.notes,
    inspector: names.get(p.inspectorId) ?? 'Someone', startedAt: p.startedAt, submittedAt: p.submittedAt,
    decision: { by: p.decidedById ? names.get(p.decidedById) ?? null : null, at: p.decidedAt, note: p.decisionNote, usage: p.sapUsageDecision },
    blockers: EDITABLE.includes(status) ? pdiBlockers(items, readings) : [],
    warnings: pdiWarnings(readings, family),
    may: { edit: perform && EDITABLE.includes(status), approve: status === 'SUBMITTED' && approve && !checkedByMe, approveWhy, cancel: perform && EDITABLE.includes(status) },
  };
}

// ── Starting a PDI (and registering the vehicle) ────────────────────────

export type StartPdiInput = {
  vin: string; branchId?: string; modelCode?: string; modelName?: string; engineNumber?: string; colour?: string; modelYear?: string | number;
  sapMaterial?: string; sapProductionOrder?: string; sapEquipment?: string;
};

/**
 * Starts the PDI of the vehicle with this VIN — registering the vehicle in
 * the plant first when it is new here (model, engine number, SAP numbers).
 * A vehicle with a PDI already open goes back to it; one that has passed
 * needs no second PDI.
 */
export async function startPdi(input: StartPdiInput): Promise<Done<{ id: string; reused?: boolean }>> {
  await authorize('plant.pdi.perform', undefined, 'startPdi', 'Pre-delivery inspections are for the PDI team.');
  try { await refuseDuringAssist('startPdi'); } catch (e) { return fail((e as Error).message); }
  const me = await getPrincipal();
  const f = await plantFence();
  const vin = normaliseVin(input.vin);
  if (!isChassisLike(vin)) return fail('Scan or type the VIN: 6 to 25 letters and digits.');
  let vehicle = await prisma.plantVehicle.findFirst({ where: { organisationId: f.organisationId, vinKey: vin } });
  // A vehicle that arrived as a kit is inspected only once its kit is released to the line (D2).
  const kit = vehicle ? null : await prisma.plantKit.findFirst({ where: { organisationId: f.organisationId, vinKey: vin, status: { in: [...KIT_OPEN, 'REJECTED'] } }, orderBy: { createdAt: 'desc' }, select: { number: true, status: true } });
  if (kit) return fail(kit.status === 'REJECTED' ? `This VIN’s kit ${kit.number} was rejected: it is not built.` : `This VIN’s kit ${kit.number} has not been released to the line yet (${KIT_STATUS_WORDS[kit.status as KitStatus] ?? kit.status}).`);
  if (vehicle) {
    // A vehicle in another plant of the organisation is that plant's to inspect.
    try { await branchWithinReach('plant.pdi.perform', vehicle.branchId); } catch { return fail('This vehicle is in another plant.'); }
  } else {
    if (!(await allows('plant.vehicle.register'))) return fail('This VIN is not in the plant yet, and registering vehicles is not part of your role.');
    const model = modelByCode(input.modelCode);
    if (!model) return fail('Choose the model (NQR, NPR, QLR, QMR or S07).');
    let branchId = input.branchId || me.branchId || '';
    try { branchId = await branchWithinReach('plant.vehicle.register', branchId); } catch { return fail('Choose the plant this vehicle is in.'); }
    const branch = await prisma.branch.findFirst({ where: { id: branchId, businessUnit: { organisationId: f.organisationId } }, select: { sapPlant: true } });
    if (!branch) return fail('Choose the plant this vehicle is in.');
    const year = Number(input.modelYear);
    const thisYear = new Date().getFullYear();
    // The same VIN as a customer's vehicle already in EJO: a re-inspection of a stock vehicle is fine; say so in the audit.
    const existingCustomerVehicle = await prisma.customerVehicle.findFirst({ where: { chassisNumber: { equals: vin, mode: 'insensitive' }, customer: { organisationId: f.organisationId } }, select: { id: true } });
    try {
      vehicle = await prisma.plantVehicle.create({
        data: {
          organisationId: f.organisationId, branchId, vin, vinKey: vin, make: model.make, modelCode: model.code, modelName: clean(input.modelName) ?? model.name.replace(/ \(.*\)$/, ''),
          engineNumber: code(input.engineNumber), colour: clean(input.colour, 40), modelYear: Number.isInteger(year) && year >= 2000 && year <= thisYear + 1 ? year : null,
          stage: 'PDI', sapPlant: branch.sapPlant, sapMaterial: code(input.sapMaterial), sapProductionOrder: code(input.sapProductionOrder), sapEquipment: code(input.sapEquipment),
          customerVehicleId: existingCustomerVehicle?.id ?? null, createdById: me.userId,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      vehicle = await prisma.plantVehicle.findFirstOrThrow({ where: { organisationId: f.organisationId, vinKey: vin } });
    }
    await writeAuditLog({ userId: me.userId, action: 'plant.vehicle_registered', entityType: 'PlantVehicle', entityId: vehicle.id, metadata: { vin, model: vehicle.modelCode, engineNumber: vehicle.engineNumber, sapProductionOrder: vehicle.sapProductionOrder, sapEquipment: vehicle.sapEquipment } });
  }
  const pdis = await prisma.pdiInspection.findMany({ where: { plantVehicleId: vehicle.id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, decidedAt: true } });
  const open = pdis.find((p) => ['IN_PROGRESS', 'REWORK', 'SUBMITTED'].includes(p.status));
  if (open) return { ok: true, id: open.id, reused: true };
  const passed = pdis.find((p) => p.status === 'PASSED');
  if (passed) return fail(`This vehicle passed its PDI (${passed.number}). Open it from the vehicle's page.`);
  const template = templateFor(vehicle.modelCode);
  if (!template) return fail(`There is no PDI checklist for the model ${vehicle.modelCode} yet.`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const number = await nextPdiNumber();
    try {
      const created = await prisma.pdiInspection.create({
        data: {
          number, organisationId: f.organisationId, branchId: vehicle.branchId, plantVehicleId: vehicle.id, attempt: pdis.length + 1,
          templateKey: template.key, templateVersion: template.version, inspectorId: me.userId,
          items: { create: template.items.map((it, i) => ({ code: it.code, section: it.section, label: it.label, sort: i, allowNa: Boolean(it.allowNa) })) },
        },
        select: { id: true, number: true },
      });
      // The vehicle is at PDI now (never moved back from the yard or a sale).
      await prisma.plantVehicle.updateMany({ where: { id: vehicle.id, stage: { in: ['KIT', 'LINE', 'QA'] } }, data: { stage: 'PDI' } });
      await writeAuditLog({ userId: me.userId, action: 'plant.pdi_started', entityType: 'PdiInspection', entityId: created.id, metadata: { number: created.number, vin: vehicle.vin, model: vehicle.modelCode, checklist: `${template.key} v${template.version}`, attempt: pdis.length + 1 } });
      return { ok: true, id: created.id };
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return fail('EJO is busy numbering inspections. Try again.');
}

// ── Recording ───────────────────────────────────────────────────────────

/**
 * One checklist answer. In rework, putting right a Not OK item (OK again)
 * needs a word on what was done; it is marked reworked.
 */
export async function setPdiItem(id: string, itemCode: string, result: string, note?: string): Promise<Done<{ status: PdiStatus }>> {
  await authorize('plant.pdi.perform', undefined, 'setPdiItem', 'Pre-delivery inspections are for the PDI team.');
  const p = await myPdi(id);
  if (!p) return fail('This PDI is not available.');
  const me = await getPrincipal();
  if (!isPdiResult(result)) return fail('Choose OK, Not OK or N/A.');
  const item = p.items.find((i) => i.code === itemCode);
  if (!item) return fail('That item is not on this checklist.');
  if (result === 'NA' && !item.allowNa) return fail('N/A is not allowed for this item: every vehicle has it.');
  const text = clean(note, 500);
  if (result === 'NOT_OK' && !text) return fail('Say what is wrong.');
  const reworking = p.status === 'REWORK' && item.result === 'NOT_OK' && result === 'OK';
  if (reworking && !text) return fail('Say what was done to put it right.');
  const data: Prisma.PdiItemUpdateManyMutationInput = {
    result, checkedById: me.userId, checkedAt: new Date(),
    ...(result === 'NOT_OK' ? { defect: text } : {}),
    ...(reworking ? { reworkNote: text, reworkedAt: new Date(), reworkedById: me.userId } : {}),
  };
  // Compare and set: only while the PDI can still be changed.
  const res = await prisma.pdiItem.updateMany({ where: { inspectionId: p.id, code: item.code, inspection: { status: { in: EDITABLE } } }, data });
  if (!res.count) return fail('This PDI can no longer be changed. Refresh the page.');
  await prisma.pdiInspection.update({ where: { id: p.id }, data: { updatedAt: new Date() } });
  if (result === 'NOT_OK' || reworking) {
    await writeAuditLog({ userId: me.userId, action: reworking ? 'plant.pdi_item_reworked' : 'plant.pdi_defect', entityType: 'PdiInspection', entityId: p.id, metadata: { number: p.number, item: item.label, note: text } });
  }
  return { ok: true, status: p.status as PdiStatus };
}

/** The readings: odometer, battery, tyre pressures, the diagnostic scan and its fault codes, notes. */
export async function setPdiReadings(id: string, input: { odometerKm?: string | number | null; batteryVolts?: string | number | null; tyreFrontPsi?: string | number | null; tyreRearPsi?: string | number | null; faultScanDone?: boolean; faultCodes?: string; faultCodesCleared?: boolean; notes?: string | null }): Promise<Done> {
  await authorize('plant.pdi.perform', undefined, 'setPdiReadings', 'Pre-delivery inspections are for the PDI team.');
  const p = await myPdi(id);
  if (!p) return fail('This PDI is not available.');
  const me = await getPrincipal();
  const num = (v: unknown, lo: number, hi: number, what: string): number | null | string => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : `${what} must be between ${lo} and ${hi}.`;
  };
  const odo = num(input.odometerKm, 0, 100000, 'The odometer');
  const volts = num(input.batteryVolts, 0, 30, 'The battery voltage');
  const front = num(input.tyreFrontPsi, 0, 200, 'The front tyre pressure');
  const rear = num(input.tyreRearPsi, 0, 200, 'The rear tyre pressure');
  for (const v of [odo, volts, front, rear]) if (typeof v === 'string') return fail(v);
  const codes = parseFaultCodes(input.faultCodes);
  const res = await prisma.pdiInspection.updateMany({
    where: { id: p.id, status: { in: EDITABLE } },
    data: {
      odometerKm: odo === null ? null : Math.round(odo as number), batteryVolts: volts as number | null, tyreFrontPsi: front as number | null, tyreRearPsi: rear as number | null,
      faultScanDone: Boolean(input.faultScanDone), faultCodes: input.faultScanDone ? codes : [], faultCodesCleared: Boolean(input.faultScanDone && codes.length && input.faultCodesCleared),
      notes: input.notes === undefined ? p.notes : clean(input.notes, 1000),
    },
  });
  if (!res.count) return fail('This PDI can no longer be changed. Refresh the page.');
  if (codes.length && input.faultScanDone) await writeAuditLog({ userId: me.userId, action: 'plant.pdi_fault_codes', entityType: 'PdiInspection', entityId: p.id, metadata: { number: p.number, codes, cleared: Boolean(input.faultCodesCleared) } });
  return { ok: true };
}

/** Sends the PDI on: to rework while anything is Not OK, otherwise for approval. Says what is still missing. */
export async function submitPdi(id: string): Promise<Done<{ status: PdiStatus }>> {
  await authorize('plant.pdi.perform', undefined, 'submitPdi', 'Pre-delivery inspections are for the PDI team.');
  const p = await myPdi(id);
  if (!p) return fail('This PDI is not available.');
  const me = await getPrincipal();
  const items = p.items.map((i) => ({ code: i.code, label: i.label, section: i.section, allowNa: i.allowNa, result: isPdiResult(i.result) ? i.result : null, defect: i.defect, reworkedAt: i.reworkedAt }));
  const blockers = pdiBlockers(items, { odometerKm: p.odometerKm, batteryVolts: p.batteryVolts, tyreFrontPsi: p.tyreFrontPsi, tyreRearPsi: p.tyreRearPsi, faultScanDone: p.faultScanDone, faultCodes: p.faultCodes, faultCodesCleared: p.faultCodesCleared });
  if (blockers.length) return fail(blockers.join(' '));
  const next = afterSubmit(items);
  const res = await prisma.pdiInspection.updateMany({
    where: { id: p.id, status: { in: EDITABLE } },
    data: { status: next, submittedAt: new Date(), ...(next === 'SUBMITTED' ? { decidedById: null, decidedAt: null, sapUsageDecision: null } : {}) },
  });
  if (!res.count) return fail('This PDI changed meanwhile. Refresh the page.');
  const failed = items.filter((i) => i.result === 'NOT_OK').map((i) => i.label);
  await writeAuditLog({ userId: me.userId, action: next === 'REWORK' ? 'plant.pdi_to_rework' : 'plant.pdi_submitted', entityType: 'PdiInspection', entityId: p.id, metadata: { number: p.number, vin: p.vehicle.vin, ...(failed.length ? { notOk: failed } : {}) } });
  return { ok: true, status: next };
}

/** Approves the PDI: the SAP usage decision A. The vehicle moves to the yard. Never by the inspector or anyone who checked an item. */
export async function approvePdi(id: string, note?: string): Promise<Done> {
  try { await refuseDuringAssist('approvePdi'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.pdi.approve', undefined, 'approvePdi', 'Approving PDIs is for the PDI supervisor or plant manager.');
  const p = await myPdi(id);
  if (!p) return fail('This PDI is not available.');
  const me = await getPrincipal();
  if (p.status !== 'SUBMITTED') return fail('This PDI is not waiting for approval.');
  if (p.inspectorId === me.userId || p.items.some((i) => i.checkedById === me.userId)) return fail('You inspected this vehicle, so another supervisor must approve it.');
  const res = await prisma.pdiInspection.updateMany({ where: { id: p.id, status: 'SUBMITTED' }, data: { status: 'PASSED', decidedById: me.userId, decidedAt: new Date(), decisionNote: clean(note, 500), sapUsageDecision: 'A' } });
  if (!res.count) return fail('This PDI changed meanwhile. Refresh the page.');
  await prisma.plantVehicle.updateMany({ where: { id: p.plantVehicleId, stage: { in: ['KIT', 'LINE', 'QA', 'PDI'] } }, data: { stage: 'YARD' } });
  await writeAuditLog({ userId: me.userId, action: 'plant.pdi_passed', entityType: 'PdiInspection', entityId: p.id, metadata: { number: p.number, vin: p.vehicle.vin, usageDecision: 'A', inspectorId: p.inspectorId } });
  return { ok: true };
}

/** Rejects the PDI back to rework (SAP usage decision R): which items, and why. */
export async function rejectPdi(id: string, reason: string, itemCodes: string[]): Promise<Done> {
  try { await refuseDuringAssist('rejectPdi'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.pdi.approve', undefined, 'rejectPdi', 'Approving PDIs is for the PDI supervisor or plant manager.');
  const p = await myPdi(id);
  if (!p) return fail('This PDI is not available.');
  const me = await getPrincipal();
  if (p.status !== 'SUBMITTED') return fail('This PDI is not waiting for approval.');
  if (p.inspectorId === me.userId || p.items.some((i) => i.checkedById === me.userId)) return fail('You inspected this vehicle, so another supervisor must decide.');
  const why = clean(reason, 500);
  if (!why || why.length < 5) return fail('Say what needs putting right (a few words).');
  const codes = [...new Set((itemCodes ?? []).map(String))].filter((c) => p.items.some((i) => i.code === c));
  if (!codes.length) return fail('Choose the items to put right.');
  const done = await prisma.$transaction(async (tx) => {
    const r = await tx.pdiInspection.updateMany({ where: { id: p.id, status: 'SUBMITTED' }, data: { status: 'REWORK', decidedById: me.userId, decidedAt: new Date(), decisionNote: why, sapUsageDecision: 'R' } });
    if (!r.count) return false;
    await tx.pdiItem.updateMany({ where: { inspectionId: p.id, code: { in: codes } }, data: { result: 'NOT_OK', defect: `Rejected at approval: ${why}`, reworkNote: null, reworkedAt: null, reworkedById: null } });
    return true;
  });
  if (!done) return fail('This PDI changed meanwhile. Refresh the page.');
  await writeAuditLog({ userId: me.userId, action: 'plant.pdi_rejected', entityType: 'PdiInspection', entityId: p.id, metadata: { number: p.number, vin: p.vehicle.vin, usageDecision: 'R', reason: why, items: p.items.filter((i) => codes.includes(i.code)).map((i) => i.label) } });
  return { ok: true };
}

/** Cancels a PDI started by mistake (kept, never deleted). */
export async function cancelPdi(id: string, reason: string): Promise<Done> {
  await authorize('plant.pdi.perform', undefined, 'cancelPdi', 'Pre-delivery inspections are for the PDI team.');
  const p = await myPdi(id);
  if (!p) return fail('This PDI is not available.');
  const me = await getPrincipal();
  const why = clean(reason, 300);
  if (!why || why.length < 5) return fail('Say why it is cancelled.');
  const res = await prisma.pdiInspection.updateMany({ where: { id: p.id, status: { in: EDITABLE } }, data: { status: 'CANCELLED', decisionNote: why } });
  if (!res.count) return fail('Only a PDI in progress or in rework can be cancelled.');
  await writeAuditLog({ userId: me.userId, action: 'plant.pdi_cancelled', entityType: 'PdiInspection', entityId: p.id, metadata: { number: p.number, vin: p.vehicle.vin, reason: why } });
  return { ok: true };
}

/** For the dashboard and Approvals: PDIs waiting for this approver (never one they inspected or checked), and the inspector's own PDIs in rework. */
export async function getPlantDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const [perform, approve] = await Promise.all([allows('plant.pdi.perform'), allows('plant.pdi.approve')]);
  if (!perform && !approve) return [];
  const me = await getPrincipal();
  const f = await plantFence();
  const [waiting, rework] = await Promise.all([
    approve ? prisma.pdiInspection.findMany({ where: { organisationId: f.organisationId, ...f.branch, status: 'SUBMITTED', NOT: { inspectorId: me.userId }, items: { none: { checkedById: me.userId } } }, orderBy: { submittedAt: 'asc' }, take: 20, include: { vehicle: { select: { vin: true, modelCode: true } } } }) : [],
    perform ? prisma.pdiInspection.findMany({ where: { organisationId: f.organisationId, ...f.branch, status: 'REWORK', inspectorId: me.userId }, orderBy: { updatedAt: 'desc' }, take: 20, include: { vehicle: { select: { vin: true, modelCode: true } } } }) : [],
  ]);
  return [
    ...waiting.map((p) => ({ id: `pdi-approve-${p.id}`, title: `Approve PDI ${p.number}`, detail: `${p.vehicle.vin} · ${p.vehicle.modelCode}`, url: `/plant/pdi/${p.id}`, createdAt: p.submittedAt ?? p.updatedAt })),
    ...rework.map((p) => ({ id: `pdi-rework-${p.id}`, title: `Put right PDI ${p.number}`, detail: `${p.vehicle.vin} · ${p.sapUsageDecision === 'R' ? `rejected: ${p.decisionNote ?? ''}` : 'items Not OK'}`, url: `/plant/pdi/${p.id}`, createdAt: p.updatedAt })),
  ];
}
