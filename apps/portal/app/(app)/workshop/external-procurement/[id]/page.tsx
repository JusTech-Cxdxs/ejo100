import { notFound } from 'next/navigation';
import { getExternalProcurementRequest } from '@/lib/actions/sourcing';
import { listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import {
  approveExternalProcurementRequestFormAction,
  disburseExternalProcurementRequestFormAction,
  rejectExternalProcurementRequestFormAction,
} from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const STATUS_LABEL: Record<string, string> = {
  PENDING_MANAGER_APPROVAL: 'Awaiting Manager approval',
  APPROVED: 'Approved — awaiting disbursement',
  DISBURSED: 'Disbursed',
  REJECTED: 'Rejected',
};

export default async function ExternalProcurementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, status } = await searchParams;
  const request = await getExternalProcurementRequest(id);
  if (!request) notFound();

  const [isMasterAdmin, viewerId, eligibleManagers, eligibleFinance] = await Promise.all([
    currentUserIsMasterAdmin(),
    currentUserId(),
    listEligibleManagersForBranch(request.branchId),
    listEligibleFinanceOfficersForBranch(request.branchId),
  ]);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleFinance = isMasterAdmin || eligibleFinance.supervisors.some((m: { id: string }) => m.id === viewerId);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/external-procurement" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to External Procurement
      </LoadingLink>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{request.referenceNumber}</h1>
        <span className="rounded-full bg-[var(--ejo-info)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-info)]">
          {STATUS_LABEL[request.status] ?? request.status}
        </span>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Job Card{' '}
        <LoadingLink href={`/workshop/job-cards/${request.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">
          {request.jobCard.jobNumber}
        </LoadingLink>{' '}
        — requested by {request.requestedBy.fullName}
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'approved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Approved — now awaiting Finance disbursement." />
        </div>
      ) : null}
      {status === 'disbursed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Disbursed." />
        </div>
      ) : null}
      {status === 'rejected' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Rejected." />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <p className="mt-2 text-sm text-[var(--ejo-text)]">{request.description}</p>
            {request.estimateLineItem ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">From estimate: {request.estimateLineItem.description}</p> : null}
            <p className="mt-3 text-sm text-[var(--ejo-text)]">
              Estimated: <span className="font-medium">₦{Number(request.estimatedAmount).toLocaleString('en-NG')}</span>
              {request.disbursedAmount !== null ? (
                <>
                  {' '}
                  · Disbursed: <span className="font-medium">₦{Number(request.disbursedAmount).toLocaleString('en-NG')}</span>
                </>
              ) : null}
            </p>
          </div>

          {request.status === 'PENDING_MANAGER_APPROVAL' && isEligibleManager ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Manager Approval</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <form action={approveExternalProcurementRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="jobCardId" value={request.jobCard.id} />
                  <textarea name="notes" rows={2} placeholder="Notes (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Approve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90" />
                </form>
                <form action={rejectExternalProcurementRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="jobCardId" value={request.jobCard.id} />
                  <textarea name="reason" required rows={2} placeholder="Reason for rejection" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-2 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </form>
              </div>
            </div>
          ) : null}

          {request.status === 'APPROVED' && isEligibleFinance ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Finance Disbursement</h2>
              <form action={disburseExternalProcurementRequestFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="jobCardId" value={request.jobCard.id} />
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Amount Actually Disbursed</label>
                  <input
                    name="disbursedAmount"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={Number(request.estimatedAmount)}
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
                <SubmitButton label="Disburse" pendingLabel="Disbursing…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
              </form>
            </div>
          ) : null}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Timeline</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Requested</dt>
              <dd className="text-[var(--ejo-text)]">{request.requestedBy.fullName} · {new Date(request.createdAt).toLocaleString('en-NG')}</dd>
            </div>
            {request.managerApprovedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Manager Approved</dt>
                <dd className="text-[var(--ejo-text)]">{request.managerApprovedBy.fullName} · {request.managerApprovedAt ? new Date(request.managerApprovedAt).toLocaleString('en-NG') : ''}</dd>
              </div>
            ) : null}
            {request.disbursedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Disbursed</dt>
                <dd className="text-[var(--ejo-text)]">{request.disbursedBy.fullName} · {request.disbursedAt ? new Date(request.disbursedAt).toLocaleString('en-NG') : ''}</dd>
              </div>
            ) : null}
            {request.rejectedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-error)]">Rejected</dt>
                <dd className="text-[var(--ejo-text)]">{request.rejectedBy.fullName} · {request.rejectedAt ? new Date(request.rejectedAt).toLocaleString('en-NG') : ''}</dd>
                <dd className="mt-1 text-xs text-[var(--ejo-text-muted)]">{request.rejectionReason}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}
