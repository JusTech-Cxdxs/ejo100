import { guardAnyPage } from '@/lib/authz/server';
import { listShipments } from '@/lib/actions/procurement';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip } from '@/components/ui';
import { SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_TONE, SHIPMENT_STEPS, shipmentOverdue, type ShipmentStatus } from '@/lib/procurement-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, amount, day } from '@/components/warehouse/forms';

/** Shipments and imports: containers and airfreight from booking to the warehouse. */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/shipments');
  const { status, error } = await searchParams;
  const current = status ?? 'open';
  const rows = await listShipments(current);
  const tabs = [{ value: 'open', label: 'On the way' }, ...SHIPMENT_STEPS.map((s) => ({ value: s, label: SHIPMENT_STATUS_LABEL[s] })), { value: '', label: 'All' }];
  return (
    <div className="p-8">
      <PageHeader icon="truck" back={{ href: '/procurement', label: 'Back to Procurement' }} title="Shipments" description="Booked → in transit → arrived at port → customs → cleared → delivered to the warehouse, with dates and duty paid. Shipments are added from their purchase order." />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => <LoadingLink key={t.value} href={`/procurement/shipments?status=${t.value}`} className={`rounded-full border px-3 py-1 text-xs ${current === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {rows.length === 0 ? <EmptyState icon="truck" title="No shipments here.">Book one from a <LoadingLink href="/procurement/orders?status=open" className={LINK}>purchase order</LoadingLink>.</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Shipment</th><th className={TH}>Order · supplier</th><th className={TH}>Mode · carrier</th><th className={TH}>ETD → ETA</th><th className={TH}>Duty paid</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {rows.map((sh) => {
                const late = shipmentOverdue({ status: sh.status as ShipmentStatus, eta: sh.eta });
                return (
                  <tr key={sh.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={`${TD} font-medium`}><LoadingLink href={`/procurement/shipments/${sh.id}`} className={LINK}>{sh.number}</LoadingLink>{sh.reference ? <span className="block text-xs text-[var(--ejo-text-muted)]">{sh.reference}</span> : null}</td>
                    <td data-label="Order · supplier" className={TD}><LoadingLink href={`/procurement/orders/${sh.purchaseOrder.id}`} className={LINK}>{sh.purchaseOrder.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{sh.purchaseOrder.supplier.name}</span></td>
                    <td data-label="Mode · carrier" className={TD_MUTED}>{sh.mode.toLowerCase()}{sh.carrier ? ` · ${sh.carrier}` : ''}{sh.containerNumbers ? <span className="block text-xs">{sh.containerNumbers}</span> : null}</td>
                    <td data-label="ETD → ETA" className={late ? `${TD} text-[var(--ejo-error)]` : TD_MUTED}>{sh.etd ? day(sh.etd) : '—'} → {sh.eta ? day(sh.eta) : '—'}{late ? ' · overdue' : ''}</td>
                    <td data-label="Duty paid" className={TD_MUTED}>{sh.dutyPaid !== null ? amount(sh.dutyPaid) : '—'}</td>
                    <td data-label="Status" className={TD}><StatusChip status={sh.status} label={SHIPMENT_STATUS_LABEL[sh.status as ShipmentStatus]} tone={SHIPMENT_STATUS_TONE[sh.status as ShipmentStatus]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
