import { notFound } from 'next/navigation';
import { getAppointment } from '@/lib/actions/scheduling';
import { updateVisitorGroupFormAction } from '@/lib/actions/scheduling-form-handlers';
import { ScheduleNav } from '@/components/ScheduleNav';
import { VisitorGroupFields } from '@/components/VisitorGroupFields';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BackLink, PageTitle } from '@/components/ui';

/** Change one visitor group before they arrive. */
export default async function EditVisitorsPage({ params, searchParams }: { params: Promise<{ id: string; visitId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id, visitId } = await params;
  const { error } = await searchParams;
  const a = await getAppointment(id);
  const v = a?.visits.find((x) => x.id === visitId);
  if (!a || !v) notFound();
  return (
    <div className="p-4 sm:p-8">
      <BackLink href={`/schedule/${a.id}`} label={<>Back to {a.appointmentNumber}</>} className="mb-4" />
      <PageTitle icon="calendar" className="mb-4">Change visitors {v.visitNumber}</PageTitle>
      <ScheduleNav active="/schedule/appointments" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {v.status !== 'EXPECTED' ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">They have already arrived — the booking can no longer be changed.</p>
      ) : (
        <form action={updateVisitorGroupFormAction} className="max-w-2xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <FormPendingOverlay />
          <input type="hidden" name="appointmentId" value={a.id} />
          <input type="hidden" name="visitId" value={v.id} />
          <VisitorGroupFields defaults={{ names: [v.visitorName, ...v.memberNames], organisation: v.company, phone: v.phone, purpose: v.purpose }} />
          <SubmitButton label="Save visitors" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
        </form>
      )}
    </div>
  );
}
