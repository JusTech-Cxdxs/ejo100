/**
 * Exports — every list that can be exported, with its columns and its rows
 * (server only, never a 'use server' file: the download route and the
 * export actions call these after checking who is asking).
 *
 * Each kind reads exactly what its list shows: the same filters and search
 * (from the page's address), within the person's own reach (organisation,
 * branch, department — the same fences the list uses), in the same order,
 * in blocks — every matching record, not just the first page. Every row
 * carries the EJO number, the SAP (or old-system) number where there is one,
 * and a link back to the record.
 */
import { prisma, type Prisma } from '@ejo/database';
import { allows, branchWithinReach, myOrganisationId, orgWhere, reachWhere } from '@/lib/authz/server';
import type { PermissionKey } from '@/lib/authz/catalogue';
import { portalBaseUrl } from '@/lib/portal-url';
import { getCrmHub, type CrmHubParams } from '@/lib/actions/crm';
import { getHeadquarters } from '@/lib/actions/headquarters';
import { getAuditLogPage } from '@/lib/actions/audit-logs';
import { listUsersForAdmin } from '@/lib/actions/users-admin';
import { searchSecurityRecords, type SecurityRecord } from '@/lib/actions/security';
import { VISIT_STATUS_LABEL, EXIT_PASS_STATUS_LABEL, ROAD_TEST_STATUS_LABEL, INCIDENT_STATUS_LABEL, DELIVERY_STATUS_LABEL, CONTRACTOR_STATUS_LABEL } from '@/lib/security-rules';
import { getInventoryAnalytics } from '@/lib/actions/inventory-analytics';
import { getStoreBranchId } from '@/lib/actions/store';
import { getJobCardOutcomes, getVehicleServiceOutcomes } from '@/lib/actions/visit-outcomes';
import { matchesOutcomeFilter, parseOutcomeFilter } from '@/lib/visit-outcome';
import { warrantyCoverage, WARRANTY_STATE_LABEL } from '@/lib/warranty-state';
import { parseWarrantyFilter, warrantyMatchesFilter } from '@/lib/warranty-list';
import { listWarrantyIdsWithReminderDue } from '@/lib/actions/warranty';
import { parseSourceFilter, sourceWhere } from '@/lib/source-filter';
import { importIdsFor } from '@/lib/source-filter-server';
import type { ExportColumn } from './format';

export type Params = Record<string, string | undefined>;
type Ctx = { userId: string; organisationId: string | null };
export type Block<R> = { rows: R[]; next: string };

// Each list's row is its own query's shape; the registry holds them side by side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExportKind<R = any> = {
  key: string;
  /** "Customers" (sheet and file). */
  label: string;
  /** May open this list: any of these permissions. */
  view: PermissionKey[];
  /** Contact details or payments: needs dataexchange.export.sensitive too. */
  sensitive: boolean;
  /** The list page (for "Back to …" and the About sheet). */
  page: string;
  /** What the file holds, when it is not simply every matching record (the About sheet says so). */
  note?: string;
  columns: ExportColumn<R>[];
  /**
   * The rows, in blocks, as the list shows them. `from` resumes after a
   * block already written (a large export comes in parts); each block says
   * where the next one starts.
   */
  rows: (ctx: Ctx, p: Params, from: string | null) => AsyncIterable<Block<R>>;
};

// Rows read per query. EXPORT_BLOCK_ROWS is for the end-to-end tests only (tiny blocks, so a few rows make several parts).
const BLOCK = Math.max(1, Math.trunc(Number(process.env.EXPORT_BLOCK_ROWS)) || 2000);
const base = () => portalBaseUrl().replace(/\/$/, '');
const link = (path: string) => `${base()}${path}`;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const sys = (src: string | null | undefined) => (!src ? null : src.toUpperCase().startsWith('LEGACY') ? 'Old system' : 'SAP');
const words = (s: string | null | undefined) => (s ? s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

/** Keyset reading in the list's own order (with the id as tie-breaker), a block at a time, from a record already written. */
async function* blocks<R extends { id: string }>(read: (cursor: string | null) => Promise<R[]>, from: string | null): AsyncGenerator<Block<R>> {
  let cursor: string | null = from && from !== 'end' ? from : null;
  if (from === 'end') return;
  for (;;) {
    // One row more than a block: whether anything follows is known, so a list never ends on an empty part.
    const got = await read(cursor);
    if (!got.length) return;
    const more = got.length > BLOCK;
    const rows = more ? got.slice(0, BLOCK) : got;
    cursor = rows[rows.length - 1]!.id;
    yield { rows, next: more ? cursor : 'end' };
    if (!more) return;
  }
}
/** A list already worked out in full (the page computes it the same way), a block at a time from a position. */
function* slices<R>(all: R[], from: string | null): Generator<Block<R>> {
  for (let i = from === 'end' ? all.length : Number(from ?? 0) || 0; i < all.length; i += BLOCK) yield { rows: all.slice(i, i + BLOCK), next: i + BLOCK >= all.length ? 'end' : String(i + BLOCK) };
}
const page = (cursor: string | null): { cursor?: { id: string }; skip?: number; take: number } => (cursor ? { cursor: { id: cursor }, skip: 1, take: BLOCK + 1 } : { take: BLOCK + 1 });

async function importNumbers(ids: (string | null)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!u.length) return new Map();
  return new Map((await prisma.importJob.findMany({ where: { id: { in: u } }, select: { id: true, number: true } })).map((j) => [j.id, j.number]));
}

// ── Customers ─────────────────────────────────────────────────────────

type CustomerRow = Awaited<ReturnType<typeof getCrmHub>>['rows'][number] & { imp: string | null };
const customers: ExportKind<CustomerRow> = {
  key: 'customers', label: 'Customers', view: ['crm.view'], sensitive: true, page: '/crm',
  columns: [
    { header: 'SAP / old-system number', type: 'code', width: 16, get: (r) => r.externalId },
    { header: 'Name', type: 'text', width: 28, get: (r) => r.fullName },
    { header: 'Type', type: 'text', width: 12, get: (r) => (r.customerType === 'ORGANIZATION' ? 'Organisation' : 'Individual') },
    { header: 'Phone', type: 'code', width: 16, get: (r) => r.phone },
    { header: 'Second phone', type: 'code', width: 16, get: (r) => r.altPhone },
    { header: 'Email', type: 'text', width: 26, get: (r) => r.email },
    { header: 'Address', type: 'text', width: 30, get: (r) => r.address },
    { header: 'Tags', type: 'text', width: 16, get: (r) => r.tags.join(', ') },
    { header: 'Customer since', type: 'day', width: 12, get: (r) => r.customerSince ?? null },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Vehicles', type: 'int', width: 9, get: (r) => r.vehicles },
    { header: 'Open jobs', type: 'int', width: 9, get: (r) => r.openJobs },
    { header: 'Lifetime spend', type: 'money', width: 14, get: (r) => r.netPaid },
    { header: 'Spend this year', type: 'money', width: 14, get: (r) => r.netYear },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Last visit', type: 'date', width: 12, get: (r) => r.lastVisit },
    { header: 'Customer portal', type: 'bool', width: 10, get: (r) => r.hasPortalAccount && r.isActive },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/crm/customers/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const hub = await getCrmHub(p as CrmHubParams, { all: true });
    const imp = await importNumbers(hub.rows.map((r) => r.importJobId));
    yield* slices(hub.rows.map((r) => ({ ...r, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })), from);
  },
};

// ── Vehicles ──────────────────────────────────────────────────────────

const vehicles: ExportKind = {
  key: 'vehicles', label: 'Vehicles', view: ['workshop.view'], sensitive: false, page: '/workshop/vehicles',
  columns: [
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.chassisNumber },
    { header: 'SAP / old-system number', type: 'code', width: 14, get: (r) => r.externalId },
    { header: 'Engine number', type: 'code', width: 14, get: (r) => r.engineNumber },
    { header: 'Make', type: 'text', width: 10, get: (r) => r.make },
    { header: 'Model', type: 'text', width: 12, get: (r) => r.model },
    { header: 'Year', type: 'int', width: 6, get: (r) => r.year },
    { header: 'Category', type: 'text', width: 11, get: (r) => (r.vehicleType === 'COMMERCIAL' ? 'Commercial' : r.vehicleType === 'PASSENGER' ? 'Passenger' : '') },
    { header: 'Mileage (km)', type: 'int', width: 10, get: (r) => r.mileage },
    { header: 'Customer', type: 'text', width: 24, get: (r) => r.customer?.fullName },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/workshop/vehicles/${r.id}/edit`) },
  ],
  async *rows(ctx, p, from) {
    const q = p.q?.trim();
    const type = p.type === 'PASSENGER' || p.type === 'COMMERCIAL' ? p.type : undefined;
    const fence = await orgWhere();
    const sf = parseSourceFilter(p);
    const where: Prisma.CustomerVehicleWhereInput = {
      customer: fence, ...(sourceWhere(sf, await importIdsFor(fence.organisationId ?? ctx.organisationId, sf)) as Prisma.CustomerVehicleWhereInput),
      ...(type ? { vehicleType: type } : {}),
      ...(q ? { OR: [{ plateNumber: { contains: q, mode: 'insensitive' } }, { chassisNumber: { contains: q, mode: 'insensitive' } }, { make: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { externalId: { in: [q, q.replace(/^0+(?=\w)/, '')] } }] } : {}),
    };
    for await (const { rows: b, next } of blocks((c) => prisma.customerVehicle.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { customer: { select: { fullName: true } } } }), from)) {
      const imp = await importNumbers(b.map((r) => r.importJobId));
      yield { next, rows: b.map((r) => ({ ...r, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

// ── The Store: parts, stock (with its value), suppliers, goods receipts ─

const parts: ExportKind = {
  key: 'parts', label: 'Parts', view: ['store.view'], sensitive: false, page: '/inventory/parts',
  columns: [
    { header: 'Part number', type: 'code', width: 16, get: (r) => r.partNumber },
    { header: 'Description', type: 'text', width: 32, get: (r) => r.name },
    { header: 'Material group / category', type: 'text', width: 14, get: (r) => r.category },
    { header: 'Base unit', type: 'text', width: 9, get: (r) => r.baseUnitOfMeasure },
    { header: 'Tracking', type: 'text', width: 9, get: (r) => words(r.trackingType) },
    { header: 'Barcode', type: 'code', width: 14, get: (r) => r.barcode },
    { header: 'Selling price', type: 'money', width: 12, get: (r) => n(r.sellingPrice) },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Reorder point', type: 'number', width: 10, get: (r) => n(r.reorderPoint) },
    { header: 'Safety stock', type: 'number', width: 10, get: (r) => n(r.safetyStock) },
    { header: 'On hand', type: 'number', width: 9, get: (r) => n(r.stock?.quantityOnHand) ?? 0 },
    { header: 'SAP / old-system number', type: 'code', width: 16, get: (r) => r.externalId },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/inventory/parts/${r.id}`) },
  ],
  async *rows(ctx, p, from) {
    const branchId = await branchWithinReach('store.view', await getStoreBranchId());
    const q = p.q?.trim();
    const sf = parseSourceFilter(p);
    const where: Prisma.PartWhereInput = {
      branchId, isActive: true, ...(sourceWhere(sf, await importIdsFor(ctx.organisationId, sf)) as Prisma.PartWhereInput),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}),
    };
    for await (const { rows: b, next } of blocks((c) => prisma.part.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...page(c), include: { stock: true } }), from)) {
      const imp = await importNumbers(b.map((r) => r.importJobId));
      yield { next, rows: b.map((r) => ({ ...r, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

type StockRow = Awaited<ReturnType<typeof getInventoryAnalytics>>['rows'][number];
const stock: ExportKind<StockRow> = {
  key: 'stock', label: 'Stock and value', view: ['analytics.inventory.view'], sensitive: false, page: '/inventory/analytics',
  columns: [
    { header: 'Part number', type: 'code', width: 16, get: (r) => r.partNumber },
    { header: 'Description', type: 'text', width: 30, get: (r) => r.name },
    { header: 'Category', type: 'text', width: 14, get: (r) => r.category },
    { header: 'Unit', type: 'text', width: 8, get: (r) => r.unit },
    { header: 'On hand', type: 'number', width: 9, get: (r) => r.onHand },
    { header: 'Reserved', type: 'number', width: 9, get: (r) => r.reserved },
    { header: 'Available', type: 'number', width: 9, get: (r) => r.available },
    { header: 'Stock value (FIFO cost)', type: 'money', width: 14, get: (r) => r.stockValue },
    { header: 'Average cost', type: 'money', width: 12, get: (r) => r.avgCost },
    { header: 'Last cost', type: 'money', width: 12, get: (r) => r.lastCost },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Status', type: 'text', width: 14, get: (r) => words(r.status) },
    { header: 'ABC', type: 'text', width: 5, get: (r) => r.abc },
    { header: 'Days of cover', type: 'int', width: 9, get: (r) => r.daysOfCover },
    { header: 'Suggested order', type: 'number', width: 10, get: (r) => r.suggestedOrderQty },
    { header: 'Last movement', type: 'date', width: 12, get: (r) => r.lastMovement },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/inventory/parts/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    // The same choices as the page: lead time 1–180 days (14), service level 90–99% (95%).
    const lead = Math.min(180, Math.max(1, Number(p.lead) || 14));
    const service = ['0.9', '0.95', '0.975', '0.99'].includes(p.service ?? '') ? Number(p.service) : 0.95;
    const a = await getInventoryAnalytics(await getStoreBranchId(), { leadTimeDays: lead, serviceLevel: service });
    yield* slices(a.rows, from);
  },
};

const suppliers: ExportKind = {
  key: 'suppliers', label: 'Suppliers', view: ['store.view'], sensitive: false, page: '/inventory/suppliers',
  columns: [
    { header: 'Supplier number (SAP)', type: 'code', width: 14, get: (r) => r.externalId },
    { header: 'Name', type: 'text', width: 30, get: (r) => r.name },
    { header: 'Contact person', type: 'text', width: 18, get: (r) => r.contactName },
    { header: 'Phone', type: 'code', width: 16, get: (r) => r.phone },
    { header: 'Email', type: 'text', width: 24, get: (r) => r.email },
    { header: 'Address', type: 'text', width: 28, get: (r) => r.address },
    { header: 'Tax ID', type: 'code', width: 12, get: (r) => r.taxId },
    { header: 'Active', type: 'bool', width: 7, get: (r) => r.isActive },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
  ],
  async *rows(ctx, p, from) {
    const organisationId = ctx.organisationId ?? '__none__';
    const q = String(p.q ?? '').trim().slice(0, 80);
    const sf = parseSourceFilter(p);
    const where: Prisma.SupplierWhereInput = { organisationId, ...(sourceWhere(sf, await importIdsFor(organisationId, sf)) as Prisma.SupplierWhereInput), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { externalId: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) };
    yield* blocks((c) => prisma.supplier.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...page(c) }), from);
  },
};

const goodsReceipts: ExportKind = {
  key: 'goods-receipts', label: 'Goods receipt lines', view: ['store.view'], sensitive: false, page: '/inventory/goods-receipts',
  columns: [
    { header: 'Goods receipt', type: 'code', width: 16, get: (r) => r.goodsReceipt.referenceNumber },
    { header: 'Received', type: 'datetime', width: 16, get: (r) => r.goodsReceipt.receivedAt },
    { header: 'Supplier', type: 'text', width: 24, get: (r) => r.goodsReceipt.supplierName },
    { header: 'Supplier number (SAP)', type: 'code', width: 14, get: (r) => r.goodsReceipt.supplier?.externalId },
    { header: 'Opening balance', type: 'bool', width: 9, get: (r) => r.goodsReceipt.isOpeningBalance },
    { header: 'Part number', type: 'code', width: 16, get: (r) => r.part.partNumber },
    { header: 'Description', type: 'text', width: 28, get: (r) => r.part.name },
    { header: 'Quantity (base unit)', type: 'number', width: 10, get: (r) => n(r.quantityInBaseUnit) },
    { header: 'Base unit', type: 'text', width: 9, get: (r) => r.part.baseUnitOfMeasure },
    { header: 'Unit cost', type: 'money', width: 12, get: (r) => n(r.unitCost) },
    { header: 'Line cost', type: 'money', width: 13, get: (r) => n(r.totalCost) },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/inventory/goods-receipts/${r.goodsReceipt.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const branchId = await getStoreBranchId();
    const q = p.q?.trim();
    const where: Prisma.GoodsReceiptLineWhereInput = { goodsReceipt: { branchId, ...(q ? { OR: [{ referenceNumber: { contains: q, mode: 'insensitive' } }, { supplierName: { contains: q, mode: 'insensitive' } }] } : {}) } };
    yield* blocks((c) => prisma.goodsReceiptLine.findMany({ where, orderBy: [{ goodsReceipt: { receivedAt: 'desc' } }, { id: 'asc' }], ...page(c), include: { part: { select: { partNumber: true, name: true, baseUnitOfMeasure: true } }, goodsReceipt: { select: { id: true, referenceNumber: true, receivedAt: true, supplierName: true, isOpeningBalance: true, supplier: { select: { externalId: true } } } } } }), from);
  },
};

// ── Workshop: Job Cards and Vehicle Services ──────────────────────────

const jobSearch = (q: string | undefined): Prisma.JobCardWhereInput => (q ? { OR: [{ jobNumber: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } }, { vehicle: { chassisNumber: { contains: q, mode: 'insensitive' } } }, { assignedTechnician: { fullName: { contains: q, mode: 'insensitive' } } }] } : {});
const jobCards: ExportKind = {
  key: 'job-cards', label: 'Job Cards', view: ['workshop.job_card.view'], sensitive: false, page: '/workshop/job-cards',
  columns: [
    { header: 'Job Card', type: 'code', width: 16, get: (r) => r.jobNumber },
    { header: 'Status', type: 'text', width: 16, get: (r) => words(r.status) },
    { header: 'Outcome', type: 'text', width: 14, get: (r) => r.outcome },
    { header: 'Opened', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Completed', type: 'datetime', width: 16, get: (r) => r.completedAt },
    { header: 'Checked out', type: 'datetime', width: 16, get: (r) => r.checkedOutAt },
    { header: 'Branch', type: 'text', width: 14, get: (r) => r.branch?.name },
    { header: 'Customer', type: 'text', width: 24, get: (r) => r.customer?.fullName },
    { header: 'Customer SAP number', type: 'code', width: 14, get: (r) => r.customer?.externalId },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.vehicle?.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vehicle?.chassisNumber },
    { header: 'Vehicle', type: 'text', width: 16, get: (r) => [r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' ') },
    { header: 'Technician', type: 'text', width: 18, get: (r) => r.assignedTechnician?.fullName },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/workshop/job-cards/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const reach = await reachWhere('workshop.job_card.view');
    const type = p.type === 'PASSENGER' || p.type === 'COMMERCIAL' ? p.type : undefined;
    const outcome = parseOutcomeFilter(p.outcome);
    const where: Prisma.JobCardWhereInput = { AND: [reach as Prisma.JobCardWhereInput, jobSearch(p.q?.trim()), type ? { vehicle: { vehicleType: type } } : {}] };
    for await (const { rows: b, next } of blocks((c) => prisma.jobCard.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { branch: { select: { name: true } }, customer: { select: { fullName: true, externalId: true } }, vehicle: { select: { plateNumber: true, chassisNumber: true, make: true, model: true } }, assignedTechnician: { select: { fullName: true } } } }), from)) {
      const out = await getJobCardOutcomes(b.map((r) => r.id));
      const rows = b.map((r) => ({ ...r, outcome: out[r.id] ? words(out[r.id]!.outcome) : null, _o: out[r.id] }));
      yield { next, rows: outcome ? rows.filter((r) => r._o && matchesOutcomeFilter(outcome, r._o.outcome, r._o.refund)) : rows };
    }
  },
};

const services: ExportKind = {
  key: 'vehicle-services', label: 'Vehicle Services', view: ['workshop.job_card.view'], sensitive: false, page: '/workshop/vehicle-service',
  columns: [
    { header: 'Vehicle Service', type: 'code', width: 16, get: (r) => r.serviceNumber },
    { header: 'Status', type: 'text', width: 16, get: (r) => words(r.status) },
    { header: 'Outcome', type: 'text', width: 14, get: (r) => r.outcome },
    { header: 'Booked', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Checked in', type: 'datetime', width: 16, get: (r) => r.checkedInAt },
    { header: 'Completed', type: 'datetime', width: 16, get: (r) => r.completedAt },
    { header: 'Branch', type: 'text', width: 14, get: (r) => r.branch?.name },
    { header: 'Customer', type: 'text', width: 24, get: (r) => r.customer?.fullName },
    { header: 'Customer SAP number', type: 'code', width: 14, get: (r) => r.customer?.externalId },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.vehicle?.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vehicle?.chassisNumber },
    { header: 'Moved to Job Card', type: 'code', width: 16, get: (r) => r.escalatedToJobCard?.jobNumber },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/workshop/vehicle-service/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const reach = await reachWhere('workshop.job_card.view');
    const type = p.type === 'PASSENGER' || p.type === 'COMMERCIAL' ? p.type : undefined;
    const q = p.q?.trim();
    const outcome = parseOutcomeFilter(p.outcome);
    const where: Prisma.VehicleServiceWhereInput = { AND: [reach as Prisma.VehicleServiceWhereInput, type ? { vehicle: { vehicleType: type } } : {}, q ? { OR: [{ serviceNumber: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } }, { vehicle: { chassisNumber: { contains: q, mode: 'insensitive' } } }, { assignedTechnician: { fullName: { contains: q, mode: 'insensitive' } } }] } : {}] };
    for await (const { rows: b, next } of blocks((c) => prisma.vehicleService.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { branch: { select: { name: true } }, customer: { select: { fullName: true, externalId: true } }, vehicle: { select: { plateNumber: true, chassisNumber: true } }, escalatedToJobCard: { select: { jobNumber: true } } } }), from)) {
      const out = await getVehicleServiceOutcomes(b.map((r) => r.id));
      const rows = b.map((r) => ({ ...r, outcome: out[r.id] ? words(out[r.id]!.outcome) : null, _o: out[r.id] }));
      yield { next, rows: outcome ? rows.filter((r) => r._o && matchesOutcomeFilter(outcome, r._o.outcome, r._o.refund)) : rows };
    }
  },
};

// ── Warranty ──────────────────────────────────────────────────────────

const warranties: ExportKind = {
  key: 'warranties', label: 'Warranties', view: ['warranty.view'], sensitive: false, page: '/warranty',
  columns: [
    { header: 'Warranty', type: 'code', width: 16, get: (r) => r.warrantyNumber },
    { header: 'Kind', type: 'text', width: 9, get: (r) => (r.kind === 'PART' ? 'Part' : 'Vehicle') },
    { header: 'Covers', type: 'text', width: 30, get: (r) => r.subjectDescription },
    { header: 'Coverage now', type: 'text', width: 16, get: (r) => WARRANTY_STATE_LABEL[r.cov.state as keyof typeof WARRANTY_STATE_LABEL] ?? r.cov.state },
    { header: 'Starts', type: 'date', width: 12, get: (r) => r.startsAt },
    { header: 'Ends', type: 'date', width: 12, get: (r) => r.endsAt },
    { header: 'Distance limit (km)', type: 'int', width: 10, get: (r) => r.distanceLimit },
    { header: 'Customer', type: 'text', width: 24, get: (r) => r.customer?.fullName },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.vehicle?.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vehicle?.chassisNumber },
    { header: 'Issued', type: 'date', width: 12, get: (r) => r.issuedAt },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/warranty/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const q = p.q?.trim();
    const filter = parseWarrantyFilter(p.filter);
    const fence = await orgWhere();
    const reminderDue = filter === 'reminder' ? new Set(await listWarrantyIdsWithReminderDue()) : null;
    const where: Prisma.WarrantyWhereInput = { customer: fence, ...(q ? { OR: [{ warrantyNumber: { contains: q, mode: 'insensitive' } }, { subjectDescription: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } }, { vehicle: { chassisNumber: { contains: q, mode: 'insensitive' } } }] } : {}) };
    for await (const { rows: b, next } of blocks((c) => prisma.warranty.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], ...page(c), include: { customer: { select: { fullName: true } }, vehicle: { select: { plateNumber: true, chassisNumber: true, mileage: true } } } }), from)) {
      const rows = b.map((w) => ({ ...w, cov: warrantyCoverage(w as never, w.vehicle?.mileage ?? null) }));
      yield { next, rows: rows.filter((r) => warrantyMatchesFilter(filter, { kind: r.kind, state: r.cov.state, reminderDue: reminderDue?.has(r.id) ?? false })) };
    }
  },
};

// ── SAP history, imports and exports ─────────────────────────────────

const sapInvoices: ExportKind = {
  key: 'sap-invoices', label: 'SAP invoice history', view: ['crm.view'], sensitive: true, page: '/crm',
  columns: [
    { header: 'Invoice number (SAP)', type: 'code', width: 14, get: (r) => r.invoiceNumber },
    { header: 'Fiscal year', type: 'int', width: 8, get: (r) => r.fiscalYear },
    { header: 'Company code', type: 'code', width: 8, get: (r) => r.companyCode },
    { header: 'Document type', type: 'code', width: 8, get: (r) => r.documentType },
    { header: 'Invoice date', type: 'day', width: 12, get: (r) => r.invoiceDate },
    { header: 'Customer', type: 'text', width: 24, get: (r) => r.customerName },
    { header: 'Customer SAP number', type: 'code', width: 14, get: (r) => r.customerExt },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vin },
    { header: 'Amount', type: 'money', width: 13, get: (r) => n(r.amount) },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Description', type: 'text', width: 30, get: (r) => r.description },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/crm/customers/${r.customerId}?tab=jobs`) },
  ],
  async *rows(ctx, p, from) {
    const reach = await reachWhere('crm.view', { lens: false });
    const branchId = typeof reach.branchId === 'string' ? reach.branchId : null;
    const year = /^\d{4}$/.test(String(p.year)) ? Number(p.year) : null;
    const where: Prisma.HistoricalInvoiceWhereInput = { organisationId: ctx.organisationId ?? '__none__', voidedAt: null, ...(branchId ? { branchId } : {}), ...(year ? { fiscalYear: year } : {}), ...(p.customerId ? { customerId: p.customerId } : {}) };
    for await (const { rows: b, next } of blocks((c) => prisma.historicalInvoice.findMany({ where, orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }], ...page(c) }), from)) {
      const [names, imp] = await Promise.all([
        prisma.customer.findMany({ where: { id: { in: [...new Set(b.map((r) => r.customerId))] } }, select: { id: true, fullName: true, externalId: true } }).then((x) => new Map(x.map((c) => [c.id, c]))),
        importNumbers(b.map((r) => r.importJobId)),
      ]);
      yield { next, rows: b.map((r) => ({ ...r, customerName: names.get(r.customerId)?.fullName ?? null, customerExt: names.get(r.customerId)?.externalId ?? null, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

const imports: ExportKind = {
  key: 'imports', label: 'Imports', view: ['dataexchange.import.run', 'dataexchange.import.approve'], sensitive: false, page: '/data-exchange',
  columns: [
    { header: 'Import', type: 'code', width: 16, get: (r) => r.number },
    { header: 'What', type: 'text', width: 16, get: (r) => r.entity },
    { header: 'File', type: 'text', width: 30, get: (r) => r.fileName },
    { header: 'Status', type: 'text', width: 12, get: (r) => words(r.status) },
    { header: 'Rows in the file', type: 'int', width: 10, get: (r) => r.fileRows },
    { header: 'Added', type: 'int', width: 9, get: (r) => r.createdRows },
    { header: 'Filled in', type: 'int', width: 9, get: (r) => r.updatedRows },
    { header: 'Not added', type: 'int', width: 9, get: (r) => r.skippedRows },
    { header: 'Rejected', type: 'int', width: 9, get: (r) => r.rejectedRows + r.duplicateRows },
    { header: 'Started', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Loaded', type: 'datetime', width: 16, get: (r) => r.completedAt },
    { header: 'Prepared by', type: 'text', width: 18, get: (r) => r.createdBy?.fullName },
    { header: 'Approved by', type: 'text', width: 18, get: (r) => r.approvedBy?.fullName },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/data-exchange/imports/${r.id}`) },
  ],
  async *rows(ctx, _p, from) {
    yield* blocks((c) => prisma.importJob.findMany({ where: { organisationId: ctx.organisationId ?? '__none__' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } } }), from);
  },
};

const exportsHistory: ExportKind = {
  key: 'exports', label: 'Exports', view: ['dataexchange.export.run'], sensitive: false, page: '/data-exchange/exports',
  columns: [
    { header: 'Export', type: 'code', width: 16, get: (r) => r.number },
    { header: 'List', type: 'text', width: 18, get: (r) => r.kind },
    { header: 'Format', type: 'text', width: 7, get: (r) => r.format.toUpperCase() },
    { header: 'Filters', type: 'text', width: 40, get: (r) => r.summary },
    { header: 'Contact details or payments', type: 'bool', width: 10, get: (r) => r.sensitive },
    { header: 'Rows', type: 'int', width: 9, get: (r) => r.rowCount },
    { header: 'Size (bytes)', type: 'int', width: 11, get: (r) => r.bytes },
    { header: 'Exported by', type: 'text', width: 18, get: (r) => r.by },
    { header: 'Exported', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Downloads', type: 'int', width: 9, get: (r) => r._count.downloads },
  ],
  async *rows(ctx, p, from) {
    const all = await allows('audit.view');
    for await (const { rows: b, next } of blocks((c) => prisma.exportJob.findMany({ where: { organisationId: ctx.organisationId ?? '__none__', ...(all ? {} : { createdById: ctx.userId }) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { _count: { select: { downloads: true } } } }), from)) {
      const names = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(b.map((r) => r.createdById))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
      yield { next, rows: b.map((r) => ({ ...r, by: names.get(r.createdById) ?? null })) };
    }
  },
};

// ── Administration: people and roles (never passwords), the audit trail ─

type UserExportRow = Awaited<ReturnType<typeof listUsersForAdmin>>['users'][number];
const users: ExportKind<UserExportRow> = {
  // The Users page's own reading (listUsersForAdmin): the administrator's organisation or branch,
  // the platform team never listed to organisations, the same search and filters. Never a password or token.
  key: 'users', label: 'People and roles', view: ['admin.users.manage'], sensitive: false, page: '/users',
  columns: [
    { header: 'Name', type: 'text', width: 24, get: (r) => r.fullName },
    { header: 'Email', type: 'text', width: 28, get: (r) => r.email },
    { header: 'Employee ID', type: 'code', width: 12, get: (r) => r.employeeId },
    { header: 'Branch', type: 'text', width: 16, get: (r) => r.branch },
    { header: 'Department', type: 'text', width: 16, get: (r) => r.department },
    { header: 'Roles', type: 'text', width: 30, get: (r) => r.roles.map((x) => x.name).join(', ') },
    { header: 'Active', type: 'bool', width: 7, get: (r) => r.isActive },
  ],
  async *rows(_ctx, p, from) {
    const { users: all } = await listUsersForAdmin(p.q, { status: p.show, branchId: p.branch, roleId: p.role, all: true });
    yield* slices(all, from);
  },
};

type AuditExportRow = Awaited<ReturnType<typeof getAuditLogPage>>['rows'][number];
const audit: ExportKind<AuditExportRow> = {
  // The audit page's own reading (getAuditLogPage): its tabs, search, person and dates, its
  // fences (organisation, integrity reviewers, the branch lens) and its names ("Platform support").
  // Sign-in addresses are personal data: this list needs the sensitive-export permission too.
  key: 'audit-log', label: 'Audit trail', view: ['audit.view'], sensitive: true, page: '/audit-logs',
  columns: [
    { header: 'When', type: 'datetime', width: 16, get: (r) => r.at },
    { header: 'Who', type: 'text', width: 26, get: (r) => r.who },
    { header: 'Kind', type: 'text', width: 12, get: (r) => r.kind },
    { header: 'What happened', type: 'text', width: 40, get: (r) => r.title },
    { header: 'Details', type: 'text', width: 40, get: (r) => r.detail },
    { header: 'Area', type: 'text', width: 14, get: (r) => r.area },
    { header: 'Records', type: 'text', width: 30, get: (r) => r.records.map((x) => x.label).join('; ') },
    { header: 'Changes', type: 'text', width: 50, get: (r) => r.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join('; ').slice(0, 4000) },
    { header: 'Sign-in address', type: 'code', width: 15, get: (r) => r.ip },
    { header: 'Link', type: 'link', width: 40, get: (r) => (r.records[0]?.url ? link(r.records[0].url) : null) },
  ],
  async *rows(_ctx, p, from) {
    if (from === 'end') return;
    let cursor: string | undefined = from ?? undefined;
    for (;;) {
      const pg = await getAuditLogPage({ kind: p.kind, q: p.q, userId: p.userId, from: p.from, to: p.to, cursor });
      cursor = pg.nextCursor ?? undefined;
      yield { rows: pg.rows, next: cursor ?? 'end' };
      if (!cursor) return;
    }
  },
};

// ── Security: the register (visits, exit passes, road tests, vehicle exits, deliveries, contractors, incidents) ─

const SECURITY_TYPE: Record<string, string> = { VISIT: 'Visit', EXIT_PASS: 'Exit pass', ROAD_TEST: 'Road test', VEHICLE_EXIT: 'Vehicle exit', DELIVERY: 'Delivery', CONTRACTOR: 'Contractor', INCIDENT: 'Incident' };
const SECURITY_STATUS: Record<string, Record<string, string>> = { VISIT: VISIT_STATUS_LABEL, EXIT_PASS: EXIT_PASS_STATUS_LABEL, ROAD_TEST: ROAD_TEST_STATUS_LABEL, INCIDENT: INCIDENT_STATUS_LABEL, DELIVERY: DELIVERY_STATUS_LABEL, CONTRACTOR: CONTRACTOR_STATUS_LABEL };
const security: ExportKind<SecurityRecord> = {
  // The register's own reading (searchSecurityRecords): the gate's branch, the same search and type.
  key: 'security-register', label: 'Security register', view: ['security.view'], sensitive: false, page: '/security/register',
  note: 'The register as the page shows it: the most recent records of each type (several hundred of each), newest first. For every gate event over a period, export the audit trail for those dates.',
  columns: [
    { header: 'Type', type: 'text', width: 12, get: (r) => SECURITY_TYPE[r.type] ?? r.type },
    { header: 'Number', type: 'code', width: 22, get: (r) => r.number },
    { header: 'Who / what', type: 'text', width: 26, get: (r) => r.title },
    { header: 'Details', type: 'text', width: 44, get: (r) => r.detail },
    { header: 'When', type: 'datetime', width: 16, get: (r) => (r.at.getTime() > 0 ? r.at : null) },
    { header: 'Status', type: 'text', width: 16, get: (r) => SECURITY_STATUS[r.type]?.[r.status] ?? (r.type === 'VEHICLE_EXIT' ? 'Left' : words(r.status)) },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(r.href) },
  ],
  async *rows(_ctx, p, from) {
    const type = Object.keys(SECURITY_TYPE).includes(String(p.type)) ? p.type : undefined;
    yield* slices(await searchSecurityRecords(p.q, type), from);
  },
};

// ── Assembly plant ────────────────────────────────────────────────────

const plantWhere = async (ctx: Ctx, p: Params): Promise<Prisma.PlantVehicleWhereInput> => {
  const q = p.q?.trim().slice(0, 60);
  const stage = ['KIT', 'LINE', 'QA', 'PDI', 'YARD', 'SOLD'].includes(String(p.stage)) ? p.stage : undefined;
  return {
    organisationId: ctx.organisationId ?? '__none__', ...((await reachWhere('plant.view')) as Prisma.PlantVehicleWhereInput), ...(stage ? { stage } : {}),
    ...(q ? { OR: [{ vinKey: { contains: q.toUpperCase().replace(/[\s.\-_/]/g, '') } }, { modelCode: { contains: q, mode: 'insensitive' } }, { modelName: { contains: q, mode: 'insensitive' } }, { engineNumber: { contains: q, mode: 'insensitive' } }, { sapProductionOrder: { contains: q } }, { sapEquipment: { contains: q } }] } : {}),
  };
};
const plantVehicles: ExportKind = {
  key: 'plant-vehicles', label: 'Vehicles in the plant', view: ['plant.view'], sensitive: false, page: '/plant/vehicles',
  columns: [
    { header: 'VIN', type: 'code', width: 20, get: (r) => r.vin },
    { header: 'Make', type: 'text', width: 9, get: (r) => r.make },
    { header: 'Model', type: 'code', width: 7, get: (r) => r.modelCode },
    { header: 'Variant', type: 'text', width: 20, get: (r) => r.modelName },
    { header: 'Engine number', type: 'code', width: 14, get: (r) => r.engineNumber },
    { header: 'Colour', type: 'text', width: 10, get: (r) => r.colour },
    { header: 'Model year', type: 'int', width: 7, get: (r) => r.modelYear },
    { header: 'Stage', type: 'text', width: 12, get: (r) => words(r.stage) },
    { header: 'Plant', type: 'text', width: 14, get: (r) => r.branch.name },
    { header: 'SAP plant (WERKS)', type: 'code', width: 8, get: (r) => r.sapPlant },
    { header: 'SAP material (MATNR)', type: 'code', width: 16, get: (r) => r.sapMaterial },
    { header: 'SAP production order (AUFNR)', type: 'code', width: 14, get: (r) => r.sapProductionOrder },
    { header: 'SAP equipment (EQUNR)', type: 'code', width: 14, get: (r) => r.sapEquipment },
    { header: 'Registered', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/vehicles/${r.vinKey}`) },
  ],
  async *rows(ctx, p, from) {
    const where = await plantWhere(ctx, p);
    yield* blocks((c) => prisma.plantVehicle.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { branch: { select: { name: true } } } }), from);
  },
};
const plantPdis: ExportKind = {
  key: 'plant-pdis', label: 'Pre-delivery inspections', view: ['plant.view'], sensitive: false, page: '/plant',
  columns: [
    { header: 'PDI', type: 'code', width: 16, get: (r) => r.number },
    { header: 'VIN', type: 'code', width: 20, get: (r) => r.vehicle.vin },
    { header: 'Model', type: 'code', width: 7, get: (r) => r.vehicle.modelCode },
    { header: 'Attempt', type: 'int', width: 7, get: (r) => r.attempt },
    { header: 'Status', type: 'text', width: 12, get: (r) => words(r.status) },
    { header: 'SAP usage decision', type: 'code', width: 8, get: (r) => r.sapUsageDecision },
    { header: 'Checklist', type: 'text', width: 14, get: (r) => `${r.templateKey} v${r.templateVersion}` },
    { header: 'Items Not OK', type: 'int', width: 8, get: (r) => r.items.filter((i: { result: string | null }) => i.result === 'NOT_OK').length },
    { header: 'Items reworked', type: 'int', width: 8, get: (r) => r.items.filter((i: { reworkedAt: Date | null }) => i.reworkedAt).length },
    { header: 'Odometer (km)', type: 'int', width: 8, get: (r) => r.odometerKm },
    { header: 'Battery (V)', type: 'number', width: 8, get: (r) => r.batteryVolts },
    { header: 'Tyres front (psi)', type: 'number', width: 8, get: (r) => r.tyreFrontPsi },
    { header: 'Tyres rear (psi)', type: 'number', width: 8, get: (r) => r.tyreRearPsi },
    { header: 'Fault codes', type: 'code', width: 16, get: (r) => r.faultCodes.join(' ') },
    { header: 'Fault codes cleared', type: 'bool', width: 8, get: (r) => (r.faultCodes.length ? r.faultCodesCleared : null) },
    { header: 'Inspector', type: 'text', width: 18, get: (r) => r.inspector },
    { header: 'Started', type: 'datetime', width: 16, get: (r) => r.startedAt },
    { header: 'Submitted', type: 'datetime', width: 16, get: (r) => r.submittedAt },
    { header: 'Decided by', type: 'text', width: 18, get: (r) => r.decider },
    { header: 'Decided', type: 'datetime', width: 16, get: (r) => r.decidedAt },
    { header: 'SAP production order (AUFNR)', type: 'code', width: 14, get: (r) => r.vehicle.sapProductionOrder },
    { header: 'SAP equipment (EQUNR)', type: 'code', width: 14, get: (r) => r.vehicle.sapEquipment },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/plant/pdi/${r.id}`) },
  ],
  async *rows(ctx, _p, from) {
    const where: Prisma.PdiInspectionWhereInput = { organisationId: ctx.organisationId ?? '__none__', ...((await reachWhere('plant.view')) as Prisma.PdiInspectionWhereInput) };
    for await (const { rows: b, next } of blocks((c) => prisma.pdiInspection.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { vehicle: true, items: { select: { result: true, reworkedAt: true } } } }), from)) {
      const ids = [...new Set(b.flatMap((r) => [r.inspectorId, r.decidedById]).filter((x): x is string => Boolean(x)))];
      const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
      yield { next, rows: b.map((r) => ({ ...r, inspector: names.get(r.inspectorId) ?? null, decider: r.decidedById ? names.get(r.decidedById) ?? null : null })) };
    }
  },
};

// ── Headquarters ──────────────────────────────────────────────────────

const headquarters: ExportKind<import('@/lib/actions/headquarters').HqRow> = {
  key: 'headquarters', label: 'Headquarters', view: ['analytics.business.view'], sensitive: false, page: '/headquarters',
  columns: [
    { header: 'Branch', type: 'text', width: 18, get: (r) => r.name },
    { header: 'Health', type: 'text', width: 12, get: (r) => r.health.label },
    { header: 'Why', type: 'text', width: 30, get: (r) => r.health.reasons.join('; ') },
    { header: 'Staff', type: 'int', width: 7, get: (r) => r.staff },
    { header: 'Jobs opened', type: 'int', width: 9, get: (r) => r.opened },
    { header: 'Jobs finished', type: 'int', width: 9, get: (r) => r.finished },
    { header: 'Collected (payments less refunds)', type: 'money', width: 14, get: (r) => r.collected },
    { header: 'Invoiced in SAP before EJO', type: 'money', width: 14, get: (r) => r.fromSap },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'In the workshop now', type: 'int', width: 9, get: (r) => r.inWorkshop },
    { header: 'Ready to collect', type: 'int', width: 9, get: (r) => r.ready },
    { header: 'Decisions waiting', type: 'int', width: 9, get: (r) => r.waiting },
    { header: 'Median turnaround (hours)', type: 'int', width: 10, get: (r) => r.turnaroundHours },
  ],
  async *rows(_ctx, p, from) {
    const hq = await getHeadquarters(p.period, { history: p.history !== 'exclude' });
    yield* slices(hq.branches, from);
  },
};

export const EXPORT_KINDS: Record<string, ExportKind> = Object.fromEntries(
  [customers, vehicles, parts, stock, suppliers, goodsReceipts, jobCards, services, warranties, sapInvoices, imports, exportsHistory, users, audit, security, plantVehicles, plantPdis, headquarters].map((k) => [k.key, k]),
);

/** May this person export this list (open it, export, and — for contact details or payments — export those)? */
export async function mayExport(kind: ExportKind): Promise<boolean> {
  if (!(await allows('dataexchange.export.run'))) return false;
  if (kind.sensitive && !(await allows('dataexchange.export.sensitive'))) return false;
  for (const v of kind.view) if (await allows(v)) return true;
  return false;
}

export async function exportOrganisation(): Promise<string | null> {
  return (await orgWhere()).organisationId ?? (await myOrganisationId());
}
