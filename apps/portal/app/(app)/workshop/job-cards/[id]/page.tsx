import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobCard, listTechnicianCandidates } from '@/lib/actions/workshop';
import { updateJobCardStatusFormAction, assignTechnicianFormAction } from '@/lib/actions/workshop-form-handlers';
import { formatDateTime } from '@/lib/utils/format-date';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

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

export default async function JobCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status } = await searchParams;
  const [jobCard, technicians] = await Promise.all([getJobCard(id), listTechnicianCandidates()]);
  if (!jobCard) notFound();

  return (
    <div className="p-8">
      <Link href="/workshop/job-cards" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← All Job Cards
      </Link>

      {status === 'job_card_created' ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="success" message="Job Card successfully created." />
        </div>
      ) : null}

      <div className="mt-3 mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{jobCard.jobNumber}</h1>
        <span className="rounded-full bg-[var(--ejo-primary)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-primary)]">
          {STATUS_LABEL[jobCard.status]}
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
                <dt className="text-[var(--ejo-text-muted)]">Plate / Chassis</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.plateNumber || jobCard.vehicle.chassisNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Mileage at check-in</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.mileageAtCheckIn != null ? `${jobCard.mileageAtCheckIn.toLocaleString()} km` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Assigned technician</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
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
        </div>
      </div>
    </div>
  );
}
