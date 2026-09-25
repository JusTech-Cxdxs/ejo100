import { listAllRefunds } from '@/lib/actions/refunds';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Refunds register — every refund paid back to a customer, like the
 * Parts Requests list: the RF receipt, the Job Card or Vehicle Service it
 * belongs to, the customer, amount and method, who received the money,
 * who in Finance refunded it and when, and its printable receipt.
 */
export default async function RefundsRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const refunds = await listAllRefunds(q);
  const total = refunds.reduce((s: number, r: (typeof refunds)[number]) => s + Number(r.amount), 0);
  const cash = refunds.filter((r: (typeof refunds)[number]) => r.method === 'CASH').reduce((s: number, r: (typeof refunds)[number]) => s + Number(r.amount), 0);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Workshop
      </LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Refunds</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        Every refund paid back to a customer after a cancelled Job Card or Vehicle Service — authorised by a Manager&apos;s approval,
        paid and recorded by Finance, each with its own RF receipt.
      </p>

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
        <input
          type="search"
          name="q"
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
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
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
                  ? { href: `/workshop/job-cards/${r.jobCard.id}#refunds`, label: `Job Card ${r.jobCard.jobNumber}`, customer: r.jobCard.customer.fullName }
                  : r.vehicleService
                    ? { href: `/workshop/vehicle-service/${r.vehicleService.id}#refunds`, label: `Vehicle Service ${r.vehicleService.serviceNumber}`, customer: r.vehicleService.customer.fullName }
                    : null;
                return (
                  <tr key={r.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--ejo-text)]">{r.referenceNumber}</td>
                    <td className="px-3 py-2">
                      {record ? (
                        <LoadingLink href={record.href} className="text-[var(--ejo-primary)] hover:underline">
                          {record.label}
                        </LoadingLink>
                      ) : (
                        '—'
                      )}
                      <div className="text-xs text-[var(--ejo-text-muted)]">{r.reason}</div>
                    </td>
                    <td className="px-3 py-2 text-[var(--ejo-text)]">{record?.customer ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-[var(--ejo-text)]">{naira(Number(r.amount))}</td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                      {r.method === 'CASH' ? 'Cash' : 'Bank Transfer'} → {r.paidToName}
                      {r.notes ? <div>Ref: {r.notes}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                      {r.recordedBy.fullName}
                      <div>{formatDateTime(r.recordedAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <PrintMenu orgHref={`/print/refunds/${r.id}`} clientHref={`/print/refunds/${r.id}?variant=client`} clientLabel="Customer Copy" size="compact" align="right" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {refunds.length >= 200 ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Showing the latest {pluralize(200, 'refund')} — search to narrow down.</p> : null}
    </div>
  );
}
