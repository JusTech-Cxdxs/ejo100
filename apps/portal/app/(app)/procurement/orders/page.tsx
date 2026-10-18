import { allows, guardAnyPage } from '@/lib/authz/server';
import { listPurchaseOrders } from '@/lib/actions/procurement';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, HeaderAction } from '@/components/ui';
import { PO_STATUS_LABEL, PO_STATUS_TONE, type PurchaseOrderStatus } from '@/lib/procurement-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, amount, day } from '@/components/warehouse/forms';

const TABS: { value: string; label: string }[] = [{ value: 'open', label: 'Open' }, { value: 'DRAFT', label: 'Awaiting approval' }, { value: 'SENT', label: 'With the supplier' }, { value: 'PARTLY_RECEIVED', label: 'Partly received' }, { value: 'RECEIVED', label: 'Received' }, { value: 'CLOSED', label: 'Closed' }, { value: '', label: 'All' }];

/** Purchase orders to suppliers. */
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; supplier?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/orders');
  const { status, supplier, error } = await searchParams;
  const current = status ?? 'open';
  const [rows, canManage] = await Promise.all([listPurchaseOrders({ status: current, supplierId: supplier }), allows('procurement.po.manage')]);
  return (
    <div className="p-8">
      <PageHeader icon="cart" back={{ href: '/procurement', label: 'Back to Procurement' }} title="Purchase orders" description="Approved by the Head of Procurement, sent to the supplier, received in the warehouses." actions={canManage ? <HeaderAction href="/procurement/orders/new">New purchase order</HeaderAction> : null} />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <LoadingLink key={t.value} href={`/procurement/orders?status=${t.value}${supplier ? `&supplier=${supplier}` : ''}`} className={`rounded-full border px-3 py-1 text-xs ${current === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {rows.length === 0 ? <EmptyState icon="cart" title="No purchase orders here.">{canManage ? <LoadingLink href="/procurement/orders/new" className={LINK}>Raise one</LoadingLink> : null}</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Order</th><th className={TH}>Supplier</th><th className={TH}>Total</th><th className={TH}>Expected</th><th className={TH}>Lines · shipments · receipts</th><th className={TH}>Status</th><th className={TH}>Raised</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/procurement/orders/${o.id}`} className={LINK}>{o.number}</LoadingLink>{o.requisition ? <span className="block text-xs text-[var(--ejo-text-muted)]">from {o.requisition.number}</span> : null}</td>
                  <td data-label="Supplier" className={TD}><LoadingLink href={`/procurement/suppliers/${o.supplier.id}`} className={LINK}>{o.supplier.name}</LoadingLink></td>
                  <td data-label="Total" className={TD}>{amount(o.total, o.currency)}</td>
                  <td data-label="Expected" className={TD_MUTED}>{o.expectedDate ? day(o.expectedDate) : '—'}</td>
                  <td data-label="Lines · shipments · receipts" className={TD_MUTED}>{o._count.lines} · {o._count.shipments} · {o._count.goodsReceipts}</td>
                  <td data-label="Status" className={TD}><StatusChip status={o.status} label={PO_STATUS_LABEL[o.status as PurchaseOrderStatus]} tone={PO_STATUS_TONE[o.status as PurchaseOrderStatus]} /></td>
                  <td data-label="Raised" className={TD_MUTED}>{day(o.createdAt)} · {o.raisedBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
