import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { updateJobCardStatusFormAction } from '@/lib/actions/workshop-form-handlers';

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobCard = await getJobCard(id);
  if (!jobCard) notFound();

  return (
    <div className="p-8">
      <Link href="/workshop/job-cards" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← All Job Cards
      </Link>

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
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Complaint</h2>
            <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.complaint}</p>
            {jobCard.diagnosis ? (
              <>
                <h2 className="mt-4 text-sm font-semibold text-[var(--ejo-text)]">Diagnosis</h2>
                <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.diagnosis}</p>
              </>
            ) : null}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-xs text-[var(--ejo-text-muted)]">
            Opened by {jobCard.createdBy.fullName} on{' '}
            {jobCard.createdAt.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
            {jobCard.closedAt
              ? ` — closed ${jobCard.closedAt.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}`
              : null}
          </div>
        </div>

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
            <button
              type="submit"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Update status
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
