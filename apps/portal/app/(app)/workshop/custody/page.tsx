import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { OrgTrail } from '@/components/OrgTrail';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { getWorkshopCustodySummary, type WorkshopCustodyEntry, currentUserIsMasterAdmin, listEligibleManagersForBranch, currentUserId } from '@/lib/actions/workshop';
import { getWorkshopBranchId } from '@/lib/workshop-core';
import { sendApprovalReminderFormAction, notifyOverdueCancelledVehicleFormAction, sendReadyForCollectionReminderFormAction, requestJobCardCancellationFormAction, approveCancellationRequestFormAction, declineCancellationRequestFormAction } from '@/lib/actions/workshop-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';
import { ordinal } from '@/lib/custody-reminders';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { EmptyState, PageHeader } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

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
  customerId?: string;
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

/** Grace allowed, used and remaining, and reminders sent, for an action-required entry. */
function AnalysisLine({ entry }: { entry: CustodyEntry }) {
  return (
    <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
      Grace: {pluralize(entry.totalGraceWorkingDays ?? 0, 'working day')} · Used: {pluralize(entry.daysElapsed, 'working day')} ·{' '}
      {entry.isOverdue ? 'Remaining: none — overdue' : `Remaining: ${pluralize(entry.daysRemaining ?? 0, 'working day')}`} ·{' '}
      Reminders sent: {entry.remindersSent ?? 0}
    </p>
  );
}

/** A pending cancellation request, as on the Job Card page. Managers can
 * approve or decline here; others only see that a decision is pending. */
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
 * Vehicles in the workshop that have not been checked out. Awaiting Customer
 * Approval, Cancelled (pending collection) and Ready for Collection have
 * deadlines and reminders; the reminder count comes from the audit trail.
 * In Service covers everything else still being worked on.
 */
/** Staged reminder status for one custody entry — who sent the last one
 * (by name) and, when the next isn't due yet, exactly when it will be. */
function ReminderStatus({ entry, noun }: { entry: WorkshopCustodyEntry; noun: string }) {
  const r = entry.reminder;
  if (!r) return null;
  return (
    <div className="mt-2 space-y-0.5 text-xs text-[var(--ejo-text-muted)]">
      {r.lastSentAt ? (
        <p>
          Last {noun} sent by {r.lastSentByName ?? 'an unknown user'} on {formatDateOnly(new Date(r.lastSentAt))}.
        </p>
      ) : null}
      {!r.dueNow ? (
        <p>
          {ordinal(r.nextNumber)} {noun} available from {formatDateOnly(new Date(r.dueFrom))} — spaced 2 working days apart.
        </p>
      ) : null}
    </div>
  );
}

export default async function WorkshopCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; reminders?: string; overdue?: string; filter?: string; q?: string; type?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { error, status, reminders, overdue, filter, q, type: rawType } = await searchParams;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const vehicleType = rawType === 'PASSENGER' || rawType === 'COMMERCIAL' ? rawType : null;
  const showAwaiting = !filter || filter === 'awaiting';
  const showCancelled = !filter || filter === 'cancelled' || filter === 'overdue';
  const showReadyForCollection = !filter || filter === 'ready_for_collection' || filter === 'overdue';
  const showInService = !filter || filter === 'in_service';
  const branchId = await getWorkshopBranchId();
  const [summary, isMasterAdmin, eligibleManagers, viewerId, canNotify] = await Promise.all([
    getWorkshopCustodySummary(q),
    currentUserIsMasterAdmin(),
    listEligibleManagersForBranch(branchId),
    currentUserId(),
    // Reminders to customers are front-desk work: only shown to those who may send them.
    allows('workshop.customer.notify'),
  ]);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  // Overdue = past the grace period for collection (cancelled or ready).
  // Awaiting Approval is excluded: it waits on a customer decision and is
  // flagged in its own section.
  const overdueCancelled = summary.cancelledPendingCollection.filter((e) => e.isOverdue);
  const overdueReadyForCollection = summary.readyForCollection.filter((e) => e.isOverdue);
  const totalOverdue = overdueCancelled.length + overdueReadyForCollection.length;

  // Passenger / Commercial filter — narrows every list (and so every count).
  if (vehicleType) {
    const rec = summary as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const list = rec[key];
      if (Array.isArray(list)) rec[key] = list.filter((e: { vehicleType?: string | null }) => e.vehicleType === vehicleType);
    }
  }
  return (
    <div className="p-8">
      <PageHeader
        icon="garage"
        back={{ href: "/workshop", label: "Back to Workshop" }}
        title="Vehicles In Custody"
        description={<><OrgTrail area="Workshop" /></>}
      />

      <form className="mb-8 flex gap-2" action="/workshop/custody">
        <select
          name="type"
          defaultValue={vehicleType ?? ''}
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        >
          <option value="">All vehicle types</option>
          <option value="PASSENGER">Passenger</option>
          <option value="COMMERCIAL">Commercial</option>
        </select>
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        <LiveSearchInput
          type="search" name="q"
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
          href={`/workshop/custody?filter=in_service${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'in_service' ? 'border-[var(--ejo-info)]' : 'border-[var(--ejo-info)]/30'
          } bg-[var(--ejo-info)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">In Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-info)]">{summary.inService.length}</p>
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
          href={`/workshop/custody?filter=cancelled${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${
            filter === 'cancelled' ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-error)]/30'
          } bg-[var(--ejo-error)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Cancelled — Pending Collection</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-error)]">{summary.cancelledPendingCollection.length}</p>
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
      </div>
      {filter ? (
        <div className="mb-6">
          <LoadingLink href={q ? `/workshop/custody?q=${encodeURIComponent(q)}` : '/workshop/custody'} className="text-xs text-[var(--ejo-primary)] hover:underline">
            ← Clear category filter, show everything
          </LoadingLink>
        </div>
      ) : null}

      <div className="mb-8 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-xs text-[var(--ejo-text-muted)]">
        <span className="font-medium text-[var(--ejo-text)]">Reminders:</span> a Send button appears when a reminder is due.
        Approval reminders start 3 working days after the estimate is sent, collection reminders 2 working days after the
        vehicle is ready, and cancelled-vehicle notices after the 7-working-day grace period; after that, every 2 working days.
        Reminders are never sent automatically, and each email is numbered and signed with the sender&apos;s name. Overdue
        approvals are not cancelled automatically; use a cancellation request.
      </div>

      {showAwaiting ? (
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Awaiting Customer Approval</h2>
        {summary.awaitingApproval.length === 0 ? (
          <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="garage" title="Nothing currently awaiting approval." /></div>
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
                    <p className="text-sm text-[var(--ejo-text)]">
                      <CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /> —{' '}
                      <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="hover:underline">
                        {entry.vehicleDescription}
                      </LoadingLink>
                    </p>
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
                        Due {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AnalysisLine entry={entry} />
                {entry.pendingCancellationRequest ? (
                  <PendingCancellationBlock entry={entry} isEligibleManager={isEligibleManager} />
                ) : (
                  <>
                  <ReminderStatus entry={entry} noun="approval reminder" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canNotify && entry.reminder?.dueNow ? (
                      <form action={sendApprovalReminderFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="jobCardId" value={entry.id} />
                        <SubmitButton
                          label={`Send ${ordinal(entry.reminder.nextNumber)} approval reminder`}
                          pendingLabel="Sending…"
                          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        />
                      </form>
                    ) : null}
                    <details className="group">
                      <summary className="cursor-pointer list-none rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10">
                        Request cancellation
                      </summary>
                      <form action={requestJobCardCancellationFormAction} className="mt-2 space-y-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="jobCardId" value={entry.id} />
                        <textarea id={`custody-cancel-${entry.id}`}
                          name="reason"
                          required
                          rows={2}
                          placeholder="Reason — e.g. customer called to cancel, could not afford repair"
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                        />
                        <RefineTextButton targetId={`custody-cancel-${entry.id}`} />
                        <SubmitButton
                          label="Submit cancellation request"
                          pendingLabel="Requesting…"
                          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        />
                      </form>
                    </details>
                  </div>
                  </>
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
                    <p className="text-sm text-[var(--ejo-text)]">
                      <CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /> —{' '}
                      <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="hover:underline">
                        {entry.vehicleDescription}
                      </LoadingLink>
                    </p>
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
                        Expected collection by {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AnalysisLine entry={entry} />
                <ReminderStatus entry={entry} noun="collection notice" />
                {isEligibleManager && entry.reminder?.dueNow ? (
                  <form action={notifyOverdueCancelledVehicleFormAction} className="mt-3 flex gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobCardId" value={entry.id} />
                    <input
                      name="notes"
                      placeholder="Note (optional)"
                      className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                    />
                    <SubmitButton
                      label={`Send ${ordinal(entry.reminder?.nextNumber ?? 1)} collection notice`}
                      pendingLabel="Sending…"
                      className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    />
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                    Only a Manager or HOD can notify the customer.
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
                    <p className="text-sm text-[var(--ejo-text)]">
                      <CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /> —{' '}
                      <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="hover:underline">
                        {entry.vehicleDescription}
                      </LoadingLink>
                    </p>
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
                        Expected collection by {new Date(entry.dueDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AnalysisLine entry={entry} />
                <ReminderStatus entry={entry} noun="collection reminder" />
                {canNotify && entry.reminder?.dueNow ? (
                  <form action={sendReadyForCollectionReminderFormAction} className="mt-3">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobCardId" value={entry.id} />
                    <SubmitButton
                      label={`Send ${ordinal(entry.reminder.nextNumber)} collection reminder`}
                      pendingLabel="Sending…"
                      className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    />
                  </form>
                ) : null}
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
          <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="garage" title="No vehicles currently in service." /></div>
        ) : (
          <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
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
                    <td data-label="Customer" className="px-4 py-2 text-[var(--ejo-text)]"><CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /></td>
                    <td data-label="Vehicle" className="px-4 py-2">
                      <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="text-[var(--ejo-text)] hover:underline">
                        {entry.vehicleDescription}
                      </LoadingLink>
                    </td>
                    <td data-label="Status" className="px-4 py-2 text-[var(--ejo-text-muted)]">{STATUS_LABEL[entry.status] ?? entry.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </section>
      ) : null}
    </div>
  );
}
