'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { Spinner } from '@/components/Spinner';
import { replyToSupportTicket } from '@/lib/customer-portal/support';
import type { ActionState } from '@/lib/customer-portal/actions';

const initial: ActionState = { ok: false };

/** Reply box under one of the customer's own support requests. */
export function SupportReplyForm({ ticketId, number }: { ticketId: string; number: string }) {
  const [state, action, pending] = useActionState(replyToSupportTicket, initial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at) form.current?.reset(); }, [state.ok, state.at]);
  const id = `reply-${ticketId}`;
  const bad = state.fieldErrors?.body;
  return (
    <form ref={form} action={action} className="mt-3 space-y-2" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor={id} className="block text-sm font-medium text-[var(--ejo-text)]">Reply on {number}</label>
      <textarea
        id={id}
        name="body"
        required
        rows={3}
        maxLength={2200}
        aria-invalid={Boolean(bad) || undefined}
        aria-describedby={state.error || state.message ? `${id}-status` : undefined}
        className={`w-full rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-bg)] px-3.5 py-2.5 text-base text-[var(--ejo-text)] outline-none placeholder:text-[var(--ejo-text-muted)]/70 focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20 sm:text-sm ${bad ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`}
        placeholder="Write your reply…"
      />
      {state.error || state.message ? (
        <p id={`${id}-status`} key={state.at ?? state.error} role={state.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${state.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>
          <span className="mt-px shrink-0"><Icon name={state.ok ? 'checkCircle' : 'alert'} size={16} /></span>
          <span className="text-[var(--ejo-text)]">{state.ok ? state.message : state.error}</span>
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60">
        {pending ? <Spinner /> : <Icon name="arrowRight" size={16} />}{pending ? 'Sending…' : 'Send reply'}
      </button>
    </form>
  );
}
