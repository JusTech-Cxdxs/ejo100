/**
 * Recycle bin: the database half (server only, never a 'use server' file —
 * nothing here is callable from a browser; lib/actions/recycle-bin.ts checks
 * who is asking first).
 *
 * Moving a record to the bin is one transaction: lock the record, check
 * again under the lock that nothing of consequence has happened, copy every
 * row the delete will remove into the snapshot, then delete for real. Lists,
 * search and analytics therefore never need a "deleted" filter, and foreign
 * keys stay honest. Restoring re-inserts the snapshot rows in order, in one
 * transaction, under the record's original id (so its audit trail joins up).
 */
import { prisma, Prisma } from '@ejo/database';
import { lockExisting } from '@/lib/integrity';
import { writeAuditLog } from '@/lib/workshop-core';
import { StaleStateError, isUniqueClashOn, numberClashPause } from '@/lib/integrity-core';
import { lagosYear } from '@/lib/utils/format-date';
import {
  BIN_KIND, binLabel, customerEligibility, jobCardEligibility, orderedSnapshot, parseSnapshot, partEligibility, plainRow,
  purgeAfterFrom, restoredReference, retentionDays, vehicleEligibility, vehicleServiceEligibility,
  type BinEntity, type Eligibility, type SnapshotRow,
} from './rules';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class RecycleBinError extends Error {}

/** What a page needs to decide whether to offer "Delete (created by mistake)". */
export type BinRecord = {
  entity: BinEntity;
  id: string;
  organisationId: string;
  branchId: string | null;
  createdById: string | null;
  createdAt: Date;
  reference: string;
  label: string;
};

export const RETENTION_DAYS = (): number => retentionDays(process.env.RECYCLE_BIN_DAYS);

const plain = (rows: object[], model: string): SnapshotRow[] => rows.map((r) => ({ model, data: plainRow(r as Record<string, unknown>) }));
const vehicleText = (v: { make: string | null; model: string | null; plateNumber: string | null } | null) => (v ? [v.make, v.model, v.plateNumber].filter(Boolean).join(' ') : null);

// ── Reading a record: who it belongs to, how it is named ──────────────

export async function binRecord(entity: BinEntity, id: string, db: Db = prisma): Promise<BinRecord | null> {
  if (!id) return null;
  if (entity === 'JobCard') {
    const j = await db.jobCard.findUnique({ where: { id }, select: { jobNumber: true, branchId: true, createdById: true, createdAt: true, branch: { select: { businessUnit: { select: { organisationId: true } } } }, customer: { select: { fullName: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } } });
    return j ? { entity, id, organisationId: j.branch.businessUnit.organisationId, branchId: j.branchId, createdById: j.createdById, createdAt: j.createdAt, reference: j.jobNumber, label: binLabel([j.jobNumber, vehicleText(j.vehicle), j.customer.fullName]) } : null;
  }
  if (entity === 'VehicleService') {
    const s = await db.vehicleService.findUnique({ where: { id }, select: { serviceNumber: true, branchId: true, createdById: true, createdAt: true, branch: { select: { businessUnit: { select: { organisationId: true } } } }, customer: { select: { fullName: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } } });
    return s ? { entity, id, organisationId: s.branch.businessUnit.organisationId, branchId: s.branchId, createdById: s.createdById, createdAt: s.createdAt, reference: s.serviceNumber, label: binLabel([s.serviceNumber, vehicleText(s.vehicle), s.customer.fullName]) } : null;
  }
  if (entity === 'Customer') {
    const c = await db.customer.findUnique({ where: { id }, select: { fullName: true, email: true, organisationId: true, createdById: true, createdAt: true } });
    return c ? { entity, id, organisationId: c.organisationId, branchId: null, createdById: c.createdById, createdAt: c.createdAt, reference: c.fullName, label: binLabel([c.fullName, c.email]) } : null;
  }
  if (entity === 'CustomerVehicle') {
    const v = await db.customerVehicle.findUnique({ where: { id }, select: { make: true, model: true, plateNumber: true, chassisNumber: true, createdById: true, createdAt: true, customer: { select: { fullName: true, organisationId: true } } } });
    const ref = v ? v.plateNumber || v.chassisNumber || [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle' : '';
    return v ? { entity, id, organisationId: v.customer.organisationId, branchId: null, createdById: v.createdById, createdAt: v.createdAt, reference: ref, label: binLabel([vehicleText(v), v.chassisNumber, v.customer.fullName]) } : null;
  }
  const p = await db.part.findUnique({ where: { id }, select: { name: true, partNumber: true, branchId: true, createdById: true, createdAt: true, branch: { select: { name: true, businessUnit: { select: { organisationId: true } } } } } });
  return p ? { entity, id, organisationId: p.branch.businessUnit.organisationId, branchId: p.branchId, createdById: p.createdById, createdAt: p.createdAt, reference: p.partNumber || p.name, label: binLabel([p.partNumber, p.name, p.branch.name]) } : null;
}

// ── Eligibility (read with the same queries inside and outside the transaction) ──

async function jobCardFacts(db: Db, id: string) {
  const j = await db.jobCard.findUnique({
    where: { id },
    select: {
      status: true,
      estimate: { select: { status: true, lineItems: { select: { id: true } } } },
      escalatedFromVehicleService: { select: { id: true } },
      gateExit: { select: { id: true } },
      _count: { select: { payments: true, refunds: true, partRequestSlips: true, externalProcurementRequests: true, warranties: true, warrantyClaims: true, roadTestPermits: true, closeRequests: true } },
    },
  });
  if (!j) return null;
  const lineIds = j.estimate?.lineItems.map((l) => l.id) ?? [];
  const [slipLines, eprs, eprLines] = lineIds.length
    ? await Promise.all([
        db.partRequestSlipLine.count({ where: { estimateLineItemId: { in: lineIds } } }),
        db.externalProcurementRequest.count({ where: { estimateLineItemId: { in: lineIds } } }),
        db.externalProcurementRequestLine.count({ where: { estimateLineItemId: { in: lineIds } } }),
      ])
    : [0, 0, 0];
  return jobCardEligibility({
    status: j.status,
    payments: j._count.payments,
    refunds: j._count.refunds,
    estimateStatus: j.estimate?.status ?? null,
    partRequests: j._count.partRequestSlips,
    outsidePurchases: j._count.externalProcurementRequests,
    estimateLinesInUse: slipLines + eprs + eprLines,
    warranties: j._count.warranties,
    warrantyClaims: j._count.warrantyClaims,
    gateExit: Boolean(j.gateExit),
    roadTests: j._count.roadTestPermits,
    escalatedFromService: Boolean(j.escalatedFromVehicleService),
    closeRequests: j._count.closeRequests,
  });
}

async function serviceFacts(db: Db, id: string) {
  const s = await db.vehicleService.findUnique({
    where: { id },
    select: {
      status: true,
      escalatedToJobCardId: true,
      primaryServiceDate: true,
      primaryServiceMileage: true,
      inspection: { select: { status: true } },
      serviceEstimate: { select: { status: true, lineItems: { select: { id: true } } } },
      gateExit: { select: { id: true } },
      _count: { select: { payments: true, refunds: true, partRequestSlips: true, warranties: true, warrantyClaims: true, roadTestPermits: true, closeRequests: true } },
    },
  });
  if (!s) return null;
  const lineIds = s.serviceEstimate?.lineItems.map((l) => l.id) ?? [];
  const inUse = lineIds.length ? await db.partRequestSlipLine.count({ where: { serviceEstimateLineItemId: { in: lineIds } } }) : 0;
  return vehicleServiceEligibility({
    status: s.status,
    payments: s._count.payments,
    refunds: s._count.refunds,
    estimateStatus: s.serviceEstimate?.status ?? null,
    partRequests: s._count.partRequestSlips,
    estimateLinesInUse: inUse,
    inspectionStatus: s.inspection?.status ?? null,
    primaryServiceRecorded: Boolean(s.primaryServiceDate || s.primaryServiceMileage),
    escalatedToJobCard: Boolean(s.escalatedToJobCardId),
    warranties: s._count.warranties,
    warrantyClaims: s._count.warrantyClaims,
    gateExit: Boolean(s.gateExit),
    roadTests: s._count.roadTestPermits,
    closeRequests: s._count.closeRequests,
  });
}

const VEHICLE_COUNTS = { jobCards: true, vehicleServices: true, warranties: true, warrantyClaims: true, gateExits: true, roadTestPermits: true } as const;

async function vehicleFacts(db: Db, id: string) {
  const v = await db.customerVehicle.findUnique({ where: { id }, select: { _count: { select: VEHICLE_COUNTS } } });
  if (!v) return null;
  const c = v._count;
  return vehicleEligibility({ jobCards: c.jobCards, vehicleServices: c.vehicleServices, warranties: c.warranties, warrantyClaims: c.warrantyClaims, gateExits: c.gateExits, roadTests: c.roadTestPermits });
}

async function customerFacts(db: Db, id: string) {
  const c = await db.customer.findUnique({
    where: { id },
    select: { lastLoginAt: true, _count: { select: { jobCards: true, vehicleServices: true, warranties: true, warrantyClaims: true } }, vehicles: { select: { _count: { select: VEHICLE_COUNTS } } } },
  });
  if (!c) return null;
  const sum = (k: keyof typeof VEHICLE_COUNTS) => c.vehicles.reduce((n, v) => n + v._count[k], 0);
  return customerEligibility({
    // A job on the customer or on any of their vehicles counts (the same row, seen from both sides).
    jobCards: Math.max(c._count.jobCards, sum('jobCards')),
    vehicleServices: Math.max(c._count.vehicleServices, sum('vehicleServices')),
    warranties: Math.max(c._count.warranties, sum('warranties')),
    warrantyClaims: Math.max(c._count.warrantyClaims, sum('warrantyClaims')),
    gateExits: sum('gateExits'),
    roadTests: sum('roadTestPermits'),
    signedIn: Boolean(c.lastLoginAt),
  });
}

async function partFacts(db: Db, id: string) {
  const p = await db.part.findUnique({
    where: { id },
    select: {
      stock: { select: { quantityOnHand: true, quantityReserved: true } },
      _count: { select: { goodsReceiptLines: true, batches: true, serials: true, quantityConsumptions: true, requestSlipLines: true, matchedOnEstimateLines: true, matchedOnServiceEstimateLines: true, warranties: true, pricingAlerts: true } },
    },
  });
  if (!p) return null;
  const c = p._count;
  return partEligibility({
    goodsReceiptLines: c.goodsReceiptLines, batches: c.batches, serials: c.serials, consumptions: c.quantityConsumptions, requestLines: c.requestSlipLines,
    estimateMatches: c.matchedOnEstimateLines + c.matchedOnServiceEstimateLines, warranties: c.warranties, pricingAlerts: c.pricingAlerts,
    stockOnHand: Number(p.stock?.quantityOnHand ?? 0), stockReserved: Number(p.stock?.quantityReserved ?? 0),
  });
}

export async function eligibilityOf(entity: BinEntity, id: string, db: Db = prisma): Promise<Eligibility | null> {
  switch (entity) {
    case 'JobCard': return jobCardFacts(db, id);
    case 'VehicleService': return serviceFacts(db, id);
    case 'Customer': return customerFacts(db, id);
    case 'CustomerVehicle': return vehicleFacts(db, id);
    case 'Part': return partFacts(db, id);
  }
}

// ── Snapshot: every row the delete removes, parent first ──────────────

async function snapshotRows(tx: Tx, entity: BinEntity, id: string): Promise<SnapshotRow[]> {
  if (entity === 'JobCard') {
    const root = await tx.jobCard.findUniqueOrThrow({ where: { id } });
    const estimate = await tx.estimate.findUnique({ where: { jobCardId: id } });
    const [complaints, lines, cancels, closes] = await Promise.all([
      tx.jobCardComplaint.findMany({ where: { jobCardId: id }, orderBy: [{ sequenceNumber: 'asc' }, { createdAt: 'asc' }] }),
      estimate ? tx.estimateLineItem.findMany({ where: { estimateId: estimate.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : Promise.resolve([]),
      tx.cancellationRequest.findMany({ where: { jobCardId: id }, orderBy: { createdAt: 'asc' } }),
      tx.closeRequest.findMany({ where: { jobCardId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return [...plain([root], 'jobCard'), ...plain(complaints, 'jobCardComplaint'), ...plain(estimate ? [estimate] : [], 'estimate'), ...plain(lines, 'estimateLineItem'), ...plain(cancels, 'cancellationRequest'), ...plain(closes, 'closeRequest')];
  }
  if (entity === 'VehicleService') {
    const root = await tx.vehicleService.findUniqueOrThrow({ where: { id } });
    const [inspection, estimate] = await Promise.all([tx.vehicleInspection.findUnique({ where: { vehicleServiceId: id } }), tx.serviceEstimate.findUnique({ where: { vehicleServiceId: id } })]);
    const [complaints, items, lines, cancels, closes] = await Promise.all([
      tx.vehicleServiceComplaint.findMany({ where: { vehicleServiceId: id }, orderBy: [{ sequenceNumber: 'asc' }, { createdAt: 'asc' }] }),
      inspection ? tx.vehicleInspectionItem.findMany({ where: { inspectionId: inspection.id }, orderBy: { id: 'asc' } }) : Promise.resolve([]),
      estimate ? tx.serviceEstimateLineItem.findMany({ where: { estimateId: estimate.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : Promise.resolve([]),
      tx.vehicleServiceCancellationRequest.findMany({ where: { vehicleServiceId: id }, orderBy: { createdAt: 'asc' } }),
      tx.vehicleServiceCloseRequest.findMany({ where: { vehicleServiceId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return [
      ...plain([root], 'vehicleService'), ...plain(complaints, 'vehicleServiceComplaint'), ...plain(inspection ? [inspection] : [], 'vehicleInspection'), ...plain(items, 'vehicleInspectionItem'),
      ...plain(estimate ? [estimate] : [], 'serviceEstimate'), ...plain(lines, 'serviceEstimateLineItem'), ...plain(cancels, 'vehicleServiceCancellationRequest'), ...plain(closes, 'vehicleServiceCloseRequest'),
    ];
  }
  if (entity === 'CustomerVehicle') {
    const root = await tx.customerVehicle.findUniqueOrThrow({ where: { id } });
    const logs = await tx.serviceReminderLog.findMany({ where: { vehicleId: id }, orderBy: { sentAt: 'asc' } });
    return [...plain([root], 'customerVehicle'), ...plain(logs, 'serviceReminderLog')];
  }
  if (entity === 'Customer') {
    const root = await tx.customer.findUniqueOrThrow({ where: { id } });
    const vehicles = await tx.customerVehicle.findMany({ where: { customerId: id }, orderBy: { createdAt: 'asc' } });
    const [company, addresses, contacts, notes, reads, logs] = await Promise.all([
      tx.customerCompany.findUnique({ where: { customerId: id } }),
      tx.customerAddress.findMany({ where: { customerId: id }, orderBy: { createdAt: 'asc' } }),
      tx.customerContact.findMany({ where: { customerId: id }, orderBy: { createdAt: 'asc' } }),
      tx.customerNote.findMany({ where: { customerId: id }, orderBy: { createdAt: 'asc' } }),
      tx.customerNotificationRead.findMany({ where: { customerId: id } }),
      vehicles.length ? tx.serviceReminderLog.findMany({ where: { vehicleId: { in: vehicles.map((v) => v.id) } }, orderBy: { sentAt: 'asc' } }) : Promise.resolve([]),
    ]);
    // Sign-in sessions, password accounts and set-password links are not kept:
    // a restored customer is sent a fresh set-password link.
    return [
      ...plain([root], 'customer'), ...plain(company ? [company] : [], 'customerCompany'), ...plain(addresses, 'customerAddress'), ...plain(contacts, 'customerContact'),
      ...plain(notes, 'customerNote'), ...plain(reads, 'customerNotificationRead'), ...plain(vehicles, 'customerVehicle'), ...plain(logs, 'serviceReminderLog'),
    ];
  }
  const root = await tx.part.findUniqueOrThrow({ where: { id } });
  const [units, stock, fitments] = await Promise.all([
    tx.partUnitOfMeasure.findMany({ where: { partId: id }, orderBy: { unitName: 'asc' } }),
    tx.partStock.findUnique({ where: { partId: id } }),
    tx.partFitment.findMany({ where: { partId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  return [...plain([root], 'part'), ...plain(units, 'partUnitOfMeasure'), ...plain(stock ? [stock] : [], 'partStock'), ...plain(fitments, 'partFitment')];
}

const LOCK: Record<BinEntity, 'jobCard' | 'vehicleService' | 'customer' | 'customerVehicle' | 'part'> = {
  JobCard: 'jobCard', VehicleService: 'vehicleService', Customer: 'customer', CustomerVehicle: 'customerVehicle', Part: 'part',
};

async function deleteRoot(tx: Tx, entity: BinEntity, id: string): Promise<void> {
  if (entity === 'JobCard') await tx.jobCard.delete({ where: { id } });
  else if (entity === 'VehicleService') await tx.vehicleService.delete({ where: { id } });
  else if (entity === 'CustomerVehicle') await tx.customerVehicle.delete({ where: { id } });
  else if (entity === 'Part') await tx.part.delete({ where: { id } });
  else {
    // Set-password links carry the customer id in `value`, without a foreign key.
    await tx.customerVerification.deleteMany({ where: { value: id } });
    await tx.customer.delete({ where: { id } });
  }
}

/**
 * Moves one record to the bin. The caller has already checked WHO may do
 * this; here the record is locked and checked again, so a payment or parts
 * request saved a moment earlier is always seen, and one saved a moment
 * later waits for this transaction and then fails on the missing record.
 */
export async function moveToBin(entity: BinEntity, id: string, reason: string, actorId: string, now: Date = new Date()): Promise<{ itemId: string; record: BinRecord; purgeAfter: Date }> {
  const gone = `This ${BIN_KIND[entity].noun.toLowerCase()} no longer exists — it may already be in the Recycle bin.`;
  return prisma.$transaction(async (tx) => {
    await lockExisting(tx, LOCK[entity], [id], gone);
    const record = await binRecord(entity, id, tx);
    const check = await eligibilityOf(entity, id, tx);
    if (!record || !check) throw new StaleStateError(gone);
    if (!check.eligible) throw new RecycleBinError(check.message);
    const snapshot = orderedSnapshot(entity, await snapshotRows(tx, entity, id));
    const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
    const item = await tx.recycleBinItem.create({
      data: {
        organisationId: record.organisationId, branchId: record.branchId, entityType: entity, entityId: id, reference: record.reference, label: record.label, reason,
        snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter,
      },
      select: { id: true },
    });
    await deleteRoot(tx, entity, id);
    return { itemId: item.id, record, purgeAfter };
  }, { timeout: 20_000 });
}

// ── Restore ───────────────────────────────────────────────────────────

type Creator = { createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown> };
function table(tx: Tx, model: string): Creator {
  const d = (tx as unknown as Record<string, Creator | undefined>)[model];
  if (!d || typeof d.createMany !== 'function') throw new Error(`Unknown snapshot model ${model}`);
  return d;
}

/** Optional links that may point at something removed since (a part, a part
 * type, a warranty policy). They are cleared rather than blocking the restore. */
const OPTIONAL_LINKS: { model: string; field: string; target: 'department' | 'part' | 'partType' | 'warranty' | 'warrantyPolicy'; note: string }[] = [
  { model: 'jobCard', field: 'departmentId', target: 'department', note: 'Its department no longer exists, so none is set.' },
  { model: 'vehicleService', field: 'departmentId', target: 'department', note: 'Its department no longer exists, so none is set.' },
  { model: 'estimateLineItem', field: 'matchedPartId', target: 'part', note: 'A matched part no longer exists, so Store needs to match that estimate line again.' },
  { model: 'estimateLineItem', field: 'partTypeId', target: 'partType', note: 'A part type on the estimate no longer exists.' },
  { model: 'estimateLineItem', field: 'coveringWarrantyId', target: 'warranty', note: 'A warranty on the estimate no longer exists.' },
  { model: 'serviceEstimateLineItem', field: 'matchedPartId', target: 'part', note: 'A matched part no longer exists, so Store needs to match that estimate line again.' },
  { model: 'serviceEstimateLineItem', field: 'partTypeId', target: 'partType', note: 'A part type on the estimate no longer exists.' },
  { model: 'part', field: 'partTypeId', target: 'partType', note: 'Its part type no longer exists, so none is set.' },
  { model: 'part', field: 'warrantyPolicyId', target: 'warrantyPolicy', note: 'Its warranty policy no longer exists, so none is set.' },
];

async function clearDanglingLinks(tx: Tx, rows: SnapshotRow[]): Promise<string[]> {
  const notes = new Set<string>();
  for (const link of OPTIONAL_LINKS) {
    const ids = [...new Set(rows.filter((r) => r.model === link.model).map((r) => r.data[link.field]).filter((v): v is string => typeof v === 'string' && v.length > 0))];
    if (ids.length === 0) continue;
    const finder = (tx as unknown as Record<string, { findMany: (a: unknown) => Promise<{ id: string }[]> }>)[link.target]!;
    const found = new Set((await finder.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id));
    for (const r of rows) {
      const v = r.data[link.field];
      if (r.model === link.model && typeof v === 'string' && !found.has(v)) {
        r.data[link.field] = null;
        notes.add(link.note);
      }
    }
  }
  return [...notes];
}

const fail = (message: string): never => { throw new RecycleBinError(message); };

/** Checks what the record points at still exists, and that nothing has taken
 * its unique values meanwhile. Returns notes for the person (e.g. a new number). */
async function prepareRestore(tx: Tx, entity: BinEntity, organisationId: string, rows: SnapshotRow[]): Promise<{ reference: string | null; notes: string[] }> {
  const root = rows[0]!.data;
  const notes: string[] = [];
  let reference: string | null = null;

  const needCustomer = async (customerId: unknown, what: string) => {
    const c = typeof customerId === 'string' ? await tx.customer.findUnique({ where: { id: customerId }, select: { organisationId: true } }) : null;
    if (!c || c.organisationId !== organisationId) {
      const binned = typeof customerId === 'string' ? await tx.recycleBinItem.findFirst({ where: { entityType: 'Customer', entityId: customerId, restoredAt: null, purgedAt: null }, select: { id: true } }) : null;
      fail(binned ? `The customer this ${what} belongs to is in the Recycle bin too. Restore the customer first, then this ${what}.` : `The customer this ${what} belonged to no longer exists, so it can't be restored.`);
    }
  };
  const needVehicle = async (vehicleId: unknown, what: string) => {
    const v = typeof vehicleId === 'string' ? await tx.customerVehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }) : null;
    if (!v) {
      const binned = typeof vehicleId === 'string' ? await tx.recycleBinItem.findFirst({ where: { entityType: 'CustomerVehicle', entityId: vehicleId, restoredAt: null, purgedAt: null }, select: { id: true } }) : null;
      fail(binned ? `The vehicle on this ${what} is in the Recycle bin too. Restore the vehicle first, then this ${what}.` : `The vehicle on this ${what} no longer exists, so it can't be restored.`);
    }
  };
  const needBranch = async (branchId: unknown) => {
    const b = typeof branchId === 'string' ? await tx.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } }) : null;
    if (!b || b.businessUnit.organisationId !== organisationId) fail('Its branch no longer exists, so it can\'t be restored.');
  };
  const plateFree = async (v: Record<string, unknown>) => {
    for (const field of ['plateNumber', 'chassisNumber'] as const) {
      const value = v[field];
      if (typeof value !== 'string' || !value) continue;
      const clash = await tx.customerVehicle.findFirst({ where: { [field]: value }, select: { id: true } });
      if (clash) fail(`Another vehicle now has the ${field === 'plateNumber' ? 'plate number' : 'chassis number'} ${value}. Correct that vehicle first, then restore this one.`);
    }
  };

  if (entity === 'JobCard' || entity === 'VehicleService') {
    const what = BIN_KIND[entity].noun;
    await needBranch(root.branchId);
    await needCustomer(root.customerId, what);
    await needVehicle(root.vehicleId, what);
    const field = entity === 'JobCard' ? 'jobNumber' : 'serviceNumber';
    const original = String(root[field]);
    const prefix = `${entity === 'JobCard' ? 'JC' : 'SV'}-${lagosYear()}-`;
    const taken = entity === 'JobCard'
      ? Boolean(await tx.jobCard.findUnique({ where: { jobNumber: original }, select: { id: true } }))
      : Boolean(await tx.vehicleService.findUnique({ where: { serviceNumber: original }, select: { id: true } }));
    const latest = !taken ? null : entity === 'JobCard'
      ? (await tx.jobCard.findFirst({ where: { jobNumber: { startsWith: prefix } }, orderBy: { jobNumber: 'desc' }, select: { jobNumber: true } }))?.jobNumber ?? null
      : (await tx.vehicleService.findFirst({ where: { serviceNumber: { startsWith: prefix } }, orderBy: { serviceNumber: 'desc' }, select: { serviceNumber: true } }))?.serviceNumber ?? null;
    const next = restoredReference(original, taken, prefix, latest);
    root[field] = next.reference;
    reference = next.reference;
    if (next.changed) notes.push(`Its old number ${original} had been given to another ${what}, so it is back as ${next.reference}.`);
  } else if (entity === 'CustomerVehicle') {
    await needCustomer(root.customerId, 'vehicle');
    await plateFree(root);
  } else if (entity === 'Customer') {
    if (typeof root.email === 'string' && (await tx.customer.findUnique({ where: { email: root.email }, select: { id: true } }))) {
      fail(`Another customer now uses the email address ${root.email}. Change that customer's email first, then restore this one.`);
    }
    for (const r of rows) if (r.model === 'customerVehicle') await plateFree(r.data);
    notes.push('Send them a new set-password link from their customer page if they use the customer portal.');
  } else {
    await needBranch(root.branchId);
    if (typeof root.partNumber === 'string' && root.partNumber) {
      const clash = await tx.part.findFirst({ where: { branchId: String(root.branchId), partNumber: root.partNumber }, select: { id: true } });
      if (clash) fail(`Another part in this branch now has the part number ${root.partNumber}. Change it first, then restore this one.`);
    }
  }
  notes.push(...(await clearDanglingLinks(tx, rows)));
  return { reference, notes };
}

export type RestoreResult = { entity: BinEntity; entityId: string; reference: string; originalReference: string; changed: boolean; notes: string[]; organisationId: string };

/** Puts a record back exactly as it was (same id), in one transaction. */
export async function restoreFromBin(itemId: string, actorId: string, now: Date = new Date()): Promise<RestoreResult> {
  const attempt = () => prisma.$transaction(async (tx) => {
    const item = await tx.recycleBinItem.findUnique({ where: { id: itemId } });
    if (!item) throw new RecycleBinError('This item is not in the Recycle bin.');
    if (item.restoredAt) throw new RecycleBinError('This item has already been restored.');
    if (item.purgedAt) throw new RecycleBinError('This item was permanently removed, so it can\'t be restored.');
    if (item.purgeAfter.getTime() <= now.getTime()) throw new RecycleBinError('The time to restore this item has run out. It is waiting to be removed for good.');
    // Claim it first: two people pressing Restore at once restore it once.
    const claim = await tx.recycleBinItem.updateMany({ where: { id: itemId, restoredAt: null, purgedAt: null }, data: { restoredAt: now, restoredById: actorId } });
    if (claim.count !== 1) throw new StaleStateError('This item was just restored or removed by someone else — refresh the page.');
    const snapshot = parseSnapshot(item.snapshot);
    if (!snapshot || snapshot.entity !== item.entityType || String(snapshot.rows[0]!.data.id) !== item.entityId) throw new RecycleBinError('This item can\'t be restored because its saved copy is incomplete. Ask the platform team for help.');
    const { reference, notes } = await prepareRestore(tx, snapshot.entity, item.organisationId, snapshot.rows);
    for (const row of snapshot.rows) await table(tx, row.model).createMany({ data: [row.data] });
    const finalReference = reference ?? item.reference;
    await tx.recycleBinItem.update({ where: { id: itemId }, data: { snapshot: Prisma.DbNull, restoredReference: finalReference !== item.reference ? finalReference : null } });
    return { entity: snapshot.entity, entityId: item.entityId, reference: finalReference, originalReference: item.reference, changed: finalReference !== item.reference, notes, organisationId: item.organisationId };
  }, { timeout: 20_000 });
  try {
    // A new number picked at the same instant as someone else's: try again with the next one.
    for (let i = 1; ; i++) {
      try {
        return await attempt();
      } catch (err) {
        if (i < 3 && (isUniqueClashOn(err, 'jobNumber') || isUniqueClashOn(err, 'serviceNumber'))) { await numberClashPause(i); continue; }
        throw err;
      }
    }
  } catch (err) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') throw new RecycleBinError('Something with the same unique details was saved meanwhile, so this can\'t be restored as it was. Check for a duplicate first.');
    if (e?.code === 'P2003') throw new RecycleBinError('Something this record points to (a person, branch or part) no longer exists, so it can\'t be restored.');
    throw err;
  }
}

// ── Purge ─────────────────────────────────────────────────────────────

function tombstone(it: { entityType: string; reference: string }): { label: string; reference: string } {
  if (it.entityType === 'Customer' || it.entityType === 'CustomerVehicle') {
    const noun = it.entityType === 'Customer' ? 'Customer' : 'Vehicle';
    return { label: `${noun} (details removed)`, reference: `${noun} (details removed)` };
  }
  return { label: it.reference, reference: it.reference };
}

/** Permanently removes the saved copies. Only items still in the bin; the
 * short tombstone (reference, who, when, why) stays for the audit trail. */
export async function purgeItems(where: { ids?: string[]; expiredBy?: Date }, actorId: string | null, now: Date = new Date()): Promise<{ id: string; organisationId: string; entityType: string; entityId: string; reference: string; purgeAfter: Date }[]> {
  const items = await prisma.recycleBinItem.findMany({
    where: { restoredAt: null, purgedAt: null, ...(where.ids ? { id: { in: where.ids } } : {}), ...(where.expiredBy ? { purgeAfter: { lte: where.expiredBy } } : {}) },
    select: { id: true, organisationId: true, entityType: true, entityId: true, reference: true, purgeAfter: true },
    take: 500,
  });
  const done: typeof items = [];
  for (const it of items) {
    const res = await prisma.recycleBinItem.updateMany({
      where: { id: it.id, restoredAt: null, purgedAt: null },
      // People's names, emails and plates do not outlive the retention period.
      data: { snapshot: Prisma.DbNull, ...tombstone(it), purgedAt: now, purgedById: actorId },
    });
    if (res.count === 1) done.push(it);
  }
  return done;
}

/** The daily clean-up: removes items past their restore period, one audit
 * entry each (written as the system, in the item's own organisation). */
export async function purgeExpiredOnSchedule(now: Date = new Date()): Promise<number> {
  const done = await purgeItems({ expiredBy: now }, null, now);
  for (const it of done) {
    await writeAuditLog({ userId: null, action: 'recycle_bin.purged', entityType: 'RecycleBinItem', entityId: it.id, organisationId: it.organisationId, metadata: { entityType: it.entityType, entityId: it.entityId, by: 'scheduled clean-up' } });
  }
  return done.length;
}
