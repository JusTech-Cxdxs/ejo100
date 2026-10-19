'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { sendContactMessage, type ContactState } from '@/lib/contact/actions';
import { TOPICS } from '@/lib/contact/core';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3.5 py-3 text-[16px] text-[var(--ejo-text)] outline-none focus:border-[var(--ejo-primary)]';
const label = 'mb-1.5 block text-sm font-medium';

export function ContactForm({ topic = '' }: { topic?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, null);
  if (state?.ok) {
    return (
      <div role="status" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-primary)]/8 p-6">
        <h2 className="text-xl font-bold">Thank you — we have it.</h2>
        {state.number !== 'received' ? (
          <>
            <p className="mt-2 leading-relaxed">Your reference is <strong className="font-mono">{state.number}</strong>. The right team has been told and will reply by email or phone.</p>
            {state.token ? <p className="mt-3"><Link href={`/support/request/${state.token}`} className="font-semibold text-[var(--ejo-primary)] hover:underline">Follow your request →</Link></p> : null}
          </>
        ) : <p className="mt-2">We will be in touch.</p>}
      </div>
    );
  }
  const err = state && !state.ok ? state : null;
  return (
    <form action={action} className="space-y-5" aria-describedby={err ? 'contact-error' : undefined}>
      {err ? <p id="contact-error" role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/8 px-4 py-3 text-sm">{err.error}</p> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="c-name" className={label}>Your name</label><input id="c-name" name="name" required maxLength={100} autoComplete="name" className={input} aria-invalid={err?.field === 'name' || undefined} /></div>
        <div><label htmlFor="c-company" className={label}>Company (optional)</label><input id="c-company" name="company" maxLength={120} autoComplete="organization" className={input} /></div>
        <div><label htmlFor="c-email" className={label}>Email</label><input id="c-email" name="email" type="email" maxLength={160} autoComplete="email" inputMode="email" className={input} aria-invalid={err?.field === 'email' || undefined} /></div>
        <div><label htmlFor="c-phone" className={label}>Phone</label><input id="c-phone" name="phone" type="tel" maxLength={32} autoComplete="tel" inputMode="tel" className={input} aria-invalid={err?.field === 'phone' || undefined} /></div>
      </div>
      <p className="-mt-2 text-xs text-[var(--ejo-text-muted)]">Leave an email address or a phone number — one is enough.</p>
      <div>
        <label htmlFor="c-topic" className={label}>What is it about?</label>
        <select id="c-topic" name="topic" required defaultValue={TOPICS[topic] ? topic : ''} className={input} aria-invalid={err?.field === 'topic' || undefined}>
          <option value="" disabled>Choose…</option>
          {Object.entries(TOPICS).map(([k, t]) => <option key={k} value={k}>{t.label}{t.hint ? ` — ${t.hint}` : ''}</option>)}
        </select>
      </div>
      <div><label htmlFor="c-message" className={label}>Your message</label><textarea id="c-message" name="message" required minLength={12} maxLength={4000} rows={6} className={input} aria-invalid={err?.field === 'message' || undefined} placeholder="What you need, which vehicle or product, and anything that helps us answer first time." /></div>
      <div className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true"><label htmlFor="c-website">Website</label><input id="c-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center rounded-full bg-[var(--ejo-primary)] px-7 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{pending ? 'Sending…' : 'Send message'}</button>
        <p className="text-xs text-[var(--ejo-text-muted)]">You get a reference number and a page to follow the reply.</p>
      </div>
    </form>
  );
}
