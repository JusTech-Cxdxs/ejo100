'use client';

import { useActionState } from 'react';
import { addSupportNoteAction, type SupportNoteState } from '@/lib/actions/support-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

const initial: SupportNoteState = { error: null, body: '' };

/** A note for colleagues on this request — never shown or sent to the customer. */
export function SupportNoteForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(addSupportNoteAction, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="support-note-body" className="block text-sm font-medium text-[var(--ejo-text)]">Internal note</label>
      <textarea id="support-note-body" name="body" required rows={3} maxLength={4000} defaultValue={state.body} key={state.error ?? 'fresh'}
        placeholder="For colleagues only: what you checked, who you asked, what happens next."
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/[0.05] px-3 py-2.5 text-base text-[var(--ejo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-warning)]/30 sm:text-sm" />
      <RefineTextButton targetId="support-note-body" label="note" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--ejo-text-muted)]">The customer never sees notes.</p>
        <SubmitButton label="Add note" pendingLabel="Saving…" className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50" />
      </div>
      {state.error ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
    </form>
  );
}
