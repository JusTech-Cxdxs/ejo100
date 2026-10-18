import { guardAnyPage } from '@/lib/authz/server';
import { listReleases } from '@/lib/actions/warehouse';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip } from '@/components/ui';
import { RELEASE_STATUS_LABEL, type ReleaseStatus } from '@/lib/warehouse-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, day, humanise } from '@/components/warehouse/forms';

const TABS: { value: string; label: string }[] = [{ value: '', label: 'Open' }, { value: 'ISSUED', label: 'Waiting to pick' }, { value: 'PICKED', label: 'Picked' }, { value: 'RELEASED', label: 'Released' }, { value: 'CANCELLED', label: 'Cancelled' }];

/** Goods release notes: orders Finance has cleared, waiting for the warehouse to pick, release and dispatch. */
export default async function ReleasesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/releases');
  const { status, error } = await searchParams;
  const releases = await listReleases(status);
  return (
    <div className="p-8">
      <PageHeader icon="clipboard" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Goods release notes" description="Issued when Finance confirms payment or credit. The warehouse picks the serials, releases the goods and hands them to dispatch." />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <LoadingLink key={t.value} href={`/warehouse/releases${t.value ? `?status=${t.value}` : ''}`} className={`rounded-full border px-3 py-1 text-xs ${(status ?? '') === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {releases.length === 0 ? <EmptyState icon="clipboard" title="No release notes here.">They appear when Finance clears a sales order.</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Release note</th><th className={TH}>Sales order</th><th className={TH}>Customer</th><th className={TH}>Lines picked</th><th className={TH}>Status</th><th className={TH}>Issued</th><th className={TH}>Dispatch</th></tr></thead>
            <tbody>
              {releases.map((r) => {
                const serialised = r.lines.filter((l) => l.salesOrderLine.product.serialised);
                const picked = serialised.filter((l) => l.finishedUnitId).length;
                return (
                  <tr key={r.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={`${TD} font-medium`}><LoadingLink href={`/warehouse/releases/${r.id}`} className={LINK}>{r.number}</LoadingLink></td>
                    <td data-label="Sales order" className={TD_MUTED}>{r.salesOrder.number}<span className="block text-xs">{humanise(r.salesOrder.channel)}</span></td>
                    <td data-label="Customer" className={TD}>{r.salesOrder.customer.fullName}</td>
                    <td data-label="Lines picked" className={TD}>{picked} / {serialised.length}{r.lines.length > serialised.length ? <span className="block text-xs text-[var(--ejo-text-muted)]">+ {r.lines.length - serialised.length} by quantity</span> : null}</td>
                    <td data-label="Status" className={TD}><StatusChip status={r.status} label={RELEASE_STATUS_LABEL[r.status as ReleaseStatus]} /></td>
                    <td data-label="Issued" className={TD_MUTED}>{day(r.issuedAt)}</td>
                    <td data-label="Dispatch" className={TD_MUTED}>{r.dispatch ? <LoadingLink href={`/warehouse/dispatches/${r.dispatch.id}`} className={LINK}>{r.dispatch.number}</LoadingLink> : r.status === 'RELEASED' ? <LoadingLink href={`/warehouse/dispatches/new?release=${r.id}`} className={LINK}>Dispatch</LoadingLink> : '—'}</td>
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
