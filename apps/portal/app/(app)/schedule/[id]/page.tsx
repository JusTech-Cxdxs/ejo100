import { notFound } from 'next/navigation';
import { getAppointment, getAppointmentHistory, getSchedulingAccess } from '@/lib/actions/scheduling';
import { appointmentActionFormAction } from '@/lib/actions/scheduling-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { VISIT_STATUS_LABEL } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

const DONE: Record<string, string> = {
  created: 'Appointment booked — the host and participants have been emailed.',
  changed: 'Appointment updated — everyone involved has been emailed.',
  cancel: 'Appointment cancelled — everyone involved has been emailed.',
  complete: 'Marked as completed.',
  no_show: 'Marked as a no-show.',
};
const STATUS: Record<string, string> = { SCHEDULED: 'Scheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' };

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [a, history, access] = await Promise.all([getAppointment(id), getAppointmentHistory(id), getSchedulingAccess()]);
  if (!a) notFound();
  const canManage = access.isAdmin || a.ownerId === access.userId || access.owners.some((o) => o.id === a.ownerId);
  const started = new Date(a.startsAt).getTime() <= Date.now();
  const t = (d: Date) => new Date(d).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="appointmentId" value={a.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/schedule" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to the calendar</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{a.title}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{a.appointmentNumber} · {new Date(a.startsAt).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {t(a.startsAt)} – {t(a.endsAt)}</p>
        </div>
        <span className="rounded-full bg-[var(--ejo-info)]/15 px-3 py-1 text-sm font-medium text-[var(--ejo-info)]">{STATUS[a.status]}</span>
      </div>
      <ScheduleNav active="/schedule" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <Row k="Host (calendar)" val={a.owner.fullName} />
          <Row k="Booked by" val={a.createdBy.fullName} />
          <Row k="Where" val={a.room ? `${a.room.name}${a.room.location ? ` · ${a.room.location}` : ''}` : a.location} />
          <Row k="Agenda" val={a.agenda} />
          <Row k="Staff taking part" val={a.participants.map((p) => p.user.fullName).join(', ') || null} />
          <Row k="Visitors" val={a.visit ? [a.visit.visitorName, ...a.visit.memberNames].join(', ') + (a.visit.company ? ` (${a.visit.company})` : '') : null} />
          <Row k="Cancelled because" val={a.cancelReason} />
          <Row k="Completed" val={a.completedAt ? formatDateTime(a.completedAt) : null} />
          {a.visit ? (
            <p className="mt-2 text-xs">
              <LoadingLink href={`/security/visitors/${a.visit.id}`} className="text-[var(--ejo-primary)] hover:underline">
                Security booking {a.visit.visitNumber} — {VISIT_STATUS_LABEL[a.visit.status]}{a.visit.checkedInAt ? `, arrived ${formatDateTime(a.visit.checkedInAt)}` : ''} →
              </LoadingLink>
            </p>
          ) : null}
        </dl>
        <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {a.status !== 'SCHEDULED' ? <p className="text-sm text-[var(--ejo-text-muted)]">This appointment is closed.</p> : !canManage ? <p className="text-sm text-[var(--ejo-text-muted)]">You are taking part in this appointment.</p> : (
            <>
              <LoadingLink href={`/schedule/${a.id}/edit`} className={`inline-block ${line}`}>Change</LoadingLink>
              {started ? (
                <div className="flex flex-wrap gap-2">
                  <form action={appointmentActionFormAction}><Hidden action="complete" /><SubmitButton label="Mark completed" pendingLabel="Saving…" className={btn} /></form>
                  <form action={appointmentActionFormAction}><Hidden action="no_show" /><SubmitButton label="Mark no-show" pendingLabel="Saving…" className={line} /></form>
                </div>
              ) : null}
              <form action={appointmentActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="cancel" /><input name="reason" required placeholder="Reason for cancelling" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Cancel appointment" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
            </>
          )}
        </div>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
