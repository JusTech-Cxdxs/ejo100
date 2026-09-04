import { notFound } from 'next/navigation';
import { getExternalProcurementRequest } from '@/lib/actions/sourcing';
import { listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import {
  approveExternalProcurementRequestFormAction,
  disburseExternalProcurementRequestFormAction,
  rejectExternalProcurementRequestFormAction,
  addExternalProcurementSupplementaryLineFormAction,
  removeExternalProcurementSupplementaryLineFormAction,
  sendExternalProcurementToManagerFormAction,
} from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const STATUS_LABEL: Record<string, string> = {
  PENDING_FINANCE_REVIEW: 'Awaiting Finance review',
  PENDING_MANAGER_APPROVAL: 'Awaiting Manager approval',
  APPROVED: 'Approved — awaiting disbursement',
  DISBURSED: 'Disbursed',
  REJECTED: 'Rejected',
};

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

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

  // The real running total as it stands right now — the technician's
  // own original figure plus every real supplementary line Finance has
  // added so far. Shown throughout review, but never itself the
  // number that gets locked in — that only happens once, explicitly,
  // at the Manager's own approval (request.approvedTotal below).
  const supplementaryTotal = request.supplementaryLines.reduce(
    (sum: number, line: (typeof request.supplementaryLines)[number]) => sum + Number(line.amount),
    0,
  );
  const runningTotal = Number(request.estimatedAmount) + supplementaryTotal;

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
      {status === 'line_added' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Line added." />
        </div>
      ) : null}
      {status === 'line_removed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Line removed." />
        </div>
      ) : null}
      {status === 'sent_to_manager' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Sent to the Manager for approval." />
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
              Technician&apos;s original figure — locked, never edited: <span className="font-medium">{formatNaira(Number(request.estimatedAmount))}</span>
            </p>

            {request.supplementaryLines.length > 0 ? (
              <div className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">Finance&apos;s supplementary lines</p>
                <div className="space-y-1.5">
                  {request.supplementaryLines.map((line: (typeof request.supplementaryLines)[number]) => (
                    <div key={line.id} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ejo-text)]">
                        {line.description} <span className="text-[var(--ejo-text-muted)]">— added by {line.addedBy.fullName}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--ejo-text)]">{formatNaira(Number(line.amount))}</span>
                        {request.status === 'PENDING_FINANCE_REVIEW' && isEligibleFinance ? (
                          <form action={removeExternalProcurementSupplementaryLineFormAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className="text-[var(--ejo-error)] hover:underline">
                              Remove
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="mt-3 border-t border-[var(--ejo-border)] pt-3 text-sm text-[var(--ejo-text)]">
              {request.approvedTotal !== null ? (
                <>
                  Approved total — locked at Manager approval: <span className="font-medium">{formatNaira(Number(request.approvedTotal))}</span>
                </>
              ) : (
                <>
                  Running total so far: <span className="font-medium">{formatNaira(runningTotal)}</span>
                </>
              )}
              {request.disbursedAmount !== null ? (
                <>
                  {' '}
                  · Disbursed: <span className="font-medium">{formatNaira(Number(request.disbursedAmount))}</span>
                </>
              ) : null}
            </p>
          </div>

          {request.status === 'PENDING_FINANCE_REVIEW' && isEligibleFinance ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Finance Review</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Add any real supplementary cost (transport, logistics) — the technician&apos;s own figure above can never be changed here, only added to.
              </p>
              <form action={addExternalProcurementSupplementaryLineFormAction} className="mt-3 flex flex-wrap items-end gap-2">
                <FormPendingOverlay />
                <input type="hidden" name="requestId" value={request.id} />
                <div className="flex-1" style={{ minWidth: '160px' }}>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Description</label>
                  <input
                    name="description"
                    required
                    placeholder="e.g. Transport, Logistics"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Amount</label>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
                <SubmitButton label="Add Line" pendingLabel="Adding…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
              </form>

              <div className="mt-4 grid gap-3 border-t border-[var(--ejo-border)] pt-4 sm:grid-cols-2">
                <form action={sendExternalProcurementToManagerFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="jobCardId" value={request.jobCard.id} />
                  <SubmitButton
                    label="Send to Manager"
                    pendingLabel="Sending…"
                    className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                  />
                </form>
                <form action={rejectExternalProcurementRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="jobCardId" value={request.jobCard.id} />
                  <textarea name="reason" required rows={1} placeholder="Reason for rejection" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-2 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </form>
              </div>
            </div>
          ) : null}

          {request.status === 'PENDING_MANAGER_APPROVAL' && isEligibleManager ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Manager Approval</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Approving the full combined total of {formatNaira(runningTotal)} — the technician&apos;s own {formatNaira(Number(request.estimatedAmount))} plus Finance&apos;s {formatNaira(supplementaryTotal)} in supplementary costs.
              </p>
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
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Disbursing the approved {formatNaira(Number(request.approvedTotal ?? 0))} — locked at approval, not editable here. Only how it was paid gets recorded now.
              </p>
              <form action={disburseExternalProcurementRequestFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="jobCardId" value={request.jobCard.id} />
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Payment Method</label>
                  <input
                    name="paymentMethod"
                    required
                    list="payment-method-suggestions"
                    placeholder="e.g. Cash, Transfer"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                  <datalist id="payment-method-suggestions">
                    <option value="Cash" />
                    <option value="Transfer" />
                    <option value="Cheque" />
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Payment Reference (optional — bank/transaction ref for a transfer)</label>
                  <input
                    name="paymentReference"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Notes (optional)</label>
                  <textarea
                    name="disbursementNotes"
                    rows={2}
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
            {request.financeReviewedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Sent to Manager by Finance</dt>
                <dd className="text-[var(--ejo-text)]">{request.financeReviewedBy.fullName} · {request.financeReviewedAt ? new Date(request.financeReviewedAt).toLocaleString('en-NG') : ''}</dd>
              </div>
            ) : null}
            {request.managerApprovedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Manager Approved</dt>
                <dd className="text-[var(--ejo-text)]">{request.managerApprovedBy.fullName} · {request.managerApprovedAt ? new Date(request.managerApprovedAt).toLocaleString('en-NG') : ''}</dd>
              </div>
            ) : null}
            {request.disbursedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Disbursed</dt>
                <dd className="text-[var(--ejo-text)]">
                  {request.disbursedBy.fullName} · {request.disbursedAt ? new Date(request.disbursedAt).toLocaleString('en-NG') : ''}
                  {request.paymentMethod ? <><br />via {request.paymentMethod}{request.paymentReference ? ` — ${request.paymentReference}` : ''}</> : null}
                </dd>
              </div>
            ) : null}
            {request.rejectedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-error)]">Rejected ({request.rejectionStage === 'FINANCE_REVIEW' ? 'Finance Review' : 'Manager Approval'})</dt>
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
