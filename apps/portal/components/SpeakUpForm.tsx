'use client';

import { useActionState } from 'react';
import { speakUpAction, type SpeakUpState } from '@/lib/actions/integrity-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';

const field = 'mt-1 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-base text-[var(--ejo-text)] sm:text-sm';

/** Speak up: a concern for the organisation's reviewers — named or anonymous. */
export function SpeakUpForm({ colleagues }: { colleagues: { id: string; name: string }[] }) {
  const [state, action] = useActionState<SpeakUpState, FormData>(speakUpAction, { error: null, title: '', details: '' });
  if (state.done) {
    return <p role="status" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 p-4 text-sm text-[var(--ejo-success)]">Thank you. Your concern has gone to the reviewers. It is never shown to the person it is about.</p>;
  }
  return (
    <form action={action} className="space-y-4" key={state.error ?? 'fresh'}>
      <div>
        <label htmlFor="su-title" className="block text-sm font-medium text-[var(--ejo-text)]">What is the concern?</label>
        <input id="su-title" name="title" required minLength={5} maxLength={200} defaultValue={state.title} className={field} placeholder="e.g. Parts released without a request" />
      </div>
      <div>
        <label htmlFor="su-details" className="block text-sm font-medium text-[var(--ejo-text)]">What did you see?</label>
        <textarea id="su-details" name="details" required minLength={20} maxLength={4000} rows={6} defaultValue={state.details} className={field} placeholder="What, when, where, and any record numbers (JC-…, PRS-…, EP-…). Facts, not guesses." />
      </div>
      <div>
        <label htmlFor="su-about" className="block text-sm font-medium text-[var(--ejo-text)]">Is it about a colleague? (optional)</label>
        <select id="su-about" name="about" defaultValue="" className={field}>
          <option value="">No one in particular / I would rather not say</option>
          {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">If you name someone, they never see it, and they cannot review it.</p>
      </div>
      <label className="flex min-h-11 items-start gap-2 text-sm text-[var(--ejo-text)]">
        <input type="checkbox" name="anonymous" value="1" className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
        <span>Send anonymously <span className="block text-xs text-[var(--ejo-text-muted)]">Nothing records that it was you. Reviewers cannot ask you questions, so include everything they need.</span></span>
      </label>
      {state.error ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{state.error}</p> : null}
      <SubmitButton label="Send my concern" pendingLabel="Sending…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white" />
    </form>
  );
}
