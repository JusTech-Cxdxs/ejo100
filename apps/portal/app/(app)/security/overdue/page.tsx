import { listOverdue, getSecurityRoles } from '@/lib/actions/security';
import { visitActionFormAction, extendExitPassFormAction, securityFollowUpFormAction, roadTestActionFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { durationText } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const EXTRA = [15, 30, 60, 90, 120, 180, 240];
const DONE: Record<string, string> = { extend: 'Time extended.', extended: 'Return time extended.', follow_up: 'Follow-up saved on the record.' };

/** The Chief Security Officer's follow-up desk: who is overdue, by how
 * much — extend their time or record the follow-up, right here. */
export default async function OverduePage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const { status, error } = await searchParams;
  const [o, roles] = await Promise.all([listOverdue(), getSecurityRoles()]);
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]';
  const small = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Extend = ({ kind, id }: { kind: 'visit' | 'pass'; id: string }) => (
    <form action={kind === 'visit' ? visitActionFormAction : extendExitPassFormAction} className="flex flex-wrap gap-1">
      <FormPendingOverlay />
      <input type="hidden" name={kind === 'visit' ? 'visitId' : 'passId'} value={id} />
      {kind === 'visit' ? <input type="hidden" name="action" value="extend" /> : null}
      <input type="hidden" name="returnTo" value="/security/overdue" />
      <select name="extraMinutes" required defaultValue="" className={input}>
        <option value="" disabled>Extend by…</option>
        {EXTRA.map((m) => <option key={m} value={m}>{durationText(m)}</option>)}
      </select>
      <input name="reason" required placeholder="Reason" className={`${input} min-w-0 flex-1`} />
      <SubmitButton label="Extend" pendingLabel="…" className={small} />
    </form>
  );
  const FollowUp = ({ type, id }: { type: 'Visit' | 'ExitPass' | 'RoadTestPermit'; id: string }) => (
    <form action={securityFollowUpFormAction} className="mt-1 flex flex-wrap gap-1">
      <FormPendingOverlay />
      <input type="hidden" name="entityType" value={type} />
      <input type="hidden" name="entityId" value={id} />
      <input type="hidden" name="returnTo" value="/security/overdue" />
      <input name="note" required placeholder="Follow-up note (e.g. called — on the way)" className={`${input} min-w-0 flex-1`} />
      <SubmitButton label="Save" pendingLabel="…" className={small} />
    </form>
  );
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Overdue</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Visitors past their expected stay and people past their return time. Follow up, extend their time, or check them out / in at the gate.</p>
      <SecurityNav active="/security/overdue" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Visitors ({o.visits.length})</h2>
      <div className="mb-8">
        <SecurityTable headers={['Visitor', 'Visiting', 'Time in', 'Overdue by', roles.isFrontDesk ? 'Follow up / extend' : '', '']} widths={['20%', '14%', '12%', '11%', '36%', '7%']} empty={o.visits.length ? null : 'No visitor is overdue.'}>
          {o.visits.map((v) => (
            <tr key={v.id}>
              <td><span className="font-medium text-[var(--ejo-text)]">{v.visitorName}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{v.passNumber}{v.phone ? ` · ${v.phone}` : ''}</span></td>
              <td>{v.host.fullName}</td>
              <td className="text-xs">{v.checkedInAt ? formatDateTimeCompact(v.checkedInAt) : '—'}</td>
              <td className="text-xs font-semibold text-[var(--ejo-error)]">{durationText(v.overdueMinutes)}</td>
              <td>{roles.isFrontDesk ? <><Extend kind="visit" id={v.id} /><FollowUp type="Visit" id={v.id} /></> : null}</td>
              <td><LoadingLink href={`/security/visitors/${v.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">Open</LoadingLink></td>
            </tr>
          ))}
        </SecurityTable>
      </div>
      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Road tests ({o.roadTests.length})</h2>
      <div className="mb-8">
        <SecurityTable headers={['Permit', 'Vehicle / driver', 'Out', 'Late by', roles.isGate ? 'Follow up / extend' : '', '']} widths={['12%', '22%', '12%', '11%', '36%', '7%']} empty={o.roadTests.length ? null : 'No road test is late.'}>
          {o.roadTests.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.permitNumber}</td>
              <td>{r.vehicle.plateNumber ?? 'Vehicle'}<span className="block text-xs text-[var(--ejo-text-muted)]">{r.driver.fullName} · {r.jobCard?.jobNumber ?? r.vehicleService?.serviceNumber ?? ''}</span></td>
              <td className="text-xs">{r.gateOutAt ? formatDateTimeCompact(r.gateOutAt) : '—'}</td>
              <td className="text-xs font-semibold text-[var(--ejo-error)]">{durationText(r.overdueMinutes)}</td>
              <td>
                {roles.isGate ? (
                  <>
                    <form action={roadTestActionFormAction} className="flex flex-wrap gap-1">
                      <FormPendingOverlay />
                      <input type="hidden" name="permitId" value={r.id} />
                      <input type="hidden" name="action" value="extend" />
                      <input type="hidden" name="returnTo" value="/security/overdue" />
                      <select name="extraMinutes" required defaultValue="" className={input}><option value="" disabled>Extend by…</option>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{durationText(m)}</option>)}</select>
                      <input name="reason" required placeholder="Reason" className={`${input} min-w-0 flex-1`} />
                      <SubmitButton label="Extend" pendingLabel="…" className={small} />
                    </form>
                    <FollowUp type="RoadTestPermit" id={r.id} />
                  </>
                ) : null}
              </td>
              <td><LoadingLink href={`/security/road-tests/${r.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">Open</LoadingLink></td>
            </tr>
          ))}
        </SecurityTable>
      </div>
      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Exit passes ({o.passes.length})</h2>
      <SecurityTable headers={['Pass', 'People', 'Expected back', 'Late by', roles.isGate ? 'Follow up / extend' : '', '']} widths={['12%', '22%', '12%', '11%', '36%', '7%']} empty={o.passes.length ? null : 'Nobody is late back.'}>
        {o.passes.map((p) => (
          <tr key={p.id}>
            <td className="font-medium">{p.passNumber}</td>
            <td>{p.people.map((x, i) => <span key={i} className="block">{x.name}</span>)}<span className="block text-xs text-[var(--ejo-text-muted)]">{p.reason}</span></td>
            <td className="text-xs">{p.expectedReturnAt ? formatDateTimeCompact(p.expectedReturnAt) : '—'}</td>
            <td className="text-xs font-semibold text-[var(--ejo-error)]">{durationText(p.overdueMinutes)}</td>
            <td>{roles.isGate ? <><Extend kind="pass" id={p.id} /><FollowUp type="ExitPass" id={p.id} /></> : null}</td>
            <td><LoadingLink href={`/security/exit-passes/${p.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">Open</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
