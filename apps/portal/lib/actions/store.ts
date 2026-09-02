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
import { pluralize } from '@/lib/utils/pluralize';
import { requireUser, writeAuditLog, currentUserIsMasterAdmin } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderStaffGoodsReceiptRecordedEmail } from '@/lib/email-templates/staff-goods-receipt-recorded';

class StoreActionError extends Error {}

/** Mirrors getWorkshopOrgContext() in workshop.ts exactly, scoped to
 * the 'store' department slug instead — kept as its own small
 * function rather than importing a workshop-specific one, since Store
 * is genuinely its own department with its own name/context to show
 * in its own emails. */
async function getStoreOrgContext(): Promise<{ companyName: string; branchName: string; departmentName: string }> {
  const department = await prisma.department.findFirstOrThrow({
    where: { slug: 'store' },
    select: {
      name: true,
      branch: {
        select: {
          name: true,
          businessUnit: { select: { company: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    companyName: department.branch.businessUnit.company.name,
    branchName: department.branch.name,
    departmentName: department.name,
  };
}

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
export async function requireStoreStaff(branchId: string): Promise<{ id: string }> {
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

export type UpdatePartInput = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  partNumber?: string;
  reorderPoint?: number;
  safetyStock?: number;
};

/** Edits an existing part's own descriptive fields — deliberately never
 * trackingType or baseUnitOfMeasure, since changing either on a part
 * that already has real stock recorded in its original base unit would
 * be genuinely dangerous, not just inconvenient: existing PartStock/
 * PartBatch/GoodsReceiptLine rows would silently disagree with a
 * changed unit. Those two are fixed for the life of the part; everything
 * else here is safe to correct at any time. */
export async function updatePart(input: UpdatePartInput): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: input.id }, select: { branchId: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
  const name = input.name.trim();
  if (!name) {
    throw new StoreActionError('Part name is required.');
  }
  await prisma.part.update({
    where: { id: input.id },
    data: {
      name,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      partNumber: input.partNumber?.trim() || null,
      reorderPoint: input.reorderPoint,
      safetyStock: input.safetyStock,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'part.updated', entityType: 'Part', entityId: input.id, metadata: { name } });
}

/** Replaces a part's full set of alternative units in one call — the
 * real correction this was built for: fixing a wrong conversion factor
 * (e.g. a drum genuinely being 205L, not 208L, confirmed against a real
 * carton photo) or adding a newly-discovered one (e.g. Brake Fluid
 * arriving by the Carton as well as loose Bottles) both just mean
 * submitting the corrected full list — never a partial patch that could
 * leave a stale, wrong unit sitting alongside the fix. */
export async function setPartAlternativeUnits(
  partId: string,
  units: { unitName: string; conversionFactor: number }[],
): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, baseUnitOfMeasure: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
  const cleaned = units
    .map((u) => ({ unitName: u.unitName.trim(), conversionFactor: u.conversionFactor }))
    .filter((u) => u.unitName && u.conversionFactor > 0);
  for (const u of cleaned) {
    if (u.unitName === part.baseUnitOfMeasure) {
      throw new StoreActionError(`"${u.unitName}" is already this part's base unit — an alternative unit must be genuinely different.`);
    }
  }
  const names = cleaned.map((u) => u.unitName);
  if (new Set(names).size !== names.length) {
    throw new StoreActionError('Each alternative unit name must be unique for this part.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.partUnitOfMeasure.deleteMany({ where: { partId } });
    for (const u of cleaned) {
      await tx.partUnitOfMeasure.create({ data: { partId, unitName: u.unitName, conversionFactor: u.conversionFactor } });
    }
  });
  await writeAuditLog({ userId: user.id, action: 'part.alternative_units_updated', entityType: 'Part', entityId: partId, metadata: { units: cleaned } });
}

export type CreatePartFitmentInput = {
  partId: string;
  make: string;
  model: string;
  engineType?: string;
  yearFrom?: number;
  yearTo?: number;
};

/** Records one real vehicle configuration a part fits. A part with no
 * fitment rows at all is treated as fitting everything (see
 * getFittingPartsForVehicle below) — so this is only ever needed for
 * parts that genuinely vary by vehicle, never as a formality for the
 * universal ones (engine oil, coolant, brake fluid, penetrating oil). */
export async function createPartFitment(input: CreatePartFitmentInput): Promise<{ id: string }> {
  const part = await prisma.part.findUnique({ where: { id: input.partId }, select: { branchId: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
  const make = input.make.trim();
  const model = input.model.trim();
  if (!make || !model) {
    throw new StoreActionError('Make and Model are required.');
  }
  const fitment = await prisma.partFitment.create({
    data: {
      partId: input.partId,
      make,
      model,
      engineType: input.engineType?.trim() || undefined,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'part.fitment_added', entityType: 'Part', entityId: input.partId, metadata: { make, model, engineType: input.engineType } });
  return { id: fitment.id };
}

export async function deletePartFitment(fitmentId: string): Promise<void> {
  const fitment = await prisma.partFitment.findUnique({ where: { id: fitmentId }, select: { partId: true, make: true, model: true, part: { select: { branchId: true } } } });
  if (!fitment) {
    throw new StoreActionError('Fitment record not found.');
  }
  const user = await requireStoreStaff(fitment.part.branchId);
  await prisma.partFitment.delete({ where: { id: fitmentId } });
  await writeAuditLog({ userId: user.id, action: 'part.fitment_removed', entityType: 'Part', entityId: fitment.partId, metadata: { make: fitment.make, model: fitment.model } });
}

export async function listPartFitments(partId: string) {
  await requireUser();
  return prisma.partFitment.findMany({ where: { partId }, orderBy: { createdAt: 'asc' } });
}

/** The real matching logic: a part with zero fitment rows fits every
 * vehicle (the correct default for the universal parts — nothing extra
 * to configure for them). A part WITH fitment rows fits a given vehicle
 * only if at least one row matches its make+model, and (when that row
 * specifies an engine) the vehicle's own engine too, and (when that row
 * specifies a year range) the vehicle's own year falls inside it. A row
 * that leaves engine/year unset is intentionally permissive on that
 * dimension — "fits every engine of this make/model" or "fits every
 * year of this make/model," not a row that silently never matches. */
export async function getFittingPartsForVehicle(
  branchId: string,
  vehicle: { make?: string | null; model?: string | null; engineType?: string | null; year?: number | null },
  search?: string,
  partTypeId?: string,
) {
  await requireUser();
  const q = search?.trim();
  const parts = await prisma.part.findMany({
    where: {
      branchId,
      isActive: true,
      ...(partTypeId ? { partTypeId } : {}),
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
    include: { stock: true, fitments: true },
  });

  const make = vehicle.make?.trim();
  const model = vehicle.model?.trim();

  return parts.filter((part: (typeof parts)[number]) => {
    if (part.fitments.length === 0) return true;
    if (!make || !model) return false;
    return part.fitments.some((f: (typeof part.fitments)[number]) => {
      if (f.make !== make || f.model !== model) return false;
      if (f.engineType && f.engineType !== vehicle.engineType) return false;
      if (f.yearFrom && (!vehicle.year || vehicle.year < f.yearFrom)) return false;
      if (f.yearTo && (!vehicle.year || vehicle.year > f.yearTo)) return false;
      return true;
    });
  });
}

export async function createPartCategory(branchId: string, name: string, description?: string): Promise<{ id: string }> {
  const user = await requireStoreStaff(branchId);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new StoreActionError('Part Category name is required.');
  }
  const category = await prisma.partCategory.create({
    data: { branchId, name: trimmedName, description: description?.trim() || undefined, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'part_category.created', entityType: 'PartCategory', entityId: category.id, metadata: { name: trimmedName } });
  return { id: category.id };
}

export async function listPartCategories(branchId: string) {
  await requireUser();
  return prisma.partCategory.findMany({ where: { branchId }, orderBy: { name: 'asc' } });
}

/** The specific, customer-facing kind of part a technician actually
 * picks (e.g. "Fuel Filter") — always under exactly one parent
 * PartCategory (e.g. "Filter"), confirmed as a genuine two-level tree,
 * not a single flat list: "Filter" containing "Oil Filter"/"Fuel
 * Filter", "Fluid" containing "Coolant"/"Engine Oil"/"Brake Fluid". */
export async function createPartType(branchId: string, categoryId: string, name: string, description?: string): Promise<{ id: string }> {
  const user = await requireStoreStaff(branchId);
  const category = await prisma.partCategory.findUnique({ where: { id: categoryId }, select: { branchId: true } });
  if (!category) {
    throw new StoreActionError('Part Category not found.');
  }
  if (category.branchId !== branchId) {
    throw new StoreActionError('This Part Category does not belong to this branch.');
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new StoreActionError('Part Type name is required.');
  }
  const partType = await prisma.partType.create({
    data: { branchId, categoryId, name: trimmedName, description: description?.trim() || undefined, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'part_type.created', entityType: 'PartType', entityId: partType.id, metadata: { name: trimmedName, categoryId } });
  return { id: partType.id };
}

/** The generic, technician-facing catalog — what a technician actually
 * searches when adding a STORE_PART line to an estimate. Deliberately
 * a completely separate list from listParts()'s own real, vehicle-
 * specific Parts: a technician should never see "Fuel Filter — Foton
 * Tunland" as an option, only the generic "Fuel Filter" itself. Each
 * result carries its own parent category's name, so the real two-
 * level tree (Filter → Oil Filter/Fuel Filter, Fluid → Coolant/Engine
 * Oil/Brake Fluid) is genuinely browsable, not flattened away. */
export async function listPartTypes(branchId: string, search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.partType.findMany({
    where: {
      branchId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { category: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    include: { category: { select: { id: true, name: true } } },
  });
}

/** The real "price registered with the last goods receipt" — the exact
 * source of truth this was built around: never a price Store retypes,
 * always the most recent actual cost this Part was genuinely received
 * at. Skips any receipt line that was recorded with no cost at all
 * (unitCost is optional on a Goods Receipt), rather than treating a
 * missing cost as if it were genuinely zero. Returns null when the
 * Part has no cost on record at all — a real, honest "we don't know
 * yet" rather than a silent, misleading zero. */
export async function getLastKnownUnitCostForPart(partId: string): Promise<number | null> {
  await requireUser();
  const line = await prisma.goodsReceiptLine.findFirst({
    where: { partId, unitCost: { not: null } },
    orderBy: { goodsReceipt: { receivedAt: 'desc' } },
    select: { unitCost: true },
  });
  return line ? Number(line.unitCost) : null;
}

/** Store's own real action on an estimate — matching a technician's
 * generic request (a PartType, e.g. "Fuel Filter") to the one real,
 * vehicle-fitting catalog Part that actually satisfies it, with the
 * price pulled from that Part's own last real Goods Receipt cost.
 * Never a price Store types in themselves — matches the same
 * "auto-fill, never retype" principle already established for Goods
 * Receipt's own price recording. Lives here in store.ts rather than
 * workshop.ts specifically to avoid a circular import: store.ts
 * already imports auth/audit helpers from workshop.ts, so the
 * dependency only ever needs to run one direction. */
export async function matchEstimateStorePartLine(lineItemId: string, partId: string): Promise<void> {
  const lineItem = await prisma.estimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      type: true,
      quantity: true,
      partTypeId: true,
      estimate: { select: { status: true, jobCard: { select: { branchId: true } } } },
    },
  });
  if (!lineItem) {
    throw new StoreActionError('Estimate line not found.');
  }
  if (lineItem.type !== 'STORE_PART') {
    throw new StoreActionError('Only a Store Part line can be matched to a catalog Part.');
  }
  if (lineItem.estimate.status !== 'SUBMITTED') {
    throw new StoreActionError('This estimate is not currently awaiting Store matching.');
  }
  const user = await requireStoreStaff(lineItem.estimate.jobCard.branchId);

  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, partTypeId: true, name: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  if (part.branchId !== lineItem.estimate.jobCard.branchId) {
    throw new StoreActionError('This Part does not belong to the same branch as this Job Card.');
  }
  if (lineItem.partTypeId && part.partTypeId !== lineItem.partTypeId) {
    throw new StoreActionError(`${part.name} is not the requested Part Type for this line.`);
  }

  const unitCost = await getLastKnownUnitCostForPart(partId);
  if (unitCost === null) {
    throw new StoreActionError(`${part.name} has no recorded cost yet — record a Goods Receipt for it before matching this line.`);
  }
  const amount = Math.round(unitCost * lineItem.quantity * 100) / 100;

  await prisma.estimateLineItem.update({
    where: { id: lineItemId },
    data: { matchedPartId: partId, unitPrice: unitCost, amount },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate_line.store_matched',
    entityType: 'EstimateLineItem',
    entityId: lineItemId,
    metadata: { partId, partName: part.name, unitCost, amount },
  });
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
    include: { stock: true, alternativeUnits: true },
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
      fitments: { orderBy: { createdAt: 'asc' } },
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
      // The real guarantee, not just the client-side hint — a
      // serialized part's real quantity IS its serial count, so these
      // two numbers disagreeing is never a valid receipt to record.
      if (serials.length !== line.quantityReceivedInUnit) {
        throw new StoreActionError(
          `${part.name}: ${pluralize(serials.length, 'serial number')} entered, but quantity received was ${line.quantityReceivedInUnit}. These must match exactly.`,
        );
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

  // Confirms what was recorded to the person who recorded it (a real
  // written record, same reasoning every other "recorded" email in
  // this project already follows) and their Store Manager, so stock
  // arriving is never something a Manager only discovers by checking
  // the catalog themselves. One email per line — matches the current
  // single-line-per-receipt form exactly; if a future multi-line form
  // ever submits several lines in one call, this sends one email per
  // line rather than a combined summary, a known, honest limitation
  // of the current single-part-focused template.
  try {
    const [recordedByUser, orgContext, storeManagers] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } }),
      getStoreOrgContext(),
      listEligibleStoreManagersForBranch(input.branchId),
    ]);
    if (recordedByUser) {
      const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
      const recipients = [...new Set([recordedByUser.email, ...storeManagers.staff.map((m) => m.email)])];
      for (const line of resolvedLines) {
        const html = renderStaffGoodsReceiptRecordedEmail({
          recordedByName: recordedByUser.fullName,
          referenceNumber,
          supplierName,
          partName: line.part.name,
          quantityLabel: `${line.quantityReceivedInUnit} ${line.unitUsed}`,
          quantityInBaseUnitLabel: `${line.quantityInBaseUnit} ${line.part.baseUnitOfMeasure}`,
          batchNumber: line.part.trackingType === 'BATCH' ? line.batchNumber?.trim() : undefined,
          serialNumbers: line.part.trackingType === 'SERIALIZED' ? (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
          notes: input.notes?.trim() || undefined,
          dashboardUrl: `${portalUrl}/inventory/parts/${line.partId}`,
          logoUrl: `${websiteUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        });
        for (const to of recipients) {
          await sendEmail(to, `Goods receipt recorded — ${referenceNumber}`, html);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send goods-receipt notification email', receipt.id, err);
  }

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
