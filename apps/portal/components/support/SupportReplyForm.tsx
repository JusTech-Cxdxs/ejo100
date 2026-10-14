'use client';

import { useActionState } from 'react';
import { replyToSupportTicketAction, type SupportReplyState } from '@/lib/actions/support-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';

const initial: SupportReplyState = { error: null, body: '' };

/** The reply box on a support ticket. What was typed stays when something goes wrong. */
export function SupportReplyForm({ ticketId, emailTo, phone }: { ticketId: string; emailTo: string | null; phone: string | null }) {
  const [state, action] = useActionState(replyToSupportTicketAction, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div>
        <label htmlFor="support-reply-body" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">Reply to the customer</label>
        <textarea
          id="support-reply-body"
          name="body"
          required
          rows={5}
          maxLength={4000}
          defaultValue={state.body}
          key={state.error ?? 'fresh'}
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby="support-reply-hint"
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-base text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/20 sm:text-sm"
          placeholder="Write in plain words. The customer sees exactly this."
        />
        {/* Enyo: RefineTextButton targetId="support-reply-body" */}
        <p id="support-reply-hint" className="mt-1 text-xs text-[var(--ejo-text-muted)]">
          {emailTo ? <>Emailed to <span className="font-medium text-[var(--ejo-text)]">{emailTo}</span>{' '}and shown in their customer portal when they have one.</> : <>No email address on this ticket{phone ? <> — call them on <a className="font-medium text-[var(--ejo-primary)] underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a></> : null}. The reply is kept on the ticket.</>}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="support-reply-then" className="mb-1.5 block text-xs font-medium text-[var(--ejo-text-muted)]">After sending</label>
          <select id="support-reply-then" name="then" defaultValue="WAITING_ON_CUSTOMER" className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]">
            <option value="WAITING_ON_CUSTOMER">Wait for the customer</option>
            <option value="RESOLVED">Mark as resolved</option>
            <option value="OPEN">Keep open</option>
          </select>
        </div>
        <SubmitButton label="Send reply" pendingLabel="Sending…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95" />
      </div>
      {state.error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-3 py-2 text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
    </form>
  );
}
