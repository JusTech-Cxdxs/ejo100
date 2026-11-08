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
import { hashPassword } from 'better-auth/crypto';
import { randomBytes } from 'node:crypto';
import { lockExisting } from '@/lib/integrity';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { writeAuditLog } from '@/lib/workshop-core';
import { StaleStateError, isUniqueClashOn, numberClashPause } from '@/lib/integrity-core';
import { lagosYear } from '@/lib/utils/format-date';
import {
  BIN_KIND, binLabel, customerEligibility, jobCardEligibility, orderedSnapshot, parseSnapshot, partEligibility, plainRow, supplierEligibility,
  purgeAfterFrom, restoredReference, retentionDays, vehicleEligibility, vehicleServiceEligibility, warrantyRecordEligibility, staffAccountEligibility, plantRecordEligibility, isPlantBinEntity,
  type BinEntity, type PlantBinEntity, type Eligibility, type SnapshotRow,
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
  if (entity === 'Supplier') {
    const s = await db.supplier.findUnique({ where: { id }, select: { name: true, externalId: true, organisationId: true, createdById: true, createdAt: true } });
    return s ? { entity, id, organisationId: s.organisationId, branchId: null, createdById: s.createdById, createdAt: s.createdAt, reference: s.name, label: binLabel([s.name, s.externalId ? `Supplier ${s.externalId}` : null]) } : null;
  }
  if (entity === 'Warranty') {
    const w = await db.warranty.findUnique({ where: { id }, select: { warrantyNumber: true, subjectDescription: true, issuedById: true, createdAt: true, externalId: true, customer: { select: { fullName: true, organisationId: true } } } });
    return w ? { entity, id, organisationId: w.customer.organisationId, branchId: null, createdById: w.issuedById, createdAt: w.createdAt, reference: w.warrantyNumber, label: binLabel([w.warrantyNumber, w.subjectDescription, w.customer.fullName]) } : null;
  }
  if (entity === 'WarrantyClaim') {
    const c = await db.warrantyClaim.findUnique({ where: { id }, select: { claimNumber: true, causalPart: true, createdById: true, createdAt: true, warranty: { select: { warrantyNumber: true } }, customer: { select: { fullName: true, organisationId: true } } } });
    return c ? { entity, id, organisationId: c.customer.organisationId, branchId: null, createdById: c.createdById, createdAt: c.createdAt, reference: c.claimNumber, label: binLabel([c.claimNumber, c.warranty.warrantyNumber, c.causalPart, c.customer.fullName]) } : null;
  }
  if (entity === 'User') {
    const u = await db.user.findUnique({ where: { id }, select: { fullName: true, email: true, employeeId: true, organisationId: true, branchId: true, createdAt: true, importJobId: true } });
    return u && u.organisationId ? { entity, id, organisationId: u.organisationId, branchId: u.branchId, createdById: null, createdAt: u.createdAt, reference: u.employeeId || u.email, label: binLabel([u.fullName, u.email, u.employeeId]) } : null;
  }
  if (entity === 'PlantShipment') {
    const s = await db.plantShipment.findUnique({ where: { id }, select: { number: true, supplier: true, billOfLading: true, organisationId: true, branchId: true, createdById: true, createdAt: true } });
    return s ? { entity, id, organisationId: s.organisationId, branchId: s.branchId, createdById: s.createdById, createdAt: s.createdAt, reference: s.number, label: binLabel([s.number, s.supplier, s.billOfLading]) } : null;
  }
  if (entity === 'PlantVehicle') {
    const v = await db.plantVehicle.findUnique({ where: { id }, select: { vin: true, make: true, modelCode: true, organisationId: true, branchId: true, createdById: true, createdAt: true } });
    return v ? { entity, id, organisationId: v.organisationId, branchId: v.branchId, createdById: v.createdById, createdAt: v.createdAt, reference: v.vin, label: binLabel([v.vin, `${v.make} ${v.modelCode}`]) } : null;
  }
  if (entity === 'PlantKit') {
    const k = await db.plantKit.findUnique({ where: { id }, select: { number: true, vin: true, modelCode: true, organisationId: true, branchId: true, createdById: true, createdAt: true } });
    return k ? { entity, id, organisationId: k.organisationId, branchId: k.branchId, createdById: k.createdById, createdAt: k.createdAt, reference: k.number, label: binLabel([k.number, k.vin, k.modelCode]) } : null;
  }
  if (entity === 'PlantKitIssue') {
    const i = await db.plantKitIssue.findUnique({ where: { id }, select: { description: true, kind: true, organisationId: true, raisedById: true, raisedAt: true, kit: { select: { number: true, branchId: true } } } });
    return i ? { entity, id, organisationId: i.organisationId, branchId: i.kit.branchId, createdById: i.raisedById, createdAt: i.raisedAt, reference: `${i.kit.number} ${i.kind.toLowerCase().replace('_', ' ')}`, label: binLabel([i.kit.number, i.description]) } : null;
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
      approvalStatus: true,
      approvedById: true,
      assignedTechnicianId: true,
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
    approvalDecided: j.approvalStatus !== 'PENDING' || Boolean(j.approvedById),
    technicianAssigned: Boolean(j.assignedTechnicianId),
  });
}

async function serviceFacts(db: Db, id: string) {
  const s = await db.vehicleService.findUnique({
    where: { id },
    select: {
      status: true,
      approvalStatus: true,
      approvedById: true,
      assignedTechnicianId: true,
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
    approvalDecided: s.approvalStatus !== 'PENDING' || Boolean(s.approvedById),
    technicianAssigned: Boolean(s.assignedTechnicianId),
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
    select: { lastLoginAt: true, _count: { select: { sessions: true, jobCards: true, vehicleServices: true, warranties: true, warrantyClaims: true } }, vehicles: { select: { _count: { select: VEHICLE_COUNTS } } } },
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
    // lastLoginAt is only stamped on the sign-in page; any session also counts.
    signedIn: Boolean(c.lastLoginAt) || c._count.sessions > 0,
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
    case 'Supplier': {
      const s = await db.supplier.findUnique({ where: { id }, select: { _count: { select: { receipts: true } } } });
      return s ? supplierEligibility({ receipts: s._count.receipts }) : null;
    }
    case 'Warranty': return (await db.warranty.count({ where: { id } })) ? warrantyRecordEligibility('Warranty') : null;
    case 'WarrantyClaim': return (await db.warrantyClaim.count({ where: { id } })) ? warrantyRecordEligibility('WarrantyClaim') : null;
    case 'User': return (await db.user.count({ where: { id } })) ? staffAccountEligibility() : null;
    case 'PlantShipment': return (await db.plantShipment.count({ where: { id } })) ? plantRecordEligibility(entity) : null;
    case 'PlantVehicle': return (await db.plantVehicle.count({ where: { id } })) ? plantRecordEligibility(entity) : null;
    case 'PlantKit': return (await db.plantKit.count({ where: { id } })) ? plantRecordEligibility(entity) : null;
    case 'PlantKitIssue': return (await db.plantKitIssue.count({ where: { id } })) ? plantRecordEligibility(entity) : null;
  }
}

// ── Snapshot: every row the delete removes, parent first ──────────────

async function snapshotRows(tx: Tx, entity: BinEntity, id: string): Promise<SnapshotRow[]> {
  if (entity === 'JobCard') {
    const root = await tx.jobCard.findUniqueOrThrow({ where: { id } });
    const estimate = await tx.estimate.findUnique({ where: { jobCardId: id } });
    const [complaints, lines, cancels, closes, payments] = await Promise.all([
      tx.jobCardComplaint.findMany({ where: { jobCardId: id }, orderBy: [{ sequenceNumber: 'asc' }, { createdAt: 'asc' }] }),
      estimate ? tx.estimateLineItem.findMany({ where: { estimateId: estimate.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : Promise.resolve([]),
      tx.cancellationRequest.findMany({ where: { jobCardId: id }, orderBy: { createdAt: 'asc' } }),
      tx.closeRequest.findMany({ where: { jobCardId: id }, orderBy: { createdAt: 'asc' } }),
      // Payments: only an undone import of open job cards bins a job card with any (opening payments brought in with it).
      tx.payment.findMany({ where: { jobCardId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return [...plain([root], 'jobCard'), ...plain(complaints, 'jobCardComplaint'), ...plain(estimate ? [estimate] : [], 'estimate'), ...plain(lines, 'estimateLineItem'), ...plain(cancels, 'cancellationRequest'), ...plain(closes, 'closeRequest'), ...plain(payments, 'payment')];
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
  if (entity === 'Supplier') return plain([await tx.supplier.findUniqueOrThrow({ where: { id } })], 'supplier');
  if (entity === 'Warranty') return plain([await tx.warranty.findUniqueOrThrow({ where: { id } })], 'warranty');
  if (entity === 'WarrantyClaim') return plain([await tx.warrantyClaim.findUniqueOrThrow({ where: { id } })], 'warrantyClaim');
  // The person and their roles only: never a password, a session or a set-password link.
  if (entity === 'User') return [...plain([await tx.user.findUniqueOrThrow({ where: { id } })], 'user'), ...plain(await tx.userRole.findMany({ where: { userId: id } }), 'userRole')];
  if (entity === 'PlantShipment') return plain([await tx.plantShipment.findUniqueOrThrow({ where: { id } })], 'plantShipment');
  if (entity === 'PlantVehicle') return [...plain([await tx.plantVehicle.findUniqueOrThrow({ where: { id } })], 'plantVehicle'), ...plain(await tx.plantStationVisit.findMany({ where: { plantVehicleId: id }, orderBy: { sort: 'asc' } }), 'plantStationVisit')];
  if (entity === 'PlantKit') return [...plain([await tx.plantKit.findUniqueOrThrow({ where: { id } })], 'plantKit'), ...plain(await tx.plantKitCheck.findMany({ where: { kitId: id }, orderBy: { sort: 'asc' } }), 'plantKitCheck')];
  if (entity === 'PlantKitIssue') return plain([await tx.plantKitIssue.findUniqueOrThrow({ where: { id } })], 'plantKitIssue');
  const root = await tx.part.findUniqueOrThrow({ where: { id } });
  const [units, stock, fitments] = await Promise.all([
    tx.partUnitOfMeasure.findMany({ where: { partId: id }, orderBy: { unitName: 'asc' } }),
    tx.partStock.findUnique({ where: { partId: id } }),
    tx.partFitment.findMany({ where: { partId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  return [...plain([root], 'part'), ...plain(units, 'partUnitOfMeasure'), ...plain(stock ? [stock] : [], 'partStock'), ...plain(fitments, 'partFitment')];
}

const LOCK: Record<BinEntity, 'jobCard' | 'vehicleService' | 'customer' | 'customerVehicle' | 'part' | 'supplier' | 'warranty' | 'warrantyClaim' | 'user' | 'plantShipment' | 'plantVehicle' | 'plantKit' | 'plantKitIssue'> = {
  JobCard: 'jobCard', VehicleService: 'vehicleService', Customer: 'customer', CustomerVehicle: 'customerVehicle', Part: 'part', Supplier: 'supplier', Warranty: 'warranty', WarrantyClaim: 'warrantyClaim', User: 'user',
  PlantShipment: 'plantShipment', PlantVehicle: 'plantVehicle', PlantKit: 'plantKit', PlantKitIssue: 'plantKitIssue',
};

async function deleteRoot(tx: Tx, entity: BinEntity, id: string): Promise<void> {
  if (entity === 'JobCard') await tx.jobCard.delete({ where: { id } });
  else if (entity === 'VehicleService') await tx.vehicleService.delete({ where: { id } });
  else if (entity === 'CustomerVehicle') await tx.customerVehicle.delete({ where: { id } });
  else if (entity === 'Part') await tx.part.delete({ where: { id } });
  else if (entity === 'Supplier') await tx.supplier.delete({ where: { id } });
  else if (entity === 'Warranty') await tx.warranty.delete({ where: { id } });
  else if (entity === 'WarrantyClaim') await tx.warrantyClaim.delete({ where: { id } });
  else if (entity === 'PlantShipment') await tx.plantShipment.delete({ where: { id } });
  else if (entity === 'PlantVehicle') await tx.plantVehicle.delete({ where: { id } });
  else if (entity === 'PlantKit') await tx.plantKit.delete({ where: { id } });
  else if (entity === 'PlantKitIssue') await tx.plantKitIssue.delete({ where: { id } });
  else if (entity === 'User') {
    // Its unusable password and any set-password link go with it (never kept in the snapshot).
    await tx.verification.deleteMany({ where: { value: id } });
    await tx.user.delete({ where: { id } });
  }
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

// ── Many at once (an undone import) ───────────────────────────────────

/**
 * Moves imported open job cards (P5) to the bin inside the caller's
 * transaction — the undo of that import. These job cards carry an approved
 * estimate, a technician and opening payments, which the bin's own rules
 * would refuse; the caller has checked instead that nobody has worked on
 * them since the import (open-jobs-server.ts, untouchedSinceImport), and
 * their snapshot carries the estimate and payments so each restores whole.
 */
export async function moveImportedJobCardsToBinInTx(tx: Tx, ids: string[], importJobId: string, reason: string, actorId: string, now: Date = new Date()): Promise<string[]> {
  if (!ids.length) return [];
  await lockExisting(tx, 'jobCard', ids).catch(() => undefined);
  const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
  const moved: string[] = [];
  for (const id of ids) {
    const record = await binRecord('JobCard', id, tx);
    const j = await tx.jobCard.findUnique({ where: { id }, select: { importJobId: true } });
    if (!record || !j || j.importJobId !== importJobId) continue;
    const snapshot = orderedSnapshot('JobCard', await snapshotRows(tx, 'JobCard', id));
    await tx.recycleBinItem.create({
      data: { organisationId: record.organisationId, branchId: record.branchId, entityType: 'JobCard', entityId: id, reference: record.reference, label: record.label, reason, snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter },
    });
    await deleteRoot(tx, 'JobCard', id);
    moved.push(id);
  }
  return moved;
}

/**
 * Moves imported vehicle services and bookings (P6b) to the bin inside the
 * caller's transaction — the undo of that import. Like the open job cards:
 * the caller has checked that nobody has worked on them since the import
 * (open-services-server.ts, serviceUntouchedSinceImport); each restores whole.
 */
export async function moveImportedServicesToBinInTx(tx: Tx, ids: string[], importJobId: string, reason: string, actorId: string, now: Date = new Date()): Promise<string[]> {
  if (!ids.length) return [];
  await lockExisting(tx, 'vehicleService', ids).catch(() => undefined);
  const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
  const moved: string[] = [];
  for (const id of ids) {
    const record = await binRecord('VehicleService', id, tx);
    const s = await tx.vehicleService.findUnique({ where: { id }, select: { importJobId: true } });
    if (!record || !s || s.importJobId !== importJobId) continue;
    const snapshot = orderedSnapshot('VehicleService', await snapshotRows(tx, 'VehicleService', id));
    await tx.recycleBinItem.create({
      data: { organisationId: record.organisationId, branchId: record.branchId, entityType: 'VehicleService', entityId: id, reference: record.reference, label: record.label, reason, snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter },
    });
    await deleteRoot(tx, 'VehicleService', id);
    moved.push(id);
  }
  return moved;
}

/**
 * Moves imported warranties or warranty claims (P6) to the bin inside the
 * caller's transaction — the undo of that import, and the only way either
 * ever reaches the bin. The caller has checked that nobody has used them
 * since the import (warranties-server.ts); each becomes its own bin item,
 * restorable on its own, with its number kept.
 */
export async function moveImportedWarrantyRecordsToBinInTx(tx: Tx, entity: 'Warranty' | 'WarrantyClaim', ids: string[], importJobId: string, reason: string, actorId: string, now: Date = new Date()): Promise<string[]> {
  if (!ids.length) return [];
  await lockExisting(tx, LOCK[entity], ids).catch(() => undefined);
  const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
  const moved: string[] = [];
  for (const id of ids) {
    const record = await binRecord(entity, id, tx);
    // Only what this import brought in; a warranty with a claim on it stays (its claim would lose its warranty).
    const mine = entity === 'Warranty'
      ? (await tx.warranty.count({ where: { id, importJobId, claims: { none: {} } } })) === 1
      : (await tx.warrantyClaim.count({ where: { id, importJobId } })) === 1;
    if (!record || !mine) continue;
    const snapshot = orderedSnapshot(entity, await snapshotRows(tx, entity, id));
    await tx.recycleBinItem.create({
      data: { organisationId: record.organisationId, branchId: null, entityType: entity, entityId: id, reference: record.reference, label: record.label, reason, snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter },
    });
    await deleteRoot(tx, entity, id);
    moved.push(id);
  }
  return moved;
}

/**
 * Moves the accounts a staff import made (P7) to the bin inside the caller's
 * transaction — the undo of that import, and the only way an account ever
 * reaches the bin. The caller has checked that nobody invited, used or
 * worked with them (staff-server.ts, staffUntouchedSinceImport).
 */
export async function moveImportedStaffToBinInTx(tx: Tx, ids: string[], importJobId: string, reason: string, actorId: string, now: Date = new Date()): Promise<string[]> {
  if (!ids.length) return [];
  await lockExisting(tx, 'user', ids).catch(() => undefined);
  const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
  const moved: string[] = [];
  for (const id of ids) {
    const record = await binRecord('User', id, tx);
    const mine = (await tx.user.count({ where: { id, importJobId, invitedAt: null, lastLoginAt: null, isActive: false } })) === 1;
    if (!record || !mine) continue;
    const snapshot = orderedSnapshot('User', await snapshotRows(tx, 'User', id));
    await tx.recycleBinItem.create({
      data: { organisationId: record.organisationId, branchId: record.branchId, entityType: 'User', entityId: id, reference: record.reference, label: record.label, reason, snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter },
    });
    await deleteRoot(tx, 'User', id);
    moved.push(id);
  }
  return moved;
}

const PLANT_KIND = { plantShipments: 'PlantShipment', plantVehicles: 'PlantVehicle', plantKits: 'PlantKit', plantKitIssues: 'PlantKitIssue' } as const;

/**
 * Moves the plant records an import brought in (P8) to the bin inside the
 * caller's transaction — the undo of that import, and the only way any of
 * them reaches the bin. The caller has checked that nobody has used them
 * since and that nothing hangs on them (plant-server.ts,
 * plantUntouchedSinceImport); checked again here under the lock.
 */
export async function moveImportedPlantToBinInTx(tx: Tx, kind: keyof typeof PLANT_KIND, ids: string[], importJobId: string, reason: string, actorId: string, now: Date = new Date()): Promise<string[]> {
  if (!ids.length) return [];
  const entity: PlantBinEntity = PLANT_KIND[kind];
  await lockExisting(tx, LOCK[entity], ids).catch(() => undefined);
  const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
  const moved: string[] = [];
  for (const id of ids) {
    const record = await binRecord(entity, id, tx);
    const mine = entity === 'PlantShipment' ? (await tx.plantShipment.count({ where: { id, importJobId, kits: { none: {} } } })) === 1
      : entity === 'PlantVehicle' ? (await tx.plantVehicle.count({ where: { id, importJobId, kits: { none: {} }, pdis: { none: {} }, defects: { none: {} }, qaAudits: { none: {} } } })) === 1
      : entity === 'PlantKit' ? (await tx.plantKit.count({ where: { id, importJobId, issues: { none: {} } } })) === 1
      : (await tx.plantKitIssue.count({ where: { id, importJobId } })) === 1;
    if (!record || !mine) continue;
    const snapshot = orderedSnapshot(entity, await snapshotRows(tx, entity, id));
    await tx.recycleBinItem.create({
      data: { organisationId: record.organisationId, branchId: record.branchId, entityType: entity, entityId: id, reference: record.reference, label: record.label, reason, snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter },
    });
    await deleteRoot(tx, entity, id);
    moved.push(id);
  }
  return moved;
}

const group = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = String(r[key]); const list = m.get(k); if (list) list.push(r); else m.set(k, [r]); }
  return m;
};

/**
 * Moves many customers or vehicles to the bin inside the caller's
 * transaction — the batch form of moveToBin, used when an import is undone.
 * Each record becomes its own bin item with the same snapshot a single
 * delete would take, so each can be restored on its own. The records are
 * locked and only those with nothing of consequence on them are moved (the
 * same rules as a single delete); the ids moved are returned, the others are
 * left untouched for the caller to report.
 */
export async function moveManyToBinInTx(tx: Tx, entity: 'Customer' | 'CustomerVehicle' | 'Part' | 'Supplier', ids: string[], reason: string, actorId: string, now: Date = new Date()): Promise<string[]> {
  if (!ids.length) return [];
  await lockExisting(tx, LOCK[entity], ids).catch(() => undefined);
  const purgeAfter = purgeAfterFrom(now, RETENTION_DAYS());
  if (entity === 'Supplier') {
    const list = await tx.supplier.findMany({ where: { id: { in: ids }, receipts: { none: {} } } });
    if (!list.length) return [];
    await tx.recycleBinItem.createMany({
      data: list.map((x) => ({
        organisationId: x.organisationId, branchId: null, entityType: 'Supplier', entityId: x.id, reference: x.name, label: binLabel([x.name, x.externalId ? `Supplier ${x.externalId}` : null]), reason,
        snapshot: orderedSnapshot('Supplier', plain([x], 'supplier')) as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter,
      })),
    });
    await tx.supplier.deleteMany({ where: { id: { in: list.map((x) => x.id) } } });
    return list.map((x) => x.id);
  }
  if (entity === 'Part') {
    // The same rules as deleting one part: never received, never issued, matched, warranted or priced; no stock.
    const parts = await tx.part.findMany({
      where: { id: { in: ids }, goodsReceiptLines: { none: {} }, batches: { none: {} }, serials: { none: {} }, quantityConsumptions: { none: {} }, requestSlipLines: { none: {} }, matchedOnEstimateLines: { none: {} }, matchedOnServiceEstimateLines: { none: {} }, warranties: { none: {} }, pricingAlerts: { none: {} }, OR: [{ stock: null }, { stock: { quantityOnHand: 0, quantityReserved: 0 } }] },
      include: { branch: { select: { name: true, businessUnit: { select: { organisationId: true } } } } },
    });
    if (!parts.length) return [];
    const pids = parts.map((x) => x.id);
    const [units, stocks, fitments] = await Promise.all([
      tx.partUnitOfMeasure.findMany({ where: { partId: { in: pids } }, orderBy: { unitName: 'asc' } }),
      tx.partStock.findMany({ where: { partId: { in: pids } } }),
      tx.partFitment.findMany({ where: { partId: { in: pids } }, orderBy: { createdAt: 'asc' } }),
    ]);
    const u = group(units, 'partId'); const st = group(stocks, 'partId'); const f = group(fitments, 'partId');
    await tx.recycleBinItem.createMany({
      data: parts.map(({ branch, ...x }) => ({
        organisationId: branch.businessUnit.organisationId, branchId: x.branchId, entityType: 'Part', entityId: x.id, reference: x.partNumber || x.name, label: binLabel([x.partNumber, x.name, branch.name]), reason,
        snapshot: orderedSnapshot('Part', [...plain([x], 'part'), ...plain(u.get(x.id) ?? [], 'partUnitOfMeasure'), ...plain(st.get(x.id) ?? [], 'partStock'), ...plain(f.get(x.id) ?? [], 'partFitment')]) as unknown as Prisma.InputJsonValue,
        deletedById: actorId, deletedAt: now, purgeAfter,
      })),
    });
    await tx.part.deleteMany({ where: { id: { in: pids } } });
    return pids;
  }
  if (entity === 'CustomerVehicle') {
    const vehicles = await tx.customerVehicle.findMany({
      where: { id: { in: ids }, jobCards: { none: {} }, vehicleServices: { none: {} }, warranties: { none: {} }, warrantyClaims: { none: {} }, gateExits: { none: {} }, roadTestPermits: { none: {} } },
      include: { customer: { select: { fullName: true, organisationId: true } } },
    });
    if (!vehicles.length) return [];
    const logs = group(await tx.serviceReminderLog.findMany({ where: { vehicleId: { in: vehicles.map((v) => v.id) } }, orderBy: { sentAt: 'asc' } }), 'vehicleId');
    await tx.recycleBinItem.createMany({
      data: vehicles.map(({ customer, ...v }) => {
        const snapshot = orderedSnapshot('CustomerVehicle', [...plain([v], 'customerVehicle'), ...plain(logs.get(v.id) ?? [], 'serviceReminderLog')]);
        return {
          organisationId: customer.organisationId, branchId: null, entityType: 'CustomerVehicle', entityId: v.id,
          reference: v.plateNumber || v.chassisNumber || [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle',
          label: binLabel([vehicleText(v), v.chassisNumber, customer.fullName]), reason,
          snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter,
        };
      }),
    });
    await tx.customerVehicle.deleteMany({ where: { id: { in: vehicles.map((v) => v.id) } } });
    return vehicles.map((v) => v.id);
  }
  const customers = await tx.customer.findMany({
    where: {
      id: { in: ids }, lastLoginAt: null, sessions: { none: {} }, jobCards: { none: {} }, vehicleServices: { none: {} }, warranties: { none: {} }, warrantyClaims: { none: {} },
      vehicles: { none: { OR: [{ jobCards: { some: {} } }, { vehicleServices: { some: {} } }, { warranties: { some: {} } }, { warrantyClaims: { some: {} } }, { gateExits: { some: {} } }, { roadTestPermits: { some: {} } }] } },
    },
  });
  if (!customers.length) return [];
  const cids = customers.map((c) => c.id);
  const [companies, addresses, contacts, notes, reads, vehicles] = await Promise.all([
    tx.customerCompany.findMany({ where: { customerId: { in: cids } } }),
    tx.customerAddress.findMany({ where: { customerId: { in: cids } }, orderBy: { createdAt: 'asc' } }),
    tx.customerContact.findMany({ where: { customerId: { in: cids } }, orderBy: { createdAt: 'asc' } }),
    tx.customerNote.findMany({ where: { customerId: { in: cids } }, orderBy: { createdAt: 'asc' } }),
    tx.customerNotificationRead.findMany({ where: { customerId: { in: cids } } }),
    tx.customerVehicle.findMany({ where: { customerId: { in: cids } }, orderBy: { createdAt: 'asc' } }),
  ]);
  const logs = vehicles.length ? await tx.serviceReminderLog.findMany({ where: { vehicleId: { in: vehicles.map((v) => v.id) } }, orderBy: { sentAt: 'asc' } }) : [];
  const ownerOf = new Map(vehicles.map((v) => [v.id, v.customerId]));
  const by = {
    company: group(companies, 'customerId'), address: group(addresses, 'customerId'), contact: group(contacts, 'customerId'),
    note: group(notes, 'customerId'), read: group(reads, 'customerId'), vehicle: group(vehicles, 'customerId'),
    log: group(logs.map((l) => ({ ...l, owner: ownerOf.get(l.vehicleId) ?? '' })), 'owner'),
  };
  await tx.recycleBinItem.createMany({
    data: customers.map((c) => {
      const snapshot = orderedSnapshot('Customer', [
        ...plain([c], 'customer'), ...plain(by.company.get(c.id) ?? [], 'customerCompany'), ...plain(by.address.get(c.id) ?? [], 'customerAddress'),
        ...plain(by.contact.get(c.id) ?? [], 'customerContact'), ...plain(by.note.get(c.id) ?? [], 'customerNote'), ...plain(by.read.get(c.id) ?? [], 'customerNotificationRead'),
        ...plain(by.vehicle.get(c.id) ?? [], 'customerVehicle'), ...plain((by.log.get(c.id) ?? []).map(({ owner: _o, ...l }) => l), 'serviceReminderLog'),
      ]);
      return {
        organisationId: c.organisationId, branchId: null, entityType: 'Customer', entityId: c.id, reference: c.fullName, label: binLabel([c.fullName, c.email]), reason,
        snapshot: snapshot as unknown as Prisma.InputJsonValue, deletedById: actorId, deletedAt: now, purgeAfter,
      };
    }),
  });
  await tx.customerVerification.deleteMany({ where: { value: { in: cids } } });
  await tx.customer.deleteMany({ where: { id: { in: cids } } });
  return cids;
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
const OPTIONAL_LINKS: { model: string; field: string; target: 'department' | 'part' | 'partType' | 'warranty' | 'warrantyPolicy' | 'plantVehicle' | 'plantRoute'; note: string }[] = [
  { model: 'plantKit', field: 'plantVehicleId', target: 'plantVehicle', note: 'The vehicle it was released to is no longer in the plant, so the kit comes back without it.' },
  { model: 'plantVehicle', field: 'routeId', target: 'plantRoute', note: 'Its route version no longer exists; its stations are kept as they were.' },
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
  const needVehicle = async (vehicleId: unknown, what: string, customerId?: unknown) => {
    const v = typeof vehicleId === 'string' ? await tx.customerVehicle.findUnique({ where: { id: vehicleId }, select: { id: true, customerId: true } }) : null;
    // The vehicle may have changed hands since: never re-attach a job to someone else's vehicle.
    if (v && customerId !== undefined && v.customerId !== customerId) fail(`The vehicle on this ${what} now belongs to another customer, so it can't be restored.`);
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
    await needVehicle(root.vehicleId, what, root.customerId);
    const field = entity === 'JobCard' ? 'jobNumber' : 'serviceNumber';
    const original = String(root[field]);
    const prefix = `${entity === 'JobCard' ? 'JC' : 'SV'}-${lagosYear()}-`;
    const taken = entity === 'JobCard'
      ? Boolean(await tx.jobCard.findUnique({ where: { jobNumber: original }, select: { id: true } }))
      : Boolean(await tx.vehicleService.findUnique({ where: { serviceNumber: original }, select: { id: true } }));
    const latest = !taken ? null : entity === 'JobCard'
      ? (await tx.jobCard.findFirst({ where: { jobNumber: { startsWith: prefix } }, orderBy: { jobNumber: 'desc' }, select: { jobNumber: true } }))?.jobNumber ?? null
      : (await tx.vehicleService.findFirst({ where: { serviceNumber: { startsWith: prefix } }, orderBy: { serviceNumber: 'desc' }, select: { serviceNumber: true } }))?.serviceNumber ?? null;
    // Numbers held by other binned records stay reserved too.
    const binnedTop = !taken ? null : (await tx.recycleBinItem.findFirst({ where: { entityType: entity, reference: { startsWith: prefix }, NOT: { reference: original } }, orderBy: { reference: 'desc' }, select: { reference: true } }))?.reference ?? null;
    const top = highestSequence(prefix, [latest, binnedTop]);
    const next = restoredReference(original, taken, prefix, top > 0 ? `${prefix}${String(top).padStart(6, '0')}` : null);
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
  } else if (entity === 'Warranty' || entity === 'WarrantyClaim') {
    const what = entity === 'Warranty' ? 'warranty' : 'warranty claim';
    await needCustomer(root.customerId, what);
    if (typeof root.vehicleId === 'string' && root.vehicleId) await needVehicle(root.vehicleId, what, root.customerId);
    if (entity === 'WarrantyClaim') {
      const w = typeof root.warrantyId === 'string' ? await tx.warranty.findUnique({ where: { id: root.warrantyId }, select: { id: true } }) : null;
      if (!w) {
        const binned = typeof root.warrantyId === 'string' ? await tx.recycleBinItem.findFirst({ where: { entityType: 'Warranty', entityId: root.warrantyId, restoredAt: null, purgedAt: null }, select: { id: true } }) : null;
        fail(binned ? 'The warranty this claim is on is in the Recycle bin too. Restore the warranty first, then this claim.' : 'The warranty this claim was on no longer exists, so it can\'t be restored.');
      }
    }
    const field = entity === 'Warranty' ? 'warrantyNumber' : 'claimNumber';
    const original = String(root[field]);
    const prefix = `${entity === 'Warranty' ? 'WR' : 'WC'}-${lagosYear()}-`;
    const taken = entity === 'Warranty'
      ? Boolean(await tx.warranty.findUnique({ where: { warrantyNumber: original }, select: { id: true } }))
      : Boolean(await tx.warrantyClaim.findUnique({ where: { claimNumber: original }, select: { id: true } }));
    const latest = !taken ? null : entity === 'Warranty'
      ? (await tx.warranty.findFirst({ where: { warrantyNumber: { startsWith: prefix } }, orderBy: { warrantyNumber: 'desc' }, select: { warrantyNumber: true } }))?.warrantyNumber ?? null
      : (await tx.warrantyClaim.findFirst({ where: { claimNumber: { startsWith: prefix } }, orderBy: { claimNumber: 'desc' }, select: { claimNumber: true } }))?.claimNumber ?? null;
    const binnedTop = !taken ? null : (await tx.recycleBinItem.findFirst({ where: { entityType: entity, reference: { startsWith: prefix }, NOT: { reference: original } }, orderBy: { reference: 'desc' }, select: { reference: true } }))?.reference ?? null;
    const top = highestSequence(prefix, [latest, binnedTop]);
    const next = restoredReference(original, taken, prefix, top > 0 ? `${prefix}${String(top).padStart(6, '0')}` : null);
    root[field] = next.reference;
    reference = next.reference;
    if (next.changed) notes.push(`Its old number ${original} had been given to another ${what}, so it is back as ${next.reference}.`);
  } else if (entity === 'User') {
    if (typeof root.email === 'string' && (await tx.user.findUnique({ where: { email: root.email }, select: { id: true } }))) fail(`Someone now uses the email address ${root.email}. Change theirs first, then restore this account.`);
    if (typeof root.employeeId === 'string' && root.employeeId && (await tx.user.findUnique({ where: { employeeId: root.employeeId }, select: { id: true } }))) fail(`Employee ID ${root.employeeId} has been given to someone else meanwhile, so this account can't be restored as it was.`);
    if (typeof root.branchId === 'string') await needBranch(root.branchId);
    // Roles removed since are left out; the account comes back switched off, as the import left it.
    const roleIds = rows.filter((r) => r.model === 'userRole').map((r) => String(r.data.roleId));
    const alive = new Set((await tx.role.findMany({ where: { id: { in: roleIds } }, select: { id: true } })).map((r) => r.id));
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.model === 'userRole' && !alive.has(String(rows[i]!.data.roleId))) { rows.splice(i, 1); notes.push('A role it had no longer exists, so it is left out.'); }
    root.isActive = false;
    notes.push('The account is back switched off: send the invitation from the import, or switch it on and send the welcome email from the Users page.');
  } else if (isPlantBinEntity(entity)) {
    await needBranch(root.branchId);
    const binnedToo = async (type: string, targetId: unknown) => (typeof targetId === 'string' ? Boolean(await tx.recycleBinItem.findFirst({ where: { entityType: type, entityId: targetId, restoredAt: null, purgedAt: null }, select: { id: true } })) : false);
    if (entity === 'PlantShipment' || entity === 'PlantKit') {
      const number = String(root.number);
      const taken = entity === 'PlantShipment' ? await tx.plantShipment.findUnique({ where: { number }, select: { id: true } }) : await tx.plantKit.findUnique({ where: { number }, select: { id: true } });
      if (taken) fail(`The number ${number} has been given to another ${entity === 'PlantShipment' ? 'shipment' : 'kit'} meanwhile, so this can't be restored as it was.`);
    }
    if (entity === 'PlantVehicle' && (await tx.plantVehicle.findFirst({ where: { organisationId, vinKey: String(root.vinKey) }, select: { id: true } }))) fail(`A vehicle with the VIN ${String(root.vin)} is in the plant again meanwhile, so this one can't be restored.`);
    if (entity === 'PlantKit') {
      if (!(await tx.plantShipment.findUnique({ where: { id: String(root.shipmentId) }, select: { id: true } }))) fail((await binnedToo('PlantShipment', root.shipmentId)) ? 'The shipment this kit came on is in the Recycle bin too. Restore the shipment first, then this kit.' : 'The shipment this kit came on no longer exists, so it can\'t be restored.');
      if (await tx.plantKit.findFirst({ where: { organisationId, vinKey: String(root.vinKey), status: { not: 'CANCELLED' } }, select: { id: true } })) fail(`Another kit for the VIN ${String(root.vin)} is in EJO meanwhile, so this one can't be restored.`);
    }
    if (entity === 'PlantKitIssue' && !(await tx.plantKit.findUnique({ where: { id: String(root.kitId) }, select: { id: true } }))) fail((await binnedToo('PlantKit', root.kitId)) ? 'The kit this issue is on is in the Recycle bin too. Restore the kit first, then this issue.' : 'The kit this issue was on no longer exists, so it can\'t be restored.');
    reference = null;
  } else if (entity === 'Supplier') {
    if (typeof root.externalId === 'string' && root.externalId) {
      const clash = await tx.supplier.findFirst({ where: { organisationId, externalSource: (root.externalSource as string | null) ?? null, externalId: root.externalId }, select: { id: true } });
      if (clash) fail(`Another supplier now has the supplier number ${root.externalId}. Change it first, then restore this one.`);
    }
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
    // A restored account gets a new unusable password (none is ever kept): it is set from the next invitation.
    if (snapshot.entity === 'User') await tx.account.create({ data: { userId: item.entityId, accountId: item.entityId, providerId: 'credential', password: await hashPassword(randomBytes(32).toString('hex')) } });
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
        if (i < 3 && (isUniqueClashOn(err, 'jobNumber') || isUniqueClashOn(err, 'serviceNumber') || isUniqueClashOn(err, 'warrantyNumber') || isUniqueClashOn(err, 'claimNumber'))) { await numberClashPause(i); continue; }
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
  if (it.entityType === 'Customer' || it.entityType === 'CustomerVehicle' || it.entityType === 'User') {
    const noun = it.entityType === 'Customer' ? 'Customer' : it.entityType === 'User' ? 'Staff account' : 'Vehicle';
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
