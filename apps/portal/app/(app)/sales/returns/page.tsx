import { guardAnyPage } from '@/lib/authz/server';
import { listSalesReturns } from '@/lib/actions/sales';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PageHeader, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';
import { RETURN_STATUS_LABEL, RETURN_RESOLUTION_LABEL, type ReturnStatus } from '@/lib/sales-core';
import { CHIP } from '@/components/sales/ui';

const STATUSES: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'RESOLVED', 'REJECTED'];

/** Returns (RMA): requested by Sales, approved by the Sales Manager, received into quarantine, resolved. */
export default async function SalesReturnsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { status: rawStatus, error } = await searchParams;
  const filter = STATUSES.includes(rawStatus as ReturnStatus) ? (rawStatus as ReturnStatus) : null;
  const returns = await listSalesReturns();
  const shown = filter ? returns.filter((r: (typeof returns)[number]) => r.status === filter) : returns;
  const count = (s: ReturnStatus) => returns.filter((r: (typeof returns)[number]) => r.status === s).length;
  return (
    <div className="p-8">
      <PageHeader icon="refund" back={{ href: '/sales', label: 'Back to Sales' }} title="Returns" description="Dead-on-arrival or wrong items. Sales requests the return from the order, the Sales Manager approves it, the unit comes back into quarantine, and the outcome (replacement, refund, credit note or repair) is recorded." />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href="/sales/returns" className={CHIP(!filter)}>All ({returns.length})</LoadingLink>
        {STATUSES.map((s) => <LoadingLink key={s} href={`/sales/returns?status=${s}`} className={CHIP(filter === s)}>{RETURN_STATUS_LABEL[s]} ({count(s)})</LoadingLink>)}
      </div>
      {shown.length === 0 ? <EmptyState icon="refund" title={returns.length === 0 ? 'No returns yet' : 'No returns in this view'}>Returns are requested from a sales order once goods have been released.</EmptyState> : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-3 py-2">Return</th><th className="px-3 py-2">Order · customer</th><th className="px-3 py-2">Serial</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>
              {shown.map((r: (typeof returns)[number]) => (
                <tr key={r.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/sales/returns/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</LoadingLink></td>
                  <td data-label="Order" className="px-3 py-2 text-[var(--ejo-text)]"><LoadingLink href={`/sales/orders/${r.salesOrder.id}`} className="hover:underline">{r.salesOrder.number}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{r.salesOrder.customer.fullName}</div></td>
                  <td data-label="Serial" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{r.finishedUnit ? `${r.finishedUnit.serialNumber} · ${r.finishedUnit.product.name}` : '—'}</td>
                  <td data-label="Reason" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{r.reason.slice(0, 120)}{r.resolution ? <div className="text-[var(--ejo-text-muted)]">{RETURN_RESOLUTION_LABEL[r.resolution]}</div> : null}</td>
                  <td data-label="Requested" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(r.createdAt)}</td>
                  <td data-label="Status" className="px-3 py-2"><StatusChip status={r.status} label={RETURN_STATUS_LABEL[r.status as ReturnStatus]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
