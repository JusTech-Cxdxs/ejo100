import { guardAnyPage } from '@/lib/authz/server';
import { notFound, redirect } from 'next/navigation';
import { getVisit, getSecurityRoles, searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { updateBookingFormAction } from '@/lib/actions/security-form-handlers';
import { SecurityNav } from '@/components/SecurityNav';
import { VisitorRegisterForm } from '@/components/VisitorRegisterForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { BackLink, PageTitle } from '@/components/ui';

/** Change a booking before the visitor arrives. */
export default async function EditBookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['security.view'], '/security/visitors/edit');
  const { id } = await params;
  const { error } = await searchParams;
  const [v, roles] = await Promise.all([getVisit(id), getSecurityRoles()]);
  if (!v) notFound();
  // Bookings are changed at the desk only (updateBooking refuses anyone else).
  if (!roles.isFrontDesk) redirect(`/security/visitors/${v.id}`);
  const lagosLocal = (d: Date) => new Date(new Date(d).getTime() + 3600000).toISOString().slice(0, 16);
  return (
    <div className="p-4 sm:p-8">
      <BackLink href={`/security/visitors/${v.id}`} label={<>Back to {v.visitNumber}</>} className="mb-4" />
      <PageTitle icon="badge" className="mb-4">Edit booking {v.visitNumber}</PageTitle>
      <SecurityNav active="/security/visitors" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {v.status !== 'EXPECTED' ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">This visitor has already arrived — the booking can no longer be changed.</p>
      ) : (
        <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <VisitorRegisterForm
            canGate={false}
            isFrontDesk={roles.isFrontDesk}
            meId={roles.userId}
            action={updateBookingFormAction}
            search={searchStaffOptions}
            loadDefaultOptions={loadStaffOptions}
            booking={{
              visitId: v.id, visitorName: v.visitorName, partySize: v.partySize, memberNames: v.memberNames, company: v.company, phone: v.phone, purpose: v.purpose,
              hostUserId: v.host.id, hostLabel: v.host.fullName, expectedAt: v.expectedAt ? lagosLocal(v.expectedAt) : '', expectedDurationMinutes: v.expectedDurationMinutes, notes: v.notes,
            }}
          />
        </div>
      )}
    </div>
  );
}
