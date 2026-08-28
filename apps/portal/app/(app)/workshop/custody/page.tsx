import { getWorkshopCustodySummary, currentUserIsMasterAdmin, listEligibleManagersForBranch, getWorkshopBranchId, currentUserId } from '@/lib/actions/workshop';
import { sendApprovalReminderFormAction, runApprovalDeadlineChecksFormAction, notifyOverdueCancelledVehicleFormAction } from '@/lib/actions/workshop-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
};

/**
 * "Vehicles In Custody" — every vehicle physically in the workshop and
 * not yet checked out, categorized the way staff actually need to act
 * on them. Deliberately a separate page from the Job Cards list: that
 * page is a general-purpose search/browse tool, this one is a
 * purpose-built action surface for two specific, time-sensitive
 * workflows (the approval deadline, and the cancellation collection
 * grace period).
 */
export default async function WorkshopCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; reminders?: string; cancelled?: string }>;
}) {
  const { error, status, reminders, cancelled } = await searchParams;
  const branchId = await getWorkshopBranchId();
  const [summary, isMasterAdmin, eligibleManagers, viewerId] = await Promise.all([
    getWorkshopCustodySummary(),
    currentUserIsMasterAdmin(),
    listEligibleManagersForBranch(branchId),
    currentUserId(),
  ]);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);

  return (
    <div className="p-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicles In Custody</h1>
      </div>
      <p className="mb-8 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
      </p>

      {error ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'deadline_checks_run' ? (
        <div className="mb-6">
          <FormFeedbackBanner
            kind="success"
            message={`Deadline checks complete — ${reminders ?? 0} reminder(s) sent, ${cancelled ?? 0} Job Card(s) auto-cancelled.`}
          />
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <p className="text-xs text-[var(--ejo-text-muted)]">Total In Custody</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{summary.total}</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
          <p className="text-xs text-[var(--ejo-text-muted)]">Awaiting Customer Approval</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-warning)]">{summary.awaitingApproval.length}</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
          <p className="text-xs text-[var(--ejo-text-muted)]">Cancelled — Pending Collection</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-error)]">{summary.cancelledPendingCollection.length}</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-5">
          <p className="text-xs text-[var(--ejo-text-muted)]">In Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-info)]">{summary.inService.length}</p>
        </div>
      </div>

      {isMasterAdmin ? (
        <div className="mb-8 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Approval Deadline Checks</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            Stands in for a scheduled daily job until one is wired up — sends any due reminders and automatically
            cancels any Job Card that has passed its approval deadline with no sufficient payment recorded.
          </p>
          <form action={runApprovalDeadlineChecksFormAction} className="mt-3">
            <FormPendingOverlay />
            <SubmitButton
              label="Run deadline checks now"
              pendingLabel="Running…"
              className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Awaiting Customer Approval</h2>
        {summary.awaitingApproval.length === 0 ? (
          <p className="text-sm text-[var(--ejo-text-muted)]">Nothing currently awaiting approval.</p>
        ) : (
          <div className="space-y-3">
            {summary.awaitingApproval.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-[var(--ejo-radius-lg)] border p-4 ${
                  entry.isOverdue ? 'border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <LoadingLink href={`/workshop/job-cards/${entry.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {entry.jobNumber}
                    </LoadingLink>
                    <p className="text-sm text-[var(--ejo-text)]">{entry.customerName} — {entry.vehicleDescription}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        entry.isOverdue
                          ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                          : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {entry.isOverdue ? 'Overdue — due for auto-cancellation' : `${entry.daysElapsed} working day(s) elapsed`}
                    </span>
                    {entry.dueDate ? (
                      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                        Due {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                {!entry.reminderSent && !entry.isOverdue ? (
                  <form action={sendApprovalReminderFormAction} className="mt-3">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobCardId" value={entry.id} />
                    <SubmitButton
                      label="Send reminder now"
                      pendingLabel="Sending…"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                    />
                  </form>
                ) : entry.reminderSent ? (
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Reminder already sent.</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Cancelled — Pending Collection</h2>
        {summary.cancelledPendingCollection.length === 0 ? (
          <p className="text-sm text-[var(--ejo-text-muted)]">No cancelled vehicles awaiting collection.</p>
        ) : (
          <div className="space-y-3">
            {summary.cancelledPendingCollection.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-[var(--ejo-radius-lg)] border p-4 ${
                  entry.isOverdue ? 'border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <LoadingLink href={`/workshop/job-cards/${entry.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {entry.jobNumber}
                    </LoadingLink>
                    <p className="text-sm text-[var(--ejo-text)]">{entry.customerName} — {entry.vehicleDescription}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      entry.isOverdue
                        ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                        : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                    }`}
                  >
                    {entry.isOverdue ? 'Overdue for review' : `${entry.daysElapsed} working day(s) since cancellation`}
                  </span>
                </div>
                {entry.isOverdue && isEligibleManager ? (
                  <form action={notifyOverdueCancelledVehicleFormAction} className="mt-3 flex gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobCardId" value={entry.id} />
                    <input
                      name="notes"
                      placeholder="Note (optional)"
                      className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                    />
                    <SubmitButton
                      label="Notify customer"
                      pendingLabel="Sending…"
                      className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    />
                  </form>
                ) : entry.isOverdue ? (
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                    Overdue for review — only a Workshop Manager or HOD can notify the customer.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">In Service</h2>
        {summary.inService.length === 0 ? (
          <p className="text-sm text-[var(--ejo-text-muted)]">No vehicles currently in service.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2">Job Card</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Vehicle</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.inService.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2">
                      <LoadingLink href={`/workshop/job-cards/${entry.id}`} className="text-[var(--ejo-primary)] hover:underline">
                        {entry.jobNumber}
                      </LoadingLink>
                    </td>
                    <td className="px-4 py-2 text-[var(--ejo-text)]">{entry.customerName}</td>
                    <td className="px-4 py-2 text-[var(--ejo-text)]">{entry.vehicleDescription}</td>
                    <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{STATUS_LABEL[entry.status] ?? entry.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
