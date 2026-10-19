'use client';

import { useActionState, useState } from 'react';
import { sendContactMessage, type ContactState } from '@/lib/contact/actions';
import { REFERRAL } from '@/lib/store/catalogue';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3.5 py-3 text-[16px] text-[var(--ejo-text)] outline-none focus:border-[var(--ejo-primary)]';
const label = 'mb-1.5 block text-sm font-medium';

/**
 * Refer and earn: the programme in plain words, and one short form that
 * becomes a request in the Support centre (topic "business") — for a
 * referral, or for a digital marketer or dealer who wants to sell for us.
 */
export function Refer() {
  const [mode, setMode] = useState<'refer' | 'partner'>('refer');
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, null);
  return (
    <section id="refer" className="scroll-mt-24 border-t border-[var(--ejo-border)] bg-[#0b2416] text-white">
      <div className="relative overflow-hidden">
        <div aria-hidden className="ejo-ambient absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-semibold text-[#7ee2a0]">Refer and earn</p>
            <h2 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.015em] sm:text-4xl">Know someone who needs a vehicle? Send them our way.</h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/80">Tell us who, we do the rest. When the sale completes, you are paid — a fixed reward per vehicle, a share on parts and tyres.</p>
            <dl className="mt-8 grid gap-6 sm:grid-cols-3">
              {REFERRAL.rewards.map((r) => <div key={r.what} className="border-t border-white/20 pt-4"><dt className="text-sm text-white/70">{r.what}</dt><dd className="mt-1 text-2xl font-extrabold tracking-[-0.01em]">{r.reward}</dd></div>)}
            </dl>
            <ol className="mt-8 space-y-3 text-[15px] text-white/85">
              {REFERRAL.steps.map((s, i) => <li key={s} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7ee2a0] text-xs font-bold text-[#0b2416]">{i + 1}</span>{s}</li>)}
            </ol>
            <p className="mt-6 text-xs text-white/60">{REFERRAL.terms}</p>
          </div>
          <div className="rounded-[var(--ejo-radius-xl)] bg-white p-5 text-[#0f172a] sm:p-7" style={{ colorScheme: 'light' }}>
            <div className="mb-5 flex gap-1 rounded-full bg-[#f1f5f9] p-1" role="tablist" aria-label="What would you like to do?">
              {([['refer', 'Refer a buyer'], ['partner', 'Sell for us']] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`min-h-10 flex-1 rounded-full text-sm font-semibold ${mode === k ? 'bg-[#0b2416] text-white' : 'text-[#334155]'}`}>{l}</button>
              ))}
            </div>
            {state?.ok ? (
              <div role="status" data-testid="refer-sent" className="rounded-[var(--ejo-radius-lg)] border border-[#22983f]/40 bg-[#22983f]/8 p-5">
                <h3 className="text-lg font-bold">Thank you — we have it.</h3>
                <p className="mt-1 text-sm text-[#334155]">{state.number !== 'received' ? <>Your reference is <strong className="font-mono">{state.number}</strong>. The sales team will be in touch within a working day.</> : 'We will be in touch.'}</p>
              </div>
            ) : (
              <form action={action} className="space-y-4">
                <input type="hidden" name="topic" value="referral" />
                <div className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true"><label htmlFor="r-website">Website</label><input id="r-website" name="website" tabIndex={-1} autoComplete="off" /></div>
                {state && !state.ok ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[#dc2626]/40 bg-[#dc2626]/8 px-4 py-3 text-sm">{state.error}</p> : null}
                <h3 className="text-xl font-bold">{mode === 'refer' ? 'Refer a buyer' : 'Become a referral partner'}</h3>
                <p className="text-sm text-[#475569]">{mode === 'refer' ? 'Your details, and who we should call. We never contact them without saying you sent us.' : 'Digital marketers, fleet consultants, dealers and influencers: tell us how you reach buyers and we will set you up with a code and a rate card.'}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="r-name" className={label}>Your name</label><input id="r-name" name="name" required maxLength={100} className={input} autoComplete="name" /></div>
                  <div><label htmlFor="r-phone" className={label}>Your phone</label><input id="r-phone" name="phone" type="tel" required maxLength={32} className={input} autoComplete="tel" inputMode="tel" /></div>
                  <div className="sm:col-span-2"><label htmlFor="r-email" className={label}>Your email (optional)</label><input id="r-email" name="email" type="email" maxLength={160} className={input} autoComplete="email" /></div>
                  {mode === 'partner' ? <div className="sm:col-span-2"><label htmlFor="r-company" className={label}>Business or channel (optional)</label><input id="r-company" name="company" maxLength={120} className={input} placeholder="Agency, dealership, fleet consultancy, social handle…" /></div> : null}
                </div>
                <div>
                  <label htmlFor="r-message" className={label}>{mode === 'refer' ? 'Who should we call, and what are they looking for?' : 'How do you reach buyers, and roughly how many a month?'}</label>
                  <textarea id="r-message" name="message" required minLength={12} maxLength={4000} rows={4} className={input} placeholder={mode === 'refer' ? 'Name, phone number, the vehicle or part they want, and when.' : 'Your audience, your channels, the areas you cover.'} />
                </div>
                <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#22983f] px-6 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{pending ? 'Sending…' : mode === 'refer' ? 'Send the referral' : 'Apply to sell for us'}</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
