import { getWorkshopCustodySummary, currentUserIsMasterAdmin, listEligibleManagersForBranch, getWorkshopBranchId, currentUserId } from '@/lib/actions/workshop';
import { sendApprovalReminderFormAction, runApprovalDeadlineChecksFormAction, notifyOverdueCancelledVehicleFormAction, sendReadyForCollectionReminderFormAction, requestJobCardCancellationFormAction, approveCancellationRequestFormAction, declineCancellationRequestFormAction } from '@/lib/actions/workshop-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

type CustodyEntry = {
  id: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  status: string;
  daysElapsed: number;
  totalGraceWorkingDays?: number;
  daysRemaining?: number;
  remindersSent?: number;
  dueDate?: string;
  isOverdue: boolean;
  pendingCancellationRequest?: { id: string; reason: string; requestedByName: string };
};

/** The shared "real data" line for an action-required entry — grace
 * allowed, used, remaining, and how many reminders have actually gone
 * out, all through pluralize() so a single day never reads as
 * "1 days". */
function AnalysisLine({ entry }: { entry: CustodyEntry }) {
  return (
    <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
      Grace: {pluralize(entry.totalGraceWorkingDays ?? 0, 'working day')} · Used: {pluralize(entry.daysElapsed, 'working day')} ·{' '}
      {entry.isOverdue ? 'Remaining: none — overdue' : `Remaining: ${pluralize(entry.daysRemaining ?? 0, 'working day')}`} ·{' '}
      Reminders sent: {entry.remindersSent ?? 0}
    </p>
  );
}

/** The exact same pending-cancellation-request state the Job Card
 * detail page already shows — a Manager sees Approve/Decline right
 * here, so they can act from either place; anyone without that
 * authority just sees that a decision is pending, with no reminder or
 * new cancellation option shown at all while one already is. */
function PendingCancellationBlock({ entry, isEligibleManager }: { entry: CustodyEntry; isEligibleManager: boolean }) {
  if (!entry.pendingCancellationRequest) return null;
  const request = entry.pendingCancellationRequest;
  const badge = (
    <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-warning)]">
      Awaiting Cancellation Approval
    </span>
  );
  if (!isEligibleManager) {
    return (
      <div className="mt-3 space-y-1.5">
        {badge}
        <p className="text-xs text-[var(--ejo-text-muted)]">
          Cancellation requested by {request.requestedByName} — awaiting a Manager&apos;s decision.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2 border-t border-[var(--ejo-border)] pt-3">
      {badge}
      <p className="text-xs text-[var(--ejo-text-muted)]">
        Cancellation requested by {request.requestedByName}: {request.reason}
      </p>
      <form action={approveCancellationRequestFormAction} className="flex gap-2">
        <FormPendingOverlay />
        <input type="hidden" name="jobCardId" value={entry.id} />
        <input type="hidden" name="requestId" value={request.id} />
        <input
          name="decisionNotes"
          placeholder="Note (optional)"
          className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
        />
        <SubmitButton
          label="Approve"
          pendingLabel="Approving…"
          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        />
      </form>
      <form action={declineCancellationRequestFormAction} className="flex gap-2">
        <FormPendingOverlay />
        <input type="hidden" name="jobCardId" value={entry.id} />
        <input type="hidden" name="requestId" value={request.id} />
        <input
          name="decisionNotes"
          placeholder="Note (optional)"
          className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
        />
        <SubmitButton
          label="Decline"
          pendingLabel="Declining…"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
        />
      </form>
    </div>
  );
}

/**
 * "Vehicles In Custody" — every vehicle physically in the workshop and
 * not yet checked out, categorized the way staff actually need to act
 * on them. The three genuinely time-sensitive, action-required
 * categories (Awaiting Customer Approval, Cancelled — Pending
 * Collection, Ready for Collection) each get real deadline tracking,
 * a real days-remaining figure, and a repeatable reminder action whose
 * count is pulled from the audit trail itself — never a separate
 * counter that could drift out of sync with what was actually sent.
 * In Service is the simpler catch-all for everything still moving
 * through the workshop's own process.
 */
export default async function WorkshopCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; reminders?: string; overdue?: string; filter?: string; q?: string }>;
}) {
  const { error, status, reminders, overdue, filter, q } = await searchParams;
  const showAwaiting = !filter || filter === 'awaiting';
  const showCancelled = !filter || filter === 'cancelled' || filter === 'overdue';
  const showReadyForCollection = !filter || filter === 'ready_for_collection' || filter === 'overdue';
  const showInService = !filter || filter === 'in_service';
  const branchId = await getWorkshopBranchId();
  const [summary, isMasterAdmin, eligibleManagers, viewerId] = await Promise.all([
    getWorkshopCustodySummary(q),
    currentUserIsMasterAdmin(),
    listEligibleManagersForBranch(branchId),
    currentUserId(),
  ]);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  // The combined overdue count spans two categories deliberately —
  // Cancelled-pending-collection and Ready-for-Collection each have a
  // real grace period that can be exceeded, and a business genuinely
  // needs one place that says "here's everything overdue right now,"
  // not two separate numbers to add up by hand. Awaiting Approval
  // doesn't belong here: since auto-cancellation was removed, a Job
  // Card past that particular deadline isn't "overdue" in the same
  // sense — it's a normal, ongoing situation waiting on a human
  // decision, already flagged clearly within its own section.
  const overdueCancelled = summary.cancelledPendingCollection.filter((e) => e.isOverdue);
  const overdueReadyForCollection = summary.readyForCollection.filter((e) => e.isOverdue);
  const totalOverdue = overdueCancelled.length + overdueReadyForCollection.length;

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </LoadingLink>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicles In Custody</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
      </p>

      <form className="mb-8 flex gap-2" action="/workshop/custody">
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by job number, VIN, or customer…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
        {q ? (
          <LoadingLink
            href={filter ? `/workshop/custody?filter=${filter}` : '/workshop/custody'}
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>

      {error ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'deadline_checks_run' ? (
        <div className="mb-6">
          <FormFeedbackBanner
            kind="success"
            message={`Deadline checks complete — ${pluralize(Number(reminders ?? 0), 'reminder')} sent. ${Number(overdue ?? 0) > 0 ? `${pluralize(Number(overdue ?? 0), 'Job Card')} past the approval deadline and awaiting a manual decision — review the overdue entries below.` : 'None currently past the approval deadline.'}`}
          />
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <LoadingLink
          href={q ? `/workshop/custody?q=${encodeURIComponent(q)}` : '/workshop/custody'}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            !filter ? 'border-[var(--ejo-primary)]' : 'border-[var(--ejo-border)]'
          } bg-[var(--ejo-surface)]`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Total In Custody</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{summary.total}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/custody?filter=awaiting${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'awaiting' ? 'border-[var(--ejo-warning)]' : 'border-[var(--ejo-warning)]/30'
          } bg-[var(--ejo-warning)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Awaiting Customer Approval</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-warning)]">{summary.awaitingApproval.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/custody?filter=cancelled${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'cancelled' ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-error)]/30'
          } bg-[var(--ejo-error)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Cancelled — Pending Collection</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-error)]">{summary.cancelledPendingCollection.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/custody?filter=ready_for_collection${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'ready_for_collection' ? 'border-[var(--ejo-success)]' : 'border-[var(--ejo-success)]/30'
          } bg-[var(--ejo-success)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Ready for Collection</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-success)]">{summary.readyForCollection.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/custody?filter=overdue${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'overdue' ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-error)]/30'
          } bg-[var(--ejo-error)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Overdue</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-error)]">{totalOverdue}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/custody?filter=in_service${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'in_service' ? 'border-[var(--ejo-info)]' : 'border-[var(--ejo-info)]/30'
          } bg-[var(--ejo-info)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">In Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-info)]">{summary.inService.length}</p>
        </LoadingLink>
      </div>
      {filter ? (
        <div className="mb-6">
          <LoadingLink href={q ? `/workshop/custody?q=${encodeURIComponent(q)}` : '/workshop/custody'} className="text-xs text-[var(--ejo-primary)] hover:underline">
            ← Clear category filter, show everything
          </LoadingLink>
        </div>
      ) : null}

      {isMasterAdmin ? (
        <div className="mb-8 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Approval Deadline Checks</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            Stands in for a scheduled daily job until one is wired up — sends any due approval reminders and
            flags any Job Card that has passed its approval deadline for manual review. Nothing is ever
            cancelled automatically here — a deliberate business choice, so a genuine reason (a customer who
            calls to ask for a day&apos;s grace) is never overridden by a script. Actually cancelling an overdue
            Job Card still goes through the normal, Manager-approved cancellation request below, the same as
            any other cancellation. Cancelled-collection and Ready-for-Collection reminders stay their own
            deliberate, manual action too — sending those isn&apos;t automatic here either.
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

      {showAwaiting ? (
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
                      {entry.isOverdue ? 'Overdue — due for auto-cancellation' : `${pluralize(entry.daysElapsed, 'working day')} elapsed`}
                    </span>
                    {entry.dueDate ? (
                      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                        Due {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AnalysisLine entry={entry} />
                {entry.pendingCancellationRequest ? (
                  <PendingCancellationBlock entry={entry} isEligibleManager={isEligibleManager} />
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={sendApprovalReminderFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="jobCardId" value={entry.id} />
                      <SubmitButton
                        label={entry.remindersSent && entry.remindersSent > 0 ? 'Send another reminder' : 'Send reminder'}
                        pendingLabel="Sending…"
                        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                      />
                    </form>
                    <details className="group">
                      <summary className="cursor-pointer list-none rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10">
                        Request cancellation
                      </summary>
                      <form action={requestJobCardCancellationFormAction} className="mt-2 space-y-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="jobCardId" value={entry.id} />
                        <textarea
                          name="reason"
                          required
                          rows={2}
                          placeholder="Reason — e.g. customer called to cancel, could not afford repair"
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                        />
                        <SubmitButton
                          label="Submit cancellation request"
                          pendingLabel="Requesting…"
                          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        />
                      </form>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {showCancelled ? (
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">
          Cancelled — Pending Collection{filter === 'overdue' ? ' (Overdue only)' : ''}
        </h2>
        {(filter === 'overdue' ? overdueCancelled : summary.cancelledPendingCollection).length === 0 ? (
          <p className="text-sm text-[var(--ejo-text-muted)]">
            {filter === 'overdue' ? 'No overdue cancelled vehicles right now.' : 'No cancelled vehicles awaiting collection.'}
          </p>
        ) : (
          <div className="space-y-3">
            {(filter === 'overdue' ? overdueCancelled : summary.cancelledPendingCollection).map((entry) => (
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
                          : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                      }`}
                    >
                      {entry.isOverdue ? 'Overdue for review' : `${pluralize(entry.daysElapsed, 'working day')} since cancellation`}
                    </span>
                    {entry.dueDate ? (
                      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                        Expected collection by {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AnalysisLine entry={entry} />
                {isEligibleManager ? (
                  <form action={notifyOverdueCancelledVehicleFormAction} className="mt-3 flex gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobCardId" value={entry.id} />
                    <input
                      name="notes"
                      placeholder="Note (optional)"
                      className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                    />
                    <SubmitButton
                      label={entry.remindersSent && entry.remindersSent > 0 ? 'Send another notice' : 'Notify customer'}
                      pendingLabel="Sending…"
                      className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    />
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                    Only a Workshop Manager or HOD can notify the customer.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {showReadyForCollection ? (
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">
          Ready for Collection{filter === 'overdue' ? ' (Overdue only)' : ''}
        </h2>
        {(filter === 'overdue' ? overdueReadyForCollection : summary.readyForCollection).length === 0 ? (
          <p className="text-sm text-[var(--ejo-text-muted)]">
            {filter === 'overdue' ? 'No overdue Ready-for-Collection vehicles right now.' : 'Nothing currently ready for collection.'}
          </p>
        ) : (
          <div className="space-y-3">
            {(filter === 'overdue' ? overdueReadyForCollection : summary.readyForCollection).map((entry) => (
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
                          : 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                      }`}
                    >
                      {entry.isOverdue ? 'Overdue — charges may apply' : `${pluralize(entry.daysElapsed, 'working day')} since ready`}
                    </span>
                    {entry.dueDate ? (
                      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                        Expected collection by {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AnalysisLine entry={entry} />
                <form action={sendReadyForCollectionReminderFormAction} className="mt-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={entry.id} />
                  <SubmitButton
                    label={entry.remindersSent && entry.remindersSent > 0 ? 'Send another reminder' : 'Send reminder'}
                    pendingLabel="Sending…"
                    className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {showInService ? (
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
      ) : null}
    </div>
  );
}
