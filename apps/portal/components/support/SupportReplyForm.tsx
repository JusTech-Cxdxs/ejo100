'use client';

import { useActionState, useRef, useState } from 'react';
import { replyToSupportTicketAction, type SupportReplyState } from '@/lib/actions/support-form-handlers';
import { draftSupportReply } from '@/lib/actions/support';
import { SubmitButton } from '@/components/SubmitButton';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

const initial: SupportReplyState = { error: null, body: '' };

/**
 * The reply box on a support request. Enyo's draft can be used as a start
 * (the colleague still reads and sends it); "Ask Enyo" writes a fresh one.
 * What was typed stays when something goes wrong. If the customer or a
 * colleague wrote after this page was opened, sending stops and asks first.
 */
export function SupportReplyForm({ ticketId, emailTo, phone, seenAt, draft, viaEmail }: { ticketId: string; emailTo: string | null; phone: string | null; seenAt: string; draft: string | null; viaEmail: boolean }) {
  const [state, action] = useActionState(replyToSupportTicketAction, initial);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const fill = (text: string) => {
    const el = box.current;
    if (!el) return;
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    setAiDrafted(true);
  };
  const ask = async () => {
    setBusy(true);
    setNote(null);
    const r = await draftSupportReply(ticketId).catch(() => ({ error: 'Enyo could not write a reply just now.' }));
    setBusy(false);
    if ('text' in r) fill(r.text); else setNote(r.error);
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="seenAt" value={seenAt} />
      <input type="hidden" name="aiDrafted" value={aiDrafted ? '1' : '0'} />
      {draft ? (
        <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/25 bg-[var(--ejo-primary)]/[0.05] p-3">
          <p className="text-xs font-semibold text-[var(--ejo-primary)]">Enyo’s suggested reply</p>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm text-[var(--ejo-text)]">{draft}</p>
          <button type="button" onClick={() => fill(draft)} className="mt-2 min-h-10 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-medium text-white hover:brightness-110">Use this as a start</button>
        </div>
      ) : null}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="support-reply-body" className="block text-sm font-medium text-[var(--ejo-text)]">Reply to the customer</label>
          <button type="button" onClick={() => void ask()} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10 disabled:opacity-60">
            {busy ? 'Enyo is writing…' : 'Ask Enyo for a draft'}
          </button>
        </div>
        <textarea
          ref={box}
          id="support-reply-body"
          name="body"
          required
          rows={6}
          maxLength={4000}
          defaultValue={state.body}
          key={state.error ?? 'fresh'}
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby="support-reply-hint"
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-base text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/20 sm:text-sm"
          placeholder="Write in plain words. The customer sees exactly this."
        />
        <RefineTextButton targetId="support-reply-body" />
        {note ? <p role="status" className="text-xs text-[var(--ejo-text-muted)]">{note}</p> : null}
        <p id="support-reply-hint" className="mt-1 text-xs text-[var(--ejo-text-muted)]">
          {emailTo
            ? <>Emailed to <span className="font-medium text-[var(--ejo-text)]">{emailTo}</span>{viaEmail ? ' from the team’s support address, in the same email thread' : ''}, and shown in their customer portal when they have one.</>
            : <>No email address on this ticket{phone ? <> — call them on <a className="font-medium text-[var(--ejo-primary)] underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a></> : null}. The reply is kept on the ticket.</>}
        </p>
      </div>
      {state.newer ? (
        <label className="flex items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 p-3 text-sm text-[var(--ejo-text)]">
          <input type="checkbox" name="confirmNew" value="1" className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
          <span>I have read the newer messages (refresh the page to see them) — send my reply anyway.</span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="support-reply-then" className="mb-1.5 block text-xs font-medium text-[var(--ejo-text-muted)]">After sending</label>
          <select id="support-reply-then" name="then" defaultValue="WAITING_ON_CUSTOMER" className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]">
            <option value="WAITING_ON_CUSTOMER">Wait for the customer</option>
            <option value="RESOLVED">Mark as resolved</option>
            <option value="ON_HOLD">Put on hold (waiting on others)</option>
            <option value="OPEN">Keep open</option>
          </select>
        </div>
        <SubmitButton label="Send reply" pendingLabel="Sending…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95" />
      </div>
      {state.error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-3 py-2 text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
    </form>
  );
}
