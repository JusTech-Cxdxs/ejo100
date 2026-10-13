import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { guardAnyPage, allows } from '@/lib/authz/server';
import { listAllRefunds } from '@/lib/actions/refunds';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { PageHeader } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Refunds register: every refund paid to a customer, with its printable receipt. */
export default async function RefundsRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { q } = await searchParams;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const refunds = await listAllRefunds(q);
  const total = refunds.reduce((s: number, r: (typeof refunds)[number]) => s + Number(r.amount), 0);
  const cash = refunds.filter((r: (typeof refunds)[number]) => r.method === 'CASH').reduce((s: number, r: (typeof refunds)[number]) => s + Number(r.amount), 0);

  return (
    <div className="p-8">
      <PageHeader
        icon="refund"
        back={{ href: "/workshop", label: "Back to Workshop" }}
        title="Refunds"
        description={<>Refunds paid to customers after a cancelled Job Card or Vehicle Service. A Manager authorises each refund;
        Finance pays and records it, with an RF receipt.</>}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
          <p className="text-xs text-[var(--ejo-text-muted)]">Refunds{q ? ' (matching search)' : ''}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{refunds.length}</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
          <p className="text-xs text-[var(--ejo-text-muted)]">Total refunded</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{naira(total)}</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
          <p className="text-xs text-[var(--ejo-text-muted)]">Cash / Bank transfer</p>
          <p className="mt-1 text-lg font-bold text-[var(--ejo-text)]">
            {naira(cash)} / {naira(total - cash)}
          </p>
        </div>
      </div>

      <form className="mb-4 flex gap-2" action="/workshop/refunds">
        <LiveSearchInput
          type="search" name="q"
          defaultValue={q ?? ''}
          placeholder="Search by RF number, Job Card / Service number, customer or recipient…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
          Search
        </button>
      </form>

      {refunds.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">{q ? 'No refunds match this search.' : 'No refunds have been recorded yet.'}</p>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Receipt</th>
                <th className="px-3 py-2">For</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Paid by / Received by</th>
                <th className="px-3 py-2">Refunded by (Finance)</th>
                <th className="px-3 py-2 text-right">Print</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r: (typeof refunds)[number]) => {
                const record = r.jobCard
                  ? { href: `/workshop/job-cards/${r.jobCard.id}#refunds`, label: `Job Card ${r.jobCard.jobNumber}`, customer: r.jobCard.customer.fullName, customerId: r.jobCard.customer.id }
                  : r.vehicleService
                    ? { href: `/workshop/vehicle-service/${r.vehicleService.id}#refunds`, label: `Vehicle Service ${r.vehicleService.serviceNumber}`, customer: r.vehicleService.customer.fullName, customerId: r.vehicleService.customer.id }
                    : null;
                return (
                  <tr key={r.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--ejo-text)]">{r.referenceNumber}</td>
                    <td data-label="For" className="px-3 py-2">
                      {record ? (
                        <LoadingLink href={record.href} className="text-[var(--ejo-primary)] hover:underline">
                          {record.label}
                        </LoadingLink>
                      ) : (
                        '—'
                      )}
                      <div className="text-xs text-[var(--ejo-text-muted)]">{r.reason}</div>
                    </td>
                    <td data-label="Customer" className="px-3 py-2 text-[var(--ejo-text)]">{record ? <CustomerLink id={record.customerId} name={record.customer} canView={canSeeCustomers} /> : '—'}</td>
                    <td data-label="Amount" className="px-3 py-2 text-right font-medium text-[var(--ejo-text)]">{naira(Number(r.amount))}</td>
                    <td data-label="Paid by / Received by" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                      {r.method === 'CASH' ? 'Cash' : 'Bank Transfer'} → {r.paidToName}
                      {r.notes ? <div>Ref: {r.notes}</div> : null}
                    </td>
                    <td data-label="Refunded by (Finance)" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                      {r.recordedBy.fullName}
                      <div>{formatDateTime(r.recordedAt)}</div>
                    </td>
                    <td data-actions className="px-3 py-2 text-right">
                      <PrintMenu orgHref={`/print/refunds/${r.id}`} clientHref={`/print/refunds/${r.id}?variant=client`} clientLabel="Customer Copy" size="compact" align="right" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
      {refunds.length >= 200 ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Showing the latest {pluralize(200, 'refund')} — search to narrow down.</p> : null}
    </div>
  );
}
