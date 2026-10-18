'use server';
import { after } from 'next/server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog, bankDetailsFor } from '@/lib/workshop-core';
import { authorize, allows, orgWhere, reachWhere, seeOrNull, myOrganisationId, refuseDuringAssist, getPrincipal } from '@/lib/authz/server';
import { claimed as stillAsSeen } from '@/lib/integrity';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { emailColleaguesLater } from '@/lib/workflow-notify';
import { sendEmail } from '@/lib/email';
import { logFailure } from '@/lib/log';
import { websiteBaseUrl } from '@/lib/portal-url';
import { letterheadFor } from '@/lib/support/server';
import { actorLabel } from '@/lib/assist/rules';
import { formatDateOnly } from '@/lib/utils/format-date';
import { renderSalesProFormaIssuedEmail } from '@/lib/email-templates/sales-pro-forma-issued';
import { renderSalesPaymentConfirmedEmail } from '@/lib/email-templates/sales-payment-confirmed';
import { channelFor, resolvePrice } from '@/lib/pricing-core';
import {
  quotationTotals, lineTotal, discountApproval, canApproveDiscount, discountLevelLabel, canMoveQuotation, canMoveOrder, canMoveReturn,
  creditCheck, clearanceAllowed, statusAfterClearance, paidInFull, outstandingOn, quotationExpired, round2, naira, toKobo,
  QUOTATION_VALID_DAYS, PRO_FORMA_STATUSES, PAYABLE_ORDER_STATUSES, CANCELLABLE_ORDER_STATUSES, RETURNABLE_ORDER_STATUSES,
  type DiscountLevel, type OrderStatus, type PaymentTerms, type QuotationStatus, type ReturnStatus,
} from '@/lib/sales-core';
import type { SearchableOption } from '@/components/SearchableSelect';

/**
 * Order to cash: quotation → sales order → pro-forma invoice → payment →
 * Finance clears → goods release note (the warehouse picks and dispatches)
 * → tax invoice; returns. Quotations and orders belong to a branch
 * (reachWhere('sales.view')); their children are read through them.
 */
class SalesError extends Error {}

const METHODS = ['BANK_TRANSFER', 'CASH', 'POS', 'CHEQUE', 'ONLINE'] as const;
const RESOLUTIONS = ['REPLACE', 'REFUND', 'CREDIT_NOTE', 'REPAIR'] as const;
type Method = (typeof METHODS)[number];
type Resolution = (typeof RESOLUTIONS)[number];

async function audit(userId: string, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

/** Who the signed-in person is for this module: id, organisation, the branch new records go to. */
async function me(): Promise<{ id: string; organisationId: string; branchId: string }> {
  const user = await requireUser();
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { branchId: true, organisationId: true } });
  const organisationId = u?.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new SalesError('Your account is not placed in an organisation yet.');
  let branchId = u?.branchId ?? null;
  if (!branchId) {
    const b = await prisma.branch.findFirst({ where: { businessUnit: { organisationId }, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    branchId = b?.id ?? null;
  }
  if (!branchId) throw new SalesError('No branch found for your organisation yet.');
  return { id: user.id, organisationId, branchId };
}

/** People of the organisation holding any of these roles (for "who gets told"). */
async function usersWithRoles(organisationId: string, slugs: string[]): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { organisationId, isActive: true, roles: { some: { role: { slug: { in: slugs } } } } }, select: { id: true }, take: 50 });
  return rows.map((r: { id: string }) => r.id);
}

const productLabel = (p: { name: string }, c: { name: string } | null | undefined) => (c ? `${p.name} — ${c.name}` : p.name);

// ── Pickers ───────────────────────────────────────────────────────────────

/** Customers of the organisation, with their channel, for the quotation form. */
export async function searchSalesCustomerOptions(query: string): Promise<SearchableOption[]> {
  if (!(await allows('sales.view'))) return [];
  const q = query.trim().slice(0, 80);
  if (!q) return [];
  const rows = await prisma.customer.findMany({
    where: { ...(await orgWhere()), isActive: true, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }] },
    orderBy: { fullName: 'asc' },
    take: 20,
    select: { id: true, fullName: true, email: true, dealerAccount: { select: { channel: true, tier: true } } },
  });
  return rows.map((c: (typeof rows)[number]) => ({ value: c.id, label: c.fullName, sublabel: `${c.dealerAccount ? `${c.dealerAccount.channel.toLowerCase()}${c.dealerAccount.tier ? ` ${c.dealerAccount.tier.replace('_', ' ').toLowerCase()}` : ''}` : 'retail'}${c.email ? ` · ${c.email}` : ''}` }));
}

/** The most recent customers, before anything is typed. */
export async function listRecentSalesCustomerOptions(): Promise<SearchableOption[]> {
  if (!(await allows('sales.view'))) return [];
  const rows = await prisma.customer.findMany({ where: { ...(await orgWhere()), isActive: true }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, fullName: true, email: true, dealerAccount: { select: { channel: true } } } });
  return rows.map((c: (typeof rows)[number]) => ({ value: c.id, label: c.fullName, sublabel: `${c.dealerAccount ? c.dealerAccount.channel.toLowerCase() : 'retail'}${c.email ? ` · ${c.email}` : ''}` }));
}

// ── Quotations ────────────────────────────────────────────────────────────

const QUOTE_STATUSES: QuotationStatus[] = ['DRAFT', 'PENDING_DISCOUNT_APPROVAL', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED', 'CANCELLED'];

export async function listQuotations(opts: { q?: string; status?: string; customerId?: string; take?: number } = {}) {
  const q = (opts.q ?? '').trim().slice(0, 80);
  const status = QUOTE_STATUSES.includes(opts.status as QuotationStatus) ? (opts.status as QuotationStatus) : undefined;
  return prisma.quotation.findMany({
    where: {
      ...(await reachWhere('sales.view')),
      ...(status ? { status } : {}),
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
      ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { lines: { some: { description: { contains: q, mode: 'insensitive' } } } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 200,
    include: { customer: { select: { id: true, fullName: true } }, preparedBy: { select: { fullName: true } }, salesOrder: { select: { id: true, number: true } }, _count: { select: { lines: true } } },
  });
}

export type QuotationLineInput = { productId: string; configurationId?: string | null; quantity: number; unitPrice: number; discountPercent: number; notes?: string };

/** Validates and prices lines against the catalogue (and the price list when the line carries no price). */
async function buildLines(organisationId: string, priceItems: { productId: string; configurationId: string | null; unitPrice: unknown; minQuantity: number }[], input: QuotationLineInput[]) {
  if (!input.length) throw new SalesError('Add at least one line.');
  if (input.length > 60) throw new SalesError('A quotation can carry at most 60 lines.');
  const products = await prisma.product.findMany({ where: { id: { in: [...new Set(input.map((l) => l.productId))] }, organisationId }, select: { id: true, name: true, sku: true, source: true, configurations: { select: { id: true, name: true } } } });
  const items = priceItems.map((i) => ({ productId: i.productId, configurationId: i.configurationId, unitPrice: Number(i.unitPrice), minQuantity: i.minQuantity }));
  return input.map((l, i) => {
    const product = products.find((p: (typeof products)[number]) => p.id === l.productId);
    if (!product) throw new SalesError(`Line ${i + 1}: choose a product from the catalogue.`);
    const configurationId = l.configurationId || null;
    const configuration = configurationId ? product.configurations.find((c: { id: string }) => c.id === configurationId) : null;
    if (configurationId && !configuration) throw new SalesError(`Line ${i + 1}: that configuration does not belong to ${product.name}.`);
    const quantity = Math.round(Number(l.quantity));
    if (!Number.isInteger(quantity) || quantity < 1) throw new SalesError(`Line ${i + 1}: the quantity must be a whole number of at least 1.`);
    const listed = resolvePrice(items, { productId: product.id, configurationId, quantity });
    const unitPrice = round2(Number(l.unitPrice) > 0 ? Number(l.unitPrice) : listed?.unitPrice ?? 0);
    if (!(unitPrice > 0)) throw new SalesError(`Line ${i + 1}: ${product.name} has no price on the price list — enter a unit price.`);
    const discountPercent = round2(Number(l.discountPercent) || 0);
    if (discountPercent < 0 || discountPercent > 100) throw new SalesError(`Line ${i + 1}: the discount must be between 0 and 100%.`);
    return { productId: product.id, configurationId, description: productLabel(product, configuration ?? null), quantity, unitPrice, discountPercent, lineTotal: lineTotal({ quantity, unitPrice, discountPercent }), notes: (l.notes ?? '').trim().slice(0, 300) || null, source: product.source };
  });
}

/** The columns a line row takes (the catalogue's `source` is only needed to decide the order's next status). */
const lineData = (l: Awaited<ReturnType<typeof buildLines>>[number]) => ({ productId: l.productId, configurationId: l.configurationId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, lineTotal: l.lineTotal, notes: l.notes });

export type CreateQuotationInput = { customerId: string; lines: QuotationLineInput[]; validUntil?: Date | null; notes?: string };

/** A new DRAFT quotation for a customer, priced from the active list of their channel (dealer tier). */
export async function createQuotation(input: CreateQuotationInput): Promise<{ id: string; number: string }> {
  const who = await me();
  await authorize('sales.quote.manage', { branchId: who.branchId, homeBranch: true }, 'createQuotation', 'Only sales staff can prepare quotations.');
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, ...(await orgWhere()) }, select: { id: true, fullName: true, dealerAccount: { select: { channel: true, tier: true } } } });
  if (!customer) throw new SalesError('Choose a customer of your organisation.');
  const { channel, tier } = channelFor(customer.dealerAccount);
  const priceList = await prisma.priceList.findFirst({ where: { organisationId: who.organisationId, channel, tier, status: 'ACTIVE' }, orderBy: { effectiveFrom: 'desc' }, select: { id: true, number: true, items: { select: { productId: true, configurationId: true, unitPrice: true, minQuantity: true } } } });
  const lines = await buildLines(who.organisationId, priceList?.items ?? [], input.lines);
  const totals = quotationTotals(lines);
  const validUntil = input.validUntil ? new Date(input.validUntil) : new Date(Date.now() + QUOTATION_VALID_DAYS * 86400000);
  if (Number.isNaN(validUntil.getTime())) throw new SalesError('Enter a valid "valid until" date.');
  const number = await nextDocumentNumber('QTE', who.organisationId);
  const created = await prisma.quotation.create({
    data: {
      number, branchId: who.branchId, customerId: customer.id, channel, priceListId: priceList?.id ?? null, validUntil, notes: (input.notes ?? '').trim().slice(0, 1000) || null, preparedById: who.id,
      subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total,
      lines: { create: lines.map(lineData) },
    },
  });
  await audit(who.id, 'Quotation', created.id, 'quotation.created', { referenceNumber: number, customerName: customer.fullName, channel, tier, priceList: priceList?.number ?? null, total: totals.total, lines: lines.length });
  return { id: created.id, number };
}

/** One quotation with everything the page needs, or null when it is outside this person's reach. */
export async function getQuotation(quotationId: string) {
  const rec = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: { select: { id: true, fullName: true, email: true, phone: true, address: true, dealerAccount: { select: { id: true, channel: true, tier: true, creditLimit: true, onHold: true } } } },
      priceList: { select: { id: true, number: true, name: true } },
      preparedBy: { select: { id: true, fullName: true } },
      salesOrder: { select: { id: true, number: true, status: true } },
      branch: { select: { id: true, name: true } },
      lines: { include: { product: { select: { id: true, name: true, sku: true, source: true } }, configuration: { select: { id: true, name: true, code: true } } }, orderBy: { id: 'asc' } },
    },
  });
  const q = await seeOrNull('sales.view', rec, 'getQuotation');
  if (!q) return null;
  const approval = discountApproval(q.lines.map((l: (typeof q.lines)[number]) => ({ quantity: l.quantity, unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) })));
  const approverName = q.discountApproverId ? (await prisma.user.findUnique({ where: { id: q.discountApproverId }, select: { fullName: true } }))?.fullName ?? null : null;
  return { ...q, approval, approverName, expired: quotationExpired(q.validUntil) };
}

export async function getQuotationAuditTrail(quotationId: string) {
  const visible = await seeOrNull('sales.view', await prisma.quotation.findUnique({ where: { id: quotationId }, select: { id: true, branchId: true } }), 'getQuotationAuditTrail');
  return auditTrailOf('Quotation', visible?.id ?? '__no_access__');
}

async function auditTrailOf(entityType: string, entityId: string) {
  const entries = await prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(name.get(e.userId) ?? null, e.metadata) : null }));
}

/** A quotation this person may change, in their reach. */
async function quotationForChange(quotationId: string) {
  const q = await seeOrNull('sales.view', await prisma.quotation.findUnique({ where: { id: quotationId }, include: { customer: { select: { id: true, fullName: true, email: true, dealerAccount: { select: { channel: true, tier: true, creditLimit: true, onHold: true } } } }, lines: true } }), 'quotationForChange');
  if (!q) throw new SalesError('This quotation is not available.');
  return q;
}

/** Replace the lines (and notes / valid-until) of a DRAFT quotation. */
export async function updateQuotation(quotationId: string, input: { lines: QuotationLineInput[]; validUntil?: Date | null; notes?: string }): Promise<void> {
  const q = await quotationForChange(quotationId);
  await authorize('sales.quote.manage', { branchId: q.branchId, homeBranch: true }, 'updateQuotation', 'Only sales staff can edit quotations.');
  const who = await me();
  if (q.status !== 'DRAFT') throw new SalesError('Only a draft quotation can be edited.');
  const priceList = q.priceListId ? await prisma.priceList.findUnique({ where: { id: q.priceListId }, select: { items: { select: { productId: true, configurationId: true, unitPrice: true, minQuantity: true } } } }) : null;
  const organisationId = (await prisma.customer.findUnique({ where: { id: q.customerId }, select: { organisationId: true } }))?.organisationId ?? who.organisationId;
  const lines = await buildLines(organisationId, priceList?.items ?? [], input.lines);
  const totals = quotationTotals(lines);
  const validUntil = input.validUntil ? new Date(input.validUntil) : q.validUntil;
  await prisma.$transaction(async (tx) => {
    await tx.quotationLine.deleteMany({ where: { quotationId: q.id } });
    await tx.quotation.update({ where: { id: q.id }, data: { subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total, validUntil, notes: (input.notes ?? '').trim().slice(0, 1000) || null, lines: { create: lines.map(lineData) } } });
  });
  await audit(who.id, 'Quotation', q.id, 'quotation.updated', { referenceNumber: q.number, changes: { total: { from: Number(q.total), to: totals.total }, lines: { from: q.lines.length, to: lines.length } } });
}

/**
 * Send the quotation to the customer. Discounts beyond the officer's 5%
 * first go to the Sales Manager (up to 15%) or the Commercial Director.
 */
export async function sendQuotation(quotationId: string): Promise<{ status: 'SENT' | 'PENDING_DISCOUNT_APPROVAL'; level: DiscountLevel }> {
  const q = await quotationForChange(quotationId);
  await authorize('sales.quote.manage', { branchId: q.branchId, homeBranch: true }, 'sendQuotation', 'Only sales staff can send quotations.');
  const who = await me();
  if (q.status !== 'DRAFT') throw new SalesError('Only a draft quotation can be sent.');
  if (!q.lines.length) throw new SalesError('Add at least one line before sending.');
  const approval = discountApproval(q.lines.map((l: (typeof q.lines)[number]) => ({ quantity: l.quantity, unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) })));
  const next = approval.needsApproval ? 'PENDING_DISCOUNT_APPROVAL' : 'SENT';
  if (!canMoveQuotation('DRAFT', next)) throw new SalesError('This quotation cannot be sent from its current state.');
  stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: 'DRAFT' }, data: { status: next, ...(next === 'SENT' ? { sentAt: new Date() } : { discountRejectedReason: null }) } }));
  await audit(who.id, 'Quotation', q.id, next === 'SENT' ? 'quotation.sent' : 'quotation.discount_approval_requested', { referenceNumber: q.number, customerName: q.customer.fullName, total: Number(q.total), maxLinePercent: approval.maxLinePercent, overallPercent: approval.overallPercent, level: approval.level });
  if (next === 'PENDING_DISCOUNT_APPROVAL') {
    const approvers = await usersWithRoles(who.organisationId, approval.level === 'DIRECTOR' ? ['commercial-director'] : ['sales-manager', 'commercial-director']);
    emailColleaguesLater({ branchId: q.branchId, userIds: approvers, exceptUserId: who.id, path: `/sales/quotations/${q.id}`, where: 'quotation.discount_approval',
      notice: { subject: `Discount to approve — ${q.number}`, heading: 'A quotation needs a discount approved', intro: `${q.customer.fullName}'s quotation ${q.number} carries a discount of ${approval.maxLinePercent}% on a line (${approval.overallPercent}% overall), beyond the sales officer's limit.`, facts: [['Quotation', q.number], ['Customer', q.customer.fullName], ['Total', naira(Number(q.total))], ['Needs', discountLevelLabel(approval.level)]], next: 'Open the quotation and approve the discount, or send it back with a reason.', status: { label: 'Discount approval', tone: 'warning' }, ctaLabel: 'Open the quotation' } });
  }
  return { status: next, level: approval.level };
}

/** Rights this viewer has over discounts, in one round. */
async function discountRights(): Promise<{ approve: boolean; approveLarge: boolean }> {
  const [approve, approveLarge] = await Promise.all([allows('sales.discount.approve'), allows('sales.discount.approve_large')]);
  return { approve, approveLarge };
}

/** Approve the discount (Sales Manager up to 15%, the Commercial Director beyond) — never the person who prepared it. */
export async function approveQuotationDiscount(quotationId: string): Promise<void> {
  await refuseDuringAssist('approveQuotationDiscount');
  const q = await quotationForChange(quotationId);
  const approval = discountApproval(q.lines.map((l: (typeof q.lines)[number]) => ({ quantity: l.quantity, unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) })));
  const key = approval.level === 'DIRECTOR' ? 'sales.discount.approve_large' : 'sales.discount.approve';
  await authorize(key, { branchId: q.branchId, homeBranch: true }, 'approveQuotationDiscount', approval.level === 'DIRECTOR' ? 'A discount above 15% needs the Commercial Director.' : 'Only the Sales Manager or the Commercial Director can approve discounts.');
  const who = await me();
  if (q.status !== 'PENDING_DISCOUNT_APPROVAL') throw new SalesError('This quotation is not waiting for a discount approval.');
  if (q.preparedById === who.id) throw new SalesError('You prepared this quotation, so someone else must approve its discount.');
  if (!canApproveDiscount(approval.level, await discountRights())) throw new SalesError('This discount is beyond what you can approve.');
  stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: 'PENDING_DISCOUNT_APPROVAL' }, data: { status: 'SENT', sentAt: new Date(), discountApproverId: who.id, discountApprovedAt: new Date(), discountRejectedReason: null } }));
  await audit(who.id, 'Quotation', q.id, 'quotation.discount_approved', { referenceNumber: q.number, level: approval.level, maxLinePercent: approval.maxLinePercent, overallPercent: approval.overallPercent });
  emailColleaguesLater({ branchId: q.branchId, userIds: [q.preparedById], exceptUserId: who.id, path: `/sales/quotations/${q.id}`, where: 'quotation.discount_approved',
    notice: { subject: `Discount approved — ${q.number}`, heading: 'The discount was approved', intro: `Quotation ${q.number} for ${q.customer.fullName} is approved and marked as sent. Share it with the customer.`, facts: [['Quotation', q.number], ['Total', naira(Number(q.total))]], status: { label: 'Approved', tone: 'success' }, ctaLabel: 'Open the quotation' } });
}

/** Send the quotation back to draft with a reason. */
export async function rejectQuotationDiscount(quotationId: string, reason: string): Promise<void> {
  await refuseDuringAssist('rejectQuotationDiscount');
  const q = await quotationForChange(quotationId);
  await authorize('sales.discount.approve', { branchId: q.branchId, homeBranch: true }, 'rejectQuotationDiscount', 'Only the Sales Manager or the Commercial Director can decide on discounts.');
  const who = await me();
  const why = reason.trim().slice(0, 500);
  if (!why) throw new SalesError('Say what should change.');
  if (q.status !== 'PENDING_DISCOUNT_APPROVAL') throw new SalesError('This quotation is not waiting for a discount approval.');
  if (q.preparedById === who.id) throw new SalesError('You prepared this quotation, so someone else decides on its discount.');
  stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: 'PENDING_DISCOUNT_APPROVAL' }, data: { status: 'DRAFT', discountRejectedReason: why } }));
  await audit(who.id, 'Quotation', q.id, 'quotation.discount_rejected', { referenceNumber: q.number, reason: why });
  emailColleaguesLater({ branchId: q.branchId, userIds: [q.preparedById], exceptUserId: who.id, path: `/sales/quotations/${q.id}`, where: 'quotation.discount_rejected',
    notice: { subject: `Discount not approved — ${q.number}`, heading: 'The discount was sent back', intro: `Quotation ${q.number} is back in draft: ${why}`, facts: [['Quotation', q.number]], next: 'Change the discount and send it again.', status: { label: 'Sent back', tone: 'danger' }, ctaLabel: 'Open the quotation' } });
}

/** The customer accepted: ready to convert. An expired quotation is marked so instead. */
export async function acceptQuotation(quotationId: string): Promise<void> {
  const q = await quotationForChange(quotationId);
  await authorize('sales.quote.manage', { branchId: q.branchId, homeBranch: true }, 'acceptQuotation', 'Only sales staff can record the customer\'s acceptance.');
  const who = await me();
  if (q.status !== 'SENT') throw new SalesError('Only a quotation that was sent can be accepted.');
  if (quotationExpired(q.validUntil)) {
    stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: 'SENT' }, data: { status: 'EXPIRED' } }));
    await audit(who.id, 'Quotation', q.id, 'quotation.expired', { referenceNumber: q.number, validUntil: q.validUntil });
    throw new SalesError(`This quotation expired on ${formatDateOnly(q.validUntil as Date)}. Prepare a new one.`);
  }
  stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: 'SENT' }, data: { status: 'ACCEPTED' } }));
  await audit(who.id, 'Quotation', q.id, 'quotation.accepted', { referenceNumber: q.number, customerName: q.customer.fullName, total: Number(q.total) });
}

/** The customer said no. */
export async function declineQuotation(quotationId: string, reason: string): Promise<void> {
  await refuseDuringAssist('declineQuotation');
  const q = await quotationForChange(quotationId);
  await authorize('sales.quote.manage', { branchId: q.branchId, homeBranch: true }, 'declineQuotation', 'Only sales staff can record the customer\'s decision.');
  const who = await me();
  if (q.status !== 'SENT') throw new SalesError('Only a quotation that was sent can be declined.');
  stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: 'SENT' }, data: { status: 'DECLINED', notes: reason.trim() ? `${q.notes ? `${q.notes}\n` : ''}Declined: ${reason.trim().slice(0, 300)}` : q.notes } }));
  await audit(who.id, 'Quotation', q.id, 'quotation.declined', { referenceNumber: q.number, reason: reason.trim().slice(0, 300) || null });
}

export async function cancelQuotation(quotationId: string, reason: string): Promise<void> {
  const q = await quotationForChange(quotationId);
  await authorize('sales.quote.manage', { branchId: q.branchId, homeBranch: true }, 'cancelQuotation', 'Only sales staff can cancel quotations.');
  const who = await me();
  const why = reason.trim().slice(0, 300);
  if (!why) throw new SalesError('Say why the quotation is cancelled.');
  if (!canMoveQuotation(q.status as QuotationStatus, 'CANCELLED')) throw new SalesError('This quotation can no longer be cancelled.');
  stillAsSeen(await prisma.quotation.updateMany({ where: { id: q.id, status: q.status }, data: { status: 'CANCELLED', notes: `${q.notes ? `${q.notes}\n` : ''}Cancelled: ${why}` } }));
  await audit(who.id, 'Quotation', q.id, 'quotation.cancelled', { referenceNumber: q.number, reason: why });
}

/** What a dealer still owes on open credit orders (excluding one order). */
async function creditExposure(customerId: string, excludeOrderId?: string): Promise<number> {
  const open = await prisma.salesOrder.findMany({ where: { customerId, paymentTerms: 'CREDIT', status: { notIn: ['CANCELLED', 'CLOSED'] }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) }, select: { paymentTerms: true, status: true, total: true, amountPaid: true } });
  return round2(open.reduce((s: number, o: (typeof open)[number]) => s + outstandingOn({ paymentTerms: o.paymentTerms as PaymentTerms, status: o.status as OrderStatus, total: Number(o.total), amountPaid: Number(o.amountPaid) }), 0));
}

/**
 * The accepted quotation becomes a CONFIRMED sales order with the same
 * lines. Prepaid unless the customer's dealer account has credit and is not
 * on hold; a credit order above the remaining credit waits for Finance.
 */
export async function convertQuotationToOrder(quotationId: string): Promise<{ id: string; number: string; paymentTerms: PaymentTerms; creditNeedsApproval: boolean }> {
  const q = await quotationForChange(quotationId);
  await authorize('sales.quote.manage', { branchId: q.branchId, homeBranch: true }, 'convertQuotationToOrder', 'Only sales staff can convert a quotation.');
  const who = await me();
  if (q.status !== 'ACCEPTED') throw new SalesError('Only an accepted quotation can become a sales order.');
  if (!q.lines.length) throw new SalesError('The quotation has no lines.');
  const dealer = q.customer.dealerAccount ? { creditLimit: Number(q.customer.dealerAccount.creditLimit), onHold: q.customer.dealerAccount.onHold } : null;
  const credit = creditCheck(dealer, await creditExposure(q.customerId), Number(q.total));
  const number = await nextDocumentNumber('SO', who.organisationId);
  const order = await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.quotation.updateMany({ where: { id: q.id, status: 'ACCEPTED' }, data: { status: 'CONVERTED' } }));
    return tx.salesOrder.create({
      data: {
        number, branchId: q.branchId, customerId: q.customerId, quotationId: q.id, projectId: q.projectId, channel: q.channel, paymentTerms: credit.terms, confirmedById: who.id,
        subtotal: q.subtotal, discountTotal: q.discountTotal, taxTotal: q.taxTotal, total: q.total, notes: q.notes,
        lines: { create: q.lines.map((l: (typeof q.lines)[number]) => ({ productId: l.productId, configurationId: l.configurationId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, lineTotal: l.lineTotal, notes: l.notes })) },
      },
    });
  });
  await audit(who.id, 'Quotation', q.id, 'quotation.converted', { referenceNumber: q.number, salesOrder: number });
  await audit(who.id, 'SalesOrder', order.id, 'sales_order.confirmed', { referenceNumber: number, quotation: q.number, customerName: q.customer.fullName, total: Number(q.total), paymentTerms: credit.terms, creditNeedsApproval: credit.needsApproval, creditRemaining: credit.remaining });
  if (credit.terms === 'CREDIT' && credit.needsApproval) {
    emailColleaguesLater({ branchId: q.branchId, userIds: await usersWithRoles(who.organisationId, ['finance-manager', 'credit-controller']), exceptUserId: who.id, path: `/sales/orders/${order.id}`, where: 'sales_order.credit_approval',
      notice: { subject: `Credit sale to approve — ${number}`, heading: 'A credit sale exceeds the dealer\'s remaining credit', intro: `${q.customer.fullName}'s order ${number} (${naira(Number(q.total))}) is above the ${naira(credit.remaining)} left on their credit limit.`, facts: [['Sales order', number], ['Customer', q.customer.fullName], ['Order total', naira(Number(q.total))], ['Credit remaining', naira(credit.remaining)]], next: 'Open the order and approve the credit sale, or decline it with a reason.', status: { label: 'Credit approval', tone: 'warning' }, ctaLabel: 'Open the order' } });
  }
  return { id: order.id, number, paymentTerms: credit.terms, creditNeedsApproval: credit.needsApproval };
}

// ── Sales orders ──────────────────────────────────────────────────────────

const ORDER_STATUSES: OrderStatus[] = ['CONFIRMED', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'READY', 'RELEASED', 'DISPATCHED', 'DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'];

export async function listSalesOrders(opts: { q?: string; status?: string; customerId?: string; take?: number } = {}) {
  const q = (opts.q ?? '').trim().slice(0, 80);
  const status = ORDER_STATUSES.includes(opts.status as OrderStatus) ? (opts.status as OrderStatus) : undefined;
  return prisma.salesOrder.findMany({
    where: {
      ...(await reachWhere('sales.view')),
      ...(status ? { status } : {}),
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
      ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { customerReference: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 200,
    include: { customer: { select: { id: true, fullName: true } }, confirmedBy: { select: { fullName: true } }, _count: { select: { lines: true, releases: true } } },
  });
}

export async function getSalesOrder(salesOrderId: string) {
  const rec = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      customer: { select: { id: true, fullName: true, email: true, phone: true, address: true, dealerAccount: { select: { id: true, channel: true, tier: true, creditLimit: true, creditDays: true, onHold: true } } } },
      quotation: { select: { id: true, number: true } },
      confirmedBy: { select: { id: true, fullName: true } },
      branch: { select: { id: true, name: true } },
      lines: { include: { product: { select: { id: true, name: true, sku: true, source: true, serialised: true } }, configuration: { select: { id: true, name: true, code: true } } }, orderBy: { id: 'asc' } },
      proFormas: { orderBy: { issuedAt: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      releases: { orderBy: { issuedAt: 'desc' }, include: { dispatch: { select: { id: true, number: true, status: true } }, _count: { select: { lines: true } } } },
      dispatches: { orderBy: { dispatchedAt: 'desc' }, select: { id: true, number: true, status: true, dispatchedAt: true, deliveredAt: true, waybill: true } },
      invoices: { orderBy: { issuedAt: 'desc' } },
      returns: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, reason: true, createdAt: true } },
      buildOrders: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, quantity: true, configuration: { select: { name: true, product: { select: { name: true } } } } } },
      units: { select: { id: true, serialNumber: true, status: true, product: { select: { name: true } } }, take: 200 },
    },
  });
  const o = await seeOrNull('sales.view', rec, 'getSalesOrder');
  if (!o) return null;
  const dealer = o.customer.dealerAccount ? { creditLimit: Number(o.customer.dealerAccount.creditLimit), onHold: o.customer.dealerAccount.onHold } : null;
  const credit = o.paymentTerms === 'CREDIT' ? creditCheck(dealer, await creditExposure(o.customerId, o.id), Number(o.total)) : null;
  const creditNeedsApproval = Boolean(credit?.needsApproval) && !o.creditApprovedById;
  const ids = [...new Set([o.clearedById, o.creditApprovedById, ...o.payments.map((p: { recordedById: string | null }) => p.recordedById), ...o.payments.map((p: { confirmedById: string | null }) => p.confirmedById), ...o.proFormas.map((p: { issuedById: string }) => p.issuedById), ...o.invoices.map((i: { issuedById: string }) => i.issuedById)].filter((x): x is string => Boolean(x)))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const names = new Map(people.map((p: { id: string; fullName: string }) => [p.id, p.fullName]));
  const clearance = clearanceAllowed({ status: o.status as OrderStatus, paymentTerms: o.paymentTerms as PaymentTerms, amountPaid: Number(o.amountPaid), total: Number(o.total), creditApproved: Boolean(o.creditApprovedById), creditNeedsApproval: Boolean(credit?.needsApproval) });
  return { ...o, names, credit, creditNeedsApproval, clearance, balance: Math.max(0, round2(Number(o.total) - Number(o.amountPaid))) };
}

export async function getSalesOrderAuditTrail(salesOrderId: string) {
  const visible = await seeOrNull('sales.view', await prisma.salesOrder.findUnique({ where: { id: salesOrderId }, select: { id: true, branchId: true } }), 'getSalesOrderAuditTrail');
  return auditTrailOf('SalesOrder', visible?.id ?? '__no_access__');
}

async function orderForChange(salesOrderId: string) {
  const o = await seeOrNull('sales.view', await prisma.salesOrder.findUnique({ where: { id: salesOrderId }, include: { customer: { select: { id: true, fullName: true, email: true, organisationId: true, dealerAccount: { select: { creditLimit: true, onHold: true } } } }, lines: { include: { product: { select: { id: true, name: true, source: true } } } } } }), 'orderForChange');
  if (!o) throw new SalesError('This sales order is not available.');
  return o;
}

/** Issue the pro-forma invoice (Billing): the order now awaits payment; the customer is emailed if they have an address. */
export async function issueProFormaInvoice(salesOrderId: string, input: { dueDate?: Date | null; notes?: string } = {}): Promise<{ id: string; number: string }> {
  const o = await orderForChange(salesOrderId);
  await authorize('billing.invoice.issue', { branchId: o.branchId, homeBranch: true }, 'issueProFormaInvoice', 'Only Billing can issue a pro-forma invoice.');
  const who = await me();
  if (!PRO_FORMA_STATUSES.includes(o.status as OrderStatus)) throw new SalesError('A pro-forma invoice is issued while the order awaits payment.');
  const open = o.paymentTerms === 'PREPAID' ? await prisma.proFormaInvoice.findFirst({ where: { salesOrderId: o.id, status: 'ISSUED' }, select: { number: true } }) : null;
  if (open) throw new SalesError(`Pro-forma invoice ${open.number} is already issued for this order.`);
  const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 7 * 86400000);
  if (Number.isNaN(dueDate.getTime())) throw new SalesError('Enter a valid pay-by date.');
  const bank = await bankDetailsFor(o.branchId);
  const number = await nextDocumentNumber('PFI', who.organisationId);
  const pfi = await prisma.$transaction(async (tx) => {
    const created = await tx.proFormaInvoice.create({ data: { number, salesOrderId: o.id, issuedById: who.id, dueDate, total: o.total, bankDetails: `${bank.bankName} · ${bank.accountName} · ${bank.accountNumber}`, notes: (input.notes ?? '').trim().slice(0, 500) || null } });
    if (o.status === 'CONFIRMED') stillAsSeen(await tx.salesOrder.updateMany({ where: { id: o.id, status: 'CONFIRMED' }, data: { status: 'AWAITING_PAYMENT' } }));
    return created;
  });
  await audit(who.id, 'SalesOrder', o.id, 'pro_forma_invoice.issued', { referenceNumber: number, salesOrder: o.number, total: Number(o.total), dueDate });
  if (o.customer.email) {
    const email = o.customer.email;
    const run = async () => {
      try {
        const head = await letterheadFor(o.customer.organisationId, o.branchId);
        const branch = await prisma.branch.findUnique({ where: { id: o.branchId }, select: { name: true } });
        const m = renderSalesProFormaIssuedEmail({
          customerName: o.customer.fullName, proFormaNumber: number, orderNumber: o.number, issuedOn: formatDateOnly(new Date()), dueOn: formatDateOnly(dueDate),
          lines: o.lines.map((l: (typeof o.lines)[number]) => ({ description: l.description, quantity: l.quantity, amount: naira(Number(l.lineTotal)) })),
          subtotal: naira(Number(o.subtotal)), discountTotal: Number(o.discountTotal) > 0 ? naira(Number(o.discountTotal)) : null, taxTotal: naira(Number(o.taxTotal)), total: naira(Number(o.total)),
          bankName: bank.bankName, accountName: bank.accountName, accountNumber: bank.accountNumber,
          portalUrl: `${websiteBaseUrl()}/customer-portal/dashboard`, logoUrl: head.logoUrl, companyName: head.companyName, branchName: branch?.name ?? null,
        });
        await sendEmail(email, m.subject, m.html);
      } catch (err) {
        logFailure('Could not email the pro-forma invoice', number, err);
      }
    };
    try { after(run); } catch { void run(); }
  }
  return { id: pfi.id, number };
}

export type RecordPaymentInput = { amount: number; method: string; reference?: string; paidAt?: Date | null; proofNote?: string };

/** Record what the customer says they paid (PENDING until Finance confirms it). Sales or Billing. */
export async function recordSalesPayment(salesOrderId: string, input: RecordPaymentInput): Promise<{ id: string }> {
  const o = await orderForChange(salesOrderId);
  if (!(await allows('billing.invoice.issue', { branchId: o.branchId, homeBranch: true }))) await authorize('sales.quote.manage', { branchId: o.branchId, homeBranch: true }, 'recordSalesPayment', 'Only sales staff or Billing can record a payment.');
  const who = await me();
  if (!PAYABLE_ORDER_STATUSES.includes(o.status as OrderStatus)) throw new SalesError('Payments are recorded on an open order that is not yet invoiced.');
  const amount = round2(Number(input.amount));
  if (!(amount > 0)) throw new SalesError('Enter an amount above zero.');
  if (!METHODS.includes(input.method as Method)) throw new SalesError('Choose how the customer paid.');
  const pending = await prisma.salesPayment.aggregate({ where: { salesOrderId: o.id, status: 'PENDING' }, _sum: { amount: true } });
  const alreadyIn = Number(o.amountPaid) + Number(pending._sum.amount ?? 0);
  if (toKobo(alreadyIn) + toKobo(amount) > toKobo(Number(o.total)) + 100) throw new SalesError(`That is more than the ${naira(Math.max(0, Number(o.total) - alreadyIn))} still due on this order.`);
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new SalesError('Enter a valid payment date.');
  const p = await prisma.salesPayment.create({ data: { salesOrderId: o.id, amount, method: input.method as Method, reference: (input.reference ?? '').trim().slice(0, 120) || null, paidAt, proofNote: (input.proofNote ?? '').trim().slice(0, 500) || null, recordedById: who.id } });
  await audit(who.id, 'SalesOrder', o.id, 'sales_payment.recorded', { referenceNumber: o.number, paymentId: p.id, amount, method: input.method, reference: p.reference });
  emailColleaguesLater({ branchId: o.branchId, userIds: await usersWithRoles(who.organisationId, ['finance-manager']), exceptUserId: who.id, path: `/sales/orders/${o.id}`, where: 'sales_payment.recorded',
    notice: { subject: `Payment to confirm — ${o.number}`, heading: 'A payment is waiting for confirmation', intro: `${naira(amount)} was recorded against ${o.customer.fullName}'s order ${o.number}.`, facts: [['Sales order', o.number], ['Amount', naira(amount)], ['Method', input.method.replace('_', ' ').toLowerCase()], ['Reference', p.reference ?? '—']], next: 'Check the bank statement, then confirm or reject the payment on the order.', status: { label: 'Awaiting confirmation', tone: 'warning' }, ctaLabel: 'Open the order' } });
  return { id: p.id };
}

async function paymentForDecision(salesPaymentId: string) {
  const p = await prisma.salesPayment.findFirst({ where: { id: salesPaymentId, salesOrder: await reachWhere('sales.view', { lens: false }) }, include: { salesOrder: { include: { customer: { select: { fullName: true, email: true, organisationId: true } } } } } });
  if (!p) throw new SalesError('This payment is not available.');
  return p;
}

/**
 * Finance confirms a payment (never the person who recorded it): the
 * order's paid total grows; paid in full moves the order to PAID and its
 * pro-forma to paid. The customer is emailed a confirmation.
 */
export async function confirmSalesPayment(salesPaymentId: string): Promise<void> {
  await refuseDuringAssist('confirmSalesPayment');
  const p = await paymentForDecision(salesPaymentId);
  await authorize('finance.payment.confirm', { branchId: p.salesOrder.branchId, homeBranch: true }, 'confirmSalesPayment', 'Only Finance can confirm payments.');
  const who = await me();
  if (p.status !== 'PENDING') throw new SalesError('This payment has already been decided.');
  if (p.recordedById === who.id) throw new SalesError('You recorded this payment, so someone else in Finance must confirm it.');
  const o = p.salesOrder;
  const result = await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.salesPayment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'CONFIRMED', confirmedById: who.id, confirmedAt: new Date() } }));
    const updated = await tx.salesOrder.update({ where: { id: o.id }, select: { amountPaid: true, total: true, status: true }, data: { amountPaid: { increment: p.amount } } });
    const full = paidInFull(Number(updated.amountPaid), Number(updated.total));
    let nowPaid = false;
    if (full && (updated.status === 'CONFIRMED' || updated.status === 'AWAITING_PAYMENT')) {
      const moved = await tx.salesOrder.updateMany({ where: { id: o.id, status: updated.status }, data: { status: 'PAID' } });
      nowPaid = moved.count === 1;
      if (nowPaid) await tx.proFormaInvoice.updateMany({ where: { salesOrderId: o.id, status: 'ISSUED' }, data: { status: 'PAID' } });
    }
    return { amountPaid: Number(updated.amountPaid), total: Number(updated.total), full, nowPaid };
  });
  await audit(who.id, 'SalesOrder', o.id, 'sales_payment.confirmed', { referenceNumber: o.number, paymentId: p.id, amount: Number(p.amount), amountPaid: result.amountPaid, paidInFull: result.full });
  if (result.nowPaid) await audit(who.id, 'SalesOrder', o.id, 'sales_order.paid', { referenceNumber: o.number, amountPaid: result.amountPaid });
  emailColleaguesLater({ branchId: o.branchId, userIds: [p.recordedById, o.confirmedById], exceptUserId: who.id, path: `/sales/orders/${o.id}`, where: 'sales_payment.confirmed',
    notice: { subject: `Payment confirmed — ${o.number}`, heading: 'Finance confirmed a payment', intro: `${naira(Number(p.amount))} on ${o.customer.fullName}'s order ${o.number} is confirmed.${result.full ? ' The order is paid in full.' : ''}`, facts: [['Sales order', o.number], ['Paid so far', naira(result.amountPaid)], ['Order total', naira(result.total)]], status: { label: result.full ? 'Paid in full' : 'Payment confirmed', tone: 'success' }, ctaLabel: 'Open the order' } });
  if (o.customer.email) {
    const email = o.customer.email;
    const run = async () => {
      try {
        const head = await letterheadFor(o.customer.organisationId, o.branchId);
        const branch = await prisma.branch.findUnique({ where: { id: o.branchId }, select: { name: true } });
        const m = renderSalesPaymentConfirmedEmail({ customerName: o.customer.fullName, orderNumber: o.number, amountConfirmed: naira(Number(p.amount)), method: p.method.replace('_', ' ').toLowerCase(), reference: p.reference, totalPaidSoFar: naira(result.amountPaid), orderTotal: naira(result.total), balanceRemaining: result.full ? null : naira(round2(result.total - result.amountPaid)), portalUrl: `${websiteBaseUrl()}/customer-portal/dashboard`, logoUrl: head.logoUrl, companyName: head.companyName, branchName: branch?.name ?? null });
        await sendEmail(email, m.subject, m.html);
      } catch (err) {
        logFailure('Could not email the payment confirmation', o.number, err);
      }
    };
    try { after(run); } catch { void run(); }
  }
}

export async function rejectSalesPayment(salesPaymentId: string, reason: string): Promise<void> {
  await refuseDuringAssist('rejectSalesPayment');
  const p = await paymentForDecision(salesPaymentId);
  await authorize('finance.payment.confirm', { branchId: p.salesOrder.branchId, homeBranch: true }, 'rejectSalesPayment', 'Only Finance can decide on payments.');
  const who = await me();
  const why = reason.trim().slice(0, 300);
  if (!why) throw new SalesError('Say why the payment is rejected.');
  if (p.status !== 'PENDING') throw new SalesError('This payment has already been decided.');
  stillAsSeen(await prisma.salesPayment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'REJECTED', confirmedById: who.id, confirmedAt: new Date(), rejectedReason: why } }));
  await audit(who.id, 'SalesOrder', p.salesOrderId, 'sales_payment.rejected', { referenceNumber: p.salesOrder.number, paymentId: p.id, amount: Number(p.amount), reason: why });
  emailColleaguesLater({ branchId: p.salesOrder.branchId, userIds: [p.recordedById], exceptUserId: who.id, path: `/sales/orders/${p.salesOrderId}`, where: 'sales_payment.rejected',
    notice: { subject: `Payment not confirmed — ${p.salesOrder.number}`, heading: 'Finance could not confirm a payment', intro: `${naira(Number(p.amount))} on order ${p.salesOrder.number} was rejected: ${why}`, facts: [['Sales order', p.salesOrder.number]], next: 'Check with the customer and record the payment again with the right details.', status: { label: 'Rejected', tone: 'danger' }, ctaLabel: 'Open the order' } });
}

/** Finance approves a credit sale above the dealer's remaining credit — never the person who confirmed the order. */
export async function approveCreditSale(salesOrderId: string): Promise<void> {
  await refuseDuringAssist('approveCreditSale');
  const o = await orderForChange(salesOrderId);
  await authorize('finance.credit.manage', { branchId: o.branchId, homeBranch: true }, 'approveCreditSale', 'Only Finance (credit control) can approve a credit sale.');
  const who = await me();
  if (o.paymentTerms !== 'CREDIT') throw new SalesError('This order is prepaid; there is no credit to approve.');
  if (o.creditApprovedById) throw new SalesError('This credit sale is already approved.');
  if (o.confirmedById === who.id) throw new SalesError('You confirmed this order, so someone else in Finance must approve the credit.');
  stillAsSeen(await prisma.salesOrder.updateMany({ where: { id: o.id, creditApprovedById: null, paymentTerms: 'CREDIT' }, data: { creditApprovedById: who.id } }));
  await audit(who.id, 'SalesOrder', o.id, 'sales_order.credit_approved', { referenceNumber: o.number, total: Number(o.total) });
  emailColleaguesLater({ branchId: o.branchId, userIds: [o.confirmedById], exceptUserId: who.id, path: `/sales/orders/${o.id}`, where: 'sales_order.credit_approved',
    notice: { subject: `Credit sale approved — ${o.number}`, heading: 'Finance approved the credit sale', intro: `Order ${o.number} for ${o.customer.fullName} may now be cleared for release on credit.`, facts: [['Sales order', o.number], ['Total', naira(Number(o.total))]], status: { label: 'Approved', tone: 'success' }, ctaLabel: 'Open the order' } });
}

/** Finance declines the credit sale: the order is cancelled with the reason, so Sales can re-quote on prepaid terms. */
export async function declineCreditSale(salesOrderId: string, reason: string): Promise<void> {
  await refuseDuringAssist('declineCreditSale');
  const o = await orderForChange(salesOrderId);
  await authorize('finance.credit.manage', { branchId: o.branchId, homeBranch: true }, 'declineCreditSale', 'Only Finance (credit control) can decide on a credit sale.');
  const who = await me();
  const why = reason.trim().slice(0, 300);
  if (!why) throw new SalesError('Say why the credit sale is declined.');
  if (o.paymentTerms !== 'CREDIT' || o.creditApprovedById) throw new SalesError('There is no credit decision waiting on this order.');
  if (!CANCELLABLE_ORDER_STATUSES.includes(o.status as OrderStatus)) throw new SalesError('This order can no longer be declined.');
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.salesOrder.updateMany({ where: { id: o.id, status: o.status }, data: { status: 'CANCELLED', cancelledReason: `Credit declined: ${why}` } }));
    await tx.proFormaInvoice.updateMany({ where: { salesOrderId: o.id, status: 'ISSUED' }, data: { status: 'CANCELLED' } });
  });
  await audit(who.id, 'SalesOrder', o.id, 'sales_order.credit_declined', { referenceNumber: o.number, reason: why });
  emailColleaguesLater({ branchId: o.branchId, userIds: [o.confirmedById], exceptUserId: who.id, path: `/sales/orders/${o.id}`, where: 'sales_order.credit_declined',
    notice: { subject: `Credit sale declined — ${o.number}`, heading: 'Finance declined the credit sale', intro: `Order ${o.number} for ${o.customer.fullName} is cancelled: ${why}`, facts: [['Sales order', o.number]], next: 'Prepare a new quotation on prepaid terms if the customer still wants the goods.', status: { label: 'Declined', tone: 'danger' }, ctaLabel: 'Open the order' } });
}

/**
 * Finance clears the order for release: a goods release note (ISSUED, one
 * line per order line) for the warehouse to pick, and a build order for
 * every assembled line that has none yet. The order goes to the line
 * (IN_PRODUCTION) when anything must be assembled, otherwise READY.
 */
export async function clearOrderForRelease(salesOrderId: string): Promise<{ releaseId: string; releaseNumber: string; buildOrders: string[]; status: 'IN_PRODUCTION' | 'READY' }> {
  await refuseDuringAssist('clearOrderForRelease');
  const o = await orderForChange(salesOrderId);
  await authorize('finance.payment.confirm', { branchId: o.branchId, homeBranch: true }, 'clearOrderForRelease', 'Only Finance can clear an order for release.');
  const who = await me();
  const dealer = o.customer.dealerAccount ? { creditLimit: Number(o.customer.dealerAccount.creditLimit), onHold: o.customer.dealerAccount.onHold } : null;
  const credit = o.paymentTerms === 'CREDIT' ? creditCheck(dealer, await creditExposure(o.customerId, o.id), Number(o.total)) : null;
  const check = clearanceAllowed({ status: o.status as OrderStatus, paymentTerms: o.paymentTerms as PaymentTerms, amountPaid: Number(o.amountPaid), total: Number(o.total), creditApproved: Boolean(o.creditApprovedById), creditNeedsApproval: Boolean(credit?.needsApproval) });
  if (!check.ok) throw new SalesError(check.why ?? 'This order cannot be cleared yet.');
  if (!o.lines.length) throw new SalesError('The order has no lines to release.');
  const next = statusAfterClearance(o.lines.map((l: (typeof o.lines)[number]) => ({ source: l.product.source })));
  if (!canMoveOrder(o.status as OrderStatus, next)) throw new SalesError('This order cannot be cleared from its current state.');
  const existing = await prisma.buildOrder.findMany({ where: { salesOrderId: o.id, status: { not: 'CANCELLED' } }, select: { configurationId: true } });
  const toBuild: { line: (typeof o.lines)[number]; configurationId: string }[] = [];
  const skipped: string[] = [];
  for (const line of o.lines) {
    if (line.product.source !== 'ASSEMBLED') continue;
    let configurationId = line.configurationId;
    if (!configurationId) {
      const c = await prisma.productConfiguration.findFirst({ where: { productId: line.productId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
      configurationId = c?.id ?? null;
    }
    if (!configurationId) { skipped.push(line.description); continue; }
    if (existing.some((b: { configurationId: string }) => b.configurationId === configurationId) || toBuild.some((t) => t.configurationId === configurationId)) continue;
    toBuild.push({ line, configurationId });
  }
  const releaseNumber = await nextDocumentNumber('REL', who.organisationId);
  const buildNumbers: string[] = [];
  for (let i = 0; i < toBuild.length; i++) buildNumbers.push(await nextDocumentNumber('BLD', who.organisationId));
  const now = new Date();
  const release = await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.salesOrder.updateMany({ where: { id: o.id, status: o.status }, data: { status: next, clearedById: who.id, clearedAt: now } }));
    const rel = await tx.goodsReleaseNote.create({ data: { number: releaseNumber, salesOrderId: o.id, clearedById: who.id, issuedById: who.id, issuedAt: now, lines: { create: o.lines.map((l: (typeof o.lines)[number]) => ({ salesOrderLineId: l.id, finishedUnitId: null, quantity: l.quantity })) } } });
    for (let i = 0; i < toBuild.length; i++) {
      const t = toBuild[i]!;
      await tx.buildOrder.create({ data: { number: buildNumbers[i]!, branchId: o.branchId, configurationId: t.configurationId, quantity: t.line.quantity, purpose: 'FOR_ORDER', salesOrderId: o.id, projectId: o.projectId, plannedById: who.id, instructions: `For sales order ${o.number} — ${o.customer.fullName}${t.line.notes ? `: ${t.line.notes}` : ''}` } });
    }
    await tx.proFormaInvoice.updateMany({ where: { salesOrderId: o.id, status: 'ISSUED' }, data: { status: 'PAID' } });
    return rel;
  });
  await audit(who.id, 'SalesOrder', o.id, 'sales_order.cleared', { referenceNumber: o.number, releaseNote: releaseNumber, buildOrders: buildNumbers, buildOrdersSkipped: skipped, status: next, paymentTerms: o.paymentTerms });
  await audit(who.id, 'GoodsReleaseNote', release.id, 'goods_release_note.issued', { referenceNumber: releaseNumber, salesOrder: o.number, lines: o.lines.length });
  const tell = await usersWithRoles(who.organisationId, next === 'IN_PRODUCTION' ? ['production-planner', 'fg-warehouse-officer', 'warehouse-manager'] : ['fg-warehouse-officer', 'warehouse-manager']);
  emailColleaguesLater({ branchId: o.branchId, userIds: [...tell, o.confirmedById], exceptUserId: who.id, path: `/sales/orders/${o.id}`, where: 'sales_order.cleared',
    notice: { subject: `Cleared for release — ${o.number}`, heading: 'Finance cleared an order for release', intro: `${o.customer.fullName}'s order ${o.number} is cleared. Release note ${releaseNumber} is issued${buildNumbers.length ? `; build ${buildNumbers.join(', ')} planned for the line` : ''}.`, facts: [['Sales order', o.number], ['Release note', releaseNumber], ['Lines', String(o.lines.length)]], next: next === 'IN_PRODUCTION' ? 'Production builds the assembled units; the warehouse picks the stock items when they are ready.' : 'Pick the serials against the release note and dispatch.', status: { label: next === 'IN_PRODUCTION' ? 'In production' : 'Ready to pick', tone: 'info' }, ctaLabel: 'Open the order' } });
  return { releaseId: release.id, releaseNumber, buildOrders: buildNumbers, status: next };
}

/** The tax invoice for delivered goods (Billing); exported to the finance system later. */
export async function issueSalesInvoice(salesOrderId: string): Promise<{ id: string; number: string }> {
  const o = await orderForChange(salesOrderId);
  await authorize('billing.invoice.issue', { branchId: o.branchId, homeBranch: true }, 'issueSalesInvoice', 'Only Billing can issue the tax invoice.');
  const who = await me();
  if (o.status !== 'DELIVERED') throw new SalesError('The tax invoice is issued once the goods are delivered.');
  const number = await nextDocumentNumber('INV', who.organisationId);
  const inv = await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.salesOrder.updateMany({ where: { id: o.id, status: 'DELIVERED' }, data: { status: 'INVOICED' } }));
    return tx.salesInvoice.create({ data: { number, salesOrderId: o.id, issuedById: who.id, subtotal: round2(Number(o.subtotal) - Number(o.discountTotal)), taxTotal: o.taxTotal, total: o.total } });
  });
  await audit(who.id, 'SalesOrder', o.id, 'sales_invoice.issued', { referenceNumber: number, salesOrder: o.number, total: Number(o.total) });
  return { id: inv.id, number };
}

/** Close an invoiced order (Billing) once nothing is outstanding. */
export async function closeSalesOrder(salesOrderId: string): Promise<void> {
  const o = await orderForChange(salesOrderId);
  await authorize('billing.invoice.issue', { branchId: o.branchId, homeBranch: true }, 'closeSalesOrder', 'Only Billing can close an order.');
  const who = await me();
  if (o.status !== 'INVOICED') throw new SalesError('Only an invoiced order can be closed.');
  if (!paidInFull(Number(o.amountPaid), Number(o.total))) throw new SalesError(`${naira(round2(Number(o.total) - Number(o.amountPaid)))} is still outstanding on this order.`);
  stillAsSeen(await prisma.salesOrder.updateMany({ where: { id: o.id, status: 'INVOICED' }, data: { status: 'CLOSED', closedAt: new Date() } }));
  await audit(who.id, 'SalesOrder', o.id, 'sales_order.closed', { referenceNumber: o.number });
}

/** Cancel an order before anything leaves the store (Sales Manager). */
export async function cancelSalesOrder(salesOrderId: string, reason: string): Promise<void> {
  const o = await orderForChange(salesOrderId);
  await authorize('sales.discount.approve', { branchId: o.branchId, homeBranch: true }, 'cancelSalesOrder', 'Only the Sales Manager or the Commercial Director can cancel an order.');
  const who = await me();
  const why = reason.trim().slice(0, 300);
  if (!why) throw new SalesError('Say why the order is cancelled.');
  if (!CANCELLABLE_ORDER_STATUSES.includes(o.status as OrderStatus)) throw new SalesError('This order can no longer be cancelled — goods are being prepared or have left.');
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.salesOrder.updateMany({ where: { id: o.id, status: o.status }, data: { status: 'CANCELLED', cancelledReason: why } }));
    await tx.proFormaInvoice.updateMany({ where: { salesOrderId: o.id, status: 'ISSUED' }, data: { status: 'CANCELLED' } });
  });
  await audit(who.id, 'SalesOrder', o.id, 'sales_order.cancelled', { referenceNumber: o.number, reason: why, amountPaid: Number(o.amountPaid) });
}

// ── Payments list (Finance) ───────────────────────────────────────────────

export async function listSalesPayments(opts: { status?: string; take?: number } = {}) {
  const status = ['PENDING', 'CONFIRMED', 'REJECTED'].includes(opts.status ?? '') ? (opts.status as 'PENDING' | 'CONFIRMED' | 'REJECTED') : undefined;
  const rows = await prisma.salesPayment.findMany({
    where: { salesOrder: await reachWhere('sales.view'), ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: opts.take ?? 300,
    include: { salesOrder: { select: { id: true, number: true, total: true, amountPaid: true, status: true, channel: true, customer: { select: { id: true, fullName: true } } } } },
  });
  const ids = [...new Set(rows.flatMap((p: (typeof rows)[number]) => [p.recordedById, p.confirmedById]).filter((x): x is string => Boolean(x)))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const names = new Map(people.map((p: { id: string; fullName: string }) => [p.id, p.fullName]));
  return rows.map((p: (typeof rows)[number]) => ({ ...p, recordedByName: p.recordedById ? names.get(p.recordedById) ?? null : null, confirmedByName: p.confirmedById ? names.get(p.confirmedById) ?? null : null }));
}

// ── Returns ───────────────────────────────────────────────────────────────

export async function listSalesReturns(opts: { status?: string } = {}) {
  const status = ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'RESOLVED'].includes(opts.status ?? '') ? (opts.status as ReturnStatus) : undefined;
  return prisma.salesReturn.findMany({
    where: { salesOrder: await reachWhere('sales.view'), ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { salesOrder: { select: { id: true, number: true, customer: { select: { id: true, fullName: true } } } }, finishedUnit: { select: { id: true, serialNumber: true, product: { select: { name: true } } } } },
  });
}

export async function getSalesReturn(salesReturnId: string) {
  const r = await prisma.salesReturn.findFirst({
    where: { id: salesReturnId, salesOrder: await reachWhere('sales.view', { lens: false }) },
    include: { salesOrder: { select: { id: true, number: true, branchId: true, status: true, customer: { select: { id: true, fullName: true } } } }, finishedUnit: { select: { id: true, serialNumber: true, status: true, product: { select: { name: true } }, location: { select: { name: true, kind: true } } } } },
  });
  if (!r) return null;
  const ids = [r.requestedById, r.approvedById, r.receivedById].filter((x): x is string => Boolean(x));
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const names = new Map(people.map((p: { id: string; fullName: string }) => [p.id, p.fullName]));
  return { ...r, names };
}

export async function getSalesReturnAuditTrail(salesReturnId: string) {
  const r = await prisma.salesReturn.findFirst({ where: { id: salesReturnId, salesOrder: await reachWhere('sales.view', { lens: false }) }, select: { id: true } });
  return auditTrailOf('SalesReturn', r?.id ?? '__no_access__');
}

/** Dead on arrival or wrong item: Sales asks for a return (optionally naming the serial). */
export async function requestSalesReturn(salesOrderId: string, input: { reason: string; finishedUnitId?: string | null }): Promise<{ id: string; number: string }> {
  const o = await orderForChange(salesOrderId);
  await authorize('sales.quote.manage', { branchId: o.branchId, homeBranch: true }, 'requestSalesReturn', 'Only sales staff can request a return.');
  const who = await me();
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new SalesError('Say what is wrong with the goods.');
  if (!RETURNABLE_ORDER_STATUSES.includes(o.status as OrderStatus)) throw new SalesError('A return is requested once the goods have been released.');
  const unit = input.finishedUnitId ? await prisma.finishedUnit.findFirst({ where: { id: input.finishedUnitId, salesOrderId: o.id }, select: { id: true, serialNumber: true } }) : null;
  if (input.finishedUnitId && !unit) throw new SalesError('That serial is not on this order.');
  const number = await nextDocumentNumber('RMA', who.organisationId);
  const r = await prisma.salesReturn.create({ data: { number, salesOrderId: o.id, finishedUnitId: unit?.id ?? null, reason, requestedById: who.id } });
  await audit(who.id, 'SalesReturn', r.id, 'sales_return.requested', { referenceNumber: number, salesOrder: o.number, serial: unit?.serialNumber ?? null, reason });
  emailColleaguesLater({ branchId: o.branchId, userIds: await usersWithRoles(who.organisationId, ['sales-manager', 'commercial-director']), exceptUserId: who.id, path: `/sales/returns/${r.id}`, where: 'sales_return.requested',
    notice: { subject: `Return to approve — ${number}`, heading: 'A return needs approval', intro: `${o.customer.fullName} wants to return goods from order ${o.number}: ${reason}`, facts: [['Return', number], ['Sales order', o.number], ['Serial', unit?.serialNumber ?? 'not named']], next: 'Open the return and approve or reject it.', status: { label: 'Approval', tone: 'warning' }, ctaLabel: 'Open the return' } });
  return { id: r.id, number };
}

async function returnForDecision(salesReturnId: string) {
  const r = await prisma.salesReturn.findFirst({ where: { id: salesReturnId, salesOrder: await reachWhere('sales.view', { lens: false }) }, include: { salesOrder: { select: { id: true, number: true, branchId: true, customer: { select: { fullName: true } } } }, finishedUnit: { select: { id: true, serialNumber: true, status: true, location: { select: { branchId: true } } } } } });
  if (!r) throw new SalesError('This return is not available.');
  return r;
}

export async function approveSalesReturn(salesReturnId: string): Promise<void> {
  await refuseDuringAssist('approveSalesReturn');
  const r = await returnForDecision(salesReturnId);
  await authorize('sales.discount.approve', { branchId: r.salesOrder.branchId, homeBranch: true }, 'approveSalesReturn', 'Only the Sales Manager or the Commercial Director can approve a return.');
  const who = await me();
  if (r.status !== 'REQUESTED') throw new SalesError('This return has already been decided.');
  if (r.requestedById === who.id) throw new SalesError('You requested this return, so someone else must approve it.');
  stillAsSeen(await prisma.salesReturn.updateMany({ where: { id: r.id, status: 'REQUESTED' }, data: { status: 'APPROVED', approvedById: who.id, approvedAt: new Date() } }));
  await audit(who.id, 'SalesReturn', r.id, 'sales_return.approved', { referenceNumber: r.number, salesOrder: r.salesOrder.number });
  emailColleaguesLater({ branchId: r.salesOrder.branchId, userIds: [r.requestedById], exceptUserId: who.id, path: `/sales/returns/${r.id}`, where: 'sales_return.approved',
    notice: { subject: `Return approved — ${r.number}`, heading: 'The return was approved', intro: `Return ${r.number} on order ${r.salesOrder.number} is approved. Receive the unit into quarantine when it arrives.`, facts: [['Return', r.number]], status: { label: 'Approved', tone: 'success' }, ctaLabel: 'Open the return' } });
}

export async function rejectSalesReturn(salesReturnId: string, reason: string): Promise<void> {
  await refuseDuringAssist('rejectSalesReturn');
  const r = await returnForDecision(salesReturnId);
  await authorize('sales.discount.approve', { branchId: r.salesOrder.branchId, homeBranch: true }, 'rejectSalesReturn', 'Only the Sales Manager or the Commercial Director can decide on a return.');
  const who = await me();
  const why = reason.trim().slice(0, 300);
  if (!why) throw new SalesError('Say why the return is rejected.');
  if (r.status !== 'REQUESTED') throw new SalesError('This return has already been decided.');
  if (r.requestedById === who.id) throw new SalesError('You requested this return, so someone else decides on it.');
  stillAsSeen(await prisma.salesReturn.updateMany({ where: { id: r.id, status: 'REQUESTED' }, data: { status: 'REJECTED', approvedById: who.id, approvedAt: new Date(), notes: why } }));
  await audit(who.id, 'SalesReturn', r.id, 'sales_return.rejected', { referenceNumber: r.number, reason: why });
}

/** The unit is back: into quarantine (its branch's QUARANTINE location, when one exists). Sales or the finished-goods store. */
export async function receiveSalesReturn(salesReturnId: string, notes: string): Promise<void> {
  const r = await returnForDecision(salesReturnId);
  if (!(await allows('warehouse.fg.operate', { branchId: r.salesOrder.branchId, homeBranch: true }))) await authorize('sales.quote.manage', { branchId: r.salesOrder.branchId, homeBranch: true }, 'receiveSalesReturn', 'Only sales staff or the finished-goods store can receive a return.');
  const who = await me();
  if (!canMoveReturn(r.status as ReturnStatus, 'RECEIVED')) throw new SalesError('Only an approved return can be received.');
  let quarantine: string | null = null;
  await prisma.$transaction(async (tx) => {
    stillAsSeen(await tx.salesReturn.updateMany({ where: { id: r.id, status: 'APPROVED' }, data: { status: 'RECEIVED', receivedById: who.id, receivedAt: new Date(), notes: notes.trim().slice(0, 500) || null } }));
    if (r.finishedUnit) {
      const q = await tx.fgLocation.findFirst({ where: { branchId: r.finishedUnit.location.branchId, kind: 'QUARANTINE', isActive: true }, select: { id: true, name: true } });
      quarantine = q?.name ?? null;
      stillAsSeen(await tx.finishedUnit.updateMany({ where: { id: r.finishedUnit.id, status: r.finishedUnit.status }, data: { status: 'RETURNED', ...(q ? { locationId: q.id } : {}) } }));
    }
  });
  await audit(who.id, 'SalesReturn', r.id, 'sales_return.received', { referenceNumber: r.number, serial: r.finishedUnit?.serialNumber ?? null, quarantine });
}

export async function resolveSalesReturn(salesReturnId: string, input: { resolution: string; notes?: string }): Promise<void> {
  const r = await returnForDecision(salesReturnId);
  if (!(await allows('sales.discount.approve', { branchId: r.salesOrder.branchId, homeBranch: true }))) await authorize('sales.quote.manage', { branchId: r.salesOrder.branchId, homeBranch: true }, 'resolveSalesReturn', 'Only sales staff can resolve a return.');
  const who = await me();
  if (!RESOLUTIONS.includes(input.resolution as Resolution)) throw new SalesError('Choose how the return is resolved.');
  if (!canMoveReturn(r.status as ReturnStatus, 'RESOLVED')) throw new SalesError('Only an approved or received return can be resolved.');
  stillAsSeen(await prisma.salesReturn.updateMany({ where: { id: r.id, status: r.status }, data: { status: 'RESOLVED', resolution: input.resolution as Resolution, resolvedAt: new Date(), notes: (input.notes ?? '').trim().slice(0, 500) || r.notes } }));
  await audit(who.id, 'SalesReturn', r.id, 'sales_return.resolved', { referenceNumber: r.number, resolution: input.resolution });
}

// ── Home, dashboard and glance ────────────────────────────────────────────

function lagosDayStart(now = new Date()): Date {
  return new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);
}
function lagosMonthStart(now = new Date()): Date {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00+01:00`);
}

/** The Sales home page: today's quotations, what awaits payment, what is cleared, revenue this month by channel. */
export async function getSalesHome() {
  await requireUser();
  const reach = await reachWhere('sales.view');
  const today = lagosDayStart();
  const month = lagosMonthStart();
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [quotesToday, quotesOpen, awaiting, cleared, pendingPayments, returnsOpen, confirmedThisMonth, recentQuotes, recentOrders] = await Promise.all([
    n(prisma.quotation.count({ where: { ...reach, createdAt: { gte: today } } })),
    n(prisma.quotation.count({ where: { ...reach, status: { in: ['DRAFT', 'PENDING_DISCOUNT_APPROVAL', 'SENT'] } } })),
    n(prisma.salesOrder.count({ where: { ...reach, status: { in: ['CONFIRMED', 'AWAITING_PAYMENT'] } } })),
    n(prisma.salesOrder.count({ where: { ...reach, status: { in: ['IN_PRODUCTION', 'READY'] } } })),
    n(prisma.salesPayment.count({ where: { salesOrder: reach, status: 'PENDING' } })),
    n(prisma.salesReturn.count({ where: { salesOrder: reach, status: { in: ['REQUESTED', 'APPROVED'] } } })),
    prisma.salesPayment.findMany({ where: { salesOrder: reach, status: 'CONFIRMED', confirmedAt: { gte: month } }, select: { amount: true, salesOrder: { select: { channel: true } } } }).catch(() => [] as { amount: unknown; salesOrder: { channel: string } }[]),
    prisma.quotation.findMany({ where: { ...reach, createdAt: { gte: today } }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, number: true, status: true, total: true, customer: { select: { fullName: true } } } }).catch(() => []),
    prisma.salesOrder.findMany({ where: { ...reach, status: { in: ['CONFIRMED', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'READY'] } }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, number: true, status: true, total: true, amountPaid: true, customer: { select: { fullName: true } } } }).catch(() => []),
  ]);
  const byChannel = new Map<string, number>();
  for (const p of confirmedThisMonth) byChannel.set(p.salesOrder.channel, round2((byChannel.get(p.salesOrder.channel) ?? 0) + Number(p.amount)));
  const revenue = [...byChannel.entries()].map(([channel, amount]) => ({ channel, amount })).sort((a, b) => b.amount - a.amount);
  return { quotesToday, quotesOpen, awaiting, cleared, pendingPayments, returnsOpen, revenueThisMonth: round2(revenue.reduce((s, r) => s + r.amount, 0)), revenue, recentQuotes, recentOrders };
}

/** Decisions waiting on this viewer: discounts, credit sales, returns, payments to confirm. */
export async function getSalesDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  if (!(await allows('sales.view'))) return [];
  const p = await getPrincipal();
  const reach = await reachWhere('sales.view', { lens: false });
  const rights = await discountRights();
  const [credit, payments] = await Promise.all([allows('finance.credit.manage'), allows('finance.payment.confirm')]);
  const items: { id: string; title: string; detail: string; url: string; createdAt: Date }[] = [];
  if (rights.approve || rights.approveLarge) {
    const quotes = await prisma.quotation.findMany({ where: { ...reach, status: 'PENDING_DISCOUNT_APPROVAL', preparedById: { not: p.userId } }, orderBy: { updatedAt: 'desc' }, take: 15, select: { id: true, number: true, total: true, updatedAt: true, customer: { select: { fullName: true } }, lines: { select: { quantity: true, unitPrice: true, discountPercent: true } } } });
    for (const q of quotes) {
      const a = discountApproval(q.lines.map((l: (typeof q.lines)[number]) => ({ quantity: l.quantity, unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) })));
      if (!canApproveDiscount(a.level, rights)) continue;
      items.push({ id: `quote-discount-${q.id}`, title: `Approve discount on quotation ${q.number}`, detail: `${q.customer.fullName} · ${a.maxLinePercent}% on a line, ${a.overallPercent}% overall · ${naira(Number(q.total))}`, url: `/sales/quotations/${q.id}`, createdAt: q.updatedAt });
    }
    const returns = await prisma.salesReturn.findMany({ where: { salesOrder: reach, status: 'REQUESTED', requestedById: { not: p.userId } }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, number: true, reason: true, createdAt: true, salesOrder: { select: { number: true, customer: { select: { fullName: true } } } } } });
    for (const r of returns) items.push({ id: `sales-return-${r.id}`, title: `Approve return ${r.number}`, detail: `${r.salesOrder.customer.fullName} · ${r.salesOrder.number} · ${r.reason.slice(0, 80)}`, url: `/sales/returns/${r.id}`, createdAt: r.createdAt });
  }
  if (credit) {
    const orders = await prisma.salesOrder.findMany({ where: { ...reach, paymentTerms: 'CREDIT', creditApprovedById: null, status: { in: ['CONFIRMED', 'AWAITING_PAYMENT'] }, confirmedById: { not: p.userId } }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, total: true, createdAt: true, customerId: true, customer: { select: { fullName: true, dealerAccount: { select: { creditLimit: true, onHold: true } } } } } });
    for (const o of orders) {
      const dealer = o.customer.dealerAccount ? { creditLimit: Number(o.customer.dealerAccount.creditLimit), onHold: o.customer.dealerAccount.onHold } : null;
      const c = creditCheck(dealer, await creditExposure(o.customerId, o.id), Number(o.total));
      if (!c.needsApproval) continue;
      items.push({ id: `credit-sale-${o.id}`, title: `Approve credit sale ${o.number}`, detail: `${o.customer.fullName} · ${naira(Number(o.total))} against ${naira(c.remaining)} credit left`, url: `/sales/orders/${o.id}`, createdAt: o.createdAt });
    }
  }
  if (payments) {
    const pending = await prisma.salesPayment.findMany({ where: { salesOrder: reach, status: 'PENDING', OR: [{ recordedById: null }, { recordedById: { not: p.userId } }] }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, amount: true, method: true, reference: true, createdAt: true, salesOrder: { select: { id: true, number: true, customer: { select: { fullName: true } } } } } });
    for (const pay of pending) items.push({ id: `payment-confirm-${pay.id}`, title: `Confirm payment of ${naira(Number(pay.amount))} on ${pay.salesOrder.number}`, detail: `${pay.salesOrder.customer.fullName} · ${pay.method.replace('_', ' ').toLowerCase()}${pay.reference ? ` · ${pay.reference}` : ''}`, url: `/sales/orders/${pay.salesOrder.id}`, createdAt: pay.createdAt });
  }
  return items;
}

export type SalesGlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

/** Sales tiles for the dashboard's "At a glance" (same reach as the lists). */
export async function getSalesGlance(): Promise<SalesGlanceTile[]> {
  if (!(await allows('sales.view'))) return [];
  const reach = await reachWhere('sales.view');
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [open, awaiting, cleared, pending] = await Promise.all([
    n(prisma.quotation.count({ where: { ...reach, status: { in: ['DRAFT', 'PENDING_DISCOUNT_APPROVAL', 'SENT'] } } })),
    n(prisma.salesOrder.count({ where: { ...reach, status: { in: ['CONFIRMED', 'AWAITING_PAYMENT'] } } })),
    n(prisma.salesOrder.count({ where: { ...reach, status: { in: ['IN_PRODUCTION', 'READY'] } } })),
    n(prisma.salesPayment.count({ where: { salesOrder: reach, status: 'PENDING' } })),
  ]);
  return [
    { label: 'Quotations open', value: open, hint: 'Draft, awaiting a discount decision or with the customer', href: '/sales/quotations', tone: 'primary' },
    { label: 'Orders awaiting payment', value: awaiting, hint: 'Confirmed, not yet paid in full', href: '/sales/orders?status=AWAITING_PAYMENT', tone: awaiting ? 'warning' : 'muted' },
    { label: 'Cleared for release', value: cleared, hint: 'With the line or the store', href: '/sales/orders?status=READY', tone: 'info' },
    { label: 'Payments to confirm', value: pending, hint: 'Recorded, waiting on Finance', href: '/sales/payments', tone: pending ? 'warning' : 'muted' },
  ];
}

/** What the viewer may do on the Sales pages, in one round. */
export async function getSalesRights(branchId?: string | null): Promise<{ quote: boolean; approve: boolean; approveLarge: boolean; dealers: boolean; pricing: boolean; billing: boolean; confirm: boolean; credit: boolean; exportCsv: boolean; fg: boolean }> {
  const rec = branchId ? { branchId, homeBranch: true } : undefined;
  const [quote, approve, approveLarge, dealers, pricing, billing, confirm, credit, exportCsv, fg] = await Promise.all([
    allows('sales.quote.manage', rec), allows('sales.discount.approve', rec), allows('sales.discount.approve_large', rec), allows('sales.dealer.manage'), allows('sales.pricing.manage'),
    allows('billing.invoice.issue', rec), allows('finance.payment.confirm', rec), allows('finance.credit.manage', rec), allows('finance.export'), allows('warehouse.fg.operate', rec),
  ]);
  return { quote, approve, approveLarge, dealers, pricing, billing, confirm, credit, exportCsv, fg };
}
