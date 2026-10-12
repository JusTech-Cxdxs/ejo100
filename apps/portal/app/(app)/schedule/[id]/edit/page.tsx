import { guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getSchedulingAccess, getAppointment, listRooms } from '@/lib/actions/scheduling';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { updateAppointmentFormAction } from '@/lib/actions/scheduling-form-handlers';
import { ScheduleNav } from '@/components/ScheduleNav';
import { AppointmentForm } from '@/components/AppointmentForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { BackLink, PageTitle } from '@/components/ui';

export default async function EditAppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  // Calendars are for people who keep one (an appointment itself stays open to the people in it).
  await guardAnyPage(['schedule.view', 'schedule.manage'], '/schedule');
  const { id } = await params;
  const { error } = await searchParams;
  const [access, a, rooms] = await Promise.all([getSchedulingAccess(), getAppointment(id), listRooms()]);
  if (!a) notFound();
  const local = new Date(new Date(a.startsAt).getTime() + 3600000).toISOString();
  const owners = access.owners.some((o) => o.id === a.ownerId) ? access.owners : [{ id: a.owner.id, fullName: a.owner.fullName, mine: false }, ...access.owners];
  return (
    <div className="p-4 sm:p-8">
      <BackLink href={`/schedule/${a.id}`} label={<>Back to {a.appointmentNumber}</>} className="mb-4" />
      <PageTitle icon="calendar" className="mb-4">Change {a.appointmentNumber}</PageTitle>
      <ScheduleNav active="/schedule/appointments" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {a.status !== 'SCHEDULED' ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">This appointment is closed and can no longer be changed.</p>
      ) : (
        <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <AppointmentForm
            owners={owners}
            rooms={rooms}
            action={updateAppointmentFormAction}
            search={searchStaffOptions}
            loadDefaultOptions={loadStaffOptions}
            defaults={{
              appointmentId: a.id, ownerId: a.ownerId, title: a.title, agenda: a.agenda, date: local.slice(0, 10), time: local.slice(11, 16),
              duration: Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000), roomId: a.roomId, location: a.location,
              participants: a.participants.map((p) => p.user),
            }}
          />
        </div>
      )}
    </div>
  );
}
