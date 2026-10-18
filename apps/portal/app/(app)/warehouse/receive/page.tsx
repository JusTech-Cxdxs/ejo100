import { allows, guardAnyPage } from '@/lib/authz/server';
import { listReceivablePurchaseOrders, listFgLocations } from '@/lib/actions/warehouse';
import { receiveFinishedUnitsFormAction } from '@/lib/actions/warehouse-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, SectionCard, StatusChip } from '@/components/ui';
import { PO_STATUS_LABEL, PO_STATUS_TONE, type PurchaseOrderStatus } from '@/lib/procurement-core';
import { Banners, BTN, CARD, INPUT, LABEL, LINK, day } from '@/components/warehouse/forms';

/** Book imported finished products (tablets, monitors, iPower, iTEC) into a location by serial, against a purchase order line. */
export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ order?: string; status?: string; error?: string; count?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/receive');
  const { order, status, error, count } = await searchParams;
  const [orders, locations, canFg, canProcurement] = await Promise.all([listReceivablePurchaseOrders(), listFgLocations(), allows('warehouse.fg.operate'), allows('procurement.view')]);
  const selected = orders.find((o) => o.id === order) ?? null;
  const BANNER: Record<string, string> = { received: `${count ?? ''} ${count === '1' ? 'unit' : 'units'} received into stock.`.trim() };
  return (
    <div className="p-8">
      <PageHeader icon="download" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Receive finished products" description="Imported products arrive against a purchase order: paste the serials and choose where they go. Components are received in the Components store." />
      <Banners status={status} error={error} map={BANNER} />
      {!canFg ? <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">Finished goods staff receive units; you can see what is expected.</p> : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard icon="cart" title="Expected" description="Purchase orders with finished products still outstanding.">
          {orders.length === 0 ? <EmptyState compact icon="cart" title="Nothing outstanding.">{canProcurement ? <LoadingLink href="/procurement/orders" className={LINK}>Purchase orders</LoadingLink> : null}</EmptyState> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {orders.map((o) => (
                <li key={o.id} className={`py-2 ${o.id === selected?.id ? 'font-semibold' : ''}`}>
                  <LoadingLink href={`/warehouse/receive?order=${o.id}`} className={LINK}>{o.number}</LoadingLink>
                  <span className="ml-2"><StatusChip status={o.status} label={PO_STATUS_LABEL[o.status as PurchaseOrderStatus]} tone={PO_STATUS_TONE[o.status as PurchaseOrderStatus]} /></span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{o.supplier.name} · {o.lines.reduce((s, l) => s + l.remaining, 0)} outstanding{o.expectedDate ? ` · expected ${day(o.expectedDate)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div>
          {!selected ? (
            <EmptyState icon="download" title="Choose a purchase order">Pick an order on the left to receive its products.</EmptyState>
          ) : (
            <div className="space-y-4">
              <div className={CARD}>
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{selected.number} — {selected.supplier.name}</h2>
                <p className="text-xs text-[var(--ejo-text-muted)]">{canProcurement ? <LoadingLink href={`/procurement/orders/${selected.id}`} className={LINK}>Open the purchase order</LoadingLink> : null}</p>
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="text-left text-xs text-[var(--ejo-text-muted)]"><th className="py-1">Product</th><th className="py-1 text-right">Ordered</th><th className="py-1 text-right">Received</th><th className="py-1 text-right">Outstanding</th></tr></thead>
                  <tbody>{selected.lines.map((l) => <tr key={l.id} className="border-t border-[var(--ejo-border)]"><td className="py-1">{l.product?.name ?? l.description}<span className="block text-xs text-[var(--ejo-text-muted)]">{l.product?.sku}</span></td><td className="py-1 text-right">{l.quantity}</td><td className="py-1 text-right">{l.receivedQuantity}</td><td className="py-1 text-right font-semibold">{l.remaining}</td></tr>)}</tbody>
                </table>
              </div>
              {canFg ? (
                <form action={receiveFinishedUnitsFormAction} className={`${CARD} relative space-y-4`}>
                  <FormPendingOverlay />
                  <input type="hidden" name="purchaseOrderId" value={selected.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={LABEL}>Order line
                      <select name="purchaseOrderLineId" required className={`${INPUT} mt-1`}>
                        {selected.lines.filter((l) => l.remaining > 0).map((l) => <option key={l.id} value={l.id}>{l.product?.name ?? l.description} — {l.remaining} outstanding{l.product && !l.product.serialised ? ' (by quantity)' : ''}</option>)}
                      </select>
                    </label>
                    <label className={LABEL}>Into location
                      <select name="locationId" required className={`${INPUT} mt-1`}>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.branch.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className={LABEL}>Serial numbers — one per line
                    <textarea name="serials" rows={8} className={`${INPUT} mt-1 font-mono`} placeholder={'ZNX26TB0000101\nZNX26TB0000102'} />
                  </label>
                  <label className={LABEL}>Quantity (only for products tracked by quantity, not serial)
                    <input name="quantity" type="number" min="1" step="1" className={`${INPUT} mt-1 max-w-xs`} />
                  </label>
                  <SubmitButton label="Receive units" pendingLabel="Receiving…" className={BTN} />
                  <p className="text-xs text-[var(--ejo-text-muted)]">Each serial is booked once; a serial already on record is refused. Incoming QC for components is recorded under <LoadingLink href="/warehouse/incoming-qc" className={LINK}>Incoming QC</LoadingLink>.</p>
                </form>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
