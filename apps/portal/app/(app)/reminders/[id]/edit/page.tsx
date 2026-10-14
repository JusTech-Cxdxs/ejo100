import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMyReminder } from '@/lib/actions/reminders';
import { updateReminderFormAction } from '@/lib/actions/reminders-form-handlers';
import { PageHeader, EmptyState, HeaderAction } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ReminderForm } from '@/components/reminders/ReminderForm';
import { isId, lagosLocalInput } from '@/lib/reminders-rules';

export const metadata: Metadata = { title: 'Edit reminder' };

export default async function EditReminderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!isId(id)) notFound();
  const r = await getMyReminder(id);
  if (!r) notFound();
  const closed = r.status === 'DONE' || r.status === 'CANCELLED';
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="clock" title="Edit reminder" back={{ href: '/reminders', label: 'Reminders' }} description={r.setBy ? `Set for you by ${r.setBy}.` : undefined} />
      {error ? <div className="max-w-2xl" role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {closed ? (
        <EmptyState icon="check-circle" title={r.status === 'DONE' ? 'This reminder is done' : 'This reminder was cancelled'} action={<HeaderAction href="/reminders/new">New reminder</HeaderAction>}>
          Closed reminders cannot be changed. Set a new one instead.
        </EmptyState>
      ) : (
        <ReminderForm
          action={updateReminderFormAction}
          submitLabel="Save changes"
          reminderId={r.id}
          values={{ title: r.title, notes: r.notes ?? '', dueAt: lagosLocalInput(r.dueAt), viaEmail: r.viaEmail }}
          linked={r.record}
        />
      )}
    </div>
  );
}
