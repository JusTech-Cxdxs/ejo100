import { LoadingLink } from '@/components/LoadingLink';
import { notFound } from 'next/navigation';
import { getJobCard, getJobCardAuditTrail, listTechnicianCandidates, listEligibleSupervisorsForJobCard, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import { updateJobCardStatusFormAction, assignTechnicianFormAction, deleteJobCardFormAction, approveJobCardFormAction, rejectJobCardFormAction, acceptTechnicianAssignmentFormAction, rejectTechnicianAssignmentFormAction, reassignSupervisorFormAction } from '@/lib/actions/workshop-form-handlers';
import { formatDateTime } from '@/lib/utils/format-date';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';

const ALL_STATUSES = [
  'CHECKED_IN',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'QUALITY_CHECK',
  'COMPLETED',
  'READY_FOR_COLLECTION',
  'CLOSED',
  'CANCELLED',
] as const;

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

// Falls back to the raw action string for anything not listed — future
// phases add more audit actions (assignment.*, estimate.*, etc.); this
// map only needs updating for a nicer label, never to avoid breaking.
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'job_card.created': 'Job Card created',
  'job_card.approved': 'Job Card approved',
  'job_card.rejected': 'Job Card rejected',
  'job_card.supervisor_reassigned': 'Supervisor reassigned',
  'assignment.accepted': 'Technician accepted assignment',
  'assignment.rejected': 'Technician rejected assignment',
};

export default async function JobCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [jobCard, technicians, isMasterAdmin, viewerId] = await Promise.all([
    getJobCard(id),
    listTechnicianCandidates(),
    currentUserIsMasterAdmin(),
    currentUserId(),
  ]);
  if (!jobCard) notFound();
  const [auditTrail, eligibleSupervisors] = await Promise.all([
    getJobCardAuditTrail(id),
    listEligibleSupervisorsForJobCard(id),
  ]);
  const isApprover = isMasterAdmin || jobCard.supervisor?.id === viewerId;
  const isAssignedTechnician = isMasterAdmin || jobCard.assignedTechnician?.id === viewerId;
  const isCreator = isMasterAdmin || jobCard.createdBy.id === viewerId;

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/job-cards" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← All Job Cards
      </LoadingLink>

      {error ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {status === 'job_card_created' ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="success" message="Job Card successfully created." />
        </div>
      ) : null}

      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{jobCard.jobNumber}</h1>
        <span className="rounded-full bg-[var(--ejo-primary)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-primary)]">
          {STATUS_LABEL[jobCard.status]}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            jobCard.approvalStatus === 'APPROVED'
              ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
              : jobCard.approvalStatus === 'REJECTED'
                ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
          }`}
        >
          {jobCard.approvalStatus === 'APPROVED'
            ? `Approved by ${jobCard.approvedBy?.fullName ?? 'supervisor'}`
            : jobCard.approvalStatus === 'REJECTED'
              ? `Rejected — ${jobCard.rejectionReason}`
              : 'Awaiting Supervisor Approval'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer & Vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{jobCard.customer.fullName}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Contact</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.customer.phone || jobCard.customer.email}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Vehicle</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {[jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Plate</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.plateNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Chassis / VIN</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.chassisNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Mileage at check-in</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.mileageAtCheckIn != null ? `${jobCard.mileageAtCheckIn.toLocaleString()} km` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Workshop department</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.department?.name ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Supervisor</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.supervisor?.fullName ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Assigned technician</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
                  {jobCard.technicianAcceptanceStatus ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        jobCard.technicianAcceptanceStatus === 'ACCEPTED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : jobCard.technicianAcceptanceStatus === 'REJECTED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {jobCard.technicianAcceptanceStatus === 'ACCEPTED'
                        ? 'Accepted'
                        : jobCard.technicianAcceptanceStatus === 'REJECTED'
                          ? `Rejected — ${jobCard.technicianRejectionReason}`
                          : 'Awaiting response'}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
              Complaints{jobCard.complaints.length > 1 ? ` (${jobCard.complaints.length})` : ''}
            </h2>
            {jobCard.complaints.length > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => (
                  <li key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                    <span className="shrink-0 font-medium text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span>
                    <span>{c.description}</span>
                  </li>
                ))}
              </ol>
            ) : (
              // Legacy fallback — a Job Card created before per-item complaints existed
              // only has the old single `complaint` field populated, not any related rows.
              <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.complaint}</p>
            )}
            {jobCard.diagnosis ? (
              <>
                <h2 className="mt-4 text-sm font-semibold text-[var(--ejo-text)]">Diagnosis</h2>
                <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.diagnosis}</p>
              </>
            ) : null}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-xs text-[var(--ejo-text-muted)]">
            Opened by {jobCard.createdBy.fullName} on {formatDateTime(jobCard.createdAt)}
            {jobCard.closedAt ? ` — closed ${formatDateTime(jobCard.closedAt)}` : null}
          </div>
        </div>

        <div className="space-y-6">
          {isCreator && !jobCard.supervisor ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Reassign supervisor</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {jobCard.approvalStatus === 'REJECTED'
                  ? `This Job Card was rejected${jobCard.rejectionReason ? ` — ${jobCard.rejectionReason}` : ''}. Route it to another eligible supervisor in the same department.`
                  : 'No supervisor is currently assigned. Choose one to route this Job Card to.'}
              </p>
              {eligibleSupervisors.supervisors.length === 0 ? (
                <p className="mt-3 text-xs text-[var(--ejo-error)]">
                  No eligible supervisor or Master Administrator is currently active.
                </p>
              ) : (
                <form action={reassignSupervisorFormAction} className="mt-3 space-y-2">
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <select
                    name="supervisorId"
                    required
                    defaultValue=""
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  >
                    <option value="" disabled>Select a supervisor…</option>
                    {eligibleSupervisors.supervisors.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                  <SubmitButton
                    label="Reassign"
                    pendingLabel="Reassigning…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              )}
              {eligibleSupervisors.usingFallback ? (
                <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">
                  No one is placed in this department as a Supervisor yet — showing Master Administrators as a
                  stand-in.
                </p>
              ) : null}
            </div>
          ) : null}

          {isApprover && jobCard.approvalStatus === 'PENDING' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Review this Job Card</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                As the assigned supervisor, approve to confirm this Job Card is correctly opened, or reject it
                back to {jobCard.createdBy.fullName} with a reason.
              </p>
              <form action={approveJobCardFormAction} className="mt-4 space-y-2">
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Approve"
                  pendingLabel="Approving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectJobCardFormAction} className="mt-3 space-y-2">
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejection (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional additional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Update status</h2>
            <form action={updateJobCardStatusFormAction} className="mt-4 space-y-3">
              <input type="hidden" name="jobCardId" value={jobCard.id} />
              <select
                name="status"
                defaultValue={jobCard.status}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <SubmitButton
                label="Update status"
                pendingLabel="Updating…"
                className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              />
            </form>
          </div>

          <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Assign technician</h2>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              Currently: {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
            </p>
            <form action={assignTechnicianFormAction} className="mt-4 space-y-3">
              <input type="hidden" name="jobCardId" value={jobCard.id} />
              <select
                name="technicianId"
                defaultValue={jobCard.assignedTechnician?.id ?? ''}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                <option value="">— Unassigned —</option>
                {technicians.map((t: (typeof technicians)[number]) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                    {t.roles.length > 0 ? ` (${t.roles.map((r: (typeof t.roles)[number]) => r.role.name).join(', ')})` : ''}
                  </option>
                ))}
              </select>
              <SubmitButton
                label="Assign"
                pendingLabel="Assigning…"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
              />
            </form>
          </div>

          {isAssignedTechnician && jobCard.technicianAcceptanceStatus === 'PENDING' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Respond to this assignment</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {jobCard.assignedTechnician?.fullName}, you&apos;ve been assigned to this Job Card. Accept to begin,
                or reject with a reason if you can&apos;t take it on.
              </p>
              <form action={acceptTechnicianAssignmentFormAction} className="mt-4">
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <SubmitButton
                  label="Accept"
                  pendingLabel="Accepting…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectTechnicianAssignmentFormAction} className="mt-3 space-y-2">
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejecting (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {isMasterAdmin ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Danger zone</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Permanently deletes this Job Card and its complaints. This cannot be undone.
              </p>
              <form action={deleteJobCardFormAction} className="mt-4">
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Delete Job Card ${jobCard.jobNumber}? This permanently removes it and its complaints. This cannot be undone.`}
                  label="Delete this Job Card"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
        {auditTrail.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No recorded activity yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {auditTrail.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" />
                <div>
                  <p className="text-[var(--ejo-text)]">
                    <span className="font-medium">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</span>
                    {entry.user ? ` — ${entry.user.fullName}` : ''}
                  </p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
