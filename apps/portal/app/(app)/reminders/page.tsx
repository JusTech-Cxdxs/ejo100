import type { Metadata } from 'next';
import { listMyReminders, listReminderDelegates } from '@/lib/actions/reminders';
import { grantDelegateFormAction, withdrawDelegateFormAction } from '@/lib/actions/reminders-form-handlers';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { currentAssist, myOrganisationId } from '@/lib/authz/server';
import { PageHeader, HeaderAction, SectionCard, EmptyState } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { LoadingLink } from '@/components/LoadingLink';
import { ReminderCard } from '@/components/reminders/ReminderCard';
import { plural } from '@/lib/reminders-rules';
import { formatDateOnly } from '@/lib/utils/format-date';

export const metadata: Metadata = { title: 'Reminders' };

const DONE: Record<string, string> = {
  created: 'Reminder set.',
  set_for_colleague: 'Reminder set for your colleague. It is on their Reminders page.',
  updated: 'Reminder saved.',
  done: 'Marked done.',
  cancelled: 'Reminder cancelled.',
  snoozed_hour: 'Snoozed for an hour.',
  snoozed_tomorrow: 'Snoozed until 9 am tomorrow.',
  delegate_granted: 'Done. They can now set reminders for you.',
  delegate_withdrawn: 'Withdrawn. They can no longer set reminders for you.',
};

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; focus?: string }> }) {
  const { status, error, focus } = await searchParams;
  if (!(await myOrganisationId())) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader icon="clock" title="Reminders" />
        <EmptyState icon="clock" title="Reminders are for people in an organisation">Your account is not linked to an organisation yet. Ask your administrator.</EmptyState>
      </div>
    );
  }
  const [lists, people, assist] = await Promise.all([listMyReminders(), listReminderDelegates(), currentAssist()]);
  const { overdue, upcoming, done } = lists;
  const open = overdue.length + upcoming.length;
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="clock"
        title="Reminders"
        description="Notes to your future self — and from colleagues you allow. A reminder rings your bell when it is due, and can email you too."
        actions={<HeaderAction href="/reminders/new">New reminder</HeaderAction>}
        meta={<span className="text-xs text-[var(--ejo-text-muted)]">{overdue.length ? `${plural(overdue.length, 'reminder')} due now · ` : ''}{plural(upcoming.length, 'upcoming reminder')}</span>}
      />
      {status && DONE[status] ? <div className="max-w-3xl" role="status"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="max-w-3xl" role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {overdue.length ? (
            <SectionCard icon="bell" tone="warning" title="Due now" description="Mark done, snooze, or open what it is about.">
              <ul className="space-y-3">{overdue.map((r) => <ReminderCard key={r.id} r={r} bucket="overdue" focused={focus === r.id} />)}</ul>
            </SectionCard>
          ) : null}
          <SectionCard icon="calendar" title="Upcoming">
            {upcoming.length ? (
              <ul className="space-y-3">{upcoming.map((r) => <ReminderCard key={r.id} r={r} bucket="upcoming" focused={focus === r.id} />)}</ul>
            ) : (
              <EmptyState compact icon="clock" title={open ? 'Nothing else coming up' : 'No reminders yet'} action={<HeaderAction href="/reminders/new">New reminder</HeaderAction>}>
                Set one for a call back, a promised update or a payment to chase. You can also ask Enyo: “remind me tomorrow at 10 to call Mr Okafor”.
              </EmptyState>
            )}
          </SectionCard>
          {done.length ? (
            <SectionCard icon="check-circle" title="Done and cancelled" description="The last 30.">
              <ul className="space-y-3">{done.map((r) => <ReminderCard key={r.id} r={r} bucket="done" />)}</ul>
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard icon="users" title="Who may set reminders for me" description="Colleagues you allow can add reminders to your list (a PA or your supervisor, for example). Only you can change or close them.">
            {people.delegates.length ? (
              <ul className="mb-4 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                {people.delegates.map((d) => (
                  <li key={d.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ejo-text)]">{d.fullName}</p>
                      <p className="text-xs text-[var(--ejo-text-muted)]">Since {formatDateOnly(d.since)}</p>
                    </div>
                    {assist ? null : (
                      <form action={withdrawDelegateFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="delegateId" value={d.userId} />
                        <SubmitButton label="Withdraw" pendingLabel="…" ariaLabel={`Withdraw ${d.fullName}`} className="min-h-10 px-2 text-xs font-medium text-[var(--ejo-error)] hover:underline" />
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="mb-4 text-sm text-[var(--ejo-text-muted)]">Nobody yet — only you can set your reminders.</p>}
            {assist ? (
              <p className="text-xs text-[var(--ejo-text-muted)]">This can only be changed by the person themselves, not during an assisted session.</p>
            ) : (
              <form action={grantDelegateFormAction} className="space-y-3">
                <FormPendingOverlay />
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="delegate-pick">Allow a colleague</label>
                  <SearchableSelect id="delegate-pick" name="delegateId" required search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} defaultOptionsLabel="Colleagues" placeholder="Search colleagues by name…" emptyMessage="No active colleague matches." minQueryLength={1} />
                </div>
                <SubmitButton label="Allow" pendingLabel="Saving…" className="min-h-11 w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110" />
              </form>
            )}
          </SectionCard>
          {people.canSetFor.length ? (
            <SectionCard icon="user-plus" title="You can set reminders for" description="These colleagues allowed you.">
              <ul className="space-y-1">
                {people.canSetFor.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-[var(--ejo-text)]">{o.fullName}</span>
                    <LoadingLink href={`/reminders/new?for=${o.id}`} className="inline-flex min-h-10 items-center text-xs font-medium text-[var(--ejo-primary)] hover:underline">Set one</LoadingLink>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
