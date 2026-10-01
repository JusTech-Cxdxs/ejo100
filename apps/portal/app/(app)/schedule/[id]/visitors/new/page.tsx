import { notFound } from 'next/navigation';
import { getAppointment } from '@/lib/actions/scheduling';
import { addVisitorGroupFormAction } from '@/lib/actions/scheduling-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { VisitorGroupFields } from '@/components/VisitorGroupFields';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';

/** Add a visitor group to an appointment — one per company / person. */
export default async function AddVisitorsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const a = await getAppointment(id);
  if (!a) notFound();
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href={`/schedule/${a.id}`} className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to {a.appointmentNumber}</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Add visitors</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">{a.title} · {new Date(a.startsAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} — Security will expect them at that time.</p>
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
