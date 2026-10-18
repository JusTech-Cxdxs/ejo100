'use server';

/**
 * Production: build orders (plan → check materials → release → build → close),
 * material issues from the parts warehouse, and every unit's traveller
 * (assembly → software → line check → QA → packing → release to the store).
 * Records are branch-owned (reachWhere('production.view')); every change is a
 * compare-and-set on the status the person saw, and is audited.
 */
import { prisma, type BuildOrderStatus, type BuildPurpose, type CheckStage, type Prisma, type UnitStage } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { allows, authorize, getPrincipal, myOrganisationId, orgWhere, partsOfMyOrganisation, reachWhere, refuse, refuseDuringAssist } from '@/lib/authz/server';
import { getWorkshopBranchId, writeAuditLog } from '@/lib/workshop-core';
import { claimed as stillAsSeen, lockRows } from '@/lib/integrity';
import { nextDocumentNumber, nextSerialNumber } from '@/lib/zinox/numbering';
import { nameOf, userNames } from '@/lib/zinox/people';
import { actorLabel } from '@/lib/assist/rules';
import { lagosDayStart, lagosWeekStart } from '@/lib/enyo/tool-helpers';
import {
  BUILD_OPEN_FOR_ISSUE, BUILD_OPEN_FOR_UNITS, canMoveBuildOrder, canMoveUnit, checklistFromForm, evaluateChecklist, familySerialCode, materialAvailability,
  qaPassRate, reworkNeedsApproval, UNIT_ON_LINE, type BuildOrderStatusCode, type UnitStageCode,
} from '@/lib/production-core';

class ProductionActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionActionError';
  }
}

const fail = (m: string): never => { throw new ProductionActionError(m); };
const NOT_AVAILABLE = 'This record is not available — it may have been removed, or it is outside what you can see.';
const ASSEMBLER_ONLY = 'Only the assembler building this unit (or the line supervisor) can record this station.';
const MANAGER_ONLY = 'Only the Production Manager can do this.';

async function audit(userId: string, action: string, entityType: 'BuildOrder' | 'ProductionUnit', entityId: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

/** The branch this person's production work belongs to: their own, else the first of their organisation. */
export async function getProductionBranchId(): Promise<string> {
  const p = await getPrincipal();
  if (p.branchId && (!p.orgBranchIds || p.orgBranchIds.includes(p.branchId))) return p.branchId;
  if (p.orgBranchIds?.length) return p.orgBranchIds[0]!;
  return getWorkshopBranchId();
}

async function organisationIdOrFail(): Promise<string> {
  const org = await myOrganisationId();
  if (!org) fail('Your account is not placed in an organisation yet — ask an administrator.');
  return org!;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

// ── Build orders: reads ────────────────────────────────────────────────────

const BUILD_STATUSES: BuildOrderStatusCode[] = ['PLANNED', 'MATERIALS_CHECKED', 'RELEASED', 'IN_PROGRESS', 'QA', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED'];
const OPEN_BUILD: BuildOrderStatus[] = ['PLANNED', 'MATERIALS_CHECKED', 'RELEASED', 'IN_PROGRESS', 'QA', 'ON_HOLD'];

export async function listBuildOrders(filter: { status?: string; q?: string; purpose?: string } = {}) {
  await requireUser();
  const q = filter.q?.trim().slice(0, 60);
  const status = filter.status && BUILD_STATUSES.includes(filter.status as BuildOrderStatusCode) ? (filter.status as BuildOrderStatus) : undefined;
  return prisma.buildOrder.findMany({
    where: {
      ...(await reachWhere('production.view')),
      ...(status ? { status } : filter.status === 'open' ? { status: { in: OPEN_BUILD } } : {}),
      ...(filter.purpose === 'TO_STOCK' || filter.purpose === 'FOR_ORDER' ? { purpose: filter.purpose as BuildPurpose } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { configuration: { product: { name: { contains: q, mode: 'insensitive' } } } }, { configuration: { product: { sku: { contains: q, mode: 'insensitive' } } } }, { configuration: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    select: {
      id: true, number: true, status: true, quantity: true, purpose: true, priority: true, dueDate: true, createdAt: true, updatedAt: true, shortageNote: true,
      plannedBy: { select: { fullName: true } },
      configuration: { select: { id: true, name: true, code: true, product: { select: { id: true, name: true, sku: true, family: true } } } },
      _count: { select: { units: true } },
    },
  });
}

export async function getBuildOrder(buildOrderId: string) {
  const user = await requireUser();
  const bo = await prisma.buildOrder.findFirst({
    where: { id: buildOrderId, ...(await reachWhere('production.view', { lens: false })) },
    include: {
      branch: { select: { id: true, name: true } },
      plannedBy: { select: { id: true, fullName: true } },
      salesOrder: { select: { id: true, number: true } },
      project: { select: { id: true, number: true, name: true } },
      configuration: {
        include: {
          product: { select: { id: true, name: true, sku: true, family: true, subBrand: true, source: true } },
          bomLines: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } } } }, orderBy: [{ station: 'asc' }, { part: { name: 'asc' } }] },
          packages: { include: { package: { select: { id: true, name: true, version: true, kind: true } } } },
        },
      },
      materialIssues: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } } }, orderBy: { issuedAt: 'desc' } },
      units: { orderBy: { createdAt: 'asc' }, select: { id: true, number: true, serialNumber: true, stage: true, reworkCount: true, assembledById: true, qaById: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!bo) return null;
  const issuedByPart = new Map<string, number>();
  for (const mi of bo.materialIssues) issuedByPart.set(mi.partId, (issuedByPart.get(mi.partId) ?? 0) + num(mi.quantity));
  const availability = materialAvailability(
    bo.configuration.bomLines.map((l: (typeof bo.configuration.bomLines)[number]) => ({
      partId: l.partId, name: l.part.partNumber ? `${l.part.name} (${l.part.partNumber})` : l.part.name, perUnit: num(l.quantity), isOptional: l.isOptional,
      available: num(l.part.stock?.quantityOnHand) - num(l.part.stock?.quantityReserved), issued: issuedByPart.get(l.partId) ?? 0,
    })),
    bo.quantity,
  );
  const names = await userNames([bo.releasedById, bo.closedById, ...bo.materialIssues.map((m: { issuedById: string }) => m.issuedById), ...bo.units.map((u: { assembledById: string | null }) => u.assembledById)]);
  const onLine = bo.units.filter((u: { stage: UnitStage }) => (UNIT_ON_LINE as string[]).includes(u.stage)).length;
  const released = bo.units.filter((u: { stage: UnitStage }) => u.stage === 'RELEASED').length;
  const scrapped = bo.units.filter((u: { stage: UnitStage }) => u.stage === 'SCRAPPED').length;
  const [canManage, canPlan, canAssemble, canIssue] = await Promise.all([
    allows('production.manage', { branchId: bo.branchId, homeBranch: true }),
    allows('production.build_order.manage', { branchId: bo.branchId, homeBranch: true }),
    allows('production.assemble', { branchId: bo.branchId, assigneeIds: [user.id] }),
    allows('warehouse.parts.operate', { branchId: bo.branchId }).then(async (ok) => ok || allows('production.build_order.manage', { branchId: bo.branchId, homeBranch: true })),
  ]);
  return {
    ...bo,
    availability,
    counts: { onLine, released, scrapped, started: bo.units.length - scrapped, remaining: Math.max(0, bo.quantity - (bo.units.length - scrapped)) },
    names: { releasedBy: nameOf(names, bo.releasedById), closedBy: nameOf(names, bo.closedById) },
    materialIssues: bo.materialIssues.map((m: (typeof bo.materialIssues)[number]) => ({ ...m, quantity: num(m.quantity), issuedByName: nameOf(names, m.issuedById) })),
    units: bo.units.map((u: (typeof bo.units)[number]) => ({ ...u, assembledByName: nameOf(names, u.assembledById) })),
    can: {
      manage: canManage, plan: canPlan, assemble: canAssemble, issue: canIssue,
      release: canManage && bo.status === 'MATERIALS_CHECKED' && bo.plannedById !== user.id,
      selfRelease: canManage && bo.status === 'MATERIALS_CHECKED' && bo.plannedById === user.id,
      startUnit: canAssemble && (BUILD_OPEN_FOR_UNITS as string[]).includes(bo.status) && bo.units.length - scrapped < bo.quantity,
      issueMaterials: canIssue && (BUILD_OPEN_FOR_ISSUE as string[]).includes(bo.status),
    },
    viewerId: user.id,
  };
}

export async function getBuildOrderAuditTrail(buildOrderId: string) {
  await requireUser();
  const visibleId = (await prisma.buildOrder.findFirst({ where: { id: buildOrderId, ...(await reachWhere('production.view', { lens: false })) }, select: { id: true } }))?.id ?? '__no_access__';
  return auditEntries('BuildOrder', visibleId);
}

async function auditEntries(entityType: 'BuildOrder' | 'ProductionUnit', entityId: string) {
  const entries = await prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 80, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(name.get(e.userId) ?? null, e.metadata) : null }));
}

/** The module home: build orders by status, units at each stage today, QA pass rate this week. */
export async function getProductionSummary() {
  await requireUser();
  const reach = await reachWhere('production.view');
  const today = lagosDayStart();
  const week = lagosWeekStart();
  const [byStatus, byStage, movedToday, qaThisWeek, reworkQueue, dueSoon] = await Promise.all([
    prisma.buildOrder.groupBy({ by: ['status'], where: reach, _count: { _all: true } }),
    prisma.productionUnit.groupBy({ by: ['stage'], where: { ...reach, stage: { in: UNIT_ON_LINE as UnitStage[] } }, _count: { _all: true } }),
    prisma.productionUnit.count({ where: { ...reach, updatedAt: { gte: today } } }),
    prisma.productionUnit.findMany({ where: { ...reach, qaAt: { gte: week } }, select: { qaPassed: true } }),
    prisma.productionUnit.count({ where: { ...reach, stage: 'REWORK' } }),
    prisma.buildOrder.count({ where: { ...reach, status: { in: OPEN_BUILD }, dueDate: { lte: new Date(today.getTime() + 7 * 86_400_000) } } }),
  ]);
  const statuses: Partial<Record<BuildOrderStatusCode, number>> = {};
  for (const r of byStatus) statuses[r.status as BuildOrderStatusCode] = r._count._all;
  const stages: Partial<Record<UnitStageCode, number>> = {};
  for (const r of byStage) stages[r.stage as UnitStageCode] = r._count._all;
  const open = OPEN_BUILD.reduce((n, s) => n + (statuses[s as BuildOrderStatusCode] ?? 0), 0);
  return { statuses, stages, open, movedToday, qaPassRate: qaPassRate(qaThisWeek.map((u: { qaPassed: boolean | null }) => u.qaPassed)), qaTested: qaThisWeek.length, reworkQueue, dueSoon, unitsOnLine: Object.values(stages).reduce((a, b) => a + (b ?? 0), 0) };
}

/** Counts for the dashboard's "At a glance" tiles. */
export async function getProductionGlance(): Promise<{ openBuildOrders: number; unitsOnLine: number; awaitingQa: number; rework: number; awaitingRelease: number }> {
  await requireUser();
  const reach = await reachWhere('production.view');
  const [openBuildOrders, unitsOnLine, awaitingQa, rework, awaitingRelease] = await Promise.all([
    prisma.buildOrder.count({ where: { ...reach, status: { in: OPEN_BUILD } } }),
    prisma.productionUnit.count({ where: { ...reach, stage: { in: UNIT_ON_LINE as UnitStage[] } } }),
    prisma.productionUnit.count({ where: { ...reach, stage: 'QA' } }),
    prisma.productionUnit.count({ where: { ...reach, stage: 'REWORK' } }),
    prisma.buildOrder.count({ where: { ...reach, status: 'MATERIALS_CHECKED' } }),
  ]);
  return { openBuildOrders, unitsOnLine, awaitingQa, rework, awaitingRelease };
}

/** Things waiting on this person: build orders to release, units to test, rework to approve. */
export async function getProductionDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const user = await requireUser();
  const [canManage, canQa] = await Promise.all([allows('production.manage'), allows('production.qa')]);
  if (!canManage && !canQa) return [];
  const reach = await reachWhere('production.view');
  const out: { id: string; title: string; detail: string; url: string; createdAt: Date }[] = [];
  if (canManage) {
    const orders = await prisma.buildOrder.findMany({
      where: { ...reach, status: 'MATERIALS_CHECKED', NOT: { plannedById: user.id } }, orderBy: { updatedAt: 'desc' }, take: 10,
      select: { id: true, number: true, quantity: true, updatedAt: true, shortageNote: true, configuration: { select: { name: true, product: { select: { name: true } } } } },
    });
    for (const o of orders) out.push({ id: `build-release-${o.id}`, title: `Release build order ${o.number} to the line`, detail: `${o.quantity} × ${o.configuration.product.name} — ${o.configuration.name}${o.shortageNote ? ' · shortages noted' : ' · materials available'}`, url: `/production/build-orders/${o.id}`, createdAt: o.updatedAt });
    const rework = await prisma.productionUnit.findMany({
      where: { ...reach, stage: 'REWORK', reworkCount: { gte: 2 } }, orderBy: { updatedAt: 'desc' }, take: 10,
      select: { id: true, serialNumber: true, reworkCount: true, reworkNotes: true, updatedAt: true, product: { select: { name: true } } },
    });
    for (const u of rework) out.push({ id: `rework-approve-${u.id}`, title: `Approve rework of ${u.serialNumber}`, detail: `${u.product.name} · rework ${u.reworkCount}${u.reworkNotes ? ` · ${u.reworkNotes.slice(0, 80)}` : ''}`, url: `/production/units/${u.id}`, createdAt: u.updatedAt });
  }
  if (canQa) {
    const units = await prisma.productionUnit.findMany({
      where: { ...reach, stage: 'QA', NOT: { assembledById: user.id } }, orderBy: { updatedAt: 'asc' }, take: 10,
      select: { id: true, serialNumber: true, updatedAt: true, product: { select: { name: true } }, buildOrder: { select: { number: true } } },
    });
    for (const u of units) out.push({ id: `unit-qa-${u.id}`, title: `QA test ${u.serialNumber}`, detail: `${u.product.name}${u.buildOrder ? ` · ${u.buildOrder.number}` : ''}`, url: `/production/units/${u.id}`, createdAt: u.updatedAt });
  }
  return out;
}

// ── Build orders: writes ───────────────────────────────────────────────────

export type BuildOrderInput = { configurationId: string; quantity: number; purpose: string; dueDate?: string | null; instructions?: string; priority?: number };

export async function createBuildOrder(input: BuildOrderInput): Promise<{ id: string; number: string }> {
  const branchId = await getProductionBranchId();
  await authorize('production.build_order.manage', { branchId, homeBranch: true }, 'createBuildOrder', 'Only Production Planning can create build orders.');
  const user = await requireUser();
  const organisationId = await organisationIdOrFail();
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) fail('Enter how many units to build (1 or more).');
  if (input.purpose !== 'TO_STOCK' && input.purpose !== 'FOR_ORDER') fail('Say whether the build is to stock or for an order.');
  const configuration = await prisma.productConfiguration.findFirst({ where: { id: input.configurationId, isActive: true, product: { ...(await orgWhere()), isActive: true } }, select: { id: true, name: true, code: true, product: { select: { name: true, sku: true } } } });
  if (!configuration) fail('Choose the configuration to build.');
  let dueDate: Date | null = null;
  if (input.dueDate) {
    dueDate = new Date(`${input.dueDate}T00:00:00+01:00`);
    if (Number.isNaN(dueDate.getTime())) fail('Enter the due date as a date.');
  }
  const priority = input.priority && input.priority >= 1 && input.priority <= 5 ? Math.round(input.priority) : 3;
  const number = await nextDocumentNumber('BLD', organisationId);
  const created = await prisma.buildOrder.create({
    data: { number, branchId, configurationId: configuration!.id, quantity: input.quantity, purpose: input.purpose as BuildPurpose, dueDate, priority, instructions: input.instructions?.trim().slice(0, 2000) || null, plannedById: user.id },
    select: { id: true, number: true },
  });
  await audit(user.id, 'build_order.created', 'BuildOrder', created.id, { referenceNumber: number, quantity: input.quantity, configuration: `${configuration!.product.sku}-${configuration!.code}`, product: configuration!.product.name, purpose: input.purpose });
  return created;
}

async function buildOrderForChange(buildOrderId: string) {
  const bo = await prisma.buildOrder.findFirst({ where: { id: buildOrderId, ...(await reachWhere('production.view', { lens: false })) }, select: { id: true, number: true, status: true, branchId: true, plannedById: true, quantity: true, configurationId: true } });
  if (!bo) fail(NOT_AVAILABLE);
  return bo!;
}

/** Planning checks BOM × quantity against the parts warehouse and notes any shortages. */
export async function checkBuildOrderMaterials(buildOrderId: string): Promise<{ ok: boolean; note: string | null }> {
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.build_order.manage', { branchId: bo.branchId, homeBranch: true }, 'checkBuildOrderMaterials', 'Only Production Planning can check materials.');
  const user = await requireUser();
  if (!canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'MATERIALS_CHECKED')) fail(`Materials are checked on a planned build order (this one is ${bo.status.toLowerCase().replace(/_/g, ' ')}).`);
  const full = await getBuildOrder(bo.id);
  if (!full) fail(NOT_AVAILABLE);
  const { ok, note } = full!.availability;
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'MATERIALS_CHECKED', shortageNote: note } }));
  await audit(user.id, 'build_order.materials_checked', 'BuildOrder', bo.id, { referenceNumber: bo.number, ok, shortageNote: note });
  return { ok, note };
}

/** The Production Manager releases a checked build order to the line — never one they planned themselves. */
export async function releaseBuildOrder(buildOrderId: string): Promise<void> {
  await refuseDuringAssist('releaseBuildOrder');
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.manage', { branchId: bo.branchId, homeBranch: true }, 'releaseBuildOrder', MANAGER_ONLY);
  const user = await requireUser();
  if (bo.plannedById === user.id) await refuse('production.manage', 'releaseBuildOrder', 'You planned this build order — another Production Manager must release it to the line.');
  if (!canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'RELEASED')) fail('Check the materials before releasing a build order to the line.');
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'RELEASED', releasedById: user.id, releasedAt: new Date() } }));
  await audit(user.id, 'build_order.released', 'BuildOrder', bo.id, { referenceNumber: bo.number });
}

export async function holdBuildOrder(buildOrderId: string, reason: string): Promise<void> {
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.manage', { branchId: bo.branchId, homeBranch: true }, 'holdBuildOrder', MANAGER_ONLY);
  const user = await requireUser();
  const why = reason.trim().slice(0, 500);
  if (why.length < 3) fail('Say why the build order is on hold.');
  if (!canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'ON_HOLD')) fail('Only a released or running build order can be put on hold.');
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'ON_HOLD', holdReason: why } }));
  await audit(user.id, 'build_order.held', 'BuildOrder', bo.id, { referenceNumber: bo.number, reason: why });
}

export async function resumeBuildOrder(buildOrderId: string): Promise<void> {
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.manage', { branchId: bo.branchId, homeBranch: true }, 'resumeBuildOrder', MANAGER_ONLY);
  const user = await requireUser();
  if (bo.status !== 'ON_HOLD') fail('This build order is not on hold.');
  const started = await prisma.productionUnit.count({ where: { buildOrderId: bo.id } });
  const next: BuildOrderStatus = started > 0 ? 'IN_PROGRESS' : 'RELEASED';
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: 'ON_HOLD' }, data: { status: next, holdReason: null } }));
  await audit(user.id, 'build_order.resumed', 'BuildOrder', bo.id, { referenceNumber: bo.number, status: next });
}

export async function completeBuildOrder(buildOrderId: string): Promise<void> {
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.manage', { branchId: bo.branchId, homeBranch: true }, 'completeBuildOrder', MANAGER_ONLY);
  const user = await requireUser();
  if (!canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'COMPLETED')) fail('Only a running build order can be completed.');
  const onLine = await prisma.productionUnit.count({ where: { buildOrderId: bo.id, stage: { in: UNIT_ON_LINE as UnitStage[] } } });
  if (onLine > 0) fail(`${onLine} ${onLine === 1 ? 'unit is' : 'units are'} still on the line — release or scrap them first.`);
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'COMPLETED', completedAt: new Date() } }));
  await audit(user.id, 'build_order.completed', 'BuildOrder', bo.id, { referenceNumber: bo.number });
}

export async function closeBuildOrder(buildOrderId: string): Promise<void> {
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.manage', { branchId: bo.branchId, homeBranch: true }, 'closeBuildOrder', MANAGER_ONLY);
  const user = await requireUser();
  if (!canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'CLOSED')) fail('A build order is closed once it is completed.');
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'CLOSED', closedById: user.id, closedAt: new Date() } }));
  await audit(user.id, 'build_order.closed', 'BuildOrder', bo.id, { referenceNumber: bo.number });
}

export async function cancelBuildOrder(buildOrderId: string, reason: string): Promise<void> {
  const bo = await buildOrderForChange(buildOrderId);
  await authorize('production.build_order.manage', { branchId: bo.branchId, homeBranch: true }, 'cancelBuildOrder', 'Only Production Planning or the Production Manager can cancel a build order.');
  const user = await requireUser();
  const why = reason.trim().slice(0, 500);
  if (why.length < 3) fail('Say why the build order is cancelled.');
  if (!canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'CANCELLED')) fail('A build order with units on the line cannot be cancelled — put it on hold or complete it.');
  if (await prisma.productionUnit.count({ where: { buildOrderId: bo.id } })) fail('Units have already been started on this build order — it cannot be cancelled.');
  stillAsSeen(await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'CANCELLED', holdReason: why } }));
  await audit(user.id, 'build_order.cancelled', 'BuildOrder', bo.id, { referenceNumber: bo.number, reason: why });
}

/** The parts warehouse issues components to the line: the running stock total goes down under a row lock. */
export async function issueMaterials(buildOrderId: string, input: { partId: string; quantity: number; lotOrSerials?: string; notes?: string }): Promise<void> {
  const bo = await buildOrderForChange(buildOrderId);
  const mayIssue = (await allows('warehouse.parts.operate', { branchId: bo.branchId })) || (await allows('production.build_order.manage', { branchId: bo.branchId, homeBranch: true }));
  if (!mayIssue) await refuse('warehouse.parts.operate', 'issueMaterials', 'Only the parts warehouse (or Production Planning) can issue materials to the line.');
  const user = await requireUser();
  if (!(BUILD_OPEN_FOR_ISSUE as string[]).includes(bo.status)) fail('Materials are issued against a build order released to the line.');
  const quantity = Math.round(input.quantity * 1000) / 1000;
  if (!Number.isFinite(quantity) || quantity <= 0) fail('Enter the quantity issued (more than 0).');
  const part = await prisma.part.findFirst({ where: { id: input.partId, isActive: true, ...(await partsOfMyOrganisation()) }, select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } });
  if (!part) fail('Choose a part from the components warehouse.');
  const onBom = await prisma.bomLine.findFirst({ where: { configurationId: bo.configurationId, partId: part!.id }, select: { id: true } });
  const lot = input.lotOrSerials?.trim().slice(0, 500) || null;
  const notes = input.notes?.trim().slice(0, 500) || null;
  const issue = await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'partStockByPart', [part!.id]);
    const stock = await tx.partStock.findUnique({ where: { partId: part!.id }, select: { quantityOnHand: true, quantityReserved: true } });
    const free = num(stock?.quantityOnHand) - num(stock?.quantityReserved);
    if (!stock || free < quantity) fail(`Only ${Math.max(0, free)} ${part!.baseUnitOfMeasure} of ${part!.name} ${free === 1 ? 'is' : 'are'} free in the warehouse.`);
    stillAsSeen(await tx.partStock.updateMany({ where: { partId: part!.id, quantityOnHand: stock!.quantityOnHand }, data: { quantityOnHand: { decrement: quantity } } }));
    return tx.materialIssue.create({ data: { buildOrderId: bo.id, partId: part!.id, quantity, lotOrSerials: lot, notes, issuedById: user.id }, select: { id: true } });
  });
  await audit(user.id, 'build_order.materials_issued', 'BuildOrder', bo.id, { referenceNumber: bo.number, issueId: issue.id, part: part!.partNumber ?? part!.name, quantity, unit: part!.baseUnitOfMeasure, lotOrSerials: lot, onBom: Boolean(onBom) });
}

// ── Units: reads ───────────────────────────────────────────────────────────

const UNIT_STAGES: UnitStageCode[] = ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'REWORK', 'PACKING', 'RELEASED', 'SCRAPPED'];

export async function listUnits(filter: { stage?: string; q?: string; buildOrderId?: string } = {}) {
  await requireUser();
  const q = filter.q?.trim().slice(0, 60);
  const stage = filter.stage && UNIT_STAGES.includes(filter.stage as UnitStageCode) ? (filter.stage as UnitStage) : undefined;
  const rows = await prisma.productionUnit.findMany({
    where: {
      ...(await reachWhere('production.view')),
      ...(stage ? { stage } : filter.stage === 'line' ? { stage: { in: UNIT_ON_LINE as UnitStage[] } } : {}),
      ...(filter.buildOrderId ? { buildOrderId: filter.buildOrderId } : {}),
      ...(q ? { OR: [{ serialNumber: { contains: q, mode: 'insensitive' } }, { number: { contains: q, mode: 'insensitive' } }, { buildOrder: { number: { contains: q, mode: 'insensitive' } } }, { product: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 300,
    select: {
      id: true, number: true, serialNumber: true, stage: true, reworkCount: true, assembledById: true, lineCheckedById: true, qaById: true, packedById: true, qaPassed: true, createdAt: true, updatedAt: true,
      product: { select: { id: true, name: true, sku: true, family: true } }, configuration: { select: { name: true, code: true } }, buildOrder: { select: { id: true, number: true } },
    },
  });
  const names = await userNames(rows.flatMap((u: (typeof rows)[number]) => [u.assembledById, u.lineCheckedById, u.qaById, u.packedById]));
  return rows.map((u: (typeof rows)[number]) => ({ ...u, assembledByName: nameOf(names, u.assembledById), qaByName: nameOf(names, u.qaById), lineCheckedByName: nameOf(names, u.lineCheckedById), packedByName: nameOf(names, u.packedById) }));
}

/** The checklist the line or QA works from for a product family (family-specific items plus the ones for every family). */
export async function getCheckTemplatesFor(family: string, stage: 'LINE_CHECK' | 'QA'): Promise<string[]> {
  await requireUser();
  const rows = await prisma.checkTemplate.findMany({
    where: { ...(await orgWhere()), stage: stage as CheckStage, isActive: true, OR: [{ family: family as never }, { family: null }] },
    orderBy: [{ family: 'asc' }, { sortOrder: 'asc' }, { item: 'asc' }], select: { item: true },
  });
  return [...new Set(rows.map((r: { item: string }) => r.item))];
}

export async function getUnit(unitId: string) {
  const user = await requireUser();
  const u = await prisma.productionUnit.findFirst({
    where: { id: unitId, ...(await reachWhere('production.view', { lens: false })) },
    include: {
      branch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true, family: true, subBrand: true, serialised: true, defaultWarrantyMonths: true } },
      configuration: { select: { id: true, name: true, code: true, specs: true, packages: { include: { package: { select: { id: true, name: true, version: true, kind: true } } } }, bomLines: { include: { part: { select: { id: true, name: true, partNumber: true } } } } } },
      buildOrder: { select: { id: true, number: true, instructions: true, purpose: true, status: true } },
      components: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } } }, orderBy: { fittedAt: 'asc' } },
      checks: { orderBy: [{ checkedAt: 'asc' }, { id: 'asc' }] },
      finishedUnit: { select: { id: true, status: true, location: { select: { id: true, name: true } } } },
    },
  });
  if (!u) return null;
  const names = await userNames([u.assembledById, u.imagedById, u.lineCheckedById, u.qaById, u.packedById, u.releasedById, ...u.components.map((c: { fittedById: string | null }) => c.fittedById), ...u.checks.map((c: { checkedById: string }) => c.checkedById)]);
  const [lineItems, qaItems] = await Promise.all([getCheckTemplatesFor(u.product.family, 'LINE_CHECK'), getCheckTemplatesFor(u.product.family, 'QA')]);
  const [isSupervisor, isAssembler, canQa, canManage] = await Promise.all([
    allows('production.line_check', { branchId: u.branchId, homeBranch: true }),
    allows('production.assemble', { branchId: u.branchId, assigneeIds: [u.assembledById] }),
    allows('production.qa', { branchId: u.branchId, homeBranch: true }),
    allows('production.manage', { branchId: u.branchId, homeBranch: true }),
  ]);
  const canWorkStation = isSupervisor || isAssembler;
  return {
    ...u,
    burnInHours: u.burnInHours === null ? null : num(u.burnInHours),
    names: {
      assembledBy: nameOf(names, u.assembledById), imagedBy: nameOf(names, u.imagedById), lineCheckedBy: nameOf(names, u.lineCheckedById), qaBy: nameOf(names, u.qaById),
      packedBy: nameOf(names, u.packedById), releasedBy: nameOf(names, u.releasedById),
    },
    components: u.components.map((c: (typeof u.components)[number]) => ({ ...c, fittedByName: nameOf(names, c.fittedById) })),
    checks: u.checks.map((c: (typeof u.checks)[number]) => ({ ...c, checkedByName: nameOf(names, c.checkedById) })),
    templates: { LINE_CHECK: lineItems, QA: qaItems },
    can: {
      assemble: canWorkStation && (u.stage === 'ASSEMBLY' || u.stage === 'REWORK'),
      markAssembled: canWorkStation && u.stage === 'ASSEMBLY',
      software: canWorkStation && u.stage === 'SOFTWARE',
      lineCheck: isSupervisor && u.stage === 'LINE_CHECK',
      qa: canQa && u.stage === 'QA' && u.assembledById !== user.id,
      qaIsAssembler: canQa && u.stage === 'QA' && u.assembledById === user.id,
      reworkDone: canWorkStation && u.stage === 'REWORK' && !reworkNeedsApproval(u.reworkCount),
      approveRework: canManage && u.stage === 'REWORK' && reworkNeedsApproval(u.reworkCount),
      reworkWaitsForManager: u.stage === 'REWORK' && reworkNeedsApproval(u.reworkCount),
      pack: canWorkStation && u.stage === 'PACKING',
      release: canManage && u.stage === 'PACKING',
      scrap: canManage && u.stage !== 'RELEASED' && u.stage !== 'SCRAPPED',
    },
    viewerId: user.id,
  };
}

export async function getUnitAuditTrail(unitId: string) {
  await requireUser();
  const visibleId = (await prisma.productionUnit.findFirst({ where: { id: unitId, ...(await reachWhere('production.view', { lens: false })) }, select: { id: true } }))?.id ?? '__no_access__';
  return auditEntries('ProductionUnit', visibleId);
}

/** Today's board: units per stage with who is on them, and the rework queue. */
export async function getLineBoard() {
  await requireUser();
  const reach = await reachWhere('production.view');
  const today = lagosDayStart();
  const units = await prisma.productionUnit.findMany({
    where: { ...reach, OR: [{ stage: { in: UNIT_ON_LINE as UnitStage[] } }, { stage: { in: ['RELEASED', 'SCRAPPED'] }, updatedAt: { gte: today } }] },
    orderBy: [{ updatedAt: 'desc' }], take: 400,
    select: {
      id: true, serialNumber: true, number: true, stage: true, reworkCount: true, reworkNotes: true, assembledById: true, imagedById: true, lineCheckedById: true, qaById: true, packedById: true, updatedAt: true, createdAt: true,
      product: { select: { name: true } }, configuration: { select: { name: true } }, buildOrder: { select: { id: true, number: true } },
    },
  });
  const names = await userNames(units.flatMap((u: (typeof units)[number]) => [u.assembledById, u.imagedById, u.lineCheckedById, u.qaById, u.packedById]));
  const onStation = (u: (typeof units)[number]): string | null => {
    const id = u.stage === 'ASSEMBLY' || u.stage === 'REWORK' ? u.assembledById : u.stage === 'SOFTWARE' ? u.imagedById ?? u.assembledById : u.stage === 'LINE_CHECK' ? u.lineCheckedById : u.stage === 'QA' ? u.qaById : u.stage === 'PACKING' ? u.packedById ?? u.assembledById : null;
    return nameOf(names, id);
  };
  const rows = units.map((u: (typeof units)[number]) => ({ ...u, who: onStation(u), assembledByName: nameOf(names, u.assembledById) }));
  const byStage: Record<UnitStageCode, typeof rows> = { ASSEMBLY: [], SOFTWARE: [], LINE_CHECK: [], QA: [], REWORK: [], PACKING: [], RELEASED: [], SCRAPPED: [] };
  for (const r of rows) byStage[r.stage as UnitStageCode].push(r);
  const startedToday = rows.filter((r: (typeof rows)[number]) => r.createdAt >= today).length;
  return { byStage, startedToday, releasedToday: byStage.RELEASED.length, rework: byStage.REWORK, onLine: rows.filter((r: (typeof rows)[number]) => (UNIT_ON_LINE as string[]).includes(r.stage)).length };
}

// ── Units: writes ──────────────────────────────────────────────────────────

/** An assembler starts a unit: it gets its serial when the chassis is closed, and the build order is now in progress. */
export async function startUnit(buildOrderId: string): Promise<{ id: string; serialNumber: string }> {
  const bo = await buildOrderForChange(buildOrderId);
  const user = await requireUser();
  // The assembler starts a unit for themselves (their own assignment); the line supervisor may start one for the line.
  await authorize('production.assemble', { branchId: bo.branchId, assigneeIds: [user.id] }, 'startUnit', 'Only the line can start units.');
  if (!(BUILD_OPEN_FOR_UNITS as string[]).includes(bo.status)) fail('Units are started on a build order released to the line.');
  const organisationId = await organisationIdOrFail();
  const configuration = await prisma.productConfiguration.findUnique({ where: { id: bo.configurationId }, select: { id: true, productId: true, product: { select: { family: true } } } });
  if (!configuration) fail(NOT_AVAILABLE);
  const started = await prisma.productionUnit.count({ where: { buildOrderId: bo.id, NOT: { stage: 'SCRAPPED' } } });
  if (started >= bo.quantity) fail(`All ${bo.quantity} units of this build order have been started.`);
  const [number, serialNumber] = await Promise.all([nextDocumentNumber('UNT', organisationId), nextSerialNumber(organisationId, familySerialCode(configuration!.product.family))]);
  const unit = await prisma.productionUnit.create({
    data: { number, serialNumber, branchId: bo.branchId, buildOrderId: bo.id, productId: configuration!.productId, configurationId: configuration!.id, stage: 'ASSEMBLY', assembledById: user.id },
    select: { id: true, serialNumber: true },
  });
  if (bo.status === 'RELEASED') await prisma.buildOrder.updateMany({ where: { id: bo.id, status: 'RELEASED' }, data: { status: 'IN_PROGRESS' } });
  await audit(user.id, 'production_unit.started', 'ProductionUnit', unit.id, { referenceNumber: number, serialNumber, buildOrder: bo.number });
  await audit(user.id, 'build_order.unit_started', 'BuildOrder', bo.id, { referenceNumber: bo.number, serialNumber, started: started + 1, of: bo.quantity });
  return unit;
}

type UnitForChange = { id: string; number: string; serialNumber: string; stage: UnitStage; branchId: string; buildOrderId: string | null; assembledById: string | null; reworkCount: number; productId: string; configurationId: string | null; product: { family: string } };

async function unitForChange(unitId: string): Promise<UnitForChange> {
  const u = await prisma.productionUnit.findFirst({
    where: { id: unitId, ...(await reachWhere('production.view', { lens: false })) },
    select: { id: true, number: true, serialNumber: true, stage: true, branchId: true, buildOrderId: true, assembledById: true, reworkCount: true, productId: true, configurationId: true, product: { select: { family: true } } },
  });
  if (!u) fail(NOT_AVAILABLE);
  return u!;
}

/** A component fitted into the unit (part, and its serial or lot) — the trace a warranty claim follows years later. */
export async function recordUnitComponent(unitId: string, input: { partId: string; serialNumber?: string; lotNumber?: string }): Promise<void> {
  const unit = await unitForChange(unitId);
  if (!(await allows('production.line_check', { branchId: unit.branchId, homeBranch: true }))) await authorize('production.assemble', { branchId: unit.branchId, assigneeIds: [unit.assembledById] }, 'recordUnitComponent', ASSEMBLER_ONLY);
  const user = await requireUser();
  if (unit.stage !== 'ASSEMBLY' && unit.stage !== 'REWORK') fail('Components are recorded at the assembly station (or during rework).');
  const part = await prisma.part.findFirst({ where: { id: input.partId, isActive: true, ...(await partsOfMyOrganisation()) }, select: { id: true, name: true, partNumber: true } });
  if (!part) fail('Choose a part from the components warehouse.');
  const serial = input.serialNumber?.trim().slice(0, 80) || null;
  const lot = input.lotNumber?.trim().slice(0, 80) || null;
  if (serial && (await prisma.unitComponent.findFirst({ where: { partId: part!.id, serialNumber: serial, NOT: { unitId: unit.id } }, select: { id: true } }))) fail(`Serial ${serial} of ${part!.name} is already recorded in another unit.`);
  const c = await prisma.unitComponent.create({ data: { unitId: unit.id, partId: part!.id, serialNumber: serial, lotNumber: lot, fittedById: user.id }, select: { id: true } });
  await audit(user.id, 'production_unit.component_fitted', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, componentId: c.id, part: part!.partNumber ?? part!.name, componentSerial: serial, lot });
}

export async function markUnitAssembled(unitId: string): Promise<void> {
  const unit = await unitForChange(unitId);
  if (!(await allows('production.line_check', { branchId: unit.branchId, homeBranch: true }))) await authorize('production.assemble', { branchId: unit.branchId, assigneeIds: [unit.assembledById] }, 'markUnitAssembled', ASSEMBLER_ONLY);
  const user = await requireUser();
  if (!canMoveUnit(unit.stage as UnitStageCode, 'SOFTWARE')) fail('This unit is not at the assembly station.');
  stillAsSeen(await prisma.productionUnit.updateMany({ where: { id: unit.id, stage: unit.stage }, data: { stage: 'SOFTWARE', assembledById: unit.assembledById ?? user.id, assembledAt: new Date() } }));
  await audit(user.id, 'production_unit.assembled', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber });
}

/** The software image and packages installed; the unit moves to the line check. */
export async function recordUnitSoftware(unitId: string, input: { imageNote?: string; packageIds?: string[] }): Promise<void> {
  const unit = await unitForChange(unitId);
  if (!(await allows('production.line_check', { branchId: unit.branchId, homeBranch: true }))) await authorize('production.assemble', { branchId: unit.branchId, assigneeIds: [unit.assembledById] }, 'recordUnitSoftware', ASSEMBLER_ONLY);
  const user = await requireUser();
  if (!canMoveUnit(unit.stage as UnitStageCode, 'LINE_CHECK') || unit.stage !== 'SOFTWARE') fail('This unit is not at the software station.');
  const packages = input.packageIds?.length ? await prisma.softwarePackage.findMany({ where: { id: { in: input.packageIds.slice(0, 50) }, ...(await orgWhere()) }, select: { name: true, version: true } }) : [];
  const installed = packages.map((p: { name: string; version: string | null }) => (p.version ? `${p.name} ${p.version}` : p.name));
  const note = input.imageNote?.trim().slice(0, 300) || null;
  stillAsSeen(await prisma.productionUnit.updateMany({ where: { id: unit.id, stage: unit.stage }, data: { stage: 'LINE_CHECK', imagedById: user.id, imagedAt: new Date() } }));
  await audit(user.id, 'production_unit.software_installed', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, image: note, packages: installed });
}

/** The line supervisor's checklist — one submit: all PASS → QA; any FAIL → rework. */
export async function recordLineCheck(unitId: string, answers: Record<string, string | undefined>, notes: Record<string, string | undefined> = {}): Promise<{ passed: boolean; failed: string[] }> {
  const unit = await unitForChange(unitId);
  await authorize('production.line_check', { branchId: unit.branchId, homeBranch: true }, 'recordLineCheck', 'Only the Line Supervisor checks units.');
  const user = await requireUser();
  if (unit.stage !== 'LINE_CHECK') fail('This unit is not waiting for the line check.');
  const items = await getCheckTemplatesFor(unit.product.family, 'LINE_CHECK');
  const form = checklistFromForm(items, answers, notes);
  const answered = form.ok ? form.answers : fail(`Answer every item: ${form.missing.join(', ')}.`);
  const result = evaluateChecklist(answered);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.productionUnit.updateMany({
      where: { id: unit.id, stage: 'LINE_CHECK' },
      data: result.passed
        ? { stage: 'QA', lineCheckedById: user.id, lineCheckedAt: now, lineCheckPassed: true }
        : { stage: 'REWORK', lineCheckedById: user.id, lineCheckedAt: now, lineCheckPassed: false, reworkCount: { increment: 1 }, reworkNotes: `Line check: ${result.failed.join(', ')}` },
    }));
    if (answered.length) await tx.unitCheck.createMany({ data: answered.map((a) => ({ unitId: unit.id, stage: 'LINE_CHECK' as CheckStage, item: a.item, result: a.result, note: a.note ?? null, checkedById: user.id, checkedAt: now })) });
  });
  await audit(user.id, result.passed ? 'production_unit.line_check_passed' : 'production_unit.line_check_failed', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, failed: result.failed, items: answered.length });
  return { passed: result.passed, failed: result.failed };
}

/** The QA inspector's test — never the person who built the unit. Pass → packing; fail → rework. */
export async function recordQaTest(unitId: string, answers: Record<string, string | undefined>, opts: { burnInHours?: number | null; notes?: string; itemNotes?: Record<string, string | undefined> } = {}): Promise<{ passed: boolean; failed: string[] }> {
  const unit = await unitForChange(unitId);
  await authorize('production.qa', { branchId: unit.branchId, homeBranch: true }, 'recordQaTest', 'Only a QA Inspector tests units.');
  const user = await requireUser();
  if (unit.assembledById === user.id) await refuse('production.qa', 'recordQaTest', 'You built this unit — another QA Inspector must test it.');
  if (unit.stage !== 'QA') fail('This unit is not waiting for QA.');
  const items = await getCheckTemplatesFor(unit.product.family, 'QA');
  const form = checklistFromForm(items, answers, opts.itemNotes ?? {});
  const answered = form.ok ? form.answers : fail(`Answer every item: ${form.missing.join(', ')}.`);
  const result = evaluateChecklist(answered);
  const burnIn = opts.burnInHours === null || opts.burnInHours === undefined ? null : opts.burnInHours;
  if (burnIn !== null && (!Number.isFinite(burnIn) || burnIn < 0 || burnIn > 999)) fail('Burn-in hours is a number from 0 to 999.');
  const qaNotes = opts.notes?.trim().slice(0, 1000) || null;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.productionUnit.updateMany({
      where: { id: unit.id, stage: 'QA' },
      data: result.passed
        ? { stage: 'PACKING', qaById: user.id, qaAt: now, qaPassed: true, qaNotes, burnInHours: burnIn }
        : { stage: 'REWORK', qaById: user.id, qaAt: now, qaPassed: false, qaNotes, burnInHours: burnIn, reworkCount: { increment: 1 }, reworkNotes: `QA: ${result.failed.join(', ')}${qaNotes ? ` — ${qaNotes}` : ''}` },
    }));
    if (answered.length) await tx.unitCheck.createMany({ data: answered.map((a) => ({ unitId: unit.id, stage: 'QA' as CheckStage, item: a.item, result: a.result, note: a.note ?? null, checkedById: user.id, checkedAt: now })) });
  });
  await audit(user.id, result.passed ? 'production_unit.qa_passed' : 'production_unit.qa_failed', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, failed: result.failed, burnInHours: burnIn, notes: qaNotes });
  return { passed: result.passed, failed: result.failed };
}

/** Rework finished by the line: back to the line check (the manager approves from the second rework on). */
export async function finishUnitRework(unitId: string, notes: string): Promise<void> {
  const unit = await unitForChange(unitId);
  if (!(await allows('production.line_check', { branchId: unit.branchId, homeBranch: true }))) await authorize('production.assemble', { branchId: unit.branchId, assigneeIds: [unit.assembledById] }, 'finishUnitRework', ASSEMBLER_ONLY);
  const user = await requireUser();
  if (unit.stage !== 'REWORK') fail('This unit is not in rework.');
  if (reworkNeedsApproval(unit.reworkCount)) fail('This unit has been reworked before — the Production Manager must approve it going back to the line.');
  const what = notes.trim().slice(0, 500);
  if (what.length < 3) fail('Say what was reworked.');
  stillAsSeen(await prisma.productionUnit.updateMany({ where: { id: unit.id, stage: 'REWORK' }, data: { stage: 'LINE_CHECK', reworkNotes: what } }));
  await audit(user.id, 'production_unit.rework_done', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, notes: what, reworkCount: unit.reworkCount });
}

/** The Production Manager approves a unit reworked for the second time (or more) going back to the line check. */
export async function approveUnitRework(unitId: string, notes: string): Promise<void> {
  await refuseDuringAssist('approveUnitRework');
  const unit = await unitForChange(unitId);
  await authorize('production.manage', { branchId: unit.branchId, homeBranch: true }, 'approveUnitRework', MANAGER_ONLY);
  const user = await requireUser();
  if (unit.stage !== 'REWORK') fail('This unit is not in rework.');
  const what = notes.trim().slice(0, 500);
  stillAsSeen(await prisma.productionUnit.updateMany({ where: { id: unit.id, stage: 'REWORK' }, data: { stage: 'LINE_CHECK', reworkNotes: what || `Rework ${unit.reworkCount} approved` } }));
  await audit(user.id, 'production_unit.rework_approved', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, notes: what || null, reworkCount: unit.reworkCount });
}

export async function packUnit(unitId: string): Promise<void> {
  const unit = await unitForChange(unitId);
  if (!(await allows('production.line_check', { branchId: unit.branchId, homeBranch: true }))) await authorize('production.assemble', { branchId: unit.branchId, assigneeIds: [unit.assembledById] }, 'packUnit', ASSEMBLER_ONLY);
  const user = await requireUser();
  if (unit.stage !== 'PACKING') fail('This unit is not at the packing station.');
  // Packing stays PACKING (the manager releases it); the stamp records who boxed it.
  stillAsSeen(await prisma.productionUnit.updateMany({ where: { id: unit.id, stage: 'PACKING', packedAt: null }, data: { packedById: user.id, packedAt: new Date() } }), 'This unit has already been packed.');
  await audit(user.id, 'production_unit.packed', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber });
}

/** The branch's finished-goods store (its first warehouse location), created if the branch has none yet. */
async function finishedGoodsStore(tx: Prisma.TransactionClient, branchId: string): Promise<string> {
  const existing = await tx.fgLocation.findFirst({ where: { branchId, kind: 'WAREHOUSE', isActive: true }, orderBy: { name: 'asc' }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.fgLocation.upsert({ where: { branchId_name: { branchId, name: 'Finished goods store' } }, create: { branchId, name: 'Finished goods store', kind: 'WAREHOUSE' }, update: {}, select: { id: true } });
  return created.id;
}

/** The Production Manager releases a packed unit to the finished-goods store: it becomes a FinishedUnit in stock. */
export async function releaseUnitToStore(unitId: string): Promise<{ finishedUnitId: string }> {
  await refuseDuringAssist('releaseUnitToStore');
  const unit = await unitForChange(unitId);
  await authorize('production.manage', { branchId: unit.branchId, homeBranch: true }, 'releaseUnitToStore', MANAGER_ONLY);
  const user = await requireUser();
  if (!canMoveUnit(unit.stage as UnitStageCode, 'RELEASED')) fail('A unit is released to the store from the packing station.');
  const now = new Date();
  const finished = await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.productionUnit.updateMany({ where: { id: unit.id, stage: 'PACKING' }, data: { stage: 'RELEASED', releasedById: user.id, releasedAt: now } }));
    const locationId = await finishedGoodsStore(tx, unit.branchId);
    return tx.finishedUnit.create({ data: { serialNumber: unit.serialNumber, productId: unit.productId, configurationId: unit.configurationId, locationId, status: 'IN_STOCK', productionUnitId: unit.id, receivedAt: now }, select: { id: true, locationId: true } });
  });
  await audit(user.id, 'production_unit.released', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, finishedUnitId: finished.id });
  await settleBuildOrderIfDone(unit.buildOrderId, user.id);
  return { finishedUnitId: finished.id };
}

export async function scrapUnit(unitId: string, reason: string): Promise<void> {
  const unit = await unitForChange(unitId);
  await authorize('production.manage', { branchId: unit.branchId, homeBranch: true }, 'scrapUnit', MANAGER_ONLY);
  const user = await requireUser();
  const why = reason.trim().slice(0, 500);
  if (why.length < 3) fail('Say why the unit is scrapped.');
  if (!canMoveUnit(unit.stage as UnitStageCode, 'SCRAPPED')) fail('A released unit cannot be scrapped from here.');
  stillAsSeen(await prisma.productionUnit.updateMany({ where: { id: unit.id, stage: unit.stage }, data: { stage: 'SCRAPPED', scrapReason: why } }));
  await audit(user.id, 'production_unit.scrapped', 'ProductionUnit', unit.id, { referenceNumber: unit.number, serialNumber: unit.serialNumber, reason: why });
  await settleBuildOrderIfDone(unit.buildOrderId, user.id);
}

/** Once every unit of a build order has left the line, the build order is completed. */
async function settleBuildOrderIfDone(buildOrderId: string | null, userId: string): Promise<void> {
  if (!buildOrderId) return;
  const bo = await prisma.buildOrder.findUnique({ where: { id: buildOrderId }, select: { id: true, number: true, status: true, quantity: true } });
  if (!bo || !canMoveBuildOrder(bo.status as BuildOrderStatusCode, 'COMPLETED')) return;
  const [onLine, released] = await Promise.all([
    prisma.productionUnit.count({ where: { buildOrderId, stage: { in: UNIT_ON_LINE as UnitStage[] } } }),
    prisma.productionUnit.count({ where: { buildOrderId, stage: 'RELEASED' } }),
  ]);
  if (onLine > 0 || released < bo.quantity) return;
  const r = await prisma.buildOrder.updateMany({ where: { id: bo.id, status: bo.status }, data: { status: 'COMPLETED', completedAt: new Date() } });
  if (r.count === 1) await audit(userId, 'build_order.completed', 'BuildOrder', bo.id, { referenceNumber: bo.number, released, automatic: true });
}
