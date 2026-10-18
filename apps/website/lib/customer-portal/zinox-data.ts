import { cache } from 'react';
import { prisma } from '@ejo/database';
import { warrantyState, type WarrantyState } from './status';

/** Decimal / string / number → number (0 when missing). Kept local so unit tests can compile this file without the app's path aliases. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v.toString()));

/**
 * Zinox edition reads for the customer and dealer portal: the customer's
 * devices (finished units by serial), their sales orders with pro-formas,
 * payments and invoices, the dealer price list and broadcast, and their
 * product warranty claims and service jobs. Every query is keyed by the
 * signed-in customer's id; no staff names, no costs, no other customer's rows.
 */

const DAY = 86_400_000;

// ---------------------------------------------------------------- Pure helpers (tested)

export type DeviceCover = { state: WarrantyState | 'none'; label: string; warrantyId: string | null; endsAt: Date | null; daysLeft: number | null; canActivate: boolean };

/** What the customer sees about a device's cover today, from its PRODUCT warranty rows. */
export function deviceCover(rows: { id: string; kind: string; status: string; startsAt: Date; endsAt: Date }[], now = new Date()): DeviceCover {
  const products = rows.filter((r) => r.kind === 'PRODUCT' && r.status !== 'VOID' && r.status !== 'TRANSFERRED');
  const active = products.filter((r) => r.status === 'ACTIVE' && r.startsAt.getTime() <= now.getTime() && r.endsAt.getTime() >= now.getTime()).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  if (active[0]) {
    const st = warrantyState(active[0], now);
    return { state: st, label: st === 'expiring' ? 'Warranty ending soon' : 'Under warranty', warrantyId: active[0].id, endsAt: active[0].endsAt, daysLeft: Math.ceil((active[0].endsAt.getTime() - now.getTime()) / DAY), canActivate: false };
  }
  const pending = products.find((r) => r.status === 'PENDING_VERIFICATION');
  if (pending) return { state: 'pending', label: 'Warranty being verified', warrantyId: pending.id, endsAt: pending.endsAt, daysLeft: null, canActivate: false };
  const latest = products.sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  if (latest) return { state: latest.status === 'SUSPENDED' ? 'void' : 'expired', label: latest.status === 'SUSPENDED' ? 'Warranty suspended' : 'Warranty expired', warrantyId: latest.id, endsAt: latest.endsAt, daysLeft: null, canActivate: false };
  return { state: 'none', label: 'Warranty not activated', warrantyId: null, endsAt: null, daysLeft: null, canActivate: true };
}

/** The customer's reading of a sales order's money: what it comes to, what we have confirmed, what is pending confirmation. */
export function orderMoney(o: { total: unknown; amountPaid: unknown; payments: { amount: unknown; status: string }[] }): { total: number; paid: number; pending: number; outstanding: number } {
  const total = num(o.total);
  const paid = num(o.amountPaid);
  const pending = o.payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + num(p.amount), 0);
  return { total, paid, pending: Math.round(pending * 100) / 100, outstanding: Math.max(0, Math.round((total - paid) * 100) / 100) };
}

/** Changes on a price broadcast, read defensively (the Sales module writes JSON). */
export type PriceChange = { product: string; from: number | null; to: number | null };
export function broadcastChanges(raw: unknown): PriceChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map((c) => ({ product: String(c.product ?? c.name ?? c.sku ?? 'Item'), from: c.from === null || c.from === undefined ? null : num(c.from), to: c.to === null || c.to === undefined ? null : num(c.to) }))
    .slice(0, 100);
}

export const SERVICE_STATUS_FOR_CUSTOMER: Record<string, { label: string; tone: 'info' | 'progress' | 'attention' | 'success' | 'neutral' | 'danger'; explain: string }> = {
  OPEN: { label: 'Received', tone: 'info', explain: 'Your unit is with the Service Centre and will be assigned to a technician.' },
  ASSIGNED: { label: 'With a technician', tone: 'progress', explain: 'A technician is examining your unit.' },
  DIAGNOSED: { label: 'Diagnosed', tone: 'progress', explain: 'The fault has been found; the repair is being planned.' },
  AWAITING_PARTS: { label: 'Waiting for parts', tone: 'attention', explain: 'The repair continues as soon as the parts arrive.' },
  REPAIRING: { label: 'Being repaired', tone: 'progress', explain: 'Your unit is being repaired.' },
  QA: { label: 'Final checks', tone: 'progress', explain: 'The repair is being tested before the unit is released.' },
  READY: { label: 'Ready for collection', tone: 'success', explain: 'Your unit has passed its checks and can be collected.' },
  RETURNED: { label: 'Collected', tone: 'neutral', explain: 'Your unit has been returned to you.' },
  CLOSED: { label: 'Closed', tone: 'neutral', explain: 'This job is closed.' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', explain: 'This job was cancelled.' },
};
export const serviceStatusForCustomer = (s: string) => SERVICE_STATUS_FOR_CUSTOMER[s] ?? { label: s.toLowerCase().replace(/_/g, ' '), tone: 'neutral' as const, explain: '' };

export const ORDER_STATUS_FOR_CUSTOMER: Record<string, { label: string; tone: 'info' | 'progress' | 'attention' | 'success' | 'neutral' | 'danger' }> = {
  CONFIRMED: { label: 'Confirmed', tone: 'info' }, AWAITING_PAYMENT: { label: 'Awaiting your payment', tone: 'attention' }, PAID: { label: 'Paid', tone: 'success' }, IN_PRODUCTION: { label: 'Being built', tone: 'progress' },
  READY: { label: 'Ready to ship', tone: 'progress' }, RELEASED: { label: 'Released', tone: 'progress' }, DISPATCHED: { label: 'On its way', tone: 'progress' }, DELIVERED: { label: 'Delivered', tone: 'success' },
  INVOICED: { label: 'Invoiced', tone: 'success' }, CLOSED: { label: 'Closed', tone: 'neutral' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const orderStatusForCustomer = (s: string) => ORDER_STATUS_FOR_CUSTOMER[s] ?? { label: s.toLowerCase().replace(/_/g, ' '), tone: 'neutral' as const };

/** Orders a customer may still upload proof of payment for. */
export const PROOF_UPLOAD_STATUSES = ['CONFIRMED', 'AWAITING_PAYMENT', 'IN_PRODUCTION', 'READY'];
export const canUploadProof = (status: string, outstanding: number): boolean => PROOF_UPLOAD_STATUSES.includes(status) && outstanding > 0;

// ---------------------------------------------------------------- Devices

export type DeviceItem = {
  id: string; serial: string; product: string; family: string; configuration: string | null; status: string; soldAt: Date | null;
  cover: DeviceCover; openJob: { id: string; number: string; status: string } | null;
};

export const loadDevices = cache(async (customerId: string): Promise<DeviceItem[]> => {
  const now = new Date();
  const rows = await prisma.finishedUnit.findMany({
    where: { customerId },
    orderBy: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true, serialNumber: true, status: true, soldAt: true,
      product: { select: { name: true, family: true } }, configuration: { select: { name: true } },
      warranties: { where: { customerId }, select: { id: true, kind: true, status: true, startsAt: true, endsAt: true } },
      serviceJobs: { where: { customerId, status: { in: ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING', 'QA', 'READY'] } }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, number: true, status: true } },
    },
  });
  return rows.map((u) => ({
    id: u.id, serial: u.serialNumber, product: u.product.name, family: String(u.product.family), configuration: u.configuration?.name ?? null, status: String(u.status), soldAt: u.soldAt,
    cover: deviceCover(u.warranties.map((w) => ({ ...w, kind: String(w.kind), status: String(w.status) })), now),
    openJob: u.serviceJobs[0] ? { id: u.serviceJobs[0].id, number: u.serviceJobs[0].number, status: String(u.serviceJobs[0].status) } : null,
  }));
});

// ---------------------------------------------------------------- Orders

export type OrderItem = {
  id: string; number: string; status: string; createdAt: Date; paymentTerms: string; channel: string; deliveryAddress: string | null; customerReference: string | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; lineTotal: number; fulfilled: number }[];
  money: { total: number; paid: number; pending: number; outstanding: number };
  proFormas: { id: string; number: string; status: string; issuedAt: Date; dueDate: Date | null; total: number }[];
  invoices: { id: string; number: string; status: string; issuedAt: Date; total: number }[];
  payments: { id: string; amount: number; method: string; status: string; paidAt: Date; reference: string | null; mine: boolean }[];
  dispatches: { number: string; status: string; dispatchedAt: Date; deliveredAt: Date | null; waybill: string | null }[];
  canUploadProof: boolean;
};

export const loadOrders = cache(async (customerId: string): Promise<OrderItem[]> => {
  const rows = await prisma.salesOrder.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, number: true, status: true, createdAt: true, paymentTerms: true, channel: true, total: true, amountPaid: true, deliveryAddress: true, customerReference: true,
      lines: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, fulfilledQuantity: true } },
      proFormas: { orderBy: { issuedAt: 'desc' }, select: { id: true, number: true, status: true, issuedAt: true, dueDate: true, total: true } },
      invoices: { orderBy: { issuedAt: 'desc' }, select: { id: true, number: true, status: true, issuedAt: true, total: true } },
      payments: { orderBy: { paidAt: 'desc' }, select: { id: true, amount: true, method: true, status: true, paidAt: true, reference: true, recordedByCustomerId: true } },
      dispatches: { orderBy: { dispatchedAt: 'desc' }, select: { number: true, status: true, dispatchedAt: true, deliveredAt: true, waybill: true } },
    },
  });
  return rows.map((o) => {
    const money = orderMoney({ total: o.total, amountPaid: o.amountPaid, payments: o.payments.map((p) => ({ amount: p.amount, status: String(p.status) })) });
    return {
      id: o.id, number: o.number, status: String(o.status), createdAt: o.createdAt, paymentTerms: String(o.paymentTerms), channel: String(o.channel), deliveryAddress: o.deliveryAddress, customerReference: o.customerReference,
      lines: o.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unitPrice: num(l.unitPrice), lineTotal: num(l.lineTotal), fulfilled: l.fulfilledQuantity })),
      money,
      proFormas: o.proFormas.map((p) => ({ id: p.id, number: p.number, status: String(p.status), issuedAt: p.issuedAt, dueDate: p.dueDate, total: num(p.total) })),
      invoices: o.invoices.map((i) => ({ id: i.id, number: i.number, status: String(i.status), issuedAt: i.issuedAt, total: num(i.total) })),
      payments: o.payments.map((p) => ({ id: p.id, amount: num(p.amount), method: String(p.method), status: String(p.status), paidAt: p.paidAt, reference: p.reference, mine: p.recordedByCustomerId === customerId })),
      dispatches: o.dispatches.map((d) => ({ number: d.number, status: String(d.status), dispatchedAt: d.dispatchedAt, deliveredAt: d.deliveredAt, waybill: d.waybill })),
      canUploadProof: canUploadProof(String(o.status), money.outstanding),
    };
  });
});

// ---------------------------------------------------------------- Prices (dealers)

export type DealerPrices = {
  list: { id: string; number: string; name: string; channel: string; tier: string | null; currency: string; effectiveFrom: Date; items: { product: string; sku: string; configuration: string | null; minQuantity: number; unitPrice: number }[] } | null;
  broadcast: { number: string; publishedAt: Date; summary: string; changes: PriceChange[] } | null;
};

/** The ACTIVE price list for the dealer's channel and tier, and the latest broadcast of it. Null list for a customer without a dealer account. */
export const loadDealerPrices = cache(async (customerId: string): Promise<DealerPrices | null> => {
  const dealer = await prisma.dealerAccount.findUnique({ where: { customerId }, select: { channel: true, tier: true, customer: { select: { organisationId: true } } } });
  if (!dealer) return null;
  const now = new Date();
  const list = await prisma.priceList.findFirst({
    where: { organisationId: dealer.customer.organisationId, status: 'ACTIVE', channel: dealer.channel, tier: dealer.tier, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      id: true, number: true, name: true, channel: true, tier: true, currency: true, effectiveFrom: true,
      items: { orderBy: [{ product: { name: 'asc' } }, { minQuantity: 'asc' }], take: 500, select: { minQuantity: true, unitPrice: true, product: { select: { name: true, sku: true, isActive: true } }, configuration: { select: { name: true } } } },
    },
  });
  if (!list) return { list: null, broadcast: null };
  const broadcast = await prisma.priceBroadcast.findFirst({ where: { priceListId: list.id }, orderBy: { publishedAt: 'desc' }, select: { number: true, publishedAt: true, summary: true, changes: true } });
  return {
    list: {
      id: list.id, number: list.number, name: list.name, channel: String(list.channel), tier: list.tier ? String(list.tier) : null, currency: list.currency, effectiveFrom: list.effectiveFrom,
      items: list.items.filter((i) => i.product.isActive).map((i) => ({ product: i.product.name, sku: i.product.sku, configuration: i.configuration?.name ?? null, minQuantity: i.minQuantity, unitPrice: num(i.unitPrice) })),
    },
    broadcast: broadcast ? { number: broadcast.number, publishedAt: broadcast.publishedAt, summary: broadcast.summary, changes: broadcastChanges(broadcast.changes) } : null,
  };
});

// ---------------------------------------------------------------- Claims and service jobs

export type ClaimItem = { id: string; number: string; status: string; complaint: string; failureDate: Date; createdAt: Date; resolution: string | null; warrantyNumber: string; serial: string | null; product: string | null };
export type ServiceJobItem = { id: string; number: string; status: string; kind: string; product: string; serial: string; fault: string; createdAt: Date; repairedAt: Date | null; returnedAt: Date | null; quoted: number | null; paid: number; claimNumber: string | null };

export const loadClaims = cache(async (customerId: string): Promise<{ claims: ClaimItem[]; jobs: ServiceJobItem[] }> => {
  const [claims, jobs] = await Promise.all([
    prisma.warrantyClaim.findMany({
      where: { customerId, warranty: { kind: 'PRODUCT' } },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, claimNumber: true, status: true, complaint: true, failureDate: true, createdAt: true, customerResolution: true, warranty: { select: { warrantyNumber: true, finishedUnit: { select: { serialNumber: true, product: { select: { name: true } } } } } } },
    }),
    prisma.serviceJob.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, number: true, status: true, kind: true, productName: true, serialNumber: true, fault: true, createdAt: true, repairedAt: true, returnedAt: true, quotedAmount: true, paidAmount: true, warrantyClaimId: true },
    }),
  ]);
  const claimNumbers = new Map(claims.map((c) => [c.id, c.claimNumber]));
  return {
    claims: claims.map((c) => ({ id: c.id, number: c.claimNumber, status: String(c.status), complaint: c.complaint, failureDate: c.failureDate, createdAt: c.createdAt, resolution: c.customerResolution ? String(c.customerResolution) : null, warrantyNumber: c.warranty.warrantyNumber, serial: c.warranty.finishedUnit?.serialNumber ?? null, product: c.warranty.finishedUnit?.product.name ?? null })),
    jobs: jobs.map((j) => ({ id: j.id, number: j.number, status: String(j.status), kind: String(j.kind), product: j.productName, serial: j.serialNumber, fault: j.fault, createdAt: j.createdAt, repairedAt: j.repairedAt, returnedAt: j.returnedAt, quoted: j.quotedAmount === null ? null : num(j.quotedAmount), paid: num(j.paidAmount), claimNumber: j.warrantyClaimId ? claimNumbers.get(j.warrantyClaimId) ?? null : null })),
  };
});
