'use server';

/**
 * The assembly plant, D2: kits arriving and their quality control.
 *
 *   a shipment arrives (bill of lading, containers, the SAP purchase order and
 *   inbound delivery) with its kits, one per vehicle, as on the packing list
 *   → each kit is opened and checked (cases and seals, identity, body or cab,
 *   major units, parts) → shortages, damage, wrong parts and excess are
 *   raised against case and part numbers → the inspector submits → a second
 *   person releases it to the line (SAP usage decision A; the vehicle is
 *   created in the plant at stage LINE), holds it, or rejects it (R).
 *   Issues are followed to their supplier claim and resolution.
 *
 * Rules: lib/plant/kits.ts. Every read and write is fenced to the person's
 * organisation and plant (kitFence / myKit / myShipment); every change
 * compares the kit's status before writing; the decider never checked the
 * kit; nothing is deleted (a kit registered by mistake is cancelled).
 */
import { prisma, Prisma } from '@ejo/database';
import { allows, authorize, branchWithinReach, getPrincipal, myOrganisationId, reachWhere, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { lagosYear } from '@/lib/utils/format-date';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { normaliseVin } from '@/lib/vin';
import { modelByCode, PLANT_STAGE_WORDS, type PlantStage } from '@/lib/plant/pdi';
import {
  ISSUE_KINDS, ISSUE_UNRESOLVED, KIT_EDITABLE, KIT_OPEN, KIT_STATUS_WORDS, KIT_TEMPLATES, KIT_TYPES, isCheckResult, kitBlockers, kitTemplateFor, kitWarnings, parseKitLines, releaseVerdict,
  type CheckResult, type IssueKind, type IssueStatus, type KitCheckState, type KitIssueState, type KitStatus, type KitType,
} from '@/lib/plant/kits';

export type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const clean = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const code = (v: unknown, max = 40) => { const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9\-/.]/g, '').slice(0, max); return s || null; };
const RECEIVE_ONLY = 'Receiving kits is for the plant’s kit inspectors and quality team.';
const RELEASE_ONLY = 'Releasing kits is for the quality supervisor or plant manager.';

/** The plant's kits and shipments this person may see: their organisation and branch reach. */
async function kitFence(): Promise<{ organisationId: string; branch: Awaited<ReturnType<typeof reachWhere>> }> {
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new Error('The assembly plant belongs to an organisation: you are not in one.');
  return { organisationId, branch: await reachWhere('plant.view') };
}

/** One kit, inside the person's organisation and plant reach (null otherwise). */
async function myKit(id: string) {
  const f = await kitFence();
  return prisma.plantKit.findFirst({
    where: { id: String(id ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch },
    include: { checks: { orderBy: { sort: 'asc' } }, issues: { orderBy: { raisedAt: 'asc' } }, shipment: true },
  });
}

/** One shipment, inside the person's organisation and plant reach (null otherwise). */
async function myShipment(id: string) {
  const f = await kitFence();
  return prisma.plantShipment.findFirst({ where: { id: String(id ?? '').slice(0, 40), organisationId: f.organisationId, ...f.branch } });
}

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!u.length) return new Map();
  return new Map((await prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, fullName: true } })).map((x) => [x.id, x.fullName]));
}

async function nextNumbers(prefixWord: 'SHP' | 'KIT', count: number, tx: Prisma.TransactionClient): Promise<string[]> {
  const prefix = `${prefixWord}-${lagosYear()}-`;
  const rows = prefixWord === 'SHP'
    ? await tx.plantShipment.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 })
    : await tx.plantKit.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 });
  const start = highestSequence(prefix, rows.map((r) => r.number)) + 1;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(6, '0')}`);
}

const issueState = (i: { kind: string; status: string; stopsLine: boolean; description: string; partNumber: string | null; quantity: number }): KitIssueState => ({
  kind: (ISSUE_KINDS.includes(i.kind as IssueKind) ? i.kind : 'SHORTAGE') as IssueKind, status: i.status as IssueStatus, stopsLine: i.stopsLine, description: i.description, partNumber: i.partNumber, quantity: i.quantity,
});
const checkState = (c: { code: string; label: string; section: string; allowNa: boolean; result: string | null; note: string | null }): KitCheckState => ({
  code: c.code, label: c.label, section: c.section, allowNa: c.allowNa, result: isCheckResult(c.result) ? c.result : null, note: c.note,
});

// ── Reading ─────────────────────────────────────────────────────────────

export type KitRow = {
  id: string; number: string; vin: string; modelCode: string; engineNumber: string | null; lotNumber: string | null; kitType: KitType; status: KitStatus;
  casesExpected: number | null; casesReceived: number | null; openIssues: number; stoppingIssues: number; shipment: { id: string; number: string }; branch: string; arrivedAt: Date; vehicleId: string | null; releasedWithShortages: boolean;
};

export type KitOverview = {
  open: number; byStatus: { status: KitStatus; count: number }[];
  waiting: KitRow[]; onHold: KitRow[]; stoppingIssues: number;
  shipments: { id: string; number: string; supplier: string; arrivedAt: Date; kits: number; open: number }[];
  may: { receive: boolean; release: boolean };
};

const kitInclude = { shipment: { select: { id: true, number: true, arrivedAt: true } }, branch: { select: { name: true } }, issues: { where: { status: { in: ISSUE_UNRESOLVED } }, select: { stopsLine: true } } } as const;
type KitWithRow = Prisma.PlantKitGetPayload<{ include: typeof kitInclude }>;
const toRow = (k: KitWithRow): KitRow => ({
  id: k.id, number: k.number, vin: k.vin, modelCode: k.modelCode, engineNumber: k.engineNumber, lotNumber: k.lotNumber, kitType: (KIT_TYPES.includes(k.kitType as KitType) ? k.kitType : 'CKD') as KitType, status: k.status as KitStatus,
  casesExpected: k.casesExpected, casesReceived: k.casesReceived, openIssues: k.issues.length, stoppingIssues: k.issues.filter((i) => i.stopsLine).length,
  shipment: { id: k.shipment.id, number: k.shipment.number }, branch: k.branch.name, arrivedAt: k.shipment.arrivedAt, vehicleId: k.plantVehicleId, releasedWithShortages: k.releasedWithShortages,
});

/** Kits at a glance, for the plant's front page. */
export async function getKitOverview(): Promise<KitOverview> {
  await authorize('plant.view', undefined, 'getKitOverview', 'The assembly plant is for the plant team.');
  const f = await kitFence();
  const where = { organisationId: f.organisationId, ...f.branch } as Prisma.PlantKitWhereInput;
  const [byStatus, waiting, onHold, stopping, shipments, receive, release] = await Promise.all([
    prisma.plantKit.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.plantKit.findMany({ where: { ...where, status: 'SUBMITTED' }, orderBy: { submittedAt: 'asc' }, take: 50, include: kitInclude }),
    prisma.plantKit.findMany({ where: { ...where, status: 'ON_HOLD' }, orderBy: { decidedAt: 'asc' }, take: 50, include: kitInclude }),
    prisma.plantKitIssue.count({ where: { organisationId: f.organisationId, stopsLine: true, status: { in: ISSUE_UNRESOLVED }, kit: { ...f.branch } as Prisma.PlantKitWhereInput } }),
    prisma.plantShipment.findMany({ where: { organisationId: f.organisationId, ...f.branch } as Prisma.PlantShipmentWhereInput, orderBy: [{ arrivedAt: 'desc' }, { id: 'desc' }], take: 8, include: { kits: { select: { status: true } } } }),
    allows('plant.kit.receive'), allows('plant.kit.release'),
  ]);
  const count = (s: KitStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    open: KIT_OPEN.reduce((n, s) => n + count(s), 0),
    byStatus: (Object.keys(KIT_STATUS_WORDS) as KitStatus[]).map((status) => ({ status, count: count(status) })),
    waiting: waiting.map(toRow), onHold: onHold.map(toRow), stoppingIssues: stopping,
    shipments: shipments.map((s) => ({ id: s.id, number: s.number, supplier: s.supplier, arrivedAt: s.arrivedAt, kits: s.kits.length, open: s.kits.filter((k) => KIT_OPEN.includes(k.status as KitStatus)).length })),
    may: { receive, release },
  };
}

/** Kits, newest first: search by VIN, kit or lot number, engine number or model; filter by status (or "issues": with an open shortage or damage). */
export async function listKits(q?: string, status?: string): Promise<KitRow[]> {
  await authorize('plant.view', undefined, 'listKits', 'The assembly plant is for the plant team.');
  const f = await kitFence();
  const t = clean(q, 60);
  const st = status && status in KIT_STATUS_WORDS ? status : undefined;
  const rows = await prisma.plantKit.findMany({
    where: {
      organisationId: f.organisationId, ...f.branch,
      ...(st ? { status: st } : {}),
      ...(status === 'issues' ? { issues: { some: { status: { in: ISSUE_UNRESOLVED } } } } : {}),
      ...(t ? { OR: [{ vinKey: { contains: normaliseVin(t) } }, { number: { contains: t.toUpperCase() } }, { lotNumber: { contains: t, mode: 'insensitive' } }, { engineNumber: { contains: t, mode: 'insensitive' } }, { modelCode: { contains: t, mode: 'insensitive' } }, { shipment: { number: { contains: t.toUpperCase() } } }] } : {}),
    } as Prisma.PlantKitWhereInput,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 300,
    include: kitInclude,
  });
  return rows.map(toRow);
}

export type ShipmentRow = { id: string; number: string; supplier: string; origin: string | null; billOfLading: string | null; arrivedAt: Date; branch: string; kits: number; open: number; released: number; issues: number };

/** Shipments, newest first: search by number, supplier, bill of lading, container or SAP number. */
export async function listShipments(q?: string): Promise<ShipmentRow[]> {
  await authorize('plant.view', undefined, 'listShipments', 'The assembly plant is for the plant team.');
  const f = await kitFence();
  const t = clean(q, 60);
  const rows = await prisma.plantShipment.findMany({
    where: {
      organisationId: f.organisationId, ...f.branch,
      ...(t ? { OR: [{ number: { contains: t.toUpperCase() } }, { supplier: { contains: t, mode: 'insensitive' } }, { billOfLading: { contains: t, mode: 'insensitive' } }, { containers: { has: t.toUpperCase() } }, { sapPurchaseOrder: { contains: t } }, { sapInboundDelivery: { contains: t } }] } : {}),
    } as Prisma.PlantShipmentWhereInput,
    orderBy: [{ arrivedAt: 'desc' }, { id: 'desc' }],
    take: 200,
    include: { branch: { select: { name: true } }, kits: { select: { status: true, issues: { where: { status: { in: ISSUE_UNRESOLVED } }, select: { id: true } } } } },
  });
  return rows.map((s) => ({
    id: s.id, number: s.number, supplier: s.supplier, origin: s.origin, billOfLading: s.billOfLading, arrivedAt: s.arrivedAt, branch: s.branch.name,
    kits: s.kits.length, open: s.kits.filter((k) => KIT_OPEN.includes(k.status as KitStatus)).length, released: s.kits.filter((k) => k.status === 'RELEASED').length, issues: s.kits.reduce((n, k) => n + k.issues.length, 0),
  }));
}

export type ShipmentView = {
  id: string; number: string; supplier: string; origin: string | null; billOfLading: string | null; vessel: string | null; containers: string[]; arrivedAt: Date;
  sapPurchaseOrder: string | null; sapInboundDelivery: string | null; notes: string | null; branch: string; recordedBy: string; createdAt: Date;
  kits: KitRow[]; may: { addKits: boolean };
};

/** One shipment and its kits. */
export async function getShipment(id: string): Promise<ShipmentView | null> {
  await authorize('plant.view', undefined, 'getShipment', 'The assembly plant is for the plant team.');
  const s = await myShipment(id);
  if (!s) return null;
  const [kits, branch, names, receive] = await Promise.all([
    prisma.plantKit.findMany({ where: { shipmentId: s.id }, orderBy: { number: 'asc' }, include: kitInclude }),
    prisma.branch.findUnique({ where: { id: s.branchId }, select: { name: true } }),
    userNames([s.createdById]),
    allows('plant.kit.receive'),
  ]);
  return {
    id: s.id, number: s.number, supplier: s.supplier, origin: s.origin, billOfLading: s.billOfLading, vessel: s.vessel, containers: s.containers, arrivedAt: s.arrivedAt,
    sapPurchaseOrder: s.sapPurchaseOrder, sapInboundDelivery: s.sapInboundDelivery, notes: s.notes, branch: branch?.name ?? '', recordedBy: names.get(s.createdById) ?? 'Someone', createdAt: s.createdAt,
    kits: kits.map(toRow), may: { addKits: receive },
  };
}

export type KitView = {
  id: string; number: string; vin: string; engineNumber: string | null; modelCode: string; modelName: string; lotNumber: string | null; kitType: KitType; status: KitStatus;
  casesExpected: number | null; casesReceived: number | null; templateName: string; notes: string | null;
  sapInspectionLot: string | null; sapMaterialDocument: string | null; sapUsageDecision: string | null;
  shipment: { id: string; number: string; supplier: string; billOfLading: string | null; arrivedAt: Date; sapPurchaseOrder: string | null; sapInboundDelivery: string | null };
  branch: string; sapPlant: string | null;
  checks: (KitCheckState & { checkedBy: string | null })[];
  issues: (KitIssueState & { id: string; caseNumber: string | null; claimReference: string | null; resolution: string | null; raisedBy: string; raisedAt: Date; resolvedBy: string | null; resolvedAt: Date | null })[];
  inspector: string | null; startedAt: Date | null; submittedAt: Date | null;
  decision: { by: string | null; at: Date | null; note: string | null; withShortages: boolean };
  vehicle: { id: string; vin: string; stage: string; stageWords: string } | null;
  blockers: string[]; warnings: string[];
  may: { edit: boolean; submit: boolean; decide: boolean; decideWhy: string | null; reject: boolean; cancel: boolean; raise: boolean; followUp: boolean; sap: boolean };
};

/** One kit, with what this person may do with it now. */
export async function getKit(id: string): Promise<KitView | null> {
  await authorize('plant.view', undefined, 'getKit', 'The assembly plant is for the plant team.');
  const k = await myKit(id);
  if (!k) return null;
  const me = await getPrincipal();
  const [receive, release, branch, vehicle] = await Promise.all([
    allows('plant.kit.receive'), allows('plant.kit.release'),
    prisma.branch.findUnique({ where: { id: k.branchId }, select: { name: true, sapPlant: true } }),
    k.plantVehicleId ? prisma.plantVehicle.findUnique({ where: { id: k.plantVehicleId }, select: { id: true, vin: true, stage: true } }) : null,
  ]);
  const names = await userNames([k.inspectorId, k.decidedById, ...k.checks.map((c) => c.checkedById), ...k.issues.flatMap((i) => [i.raisedById, i.resolvedById])]);
  const status = k.status as KitStatus;
  const checks = k.checks.map((c) => ({ ...checkState(c), checkedBy: c.checkedById ? names.get(c.checkedById) ?? null : null }));
  const issues = k.issues.map((i) => ({ ...issueState(i), id: i.id, caseNumber: i.caseNumber, claimReference: i.claimReference, resolution: i.resolution, raisedBy: names.get(i.raisedById) ?? 'Someone', raisedAt: i.raisedAt, resolvedBy: i.resolvedById ? names.get(i.resolvedById) ?? null : null, resolvedAt: i.resolvedAt }));
  const checkedByMe = k.inspectorId === me.userId || k.checks.some((c) => c.checkedById === me.userId);
  const decideWhy = status !== 'SUBMITTED' && status !== 'ON_HOLD' ? null : !release ? RELEASE_ONLY : checkedByMe ? 'You checked this kit, so another supervisor must decide.' : null;
  const model = modelByCode(k.modelCode);
  const template = k.templateKey in KIT_TEMPLATES ? KIT_TEMPLATES[k.templateKey as keyof typeof KIT_TEMPLATES] : null;
  return {
    id: k.id, number: k.number, vin: k.vin, engineNumber: k.engineNumber, modelCode: k.modelCode, modelName: model?.name ?? k.modelCode, lotNumber: k.lotNumber, kitType: (KIT_TYPES.includes(k.kitType as KitType) ? k.kitType : 'CKD') as KitType, status,
    casesExpected: k.casesExpected, casesReceived: k.casesReceived, templateName: template ? `${template.name} (version ${k.templateVersion})` : k.templateKey, notes: k.notes,
    sapInspectionLot: k.sapInspectionLot, sapMaterialDocument: k.sapMaterialDocument, sapUsageDecision: k.sapUsageDecision,
    shipment: { id: k.shipment.id, number: k.shipment.number, supplier: k.shipment.supplier, billOfLading: k.shipment.billOfLading, arrivedAt: k.shipment.arrivedAt, sapPurchaseOrder: k.shipment.sapPurchaseOrder, sapInboundDelivery: k.shipment.sapInboundDelivery },
    branch: branch?.name ?? '', sapPlant: branch?.sapPlant ?? null,
    checks, issues,
    inspector: k.inspectorId ? names.get(k.inspectorId) ?? null : null, startedAt: k.startedAt, submittedAt: k.submittedAt,
    decision: { by: k.decidedById ? names.get(k.decidedById) ?? null : null, at: k.decidedAt, note: k.decisionNote, withShortages: k.releasedWithShortages },
    vehicle: vehicle ? { id: vehicle.id, vin: vehicle.vin, stage: vehicle.stage, stageWords: PLANT_STAGE_WORDS[vehicle.stage as PlantStage] ?? vehicle.stage } : null,
    blockers: KIT_EDITABLE.includes(status) ? kitBlockers(checks, k.casesExpected, k.casesReceived) : [],
    warnings: kitWarnings(checks, issues, k.casesExpected, k.casesReceived),
    may: {
      edit: receive && KIT_EDITABLE.includes(status),
      submit: receive && KIT_EDITABLE.includes(status),
      decide: release && !checkedByMe && status === 'SUBMITTED',
      decideWhy,
      reject: release && !checkedByMe && (status === 'SUBMITTED' || status === 'ON_HOLD'),
      cancel: receive && (status === 'ARRIVED' || status === 'INSPECTING'),
      raise: receive && !['REJECTED', 'CANCELLED'].includes(status),
      followUp: receive || release,
      sap: (receive || release) && status !== 'CANCELLED',
    },
  };
}

/** The plants this person may record a shipment in. */
export async function listKitBranches(): Promise<{ id: string; name: string; sapPlant: string | null }[]> {
  await authorize('plant.kit.receive', undefined, 'listKitBranches', RECEIVE_ONLY);
  const f = await kitFence();
  return prisma.branch.findMany({ where: { ...('branchId' in f.branch && f.branch.branchId ? { id: f.branch.branchId as never } : {}), businessUnit: { organisationId: f.organisationId } }, orderBy: { name: 'asc' }, select: { id: true, name: true, sapPlant: true } });
}

// ── Recording a shipment and its kits ───────────────────────────────────

export type ShipmentInput = {
  branchId?: string; supplier?: string; origin?: string; billOfLading?: string; vessel?: string; containers?: string; arrivedAt?: string;
  sapPurchaseOrder?: string; sapInboundDelivery?: string; notes?: string;
  kits?: string; modelCode?: string; kitType?: string;
};

/** Why each VIN cannot come in as a new kit: already a kit (not cancelled), or already a vehicle in the plant. */
async function vinConflicts(organisationId: string, vins: string[]): Promise<string[]> {
  if (!vins.length) return [];
  const [kits, vehicles] = await Promise.all([
    prisma.plantKit.findMany({ where: { organisationId, vinKey: { in: vins }, status: { not: 'CANCELLED' } }, select: { vinKey: true, number: true, status: true } }),
    prisma.plantVehicle.findMany({ where: { organisationId, vinKey: { in: vins } }, select: { vinKey: true, stage: true } }),
  ]);
  return [
    ...kits.map((k) => `${k.vinKey} is already kit ${k.number} (${KIT_STATUS_WORDS[k.status as KitStatus] ?? k.status}).`),
    ...vehicles.filter((v) => !kits.some((k) => k.vinKey === v.vinKey)).map((v) => `${v.vinKey} is already in the plant (${PLANT_STAGE_WORDS[v.stage as PlantStage] ?? v.stage}).`),
  ];
}

/** The kits of a shipment, written with their arrival checks (one transaction with the shipment when it is new). */
async function createKits(tx: Prisma.TransactionClient, s: { id: string; organisationId: string; branchId: string }, lines: ReturnType<typeof parseKitLines>['kits'], userId: string): Promise<{ id: string; number: string; vin: string }[]> {
  const numbers = await nextNumbers('KIT', lines.length, tx);
  const out: { id: string; number: string; vin: string }[] = [];
  for (const [i, l] of lines.entries()) {
    const template = kitTemplateFor(l.modelCode)!;
    const kit = await tx.plantKit.create({
      data: {
        number: numbers[i]!, organisationId: s.organisationId, branchId: s.branchId, shipmentId: s.id,
        vin: l.vin, vinKey: l.vin, engineNumber: l.engineNumber, modelCode: l.modelCode, lotNumber: l.lotNumber, kitType: l.kitType, casesExpected: l.casesExpected,
        templateKey: template.key, templateVersion: template.version, createdById: userId,
      },
      select: { id: true, number: true, vin: true },
    });
    await tx.plantKitCheck.createMany({ data: template.items.map((it, n) => ({ kitId: kit.id, code: it.code, section: it.section, label: it.label, sort: n, allowNa: Boolean(it.allowNa) })) });
    out.push(kit);
  }
  return out;
}

const ARRIVAL_MAX_DAYS_AHEAD = 1;

/**
 * Records an arriving shipment and its kits (pasted from the packing list,
 * one per line). All or nothing: any line that cannot come in is listed,
 * and nothing is saved until every line is right.
 */
export async function createShipment(input: ShipmentInput): Promise<Done<{ id: string; number: string; kits: number }>> {
  await authorize('plant.kit.receive', undefined, 'createShipment', RECEIVE_ONLY);
  try { await refuseDuringAssist('createShipment'); } catch (e) { return fail((e as Error).message); }
  const me = await getPrincipal();
  const f = await kitFence();
  const supplier = clean(input.supplier, 120);
  if (!supplier) return fail('Say who shipped the kits (the supplier).');
  let branchId = input.branchId || me.branchId || '';
  try { branchId = await branchWithinReach('plant.kit.receive', branchId); } catch { return fail('Choose the plant the kits arrived at.'); }
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessUnit: { organisationId: f.organisationId } }, select: { id: true } });
  if (!branch) return fail('Choose the plant the kits arrived at.');
  const arrived = input.arrivedAt ? new Date(`${String(input.arrivedAt).slice(0, 10)}T12:00:00+01:00`) : null;
  if (!arrived || Number.isNaN(arrived.getTime())) return fail('Choose the day the shipment arrived.');
  if (arrived.getTime() > Date.now() + ARRIVAL_MAX_DAYS_AHEAD * 86_400_000) return fail('The arrival day cannot be in the future.');
  if (arrived.getFullYear() < 2000) return fail('Check the arrival day.');
  const bl = code(input.billOfLading, 40);
  if (bl) {
    const same = await prisma.plantShipment.findFirst({ where: { organisationId: f.organisationId, billOfLading: bl }, select: { number: true } });
    if (same) return fail(`Bill of lading ${bl} is already shipment ${same.number}. Add the kits to it instead.`);
  }
  const parsed = parseKitLines(input.kits, { modelCode: input.modelCode, kitType: KIT_TYPES.includes(input.kitType as KitType) ? (input.kitType as KitType) : null });
  if (!parsed.kits.length && !parsed.problems.length) return fail('Add the kits: one line per kit, as on the packing list (VIN, engine number, model, lot, cases).');
  const problems = [...parsed.problems, ...(await vinConflicts(f.organisationId, parsed.kits.map((k) => k.vin)))];
  if (problems.length) return fail(`Nothing was saved. ${problems.slice(0, 6).join(' ')}${problems.length > 6 ? ` And ${problems.length - 6} more.` : ''}`);
  const containers = [...new Set(String(input.containers ?? '').toUpperCase().split(/[\s,;]+/).map((c) => c.replace(/[^A-Z0-9]/g, '')).filter((c) => c.length >= 4 && c.length <= 15))].slice(0, 50);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        const [number] = await nextNumbers('SHP', 1, tx);
        const s = await tx.plantShipment.create({
          data: {
            number: number!, organisationId: f.organisationId, branchId, supplier, origin: clean(input.origin, 80), billOfLading: bl, vessel: clean(input.vessel, 80), containers, arrivedAt: arrived,
            sapPurchaseOrder: code(input.sapPurchaseOrder, 20), sapInboundDelivery: code(input.sapInboundDelivery, 20), notes: clean(input.notes, 1000), createdById: me.userId,
          },
          select: { id: true, number: true, organisationId: true, branchId: true },
        });
        const kits = await createKits(tx, s, parsed.kits, me.userId);
        return { s, kits };
      }, { timeout: 30_000, maxWait: 10_000 });
      await writeAuditLog({ userId: me.userId, action: 'plant.shipment_recorded', entityType: 'PlantShipment', entityId: out.s.id, metadata: { number: out.s.number, supplier, billOfLading: bl, kits: out.kits.length, sapPurchaseOrder: code(input.sapPurchaseOrder, 20) } });
      return { ok: true, id: out.s.id, number: out.s.number, kits: out.kits.length };
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return fail('EJO is busy numbering shipments. Try again.');
}

/** More kits for a shipment already recorded (a second packing list, or kits found later). Same checks, all or nothing. */
export async function addKitsToShipment(shipmentId: string, input: { kits?: string; modelCode?: string; kitType?: string }): Promise<Done<{ added: number }>> {
  await authorize('plant.kit.receive', undefined, 'addKitsToShipment', RECEIVE_ONLY);
  try { await refuseDuringAssist('addKitsToShipment'); } catch (e) { return fail((e as Error).message); }
  const s = await myShipment(shipmentId);
  if (!s) return fail('This shipment is not available.');
  const me = await getPrincipal();
  try { await branchWithinReach('plant.kit.receive', s.branchId); } catch { return fail('This shipment is at another plant.'); }
  const parsed = parseKitLines(input.kits, { modelCode: input.modelCode, kitType: KIT_TYPES.includes(input.kitType as KitType) ? (input.kitType as KitType) : null });
  if (!parsed.kits.length && !parsed.problems.length) return fail('Add the kits: one line per kit (VIN, engine number, model, lot, cases).');
  const problems = [...parsed.problems, ...(await vinConflicts(s.organisationId, parsed.kits.map((k) => k.vin)))];
  if (problems.length) return fail(`Nothing was saved. ${problems.slice(0, 6).join(' ')}${problems.length > 6 ? ` And ${problems.length - 6} more.` : ''}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const kits = await prisma.$transaction((tx) => createKits(tx, s, parsed.kits, me.userId), { timeout: 30_000, maxWait: 10_000 });
      await writeAuditLog({ userId: me.userId, action: 'plant.kits_added', entityType: 'PlantShipment', entityId: s.id, metadata: { number: s.number, kits: kits.map((k) => k.number) } });
      return { ok: true, added: kits.length };
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return fail('EJO is busy numbering kits. Try again.');
}

// ── Inspecting a kit ────────────────────────────────────────────────────

/** One arrival check: OK, Not OK (say what is wrong) or N/A where it applies. The first answer starts the inspection. */
export async function setKitCheck(kitId: string, checkCode: string, result: string, note?: string): Promise<Done<{ status: KitStatus }>> {
  await authorize('plant.kit.receive', undefined, 'setKitCheck', RECEIVE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  if (!isCheckResult(result)) return fail('Choose OK, Not OK or N/A.');
  const c = k.checks.find((x) => x.code === checkCode);
  if (!c) return fail('That check is not on this kit’s list.');
  if (result === 'NA' && !c.allowNa) return fail('N/A is not allowed for this check: every kit has it.');
  const text = clean(note, 500);
  if (result === 'NOT_OK' && !text) return fail('Say what is wrong.');
  const res = await prisma.plantKitCheck.updateMany({
    where: { kitId: k.id, code: c.code, kit: { status: { in: KIT_EDITABLE } } },
    data: { result: result as CheckResult, note: result === 'NOT_OK' ? text : text ?? null, checkedById: me.userId, checkedAt: new Date() },
  });
  if (!res.count) return fail('This kit can no longer be changed. Refresh the page.');
  // The first answer: the kit is being inspected, by this person.
  await prisma.plantKit.updateMany({ where: { id: k.id, status: 'ARRIVED' }, data: { status: 'INSPECTING', inspectorId: me.userId, startedAt: new Date() } });
  await prisma.plantKit.updateMany({ where: { id: k.id, inspectorId: null }, data: { inspectorId: me.userId, startedAt: new Date() } });
  if (result === 'NOT_OK') await writeAuditLog({ userId: me.userId, action: 'plant.kit_check_not_ok', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, check: c.label, note: text } });
  return { ok: true, status: k.status === 'ARRIVED' ? 'INSPECTING' : (k.status as KitStatus) };
}

/** Cases counted on arrival, and notes. */
export async function setKitCases(kitId: string, input: { casesReceived?: string | number | null; notes?: string | null }): Promise<Done> {
  await authorize('plant.kit.receive', undefined, 'setKitCases', RECEIVE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  const raw = input.casesReceived;
  const n = raw === null || raw === undefined || raw === '' ? null : Number(String(raw).trim());
  if (n !== null && (!Number.isInteger(n) || n < 0 || n > 500)) return fail('The number of cases must be a whole number from 0 to 500.');
  const res = await prisma.plantKit.updateMany({
    where: { id: k.id, status: { in: KIT_EDITABLE } },
    data: { casesReceived: n, notes: input.notes === undefined ? k.notes : clean(input.notes, 1000), ...(k.status === 'ARRIVED' ? { status: 'INSPECTING', inspectorId: k.inspectorId ?? me.userId, startedAt: k.startedAt ?? new Date() } : {}) },
  });
  if (!res.count) return fail('This kit can no longer be changed. Refresh the page.');
  if (n !== null && k.casesExpected !== null && n !== k.casesExpected) await writeAuditLog({ userId: me.userId, action: 'plant.kit_cases_differ', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, expected: k.casesExpected, received: n } });
  return { ok: true };
}

/** The SAP numbers, once SAP has them: the inspection lot and the goods receipt's material document. Any time until the kit is cancelled. */
export async function setKitSapNumbers(kitId: string, input: { sapInspectionLot?: string | null; sapMaterialDocument?: string | null }): Promise<Done> {
  const [receive, release] = await Promise.all([allows('plant.kit.receive'), allows('plant.kit.release')]);
  if (!receive && !release) await authorize('plant.kit.receive', undefined, 'setKitSapNumbers', RECEIVE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  const lot = code(input.sapInspectionLot, 20);
  const doc = code(input.sapMaterialDocument, 20);
  const res = await prisma.plantKit.updateMany({ where: { id: k.id, status: { not: 'CANCELLED' } }, data: { sapInspectionLot: lot, sapMaterialDocument: doc } });
  if (!res.count) return fail('This kit was cancelled.');
  await writeAuditLog({ userId: me.userId, action: 'plant.kit_sap_numbers', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, inspectionLot: lot, materialDocument: doc } });
  return { ok: true };
}

/** A shortage, damaged part, wrong part or excess, against its part and case. Also after release (found on the line). */
export async function raiseKitIssue(kitId: string, input: { kind?: string; partNumber?: string; description?: string; caseNumber?: string; quantity?: string | number; stopsLine?: boolean }): Promise<Done<{ id: string }>> {
  await authorize('plant.kit.receive', undefined, 'raiseKitIssue', RECEIVE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  if (['REJECTED', 'CANCELLED'].includes(k.status)) return fail('This kit was rejected or cancelled.');
  const kind = ISSUE_KINDS.includes(String(input.kind) as IssueKind) ? (String(input.kind) as IssueKind) : null;
  if (!kind) return fail('Choose what kind of issue it is: shortage, damaged, wrong part or excess.');
  const description = clean(input.description, 300);
  if (!description) return fail('Say what the part is, or what is wrong.');
  const qty = input.quantity === undefined || input.quantity === '' ? 1 : Number(input.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) return fail('The quantity must be a whole number from 1.');
  const issue = await prisma.plantKitIssue.create({
    data: { organisationId: k.organisationId, kitId: k.id, kind, partNumber: code(input.partNumber, 40), description, caseNumber: code(input.caseNumber, 30), quantity: qty, stopsLine: Boolean(input.stopsLine), raisedById: me.userId },
    select: { id: true },
  });
  await prisma.plantKit.update({ where: { id: k.id }, data: { updatedAt: new Date() } });
  await writeAuditLog({ userId: me.userId, action: 'plant.kit_issue_raised', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, kind, partNumber: code(input.partNumber, 40), description, quantity: qty, stopsLine: Boolean(input.stopsLine) } });
  return { ok: true, id: issue.id };
}

/** Follows an issue on: claimed from the supplier (with the claim's reference), or resolved (what was done). */
export async function followUpKitIssue(issueId: string, input: { action: 'claim' | 'resolve'; claimReference?: string; resolution?: string }): Promise<Done> {
  const [receive, release] = await Promise.all([allows('plant.kit.receive'), allows('plant.kit.release')]);
  if (!receive && !release) await authorize('plant.kit.receive', undefined, 'followUpKitIssue', RECEIVE_ONLY);
  const f = await kitFence();
  const issue = await prisma.plantKitIssue.findFirst({ where: { id: String(issueId ?? '').slice(0, 40), organisationId: f.organisationId, kit: { ...f.branch } as Prisma.PlantKitWhereInput }, include: { kit: { select: { id: true, number: true } } } });
  if (!issue) return fail('This issue is not available.');
  const me = await getPrincipal();
  if (input.action === 'claim') {
    const ref = clean(input.claimReference, 60);
    if (!ref) return fail('Give the claim’s reference (the supplier’s or the insurer’s).');
    const res = await prisma.plantKitIssue.updateMany({ where: { id: issue.id, status: 'OPEN' }, data: { status: 'CLAIMED', claimReference: ref, claimedAt: new Date() } });
    if (!res.count) return fail('Only an open issue can be claimed. Refresh the page.');
    await writeAuditLog({ userId: me.userId, action: 'plant.kit_issue_claimed', entityType: 'PlantKit', entityId: issue.kit.id, metadata: { number: issue.kit.number, part: issue.partNumber ?? issue.description, claim: ref } });
    return { ok: true };
  }
  if (input.action === 'resolve') {
    const what = clean(input.resolution, 300);
    if (!what || what.length < 3) return fail('Say how it was put right (the part arrived, was replaced, or was not needed).');
    const res = await prisma.plantKitIssue.updateMany({ where: { id: issue.id, status: { in: ISSUE_UNRESOLVED } }, data: { status: 'RESOLVED', resolution: what, resolvedById: me.userId, resolvedAt: new Date() } });
    if (!res.count) return fail('This issue is already resolved. Refresh the page.');
    await writeAuditLog({ userId: me.userId, action: 'plant.kit_issue_resolved', entityType: 'PlantKit', entityId: issue.kit.id, metadata: { number: issue.kit.number, part: issue.partNumber ?? issue.description, resolution: what } });
    return { ok: true };
  }
  return fail('Choose what to do.');
}

/** Sends the kit for release. Says what is still missing. */
export async function submitKit(kitId: string): Promise<Done> {
  await authorize('plant.kit.receive', undefined, 'submitKit', RECEIVE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  if (!KIT_EDITABLE.includes(k.status as KitStatus)) return fail('This kit is not being inspected.');
  const blockers = kitBlockers(k.checks.map(checkState), k.casesExpected, k.casesReceived);
  if (blockers.length) return fail(blockers.join(' '));
  const res = await prisma.plantKit.updateMany({ where: { id: k.id, status: { in: KIT_EDITABLE } }, data: { status: 'SUBMITTED', submittedAt: new Date(), inspectorId: k.inspectorId ?? me.userId } });
  if (!res.count) return fail('This kit changed meanwhile. Refresh the page.');
  const open = k.issues.filter((i) => ISSUE_UNRESOLVED.includes(i.status as IssueStatus));
  await writeAuditLog({ userId: me.userId, action: 'plant.kit_submitted', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, vin: k.vin, openIssues: open.length, stopsLine: open.filter((i) => i.stopsLine).length } });
  return { ok: true };
}

/** The decider is never the inspector, nor anyone who answered a check. */
function checkedBy(k: { inspectorId: string | null; checks: { checkedById: string | null }[] }, userId: string): boolean {
  return k.inspectorId === userId || k.checks.some((c) => c.checkedById === userId);
}

/**
 * Releases the kit to the line (SAP usage decision A): never with a
 * line-stopping issue open; open shortages need a concession note. The
 * vehicle is created in the plant at stage LINE (or, if it is already
 * there, linked and moved on to the line).
 */
export async function releaseKit(kitId: string, note?: string): Promise<Done<{ vehicleId: string }>> {
  try { await refuseDuringAssist('releaseKit'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.kit.release', undefined, 'releaseKit', RELEASE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  if (k.status !== 'SUBMITTED') return fail('This kit is not waiting for release.');
  if (checkedBy(k, me.userId)) return fail('You checked this kit, so another supervisor must release it.');
  const words = clean(note, 500);
  const verdict = releaseVerdict(k.issues.map(issueState), words);
  if (!verdict.ok) return fail(verdict.why);
  const model = modelByCode(k.modelCode);
  if (!model) return fail(`The model ${k.modelCode} is not built at this plant.`);
  const branch = await prisma.branch.findUnique({ where: { id: k.branchId }, select: { sapPlant: true } });
  const out = await prisma.$transaction(async (tx) => {
    const r = await tx.plantKit.updateMany({ where: { id: k.id, status: 'SUBMITTED' }, data: { status: 'RELEASED', decidedById: me.userId, decidedAt: new Date(), decisionNote: words, releasedWithShortages: verdict.withShortages, sapUsageDecision: 'A' } });
    if (!r.count) return null;
    let vehicle = await tx.plantVehicle.findFirst({ where: { organisationId: k.organisationId, vinKey: k.vinKey }, select: { id: true } });
    let created = false;
    if (vehicle) {
      await tx.plantVehicle.updateMany({ where: { id: vehicle.id, stage: 'KIT' }, data: { stage: 'LINE' } });
    } else {
      vehicle = await tx.plantVehicle.create({
        data: {
          organisationId: k.organisationId, branchId: k.branchId, vin: k.vin, vinKey: k.vinKey, make: model.make, modelCode: model.code, modelName: model.name.replace(/ \(.*\)$/, ''),
          engineNumber: k.engineNumber, stage: 'LINE', sapPlant: branch?.sapPlant ?? null, createdById: me.userId,
        },
        select: { id: true },
      });
      created = true;
    }
    await tx.plantKit.update({ where: { id: k.id }, data: { plantVehicleId: vehicle.id } });
    return { vehicleId: vehicle.id, created };
  });
  if (!out) return fail('This kit changed meanwhile. Refresh the page.');
  const open = k.issues.filter((i) => ISSUE_UNRESOLVED.includes(i.status as IssueStatus));
  await writeAuditLog({ userId: me.userId, action: verdict.withShortages ? 'plant.kit_released_with_shortages' : 'plant.kit_released', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, vin: k.vin, usageDecision: 'A', inspectorId: k.inspectorId, ...(verdict.withShortages ? { openIssues: open.length, concession: words } : {}) } });
  if (out.created) await writeAuditLog({ userId: me.userId, action: 'plant.vehicle_registered', entityType: 'PlantVehicle', entityId: out.vehicleId, metadata: { vin: k.vin, model: k.modelCode, engineNumber: k.engineNumber, from: k.number } });
  return { ok: true, vehicleId: out.vehicleId };
}

/** Holds the kit (quarantine: no usage decision yet). The inspector puts it right and submits again. */
export async function holdKit(kitId: string, reason: string): Promise<Done> {
  try { await refuseDuringAssist('holdKit'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.kit.release', undefined, 'holdKit', RELEASE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  if (k.status !== 'SUBMITTED') return fail('This kit is not waiting for release.');
  if (checkedBy(k, me.userId)) return fail('You checked this kit, so another supervisor must decide.');
  const why = clean(reason, 500);
  if (!why || why.length < 5) return fail('Say why the kit is held and what must happen first (a few words).');
  const res = await prisma.plantKit.updateMany({ where: { id: k.id, status: 'SUBMITTED' }, data: { status: 'ON_HOLD', decidedById: me.userId, decidedAt: new Date(), decisionNote: why, sapUsageDecision: null } });
  if (!res.count) return fail('This kit changed meanwhile. Refresh the page.');
  await writeAuditLog({ userId: me.userId, action: 'plant.kit_held', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, vin: k.vin, reason: why } });
  return { ok: true };
}

/** Rejects the kit (SAP usage decision R): it is not built, and goes back to the supplier. Final. */
export async function rejectKit(kitId: string, reason: string): Promise<Done> {
  try { await refuseDuringAssist('rejectKit'); } catch (e) { return fail((e as Error).message); }
  await authorize('plant.kit.release', undefined, 'rejectKit', RELEASE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  if (k.status !== 'SUBMITTED' && k.status !== 'ON_HOLD') return fail('Only a kit waiting for release or on hold can be rejected.');
  if (checkedBy(k, me.userId)) return fail('You checked this kit, so another supervisor must decide.');
  const why = clean(reason, 500);
  if (!why || why.length < 5) return fail('Say why the kit is rejected (a few words).');
  const res = await prisma.plantKit.updateMany({ where: { id: k.id, status: { in: ['SUBMITTED', 'ON_HOLD'] } }, data: { status: 'REJECTED', decidedById: me.userId, decidedAt: new Date(), decisionNote: why, sapUsageDecision: 'R' } });
  if (!res.count) return fail('This kit changed meanwhile. Refresh the page.');
  await writeAuditLog({ userId: me.userId, action: 'plant.kit_rejected', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, vin: k.vin, usageDecision: 'R', reason: why } });
  return { ok: true };
}

/** Cancels a kit recorded by mistake, before anyone decided on it (kept, never deleted; its VIN may come in again). */
export async function cancelKit(kitId: string, reason: string): Promise<Done> {
  await authorize('plant.kit.receive', undefined, 'cancelKit', RECEIVE_ONLY);
  const k = await myKit(kitId);
  if (!k) return fail('This kit is not available.');
  const me = await getPrincipal();
  const why = clean(reason, 300);
  if (!why || why.length < 5) return fail('Say why it is cancelled.');
  const res = await prisma.plantKit.updateMany({ where: { id: k.id, status: { in: ['ARRIVED', 'INSPECTING'] } }, data: { status: 'CANCELLED', decisionNote: why } });
  if (!res.count) return fail('Only a kit not yet sent for release can be cancelled.');
  await writeAuditLog({ userId: me.userId, action: 'plant.kit_cancelled', entityType: 'PlantKit', entityId: k.id, metadata: { number: k.number, vin: k.vin, reason: why } });
  return { ok: true };
}

/** For the dashboard and Approvals: kits waiting for this supervisor (never one they checked), and the inspector's own kits on hold. */
export async function getKitDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const [receive, release] = await Promise.all([allows('plant.kit.receive'), allows('plant.kit.release')]);
  if (!receive && !release) return [];
  const me = await getPrincipal();
  const f = await kitFence();
  const base = { organisationId: f.organisationId, ...f.branch } as Prisma.PlantKitWhereInput;
  const [waiting, held] = await Promise.all([
    release ? prisma.plantKit.findMany({ where: { ...base, status: 'SUBMITTED', NOT: { inspectorId: me.userId }, checks: { none: { checkedById: me.userId } } }, orderBy: { submittedAt: 'asc' }, take: 20, select: { id: true, number: true, vin: true, modelCode: true, submittedAt: true, updatedAt: true, issues: { where: { status: { in: ISSUE_UNRESOLVED } }, select: { id: true } } } }) : [],
    receive ? prisma.plantKit.findMany({ where: { ...base, status: 'ON_HOLD', inspectorId: me.userId }, orderBy: { decidedAt: 'desc' }, take: 20, select: { id: true, number: true, vin: true, decisionNote: true, updatedAt: true } }) : [],
  ]);
  return [
    ...waiting.map((k) => ({ id: `kit-release-${k.id}`, title: `Release kit ${k.number}`, detail: `${k.vin} · ${k.modelCode}${k.issues.length ? ` · ${k.issues.length} open ${k.issues.length === 1 ? 'issue' : 'issues'}` : ''}`, url: `/plant/kits/${k.id}`, createdAt: k.submittedAt ?? k.updatedAt })),
    ...held.map((k) => ({ id: `kit-hold-${k.id}`, title: `Kit ${k.number} is on hold`, detail: `${k.vin} · ${k.decisionNote ?? ''}`, url: `/plant/kits/${k.id}`, createdAt: k.updatedAt })),
  ];
}
