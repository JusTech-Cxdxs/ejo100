'use server';
/**
 * Procurement: suppliers (organisation-owned), purchase requisitions and
 * purchase orders (branch-owned), shipments (through their order) and
 * supplier claims (through their supplier). Lists are fenced with
 * reachWhere('procurement.view') / orgWhere(); every change is authorised
 * against the record's branch and written to the audit trail; approvals
 * refuse the person who raised the record and refuse during assisted sessions.
 */
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog, getWorkshopBranchId } from '@/lib/workshop-core';
import { authorize, allows, reachWhere, orgWhere, getPrincipal, refuseDuringAssist, partsOfMyOrganisation, NOT_AVAILABLE } from '@/lib/authz/server';
import { claimed as stillAsSeen } from '@/lib/integrity';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { userNames, nameOf } from '@/lib/zinox/people';
import { actorLabel } from '@/lib/assist/rules';
import {
  requisitionProblem, purchaseOrderProblem, poTotal, claimProblem, canMoveRequisition, canMovePurchaseOrder, canMoveClaim, nextShipmentStatus, OPEN_PO_STATUSES,
  SHIPMENT_IN_FLIGHT, CURRENCIES, type RequisitionLineInput, type PurchaseOrderLineInput, type RequisitionStatus, type PurchaseOrderStatus, type SupplierClaimStatus, type ShipmentStatus,
} from '@/lib/procurement-core';

class ProcurementError extends Error {}

const n2 = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100;
const n3 = (v: unknown): number => Math.round(Number(v ?? 0) * 1000) / 1000;
const clean = (s: string | null | undefined, max = 200): string | null => (s?.trim() ? s.trim().slice(0, max) : null);

async function audit(userId: string, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

/** The branch a new requisition or order belongs to: the person's own, else (platform team) the operating branch. */
async function myBranchId(): Promise<string> {
  const p = await getPrincipal();
  return p.branchId ?? (await getWorkshopBranchId());
}

async function organisationOfBranch(branchId: string): Promise<string> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } });
  if (!b) throw new ProcurementError('That branch no longer exists.');
  return b.businessUnit.organisationId;
}

async function myOrganisationIdOrThrow(): Promise<string> {
  const p = await getPrincipal();
  if (p.organisationId) return p.organisationId;
  return organisationOfBranch(await myBranchId());
}

async function auditTrail(entityType: string, visibleId: string) {
  const entries = await prisma.auditLog.findMany({ where: { entityType, entityId: visibleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const names = await userNames(entries.map((e: { userId: string | null }) => e.userId));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(nameOf(names, e.userId), e.metadata) : null }));
}

// ── Pickers ───────────────────────────────────────────────────────────────

export async function searchPartsForSelect(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 80);
  const rows = await prisma.part.findMany({
    where: { ...(await partsOfMyOrganisation()), isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true },
  });
  return rows.map((p: (typeof rows)[number]) => ({ value: p.id, label: p.name, sublabel: [p.partNumber, p.baseUnitOfMeasure].filter(Boolean).join(' · ') }));
}

export async function searchProductsForPurchase(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 80);
  const rows = await prisma.product.findMany({
    where: { ...(await orgWhere()), isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true, sku: true, source: true },
  });
  return rows.map((p: (typeof rows)[number]) => ({ value: p.id, label: p.name, sublabel: `${p.sku} · ${p.source === 'ASSEMBLED' ? 'assembled here' : 'bought finished'}` }));
}

export async function searchSuppliersForSelect(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 80);
  const rows = await prisma.supplier.findMany({ where: { ...(await orgWhere()), isActive: true, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { name: 'asc' }, take: 20, select: { id: true, name: true, country: true, currency: true } });
  return rows.map((s: (typeof rows)[number]) => ({ value: s.id, label: s.name, sublabel: [s.country, s.currency].filter(Boolean).join(' · ') }));
}

// ── Suppliers ─────────────────────────────────────────────────────────────

export async function listSuppliers(q?: string) {
  await requireUser();
  const query = q?.trim();
  return prisma.supplier.findMany({
    where: { ...(await orgWhere()), ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { country: { contains: query, mode: 'insensitive' } }, { contactName: { contains: query, mode: 'insensitive' } }] } : {}) },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: 200,
    select: { id: true, name: true, country: true, currency: true, contactName: true, email: true, phone: true, leadTimeDays: true, isActive: true, _count: { select: { purchaseOrders: { where: { status: { in: OPEN_PO_STATUSES } } }, claims: { where: { status: { in: ['OPEN', 'SENT', 'ACCEPTED'] } } } } } },
  });
}

export async function getSupplier(supplierId: string) {
  await requireUser();
  const s = await prisma.supplier.findFirst({
    where: { id: supplierId, ...(await orgWhere()) },
    include: {
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, number: true, status: true, currency: true, total: true, expectedDate: true, createdAt: true } },
      claims: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, number: true, status: true, amount: true, currency: true, description: true, createdAt: true } },
    },
  });
  return s;
}

export async function getSupplierAuditTrail(supplierId: string) {
  await requireUser();
  const visibleId = (await prisma.supplier.findFirst({ where: { id: supplierId, ...(await orgWhere()) }, select: { id: true } }))?.id ?? '__no_access__';
  return auditTrail('Supplier', visibleId);
}

export type SupplierInput = { name: string; country?: string; currency?: string; contactName?: string; email?: string; phone?: string; address?: string; paymentTerms?: string; leadTimeDays?: number | null };

function supplierData(input: SupplierInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new ProcurementError('Enter the supplier\'s name.');
  const currency = (input.currency ?? 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ProcurementError('The currency must be a three-letter code, like USD or NGN.');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new ProcurementError('That email address does not look right.');
  const lead = input.leadTimeDays === null || input.leadTimeDays === undefined || Number.isNaN(input.leadTimeDays) ? null : Math.max(0, Math.round(input.leadTimeDays));
  return { name, country: clean(input.country, 80), currency, contactName: clean(input.contactName, 120), email: clean(input.email, 160), phone: clean(input.phone, 40), address: clean(input.address, 400), paymentTerms: clean(input.paymentTerms, 200), leadTimeDays: lead };
}

export async function createSupplier(input: SupplierInput): Promise<{ id: string }> {
  const user = await requireUser();
  await authorize('procurement.po.manage', undefined, 'supplier.create', 'Only Procurement can add suppliers.');
  const organisationId = await myOrganisationIdOrThrow();
  const data = supplierData(input);
  const dup = await prisma.supplier.findUnique({ where: { organisationId_name: { organisationId, name: data.name } }, select: { id: true } });
  if (dup) throw new ProcurementError('A supplier with that name already exists.');
  const s = await prisma.supplier.create({ data: { ...data, organisationId, createdById: user.id }, select: { id: true } });
  await audit(user.id, 'Supplier', s.id, 'supplier.created', { name: data.name, country: data.country, currency: data.currency });
  return { id: s.id };
}

export async function updateSupplier(supplierId: string, input: SupplierInput & { isActive?: boolean }): Promise<void> {
  const user = await requireUser();
  await authorize('procurement.po.manage', undefined, 'supplier.update', 'Only Procurement can edit suppliers.');
  const existing = await prisma.supplier.findFirst({ where: { id: supplierId, ...(await orgWhere()) } });
  if (!existing) throw new ProcurementError(NOT_AVAILABLE);
  const data = supplierData(input);
  if (data.name !== existing.name) {
    const dup = await prisma.supplier.findUnique({ where: { organisationId_name: { organisationId: existing.organisationId, name: data.name } }, select: { id: true } });
    if (dup) throw new ProcurementError('Another supplier already has that name.');
  }
  const isActive = input.isActive ?? existing.isActive;
  await prisma.supplier.update({ where: { id: supplierId }, data: { ...data, isActive } });
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(data) as (keyof typeof data)[]) if (String(existing[k] ?? '') !== String(data[k] ?? '')) changes[k] = { from: existing[k], to: data[k] };
  if (isActive !== existing.isActive) changes.isActive = { from: existing.isActive, to: isActive };
  await audit(user.id, 'Supplier', supplierId, 'supplier.updated', { name: data.name, changes });
}

// ── Purchase requisitions ─────────────────────────────────────────────────

const REQ_STATUSES: RequisitionStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED'];

export async function listRequisitions(status?: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view');
  const s = (REQ_STATUSES as string[]).includes(status ?? '') ? (status as RequisitionStatus) : undefined;
  return prisma.purchaseRequisition.findMany({
    where: { ...reach, ...(s ? { status: s } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: { id: true, number: true, status: true, reason: true, neededBy: true, createdAt: true, submittedAt: true, raisedBy: { select: { fullName: true } }, buildOrder: { select: { id: true, number: true } }, _count: { select: { lines: true } }, lines: { select: { quantity: true, estimatedUnitCost: true, currency: true } } },
  });
}

export async function getRequisition(requisitionId: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const r = await prisma.purchaseRequisition.findFirst({
    where: { id: requisitionId, ...reach },
    include: {
      raisedBy: { select: { id: true, fullName: true } },
      buildOrder: { select: { id: true, number: true, status: true } },
      branch: { select: { name: true } },
      lines: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } }, product: { select: { id: true, name: true, sku: true } } }, orderBy: { id: 'asc' } },
      purchaseOrders: { select: { id: true, number: true, status: true, total: true, currency: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!r) return null;
  const names = await userNames([r.approvedById]);
  return { ...r, approvedBy: nameOf(names, r.approvedById) };
}

export async function getRequisitionAuditTrail(requisitionId: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const visibleId = (await prisma.purchaseRequisition.findFirst({ where: { id: requisitionId, ...reach }, select: { id: true } }))?.id ?? '__no_access__';
  return auditTrail('PurchaseRequisition', visibleId);
}

export type CreateRequisitionInput = { reason: string; neededBy?: Date | null; buildOrderNumber?: string; lines: RequisitionLineInput[] };

async function cleanLines(lines: RequisitionLineInput[]): Promise<{ partId: string | null; productId: string | null; description: string; quantity: number; estimatedUnitCost: number | null }[]> {
  const partIds = [...new Set(lines.map((l) => l.partId).filter((x): x is string => Boolean(x)))];
  const productIds = [...new Set(lines.map((l) => l.productId).filter((x): x is string => Boolean(x)))];
  const [parts, products] = await Promise.all([
    partIds.length ? prisma.part.findMany({ where: { id: { in: partIds }, ...(await partsOfMyOrganisation()) }, select: { id: true, name: true, partNumber: true } }) : [],
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds }, ...(await orgWhere()) }, select: { id: true, name: true, sku: true } }) : [],
  ]);
  const part = new Map(parts.map((p: { id: string; name: string; partNumber: string | null }) => [p.id, p]));
  const product = new Map(products.map((p: { id: string; name: string; sku: string }) => [p.id, p]));
  return lines.map((l, i) => {
    const p = l.partId ? part.get(l.partId) : null;
    const pr = l.productId ? product.get(l.productId) : null;
    if (l.partId && !p) throw new ProcurementError(`Line ${i + 1}: that part is not in your organisation's catalogue.`);
    if (l.productId && !pr) throw new ProcurementError(`Line ${i + 1}: that product is not in your organisation's catalogue.`);
    const description = l.description.trim() || (p ? `${p.name}${p.partNumber ? ` (${p.partNumber})` : ''}` : pr ? `${pr.name} (${pr.sku})` : '');
    return { partId: p?.id ?? null, productId: pr?.id ?? null, description: description.slice(0, 300), quantity: n3(l.quantity), estimatedUnitCost: l.estimatedUnitCost === null || l.estimatedUnitCost === undefined ? null : n2(l.estimatedUnitCost) };
  });
}

export async function createRequisition(input: CreateRequisitionInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const branchId = await myBranchId();
  await authorize('procurement.requisition.raise', { branchId, homeBranch: true }, 'requisition.create', 'Only people who raise requisitions can do this.');
  const problem = requisitionProblem({ reason: input.reason, lines: input.lines });
  if (problem) throw new ProcurementError(problem);
  const lines = await cleanLines(input.lines);
  let buildOrderId: string | null = null;
  if (input.buildOrderNumber?.trim()) {
    const reach = await reachWhere('procurement.view', { lens: false });
    const bo = await prisma.buildOrder.findFirst({ where: { number: input.buildOrderNumber.trim().toUpperCase(), ...reach }, select: { id: true } });
    if (!bo) throw new ProcurementError(`Build order ${input.buildOrderNumber.trim()} was not found.`);
    buildOrderId = bo.id;
  }
  const neededBy = input.neededBy && !Number.isNaN(input.neededBy.getTime()) ? input.neededBy : null;
  const number = await nextDocumentNumber('PRQ', await organisationOfBranch(branchId));
  const r = await prisma.purchaseRequisition.create({ data: { number, branchId, reason: input.reason.trim().slice(0, 1000), neededBy, buildOrderId, raisedById: user.id, lines: { create: lines.map((l) => ({ ...l, currency: 'NGN' })) } }, select: { id: true } });
  await audit(user.id, 'PurchaseRequisition', r.id, 'requisition.created', { referenceNumber: number, lines: lines.length, buildOrder: input.buildOrderNumber?.trim() || undefined });
  return { id: r.id, number };
}

async function requisitionForChange(requisitionId: string) {
  const reach = await reachWhere('procurement.view', { lens: false });
  const r = await prisma.purchaseRequisition.findFirst({ where: { id: requisitionId, ...reach }, select: { id: true, number: true, status: true, branchId: true, raisedById: true, reason: true, lines: { select: { partId: true, productId: true, description: true, quantity: true, estimatedUnitCost: true } } } });
  if (!r) throw new ProcurementError(NOT_AVAILABLE);
  return r;
}

export async function submitRequisition(requisitionId: string): Promise<void> {
  const user = await requireUser();
  const r = await requisitionForChange(requisitionId);
  await authorize('procurement.requisition.raise', { branchId: r.branchId, homeBranch: true }, 'requisition.submit', 'Only people who raise requisitions can submit one.');
  if (!canMoveRequisition(r.status as RequisitionStatus, 'SUBMITTED')) throw new ProcurementError(`Requisition ${r.number} is ${r.status.toLowerCase()} — it cannot be submitted.`);
  stillAsSeen(await prisma.purchaseRequisition.updateMany({ where: { id: r.id, status: r.status }, data: { status: 'SUBMITTED', submittedAt: new Date() } }));
  await audit(user.id, 'PurchaseRequisition', r.id, 'requisition.submitted', { referenceNumber: r.number });
}

export async function approveRequisition(requisitionId: string): Promise<void> {
  await refuseDuringAssist('approveRequisition');
  const user = await requireUser();
  const r = await requisitionForChange(requisitionId);
  await authorize('procurement.requisition.approve', { branchId: r.branchId, homeBranch: true }, 'requisition.approve', 'Only the Head of Procurement approves requisitions.');
  if (r.raisedById === user.id && !(await getPrincipal()).isSuperAdmin) throw new ProcurementError('The person who raised a requisition cannot approve it.');
  if (!canMoveRequisition(r.status as RequisitionStatus, 'APPROVED')) throw new ProcurementError(`Requisition ${r.number} is ${r.status.toLowerCase()} — only a submitted requisition can be approved.`);
  stillAsSeen(await prisma.purchaseRequisition.updateMany({ where: { id: r.id, status: 'SUBMITTED' }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), rejectedReason: null } }));
  await audit(user.id, 'PurchaseRequisition', r.id, 'requisition.approved', { referenceNumber: r.number });
}

export async function rejectRequisition(requisitionId: string, reason: string): Promise<void> {
  await refuseDuringAssist('rejectRequisition');
  const user = await requireUser();
  const r = await requisitionForChange(requisitionId);
  await authorize('procurement.requisition.approve', { branchId: r.branchId, homeBranch: true }, 'requisition.reject', 'Only the Head of Procurement decides requisitions.');
  if (r.raisedById === user.id && !(await getPrincipal()).isSuperAdmin) throw new ProcurementError('The person who raised a requisition cannot decide it.');
  if (reason.trim().length < 3) throw new ProcurementError('Tell the person who raised it why.');
  if (!canMoveRequisition(r.status as RequisitionStatus, 'REJECTED')) throw new ProcurementError(`Requisition ${r.number} is ${r.status.toLowerCase()} — only a submitted requisition can be rejected.`);
  stillAsSeen(await prisma.purchaseRequisition.updateMany({ where: { id: r.id, status: 'SUBMITTED' }, data: { status: 'REJECTED', rejectedReason: reason.trim().slice(0, 500) } }));
  await audit(user.id, 'PurchaseRequisition', r.id, 'requisition.rejected', { referenceNumber: r.number, reason: reason.trim() });
}

/** A rejected requisition goes back to draft for the raiser to fix and resubmit. */
export async function reopenRequisition(requisitionId: string): Promise<void> {
  const user = await requireUser();
  const r = await requisitionForChange(requisitionId);
  await authorize('procurement.requisition.raise', { branchId: r.branchId, homeBranch: true }, 'requisition.reopen', 'Only people who raise requisitions can reopen one.');
  if (!canMoveRequisition(r.status as RequisitionStatus, 'DRAFT')) throw new ProcurementError('Only a rejected requisition can be reopened.');
  stillAsSeen(await prisma.purchaseRequisition.updateMany({ where: { id: r.id, status: 'REJECTED' }, data: { status: 'DRAFT', submittedAt: null } }));
  await audit(user.id, 'PurchaseRequisition', r.id, 'requisition.reopened', { referenceNumber: r.number });
}

export async function cancelRequisition(requisitionId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const r = await requisitionForChange(requisitionId);
  await authorize('procurement.requisition.raise', { branchId: r.branchId, homeBranch: true }, 'requisition.cancel', 'Only people who raise requisitions can cancel one.');
  if (r.raisedById !== user.id && !(await allows('procurement.po.manage', { branchId: r.branchId }))) throw new ProcurementError('Only the person who raised it, or Procurement, can cancel this requisition.');
  if (!canMoveRequisition(r.status as RequisitionStatus, 'CANCELLED')) throw new ProcurementError(`Requisition ${r.number} is ${r.status.toLowerCase()} — it cannot be cancelled now.`);
  stillAsSeen(await prisma.purchaseRequisition.updateMany({ where: { id: r.id, status: r.status }, data: { status: 'CANCELLED', rejectedReason: clean(reason, 500) } }));
  await audit(user.id, 'PurchaseRequisition', r.id, 'requisition.cancelled', { referenceNumber: r.number, reason: clean(reason, 500) });
}

// ── Purchase orders ───────────────────────────────────────────────────────

const PO_STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'APPROVED', 'SENT', 'PARTLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'];

export async function listPurchaseOrders(filter: { status?: string; supplierId?: string } = {}) {
  await requireUser();
  const reach = await reachWhere('procurement.view');
  const s = (PO_STATUSES as string[]).includes(filter.status ?? '') ? (filter.status as PurchaseOrderStatus) : undefined;
  return prisma.purchaseOrder.findMany({
    where: { ...reach, ...(s ? { status: s } : filter.status === 'open' ? { status: { in: OPEN_PO_STATUSES } } : {}), ...(filter.supplierId ? { supplierId: filter.supplierId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: { id: true, number: true, status: true, currency: true, total: true, expectedDate: true, createdAt: true, sentAt: true, supplier: { select: { id: true, name: true } }, raisedBy: { select: { fullName: true } }, requisition: { select: { id: true, number: true } }, _count: { select: { lines: true, shipments: true, goodsReceipts: true } } },
  });
}

export async function getPurchaseOrder(purchaseOrderId: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, ...reach },
    include: {
      supplier: { select: { id: true, name: true, country: true, currency: true, contactName: true, email: true, phone: true, address: true, paymentTerms: true } },
      requisition: { select: { id: true, number: true, status: true } },
      raisedBy: { select: { id: true, fullName: true } },
      branch: { select: { id: true, name: true } },
      lines: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } }, product: { select: { id: true, name: true, sku: true, serialised: true } } }, orderBy: { id: 'asc' } },
      shipments: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, mode: true, carrier: true, reference: true, eta: true, etd: true, arrivedAt: true, clearedAt: true } },
      goodsReceipts: { orderBy: { receivedAt: 'desc' }, select: { id: true, referenceNumber: true, receivedAt: true, supplierName: true, receivedBy: { select: { fullName: true } }, inspection: { select: { passed: true } }, lines: { select: { quantityInBaseUnit: true, part: { select: { name: true } } } } } },
      claims: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, amount: true, currency: true, description: true } },
    },
  });
  if (!po) return null;
  const names = await userNames([po.approvedById]);
  return { ...po, approvedBy: nameOf(names, po.approvedById) };
}

export async function getPurchaseOrderAuditTrail(purchaseOrderId: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const visibleId = (await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, ...reach }, select: { id: true } }))?.id ?? '__no_access__';
  return auditTrail('PurchaseOrder', visibleId);
}

export type CreatePurchaseOrderInput = { supplierId: string; requisitionId?: string; currency: string; exchangeRate?: number | null; incoterms?: string; paymentTerms?: string; expectedDate?: Date | null; notes?: string; lines: PurchaseOrderLineInput[] };

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const branchId = await myBranchId();
  await authorize('procurement.po.manage', { branchId, homeBranch: true }, 'purchase_order.create', 'Only Procurement raises purchase orders.');
  const currency = input.currency.trim().toUpperCase();
  const problem = purchaseOrderProblem({ supplierId: input.supplierId, currency, exchangeRate: input.exchangeRate, lines: input.lines });
  if (problem) throw new ProcurementError(problem);
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, isActive: true, ...(await orgWhere()) }, select: { id: true, name: true } });
  if (!supplier) throw new ProcurementError('Choose an active supplier.');
  let requisition: { id: string; number: string; status: string; branchId: string } | null = null;
  if (input.requisitionId) {
    const reach = await reachWhere('procurement.view', { lens: false });
    requisition = await prisma.purchaseRequisition.findFirst({ where: { id: input.requisitionId, ...reach }, select: { id: true, number: true, status: true, branchId: true } });
    if (!requisition) throw new ProcurementError('That requisition is not available.');
    if (requisition.status !== 'APPROVED') throw new ProcurementError(`Requisition ${requisition.number} is ${requisition.status.toLowerCase()} — only an approved requisition can be ordered.`);
  }
  const lines = (await cleanLines(input.lines.map((l) => ({ partId: l.partId, productId: l.productId, description: l.description, quantity: l.quantity, estimatedUnitCost: l.unitCost })))).map((l) => ({ partId: l.partId, productId: l.productId, description: l.description, quantity: l.quantity, unitCost: l.estimatedUnitCost ?? 0 }));
  const total = poTotal(lines);
  const expectedDate = input.expectedDate && !Number.isNaN(input.expectedDate.getTime()) ? input.expectedDate : null;
  const exchangeRate = currency === 'NGN' ? null : input.exchangeRate && input.exchangeRate > 0 ? Math.round(input.exchangeRate * 10000) / 10000 : null;
  const orderBranch = requisition?.branchId ?? branchId;
  const number = await nextDocumentNumber('PO', await organisationOfBranch(orderBranch));
  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: { number, branchId: orderBranch, supplierId: supplier.id, requisitionId: requisition?.id ?? null, currency, exchangeRate, incoterms: clean(input.incoterms, 20)?.toUpperCase() ?? null, paymentTerms: clean(input.paymentTerms, 200), expectedDate, total, notes: clean(input.notes, 1000), raisedById: user.id, lines: { create: lines } },
      select: { id: true },
    });
    if (requisition) stillAsSeen(await tx.purchaseRequisition.updateMany({ where: { id: requisition.id, status: 'APPROVED' }, data: { status: 'ORDERED' } }));
    return created;
  });
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.created', { referenceNumber: number, supplier: supplier.name, currency, total, lines: lines.length, requisition: requisition?.number });
  if (requisition) await audit(user.id, 'PurchaseRequisition', requisition.id, 'requisition.ordered', { referenceNumber: requisition.number, purchaseOrder: number });
  return { id: po.id, number };
}

async function purchaseOrderForChange(purchaseOrderId: string) {
  const reach = await reachWhere('procurement.view', { lens: false });
  const po = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, ...reach }, select: { id: true, number: true, status: true, branchId: true, raisedById: true, total: true, currency: true, supplier: { select: { name: true } }, _count: { select: { goodsReceipts: true } }, lines: { select: { receivedQuantity: true } } } });
  if (!po) throw new ProcurementError(NOT_AVAILABLE);
  return po;
}

export async function approvePurchaseOrder(purchaseOrderId: string): Promise<void> {
  await refuseDuringAssist('approvePurchaseOrder');
  const user = await requireUser();
  const po = await purchaseOrderForChange(purchaseOrderId);
  await authorize('procurement.po.approve', { branchId: po.branchId, homeBranch: true }, 'purchase_order.approve', 'Only the Head of Procurement approves purchase orders.');
  if (po.raisedById === user.id && !(await getPrincipal()).isSuperAdmin) throw new ProcurementError('The person who raised a purchase order cannot approve it.');
  if (!canMovePurchaseOrder(po.status as PurchaseOrderStatus, 'APPROVED')) throw new ProcurementError(`Purchase order ${po.number} is ${po.status.toLowerCase().replace(/_/g, ' ')} — only a draft can be approved.`);
  stillAsSeen(await prisma.purchaseOrder.updateMany({ where: { id: po.id, status: 'DRAFT' }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() } }));
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.approved', { referenceNumber: po.number, total: Number(po.total), currency: po.currency });
}

export async function markPurchaseOrderSent(purchaseOrderId: string): Promise<void> {
  const user = await requireUser();
  const po = await purchaseOrderForChange(purchaseOrderId);
  await authorize('procurement.po.manage', { branchId: po.branchId, homeBranch: true }, 'purchase_order.send', 'Only Procurement sends purchase orders.');
  if (!canMovePurchaseOrder(po.status as PurchaseOrderStatus, 'SENT')) throw new ProcurementError(po.status === 'DRAFT' ? 'The order must be approved before it is sent.' : `Purchase order ${po.number} is already ${po.status.toLowerCase().replace(/_/g, ' ')}.`);
  stillAsSeen(await prisma.purchaseOrder.updateMany({ where: { id: po.id, status: 'APPROVED' }, data: { status: 'SENT', sentAt: new Date() } }));
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.sent', { referenceNumber: po.number, supplier: po.supplier.name });
}

export async function closePurchaseOrder(purchaseOrderId: string, note?: string): Promise<void> {
  const user = await requireUser();
  const po = await purchaseOrderForChange(purchaseOrderId);
  await authorize('procurement.po.manage', { branchId: po.branchId, homeBranch: true }, 'purchase_order.close', 'Only Procurement closes purchase orders.');
  if (!canMovePurchaseOrder(po.status as PurchaseOrderStatus, 'CLOSED')) throw new ProcurementError(`Purchase order ${po.number} is ${po.status.toLowerCase().replace(/_/g, ' ')} — it cannot be closed from there.`);
  stillAsSeen(await prisma.purchaseOrder.updateMany({ where: { id: po.id, status: po.status }, data: { status: 'CLOSED', closedAt: new Date() } }));
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.closed', { referenceNumber: po.number, note: clean(note, 500) });
}

export async function cancelPurchaseOrder(purchaseOrderId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const po = await purchaseOrderForChange(purchaseOrderId);
  await authorize('procurement.po.manage', { branchId: po.branchId, homeBranch: true }, 'purchase_order.cancel', 'Only Procurement cancels purchase orders.');
  if (reason.trim().length < 3) throw new ProcurementError('Say why the order is cancelled.');
  if (!canMovePurchaseOrder(po.status as PurchaseOrderStatus, 'CANCELLED')) throw new ProcurementError(`Purchase order ${po.number} is ${po.status.toLowerCase().replace(/_/g, ' ')} — it cannot be cancelled now.`);
  if (po._count.goodsReceipts > 0 || po.lines.some((l) => Number(l.receivedQuantity) > 0)) throw new ProcurementError('Goods have already been received against this order — close it instead.');
  stillAsSeen(await prisma.purchaseOrder.updateMany({ where: { id: po.id, status: po.status }, data: { status: 'CANCELLED', closedAt: new Date(), notes: reason.trim().slice(0, 1000) } }));
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.cancelled', { referenceNumber: po.number, reason: reason.trim() });
}

// ── Shipments ─────────────────────────────────────────────────────────────

export async function listShipments(status?: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view');
  const s = (['BOOKED', 'IN_TRANSIT', 'ARRIVED_PORT', 'CUSTOMS', 'CLEARED', 'DELIVERED'] as string[]).includes(status ?? '') ? (status as ShipmentStatus) : undefined;
  return prisma.shipment.findMany({
    where: { purchaseOrder: reach, ...(s ? { status: s } : status === 'open' ? { status: { in: SHIPMENT_IN_FLIGHT } } : {}) },
    orderBy: [{ eta: 'asc' }, { createdAt: 'desc' }],
    take: 150,
    select: { id: true, number: true, status: true, mode: true, carrier: true, reference: true, containerNumbers: true, etd: true, eta: true, arrivedAt: true, clearedAt: true, dutyPaid: true, createdAt: true, purchaseOrder: { select: { id: true, number: true, supplier: { select: { name: true } } } } },
  });
}

export async function getShipment(shipmentId: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const s = await prisma.shipment.findFirst({
    where: { id: shipmentId, purchaseOrder: reach },
    include: {
      purchaseOrder: { select: { id: true, number: true, status: true, currency: true, total: true, incoterms: true, branchId: true, supplier: { select: { id: true, name: true, country: true } }, lines: { select: { id: true, description: true, quantity: true, receivedQuantity: true } } } },
      goodsReceipts: { orderBy: { receivedAt: 'desc' }, select: { id: true, referenceNumber: true, receivedAt: true } },
    },
  });
  if (!s) return null;
  const names = await userNames([s.createdById]);
  return { ...s, createdBy: nameOf(names, s.createdById) };
}

export async function getShipmentAuditTrail(shipmentId: string) {
  await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const visibleId = (await prisma.shipment.findFirst({ where: { id: shipmentId, purchaseOrder: reach }, select: { id: true } }))?.id ?? '__no_access__';
  return auditTrail('Shipment', visibleId);
}

export type AddShipmentInput = { purchaseOrderId: string; mode: string; carrier?: string; reference?: string; containerNumbers?: string; etd?: Date | null; eta?: Date | null; notes?: string };

export async function addShipment(input: AddShipmentInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const po = await purchaseOrderForChange(input.purchaseOrderId);
  await authorize('procurement.po.manage', { branchId: po.branchId, homeBranch: true }, 'shipment.create', 'Only Procurement tracks shipments.');
  if (!['APPROVED', 'SENT', 'PARTLY_RECEIVED'].includes(po.status)) throw new ProcurementError(`Purchase order ${po.number} is ${po.status.toLowerCase().replace(/_/g, ' ')} — a shipment needs an approved, open order.`);
  const mode = ['SEA', 'AIR', 'ROAD'].includes(input.mode) ? (input.mode as 'SEA') : 'SEA';
  const date = (d?: Date | null) => (d && !Number.isNaN(d.getTime()) ? d : null);
  const etd = date(input.etd);
  const eta = date(input.eta);
  if (etd && eta && eta.getTime() < etd.getTime()) throw new ProcurementError('The arrival date cannot be before the departure date.');
  const number = await nextDocumentNumber('SHP', await organisationOfBranch(po.branchId));
  const s = await prisma.shipment.create({ data: { number, purchaseOrderId: po.id, mode, carrier: clean(input.carrier, 120), reference: clean(input.reference, 120), containerNumbers: clean(input.containerNumbers, 300), etd, eta, notes: clean(input.notes, 1000), createdById: user.id }, select: { id: true } });
  await audit(user.id, 'Shipment', s.id, 'shipment.booked', { referenceNumber: number, purchaseOrder: po.number, mode, carrier: clean(input.carrier, 120), eta: eta?.toISOString() });
  await audit(user.id, 'PurchaseOrder', po.id, 'purchase_order.shipment_booked', { referenceNumber: po.number, shipment: number });
  return { id: s.id, number };
}

/** Move the shipment one step on (booked → in transit → at port → customs → cleared → delivered), with the date, duty paid and notes. */
export async function advanceShipment(shipmentId: string, input: { at?: Date | null; dutyPaid?: number | null; notes?: string }): Promise<{ status: ShipmentStatus }> {
  const user = await requireUser();
  const reach = await reachWhere('procurement.view', { lens: false });
  const s = await prisma.shipment.findFirst({ where: { id: shipmentId, purchaseOrder: reach }, select: { id: true, number: true, status: true, dutyPaid: true, purchaseOrder: { select: { branchId: true, number: true } } } });
  if (!s) throw new ProcurementError(NOT_AVAILABLE);
  await authorize('procurement.po.manage', { branchId: s.purchaseOrder.branchId, homeBranch: true }, 'shipment.advance', 'Only Procurement updates shipments.');
  const next = nextShipmentStatus(s.status as ShipmentStatus);
  if (!next) throw new ProcurementError(`Shipment ${s.number} has already been delivered.`);
  const at = input.at && !Number.isNaN(input.at.getTime()) ? input.at : new Date();
  if (at.getTime() > Date.now() + 5 * 60_000) throw new ProcurementError('That date is in the future.');
  const duty = input.dutyPaid === null || input.dutyPaid === undefined || Number.isNaN(input.dutyPaid) ? null : n2(input.dutyPaid);
  if (duty !== null && duty < 0) throw new ProcurementError('Duty paid cannot be negative.');
  const data = {
    status: next,
    ...(next === 'ARRIVED_PORT' ? { arrivedAt: at } : {}),
    ...(next === 'CLEARED' ? { clearedAt: at } : {}),
    ...(duty !== null ? { dutyPaid: duty } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 1000) } : {}),
  };
  stillAsSeen(await prisma.shipment.updateMany({ where: { id: s.id, status: s.status }, data }));
  await audit(user.id, 'Shipment', s.id, `shipment.${next.toLowerCase()}`, { referenceNumber: s.number, purchaseOrder: s.purchaseOrder.number, at: at.toISOString(), dutyPaid: duty ?? undefined, notes: clean(input.notes, 300) ?? undefined });
  return { status: next };
}

// ── Supplier claims ───────────────────────────────────────────────────────

export async function listSupplierClaims(status?: string) {
  await requireUser();
  const s = (['OPEN', 'SENT', 'ACCEPTED', 'REJECTED', 'SETTLED', 'CLOSED'] as string[]).includes(status ?? '') ? (status as SupplierClaimStatus) : undefined;
  return prisma.supplierClaim.findMany({
    where: { supplier: await orgWhere(), ...(s ? { status: s } : status === 'open' ? { status: { in: ['OPEN', 'SENT', 'ACCEPTED'] } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: { id: true, number: true, status: true, description: true, amount: true, currency: true, createdAt: true, settledAt: true, reference: true, supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, number: true } } },
  });
}

export async function getSupplierClaim(claimId: string) {
  await requireUser();
  const c = await prisma.supplierClaim.findFirst({
    where: { id: claimId, supplier: await orgWhere() },
    include: { supplier: { select: { id: true, name: true, contactName: true, email: true, currency: true } }, purchaseOrder: { select: { id: true, number: true, status: true, branchId: true } } },
  });
  if (!c) return null;
  const [names, receipt] = await Promise.all([
    userNames([c.raisedById]),
    c.goodsReceiptId ? prisma.goodsReceipt.findUnique({ where: { id: c.goodsReceiptId }, select: { id: true, referenceNumber: true } }) : Promise.resolve(null),
  ]);
  return { ...c, raisedBy: nameOf(names, c.raisedById), goodsReceipt: receipt };
}

export async function getSupplierClaimAuditTrail(claimId: string) {
  await requireUser();
  const visibleId = (await prisma.supplierClaim.findFirst({ where: { id: claimId, supplier: await orgWhere() }, select: { id: true } }))?.id ?? '__no_access__';
  return auditTrail('SupplierClaim', visibleId);
}

export type CreateSupplierClaimInput = { supplierId: string; purchaseOrderId?: string; goodsReceiptId?: string; warrantyClaimId?: string; description: string; amount: number; currency?: string };

export async function createSupplierClaim(input: CreateSupplierClaimInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const branchId = await myBranchId();
  await authorize('procurement.po.manage', { branchId, homeBranch: true }, 'supplier_claim.create', 'Only Procurement raises supplier claims.');
  const problem = claimProblem({ supplierId: input.supplierId, description: input.description, amount: input.amount });
  if (problem) throw new ProcurementError(problem);
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, ...(await orgWhere()) }, select: { id: true, name: true, currency: true, organisationId: true } });
  if (!supplier) throw new ProcurementError('Choose the supplier the claim is against.');
  let po: { id: string; number: string } | null = null;
  if (input.purchaseOrderId) {
    const reach = await reachWhere('procurement.view', { lens: false });
    po = await prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, supplierId: supplier.id, ...reach }, select: { id: true, number: true } });
    if (!po) throw new ProcurementError('That purchase order is not one of this supplier\'s.');
  }
  let grn: { id: string; referenceNumber: string } | null = null;
  if (input.goodsReceiptId) {
    const reach = await reachWhere('procurement.view', { lens: false });
    grn = await prisma.goodsReceipt.findFirst({ where: { id: input.goodsReceiptId, ...reach }, select: { id: true, referenceNumber: true } });
    if (!grn) throw new ProcurementError('That goods receipt is not available.');
  }
  const currency = (input.currency ?? supplier.currency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ProcurementError('The currency must be a three-letter code.');
  const number = await nextDocumentNumber('SCL', supplier.organisationId);
  const c = await prisma.supplierClaim.create({ data: { number, supplierId: supplier.id, purchaseOrderId: po?.id ?? null, goodsReceiptId: grn?.id ?? null, warrantyClaimId: clean(input.warrantyClaimId, 64), description: input.description.trim().slice(0, 2000), amount: n2(input.amount), currency, raisedById: user.id }, select: { id: true } });
  await audit(user.id, 'SupplierClaim', c.id, 'supplier_claim.created', { referenceNumber: number, supplier: supplier.name, amount: n2(input.amount), currency, purchaseOrder: po?.number, goodsReceipt: grn?.referenceNumber });
  return { id: c.id, number };
}

async function claimForChange(claimId: string, org: { organisationId?: string }) {
  const c = await prisma.supplierClaim.findFirst({ where: { id: claimId, supplier: org }, select: { id: true, number: true, status: true, raisedById: true, amount: true, currency: true, supplier: { select: { name: true } }, purchaseOrder: { select: { branchId: true } } } });
  if (!c) throw new ProcurementError(NOT_AVAILABLE);
  return c;
}

export async function sendSupplierClaim(claimId: string): Promise<void> {
  const user = await requireUser();
  const c = await claimForChange(claimId, await orgWhere());
  await authorize('procurement.po.manage', c.purchaseOrder ? { branchId: c.purchaseOrder.branchId, homeBranch: true } : undefined, 'supplier_claim.send', 'Only Procurement sends claims to suppliers.');
  if (!canMoveClaim(c.status as SupplierClaimStatus, 'SENT')) throw new ProcurementError(`Claim ${c.number} is ${c.status.toLowerCase()} — it cannot be sent now.`);
  stillAsSeen(await prisma.supplierClaim.updateMany({ where: { id: c.id, status: c.status }, data: { status: 'SENT' } }));
  await audit(user.id, 'SupplierClaim', c.id, 'supplier_claim.sent', { referenceNumber: c.number, supplier: c.supplier.name });
}

/** The supplier's answer, recorded by the Head of Procurement. */
export async function decideSupplierClaim(claimId: string, accepted: boolean, note: string): Promise<void> {
  await refuseDuringAssist('decideSupplierClaim');
  const user = await requireUser();
  const c = await claimForChange(claimId, await orgWhere());
  await authorize('procurement.po.approve', c.purchaseOrder ? { branchId: c.purchaseOrder.branchId, homeBranch: true } : undefined, 'supplier_claim.decide', 'Only the Head of Procurement records the supplier\'s answer.');
  const to = accepted ? 'ACCEPTED' : 'REJECTED';
  if (!canMoveClaim(c.status as SupplierClaimStatus, to)) throw new ProcurementError(`Claim ${c.number} is ${c.status.toLowerCase()} — only a claim with the supplier can be decided.`);
  if (!accepted && note.trim().length < 3) throw new ProcurementError('Note what the supplier said.');
  stillAsSeen(await prisma.supplierClaim.updateMany({ where: { id: c.id, status: 'SENT' }, data: { status: to } }));
  await audit(user.id, 'SupplierClaim', c.id, accepted ? 'supplier_claim.accepted' : 'supplier_claim.rejected', { referenceNumber: c.number, note: clean(note, 500) });
}

export async function settleSupplierClaim(claimId: string, reference: string, amount?: number | null): Promise<void> {
  const user = await requireUser();
  const c = await claimForChange(claimId, await orgWhere());
  await authorize('procurement.po.manage', c.purchaseOrder ? { branchId: c.purchaseOrder.branchId, homeBranch: true } : undefined, 'supplier_claim.settle', 'Only Procurement records settlements.');
  if (!canMoveClaim(c.status as SupplierClaimStatus, 'SETTLED')) throw new ProcurementError(`Claim ${c.number} is ${c.status.toLowerCase()} — only an accepted claim can be settled.`);
  if (reference.trim().length < 2) throw new ProcurementError('Enter the credit note, refund or replacement reference.');
  const settled = amount === null || amount === undefined || Number.isNaN(amount) ? Number(c.amount) : n2(amount);
  if (settled < 0) throw new ProcurementError('The settled amount cannot be negative.');
  stillAsSeen(await prisma.supplierClaim.updateMany({ where: { id: c.id, status: 'ACCEPTED' }, data: { status: 'SETTLED', settledAt: new Date(), reference: reference.trim().slice(0, 120), amount: settled } }));
  await audit(user.id, 'SupplierClaim', c.id, 'supplier_claim.settled', { referenceNumber: c.number, reference: reference.trim(), amount: settled, currency: c.currency });
}

export async function closeSupplierClaim(claimId: string, note: string): Promise<void> {
  const user = await requireUser();
  const c = await claimForChange(claimId, await orgWhere());
  await authorize('procurement.po.manage', c.purchaseOrder ? { branchId: c.purchaseOrder.branchId, homeBranch: true } : undefined, 'supplier_claim.close', 'Only Procurement closes claims.');
  if (!canMoveClaim(c.status as SupplierClaimStatus, 'CLOSED')) throw new ProcurementError(`Claim ${c.number} is already closed.`);
  stillAsSeen(await prisma.supplierClaim.updateMany({ where: { id: c.id, status: c.status }, data: { status: 'CLOSED' } }));
  await audit(user.id, 'SupplierClaim', c.id, 'supplier_claim.closed', { referenceNumber: c.number, note: clean(note, 500) });
}

// ── Home, glance and dashboard ────────────────────────────────────────────

export async function getProcurementHome() {
  await requireUser();
  const reach = await reachWhere('procurement.view');
  const org = await orgWhere();
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [awaiting, openPos, inTransit, atCustoms, dueThisWeek, claimsOpen, suppliers, recentPos, dueShipments] = await Promise.all([
    n(prisma.purchaseRequisition.count({ where: { ...reach, status: 'SUBMITTED' } })),
    n(prisma.purchaseOrder.count({ where: { ...reach, status: { in: OPEN_PO_STATUSES } } })),
    n(prisma.shipment.count({ where: { purchaseOrder: reach, status: { in: ['BOOKED', 'IN_TRANSIT', 'ARRIVED_PORT'] } } })),
    n(prisma.shipment.count({ where: { purchaseOrder: reach, status: 'CUSTOMS' } })),
    n(prisma.purchaseOrder.count({ where: { ...reach, status: { in: ['APPROVED', 'SENT', 'PARTLY_RECEIVED'] }, expectedDate: { gte: new Date(now.getTime() - 86_400_000), lte: weekEnd } } })),
    n(prisma.supplierClaim.count({ where: { supplier: org, status: { in: ['OPEN', 'SENT', 'ACCEPTED'] } } })),
    n(prisma.supplier.count({ where: { ...org, isActive: true } })),
    prisma.purchaseOrder.findMany({ where: { ...reach, status: { in: OPEN_PO_STATUSES } }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, number: true, status: true, currency: true, total: true, expectedDate: true, supplier: { select: { name: true } } } }),
    prisma.shipment.findMany({ where: { purchaseOrder: reach, status: { in: SHIPMENT_IN_FLIGHT } }, orderBy: [{ eta: 'asc' }], take: 8, select: { id: true, number: true, status: true, eta: true, mode: true, purchaseOrder: { select: { number: true, supplier: { select: { name: true } } } } } }),
  ]);
  return { awaiting, openPos, inTransit, atCustoms, dueThisWeek, claimsOpen, suppliers, recentPos, dueShipments };
}

export type ProcurementGlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

export async function getProcurementGlance(): Promise<ProcurementGlanceTile[]> {
  if (!(await allows('procurement.view'))) return [];
  const h = await getProcurementHome();
  return [
    { label: 'Requisitions awaiting approval', value: h.awaiting, hint: 'Submitted, not yet decided', href: '/procurement/requisitions?status=SUBMITTED', tone: h.awaiting ? 'warning' : 'muted' },
    { label: 'Open purchase orders', value: h.openPos, hint: 'Raised, sent or partly received', href: '/procurement/orders?status=open', tone: 'primary' },
    { label: 'Shipments on the way', value: h.inTransit + h.atCustoms, hint: h.atCustoms ? `${h.atCustoms} at customs` : 'Booked, at sea or at port', href: '/procurement/shipments?status=open', tone: h.atCustoms ? 'warning' : 'info' },
  ];
}

export type ProcurementDashboardItem = { id: string; title: string; detail: string; url: string; createdAt: Date };

/** Decisions waiting on this person: requisitions to approve, purchase orders to approve (never their own). */
export async function getProcurementDashboardItems(): Promise<ProcurementDashboardItem[]> {
  if (!(await allows('procurement.view'))) return [];
  const user = await requireUser();
  const p = await getPrincipal();
  const reach = await reachWhere('procurement.view', { lens: false });
  const items: ProcurementDashboardItem[] = [];
  if (await allows('procurement.requisition.approve')) {
    const reqs = await prisma.purchaseRequisition.findMany({ where: { ...reach, status: 'SUBMITTED', ...(p.isSuperAdmin ? {} : { raisedById: { not: user.id } }) }, orderBy: { submittedAt: 'asc' }, take: 20, select: { id: true, number: true, reason: true, submittedAt: true, createdAt: true, raisedBy: { select: { fullName: true } }, _count: { select: { lines: true } } } });
    for (const r of reqs) items.push({ id: `requisition-approve-${r.id}`, title: `Approve requisition ${r.number}`, detail: `${r.raisedBy.fullName} · ${r._count.lines} ${r._count.lines === 1 ? 'line' : 'lines'} · ${r.reason.slice(0, 80)}`, url: `/procurement/requisitions/${r.id}`, createdAt: r.submittedAt ?? r.createdAt });
  }
  if (await allows('procurement.po.approve')) {
    const pos = await prisma.purchaseOrder.findMany({ where: { ...reach, status: 'DRAFT', ...(p.isSuperAdmin ? {} : { raisedById: { not: user.id } }) }, orderBy: { createdAt: 'asc' }, take: 20, select: { id: true, number: true, currency: true, total: true, createdAt: true, supplier: { select: { name: true } }, raisedBy: { select: { fullName: true } } } });
    for (const o of pos) items.push({ id: `po-approve-${o.id}`, title: `Approve purchase order ${o.number}`, detail: `${o.supplier.name} · ${o.currency} ${Number(o.total).toLocaleString('en-NG', { minimumFractionDigits: 2 })} · raised by ${o.raisedBy.fullName}`, url: `/procurement/orders/${o.id}`, createdAt: o.createdAt });
  }
  return items;
}

/** Currencies offered on forms (the supplier's own first). */
export async function currencyOptions(preferred?: string | null): Promise<string[]> {
  await requireUser();
  const list = [...CURRENCIES] as string[];
  if (preferred && !list.includes(preferred)) list.unshift(preferred);
  return list;
}
