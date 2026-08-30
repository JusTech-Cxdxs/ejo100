'use server';

/**
 * Store Server Actions — Phase 1: the part catalog, unit-of-measure
 * conversion, and goods receipt (stock coming in). Deliberately does NOT
 * yet include the Issue Slip workflow (requesting/releasing stock to a
 * Job Card) or External Procurement — those are their own later phases.
 *
 * Same architecture as apps/portal/lib/actions/workshop.ts: Server Actions
 * calling @ejo/database directly, not the Render API, for the same
 * cross-origin-cookie reason documented there. requireUser()/
 * writeAuditLog() are imported from workshop.ts rather than duplicated —
 * both are auth/audit-sensitive shared logic that shouldn't exist as two
 * copies a future fix could miss one of.
 */

import { prisma, PartTrackingType } from '@ejo/database';
import { requireUser, writeAuditLog, currentUserIsMasterAdmin } from './workshop';

class StoreActionError extends Error {}

/** Resolves the Store department's branch — mirrors getWorkshopBranchId()
 * exactly, same reasoning: a single lookup point so nothing hardcodes a
 * branch elsewhere. */
export async function getStoreBranchId(): Promise<string> {
  const department = await prisma.department.findFirst({
    where: { slug: 'store' },
    select: { branchId: true },
  });
  if (!department) {
    throw new StoreActionError('No branch has a Store department yet — run the seed script, or create one under Branches.');
  }
  return department.branchId;
}

export type EligibleStoreStaffResult = { staff: { id: string; fullName: string; email: string }[]; usingFallback: boolean };

/** Any user holding the given role slug for the branch, or a Master Admin
 * if none exist yet — the exact same fallback pattern as
 * listEligibleManagersForBranch() in workshop.ts, for the same reason:
 * the Users/Roles admin pages are still placeholder stubs, so eligibility
 * must never silently come back empty. */
async function listEligibleStoreStaffForBranch(branchId: string, roleSlug: string): Promise<EligibleStoreStaffResult> {
  await requireUser();
  const staff = await prisma.user.findMany({
    where: { branchId, isActive: true, roles: { some: { role: { slug: roleSlug } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  if (staff.length > 0) {
    return { staff, usingFallback: false };
  }
  const masterAdmins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { isSuperAdmin: true } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  return { staff: masterAdmins, usingFallback: true };
}

export async function listEligibleStoreManagersForBranch(branchId: string): Promise<EligibleStoreStaffResult> {
  return listEligibleStoreStaffForBranch(branchId, 'store-manager');
}

export async function listEligibleStoreOfficersForBranch(branchId: string): Promise<EligibleStoreStaffResult> {
  return listEligibleStoreStaffForBranch(branchId, 'store-officer');
}

/** Only Store Manager, Store Officer, or Master Admin may record what
 * arrives into the Store's own stock — a real, financial-impact action
 * (it adds real stock value), gated the same way Closed requires a
 * Workshop Manager elsewhere in this project. */
async function requireStoreStaff(branchId: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await currentUserIsMasterAdmin()) return user;
  const [managers, officers] = await Promise.all([
    listEligibleStoreManagersForBranch(branchId),
    listEligibleStoreOfficersForBranch(branchId),
  ]);
  const isEligible = [...managers.staff, ...officers.staff].some((s) => s.id === user.id);
  if (!isEligible) {
    throw new StoreActionError('Only Store staff can record a goods receipt.');
  }
  return user;
}

/** GRN-2026-000001 — mirrors generateJobNumber() in workshop.ts exactly:
 * same year-prefixed, zero-padded sequence, same reasoning (string-
 * descending sort on a fixed-width zero-padded sequence correctly
 * matches numeric order). */
async function generateGoodsReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `GRN-${year}-`;
  const latest = await prisma.goodsReceipt.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

export type CreatePartInput = {
  branchId: string;
  name: string;
  description?: string;
  category?: string;
  partNumber?: string;
  trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED';
  baseUnitOfMeasure: string;
  reorderPoint?: number;
  safetyStock?: number;
  alternativeUnits?: { unitName: string; conversionFactor: number }[];
};

/** Creates a new part in the catalog, with its stock row initialized to
 * zero — a part always has exactly one PartStock row from the moment it
 * exists, so goods-receipt logic never has to branch on whether one is
 * there yet. */
export async function createPart(input: CreatePartInput): Promise<{ id: string }> {
  const user = await requireStoreStaff(input.branchId);
  const name = input.name.trim();
  if (!name) {
    throw new StoreActionError('Part name is required.');
  }
  const baseUnitOfMeasure = input.baseUnitOfMeasure.trim();
  if (!baseUnitOfMeasure) {
    throw new StoreActionError('Base unit of measure is required.');
  }

  const part = await prisma.$transaction(async (tx) => {
    const created = await tx.part.create({
      data: {
        branchId: input.branchId,
        name,
        description: input.description?.trim() || undefined,
        category: input.category?.trim() || undefined,
        partNumber: input.partNumber?.trim() || undefined,
        trackingType: input.trackingType as PartTrackingType,
        baseUnitOfMeasure,
        reorderPoint: input.reorderPoint,
        safetyStock: input.safetyStock,
        createdById: user.id,
      },
    });
    await tx.partStock.create({ data: { partId: created.id, quantityOnHand: 0, quantityReserved: 0 } });
    if (input.alternativeUnits && input.alternativeUnits.length > 0) {
      for (const unit of input.alternativeUnits) {
        const unitName = unit.unitName.trim();
        if (!unitName || !(unit.conversionFactor > 0)) continue;
        await tx.partUnitOfMeasure.create({
          data: { partId: created.id, unitName, conversionFactor: unit.conversionFactor },
        });
      }
    }
    return created;
  });

  await writeAuditLog({
    userId: user.id,
    action: 'part.created',
    entityType: 'Part',
    entityId: part.id,
    metadata: { name, trackingType: input.trackingType, baseUnitOfMeasure },
  });

  return { id: part.id };
}

export async function listParts(branchId: string, search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.part.findMany({
    where: {
      branchId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { partNumber: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    include: { stock: true },
  });
}

export async function getPart(id: string) {
  await requireUser();
  return prisma.part.findUnique({
    where: { id },
    include: {
      stock: true,
      alternativeUnits: true,
      batches: { where: { remainingQuantity: { gt: 0 } }, orderBy: { receivedAt: 'asc' } },
      serials: { where: { status: 'IN_STOCK' }, orderBy: { receivedAt: 'asc' } },
      createdBy: { select: { fullName: true } },
    },
  });
}

export type GoodsReceiptLineInput = {
  partId: string;
  quantityReceivedInUnit: number;
  unitUsed: string;
  unitCost?: number;
  /** Required, and only meaningful, for a BATCH-tracked part. */
  batchNumber?: string;
  /** Required, and only meaningful, for a SERIALIZED part — one entry per
   * physical unit received; its length is the real received quantity for
   * that case, not quantityReceivedInUnit (which still carries whatever
   * the storekeeper typed, for the record, but the serials are the
   * source of truth for how many units this line actually represents). */
  serialNumbers?: string[];
};

export type RecordGoodsReceiptInput = {
  branchId: string;
  supplierName: string;
  notes?: string;
  lines: GoodsReceiptLineInput[];
};

/** Records a delivery of stock arriving into the store. Converts each
 * line's entered quantity into the part's own base unit before touching
 * stock — the same drum-to-liters conversion this was designed around —
 * and updates the tracking-type-appropriate stock representation (a
 * batch row, individual serial rows, or just the running total) plus the
 * always-current PartStock aggregate, all inside one transaction so a
 * partial failure can never leave stock and the receipt record
 * disagreeing with each other. */
export async function recordGoodsReceipt(input: RecordGoodsReceiptInput): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireStoreStaff(input.branchId);
  const supplierName = input.supplierName.trim();
  if (!supplierName) {
    throw new StoreActionError('Supplier name is required.');
  }
  if (!input.lines || input.lines.length === 0) {
    throw new StoreActionError('At least one line item is required.');
  }

  const partIds = [...new Set(input.lines.map((l) => l.partId))];
  const parts = await prisma.part.findMany({
    where: { id: { in: partIds } },
    include: { alternativeUnits: true },
  });
  // Derived from `parts`'s own real, Prisma-inferred type — not a
  // hand-written approximation. That distinction matters concretely:
  // an earlier version of this exact line declared conversionFactor as
  // `number`, which is how it's actually *used* (via Number(...)), but
  // its real type here is Prisma's own Decimal — a mismatch the real
  // compiler correctly rejected even though it looked reasonable.
  const partById = new Map<string, (typeof parts)[number]>(parts.map((p) => [p.id, p]));

  // Validated up front, before any writes — every line must resolve to a
  // real conversion and satisfy its tracking type's own requirement,
  // or nothing in this receipt is recorded at all.
  const resolvedLines = input.lines.map((line) => {
    const part = partById.get(line.partId);
    if (!part) {
      throw new StoreActionError(`Part not found for one of the line items.`);
    }
    if (!(line.quantityReceivedInUnit > 0)) {
      throw new StoreActionError(`Quantity received must be greater than zero for ${part.name}.`);
    }
    let quantityInBaseUnit: number;
    if (line.unitUsed === part.baseUnitOfMeasure) {
      quantityInBaseUnit = line.quantityReceivedInUnit;
    } else {
      const altUnit = part.alternativeUnits.find((u) => u.unitName === line.unitUsed);
      if (!altUnit) {
        throw new StoreActionError(`"${line.unitUsed}" is not a recognized unit for ${part.name}.`);
      }
      quantityInBaseUnit = line.quantityReceivedInUnit * Number(altUnit.conversionFactor);
    }

    if (part.trackingType === 'BATCH' && !line.batchNumber?.trim()) {
      throw new StoreActionError(`A batch number is required for ${part.name}.`);
    }
    if (part.trackingType === 'SERIALIZED') {
      const serials = (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
      if (serials.length === 0) {
        throw new StoreActionError(`Serial numbers are required for ${part.name}.`);
      }
      const uniqueSerials = new Set(serials);
      if (uniqueSerials.size !== serials.length) {
        throw new StoreActionError(`Duplicate serial numbers entered for ${part.name}.`);
      }
    }

    return { ...line, part, quantityInBaseUnit };
  });

  const referenceNumber = await generateGoodsReceiptNumber();

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.goodsReceipt.create({
      data: {
        branchId: input.branchId,
        referenceNumber,
        supplierName,
        receivedById: user.id,
        notes: input.notes?.trim() || undefined,
      },
    });

    for (const line of resolvedLines) {
      const createdLine = await tx.goodsReceiptLine.create({
        data: {
          goodsReceiptId: created.id,
          partId: line.partId,
          quantityReceivedInUnit: line.quantityReceivedInUnit,
          unitUsed: line.unitUsed,
          quantityInBaseUnit: line.quantityInBaseUnit,
          unitCost: line.unitCost,
          batchNumber: line.part.trackingType === 'BATCH' ? line.batchNumber?.trim() : undefined,
        },
      });

      if (line.part.trackingType === 'BATCH') {
        await tx.partBatch.create({
          data: {
            partId: line.partId,
            batchNumber: line.batchNumber!.trim(),
            receivedQuantity: line.quantityInBaseUnit,
            remainingQuantity: line.quantityInBaseUnit,
            goodsReceiptLineId: createdLine.id,
          },
        });
      } else if (line.part.trackingType === 'SERIALIZED') {
        const serials = (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
        for (const serialNumber of serials) {
          await tx.partSerial.create({
            data: { partId: line.partId, serialNumber, status: 'IN_STOCK', goodsReceiptLineId: createdLine.id },
          });
        }
      }

      await tx.partStock.upsert({
        where: { partId: line.partId },
        update: { quantityOnHand: { increment: line.quantityInBaseUnit } },
        create: { partId: line.partId, quantityOnHand: line.quantityInBaseUnit, quantityReserved: 0 },
      });
    }

    return created;
  });

  await writeAuditLog({
    userId: user.id,
    action: 'goods_receipt.recorded',
    entityType: 'GoodsReceipt',
    entityId: receipt.id,
    metadata: { referenceNumber, supplierName, lineCount: resolvedLines.length },
  });

  return { id: receipt.id, referenceNumber };
}

export async function listGoodsReceipts(branchId: string) {
  await requireUser();
  return prisma.goodsReceipt.findMany({
    where: { branchId },
    orderBy: { receivedAt: 'desc' },
    include: { receivedBy: { select: { fullName: true } }, lines: { select: { id: true } } },
  });
}

export async function getGoodsReceipt(id: string) {
  await requireUser();
  return prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      receivedBy: { select: { fullName: true } },
      lines: { include: { part: { select: { name: true, baseUnitOfMeasure: true } } } },
    },
  });
}
