import { notFound } from 'next/navigation';
import { getPartRequestSlip } from '@/lib/actions/sourcing';
import { listEligibleManagersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import { listEligibleStoreManagersForBranch, listEligibleStoreOfficersForBranch } from '@/lib/actions/store';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
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
import { PrintButton } from '@/components/PrintButton';

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The real document this whole request always was — a standard,
 * non-editable slip, exactly like a real printed store requisition:
 * who/what/where it's for at the top, every real Part in a proper
 * numbered table underneath, a real total, and a genuine approval
 * chain below that. Nothing on this page asks anyone to fill
 * anything in, because there's genuinely nothing left to decide —
 * Store already matched and priced every line back at estimate time.
 */
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
  const vehicle = slip.jobCard.vehicle;
  const vehicleSummary = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
  const totalAmount = slip.lines.reduce((sum: number, l: (typeof slip.lines)[number]) => sum + (l.estimateLineItem?.amount !== null && l.estimateLineItem?.amount !== undefined ? Number(l.estimateLineItem.amount) : 0), 0);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/parts-requests" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] print:hidden">
        ← Back to Parts Requests
      </LoadingLink>

      {error ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'hod_approved' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Approved — now awaiting Store." />
        </div>
      ) : null}
      {status === 'store_approved' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Approved and stock reserved — now ready for release." />
        </div>
      ) : null}
      {status === 'released' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Released." />
        </div>
      ) : null}
      {status === 'rejected' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Rejected." />
        </div>
      ) : null}

      {/* The real slip — printable on its own, everything else on
          this page (the approval actions, the timeline) is workflow
          UI that has no business appearing on a printed copy. */}
      <div className="max-w-4xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-8 print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ejo-border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Store Parts Request</h1>
            <p className="text-sm text-[var(--ejo-text-muted)]">{slip.referenceNumber}</p>
          </div>
          <span className="rounded-full bg-[var(--ejo-info)]/15 px-3 py-1 text-xs font-medium text-[var(--ejo-info)] print:hidden">
            {STATUS_LABEL[slip.status] ?? slip.status}
          </span>
        </div>

        <div className="grid gap-4 border-b border-[var(--ejo-border)] py-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Job Card</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">
              <LoadingLink href={`/workshop/job-cards/${slip.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline print:text-[var(--ejo-text)] print:no-underline">
                {slip.jobCard.jobNumber}
              </LoadingLink>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{slip.jobCard.customer.fullName}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Vehicle</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicleSummary}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Plate No.</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.plateNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">VIN / Chassis</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.chassisNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Date of Request</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{new Date(slip.createdAt).toLocaleString('en-NG')}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Requested By</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{slip.requestedBy.fullName}</dd>
          </div>
        </div>

        <div className="overflow-x-auto py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">S/N</th>
                <th className="px-3 py-2">Part No.</th>
                <th className="px-3 py-2">Part Name</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 print:hidden">Status</th>
              </tr>
            </thead>
            <tbody>
              {slip.lines.map((line: (typeof slip.lines)[number], i: number) => (
                <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{i + 1}</td>
                  <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{line.part.partNumber ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-[var(--ejo-text)]">{line.part.name}</td>
                  <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{line.estimateLineItem?.description ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-[var(--ejo-text)]">
                    {Number(line.quantityRequested)} {pluralizeWord(Number(line.quantityRequested), line.part.baseUnitOfMeasure)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ejo-text)]">
                    {line.estimateLineItem?.amount !== null && line.estimateLineItem?.amount !== undefined ? formatNaira(Number(line.estimateLineItem.amount)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)] print:hidden">
                    {line.quantityReleased !== null
                      ? `Released: ${Number(line.quantityReleased)} ${pluralizeWord(Number(line.quantityReleased), line.part.baseUnitOfMeasure)}`
                      : 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium text-[var(--ejo-text)]">
                <td className="px-3 py-2" colSpan={4}>
                  {pluralize(slip.lines.length, 'Part')} total
                </td>
                <td />
                <td className="px-3 py-2 text-right">{formatNaira(totalAmount)}</td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mt-6 grid max-w-4xl gap-6 lg:grid-cols-[1fr_360px] print:hidden">
        <div className="space-y-6">
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

      <PrintButton />
    </div>
  );
}
