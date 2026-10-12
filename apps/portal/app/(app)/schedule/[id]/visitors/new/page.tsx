import { guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getAppointment } from '@/lib/actions/scheduling';
import { addVisitorGroupFormAction } from '@/lib/actions/scheduling-form-handlers';
import { ScheduleNav } from '@/components/ScheduleNav';
import { VisitorGroupFields } from '@/components/VisitorGroupFields';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BackLink, PageTitle } from '@/components/ui';

/** Add a visitor group to an appointment — one per company / person. */
export default async function AddVisitorsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  // Calendars are for people who keep one (an appointment itself stays open to the people in it).
  await guardAnyPage(['schedule.view', 'schedule.manage'], '/schedule');
  const { id } = await params;
  const { error } = await searchParams;
  const a = await getAppointment(id);
  if (!a) notFound();
  return (
    <div className="p-4 sm:p-8">
      <BackLink href={`/schedule/${a.id}`} label={<>Back to {a.appointmentNumber}</>} className="mb-4" />
      <PageTitle icon="calendar">Add visitors</PageTitle>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">{a.title} · {new Date(a.startsAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', hourCycle: 'h12', minute: '2-digit' })} — Security will expect them at that time.</p>
      <ScheduleNav active="/schedule/appointments" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <form action={addVisitorGroupFormAction} className="max-w-2xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <FormPendingOverlay />
        <input type="hidden" name="appointmentId" value={a.id} />
        <VisitorGroupFields />
        <SubmitButton label="Add visitors" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
      </form>
    </div>
  );
}
