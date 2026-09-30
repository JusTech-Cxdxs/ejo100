import { getSchedulingAccess, listRooms } from '@/lib/actions/scheduling';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { createAppointmentFormAction } from '@/lib/actions/scheduling-form-handlers';
import { ScheduleNav } from '@/components/ScheduleNav';
import { AppointmentForm } from '@/components/AppointmentForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [access, rooms] = await Promise.all([getSchedulingAccess(), listRooms()]);
  return (
    <div className="p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">New appointment</h1>
      <ScheduleNav active="/schedule/new" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {!access.canUse ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">You do not have a calendar to book on yet.</p>
      ) : (
        <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <AppointmentForm owners={access.owners} rooms={rooms} action={createAppointmentFormAction} search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} />
        </div>
      )}
    </div>
  );
}
