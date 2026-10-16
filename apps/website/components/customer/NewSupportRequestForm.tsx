'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { Spinner } from '@/components/Spinner';
import { openSupportRequest } from '@/lib/customer-portal/support';
import type { ActionState } from '@/lib/customer-portal/actions';

const initial: ActionState = { ok: false };
const ABOUT: { value: string; title: string; text: string }[] = [
  { value: 'question', title: 'A question', text: 'Anything you would like to know.' },
  { value: 'vehicle', title: 'My vehicle or a job', text: 'Progress, a fault, collection.' },
  { value: 'payment', title: 'A payment or an estimate', text: 'What you owe, a payment you made.' },
  { value: 'warranty', title: 'A warranty', text: 'Cover, a claim, a part that failed.' },
  { value: 'complaint', title: 'A complaint', text: 'Something went wrong — our customer care team takes it up.' },
];
const field = 'w-full rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-bg)] px-3.5 py-2.5 text-base text-[var(--ejo-text)] outline-none placeholder:text-[var(--ejo-text-muted)]/70 focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20 sm:text-sm';

/** A new support request or complaint, written by the signed-in customer (Help & support). */
export function NewSupportRequestForm() {
  const [state, action, pending] = useActionState(openSupportRequest, initial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at) form.current?.reset(); }, [state.ok, state.at]);
  const err = state.fieldErrors ?? {};
  return (
    <form ref={form} action={action} className="space-y-4" noValidate data-testid="new-support-request">
      <fieldset>
        <legend className="text-sm font-medium text-[var(--ejo-text)]">What is it about?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ABOUT.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3 text-sm has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/[0.04]">
              <input type="radio" name="about" value={o.value} required className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
              <span><span className="font-medium text-[var(--ejo-text)]">{o.title}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{o.text}</span></span>
            </label>
          ))}
        </div>
        {err.about ? <p className="mt-1 text-xs text-[var(--ejo-error)]">{err.about}</p> : null}
      </fieldset>
      <div>
        <label htmlFor="req-subject" className="block text-sm font-medium text-[var(--ejo-text)]">In a few words</label>
        <input id="req-subject" name="subject" required minLength={3} maxLength={140} aria-invalid={Boolean(err.subject) || undefined} className={`${field} mt-1 ${err.subject ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`} />
        {err.subject ? <p className="mt-1 text-xs text-[var(--ejo-error)]">{err.subject}</p> : null}
      </div>
      <div>
        <label htmlFor="req-body" className="block text-sm font-medium text-[var(--ejo-text)]">Tell us more</label>
        <textarea id="req-body" name="body" required rows={5} maxLength={2200} aria-invalid={Boolean(err.body) || undefined} className={`${field} mt-1 ${err.body ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`}
          placeholder="Your Job Card or service number if you have it, what happened, and what you would like us to do." />
        {err.body ? <p className="mt-1 text-xs text-[var(--ejo-error)]">{err.body}</p> : null}
      </div>
      {state.error || state.message ? (
        <p key={state.at ?? state.error} role={state.ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm ${state.ok ? 'bg-[var(--ejo-success)]/10' : 'bg-[var(--ejo-error)]/10'}`}>
          <span className={`mt-px shrink-0 ${state.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}><Icon name={state.ok ? 'checkCircle' : 'alert'} size={16} /></span>
          <span className="text-[var(--ejo-text)]">{state.ok ? state.message : state.error}</span>
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60">
        {pending ? <Spinner /> : <Icon name="arrowRight" size={16} />}{pending ? 'Sending…' : 'Send my request'}
      </button>
    </form>
  );
}
