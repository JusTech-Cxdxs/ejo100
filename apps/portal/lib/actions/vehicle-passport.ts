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
import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, orgWhere, reachWhere, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { requireUser } from '@/lib/actions/workshop';
import { buildLife, currentStage, type LifeStage } from '@/lib/vehicle-life';
import { isChassisLike, normaliseVin, vinCheckDigitOk } from '@/lib/vin';

/** Who may open a vehicle's page: anyone whose work touches vehicles. */
const VIEWERS = ['workshop.view', 'warranty.view', 'security.view', 'crm.view'] as const;

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
  /** Links the viewer may follow. */
  may: { editVehicle: boolean; customers: boolean };
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
  if (!vehicle && records.length === 0) return null;

  const [canJobs, canWarranty, canSecurity, canCustomers, canPrint, canEdit] = await Promise.all([
    allows('workshop.job_card.view'), allows('warranty.view'), allows('security.view'), allows('crm.view'), allows('vehicles.label.print'), allows('workshop.view'),
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
    records: records.map((r) => ({ id: r.id, kind: r.kind, date: ymd(r.eventDate), stage: r.stage, result: r.result, reference: r.reference, notes: r.notes, inspector: r.inspector })),
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
    description: vehicle ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') : model,
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
    may: { editVehicle: Boolean(vehicle) && canEdit, customers: canCustomers },
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
  const known = (await prisma.customerVehicle.count({ where: { chassisNumber: { equals: vin, mode: 'insensitive' }, customer: fence } })) + (await prisma.vehicleHistoryRecord.count({ where: { ...fence, vinKey: vin, voidedAt: null } }));
  if (!known) throw new Error('That is not a vehicle EJO knows.');
  const p = await getPrincipal();
  const org = await myOrganisationId();
  await writeAuditLog({ userId: p.userId, action: 'vehicle.label_printed', entityType: 'VehicleVin', entityId: vin, metadata: { vin, what: LABEL_WORDS[kind] } });
  // Counted per paper: the windscreen label's own reprints, not every paper printed for the vehicle.
  return prisma.auditLog.count({ where: { ...(org ? { organisationId: org } : {}), action: 'vehicle.label_printed', entityType: 'VehicleVin', entityId: vin, metadata: { path: ['what'], equals: LABEL_WORDS[kind] } } });
}
