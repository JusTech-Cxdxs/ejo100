/**
 * Sales: quotation and sales order status, dealer prices and today's sales,
 * for anyone with Sales open (sales.view). Records are read through the
 * module's own fenced readers (reachWhere on the branch; price lists and
 * dealers through orgWhere), so a tool never shows more than the pages do.
 */
import { allows, orgWhere, reachWhere } from '@/lib/authz/server';
import { prisma } from '@ejo/database';
import { listQuotations, listSalesOrders, getSalesHome } from '@/lib/actions/sales';
import { resolvePrice } from '@/lib/pricing-core';
import { QUOTATION_STATUS_LABEL, ORDER_STATUS_LABEL, TIER_LABEL, CHANNEL_LABEL, type QuotationStatus, type OrderStatus } from '@/lib/sales-core';
import { money, nothing, ok, refused, text, day } from '../tool-helpers';
import type { StaffTool } from '../types';

const SALES_WHO = 'Sales is open to sales staff, Billing, Finance, the warehouse and management.';

export const salesTools: StaffTool[] = [
  {
    name: 'quotation_status',
    kind: 'read',
    status: 'Checking quotations…',
    description:
      'Find quotations by number (QTE-…) or customer name: status (draft, awaiting discount approval, sent, accepted, converted), total, valid-until date, who prepared it and the sales order it became, with links.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A quotation number like QTE-2026-000012, or a customer\'s name.', minLength: 2, maxLength: 80 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('sales.view'))) return refused(SALES_WHO);
      const q = text(args.query, 80);
      const rows = (await listQuotations({ q, take: 8 })) as Awaited<ReturnType<typeof listQuotations>>;
      if (!rows.length) return nothing('No quotation in this person\'s reach matches that.');
      const out = rows.map((x) => ({ number: x.number, customer: x.customer.fullName, status: QUOTATION_STATUS_LABEL[x.status as QuotationStatus] ?? x.status, channel: CHANNEL_LABEL[x.channel] ?? x.channel, total: money(x.total), validUntil: day(x.validUntil), preparedBy: x.preparedBy.fullName, lines: x._count.lines, salesOrder: x.salesOrder?.number ?? null, href: `/sales/quotations/${x.id}` }));
      return ok({ quotations: out }, out.slice(0, 3).map((r) => ({ label: r.number, href: r.href })));
    },
  },
  {
    name: 'order_status',
    kind: 'read',
    status: 'Checking sales orders…',
    description:
      'Find sales orders by number (SO-…) or customer name: stage (awaiting payment, paid, in production, ready, released, dispatched, delivered, invoiced), total, amount paid and balance, payment terms, with links.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A sales order number like SO-2026-000045, or a customer\'s name.', minLength: 2, maxLength: 80 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('sales.view'))) return refused(SALES_WHO);
      const q = text(args.query, 80);
      const rows = (await listSalesOrders({ q, take: 8 })) as Awaited<ReturnType<typeof listSalesOrders>>;
      if (!rows.length) return nothing('No sales order in this person\'s reach matches that.');
      const out = rows.map((o) => ({ number: o.number, customer: o.customer.fullName, status: ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status, channel: CHANNEL_LABEL[o.channel] ?? o.channel, terms: o.paymentTerms.toLowerCase(), total: money(o.total), paid: money(o.amountPaid), balance: Math.max(0, money(Number(o.total) - Number(o.amountPaid))), confirmedOn: day(o.createdAt), releaseNotes: o._count.releases, href: `/sales/orders/${o.id}` }));
      return ok({ orders: out }, out.slice(0, 3).map((r) => ({ label: r.number, href: r.href })));
    },
  },
  {
    name: 'dealer_price',
    kind: 'read',
    status: 'Looking up dealer prices…',
    description:
      'The price of a product on the ACTIVE dealer price lists, per tier (Tier 1, 2, 3), plus the retail list when one is active — in Naira per unit before VAT. Say when a product is not priced for a tier.',
    parameters: {
      type: 'object',
      properties: { product: { type: 'string', description: 'Product name or SKU, e.g. "Prestige Pro2" or "ZNX-LAP-001".', minLength: 2, maxLength: 80 } },
      required: ['product'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('sales.view'))) return refused(SALES_WHO);
      const q = text(args.product, 80);
      const org = await orgWhere();
      const products = await prisma.product.findMany({ where: { ...org, isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] }, orderBy: { name: 'asc' }, take: 5, select: { id: true, name: true, sku: true, configurations: { where: { isActive: true }, select: { id: true, name: true } } } });
      if (!products.length) return nothing('No product in the catalogue matches that.');
      const lists = await prisma.priceList.findMany({ where: { ...org, status: 'ACTIVE', channel: { in: ['DEALER', 'RETAIL'] } }, select: { id: true, name: true, channel: true, tier: true, items: { select: { productId: true, configurationId: true, unitPrice: true, minQuantity: true } } } });
      if (!lists.length) return nothing('No dealer or retail price list is active yet.');
      const out = products.map((p) => ({
        product: p.name, sku: p.sku,
        prices: lists.map((l) => {
          const items = l.items.map((i) => ({ productId: i.productId, configurationId: i.configurationId, unitPrice: Number(i.unitPrice), minQuantity: i.minQuantity }));
          const base = resolvePrice(items, { productId: p.id });
          const configs = p.configurations.map((c) => ({ configuration: c.name, unitPrice: resolvePrice(items, { productId: p.id, configurationId: c.id })?.unitPrice ?? null })).filter((c) => c.unitPrice !== null);
          return { list: l.name, channel: l.channel === 'DEALER' ? `Dealer ${l.tier ? TIER_LABEL[l.tier] : ''}`.trim() : 'Retail', unitPrice: base ? money(base.unitPrice) : null, configurations: configs.map((c) => ({ ...c, unitPrice: money(c.unitPrice) })), href: `/sales/price-lists/${l.id}` };
        }),
      }));
      return ok({ products: out, note: 'Prices per unit before VAT (7.5%); a null price means the list does not price that product.' }, lists.slice(0, 3).map((l) => ({ label: l.name, href: `/sales/price-lists/${l.id}` })));
    },
  },
  {
    name: 'sales_today',
    kind: 'read',
    status: 'Adding up today\'s sales…',
    description:
      'Today\'s sales picture for this person\'s reach: quotations prepared today, quotations open, orders awaiting payment, orders cleared for release, payments waiting for Finance, open returns, and revenue confirmed this month by channel.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('sales.view'))) return refused(SALES_WHO);
      const reach = await reachWhere('sales.view');
      const home = await getSalesHome();
      const confirmedToday = await prisma.salesPayment.aggregate({ where: { salesOrder: reach, status: 'CONFIRMED', confirmedAt: { gte: new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`) } }, _sum: { amount: true }, _count: true });
      return ok({
        quotationsToday: home.quotesToday, quotationsOpen: home.quotesOpen, ordersAwaitingPayment: home.awaiting, ordersClearedForRelease: home.cleared, paymentsToConfirm: home.pendingPayments, returnsOpen: home.returnsOpen,
        paymentsConfirmedToday: { count: confirmedToday._count, amount: money(confirmedToday._sum.amount) },
        revenueThisMonth: money(home.revenueThisMonth), revenueByChannel: home.revenue.map((r) => ({ channel: CHANNEL_LABEL[r.channel] ?? r.channel, amount: money(r.amount) })),
        recentQuotations: home.recentQuotes.map((x) => ({ number: x.number, customer: x.customer.fullName, status: QUOTATION_STATUS_LABEL[x.status as QuotationStatus] ?? x.status, total: money(x.total), href: `/sales/quotations/${x.id}` })),
      }, [{ label: 'Sales', href: '/sales' }, { label: 'Payments', href: '/sales/payments' }]);
    },
  },
];
