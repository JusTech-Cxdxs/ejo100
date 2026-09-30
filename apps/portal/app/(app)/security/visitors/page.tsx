import { getSecurityRoles, listVisits, searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { registerVisitFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { VisitorRegisterForm } from '@/components/VisitorRegisterForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { VISIT_STATUS_LABEL, STATUS_CHIP, VEHICLE_TYPE_LABEL, durationText, minutesBetween } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';


export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; status?: string }> }) {
  const { q, error, status } = await searchParams;
  const [roles, visits] = await Promise.all([getSecurityRoles(), listVisits(q)]);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  return (
    <div className="p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">Visitors</h1>
      <SecurityNav active="/security/visitors" />
      {status === 'booking_cancelled' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Booking cancelled and removed — the cancellation is kept on the audit log." /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <form className="mb-4 flex flex-wrap gap-2">
            <input name="q" defaultValue={q ?? ''} placeholder="Search visit or pass number, name, company, plate…" className={`${input} max-w-md`} />
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text)]">Search</button>
          </form>
          {visits.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No visits{q ? ' match' : ' yet'}.</p> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {visits.map((v) => {
                const stayed = minutesBetween(v.checkedInAt, v.checkedOutAt);
                return (
                  <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                    <span className="min-w-0">
                      <LoadingLink href={`/security/visitors/${v.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{v.visitorName}</LoadingLink>
                      {v.partySize > 1 ? <span className="ml-2 text-[11px] text-[var(--ejo-text-muted)]">+ {pluralize(v.partySize - 1, 'other')} (group of {v.partySize})</span> : null}
                      {v.isWalkIn ? <span className="ml-2 text-[11px] text-[var(--ejo-text-muted)]">walk-in</span> : null}
                      {v.vehicleType !== 'ON_FOOT' ? <span className="ml-2 text-[11px] text-[var(--ejo-text-muted)]">{VEHICLE_TYPE_LABEL[v.vehicleType] ?? 'Vehicle'} {v.vehiclePlate}</span> : null}
                      <span className="block text-xs text-[var(--ejo-text-muted)]">
                        {v.visitNumber}{v.passNumber ? ` · ${v.passNumber}` : ''} · {v.company ? `${v.company} · ` : ''}{v.purpose} · visiting {v.host.fullName}
                      </span>
                      <span className="block text-xs text-[var(--ejo-text-muted)]">
                        {v.checkedInAt ? `In ${formatDateTimeCompact(v.checkedInAt)}` : v.expectedAt ? `Expected ${formatDateTimeCompact(v.expectedAt)}` : ''}
                        {v.checkedOutAt ? ` · out ${formatDateTimeCompact(v.checkedOutAt)}` : ''}
                        {stayed !== null ? ` · stayed ${durationText(stayed)}` : ''}
                      </span>
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CHIP[v.status]}`}>{VISIT_STATUS_LABEL[v.status]}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div id="register" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Register a visitor</h2>
          <VisitorRegisterForm canGate={roles.isGate} isFrontDesk={roles.isFrontDesk} meId={roles.userId} action={registerVisitFormAction} search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} />
        </div>
      </div>
    </div>
  );
}
