import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon } from '@/components/ui';
import { DueAtField } from './DueAtField';
import { NOTES_MAX, TITLE_MAX } from '@/lib/reminders-rules';

const input = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * The reminder form (new and edit). Server-rendered: it works before any
 * script has loaded, and nothing is saved until Save is pressed.
 */
export function ReminderForm({
  action,
  submitLabel,
  values,
  reminderId,
  forChoices,
  record,
  source,
  linked,
}: {
  action: (f: FormData) => Promise<void>;
  submitLabel: string;
  values: { title?: string; notes?: string; dueAt: string; viaEmail: boolean; forUserId?: string };
  reminderId?: string;
  /** Who it is for: me and the colleagues who allowed me (new reminders only). */
  forChoices?: { id: string; label: string }[];
  /** The linked record (already checked: the person may open it). */
  record?: { type: string; id: string; label: string; url: string | null } | null;
  source?: 'form' | 'enyo';
  /** Edit page: the record it is linked to, with a "remove the link" choice (links are added only on new reminders). */
  linked?: { label: string; url: string | null } | null;
}) {
  return (
    <form action={action} className="relative max-w-2xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
      <FormPendingOverlay />
      {reminderId ? <input type="hidden" name="reminderId" value={reminderId} /> : null}
      {source === 'enyo' ? <input type="hidden" name="source" value="enyo" /> : null}
      {forChoices && forChoices.length > 1 ? (
        <div>
          <label htmlFor="reminder-for" className={label}>Who is it for?</label>
          <select id="reminder-for" name="forUserId" defaultValue={values.forUserId ?? forChoices[0]!.id} className={input}>
            {forChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Only colleagues who have allowed you are listed.</p>
        </div>
      ) : null}
      <div>
        <label htmlFor="reminder-title" className={label}>What to remember</label>
        <input id="reminder-title" name="title" required maxLength={TITLE_MAX} defaultValue={values.title ?? ''} placeholder="Call the customer about the estimate" className={input} autoComplete="off" />
      </div>
      <DueAtField defaultValue={values.dueAt} />
      <div>
        <label htmlFor="reminder-notes" className={label}>Notes (optional)</label>
        <textarea id="reminder-notes" name="notes" rows={3} maxLength={NOTES_MAX} defaultValue={values.notes ?? ''} className={`${input} min-h-24`} />
      </div>
      {record ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm">
          <input type="hidden" name="recordType" value={record.type} />
          <input type="hidden" name="recordId" value={record.id} />
          <Icon name="file" size={16} className="text-[var(--ejo-text-muted)]" />
          <span className="text-[var(--ejo-text-muted)]">About:</span>
          {record.url ? <LoadingLink href={record.url} className="font-medium text-[var(--ejo-primary)] hover:underline">{record.label}</LoadingLink> : <span className="font-medium text-[var(--ejo-text)]">{record.label}</span>}
        </div>
      ) : null}
      {linked ? (
        <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm">
          <p>
            <span className="text-[var(--ejo-text-muted)]">About: </span>
            {linked.url ? <LoadingLink href={linked.url} className="font-medium text-[var(--ejo-primary)] hover:underline">{linked.label}</LoadingLink> : <span className="font-medium text-[var(--ejo-text)]">{linked.label}</span>}
          </p>
          <label className="mt-1 flex min-h-10 items-center gap-2 text-xs text-[var(--ejo-text-muted)]">
            <input type="checkbox" name="removeRecord" className="h-4 w-4 accent-[var(--ejo-primary)]" />
            Remove this link
          </label>
        </div>
      ) : null}
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ejo-text)]">
        <input type="checkbox" name="viaEmail" defaultChecked={values.viaEmail} className="h-5 w-5 accent-[var(--ejo-primary)]" />
        Also email me when it is due
      </label>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton label={submitLabel} pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110" />
        <LoadingLink href="/reminders" className="min-h-11 rounded-[var(--ejo-radius-md)] px-4 py-2.5 text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Back to reminders</LoadingLink>
      </div>
    </form>
  );
}
