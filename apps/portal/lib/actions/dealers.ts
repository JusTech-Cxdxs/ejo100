'use server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, allows, orgWhere, refuseDuringAssist } from '@/lib/authz/server';
import { creditCheck, outstandingOn, round2, type OrderStatus, type PaymentTerms } from '@/lib/sales-core';
import type { SearchableOption } from '@/components/SearchableSelect';

/**
 * Dealer accounts: a customer who buys to resell (a dealer, wholesaler or
 * distributor such as TD Africa) — their channel and tier (which price list
 * they get), territory, the daily price broadcast, and the credit position
 * Finance sets. Customers are organisation-owned, so every read is fenced
 * with orgWhere() through the customer.
 */
class DealerError extends Error {}

const CHANNELS = ['RETAIL', 'DEALER', 'CORPORATE', 'GOVERNMENT', 'DISTRIBUTOR', 'ONLINE', 'PROJECT'] as const;
const TIERS = ['TIER_1', 'TIER_2', 'TIER_3'] as const;
type Channel = (typeof CHANNELS)[number];
type Tier = (typeof TIERS)[number];

async function audit(userId: string, dealerAccountId: string, action: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action: `dealer_account.${action}`, entityType: 'DealerAccount', entityId: dealerAccountId, metadata });
}

/** Each read of one dealer account is fenced in place: { id, customer: orgWhere() } — outside the organisation reads as "not found". */
const DEALER_INCLUDE = { customer: { select: { id: true, fullName: true, email: true, phone: true, organisationId: true } } } as const;

export type DealerListRow = Awaited<ReturnType<typeof listDealerAccounts>>[number];

/** Every dealer account of the organisation, newest first; `q` matches the customer's name, email, phone or territory. */
export async function listDealerAccounts(opts: { q?: string; channel?: string; hold?: boolean } = {}) {
  await authorize('sales.view', undefined, 'listDealerAccounts');
  const q = (opts.q ?? '').trim().slice(0, 80);
  const channel = CHANNELS.includes(opts.channel as Channel) ? (opts.channel as Channel) : undefined;
  return prisma.dealerAccount.findMany({
    where: {
      customer: {
        ...(await orgWhere()),
        ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }, { dealerAccount: { territory: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      ...(channel ? { channel } : {}),
      ...(opts.hold ? { onHold: true } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { customer: { select: { id: true, fullName: true, email: true, phone: true } } },
  });
}

/** One dealer account with its statement: orders, confirmed payments, what is still owed on credit, and the credit left. */
export async function getDealerAccount(dealerAccountId: string) {
  await authorize('sales.view', undefined, 'getDealerAccount');
  const d = await prisma.dealerAccount.findFirst({ where: { id: dealerAccountId, customer: await orgWhere() }, include: DEALER_INCLUDE });
  if (!d) return null;
  const [orders, payments, names] = await Promise.all([
    prisma.salesOrder.findMany({ where: { customerId: d.customerId }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, number: true, status: true, paymentTerms: true, total: true, amountPaid: true, createdAt: true, channel: true } }),
    prisma.salesPayment.findMany({ where: { salesOrder: { customerId: d.customerId }, status: 'CONFIRMED' }, orderBy: { paidAt: 'desc' }, take: 200, select: { id: true, amount: true, method: true, reference: true, paidAt: true, salesOrder: { select: { id: true, number: true } } } }),
    prisma.user.findMany({ where: { id: { in: [d.approvedById, d.accountManagerId].filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } }),
  ]);
  const exposure = round2(orders.reduce((s: number, o: (typeof orders)[number]) => s + outstandingOn({ paymentTerms: o.paymentTerms as PaymentTerms, status: o.status as OrderStatus, total: Number(o.total), amountPaid: Number(o.amountPaid) }), 0));
  const credit = creditCheck({ creditLimit: Number(d.creditLimit), onHold: d.onHold }, exposure, 0);
  const ordered = round2(orders.filter((o: (typeof orders)[number]) => o.status !== 'CANCELLED').reduce((s: number, o: (typeof orders)[number]) => s + Number(o.total), 0));
  const paid = round2(payments.reduce((s: number, p: (typeof payments)[number]) => s + Number(p.amount), 0));
  const name = new Map(names.map((n: { id: string; fullName: string }) => [n.id, n.fullName]));
  return {
    ...d,
    orders,
    payments,
    statement: { ordered, paid, outstanding: exposure, creditRemaining: credit.remaining },
    approvedByName: d.approvedById ? name.get(d.approvedById) ?? null : null,
    accountManagerName: d.accountManagerId ? name.get(d.accountManagerId) ?? null : null,
  };
}

/** Customers of the organisation who are not dealers yet — for the onboarding picker. */
export async function searchCustomersToOnboard(query: string): Promise<SearchableOption[]> {
  await authorize('sales.dealer.manage', undefined, 'searchCustomersToOnboard');
  const q = query.trim().slice(0, 80);
  if (!q) return [];
  const rows = await prisma.customer.findMany({
    where: { ...(await orgWhere()), isActive: true, dealerAccount: null, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }] },
    orderBy: { fullName: 'asc' },
    take: 20,
    select: { id: true, fullName: true, email: true, phone: true },
  });
  return rows.map((c: (typeof rows)[number]) => ({ value: c.id, label: c.fullName, sublabel: [c.email, c.phone].filter(Boolean).join(' · ') }));
}

export type OnboardDealerInput = { customerId: string; channel: string; tier?: string; territory?: string; receivesPriceBroadcast: boolean };

/** Make a customer a dealer: channel, tier, territory, broadcast. Credit stays at zero until Finance sets it. */
export async function onboardDealer(input: OnboardDealerInput): Promise<{ id: string }> {
  await authorize('sales.dealer.manage', undefined, 'onboardDealer', 'Only the Sales Manager or the Commercial Director can onboard a dealer.');
  const user = await requireUser();
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, ...(await orgWhere()) }, select: { id: true, fullName: true, dealerAccount: { select: { id: true } } } });
  if (!customer) throw new DealerError('Choose a customer of your organisation.');
  if (customer.dealerAccount) throw new DealerError(`${customer.fullName} is already a dealer.`);
  const { channel, tier, territory } = cleanDealerFields(input);
  const created = await prisma.dealerAccount.create({
    data: { customerId: customer.id, channel, tier, territory, receivesPriceBroadcast: Boolean(input.receivesPriceBroadcast), approvedById: user.id, approvedAt: new Date() },
  });
  await audit(user.id, created.id, 'onboarded', { customerName: customer.fullName, channel, tier, territory });
  return { id: created.id };
}

function cleanDealerFields(input: { channel: string; tier?: string; territory?: string }): { channel: Channel; tier: Tier | null; territory: string | null } {
  if (!CHANNELS.includes(input.channel as Channel)) throw new DealerError('Choose a sales channel.');
  const channel = input.channel as Channel;
  const tier = channel === 'DEALER' ? (TIERS.includes(input.tier as Tier) ? (input.tier as Tier) : null) : null;
  if (channel === 'DEALER' && !tier) throw new DealerError('Choose the dealer\'s tier (Tier 1, 2 or 3).');
  return { channel, tier, territory: (input.territory ?? '').trim().slice(0, 120) || null };
}

/** Channel, tier, territory and the price broadcast choice (Sales). */
export async function updateDealerAccount(dealerAccountId: string, input: { channel: string; tier?: string; territory?: string; receivesPriceBroadcast: boolean }): Promise<void> {
  await authorize('sales.dealer.manage', undefined, 'updateDealerAccount');
  const user = await requireUser();
  const d = await prisma.dealerAccount.findFirst({ where: { id: dealerAccountId, customer: await orgWhere() }, include: DEALER_INCLUDE });
  if (!d) throw new DealerError('This dealer account is not available.');
  const fields = cleanDealerFields(input);
  await prisma.dealerAccount.update({ where: { id: d.id }, data: { ...fields, receivesPriceBroadcast: Boolean(input.receivesPriceBroadcast) } });
  await audit(user.id, d.id, 'updated', { customerName: d.customer.fullName, changes: { channel: { from: d.channel, to: fields.channel }, tier: { from: d.tier, to: fields.tier }, territory: { from: d.territory, to: fields.territory }, receivesPriceBroadcast: { from: d.receivesPriceBroadcast, to: Boolean(input.receivesPriceBroadcast) } } });
}

/** Credit limit and days (Finance). A limit above zero lets the dealer buy on credit. */
export async function setDealerCredit(dealerAccountId: string, input: { creditLimit: number; creditDays: number }): Promise<void> {
  await authorize('finance.credit.manage', undefined, 'setDealerCredit', 'Only Finance (credit control) can set credit terms.');
  const user = await requireUser();
  const d = await prisma.dealerAccount.findFirst({ where: { id: dealerAccountId, customer: await orgWhere() }, include: DEALER_INCLUDE });
  if (!d) throw new DealerError('This dealer account is not available.');
  const creditLimit = round2(Number(input.creditLimit) || 0);
  const creditDays = Math.round(Number(input.creditDays) || 0);
  if (creditLimit < 0 || creditDays < 0) throw new DealerError('Credit limit and days cannot be negative.');
  if (creditLimit > 0 && creditDays === 0) throw new DealerError('Give the dealer credit days (e.g. 30) when setting a credit limit.');
  await prisma.dealerAccount.update({ where: { id: d.id }, data: { creditLimit, creditDays } });
  await audit(user.id, d.id, 'credit_set', { customerName: d.customer.fullName, changes: { creditLimit: { from: Number(d.creditLimit), to: creditLimit }, creditDays: { from: d.creditDays, to: creditDays } } });
}

/** Put the account on hold: no credit sales until it is released. */
export async function holdDealer(dealerAccountId: string, reason: string): Promise<void> {
  await refuseDuringAssist('holdDealer');
  await authorize('finance.credit.manage', undefined, 'holdDealer', 'Only Finance (credit control) can hold a dealer account.');
  const user = await requireUser();
  const d = await prisma.dealerAccount.findFirst({ where: { id: dealerAccountId, customer: await orgWhere() }, include: DEALER_INCLUDE });
  if (!d) throw new DealerError('This dealer account is not available.');
  const why = reason.trim().slice(0, 300);
  if (!why) throw new DealerError('Say why the account is on hold.');
  if (d.onHold) throw new DealerError('This account is already on hold.');
  await prisma.dealerAccount.update({ where: { id: d.id }, data: { onHold: true, holdReason: why } });
  await audit(user.id, d.id, 'held', { customerName: d.customer.fullName, reason: why });
}

/** Lift the hold (Finance). */
export async function releaseDealerHold(dealerAccountId: string): Promise<void> {
  await refuseDuringAssist('releaseDealerHold');
  await authorize('finance.credit.manage', undefined, 'releaseDealerHold', 'Only Finance (credit control) can release a hold.');
  const user = await requireUser();
  const d = await prisma.dealerAccount.findFirst({ where: { id: dealerAccountId, customer: await orgWhere() }, include: DEALER_INCLUDE });
  if (!d) throw new DealerError('This dealer account is not available.');
  if (!d.onHold) throw new DealerError('This account is not on hold.');
  await prisma.dealerAccount.update({ where: { id: d.id }, data: { onHold: false, holdReason: null } });
  await audit(user.id, d.id, 'hold_released', { customerName: d.customer.fullName, previousReason: d.holdReason });
}

/** The audit trail of one dealer account, with actor names. */
export async function getDealerAuditTrail(dealerAccountId: string) {
  await requireUser();
  const visibleId = (await prisma.dealerAccount.findFirst({ where: { id: dealerAccountId, customer: await orgWhere() }, select: { id: true } }))?.id ?? '__no_access__';
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'DealerAccount', entityId: visibleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null }));
}

/** What the viewer may do on the dealer pages (one round of checks for the page). */
export async function getDealerRights(): Promise<{ manage: boolean; credit: boolean }> {
  const [manage, credit] = await Promise.all([allows('sales.dealer.manage'), allows('finance.credit.manage')]);
  return { manage, credit };
}
