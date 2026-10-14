import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon } from '@/components/ui';
import { completeReminderFormAction, cancelReminderFormAction, snoozeReminderFormAction } from '@/lib/actions/reminders-form-handlers';
import type { ReminderRow } from '@/lib/actions/reminders';
import { formatLagos, relativeTime } from '@/lib/reminders-rules';

const small = 'min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-xs font-medium text-[var(--ejo-text)] transition-colors hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]';

const CHIP: Record<string, { text: string; cls: string }> = {
  overdue: { text: 'Due', cls: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' },
  upcoming: { text: 'Upcoming', cls: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]' },
  DONE: { text: 'Done', cls: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' },
  CANCELLED: { text: 'Cancelled', cls: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' },
};

/** One reminder with its own buttons (each a small form — works without scripts). */
export function ReminderCard({ r, bucket, focused = false }: { r: ReminderRow; bucket: 'overdue' | 'upcoming' | 'done'; focused?: boolean }) {
  const chip = bucket === 'done' ? CHIP[r.status]! : CHIP[bucket]!;
  const open = bucket !== 'done';
  const hidden = (
    <>
      <input type="hidden" name="reminderId" value={r.id} />
      <input type="hidden" name="returnTo" value="/reminders" />
    </>
  );
  return (
    <li id={`r-${r.id}`} className={`rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] p-4 ${focused ? 'border-[var(--ejo-primary)] ring-2 ring-[var(--ejo-primary)]/20' : 'border-[var(--ejo-border)]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className={`break-words text-sm font-semibold ${r.status === 'CANCELLED' ? 'text-[var(--ejo-text-muted)] line-through' : 'text-[var(--ejo-text)]'}`}>{r.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ejo-text-muted)]">
            <span className="inline-flex items-center gap-1"><Icon name="clock" size={13} />{formatLagos(r.dueAt)}</span>
            {open ? <span>· {relativeTime(r.dueAt)}</span> : null}
            {r.viaEmail ? <span className="inline-flex items-center gap-1">· <Icon name="mail" size={13} />email too</span> : null}
            {r.setBy ? <span>· Set for you by {r.setBy}</span> : null}
            {r.source === 'enyo' ? <span>· Prepared with Enyo</span> : null}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.text}</span>
      </div>
      {r.record ? (
        <p className="mt-2 text-sm">
          <span className="text-[var(--ejo-text-muted)]">About: </span>
          {r.record.url ? <LoadingLink href={r.record.url} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.record.label}</LoadingLink> : <span className="font-medium text-[var(--ejo-text)]">{r.record.label}</span>}
        </p>
      ) : null}
      {r.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--ejo-text)]">{r.notes}</p> : null}
      {open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={completeReminderFormAction}><FormPendingOverlay />{hidden}<SubmitButton label="Mark done" pendingLabel="Saving…" ariaLabel={`Mark done: ${r.title}`} className="min-h-10 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-xs font-medium text-white hover:brightness-110" /></form>
          <form action={snoozeReminderFormAction}><FormPendingOverlay />{hidden}<input type="hidden" name="until" value="1h" /><SubmitButton label="Snooze 1 hour" pendingLabel="Saving…" className={small} /></form>
          <form action={snoozeReminderFormAction}><FormPendingOverlay />{hidden}<input type="hidden" name="until" value="tomorrow" /><SubmitButton label="Tomorrow 9 am" pendingLabel="Saving…" className={small} /></form>
          <LoadingLink href={`/reminders/${r.id}/edit`} className={`${small} inline-flex items-center`}>Edit</LoadingLink>
          <form action={cancelReminderFormAction}><FormPendingOverlay />{hidden}<SubmitButton label="Cancel reminder" pendingLabel="Saving…" className="min-h-10 rounded-[var(--ejo-radius-md)] px-3 text-xs font-medium text-[var(--ejo-error)] hover:underline" /></form>
        </div>
      ) : null}
    </li>
  );
}
