'use server';
import { after } from 'next/server';
import { prisma, type Prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, allows, orgWhere, myOrganisationId } from '@/lib/authz/server';
import { claimed as stillAsSeen } from '@/lib/integrity';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { sendEmail } from '@/lib/email';
import { logFailure } from '@/lib/log';
import { websiteBaseUrl } from '@/lib/portal-url';
import { letterheadFor } from '@/lib/support/server';
import { renderSalesPriceBroadcastEmail, type PriceBroadcastEmailLine } from '@/lib/email-templates/sales-price-broadcast';
import { channelFor, resolvePrice, snapshotKey, changeSummary, lagosDayOf, type PriceSnapshotLine, type Channel, type Tier } from '@/lib/pricing-core';
import { round2, TIER_LABEL, naira } from '@/lib/sales-core';
import type { SearchableOption } from '@/components/SearchableSelect';

/**
 * Price lists per channel (and dealer tier), their items, activation, and
 * the daily dealer price broadcast. Price lists are organisation-owned, so
 * every read carries orgWhere(). The scheduled broadcast lives in
 * app/api/cron/price-broadcast/route.ts and uses the same pure rules.
 */
class PricingError extends Error {}

const CHANNELS = ['RETAIL', 'DEALER', 'CORPORATE', 'GOVERNMENT', 'DISTRIBUTOR', 'ONLINE', 'PROJECT'] as const;
const TIERS = ['TIER_1', 'TIER_2', 'TIER_3'] as const;

async function audit(userId: string, entityType: 'PriceList' | 'PriceBroadcast', entityId: string, action: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

const productLabel = (p: { name: string; sku: string }, c: { name: string; code: string } | null | undefined) => (c ? `${p.name} — ${c.name}` : p.name);

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listPriceLists(opts: { channel?: string; status?: string } = {}) {
  await authorize('sales.view', undefined, 'listPriceLists');
  const channel = CHANNELS.includes(opts.channel as Channel) ? (opts.channel as Channel) : undefined;
  const status = ['DRAFT', 'ACTIVE', 'RETIRED'].includes(opts.status ?? '') ? (opts.status as 'DRAFT' | 'ACTIVE' | 'RETIRED') : undefined;
  return prisma.priceList.findMany({
    where: { ...(await orgWhere()), ...(channel ? { channel } : {}), ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }],
    take: 200,
    include: { createdBy: { select: { fullName: true } }, _count: { select: { items: true, broadcasts: true } } },
  });
}

/** One price list with its items (product and configuration names) and its broadcast history. */
export async function getPriceList(priceListId: string) {
  await authorize('sales.view', undefined, 'getPriceList');
  const list = await prisma.priceList.findFirst({
    where: { id: priceListId, ...(await orgWhere()) },
    include: {
      createdBy: { select: { fullName: true } },
      items: { include: { product: { select: { id: true, name: true, sku: true, family: true } }, configuration: { select: { id: true, name: true, code: true } } }, orderBy: [{ product: { name: 'asc' } }, { minQuantity: 'asc' }] },
      broadcasts: { orderBy: { publishedAt: 'desc' }, take: 30 },
    },
  });
  if (!list) return null;
  const publisherIds = [...new Set([list.approvedById, ...list.broadcasts.map((b: { publishedById: string }) => b.publishedById)].filter((x): x is string => Boolean(x)))];
  const people = publisherIds.length ? await prisma.user.findMany({ where: { id: { in: publisherIds } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(people.map((p: { id: string; fullName: string }) => [p.id, p.fullName]));
  return { ...list, approvedByName: list.approvedById ? name.get(list.approvedById) ?? null : null, broadcasts: list.broadcasts.map((b: (typeof list.broadcasts)[number]) => ({ ...b, publishedByName: name.get(b.publishedById) ?? 'System' })) };
}

/** The ACTIVE list for a channel (and tier), with its items — what a quotation prices from. */
export async function activePriceListFor(channel: string, tier?: string | null) {
  await requireUser();
  if (!CHANNELS.includes(channel as Channel)) return null;
  return prisma.priceList.findFirst({
    where: { ...(await orgWhere()), channel: channel as Channel, tier: channel === 'DEALER' && TIERS.includes(tier as Tier) ? (tier as Tier) : null, status: 'ACTIVE' },
    orderBy: { effectiveFrom: 'desc' },
    include: { items: { select: { productId: true, configurationId: true, unitPrice: true, minQuantity: true } } },
  });
}

/** Catalogue products (and their configurations) of the organisation, for the price list item picker. */
export async function searchCatalogueProductOptions(query: string): Promise<SearchableOption[]> {
  if (!(await allows('sales.view')) && !(await allows('catalogue.view'))) return [];
  const q = query.trim().slice(0, 80);
  const products = await prisma.product.findMany({
    where: { ...(await orgWhere()), isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' },
    take: 12,
    select: { id: true, name: true, sku: true, configurations: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, code: true } } },
  });
  const out: SearchableOption[] = [];
  for (const p of products) {
    out.push({ value: `${p.id}|`, label: p.name, sublabel: `${p.sku} · any configuration` });
    for (const c of p.configurations) out.push({ value: `${p.id}|${c.id}`, label: productLabel(p, c), sublabel: `${p.sku}-${c.code}` });
  }
  return out.slice(0, 40);
}

/** The first products, shown before anything is typed. */
export async function listCatalogueProductOptions(): Promise<SearchableOption[]> {
  return searchCatalogueProductOptions('');
}

/**
 * Products for a quotation line, priced from the active list of the
 * customer's channel and tier. The option value carries the price so the
 * form can prefill it; the server prices the line again when it saves.
 */
export async function searchQuotationProductOptions(customerId: string, query: string): Promise<SearchableOption[]> {
  if (!(await allows('sales.quote.manage'))) return [];
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ...(await orgWhere()) }, select: { id: true, dealerAccount: { select: { channel: true, tier: true } } } });
  if (!customer) return [];
  const { channel, tier } = channelFor(customer.dealerAccount);
  const list = await activePriceListFor(channel, tier);
  const items = (list?.items ?? []).map((i: { productId: string; configurationId: string | null; unitPrice: unknown; minQuantity: number }) => ({ productId: i.productId, configurationId: i.configurationId, unitPrice: Number(i.unitPrice), minQuantity: i.minQuantity }));
  const q = query.trim().slice(0, 80);
  const products = await prisma.product.findMany({
    where: { ...(await orgWhere()), isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' },
    take: 12,
    select: { id: true, name: true, sku: true, source: true, configurations: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, code: true } } },
  });
  const out: SearchableOption[] = [];
  const priced = (productId: string, configurationId: string | null) => resolvePrice(items, { productId, configurationId });
  for (const p of products) {
    const base = priced(p.id, null);
    out.push({ value: `${p.id}||${base ? base.unitPrice : ''}`, label: p.name, sublabel: `${p.sku} · ${base ? naira(base.unitPrice) : 'not on the price list'}` });
    for (const c of p.configurations) {
      const price = priced(p.id, c.id);
      out.push({ value: `${p.id}|${c.id}|${price ? price.unitPrice : ''}`, label: productLabel(p, c), sublabel: `${p.sku}-${c.code} · ${price ? naira(price.unitPrice) : 'not on the price list'}` });
    }
  }
  return out.slice(0, 40);
}

/** The channel, tier and active price list a quotation for this customer would use. */
export async function getCustomerPricingContext(customerId: string): Promise<{ channel: Channel; tier: Tier | null; priceList: { id: string; name: string; number: string } | null } | null> {
  await requireUser();
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ...(await orgWhere()) }, select: { id: true, dealerAccount: { select: { channel: true, tier: true } } } });
  if (!customer) return null;
  const { channel, tier } = channelFor(customer.dealerAccount);
  const list = await activePriceListFor(channel, tier);
  return { channel, tier, priceList: list ? { id: list.id, name: list.name, number: list.number } : null };
}

// ── Writes ────────────────────────────────────────────────────────────────

export type CreatePriceListInput = { name: string; channel: string; tier?: string; effectiveFrom: Date; currency?: string };

export async function createPriceList(input: CreatePriceListInput): Promise<{ id: string; number: string }> {
  await authorize('sales.pricing.manage', undefined, 'createPriceList', 'Only the Commercial Director (pricing) can create a price list.');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new PricingError('Your account is not placed in an organisation yet.');
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new PricingError('Give the price list a name.');
  if (!CHANNELS.includes(input.channel as Channel)) throw new PricingError('Choose the channel this list is for.');
  const channel = input.channel as Channel;
  const tier = channel === 'DEALER' ? (TIERS.includes(input.tier as Tier) ? (input.tier as Tier) : null) : null;
  if (channel === 'DEALER' && !tier) throw new PricingError('A dealer price list needs a tier (Tier 1, 2 or 3).');
  const effectiveFrom = new Date(input.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) throw new PricingError('Enter a valid effective date.');
  const number = await nextDocumentNumber('PL', organisationId);
  const created = await prisma.priceList.create({ data: { organisationId, number, name, channel, tier, currency: (input.currency ?? 'NGN').trim().slice(0, 3).toUpperCase() || 'NGN', effectiveFrom, createdById: user.id } });
  await audit(user.id, 'PriceList', created.id, 'price_list.created', { referenceNumber: number, name, channel, tier });
  return { id: created.id, number };
}

export type PriceListItemInput = { productId: string; configurationId?: string | null; unitPrice: number; minQuantity?: number };

/** Add or re-price one line (the same product, configuration and quantity break replaces the existing price). */
export async function setPriceListItem(priceListId: string, input: PriceListItemInput): Promise<void> {
  await authorize('sales.pricing.manage', undefined, 'setPriceListItem', 'Only the Commercial Director (pricing) can change prices.');
  const user = await requireUser();
  const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...(await orgWhere()) }, select: { id: true, number: true, status: true, organisationId: true } });
  if (!list) throw new PricingError('This price list is not available.');
  if (list.status === 'RETIRED') throw new PricingError('A retired price list cannot be changed. Create a new one.');
  const product = await prisma.product.findFirst({ where: { id: input.productId, organisationId: list.organisationId }, select: { id: true, name: true, configurations: { select: { id: true, name: true } } } });
  if (!product) throw new PricingError('Choose a product from the catalogue.');
  const configurationId = input.configurationId || null;
  const configuration = configurationId ? product.configurations.find((c: { id: string }) => c.id === configurationId) : null;
  if (configurationId && !configuration) throw new PricingError('That configuration does not belong to the product.');
  const unitPrice = round2(Number(input.unitPrice));
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new PricingError('Enter a unit price above zero.');
  const minQuantity = Math.max(1, Math.round(Number(input.minQuantity) || 1));
  const existing = await prisma.priceListItem.findFirst({ where: { priceListId: list.id, productId: product.id, configurationId, minQuantity }, select: { id: true, unitPrice: true } });
  if (existing) await prisma.priceListItem.update({ where: { id: existing.id }, data: { unitPrice } });
  else await prisma.priceListItem.create({ data: { priceListId: list.id, productId: product.id, configurationId, unitPrice, minQuantity } });
  await audit(user.id, 'PriceList', list.id, existing ? 'price_list.item_repriced' : 'price_list.item_added', { referenceNumber: list.number, product: productLabel({ name: product.name, sku: '' }, configuration ? { name: configuration.name, code: '' } : null), minQuantity, ...(existing ? { changes: { unitPrice: { from: Number(existing.unitPrice), to: unitPrice } } } : { unitPrice }) });
}

export async function removePriceListItem(priceListId: string, itemId: string): Promise<void> {
  await authorize('sales.pricing.manage', undefined, 'removePriceListItem', 'Only the Commercial Director (pricing) can change prices.');
  const user = await requireUser();
  const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...(await orgWhere()) }, select: { id: true, number: true, status: true } });
  if (!list) throw new PricingError('This price list is not available.');
  if (list.status === 'RETIRED') throw new PricingError('A retired price list cannot be changed.');
  const item = await prisma.priceListItem.findFirst({ where: { id: itemId, priceListId: list.id }, include: { product: { select: { name: true } }, configuration: { select: { name: true } } } });
  if (!item) throw new PricingError('That line is no longer on the list.');
  await prisma.priceListItem.delete({ where: { id: item.id } });
  await audit(user.id, 'PriceList', list.id, 'price_list.item_removed', { referenceNumber: list.number, product: item.configuration ? `${item.product.name} — ${item.configuration.name}` : item.product.name, unitPrice: Number(item.unitPrice), minQuantity: item.minQuantity });
}

/** Make the list the one quotations price from; the previous ACTIVE list of the same channel and tier retires. */
export async function activatePriceList(priceListId: string): Promise<void> {
  await authorize('sales.pricing.manage', undefined, 'activatePriceList', 'Only the Commercial Director (pricing) can activate a price list.');
  const user = await requireUser();
  const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...(await orgWhere()) }, include: { _count: { select: { items: true } } } });
  if (!list) throw new PricingError('This price list is not available.');
  if (list.status !== 'DRAFT') throw new PricingError(list.status === 'ACTIVE' ? 'This price list is already active.' : 'A retired price list cannot be activated again.');
  if (list._count.items === 0) throw new PricingError('Add at least one price before activating the list.');
  const now = new Date();
  const retired = await prisma.$transaction(async (tx) => {
    const previous = await tx.priceList.findMany({ where: { organisationId: list.organisationId, channel: list.channel, tier: list.tier, status: 'ACTIVE', id: { not: list.id } }, select: { id: true, number: true } });
    if (previous.length) await tx.priceList.updateMany({ where: { id: { in: previous.map((p: { id: string }) => p.id) }, status: 'ACTIVE' }, data: { status: 'RETIRED', effectiveTo: now } });
    stillAsSeen(await tx.priceList.updateMany({ where: { id: list.id, status: 'DRAFT' }, data: { status: 'ACTIVE', approvedById: user.id, approvedAt: now } }));
    return previous;
  });
  await audit(user.id, 'PriceList', list.id, 'price_list.activated', { referenceNumber: list.number, channel: list.channel, tier: list.tier, retired: retired.map((p: { number: string }) => p.number) });
}

export async function retirePriceList(priceListId: string): Promise<void> {
  await authorize('sales.pricing.manage', undefined, 'retirePriceList', 'Only the Commercial Director (pricing) can retire a price list.');
  const user = await requireUser();
  const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...(await orgWhere()) }, select: { id: true, number: true, status: true } });
  if (!list) throw new PricingError('This price list is not available.');
  if (list.status === 'RETIRED') throw new PricingError('This price list is already retired.');
  stillAsSeen(await prisma.priceList.updateMany({ where: { id: list.id, status: list.status }, data: { status: 'RETIRED', effectiveTo: new Date() } }));
  await audit(user.id, 'PriceList', list.id, 'price_list.retired', { referenceNumber: list.number });
}

/** The snapshot lines of a list's items (what a broadcast records and compares). */
function snapshotOf(items: { productId: string; configurationId: string | null; unitPrice: unknown; minQuantity: number; product: { name: string; sku: string }; configuration: { name: string; code: string } | null }[]): PriceSnapshotLine[] {
  return items.map((i) => ({ key: snapshotKey(i), label: productLabel(i.product, i.configuration), unitPrice: Number(i.unitPrice), minQuantity: i.minQuantity }));
}

/**
 * Publish today's dealer prices from this ACTIVE list: one PriceBroadcast
 * (what changed vs the previous broadcast of this channel and tier, how many
 * dealers get it) and an email to each dealer of that tier who takes the
 * broadcast and has an email address. The scheduled job does the same each
 * working morning for every organisation (app/api/cron/price-broadcast).
 */
export async function publishPriceBroadcast(priceListId: string): Promise<{ id: string; number: string; recipientsCount: number; summary: string }> {
  await authorize('sales.pricing.manage', undefined, 'publishPriceBroadcast', 'Only the Commercial Director (pricing) can publish the dealer prices.');
  const user = await requireUser();
  const list = await prisma.priceList.findFirst({
    where: { id: priceListId, ...(await orgWhere()) },
    include: { items: { include: { product: { select: { name: true, sku: true } }, configuration: { select: { name: true, code: true } } } }, organisation: { select: { id: true, name: true } } },
  });
  if (!list) throw new PricingError('This price list is not available.');
  if (list.status !== 'ACTIVE') throw new PricingError('Only an active price list can be broadcast. Activate it first.');
  if (list.channel !== 'DEALER') throw new PricingError('The daily broadcast goes to dealers: choose a dealer price list.');
  if (!list.items.length) throw new PricingError('The list has no prices to broadcast.');
  const lines = snapshotOf(list.items);
  const previous = await prisma.priceBroadcast.findFirst({ where: { organisationId: list.organisationId, priceList: { channel: list.channel, tier: list.tier } }, orderBy: { publishedAt: 'desc' }, select: { changes: true } });
  const before = ((previous?.changes as { snapshot?: PriceSnapshotLine[] } | null)?.snapshot ?? null);
  const diff = changeSummary(previous ? before ?? [] : null, lines);
  const dealers = await prisma.dealerAccount.findMany({
    where: { channel: 'DEALER', receivesPriceBroadcast: true, ...(list.tier ? { tier: list.tier } : {}), customer: { organisationId: list.organisationId, isActive: true } },
    select: { customer: { select: { fullName: true, email: true } } },
  });
  const number = await nextDocumentNumber('PB', list.organisationId);
  const broadcast = await prisma.priceBroadcast.create({
    data: { number, organisationId: list.organisationId, priceListId: list.id, publishedById: user.id, summary: diff.summary, recipientsCount: dealers.length, emailed: dealers.some((d: { customer: { email: string | null } }) => Boolean(d.customer.email)), changes: { snapshot: lines, changes: diff.changes, listNumber: list.number } as unknown as Prisma.InputJsonValue },
  });
  await audit(user.id, 'PriceBroadcast', broadcast.id, 'price_broadcast.published', { referenceNumber: number, priceList: list.number, summary: diff.summary, recipientsCount: dealers.length });
  const dateLabel = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' });
  const emailLines: PriceBroadcastEmailLine[] = lines.map((l) => {
    const c = diff.changes.find((x) => x.key === l.key);
    return { label: l.label, unitPrice: naira(l.unitPrice), minQuantity: l.minQuantity, change: c?.kind === 'ADDED' ? 'NEW' : c?.kind === 'UP' ? 'UP' : c?.kind === 'DOWN' ? 'DOWN' : null, previousPrice: c?.from !== null && c?.from !== undefined ? naira(c.from) : null };
  });
  const removed = diff.changes.filter((c) => c.kind === 'REMOVED').map((c) => c.label);
  const run = async () => {
    try {
      const head = await letterheadFor(list.organisationId, null);
      const portalUrl = `${websiteBaseUrl()}/customer-portal/dashboard`;
      for (const d of dealers) {
        if (!d.customer.email) continue;
        const m = renderSalesPriceBroadcastEmail({ dealerName: d.customer.fullName, listName: list.name, tierLabel: list.tier ? TIER_LABEL[list.tier] : null, dateLabel, broadcastNumber: number, changeSummary: diff.summary, lines: emailLines, removed, portalUrl, logoUrl: head.logoUrl, companyName: head.companyName });
        await sendEmail(d.customer.email, m.subject, m.html).catch((err) => logFailure('Could not email a dealer the price broadcast', number, err));
      }
    } catch (err) {
      logFailure('Price broadcast emails failed', number, err);
    }
  };
  try { after(run); } catch { void run(); }
  return { id: broadcast.id, number, recipientsCount: dealers.length, summary: diff.summary };
}

/** Whether today's (Lagos) broadcast has gone out for this list's channel and tier. */
export async function broadcastSentToday(priceListId: string): Promise<boolean> {
  await requireUser();
  const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...(await orgWhere()) }, select: { organisationId: true, channel: true, tier: true } });
  if (!list) return false;
  const latest = await prisma.priceBroadcast.findFirst({ where: { organisationId: list.organisationId, priceList: { channel: list.channel, tier: list.tier } }, orderBy: { publishedAt: 'desc' }, select: { publishedAt: true } });
  return Boolean(latest && lagosDayOf(latest.publishedAt) === lagosDayOf(new Date()));
}
