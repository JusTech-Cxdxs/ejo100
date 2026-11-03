/**
 * Writes the plant demo (./plan.ts) into an organisation's assembly plant,
 * replacing the demo records already there and nothing else.
 *
 * Every demo record carries externalSource "EJO-DEMO", so a reset deletes
 * exactly the records the last load made (their station visits, defects,
 * audits, PDIs, kits, checks and issues go with them) and never a record a
 * person made in EJO. The demo people are the demo organisation's people
 * (lib/demo/people.ts): kept, upserted by email; their sign-ins are made by
 * lib/demo/people-load.ts, not here. Used by `npm run demo:reset` and by the administrator's
 * button on the plant page; the callers decide who may run it and when.
 */
import { Prisma, prisma } from '@ejo/database';
import { DEMO_PEOPLE, DEMO_SOURCE, planPlantDemo, type DemoPerson, type PlantDemoPlan } from './plan';
import { normaliseVin } from '../../vin';
import { lagosYear } from '../../utils/format-date';
import { highestSequence } from '../../recycle-bin/numbers';

export type DemoLoadResult = { plantId: string; plantName: string; removed: { vehicles: number; shipments: number }; made: { people: number; shipments: number; kits: number; vehicles: number; visits: number; defects: number; audits: number; pdis: number }; figures: PlantDemoPlan['figures'] };

const CHUNK = 500;
async function inChunks<T>(rows: T[], write: (slice: T[]) => Promise<unknown>) { for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK)); }
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** The next free number of a kind this year, counting from the highest in use. */
async function nextNumbers(kind: 'SHP' | 'KIT' | 'DEF' | 'QAA' | 'PDI', count: number, year: number): Promise<string[]> {
  const prefix = `${kind}-${year}-`;
  const q = { where: { number: { startsWith: prefix } }, select: { number: true } as const, orderBy: { number: 'desc' as const }, take: 1 };
  const rows = kind === 'SHP' ? await prisma.plantShipment.findMany(q) : kind === 'KIT' ? await prisma.plantKit.findMany(q) : kind === 'DEF' ? await prisma.plantDefect.findMany(q) : kind === 'QAA' ? await prisma.plantQaAudit.findMany(q) : await prisma.pdiInspection.findMany(q);
  const from = highestSequence(prefix, rows.map((r) => r.number));
  return Array.from({ length: count }, (_, i) => `${prefix}${String(from + 1 + i).padStart(6, '0')}`);
}

/** Removes the demo records of an organisation (and everything hanging off them). */
export async function removePlantDemo(organisationId: string): Promise<{ vehicles: number; shipments: number }> {
  const vehicles = await prisma.plantVehicle.deleteMany({ where: { organisationId, externalSource: DEMO_SOURCE } });
  const shipments = await prisma.plantShipment.deleteMany({ where: { organisationId, externalSource: DEMO_SOURCE } });
  return { vehicles: vehicles.count, shipments: shipments.count };
}

/** The demo people on the plant: created or updated by email, in their roles and departments (no password here). */
async function ensurePeople(organisationId: string, plantId: string): Promise<Map<string, string>> {
  const [roles, departments] = await Promise.all([
    prisma.role.findMany({ where: { organisationId, slug: { in: [...new Set(DEMO_PEOPLE.map((p) => p.role))] } }, select: { id: true, slug: true } }),
    prisma.department.findMany({ where: { branchId: plantId }, select: { id: true, slug: true } }),
  ]);
  const ids = new Map<string, string>();
  for (const p of DEMO_PEOPLE) {
    const department = departments.find((d) => d.slug === p.department)?.id ?? null;
    // The plant demo's first release used other addresses: that account is renamed, never doubled.
    if (p.previousEmail && !(await prisma.user.findUnique({ where: { email: p.email }, select: { id: true } }))) {
      const old = await prisma.user.findUnique({ where: { email: p.previousEmail }, select: { id: true, organisationId: true } });
      if (old && (!old.organisationId || old.organisationId === organisationId)) await prisma.user.update({ where: { id: old.id }, data: { email: p.email } });
    }
    const taken = await prisma.user.findUnique({ where: { employeeId: p.employeeId }, select: { id: true, email: true } });
    const employeeId = !taken || taken.email === p.email ? p.employeeId : null; // another account's number: leave it
    const existing = await prisma.user.findUnique({ where: { email: p.email }, select: { id: true, organisationId: true, isActive: true } });
    if (existing?.organisationId && existing.organisationId !== organisationId) throw new Error(`${p.email} belongs to another organisation.`);
    const user = await prisma.user.upsert({
      where: { email: p.email },
      // An account an administrator switched off stays off.
      update: { fullName: p.fullName, organisationId, branchId: plantId, departmentId: department, ...(employeeId ? { employeeId } : {}) },
      create: { email: p.email, fullName: p.fullName, organisationId, branchId: plantId, departmentId: department, employeeId, accountType: 'EMPLOYEE', isActive: true, emailVerified: true },
      select: { id: true },
    });
    ids.set(p.key, user.id);
    const role = roles.find((r) => r.slug === p.role);
    if (role) await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }
  return ids;
}

/**
 * Loads the plan into the organisation's assembly plant (the first one),
 * after removing the previous demo. `anchor` is "now" for the story.
 */
export async function loadPlantDemo(organisationId: string, anchor: Date = new Date()): Promise<DemoLoadResult> {
  const plant = await prisma.branch.findFirst({ where: { businessUnit: { organisationId }, type: 'ASSEMBLY_PLANT' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, sapPlant: true } });
  if (!plant) throw new Error('This organisation has no assembly plant yet. Open it first (Assembly plant → Open the assembly plant now).');
  const plan = planPlantDemo(anchor);
  const removed = await removePlantDemo(organisationId);
  const people = await ensurePeople(organisationId, plant.id);
  const who = (key: string | null | undefined): string | null => (key ? people.get(key) ?? null : null);
  const by = (key: string) => people.get(key)!;
  const year = lagosYear(anchor);
  const base = { organisationId, branchId: plant.id };

  // Shipments and kits.
  const shipNumbers = await nextNumbers('SHP', plan.shipments.length, year);
  const allKits = plan.shipments.flatMap((s) => s.kits);
  const kitNumbers = await nextNumbers('KIT', allKits.length, year);
  const kitNumberOf = new Map(allKits.map((k, i) => [k.key, kitNumbers[i]!]));
  const shipmentIds = new Map<string, string>();
  for (const [i, s] of plan.shipments.entries()) {
    const created = await prisma.plantShipment.create({
      data: { ...base, number: shipNumbers[i]!, supplier: s.supplier, origin: s.origin, billOfLading: s.billOfLading, vessel: s.vessel, containers: s.containers, arrivedAt: s.arrivedAt, sapPurchaseOrder: s.sapPurchaseOrder, sapInboundDelivery: s.sapInboundDelivery, notes: s.notes, createdById: by('kit1'), createdAt: s.arrivedAt, externalSource: DEMO_SOURCE, externalId: s.key },
      select: { id: true },
    });
    shipmentIds.set(s.key, created.id);
  }
  // Vehicles first (kits point at them).
  const vehicleRows = plan.vehicles.map((v) => ({
    ...base, vin: v.vin, vinKey: normaliseVin(v.vin), make: v.make, modelCode: v.modelCode, modelName: v.modelName, engineNumber: v.engineNumber, colour: v.colour, modelYear: v.modelYear, stage: v.stage, sapPlant: plant.sapPlant,
    sapMaterial: v.sapMaterial, sapProductionOrder: v.sapProductionOrder, sapEquipment: v.sapEquipment, currentStation: v.currentStation, lineStartedAt: v.lineStartedAt, gatePassedAt: v.gatePassedAt, createdById: by('qs'), createdAt: v.createdAt, externalSource: DEMO_SOURCE, externalId: v.key,
  }));
  await inChunks(vehicleRows, (rows) => prisma.plantVehicle.createMany({ data: rows }));
  const vehicleIds = new Map((await prisma.plantVehicle.findMany({ where: { organisationId, externalSource: DEMO_SOURCE }, select: { id: true, externalId: true } })).map((v) => [v.externalId!, v.id]));
  const vid = (key: string) => vehicleIds.get(key)!;

  await inChunks(allKits, (rows) => prisma.plantKit.createMany({ data: rows.map((k) => {
    const shipment = plan.shipments.find((s) => s.kits.includes(k))!;
    return {
      ...base, number: kitNumberOf.get(k.key)!, shipmentId: shipmentIds.get(shipment.key)!, vin: k.vin, vinKey: normaliseVin(k.vin), engineNumber: k.engineNumber, modelCode: k.modelCode, lotNumber: k.lotNumber, kitType: k.kitType, casesExpected: k.casesExpected, casesReceived: k.casesReceived,
      templateKey: k.templateKey, templateVersion: k.templateVersion, status: k.status, inspectorId: who(k.inspector), startedAt: k.startedAt, submittedAt: k.submittedAt, decidedById: who(k.decidedBy), decidedAt: k.decidedAt, decisionNote: k.decisionNote, releasedWithShortages: k.releasedWithShortages,
      sapUsageDecision: k.sapUsageDecision, sapInspectionLot: k.sapInspectionLot, sapMaterialDocument: k.sapMaterialDocument, notes: k.notes, plantVehicleId: k.vehicleKey ? vid(k.vehicleKey) : null, createdById: by('kit1'), createdAt: shipment.arrivedAt, externalSource: DEMO_SOURCE, externalId: k.key,
    };
  }) }));
  const kitIds = new Map((await prisma.plantKit.findMany({ where: { organisationId, externalSource: DEMO_SOURCE }, select: { id: true, externalId: true } })).map((k) => [k.externalId!, k.id]));
  await inChunks(allKits.flatMap((k) => k.checks.map((c) => ({ kitId: kitIds.get(k.key)!, code: c.code, section: c.section, label: c.label, sort: c.sort, allowNa: c.allowNa, result: c.result, note: c.note, checkedById: who(c.checkedBy), checkedAt: c.checkedAt }))), (rows) => prisma.plantKitCheck.createMany({ data: rows }));
  await inChunks(allKits.flatMap((k) => k.issues.map((i) => ({ organisationId, kitId: kitIds.get(k.key)!, kind: i.kind, partNumber: i.partNumber, description: i.description, caseNumber: i.caseNumber, quantity: i.quantity, stopsLine: i.stopsLine, status: i.status, claimReference: i.claimReference, resolution: i.resolution, raisedById: by(i.raisedBy), raisedAt: i.raisedAt, claimedAt: i.claimedAt, resolvedById: who(i.resolvedBy), resolvedAt: i.resolvedAt }))), (rows) => prisma.plantKitIssue.createMany({ data: rows }));

  // The line: visits, then defects against them.
  await inChunks(plan.vehicles.flatMap((v) => v.visits.map((x) => ({ ...base, plantVehicleId: vid(v.key), code: x.code, name: x.name, kind: x.kind, sort: x.sort, standardMinutes: x.standardMinutes, checks: json(x.checks), results: json(x.results.map((r) => (r.note ? { ...r, note: r.note.replace(/DEF (\d+)/, (_m, n) => `DEF-${year}-${String(Number(n)).padStart(6, '0')}`) } : r))), status: x.status, operatorId: who(x.operator), startedAt: x.startedAt, finishedAt: x.finishedAt, passedById: who(x.passedBy), passedAt: x.passedAt, notes: x.notes, createdAt: v.lineStartedAt }))), (rows) => prisma.plantStationVisit.createMany({ data: rows }));
  const visitIds = new Map((await prisma.plantStationVisit.findMany({ where: { organisationId, vehicle: { externalSource: DEMO_SOURCE } }, select: { id: true, plantVehicleId: true, code: true } })).map((x) => [`${x.plantVehicleId}:${x.code}`, x.id]));
  const defects = plan.vehicles.flatMap((v) => v.defects.map((d) => ({ v, d }))).sort((a, b) => a.d.seq - b.d.seq);
  const defNumbers = await nextNumbers('DEF', defects.length, year);
  await inChunks(defects.map(({ v, d }, i) => ({ ...base, number: defNumbers[i]!, plantVehicleId: vid(v.key), visitId: d.stationCode ? visitIds.get(`${vid(v.key)}:${d.stationCode}`) ?? null : null, stationCode: d.stationCode, checkCode: d.checkCode, location: d.location, type: d.type, cause: d.cause, severity: d.severity, description: d.description.replace(/QAA (\d+)/, (_m, n) => `QAA-${year}-${String(Number(n)).padStart(6, '0')}`), status: d.status, raisedById: by(d.raisedBy), raisedAt: d.raisedAt, reworkNote: d.reworkNote, reworkedById: who(d.reworkedBy), reworkedAt: d.reworkedAt, verifiedById: who(d.verifiedBy), verifiedAt: d.verifiedAt, verifyNote: d.verifyNote, createdAt: d.raisedAt })), (rows) => prisma.plantDefect.createMany({ data: rows }));
  const audits = plan.vehicles.flatMap((v) => v.audits.map((a) => ({ v, a }))).sort((x, y) => x.a.seq - y.a.seq);
  const auditNumbers = await nextNumbers('QAA', audits.length, year);
  await inChunks(audits.map(({ v, a }, i) => ({ ...base, number: auditNumbers[i]!, plantVehicleId: vid(v.key), auditorId: by(a.auditor), findings: json(a.findings), demerits: a.demerits, result: a.result, notes: a.notes, startedAt: a.startedAt, finishedAt: a.finishedAt, createdAt: a.startedAt })), (rows) => prisma.plantQaAudit.createMany({ data: rows }));

  // PDI.
  const pdis = plan.vehicles.flatMap((v) => v.pdis.map((p) => ({ v, p }))).sort((x, y) => x.p.seq - y.p.seq);
  const pdiNumbers = await nextNumbers('PDI', pdis.length, year);
  await inChunks(pdis.map(({ v, p }, i) => ({ ...base, number: pdiNumbers[i]!, plantVehicleId: vid(v.key), attempt: p.attempt, templateKey: p.templateKey, templateVersion: p.templateVersion, status: p.status, odometerKm: p.odometerKm, batteryVolts: p.batteryVolts, tyreFrontPsi: p.tyreFrontPsi, tyreRearPsi: p.tyreRearPsi, faultScanDone: p.faultScanDone, faultCodes: p.faultCodes, faultCodesCleared: p.faultCodesCleared, notes: p.notes, inspectorId: by(p.inspector), startedAt: p.startedAt, submittedAt: p.submittedAt, decidedById: who(p.decidedBy), decidedAt: p.decidedAt, decisionNote: p.decisionNote, sapUsageDecision: p.sapUsageDecision, createdAt: p.startedAt })), (rows) => prisma.pdiInspection.createMany({ data: rows }));
  const pdiIds = new Map((await prisma.pdiInspection.findMany({ where: { number: { in: pdiNumbers } }, select: { id: true, number: true } })).map((p) => [p.number, p.id]));
  await inChunks(pdis.flatMap(({ p }, i) => p.items.map((it) => ({ inspectionId: pdiIds.get(pdiNumbers[i]!)!, code: it.code, section: it.section, label: it.label, sort: it.sort, allowNa: it.allowNa, result: it.result, defect: it.defect, reworkNote: it.reworkNote, reworkedAt: it.reworkedAt, reworkedById: who(it.reworkedBy), checkedById: who(it.checkedBy), checkedAt: it.checkedAt }))), (rows) => prisma.pdiItem.createMany({ data: rows }));

  // Vehicles the workshop demo (lib/workshop/demo) sold through Isolo stay sold: re-linked by VIN after a plant-only reload.
  const sold = await prisma.customerVehicle.findMany({ where: { externalSource: DEMO_SOURCE, customer: { organisationId }, chassisNumber: { in: plan.vehicles.map((v) => v.vin) } }, select: { id: true, chassisNumber: true } });
  for (const cv of sold) await prisma.plantVehicle.updateMany({ where: { organisationId, vinKey: normaliseVin(cv.chassisNumber!) }, data: { stage: 'SOLD', customerVehicleId: cv.id } });

  return {
    plantId: plant.id, plantName: plant.name, removed,
    made: { people: people.size, shipments: plan.shipments.length, kits: allKits.length, vehicles: plan.vehicles.length, visits: plan.vehicles.reduce((n, v) => n + v.visits.length, 0), defects: defects.length, audits: audits.length, pdis: pdis.length },
    figures: plan.figures,
  };
}

export { DEMO_PEOPLE, DEMO_SOURCE };
export type { DemoPerson };
