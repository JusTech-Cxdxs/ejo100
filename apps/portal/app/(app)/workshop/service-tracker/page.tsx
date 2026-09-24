import { getServiceTracker } from '@/lib/actions/vehicle-service';
import { getWorkshopBranchId } from '@/lib/actions/workshop';
import {
  attendToOverdueVehicleFormAction,
  sendManualServiceReminderFormAction,
  runServiceRemindersNowFormAction,
} from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

const STAGE_LABEL: Record<number, string> = { 1: '1st — Friendly', 2: '2nd — Follow-up', 3: '3rd — Due', 4: 'Overdue' };

type Filter = 'all' | 'overdue' | 'due_soon' | 'on_track' | 'in_workshop' | 'attended';

/**
 * Service Tracker — aftercare for every vehicle once it has left the
 * workshop. Where Vehicles In Custody covers vehicles physically with
 * us, this covers what happens next: when each vehicle is next due,
 * whether it's on track, due soon or overdue, whether it's already back
 * in, and every reminder sent for its current cycle — with the actions
 * to follow up right here.
 */
export default async function ServiceTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; status?: string; error?: string; sent?: string; evaluated?: string; failed?: string }>;
}) {
  const { filter: rawFilter, q, status, error, sent, evaluated, failed } = await searchParams;
  const filter: Filter = (['overdue', 'due_soon', 'on_track', 'in_workshop', 'attended'] as const).includes(rawFilter as never) ? (rawFilter as Filter) : 'all';
  const branchId = await getWorkshopBranchId();
  const { vehicles, remindersLast30Days, canRunReminders } = await getServiceTracker(branchId);

  const counts = {
    all: vehicles.length,
    overdue: vehicles.filter((v) => v.status === 'OVERDUE' && !v.attendedAt).length,
    due_soon: vehicles.filter((v) => v.status === 'DUE_SOON' && !v.attendedAt).length,
    on_track: vehicles.filter((v) => v.status === 'ON_TRACK').length,
    in_workshop: vehicles.filter((v) => v.inWorkshop).length,
    attended: vehicles.filter((v) => v.attendedAt).length,
  };
  const dueNow = vehicles.filter((v) => v.reminderDue).length;
  const query = q?.trim().toLowerCase();
  const shown = vehicles
    .filter((v) =>
      filter === 'all' ? true
        : filter === 'overdue' ? v.status === 'OVERDUE' && !v.attendedAt
          : filter === 'due_soon' ? v.status === 'DUE_SOON' && !v.attendedAt
            : filter === 'on_track' ? v.status === 'ON_TRACK'
              : filter === 'in_workshop' ? Boolean(v.inWorkshop)
                : Boolean(v.attendedAt),
    )
    .filter((v) => !query || [v.vehicleDescription, v.plateNumber ?? '', v.customerName, v.lastService.serviceNumber].join(' ').toLowerCase().includes(query));

  // Full, literal class names only — Tailwind generates just the classes
  // it can find as complete strings in the source.
  const TONE = {
    primary: { bg: 'bg-[var(--ejo-primary)]/5', border: 'border-[var(--ejo-primary)]/30', borderActive: 'border-[var(--ejo-primary)]', text: 'text-[var(--ejo-primary)]' },
    success: { bg: 'bg-[var(--ejo-success)]/5', border: 'border-[var(--ejo-success)]/30', borderActive: 'border-[var(--ejo-success)]', text: 'text-[var(--ejo-success)]' },
    warning: { bg: 'bg-[var(--ejo-warning)]/5', border: 'border-[var(--ejo-warning)]/30', borderActive: 'border-[var(--ejo-warning)]', text: 'text-[var(--ejo-warning)]' },
    error: { bg: 'bg-[var(--ejo-error)]/5', border: 'border-[var(--ejo-error)]/30', borderActive: 'border-[var(--ejo-error)]', text: 'text-[var(--ejo-error)]' },
    info: { bg: 'bg-[var(--ejo-info)]/5', border: 'border-[var(--ejo-info)]/30', borderActive: 'border-[var(--ejo-info)]', text: 'text-[var(--ejo-info)]' },
  } as const;
  const card = (key: Filter, label: string, value: number, tone: keyof typeof TONE) => {
    const t = TONE[tone];
    return (
      <LoadingLink
        key={key}
        href={`/workshop/service-tracker${key === 'all' ? '' : `?filter=${key}`}${q ? `${key === 'all' ? '?' : '&'}q=${encodeURIComponent(q)}` : ''}`}
        className={`block rounded-[var(--ejo-radius-lg)] border p-4 transition hover:opacity-80 ${t.bg} ${filter === key ? t.borderActive : t.border}`}
      >
        <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${t.text}`}>{value}</p>
      </LoadingLink>
    );
  };

  return (
    <div className="p-8">
      <LoadingLink href="/workshop" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Workshop
      </LoadingLink>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Service Tracker</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
            Aftercare for every vehicle once it has left the workshop — when it&apos;s next due (by mileage or date,
            whichever comes first), where it stands now, and every reminder sent. Vehicles still with us are on{' '}
            <LoadingLink href="/workshop/vehicle-service-custody" className="text-[var(--ejo-primary)] hover:underline">
              Vehicles In Custody
            </LoadingLink>
            .
          </p>
        </div>
        {canRunReminders && dueNow > 0 ? (
          <form action={runServiceRemindersNowFormAction}>
            <FormPendingOverlay />
            <SubmitButton
              label={`Send all ${pluralize(dueNow, 'due reminder')}`}
              pendingLabel="Sending…"
              className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        ) : null}
      </div>
      <p className="mb-6 text-xs text-[var(--ejo-text-muted)]">
        Reminders are sent by you, never automatically. The system works out when each one is due — a friendly note once a
        vehicle is due soon (within 1,000 km or 30 days), follow-ups at least 14 days apart, then an overdue reminder — and
        shows a Send button only then. Nothing is due while a vehicle is back in the workshop or once it&apos;s attended to.
      </p>

      {error ? (
        <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div>
      ) : null}
      {status === 'reminder_sent' ? (
        <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Reminder sent to the customer." /></div>
      ) : null}
      {status === 'attended' ? (
        <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Marked attended to — no further reminders for this prediction." /></div>
      ) : null}
      {status === 'reminders_run' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner
            kind="success"
            message={`Reminder run complete — ${pluralize(Number(evaluated ?? 0), 'vehicle')} needed a reminder, ${pluralize(Number(sent ?? 0), 'reminder')} sent${Number(failed ?? 0) > 0 ? `, ${failed} failed` : ''}.`}
          />
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {card('all', 'Tracked vehicles', counts.all, 'primary')}
        {card('on_track', 'On Track', counts.on_track, 'success')}
        {card('due_soon', 'Due Soon', counts.due_soon, 'warning')}
        {card('overdue', 'Overdue', counts.overdue, 'error')}
        {card('in_workshop', 'In Workshop', counts.in_workshop, 'info')}
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
          <p className="text-xs text-[var(--ejo-text-muted)]">Reminders sent (30 days)</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{remindersLast30Days}</p>
        </div>
      </div>

      <form className="mb-4 flex gap-2" action="/workshop/service-tracker">
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by vehicle, plate, customer or service number…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
          Search
        </button>
        {filter === 'attended' ? null : (
          <LoadingLink href="/workshop/service-tracker?filter=attended" className="inline-flex items-center px-2 text-xs text-[var(--ejo-text-muted)] hover:underline">
            Attended to ({counts.attended})
          </LoadingLink>
        )}
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          {vehicles.length === 0 ? 'No vehicles are being tracked yet — tracking starts the moment a Vehicle Service is completed.' : 'Nothing matches this view.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Vehicle / Customer</th>
                <th className="px-3 py-2">Last Service</th>
                <th className="px-3 py-2">Next Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reminders (this cycle)</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => {
                const left = [
                  v.kmRemaining !== null ? (v.kmRemaining <= 0 ? `${Math.abs(v.kmRemaining).toLocaleString('en-NG')} km over` : `${v.kmRemaining.toLocaleString('en-NG')} km left`) : null,
                  v.daysRemaining !== null ? (v.daysRemaining <= 0 ? `${pluralize(Math.abs(v.daysRemaining), 'day')} over` : `${pluralize(v.daysRemaining, 'day')} left`) : null,
                ].filter(Boolean).join(' · ');
                const badge = v.inWorkshop
                  ? { text: 'In Workshop', cls: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]' }
                  : v.attendedAt
                    ? { text: 'Attended To', cls: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' }
                    : v.status === 'OVERDUE'
                      ? { text: 'Overdue', cls: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' }
                      : v.status === 'DUE_SOON'
                        ? { text: 'Due Soon', cls: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' }
                        : { text: 'On Track', cls: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' };
              
                return (
                  <tr key={v.vehicleId} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2">
                      <LoadingLink href={`/workshop/vehicles/${v.vehicleId}/edit`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {v.vehicleDescription}
                      </LoadingLink>
                      <div className="text-xs text-[var(--ejo-text-muted)]">
                        {v.plateNumber ?? '—'} · {v.customerName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <LoadingLink href={`/workshop/vehicle-service/${v.lastService.id}`} className="text-[var(--ejo-primary)] hover:underline">
                        {v.lastService.serviceNumber}
                      </LoadingLink>
                      {v.viaJobCard ? (
                        <>
                          {' '}via{' '}
                          <LoadingLink href={`/workshop/job-cards/${v.viaJobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">
                            {v.viaJobCard.jobNumber}
                          </LoadingLink>
                        </>
                      ) : null}
                      <div className="text-[var(--ejo-text-muted)]">
                        {v.lastService.date ? formatDateOnly(v.lastService.date) : '—'}
                        {v.lastService.mileage != null ? ` · ${v.lastService.mileage.toLocaleString('en-NG')} km` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="text-[var(--ejo-text)]">
                        {v.nextServiceDueOdometer != null ? `${v.nextServiceDueOdometer.toLocaleString('en-NG')} km` : ''}
                        {v.nextServiceDueOdometer != null && v.nextServiceDueDate ? ' or ' : ''}
                        {v.nextServiceDueDate ? formatDateOnly(v.nextServiceDueDate) : ''}
                      </div>
                      {left ? <div className="text-[var(--ejo-text-muted)]">{left}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
                      {v.inWorkshop ? (
                        <div className="mt-1 text-xs">
                          <LoadingLink
                            href={v.inWorkshop.kind === 'JOB_CARD' ? `/workshop/job-cards/${v.inWorkshop.id}` : `/workshop/vehicle-service/${v.inWorkshop.id}`}
                            className="text-[var(--ejo-primary)] hover:underline"
                          >
                            {v.inWorkshop.number}
                          </LoadingLink>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                      {v.reminderDue ? (
                        <div className="mb-1 font-medium text-[var(--ejo-warning)]">Due now: {STAGE_LABEL[v.reminderDue.stage]}</div>
                      ) : v.nextReminderFrom ? (
                        <div className="mb-1">Next from {formatDateOnly(v.nextReminderFrom)}</div>
                      ) : v.inWorkshop ? (
                        <div className="mb-1">Held — in the workshop</div>
                      ) : null}
                      {v.reminders.sentThisCycle === 0 ? (
                        'None sent yet'
                      ) : (
                        <>
                          {pluralize(v.reminders.sentThisCycle, 'reminder')}
                          {v.reminders.lastSentAt ? (
                            <div>
                              Last: {v.reminders.lastStage ? STAGE_LABEL[v.reminders.lastStage] ?? `Stage ${v.reminders.lastStage}` : ''} — {formatDateTime(v.reminders.lastSentAt)}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        {v.reminderDue ? (
                          <form action={sendManualServiceReminderFormAction}>
                            <FormPendingOverlay />
                            <input type="hidden" name="vehicleId" value={v.vehicleId} />
                            <input type="hidden" name="returnTo" value="/workshop/service-tracker" />
                            <SubmitButton
                              label="Send reminder"
                              pendingLabel="Sending…"
                              className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                            />
                          </form>
                        ) : null}
                        {v.status === 'OVERDUE' && !v.attendedAt && !v.inWorkshop ? (
                          <form action={attendToOverdueVehicleFormAction}>
                            <FormPendingOverlay />
                            <input type="hidden" name="serviceId" value={v.lastService.id} />
                            <input type="hidden" name="returnTo" value="/workshop/service-tracker" />
                            <SubmitButton
                              label="Attend To"
                              pendingLabel="…"
                              className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-1 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                            />
                          </form>
                        ) : null}
                        {!v.inWorkshop ? (
                          <LoadingLink
                            href={`/workshop/vehicle-service/book?vehicleId=${v.vehicleId}`}
                            className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                          >
                            Book in
                          </LoadingLink>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
