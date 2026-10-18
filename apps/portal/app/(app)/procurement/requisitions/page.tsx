import { allows, guardAnyPage } from '@/lib/authz/server';
import { listRequisitions } from '@/lib/actions/procurement';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, HeaderAction } from '@/components/ui';
import { REQUISITION_STATUS_LABEL, requisitionEstimate, type RequisitionStatus } from '@/lib/procurement-core';
import { Banners, LINK, TABLE_WRAP, TD, TD_MUTED, TH, amount, day } from '@/components/warehouse/forms';

const TABS: { value: string; label: string }[] = [{ value: '', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'SUBMITTED', label: 'Awaiting approval' }, { value: 'APPROVED', label: 'Approved' }, { value: 'ORDERED', label: 'Ordered' }, { value: 'REJECTED', label: 'Rejected' }];

/** Purchase requisitions: what the line, the warehouse and the showroom need bought. */
export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/requisitions');
  const { status, error } = await searchParams;
  const [rows, canRaise] = await Promise.all([listRequisitions(status), allows('procurement.requisition.raise')]);
  return (
    <div className="p-8">
      <PageHeader icon="clipboard" back={{ href: '/procurement', label: 'Back to Procurement' }} title="Purchase requisitions" description="Raised from BOM shortages, reorder levels or a project; approved by the Head of Procurement, then ordered." actions={canRaise ? <HeaderAction href="/procurement/requisitions/new">New requisition</HeaderAction> : null} />
      <Banners status={undefined} error={error} map={{}} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <LoadingLink key={t.value} href={`/procurement/requisitions${t.value ? `?status=${t.value}` : ''}`} className={`rounded-full border px-3 py-1 text-xs ${(status ?? '') === t.value ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'}`}>{t.label}</LoadingLink>)}
      </div>
      {rows.length === 0 ? <EmptyState icon="clipboard" title="No requisitions here.">{canRaise ? <LoadingLink href="/procurement/requisitions/new" className={LINK}>Raise one</LoadingLink> : null}</EmptyState> : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Requisition</th><th className={TH}>Reason</th><th className={TH}>Lines</th><th className={TH}>Estimate</th><th className={TH}>Needed by</th><th className={TH}>Status</th><th className={TH}>Raised</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/procurement/requisitions/${r.id}`} className={LINK}>{r.number}</LoadingLink>{r.buildOrder ? <span className="block text-xs text-[var(--ejo-text-muted)]">for {r.buildOrder.number}</span> : null}</td>
                  <td data-label="Reason" className={TD_MUTED}>{r.reason.slice(0, 90)}</td>
                  <td data-label="Lines" className={TD}>{r._count.lines}</td>
                  <td data-label="Estimate" className={TD_MUTED}>{amount(requisitionEstimate(r.lines.map((l) => ({ quantity: Number(l.quantity), estimatedUnitCost: l.estimatedUnitCost === null ? null : Number(l.estimatedUnitCost) }))))}</td>
                  <td data-label="Needed by" className={TD_MUTED}>{r.neededBy ? day(r.neededBy) : '—'}</td>
                  <td data-label="Status" className={TD}><StatusChip status={r.status} label={REQUISITION_STATUS_LABEL[r.status as RequisitionStatus]} /></td>
                  <td data-label="Raised" className={TD_MUTED}>{day(r.createdAt)} · {r.raisedBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
