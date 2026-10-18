import { allows, guardAnyPage } from '@/lib/authz/server';
import { listTransfers } from '@/lib/actions/warehouse';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, HeaderAction } from '@/components/ui';
import { TRANSFER_STATUS_LABEL, type TransferStatus } from '@/lib/warehouse-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, day } from '@/components/warehouse/forms';

const TABS: { value: string; label: string }[] = [{ value: '', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'DISPATCHED', label: 'On the way' }, { value: 'RECEIVED', label: 'Received' }, { value: 'CANCELLED', label: 'Cancelled' }];

/** Stock transfers between locations and branches. */
export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/transfers');
  const { status, error } = await searchParams;
  const [transfers, canFg] = await Promise.all([listTransfers(status), allows('warehouse.fg.operate')]);
  return (
    <div className="p-8">
      <PageHeader icon="road" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Stock transfers" description="Units moved between locations; a transfer to another branch is approved by the Warehouse Manager, dispatched by the sender and received by the other side." actions={canFg ? <HeaderAction href="/warehouse/transfers/new">New transfer</HeaderAction> : null} />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <LoadingLink key={t.value} href={`/warehouse/transfers${t.value ? `?status=${t.value}` : ''}`} className={`rounded-full border px-3 py-1 text-xs ${(status ?? '') === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {transfers.length === 0 ? <EmptyState icon="road" title="No transfers here.">{canFg ? <LoadingLink href="/warehouse/transfers/new" className={LINK}>Start one</LoadingLink> : null}</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Transfer</th><th className={TH}>From</th><th className={TH}>To</th><th className={TH}>Units</th><th className={TH}>Status</th><th className={TH}>Raised</th></tr></thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/warehouse/transfers/${t.id}`} className={LINK}>{t.number}</LoadingLink>{t.reason ? <span className="block text-xs text-[var(--ejo-text-muted)]">{t.reason}</span> : null}</td>
                  <td data-label="From" className={TD_MUTED}>{t.fromLocation.name}<span className="block text-xs">{t.fromLocation.branch.name}</span></td>
                  <td data-label="To" className={TD_MUTED}>{t.toLocation.name}<span className="block text-xs">{t.toLocation.branch.name}</span></td>
                  <td data-label="Units" className={TD}>{t._count.lines}</td>
                  <td data-label="Status" className={TD}><StatusChip status={t.status} label={TRANSFER_STATUS_LABEL[t.status as TransferStatus]} /></td>
                  <td data-label="Raised" className={TD_MUTED}>{day(t.createdAt)} · {t.requestedBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
