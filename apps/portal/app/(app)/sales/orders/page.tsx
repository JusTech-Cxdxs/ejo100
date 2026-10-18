import { allows, guardAnyPage } from '@/lib/authz/server';
import { listSalesOrders } from '@/lib/actions/sales';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PageHeader, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';
import { naira, ORDER_STATUS_LABEL, CHANNEL_LABEL, PAYMENT_TERMS_LABEL, type OrderStatus, type PaymentTerms } from '@/lib/sales-core';
import { CHIP, INPUT } from '@/components/sales/ui';

const FILTERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: 'AWAITING_PAYMENT', label: 'Awaiting payment', statuses: ['CONFIRMED', 'AWAITING_PAYMENT'] },
  { key: 'PAID', label: 'Paid, to clear', statuses: ['PAID'] },
  { key: 'READY', label: 'Cleared', statuses: ['IN_PRODUCTION', 'READY'] },
  { key: 'RELEASED', label: 'Released / dispatched', statuses: ['RELEASED', 'DISPATCHED'] },
  { key: 'DELIVERED', label: 'Delivered, to invoice', statuses: ['DELIVERED'] },
  { key: 'INVOICED', label: 'Invoiced / closed', statuses: ['INVOICED', 'CLOSED'] },
  { key: 'CANCELLED', label: 'Cancelled', statuses: ['CANCELLED'] },
];

/** Every sales order in reach, by stage. */
export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { q, status: rawStatus, error } = await searchParams;
  const filter = FILTERS.find((f) => f.key === rawStatus) ?? null;
  const [orders, canSeeCustomers] = await Promise.all([listSalesOrders({ q }), allows('crm.view')]);
  const shown = filter ? orders.filter((o: (typeof orders)[number]) => filter.statuses.includes(o.status as OrderStatus)) : orders;
  const count = (f: (typeof FILTERS)[number]) => orders.filter((o: (typeof orders)[number]) => f.statuses.includes(o.status as OrderStatus)).length;
  return (
    <div className="p-8">
      <PageHeader icon="receipt" back={{ href: '/sales', label: 'Back to Sales' }} title="Sales orders" description="An accepted quotation becomes a sales order. Billing issues the pro-forma invoice, Finance confirms the payment and clears the order; the warehouse picks and dispatches against the release note; Billing issues the tax invoice after delivery." />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href={`/sales/orders${q ? `?q=${encodeURIComponent(q)}` : ''}`} className={CHIP(!filter)}>All ({orders.length})</LoadingLink>
        {FILTERS.map((f) => <LoadingLink key={f.key} href={`/sales/orders?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={CHIP(filter?.key === f.key)}>{f.label} ({count(f)})</LoadingLink>)}
      </div>
      <form className="mb-4 flex gap-2" action="/sales/orders">
        {filter ? <input type="hidden" name="status" value={filter.key} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by order number, customer or reference…" className={`${INPUT} max-w-md`} />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>
      {shown.length === 0 ? (
        <EmptyState icon="receipt" title={orders.length === 0 ? 'No sales orders yet' : 'No orders in this view'}>Orders come from accepted quotations.</EmptyState>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Channel · terms</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Confirmed</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>
              {shown.map((o: (typeof orders)[number]) => (
                <tr key={o.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/sales/orders/${o.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{o.number}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{o._count.lines} {o._count.lines === 1 ? 'line' : 'lines'}{o._count.releases ? ` · ${o._count.releases} release ${o._count.releases === 1 ? 'note' : 'notes'}` : ''}</div></td>
                  <td data-label="Customer" className="px-3 py-2 text-[var(--ejo-text)]"><CustomerLink id={o.customerId} name={o.customer.fullName} canView={canSeeCustomers} /></td>
                  <td data-label="Channel" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{CHANNEL_LABEL[o.channel] ?? o.channel} · {PAYMENT_TERMS_LABEL[o.paymentTerms as PaymentTerms]}</td>
                  <td data-label="Total" className="px-3 py-2 text-right text-[var(--ejo-text)]">{naira(Number(o.total))}</td>
                  <td data-label="Paid" className={`px-3 py-2 text-right ${Number(o.amountPaid) >= Number(o.total) ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text)]'}`}>{naira(Number(o.amountPaid))}</td>
                  <td data-label="Confirmed" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(o.createdAt)} · {o.confirmedBy.fullName}</td>
                  <td data-label="Status" className="px-3 py-2"><StatusChip status={o.status} label={ORDER_STATUS_LABEL[o.status as OrderStatus]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
