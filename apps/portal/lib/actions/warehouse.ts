'use server';
/**
 * The Warehouses: finished-goods locations, every unit by serial, receiving
 * imported finished products against purchase orders, incoming QC on goods
 * receipts, stock transfers, picking against goods release notes, dispatch
 * and delivery, and adjustments (quarantine → scrap or back to stock).
 *
 * Finished units are branch-owned through their location (FgLocation.branchId);
 * release notes and dispatches through their sales order's branch. Every list
 * is fenced with reachWhere('warehouse.view'); every change is authorised
 * against the record's branch and written to the audit trail.
 */
import { prisma, ProductFamily } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog, getWorkshopBranchId } from '@/lib/workshop-core';
import { authorize, allows, reachWhere, orgWhere, getPrincipal, refuseDuringAssist, canSeeRecord, NOT_AVAILABLE } from '@/lib/authz/server';
import { claimed as stillAsSeen } from '@/lib/integrity';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { userNames, nameOf } from '@/lib/zinox/people';
import { actorLabel } from '@/lib/assist/rules';
import {
  ON_HAND_STATUSES, MOVABLE_STATUSES, UNIT_STATUS_LABEL, parseSerials, serialProblem, remainingToReceive, transferNeedsApproval, transferProblem,
  canDispatchTransfer, pickProblem, releaseReadyToRelease, dispatchProblem, inspectionProblem, tally, FG_LOCATION_KINDS, type FgLocationKind, type UnitStatus,
} from '@/lib/warehouse-core';
import { RECEIVABLE_PO_STATUSES, statusAfterReceipt, receiptQuantityProblem } from '@/lib/procurement-core';

class WarehouseError extends Error {}

const n2 = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100;

async function audit(userId: string, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

/** The branch this person's warehouse work belongs to: their own, else (platform team) the operating branch. */
async function myBranchId(): Promise<string> {
  const p = await getPrincipal();
  return p.branchId ?? (await getWorkshopBranchId());
}

async function organisationOfBranch(branchId: string): Promise<string> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } });
  if (!b) throw new WarehouseError('That branch no longer exists.');
  return b.businessUnit.organisationId;
}

const lagosDay = (d: Date = new Date()) => new Date(`${d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);

// ── Branches and locations ────────────────────────────────────────────────

/** Branches this person's warehouse view reaches (for choosing where a location lives). */
export async function listWarehouseBranches(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  if (reach.branchId === '__no_access__') return [];
  return prisma.branch.findMany({ where: { isActive: true, ...(reach.branchId ? { id: reach.branchId } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

export async function listFgLocations(opts: { includeRetired?: boolean } = {}) {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  return prisma.fgLocation.findMany({
    where: { ...reach, ...(opts.includeRetired ? {} : { isActive: true }) },
    include: { branch: { select: { id: true, name: true } }, _count: { select: { units: { where: { status: { in: ON_HAND_STATUSES } } } } } },
    orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
  });
}

export async function createFgLocation(input: { name: string; kind: string; branchId?: string }): Promise<{ id: string }> {
  const user = await requireUser();
  const branchId = input.branchId || (await myBranchId());
  await authorize('warehouse.manage', { branchId, homeBranch: true }, 'fg_location.create', 'Only the Warehouse Manager can add locations.');
  const name = input.name.trim();
  if (name.length < 2) throw new WarehouseError('Give the location a name (e.g. "Gbagada FG store").');
  const kind = (FG_LOCATION_KINDS as readonly string[]).includes(input.kind) ? (input.kind as FgLocationKind) : 'WAREHOUSE';
  const existing = await prisma.fgLocation.findUnique({ where: { branchId_name: { branchId, name } }, select: { id: true, isActive: true } });
  if (existing) throw new WarehouseError(existing.isActive ? 'A location with that name already exists at this branch.' : 'A retired location has that name — reactivate it instead.');
  const loc = await prisma.fgLocation.create({ data: { branchId, name, kind } });
  await audit(user.id, 'FgLocation', loc.id, 'fg_location.created', { name, kind, branchId });
  return { id: loc.id };
}

export async function setFgLocationActive(locationId: string, active: boolean): Promise<void> {
  const user = await requireUser();
  const loc = await prisma.fgLocation.findUnique({ where: { id: locationId }, select: { id: true, branchId: true, name: true, isActive: true } });
  if (!loc) throw new WarehouseError(NOT_AVAILABLE);
  await authorize('warehouse.manage', { branchId: loc.branchId, homeBranch: true }, 'fg_location.retire', 'Only the Warehouse Manager can retire or reactivate a location.');
  if (!active) {
    const held = await prisma.finishedUnit.count({ where: { locationId, status: { in: ON_HAND_STATUSES } } });
    if (held > 0) throw new WarehouseError(`${held} ${held === 1 ? 'unit is' : 'units are'} still held here — move them first.`);
  }
  if (loc.isActive === active) return;
  await prisma.fgLocation.update({ where: { id: locationId }, data: { isActive: active } });
  await audit(user.id, 'FgLocation', locationId, active ? 'fg_location.reactivated' : 'fg_location.retired', { name: loc.name });
}

// ── Products (for pickers) ────────────────────────────────────────────────

export async function searchProductsForSelect(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 80);
  const rows = await prisma.product.findMany({
    where: { ...(await orgWhere()), isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true, sku: true, family: true },
  });
  return rows.map((p: (typeof rows)[number]) => ({ value: p.id, label: p.name, sublabel: `${p.sku} · ${p.family.toLowerCase().replace(/_/g, ' ')}` }));
}

// ── Finished units ────────────────────────────────────────────────────────

export type FinishedUnitFilter = { q?: string; family?: string; productId?: string; locationId?: string; status?: string };

export async function listFinishedUnits(filter: FinishedUnitFilter = {}) {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const q = filter.q?.trim();
  const status = filter.status && (UNIT_STATUS_LABEL as Record<string, string>)[filter.status] ? (filter.status as UnitStatus) : undefined;
  const where = {
    location: reach,
    ...(status ? { status } : q ? {} : { status: { in: ON_HAND_STATUSES } }),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
    ...(filter.productId ? { productId: filter.productId } : {}),
    ...(filter.family && (Object.values(ProductFamily) as string[]).includes(filter.family) ? { product: { family: filter.family as ProductFamily } } : {}),
    ...(q ? { OR: [{ serialNumber: { contains: q, mode: 'insensitive' as const } }, { product: { name: { contains: q, mode: 'insensitive' as const } } }] } : {}),
  };
  const [units, byProduct] = await Promise.all([
    prisma.finishedUnit.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
      select: { id: true, serialNumber: true, status: true, receivedAt: true, updatedAt: true, product: { select: { id: true, name: true, sku: true, family: true } }, configuration: { select: { name: true } }, location: { select: { id: true, name: true, branch: { select: { name: true } } } } },
    }),
    prisma.finishedUnit.groupBy({ by: ['productId'], where, _count: { _all: true } }),
  ]);
  const productIds = byProduct.map((r: { productId: string }) => r.productId);
  const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : [];
  const pname = new Map(products.map((p: { id: string; name: string; sku: string }) => [p.id, p]));
  const totals = byProduct
    .map((r: { productId: string; _count: { _all: number } }) => ({ productId: r.productId, name: pname.get(r.productId)?.name ?? 'Product', sku: pname.get(r.productId)?.sku ?? '', count: r._count._all }))
    .sort((a: { count: number; name: string }, b: { count: number; name: string }) => b.count - a.count || a.name.localeCompare(b.name));
  return { units, totals };
}

export async function getFinishedUnit(unitId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const unit = await prisma.finishedUnit.findFirst({
    where: { id: unitId, location: reach },
    include: {
      product: { select: { id: true, name: true, sku: true, family: true, subBrand: true, serialised: true, defaultWarrantyMonths: true } },
      configuration: { select: { id: true, name: true, code: true } },
      location: { select: { id: true, name: true, kind: true, branchId: true, branch: { select: { name: true } } } },
      productionUnit: { select: { id: true, number: true, buildOrderId: true } },
      salesOrder: { select: { id: true, number: true, status: true, customer: { select: { id: true, fullName: true } } } },
      dispatch: { select: { id: true, number: true, status: true } },
      customer: { select: { id: true, fullName: true } },
      warranties: { select: { id: true, warrantyNumber: true, status: true, endsAt: true }, orderBy: { startsAt: 'desc' }, take: 3 },
      transferLines: { select: { transfer: { select: { id: true, number: true, status: true, createdAt: true } } }, orderBy: { id: 'desc' }, take: 10 },
      serviceJobs: { select: { id: true, number: true, status: true }, orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  return unit;
}

export async function getFinishedUnitAuditTrail(unitId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const visibleId = (await prisma.finishedUnit.findFirst({ where: { id: unitId, location: reach }, select: { id: true } }))?.id ?? '__no_access__';
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'FinishedUnit', entityId: visibleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const names = await userNames(entries.map((e: { userId: string | null }) => e.userId));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(nameOf(names, e.userId), e.metadata) : null }));
}

/** Where a unit is held and may be acted on — within reach, with its branch. */
async function unitForChange(unitId: string) {
  const reach = await reachWhere('warehouse.view', { lens: false });
  const u = await prisma.finishedUnit.findFirst({ where: { id: unitId, location: reach }, select: { id: true, serialNumber: true, status: true, locationId: true, location: { select: { branchId: true, name: true } } } });
  if (!u) throw new WarehouseError(NOT_AVAILABLE);
  return u;
}

export async function moveFinishedUnit(unitId: string, locationId: string, note?: string): Promise<void> {
  const user = await requireUser();
  const u = await unitForChange(unitId);
  await authorize('warehouse.fg.operate', { branchId: u.location.branchId, homeBranch: true }, 'finished_unit.move', 'Only finished goods staff can move a unit.');
  if (!(MOVABLE_STATUSES as string[]).includes(u.status)) throw new WarehouseError(`A unit that is ${UNIT_STATUS_LABEL[u.status as UnitStatus].toLowerCase()} cannot be moved by hand — use a transfer, release or return.`);
  const to = await prisma.fgLocation.findFirst({ where: { id: locationId, isActive: true, branchId: u.location.branchId }, select: { id: true, name: true } });
  if (!to) throw new WarehouseError('Choose an active location at the same branch (use a transfer for another branch).');
  if (to.id === u.locationId) throw new WarehouseError('The unit is already there.');
  stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unitId, locationId: u.locationId, status: u.status }, data: { locationId: to.id } }));
  await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.moved', { serialNumber: u.serialNumber, from: u.location.name, to: to.name, note: note?.trim() || undefined });
}

export async function setFinishedUnitQuarantine(unitId: string, quarantine: boolean, reason: string): Promise<void> {
  const user = await requireUser();
  const u = await unitForChange(unitId);
  await authorize('warehouse.manage', { branchId: u.location.branchId, homeBranch: true }, 'finished_unit.quarantine', 'Only the Warehouse Manager can quarantine a unit or return it to stock.');
  if (reason.trim().length < 3) throw new WarehouseError('Give the reason.');
  if (quarantine) {
    // A reserved unit is promised to a transfer or an order: cancel or unpick that first.
    if (!['IN_STOCK', 'RETURNED'].includes(u.status)) throw new WarehouseError(u.status === 'RESERVED' ? 'This unit is reserved for a transfer or an order — cancel that first.' : `A unit that is ${UNIT_STATUS_LABEL[u.status as UnitStatus].toLowerCase()} cannot be quarantined.`);
    stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unitId, status: u.status }, data: { status: 'QUARANTINE' } }));
    await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.quarantined', { serialNumber: u.serialNumber, from: u.status, reason: reason.trim() });
  } else {
    if (u.status !== 'QUARANTINE') throw new WarehouseError('This unit is not in quarantine.');
    stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unitId, status: 'QUARANTINE' }, data: { status: 'IN_STOCK' } }));
    await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.returned_to_stock', { serialNumber: u.serialNumber, reason: reason.trim() });
  }
}

/** A finished goods officer asks for a unit to be written off: it goes to quarantine until the Warehouse Manager decides. */
export async function requestUnitAdjustment(unitId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const u = await unitForChange(unitId);
  await authorize('warehouse.fg.operate', { branchId: u.location.branchId, homeBranch: true }, 'finished_unit.adjustment_request', 'Only finished goods staff can raise an adjustment.');
  if (reason.trim().length < 3) throw new WarehouseError('Say what is wrong with the unit (damage, count variance, missing).');
  if (!['IN_STOCK', 'RETURNED'].includes(u.status)) throw new WarehouseError(u.status === 'RESERVED' ? 'This unit is reserved for a transfer or an order — cancel that first.' : `A unit that is ${UNIT_STATUS_LABEL[u.status as UnitStatus].toLowerCase()} cannot be adjusted.`);
  stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unitId, status: u.status }, data: { status: 'QUARANTINE' } }));
  await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.adjustment_requested', { serialNumber: u.serialNumber, from: u.status, reason: reason.trim() });
}

/** The Warehouse Manager's decision on a quarantined unit: scrap it (variance, damage) or put it back in stock. */
export async function decideUnitAdjustment(unitId: string, decision: 'SCRAP' | 'RETURN_TO_STOCK', note: string): Promise<void> {
  await refuseDuringAssist('decideUnitAdjustment');
  const user = await requireUser();
  const u = await unitForChange(unitId);
  await authorize('warehouse.manage', { branchId: u.location.branchId, homeBranch: true }, 'finished_unit.adjustment_decide', 'Only the Warehouse Manager approves adjustments.');
  if (u.status !== 'QUARANTINE') throw new WarehouseError('Only a quarantined unit can be decided on.');
  const requested = await prisma.auditLog.findFirst({ where: { entityType: 'FinishedUnit', entityId: unitId, action: { in: ['finished_unit.adjustment_requested', 'finished_unit.quarantined'] } }, orderBy: { createdAt: 'desc' }, select: { userId: true } });
  if (requested?.userId === user.id && !(await getPrincipal()).isSuperAdmin) throw new WarehouseError('The person who raised the adjustment cannot approve it.');
  if (decision === 'SCRAP') {
    if (note.trim().length < 3) throw new WarehouseError('Give the reason for scrapping.');
    stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unitId, status: 'QUARANTINE' }, data: { status: 'SCRAPPED' } }));
    await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.scrapped', { serialNumber: u.serialNumber, reason: note.trim() });
  } else {
    stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unitId, status: 'QUARANTINE' }, data: { status: 'IN_STOCK' } }));
    await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.returned_to_stock', { serialNumber: u.serialNumber, reason: note.trim() || 'Adjustment declined' });
  }
}

/** Quarantined units awaiting the Warehouse Manager (the adjustments register), with who raised them and why. */
export async function listAdjustments() {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const units = await prisma.finishedUnit.findMany({
    where: { location: reach, status: 'QUARANTINE' },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, serialNumber: true, updatedAt: true, product: { select: { name: true } }, location: { select: { name: true, branchId: true } } },
  });
  const ids = units.map((u: { id: string }) => u.id);
  const logs = ids.length
    ? await prisma.auditLog.findMany({ where: { entityType: 'FinishedUnit', entityId: { in: ids }, action: { in: ['finished_unit.adjustment_requested', 'finished_unit.quarantined'] } }, orderBy: { createdAt: 'desc' }, select: { entityId: true, userId: true, metadata: true, createdAt: true } })
    : [];
  const first = new Map<string, (typeof logs)[number]>();
  for (const l of logs) if (l.entityId && !first.has(l.entityId)) first.set(l.entityId, l);
  const names = await userNames(logs.map((l: { userId: string | null }) => l.userId));
  const scrapped = await prisma.finishedUnit.findMany({ where: { location: reach, status: 'SCRAPPED' }, orderBy: { updatedAt: 'desc' }, take: 30, select: { id: true, serialNumber: true, updatedAt: true, product: { select: { name: true } }, location: { select: { name: true } } } });
  return {
    pending: units.map((u: (typeof units)[number]) => {
      const l = first.get(u.id);
      const meta = (l?.metadata ?? {}) as { reason?: string };
      return { ...u, raisedBy: nameOf(names, l?.userId), raisedById: l?.userId ?? null, reason: meta.reason ?? null, raisedAt: l?.createdAt ?? u.updatedAt };
    }),
    scrapped,
  };
}

// ── Receiving imported finished products against a purchase order ─────────

/** Purchase orders with product lines still outstanding, within reach of the warehouse view. */
export async function listReceivablePurchaseOrders() {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const orders = await prisma.purchaseOrder.findMany({
    where: { ...reach, status: { in: RECEIVABLE_PO_STATUSES }, lines: { some: { productId: { not: null } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, number: true, status: true, expectedDate: true, currency: true, exchangeRate: true, supplier: { select: { name: true } }, lines: { where: { productId: { not: null } }, select: { id: true, description: true, quantity: true, receivedQuantity: true, unitCost: true, product: { select: { id: true, name: true, sku: true, serialised: true } } } } },
  });
  return orders.map((o: (typeof orders)[number]) => ({
    ...o,
    lines: o.lines.map((l: (typeof o.lines)[number]) => ({ ...l, quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity), unitCost: Number(l.unitCost), remaining: remainingToReceive({ quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity) }) })),
  }));
}

export type ReceiveFinishedUnitsInput = { purchaseOrderLineId: string; locationId: string; serials: string; configurationId?: string; quantity?: number };

/** Book serials of a finished imported product into a location against one purchase order line. */
export async function receiveFinishedUnits(input: ReceiveFinishedUnitsInput): Promise<{ count: number; purchaseOrderId: string }> {
  const user = await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const line = await prisma.purchaseOrderLine.findFirst({
    where: { id: input.purchaseOrderLineId, purchaseOrder: reach },
    select: { id: true, quantity: true, receivedQuantity: true, unitCost: true, productId: true, product: { select: { id: true, name: true, serialised: true } }, purchaseOrder: { select: { id: true, number: true, status: true, branchId: true, currency: true, exchangeRate: true, lines: { select: { id: true, quantity: true, receivedQuantity: true } } } } },
  });
  if (!line || !line.productId || !line.product) throw new WarehouseError('That purchase order line is not a finished product — components are received in the Store.');
  const po = line.purchaseOrder;
  await authorize('warehouse.fg.operate', { branchId: po.branchId, homeBranch: true }, 'finished_unit.receive', 'Only finished goods staff can receive units.');
  if (!(RECEIVABLE_PO_STATUSES as string[]).includes(po.status)) throw new WarehouseError(`Purchase order ${po.number} is ${po.status.toLowerCase().replace(/_/g, ' ')} — nothing more can be received against it.`);
  const location = await prisma.fgLocation.findFirst({ where: { id: input.locationId, isActive: true, branchId: po.branchId }, select: { id: true, name: true } });
  if (!location) throw new WarehouseError('Choose an active location at the branch the order belongs to.');
  const serials = line.product.serialised ? parseSerials(input.serials) : [];
  const quantity = line.product.serialised ? serials.length : Math.round(Number(input.quantity ?? 0));
  if (line.product.serialised && serials.length === 0) throw new WarehouseError('Paste the serial numbers, one per line.');
  for (const s of serials) { const p = serialProblem(s); if (p) throw new WarehouseError(p); }
  const q = receiptQuantityProblem({ quantity: Number(line.quantity), receivedQuantity: Number(line.receivedQuantity) }, quantity);
  if (q) throw new WarehouseError(q);
  if (serials.length) {
    const dup = await prisma.finishedUnit.findMany({ where: { serialNumber: { in: serials } }, select: { serialNumber: true }, take: 5 });
    if (dup.length) throw new WarehouseError(`Already on record: ${dup.map((d: { serialNumber: string }) => d.serialNumber).join(', ')}. A serial is booked in once.`);
  }
  const configurationId = input.configurationId ? (await prisma.productConfiguration.findFirst({ where: { id: input.configurationId, productId: line.productId }, select: { id: true } }))?.id ?? null : null;
  const costPrice = n2(Number(line.unitCost) * (po.currency === 'NGN' ? 1 : Number(po.exchangeRate ?? 0) || 1));
  const created = await prisma.$transaction(async (tx) => {
    const units = serials.length
      ? await Promise.all(serials.map((serialNumber) => tx.finishedUnit.create({ data: { serialNumber, productId: line.productId!, configurationId, locationId: location.id, status: 'IN_STOCK', costPrice }, select: { id: true, serialNumber: true } })))
      : [];
    stillAsSeen(await tx.purchaseOrderLine.updateMany({ where: { id: line.id, receivedQuantity: line.receivedQuantity }, data: { receivedQuantity: { increment: quantity } } }));
    const lines = po.lines.map((l: { id: string; quantity: unknown; receivedQuantity: unknown }) => ({ quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity) + (l.id === line.id ? quantity : 0) }));
    const next = statusAfterReceipt(po.status as never, lines);
    if (next !== po.status) stillAsSeen(await tx.purchaseOrder.updateMany({ where: { id: po.id, status: po.status }, data: { status: next } }));
    return units;
  });
  await Promise.all(created.map((u) => audit(user.id, 'FinishedUnit', u.id, 'finished_unit.received', { serialNumber: u.serialNumber, referenceNumber: po.number, product: line.product!.name, location: location.name })));
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.goods_received', { referenceNumber: po.number, product: line.product.name, quantity, location: location.name, serials: serials.slice(0, 50) });
  return { count: quantity, purchaseOrderId: po.id };
}

// ── Incoming QC on goods receipts ─────────────────────────────────────────

export async function listReceiptsAwaitingInspection() {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  return prisma.goodsReceipt.findMany({
    where: { ...reach, inspection: null },
    orderBy: { receivedAt: 'desc' },
    take: 100,
    select: { id: true, referenceNumber: true, supplierName: true, receivedAt: true, purchaseOrder: { select: { id: true, number: true } }, receivedBy: { select: { fullName: true } }, lines: { select: { id: true, quantityInBaseUnit: true, part: { select: { name: true } } } } },
  });
}

export async function listRecentInspections() {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const rows = await prisma.incomingInspection.findMany({
    where: { goodsReceipt: reach },
    orderBy: { inspectedAt: 'desc' },
    take: 50,
    select: { id: true, inspectedAt: true, inspectedById: true, sampleSize: true, defects: true, passed: true, quarantined: true, notes: true, goodsReceipt: { select: { id: true, referenceNumber: true, supplierName: true, purchaseOrder: { select: { id: true, number: true } } } } },
  });
  const names = await userNames(rows.map((r: { inspectedById: string }) => r.inspectedById));
  return rows.map((r: (typeof rows)[number]) => ({ ...r, inspectedBy: nameOf(names, r.inspectedById) }));
}

export async function recordIncomingInspection(input: { goodsReceiptId: string; sampleSize: number; defects: number; passed: boolean; quarantined: boolean; notes?: string }): Promise<void> {
  const user = await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const grn = await prisma.goodsReceipt.findFirst({ where: { id: input.goodsReceiptId, ...reach }, select: { id: true, branchId: true, referenceNumber: true, inspection: { select: { id: true } }, purchaseOrder: { select: { id: true, number: true } } } });
  if (!grn) throw new WarehouseError(NOT_AVAILABLE);
  await authorize('warehouse.parts.operate', { branchId: grn.branchId, homeBranch: true }, 'incoming_inspection.record', 'Only the components warehouse records incoming QC.');
  if (grn.inspection) throw new WarehouseError('This receipt has already been inspected.');
  const problem = inspectionProblem({ sampleSize: input.sampleSize, defects: input.defects });
  if (problem) throw new WarehouseError(problem);
  if (!input.passed && !input.quarantined && !input.notes?.trim()) throw new WarehouseError('A failed inspection needs a note on what happens next (quarantine, claim, rework).');
  const row = await prisma.incomingInspection.create({ data: { goodsReceiptId: grn.id, inspectedById: user.id, sampleSize: input.sampleSize, defects: input.defects, passed: input.passed, quarantined: input.quarantined, notes: input.notes?.trim() || null } });
  await audit(user.id, 'GoodsReceipt', grn.id, input.passed ? 'incoming_inspection.passed' : 'incoming_inspection.failed', { referenceNumber: grn.referenceNumber, inspectionId: row.id, sampleSize: input.sampleSize, defects: input.defects, quarantined: input.quarantined, purchaseOrder: grn.purchaseOrder?.number });
}

// ── Stock transfers ───────────────────────────────────────────────────────

function transferReach(reach: { branchId?: string | { in: string[] } }) {
  return { OR: [{ fromLocation: reach }, { toLocation: reach }] };
}

export async function listTransfers(status?: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const s = ['DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED'].includes(status ?? '') ? (status as 'DRAFT') : undefined;
  return prisma.stockTransfer.findMany({
    where: { ...transferReach(reach), ...(s ? { status: s } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, number: true, status: true, reason: true, createdAt: true, dispatchedAt: true, receivedAt: true, fromLocation: { select: { name: true, branch: { select: { name: true } } } }, toLocation: { select: { name: true, branch: { select: { name: true } } } }, requestedBy: { select: { fullName: true } }, _count: { select: { lines: true } } },
  });
}

export async function getTransfer(transferId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const t = await prisma.stockTransfer.findFirst({
    where: { id: transferId, ...transferReach(reach) },
    include: {
      fromLocation: { select: { id: true, name: true, kind: true, branchId: true, isActive: true, branch: { select: { name: true } } } },
      toLocation: { select: { id: true, name: true, kind: true, branchId: true, isActive: true, branch: { select: { name: true } } } },
      requestedBy: { select: { id: true, fullName: true } },
      lines: { include: { product: { select: { id: true, name: true, sku: true } }, finishedUnit: { select: { id: true, serialNumber: true, status: true, locationId: true, configuration: { select: { name: true } } } } }, orderBy: { id: 'asc' } },
    },
  });
  if (!t) return null;
  const approval = await prisma.auditLog.findFirst({ where: { entityType: 'StockTransfer', entityId: t.id, action: 'stock_transfer.approved' }, orderBy: { createdAt: 'desc' }, select: { userId: true, createdAt: true } });
  const names = await userNames([t.dispatchedById, t.receivedById, approval?.userId]);
  const needsApproval = transferNeedsApproval(t.fromLocation, t.toLocation);
  return { ...t, needsApproval, approved: Boolean(approval), approvedBy: nameOf(names, approval?.userId), approvedAt: approval?.createdAt ?? null, dispatchedBy: nameOf(names, t.dispatchedById), receivedBy: nameOf(names, t.receivedById) };
}

export async function getTransferAuditTrail(transferId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const visibleId = (await prisma.stockTransfer.findFirst({ where: { id: transferId, ...transferReach(reach) }, select: { id: true } }))?.id ?? '__no_access__';
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'StockTransfer', entityId: visibleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const names = await userNames(entries.map((e: { userId: string | null }) => e.userId));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(nameOf(names, e.userId), e.metadata) : null }));
}

/** Units in stock at a location (optionally one product) that a transfer may take. */
export async function listAvailableUnitsForTransfer(locationId: string, productId?: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  return prisma.finishedUnit.findMany({
    where: { locationId, location: reach, status: 'IN_STOCK', ...(productId ? { productId } : {}) },
    orderBy: [{ product: { name: 'asc' } }, { serialNumber: 'asc' }],
    take: 200,
    select: { id: true, serialNumber: true, product: { select: { id: true, name: true, sku: true } }, configuration: { select: { name: true } } },
  });
}

export async function createTransfer(input: { fromLocationId: string; toLocationId: string; reason?: string; unitIds: string[] }): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const unitIds = [...new Set(input.unitIds.filter(Boolean))];
  const [from, to] = await Promise.all([
    prisma.fgLocation.findFirst({ where: { id: input.fromLocationId, ...reach }, select: { id: true, name: true, branchId: true, isActive: true } }),
    prisma.fgLocation.findFirst({ where: { id: input.toLocationId, ...reach }, select: { id: true, name: true, branchId: true, isActive: true } }),
  ]);
  if (!from || !to) throw new WarehouseError('Choose where the units come from and where they are going.');
  await authorize('warehouse.fg.operate', { branchId: from.branchId, homeBranch: true }, 'stock_transfer.create', 'Only finished goods staff at the sending branch can start a transfer.');
  const problem = transferProblem({ fromLocationId: from.id, toLocationId: to.id, unitIds, fromActive: from.isActive, toActive: to.isActive });
  if (problem) throw new WarehouseError(problem);
  const units = await prisma.finishedUnit.findMany({ where: { id: { in: unitIds }, locationId: from.id, status: 'IN_STOCK' }, select: { id: true, productId: true, serialNumber: true } });
  if (units.length !== unitIds.length) throw new WarehouseError('Some of those units are no longer in stock at that location — refresh and pick again.');
  const number = await nextDocumentNumber('TRF', await organisationOfBranch(from.branchId));
  const t = await prisma.$transaction(async (tx) => {
    const created = await tx.stockTransfer.create({ data: { number, fromLocationId: from.id, toLocationId: to.id, reason: input.reason?.trim() || null, requestedById: user.id, lines: { create: units.map((u) => ({ productId: u.productId, finishedUnitId: u.id, quantity: 1 })) } }, select: { id: true } });
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: { in: unitIds }, status: 'IN_STOCK', locationId: from.id }, data: { status: 'RESERVED' } }), undefined, unitIds.length);
    return created;
  });
  await audit(user.id, 'StockTransfer', t.id, 'stock_transfer.created', { referenceNumber: number, from: from.name, to: to.name, units: units.length, crossBranch: transferNeedsApproval(from, to) });
  await Promise.all(units.map((u) => audit(user.id, 'FinishedUnit', u.id, 'finished_unit.reserved_for_transfer', { serialNumber: u.serialNumber, referenceNumber: number, to: to.name })));
  return { id: t.id, number };
}

async function transferForChange(transferId: string) {
  const reach = await reachWhere('warehouse.view', { lens: false });
  const t = await prisma.stockTransfer.findFirst({ where: { id: transferId, ...transferReach(reach) }, select: { id: true, number: true, status: true, requestedById: true, fromLocation: { select: { id: true, name: true, branchId: true } }, toLocation: { select: { id: true, name: true, branchId: true, isActive: true } }, lines: { select: { finishedUnitId: true } } } });
  if (!t) throw new WarehouseError(NOT_AVAILABLE);
  return { ...t, unitIds: t.lines.map((l) => l.finishedUnitId).filter((x): x is string => Boolean(x)) };
}

export async function approveTransfer(transferId: string): Promise<void> {
  await refuseDuringAssist('approveTransfer');
  const user = await requireUser();
  const t = await transferForChange(transferId);
  await authorize('warehouse.manage', { branchId: t.fromLocation.branchId, homeBranch: true }, 'stock_transfer.approve', 'Only the Warehouse Manager approves transfers between branches.');
  if (t.status !== 'DRAFT') throw new WarehouseError('Only a draft transfer can be approved.');
  if (t.requestedById === user.id && !(await getPrincipal()).isSuperAdmin) throw new WarehouseError('The person who raised the transfer cannot approve it.');
  if (!transferNeedsApproval(t.fromLocation, t.toLocation)) throw new WarehouseError('A transfer within one branch needs no approval.');
  await audit(user.id, 'StockTransfer', t.id, 'stock_transfer.approved', { referenceNumber: t.number });
}

export async function dispatchTransfer(transferId: string): Promise<void> {
  const user = await requireUser();
  const t = await transferForChange(transferId);
  await authorize('warehouse.fg.operate', { branchId: t.fromLocation.branchId, homeBranch: true }, 'stock_transfer.dispatch', 'Only finished goods staff at the sending branch can dispatch a transfer.');
  const needsApproval = transferNeedsApproval(t.fromLocation, t.toLocation);
  const approved = needsApproval ? Boolean(await prisma.auditLog.findFirst({ where: { entityType: 'StockTransfer', entityId: t.id, action: 'stock_transfer.approved' }, select: { id: true } })) : false;
  const check = canDispatchTransfer({ status: t.status as 'DRAFT', needsApproval, approved });
  if (!check.ok) throw new WarehouseError(check.why!);
  stillAsSeen(await prisma.stockTransfer.updateMany({ where: { id: t.id, status: 'DRAFT' }, data: { status: 'DISPATCHED', dispatchedById: user.id, dispatchedAt: new Date() } }));
  await audit(user.id, 'StockTransfer', t.id, 'stock_transfer.dispatched', { referenceNumber: t.number, units: t.unitIds.length });
}

export async function receiveTransfer(transferId: string): Promise<void> {
  const user = await requireUser();
  const t = await transferForChange(transferId);
  await authorize('warehouse.fg.operate', { branchId: t.toLocation.branchId, homeBranch: true }, 'stock_transfer.receive', 'Only finished goods staff at the receiving branch can receive a transfer.');
  if (t.status !== 'DISPATCHED') throw new WarehouseError('Only a transfer on its way can be received.');
  if (!t.toLocation.isActive) throw new WarehouseError('The destination location has been retired — ask the Warehouse Manager.');
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.stockTransfer.updateMany({ where: { id: t.id, status: 'DISPATCHED' }, data: { status: 'RECEIVED', receivedById: user.id, receivedAt: new Date() } }));
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: { in: t.unitIds }, status: 'RESERVED', locationId: t.fromLocation.id }, data: { status: 'IN_STOCK', locationId: t.toLocation.id } }), 'Some units on this transfer have changed since it left — refresh the page.', t.unitIds.length);
  });
  await audit(user.id, 'StockTransfer', t.id, 'stock_transfer.received', { referenceNumber: t.number, units: t.unitIds.length, to: t.toLocation.name });
  await Promise.all(t.unitIds.map((id) => audit(user.id, 'FinishedUnit', id, 'finished_unit.moved', { referenceNumber: t.number, from: t.fromLocation.name, to: t.toLocation.name })));
}

export async function cancelTransfer(transferId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const t = await transferForChange(transferId);
  await authorize(t.status === 'DISPATCHED' ? 'warehouse.manage' : 'warehouse.fg.operate', { branchId: t.fromLocation.branchId, homeBranch: true }, 'stock_transfer.cancel', t.status === 'DISPATCHED' ? 'Only the Warehouse Manager can cancel a transfer that has already left.' : 'Only finished goods staff at the sending branch can cancel a transfer.');
  if (!['DRAFT', 'DISPATCHED'].includes(t.status)) throw new WarehouseError('This transfer can no longer be cancelled.');
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.stockTransfer.updateMany({ where: { id: t.id, status: t.status }, data: { status: 'CANCELLED' } }));
    await tx.finishedUnit.updateMany({ where: { id: { in: t.unitIds }, status: 'RESERVED', locationId: t.fromLocation.id }, data: { status: 'IN_STOCK' } });
  });
  await audit(user.id, 'StockTransfer', t.id, 'stock_transfer.cancelled', { referenceNumber: t.number, reason: reason.trim() || undefined });
}

// ── Goods release notes (picking) ─────────────────────────────────────────

export async function listReleases(status?: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const s = ['ISSUED', 'PICKED', 'RELEASED', 'CANCELLED'].includes(status ?? '') ? (status as 'ISSUED') : undefined;
  return prisma.goodsReleaseNote.findMany({
    where: { salesOrder: reach, ...(s ? { status: s } : { status: { in: ['ISSUED', 'PICKED', 'RELEASED'] } }) },
    orderBy: { issuedAt: 'desc' },
    take: 100,
    select: { id: true, number: true, status: true, issuedAt: true, pickedAt: true, releasedAt: true, salesOrder: { select: { id: true, number: true, channel: true, customer: { select: { fullName: true } } } }, dispatch: { select: { id: true, number: true, status: true } }, lines: { select: { id: true, finishedUnitId: true, quantity: true, salesOrderLine: { select: { product: { select: { serialised: true } } } } } } },
  });
}

export async function getRelease(releaseId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const r = await prisma.goodsReleaseNote.findFirst({
    where: { id: releaseId, salesOrder: reach },
    include: {
      salesOrder: { select: { id: true, number: true, status: true, branchId: true, channel: true, deliveryAddress: true, customerReference: true, customer: { select: { id: true, fullName: true, phone: true, email: true } }, branch: { select: { name: true } } } },
      dispatch: { select: { id: true, number: true, status: true, dispatchedAt: true, deliveredAt: true } },
      lines: { include: { salesOrderLine: { select: { id: true, description: true, quantity: true, productId: true, configurationId: true, product: { select: { id: true, name: true, sku: true, serialised: true } }, configuration: { select: { id: true, name: true } } } }, finishedUnit: { select: { id: true, serialNumber: true, status: true, location: { select: { name: true } } } } }, orderBy: { id: 'asc' } },
    },
  });
  if (!r) return null;
  const names = await userNames([r.clearedById, r.issuedById, r.pickedById, r.releasedById]);
  return { ...r, clearedBy: nameOf(names, r.clearedById), issuedBy: nameOf(names, r.issuedById), pickedBy: nameOf(names, r.pickedById), releasedBy: nameOf(names, r.releasedById) };
}

export async function getReleaseAuditTrail(releaseId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const visibleId = (await prisma.goodsReleaseNote.findFirst({ where: { id: releaseId, salesOrder: reach }, select: { id: true } }))?.id ?? '__no_access__';
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'GoodsReleaseNote', entityId: visibleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const names = await userNames(entries.map((e: { userId: string | null }) => e.userId));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(nameOf(names, e.userId), e.metadata) : null }));
}

/** Units a release line may take: in stock at the order's branch, or reserved for this very order. */
export async function listPickableUnits(releaseLineId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const line = await prisma.releaseLine.findFirst({ where: { id: releaseLineId, releaseNote: { salesOrder: reach } }, select: { salesOrderLine: { select: { productId: true, configurationId: true } }, releaseNote: { select: { salesOrder: { select: { id: true, branchId: true } } } } } });
  if (!line) return [];
  const so = line.releaseNote.salesOrder;
  return prisma.finishedUnit.findMany({
    where: {
      productId: line.salesOrderLine.productId,
      location: { branchId: so.branchId, isActive: true },
      AND: [{ OR: [{ status: 'IN_STOCK' }, { status: 'RESERVED', salesOrderId: so.id }] }, ...(line.salesOrderLine.configurationId ? [{ OR: [{ configurationId: line.salesOrderLine.configurationId }, { configurationId: null }] }] : [])],
    },
    orderBy: [{ status: 'desc' }, { receivedAt: 'asc' }],
    take: 100,
    select: { id: true, serialNumber: true, status: true, location: { select: { name: true } }, configuration: { select: { name: true } } },
  });
}

async function releaseForChange(releaseId: string) {
  const reach = await reachWhere('warehouse.view', { lens: false });
  const r = await prisma.goodsReleaseNote.findFirst({ where: { id: releaseId, salesOrder: reach }, select: { id: true, number: true, status: true, salesOrderId: true, salesOrder: { select: { branchId: true, number: true, status: true, customerId: true } }, lines: { select: { id: true, finishedUnitId: true, salesOrderLine: { select: { productId: true, configurationId: true, product: { select: { serialised: true } } } } } } } });
  if (!r) throw new WarehouseError(NOT_AVAILABLE);
  return r;
}

const pickLinesOf = (r: Awaited<ReturnType<typeof releaseForChange>>) =>
  r.lines.map((l) => ({ id: l.id, productId: l.salesOrderLine.productId, configurationId: l.salesOrderLine.configurationId, serialised: l.salesOrderLine.product.serialised, finishedUnitId: l.finishedUnitId }));

export async function pickReleaseLine(releaseLineId: string, unitId: string): Promise<void> {
  const user = await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const lineRow = await prisma.releaseLine.findFirst({ where: { id: releaseLineId, releaseNote: { salesOrder: reach } }, select: { releaseNoteId: true, salesOrderLineId: true } });
  if (!lineRow) throw new WarehouseError(NOT_AVAILABLE);
  const r = await releaseForChange(lineRow.releaseNoteId);
  await authorize('warehouse.fg.operate', { branchId: r.salesOrder.branchId, homeBranch: true }, 'release.pick', 'Only finished goods staff can pick units.');
  if (!['ISSUED', 'PICKED'].includes(r.status)) throw new WarehouseError(`Release note ${r.number} is ${r.status.toLowerCase()} — nothing more to pick.`);
  const line = pickLinesOf(r).find((l) => l.id === releaseLineId)!;
  const unit = await prisma.finishedUnit.findFirst({ where: { id: unitId, location: { isActive: true } }, select: { id: true, serialNumber: true, productId: true, configurationId: true, status: true, salesOrderId: true, location: { select: { branchId: true } } } });
  if (!unit) throw new WarehouseError('That unit is no longer available.');
  const problem = pickProblem(line, { id: unit.id, productId: unit.productId, configurationId: unit.configurationId, status: unit.status as UnitStatus, branchId: unit.location.branchId, salesOrderId: unit.salesOrderId }, { branchId: r.salesOrder.branchId, salesOrderId: r.salesOrderId });
  if (problem) throw new WarehouseError(problem);
  const allPicked = releaseReadyToRelease(pickLinesOf(r).map((l) => (l.id === line.id ? { ...l, finishedUnitId: unit.id } : l)));
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: unit.id, status: unit.status }, data: { status: 'PICKED', salesOrderId: r.salesOrderId, salesOrderLineId: lineRow.salesOrderLineId } }), 'That unit was just taken by someone else — pick another.');
    stillAsSeen(await tx.releaseLine.updateMany({ where: { id: releaseLineId, finishedUnitId: null }, data: { finishedUnitId: unit.id } }), 'This line was just picked by someone else.');
    if (allPicked && r.status === 'ISSUED') stillAsSeen(await tx.goodsReleaseNote.updateMany({ where: { id: r.id, status: 'ISSUED' }, data: { status: 'PICKED', pickedById: user.id, pickedAt: new Date() } }));
  });
  await audit(user.id, 'GoodsReleaseNote', r.id, allPicked ? 'release.picked' : 'release.line_picked', { referenceNumber: r.number, serialNumber: unit.serialNumber, salesOrder: r.salesOrder.number });
  await audit(user.id, 'FinishedUnit', unit.id, 'finished_unit.picked', { serialNumber: unit.serialNumber, referenceNumber: r.number, salesOrder: r.salesOrder.number });
}

export async function unpickReleaseLine(releaseLineId: string): Promise<void> {
  const user = await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const lineRow = await prisma.releaseLine.findFirst({ where: { id: releaseLineId, releaseNote: { salesOrder: reach } }, select: { releaseNoteId: true, finishedUnitId: true, finishedUnit: { select: { serialNumber: true } } } });
  if (!lineRow) throw new WarehouseError(NOT_AVAILABLE);
  const r = await releaseForChange(lineRow.releaseNoteId);
  await authorize('warehouse.fg.operate', { branchId: r.salesOrder.branchId, homeBranch: true }, 'release.unpick', 'Only finished goods staff can change a pick.');
  if (!['ISSUED', 'PICKED'].includes(r.status)) throw new WarehouseError('This release note can no longer be changed.');
  if (!lineRow.finishedUnitId) throw new WarehouseError('Nothing is picked on this line.');
  const unitId = lineRow.finishedUnitId;
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.releaseLine.updateMany({ where: { id: releaseLineId, finishedUnitId: unitId }, data: { finishedUnitId: null } }));
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: unitId, status: 'PICKED' }, data: { status: 'IN_STOCK', salesOrderId: null, salesOrderLineId: null } }));
    if (r.status === 'PICKED') stillAsSeen(await tx.goodsReleaseNote.updateMany({ where: { id: r.id, status: 'PICKED' }, data: { status: 'ISSUED', pickedById: null, pickedAt: null } }));
  });
  await audit(user.id, 'GoodsReleaseNote', r.id, 'release.line_unpicked', { referenceNumber: r.number, serialNumber: lineRow.finishedUnit?.serialNumber });
  await audit(user.id, 'FinishedUnit', unitId, 'finished_unit.unpicked', { serialNumber: lineRow.finishedUnit?.serialNumber, referenceNumber: r.number });
}

/** Every line picked: the goods leave the stock ledger and the sales order moves to RELEASED. */
export async function releaseGoods(releaseId: string): Promise<void> {
  await refuseDuringAssist('releaseGoods');
  const user = await requireUser();
  const r = await releaseForChange(releaseId);
  await authorize('warehouse.fg.operate', { branchId: r.salesOrder.branchId, homeBranch: true }, 'release.release', 'Only finished goods staff can release goods.');
  if (r.status !== 'PICKED') throw new WarehouseError(r.status === 'ISSUED' ? 'Pick a unit for every line first.' : `Release note ${r.number} is already ${r.status.toLowerCase()}.`);
  if (!releaseReadyToRelease(pickLinesOf(r))) throw new WarehouseError('Pick a unit for every line first.');
  const unitIds = r.lines.map((l) => l.finishedUnitId).filter((x): x is string => Boolean(x));
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.goodsReleaseNote.updateMany({ where: { id: r.id, status: 'PICKED' }, data: { status: 'RELEASED', releasedById: user.id, releasedAt: new Date() } }));
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: { in: unitIds }, status: 'PICKED' }, data: { status: 'RELEASED' } }), 'A picked unit has changed since — refresh the page.', unitIds.length);
    // The order follows when it is still waiting at READY; a later state (another release already moved it) is left alone.
    await tx.salesOrder.updateMany({ where: { id: r.salesOrderId, status: 'READY' }, data: { status: 'RELEASED' } });
  });
  await audit(user.id, 'GoodsReleaseNote', r.id, 'release.released', { referenceNumber: r.number, salesOrder: r.salesOrder.number, units: unitIds.length });
  await audit(user.id, 'SalesOrder', r.salesOrderId, 'sales_order.goods_released', { referenceNumber: r.salesOrder.number, releaseNote: r.number });
  await Promise.all(unitIds.map((id) => audit(user.id, 'FinishedUnit', id, 'finished_unit.released', { referenceNumber: r.number, salesOrder: r.salesOrder.number })));
}

// ── Dispatch and delivery ─────────────────────────────────────────────────

export async function listDispatches(status?: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const s = ['DISPATCHED', 'DELIVERED', 'FAILED'].includes(status ?? '') ? (status as 'DISPATCHED') : undefined;
  return prisma.dispatch.findMany({
    where: { salesOrder: reach, ...(s ? { status: s } : {}) },
    orderBy: { dispatchedAt: 'desc' },
    take: 100,
    select: { id: true, number: true, status: true, dispatchedAt: true, deliveredAt: true, vehiclePlate: true, driverName: true, carrier: true, waybill: true, receivedByName: true, salesOrder: { select: { id: true, number: true, customer: { select: { fullName: true } } } }, releaseNote: { select: { id: true, number: true } }, _count: { select: { units: true } } },
  });
}

export async function getDispatch(dispatchId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const d = await prisma.dispatch.findFirst({
    where: { id: dispatchId, salesOrder: reach },
    include: {
      salesOrder: { select: { id: true, number: true, status: true, branchId: true, deliveryAddress: true, customerReference: true, customer: { select: { id: true, fullName: true, phone: true, email: true } }, branch: { select: { name: true } } } },
      releaseNote: { select: { id: true, number: true, status: true } },
      units: { select: { id: true, serialNumber: true, status: true, product: { select: { name: true, sku: true } }, configuration: { select: { name: true } } }, orderBy: { serialNumber: 'asc' } },
    },
  });
  if (!d) return null;
  const names = await userNames([d.dispatchedById]);
  return { ...d, dispatchedBy: nameOf(names, d.dispatchedById) };
}

export async function getDispatchAuditTrail(dispatchId: string) {
  await requireUser();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const visibleId = (await prisma.dispatch.findFirst({ where: { id: dispatchId, salesOrder: reach }, select: { id: true } }))?.id ?? '__no_access__';
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'Dispatch', entityId: visibleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const names = await userNames(entries.map((e: { userId: string | null }) => e.userId));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(nameOf(names, e.userId), e.metadata) : null }));
}

export type CreateDispatchInput = { releaseNoteId: string; vehiclePlate?: string; driverName?: string; driverPhone?: string; carrier?: string; waybill?: string };

export async function createDispatch(input: CreateDispatchInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const r = await releaseForChange(input.releaseNoteId);
  await authorize('warehouse.dispatch', { branchId: r.salesOrder.branchId, homeBranch: true }, 'dispatch.create', 'Only the dispatch desk can send goods out.');
  const existing = await prisma.dispatch.findUnique({ where: { releaseNoteId: r.id }, select: { id: true } });
  const problem = dispatchProblem({ releaseStatus: r.status as 'RELEASED', hasDispatch: Boolean(existing), driverName: input.driverName ?? '', vehiclePlate: input.vehiclePlate ?? '', carrier: input.carrier ?? '' });
  if (problem) throw new WarehouseError(problem);
  const unitIds = r.lines.map((l) => l.finishedUnitId).filter((x): x is string => Boolean(x));
  const number = await nextDocumentNumber('DSP', await organisationOfBranch(r.salesOrder.branchId));
  const clean = (s?: string) => s?.trim().slice(0, 120) || null;
  const d = await prisma.$transaction(async (tx) => {
    const created = await tx.dispatch.create({ data: { number, releaseNoteId: r.id, salesOrderId: r.salesOrderId, dispatchedById: user.id, vehiclePlate: clean(input.vehiclePlate)?.toUpperCase() ?? null, driverName: clean(input.driverName), driverPhone: clean(input.driverPhone), carrier: clean(input.carrier), waybill: clean(input.waybill) }, select: { id: true } });
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: { in: unitIds }, status: 'RELEASED' }, data: { status: 'DISPATCHED', dispatchId: created.id } }), 'A unit on this release has changed since — refresh the page.', unitIds.length);
    await tx.salesOrder.updateMany({ where: { id: r.salesOrderId, status: 'RELEASED' }, data: { status: 'DISPATCHED' } });
    return created;
  });
  await audit(user.id, 'Dispatch', d.id, 'dispatch.created', { referenceNumber: number, releaseNote: r.number, salesOrder: r.salesOrder.number, units: unitIds.length, vehiclePlate: clean(input.vehiclePlate), driverName: clean(input.driverName), carrier: clean(input.carrier), waybill: clean(input.waybill) });
  await audit(user.id, 'SalesOrder', r.salesOrderId, 'sales_order.dispatched', { referenceNumber: r.salesOrder.number, dispatch: number });
  await Promise.all(unitIds.map((id) => audit(user.id, 'FinishedUnit', id, 'finished_unit.dispatched', { referenceNumber: number, salesOrder: r.salesOrder.number })));
  return { id: d.id, number };
}

async function dispatchForChange(dispatchId: string) {
  const reach = await reachWhere('warehouse.view', { lens: false });
  const d = await prisma.dispatch.findFirst({ where: { id: dispatchId, salesOrder: reach }, select: { id: true, number: true, status: true, salesOrderId: true, salesOrder: { select: { branchId: true, number: true, customerId: true } }, units: { select: { id: true } } } });
  if (!d) throw new WarehouseError(NOT_AVAILABLE);
  return d;
}

/** The customer (or TD Africa) signed for the goods: the serials are sold from today. */
export async function recordDelivery(dispatchId: string, input: { deliveredAt?: Date; receivedByName: string; notes?: string }): Promise<void> {
  const user = await requireUser();
  const d = await dispatchForChange(dispatchId);
  await authorize('warehouse.dispatch', { branchId: d.salesOrder.branchId, homeBranch: true }, 'dispatch.deliver', 'Only the dispatch desk records deliveries.');
  if (d.status !== 'DISPATCHED') throw new WarehouseError(`Dispatch ${d.number} is already ${d.status.toLowerCase()}.`);
  if (input.receivedByName.trim().length < 2) throw new WarehouseError('Name the person who signed for the goods.');
  const deliveredAt = input.deliveredAt && !Number.isNaN(input.deliveredAt.getTime()) ? input.deliveredAt : new Date();
  if (deliveredAt.getTime() > Date.now() + 5 * 60_000) throw new WarehouseError('The delivery time cannot be in the future.');
  const unitIds = d.units.map((u) => u.id);
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.dispatch.updateMany({ where: { id: d.id, status: 'DISPATCHED' }, data: { status: 'DELIVERED', deliveredAt, receivedByName: input.receivedByName.trim().slice(0, 120), deliveryNotes: input.notes?.trim().slice(0, 1000) || null } }));
    stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: { in: unitIds }, status: 'DISPATCHED', dispatchId: d.id }, data: { status: 'SOLD', soldAt: deliveredAt, customerId: d.salesOrder.customerId } }), 'A unit on this dispatch has changed since — refresh the page.', unitIds.length);
    await tx.salesOrder.updateMany({ where: { id: d.salesOrderId, status: 'DISPATCHED' }, data: { status: 'DELIVERED' } });
  });
  await audit(user.id, 'Dispatch', d.id, 'dispatch.delivered', { referenceNumber: d.number, receivedByName: input.receivedByName.trim(), units: unitIds.length });
  await audit(user.id, 'SalesOrder', d.salesOrderId, 'sales_order.delivered', { referenceNumber: d.salesOrder.number, dispatch: d.number });
  await Promise.all(unitIds.map((id) => audit(user.id, 'FinishedUnit', id, 'finished_unit.sold', { referenceNumber: d.number, salesOrder: d.salesOrder.number, soldAt: deliveredAt.toISOString() })));
}

/** The goods came back undelivered: the units are back at the warehouse, released and waiting for another dispatch. */
export async function markDispatchFailed(dispatchId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const d = await dispatchForChange(dispatchId);
  await authorize('warehouse.dispatch', { branchId: d.salesOrder.branchId, homeBranch: true }, 'dispatch.fail', 'Only the dispatch desk records a failed delivery.');
  if (d.status !== 'DISPATCHED') throw new WarehouseError(`Dispatch ${d.number} is already ${d.status.toLowerCase()}.`);
  if (reason.trim().length < 3) throw new WarehouseError('Say why the goods were not delivered.');
  const unitIds = d.units.map((u) => u.id);
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.dispatch.updateMany({ where: { id: d.id, status: 'DISPATCHED' }, data: { status: 'FAILED', deliveryNotes: reason.trim().slice(0, 1000) } }));
    await tx.finishedUnit.updateMany({ where: { id: { in: unitIds }, status: 'DISPATCHED', dispatchId: d.id }, data: { status: 'RELEASED', dispatchId: null } });
    await tx.salesOrder.updateMany({ where: { id: d.salesOrderId, status: 'DISPATCHED' }, data: { status: 'RELEASED' } });
  });
  await audit(user.id, 'Dispatch', d.id, 'dispatch.failed', { referenceNumber: d.number, reason: reason.trim(), units: unitIds.length });
}

// ── Home, glance and dashboard ────────────────────────────────────────────

export async function getWarehouseHome() {
  await requireUser();
  const reach = await reachWhere('warehouse.view');
  const dayStart = lagosDay();
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [byFamily, byLocation, reserved, picked, toPick, dispatchedToday, awaitingQc, transfersOpen, quarantine] = await Promise.all([
    prisma.finishedUnit.findMany({ where: { location: reach, status: 'IN_STOCK' }, select: { product: { select: { family: true } } }, take: 5000 }),
    prisma.fgLocation.findMany({ where: { ...reach, isActive: true }, select: { id: true, name: true, kind: true, branch: { select: { name: true } }, _count: { select: { units: { where: { status: 'IN_STOCK' } } } } }, orderBy: { name: 'asc' } }),
    n(prisma.finishedUnit.count({ where: { location: reach, status: 'RESERVED' } })),
    n(prisma.finishedUnit.count({ where: { location: reach, status: { in: ['PICKED', 'RELEASED'] } } })),
    n(prisma.goodsReleaseNote.count({ where: { salesOrder: reach, status: 'ISSUED' } })),
    n(prisma.dispatch.count({ where: { salesOrder: reach, dispatchedAt: { gte: dayStart, lt: dayEnd } } })),
    n(prisma.goodsReceipt.count({ where: { ...reach, inspection: null } })),
    n(prisma.stockTransfer.count({ where: { ...transferReach(reach), status: { in: ['DRAFT', 'DISPATCHED'] } } })),
    n(prisma.finishedUnit.count({ where: { location: reach, status: 'QUARANTINE' } })),
  ]);
  return {
    inStock: byFamily.length,
    byFamily: tally(byFamily.map((u: { product: { family: string } }) => ({ key: u.product.family }))),
    byLocation: byLocation.map((l: (typeof byLocation)[number]) => ({ id: l.id, name: l.name, kind: l.kind, branch: l.branch.name, count: l._count.units })),
    reserved, picked, toPick, dispatchedToday, awaitingQc, transfersOpen, quarantine,
  };
}

export type WarehouseGlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

/** Counts for the dashboard's "At a glance", with the same reach as the lists. */
export async function getWarehouseGlance(): Promise<WarehouseGlanceTile[]> {
  if (!(await allows('warehouse.view'))) return [];
  const h = await getWarehouseHome();
  return [
    { label: 'Finished units in stock', value: h.inStock, hint: 'By serial, across your locations', href: '/warehouse/finished-goods', tone: 'success' },
    { label: 'Releases waiting to pick', value: h.toPick, hint: 'Cleared by Finance, not yet picked', href: '/warehouse/releases?status=ISSUED', tone: h.toPick ? 'warning' : 'muted' },
    { label: 'Dispatched today', value: h.dispatchedToday, hint: 'Left the warehouse today', href: '/warehouse/dispatches', tone: 'info' },
    { label: 'Receipts awaiting QC', value: h.awaitingQc, hint: 'Goods receipts not yet inspected', href: '/warehouse/incoming-qc', tone: h.awaitingQc ? 'warning' : 'muted' },
  ];
}

export type WarehouseDashboardItem = { id: string; title: string; detail: string; url: string; createdAt: Date };

/** What needs this person: transfers and adjustments to approve (Warehouse Manager), releases to pick, receipts due for QC. */
export async function getWarehouseDashboardItems(): Promise<WarehouseDashboardItem[]> {
  if (!(await allows('warehouse.view'))) return [];
  const user = await requireUser();
  const p = await getPrincipal();
  const reach = await reachWhere('warehouse.view', { lens: false });
  const [canManage, canFg, canParts] = await Promise.all([allows('warehouse.manage'), allows('warehouse.fg.operate'), allows('warehouse.parts.operate')]);
  const items: WarehouseDashboardItem[] = [];
  if (canManage) {
    const drafts = await prisma.stockTransfer.findMany({ where: { ...transferReach(reach), status: 'DRAFT' }, select: { id: true, number: true, createdAt: true, requestedById: true, fromLocation: { select: { name: true, branchId: true } }, toLocation: { select: { name: true, branchId: true } }, _count: { select: { lines: true } } }, orderBy: { createdAt: 'desc' }, take: 20 });
    const cross = drafts.filter((t: (typeof drafts)[number]) => transferNeedsApproval(t.fromLocation, t.toLocation) && (t.requestedById !== user.id || p.isSuperAdmin));
    const approved = cross.length ? new Set((await prisma.auditLog.findMany({ where: { entityType: 'StockTransfer', entityId: { in: cross.map((t: { id: string }) => t.id) }, action: 'stock_transfer.approved' }, select: { entityId: true } })).map((a: { entityId: string | null }) => a.entityId ?? '')) : new Set<string>();
    for (const t of cross) if (!approved.has(t.id)) items.push({ id: `transfer-approve-${t.id}`, title: `Approve transfer ${t.number}`, detail: `${t._count.lines} ${t._count.lines === 1 ? 'unit' : 'units'} · ${t.fromLocation.name} → ${t.toLocation.name}`, url: `/warehouse/transfers/${t.id}`, createdAt: t.createdAt });
    const quarantined = await prisma.finishedUnit.findMany({ where: { location: reach, status: 'QUARANTINE' }, select: { id: true, serialNumber: true, updatedAt: true, product: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 20 });
    for (const u of quarantined) items.push({ id: `adjustment-approve-${u.id}`, title: `Approve adjustment — ${u.serialNumber}`, detail: `${u.product.name} in quarantine: scrap it or return it to stock`, url: `/warehouse/adjustments`, createdAt: u.updatedAt });
  }
  if (canFg) {
    const releases = await prisma.goodsReleaseNote.findMany({ where: { salesOrder: reach, status: 'ISSUED' }, select: { id: true, number: true, issuedAt: true, salesOrder: { select: { number: true, customer: { select: { fullName: true } } } }, _count: { select: { lines: true } } }, orderBy: { issuedAt: 'asc' }, take: 20 });
    for (const r of releases) items.push({ id: `release-pick-${r.id}`, title: `Pick release ${r.number}`, detail: `${r.salesOrder.number} · ${r.salesOrder.customer.fullName} · ${r._count.lines} ${r._count.lines === 1 ? 'line' : 'lines'}`, url: `/warehouse/releases/${r.id}`, createdAt: r.issuedAt });
  }
  if (canParts) {
    const receipts = await prisma.goodsReceipt.findMany({ where: { ...reach, inspection: null }, select: { id: true, referenceNumber: true, supplierName: true, receivedAt: true }, orderBy: { receivedAt: 'asc' }, take: 20 });
    for (const g of receipts) items.push({ id: `qc-due-${g.id}`, title: `Incoming QC due — ${g.referenceNumber}`, detail: `${g.supplierName} · received ${g.receivedAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}`, url: `/warehouse/incoming-qc`, createdAt: g.receivedAt });
  }
  return items;
}

/** Whether a page may show the warehouse to this person (for links from other modules). */
export async function canSeeWarehouseRecord(branchId: string | null): Promise<boolean> {
  await requireUser();
  return canSeeRecord('warehouse.view', { branchId }, 'warehouse.link');
}
