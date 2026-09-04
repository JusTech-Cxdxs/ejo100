import { listExternalProcurementRequests } from '@/lib/actions/sourcing';
import { getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';

const STATUS_LABEL: Record<string, string> = {
  PENDING_FINANCE_REVIEW: 'Awaiting Finance review',
  PENDING_MANAGER_APPROVAL: 'Awaiting Manager approval',
  APPROVED: 'Approved — awaiting disbursement',
  DISBURSED: 'Disbursed',
  REJECTED: 'Rejected',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_FINANCE_REVIEW: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  PENDING_MANAGER_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  APPROVED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  DISBURSED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/**
 * Every External Procurement (cash advance) request raised across this
 * branch's Job Cards — Workshop Manager and Finance both work from this
 * same list. Searchable by reference number or Job Card number.
 */
export default async function ExternalProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const branchId = await getStoreBranchId();
  const requests = await listExternalProcurementRequests(branchId, q);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Workshop
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">External Procurement</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">Cash advance requests for externally-sourced parts and jobs.</p>

      <form className="mb-6 flex gap-2" action="/workshop/external-procurement">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by reference or Job Card number…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
        {q ? (
          <LoadingLink
            href="/workshop/external-procurement"
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>

      {requests.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">{q ? 'No procurement requests match your search.' : 'No procurement requests raised yet.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Job Card</th>
                <th className="px-4 py-2">Requested By</th>
                <th className="px-4 py-2">Estimated Amount</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request: (typeof requests)[number]) => (
                <tr key={request.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2">
                    <LoadingLink href={`/workshop/external-procurement/${request.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {request.referenceNumber}
                    </LoadingLink>
                  </td>
                  <td className="px-4 py-2">
                    <LoadingLink href={`/workshop/job-cards/${request.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">
                      {request.jobCard.jobNumber}
                    </LoadingLink>
                  </td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{request.requestedBy.fullName}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text)]">₦{Number(request.estimatedAmount).toLocaleString('en-NG')}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[request.status] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
                      {STATUS_LABEL[request.status] ?? request.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
