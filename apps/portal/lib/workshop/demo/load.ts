/**
 * Writes the workshop demo (./plan.ts) into the demo organisation's Isolo
 * Branch, replacing the demo records already there and nothing else.
 *
 * Every record the load makes is listed in demo_records (model + id), so a
 * reset or a removal deletes exactly those — never a record a person made
 * — in an order the foreign keys allow. Customers, vehicles, suppliers and
 * parts also carry externalSource "EJO-DEMO". The demo's audit entries are
 * removed with it under the audit trail's recorded maintenance switch, so
 * a reload never doubles a job card's history.
 *
 * Needs the demo people (lib/demo/people-load.ts) and the plant demo
 * (lib/plant/demo/load.ts) to be in place: the records are theirs, and the
 * six Afprint-built vehicles come out of the plant demo's yard. Used by
 * `npm run demo:reset` and the production build (scripts/demo-load.ts); the
 * callers decide who may run it and when. Prints counts, never data.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@ejo/database';
import { DEMO_STAFF } from '../../demo/people';
import { normaliseVin } from '../../vin';
import { lagosYear } from '../../utils/format-date';
import { highestBinnedReference, highestSequence } from '../../recycle-bin/numbers';
import { CATEGORIES } from './catalogue';
import { DEMO_SOURCE, planWorkshopDemo, type DemoEstimate, type DemoSlip } from './plan';

export type WorkshopDemoLoadResult = { branchName: string; removed: number; made: Record<string, number>; figures: Record<string, number> };

const CHUNK = 400;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const money = (n: number) => new Prisma.Decimal(Math.round(n * 100) / 100);
const id = () => randomUUID();

/** The models a load registers, in the order a removal deletes them (children first). */
const REMOVE_ORDER = [
  'WarrantyClaim', 'Warranty', 'SupportReply', 'SupportTicket', 'AppointmentParticipant', 'Appointment', 'Broadcast', 'Announcement', 'ImportJob', 'ExportJob',
  'SecurityIncident', 'ContractorAttendance', 'ContractorPass', 'ExitPassPerson', 'ExitPass', 'Visit', 'GateDelivery', 'RoadTestPermit', 'VehicleGateExit', 'ServiceReminderLog',
  'PartQuantityConsumption', 'PartBatchConsumption', 'PartRequestSlipLine', 'PartRequestSlip', 'Payment', 'Refund', 'CancellationRequest', 'CloseRequest', 'EstimateLineItem', 'Estimate', 'JobCardComplaint',
  'VehicleServiceCloseRequest', 'VehicleServiceCancellationRequest', 'ServiceEstimateLineItem', 'ServiceEstimate', 'VehicleInspectionItem', 'VehicleInspection', 'VehicleServiceComplaint', 'VehicleService', 'JobCard',
  'PricingAlert', 'PartSerial', 'PartBatch', 'GoodsReceiptLine', 'GoodsReceipt', 'PartStock', 'PartFitment', 'Part', 'PartType', 'PartCategory', 'Supplier', 'WarrantyPolicy', 'WarrantyProvider',
  'CustomerContact', 'CustomerAddress', 'CustomerCompany', 'CustomerVehicle', 'Customer', 'MeetingRoom', 'AuditLog',
] as const;
type Model = (typeof REMOVE_ORDER)[number];

/** Removes the workshop demo: every record the last load registered, children first; the plant's sold vehicles go back to the yard. */
export async function removeWorkshopDemo(organisationId: string): Promise<number> {
  const rows = await prisma.demoRecord.findMany({ where: { organisationId }, select: { model: true, recordId: true } });
  if (!rows.length) return 0;
  const byModel = new Map<string, string[]>();
  for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r.recordId]);
  // The sold plant vehicles: back to the yard (their CustomerVehicle goes with the customers below).
  const soldVehicleIds = byModel.get('CustomerVehicle') ?? [];
  if (soldVehicleIds.length) await prisma.plantVehicle.updateMany({ where: { organisationId, customerVehicleId: { in: soldVehicleIds }, stage: 'SOLD' }, data: { stage: 'YARD', customerVehicleId: null } });
  let removed = 0;
  for (const model of REMOVE_ORDER) {
    const ids = byModel.get(model);
    if (!ids?.length) continue;
    if (model === 'AuditLog') {
      // The trail is append-only; the demo's own entries go under the recorded maintenance switch, in one transaction.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ejo.audit_maintenance = 'on'`;
        for (let i = 0; i < ids.length; i += CHUNK) await tx.auditLog.deleteMany({ where: { id: { in: ids.slice(i, i + CHUNK) } } });
      });
      removed += ids.length;
      continue;
    }
    const delegate = (prisma as unknown as Record<string, { deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }> }>)[model.charAt(0).toLowerCase() + model.slice(1)]!;
    for (let i = 0; i < ids.length; i += CHUNK) removed += (await delegate.deleteMany({ where: { id: { in: ids.slice(i, i + CHUNK) } } })).count;
  }
  await prisma.demoRecord.deleteMany({ where: { organisationId } });
  return removed;
}

/** The next free PREFIX-YEAR-NNNNNN numbers, continuing from what the database holds (and the Recycle bin, for job cards and services). */
class Numbers {
  private next = new Map<string, number>();
  constructor(private readonly reader: (prefix: string) => Promise<number>) {}
  async take(prefix: 'JC' | 'SV' | 'RF' | 'PRS' | 'GRN' | 'WR' | 'WC' | 'VIS' | 'VP' | 'EP' | 'VX' | 'RT' | 'INC' | 'DLV' | 'CTR' | 'APT' | 'BC' | 'SUP' | 'IMP' | 'EXP', at: Date): Promise<string> {
    const start = `${prefix}-${lagosYear(at)}-`;
    if (!this.next.has(start)) this.next.set(start, (await this.reader(start)) + 1);
    const n = this.next.get(start)!;
    this.next.set(start, n + 1);
    return `${start}${String(n).padStart(6, '0')}`;
  }
}
const NUMBER_FIELDS: Record<string, [string, string]> = {
  JC: ['jobCard', 'jobNumber'], SV: ['vehicleService', 'serviceNumber'], RF: ['refund', 'referenceNumber'], PRS: ['partRequestSlip', 'referenceNumber'], GRN: ['goodsReceipt', 'referenceNumber'], WR: ['warranty', 'warrantyNumber'], WC: ['warrantyClaim', 'claimNumber'],
  VIS: ['visit', 'visitNumber'], VP: ['visit', 'passNumber'], EP: ['exitPass', 'passNumber'], VX: ['vehicleGateExit', 'exitNumber'], RT: ['roadTestPermit', 'permitNumber'], INC: ['securityIncident', 'incidentNumber'], DLV: ['gateDelivery', 'deliveryNumber'], CTR: ['contractorPass', 'passNumber'],
  APT: ['appointment', 'appointmentNumber'], BC: ['broadcast', 'broadcastNumber'], SUP: ['supportTicket', 'number'], IMP: ['importJob', 'number'], EXP: ['exportJob', 'number'],
};
async function highestInUse(start: string): Promise<number> {
  const prefix = start.slice(0, start.indexOf('-'));
  const [model, field] = NUMBER_FIELDS[prefix]!;
  const delegate = (prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<Record<string, string | null> | null> }>)[model]!;
  const row = await delegate.findFirst({ where: { [field]: { startsWith: start } }, orderBy: { [field]: 'desc' }, select: { [field]: true } });
  const refs = [row?.[field] ?? null];
  if (prefix === 'JC' || prefix === 'SV') refs.push(await highestBinnedReference(prefix === 'JC' ? 'JobCard' : 'VehicleService', start));
  return highestSequence(start, refs);
}

/**
 * Loads the plan into the organisation's workshop branch (the first one),
 * after removing the previous workshop demo. `anchor` is "now" for the story.
 */
export async function loadWorkshopDemo(organisationId: string, anchor: Date = new Date()): Promise<WorkshopDemoLoadResult> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, isDemo: true, primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } });
  if (!org) throw new Error('No such organisation.');
  if (!org.isDemo) throw new Error(`${org.name} is not marked as a demo organisation; the workshop demo is only loaded into a demo.`);
  const branches = await prisma.branch.findMany({ where: { businessUnit: { organisationId } }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, code: true, type: true, departments: { select: { id: true, slug: true } } } });
  const isolo = branches.find((b) => b.code === 'KWL-WS') ?? branches.find((b) => b.type === 'WORKSHOP');
  if (!isolo) throw new Error('This organisation has no workshop branch yet.');
  const dept = (slug: string) => isolo.departments.find((d) => d.slug === slug)?.id ?? null;
  const people = new Map((await prisma.user.findMany({ where: { organisationId, email: { in: DEMO_STAFF.map((s) => s.email) } }, select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  if (people.size < DEMO_STAFF.length) throw new Error(`The demo people are not all in place (${people.size} of ${DEMO_STAFF.length}): run the demo people step first (npm run demo:people).`);
  const by = (email: string) => { const u = people.get(email); if (!u) throw new Error(`No demo person ${email}`); return u; };

  const removed = await removeWorkshopDemo(organisationId);
  if (org.primaryServiceIntervalKm === null || org.primaryServiceIntervalDays === null) await prisma.organisation.update({ where: { id: organisationId }, data: { primaryServiceIntervalKm: org.primaryServiceIntervalKm ?? 10_000, primaryServiceIntervalDays: org.primaryServiceIntervalDays ?? 180 } });

  const plan = planWorkshopDemo(anchor);
  const made: Record<string, number> = {};
  const registry: { model: Model; recordId: string }[] = [];
  const reg = (model: Model, recordId: string) => { registry.push({ model, recordId }); made[model] = (made[model] ?? 0) + 1; return recordId; };
  const numbers = new Numbers(highestInUse);
  const inChunks = async <T,>(rows: T[], write: (slice: T[]) => Promise<unknown>) => { for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK)); };
  const frontdesk = by(DEMO_STAFF.find((s) => s.role === 'receptionist')!.email);
  const storeManager = by(DEMO_STAFF.find((s) => s.role === 'store-manager')!.email);
  const warrantyHod = by(DEMO_STAFF.find((s) => s.role === 'warranty-hod')!.email);
  const admin = by(DEMO_STAFF.find((s) => s.role === 'administrator')!.email);
  const base = { organisationId };

  // ── Suppliers, parts, stock, receipts ──────────────────────────────────
  const supplierIds = new Map<string, string>();
  await prisma.supplier.createMany({ data: plan.suppliers.map((s) => { const sid = reg('Supplier', id()); supplierIds.set(s.key, sid); return { id: sid, ...base, name: s.name, contactName: s.contact, phone: s.phone, address: s.address, externalSource: DEMO_SOURCE, externalId: s.key, createdById: storeManager, createdAt: s.createdAt }; }) });
  const categoryIds = new Map<string, string>();
  for (const c of [...new Set(plan.parts.map((p) => p.categoryKey))]) {
    const name = CATEGORIES.find((x) => x.key === c)?.name ?? c;
    const existing = await prisma.partCategory.findFirst({ where: { branchId: isolo.id, OR: [{ name }, { code: c }] }, select: { id: true } });
    if (existing) { categoryIds.set(c, existing.id); continue; }
    const cid = reg('PartCategory', id());
    await prisma.partCategory.create({ data: { id: cid, branchId: isolo.id, name, code: c, createdById: storeManager, createdAt: plan.from } });
    categoryIds.set(c, cid);
  }
  const typeIds = new Map<string, string>();
  for (const p of plan.parts) {
    const k = `${p.categoryKey}:${p.typeName}`;
    if (typeIds.has(k)) continue;
    const existing = await prisma.partType.findUnique({ where: { branchId_categoryId_name: { branchId: isolo.id, categoryId: categoryIds.get(p.categoryKey)!, name: p.typeName } }, select: { id: true } });
    if (existing) { typeIds.set(k, existing.id); continue; }
    const tid = reg('PartType', id());
    await prisma.partType.create({ data: { id: tid, branchId: isolo.id, categoryId: categoryIds.get(p.categoryKey)!, name: p.typeName, createdById: storeManager, createdAt: plan.from } });
    typeIds.set(k, tid);
  }
  const policyIds = new Map<string, string>();
  const providerIds = new Map<string, string>();
  for (const p of plan.providers) {
    const existing = await prisma.warrantyProvider.findUnique({ where: { name: p.name }, select: { id: true } });
    const pid = existing?.id ?? reg('WarrantyProvider', id());
    if (!existing) await prisma.warrantyProvider.create({ data: { id: pid, name: p.name, type: p.type, contactName: p.contact, phone: p.phone, claimSubmissionDays: p.claimDays, partRetentionDays: p.retentionDays, organisationId, createdById: warrantyHod, createdAt: plan.from } });
    providerIds.set(p.key, pid);
  }
  for (const p of plan.policies) {
    const existing = await prisma.warrantyPolicy.findUnique({ where: { code: p.code }, select: { id: true } });
    const pid = existing?.id ?? reg('WarrantyPolicy', id());
    if (!existing) await prisma.warrantyPolicy.create({ data: { id: pid, code: p.code, name: p.name, kind: p.kind, providerId: providerIds.get(p.provider)!, brand: p.brand ?? null, durationMonths: p.months, distanceLimit: p.km ?? null, coverageSummary: p.coverage, exclusions: p.exclusions, defaultRemedy: p.remedy, organisationId, createdById: warrantyHod, createdAt: plan.from } });
    policyIds.set(p.key, pid);
  }
  // Part numbers: the catalogue's, unless the branch already uses one.
  const taken = new Set((await prisma.part.findMany({ where: { branchId: isolo.id }, select: { partNumber: true } })).map((p) => p.partNumber).filter(Boolean));
  const partIds = new Map<string, string>();
  const partRows: Prisma.PartCreateManyInput[] = [];
  for (const p of plan.parts) {
    let partNumber = p.partNumber;
    for (let n = 1; taken.has(partNumber); n += 1) partNumber = `${p.partNumber}-D${n}`;
    taken.add(partNumber);
    const pid = reg('Part', id()); partIds.set(p.key, pid);
    partRows.push({ id: pid, branchId: isolo.id, name: p.name, partNumber, trackingType: p.tracking, baseUnitOfMeasure: p.uom, reorderPoint: p.reorder, safetyStock: p.safety, sellingPrice: p.price, targetMarginPercent: 30, partTypeId: typeIds.get(`${p.categoryKey}:${p.typeName}`)!, warrantyPolicyId: p.warrantyPolicyKey ? policyIds.get(p.warrantyPolicyKey)! : null, externalSource: DEMO_SOURCE, externalId: p.key, createdById: storeManager, createdAt: p.createdAt });
  }
  await prisma.part.createMany({ data: partRows });
  await prisma.partStock.createMany({ data: plan.parts.map((p) => ({ id: reg('PartStock', id()), partId: partIds.get(p.key)!, quantityOnHand: p.onHand, quantityReserved: p.reserved })) });
  await prisma.partFitment.createMany({ data: plan.parts.filter((p) => p.fit).map((p) => ({ id: reg('PartFitment', id()), partId: partIds.get(p.key)!, make: p.fit! })) });
  const receiptIds = new Map<string, string>();
  const receiptLineIds = new Map<string, string>();
  const batchIds = new Map<string, string>();
  const serialIds = new Map<string, string>();
  const serialLineOf = new Map<string, string>(); // serial → receipt line id
  for (const g of plan.receipts) {
    const gid = reg('GoodsReceipt', id()); receiptIds.set(g.key, gid);
    await prisma.goodsReceipt.create({ data: { id: gid, branchId: isolo.id, referenceNumber: await numbers.take('GRN', g.receivedAt), supplierName: plan.suppliers.find((s) => s.key === g.supplierKey)!.name, supplierId: supplierIds.get(g.supplierKey)!, receivedById: by(g.byKey), receivedAt: g.receivedAt, notes: g.notes, isOpeningBalance: g.opening, idempotencyKey: `demo:${organisationId}:${g.key}`, createdAt: g.receivedAt } });
    await prisma.goodsReceiptLine.createMany({ data: g.lines.map((l) => { const lid = reg('GoodsReceiptLine', id()); receiptLineIds.set(l.key, lid); return { id: lid, goodsReceiptId: gid, partId: partIds.get(l.partKey)!, quantityReceivedInUnit: l.quantity, unitUsed: plan.parts.find((p) => p.key === l.partKey)!.uom, quantityInBaseUnit: l.quantity, unitCost: money(l.unitCost), totalCost: money(l.unitCost * l.quantity), batchNumber: l.batch?.number ?? null }; }) });
    for (const l of g.lines) {
      if (l.batch) { const bid = reg('PartBatch', id()); batchIds.set(l.batch.key, bid); await prisma.partBatch.create({ data: { id: bid, partId: partIds.get(l.partKey)!, batchNumber: l.batch.number, receivedQuantity: l.quantity, remainingQuantity: l.quantity, receivedAt: g.receivedAt, expiryDate: l.batch.expiry, goodsReceiptLineId: receiptLineIds.get(l.key)! } }); }
      for (const sn of l.serials) serialLineOf.set(sn, receiptLineIds.get(l.key)!);
      if (l.pricingAlert) await prisma.pricingAlert.create({ data: { id: reg('PricingAlert', id()), partId: partIds.get(l.partKey)!, goodsReceiptLineId: receiptLineIds.get(l.key)!, severity: l.pricingAlert.severity, status: l.pricingAlert.status, previousUnitCost: money(l.pricingAlert.previousUnitCost), newUnitCost: money(l.unitCost), sellingPriceAtAlert: money(plan.parts.find((p) => p.key === l.partKey)!.price), targetMarginPercentAtAlert: 30, actualMarginPercent: l.pricingAlert.actualMargin, resolvedById: l.pricingAlert.resolvedAt ? storeManager : null, resolvedAt: l.pricingAlert.resolvedAt, resolutionNotes: l.pricingAlert.note, createdAt: g.receivedAt } });
    }
  }
  // Serials: in stock unless a slip issued them (set below); batches' remaining quantities come after the slips.
  const serialRows: Prisma.PartSerialCreateManyInput[] = [];
  for (const g of plan.receipts) for (const l of g.lines) for (const sn of l.serials) { const sid = reg('PartSerial', id()); serialIds.set(sn, sid); serialRows.push({ id: sid, partId: partIds.get(l.partKey)!, serialNumber: sn, status: 'IN_STOCK', receivedAt: g.receivedAt, goodsReceiptLineId: serialLineOf.get(sn)! }); }
  await inChunks(serialRows, (rows) => prisma.partSerial.createMany({ data: rows }));

  // ── Customers and vehicles ─────────────────────────────────────────────
  const customerIds = new Map<string, string>();
  const existingDemoCustomers = await prisma.customer.findMany({ where: { organisationId, externalSource: DEMO_SOURCE }, select: { id: true, externalId: true } });
  for (const c of plan.customers) {
    const existing = existingDemoCustomers.find((x) => x.externalId === c.key);
    if (existing) { customerIds.set(c.key, existing.id); continue; } // the four sign-ins (lib/demo/people-load.ts)
    const cid = reg('Customer', id()); customerIds.set(c.key, cid);
    await prisma.customer.create({ data: { id: cid, ...base, customerType: c.type, fullName: c.name, phone: c.phone, address: c.address, email: c.email, emailVerified: Boolean(c.email), tags: c.tags, customerSince: c.since, externalSource: DEMO_SOURCE, externalId: c.key, createdById: frontdesk, createdAt: c.createdAt, ...(c.company ? { customerCompany: { create: { id: reg('CustomerCompany', id()), companyName: c.company } } } : {}) } });
  }
  await prisma.customerContact.createMany({ data: plan.customers.flatMap((c) => c.contacts.map((k) => ({ id: reg('CustomerContact', id()), customerId: customerIds.get(c.key)!, name: k.name, role: k.role, phone: k.phone, createdAt: c.createdAt }))) });
  const vehicleIds = new Map<string, string>();
  const takenPlates = new Set((await prisma.customerVehicle.findMany({ where: { OR: [{ plateNumber: { in: plan.vehicles.map((v) => v.plate) } }, { chassisNumber: { in: plan.vehicles.map((v) => v.vin) } }] }, select: { plateNumber: true, chassisNumber: true } })).flatMap((v) => [v.plateNumber, v.chassisNumber]));
  await inChunks(plan.vehicles, (rows) => prisma.customerVehicle.createMany({ data: rows.map((v) => { const vid = reg('CustomerVehicle', id()); vehicleIds.set(v.key, vid); return { id: vid, customerId: customerIds.get(v.customerKey)!, make: v.make, model: v.model, vehicleType: v.type, year: v.year, plateNumber: takenPlates.has(v.plate) ? `${v.plate}${vid.slice(0, 2).toUpperCase()}` : v.plate, chassisNumber: takenPlates.has(v.vin) ? null : v.vin, engineNumber: v.engineNumber, engineType: v.engineType, mileage: v.mileage, externalSource: DEMO_SOURCE, externalId: v.key, createdById: frontdesk, createdAt: v.createdAt }; }) }));
  // The Afprint-built ones are sold: the plant vehicle points at its customer vehicle.
  for (const v of plan.vehicles.filter((x) => x.fromPlant)) await prisma.plantVehicle.updateMany({ where: { organisationId, vinKey: normaliseVin(v.plantVin!) }, data: { stage: 'SOLD', customerVehicleId: vehicleIds.get(v.key)! } });

  // ── Estimates, slips and issued parts (shared by job cards and services) ──
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const audit = (userId: string, action: string, entityType: string, entityId: string, at: Date, metadata?: Record<string, unknown>) => auditRows.push({ id: reg('AuditLog', id()), organisationId, userId, action, entityType, entityId, metadata: metadata ? json(metadata) : undefined, createdAt: at });
  const lineIds = new Map<string, string>();
  const writeLines = async (est: DemoEstimate, estimateId: string, enteredById: string, service: boolean) => {
    const rows = est.lines.map((l) => {
      const lid = reg(service ? 'ServiceEstimateLineItem' : 'EstimateLineItem', id()); lineIds.set(l.key, lid);
      const part = l.partKey ? plan.parts.find((p) => p.key === l.partKey)! : null;
      const common = { id: lid, estimateId, type: l.type, description: l.description, quantity: l.quantity, unitPrice: money(l.unitPrice), amount: money(l.amount), enteredById, createdAt: est.createdAt, partTypeId: part ? typeIds.get(`${part.categoryKey}:${part.typeName}`)! : null, matchedPartId: part && est.matchingRequestedAt ? partIds.get(part.key)! : null, unitOfMeasure: part?.uom ?? null };
      return service ? common : { ...common, billTo: l.billTo, billToNote: l.billToNote };
    });
    if (service) await prisma.serviceEstimateLineItem.createMany({ data: rows.filter((x) => ['STORE_PART', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'].includes(x.type)).map((x) => ({ ...x, type: x.type as 'STORE_PART' | 'INTERNAL_JOB' | 'LABOUR' | 'SUNDRY' })) });
    else await prisma.estimateLineItem.createMany({ data: rows as Prisma.EstimateLineItemCreateManyInput[] });
  };
  const slipLineIds = new Map<string, string>();
  const batchRemaining = new Map<string, number>();
  for (const g of plan.receipts) for (const l of g.lines) if (l.batch) batchRemaining.set(l.batch.key, l.quantity);
  const writeSlip = async (slip: DemoSlip, owner: { jobCardId?: string; vehicleServiceId?: string }, requestedById: string, service: boolean) => {
    const sid = reg('PartRequestSlip', id());
    const hod = DEMO_STAFF.find((s) => s.role === 'department-head')!.email;
    const storeOfficer = DEMO_STAFF.find((s) => s.role === 'store-officer')!.email;
    await prisma.partRequestSlip.create({ data: { id: sid, referenceNumber: await numbers.take('PRS', slip.createdAt), ...owner, branchId: isolo.id, requestedById, status: slip.status, hodApprovedById: slip.hodAt ? by(hod) : null, hodApprovedAt: slip.hodAt, storeApprovedById: slip.storeAt ? by(storeOfficer) : null, storeApprovedAt: slip.storeAt, releasedById: slip.releasedAt ? by(storeOfficer) : null, releasedAt: slip.releasedAt, receivedByUserId: slip.receivedByKey ? by(slip.receivedByKey) : null, createdAt: slip.createdAt } });
    await prisma.partRequestSlipLine.createMany({ data: slip.lines.map((l) => { const lid = reg('PartRequestSlipLine', id()); slipLineIds.set(l.key, lid); return { id: lid, slipId: sid, partId: partIds.get(l.partKey)!, ...(service ? { serviceEstimateLineItemId: lineIds.get(l.estimateLineKey)! } : { estimateLineItemId: lineIds.get(l.estimateLineKey)! }), quantityRequested: l.quantity, quantityReleased: l.released }; }) });
    if (slip.status !== 'RELEASED') return;
    for (const l of slip.lines) {
      const lid = slipLineIds.get(l.key)!;
      const part = plan.parts.find((p) => p.key === l.partKey)!;
      if (part.tracking === 'BATCH') { for (const b of l.batches) { await prisma.partBatchConsumption.create({ data: { id: reg('PartBatchConsumption', id()), batchId: batchIds.get(b.batchKey)!, slipLineId: lid, quantityTaken: b.quantity, consumedAt: slip.releasedAt! } }); batchRemaining.set(b.batchKey, (batchRemaining.get(b.batchKey) ?? 0) - b.quantity); } }
      else if (part.tracking === 'SERIALIZED') { if (l.serials.length) await prisma.partSerial.updateMany({ where: { id: { in: l.serials.map((sn) => serialIds.get(sn)!) } }, data: { status: 'ISSUED', issuedToSlipLineId: lid } }); }
      else await prisma.partQuantityConsumption.create({ data: { id: reg('PartQuantityConsumption', id()), partId: partIds.get(l.partKey)!, slipLineId: lid, quantityTaken: l.quantity, consumedAt: slip.releasedAt!, goodsReceiptLineId: l.quantityFromReceiptKey ? receiptLineIds.get(l.quantityFromReceiptKey) ?? null : null } });
    }
  };
  const writePayments = async (payments: { key: string; amount: number; method: 'BANK_TRANSFER' | 'CASH'; at: Date; note: string; byKey: string }[], owner: { jobCardId?: string; vehicleServiceId?: string }) => {
    if (!payments.length) return;
    await prisma.payment.createMany({ data: payments.map((p) => ({ id: reg('Payment', id()), ...owner, amount: money(p.amount), method: p.method, notes: p.note, recordedById: by(p.byKey), recordedAt: p.at, createdAt: p.at, idempotencyKey: `demo:${organisationId}:${p.key}` })) });
  };

  // ── Job cards ──────────────────────────────────────────────────────────
  const jobIds = new Map<string, string>();
  const gateExits: { at: Date; vehicleKey: string; driverName: string; jobCardId?: string; vehicleServiceId?: string }[] = [];
  for (const jc of plan.jobCards) {
    const jid = reg('JobCard', id()); jobIds.set(jc.key, jid);
    const jobNumber = await numbers.take('JC', jc.openedAt);
    const tech = by(jc.technicianKey); const sup = by(jc.supervisorKey);
    await prisma.jobCard.create({ data: {
      id: jid, jobNumber, branchId: isolo.id, customerId: customerIds.get(jc.customerKey)!, vehicleId: vehicleIds.get(jc.vehicleKey)!, departmentId: dept(jc.dept), complaint: jc.complaints[0]!, diagnosis: jc.diagnosis, mileageAtCheckIn: jc.mileage,
      assignedTechnicianId: tech, technicianAcceptanceStatus: jc.technicianAcceptance, technicianRespondedAt: jc.technicianRespondedAt, supervisorId: sup, createdById: frontdesk, status: jc.status, notes: jc.notes,
      approvalStatus: jc.approvalStatus, approvedById: jc.approvedAt ? sup : null, approvedAt: jc.approvedAt, workStartedAt: jc.workStartedAt, completedAt: jc.completedAt, readyForCollectionAt: jc.readyForCollectionAt, closedAt: jc.closedAt, checkedOutAt: jc.checkedOutAt, collectedByName: jc.collectedByName, createdAt: jc.openedAt,
    } });
    await prisma.jobCardComplaint.createMany({ data: jc.complaints.map((c, i) => ({ id: reg('JobCardComplaint', id()), jobCardId: jid, sequenceNumber: i + 1, description: c, createdAt: jc.openedAt })) });
    if (jc.estimate) {
      const est = jc.estimate; const eid = reg('Estimate', id());
      await prisma.estimate.create({ data: { id: eid, jobCardId: jid, status: est.status, submittedAt: est.submittedAt, approvedAt: est.approvedAt, approvedById: est.approvedAt ? sup : null, managerApprovedAt: est.managerApprovedAt, managerApprovedById: est.managerApprovedAt ? by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email) : null, customerNotifiedAt: est.customerNotifiedAt, customerNotifiedById: est.customerNotifiedAt ? frontdesk : null, matchingRequestedAt: est.matchingRequestedAt, matchingRequestedById: est.matchingRequestedAt ? sup : null, createdById: tech, createdAt: est.createdAt } });
      await writeLines(est, eid, tech, false);
    }
    for (const slip of jc.slips) await writeSlip(slip, { jobCardId: jid }, tech, false);
    await writePayments(jc.payments, { jobCardId: jid });
    if (jc.cancellation) await prisma.cancellationRequest.create({ data: { id: reg('CancellationRequest', id()), jobCardId: jid, reason: jc.cancellation.reason, requestedById: frontdesk, requestedAt: jc.cancellation.requestedAt, status: jc.cancellation.status, decidedById: jc.cancellation.decidedAt ? by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email) : null, decidedAt: jc.cancellation.decidedAt, decisionNotes: jc.cancellation.decidedAt ? 'Approved; deposit to be refunded where paid.' : null, createdAt: jc.cancellation.requestedAt } });
    if (jc.refund) await prisma.refund.create({ data: { id: reg('Refund', id()), referenceNumber: await numbers.take('RF', jc.refund.at), jobCardId: jid, amount: money(jc.refund.amount), method: jc.refund.method, paidToName: jc.refund.paidToName, reason: jc.refund.reason, recordedById: by(DEMO_STAFF.find((s) => s.role === 'finance-officer' && s.branch === 'ISOLO')!.email), recordedAt: jc.refund.at, createdAt: jc.refund.at, idempotencyKey: `demo:${organisationId}:${jc.key}:refund` } });
    if (jc.close) await prisma.closeRequest.create({ data: { id: reg('CloseRequest', id()), jobCardId: jid, requestedById: frontdesk, requestedAt: jc.close.requestedAt, status: jc.close.status, decidedById: jc.close.decidedAt ? by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email) : null, decidedAt: jc.close.decidedAt, createdAt: jc.close.requestedAt } });
    if (jc.roadTest) await prisma.roadTestPermit.create({ data: { id: reg('RoadTestPermit', id()), permitNumber: await numbers.take('RT', jc.roadTest.requestedAt), branchId: isolo.id, status: jc.roadTest.status, jobCardId: jid, vehicleId: vehicleIds.get(jc.vehicleKey)!, requestedById: sup, driverId: tech, purpose: jc.roadTest.purpose, route: 'Isolo → Oshodi–Apapa Expressway → Mile 2 → back', expectedDurationMinutes: 45, managerApprovedById: jc.roadTest.approvedAt ? by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email) : null, managerApprovedAt: jc.roadTest.approvedAt, gateOutAt: jc.roadTest.outAt, gateOutById: jc.roadTest.outAt ? by(DEMO_STAFF.find((s) => s.role === 'security-officer' && s.branch === 'ISOLO')!.email) : null, startOdometer: jc.roadTest.startOdometer, gateInAt: jc.roadTest.inAt, gateInById: jc.roadTest.inAt ? by(DEMO_STAFF.find((s) => s.role === 'security-officer' && s.branch === 'ISOLO')!.email) : null, endOdometer: jc.roadTest.endOdometer, createdAt: jc.roadTest.requestedAt } });
    if (jc.gateExit) gateExits.push({ at: jc.gateExit.at, vehicleKey: jc.vehicleKey, driverName: jc.gateExit.driverName, jobCardId: jid });
    for (const a of jc.audit) audit(by(a.byKey), a.action, 'JobCard', jid, a.at, a.metadata?.jobNumber === '{number}' ? { ...a.metadata, jobNumber } : a.metadata);
  }

  // ── Vehicle services ───────────────────────────────────────────────────
  const serviceIds = new Map<string, string>();
  for (const sv of plan.services) {
    const sid = reg('VehicleService', id()); serviceIds.set(sv.key, sid);
    const tech = by(sv.technicianKey); const sup = by(sv.supervisorKey);
    await prisma.vehicleService.create({ data: {
      id: sid, serviceNumber: await numbers.take('SV', sv.createdAt), branchId: isolo.id, customerId: customerIds.get(sv.customerKey)!, vehicleId: vehicleIds.get(sv.vehicleKey)!, status: sv.status, odometerAtService: sv.odometer, customerComplaint: sv.text,
      assignedTechnicianId: tech, technicianAcceptanceStatus: sv.checkedInAt ? 'ACCEPTED' : 'PENDING', technicianRespondedAt: sv.checkedInAt, workStartedAt: sv.workStartedAt, attendedAt: sv.attendedAt, departmentId: dept(sv.dept), supervisorId: sup, approvalStatus: sv.approvalStatus, approvedById: sv.approvedAt ? sup : null, approvedAt: sv.approvedAt,
      escalatedToJobCardId: sv.escalatedToJobKey ? jobIds.get(sv.escalatedToJobKey)! : null, nextServiceDueOdometer: sv.nextServiceDueOdometer, nextServiceDueDate: sv.nextServiceDueDate, createdById: frontdesk, createdAt: sv.createdAt,
      checkedInAt: sv.checkedInAt, completedAt: sv.completedAt, readyForCollectionAt: sv.readyForCollectionAt, closedAt: sv.closedAt, collectedAt: sv.collectedAt, collectedByName: sv.collectedByName, cancelledAt: sv.cancelledAt, escalatedAt: sv.escalatedAt,
    } });
    await prisma.vehicleServiceComplaint.create({ data: { id: reg('VehicleServiceComplaint', id()), vehicleServiceId: sid, sequenceNumber: 1, description: sv.text, createdAt: sv.createdAt } });
    if (sv.inspection) {
      const iid = reg('VehicleInspection', id());
      await prisma.vehicleInspection.create({ data: { id: iid, vehicleServiceId: sid, inspectedById: tech, status: sv.inspection.status, startedAt: sv.inspection.startedAt, completedAt: sv.inspection.completedAt, createdAt: sv.inspection.startedAt } });
      await prisma.vehicleInspectionItem.createMany({ data: sv.inspection.items.map((it) => ({ id: reg('VehicleInspectionItem', id()), inspectionId: iid, section: it.section, name: it.name, condition: it.condition, severity: it.severity, action: it.action })) });
    }
    if (sv.estimate) {
      const est = sv.estimate; const eid = reg('ServiceEstimate', id());
      await prisma.serviceEstimate.create({ data: { id: eid, vehicleServiceId: sid, status: est.status, submittedAt: est.submittedAt, approvedAt: est.approvedAt, approvedById: est.approvedAt ? sup : null, managerApprovedAt: est.managerApprovedAt, managerApprovedById: est.managerApprovedAt ? by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email) : null, customerNotifiedAt: est.customerNotifiedAt, customerNotifiedById: est.customerNotifiedAt ? frontdesk : null, matchingRequestedAt: est.matchingRequestedAt, matchingRequestedById: est.matchingRequestedAt ? sup : null, createdById: tech, createdAt: est.createdAt } });
      await writeLines(est, eid, tech, true);
    }
    for (const slip of sv.slips) await writeSlip(slip, { vehicleServiceId: sid }, tech, true);
    await writePayments(sv.payments, { vehicleServiceId: sid });
    if (sv.cancellation) await prisma.vehicleServiceCancellationRequest.create({ data: { id: reg('VehicleServiceCancellationRequest', id()), vehicleServiceId: sid, reason: sv.cancellation.reason, requestedById: frontdesk, requestedAt: sv.cancellation.requestedAt, status: 'APPROVED', decidedById: by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email), decidedAt: sv.cancellation.decidedAt, createdAt: sv.cancellation.requestedAt } });
    if (sv.close) await prisma.vehicleServiceCloseRequest.create({ data: { id: reg('VehicleServiceCloseRequest', id()), vehicleServiceId: sid, requestedById: frontdesk, requestedAt: sv.close.requestedAt, status: 'APPROVED', decidedById: by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email), decidedAt: sv.close.decidedAt, createdAt: sv.close.requestedAt } });
    if (sv.gateExit) gateExits.push({ at: sv.gateExit.at, vehicleKey: sv.vehicleKey, driverName: sv.gateExit.driverName, vehicleServiceId: sid });
    for (const a of sv.audit) audit(by(a.byKey), a.action, 'VehicleService', sid, a.at, a.metadata);
  }
  // Batches' remaining quantities after the six months.
  for (const [key, remaining] of batchRemaining) await prisma.partBatch.update({ where: { id: batchIds.get(key)! }, data: { remainingQuantity: Math.max(0, remaining) } });
  await prisma.serviceReminderLog.createMany({ data: plan.reminders.map((rm) => ({ id: reg('ServiceReminderLog', id()), vehicleId: vehicleIds.get(rm.vehicleKey)!, reminderNumber: 1, sentAt: rm.sentAt, estimatedDueOdometer: rm.dueOdometer, estimatedDueDate: rm.dueDate, recordedOdometerAtSend: rm.odometerAtSend, trigger: 'DUE_SOON' })) });
  for (const g of gateExits.sort((a, b) => a.at.getTime() - b.at.getTime())) await prisma.vehicleGateExit.create({ data: { id: reg('VehicleGateExit', id()), exitNumber: await numbers.take('VX', g.at), branchId: isolo.id, jobCardId: g.jobCardId ?? null, vehicleServiceId: g.vehicleServiceId ?? null, vehicleId: vehicleIds.get(g.vehicleKey)!, exitedAt: g.at, exitedById: by(DEMO_STAFF.find((s) => s.role === 'security-officer' && s.branch === 'ISOLO')!.email), driverName: g.driverName, createdAt: g.at } });

  // ── Warranties and claims ──────────────────────────────────────────────
  const warrantyIds = new Map<string, string>();
  for (const w of plan.warranties) {
    const wid = reg('Warranty', id()); warrantyIds.set(w.key, wid);
    const pol = plan.policies.find((p) => p.key === w.policyKey)!;
    await prisma.warranty.create({ data: { id: wid, warrantyNumber: await numbers.take('WR', w.startsAt), kind: w.kind, status: w.status, policyId: policyIds.get(w.policyKey)!, providerId: providerIds.get(w.providerKey)!, customerId: customerIds.get(w.customerKey)!, vehicleId: w.vehicleKey ? vehicleIds.get(w.vehicleKey)! : null, partId: w.partKey ? partIds.get(w.partKey)! : null, partSerialId: w.serial ? serialIds.get(w.serial)! : null, slipLineId: w.slipLineKey ? slipLineIds.get(w.slipLineKey) ?? null : null, jobCardId: w.jobKey ? jobIds.get(w.jobKey)! : null, subjectDescription: w.subject, quantity: w.quantity, startsAt: w.startsAt, endsAt: w.endsAt, startReading: w.startReading, distanceLimit: w.distanceLimit, coverageSnapshot: pol.coverage, exclusionsSnapshot: pol.exclusions, origin: w.origin, evidenceNote: w.evidenceNote, issuedById: by(w.issuedByKey), issuedAt: w.startsAt, verifiedById: w.verifiedByKey ? by(w.verifiedByKey) : null, verifiedAt: w.verifiedAt, createdAt: w.startsAt } });
  }
  for (const c of plan.claims) {
    const w = plan.warranties.find((x) => x.key === c.warrantyKey)!;
    const officer = by(DEMO_STAFF.find((s) => s.role === 'warranty-officer')!.email);
    const manager = by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email);
    await prisma.warrantyClaim.create({ data: { id: reg('WarrantyClaim', id()), claimNumber: await numbers.take('WC', c.createdAt), status: c.status, warrantyId: warrantyIds.get(c.warrantyKey)!, providerId: providerIds.get(w.providerKey)!, customerId: customerIds.get(w.customerKey)!, vehicleId: w.vehicleKey ? vehicleIds.get(w.vehicleKey)! : null, jobCardId: jobIds.get(c.jobKey)!, complaint: c.complaint, cause: c.cause, correction: c.correction, causalPart: c.causalPart, causalPartNumber: c.causalPartNumber, failureDate: c.failureDate, failureReading: c.failureReading, labourAmount: money(c.labour), partsAmount: money(c.parts), logisticsAmount: money(c.logistics), claimedAmount: money(c.claimed), approvedAmount: c.approved === null ? null : money(c.approved), settledAmount: c.settled === null ? null : money(c.settled), deadlineAt: c.deadlineAt, providerReference: c.providerReference, settlementReference: c.settlementReference, decisionNotes: c.decisionNotes, remedy: c.remedy, partReturnRequired: c.partReturnRequired, partReturnStatus: c.partReturnStatus, customerResolution: c.customerResolution, createdById: officer, reviewRequestedAt: c.reviewRequestedAt, hodApprovedById: c.hodAt ? warrantyHod : null, hodApprovedAt: c.hodAt, managerApprovedById: c.managerAt ? manager : null, managerApprovedAt: c.managerAt, submittedById: c.submittedAt ? warrantyHod : null, submittedAt: c.submittedAt, decidedById: c.decidedAt ? warrantyHod : null, decidedAt: c.decidedAt, settledById: c.settledAt ? by(DEMO_STAFF.find((s) => s.role === 'finance-officer' && s.branch === 'ISOLO')!.email) : null, settledAt: c.settledAt, createdAt: c.createdAt } });
  }

  // ── Security ───────────────────────────────────────────────────────────
  const gate = by(DEMO_STAFF.find((s) => s.role === 'security-officer' && s.branch === 'ISOLO')!.email);
  const cso = by(DEMO_STAFF.find((s) => s.role === 'chief-security-officer')!.email);
  const manager = by(DEMO_STAFF.find((s) => s.role === 'workshop-manager')!.email);
  const deptHead = by(DEMO_STAFF.find((s) => s.role === 'department-head')!.email);
  for (const v of [...plan.visits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    await prisma.visit.create({ data: { id: reg('Visit', id()), visitNumber: await numbers.take('VIS', v.createdAt), passNumber: v.checkedInAt ? await numbers.take('VP', v.checkedInAt) : null, branchId: isolo.id, status: v.status, visitorName: v.visitorName, company: v.company, phone: v.phone, vehicleType: v.vehicleType, vehiclePlate: v.plate, purpose: v.purpose, hostUserId: by(v.hostKey), expectedAt: v.expectedAt, expectedDurationMinutes: v.durationMinutes, isWalkIn: v.walkIn, registeredById: v.walkIn ? gate : frontdesk, receivedAt: v.checkedInAt, receivedById: v.checkedInAt ? gate : null, checkedInAt: v.checkedInAt, checkedInById: v.checkedInAt ? gate : null, checkedOutAt: v.checkedOutAt, checkedOutById: v.checkedOutAt ? gate : null, createdAt: v.createdAt } });
  }
  for (const ep of [...plan.exitPasses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const eid = reg('ExitPass', id());
    await prisma.exitPass.create({ data: { id: eid, passNumber: await numbers.take('EP', ep.createdAt), branchId: isolo.id, status: ep.status, requestedById: by(ep.requestedByKey), reason: ep.reason, returning: ep.returning, expectedOutAt: ep.expectedOutAt, expectedReturnAt: ep.expectedReturnAt, expectedDurationMinutes: ep.durationMinutes, headApprovedById: ep.headAt ? deptHead : null, headApprovedAt: ep.headAt, managerApprovedById: ep.managerAt ? manager : null, managerApprovedAt: ep.managerAt, declinedById: ep.declinedAt ? manager : null, declinedAt: ep.declinedAt, declineReason: ep.declineReason, gateOutAt: ep.gateOutAt, gateOutById: ep.gateOutAt ? gate : null, gateInAt: ep.gateInAt, gateInById: ep.gateInAt ? gate : null, createdAt: ep.createdAt } });
    await prisma.exitPassPerson.createMany({ data: ep.people.map((p) => ({ id: reg('ExitPassPerson', id()), exitPassId: eid, userId: by(p.key), name: p.name, employeeId: p.employeeId, designation: p.designation })) });
  }
  for (const inc of [...plan.incidents].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) await prisma.securityIncident.create({ data: { id: reg('SecurityIncident', id()), incidentNumber: await numbers.take('INC', inc.occurredAt), branchId: isolo.id, type: inc.type, severity: inc.severity, status: inc.status, occurredAt: inc.occurredAt, location: inc.location, description: inc.description, actionTaken: inc.actionTaken, reportedById: by(inc.reportedByKey), assignedToId: inc.assignedToKey ? by(inc.assignedToKey) : null, resolution: inc.resolution, closedAt: inc.closedAt, closedById: inc.closedAt ? cso : null, createdAt: inc.occurredAt } });
  for (const d of [...plan.deliveries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) await prisma.gateDelivery.create({ data: { id: reg('GateDelivery', id()), deliveryNumber: await numbers.take('DLV', d.createdAt), branchId: isolo.id, status: d.status, supplierName: d.supplierName, items: d.items, expectedAt: d.expectedAt, driverName: d.driverName, vehicleType: 'TRUCK', vehiclePlate: d.plate, registeredById: storeManager, arrivedAt: d.arrivedAt, arrivedById: d.arrivedAt ? gate : null, receivedAt: d.receivedAt, receivedById: d.receivedAt ? storeManager : null, goodsReceiptId: d.receiptKey ? receiptIds.get(d.receiptKey)! : null, leftAt: d.leftAt, leftById: d.leftAt ? gate : null, createdAt: d.createdAt } });
  for (const c of plan.contractors) {
    const cid = reg('ContractorPass', id());
    await prisma.contractorPass.create({ data: { id: cid, passNumber: await numbers.take('CTR', c.managerAt), branchId: isolo.id, status: c.status, company: c.company, work: c.work, workArea: c.workArea, leadName: c.leadName, teamSize: c.teamSize, validFrom: c.validFrom, validUntil: c.validUntil, hostUserId: by(c.hostKey), requestedById: by(c.requestedByKey), managerApprovedById: manager, managerApprovedAt: c.managerAt, createdAt: c.managerAt } });
    await prisma.contractorAttendance.createMany({ data: c.attendance.map((a) => ({ id: reg('ContractorAttendance', id()), passId: cid, workersPresent: a.workers, signedInAt: a.inAt, signedInById: gate, signedOutAt: a.outAt, signedOutById: a.outAt ? gate : null })) });
  }

  // ── Scheduling, broadcasts, support, Data Exchange ─────────────────────
  const roomIds = new Map<string, string>();
  for (const room of plan.rooms) {
    const existing = await prisma.meetingRoom.findUnique({ where: { branchId_name: { branchId: isolo.id, name: room.name } }, select: { id: true } });
    const rid = existing?.id ?? reg('MeetingRoom', id());
    if (!existing) await prisma.meetingRoom.create({ data: { id: rid, branchId: isolo.id, name: room.name, location: room.location, capacity: room.capacity } });
    roomIds.set(room.key, rid);
  }
  for (const a of [...plan.appointments].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
    const aid = reg('Appointment', id());
    await prisma.appointment.create({ data: { id: aid, appointmentNumber: await numbers.take('APT', a.createdAt), branchId: isolo.id, status: a.status, title: a.title, agenda: a.agenda, ownerId: by(a.ownerKey), createdById: by(a.ownerKey), startsAt: a.startsAt, endsAt: a.endsAt, roomId: a.roomKey ? roomIds.get(a.roomKey)! : null, location: a.location, completedAt: a.status === 'COMPLETED' ? a.endsAt : null, cancelledAt: a.status === 'CANCELLED' ? a.startsAt : null, createdAt: a.createdAt } });
    if (a.participantKeys.length) await prisma.appointmentParticipant.createMany({ data: a.participantKeys.map((k) => ({ id: reg('AppointmentParticipant', id()), appointmentId: aid, userId: by(k) })) });
  }
  for (const b of [...plan.broadcasts].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) await prisma.broadcast.create({ data: { id: reg('Broadcast', id()), broadcastNumber: await numbers.take('BC', b.createdAt), ...base, category: b.category as 'NEWS', title: b.title, message: b.message, audience: b.audience as 'ALL', audienceIds: b.audience === 'BRANCH' ? [isolo.id] : [], startsAt: b.startsAt, endsAt: b.endsAt, createdById: by(b.byKey), createdAt: b.createdAt } });
  await prisma.announcement.create({ data: { id: reg('Announcement', id()), ...base, message: plan.announcement.message, expiresAt: plan.announcement.expiresAt, createdById: by(plan.announcement.byKey), createdAt: plan.announcement.createdAt } });
  let queue = await prisma.supportQueue.findFirst({ where: { organisationId, isDefault: true }, select: { id: true } });
  if (!queue) queue = await prisma.supportQueue.findFirst({ where: { organisationId }, select: { id: true } });
  for (const t of [...plan.tickets].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
    const tid = reg('SupportTicket', id());
    await prisma.supportTicket.create({ data: { id: tid, ...base, branchId: isolo.id, number: await numbers.take('SUP', t.createdAt), channel: t.channel, customerId: t.customerKey ? customerIds.get(t.customerKey) ?? null : null, contactName: t.contactName, contactPhone: t.contactPhone, contactEmail: t.contactEmail, subject: t.subject, summary: t.summary, status: t.status, assignedToId: t.assignedToKey ? by(t.assignedToKey) : null, priority: t.priority, tags: t.tags, queueId: queue?.id ?? null, firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt, dueFirstResponseAt: t.dueFirstResponseAt, dueResolutionAt: t.dueResolutionAt, csatScore: t.csat, senderKind: t.channel === 'STAFF' ? 'staff' : t.customerKey ? 'customer' : 'public', requesterUserId: t.requesterKey ? by(t.requesterKey) : null, lastCustomerAt: t.replies.filter((x) => x.kind === 'CUSTOMER').at(-1)?.at ?? t.createdAt, lastAgentAt: t.replies.filter((x) => x.kind !== 'CUSTOMER').at(-1)?.at ?? null, createdAt: t.createdAt } });
    if (t.replies.length) await prisma.supportReply.createMany({ data: t.replies.map((rp) => ({ id: reg('SupportReply', id()), ticketId: tid, authorUserId: rp.authorKey ? by(rp.authorKey) : null, fromCustomer: rp.kind === 'CUSTOMER', body: rp.body, createdAt: rp.at, visibility: rp.kind === 'NOTE' ? 'INTERNAL' : 'PUBLIC', kind: rp.kind, aiDrafted: rp.kind === 'AI' })) });
  }
  for (const im of [...plan.imports].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) await prisma.importJob.create({ data: { id: reg('ImportJob', id()), number: await numbers.take('IMP', im.createdAt), ...base, branchId: isolo.id, entity: im.entity, fileName: im.fileName, fileSha256: `demo-${im.key}`.padEnd(64, '0'), fileRows: im.rows, headers: json([]), status: 'COMPLETED', goodRows: im.rows - im.rejected, warningRows: im.warnings, rejectedRows: im.rejected, createdRows: im.created, skippedRows: im.rows - im.rejected - im.created, totals: im.totals ? json(im.totals) : undefined, signedOffById: im.signedOffByKey ? by(im.signedOffByKey) : null, signedOffAt: im.signedOffByKey ? new Date(im.createdAt.getTime() + 3 * 3_600_000) : null, createdById: by(im.createdByKey), submittedAt: new Date(im.createdAt.getTime() + 1_800_000), approvedById: by(im.approvedByKey), approvedAt: new Date(im.createdAt.getTime() + 2 * 3_600_000), startedAt: new Date(im.createdAt.getTime() + 2.1 * 3_600_000), completedAt: new Date(im.createdAt.getTime() + 2.4 * 3_600_000), rowsReleasedAt: new Date(im.createdAt.getTime() + 31 * 86_400_000) < anchor ? new Date(im.createdAt.getTime() + 31 * 86_400_000) : null, createdAt: im.createdAt } });
  for (const ex of [...plan.exports].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) await prisma.exportJob.create({ data: { id: reg('ExportJob', id()), ...base, number: await numbers.take('EXP', ex.createdAt), kind: ex.kind, format: ex.format, params: json({ branchId: isolo.id }), summary: ex.summary, rowCount: ex.rows, bytes: ex.rows * 180, createdById: by(ex.createdByKey), createdAt: ex.createdAt, expiresAt: new Date(ex.createdAt.getTime() + 86_400_000) } });

  // ── The trail and the registry ─────────────────────────────────────────
  auditRows.push({ id: reg('AuditLog', id()), organisationId, userId: admin, action: 'demo.workshop_loaded', entityType: 'Branch', entityId: isolo.id, metadata: json({ removed, figures: plan.figures }), createdAt: anchor });
  await inChunks(auditRows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()), (rows) => prisma.auditLog.createMany({ data: rows }));
  await inChunks(registry, (rows) => prisma.demoRecord.createMany({ data: rows.map((x) => ({ organisationId, model: x.model, recordId: x.recordId })) }));
  return { branchName: isolo.name, removed, made, figures: plan.figures };
}
