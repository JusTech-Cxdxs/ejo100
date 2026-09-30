import { listDelegations, getSchedulingAccess } from '@/lib/actions/scheduling';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { addDelegateFormAction, removeDelegateFormAction } from '@/lib/actions/scheduling-form-handlers';
import { ScheduleNav } from '@/components/ScheduleNav';
import { SecurityTable } from '@/components/SecurityTable';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateOnly } from '@/lib/utils/format-date';

const DONE: Record<string, string> = { aide_added: 'Aide added — they have been emailed.', aide_removed: 'Aide removed.' };

export default async function AidesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const { status, error } = await searchParams;
  const [rows, access] = await Promise.all([listDelegations(), getSchedulingAccess()]);
  const canAdd = access.isAdmin || access.isCalendarUser;
  const officials = access.isAdmin ? access.owners : access.owners.filter((o) => o.mine);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Aides</h1>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-[var(--ejo-text-muted)]">An aide (PA, secretary or assistant) can book, change and cancel appointments on an official&apos;s calendar. Officials add their own aides; a Scheduling Admin can add any.</p>
      <ScheduleNav active="/schedule/aides" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SecurityTable headers={['Official', 'Aide', 'Added', '']} widths={['32%', '32%', '20%', '16%']} empty={rows.length ? null : 'No aides yet.'}>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="font-medium">{d.owner.fullName}</td>
              <td>{d.delegate.fullName}</td>
              <td className="text-xs">{formatDateOnly(d.createdAt)} · {d.createdBy.fullName}</td>
              <td>
                {access.isAdmin || d.owner.id === access.userId ? (
                  <form action={removeDelegateFormAction}><FormPendingOverlay /><input type="hidden" name="delegationId" value={d.id} /><SubmitButton label="Remove" pendingLabel="…" className="text-xs font-medium text-[var(--ejo-error)] hover:underline" /></form>
                ) : null}
              </td>
            </tr>
          ))}
        </SecurityTable>
        {canAdd && officials.length ? (
          <form action={addDelegateFormAction} className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
            <FormPendingOverlay />
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add an aide</h2>
            {officials.length === 1 ? (
              <><input type="hidden" name="ownerId" value={officials[0]!.id} /><p className="text-sm text-[var(--ejo-text)]">For: <span className="font-medium">{officials[0]!.fullName}</span></p></>
            ) : (
              <div>
                <label className={label}>Official</label>
                <select name="ownerId" required defaultValue="" className={input}>
                  <option value="" disabled>Choose…</option>
                  {officials.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={label}>Aide</label>
              <SearchableSelect name="delegateId" required search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name…" emptyMessage="No active staff match." minQueryLength={1} />
            </div>
            <SubmitButton label="Add aide" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90" />
          </form>
        ) : null}
      </div>
    </div>
  );
}
