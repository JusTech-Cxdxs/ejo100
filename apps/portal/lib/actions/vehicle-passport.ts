'use server';

/**
 * One vehicle, by its VIN, from kit arrival to its latest visit — the page
 * a scanned label opens, and the one search finds.
 *
 *  • Before sale: the plant's register rows for this VIN (kit arrival and
 *    QC, every station, QA, PDI, yard), in life stages (lib/vehicle-life).
 *  • Sale and warranty start: the customer's vehicle record and its vehicle
 *    warranty.
 *  • After sale: every Job Card, Vehicle Service, warranty claim, road test
 *    and gate exit.
 *
 * Signed in, inside the person's organisation, and each part only for those
 * who may see it: Job Cards and services within their reach, warranties and
 * claims for Warranty, gate records for Security or the Workshop, the
 * customer's name for those with the CRM. A VIN EJO has never seen is "not
 * found" — never a hint about another organisation's vehicles.
 */
import { modelByCode } from '@/lib/plant/pdi';
import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, orgWhere, reachWhere, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { requireUser } from '@/lib/actions/workshop';
import { buildLife, currentStage, type LifeStage } from '@/lib/vehicle-life';
import { isChassisLike, normaliseVin, vinCheckDigitOk } from '@/lib/vin';

/** Who may open a vehicle's page: anyone whose work touches vehicles. */
const VIEWERS = ['workshop.view', 'warranty.view', 'security.view', 'crm.view', 'plant.view'] as const;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export type VehiclePassport = {
  vin: string;
  /** The VIN's own check digit (null: not a 17-character VIN). */
  checkDigitOk: boolean | null;
  description: string | null;
  vehicle: { id: string; plate: string | null; make: string | null; model: string | null; year: number | null; engineNumber: string | null; mileage: number | null; customer: { id: string; name: string } | null; registeredAt: Date } | null;
  stages: LifeStage[];
  now: string | null;
  after: {
    jobCards: { id: string; number: string; status: string; at: Date; branch: string; summary: string | null }[] | null;
    services: { id: string; number: string; status: string; at: Date; branch: string }[] | null;
    warranties: { id: string; number: string; kind: string; status: string; startsAt: Date; endsAt: Date; subject: string }[] | null;
    claims: { id: string; number: string; status: string; at: Date; complaint: string }[] | null;
    roadTests: { id: string; number: string; status: string; at: Date }[] | null;
    gateExits: { id: string; number: string; at: Date; branch: string }[] | null;
  };
  labels: { printed: number; lastAt: Date | null; mayPrint: boolean };
  /** In the assembly plant (Phase D): its stage and the numbers SAP knows it by. */
  plant: { id: string; stage: string; modelCode: string; modelName: string | null; engineNumber: string | null; colour: string | null; branch: string; sapPlant: string | null; sapMaterial: string | null; sapProductionOrder: string | null; sapEquipment: string | null } | null;
  /** The latest PDI recorded on screen (it decides the PDI certificate when there is one). */
  pdi: { id: string; number: string; status: string; at: Date; usageDecision: string | null; items: { section: string; label: string; result: string | null }[] } | null;
  /** Links the viewer may follow. */
  may: { editVehicle: boolean; customers: boolean; plant: boolean };
};

/** The vehicle with this VIN (or chassis number), for this person — null when EJO has nothing for it. */
export async function getVehiclePassport(raw: string): Promise<VehiclePassport | null> {
  await requireUser();
  let allowedAny = false;
  for (const k of VIEWERS) if (await allows(k)) { allowedAny = true; break; }
  if (!allowedAny) await authorize('workshop.view', undefined, 'getVehiclePassport', 'Vehicle pages are for the people who work on vehicles.');
  const vin = normaliseVin(raw);
  if (!isChassisLike(vin)) return null;
  const fence = await orgWhere();
  const [vehicle, records] = await Promise.all([
    prisma.customerVehicle.findFirst({
      where: { chassisNumber: { equals: vin, mode: 'insensitive' }, customer: fence },
      select: { id: true, plateNumber: true, make: true, model: true, year: true, engineNumber: true, mileage: true, createdAt: true, customer: { select: { id: true, fullName: true } } },
    }),
    prisma.vehicleHistoryRecord.findMany({
      where: { ...fence, vinKey: vin, voidedAt: null },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
      select: { id: true, kind: true, eventDate: true, stage: true, result: true, inspector: true, reference: true, notes: true, model: true },
    }),
  ]);
  const plantVehicle = await prisma.plantVehicle.findFirst({
    where: { ...fence, vinKey: vin },
    include: { branch: { select: { name: true } }, pdis: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'asc' }, include: { items: { orderBy: { sort: 'asc' }, select: { section: true, label: true, result: true } } } } },
  });
  // Its kit(s) as they arrived at the plant (D2): found by VIN, released or not (never a cancelled one).
  const kits = await prisma.plantKit.findMany({ where: { ...fence, vinKey: vin, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'asc' }, take: 5, include: { shipment: { select: { number: true, arrivedAt: true } }, issues: { select: { status: true } } } });
  if (!vehicle && records.length === 0 && !plantVehicle && !kits.length) return null;

  const [canJobs, canWarranty, canSecurity, canCustomers, canPrint, canEdit, canPlant] = await Promise.all([
    allows('workshop.job_card.view'), allows('warranty.view'), allows('security.view'), allows('crm.view'), allows('vehicles.label.print'), allows('workshop.view'), allows('plant.view'),
  ]);
  const vid = vehicle?.id ?? '__none__';
  const [jobCards, services, warranties, claims, roadTests, gateExits] = await Promise.all([
    canJobs ? prisma.jobCard.findMany({ where: { ...(await reachWhere('workshop.job_card.view')), vehicleId: vid }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, jobNumber: true, status: true, createdAt: true, complaint: true, branch: { select: { name: true } } } }) : null,
    canJobs ? prisma.vehicleService.findMany({ where: { ...(await reachWhere('workshop.job_card.view')), vehicleId: vid }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, serviceNumber: true, status: true, createdAt: true, branch: { select: { name: true } } } }) : null,
    canWarranty ? prisma.warranty.findMany({ where: { customer: fence, vehicleId: vid }, orderBy: { startsAt: 'asc' }, take: 200, select: { id: true, warrantyNumber: true, kind: true, status: true, startsAt: true, endsAt: true, subjectDescription: true } }) : null,
    canWarranty ? prisma.warrantyClaim.findMany({ where: { customer: fence, vehicleId: vid }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, claimNumber: true, status: true, createdAt: true, complaint: true } }) : null,
    canSecurity || canJobs ? prisma.roadTestPermit.findMany({ where: { ...(await reachWhere(canSecurity ? 'security.view' : 'workshop.job_card.view')), vehicleId: vid }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, permitNumber: true, status: true, createdAt: true } }) : null,
    canSecurity || canJobs ? prisma.vehicleGateExit.findMany({ where: { ...(await reachWhere(canSecurity ? 'security.view' : 'workshop.job_card.view')), vehicleId: vid }, orderBy: { exitedAt: 'desc' }, take: 200, select: { id: true, exitNumber: true, exitedAt: true, branch: { select: { name: true } } } }) : null,
  ]);

  // Sale: the vehicle's first owner in EJO; warranty start: its first vehicle warranty (Warranty sees the number).
  const vehicleWarranty = await prisma.warranty.findFirst({ where: { customer: fence, vehicleId: vid, kind: 'ASSET' }, orderBy: { startsAt: 'asc' }, select: { id: true, warrantyNumber: true, startsAt: true } });
  const stages = buildLife({
    records: [
      ...records.map((r) => ({ id: r.id, kind: r.kind, date: ymd(r.eventDate), stage: r.stage, result: r.result, reference: r.reference, notes: r.notes, inspector: r.inspector })),
      // Kits recorded on screen: the arrival check, released (A), held, rejected (R) or still being checked; the number links to it for the plant.
      ...kits.map((k) => {
        const open = k.issues.filter((i) => i.status !== 'RESOLVED').length;
        return {
          id: k.id, kind: 'KIT', date: ymd(k.decidedAt ?? k.submittedAt ?? k.shipment.arrivedAt), stage: 'Kit arrival check',
          result: k.status === 'RELEASED' ? 'PASS' : k.status === 'REJECTED' ? 'REJECTED' : k.status === 'ON_HOLD' ? 'HOLD' : 'OPEN', reference: k.number,
          notes: [k.status === 'RELEASED' ? (k.releasedWithShortages ? 'released to the line with shortages (SAP usage decision A)' : 'released to the line (SAP usage decision A)') : k.status === 'REJECTED' ? 'rejected (R): not built' : k.status === 'ON_HOLD' ? 'on hold' : k.status === 'SUBMITTED' ? 'waiting for release' : 'being checked', `${k.kitType} kit, shipment ${k.shipment.number}`, open ? `${open} open ${open === 1 ? 'issue' : 'issues'}` : null].filter(Boolean).join(' · '),
          inspector: null, source: 'ejo' as const, ...(canPlant ? { href: `/plant/kits/${k.id}` } : {}),
        };
      }),
      // PDIs recorded on screen: one check ("PDI checklist") whose latest attempt decides; the number links to it for the plant.
      ...(plantVehicle?.pdis ?? []).map((d) => ({
        id: d.id, kind: 'PDI', date: ymd(d.decidedAt ?? d.submittedAt ?? d.startedAt), stage: 'PDI checklist',
        result: d.status === 'PASSED' ? 'PASS' : d.status === 'REWORK' ? 'REWORK' : 'OPEN', reference: d.number,
        notes: d.status === 'PASSED' ? 'accepted (SAP usage decision A)' : d.status === 'SUBMITTED' ? 'waiting for approval' : d.status === 'REWORK' ? `rework${d.sapUsageDecision === 'R' ? ' (rejected, R)' : ''}` : 'in progress',
        inspector: null, source: 'ejo' as const, ...(canPlant ? { href: `/plant/pdi/${d.id}` } : {}),
      })),
    ],
    sale: vehicle ? { date: ymd(vehicleWarranty && vehicleWarranty.startsAt < vehicle.createdAt ? vehicleWarranty.startsAt : vehicle.createdAt), label: canCustomers && vehicle.customer ? `Registered to ${vehicle.customer.fullName}` : 'Registered to its customer', href: canCustomers && vehicle.customer ? `/crm/customers/${vehicle.customer.id}` : undefined } : null,
    warrantyStart: vehicleWarranty ? { date: ymd(vehicleWarranty.startsAt), label: canWarranty ? `Warranty ${vehicleWarranty.warrantyNumber} starts` : 'Vehicle warranty starts', href: canWarranty ? `/warranty/${vehicleWarranty.id}` : undefined } : null,
  });

  const org = await myOrganisationId();
  const prints = await prisma.auditLog.findMany({ where: { ...(org ? { organisationId: org } : {}), action: 'vehicle.label_printed', entityType: 'VehicleVin', entityId: vin }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } });
  const printed = prints.length ? await prisma.auditLog.count({ where: { ...(org ? { organisationId: org } : {}), action: 'vehicle.label_printed', entityType: 'VehicleVin', entityId: vin } }) : 0;
  const model = records.find((r) => r.model)?.model ?? null;

  return {
    vin,
    checkDigitOk: vinCheckDigitOk(vin),
    description: vehicle ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') : plantVehicle ? [plantVehicle.make, plantVehicle.modelName ?? plantVehicle.modelCode].join(' ') : kits[0] ? (modelByCode(kits[0].modelCode)?.name.replace(/ \(.*\)$/, '') ?? kits[0].modelCode) : model,
    vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plateNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year, engineNumber: vehicle.engineNumber, mileage: vehicle.mileage, customer: canCustomers && vehicle.customer ? { id: vehicle.customer.id, name: vehicle.customer.fullName } : null, registeredAt: vehicle.createdAt } : null,
    stages,
    now: currentStage(stages)?.label ?? null,
    after: {
      jobCards: jobCards?.map((j) => ({ id: j.id, number: j.jobNumber, status: words(j.status), at: j.createdAt, branch: j.branch.name, summary: j.complaint })) ?? null,
      services: services?.map((s) => ({ id: s.id, number: s.serviceNumber, status: words(s.status), at: s.createdAt, branch: s.branch.name })) ?? null,
      warranties: warranties?.map((w) => ({ id: w.id, number: w.warrantyNumber, kind: w.kind === 'PART' ? 'Part' : 'Vehicle', status: words(w.status), startsAt: w.startsAt, endsAt: w.endsAt, subject: w.subjectDescription })) ?? null,
      claims: claims?.map((c) => ({ id: c.id, number: c.claimNumber, status: words(c.status), at: c.createdAt, complaint: c.complaint })) ?? null,
      roadTests: roadTests?.map((t) => ({ id: t.id, number: t.permitNumber, status: words(t.status), at: t.createdAt })) ?? null,
      gateExits: gateExits?.map((x) => ({ id: x.id, number: x.exitNumber, at: x.exitedAt, branch: x.branch.name })) ?? null,
    },
    labels: { printed, lastAt: prints[0]?.createdAt ?? null, mayPrint: canPrint },
    plant: plantVehicle ? { id: plantVehicle.id, stage: plantVehicle.stage, modelCode: plantVehicle.modelCode, modelName: plantVehicle.modelName, engineNumber: plantVehicle.engineNumber, colour: plantVehicle.colour, branch: plantVehicle.branch.name, sapPlant: plantVehicle.sapPlant, sapMaterial: plantVehicle.sapMaterial, sapProductionOrder: plantVehicle.sapProductionOrder, sapEquipment: plantVehicle.sapEquipment } : null,
    pdi: (() => { const d = plantVehicle?.pdis.at(-1); return d ? { id: d.id, number: d.number, status: d.status, at: d.decidedAt ?? d.submittedAt ?? d.startedAt, usageDecision: d.sapUsageDecision, items: d.items } : null; })(),
    may: { editVehicle: Boolean(vehicle) && canEdit, customers: canCustomers, plant: canPlant },
  };
}

export type LabelKind = 'windscreen' | 'door-jamb' | 'traveller' | 'pdi-certificate';
const LABEL_WORDS: Record<LabelKind, string> = { windscreen: 'Windscreen label', 'door-jamb': 'Door-jamb label', traveller: 'Traveller sheet', 'pdi-certificate': 'PDI certificate' };

/**
 * Records that a label, traveller sheet or PDI certificate was printed (the
 * print page calls this as it opens). One label per vehicle, always the same
 * codes: a reprint is counted and shown ("printed 3 times"), never a new code.
 * Returns how many times this paper (this label, sheet or certificate) has now been printed for the vehicle.
 */
export async function recordVehiclePrint(raw: string, kind: LabelKind): Promise<number> {
  await authorize('vehicles.label.print', undefined, 'recordVehiclePrint', 'Printing vehicle labels is not part of your role.');
  await refuseDuringAssist('recordVehiclePrint');
  const vin = normaliseVin(raw);
  if (!isChassisLike(vin) || !LABEL_WORDS[kind]) throw new Error('That is not a vehicle EJO knows.');
  const fence = await orgWhere();
  const known = (await prisma.customerVehicle.count({ where: { chassisNumber: { equals: vin, mode: 'insensitive' }, customer: fence } })) + (await prisma.vehicleHistoryRecord.count({ where: { ...fence, vinKey: vin, voidedAt: null } })) + (await prisma.plantVehicle.count({ where: { ...fence, vinKey: vin } })) + (await prisma.plantKit.count({ where: { ...fence, vinKey: vin, status: { not: 'CANCELLED' } } }));
  if (!known) throw new Error('That is not a vehicle EJO knows.');
  const p = await getPrincipal();
  const org = await myOrganisationId();
  await writeAuditLog({ userId: p.userId, action: 'vehicle.label_printed', entityType: 'VehicleVin', entityId: vin, metadata: { vin, what: LABEL_WORDS[kind] } });
  // Counted per paper: the windscreen label's own reprints, not every paper printed for the vehicle.
  return prisma.auditLog.count({ where: { ...(org ? { organisationId: org } : {}), action: 'vehicle.label_printed', entityType: 'VehicleVin', entityId: vin, metadata: { path: ['what'], equals: LABEL_WORDS[kind] } } });
}
