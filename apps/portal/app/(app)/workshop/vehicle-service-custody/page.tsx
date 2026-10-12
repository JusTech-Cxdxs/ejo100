import { OrgTrail } from '@/components/OrgTrail';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { getVehicleServiceCustodySummary, type VehicleDueForService } from '@/lib/actions/vehicle-service';
import { getWorkshopBranchId } from '@/lib/workshop-core';
import { attendToOverdueVehicleFormAction, sendVehicleServiceCollectionReminderFormAction, sendManualServiceReminderFormAction, sendVehicleServiceCancelledCollectionNoticeFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';
import { ordinal } from '@/lib/custody-reminders';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { EmptyState, PageHeader } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed — Awaiting Check Out',
};

/**
 * Vehicle Service custody: what is in service, what is done and waiting for
 * the customer, and which vehicles are due or overdue for their next service
 * (from listVehiclesDueForService).
 */
const REMINDER_STAGE_LABEL: Record<number, string> = { 1: '1st — Friendly', 2: '2nd — Follow-up', 3: '3rd — Due', 4: 'Overdue' };

/** One Due Soon / Overdue vehicle — shared by both sections. A vehicle
 * back in the workshop is still shown, named with the visit it's in on,
 * and is never offered a reminder (the customer is already here). */
function DueEntryCard({ entry, canSeeCustomers = false }: { entry: VehicleDueForService; canSeeCustomers?: boolean }) {
  const overdue = entry.status === 'OVERDUE';
  const remaining = [
    entry.kmRemaining !== null ? (entry.kmRemaining <= 0 ? `${Math.abs(entry.kmRemaining).toLocaleString('en-NG')} km over` : `${entry.kmRemaining.toLocaleString('en-NG')} km left`) : null,
    entry.daysRemaining !== null ? (entry.daysRemaining <= 0 ? `${pluralize(Math.abs(entry.daysRemaining), 'day')} over` : `${pluralize(entry.daysRemaining, 'day')} left`) : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className={`rounded-[var(--ejo-radius-lg)] border p-4 ${overdue ? 'border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5' : 'border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="font-medium text-[var(--ejo-primary)] hover:underline">
            {entry.vehicleDescription}{entry.plateNumber ? ` — ${entry.plateNumber}` : ''}
          </LoadingLink>
          <p className="text-sm text-[var(--ejo-text)]"><CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /></p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            Due {entry.nextServiceDueOdometer ? `${entry.nextServiceDueOdometer.toLocaleString('en-NG')} km` : ''}
            {entry.nextServiceDueOdometer && entry.nextServiceDueDate ? ' or ' : ''}
            {entry.nextServiceDueDate ? formatDateOnly(entry.nextServiceDueDate) : ''}
            {remaining ? ` — ${remaining}` : ''} · Reminders this cycle: {entry.remindersSentThisCycle}
            {entry.reminderDue ? ` · Reminder due now: ${REMINDER_STAGE_LABEL[entry.reminderDue.stage]}` : entry.nextReminderFrom ? ` · Next reminder from ${formatDateOnly(entry.nextReminderFrom)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {entry.inWorkshop ? (
            <LoadingLink
              href={entry.inWorkshop.kind === 'JOB_CARD' ? `/workshop/job-cards/${entry.inWorkshop.id}` : `/workshop/vehicle-service/${entry.inWorkshop.id}`}
              className="rounded-full bg-[var(--ejo-info)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-info)] hover:underline"
            >
              In workshop — {entry.inWorkshop.number}
            </LoadingLink>
          ) : (
            <>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${overdue ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'}`}>
                {overdue ? 'Overdue' : 'Due Soon'}
              </span>
              {entry.reminderDue ? (
                <form action={sendManualServiceReminderFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="vehicleId" value={entry.vehicleId} />
                  <input type="hidden" name="returnTo" value="/workshop/vehicle-service-custody" />
                  <SubmitButton
                    label="Send reminder"
                    pendingLabel="Sending…"
                    className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                  />
                </form>
              ) : null}
              {overdue ? (
                <form action={attendToOverdueVehicleFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="serviceId" value={entry.serviceId} />
                  <SubmitButton
                    label="Attend To"
                    pendingLabel="…"
                    className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-1 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                  />
                </form>
              ) : null}
              <LoadingLink
                href={`/workshop/vehicle-service/book?vehicleId=${entry.vehicleId}`}
                className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Book in
              </LoadingLink>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function VehicleServiceCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; status?: string; error?: string; type?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { filter, q, status, error, type: rawType } = await searchParams;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const vehicleType = rawType === 'PASSENGER' || rawType === 'COMMERCIAL' ? rawType : null;
  const branchId = await getWorkshopBranchId();
  const [summary, canNotify] = await Promise.all([getVehicleServiceCustodySummary(branchId, q), allows('workshop.customer.notify')]);
  // Passenger / Commercial filter — narrows every list (and so every count).
  if (vehicleType) {
    const rec = summary as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const list = rec[key];
      if (Array.isArray(list)) rec[key] = list.filter((e: { vehicleType?: string | null }) => e.vehicleType === vehicleType);
    }
  }

  const showCheckedIn = !filter || filter === 'checked_in';
  const showInService = !filter || filter === 'in_service';
  const showCompleted = !filter || filter === 'completed';
  const showCancelled = !filter || filter === 'cancelled';
  const showDueSoon = !filter || filter === 'due_soon';
  const showOverdue = !filter || filter === 'overdue';

  return (
    <div className="p-8">
      <PageHeader
        icon="key"
        back={{ href: "/workshop", label: "Back to Workshop" }}
        title="Vehicles In Custody — Vehicle Service"
        description={<><OrgTrail area="Workshop" /></>}
      />
      <p className="-mt-3 mb-6 text-xs text-[var(--ejo-text-muted)]">
        Vehicles already collected are tracked for their next service in the{' '}
        <LoadingLink href="/workshop/service-tracker" className="font-medium text-[var(--ejo-primary)] hover:underline">
          Service Tracker
        </LoadingLink>
        .
      </p>
      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'cancelled_notice_sent' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Collection notice sent to the customer." />
        </div>
      ) : null}
      {status === 'collection_reminder_sent' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Collection reminder sent to the customer." />
        </div>
      ) : null}
      {status === 'reminder_sent' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Service reminder sent to the customer." />
        </div>
      ) : null}
      {status === 'attended' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Marked attended to — this vehicle is ready for a new Vehicle Service." />
        </div>
      ) : null}

      <form className="mb-8 flex gap-2" action="/workshop/vehicle-service-custody">
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
          placeholder="Search by service number, plate, or customer…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
          Search
        </button>
        {q ? (
          <LoadingLink
            href={filter ? `/workshop/vehicle-service-custody?filter=${filter}` : '/workshop/vehicle-service-custody'}
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=checked_in${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'checked_in' ? 'border-[var(--ejo-accent)]' : 'border-[var(--ejo-accent)]/30'} bg-[var(--ejo-accent)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Checked In</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-accent)]">{summary.checkedIn.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=in_service${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'in_service' ? 'border-[var(--ejo-info)]' : 'border-[var(--ejo-info)]/30'} bg-[var(--ejo-info)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">In Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-info)]">{summary.inService.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=completed${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'completed' ? 'border-[var(--ejo-success)]' : 'border-[var(--ejo-success)]/30'} bg-[var(--ejo-success)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Completed — Awaiting Collection</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-success)]">{summary.completed.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=due_soon${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'due_soon' ? 'border-[var(--ejo-warning)]' : 'border-[var(--ejo-warning)]/30'} bg-[var(--ejo-warning)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Due Soon</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-warning)]">{summary.dueSoon.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=overdue${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'overdue' ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-error)]/30'} bg-[var(--ejo-error)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Overdue for Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-error)]">{summary.overdue.length}</p>
        </LoadingLink>
      </div>
      {filter ? (
        <div className="mb-6">
          <LoadingLink href={q ? `/workshop/vehicle-service-custody?q=${encodeURIComponent(q)}` : '/workshop/vehicle-service-custody'} className="text-xs text-[var(--ejo-primary)] hover:underline">
            ← Clear category filter, show everything
          </LoadingLink>
        </div>
      ) : null}

      {showCheckedIn ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Checked In</h2>
          {summary.checkedIn.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="key" title="No vehicles currently checked in." /></div>
          ) : (
            <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="px-4 py-2">Service</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Vehicle</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.checkedIn.map((entry: (typeof summary.checkedIn)[number]) => (
                    <tr key={entry.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2">
                        <LoadingLink href={`/workshop/vehicle-service/${entry.id}`} className="text-[var(--ejo-primary)] hover:underline">
                          {entry.serviceNumber}
                        </LoadingLink>
                      </td>
                      <td className="px-4 py-2 text-[var(--ejo-text)]"><CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /></td>
                      <td className="px-4 py-2">
                        <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="text-[var(--ejo-primary)] hover:underline">
                          {entry.vehicleDescription}
                        </LoadingLink>
                      </td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{STATUS_LABEL[entry.status] ?? entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showInService ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">In Service</h2>
          {summary.inService.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="key" title="No vehicles currently in service." /></div>
          ) : (
            <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="px-4 py-2">Service</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Vehicle</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.inService.map((entry: (typeof summary.inService)[number]) => (
                    <tr key={entry.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2">
                        <LoadingLink href={`/workshop/vehicle-service/${entry.id}`} className="text-[var(--ejo-primary)] hover:underline">
                          {entry.serviceNumber}
                        </LoadingLink>
                      </td>
                      <td className="px-4 py-2 text-[var(--ejo-text)]"><CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /></td>
                      <td className="px-4 py-2">
                        <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="text-[var(--ejo-primary)] hover:underline">
                          {entry.vehicleDescription}
                        </LoadingLink>
                      </td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{STATUS_LABEL[entry.status] ?? entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showCompleted ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Completed — Awaiting Collection</h2>
          {summary.completed.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="key" title="Nothing currently waiting on collection." /></div>
          ) : (
            <div className="space-y-3">
              {summary.completed.map((entry: (typeof summary.completed)[number]) => (
                <div key={entry.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <LoadingLink href={`/workshop/vehicle-service/${entry.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {entry.serviceNumber}
                      </LoadingLink>
                      <p className="text-sm text-[var(--ejo-text)]">
                        <CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /> —{' '}
                        <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="text-[var(--ejo-primary)] hover:underline">
                          {entry.vehicleDescription}
                        </LoadingLink>
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          entry.collection?.isOverdue ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                        }`}
                      >
                        {entry.collection?.isOverdue ? 'Collection overdue' : STATUS_LABEL[entry.status] ?? entry.status}
                        {entry.completedAt ? ` · completed ${formatDateOnly(entry.completedAt)}` : ''}
                      </span>
                      {entry.collection ? (
                        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Expected collection by {formatDateOnly(entry.collection.dueDate)}</p>
                      ) : null}
                    </div>
                  </div>
                  {entry.collection ? (
                    <>
                      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                        Grace: {pluralize(entry.collection.graceWorkingDays, 'working day')} · Used: {pluralize(entry.collection.daysElapsed, 'working day')} ·{' '}
                        {entry.collection.isOverdue ? 'Remaining: none — overdue' : `Remaining: ${pluralize(entry.collection.daysRemaining, 'working day')}`} ·
                        Reminders sent: {entry.collection.remindersSent}
                      </p>
                      {entry.collection.lastSentAt ? (
                        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                          Last reminder sent by {entry.collection.lastSentByName ?? 'an unknown user'} on {formatDateOnly(entry.collection.lastSentAt)}.
                        </p>
                      ) : null}
                      {canNotify && entry.collection.dueNow ? (
                        <form action={sendVehicleServiceCollectionReminderFormAction} className="mt-3">
                          <FormPendingOverlay />
                          <input type="hidden" name="serviceId" value={entry.id} />
                          <SubmitButton
                            label={`Send ${ordinal(entry.collection.nextNumber)} collection reminder`}
                            pendingLabel="Sending…"
                            className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                          />
                        </form>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                          {ordinal(entry.collection.nextNumber)} collection reminder available from {formatDateOnly(entry.collection.dueFrom)} — reminders are spaced 2 working days apart.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showCancelled && summary.cancelledAwaitingHandBack.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-1 text-sm font-semibold text-[var(--ejo-text)]">Cancelled — Awaiting Hand-back</h2>
          <p className="mb-3 text-xs text-[var(--ejo-text-muted)]">
            Cancelled services whose vehicle is still with us. Grace: 7 working days, then numbered collection notices every 2 working
            days (Workshop Managers). Hand-back is done on the Vehicle Service page once any refund is complete.
          </p>
          <div className="space-y-3">
            {summary.cancelledAwaitingHandBack.map((entry: (typeof summary.cancelledAwaitingHandBack)[number]) => (
              <div
                key={entry.id}
                className={`rounded-[var(--ejo-radius-lg)] border p-4 ${entry.isOverdue ? 'border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <LoadingLink href={`/workshop/vehicle-service/${entry.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {entry.serviceNumber}
                    </LoadingLink>
                    <p className="text-sm text-[var(--ejo-text)]">
                      <CustomerLink id={entry.customerId} name={entry.customerName} canView={canSeeCustomers} /> · {entry.vehicleDescription}
                      {entry.plateNumber ? ` — ${entry.plateNumber}` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${entry.isOverdue ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
                    {entry.isOverdue ? 'Collection overdue' : 'Cancelled'} · {formatDateOnly(entry.cancelledAt)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                  Grace: {pluralize(entry.graceWorkingDays, 'working day')} · Since cancellation: {pluralize(entry.daysElapsed, 'working day')} · Notices sent: {entry.notice.sent}
                </p>
                {entry.refundOwed > 0 ? (
                  <p className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-1.5 text-xs text-[var(--ejo-text)]">
                    ₦{entry.refundOwed.toLocaleString('en-NG', { minimumFractionDigits: 2 })} still to be refunded before hand-back.
                  </p>
                ) : null}
                {entry.notice.lastSentAt ? (
                  <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                    Last notice sent by {entry.notice.lastSentByName ?? 'an unknown user'} on {formatDateOnly(entry.notice.lastSentAt)}.
                  </p>
                ) : null}
                {entry.notice.dueNow ? (
                  <form action={sendVehicleServiceCancelledCollectionNoticeFormAction} className="mt-3">
                    <FormPendingOverlay />
                    <input type="hidden" name="serviceId" value={entry.id} />
                    <SubmitButton
                      label={`Send ${ordinal(entry.notice.nextNumber)} collection notice`}
                      pendingLabel="Sending…"
                      className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    />
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                    {ordinal(entry.notice.nextNumber)} collection notice available from {formatDateOnly(entry.notice.dueFrom)}.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showDueSoon ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Due Soon</h2>
          {summary.dueSoon.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="key" title="Nothing due for service soon." /></div>
          ) : (
            <div className="space-y-3">
              {summary.dueSoon.map((entry: (typeof summary.dueSoon)[number]) => (
                <DueEntryCard key={entry.vehicleId} entry={entry} canSeeCustomers={canSeeCustomers} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showOverdue ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Overdue for Service</h2>
          {summary.overdue.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">{pluralize(0, 'vehicle')} overdue for service right now.</p>
          ) : (
            <div className="space-y-3">
              {summary.overdue.map((entry: (typeof summary.overdue)[number]) => (
                <DueEntryCard key={entry.vehicleId} entry={entry} canSeeCustomers={canSeeCustomers} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
