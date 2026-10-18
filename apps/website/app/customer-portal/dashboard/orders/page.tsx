import { requireCustomer } from '@/lib/customer-portal/session';
import { loadOrders, orderStatusForCustomer, type OrderItem } from '@/lib/customer-portal/zinox-data';
import { fmtDate, naira } from '@/lib/customer-portal/format';
import { Badge, Card, EmptyState, KeyValue, PageHero, SectionTitle } from '@/components/customer/ui';
import { Icon } from '@/components/customer/Icon';
import { PaymentProofForm } from '@/components/customer/zinox/forms';
import type { Tone } from '@/lib/customer-portal/status';

export const metadata = { title: 'Orders' };

const PAY_TONE: Record<string, Tone> = { PENDING: 'attention', CONFIRMED: 'success', REJECTED: 'danger' };
const DOC_TONE: Record<string, Tone> = { ISSUED: 'info', PAID: 'success', EXPIRED: 'neutral', CANCELLED: 'danger', EXPORTED: 'success' };

function OrderCard({ o, delay }: { o: OrderItem; delay: number }) {
  const st = orderStatusForCustomer(o.status);
  return (
    <Card as="article" className="ejo-rise p-4 sm:p-5" delay={delay}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--ejo-text)]">{o.number}</p>
          <p className="text-xs text-[var(--ejo-text-muted)]">Placed {fmtDate(o.createdAt)}{o.customerReference ? ` · your ref ${o.customerReference}` : ''} · {o.paymentTerms === 'CREDIT' ? 'on credit terms' : 'prepaid'}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <ul className="mt-3 divide-y divide-[var(--ejo-border)] text-sm">
        {o.lines.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 flex-1 text-[var(--ejo-text)]">{l.description}<span className="text-xs text-[var(--ejo-text-muted)]"> × {l.quantity}{l.fulfilled ? ` (${l.fulfilled} delivered)` : ''}</span></span>
            <span className="shrink-0 text-[var(--ejo-text)]">{naira(l.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KeyValue label="Order total">{naira(o.money.total)}</KeyValue>
        <KeyValue label="Confirmed paid">{naira(o.money.paid)}</KeyValue>
        <KeyValue label="Awaiting confirmation">{naira(o.money.pending)}</KeyValue>
        <KeyValue label="Outstanding">{naira(o.money.outstanding)}</KeyValue>
      </div>
      {o.proFormas.length || o.invoices.length ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {o.proFormas.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-2.5 py-1 text-[var(--ejo-text)]"><Icon name="receipt" size={12} /> Pro-forma {p.number} · {naira(p.total)}{p.dueDate ? ` · due ${fmtDate(p.dueDate)}` : ''} <Badge tone={DOC_TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Badge></span>)}
          {o.invoices.map((i) => <span key={i.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-2.5 py-1 text-[var(--ejo-text)]"><Icon name="receipt" size={12} /> Invoice {i.number} · {naira(i.total)} · {fmtDate(i.issuedAt)}</span>)}
        </div>
      ) : null}
      {o.payments.length ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--ejo-text-muted)]">
          {o.payments.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2"><span className="text-[var(--ejo-text)]">{naira(p.amount)}</span> · {p.method.toLowerCase().replace('_', ' ')} · {fmtDate(p.paidAt)}{p.reference ? ` · ref ${p.reference}` : ''}{p.mine ? ' · sent by you' : ''} <Badge tone={PAY_TONE[p.status] ?? 'neutral'}>{p.status === 'PENDING' ? 'being confirmed' : p.status.toLowerCase()}</Badge></li>)}
        </ul>
      ) : null}
      {o.dispatches.length ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--ejo-text-muted)]">
          {o.dispatches.map((d) => <li key={d.number} className="inline-flex items-center gap-1"><Icon name="route" size={13} /> {d.number} dispatched {fmtDate(d.dispatchedAt)}{d.waybill ? ` · waybill ${d.waybill}` : ''}{d.deliveredAt ? ` · delivered ${fmtDate(d.deliveredAt)}` : ''}</li>)}
        </ul>
      ) : null}
      {o.deliveryAddress ? <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Deliver to: {o.deliveryAddress}</p> : null}
      {o.canUploadProof ? <div className="mt-4"><PaymentProofForm orderId={o.id} orderNumber={o.number} outstanding={o.money.outstanding} /></div> : null}
    </Card>
  );
}

/** The customer's sales orders: status, pro-forma invoices, payments (and proof uploads), invoices and dispatches. */
export default async function OrdersPage() {
  const me = await requireCustomer();
  const orders = await loadOrders(me.id);
  const open = orders.filter((o) => !['DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(o.status));
  const past = orders.filter((o) => ['DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(o.status));
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Orders" icon="receipt" title="Your orders" subtitle="Each order with its pro-forma invoice, what you have paid, and where it is. Paid by transfer? Send the proof here and Finance confirms it." />
      {orders.length === 0 ? <EmptyState icon="receipt" title="No orders yet" text="Orders you place with our sales team appear here with their pro-forma invoice and progress." /> : null}
      {open.length ? <section><SectionTitle icon="clock" title={`In progress (${open.length})`} /><div className="space-y-4">{open.map((o, i) => <OrderCard key={o.id} o={o} delay={Math.min(i, 8) * 40} />)}</div></section> : null}
      {past.length ? <section><SectionTitle icon="check" title={`Delivered and closed (${past.length})`} /><div className="space-y-4">{past.map((o, i) => <OrderCard key={o.id} o={o} delay={Math.min(i, 8) * 40} />)}</div></section> : null}
    </div>
  );
}
