import { listExternalProcurementRequests } from '@/lib/actions/sourcing';
import { getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';

const STATUS_LABEL: Record<string, string> = {
  PENDING_MANAGER_APPROVAL: 'Awaiting Manager approval',
  APPROVED: 'Approved — awaiting disbursement',
  DISBURSED: 'Disbursed',
  REJECTED: 'Rejected',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_MANAGER_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  APPROVED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  DISBURSED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/**
 * Every External Procurement (cash advance) request raised across this
 * branch's Job Cards — Workshop Manager and Finance both work from this
 * same list.
 */
export default async function ExternalProcurementPage() {
  const branchId = await getStoreBranchId();
  const requests = await listExternalProcurementRequests(branchId);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Workshop
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">External Procurement</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">Cash advance requests for externally-sourced parts and jobs.</p>

      {requests.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">No procurement requests raised yet.</p>
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
                  <td className="px-4 py-2 text-[var(--ejo-text)]">{request.jobCard.jobNumber}</td>
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
