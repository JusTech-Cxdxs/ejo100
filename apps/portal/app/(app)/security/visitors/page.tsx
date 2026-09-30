import { getSecurityRoles, listVisits, searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { registerVisitFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { VISIT_STATUS_LABEL, STATUS_CHIP, VEHICLE_TYPE_LABEL, durationText, minutesBetween } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const STAY = [30, 60, 90, 120, 180, 240, 300, 360, 480];

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { q, error } = await searchParams;
  const [roles, visits] = await Promise.all([getSecurityRoles(), listVisits(q)]);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">Visitors</h1>
      <SecurityNav active="/security/visitors" />
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

        <form id="register" action={registerVisitFormAction} className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Register a visitor</h2>
          {roles.isGate ? (
            <div>
              <label className={label}>Type</label>
              <select name="mode" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                <option value="ARRIVED">At the gate now — record and issue a pass</option>
                <option value="EXPECTED">Expected later (pre-register)</option>
              </select>
            </div>
          ) : (
            <input type="hidden" name="mode" value="EXPECTED" />
          )}
          <div><label className={label}>Visitor&apos;s name</label><input name="visitorName" required className={input} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Company</label><input name="company" className={input} /></div>
            <div><label className={label}>Phone</label><input name="phone" className={input} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>ID type</label><input name="idType" placeholder="e.g. NIN, driver's licence" className={input} /></div>
            <div><label className={label}>ID number</label><input name="idNumber" className={input} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Came by</label>
              <select name="vehicleType" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {Object.entries(VEHICLE_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div><label className={label}>Plate number (if a vehicle)</label><input name="vehiclePlate" className={input} /></div>
          </div>
          <div><label className={label}>Purpose of visit</label><input name="purpose" required className={input} /></div>
          {roles.isFrontDesk ? (
            <div>
              <label className={label}>Visiting</label>
              <SearchableSelect name="hostUserId" required search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name or ID…" emptyMessage="No active staff match." minQueryLength={1} />
            </div>
          ) : (
            <>
              <input type="hidden" name="hostUserId" value={roles.userId} />
              <p className="text-xs text-[var(--ejo-text-muted)]">You are the host.</p>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Expected arrival (pre-register)</label><input name="expectedAt" type="datetime-local" className={input} /></div>
            <div>
              <label className={label}>Expected stay</label>
              <select name="expectedMinutes" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {STAY.map((m) => <option key={m} value={m}>{durationText(m)}</option>)}
              </select>
            </div>
          </div>
          <div><label className={label}>Notes</label><input name="notes" className={input} /></div>
          <SubmitButton label="Register visitor" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          <p className="text-[11px] text-[var(--ejo-text-muted)]">Past the expected stay, the Chief Security Officer is alerted.</p>
        </form>
      </div>
    </div>
  );
}
