import { guardAnyPage } from '@/lib/authz/server';
import { listDispatches } from '@/lib/actions/warehouse';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip } from '@/components/ui';
import { DISPATCH_STATUS_LABEL, type DispatchStatus } from '@/lib/warehouse-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, when } from '@/components/warehouse/forms';

const TABS: { value: string; label: string }[] = [{ value: '', label: 'All' }, { value: 'DISPATCHED', label: 'On the road' }, { value: 'DELIVERED', label: 'Delivered' }, { value: 'FAILED', label: 'Not delivered' }];

/** Dispatches: what left the warehouse, with whom, and whether the customer signed for it. */
export default async function DispatchesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/dispatches');
  const { status, error } = await searchParams;
  const dispatches = await listDispatches(status);
  return (
    <div className="p-8">
      <PageHeader icon="truck" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Dispatches" description="Released goods on their way: vehicle, driver and waybill, then the customer's signature on delivery. The gate records the vehicle leaving." />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <LoadingLink key={t.value} href={`/warehouse/dispatches${t.value ? `?status=${t.value}` : ''}`} className={`rounded-full border px-3 py-1 text-xs ${(status ?? '') === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {dispatches.length === 0 ? <EmptyState icon="truck" title="No dispatches here.">A dispatch is recorded from a released <LoadingLink href="/warehouse/releases?status=RELEASED" className={LINK}>goods release note</LoadingLink>.</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Dispatch</th><th className={TH}>Order · customer</th><th className={TH}>Units</th><th className={TH}>Vehicle · driver</th><th className={TH}>Status</th><th className={TH}>Left</th><th className={TH}>Delivered</th></tr></thead>
            <tbody>
              {dispatches.map((d) => (
                <tr key={d.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/warehouse/dispatches/${d.id}`} className={LINK}>{d.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{d.releaseNote.number}</span></td>
                  <td data-label="Order" className={TD}>{d.salesOrder.number}<span className="block text-xs text-[var(--ejo-text-muted)]">{d.salesOrder.customer.fullName}</span></td>
                  <td data-label="Units" className={TD}>{d._count.units}</td>
                  <td data-label="Vehicle · driver" className={TD_MUTED}>{[d.vehiclePlate, d.driverName, d.carrier].filter(Boolean).join(' · ') || '—'}{d.waybill ? <span className="block text-xs">Waybill {d.waybill}</span> : null}</td>
                  <td data-label="Status" className={TD}><StatusChip status={d.status} label={DISPATCH_STATUS_LABEL[d.status as DispatchStatus]} tone={d.status === 'DISPATCHED' ? 'info' : d.status === 'DELIVERED' ? 'success' : 'error'} /></td>
                  <td data-label="Left" className={TD_MUTED}>{when(d.dispatchedAt)}</td>
                  <td data-label="Delivered" className={TD_MUTED}>{d.deliveredAt ? `${when(d.deliveredAt)}${d.receivedByName ? ` · ${d.receivedByName}` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
