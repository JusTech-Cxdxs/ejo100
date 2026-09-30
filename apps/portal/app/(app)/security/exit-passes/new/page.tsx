import { getMe, searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { createExitPassFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { ExitPassPeopleFields } from '@/components/ExitPassPeopleFields';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';

export default async function NewExitPassPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await getMe();
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-8">
      <LoadingLink href="/security/exit-passes" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Exit passes</LoadingLink>
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">Request an exit pass</h1>
      <SecurityNav active="/security/exit-passes" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <form action={createExitPassFormAction} className="max-w-3xl space-y-5 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <FormPendingOverlay />
        <div>
          <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Who is going out</h2>
          <ExitPassPeopleFields me={{ id: me.id, label: me.fullName }} search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} />
          <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Everyone on one pass goes out and comes back together. Employee ID, designation and department are taken from each person&apos;s profile.</p>
        </div>
        <div><label className={label}>Reason</label><textarea name="reason" required rows={3} className={input} /></div>
        <div>
          <label className={label}>Return</label>
          <select name="returning" required defaultValue="" className={input}>
            <option value="" disabled>Choose…</option>
            <option value="yes">Return — coming back today</option>
            <option value="no">No return</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label}>Time out (planned)</label><input name="expectedOutAt" type="datetime-local" className={input} /></div>
          <div><label className={label}>Expected time in (if returning)</label><input name="expectedReturnAt" type="datetime-local" className={input} /></div>
        </div>
        <p className="text-xs text-[var(--ejo-text-muted)]">Authorised by your Department Head, then approved by the Manager. Security records the actual time out and time in; if someone is not back on time, the Chief Security Officer is alerted.</p>
        <SubmitButton label="Submit for approval" pendingLabel="Submitting…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
      </form>
    </div>
  );
}
