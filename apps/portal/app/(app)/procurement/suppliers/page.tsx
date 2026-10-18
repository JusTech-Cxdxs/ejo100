import { allows, guardAnyPage } from '@/lib/authz/server';
import { listSuppliers } from '@/lib/actions/procurement';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, HeaderAction } from '@/components/ui';
import { Banners, INPUT, LINK, TABLE_WRAP, TD, TD_MUTED, TH } from '@/components/warehouse/forms';

/** Suppliers at home and abroad. */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/suppliers');
  const { q, status, error } = await searchParams;
  const [suppliers, canManage] = await Promise.all([listSuppliers(q), allows('procurement.po.manage')]);
  return (
    <div className="p-8">
      <PageHeader icon="handshake" back={{ href: '/procurement', label: 'Back to Procurement' }} title="Suppliers" description="Who we buy components and finished products from, with their currency, terms and lead time." actions={canManage ? <HeaderAction href="/procurement/suppliers/new">Add supplier</HeaderAction> : null} />
      <Banners status={status} error={error} map={{ deactivated: 'Supplier switched off.' }} />
      <form method="get" className="mb-4 max-w-md"><LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search by name, country or contact…" className={INPUT} aria-label="Search suppliers" /></form>
      {suppliers.length === 0 ? <EmptyState icon="handshake" title={q ? 'No supplier matches.' : 'No suppliers yet.'}>{canManage && !q ? <LoadingLink href="/procurement/suppliers/new" className={LINK}>Add the first supplier</LoadingLink> : null}</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Supplier</th><th className={TH}>Country · currency</th><th className={TH}>Contact</th><th className={TH}>Lead time</th><th className={TH}>Open orders</th><th className={TH}>Open claims</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/procurement/suppliers/${s.id}`} className={LINK}>{s.name}</LoadingLink></td>
                  <td data-label="Country · currency" className={TD_MUTED}>{[s.country, s.currency].filter(Boolean).join(' · ')}</td>
                  <td data-label="Contact" className={TD_MUTED}>{[s.contactName, s.email, s.phone].filter(Boolean).join(' · ') || '—'}</td>
                  <td data-label="Lead time" className={TD_MUTED}>{s.leadTimeDays !== null ? `${s.leadTimeDays} days` : '—'}</td>
                  <td data-label="Open orders" className={TD}>{s._count.purchaseOrders}</td>
                  <td data-label="Open claims" className={TD}>{s._count.claims}</td>
                  <td data-label="Status" className={TD}><StatusChip status={s.isActive ? 'ACTIVE' : 'INACTIVE'} label={s.isActive ? 'Active' : 'Inactive'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
