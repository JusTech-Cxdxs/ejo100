import { LoadingLink } from '@/components/LoadingLink';
import { listJobCards, currentUserIsMasterAdmin } from '@/lib/actions/workshop';
import { createJobCardFormAction, deleteJobCardFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { CustomerVehiclePicker } from '@/components/CustomerVehiclePicker';
import { CategoryFilterTabs } from '@/components/CategoryFilterTabs';
import { ComplaintListInput } from '@/components/ComplaintListInput';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';

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

const STATUS_COLOR: Record<string, string> = {
  CHECKED_IN: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  IN_PROGRESS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  AWAITING_PARTS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  QUALITY_CHECK: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  READY_FOR_COLLECTION: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CLOSED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

export default async function WorkshopJobCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; error?: string }>;
}) {
  const { q, type, status, error } = await searchParams;
  const vehicleType = type === 'PASSENGER' || type === 'COMMERCIAL' ? type : undefined;
  const [jobCards, isMasterAdmin] = await Promise.all([
    listJobCards(undefined, q, vehicleType),
    currentUserIsMasterAdmin(),
  ]);

  return (
    <div className="p-8">
      {status === 'job_card_deleted' ? (
        <FormFeedbackBanner kind="success" message="Job Card deleted." />
      ) : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Job Cards</h1>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
        </p>
      </div>

      <CategoryFilterTabs basePath="/workshop/job-cards" currentType={vehicleType} preserveParams={{ q }} />

      <form className="mb-6 flex gap-2" action="/workshop/job-cards">
        {vehicleType ? <input type="hidden" name="type" value={vehicleType} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by job number, customer, vehicle/VIN, or technician…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-hidden">
          {jobCards.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              {q
                ? `No Job Cards match "${q}".`
                : vehicleType
                  ? 'No Job Cards match this filter.'
                  : 'No Job Cards yet. Open the first one using the form on the right.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Job #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Technician</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {isMasterAdmin ? <th className="px-4 py-3 font-medium">&nbsp;</th> : null}
                </tr>
              </thead>
              <tbody>
                {jobCards.map((jc: (typeof jobCards)[number]) => (
                  <tr key={jc.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">
                      <LoadingLink href={`/workshop/job-cards/${jc.id}`} className="hover:underline">
                        {jc.jobNumber}
                      </LoadingLink>
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{jc.customer.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {jc.vehicle.plateNumber || [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {jc.assignedTechnician?.fullName ?? 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[jc.status]}`}>
                        {STATUS_LABEL[jc.status]}
                      </span>
                    </td>
                    {isMasterAdmin ? (
                      <td className="px-4 py-3">
                        <form action={deleteJobCardFormAction}>
                          <input type="hidden" name="jobCardId" value={jc.id} />
                          <ConfirmDeleteButton
                            confirmMessage={`Delete Job Card ${jc.jobNumber}? This permanently removes it and its complaints. This cannot be undone.`}
                            className="text-xs font-medium text-[var(--ejo-error)] hover:underline"
                          />
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Open Job Card</h2>
          <form action={createJobCardFormAction} className="mt-4 space-y-3">
            <CustomerVehiclePicker />
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage at check-in (km)</label>
              <input name="mileageAtCheckIn" type="number" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                Complaints / reasons for visit <span className="text-[var(--ejo-error)]">*</span>
              </label>
              <ComplaintListInput />
            </div>
            <SubmitButton
              label="Open Job Card"
              pendingLabel="Opening…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      </div>

      <LoadingLink
        href="/workshop"
        className="mt-6 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </LoadingLink>
    </div>
  );
}
