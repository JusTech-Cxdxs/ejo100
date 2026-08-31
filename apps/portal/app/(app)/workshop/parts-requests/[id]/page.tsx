import { notFound } from 'next/navigation';
import { getPartRequestSlip } from '@/lib/actions/sourcing';
import { listEligibleManagersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import { listEligibleStoreManagersForBranch, listEligibleStoreOfficersForBranch } from '@/lib/actions/store';
import {
  approvePartRequestSlipByHodFormAction,
  approvePartRequestSlipByStoreFormAction,
  releasePartRequestSlipFormAction,
  rejectPartRequestSlipFormAction,
} from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

export default async function PartRequestSlipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, status } = await searchParams;
  const slip = await getPartRequestSlip(id);
  if (!slip) notFound();

  const [isMasterAdmin, viewerId, eligibleManagers, eligibleStoreManagers, eligibleStoreOfficers] = await Promise.all([
    currentUserIsMasterAdmin(),
    currentUserId(),
    listEligibleManagersForBranch(slip.branchId),
    listEligibleStoreManagersForBranch(slip.branchId),
    listEligibleStoreOfficersForBranch(slip.branchId),
  ]);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleStoreStaff =
    isMasterAdmin ||
    eligibleStoreManagers.staff.some((s) => s.id === viewerId) ||
    eligibleStoreOfficers.staff.some((s) => s.id === viewerId);
  const serializedLines = slip.lines.filter((l: (typeof slip.lines)[number]) => l.part.trackingType === 'SERIALIZED');

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/parts-requests" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Parts Requests
      </LoadingLink>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{slip.referenceNumber}</h1>
        <span className="rounded-full bg-[var(--ejo-info)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-info)]">
          {STATUS_LABEL[slip.status] ?? slip.status}
        </span>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Job Card{' '}
        <LoadingLink href={`/workshop/job-cards/${slip.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">
          {slip.jobCard.jobNumber}
        </LoadingLink>{' '}
        — requested by {slip.requestedBy.fullName}
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'hod_approved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Approved — now awaiting Store." />
        </div>
      ) : null}
      {status === 'store_approved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Approved and stock reserved — now ready for release." />
        </div>
      ) : null}
      {status === 'released' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Released." />
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
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Lines</h2>
            <div className="mt-3 space-y-2">
              {slip.lines.map((line: (typeof slip.lines)[number]) => (
                <div key={line.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3 text-sm">
                  <p className="font-medium text-[var(--ejo-text)]">{line.part.name}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    Requested: {Number(line.quantityRequested)} {line.part.baseUnitOfMeasure}
                    {line.quantityReleased !== null ? ` · Released: ${Number(line.quantityReleased)} ${line.part.baseUnitOfMeasure}` : ''}
                  </p>
                  {line.estimateLineItem ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">From estimate: {line.estimateLineItem.description}</p> : null}
                </div>
              ))}
            </div>
          </div>

          {slip.status === 'PENDING_HOD_APPROVAL' && isEligibleManager ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Workshop HOD Approval</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <form action={approvePartRequestSlipByHodFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard.id} />
                  <textarea name="notes" rows={2} placeholder="Notes (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Approve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90" />
                </form>
                <form action={rejectPartRequestSlipFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard.id} />
                  <textarea name="reason" required rows={2} placeholder="Reason for rejection" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-2 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </form>
              </div>
            </div>
          ) : null}

          {slip.status === 'PENDING_STORE_APPROVAL' && isEligibleStoreStaff ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Store Approval</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Approving reserves this stock immediately.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <form action={approvePartRequestSlipByStoreFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard.id} />
                  <textarea name="notes" rows={2} placeholder="Notes (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Approve & Reserve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90" />
                </form>
                <form action={rejectPartRequestSlipFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard.id} />
                  <textarea name="reason" required rows={2} placeholder="Reason for rejection" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-2 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </form>
              </div>
            </div>
          ) : null}

          {slip.status === 'APPROVED' && isEligibleStoreStaff ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Release</h2>
              <form action={releasePartRequestSlipFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="slipId" value={slip.id} />
                <input type="hidden" name="jobCardId" value={slip.jobCard.id} />
                {serializedLines.map((line: (typeof slip.lines)[number]) => (
                  <input key={line.id} type="hidden" name="serializedLineId" value={line.id} />
                ))}
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Received By (name)</label>
                  <input
                    name="receivedByName"
                    placeholder="e.g. the technician, an intern, or whoever is physically collecting this"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
                {serializedLines.map((line: (typeof slip.lines)[number]) => (
                  <div key={line.id}>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">
                      Serial numbers for {line.part.name} ({Number(line.quantityRequested)} needed)
                    </label>
                    <div className="space-y-1.5">
                      {Array.from({ length: Number(line.quantityRequested) }).map((_, i) => (
                        <input
                          key={i}
                          name={`serials_${line.id}`}
                          required
                          placeholder={`Serial ${i + 1}`}
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <SubmitButton label="Release" pendingLabel="Releasing…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
              </form>
            </div>
          ) : null}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Timeline</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Requested</dt>
              <dd className="text-[var(--ejo-text)]">{slip.requestedBy.fullName} · {new Date(slip.createdAt).toLocaleString('en-NG')}</dd>
            </div>
            {slip.hodApprovedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">HOD Approved</dt>
                <dd className="text-[var(--ejo-text)]">{slip.hodApprovedBy.fullName} · {slip.hodApprovedAt ? new Date(slip.hodApprovedAt).toLocaleString('en-NG') : ''}</dd>
              </div>
            ) : null}
            {slip.storeApprovedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Store Approved</dt>
                <dd className="text-[var(--ejo-text)]">{slip.storeApprovedBy.fullName} · {slip.storeApprovedAt ? new Date(slip.storeApprovedAt).toLocaleString('en-NG') : ''}</dd>
              </div>
            ) : null}
            {slip.releasedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Released</dt>
                <dd className="text-[var(--ejo-text)]">
                  {slip.releasedBy.fullName} · {slip.releasedAt ? new Date(slip.releasedAt).toLocaleString('en-NG') : ''}
                  {slip.receivedByUser ? <> · Received by {slip.receivedByUser.fullName}</> : slip.receivedByName ? <> · Received by {slip.receivedByName}</> : null}
                </dd>
              </div>
            ) : null}
            {slip.rejectedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-error)]">Rejected ({slip.rejectionStage})</dt>
                <dd className="text-[var(--ejo-text)]">
                  {slip.rejectedBy.fullName} · {slip.rejectedAt ? new Date(slip.rejectedAt).toLocaleString('en-NG') : ''}
                </dd>
                <dd className="mt-1 text-xs text-[var(--ejo-text-muted)]">{slip.rejectionReason}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}
