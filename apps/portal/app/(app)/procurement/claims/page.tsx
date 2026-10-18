import { allows, guardAnyPage } from '@/lib/authz/server';
import { listSupplierClaims } from '@/lib/actions/procurement';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, HeaderAction } from '@/components/ui';
import { CLAIM_STATUS_LABEL, type SupplierClaimStatus } from '@/lib/procurement-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, amount, day } from '@/components/warehouse/forms';

const TABS: { value: string; label: string }[] = [{ value: 'open', label: 'Open' }, { value: 'SENT', label: 'With the supplier' }, { value: 'ACCEPTED', label: 'Accepted' }, { value: 'SETTLED', label: 'Settled' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }];

/** Supplier claims: shortages, damage and component failures charged back. */
export default async function SupplierClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/claims');
  const { status, error } = await searchParams;
  const current = status ?? 'open';
  const [rows, canManage] = await Promise.all([listSupplierClaims(current), allows('procurement.po.manage')]);
  return (
    <div className="p-8">
      <PageHeader icon="alert" back={{ href: '/procurement', label: 'Back to Procurement' }} title="Supplier claims" description="Raised from a short or damaged delivery, a failed incoming QC or a component failure under warranty; sent to the supplier, accepted or rejected, then settled by credit note, refund or replacement." actions={canManage ? <HeaderAction href="/procurement/claims/new">New claim</HeaderAction> : null} />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <LoadingLink key={t.value} href={`/procurement/claims?status=${t.value}`} className={`rounded-full border px-3 py-1 text-xs ${current === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {rows.length === 0 ? <EmptyState icon="alert" title="No claims here.">{canManage ? <LoadingLink href="/procurement/claims/new" className={LINK}>Raise one</LoadingLink> : null}</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Claim</th><th className={TH}>Supplier</th><th className={TH}>What happened</th><th className={TH}>Amount</th><th className={TH}>Order</th><th className={TH}>Status</th><th className={TH}>Raised</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/procurement/claims/${c.id}`} className={LINK}>{c.number}</LoadingLink></td>
                  <td data-label="Supplier" className={TD}><LoadingLink href={`/procurement/suppliers/${c.supplier.id}`} className={LINK}>{c.supplier.name}</LoadingLink></td>
                  <td data-label="What happened" className={TD_MUTED}>{c.description.slice(0, 90)}</td>
                  <td data-label="Amount" className={TD}>{amount(c.amount, c.currency)}</td>
                  <td data-label="Order" className={TD_MUTED}>{c.purchaseOrder ? <LoadingLink href={`/procurement/orders/${c.purchaseOrder.id}`} className={LINK}>{c.purchaseOrder.number}</LoadingLink> : '—'}</td>
                  <td data-label="Status" className={TD}><StatusChip status={c.status} label={CLAIM_STATUS_LABEL[c.status as SupplierClaimStatus]} />{c.reference ? <span className="block text-xs text-[var(--ejo-text-muted)]">{c.reference}</span> : null}</td>
                  <td data-label="Raised" className={TD_MUTED}>{day(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
