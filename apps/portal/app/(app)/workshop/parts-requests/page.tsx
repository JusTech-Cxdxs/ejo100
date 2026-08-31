import { listPartRequestSlips } from '@/lib/actions/sourcing';
import { getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  PENDING_STORE_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  APPROVED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  RELEASED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/**
 * Every Parts Request Slip raised across this branch's Job Cards —
 * Workshop HOD, Store, and Storekeeper all work from this same list,
 * each seeing the action relevant to whichever stage a given slip is
 * actually at once they open it.
 */
export default async function PartsRequestsPage() {
  const branchId = await getStoreBranchId();
  const slips = await listPartRequestSlips(branchId);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Workshop
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Parts Requests</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">Every Store Parts request raised across active Job Cards.</p>

      {slips.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">No parts requests raised yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Job Card</th>
                <th className="px-4 py-2">Requested By</th>
                <th className="px-4 py-2">Lines</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip: (typeof slips)[number]) => (
                <tr key={slip.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2">
                    <LoadingLink href={`/workshop/parts-requests/${slip.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {slip.referenceNumber}
                    </LoadingLink>
                  </td>
                  <td className="px-4 py-2 text-[var(--ejo-text)]">{slip.jobCard.jobNumber}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{slip.requestedBy.fullName}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{pluralize(slip.lines.length, 'line')}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[slip.status] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
                      {STATUS_LABEL[slip.status] ?? slip.status}
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
