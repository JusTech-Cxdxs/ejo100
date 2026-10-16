'use client';

import { useActionState } from 'react';
import { openHelpRequestAction, replyToMyHelpRequestAction, type HelpFormState, type HelpReplyState } from '@/lib/actions/help-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-base text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/25 sm:text-sm';
const primary = 'min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:brightness-110';

/** Ask for help: what you were doing, what happened, and who should help. */
export function NewHelpForm({ errorRef, page }: { errorRef: string | null; page: string | null }) {
  const [state, action] = useActionState<HelpFormState, FormData>(openHelpRequestAction, { error: null, subject: errorRef ? 'I got an error' : '', body: '', to: errorRef ? 'platform' : 'organisation' });
  return (
    <form action={action} className="space-y-4" key={state.error ?? 'fresh'}>
      {errorRef ? <input type="hidden" name="ref" value={errorRef} /> : null}
      {page ? <input type="hidden" name="page" value={page} /> : null}
      <div>
        <label htmlFor="help-subject" className="block text-sm font-medium text-[var(--ejo-text)]">What do you need help with?</label>
        <input id="help-subject" name="subject" required minLength={3} maxLength={160} defaultValue={state.subject} className={`${field} mt-1`} placeholder="e.g. I cannot approve a parts request" />
      </div>
      <div>
        <label htmlFor="help-body" className="block text-sm font-medium text-[var(--ejo-text)]">What were you doing, and what happened?</label>
        <textarea id="help-body" name="body" required minLength={5} rows={6} maxLength={8000} defaultValue={state.body} className={`${field} mt-1`}
          placeholder="Which page, which record (e.g. JC-2026-000123), what you pressed, and what you saw." />
        {errorRef ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">The error reference <strong>{errorRef}</strong>{page ? <> and the page <strong>{page}</strong></> : null} are added for you.</p> : null}
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-[var(--ejo-text)]">Who should help?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3 text-sm has-[:checked]:border-[var(--ejo-primary)]">
            <input type="radio" name="to" value="organisation" defaultChecked={state.to !== 'platform'} className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
            <span><span className="font-medium text-[var(--ejo-text)]">Our administrators</span><span className="block text-xs text-[var(--ejo-text-muted)]">Access, permissions, how to do something, a record that looks wrong.</span></span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3 text-sm has-[:checked]:border-[var(--ejo-primary)]">
            <input type="radio" name="to" value="platform" defaultChecked={state.to === 'platform'} className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
            <span><span className="font-medium text-[var(--ejo-text)]">The EJO platform team</span><span className="block text-xs text-[var(--ejo-text-muted)]">An error message or something in the system not working.</span></span>
          </label>
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Send my request" pendingLabel="Sending…" className={primary} />
        <p className="text-xs text-[var(--ejo-text-muted)]">Only you, the support team and support managers can see it. Enyo may answer first; a person is one click away.</p>
      </div>
    </form>
  );
}

export function HelpReplyForm({ id }: { id: string }) {
  const [state, action] = useActionState<HelpReplyState, FormData>(replyToMyHelpRequestAction, { error: null, body: '' });
  return (
    <form action={action} className="space-y-2" key={state.error ?? 'fresh'}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="help-reply" className="block text-sm font-medium text-[var(--ejo-text)]">Add a message</label>
      <textarea id="help-reply" name="body" required rows={4} maxLength={8000} defaultValue={state.body} className={field} />
      {state.error ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
      <SubmitButton label="Send" pendingLabel="Sending…" className={primary} />
    </form>
  );
}
