import { allows, guardAnyPage } from '@/lib/authz/server';
import { getSalesHome } from '@/lib/actions/sales';
import { OrgTrail } from '@/components/OrgTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, NavCard, StatTile, SectionCard, EmptyState, StatusChip, ResponsiveTable, type IconName } from '@/components/ui';
import { naira, QUOTATION_STATUS_LABEL, ORDER_STATUS_LABEL, CHANNEL_LABEL, type QuotationStatus, type OrderStatus } from '@/lib/sales-core';

const sections: { name: string; href: string; desc: string; icon: IconName; needs?: 'quote' | 'finance' | 'dealers' | 'pricing' }[] = [
  { name: 'Quotations', href: '/sales/quotations', icon: 'file', desc: 'Price a configuration for a customer from their channel\'s price list; discounts beyond 5% go for approval.' },
  { name: 'Sales orders', href: '/sales/orders', icon: 'receipt', desc: 'Accepted quotations: pro-forma invoices, payments, Finance clearance and release to the warehouse.' },
  { name: 'Payments', href: '/sales/payments', icon: 'money', desc: 'Payments recorded against orders, waiting for Finance to confirm; export for the finance system.' },
  { name: 'Returns', href: '/sales/returns', icon: 'refund', desc: 'Dead-on-arrival or wrong items: approved by the Sales Manager, received into quarantine.' },
  { name: 'Dealers', href: '/sales/dealers', icon: 'handshake', desc: 'Dealer and distributor accounts: tier, territory, credit limit and hold, statement.' },
  { name: 'Price lists', href: '/sales/price-lists', icon: 'tag', desc: 'Retail, dealer tier, corporate and distributor prices; the daily dealer price broadcast.' },
];

/** Sales home: today's quotations, orders awaiting payment, what Finance has cleared, revenue this month by channel. */
export default async function SalesHomePage() {
  await guardAnyPage(['sales.view'], '/sales');
  const [home, canFinance] = await Promise.all([getSalesHome(), allows('finance.payment.confirm')]);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="receipt"
        eyebrow="Module · Sales"
        title="Sales"
        description={<>Order to cash: quotation, sales order, pro-forma invoice, payment, release, invoice. <span className="block text-xs"><OrgTrail area="Sales" /></span></>}
      />

      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon="file" label="Quotations today" value={home.quotesToday} href="/sales/quotations" tone="brand" />
        <StatTile icon="file" label="Quotations open" value={home.quotesOpen} hint="Draft, awaiting a discount decision or with the customer" href="/sales/quotations" tone="info" />
        <StatTile icon="clock" label="Awaiting payment" value={home.awaiting} href="/sales/orders?status=AWAITING_PAYMENT" tone={home.awaiting ? 'warning' : 'neutral'} />
        <StatTile icon="check-circle" label="Cleared for release" value={home.cleared} hint="With the line or the store" href="/sales/orders?status=READY" tone="success" />
        <StatTile icon="money" label="Payments to confirm" value={home.pendingPayments} href="/sales/payments" tone={home.pendingPayments ? 'warning' : 'neutral'} />
        <StatTile icon="money" label="Revenue this month" value={naira(home.revenueThisMonth)} hint="Payments confirmed by Finance" href="/sales/payments?status=CONFIRMED" tone="success" />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <SectionCard icon="file" title="Today's quotations" flush>
          {home.recentQuotes.length === 0 ? <EmptyState compact icon="file" title="No quotations yet today">Start one from Quotations.</EmptyState> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {home.recentQuotes.map((q: (typeof home.recentQuotes)[number]) => (
                <li key={q.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span><LoadingLink href={`/sales/quotations/${q.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{q.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{q.customer.fullName} · {naira(Number(q.total))}</span></span>
                  <StatusChip status={q.status} label={QUOTATION_STATUS_LABEL[q.status as QuotationStatus]} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard icon="receipt" title="Orders in progress" description="Awaiting payment, paid, or cleared" flush>
          {home.recentOrders.length === 0 ? <EmptyState compact icon="receipt" title="No open orders">Convert an accepted quotation to start one.</EmptyState> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {home.recentOrders.map((o: (typeof home.recentOrders)[number]) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span><LoadingLink href={`/sales/orders/${o.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{o.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{o.customer.fullName} · {naira(Number(o.amountPaid))} of {naira(Number(o.total))} paid</span></span>
                  <StatusChip status={o.status} label={ORDER_STATUS_LABEL[o.status as OrderStatus]} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard icon="chart" title="Revenue this month by channel" description="Payments confirmed by Finance, Lagos time" flush>
          {home.revenue.length === 0 ? <EmptyState compact icon="money" title="Nothing confirmed yet this month">{canFinance ? 'Confirm pending payments on the Payments page.' : 'Finance confirms payments as they land.'}</EmptyState> : (
            <ResponsiveTable>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Channel</th><th className="px-4 py-2 text-right">Confirmed</th></tr></thead>
                <tbody>
                  {home.revenue.map((r) => (
                    <tr key={r.channel} className="border-b border-[var(--ejo-border)] last:border-0"><td data-label="Channel" className="px-4 py-2 text-[var(--ejo-text)]">{CHANNEL_LABEL[r.channel] ?? r.channel}</td><td data-label="Confirmed" className="px-4 py-2 text-right font-medium text-[var(--ejo-text)]">{naira(r.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </SectionCard>
      </div>

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} badge={s.href === '/sales/payments' && home.pendingPayments ? home.pendingPayments : s.href === '/sales/returns' && home.returnsOpen ? home.returnsOpen : undefined} />
        ))}
      </div>
    </div>
  );
}
