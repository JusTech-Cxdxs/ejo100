import type { Metadata } from 'next';
import { getReminderFormOptions, previewReminderRecord } from '@/lib/actions/reminders';
import { createReminderFormAction } from '@/lib/actions/reminders-form-handlers';
import { PageHeader, EmptyState } from '@/components/ui';
import { myOrganisationId } from '@/lib/authz/server';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ReminderForm } from '@/components/reminders/ReminderForm';
import { lagosLocalInput, parseReminderPrefill } from '@/lib/reminders-rules';

export const metadata: Metadata = { title: 'New reminder' };

/** The next quarter hour, an hour from now. */
function suggestedTime(now = new Date()): string {
  const t = new Date(now.getTime() + 3_600_000);
  t.setUTCMinutes(Math.ceil(t.getUTCMinutes() / 15) * 15, 0, 0);
  return lagosLocalInput(t);
}

/**
 * New reminder. Accepts a pre-fill (from Enyo, a record page or an email):
 * ?title= &notes= &dueAt= &recordType= &recordId= &for=<colleague> — each
 * checked and clipped. The form is only filled in; nothing is saved until
 * the person presses Save.
 */
export default async function NewReminderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (!(await myOrganisationId())) {
    return <div className="p-4 sm:p-8"><PageHeader icon="clock" title="New reminder" back={{ href: '/reminders', label: 'Reminders' }} /><EmptyState icon="clock" title="Reminders are for people in an organisation">Your account is not linked to an organisation yet.</EmptyState></div>;
  }
  const prefill = parseReminderPrefill(params);
  const error = typeof params.error === 'string' ? params.error : null;
  const fromEnyo = params.source === 'enyo';
  const [options, record] = await Promise.all([
    getReminderFormOptions(),
    prefill.recordType && prefill.recordId ? previewReminderRecord(prefill.recordType, prefill.recordId) : Promise.resolve(null),
  ]);
  const choices = [{ id: options.me.id, label: `Me (${options.me.fullName})` }, ...options.owners.map((o) => ({ id: o.id, label: o.fullName }))];
  const askedFor = prefill.forUserId && prefill.forUserId !== options.me.id ? prefill.forUserId : null;
  const forAllowed = askedFor ? options.owners.some((o) => o.id === askedFor) : true;
  const notices: string[] = [];
  if (askedFor && !forAllowed) notices.push('That colleague has not allowed you to set reminders for them, so this one is for you. They can allow it on their Reminders page.');
  if (prefill.recordType && !record) notices.push('The record this reminder was about is not available to you, so it is not linked.');
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="clock" title="New reminder" back={{ href: '/reminders', label: 'Reminders' }} description={fromEnyo ? 'Enyo filled this in for you. Check it, then press Save reminder.' : 'It rings your bell when it is due, and can email you too.'} />
      {error ? <div className="max-w-2xl" role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {notices.map((n) => <div key={n} className="max-w-2xl" role="status"><FormFeedbackBanner kind="warning" message={n} /></div>)}
      <ReminderForm
        action={createReminderFormAction}
        submitLabel="Save reminder"
        source={fromEnyo ? 'enyo' : 'form'}
        forChoices={choices}
        values={{ title: prefill.title, notes: prefill.notes, dueAt: prefill.dueAt ?? suggestedTime(), viaEmail: true, forUserId: askedFor && forAllowed ? askedFor : options.me.id }}
        record={record && prefill.recordType && prefill.recordId ? { type: prefill.recordType, id: prefill.recordId, label: record.label, url: record.url } : null}
      />
    </div>
  );
}
