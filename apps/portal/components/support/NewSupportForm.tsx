'use client';

import { useActionState } from 'react';
import { createSupportTicketAction, type NewSupportState } from '@/lib/actions/support-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { PRIORITIES, PRIORITY_LABEL } from '@/lib/support/core';

const initial: NewSupportState = { error: null, values: {} };
const input = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Log a call, a walk-in or a WhatsApp message as a support request. */
export function NewSupportForm({ queues }: { queues: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createSupportTicketAction, initial);
  const v = state.values;
  return (
    <form action={action} className="max-w-3xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6" key={state.error ?? 'fresh'}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3"><label htmlFor="ns-name" className={label}>Customer’s name</label><input id="ns-name" name="contactName" required maxLength={120} defaultValue={v.contactName} className={input} autoComplete="off" /></div>
        <div><label htmlFor="ns-phone" className={label}>Phone</label><input id="ns-phone" name="contactPhone" inputMode="tel" maxLength={30} defaultValue={v.contactPhone} className={input} autoComplete="off" /></div>
        <div className="sm:col-span-2"><label htmlFor="ns-email" className={label}>Email (a known customer’s email links their file)</label><input id="ns-email" name="contactEmail" type="email" maxLength={200} defaultValue={v.contactEmail} className={input} autoComplete="off" /></div>
      </div>
      <div><label htmlFor="ns-subject" className={label}>What is it about?</label><input id="ns-subject" name="subject" required maxLength={200} defaultValue={v.subject} placeholder="e.g. AC not cooling after service" className={input} /></div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2"><label htmlFor="ns-body" className={label.replace('mb-1 ', '')}>What the customer said or needs</label><RefineTextButton targetId="ns-body" compact /></div>
        <textarea id="ns-body" name="body" required rows={6} maxLength={4000} defaultValue={v.body} className={`${input} min-h-40 leading-relaxed`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ns-queue" className={label}>Team</label>
          <select id="ns-queue" name="queueId" defaultValue={v.queueId ?? ''} className={input}>
            <option value="">The default team</option>
            {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ns-priority" className={label}>Priority</label>
          <select id="ns-priority" name="priority" defaultValue={v.priority || 'NORMAL'} className={input}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
      </div>
      {state.error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-3 py-2 text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
      <SubmitButton label="Open the request" pendingLabel="Opening…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-6 text-sm font-semibold text-white hover:brightness-110" />
    </form>
  );
}
